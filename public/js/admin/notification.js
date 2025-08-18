let notyfInstance = null;

function getNotyfInstance() {
  if (!notyfInstance) {
    notyfInstance = new Notyf({
      duration: 3000,
      position: { x: "right", y: "top" },
      dismissible: true,
    });
  }
  return notyfInstance;
}

export const showSuccess = (message) => {
  getNotyfInstance().success(message);
};

export const showError = (message) => {
  getNotyfInstance().error(message);
};
