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
          success: "Campanha excluída.",
          rowSelector: `tr[data-campaign-id="${id}"]`,
        };
      } else if (pageId === "devices-page") {
        config = {
          url: `/devices/${id}/delete`,
          msg: "Deseja realmente excluir este dispositivo?",
          success: "Dispositivo excluído.",
          rowSelector: `tr[data-device-id="${id}"]`,
        };
      } else if (pageId === "companies-page") {
        config = {
          url: `/companies/${id}/delete`,
          msg: "Excluir esta empresa removerá todos os dados associados. Confirma?",
          success: "Empresa excluída.",
          rowSelector: `tr[data-company-id="${id}"]`,
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
            if (!res.ok)
              throw new Error(
                (await res.json()).message || `Erro ${res.status}`
              );
            notyf.success(config.success);
            const row = document.querySelector(config.rowSelector);
            if (row) {
              row.remove();
            } else {
              setTimeout(() => location.reload(), 1200);
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
