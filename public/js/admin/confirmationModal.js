import { notyf, handleFetchError } from "./utils.js";

export function setupConfirmationModal() {
  const confirmationModal = document.getElementById("confirmationModal");
  if (!confirmationModal) return;

  document.body.addEventListener("click", (e) => {
    const deleteButton = e.target.closest(".action-icon-excluir");
    if (!deleteButton) return;

    e.stopPropagation();
    const { id } = deleteButton.dataset;
    const pageId = document.body.id;
    let config = {};

    if (pageId === "campaigns-page") {
      config = {
        url: `/campaigns/${id}/delete`,
        msg: "Deseja realmente excluir esta campanha?",
      };
    } else if (pageId === "devices-page") {
      config = {
        url: `/devices/${id}/delete`,
        msg: "Deseja realmente excluir este dispositivo?",
      };
    } else if (pageId === "companies-page") {
      config = {
        url: `/companies/${id}/delete`,
        msg: "Excluir esta empresa removerá todos os dados associados. Confirma?",
      };
    } else if (pageId === "products-page") {
      config = {
        url: `/products/${id}/delete`,
        msg: "Deseja realmente excluir este produto da lista local?",
        reload: true,
      };
    } else return;

    confirmationModal.querySelector(".confirmation-modal-body p").textContent =
      config.msg;
    confirmationModal.style.display = "flex";

    const confirmBtn = document.getElementById("confirmDeletion");
    const newConfirmBtn = confirmBtn.cloneNode(true);
    confirmBtn.parentNode.replaceChild(newConfirmBtn, confirmBtn);

    newConfirmBtn.addEventListener(
      "click",
      async () => {
        try {
          const res = await fetch(config.url, { method: "POST" });
          const json = await res.json();
          if (!res.ok) {
            throw new Error(json.message || `Erro ${res.status}`);
          }
          notyf.success(json.message || "Item excluído com sucesso.");
          if (config.reload) {
            setTimeout(() => window.location.reload(), 1200);
          }
        } catch (err) {
          notyf.error(err.message || "Falha na comunicação.");
        } finally {
          confirmationModal.style.display = "none";
        }
      },
      { once: true }
    );
  });

  document
    .getElementById("cancelConfirmation")
    ?.addEventListener(
      "click",
      () => (confirmationModal.style.display = "none")
    );

  window.addEventListener("click", (e) => {
    if (e.target === confirmationModal) {
      confirmationModal.style.display = "none";
    }
  });
}
