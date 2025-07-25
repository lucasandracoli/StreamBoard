require("dotenv").config();
const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const session = require("express-session");
const bodyParser = require("body-parser");
const bcrypt = require("bcrypt");
const db = require("./config/streamboard");
const sysmo = require("./config/sysmo");
const { v4: uuidv4 } = require("uuid");
const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const { DateTime, Settings } = require("luxon");
const cookieParser = require("cookie-parser");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const fsPromises = require("fs").promises;
const url = require("url");
const axios = require("axios");

const logger = {
  info: (message) => {
    console.log(`[${new Date().toISOString()}] [INFO] ${message}`);
  },
  error: (message, error) => {
    console.error(
      `[${new Date().toISOString()}] [ERROR] ${message}`,
      error || ""
    );
  },
};

Settings.defaultZone = "America/Sao_Paulo";

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRATION = "15m";
const JWT_REFRESH_EXPIRATION = "90d";
const JWT_REFRESH_COOKIE_MAX_AGE = 90 * 24 * 60 * 60 * 1000;

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

let campeaoToken = null;
let campeaoTokenExp = 0;

function generateAccessToken(device) {
  return jwt.sign(
    { id: device.id, device_identifier: device.device_identifier },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRATION }
  );
}

function formatarPeriodo(dataInicio, dataFim) {
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);

  const inicio = new Date(dataInicio);
  const fim = new Date(dataFim);

  const mesmoDia = inicio.toDateString() === fim.toDateString();

  const opcoesHora = { hour: "2-digit", minute: "2-digit", hour12: false };
  const horaInicio = inicio.toLocaleTimeString("pt-BR", opcoesHora);
  const horaFim = fim.toLocaleTimeString("pt-BR", opcoesHora);

  if (mesmoDia) {
    const inicioNormalizado = new Date(inicio);
    inicioNormalizado.setHours(0, 0, 0, 0);

    let diaExibido;
    if (inicioNormalizado.getTime() === hoje.getTime()) {
      diaExibido = "Hoje";
    } else {
      const opcoesData = { day: "2-digit", month: "2-digit" };
      diaExibido = inicio.toLocaleDateString("pt-BR", opcoesData);
    }
    return `${diaExibido}, das ${horaInicio} às ${horaFim}`;
  } else {
    const opcoesDataCurta = { day: "2-digit", month: "2-digit" };
    const dataInicioExibida = inicio.toLocaleDateString(
      "pt-BR",
      opcoesDataCurta
    );
    const dataFimExibida = fim.toLocaleDateString("pt-BR", opcoesDataCurta);

    return `De ${dataInicioExibida} ${horaInicio} até ${dataFimExibida} ${horaFim}`;
  }
}

function generateRefreshToken(device) {
  return jwt.sign(
    { id: device.id, device_identifier: device.device_identifier },
    JWT_SECRET,
    { expiresIn: JWT_REFRESH_EXPIRATION }
  );
}

function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (err) {
    return null;
  }
}

async function deviceAuth(req, res, next) {
  const accessToken = req.cookies.access_token;
  const refreshToken = req.cookies.refresh_token;

  if (accessToken) {
    const payload = verifyToken(accessToken);
    if (payload) {
      const d = await db.query(
        "SELECT * FROM devices WHERE id = $1 AND is_active = TRUE",
        [payload.id]
      );
      if (d.rows.length === 0) {
        res.clearCookie("access_token");
        res.clearCookie("refresh_token");
        return res.redirect("/pair?error=device_not_found");
      }
      req.device = d.rows[0];
      return next();
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
      const oldTokenPayload = verifyToken(refreshToken);
      if (oldTokenPayload) {
        await client.query(
          "UPDATE tokens SET is_revoked = TRUE WHERE device_id = $1",
          [oldTokenPayload.id]
        );
      }
      await client.query("COMMIT");
      return res.status(403).redirect("/pair?error=compromised_session");
    }

    const storedToken = tokenResult.rows[0];
    await client.query("UPDATE tokens SET is_revoked = TRUE WHERE id = $1", [
      storedToken.id,
    ]);

    const d = await client.query(
      "SELECT * FROM devices WHERE id = $1 AND is_active = TRUE",
      [storedToken.device_id]
    );
    if (d.rows.length === 0) {
      await client.query("COMMIT");
      res.clearCookie("access_token");
      res.clearCookie("refresh_token");
      return res.redirect("/pair?error=device_not_found");
    }
    const device = d.rows[0];

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
      maxAge: JWT_REFRESH_COOKIE_MAX_AGE,
    });

    req.device = device;
    next();
  } catch (err) {
    await client.query("ROLLBACK");
    logger.error("Erro na autenticação do dispositivo via refresh token.", err);
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
    logger.error("Erro ao validar sessão do usuário.", err);
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
let adminClients = new Set();

const broadcastToAdmins = (data) => {
  adminClients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(data));
    }
  });
};

const sendUpdateToDevice = (deviceId, data) => {
  const ws = clients[deviceId];
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(data));
  }
};

wss.on("connection", async (ws, req) => {
  const { pathname, query } = url.parse(req.url, true);

  if (pathname === "/admin-ws") {
    adminClients.add(ws);
    ws.on("close", () => adminClients.delete(ws));

    const allDevices = await db.query("SELECT id, is_active FROM devices");
    for (const { id, is_active } of allDevices.rows) {
      const isOnline = Boolean(clients[id]);
      const tokenCountResult = await db.query(
        "SELECT COUNT(*) AS cnt FROM tokens WHERE device_id = $1 AND is_revoked = false",
        [id]
      );
      const tokenCount = parseInt(tokenCountResult.rows[0].cnt, 10);
      let status;
      if (!is_active) {
        status = { text: "Revogado", class: "revoked" };
      } else if (isOnline) {
        status = { text: "Online", class: "online" };
      } else if (tokenCount > 0) {
        status = { text: "Offline", class: "offline" };
      } else {
        status = { text: "Inativo", class: "inactive" };
      }
      ws.send(
        JSON.stringify({
          type: "DEVICE_STATUS_UPDATE",
          payload: { deviceId: id, status },
        })
      );
    }

    return;
  }

  const token = query.token;
  if (!token) {
    ws.close(1008, "Token não fornecido");
    return;
  }

  const payload = verifyToken(token);
  if (!payload) {
    ws.close(1008, "Token inválido ou expirado");
    return;
  }

  const deviceId = payload.id;
  await db.query("UPDATE devices SET last_seen = NOW() WHERE id = $1", [
    deviceId,
  ]);
  clients[deviceId] = ws;

  broadcastToAdmins({
    type: "DEVICE_STATUS_UPDATE",
    payload: {
      deviceId,
      status: { text: "Online", class: "online" },
    },
  });

  ws.isAlive = true;
  ws.on("pong", () => (ws.isAlive = true));

  ws.on("close", async () => {
    delete clients[deviceId];
    const tokenCountResult = await db.query(
      "SELECT COUNT(*) AS cnt FROM tokens WHERE device_id = $1 AND is_revoked = false",
      [deviceId]
    );
    const tokenCount = parseInt(tokenCountResult.rows[0].cnt, 10);
    const status =
      tokenCount > 0
        ? { text: "Offline", class: "offline" }
        : { text: "Inativo", class: "inactive" };
    broadcastToAdmins({
      type: "DEVICE_STATUS_UPDATE",
      payload: { deviceId, status },
    });
  });
});

const heartbeatInterval = setInterval(() => {
  wss.clients.forEach((ws) => {
    if (ws.isAlive === false) return ws.terminate();
    ws.isAlive = false;
    ws.ping(() => {});
  });
}, 30000);

wss.on("close", () => {
  clearInterval(heartbeatInterval);
});

setInterval(async () => {
  try {
    const result = await db.query(
      "SELECT id, start_date, end_date FROM campaigns"
    );
    const now = DateTime.now();

    result.rows.forEach((campaign) => {
      const startDate = DateTime.fromJSDate(campaign.start_date);
      const endDate = DateTime.fromJSDate(campaign.end_date);

      let newStatus = null;

      if (now < startDate) {
        newStatus = { text: "Agendada", class: "scheduled" };
      } else if (now > endDate) {
        newStatus = { text: "Finalizada", class: "offline" };
      } else {
        newStatus = { text: "Ativa", class: "online" };
      }

      broadcastToAdmins({
        type: "CAMPAIGN_STATUS_UPDATE",
        payload: {
          campaignId: campaign.id,
          status: newStatus,
        },
      });
    });
  } catch (err) {
    logger.error("Erro ao verificar status das campanhas.", err);
  }
}, 60000);

app.get("/", (req, res) => {
  if (req.session.userId) {
    res.redirect("/dashboard");
  } else {
    res.redirect("/login");
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
          message: "Logado com Sucesso.",
        });
      }
    }
    return res.status(401).json({
      message: "Usuário ou senha incorretos.",
    });
  } catch (err) {
    logger.error("Erro no processo de login.", err);
    res.status(500).json({
      message: "Erro interno do servidor.",
    });
  }
});

app.get("/dashboard", isAuthenticated, isAdmin, (req, res) => {
  res.render("dashboard", { user: req.user });
});

app.get("/companies", isAuthenticated, isAdmin, async (req, res) => {
  try {
    const result = await db.query("SELECT * FROM companies ORDER BY name ASC");
    res.render("companies", { companies: result.rows });
  } catch (err) {
    logger.error("Erro ao carregar empresas.", err);
    res.status(500).send("Erro ao carregar a página de empresas.");
  }
});

app.post("/companies", isAuthenticated, isAdmin, async (req, res) => {
  const { name, cnpj, city, address, state } = req.body;
  if (!name || !cnpj) {
    return res.status(400).json({
      message: "Nome e CNPJ da empresa são obrigatórios.",
    });
  }
  try {
    await db.query(
      "INSERT INTO companies (name, cnpj, city, address, state) VALUES ($1, $2, $3, $4, $5)",
      [name, cnpj, city, address, state]
    );
    res.status(201).json({ message: "Empresa cadastrada com sucesso." });
  } catch (err) {
    logger.error("Erro ao cadastrar empresa.", err);
    if (err.code === "23505") {
      return res.status(409).json({ message: "CNPJ já cadastrado." });
    }
    res.status(500).json({ message: "Erro ao cadastrar empresa." });
  }
});

app.post("/companies/:id/edit", isAuthenticated, isAdmin, async (req, res) => {
  const { id } = req.params;
  const { name, cnpj, city, address, state } = req.body;
  if (!name || !cnpj) {
    return res.status(400).json({ message: "Nome e CNPJ são obrigatórios." });
  }
  try {
    await db.query(
      "UPDATE companies SET name = $1, cnpj = $2, city = $3, address = $4, state = $5 WHERE id = $6",
      [name, cnpj, city, address, state, id]
    );
    res.status(200).json({ message: "Empresa atualizada com sucesso." });
  } catch (err) {
    logger.error(`Erro ao editar empresa ${id}.`, err);
    res.status(500).json({ message: "Erro ao atualizar empresa." });
  }
});

app.post(
  "/companies/:id/delete",
  isAuthenticated,
  isAdmin,
  async (req, res) => {
    const { id } = req.params;
    try {
      await db.query("DELETE FROM companies WHERE id = $1", [id]);
      res.status(200).json({ message: "Empresa excluída com sucesso." });
    } catch (err) {
      logger.error(`Erro ao excluir empresa ${id}.`, err);
      res.status(500).json({ message: "Erro ao excluir empresa." });
    }
  }
);

app.get("/devices", isAuthenticated, isAdmin, async (req, res) => {
  try {
    const devicesResult = await db.query(`
        SELECT 
            d.*,
            c.name as company_name,
            s.name as sector_name,
            (SELECT COUNT(*) FROM tokens t WHERE t.device_id = d.id AND t.is_revoked = false) > 0 as has_tokens
        FROM devices d
        LEFT JOIN companies c ON d.company_id = c.id
        LEFT JOIN sectors s ON d.sector_id = s.id
        ORDER BY d.registered_at DESC
    `);

    const devices = devicesResult.rows.map((device) => {
      const lastSeenFormatted = device.last_seen
        ? DateTime.fromJSDate(device.last_seen)
            .setZone("America/Sao_Paulo")
            .toFormat("dd/MM/yyyy HH:mm:ss")
        : "Nunca";

      const isOnline = clients.hasOwnProperty(device.id);

      let status;
      if (!device.is_active) {
        status = { text: "Revogado", class: "revoked" };
      } else if (isOnline) {
        status = { text: "Online", class: "online" };
      } else if (device.has_tokens) {
        status = { text: "Offline", class: "offline" };
      } else {
        status = { text: "Inativo", class: "inactive" };
      }

      return {
        ...device,
        last_seen_formatted: lastSeenFormatted,
        is_online: isOnline,
        status: status,
      };
    });

    const companiesResult = await db.query(
      "SELECT * FROM companies ORDER BY name"
    );

    res.render("devices", {
      devices,
      companies: companiesResult.rows,
    });
  } catch (err) {
    logger.error("Erro ao carregar dispositivos.", err);
    res.status(500).send("Erro ao carregar dispositivos.");
  }
});

app.post("/devices", isAuthenticated, isAdmin, async (req, res) => {
  const { name, device_type, company_id, sector_id } = req.body;
  if (!name || !device_type || !company_id || !sector_id) {
    return res.status(400).json({
      message: "Todos os campos são obrigatórios.",
    });
  }
  const device_identifier = uuidv4();
  const authentication_key = crypto.randomBytes(32).toString("hex");
  try {
    await db.query(
      `INSERT INTO devices (name, device_identifier, authentication_key, device_type, company_id, sector_id, is_active)
        VALUES ($1, $2, $3, $4, $5, $6, TRUE)`,
      [
        name,
        device_identifier,
        authentication_key,
        device_type,
        company_id,
        sector_id,
      ]
    );
    res.json({
      message: "Dispositivo cadastrado com sucesso.",
    });
  } catch (err) {
    logger.error("Erro ao cadastrar dispositivo.", err);
    res.status(500).json({
      message: "Erro ao cadastrar dispositivo. Tente novamente.",
    });
  }
});

app.post("/devices/:id/edit", isAuthenticated, isAdmin, async (req, res) => {
  const { id } = req.params;
  const { name, device_type, company_id, sector_id } = req.body;
  if (!name || !device_type || !company_id || !sector_id) {
    return res.status(400).json({
      message: "Todos os campos são obrigatórios.",
    });
  }
  try {
    const oldRes = await db.query(
      "SELECT device_type FROM devices WHERE id = $1",
      [id]
    );
    if (oldRes.rows.length === 0) {
      return res.status(404).json({ message: "Dispositivo não encontrado." });
    }
    const oldType = oldRes.rows[0].device_type;
    await db.query(
      "UPDATE devices SET name = $1, device_type = $2, company_id = $3, sector_id = $4 WHERE id = $5",
      [name, device_type, company_id, sector_id, id]
    );
    if (oldType !== device_type) {
      sendUpdateToDevice(id, {
        type: "TYPE_CHANGED",
        payload: { newType: device_type },
      });
    }
    res.json({
      message: "Dispositivo atualizado com sucesso.",
    });
  } catch (err) {
    logger.error("Erro ao atualizar dispositivo.", err);
    res.status(500).json({
      message: "Erro ao atualizar dispositivo. Tente novamente.",
    });
  }
});

app.post("/devices/:id/delete", isAuthenticated, isAdmin, async (req, res) => {
  const { id } = req.params;
  const client = await db.connect();
  try {
    await client.query("BEGIN");

    const deviceResult = await client.query(
      "SELECT device_identifier FROM devices WHERE id = $1",
      [id]
    );

    if (deviceResult.rowCount === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ message: "Dispositivo não encontrado." });
    }
    const deviceIdentifier = deviceResult.rows[0].device_identifier;

    await client.query("DELETE FROM campaign_device WHERE device_id = $1", [
      id,
    ]);
    await client.query("DELETE FROM tokens WHERE device_id = $1", [id]);
    await client.query("DELETE FROM devices WHERE id = $1", [id]);

    await client.query("COMMIT");

    sendUpdateToDevice(id, {
      type: "DEVICE_REVOKED",
      payload: { identifier: deviceIdentifier },
    });

    res.status(200).json({
      message: "Dispositivo excluído e sessão encerrada com sucesso.",
    });
  } catch (err) {
    await client.query("ROLLBACK");
    logger.error("Erro ao excluir dispositivo:", err);
    res.status(500).json({ message: "Erro ao excluir o dispositivo." });
  } finally {
    client.release();
  }
});

app.post(
  "/devices/:id/magicLink",
  isAuthenticated,
  isAdmin,
  async (req, res) => {
    const { id } = req.params;
    const token = crypto.randomBytes(32).toString("hex");
    const expiresAt = DateTime.now().plus({ hours: 24 }).toJSDate();
    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
    try {
      await db.query(
        "INSERT INTO magic_links (device_id, token_hash, expires_at) VALUES ($1, $2, $3)",
        [id, tokenHash, expiresAt]
      );
      const magicLink = `${req.protocol}://${req.get(
        "host"
      )}/pair/magic?token=${token}`;
      res.status(200).json({ magicLink });
    } catch (err) {
      logger.error("Erro ao gerar link mágico.", err);
      res.status(500).json({ message: "Erro ao gerar link mágico." });
    }
  }
);

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
      logger.error("Erro ao revogar acesso do dispositivo.", err);
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
      logger.error("Erro ao reativar o dispositivo.", err);
      res.status(500).json({ message: "Erro ao reativar o dispositivo." });
    }
  }
);

app.get("/pair", (req, res) => {
  const { error } = req.query;
  const accessToken = req.cookies.access_token;
  const refreshToken = req.cookies.refresh_token;

  if (req.session.userId) {
    return res.redirect("/dashboard");
  }
  if (accessToken || refreshToken) {
    return deviceAuth(req, res, () => {
      const type = req.device.device_type;
      return res.redirect(type === "terminal_consulta" ? "/price" : "/player");
    });
  }
  if (error) {
    res.clearCookie("access_token");
    res.clearCookie("refresh_token");
    return res.render("pair", { error });
  }
  res.clearCookie("access_token");
  res.clearCookie("refresh_token");
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
      maxAge: JWT_REFRESH_COOKIE_MAX_AGE,
    });
    if (device.device_type === "terminal_consulta") {
      return res.redirect("/price");
    } else {
      return res.redirect("/player");
    }
  } catch (err) {
    await client.query("ROLLBACK");
    logger.error("Erro ao autenticar dispositivo no pareamento.", err);
    res.render("pair", { error: "Erro ao autenticar dispositivo." });
  } finally {
    client.release();
  }
});

app.get("/player", deviceAuth, async (req, res) => {
  if (req.device.device_type === "terminal_consulta") {
    return res.redirect("/price");
  }
  try {
    const deviceResult = await db.query(
      "SELECT name, device_type FROM devices WHERE id = $1",
      [req.device.id]
    );
    if (deviceResult.rows.length === 0) {
      return res.status(404).send("Dispositivo não encontrado.");
    }
    const device = deviceResult.rows[0];
    res.render("player", { deviceName: device.name });
  } catch (err) {
    logger.error("Erro ao carregar a página do player.", err);
    res.status(500).send("Erro ao carregar dispositivo.");
  }
});

app.get("/price", deviceAuth, async (req, res) => {
  if (req.device.device_type !== "terminal_consulta") {
    return res.redirect("/player");
  }
  try {
    const deviceResult = await db.query(
      "SELECT id, name, sector_id FROM devices WHERE id = $1",
      [req.device.id]
    );
    if (deviceResult.rows.length === 0) {
      return res.status(404).send("Dispositivo não encontrado.");
    }
    const device = deviceResult.rows[0];
    const campaignsResult = await db.query(
      `SELECT c.* FROM campaigns c
        LEFT JOIN campaign_device cd ON c.id = cd.campaign_id
        LEFT JOIN campaign_sector cs ON c.id = cs.campaign_id
        WHERE c.start_date <= NOW() AND c.end_date >= NOW()
        AND (cd.device_id = $1 OR cs.sector_id = $2)`,
      [device.id, device.sector_id]
    );
    const offers = campaignsResult.rows;
    res.render("price", { deviceName: device.name, offers });
  } catch (err) {
    logger.error("Erro ao carregar a página de busca de preço.", err);
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

async function revokeToken(refreshToken) {
  try {
    await db.query(
      "UPDATE tokens SET is_revoked = TRUE WHERE refresh_token = $1",
      [refreshToken]
    );
  } catch (err) {
    logger.error("Erro ao revogar token durante o logout.", err);
  }
}

app.get(
  "/api/deviceDetails/:id",
  isAuthenticated,
  isAdmin,
  async (req, res) => {
    const { id } = req.params;
    try {
      const deviceResult = await db.query(
        `SELECT d.*,
        c.name as company_name,
        s.name as sector_name,
        (SELECT COUNT(*) FROM tokens t WHERE t.device_id = d.id AND t.is_revoked = false) > 0 as has_tokens
         FROM devices d 
         LEFT JOIN companies c ON d.company_id = c.id
         LEFT JOIN sectors s ON d.sector_id = s.id
         WHERE d.id = $1`,
        [id]
      );
      if (deviceResult.rows.length === 0) {
        return res.status(404).json({ message: "Dispositivo não encontrado." });
      }
      const device = deviceResult.rows[0];

      const activeCampaignsResult = await db.query(
        `SELECT c.name FROM campaigns c
         LEFT JOIN campaign_device cd ON c.id = cd.campaign_id
         LEFT JOIN campaign_sector cs ON c.id = cs.campaign_id
         WHERE (cd.device_id = $1 OR cs.sector_id = $2)
          AND NOW() BETWEEN c.start_date AND c.end_date`,
        [id, device.sector_id]
      );

      const activeCampaigns = activeCampaignsResult.rows.map((c) => c.name);
      const isOnline = clients.hasOwnProperty(device.id);
      let status;
      if (!device.is_active) {
        status = { text: "Revogado", class: "revoked" };
      } else if (isOnline) {
        status = { text: "Online", class: "online" };
      } else if (device.has_tokens) {
        status = { text: "Offline", class: "offline" };
      } else {
        status = { text: "Inativo", class: "inactive" };
      }
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
      res.json({
        ...device,
        is_online: isOnline,
        registered_at_formatted: registeredAtFormatted,
        last_seen_formatted: lastSeenFormatted,
        active_campaigns: activeCampaigns,
        status: status,
      });
    } catch (err) {
      logger.error("Erro ao buscar detalhes do dispositivo.", err);
      res.status(500).json({ message: "Erro interno do servidor." });
    }
  }
);

app.get("/pair/magic", async (req, res) => {
  const { token } = req.query;
  if (!token) {
    return res.status(400).send("Token não fornecido.");
  }
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const linkResult = await db.query(
      "SELECT * FROM magic_links WHERE token_hash = $1",
      [tokenHash]
    );
    if (linkResult.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.render("pair", {
        error: "Link de pareamento inválido ou expirado.",
      });
    }
    const magicLink = linkResult.rows[0];
    if (magicLink.used_at) {
      await client.query("ROLLBACK");
      return res.render("pair", {
        error: "Este link de pareamento já foi utilizado.",
      });
    }
    if (new Date() > new Date(magicLink.expires_at)) {
      await client.query("ROLLBACK");
      return res.render("pair", { error: "Este link de pareamento expirou." });
    }
    await client.query("UPDATE magic_links SET used_at = NOW() WHERE id = $1", [
      magicLink.id,
    ]);
    const deviceResult = await client.query(
      "SELECT * FROM devices WHERE id = $1 AND is_active = true",
      [magicLink.device_id]
    );
    if (deviceResult.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.render("pair", {
        error: "O dispositivo associado a este link não está ativo.",
      });
    }
    const device = deviceResult.rows[0];
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
      maxAge: JWT_REFRESH_COOKIE_MAX_AGE,
    });
    if (device.device_type === "terminal_consulta") {
      return res.redirect("/price");
    } else {
      return res.redirect("/player");
    }
  } catch (err) {
    await client.query("ROLLBACK");
    logger.error("Erro ao autenticar dispositivo com link mágico.", err);
    res.render("pair", { error: "Erro ao autenticar dispositivo." });
  } finally {
    client.release();
  }
});

app.post(
  "/campaigns",
  isAuthenticated,
  isAdmin,
  upload.array("media", 5),
  async (req, res) => {
    let {
      name,
      start_date,
      end_date,
      device_ids,
      sector_ids,
      company_id,
      media_metadata,
    } = req.body;

    if (!name || !start_date || !end_date || !company_id) {
      return res
        .status(400)
        .json({ message: "Todos os campos são obrigatórios." });
    }

    const newDeviceIds = device_ids
      ? Array.isArray(device_ids)
        ? device_ids
        : [device_ids]
      : [];
    const newSectorIds = sector_ids
      ? Array.isArray(sector_ids)
        ? sector_ids
        : [sector_ids]
      : [];
    const mediaMetadata = media_metadata ? JSON.parse(media_metadata) : [];

    const parsedStartDate = DateTime.fromFormat(
      start_date,
      "dd/MM/yyyy HH:mm"
    ).toJSDate();
    const parsedEndDate = DateTime.fromFormat(
      end_date,
      "dd/MM/yyyy HH:mm"
    ).toJSDate();

    const client = await db.connect();
    try {
      await client.query("BEGIN");
      const campaignResult = await client.query(
        `INSERT INTO campaigns (name, start_date, end_date, company_id) VALUES ($1, $2, $3, $4) RETURNING *`,
        [name, parsedStartDate, parsedEndDate, company_id]
      );
      const newCampaign = campaignResult.rows[0];

      if (req.files && req.files.length > 0) {
        for (const [index, file] of req.files.entries()) {
          const metadata = mediaMetadata[index] || {};
          const filePath = `/uploads/${file.filename}`;
          await client.query(
            `INSERT INTO campaign_uploads (campaign_id, file_name, file_path, file_type, execution_order, duration) VALUES ($1, $2, $3, $4, $5, $6)`,
            [
              newCampaign.id,
              file.originalname,
              filePath,
              file.mimetype,
              metadata.order,
              metadata.duration,
            ]
          );
        }
      }

      for (const device_id of newDeviceIds) {
        await client.query(
          `INSERT INTO campaign_device (campaign_id, device_id) VALUES ($1, $2)`,
          [newCampaign.id, device_id]
        );
      }

      for (const sector_id of newSectorIds) {
        await client.query(
          `INSERT INTO campaign_sector (campaign_id, sector_id) VALUES ($1, $2)`,
          [newCampaign.id, sector_id]
        );
      }

      await client.query("COMMIT");

      const allAffectedDevices = await db.query(
        `SELECT id FROM devices 
         WHERE id = ANY($1::uuid[]) OR sector_id = ANY($2::int[])`,
        [newDeviceIds, newSectorIds]
      );

      allAffectedDevices.rows.forEach((row) => {
        sendUpdateToDevice(row.id, {
          type: "NEW_CAMPAIGN",
          payload: newCampaign,
        });
      });

      res
        .status(200)
        .json({ message: "Campanha criada.", campaign: newCampaign });
    } catch (err) {
      await client.query("ROLLBACK");
      logger.error("Erro interno ao criar campanha.", err);
      res.status(500).json({ message: "Erro interno ao criar campanha." });
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
      const uploadsResult = await db.query(
        "SELECT file_path FROM campaign_uploads WHERE campaign_id = $1",
        [id]
      );

      const affectedDevicesResult = await db.query(
        `
        SELECT DISTINCT d.id FROM devices d
        LEFT JOIN campaign_device cd ON d.id = cd.device_id
        LEFT JOIN campaign_sector cs ON d.sector_id = cs.sector_id
        WHERE cd.campaign_id = $1 OR cs.campaign_id = $1
      `,
        [id]
      );
      const affectedDeviceIds = affectedDevicesResult.rows.map((row) => row.id);

      await client.query("DELETE FROM campaign_device WHERE campaign_id = $1", [
        id,
      ]);
      await client.query("DELETE FROM campaign_sector WHERE campaign_id = $1", [
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

      for (const row of uploadsResult.rows) {
        const fileName = path.basename(row.file_path);
        const fullPath = path.join(__dirname, "uploads", fileName);
        fsPromises.unlink(fullPath).catch((err) => {
          logger.error(`Falha ao excluir arquivo de mídia: ${fullPath}`, err);
        });
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
        message: "Campanha e mídias associadas foram excluídas com sucesso.",
      });
    } catch (err) {
      await client.query("ROLLBACK");
      logger.error(`Erro ao excluir campanha ID ${id}.`, err);
      res.status(500).json({ message: "Erro ao excluir campanha." });
    } finally {
      client.release();
    }
  }
);

app.get(
  "/api/companies/:companyId/sectors",
  isAuthenticated,
  isAdmin,
  async (req, res) => {
    const { companyId } = req.params;
    try {
      const sectorsResult = await db.query(
        "SELECT * FROM sectors WHERE company_id = $1 ORDER BY name",
        [companyId]
      );
      res.json(sectorsResult.rows);
    } catch (err) {
      logger.error(`Erro ao buscar setores da empresa ${companyId}.`, err);
      res.status(500).json({ message: "Erro ao buscar setores." });
    }
  }
);

app.get(
  "/api/companies/:companyId/devices",
  isAuthenticated,
  isAdmin,
  async (req, res) => {
    const { companyId } = req.params;
    try {
      const devicesResult = await db.query(
        "SELECT id, name FROM devices WHERE company_id = $1 AND is_active = TRUE ORDER BY name",
        [companyId]
      );
      res.json(devicesResult.rows);
    } catch (err) {
      logger.error(`Erro ao buscar dispositivos da empresa ${companyId}.`, err);
      res.status(500).json({ message: "Erro ao buscar dispositivos." });
    }
  }
);

app.get("/api/wsToken", deviceAuth, (req, res) => {
  try {
    const accessToken = generateAccessToken(req.device);
    res.json({ accessToken });
  } catch (err) {
    logger.error("Erro ao gerar token para WebSocket.", err);
    res.status(500).json({ message: "Erro ao gerar token para WebSocket." });
  }
});

app.post("/api/broadcastRefresh", isAuthenticated, isAdmin, (req, res) => {
  const message = JSON.stringify({ type: "FORCE_REFRESH" });
  wss.clients.forEach((ws) => {
    if (ws.isAlive) {
      ws.send(message);
    }
  });
  res
    .status(200)
    .json({ message: "Comando de atualização enviado a todos os players." });
});

const GQL_URL = "https://api.campeao.com.br/graphql";
const GQL_HEADERS = {
  "content-type": "application/json",
  accept: "application/json",
  origin: "https://campeao.com.br",
  referer: "https://campeao.com.br/",
  "user-agent": "StreamBoard/1.0 (+node)",
};

async function authenticateCampeao() {
  try {
    const r = await axios.post(
      GQL_URL,
      {
        operationName: "authenticateUser",
        variables: {
          email: process.env.CAMPEAO_API_EMAIL,
          password: process.env.CAMPEAO_API_PASSWORD,
        },
        query: `mutation authenticateUser($email: String!, $password: String!) {
          authenticateUser(email: $email, password: $password) { token }
        }`,
      },
      { headers: GQL_HEADERS, timeout: 10000 }
    );
    campeaoToken = r.data?.data?.authenticateUser?.token || null;
    if (!campeaoToken) throw new Error("Token não retornado pela API Campeão");
    campeaoTokenExp = Date.now() + 14 * 60 * 1000;
  } catch (err) {
    campeaoToken = null;
    logger.error("Falha ao autenticar na API Campeão.", err);
    throw err;
  }
}

async function ensureToken() {
  if (!campeaoToken || Date.now() >= campeaoTokenExp) {
    await authenticateCampeao();
  }
}

async function gqlRequest(body) {
  await ensureToken();
  try {
    return await axios.post(GQL_URL, body, {
      headers: { ...GQL_HEADERS, Authorization: `Bearer ${campeaoToken}` },
      timeout: 10000,
    });
  } catch (err) {
    if (err.response && err.response.status === 401) {
      logger.info("Token da API Campeão expirado, reautenticando.");
      campeaoToken = null;
      await ensureToken();
      return axios.post(GQL_URL, body, {
        headers: { ...GQL_HEADERS, Authorization: `Bearer ${campeaoToken}` },
        timeout: 10000,
      });
    }
    logger.error("Erro na requisição GQL para a API Campeão.", err);
    throw err;
  }
}

app.get("/api/device/playlist", deviceAuth, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT up.id, up.file_path, up.file_type, up.duration
       FROM campaign_uploads up
       JOIN campaigns c ON up.campaign_id = c.id
       JOIN devices d ON d.id = $1
       LEFT JOIN campaign_device cd ON c.id = cd.campaign_id
       LEFT JOIN campaign_sector cs ON c.id = cs.campaign_id
       WHERE
         c.company_id = d.company_id AND
         c.start_date <= NOW() AND
         c.end_date >= NOW() AND
         (
           (cd.campaign_id IS NULL AND cs.campaign_id IS NULL) OR
           cd.device_id = d.id OR
           cs.sector_id = d.sector_id
         )
       ORDER BY up.execution_order ASC`,
      [req.device.id]
    );
    res.setHeader(
      "Cache-Control",
      "no-store, no-cache, must-revalidate, private"
    );
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
    res.json(result.rows);
  } catch (err) {
    logger.error("Erro ao buscar playlist do dispositivo.", err);
    res.status(500).json({ message: "Erro ao buscar playlist." });
  }
});

app.get("/campaigns", isAuthenticated, isAdmin, async (req, res) => {
  try {
    const campaignsResult = await db.query(`
      SELECT
        c.*,
        co.name as company_name,
        (
          SELECT json_agg(s.name)
          FROM sectors s
          JOIN campaign_sector cs ON s.id = cs.sector_id
          WHERE cs.campaign_id = c.id
        ) as sector_names,
        (
          SELECT json_agg(d.name)
          FROM devices d
          JOIN campaign_device cd ON d.id = cd.device_id
          WHERE cd.campaign_id = c.id
        ) as device_names,
        (SELECT COUNT(*) FROM campaign_uploads cu WHERE cu.campaign_id = c.id) as uploads_count,
        (SELECT cu.file_type FROM campaign_uploads cu WHERE cu.campaign_id = c.id ORDER BY cu.execution_order ASC LIMIT 1) as first_upload_type
      FROM campaigns c
      JOIN companies co ON c.company_id = co.id
      ORDER BY c.created_at DESC`);

    const now = DateTime.now().setZone("America/Sao_Paulo");
    const campaigns = campaignsResult.rows.map((campaign) => {
      const formatOptions = {
        zone: "America/Sao_Paulo",
        locale: "pt-BR",
      };
      const startDate = DateTime.fromJSDate(campaign.start_date, formatOptions);
      const endDate = DateTime.fromJSDate(campaign.end_date, formatOptions);
      let status;
      if (now < startDate) {
        status = { text: "Agendada", class: "scheduled" };
      } else if (now > endDate) {
        status = { text: "Finalizada", class: "offline" };
      } else {
        status = { text: "Ativa", class: "online" };
      }

      let campaign_type = "Sem Mídia";
      const uploadsCount = parseInt(campaign.uploads_count, 10);
      if (uploadsCount > 1) {
        campaign_type = "Playlist";
      } else if (uploadsCount === 1) {
        if (campaign.first_upload_type?.startsWith("image/")) {
          campaign_type = "Imagem";
        } else if (campaign.first_upload_type?.startsWith("video/")) {
          campaign_type = "Vídeo";
        } else {
          campaign_type = "Arquivo";
        }
      }

      let target_names = [];
      if (campaign.sector_names && campaign.sector_names.length > 0) {
        target_names = campaign.sector_names;
      } else if (campaign.device_names && campaign.device_names.length > 0) {
        target_names = campaign.device_names;
      }

      return {
        ...campaign,
        status,
        target_names,
        periodo_formatado: formatarPeriodo(
          campaign.start_date,
          campaign.end_date
        ),
        campaign_type,
      };
    });

    const companiesResult = await db.query(
      "SELECT id, name FROM companies ORDER BY name"
    );

    res.render("campaigns", {
      campaigns,
      companies: companiesResult.rows,
      sectors: [],
    });
  } catch (err) {
    logger.error("Erro ao carregar campanhas.", err);
    res.status(500).send("Erro ao carregar campanhas.");
  }
});

app.post(
  "/campaigns/:id/edit",
  isAuthenticated,
  isAdmin,
  upload.array("media", 5),
  async (req, res) => {
    const { id } = req.params;
    let {
      name,
      start_date,
      end_date,
      device_ids,
      sector_ids,
      company_id,
      media_touched,
    } = req.body;

    if (!name || !start_date || !end_date || !company_id) {
      return res
        .status(400)
        .json({ message: "Todos os campos são obrigatórios." });
    }

    const newDeviceIds = device_ids
      ? Array.isArray(device_ids)
        ? device_ids
        : [device_ids]
      : [];
    const newSectorIds = sector_ids
      ? Array.isArray(sector_ids)
        ? sector_ids
        : [sector_ids]
      : [];

    const parsedStartDate = DateTime.fromFormat(
      start_date,
      "dd/MM/yyyy HH:mm"
    ).toJSDate();
    const parsedEndDate = DateTime.fromFormat(
      end_date,
      "dd/MM/yyyy HH:mm"
    ).toJSDate();

    const client = await db.connect();
    try {
      const oldAffectedDevicesResult = await client.query(
        `
        SELECT DISTINCT d.id FROM devices d
        LEFT JOIN campaign_device cd ON d.id = cd.device_id
        LEFT JOIN campaign_sector cs ON d.sector_id = cs.sector_id
        WHERE cd.campaign_id = $1 OR cs.campaign_id = $1
      `,
        [id]
      );
      const oldAffectedDeviceIds = oldAffectedDevicesResult.rows.map(
        (r) => r.id
      );

      await client.query("BEGIN");
      await client.query(
        "UPDATE campaigns SET name = $1, start_date = $2, end_date = $3, company_id = $4 WHERE id = $5",
        [name, parsedStartDate, parsedEndDate, company_id, id]
      );

      if (media_touched === "true") {
        const mediaMetadata = req.body.media_metadata
          ? JSON.parse(req.body.media_metadata)
          : [];
        const keptMediaIds = mediaMetadata
          .filter((m) => m.id !== null)
          .map((m) => m.id);
        const newFilesMetadata = mediaMetadata.filter((m) => m.id === null);

        const existingUploads = await client.query(
          "SELECT id, file_path FROM campaign_uploads WHERE campaign_id = $1",
          [id]
        );
        const uploadsToDelete = existingUploads.rows.filter(
          (upload) => !keptMediaIds.includes(upload.id)
        );

        if (uploadsToDelete.length > 0) {
          for (const upload of uploadsToDelete) {
            fsPromises
              .unlink(path.join(__dirname, upload.file_path))
              .catch((err) =>
                logger.error(
                  `Falha ao remover arquivo: ${upload.file_path}`,
                  err
                )
              );
          }
          await client.query(
            "DELETE FROM campaign_uploads WHERE id = ANY($1::int[])",
            [uploadsToDelete.map((u) => u.id)]
          );
        }

        for (const meta of mediaMetadata) {
          if (meta.id !== null) {
            await client.query(
              "UPDATE campaign_uploads SET execution_order = $1, duration = $2 WHERE id = $3",
              [meta.order, meta.duration, meta.id]
            );
          }
        }

        let fileIndex = 0;
        for (const meta of newFilesMetadata) {
          const file = req.files[fileIndex++];
          if (file) {
            const newFilePath = `/uploads/${file.filename}`;
            await client.query(
              `INSERT INTO campaign_uploads (campaign_id, file_name, file_path, file_type, execution_order, duration) VALUES ($1, $2, $3, $4, $5, $6)`,
              [
                id,
                file.originalname,
                newFilePath,
                file.mimetype,
                meta.order,
                meta.duration,
              ]
            );
          }
        }
      }

      await client.query("DELETE FROM campaign_device WHERE campaign_id = $1", [
        id,
      ]);
      await client.query("DELETE FROM campaign_sector WHERE campaign_id = $1", [
        id,
      ]);

      for (const device_id of newDeviceIds) {
        await client.query(
          "INSERT INTO campaign_device (campaign_id, device_id) VALUES ($1, $2)",
          [id, device_id]
        );
      }

      for (const sector_id of newSectorIds) {
        await client.query(
          "INSERT INTO campaign_sector (campaign_id, sector_id) VALUES ($1, $2)",
          [id, sector_id]
        );
      }

      await client.query("COMMIT");

      const newAffectedDevicesResult = await client.query(
        `SELECT id FROM devices
         WHERE id = ANY($1::uuid[]) OR sector_id = ANY($2::int[])`,
        [newDeviceIds, newSectorIds]
      );
      const newAffectedDeviceIds = newAffectedDevicesResult.rows.map(
        (r) => r.id
      );

      const allAffectedDeviceIds = [
        ...new Set([...oldAffectedDeviceIds, ...newAffectedDeviceIds]),
      ];

      allAffectedDeviceIds.forEach((deviceId) => {
        sendUpdateToDevice(deviceId, {
          type: "UPDATE_CAMPAIGN",
          payload: { campaignId: id },
        });
      });

      const finalResult = await client.query(
        `SELECT c.*,
          co.name as company_name,
          (SELECT json_agg(s.name) FROM sectors s JOIN campaign_sector cs ON s.id = cs.sector_id WHERE cs.campaign_id = c.id) as sector_names,
          (SELECT json_agg(d.name) FROM devices d JOIN campaign_device cd ON d.id = cd.device_id WHERE cd.campaign_id = c.id) as device_names,
          (SELECT COUNT(*) FROM campaign_uploads cu WHERE cu.campaign_id = c.id) as uploads_count,
          (SELECT cu.file_type FROM campaign_uploads cu WHERE cu.campaign_id = c.id ORDER BY cu.execution_order ASC LIMIT 1) as first_upload_type
        FROM campaigns c
        JOIN companies co ON c.company_id = co.id
        WHERE c.id = $1`,
        [id]
      );

      const campaignData = finalResult.rows[0];
      if (!campaignData) {
        return res
          .status(404)
          .json({ message: "Campanha não encontrada após a edição." });
      }

      const now = DateTime.now().setZone("America/Sao_Paulo");
      const startDate = DateTime.fromJSDate(campaignData.start_date, {
        zone: "America/Sao_Paulo",
      });
      const endDate = DateTime.fromJSDate(campaignData.end_date, {
        zone: "America/Sao_Paulo",
      });
      let status;
      if (now < startDate) {
        status = { text: "Agendada", class: "scheduled" };
      } else if (now > endDate) {
        status = { text: "Finalizada", class: "offline" };
      } else {
        status = { text: "Ativa", class: "online" };
      }

      let campaign_type = "Sem Mídia";
      const uploadsCount = parseInt(campaignData.uploads_count, 10);
      if (uploadsCount > 1) {
        campaign_type = "Playlist";
      } else if (uploadsCount === 1) {
        if (campaignData.first_upload_type?.startsWith("image/")) {
          campaign_type = "Imagem";
        } else if (campaignData.first_upload_type?.startsWith("video/")) {
          campaign_type = "Vídeo";
        } else {
          campaign_type = "Arquivo";
        }
      }

      let target_names = [];
      if (campaignData.sector_names && campaignData.sector_names.length > 0) {
        target_names = campaignData.sector_names;
      } else if (
        campaignData.device_names &&
        campaignData.device_names.length > 0
      ) {
        target_names = campaignData.device_names;
      }

      const campaignForResponse = {
        ...campaignData,
        target_names,
        periodo_formatado: formatarPeriodo(
          campaignData.start_date,
          campaignData.end_date
        ),
        campaign_type,
        status: status,
      };

      res.status(200).json({
        message: "Campanha atualizada com sucesso.",
        campaign: campaignForResponse,
      });
    } catch (err) {
      await client.query("ROLLBACK");
      logger.error(`Erro ao editar campanha ${id}.`, err);
      res.status(500).json({ message: "Erro ao atualizar campanha." });
    } finally {
      client.release();
    }
  }
);

app.get("/api/campaigns/:id", isAuthenticated, isAdmin, async (req, res) => {
  const { id } = req.params;
  try {
    const campaignResult = await db.query(
      `SELECT c.*,
        (SELECT json_agg(json_build_object('id', d.id, 'name', d.name))
         FROM campaign_device cd
         JOIN devices d ON cd.device_id = d.id
         WHERE cd.campaign_id = c.id) as devices,
        (SELECT json_agg(cs.sector_id)
         FROM campaign_sector cs
         WHERE cs.campaign_id = c.id) as sector_ids
       FROM campaigns c
       WHERE c.id = $1`,
      [id]
    );

    if (campaignResult.rows.length === 0) {
      return res.status(404).json({ message: "Campanha não encontrada." });
    }

    const campaign = campaignResult.rows[0];
    campaign.devices = campaign.devices || [];
    campaign.sector_ids = campaign.sector_ids || [];

    const uploadsResult = await db.query(
      "SELECT id, file_name, file_path, file_type, duration FROM campaign_uploads WHERE campaign_id = $1 ORDER BY execution_order ASC",
      [id]
    );
    campaign.uploads = uploadsResult.rows;

    res.json(campaign);
  } catch (err) {
    logger.error(`Erro ao buscar detalhes da campanha ${id}.`, err);
    res.status(500).json({ message: "Erro interno do servidor." });
  }
});

app.post("/api/sectors", isAuthenticated, isAdmin, async (req, res) => {
  const { company_id, name } = req.body;
  if (!company_id || !name) {
    return res
      .status(400)
      .json({ message: "ID da empresa e nome do setor são obrigatórios." });
  }
  try {
    const result = await db.query(
      "INSERT INTO sectors (company_id, name) VALUES ($1, $2) RETURNING *",
      [company_id, name]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    logger.error("Erro ao adicionar setor.", err);
    if (err.code === "23505") {
      return res
        .status(409)
        .json({ message: "Este setor já existe para esta empresa." });
    }
    res.status(500).json({ message: "Erro ao adicionar novo setor." });
  }
});

app.post(
  "/api/sectors/:id/delete",
  isAuthenticated,
  isAdmin,
  async (req, res) => {
    const { id } = req.params;
    const client = await db.connect();
    try {
      await client.query("BEGIN");

      const devicesCountResult = await client.query(
        "SELECT COUNT(*) FROM devices WHERE sector_id = $1",
        [id]
      );
      const devicesCount = parseInt(devicesCountResult.rows[0].count, 10);

      if (devicesCount > 0) {
        await client.query("ROLLBACK");
        return res.status(400).json({
          message:
            "Não é possível excluir este setor pois existem dispositivos associados a ele. Remova ou reassocie os dispositivos primeiro.",
        });
      }

      const deleteResult = await client.query(
        "DELETE FROM sectors WHERE id = $1 RETURNING *",
        [id]
      );

      if (deleteResult.rowCount === 0) {
        await client.query("ROLLBACK");
        return res.status(404).json({ message: "Setor não encontrado." });
      }

      await client.query("COMMIT");
      res.status(200).json({ message: "Setor excluído com sucesso." });
    } catch (err) {
      await client.query("ROLLBACK");
      if (err.code === "23503") {
        return res.status(409).json({
          message:
            "Não é possível excluir este setor pois existem referências a ele em outras tabelas (ex: dispositivos). Remova as associações primeiro.",
        });
      }
      res.status(500).json({ message: "Erro ao excluir setor." });
    } finally {
      client.release();
    }
  }
);

app.get("/api/companies/:id", isAuthenticated, isAdmin, async (req, res) => {
  const { id } = req.params;
  try {
    const result = await db.query("SELECT * FROM companies WHERE id = $1", [
      id,
    ]);
    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Empresa não encontrada." });
    }
    res.json(result.rows[0]);
  } catch (err) {
    logger.error(`Erro ao buscar detalhes da empresa ${id}.`, err);
    res.status(500).json({ message: "Erro interno do servidor." });
  }
});

app.get("/api/product/:barcode", async (req, res) => {
  const { barcode } = req.params;
  try {
    const result = await sysmo.query(
      `
      SELECT
        pro.cod AS cod,
        bar.bar AS bar,
        pro.dsc AS dsc,
        pre.pv2 AS pv2
      FROM gcepro02 pro
      JOIN gcebar01 bar ON pro.cod = bar.pro
      JOIN gcepro04 pre ON pre.cod = bar.pro AND pre.emp = 1
      WHERE bar.bar = $1
    `,
      [barcode]
    );

    if (result.rows.length === 0) {
      return res
        .status(404)
        .json({ message: "Produto não encontrado no banco." });
    }

    const product = result.rows[0];
    const iid = String(product.cod).split(".")[0].trim();

    let gqlResp;
    try {
      gqlResp = await gqlRequest({
        operationName: "ProductsListQuery",
        variables: {
          storeId: "5",
          args: {
            limit: 1,
            offset: 0,
            storeId: "5",
            sort: { field: "id", order: "desc" },
            iid,
          },
        },
        query: `
          fragment ProductListFragment on Product {
            id iid name gtin
            image { url thumborized(width:210,height:210) }
            configuration(storeId: $storeId) { price promotionalPrice qtyInStock }
          }
          query ProductsListQuery($args: ProductStoreSearchInput!, $storeId: ID!) {
            productsByStore(args: $args) {
              rows { ...ProductListFragment }
              count
            }
          }
        `,
      });
    } catch (err) {
      logger.error(`Erro ao consultar API externa para o produto ${iid}.`, err);
      return res
        .status(500)
        .json({ message: "Erro ao consultar API externa." });
    }

    const rows = gqlResp.data?.data?.productsByStore?.rows || [];

    let image = null;
    if (rows.length > 0) {
      const campeaoProduct = rows[0];
      image =
        campeaoProduct.image?.thumborized || campeaoProduct.image?.url || null;
    }

    return res.json({
      cod: product.cod,
      bar: product.bar,
      dsc: product.dsc,
      pv2: product.pv2,
      image,
    });
  } catch (err) {
    logger.error(
      `Erro ao buscar produto com código de barras ${barcode}.`,
      err
    );
    return res.status(500).json({ message: "Erro ao buscar produto." });
  }
});

server.listen(PORT, () => {
  logger.info(`🔥 Server Running in http://127.0.0.1:${PORT}`);
});
