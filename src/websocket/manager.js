const WebSocket = require("ws");
const url = require("url");
const db = require("../../config/streamboard");
const tokenService = require("../services/token.service");
const deviceUtils = require("../utils/device.utils");

let clients = {};
let adminClients = new Set();
let wss;

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

const initializeWebSocket = (server) => {
  wss = new WebSocket.Server({ server });

  wss.on("connection", async (ws, req) => {
    const { pathname, query } = url.parse(req.url, true);

    if (pathname === "/admin-ws") {
      adminClients.add(ws);
      ws.on("close", () => adminClients.delete(ws));

      const allDevicesResult = await db.query(
        `SELECT id, is_active, (SELECT COUNT(*) FROM tokens t WHERE t.device_id = devices.id AND t.is_revoked = false) > 0 as has_tokens FROM devices`
      );

      for (const device of allDevicesResult.rows) {
        const status = deviceUtils.getDeviceStatus(device, clients);
        ws.send(
          JSON.stringify({
            type: "DEVICE_STATUS_UPDATE",
            payload: { deviceId: device.id, status },
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
    await db.query("UPDATE devices SET last_seen = NOW() WHERE id = $1", [
      deviceId,
    ]);
    clients[deviceId] = ws;

    broadcastToAdmins({
      type: "DEVICE_STATUS_UPDATE",
      payload: { deviceId, status: { text: "Online", class: "online" } },
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
      const deviceResult = await db.query(
        "SELECT is_active, (SELECT COUNT(*) FROM tokens t WHERE t.device_id = devices.id AND t.is_revoked = false) > 0 as has_tokens FROM devices WHERE id = $1",
        [deviceId]
      );
      const device = deviceResult.rows[0];
      const status = deviceUtils.getDeviceStatus(device, clients);

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

  wss.on("close", () => clearInterval(heartbeatInterval));
};

module.exports = {
  initializeWebSocket,
  sendUpdateToDevice,
  broadcastToAdmins,
  getClients: () => clients,
  getWss: () => wss,
};