import { notyf, handleFetchError } from "./utils.js";

export function setupConfirmationModal() {
  const confirmationModal = document.getElementById("confirmationModal");
  if (!confirmationModal) return;

  document.querySelectorAll(".action-icon-excluir").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const { id } = e.currentTarget.dataset;
      const pageId = document.body.id;
      const row = e.currentTarget.closest("tr");
      let config = {};

      if (pageId === "campaigns-page") {
        config = {
          url: `/campaigns/${id}/delete`,
          msg: "Deseja realmente excluir esta campanha?",
          reload: true,
        };
      } else if (pageId === "devices-page") {
        config = {
          url: `/devices/${id}/delete`,
          msg: "Deseja realmente excluir este dispositivo?",
          targetRow: row
        };
      } else if (pageId === "companies-page") {
        config = {
          url: `/companies/${id}/delete`,
          msg: "Excluir esta empresa removerá todos os dados associados. Confirma?",
          targetRow: row
        };
      } else if (pageId === "products-page") {
        config = {
          url: `/products/${id}/delete`,
          msg: "Deseja realmente excluir este produto da lista local?",
          reload: true
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
            const json = await res.json();
            if (!res.ok) {
              throw new Error(json.message || `Erro ${res.status}`);
            }
            
            if (pageId !== 'products-page') {
                notyf.success(json.message);
            }
            
            if (config.targetRow) {
                 config.targetRow.remove();
            }
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
  });

  document
    .getElementById("cancelConfirmation")
    ?.addEventListener(
      "click",
      () => (confirmationModal.style.display = "none")
    );
}