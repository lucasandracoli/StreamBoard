import { notyf } from "./utils.js";
import { statusCacheManager } from "./cache.js";

function updateCampaignRow(campaign) {
  const row = document.querySelector(`tr[data-campaign-id="${campaign.id}"]`);
  if (!row) return;

  row.querySelector(".col-name").textContent = campaign.name;
  row.querySelector(".col-company").textContent = campaign.company_name;
  row.querySelector(".col-type").textContent = campaign.campaign_type;
  row.querySelector(".col-period").textContent = campaign.periodo_formatado;

  const statusCell = row.querySelector("[data-status-cell]");
  if (statusCell && campaign.status) {
    const statusSpan = statusCell.querySelector(".online-status");
    const statusText = statusCell.querySelector("[data-status-text]");
    if (statusSpan && statusText) {
      statusSpan.className = `online-status ${campaign.status.class}`;
      statusText.textContent = campaign.status.text;
    }
  }

  const deviceCell = row.querySelector(".col-devices");
  let deviceText = "Todos";
  if (campaign.target_names && campaign.target_names.length > 0) {
    deviceText = campaign.target_names.slice(0, 2).join(", ");
    if (campaign.target_names.length > 2) {
      deviceText += ` <span class="device-badge-extra">+${
        campaign.target_names.length - 2
      }</span>`;
    }
  }
  deviceCell.innerHTML = deviceText;
}

export function connectAdminWs(detailsModalHandler) {
  if (!document.body.id.endsWith("-page")) return;

  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const wsUrl = `${protocol}//${window.location.host}/admin-ws`;
  const ws = new WebSocket(wsUrl);
  let isReloading = false;

  ws.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);

      if (data.type === "DEVICE_STATUS_UPDATE") {
        const { deviceId, status, deviceName } = data.payload;
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
      } else if (data.type === "CAMPAIGN_UPDATED") {
        updateCampaignRow(data.payload);
      } else if (
        data.type === "RELOAD_CAMPAIGNS" &&
        document.body.id === "campaigns-page" &&
        !isReloading
      ) {
        isReloading = true;
        notyf.info(
          "A lista de campanhas foi atualizada. Recarregando a página..."
        );
        setTimeout(() => window.location.reload(), 1500);
      }
    } catch (e) {
      console.error("Erro ao processar mensagem WebSocket:", e);
    }
  };

  ws.onclose = () =>
    setTimeout(() => connectAdminWs(detailsModalHandler), 5000);
  ws.onerror = () => ws.close();
}
