import { notyf } from "./utils.js";
import {
  addCompanyRow,
  updateCompanyRow,
  removeCompanyRow,
} from "./companiesPage.js";
import {
  addDeviceRow,
  updateDeviceRow,
  removeDeviceRow,
} from "./devicesPage.js";
import {
  addCampaignRow,
  updateCampaignRow,
  removeCampaignRow,
} from "./campaignsPage.js";

function updateDeviceStatusOnPage(payload) {
  const { deviceId, status, deviceName } = payload;
  const row = document.querySelector(`tr[data-device-id="${deviceId}"]`);
  if (!row) return;

  const statusCell = row.querySelector("[data-status-cell]");
  const nameCell = row.querySelector('td[data-label="Nome"]');

  if (nameCell) {
    nameCell.textContent = deviceName;
  }

  if (statusCell) {
    const statusSpan = statusCell.querySelector(".online-status");
    const statusText = statusCell.querySelector("[data-status-text]");
    if (statusSpan && statusText) {
      statusSpan.className = `online-status ${status.class}`;
      statusText.textContent = status.text;
    }
  }
}

export function connectAdminWs(detailsModalHandler) {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const wsUrl = `${protocol}//${window.location.host}/admin-ws`;
  const ws = new WebSocket(wsUrl);

  ws.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      const isDevicesPage = document.getElementById("devices-page");
      const isCompaniesPage = document.getElementById("companies-page");
      const isCampaignsPage = document.getElementById("campaigns-page");

      switch (data.type) {
        case "DEVICE_STATUS_UPDATE":
        case "DEVICE_NEWLY_ACTIVE":
          if (isDevicesPage) updateDeviceStatusOnPage(data.payload);
          break;
        case "DEVICE_CREATED":
          if (isDevicesPage) addDeviceRow(data.payload);
          break;
        case "DEVICE_UPDATED":
          if (isDevicesPage) updateDeviceRow(data.payload);
          break;
        case "DEVICE_DELETED":
          if (isDevicesPage) removeDeviceRow(data.payload.deviceId);
          break;

        case "COMPANY_CREATED":
          if (isCompaniesPage) addCompanyRow(data.payload);
          break;
        case "COMPANY_UPDATED":
          if (isCompaniesPage) updateCompanyRow(data.payload);
          break;
        case "COMPANY_DELETED":
          if (isCompaniesPage) removeCompanyRow(data.payload.companyId);
          break;
        
        case "CAMPAIGN_CREATED":
          if (isCampaignsPage) addCampaignRow(data.payload);
          break;
        case "CAMPAIGN_UPDATED":
          if (isCampaignsPage) updateCampaignRow(data.payload);
          break;
        case "CAMPAIGN_DELETED":
          if (isCampaignsPage) removeCampaignRow(data.payload.campaignId);
          break;

        case "PRODUCT_UPDATE":
          if (
            document.getElementById("products-page") &&
            window.location.pathname.includes("/products")
          ) {
            notyf.success(
              data.payload.message || "Operação de produto concluída."
            );
            setTimeout(() => window.location.reload(), 1200);
          }
          break;
      }
    } catch (e) {
      console.error("Erro ao processar mensagem WebSocket:", e);
    }
  };

  ws.onclose = () => {
    setTimeout(() => connectAdminWs(detailsModalHandler), 5000);
  };

  ws.onerror = (error) => {
    console.error("Erro WebSocket:", error);
    ws.close();
  };
}