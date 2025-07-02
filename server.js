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
const axios = require("axios");
const multer = require("multer");
const path = require("path");
const fs = require("fs");

const app = express();
const PORT = process.env.PORT || 3000;

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRATION = "15m";
const JWT_REFRESH_EXPIRATION = "7d";

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

function deviceAuth(req, res, next) {
  const token = req.cookies.access_token;
  if (!token) return res.status(401).json({ message: "Token não fornecido." });
  try {
    const payload = verifyToken(token);
    req.device = payload;
    next();
  } catch (err) {
    return res.status(403).json({ message: "Token inválido ou expirado." });
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
          message: "Login bem-sucedido.",
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

app.get("/devices", isAuthenticated, isAdmin, async (req, res) => {
  try {
    const devicesResult = await db.query(
      "SELECT * FROM devices ORDER BY registered_at DESC"
    );
    const devices = devicesResult.rows.map((d) => ({
      ...d,
      last_seen_formatted: d.last_seen
        ? DateTime.fromISO(d.last_seen.toISOString())
            .setZone("America/Sao_Paulo")
            .toFormat("dd/MM/yyyy HH:mm:ss")
        : "Nunca",
    }));
    res.render("devices", { devices });
  } catch (err) {
    res.status(500).send("Erro ao carregar dispositivos.");
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

app.post("/devices", isAuthenticated, isAdmin, async (req, res) => {
  const { name, device_type, sector } = req.body;

  if (!name || !device_type || !sector) {
    return res.status(400).json({
      code: 400,
      status: "error",
      message: "Todos os campos são obrigatórios.",
    });
  }

  const device_identifier = uuidv4();
  const authentication_key = crypto.randomBytes(32).toString("hex");

  try {
    await db.query(
      `INSERT INTO devices (name, device_identifier, authentication_key, device_type, sector)
       VALUES ($1, $2, $3, $4, $5)`,
      [name, device_identifier, authentication_key, device_type, sector]
    );

    res.json({
      code: 200,
      status: "success",
      message: "Dispositivo cadastrado com sucesso.",
    });
  } catch (err) {
    console.error("Erro ao cadastrar dispositivo:", err);
    res.status(500).json({
      code: 500,
      status: "error",
      message: "Erro ao cadastrar dispositivo. Tente novamente.",
    });
  }
});

app.post(
  "/devices/:id/activate",
  isAuthenticated,
  isAdmin,
  async (req, res) => {
    await db.query(`UPDATE devices SET is_active = TRUE WHERE id = $1`, [
      req.params.id,
    ]);
    res.redirect("/devices");
  }
);

app.post(
  "/devices/:id/deactivate",
  isAuthenticated,
  isAdmin,
  async (req, res) => {
    await db.query(`UPDATE devices SET is_active = FALSE WHERE id = $1`, [
      req.params.id,
    ]);
    res.redirect("/devices");
  }
);

app.get("/pair", (req, res) => {
  res.render("pair");
});

app.post("/pair", async (req, res) => {
  const { device_identifier, authentication_key } = req.body;

  if (!device_identifier || !authentication_key) {
    return res.render("pair", { error: "Credenciais obrigatórias." });
  }

  try {
    const result = await db.query(
      "SELECT * FROM devices WHERE device_identifier = $1 AND is_active = true",
      [device_identifier]
    );

    if (result.rows.length === 0) {
      return res.render("pair", { error: "ID ou segredo inválidos." });
    }

    const device = result.rows[0];

    if (device.authentication_key !== authentication_key) {
      return res.render("pair", { error: "Credenciais incorretas." });
    }

    const nowBRT = DateTime.now().setZone("America/Sao_Paulo").toJSDate();
    await db.query("UPDATE devices SET last_seen = $1 WHERE id = $2", [
      nowBRT,
      device.id,
    ]);

    const accessToken = generateAccessToken(device);
    const refreshToken = generateRefreshToken(device);

    await db.query(
      "INSERT INTO tokens (device_id, token, refresh_token) VALUES ($1, $2, $3)",
      [device.id, accessToken, refreshToken]
    );

    res.cookie("access_token", accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      maxAge: 900000,
      sameSite: "strict",
    });

    res.cookie("refresh_token", refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      maxAge: 604800000,
      sameSite: "strict",
    });

    return res.redirect("/player");
  } catch (err) {
    res.render("pair", { error: "Erro ao autenticar dispositivo." });
  }
});

app.post(
  "/devices/:identifier/revoke",
  isAuthenticated,
  isAdmin,
  async (req, res) => {
    const { identifier } = req.params;

    try {
      const result = await db.query(
        "SELECT * FROM devices WHERE device_identifier = $1",
        [identifier]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ message: "Dispositivo não encontrado." });
      }

      const device = result.rows[0];

      await db.query(
        "UPDATE tokens SET is_revoked = TRUE WHERE device_id = $1",
        [device.id]
      );

      res.status(200).json({ message: "Token revogado com sucesso." });
    } catch (err) {
      res.status(500).json({ message: "Erro ao revogar token." });
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

app.get("/api/cep/:cep", async (req, res) => {
  const cep = req.params.cep;
  const url = `https://viacep.com.br/ws/${cep}/json/`;

  try {
    const response = await axios.get(url);
    res.json(response.data);
  } catch (error) {
    res.status(500).json({ message: "Erro ao buscar o CEP" });
  }
});

app.get("/logout", (req, res) => {
  const refreshToken = req.cookies.refresh_token;

  revokeToken(refreshToken);

  res.clearCookie("access_token");
  res.clearCookie("refresh_token");

  req.session.destroy(() => {
    res.redirect("/login?logout=true");
  });
});

app.get("/campaigns", isAuthenticated, isAdmin, async (req, res) => {
  try {
    const campaignsResult = await db.query(
      "SELECT * FROM campaigns ORDER BY created_at DESC"
    );
    const campaigns = campaignsResult.rows;

    const devicesResult = await db.query(
      "SELECT * FROM devices WHERE is_active = TRUE"
    );
    const devices = devicesResult.rows;

    res.render("campaigns", { campaigns, devices });
  } catch (err) {
    res.status(500).send("Erro ao carregar campanhas.");
  }
});

app.post(
  "/campaigns",
  isAuthenticated,
  isAdmin,
  upload.single("file"),
  async (req, res) => {
    const { name, start_date, end_date, device_id } = req.body;

    if (!name || !start_date || !end_date || !device_id) {
      return res
        .status(400)
        .json({ message: "Todos os campos são obrigatórios." });
    }

    let file_path = null;
    let file_name = null;
    let file_type = null;
    if (req.file) {
      file_path = `/uploads/${req.file.filename}`;
      file_name = req.file.filename;
      file_type = req.file.mimetype;
    }

    try {
      const resultOrder = await db.query(
        `SELECT MAX(execution_order) AS max_execution_order FROM campaign_device`
      );

      const execution_order = resultOrder.rows[0].max_execution_order
        ? resultOrder.rows[0].max_execution_order + 1
        : 1;

      const result = await db.query(
        `INSERT INTO campaigns (name, start_date, end_date, midia)
         VALUES ($1, $2, $3, $4) RETURNING *`,
        [name, start_date, end_date, file_path]
      );

      const campaign = result.rows[0];

      if (file_path && file_name && file_type) {
        await db.query(
          `INSERT INTO campaign_uploads (campaign_id, file_name, file_path, file_type)
           VALUES ($1, $2, $3, $4)`,
          [campaign.id, file_name, file_path, file_type]
        );
      }

      await db.query(
        `INSERT INTO campaign_device (campaign_id, device_id, execution_order)
         VALUES ($1, $2, $3)`,
        [campaign.id, device_id, execution_order]
      );

      res.status(200).json({
        code: 200,
        message: "Campanha criada com sucesso.",
        campaign: campaign,
      });
    } catch (err) {
      res
        .status(500)
        .json({ message: "Erro ao criar campanha.", error: err.message });
    }
  }
);

app.post(
  "/campaigns/:campaignId/devices",
  isAuthenticated,
  isAdmin,
  async (req, res) => {
    const { campaignId } = req.params;
    const { device_id, execution_order } = req.body;

    if (!device_id || !execution_order) {
      return res
        .status(400)
        .json({ message: "Dispositivo e ordem de execução são obrigatórios." });
    }

    try {
      const campaignResult = await db.query(
        "SELECT * FROM campaigns WHERE id = $1",
        [campaignId]
      );
      if (campaignResult.rows.length === 0) {
        return res.status(404).json({ message: "Campanha não encontrada." });
      }

      const deviceResult = await db.query(
        "SELECT * FROM devices WHERE id = $1",
        [device_id]
      );
      if (deviceResult.rows.length === 0) {
        return res.status(404).json({ message: "Dispositivo não encontrado." });
      }

      await db.query(
        `INSERT INTO campaign_device (campaign_id, device_id, execution_order)
       VALUES ($1, $2, $3)`,
        [campaignId, device_id, execution_order]
      );

      res
        .status(200)
        .json({ message: "Campanha associada ao dispositivo com sucesso." });
    } catch (err) {
      res
        .status(500)
        .json({ message: "Erro ao associar campanha ao dispositivo." });
    }
  }
);

app.get(
  "/campaigns/:campaignId",
  isAuthenticated,
  isAdmin,
  async (req, res) => {
    const { campaignId } = req.params;

    try {
      const campaignResult = await db.query(
        "SELECT * FROM campaigns WHERE id = $1",
        [campaignId]
      );
      if (campaignResult.rows.length === 0) {
        return res.status(404).json({ message: "Campanha não encontrada." });
      }

      const devicesResult = await db.query(
        `SELECT d.id, d.name, d.device_identifier, cd.execution_order
       FROM devices d
       JOIN campaign_device cd ON d.id = cd.device_id
       WHERE cd.campaign_id = $1`,
        [campaignId]
      );

      const campaign = campaignResult.rows[0];
      const devices = devicesResult.rows;

      res.render("campaignDetail", { campaign, devices });
    } catch (err) {
      res.status(500).send("Erro ao carregar dados da campanha.");
    }
  }
);

app.post(
  "/campaigns/:campaignId/edit",
  isAuthenticated,
  isAdmin,
  async (req, res) => {
    const { campaignId } = req.params;
    const { name, start_date, end_date, image_url, video_url } = req.body;

    try {
      const result = await db.query(
        `UPDATE campaigns SET name = $1, start_date = $2, end_date = $3, image_url = $4, video_url = $5
       WHERE id = $6 RETURNING *`,
        [name, start_date, end_date, image_url, video_url, campaignId]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ message: "Campanha não encontrada." });
      }

      res.status(200).json({
        message: "Campanha atualizada com sucesso.",
        campaign: result.rows[0],
      });
    } catch (err) {
      res.status(500).json({ message: "Erro ao atualizar campanha." });
    }
  }
);

app.post(
  "/campaigns/:campaignId/delete",
  isAuthenticated,
  isAdmin,
  async (req, res) => {
    const { campaignId } = req.params;

    try {
      const result = await db.query(
        "DELETE FROM campaigns WHERE id = $1 RETURNING *",
        [campaignId]
      );
      if (result.rows.length === 0) {
        return res.status(404).json({ message: "Campanha não encontrada." });
      }

      res.status(200).json({ message: "Campanha excluída com sucesso." });
    } catch (err) {
      res.status(500).json({ message: "Erro ao excluir campanha." });
    }
  }
);

app.post(
  "/campaigns/:campaignId/delete",
  isAuthenticated,
  isAdmin,
  async (req, res) => {
    const { campaignId } = req.params;

    try {
      const result = await db.query(
        "DELETE FROM campaigns WHERE id = $1 RETURNING *",
        [campaignId]
      );
      if (result.rows.length === 0) {
        return res.status(404).json({ message: "Campanha não encontrada." });
      }

      res.status(200).json({ message: "Campanha excluída com sucesso." });
    } catch (err) {
      res.status(500).json({ message: "Erro ao excluir campanha." });
    }
  }
);

app.listen(PORT, () => {
  console.log(`🔥 Server Running in http://127.0.0.1:${PORT}`);
});

async function revokeToken(refreshToken) {
  await db.query(
    "UPDATE tokens SET is_revoked = TRUE WHERE refresh_token = $1",
    [refreshToken]
  );
}
