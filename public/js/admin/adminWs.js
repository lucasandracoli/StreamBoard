import { notyf } from "./utils.js";

let lastProductNotification = null;
let lastCampaignNotification = null;

export function connectAdminWs(detailsModalHandler) {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const wsUrl = `${protocol}//${window.location.host}/admin-ws`;
  const ws = new WebSocket(wsUrl);

  ws.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);

      if (data.type === "DEVICE_LIST_UPDATED") {
        detailsModalHandler.refreshDeviceDetails();
      } else if (
        data.type === "COMPANY_CREATED" ||
        data.type === "COMPANY_UPDATED" ||
        data.type === "COMPANY_DELETED"
      ) {
        notyf.success(data.payload.message || "Empresa atualizada.");
        setTimeout(() => window.location.reload(), 1000);
      } else if (
        data.type === "CAMPAIGN_CREATED" ||
        data.type === "CAMPAIGN_UPDATED" ||
        data.type === "CAMPAIGN_DELETED"
      ) {
        const message = data.payload.message || "Campanha atualizada.";
        if (lastCampaignNotification) {
          lastCampaignNotification.dismiss();
        }
        lastCampaignNotification = notyf.success(message);
        setTimeout(() => lastCampaignNotification.dismiss(), 3000);
        const currentPath = window.location.pathname;
        if (currentPath.startsWith("/campaigns")) {
          setTimeout(() => window.location.reload(), 1500);
        }
      } else if (data.type === "PRODUCT_UPDATE") {
        const message = data.payload.message || "Lista de produtos atualizada.";
        if (lastProductNotification) {
          lastProductNotification.dismiss();
        }
        lastProductNotification = notyf.success(message);
        setTimeout(() => lastProductNotification.dismiss(), 3000);
        const currentPath = window.location.pathname;
        if (currentPath.startsWith("/products")) {
          setTimeout(() => window.location.reload(), 1500);
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
