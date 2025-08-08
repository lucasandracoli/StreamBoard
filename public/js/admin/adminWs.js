import { notyf } from "./utils.js";
import { statusCacheManager } from "./cache.js";

export function connectAdminWs(detailsModalHandler) {
  if (!document.body.id.endsWith("-page")) return;

  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const wsUrl = `${protocol}//${window.location.host}/admin-ws`;
  const ws = new WebSocket(wsUrl);

  ws.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      if (data.type === "DEVICE_STATUS_UPDATE") {
        const { deviceId, status } = data.payload;
        const newStatusText = status.text;

        const row = document.querySelector(`tr[data-device-id="${deviceId}"]`);
        if (row) {
          const statusCell = row.querySelector("[data-status-cell]");
          if (statusCell) {
            const statusSpan = statusCell.querySelector(".online-status");
            const statusText = statusCell.querySelector("[data-status-text]");
            if (statusSpan && statusText) {
              statusSpan.className = `online-status ${status.class}`;
              statusText.textContent = status.text;
            }
          }
        }

        if (
          newStatusText === "Online" &&
          statusCacheManager.getStatus(deviceId) !== "Online"
        ) {
          if (detailsModalHandler) {
            const modal = detailsModalHandler.element;
            if (
              modal.style.display === "flex" &&
              modal.dataset.showingDeviceId === deviceId
            ) {
              detailsModalHandler.hideOtpView();
              modal.style.display = "none";
            }
          }
        }
        statusCacheManager.setStatus(deviceId, newStatusText);
      } else if (data.type === "DEVICE_NEWLY_ACTIVE") {
        const { deviceName } = data.payload;
        notyf.success(`Dispositivo "${deviceName}" vinculado com sucesso!`);
      } else if (data.type === "DASHBOARD_STATS_UPDATE") {
        if (document.body.id === "dashboard-page") {
          const {
            onlineDevices,
            totalDevices,
            offlineDevices,
            revokedDevices,
          } = data.payload;
          document.getElementById("online-devices-value").textContent =
            onlineDevices;
          document.getElementById("total-devices-value").textContent =
            totalDevices;
          document.getElementById("offline-devices-value").textContent =
            offlineDevices;
          document.getElementById("revoked-devices-value").textContent =
            revokedDevices;
        }
      } else if (data.type === "CAMPAIGN_STATUS_UPDATE") {
        const { campaignId, status } = data.payload;
        const campaignRow = document.querySelector(
          `tr[data-campaign-id="${campaignId}"]`
        );
        if (campaignRow) {
          const statusCell = campaignRow.querySelector("[data-status-cell]");
          if (statusCell) {
            const statusSpan = statusCell.querySelector(".online-status");
            const statusText = statusCell.querySelector("[data-status-text]");
            if (statusSpan && statusText) {
              statusSpan.className = `online-status ${status.class}`;
              statusText.textContent = status.text;
            }
          }
        }
      } else if (data.type === "RELOAD_CAMPAIGNS") {
        if (document.body.id === "campaigns-page") {
          notyf.success(
            "Alterações nas campanhas detectadas, atualizando a lista..."
          );
          setTimeout(() => location.reload(), 1500);
        }
      }
    } catch (e) {
      console.error("Erro ao processar mensagem WebSocket:", e);
    }
  };

  ws.onclose = () =>
    setTimeout(() => connectAdminWs(detailsModalHandler), 5000);
  ws.onerror = () => ws.close();
}
