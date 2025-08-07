const { DateTime } = require("luxon");
const db = require("../../config/streamboard");
const logger = require("../utils/logger");

const scheduledJobs = new Map();
let broadcastFunction;

const scheduleJob = (campaignId, date, status) => {
  const now = DateTime.now();
  const jobDate = DateTime.fromJSDate(date);
  const delay = jobDate.diff(now).toMillis();

  if (delay <= 0) {
    return;
  }

  const jobKey = `${campaignId}-${status.text}`;
  const timeoutId = setTimeout(() => {
    if (broadcastFunction) {
      broadcastFunction({
        type: "CAMPAIGN_STATUS_UPDATE",
        payload: { campaignId: campaignId, status },
      });
    }
    scheduledJobs.delete(jobKey);
  }, delay);

  scheduledJobs.set(jobKey, timeoutId);
};

const scheduleCampaignStatusUpdates = (campaign) => {
  if (!campaign || !campaign.id) return;
  const { id, start_date, end_date } = campaign;
  const now = DateTime.now();

  if (DateTime.fromJSDate(start_date) > now) {
    scheduleJob(id, start_date, { text: "Ativa", class: "online" });
  }

  if (DateTime.fromJSDate(end_date) > now) {
    scheduleJob(id, end_date, { text: "Finalizada", class: "offline" });
  }
};

const cancelCampaignStatusUpdates = (campaignId) => {
  const startJobKey = `${campaignId}-Ativa`;
  const endJobKey = `${campaignId}-Finalizada`;

  if (scheduledJobs.has(startJobKey)) {
    clearTimeout(scheduledJobs.get(startJobKey));
    scheduledJobs.delete(startJobKey);
  }
  if (scheduledJobs.has(endJobKey)) {
    clearTimeout(scheduledJobs.get(endJobKey));
    scheduledJobs.delete(endJobKey);
  }
};

const initializeScheduler = async (broadcastToAdmins) => {
  broadcastFunction = broadcastToAdmins;
  logger.info("Scheduler inicializado. Agendando status de campanhas...");
  try {
    const result = await db.query(
      "SELECT id, start_date, end_date FROM campaigns WHERE end_date > NOW()"
    );
    for (const campaign of result.rows) {
      scheduleCampaignStatusUpdates(campaign);
    }
    logger.info(
      `${result.rows.length} campanhas tiveram seus status agendados.`
    );
  } catch (error) {
    logger.error("Erro ao inicializar o agendador de campanhas.", error);
  }
};

module.exports = {
  initializeScheduler,
  scheduleCampaignStatusUpdates,
  cancelCampaignStatusUpdates,
};