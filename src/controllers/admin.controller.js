const db = require("../../config/streamboard");
const reportService = require("../services/report.service");
const logger = require("../utils/logger");

const rootRedirect = (req, res) => {
  if (req.session.userId) {
    res.redirect("/dashboard");
  } else {
    res.redirect("/login");
  }
};

const renderDashboard = async (req, res) => {
  try {
    const { clients } = req.app.locals;
    const onlineDevicesCount = Object.keys(clients).length;

    const statsQueries = [
      db.query("SELECT COUNT(*) FROM devices"),
      db.query("SELECT COUNT(*) FROM devices WHERE is_active = false"),
      db.query("SELECT COUNT(*) FROM campaigns"),
      db.query(
        "SELECT COUNT(*) FROM campaigns WHERE NOW() BETWEEN start_date AND end_date"
      ),
      db.query("SELECT COUNT(*) FROM campaigns WHERE start_date > NOW()"),
      db.query("SELECT COUNT(*) FROM companies"),
      db.query("SELECT COUNT(*) FROM sectors"),
      db.query("SELECT COUNT(*) FROM users"),
    ];

    const results = await Promise.all(statsQueries);

    const totalDevices = parseInt(results[0].rows[0].count, 10);
    const revokedDevices = parseInt(results[1].rows[0].count, 10);

    const stats = {
      totalDevices: totalDevices,
      onlineDevices: onlineDevicesCount,
      offlineDevices: totalDevices - onlineDevicesCount - revokedDevices,
      revokedDevices: revokedDevices,
      totalCampaigns: parseInt(results[2].rows[0].count, 10),
      activeCampaigns: parseInt(results[3].rows[0].count, 10),
      scheduledCampaigns: parseInt(results[4].rows[0].count, 10),
      totalCompanies: parseInt(results[5].rows[0].count, 10),
      totalSectors: parseInt(results[6].rows[0].count, 10),
      totalUsers: parseInt(results[7].rows[0].count, 10),
    };

    res.render("dashboard", { user: req.user, stats });
  } catch (err) {
    logger.error("Erro ao carregar dados do dashboard.", err);
    res.status(500).send("Erro ao carregar dados do dashboard.");
  }
};

const broadcastRefresh = (req, res) => {
  const { wss } = req.app.locals;
  const message = JSON.stringify({ type: "FORCE_REFRESH" });
  wss.clients.forEach((ws) => {
    if (ws.isAlive) {
      ws.send(message);
    }
  });
  res
    .status(200)
    .json({ message: "Comando de atualização enviado a todos os players." });
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
  rootRedirect,
  renderDashboard,
  broadcastRefresh,
  getReportData,
};