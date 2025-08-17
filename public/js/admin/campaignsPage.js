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

  let layoutName = "Tela Cheia";
  if (campaign.layout_type === "split-80-20") {
    layoutName = "Split 80/20";
  } else if (campaign.layout_type === "split-80-20-weather") {
    layoutName = "Split c/ Clima";
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
    <td class="col-layout">
      <span class="cell-tag tag-layout">${layoutName}</span>
    </td>
    <td class="col-media-count">
      <span class="cell-tag tag-media">${campaign.uploads_count}</span>
    </td>
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

export async function refreshCampaignsTable() {
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
    }
  } catch (err) {
    notyf.error(
      err.message || "Não foi possível atualizar a lista de campanhas."
    );
  }
}
