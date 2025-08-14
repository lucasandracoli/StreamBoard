import { notyf } from "./utils.js";

const createCampaignRow = (campaign) => {
  const row = document.createElement("tr");
  row.dataset.campaignId = campaign.id;

  let targetNamesHtml = "Todos";
  if (campaign.target_names && campaign.target_names.length > 0) {
    const visibleNames = campaign.target_names.slice(0, 2).join(", ");
    const extraCount = campaign.target_names.length - 2;
    targetNamesHtml =
      extraCount > 0
        ? `${visibleNames} <span class="device-badge-extra">+${extraCount}</span>`
        : visibleNames;
  }

  row.innerHTML = `
    <td class="break-word col-name">${campaign.name}</td>
    <td data-status-cell class="col-status">
      <span class="online-status ${campaign.status.class}">
        <span class="online-dot"></span>
        <span data-status-text>${campaign.status.text}</span>
      </span>
    </td>
    <td class="break-word col-company">${campaign.company_name}</td>
    <td class="break-word col-type">${campaign.campaign_type}</td>
    <td class="period-cell col-period">${campaign.periodo_formatado}</td>
    <td class="device-badges-cell col-devices">${targetNamesHtml}</td>
    <td class="actions-cell col-actions">
      <button class="action-icon action-icon-editar" data-id="${campaign.id}" title="Editar Campanha">
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
        </svg>
      </button>
      <button class="action-icon-excluir" data-id="${campaign.id}" title="Excluir Campanha">
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M6 6L18 18M6 18L18 6" stroke-linecap="round" stroke-linejoin="round"></path>
        </svg>
      </button>
    </td>
  `;
  return row;
};

export const addCampaignRow = (campaign) => {
  const container = document.querySelector(".container");
  if (!container) return;

  const emptyState = container.querySelector(".empty-state-container");
  if (emptyState) {
    emptyState.outerHTML = `
      <div class="device-table-wrapper">
        <table class="device-table">
          <thead>
            <tr>
              <th class="col-name">Nome</th>
              <th class="col-status">Status</th>
              <th class="col-company">Empresa</th>
              <th class="col-type">Tipo</th>
              <th class="col-period">Período</th>
              <th class="col-devices">Alvos</th>
              <th class="col-actions">Ações</th>
            </tr>
          </thead>
          <tbody id="campaigns-table-body"></tbody>
        </table>
      </div>
    `;
  }

  const tableBody = document.getElementById("campaigns-table-body");
  if (tableBody) {
    const newRow = createCampaignRow(campaign);
    tableBody.prepend(newRow);
  }
};

export const updateCampaignRow = (campaign) => {
  const row = document.querySelector(`tr[data-campaign-id="${campaign.id}"]`);
  if (!row) return;

  const newRow = createCampaignRow(campaign);
  row.innerHTML = newRow.innerHTML;
};

export const removeCampaignRow = (campaignId) => {
  const row = document.querySelector(`tr[data-campaign-id="${campaignId}"]`);
  if (row) {
    row.remove();
  }
  const tableBody = document.getElementById("campaigns-table-body");
  if (tableBody && tableBody.rows.length === 0) {
    const tableWrapper = document.querySelector(".device-table-wrapper");
    if (tableWrapper) {
      tableWrapper.outerHTML = `
      <div class="empty-state-container">
        <div class="empty-state-icon"><i class="bi bi-megaphone"></i></div>
        <h3 class="empty-state-title">Nenhuma Campanha Criada</h3>
        <p class="empty-state-subtitle">Ainda não há campanhas para exibir...</p>
      </div>`;
    }
  }
};