require("dotenv").config();
const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const session = require("express-session");
const bodyParser = require("body-parser");
const { DateTime, Settings } = require("luxon");
const cookieParser = require("cookie-parser");
const path = require("path");
const url = require("url");
const db = require("./config/streamboard");
const mainRouter = require("./src/routes");
const tokenService = require("./src/services/token.service");

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

app.locals.wss = wss;
app.locals.clients = clients;
app.locals.sendUpdateToDevice = sendUpdateToDevice;
app.locals.broadcastToAdmins = broadcastToAdmins;

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

wss.on("connection", async (ws, req) => {
  const { pathname, query } = url.parse(req.url, true);

  if (pathname === "/admin-ws") {
    adminClients.add(ws);
    ws.on("close", () => adminClients.delete(ws));

    const allDevicesResult = await db.query(
      `SELECT id, name, is_active, (SELECT COUNT(*) FROM tokens t WHERE t.device_id = devices.id AND t.is_revoked = false) > 0 as has_tokens FROM devices`
    );
    const deviceUtils = require("./src/utils/device.utils");

    for (const device of allDevicesResult.rows) {
      const status = deviceUtils.getDeviceStatus(device, clients);
      ws.send(
        JSON.stringify({
          type: "DEVICE_STATUS_UPDATE",
          payload: { deviceId: device.id, status, deviceName: device.name },
        })
      );
    }
    return;
  }

  const token = query.token;
  if (!token) return ws.close(1008, "Token não fornecido");

  const payload = tokenService.verifyToken(token);
  if (!payload) return ws.close(1008, "Token inválido ou expirado");

  const deviceId = payload.id;
  const deviceResult = await db.query(
    "SELECT name FROM devices WHERE id = $1",
    [deviceId]
  );
  const deviceName =
    deviceResult.rows.length > 0 ? deviceResult.rows[0].name : null;

  await db.query("UPDATE devices SET last_seen = NOW() WHERE id = $1", [
    deviceId,
  ]);
  clients[deviceId] = ws;

  broadcastToAdmins({
    type: "DEVICE_STATUS_UPDATE",
    payload: {
      deviceId,
      status: { text: "Online", class: "online" },
      deviceName,
    },
  });

  ws.isAlive = true;
  ws.on("pong", () => (ws.isAlive = true));

  ws.on("close", async () => {
    delete clients[deviceId];
    const deviceResult = await db.query(
      "SELECT name, (SELECT COUNT(*) FROM tokens t WHERE t.device_id = $1 AND t.is_revoked = false) > 0 as has_tokens FROM devices WHERE id = $1",
      [deviceId]
    );

    const deviceName =
      deviceResult.rows.length > 0 ? deviceResult.rows[0].name : null;
    const hasTokens =
      deviceResult.rows.length > 0 ? deviceResult.rows[0].has_tokens : false;

    const status = hasTokens
      ? { text: "Offline", class: "offline" }
      : { text: "Inativo", class: "inactive" };

    broadcastToAdmins({
      type: "DEVICE_STATUS_UPDATE",
      payload: { deviceId, status, deviceName },
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

wss.on("close", () => clearInterval(heartbeatInterval));

app.use("/", mainRouter);

server.listen(PORT, () => {
  logger.info(`🔥 Server Running in http://127.0.0.1:${PORT}`);
});
