import { notyf, deviceTypeNames } from "./utils.js";

const createDeviceRow = (device) => {
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
};

export const addDeviceRow = (device) => {
  const container = document.querySelector(".container");
  if (!container) return;

  const emptyState = container.querySelector(".empty-state-container");
  if (emptyState) {
    emptyState.outerHTML = `
      <div class="device-table-wrapper">
        <table class="device-table">
          <thead>
            <tr>
              <th>Nome</th>
              <th>Status</th>
              <th>Empresa</th>
              <th>Setor</th>
              <th>Tipo</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody id="devices-table-body"></tbody>
        </table>
      </div>
    `;
  }

  const tableBody = document.getElementById("devices-table-body");
  if (tableBody) {
    const newRow = createDeviceRow(device);
    tableBody.prepend(newRow);
  }
};

export const updateDeviceRow = (device) => {
  const row = document.querySelector(`tr[data-device-id="${device.id}"]`);
  if (!row) {
    addDeviceRow(device);
    return;
  }
  const newRow = createDeviceRow(device);
  row.innerHTML = newRow.innerHTML;
};

export const removeDeviceRow = (deviceId) => {
  const row = document.querySelector(`tr[data-device-id="${deviceId}"]`);
  if (row) {
    row.remove();
  }
  const tableBody = document.getElementById("devices-table-body");
  if (tableBody && tableBody.rows.length === 0) {
    const tableWrapper = document.querySelector(".device-table-wrapper");
    if (tableWrapper) {
      tableWrapper.outerHTML = `
        <div class="empty-state-container">
          <div class="empty-state-icon"><i class="bi bi-hdd-stack"></i></div>
          <h3 class="empty-state-title">Nenhum Dispositivo Encontrado</h3>
          <p class="empty-state-subtitle">Você ainda não adicionou nenhum dispositivo...</p>
        </div>`;
    }
  }
};
