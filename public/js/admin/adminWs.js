import { notyf } from "./utils.js";

function updateDeviceStatusOnPage(payload) {
  const { deviceId, status, deviceName } = payload;
  const row = document.querySelector(`tr[data-device-id="${deviceId}"]`);
  if (!row) return;

  const statusCell = row.querySelector("[data-status-cell]");
  const nameCell = row.querySelector("td:first-child");

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

function handlePageUpdate(data, pageId, path) {
    notyf.success(data.payload.message || "Operação concluída.");
    const isOnPage = document.getElementById(pageId);
    if (isOnPage && window.location.pathname.includes(path)) {
        setTimeout(() => window.location.reload(), 1200);
    }
}


export function connectAdminWs(detailsModalHandler) {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const wsUrl = `${protocol}//${window.location.host}/admin-ws`;
  const ws = new WebSocket(wsUrl);

  ws.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);

      switch (data.type) {
        case "DEVICE_STATUS_UPDATE":
        case "DEVICE_NEWLY_ACTIVE":
          if (document.getElementById("devices-page")) {
            updateDeviceStatusOnPage(data.payload);
          }
          break;
        case "COMPANY_DELETED":
           notyf.success(data.payload.message || "Empresa excluída.");
           break;
        case "PRODUCT_UPDATE":
           handlePageUpdate(data, 'products-page', '/products');
           break;
        case "CAMPAIGN_UPDATE":
           handlePageUpdate(data, 'campaigns-page', '/campaigns');
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