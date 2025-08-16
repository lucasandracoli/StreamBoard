import { notyf, handleFetchError } from "./utils.js";

let confirmationModal = null;
let config = {};

export const showConfirmationModal = ({
  title,
  message,
  confirmText,
  type,
  onConfirm,
}) => {
  if (!confirmationModal || !config.icon) {
    console.error("O Modal de Confirmação não foi inicializado corretamente.");
    return;
  }

  config.title.textContent = title;
  config.body.textContent = message;
  config.confirmBtn.textContent = confirmText;

  const iconContainer = config.icon.parentElement;
  iconContainer.className = "confirmation-modal-icon";
  config.confirmBtn.className = "confirmation-modal-confirm";

  if (type === "warning") {
    iconContainer.classList.add("warning");
    config.icon.className = "bi bi-exclamation-triangle-fill";
    config.confirmBtn.classList.add("warning");
  } else {
    iconContainer.classList.add("danger");
    config.icon.className = "bi bi-trash3-fill";
    config.confirmBtn.classList.add("danger");
  }

  const newConfirmBtn = config.confirmBtn.cloneNode(true);
  config.confirmBtn.parentNode.replaceChild(newConfirmBtn, config.confirmBtn);
  config.confirmBtn = newConfirmBtn;

  newConfirmBtn.addEventListener("click", onConfirm, { once: true });
  confirmationModal.style.display = "flex";
};

export function setupConfirmationModal() {
  confirmationModal = document.getElementById("confirmationModal");
  if (!confirmationModal) return;

  config = {
    icon: confirmationModal.querySelector(".confirmation-modal-icon i"),
    title: confirmationModal.querySelector(".confirmation-modal-header h3"),
    body: confirmationModal.querySelector(".confirmation-modal-body p"),
    confirmBtn: document.getElementById("confirmDeletion"),
    cancelBtn: document.getElementById("cancelConfirmation"),
  };

  const hideModal = () => {
    confirmationModal.style.display = "none";
  };

  config.cancelBtn?.addEventListener("click", hideModal);
}
