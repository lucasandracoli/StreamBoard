require("dotenv").config();
const express = require("express");
const session = require("express-session");
const bodyParser = require("body-parser");
const bcrypt = require("bcrypt");
const db = require("./config/streamboard");
const helmet = require("helmet");
const { v4: uuidv4 } = require("uuid");
const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const { DateTime } = require("luxon");

const app = express();
const PORT = process.env.PORT || 3000;

const JWT_SECRET = process.env.JWT_SECRET || "Yd99gxdkw4@";
const JWT_EXPIRATION = "15m";
const JWT_REFRESH_EXPIRATION = "7d";

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
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];
  if (!token) return res.status(401).json({ message: "Token não fornecido." });
  try {
    const payload = verifyToken(token);
    req.device = payload;
    next();
  } catch (err) {
    return res.status(403).json({ message: "Token inválido ou expirado." });
  }
}

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
app.use(helmet());

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
  if (req.session.userId) return res.redirect("/dashboard");
  res.redirect("/login");
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

app.get("/logout", (req, res) => {
  req.session.destroy(() => {
    res.redirect("/login");
  });
});

app.get("/dashboard", isAuthenticated, isAdmin, (req, res) => {
  res.render("dashboard", { user: req.user });
});

app.get("/devices", isAuthenticated, isAdmin, async (req, res) => {
  try {
    const result = await db.query(
      "SELECT * FROM devices ORDER BY registered_at DESC"
    );
    const devices = result.rows.map((d) => ({
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

app.post("/devices", isAuthenticated, isAdmin, async (req, res) => {
  const { name, device_type } = req.body;

  const device_identifier = uuidv4();
  const authentication_key = crypto.randomBytes(32).toString("hex");

  try {
    await db.query(
      `INSERT INTO devices (name, device_identifier, authentication_key, device_type)
       VALUES ($1, $2, $3, $4)`,
      [name, device_identifier, authentication_key, device_type]
    );
    res.redirect("/devices");
  } catch (err) {
    res.status(500).send("Erro ao cadastrar dispositivo.");
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

app.post("/device/auth", async (req, res) => {
  const { device_identifier, authentication_key } = req.body;
  if (!device_identifier || !authentication_key) {
    return res.status(400).json({ message: "Credenciais obrigatórias." });
  }
  try {
    const result = await db.query(
      "SELECT * FROM devices WHERE device_identifier = $1 AND is_active = true",
      [device_identifier]
    );
    if (result.rows.length === 0) {
      return res
        .status(401)
        .json({ message: "Dispositivo inválido ou inativo." });
    }
    const device = result.rows[0];
    if (device.authentication_key !== authentication_key) {
      return res.status(401).json({ message: "Credenciais incorretas." });
    }
    const nowBRT = DateTime.now().setZone("America/Sao_Paulo").toJSDate();
    await db.query("UPDATE devices SET last_seen = $1 WHERE id = $2", [
      nowBRT,
      device.id,
    ]);
    const accessToken = generateAccessToken(device);
    const refreshToken = generateRefreshToken(device);
    await db.query(
      `INSERT INTO device_tokens (device_id, token, refresh_token, expires_at)
       VALUES ($1, $2, $3, NOW() + INTERVAL '15 minutes')`,
      [device.id, accessToken, refreshToken]
    );
    res.status(200).json({
      access_token: accessToken,
      refresh_token: refreshToken,
      expires_in: 900,
    });
  } catch (err) {
    res.status(500).json({ message: "Erro ao autenticar dispositivo." });
  }
});

app.post("/device/refresh", async (req, res) => {
  const { device_identifier, refresh_token } = req.body;
  if (!device_identifier || !refresh_token) {
    return res.status(400).json({ message: "Parâmetros obrigatórios." });
  }
  try {
    const result = await db.query(
      `SELECT dt.*, d.device_identifier FROM device_tokens dt
       JOIN devices d ON d.id = dt.device_id
       WHERE d.device_identifier = $1 AND dt.refresh_token = $2 AND dt.is_revoked = false`,
      [device_identifier, refresh_token]
    );
    if (result.rows.length === 0) {
      return res.status(403).json({ message: "Refresh token inválido." });
    }
    verifyToken(refresh_token);
    const device = result.rows[0];
    const newAccessToken = generateAccessToken(device);
    const newRefreshToken = generateRefreshToken(device);
    await db.query(
      `INSERT INTO device_tokens (device_id, token, refresh_token, expires_at)
       VALUES ($1, $2, $3, NOW() + INTERVAL '15 minutes')`,
      [device.device_id, newAccessToken, newRefreshToken]
    );
    res.json({
      access_token: newAccessToken,
      refresh_token: newRefreshToken,
      expires_in: 900,
    });
  } catch (err) {
    res.status(403).json({ message: "Refresh token expirado ou inválido." });
  }
});

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
    if (
      result.rows.length === 0 ||
      result.rows[0].authentication_key !== authentication_key
    ) {
      return res.render("pair", { error: "ID ou segredo inválidos." });
    }
    const device = result.rows[0];
    const nowBRT = DateTime.now().setZone("America/Sao_Paulo").toJSDate();
    await db.query("UPDATE devices SET last_seen = $1 WHERE id = $2", [
      nowBRT,
      device.id,
    ]);
    const accessToken = generateAccessToken(device);
    const refreshToken = generateRefreshToken(device);
    await db.query(
      `INSERT INTO device_tokens (device_id, token, refresh_token, expires_at)
       VALUES ($1, $2, $3, NOW() + INTERVAL '15 minutes')`,
      [device.id, accessToken, refreshToken]
    );
    res.render("player", {
      accessToken,
      refreshToken,
      deviceName: device.name,
    });
  } catch (err) {
    res.render("pair", { error: "Erro ao autenticar dispositivo." });
  }
});

app.listen(PORT, () => {
  console.log(`🔥 Server Running in http://127.0.0.1:${PORT}`);
});
