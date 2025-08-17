import { showError } from "./notification.js";
import { setupTableSearch } from "./tableSearch.js";

function createProductRow(product) {
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
}

export function addProductRow(product) {
  const container = document.querySelector(".container");
  const tableBody = document.querySelector(
    "#products-page .device-table tbody"
  );
  if (!tableBody || !container) return;

  const emptyState = container.querySelector(".empty-state-container");
  if (emptyState) {
    refreshProductTable();
    return;
  }

  const noProductsRow = document.getElementById("no-products-row");
  if (noProductsRow) {
    noProductsRow.remove();
  }

  const newRow = createProductRow(product);
  tableBody.prepend(newRow);
}

export function updateProductRow(product) {
  const row = document.querySelector(`tr[data-product-id="${product.id}"]`);
  if (row) {
    const newRow = createProductRow(product);
    row.innerHTML = newRow.innerHTML;
  }
}

export function removeProductRow(productId) {
  const row = document.querySelector(`tr[data-product-id="${productId}"]`);
  if (row) {
    row.remove();
  }
  const tableBody = document.querySelector(
    "#products-page .device-table tbody"
  );
  if (tableBody && tableBody.rows.length === 0) {
    refreshProductTable();
  }
}

export function resetSyncButton() {
  const syncCompanyBtn = document.getElementById("syncCompanyProductsBtn");
  if (syncCompanyBtn) {
    syncCompanyBtn.disabled = false;
    syncCompanyBtn.querySelector("span").textContent = "Sincronizar Preços";
    syncCompanyBtn.querySelector("i").classList.remove("spinning");
  }
}

export async function refreshProductTable() {
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
    resetSyncButton();
  } catch (err) {
    showError(err.message || "Não foi possível atualizar a lista de produtos.");
  }
}

export function setupProductsPage() {}
