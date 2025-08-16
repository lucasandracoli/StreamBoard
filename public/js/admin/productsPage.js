import { notyf } from "./utils.js";

const createProductRow = (product) => {
  const row = document.createElement("tr");
  row.dataset.productId = product.id;

  const price = Number(product.price).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
  const lastUpdated = new Date(product.last_updated).toLocaleString("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  });

  row.innerHTML = `
        <td data-label="Item">${product.product_name}</td>
        <td data-label="Preço" class="price-cell">${price}</td>
        <td data-label="Categoria">${product.section_name}</td>
        <td data-label="Atualização">${lastUpdated}</td>
        <td class="actions-cell">
            <button class="action-icon-excluir" data-id="${product.id}" title="Excluir Item">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M6 6L18 18M6 18L18 6" stroke-linecap="round" stroke-linejoin="round"></path>
                </svg>
            </button>
        </td>
    `;
  return row;
};

export const addProductRow = (product) => {
  const tableBody = document.querySelector(
    "#products-page .device-table tbody"
  );
  if (!tableBody) return;

  const noProductsRow = document.getElementById("no-products-row");
  if (noProductsRow) {
    noProductsRow.remove();
  }

  const newRow = createProductRow(product);
  tableBody.prepend(newRow);
};

export const updateProductRow = (product) => {
  const row = document.querySelector(`tr[data-product-id="${product.id}"]`);
  if (row) {
    const newRow = createProductRow(product);
    row.innerHTML = newRow.innerHTML;
  }
};

export const removeProductRow = (productId) => {
  const row = document.querySelector(`tr[data-product-id="${productId}"]`);
  if (row) {
    row.remove();
  }
  const tableBody = document.querySelector(
    "#products-page .device-table tbody"
  );
  if (tableBody && tableBody.rows.length === 0) {
    tableBody.innerHTML = `
            <tr id="no-products-row">
                <td colspan="5" style="text-align: center">Nenhum item encontrado.</td>
            </tr>
        `;
  }
};

export function resetSyncButton() {
  const syncCompanyBtn = document.getElementById("syncCompanyProductsBtn");
  if (syncCompanyBtn) {
    syncCompanyBtn.disabled = false;
    syncCompanyBtn.querySelector("span").textContent = "Sincronizar Preços";
    syncCompanyBtn.querySelector("i").classList.remove("spinning");
  }
}

export async function refreshProductTable() {
  const companyId = window.location.pathname.split("/").pop();
  try {
    const response = await fetch(window.location.href);
    if (!response.ok) throw new Error("Falha ao buscar dados atualizados.");

    const html = await response.text();
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, "text/html");

    const newTableBody = doc.querySelector(".products-table tbody");
    const oldTableBody = document.querySelector(".products-table tbody");
    const newPagination = doc.querySelector(".pagination-container");
    const oldPagination = document.querySelector(".pagination-container");
    const mainContainer = document.querySelector("main.container");

    if (newTableBody && oldTableBody) {
      oldTableBody.innerHTML = newTableBody.innerHTML;
    }

    if (oldPagination) {
      oldPagination.remove();
    }
    if (newPagination && mainContainer) {
      mainContainer.appendChild(newPagination);
    }
  } catch (err) {
    notyf.error(err.message);
  } finally {
    resetSyncButton();
  }
}

export function setupProductsPage() {}
