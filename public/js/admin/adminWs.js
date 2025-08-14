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
import { addProductRow, removeProductRow } from "./productsPage.js";

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
      const isProductsPage = document.getElementById("products-page");

      switch (data.type) {
        case "DEVICE_STATUS_UPDATE":
        case "DEVICE_NEWLY_ACTIVE":
          if (isDevicesPage) updateDeviceStatusOnPage(data.payload);
          break;
        case "DEVICE_CREATED":
          if (isDevicesPage) addDeviceRow(data.payload);
          notyf.success(`Dispositivo "${data.payload.name}" criado.`);
          break;
        case "DEVICE_UPDATED":
          if (isDevicesPage) updateDeviceRow(data.payload);
          notyf.success(`Dispositivo "${data.payload.name}" atualizado.`);
          break;
        case "DEVICE_DELETED":
          if (isDevicesPage) removeDeviceRow(data.payload.deviceId);
          notyf.success(`Dispositivo removido com sucesso.`);
          break;

        case "COMPANY_CREATED":
          if (isCompaniesPage) addCompanyRow(data.payload);
          notyf.success(`Empresa "${data.payload.name}" criada.`);
          break;
        case "COMPANY_UPDATED":
          if (isCompaniesPage) updateCompanyRow(data.payload);
          notyf.success(`Empresa "${data.payload.name}" atualizada.`);
          break;
        case "COMPANY_DELETED":
          if (isCompaniesPage) removeCompanyRow(data.payload.companyId);
          notyf.success(`Empresa removida com sucesso.`);
          break;

        case "CAMPAIGN_CREATED":
          if (isCampaignsPage) addCampaignRow(data.payload);
          notyf.success(`Campanha "${data.payload.name}" criada.`);
          break;
        case "CAMPAIGN_UPDATED":
          if (isCampaignsPage) updateCampaignRow(data.payload);
          notyf.success(`Campanha "${data.payload.name}" atualizada.`);
          break;
        case "CAMPAIGN_DELETED":
          if (isCampaignsPage) removeCampaignRow(data.payload.campaignId);
          notyf.success(`Campanha removida com sucesso.`);
          break;

        case "PRODUCT_CREATED":
          if (isProductsPage) addProductRow(data.payload);
          notyf.success(`Produto "${data.payload.product_name}" adicionado.`);
          break;
        case "PRODUCT_DELETED":
          if (isProductsPage) removeProductRow(data.payload.productId);
          notyf.success(`Produto removido com sucesso.`);
          break;
        case "PRODUCT_SYNC_COMPLETED":
          if (isProductsPage) {
            const currentCompanyId = window.location.pathname.split("/").pop();
            if (data.payload.companyId == currentCompanyId) {
              notyf.success(data.payload.message);
              setTimeout(() => window.location.reload(), 1500);
            }
          }
          break;
        case "PRODUCT_SYNC_FAILED":
          if (isProductsPage) {
            const currentCompanyId = window.location.pathname.split("/").pop();
            if (data.payload.companyId == currentCompanyId) {
              notyf.error(data.payload.message);
              const syncCompanyBtn = document.getElementById(
                "syncCompanyProductsBtn"
              );
              if (syncCompanyBtn) {
                syncCompanyBtn.disabled = false;
                syncCompanyBtn.querySelector("span").textContent =
                  "Sincronizar Preços";
                syncCompanyBtn.querySelector("i").classList.remove("spinning");
              }
            }
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
