require("dotenv").config();
const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const session = require("express-session");
const bodyParser = require("body-parser");
const bcrypt = require("bcrypt");
const db = require("./config/streamboard");
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

Settings.defaultZone = "America/Sao_Paulo";

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

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
      maxAge: 7776000000,
    });

    req.device = device;
    next();
  } catch (err) {
    await client.query("ROLLBACK");
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
  } catch {
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
        status = { text: "Revogado", class: "online-status revoked" };
      } else if (isOnline) {
        status = { text: "Online", class: "online-status online" };
      } else if (tokenCount > 0) {
        status = { text: "Offline", class: "online-status offline" };
      } else {
        status = { text: "Inativo", class: "online-status inactive" };
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
      status: { text: "Online", class: "online-status online" },
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
        ? { text: "Offline", class: "online-status offline" }
        : { text: "Inativo", class: "online-status inactive" };
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
        newStatus = { text: "Agendada", class: "online-status scheduled" };
      } else if (now > endDate) {
        newStatus = { text: "Finalizada", class: "online-status offline" };
      } else {
        newStatus = { text: "Ativa", class: "online-status online" };
      }

      broadcastToAdmins({
        type: "CAMPAIGN_STATUS_UPDATE",
        payload: {
          campaignId: campaign.id,
          status: newStatus,
        },
      });
    });
  } catch {}
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
  } catch {
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
      `SELECT d.*,
        (SELECT COUNT(*) FROM tokens t WHERE t.device_id = d.id AND t.is_revoked = false) > 0 as has_tokens
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
        status = { text: "Revogado", class: "online-status revoked" };
      } else if (isOnline) {
        status = { text: "Online", class: "online-status online" };
      } else if (device.has_tokens) {
        status = { text: "Offline", class: "online-status offline" };
      } else {
        status = { text: "Inativo", class: "online-status inactive" };
      }

      return {
        ...device,
        last_seen_formatted: lastSeenFormatted,
        is_online: isOnline,
        status: status,
      };
    });

    res.render("devices", { devices });
  } catch {
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
  } catch {
    res.status(500).json({
      code: 500,
      message: "Erro ao cadastrar dispositivo. Tente novamente.",
    });
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
    const oldRes = await db.query(
      "SELECT device_type FROM devices WHERE id = $1",
      [id]
    );
    if (oldRes.rows.length === 0) {
      return res
        .status(404)
        .json({ code: 404, message: "Dispositivo não encontrado." });
    }
    const oldType = oldRes.rows[0].device_type;
    await db.query(
      "UPDATE devices SET name = $1, device_type = $2, sector = $3 WHERE id = $4",
      [name, device_type, sector, id]
    );
    if (oldType !== device_type) {
      sendUpdateToDevice(id, {
        type: "TYPE_CHANGED",
        payload: { newType: device_type },
      });
    }
    res.json({
      code: 200,
      message: "Dispositivo atualizado com sucesso.",
    });
  } catch {
    res.status(500).json({
      code: 500,
      message: "Erro ao atualizar dispositivo. Tente novamente.",
    });
  }
});

app.post("/devices/:id/delete", isAuthenticated, isAdmin, async (req, res) => {
  const { id } = req.params;
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    await client.query("DELETE FROM campaign_device WHERE device_id = $1", [
      id,
    ]);
    await client.query("DELETE FROM tokens WHERE device_id = $1", [id]);
    const deleteResult = await client.query(
      "DELETE FROM devices WHERE id = $1",
      [id]
    );
    if (deleteResult.rowCount === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ message: "Dispositivo não encontrado." });
    }
    await client.query("COMMIT");
    res.status(200).json({
      message: "Dispositivo excluído com sucesso.",
    });
  } catch {
    await client.query("ROLLBACK");
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
    } catch {
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
    } catch {
      await client.query("ROLLBACK");
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
    } catch {
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
      return res.redirect(type === "busca_preco" ? "/price" : "/player");
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
      maxAge: 604800000,
    });
    if (device.device_type === "busca_preco") {
      return res.redirect("/price");
    } else {
      return res.redirect("/player");
    }
  } catch {
    await client.query("ROLLBACK");
    res.render("pair", { error: "Erro ao autenticar dispositivo." });
  } finally {
    client.release();
  }
});

app.get("/player", deviceAuth, async (req, res) => {
  if (req.device.device_type === "busca_preco") {
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
  } catch {
    res.status(500).send("Erro ao carregar dispositivo.");
  }
});

app.get("/price", deviceAuth, async (req, res) => {
  if (req.device.device_type !== "busca_preco") {
    return res.redirect("/player");
  }
  try {
    const deviceResult = await db.query(
      "SELECT id, name FROM devices WHERE id = $1",
      [req.device.id]
    );
    if (deviceResult.rows.length === 0) {
      return res.status(404).send("Dispositivo não encontrado.");
    }
    const device = deviceResult.rows[0];
    const campaignsResult = await db.query(
      `SELECT c.* FROM campaigns c
        JOIN campaign_device cd ON c.id = cd.campaign_id
        WHERE cd.device_id = $1
        AND c.start_date <= NOW() 
        AND c.end_date >= NOW()`,
      [device.id]
    );
    const offers = campaignsResult.rows;
    res.render("price", { deviceName: device.name, offers });
  } catch {
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
  } catch {}
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
        (SELECT COUNT(*) FROM tokens t WHERE t.device_id = d.id AND t.is_revoked = false) > 0 as has_tokens
        FROM devices d WHERE d.id = $1`,
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
      let status;
      if (!device.is_active) {
        status = { text: "Revogado", class: "online-status revoked" };
      } else if (isOnline) {
        status = { text: "Online", class: "online-status online" };
      } else if (device.has_tokens) {
        status = { text: "Offline", class: "online-status offline" };
      } else {
        status = { text: "Inativo", class: "online-status inactive" };
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
    } catch {
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
      maxAge: 604800000,
    });
    if (device.device_type === "busca_preco") {
      return res.redirect("/price");
    } else {
      return res.redirect("/player");
    }
  } catch {
    await client.query("ROLLBACK");
    res.render("pair", { error: "Erro ao autenticar dispositivo." });
  } finally {
    client.release();
  }
});

app.get("/api/device/playlist", deviceAuth, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT c.* FROM campaigns c
        JOIN campaign_device cd ON c.id = cd.campaign_id
        WHERE cd.device_id = $1
        AND c.start_date <= NOW() 
        AND c.end_date >= NOW()`,
      [req.device.id]
    );
    res.setHeader(
      "Cache-Control",
      "no-store, no-cache, must-revalidate, private"
    );
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
    res.json(result.rows);
  } catch {
    res.status(500).json({ message: "Erro ao buscar playlist." });
  }
});

app.get("/campaigns", isAuthenticated, isAdmin, async (req, res) => {
  try {
    const campaignsResult = await db.query(`
      SELECT 
        c.*,
        (
          SELECT JSON_AGG(
            json_build_object('id', d.id, 'name', d.name, 'sector', d.sector)
          )
          FROM campaign_device cd
          JOIN devices d ON cd.device_id = d.id
          WHERE cd.campaign_id = c.id
        ) as devices
      FROM 
        campaigns c
      ORDER BY 
        c.created_at DESC
    `);
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
        status = { text: "Agendada", class: "online-status scheduled" };
      } else if (now > endDate) {
        status = { text: "Finalizada", class: "online-status offline" };
      } else {
        status = { text: "Ativa", class: "online-status online" };
      }
      return {
        ...campaign,
        status,
        devices: campaign.devices || [],
        periodo_formatado: formatarPeriodo(
          campaign.start_date,
          campaign.end_date
        ),
      };
    });
    const devicesResult = await db.query(
      "SELECT * FROM devices WHERE is_active = TRUE ORDER BY name"
    );
    const devices = devicesResult.rows;
    const sectorsResult = await db.query(
      "SELECT DISTINCT sector FROM devices WHERE sector IS NOT NULL AND sector <> '' ORDER BY sector"
    );
    const sectors = sectorsResult.rows.map((r) => r.sector);
    res.render("campaigns", { campaigns, devices, sectors });
  } catch {
    res.status(500).send("Erro ao carregar campanhas.");
  }
});

app.post(
  "/campaigns",
  isAuthenticated,
  isAdmin,
  upload.single("media"),
  async (req, res) => {
    let { name, start_date, end_date, device_ids } = req.body;
    if (!name || !start_date || !end_date || !device_ids) {
      return res
        .status(400)
        .json({ message: "Todos os campos são obrigatórios." });
    }
    if (!Array.isArray(device_ids)) {
      device_ids = [device_ids];
    }
    let parsedStartDate, parsedEndDate;
    try {
      parsedStartDate = DateTime.fromFormat(
        start_date,
        "dd/MM/yyyy HH:mm"
      ).toJSDate();
      parsedEndDate = DateTime.fromFormat(
        end_date,
        "dd/MM/yyyy HH:mm"
      ).toJSDate();
      if (parsedEndDate < parsedStartDate) {
        return res.status(400).json({
          message: "A data de término não pode ser anterior à data de início.",
        });
      }
    } catch {
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
      for (const device_id of device_ids) {
        await client.query(
          `INSERT INTO campaign_device (campaign_id, device_id)
            VALUES ($1, $2)`,
          [newCampaign.id, device_id]
        );
      }
      await client.query("COMMIT");
      device_ids.forEach((device_id) => {
        sendUpdateToDevice(device_id, {
          type: "NEW_CAMPAIGN",
          payload: newCampaign,
        });
      });
      res.status(200).json({
        code: 200,
        message: "Campanha criada e associada aos dispositivos.",
        campaign: newCampaign,
      });
    } catch (err) {
      await client.query("ROLLBACK");
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
      const campaignResult = await db.query(
        "SELECT midia FROM campaigns WHERE id = $1",
        [id]
      );
      const mediaPath =
        campaignResult.rows.length > 0 ? campaignResult.rows[0].midia : null;
      const affectedDevicesResult = await db.query(
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
        fsPromises.unlink(fullPath).catch(() => {});
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
    } catch {
      await client.query("ROLLBACK");
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
    const associatedDevicesResult = await db.query(
      `SELECT d.id, d.sector 
                      FROM devices d 
                      JOIN campaign_device cd ON d.id = cd.device_id 
                      WHERE cd.campaign_id = $1`,
      [id]
    );
    const associatedDevices = associatedDevicesResult.rows;
    const allDevicesResult = await db.query(
      "SELECT id, name FROM devices WHERE is_active = TRUE"
    );
    const allDevices = allDevicesResult.rows;
    res.json({ campaign, associatedDevices, allDevices });
  } catch {
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
    let { name, start_date, end_date, device_ids, remove_media } = req.body;
    if (!name || !start_date || !end_date || !device_ids) {
      return res
        .status(400)
        .json({ message: "Todos os campos são obrigatórios." });
    }
    if (!Array.isArray(device_ids)) {
      device_ids = [device_ids];
    }
    let parsedStartDate, parsedEndDate;
    try {
      parsedStartDate = DateTime.fromFormat(
        start_date,
        "dd/MM/yyyy HH:mm"
      ).toJSDate();
      parsedEndDate = DateTime.fromFormat(
        end_date,
        "dd/MM/yyyy HH:mm"
      ).toJSDate();
      if (parsedEndDate < parsedStartDate) {
        return res.status(400).json({
          message: "A data de término não pode ser anterior à data de início.",
        });
      }
    } catch {
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
      const oldDeviceIds = oldDevicesResult.rows.map((row) =>
        row.device_id.toString()
      );
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
        fsPromises.unlink(oldFullPath).catch(() => {});
      }
      if (req.file) {
        await client.query(
          `INSERT INTO campaign_uploads (campaign_id, file_name, file_path, file_type) VALUES ($1, $2, $3, $4) ON CONFLICT (campaign_id) DO UPDATE SET file_name = EXCLUDED.file_name, file_path = EXCLUDED.file_path, file_type = EXCLUDED.file_type`,
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
      for (const device_id of device_ids) {
        await client.query(
          `INSERT INTO campaign_device (campaign_id, device_id) VALUES ($1, $2)`,
          [id, device_id]
        );
      }
      await client.query("COMMIT");
      const devicesToRemove = oldDeviceIds.filter(
        (oldId) => !device_ids.includes(oldId)
      );
      const devicesToAdd = device_ids.filter(
        (newId) => !oldDeviceIds.includes(newId)
      );
      const devicesToUpdate = device_ids.filter((id) =>
        oldDeviceIds.includes(id)
      );
      devicesToRemove.forEach((deviceId) => {
        sendUpdateToDevice(deviceId, {
          type: "DELETE_CAMPAIGN",
          payload: { campaignId: Number(id) },
        });
      });
      devicesToAdd.forEach((deviceId) => {
        sendUpdateToDevice(deviceId, {
          type: "NEW_CAMPAIGN",
          payload: updatedCampaign,
        });
      });
      devicesToUpdate.forEach((deviceId) => {
        sendUpdateToDevice(deviceId, {
          type: "UPDATE_CAMPAIGN",
          payload: updatedCampaign,
        });
      });
      res.status(200).json({
        code: 200,
        message: "Campanha atualizada com sucesso.",
        campaign: updatedCampaign,
      });
    } catch (err) {
      await client.query("ROLLBACK");
      res.status(500).json({
        message: "Erro interno ao atualizar campanha.",
        error: err.message,
      });
    } finally {
      client.release();
    }
  }
);

app.get("/api/wsToken", deviceAuth, (req, res) => {
  try {
    const accessToken = generateAccessToken(req.device);
    res.json({ accessToken });
  } catch {
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

server.listen(PORT, () => {
  console.log(`🔥 Server Running in http://127.0.0.1:${PORT}`);
});
