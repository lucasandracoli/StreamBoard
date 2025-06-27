require("dotenv").config();
const express = require("express");
const session = require("express-session");
const bodyParser = require("body-parser");
const bcrypt = require("bcrypt");
const crypto = require("crypto");
const db = require("./config/streamboard");

const app = express();
const PORT = 3000;

app.use(
  session({
    secret: process.env.SESSION_SECRET || "streamboardSecret",
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false },
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

function isPublicRoute(path) {
  const publicPaths = ["/login", "/logout", "/public", "/pair", "/playback"];
  return publicPaths.some((p) => path.startsWith(p));
}

app.use(async (req, res, next) => {
  if (isPublicRoute(req.path)) return next();

  if (!req.session || !req.session.userId) {
    return res.redirect("/login");
  }

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
});

app.get("/login", (req, res) => {
  if (req.session.userId) {
    return res.redirect("/dashboard");
  }
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

app.get("/dashboard", (req, res) => {
  res.render("dashboard");
});

app.get("/devices/pair", (req, res) => {
  res.render("pair");
});

app.get("/pair", async (req, res) => {
  const token = crypto.randomBytes(4).toString("hex").toUpperCase();

  try {
    const result = await db.query(
      "INSERT INTO devices (pairingToken) VALUES ($1) RETURNING pairingToken",
      [token]
    );

    res.render("display", {
      token: result.rows[0].pairingToken,
    });
  } catch (error) {
    res.status(500).send("Erro ao gerar token de pareamento.");
  }
});

app.post("/pair/confirm", async (req, res) => {
  const { pairingToken, name } = req.body;

  if (!pairingToken || !name) {
    return res.status(400).json({
      code: 400,
      status: "error",
      message: "Token de pareamento e nome do dispositivo são obrigatórios.",
    });
  }

  try {
    const result = await db.query(
      "SELECT * FROM devices WHERE pairingToken = $1 AND userId IS NULL",
      [pairingToken]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        code: 404,
        status: "error",
        message: "Token inválido ou já utilizado.",
      });
    }

    const deviceId = result.rows[0].id;

    await db.query(
      "UPDATE devices SET userId = $1, name = $2, pairedAt = NOW(), isActive = TRUE WHERE id = $3",
      [req.user.id, name, deviceId]
    );

    const authToken = crypto.randomBytes(32).toString("hex");

    await db.query(
      "INSERT INTO deviceTokens (deviceId, authToken) VALUES ($1, $2)",
      [deviceId, authToken]
    );

    res.status(200).json({
      code: 200,
      status: "success",
      message: "Dispositivo pareado com sucesso.",
      device: {
        id: deviceId,
        name,
        authToken,
      },
    });
  } catch (error) {
    res.status(500).json({
      code: 500,
      status: "error",
      message: "Erro ao parear dispositivo.",
    });
  }
});

app.get("/playback", async (req, res) => {
  const { token } = req.query;

  if (!token) {
    return res.status(400).json({
      code: 400,
      status: "error",
      message: "Token de autenticação é obrigatório.",
    });
  }

  try {
    const result = await db.query(
      `SELECT d.id AS deviceId, d.name, d.userId
       FROM deviceTokens dt
       JOIN devices d ON d.id = dt.deviceId
       WHERE dt.authToken = $1 AND dt.revoked = FALSE AND d.isActive = TRUE`,
      [token]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({
        code: 401,
        status: "error",
        message: "Token inválido ou dispositivo desativado.",
      });
    }

    const device = result.rows[0];

    await db.query("UPDATE devices SET lastSeen = NOW() WHERE id = $1", [
      device.deviceid,
    ]);

    res.status(200).json({
      code: 200,
      status: "success",
      message: "Token válido. Conteúdo carregado.",
      device: {
        id: device.deviceid,
        name: device.name,
      },
      content: {
        type: "html",
        value:
          "<h1 style='text-align:center;'>🎬 TV Conectada com Sucesso!</h1>",
      },
    });
  } catch (error) {
    res.status(500).json({
      code: 500,
      status: "error",
      message: "Erro ao validar dispositivo.",
    });
  }
});

app.listen(PORT, () => {
  console.log(`🔥 Server Running in http://127.0.0.1:${PORT}`);
});
