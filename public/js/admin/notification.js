const notyf = new Notyf({
  duration: 3000,
  position: { x: "right", y: "top" },
  dismissible: true,
});

export const showSuccess = (message) => {
  notyf.success(message);
};

export const showError = (message) => {
  notyf.error(message);
};