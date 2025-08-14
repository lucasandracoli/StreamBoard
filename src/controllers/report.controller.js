const reportService = require("../services/report.service");
const logger = require("../utils/logger");

const renderReportsPage = async (req, res) => {
  try {
    const stats = await reportService.getDashboardStats();
    res.render("reports", { stats });
  } catch (err) {
    logger.error("Erro ao carregar a página de relatórios.", err);
    res.status(500).send("Erro ao carregar a página.");
  }
};

const getReportData = async (req, res) => {
  try {
    const [topMedia, topCampaigns, playsOverTime] = await Promise.all([
      reportService.getTopPlayedMedia(),
      reportService.getPlaysByCampaign(),
      reportService.getPlaysOverTime(),
    ]);

    res.json({
      topMedia,
      topCampaigns,
      playsOverTime,
    });
  } catch (err) {
    logger.error("Erro ao buscar dados para os gráficos de relatório.", err);
    res.status(500).json({ message: "Erro ao buscar dados do relatório." });
  }
};

module.exports = {
  renderReportsPage,
  getReportData,
};