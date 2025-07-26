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
        const previousStatusText = statusCacheManager.getStatus(deviceId);

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

        if (newStatusText === "Online" && previousStatusText !== "Online") {
          if (detailsModalHandler && row) {
            const deviceName = row
              .querySelector('td[data-label="Nome"]')
              ?.textContent.trim();
            notyf.success(
              `Dispositivo "${deviceName || deviceId}" conectado.`
            );

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
      }
    } catch (e) {
      console.error("Erro ao processar mensagem WebSocket:", e);
    }
  };

  ws.onclose = () =>
    setTimeout(() => connectAdminWs(detailsModalHandler), 5000);
  ws.onerror = () => ws.close();
}