import { showSuccess, showError } from "./notification.js";

let isModalInitialized = false;

export function setupProductModal() {
  const pageBody = document.getElementById("products-page");
  if (!pageBody) return;

  const openModalBtn = document.getElementById("openAddProductModalBtn");
  const syncCompanyBtn = document.getElementById("syncCompanyProductsBtn");
  const modal = document.getElementById("addProductModal");
  if (!modal) return;

  const companyId =
    syncCompanyBtn?.dataset.companyId ||
    window.location.pathname.split("/").pop();

  openModalBtn?.addEventListener("click", () => {
    modal.style.display = "flex";
    const productCodeInput = document.getElementById("productCode");
    if (productCodeInput) {
      setTimeout(() => productCodeInput.focus(), 100);
    }
  });

  syncCompanyBtn?.addEventListener("click", async () => {
    const originalText = syncCompanyBtn.querySelector("span").textContent;
    const icon = syncCompanyBtn.querySelector("i");

    syncCompanyBtn.disabled = true;
    syncCompanyBtn.querySelector("span").textContent = "Sincronizando...";
    icon.classList.add("spinning");

    try {
      const res = await fetch(`/products/sync/${companyId}`, {
        method: "POST",
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message);
    } catch (error) {
      syncCompanyBtn.disabled = false;
      syncCompanyBtn.querySelector("span").textContent = originalText;
      icon.classList.remove("spinning");
      showError(error.message || "Falha ao iniciar sincronização.");
    }
  });

  if (isModalInitialized) return;

  const cancelBtns = modal.querySelectorAll(".device-button-cancel");
  const tabs = modal.querySelectorAll(".tab-button");
  const tabContents = modal.querySelectorAll(".tab-content");

  const singleProductForm = document.getElementById("addSingleProductForm");
  const productCodeInput = document.getElementById("productCode");
  const previewContainer = document.getElementById("product-preview-container");
  const addSingleProductBtn = document.getElementById("addSingleProductBtn");

  const uploadForm = document.getElementById("uploadProductsForm");
  const fileInput = document.getElementById("productsSheet");
  const uploadArea = uploadForm.querySelector(".file-upload-area");
  const uploadSubmitBtn = uploadForm.querySelector('button[type="submit"]');
  const removeFileBtn = uploadForm.querySelector(".file-remove-btn");
  const fileNameSpan = uploadForm.querySelector(".file-name");

  let isSubmitting = false;

  const resetSingleProductForm = () => {
    if (singleProductForm) singleProductForm.reset();
    if (previewContainer) previewContainer.innerHTML = "";
    if (addSingleProductBtn) {
      addSingleProductBtn.textContent = "Buscar Item";
      addSingleProductBtn.dataset.action = "preview";
    }
    if (productCodeInput) productCodeInput.focus();
  };

  const resetUploadForm = () => {
    if (uploadForm) uploadForm.reset();
    if (uploadArea) uploadArea.classList.remove("has-file");
    if (uploadSubmitBtn) uploadSubmitBtn.disabled = true;
  };

  const handleFile = (file) => {
    if (
      file &&
      file.type ===
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    ) {
      if (fileNameSpan) fileNameSpan.textContent = file.name;
      if (uploadArea) uploadArea.classList.add("has-file");
      if (uploadSubmitBtn) uploadSubmitBtn.disabled = false;
    } else {
      showError("Por favor, selecione um arquivo Excel (.xlsx).");
      resetUploadForm();
    }
  };

  cancelBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      modal.style.display = "none";
    });
  });

  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      tabs.forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");
      tabContents.forEach((content) => content.classList.remove("active"));
      const activeContent = document.getElementById(
        `${tab.dataset.tab}-tab-content`
      );
      if (activeContent) activeContent.classList.add("active");
      resetSingleProductForm();
      resetUploadForm();
    });
  });

  productCodeInput?.addEventListener("input", () => {
    if (
      addSingleProductBtn &&
      addSingleProductBtn.dataset.action === "confirm"
    ) {
      if (previewContainer) previewContainer.innerHTML = "";
      addSingleProductBtn.textContent = "Buscar Item";
      addSingleProductBtn.dataset.action = "preview";
    }
  });

  singleProductForm?.addEventListener("submit", async function (e) {
    e.preventDefault();
    if (isSubmitting || !addSingleProductBtn) return;

    const action = addSingleProductBtn.dataset.action || "preview";

    isSubmitting = true;
    addSingleProductBtn.disabled = true;
    addSingleProductBtn.innerHTML = `<div class="spinner" style="width: 20px; height: 20px; border-width: 2px; margin: 0 auto;"></div>`;

    if (action === "preview") {
      const productCode = productCodeInput.value;
      try {
        const res = await fetch(
          `/products/preview/${companyId}/${productCode}`
        );
        const product = await res.json();
        if (!res.ok) throw new Error(product.message);

        if (previewContainer) {
          previewContainer.innerHTML = `
            <div class="preview-card">
                <span class="preview-name">${product.dsc}</span>
                <span class="preview-price">${Number(
                  product.pv2
                ).toLocaleString("pt-BR", {
                  style: "currency",
                  currency: "BRL",
                })}</span>
            </div>
          `;
        }
        addSingleProductBtn.textContent = "Confirmar e Adicionar";
        addSingleProductBtn.dataset.action = "confirm";
      } catch (err) {
        showError(err.message || "Falha ao buscar item.");
        resetSingleProductForm();
      } finally {
        addSingleProductBtn.disabled = false;
        isSubmitting = false;
      }
    } else if (action === "confirm") {
      try {
        const res = await fetch(`/products/add-single/${companyId}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ productCode: productCodeInput.value }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.message);
        resetSingleProductForm();
      } catch (err) {
        showError(err.message || "Falha na comunicação.");
        addSingleProductBtn.textContent = "Confirmar e Adicionar";
      } finally {
        addSingleProductBtn.disabled = false;
        isSubmitting = false;
      }
    }
  });

  if (fileInput) {
    fileInput.addEventListener("change", () => handleFile(fileInput.files[0]));
  }
  if (uploadArea) {
    ["dragover", "dragenter"].forEach((eventName) => {
      uploadArea.addEventListener(eventName, (e) => {
        e.preventDefault();
        uploadArea.classList.add("is-dragging");
      });
    });
    ["dragleave", "drop"].forEach((eventName) => {
      uploadArea.addEventListener(eventName, (e) => {
        e.preventDefault();
        uploadArea.classList.remove("is-dragging");
      });
    });
    uploadArea.addEventListener("drop", (e) => {
      const file = e.dataTransfer.files[0];
      if (fileInput) fileInput.files = e.dataTransfer.files;
      handleFile(file);
    });
  }

  removeFileBtn?.addEventListener("click", resetUploadForm);

  uploadForm?.addEventListener("submit", async function (e) {
    e.preventDefault();
    if (uploadSubmitBtn) {
      uploadSubmitBtn.disabled = true;
      uploadSubmitBtn.innerHTML = `<div class="spinner" style="width: 20px; height: 20px; border-width: 2px; margin: 0 auto;"></div>`;
    }

    try {
      const res = await fetch(`/products/upload/${companyId}`, {
        method: "POST",
        body: new FormData(this),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message);
      modal.style.display = "none";
    } catch (err) {
      if (uploadSubmitBtn) {
        uploadSubmitBtn.disabled = false;
        uploadSubmitBtn.innerHTML = "Enviar Planilha";
      }
    }
  });

  isModalInitialized = true;
}
