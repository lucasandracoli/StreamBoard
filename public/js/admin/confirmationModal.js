let confirmationModal = null;
let config = {};

export const showConfirmationModal = ({
  title,
  message,
  type,
  actions,
  confirmText,
  onConfirm,
  isExpanded = false,
}) => {
  if (!confirmationModal || !config.icon) {
    console.error("O Modal de Confirmação não foi inicializado corretamente.");
    return;
  }

  confirmationModal.classList.toggle("modal-expandido", isExpanded);

  config.title.textContent = title;
  config.body.innerHTML = message;
  const iconContainer = config.icon.parentElement;
  iconContainer.className = "confirmation-modal-icon";

  if (type === "warning") {
    iconContainer.classList.add("warning");
    config.icon.className = "bi bi-exclamation-triangle-fill";
  } else {
    iconContainer.classList.add("danger");
    config.icon.className = "bi bi-trash3-fill";
  }

  config.actionsContainer.innerHTML = "";

  const hideModal = () => {
    confirmationModal.style.display = "none";
    confirmationModal.classList.remove("modal-expandido");
  };

  const cancelBtn = document.createElement("button");
  cancelBtn.id = "cancelConfirmation";
  cancelBtn.className = "confirmation-modal-cancel";
  cancelBtn.textContent = "Cancelar";
  cancelBtn.addEventListener("click", hideModal);

  if (actions && actions.length > 0) {
    actions.forEach((action) => {
      const btn = document.createElement("button");
      btn.innerHTML = action.text;
      btn.className = action.class;
      btn.addEventListener(
        "click",
        () => {
          hideModal();
          action.onClick();
        },
        { once: true }
      );
      config.actionsContainer.appendChild(btn);
    });
    config.actionsContainer.appendChild(cancelBtn);
  } else {
    const confirmBtn = document.createElement("button");
    confirmBtn.id = "confirmDeletion";
    confirmBtn.className = "confirmation-modal-confirm";
    if (type === "warning") {
      confirmBtn.classList.add("warning");
    } else {
      confirmBtn.classList.add("danger");
    }
    confirmBtn.textContent = confirmText;
    confirmBtn.addEventListener(
      "click",
      () => {
        hideModal();
        onConfirm();
      },
      { once: true }
    );
    config.actionsContainer.appendChild(cancelBtn);
    config.actionsContainer.appendChild(confirmBtn);
  }

  confirmationModal.style.display = "flex";
};

export function setupConfirmationModal() {
  confirmationModal = document.getElementById("confirmationModal");
  if (!confirmationModal) return;

  config = {
    icon: confirmationModal.querySelector(".confirmation-modal-icon i"),
    title: confirmationModal.querySelector(".confirmation-modal-header h3"),
    body: confirmationModal.querySelector(".confirmation-modal-body p"),
    actionsContainer: confirmationModal.querySelector(
      ".confirmation-modal-actions"
    ),
  };
}