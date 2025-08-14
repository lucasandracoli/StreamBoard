const db = require("../../config/streamboard");

const createPlayLog = async (deviceId, campaignId, uploadId) => {
  const query = `
    INSERT INTO play_logs (device_id, campaign_id, upload_id)
    VALUES ($1, $2, $3)
  `;
  await db.query(query, [deviceId, campaignId, uploadId]);
};

module.exports = {
  createPlayLog,
};