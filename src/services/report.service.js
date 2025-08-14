const db = require("../../config/streamboard");
const logger = require("../utils/logger");

const getDashboardStats = async () => {
  const query = `
    SELECT
      (SELECT COUNT(*) FROM devices WHERE is_active = true) as active_devices,
      (SELECT COUNT(*) FROM campaigns WHERE NOW() BETWEEN start_date AND end_date) as active_campaigns,
      (SELECT COUNT(*) FROM play_logs WHERE played_at >= NOW() - INTERVAL '24 hours') as plays_last_24h,
      (SELECT COUNT(*) FROM play_logs) as total_plays;
  `;
  try {
    const result = await db.query(query);
    if (result.rows.length > 0) {
      return result.rows[0];
    }
  } catch (err) {
    logger.error(
      { err },
      "Erro ao executar a consulta de estatísticas do dashboard."
    );
  }
  return {
    active_devices: 0,
    active_campaigns: 0,
    plays_last_24h: 0,
    total_plays: 0,
  };
};

const getTopPlayedMedia = async (limit = 5) => {
  const query = `
    SELECT
      cu.file_name,
      c.name as campaign_name,
      COUNT(pl.id) as play_count
    FROM play_logs pl
    JOIN campaign_uploads cu ON pl.upload_id = cu.id
    JOIN campaigns c ON pl.campaign_id = c.id
    GROUP BY cu.file_name, c.name
    ORDER BY play_count DESC
    LIMIT $1;
  `;
  const result = await db.query(query, [limit]);
  return result.rows;
};

const getPlaysByCampaign = async (limit = 5) => {
  const query = `
    SELECT
      c.name as campaign_name,
      COUNT(pl.id) as play_count
    FROM play_logs pl
    JOIN campaigns c ON pl.campaign_id = c.id
    GROUP BY c.name
    ORDER BY play_count DESC
    LIMIT $1;
  `;
  const result = await db.query(query, [limit]);
  return result.rows;
};

const getPlaysOverTime = async (days = 7) => {
  const query = `
    SELECT
      DATE(played_at AT TIME ZONE 'America/Sao_Paulo') as play_date,
      COUNT(id) as play_count
    FROM play_logs
    WHERE played_at >= NOW() - INTERVAL '${days} days'
    GROUP BY play_date
    ORDER BY play_date ASC;
  `;
  const result = await db.query(query);
  return result.rows;
};

module.exports = {
  getDashboardStats,
  getTopPlayedMedia,
  getPlaysByCampaign,
  getPlaysOverTime,
};
