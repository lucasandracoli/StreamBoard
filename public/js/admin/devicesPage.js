import { notyf, deviceTypeNames } from "./utils.js";
import { setupTableSearch } from "./tableSearch.js";

function createDeviceRow(device) {
  const row = document.createElement("tr");
  row.dataset.deviceId = device.id;
  row.title = "Clique para ver detalhes";

  const typeName =
    deviceTypeNames[device.device_type] || deviceTypeNames.default;

  row.innerHTML = `
    <td data-label="Nome">${device.name}</td>
    <td data-label="Status" data-status-cell>
      <span class="online-status ${device.status.class}">
        <span class="online-dot"></span>
        <span data-status-text>${device.status.text}</span>
      </span>
    </td>
    <td data-label="Empresa">
      <span class="highlight-company">${device.company_name || "N/A"}</span>
    </td>
    <td data-label="Setor">${device.sector_name || "N/A"}</td>
    <td data-label="Tipo">${typeName}</td>
    <td class="actions-cell">
      <button class="action-icon action-icon-editar" data-id="${
        device.id
      }" title="Editar Dispositivo">
        <i class="bi bi-pencil-square"></i>
      </button>
      <button class="action-icon-excluir" data-id="${
        device.id
      }" title="Excluir Dispositivo">
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M6 6L18 18M6 18L18 6" stroke-linecap="round" stroke-linejoin="round"></path>
        </svg>
      </button>
    </td>
  `;
  return row;
}

export function updateDeviceRow(device) {
  const row = document.querySelector(`tr[data-device-id="${device.id}"]`);
  if (row) {
    const newRow = createDeviceRow(device);
    row.innerHTML = newRow.innerHTML;
  }
}

export async function refreshDevicesTable() {
  try {
    const response = await fetch(window.location.href);
    if (!response.ok) throw new Error("Falha ao buscar dados atualizados.");

    const html = await response.text();
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, "text/html");

    const newContent = doc.querySelector("main.container");
    const oldContent = document.querySelector("main.container");

    if (newContent && oldContent) {
      oldContent.innerHTML = newContent.innerHTML;
      document.dispatchEvent(new CustomEvent("page-content-refreshed"));
    }
  } catch (err) {
    notyf.error(
      err.message || "Não foi possível atualizar a lista de dispositivos."
    );
  }
}
