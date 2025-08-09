const WebSocket = require("ws");
const url = require("url");
const db = require("../../config/streamboard");
const tokenService = require("../services/token.service");
const deviceUtils = require("../utils/device.utils");

let wss;
const clients = {};
const adminClients = new Set();
const deviceStatusCache = new Map();

const updateAndCacheDeviceStatus = (deviceId, deviceDetails) => {
  const status = deviceUtils.getDeviceStatus(deviceDetails, clients);
  const cacheEntry = { status, deviceName: deviceDetails.name };
  deviceStatusCache.set(deviceId, cacheEntry);
  return cacheEntry;
};

const broadcastToAdmins = (data) => {
  const message = JSON.stringify(data);
  adminClients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
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

  const populateInitialCache = async () => {
    try {
      const allDevicesResult = await db.query(
        `SELECT id, name, is_active, (SELECT COUNT(*) FROM tokens t WHERE t.device_id = devices.id AND t.is_revoked = false) > 0 as has_tokens FROM devices`
      );
      for (const device of allDevicesResult.rows) {
        updateAndCacheDeviceStatus(device.id, device);
      }
    } catch (error) {
      console.error("Failed to populate WebSocket cache:", error);
    }
  };

  populateInitialCache();

  wss.on("connection", async (ws, req) => {
    const { pathname, query } = url.parse(req.url, true);

    if (pathname === "/admin-ws") {
      adminClients.add(ws);
      ws.on("close", () => adminClients.delete(ws));

      deviceStatusCache.forEach((value, deviceId) => {
        ws.send(
          JSON.stringify({
            type: "DEVICE_STATUS_UPDATE",
            payload: {
              deviceId,
              status: value.status,
              deviceName: value.deviceName,
            },
          })
        );
      });
      return;
    }

    const token = query.token;
    if (!token) return ws.close(1008, "Token não fornecido");

    const payload = tokenService.verifyToken(token);
    if (!payload) return ws.close(1008, "Token inválido ou expirado");

    const deviceId = payload.id;
    clients[deviceId] = ws;

    await db.query("UPDATE devices SET last_seen = NOW() WHERE id = $1", [
      deviceId,
    ]);
    const deviceResult = await db.query(
      "SELECT id, name, is_active, (SELECT COUNT(*) FROM tokens t WHERE t.device_id = devices.id AND t.is_revoked = false) > 0 as has_tokens FROM devices WHERE id = $1",
      [deviceId]
    );

    if (deviceResult.rows.length > 0) {
      const device = deviceResult.rows[0];
      const updatedStatus = updateAndCacheDeviceStatus(deviceId, device);
      broadcastToAdmins({
        type: "DEVICE_STATUS_UPDATE",
        payload: {
          deviceId,
          status: updatedStatus.status,
          deviceName: updatedStatus.deviceName,
        },
      });
    }

    ws.isAlive = true;
    ws.on("pong", () => (ws.isAlive = true));

    ws.on("close", async () => {
      delete clients[deviceId];
      const closedDeviceResult = await db.query(
        "SELECT id, name, is_active, (SELECT COUNT(*) FROM tokens t WHERE t.device_id = devices.id AND t.is_revoked = false) > 0 as has_tokens FROM devices WHERE id = $1",
        [deviceId]
      );

      if (closedDeviceResult.rows.length > 0) {
        const device = closedDeviceResult.rows[0];
        const updatedStatus = updateAndCacheDeviceStatus(deviceId, device);
        broadcastToAdmins({
          type: "DEVICE_STATUS_UPDATE",
          payload: {
            deviceId,
            status: updatedStatus.status,
            deviceName: updatedStatus.deviceName,
          },
        });
      }
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
