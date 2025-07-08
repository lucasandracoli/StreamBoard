require("dotenv").config();
const express = require("express");
const session = require("express-session");
const bodyParser = require("body-parser");
const bcrypt = require("bcrypt");
const db = require("./config/streamboard");
const { v4: uuidv4 } = require("uuid");
const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const { DateTime } = require("luxon");
const cookieParser = require("cookie-parser");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const fsPromises = require("fs").promises;

const app = express();
const PORT = process.env.PORT || 3000;

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRATION = "15m";
const JWT_REFRESH_EXPIRATION = "90d";

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadPath = path.join(__dirname, "uploads");
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath);
    }
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    const fileExtension = path.extname(file.originalname);
    const fileName = `${uuidv4()}${fileExtension}`;
    cb(null, fileName);
  },
});

const upload = multer({ storage });

function generateAccessToken(device) {
  return jwt.sign(
    { id: device.id, device_identifier: device.device_identifier },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRATION }
  );
}

function generateRefreshToken(device) {
  return jwt.sign(
    { id: device.id, device_identifier: device.device_identifier },
    JWT_SECRET,
    { expiresIn: JWT_REFRESH_EXPIRATION }
  );
}

function verifyToken(token) {
  return jwt.verify(token, JWT_SECRET);
}

async function deviceAuth(req, res, next) {
  const accessToken = req.cookies.access_token;
  const refreshToken = req.cookies.refresh_token;

  if (accessToken) {
    try {
      const payload = verifyToken(accessToken);
      req.device = payload;
      return next();
    } catch (err) {
      if (err.name !== "TokenExpiredError") {
        return res.status(403).redirect("/pair?error=invalid_token");
      }
    }
  }

  if (!refreshToken) {
    return res.status(401).redirect("/pair?error=session_expired");
  }

  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const tokenResult = await client.query(
      "SELECT * FROM tokens WHERE refresh_token = $1 AND is_revoked = false",
      [refreshToken]
    );

    if (tokenResult.rows.length === 0) {
      const oldToken = verifyToken(refreshToken);
      await client.query(
        "UPDATE tokens SET is_revoked = TRUE WHERE device_id = $1",
        [oldToken.id]
      );
      await client.query("COMMIT");
      return res.status(403).redirect("/pair?error=compromised_session");
    }

    const storedToken = tokenResult.rows[0];

    await client.query("UPDATE tokens SET is_revoked = TRUE WHERE id = $1", [
      storedToken.id,
    ]);

    const deviceResult = await client.query(
      "SELECT * FROM devices WHERE id = $1",
      [storedToken.device_id]
    );
    const device = deviceResult.rows[0];

    const newAccessToken = generateAccessToken(device);
    const newRefreshToken = generateRefreshToken(device);

    await client.query(
      "INSERT INTO tokens (device_id, token, refresh_token) VALUES ($1, $2, $3)",
      [device.id, newAccessToken, newRefreshToken]
    );

    await client.query("COMMIT");

    res.cookie("access_token", newAccessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      maxAge: 900000,
    });
    res.cookie("refresh_token", newRefreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      maxAge: 7776000000,
    });

    req.device = device;
    next();
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Erro na autenticação com refresh token:", err);
    return res.status(403).redirect("/pair?error=session_error");
  } finally {
    client.release();
  }
}

app.use(cookieParser());

app.use(
  session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: process.env.NODE_ENV === "production",
      httpOnly: true,
      sameSite: "strict",
    },
  })
);

const packageJson = require("./package.json");

app.use((req, res, next) => {
  res.locals.appVersion = packageJson.version;
  res.locals.currentRoute = req.path;
  next();
});

app.set("view engine", "ejs");
app.use(express.static("public"));
app.use("/uploads", express.static(path.join(__dirname, "uploads")));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

const isAuthenticated = async (req, res, next) => {
  if (!req.session.userId) return res.redirect("/login");
  try {
    const result = await db.query("SELECT * FROM users WHERE id = $1", [
      req.session.userId,
    ]);
    if (result.rows.length === 0) {
      req.session.destroy(() => res.redirect("/login"));
    } else {
      req.user = result.rows[0];
      next();
    }
  } catch (err) {
    res.status(500).send("Erro ao validar sessão.");
  }
};

const isAdmin = (req, res, next) => {
  if (req.user && req.user.user_role !== "admin") {
    return res.status(403).send("Acesso negado. Você não tem permissão.");
  }
  next();
};

let clients = {};
const sendUpdateToDevice = (deviceId, data) => {
  const client = clients[deviceId];
  if (client) {
    client.res.write(`data: ${JSON.stringify(data)}\n\n`);
  }
};

app.get("/", (req, res) => {
  const token = req.cookies.access_token;
  if (token) {
    deviceAuth(req, res, () => {
      return res.redirect("/player");
    });
  } else {
    return res.redirect("/login");
  }
});

app.get("/login", (req, res) => {
  if (req.session.userId) return res.redirect("/dashboard");
  res.render("login");
});

app.post("/login", async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({
      code: 400,
      status: "error",
      message: "Usuário e senha são obrigatórios.",
    });
  }
  try {
    const result = await db.query("SELECT * FROM users WHERE username = $1", [
      username,
    ]);
    if (result.rows.length > 0) {
      const user = result.rows[0];
      const match = await bcrypt.compare(password, user.password);
      if (match) {
        req.session.userId = user.id;
        req.session.username = user.username;
        req.session.userRole = user.user_role;
        return res.status(200).json({
          code: 200,
          status: "success",
          message: "Logado com Sucesso.",
        });
      }
    }
    return res.status(401).json({
      code: 401,
      status: "error",
      message: "Usuário ou senha incorretos.",
    });
  } catch (error) {
    res.status(500).json({
      code: 500,
      status: "error",
      message: "Erro interno do servidor.",
    });
  }
});

app.get("/dashboard", isAuthenticated, isAdmin, (req, res) => {
  res.render("dashboard", { user: req.user });
});

app.post("/api/deviceHeartbeat", deviceAuth, async (req, res) => {
  const deviceId = req.device.id;
  const { effectiveType, downlink } = req.body;

  if (!deviceId) {
    return res.status(401).json({ message: "Dispositivo não autenticado." });
  }

  try {
    await db.query(
      `UPDATE devices SET
        network_effective_type = $1,
        network_downlink = $2,
        last_seen = NOW()
        WHERE id = $3`,
      [effectiveType, downlink, deviceId]
    );

    res.status(200).json({ message: "Heartbeat recebido com sucesso." });
  } catch (err) {
    console.error("Erro ao processar heartbeat do dispositivo:", err);
    res.status(500).json({ message: "Erro interno no servidor." });
  }
});

app.get("/devices", isAuthenticated, isAdmin, async (req, res) => {
  try {
    const devicesResult = await db.query(
      `SELECT d.*,
         (SELECT COUNT(*) FROM tokens t WHERE t.device_id = d.id) > 0 as has_tokens
       FROM devices d
       ORDER BY d.registered_at DESC`
    );

    const devices = devicesResult.rows.map((device) => {
      const lastSeenFormatted = device.last_seen
        ? DateTime.fromJSDate(device.last_seen)
            .setZone("America/Sao_Paulo")
            .toFormat("dd/MM/yyyy HH:mm:ss")
        : "Nunca";

      const isOnline = clients.hasOwnProperty(device.id);

      let status;
      if (!device.is_active) {
        status = { text: "Revogado", class: "status status-revogado" };
      } else if (isOnline) {
        status = { text: "Online", class: "online-status online" };
      } else if (device.has_tokens) {
        status = { text: "Offline", class: "online-status offline" };
      } else {
        status = { text: "Inativo", class: "status status-inativo" };
      }

      return {
        ...device,
        last_seen_formatted: lastSeenFormatted,
        is_online: isOnline,
        status: status,
      };
    });

    res.render("devices", { devices });
  } catch (err) {
    console.error("Erro ao carregar dispositivos:", err);
    res.status(500).send("Erro ao carregar dispositivos.");
  }
});

app.post("/devices", isAuthenticated, isAdmin, async (req, res) => {
  const { name, device_type, sector } = req.body;
  if (!name || !device_type || !sector) {
    return res.status(400).json({
      code: 400,
      message: "Todos os campos são obrigatórios.",
    });
  }
  const device_identifier = uuidv4();
  const authentication_key = crypto.randomBytes(32).toString("hex");
  try {
    await db.query(
      `INSERT INTO devices (name, device_identifier, authentication_key, device_type, sector, is_active)
       VALUES ($1, $2, $3, $4, $5, TRUE)`,
      [name, device_identifier, authentication_key, device_type, sector]
    );
    res.json({
      code: 200,
      message: "Dispositivo cadastrado com sucesso.",
    });
  } catch (err) {
    console.error("Erro ao cadastrar dispositivo:", err);
    res.status(500).json({
      code: 500,
      message: "Erro ao cadastrar dispositivo. Tente novamente.",
    });
  }
});

app.post("/devices/:id", isAuthenticated, isAdmin, async (req, res) => {
  const { sector } = req.body;
  try {
    await db.query("UPDATE devices SET sector = $1 WHERE id = $2", [
      sector,
      req.params.id,
    ]);
    res.redirect("/devices");
  } catch (err) {
    res.status(500).send("Erro ao atualizar dispositivo.");
  }
});

app.post("/devices/:id/edit", isAuthenticated, isAdmin, async (req, res) => {
  const { id } = req.params;
  const { name, device_type, sector } = req.body;

  if (!name || !device_type || !sector) {
    return res.status(400).json({
      code: 400,
      message: "Todos os campos (Nome, Tipo e Setor) são obrigatórios.",
    });
  }

  try {
    await db.query(
      "UPDATE devices SET name = $1, device_type = $2, sector = $3 WHERE id = $4",
      [name, device_type, sector, id]
    );
    res.json({
      code: 200,
      message: "Dispositivo atualizado com sucesso.",
    });
  } catch (err) {
    console.error("Erro ao atualizar dispositivo:", err);
    res.status(500).json({
      code: 500,
      message: "Erro ao atualizar dispositivo. Tente novamente.",
    });
  }
});

app.get("/pair", (req, res) => {
  res.render("pair");
});

app.post("/pair", async (req, res) => {
  const { device_identifier, authentication_key } = req.body;
  if (!device_identifier || !authentication_key) {
    return res.render("pair", {
      error: "ID do Dispositivo e Chave de Autenticação são obrigatórios.",
    });
  }

  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const result = await client.query(
      "SELECT * FROM devices WHERE device_identifier = $1 AND is_active = true",
      [device_identifier]
    );

    if (
      result.rows.length === 0 ||
      result.rows[0].authentication_key !== authentication_key
    ) {
      await client.query("ROLLBACK");
      return res.render("pair", {
        error: "ID do Dispositivo ou Chave de Autenticação inválidos.",
      });
    }

    const device = result.rows[0];

    await client.query(
      "UPDATE tokens SET is_revoked = TRUE WHERE device_id = $1",
      [device.id]
    );

    const accessToken = generateAccessToken(device);
    const refreshToken = generateRefreshToken(device);

    await client.query(
      "INSERT INTO tokens (device_id, token, refresh_token) VALUES ($1, $2, $3)",
      [device.id, accessToken, refreshToken]
    );

    await client.query("UPDATE devices SET last_seen = NOW() WHERE id = $1", [
      device.id,
    ]);

    await client.query("COMMIT");

    res.cookie("access_token", accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      maxAge: 900000,
    });
    res.cookie("refresh_token", refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      maxAge: 604800000,
    });

    return res.redirect("/player");
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Erro no pareamento: ", err);
    res.render("pair", { error: "Erro ao autenticar dispositivo." });
  } finally {
    client.release();
  }
});

app.post(
  "/devices/:identifier/revoke",
  isAuthenticated,
  isAdmin,
  async (req, res) => {
    const { identifier } = req.params;
    const client = await db.connect();
    try {
      await client.query("BEGIN");

      const result = await client.query(
        "SELECT id FROM devices WHERE device_identifier = $1",
        [identifier]
      );

      if (result.rows.length === 0) {
        await client.query("ROLLBACK");
        return res.status(404).json({ message: "Dispositivo não encontrado." });
      }

      const deviceId = result.rows[0].id;

      await client.query(
        "UPDATE tokens SET is_revoked = TRUE WHERE device_id = $1",
        [deviceId]
      );

      await client.query("UPDATE devices SET is_active = FALSE WHERE id = $1", [
        deviceId,
      ]);

      await client.query("COMMIT");

      sendUpdateToDevice(deviceId, {
        type: "DEVICE_REVOKED",
        payload: { identifier: identifier },
      });

      res.status(200).json({
        message:
          "Acesso do dispositivo revogado e status atualizado com sucesso.",
      });
    } catch (err) {
      await client.query("ROLLBACK");
      console.error(
        "Erro ao revogar token e atualizar status do dispositivo:",
        err
      );
      res
        .status(500)
        .json({ message: "Erro ao revogar acesso do dispositivo." });
    } finally {
      client.release();
    }
  }
);

app.post(
  "/devices/:identifier/reactivate",
  isAuthenticated,
  isAdmin,
  async (req, res) => {
    const { identifier } = req.params;

    try {
      const result = await db.query(
        "UPDATE devices SET is_active = TRUE WHERE device_identifier = $1",
        [identifier]
      );

      if (result.rowCount === 0) {
        return res.status(404).json({ message: "Dispositivo não encontrado." });
      }

      res.status(200).json({
        message: "Dispositivo reativado com sucesso.",
      });
    } catch (err) {
      console.error("Erro ao reativar o dispositivo:", err);
      res.status(500).json({ message: "Erro ao reativar o dispositivo." });
    }
  }
);

app.get("/player", deviceAuth, async (req, res) => {
  try {
    const result = await db.query(
      "SELECT name FROM devices WHERE device_identifier = $1",
      [req.device.device_identifier]
    );
    if (result.rows.length === 0) {
      return res.status(404).send("Dispositivo não encontrado.");
    }
    const deviceName = result.rows[0].name;
    res.render("player", { deviceName });
  } catch (err) {
    res.status(500).send("Erro ao carregar dispositivo.");
  }
});

app.get("/logout", (req, res) => {
  const refreshToken = req.cookies.refresh_token;
  if (refreshToken) {
    revokeToken(refreshToken);
  }
  res.clearCookie("access_token");
  res.clearCookie("refresh_token");
  req.session.destroy(() => {
    res.redirect("/login?logout=true");
  });
});

app.get(
  "/api/deviceDetails/:id",
  isAuthenticated,
  isAdmin,
  async (req, res) => {
    const { id } = req.params;

    try {
      const deviceResult = await db.query(
        "SELECT * FROM devices WHERE id = $1",
        [id]
      );

      if (deviceResult.rows.length === 0) {
        return res.status(404).json({ message: "Dispositivo não encontrado." });
      }
      const device = deviceResult.rows[0];

      const activeCampaignsResult = await db.query(
        `SELECT c.name FROM campaigns c
         JOIN campaign_device cd ON c.id = cd.campaign_id
         WHERE cd.device_id = $1 AND NOW() BETWEEN c.start_date AND c.end_date`,
        [id]
      );
      const activeCampaigns = activeCampaignsResult.rows.map((c) => c.name);

      const isOnline = clients.hasOwnProperty(device.id);

      const formatOptions = { zone: "America/Sao_Paulo", locale: "pt-BR" };
      const registeredAtFormatted = DateTime.fromJSDate(
        device.registered_at,
        formatOptions
      ).toFormat("dd/MM/yyyy HH:mm:ss");
      const lastSeenFormatted = device.last_seen
        ? DateTime.fromJSDate(device.last_seen, formatOptions).toFormat(
            "dd/MM/yyyy HH:mm:ss"
          )
        : "Nunca";

      const details = {
        ...device,
        is_online: isOnline,
        registered_at_formatted: registeredAtFormatted,
        last_seen_formatted: lastSeenFormatted,
        active_campaigns: activeCampaigns,
      };

      res.json(details);
    } catch (err) {
      console.error("Erro ao buscar detalhes do dispositivo:", err);
      res.status(500).json({ message: "Erro interno do servidor." });
    }
  }
);

app.get("/stream", deviceAuth, (req, res) => {
  const deviceId = req.device.id;
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("Cache-Control", "no-cache");
  res.flushHeaders();
  clients[deviceId] = { res };
  req.on("close", () => {
    delete clients[deviceId];
  });
});

app.get("/api/device/playlist", deviceAuth, async (req, res) => {
  try {
    const now = new Date();
    const result = await db.query(
      `SELECT c.*, cd.execution_order
               FROM campaigns c
               JOIN campaign_device cd ON c.id = cd.campaign_id
               WHERE cd.device_id = $1
                 AND c.start_date <= $2
                 AND c.end_date >= $2`,
      [req.device.id, now]
    );
    res.json(result.rows);
  } catch (err) {
    console.error("Erro ao buscar playlist:", err);
    res.status(500).json({ message: "Erro ao buscar playlist." });
  }
});

app.get("/campaigns", isAuthenticated, isAdmin, async (req, res) => {
  try {
    const campaignsResult = await db.query(
      "SELECT * FROM campaigns ORDER BY created_at DESC"
    );

    const campaigns = campaignsResult.rows.map((campaign) => {
      const formatOptions = {
        zone: "America/Sao_Paulo",
        locale: "pt-BR",
      };

      const start_date_formatted = campaign.start_date
        ? DateTime.fromJSDate(campaign.start_date, formatOptions).toFormat(
            "dd/MM/yyyy, HH:mm:ss"
          )
        : "N/A";

      const end_date_formatted = campaign.end_date
        ? DateTime.fromJSDate(campaign.end_date, formatOptions).toFormat(
            "dd/MM/yyyy, HH:mm:ss"
          )
        : "N/A";

      return {
        ...campaign,
        start_date_formatted,
        end_date_formatted,
      };
    });

    const devicesResult = await db.query(
      "SELECT * FROM devices WHERE is_active = TRUE"
    );
    const devices = devicesResult.rows;

    res.render("campaigns", { campaigns, devices });
  } catch (err) {
    console.error("Erro ao carregar campanhas:", err);
    res.status(500).send("Erro ao carregar campanhas.");
  }
});

app.post(
  "/campaigns",
  isAuthenticated,
  isAdmin,
  upload.single("media"),
  async (req, res) => {
    const { name, start_date, end_date, device_id } = req.body;

    if (!name || !start_date || !end_date || !device_id) {
      return res
        .status(400)
        .json({ message: "Todos os campos são obrigatórios." });
    }

    let parsedStartDate;
    let parsedEndDate;

    try {
      parsedStartDate = DateTime.fromFormat(start_date, "dd/MM/yyyy HH:mm", {
        zone: "America/Sao_Paulo",
      }).toJSDate();

      parsedEndDate = DateTime.fromFormat(end_date, "dd/MM/yyyy HH:mm", {
        zone: "America/Sao_Paulo",
      }).toJSDate();

      if (parsedEndDate < parsedStartDate) {
        return res.status(400).json({
          message: "A data de término não pode ser anterior à data de início.",
        });
      }
    } catch (dateError) {
      console.error("Erro ao parsear datas:", dateError);
      return res.status(400).json({
        message: "Formato de data ou hora inválido. Use DD/MM/AAAA HH:MM.",
      });
    }

    let file_path = null;
    if (req.file) {
      file_path = `/uploads/${req.file.filename}`;
    }

    const client = await db.connect();
    try {
      await client.query("BEGIN");

      const campaignResult = await client.query(
        `INSERT INTO campaigns (name, start_date, end_date, midia)
           VALUES ($1, $2, $3, $4) RETURNING *`,
        [name, parsedStartDate, parsedEndDate, file_path]
      );
      const newCampaign = campaignResult.rows[0];

      if (req.file) {
        await client.query(
          `INSERT INTO campaign_uploads (campaign_id, file_name, file_path, file_type)
             VALUES ($1, $2, $3, $4)`,
          [newCampaign.id, req.file.filename, file_path, req.file.mimetype]
        );
      }

      const resultOrder = await client.query(
        `SELECT MAX(execution_order) AS max_execution_order FROM campaign_device WHERE device_id = $1`,
        [device_id]
      );
      const execution_order = resultOrder.rows[0].max_execution_order
        ? resultOrder.rows[0].max_execution_order + 1
        : 1;

      await client.query(
        `INSERT INTO campaign_device (campaign_id, device_id, execution_order)
           VALUES ($1, $2, $3)`,
        [newCampaign.id, device_id, execution_order]
      );

      await client.query("COMMIT");

      const payload = { ...newCampaign, execution_order };
      sendUpdateToDevice(device_id, {
        type: "NEW_CAMPAIGN",
        payload: payload,
      });

      res.status(200).json({
        code: 200,
        message: "Campanha criada e notificação enviada.",
        campaign: newCampaign,
      });
    } catch (err) {
      await client.query("ROLLBACK");
      console.error("ERRO AO CRIAR CAMPANHA:", err);
      res.status(500).json({
        message: "Erro interno ao criar campanha.",
        error: err.message,
      });
    } finally {
      client.release();
    }
  }
);

app.post(
  "/campaigns/:id/delete",
  isAuthenticated,
  isAdmin,
  async (req, res) => {
    const { id } = req.params;
    const client = await db.connect();

    try {
      await client.query("BEGIN");

      const campaignResult = await client.query(
        "SELECT midia FROM campaigns WHERE id = $1",
        [id]
      );
      const mediaPath =
        campaignResult.rows.length > 0 ? campaignResult.rows[0].midia : null;

      const affectedDevicesResult = await client.query(
        "SELECT device_id FROM campaign_device WHERE campaign_id = $1",
        [id]
      );
      const affectedDeviceIds = affectedDevicesResult.rows.map(
        (row) => row.device_id
      );

      await client.query("DELETE FROM campaign_device WHERE campaign_id = $1", [
        id,
      ]);
      await client.query(
        "DELETE FROM campaign_uploads WHERE campaign_id = $1",
        [id]
      );
      const deleteResult = await client.query(
        "DELETE FROM campaigns WHERE id = $1",
        [id]
      );

      await client.query("COMMIT");

      if (mediaPath) {
        const fileName = path.basename(mediaPath);
        const fullPath = path.join(__dirname, "uploads", fileName);

        try {
          await fsPromises.unlink(fullPath);
        } catch (fileError) {
          if (fileError.code !== "ENOENT") {
            console.warn(
              `Aviso: Arquivo de mídia ${fullPath} não pôde ser excluído:`,
              fileError
            );
          }
        }
      }

      if (deleteResult.rowCount === 0) {
        return res.status(404).json({ message: "Campanha não encontrada." });
      }

      affectedDeviceIds.forEach((deviceId) => {
        sendUpdateToDevice(deviceId, {
          type: "DELETE_CAMPAIGN",
          payload: { campaignId: Number(id) },
        });
      });

      res.status(200).json({
        message: "Campanha e mídia associada foram excluídas com sucesso.",
      });
    } catch (err) {
      await client.query("ROLLBACK");
      console.error("ERRO AO EXCLUIR CAMPANHA:", err);
      res.status(500).json({ message: "Erro ao excluir campanha." });
    } finally {
      client.release();
    }
  }
);

app.get("/api/campaigns/:id", isAuthenticated, isAdmin, async (req, res) => {
  const { id } = req.params;
  try {
    const campaignResult = await db.query(
      "SELECT * FROM campaigns WHERE id = $1",
      [id]
    );

    if (campaignResult.rows.length === 0) {
      return res.status(404).json({ message: "Campanha não encontrada." });
    }
    const campaign = campaignResult.rows[0];

    const devicesResult = await db.query(
      "SELECT device_id FROM campaign_device WHERE campaign_id = $1",
      [id]
    );
    const devices = devicesResult.rows;

    res.json({ campaign, devices });
  } catch (err) {
    console.error("Erro ao buscar detalhes da campanha:", err);
    res.status(500).json({ message: "Erro interno do servidor." });
  }
});

app.post(
  "/campaigns/:id/edit",
  isAuthenticated,
  isAdmin,
  upload.single("media"),
  async (req, res) => {
    const { id } = req.params;
    const { name, start_date, end_date, device_id, remove_media } = req.body;

    if (!name || !start_date || !end_date || !device_id) {
      return res
        .status(400)
        .json({ message: "Todos os campos são obrigatórios." });
    }

    let parsedStartDate, parsedEndDate;
    try {
      parsedStartDate = DateTime.fromFormat(start_date, "dd/MM/yyyy HH:mm", {
        zone: "America/Sao_Paulo",
      }).toJSDate();
      parsedEndDate = DateTime.fromFormat(end_date, "dd/MM/yyyy HH:mm", {
        zone: "America/Sao_Paulo",
      }).toJSDate();
      if (parsedEndDate < parsedStartDate) {
        return res.status(400).json({
          message: "A data de término não pode ser anterior à data de início.",
        });
      }
    } catch (dateError) {
      return res.status(400).json({
        message: "Formato de data ou hora inválido. Use DD/MM/AAAA HH:MM.",
      });
    }

    const client = await db.connect();
    try {
      await client.query("BEGIN");

      const oldDevicesResult = await client.query(
        "SELECT device_id FROM campaign_device WHERE campaign_id = $1",
        [id]
      );
      const oldDeviceIds = oldDevicesResult.rows.map((row) => row.device_id);

      const campaignQuery = await client.query(
        "SELECT midia FROM campaigns WHERE id = $1",
        [id]
      );
      let mediaPath = campaignQuery.rows[0]?.midia;
      const oldMediaPath = mediaPath;

      if (req.file) {
        mediaPath = `/uploads/${req.file.filename}`;
      } else if (remove_media === "true") {
        mediaPath = null;
      }

      if (oldMediaPath && oldMediaPath !== mediaPath) {
        const oldFullPath = path.join(
          __dirname,
          "uploads",
          path.basename(oldMediaPath)
        );
        await client.query(
          "DELETE FROM campaign_uploads WHERE campaign_id = $1",
          [id]
        );
        try {
          await fsPromises.unlink(oldFullPath);
        } catch (fileError) {
          if (fileError.code !== "ENOENT")
            console.warn(
              `Aviso: Arquivo de mídia antigo não foi excluído:`,
              fileError
            );
        }
      }

      if (req.file) {
        await client.query(
          `INSERT INTO campaign_uploads (campaign_id, file_name, file_path, file_type) VALUES ($1, $2, $3, $4)`,
          [id, req.file.filename, mediaPath, req.file.mimetype]
        );
      }

      const updatedCampaignResult = await client.query(
        `UPDATE campaigns SET name = $1, start_date = $2, end_date = $3, midia = $4 WHERE id = $5 RETURNING *`,
        [name, parsedStartDate, parsedEndDate, mediaPath, id]
      );
      const updatedCampaign = updatedCampaignResult.rows[0];

      await client.query("DELETE FROM campaign_device WHERE campaign_id = $1", [
        id,
      ]);
      const orderResult = await client.query(
        `SELECT MAX(execution_order) AS max_order FROM campaign_device WHERE device_id = $1`,
        [device_id]
      );
      const execution_order = (orderResult.rows[0].max_order || 0) + 1;
      await client.query(
        `INSERT INTO campaign_device (campaign_id, device_id, execution_order) VALUES ($1, $2, $3)`,
        [id, device_id, execution_order]
      );

      await client.query("COMMIT");

      oldDeviceIds.forEach((oldDeviceId) => {
        if (String(oldDeviceId) !== String(device_id)) {
          sendUpdateToDevice(oldDeviceId, {
            type: "DELETE_CAMPAIGN",
            payload: { campaignId: Number(id) },
          });
        }
      });

      const now = new Date();
      const isCampaignActive = now >= parsedStartDate && now <= parsedEndDate;

      if (isCampaignActive) {
        sendUpdateToDevice(device_id, {
          type: "UPDATE_CAMPAIGN",
          payload: { ...updatedCampaign, execution_order },
        });
      } else {
        sendUpdateToDevice(device_id, {
          type: "DELETE_CAMPAIGN",
          payload: { campaignId: Number(id) },
        });
      }

      res.status(200).json({
        code: 200,
        message: "Campanha atualizada com sucesso.",
        campaign: updatedCampaign,
      });
    } catch (err) {
      await client.query("ROLLBACK");
      console.error("ERRO AO ATUALIZAR CAMPANHA:", err);
      res.status(500).json({
        message: "Erro interno ao atualizar campanha.",
        error: err.message,
      });
    } finally {
      client.release();
    }
  }
);

async function revokeToken(refreshToken) {
  try {
    await db.query(
      "UPDATE tokens SET is_revoked = TRUE WHERE refresh_token = $1",
      [refreshToken]
    );
  } catch (err) {
    console.error("Erro ao revogar token:", err);
  }
}

app.listen(PORT, () => {
  console.log(`🔥 Server Running in http://127.0.0.1:${PORT}`);
});
