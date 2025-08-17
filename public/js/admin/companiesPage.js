const createCompanyRow = (company) => {
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
};

export const addCompanyRow = (company) => {
  const tableBody = document.getElementById("companies-table-body");
  if (!tableBody) return;

  const noCompaniesRow = document.getElementById("no-companies-row");
  if (noCompaniesRow) {
    noCompaniesRow.remove();
  }

  const newRow = createCompanyRow(company);
  tableBody.prepend(newRow);
};

export const updateCompanyRow = (company) => {
  const row = document.querySelector(`tr[data-company-id="${company.id}"]`);
  if (!row) return;

  const newRow = createCompanyRow(company);
  row.innerHTML = newRow.innerHTML;
};

export const removeCompanyRow = (companyId) => {
  const row = document.querySelector(`tr[data-company-id="${companyId}"]`);
  if (row) {
    row.remove();
  }
  const tableBody = document.getElementById("companies-table-body");
  if (tableBody && tableBody.rows.length === 0) {
    tableBody.innerHTML = `
      <tr id="no-companies-row">
        <td colspan="6" style="text-align: center">Nenhuma empresa cadastrada.</td>
      </tr>
    `;
  }
};

export async function refreshCompaniesTable() {
  try {
    const response = await fetch(window.location.href);
    if (!response.ok) throw new Error("Falha ao buscar dados atualizados.");

    const html = await response.text();
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, "text/html");

    const newTable = doc.querySelector(".device-table-wrapper");
    const oldTable = document.querySelector(".device-table-wrapper");
    const newPagination = doc.querySelector(".pagination-container");
    const oldPagination = document.querySelector(".pagination-container");

    if (newTable && oldTable) {
      oldTable.innerHTML = newTable.innerHTML;
    }

    if (oldPagination) {
      oldPagination.remove();
    }
    if (newPagination && oldTable) {
      oldTable.insertAdjacentElement("afterend", newPagination);
    }
  } catch (err) {
    notyf.error(err.message || "Não foi possível atualizar a lista de empresas.");
  }
}