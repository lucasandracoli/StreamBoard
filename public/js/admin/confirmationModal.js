import { notyf, handleFetchError } from "./utils.js";

export function setupConfirmationModal() {
  const confirmationModal = document.getElementById("confirmationModal");
  if (!confirmationModal) return;

  document.querySelectorAll(".action-icon-excluir").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const { id } = e.currentTarget.dataset;
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
        };
      } else return;

      confirmationModal.querySelector(
        ".confirmation-modal-body p"
      ).textContent = config.msg;
      confirmationModal.style.display = "flex";

      const confirmBtn = document.getElementById("confirmDeletion");
      const newConfirmBtn = confirmBtn.cloneNode(true);
      confirmBtn.parentNode.replaceChild(newConfirmBtn, confirmBtn);

      newConfirmBtn.addEventListener(
        "click",
        async () => {
          try {
            const res = await fetch(config.url, { method: "POST" });
            if (!res.ok) {
              const error = await res.json();
              throw new Error(error.message || `Erro ${res.status}`);
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
  });

  document
    .getElementById("cancelConfirmation")
    ?.addEventListener(
      "click",
      () => (confirmationModal.style.display = "none")
    );
}
