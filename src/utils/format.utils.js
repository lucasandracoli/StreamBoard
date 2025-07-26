const formatarPeriodo = (dataInicio, dataFim) => {
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);

  const inicio = new Date(dataInicio);
  const fim = new Date(dataFim);

  const mesmoDia = inicio.toDateString() === fim.toDateString();

  const opcoesHora = { hour: "2-digit", minute: "2-digit", hour12: false };
  const horaInicio = inicio.toLocaleTimeString("pt-BR", opcoesHora);
  const horaFim = fim.toLocaleTimeString("pt-BR", opcoesHora);

  if (mesmoDia) {
    const inicioNormalizado = new Date(inicio);
    inicioNormalizado.setHours(0, 0, 0, 0);

    let diaExibido;
    if (inicioNormalizado.getTime() === hoje.getTime()) {
      diaExibido = "Hoje";
    } else {
      const opcoesData = { day: "2-digit", month: "2-digit" };
      diaExibido = inicio.toLocaleDateString("pt-BR", opcoesData);
    }
    return `${diaExibido}, das ${horaInicio} às ${horaFim}`;
  } else {
    const opcoesDataCurta = { day: "2-digit", month: "2-digit" };
    const dataInicioExibida = inicio.toLocaleDateString(
      "pt-BR",
      opcoesDataCurta
    );
    const dataFimExibida = fim.toLocaleDateString("pt-BR", opcoesDataCurta);

    return `De ${dataInicioExibida} ${horaInicio} até ${dataFimExibida} ${horaFim}`;
  }
};

module.exports = {
  formatarPeriodo,
};