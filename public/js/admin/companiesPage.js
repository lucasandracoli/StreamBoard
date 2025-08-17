import { showError } from "./notification.js";
import { setupTableSearch } from "./tableSearch.js";

function createCompanyRow(company) {
  const row = document.createElement("tr");
  row.dataset.companyId = company.id;
  row.innerHTML = `
    <td class="break-word">${company.name}</td>
    <td class="break-word">${company.formatted_cnpj}</td>
    <td class="break-word">${company.cep || "N/A"}</td>
    <td class="break-word">${company.city || "N/A"}</td>
    <td class="break-word">${company.state || "N/A"}</td>
    <td class="actions-cell">
      <button class="action-icon action-icon-editar" data-id="${
        company.id
      }" title="Editar Empresa">
        <i class="bi bi-pencil-square"></i>
      </button>
      <button class="action-icon-excluir" data-id="${
        company.id
      }" title="Excluir Empresa">
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M6 6L18 18M6 18L18 6" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
      </button>
    </td>
  `;
  return row;
}

export function addCompanyRow(company) {
  const container = document.querySelector(".container");
  const tableBody = document.getElementById("companies-table-body");
  if (!tableBody || !container) return;

  const emptyState = container.querySelector(".empty-state-container");
  if (emptyState) {
    refreshCompaniesTable();
    return;
  }

  const noCompaniesRow = document.getElementById("no-companies-row");
  if (noCompaniesRow) {
    noCompaniesRow.remove();
  }

  const newRow = createCompanyRow(company);
  tableBody.prepend(newRow);
}

export function updateCompanyRow(company) {
  const row = document.querySelector(`tr[data-company-id="${company.id}"]`);
  if (row) {
    const newRow = createCompanyRow(company);
    row.innerHTML = newRow.innerHTML;
  } else {
    addCompanyRow(company);
  }
}

export function removeCompanyRow(companyId) {
  const row = document.querySelector(`tr[data-company-id="${companyId}"]`);
  if (row) {
    row.remove();
  }

  const tableBody = document.getElementById("companies-table-body");
  if (tableBody && tableBody.rows.length === 0) {
    refreshCompaniesTable();
  }
}

export async function refreshCompaniesTable() {
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
      setupTableSearch("companies-search-input", "companies-table-body");
      document.dispatchEvent(new CustomEvent("page-content-refreshed"));
    }
  } catch (err) {
    showError(
      err.message || "Não foi possível atualizar a lista de empresas."
    );
  }
}