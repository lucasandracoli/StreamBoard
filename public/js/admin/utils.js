export const notyf = new Notyf({
  duration: 3000,
  position: { x: "right", y: "top" },
  dismissible: true,
});

export const deviceTypeNames = {
  midia_indoor: "Mídia Indoor",
  terminal_consulta: "Terminal de Consulta",
  digital_menu: "Menu Digital",
  default: "Tipo Desconhecido",
};

export const handleFetchError = async (response) => {
  try {
    const errorJson = await response.json();
    return errorJson.message || `Erro ${response.status}`;
  } catch (e) {
    return `Erro ${response.status}: A resposta do servidor não é um JSON válido.`;
  }
};
