import { notyf } from "./utils.js";
import { refreshCompaniesTable } from "./companiesPage.js";
import { updateDeviceRow, refreshDevicesTable } from "./devicesPage.js";
import { updateCampaignRow, refreshCampaignsTable } from "./campaignsPage.js";
import { refreshProductTable, resetSyncButton } from "./productsPage.js";

export function connectAdminWs(detailsModalHandler) {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const wsUrl = `${protocol}//${window.location.host}/admin-ws`;
  const ws = new WebSocket(wsUrl);

  ws.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      const pageId = document.body.id;

      switch (data.type) {
        case "DEVICE_STATUS_UPDATE":
          if (pageId === "devices-page") updateDeviceRow(data.payload);
          break;
        case "DEVICE_CREATED":
        case "DEVICE_DELETED":
          if (pageId === "devices-page") refreshDevicesTable();
          notyf.success(data.payload.message);
          break;
        case "DEVICE_UPDATED":
          if (pageId === "devices-page") {
            updateDeviceRow(data.payload);
            if (
              detailsModalHandler?.element.dataset.showingDeviceId ===
              String(data.payload.id)
            ) {
              detailsModalHandler.openDetailsModal(data.payload.id);
            }
          }
          if (data.payload.message) notyf.success(data.payload.message);
          break;
        case "COMPANY_CREATED":
        case "COMPANY_DELETED":
        case "COMPANY_UPDATED":
          if (pageId === "companies-page") refreshCompaniesTable();
          notyf.success(data.payload.message);
          break;
        case "CAMPAIGN_CREATED":
        case "CAMPAIGN_DELETED":
          if (pageId === "campaigns-page") refreshCampaignsTable();
          notyf.success(data.payload.message);
          break;
        case "CAMPAIGN_UPDATED":
          if (pageId === "campaigns-page") updateCampaignRow(data.payload);
          notyf.success(data.payload.message);
          break;

        case "PRODUCT_OPERATION_SUCCESS": {
          notyf.success(data.payload.message);
          if (pageId === "products-page") {
            const currentCompanyId = window.location.pathname.split("/").pop();
            if (
              !data.payload.companyId ||
              String(data.payload.companyId) === currentCompanyId
            ) {
              refreshProductTable();
            }
          }
          break;
        }
        case "PRODUCT_OPERATION_FAILURE": {
          notyf.error(data.payload.message);
          if (pageId === "products-page") {
            const currentCompanyId = window.location.pathname.split("/").pop();
            if (
              !data.payload.companyId ||
              String(data.payload.companyId) === currentCompanyId
            ) {
              resetSyncButton();
            }
          }
          break;
        }
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
