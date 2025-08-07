const { DateTime } = require("luxon");

const formatarPeriodo = (dataInicio, dataFim) => {
  const inicio = DateTime.fromJSDate(new Date(dataInicio));
  const fim = DateTime.fromJSDate(new Date(dataFim));

  if (inicio.hasSame(fim, "day")) {
    return `${inicio.toFormat("dd/MM")}: ${inicio.toFormat(
      "HH:mm"
    )} - ${fim.toFormat("HH:mm")}`;
  } else {
    return `${inicio.toFormat("dd/MM HH:mm")} - ${fim.toFormat("dd/MM HH:mm")}`;
  }
};

const formatarCNPJ = (cnpj) => {
  if (!cnpj) return "";
  const cnpjLimpo = cnpj.replace(/\D/g, "");
  if (cnpjLimpo.length !== 14) return cnpj;
  return cnpjLimpo.replace(
    /(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/,
    "$1.$2.$3/$4-$5"
  );
};

module.exports = {
  formatarPeriodo,
  formatarCNPJ,
};
