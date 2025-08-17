const db = require("../../config/streamboard");
const weatherService = require("./weather.service");
const butcherService = require("./butcher.service");
const logger = require("../utils/logger");
const crypto = require("crypto");

const getFullDeviceList = async () => {
  const query = `
    SELECT
      d.id, d.name, d.device_type, d.is_active, d.last_seen,
      c.name as company_name,
      s.name as sector_name,
      (SELECT COUNT(*) FROM tokens t WHERE t.device_id = d.id AND t.is_revoked = false) > 0 as has_tokens
    FROM devices d
    LEFT JOIN companies c ON d.company_id = c.id
    LEFT JOIN sectors s ON d.sector_id = s.id
    ORDER BY d.registered_at DESC`;
  const result = await db.query(query);
  return result.rows;
};

const getDeviceById = async (id) => {
  const result = await db.query(
    "SELECT id, name, device_type, company_id, sector_id, is_active FROM devices WHERE id = $1",
    [id]
  );
  return result.rows[0];
};

const createDevice = async (name, device_type, company_id, sector_id) => {
  const query = `
    INSERT INTO devices (name, device_type, company_id, sector_id, is_active)
    VALUES ($1, $2, $3, $4, TRUE) RETURNING id`;
  const result = await db.query(query, [
    name,
    device_type,
    company_id,
    sector_id,
  ]);
  return result.rows[0];
};

const updateDevice = async (id, data) => {
  const { name, device_type, company_id, sector_id } = data;
  const query = `
        UPDATE devices
        SET name = $1, device_type = $2, company_id = $3, sector_id = $4
        WHERE id = $5`;
  await db.query(query, [name, device_type, company_id, sector_id, id]);
};

const deleteDevice = async (id) => {
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    await client.query("DELETE FROM campaign_device WHERE device_id = $1", [
      id,
    ]);
    await client.query("DELETE FROM tokens WHERE device_id = $1", [id]);
    await client.query("DELETE FROM devices WHERE id = $1", [id]);
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
};

const createOtpForDevice = async (id, otpHash, expiresAt) => {
  const query =
    "INSERT INTO otp_pairing (device_id, otp_hash, expires_at) VALUES ($1, $2, $3)";
  await db.query(query, [id, otpHash, expiresAt]);
};

const createMagicLinkForDevice = async (id, tokenHash, expiresAt) => {
  const query =
    "INSERT INTO magic_links (device_id, token_hash, expires_at) VALUES ($1, $2, $3)";
  await db.query(query, [id, tokenHash, expiresAt]);
};

const revokeDeviceAccess = async (id) => {
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      "UPDATE tokens SET is_revoked = TRUE WHERE device_id = $1",
      [id]
    );
    await client.query("UPDATE devices SET is_active = FALSE WHERE id = $1", [
      id,
    ]);
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
};

const reactivateDevice = async (id) => {
  const result = await db.query(
    "UPDATE devices SET is_active = TRUE WHERE id = $1",
    [id]
  );
  return result.rowCount;
};

const getDeviceDetails = async (id) => {
  const query = `
        SELECT
            d.id, d.name, d.device_type, d.company_id, d.sector_id,
            d.is_active, d.last_seen, d.registered_at,
            c.name as company_name,
            s.name as sector_name,
            (SELECT COUNT(*) FROM tokens t WHERE t.device_id = d.id AND t.is_revoked = false) > 0 as has_tokens
        FROM devices d
            LEFT JOIN companies c ON d.company_id = c.id
            LEFT JOIN sectors s ON d.sector_id = s.id
        WHERE d.id = $1`;
  const deviceResult = await db.query(query, [id]);
  if (deviceResult.rows.length === 0) return null;

  const device = deviceResult.rows[0];

  const campaignsQuery = `
        SELECT DISTINCT c.name FROM campaigns c
        LEFT JOIN campaign_device cd ON c.id = cd.campaign_id
        LEFT JOIN campaign_sector cs ON c.id = cs.campaign_id
        WHERE
            c.company_id = $1
            AND NOW() BETWEEN c.start_date AND c.end_date
            AND (
                (NOT EXISTS (SELECT 1 FROM campaign_device cd_inner WHERE cd_inner.campaign_id = c.id) AND
                 NOT EXISTS (SELECT 1 FROM campaign_sector cs_inner WHERE cs_inner.campaign_id = c.id))
                OR
                cd.device_id = $2
                OR
                cs.sector_id = $3
            )`;

  const campaignsResult = await db.query(campaignsQuery, [
    device.company_id,
    id,
    device.sector_id,
  ]);

  device.active_campaigns = campaignsResult.rows.map((c) => c.name);
  return device;
};

const getDevicePlaylist = async (deviceId, companyId, sectorId, deviceType) => {
  const campaignQuery = `
      SELECT
          c.id,
          c.layout_type,
          comp.city,
          comp.state,
          comp.cep,
          (SELECT COUNT(*) FROM play_logs pl WHERE pl.campaign_id = c.id AND pl.played_at >= NOW() - INTERVAL '24 hours') as plays_last_24h
      FROM campaigns c
      JOIN companies comp ON c.company_id = comp.id
      WHERE
          c.company_id = $2
          AND c.start_date <= NOW()
          AND c.end_date >= NOW()
          AND (
              EXISTS (SELECT 1 FROM campaign_device cd WHERE cd.campaign_id = c.id AND cd.device_id = $1) OR
              EXISTS (SELECT 1 FROM campaign_sector cs WHERE cs.campaign_id = c.id AND cs.sector_id = $3) OR
              (NOT EXISTS (SELECT 1 FROM campaign_device cd WHERE cd.campaign_id = c.id) AND
               NOT EXISTS (SELECT 1 FROM campaign_sector cs WHERE cs.campaign_id = c.id))
          )
      ORDER BY
          CASE
              WHEN EXISTS (SELECT 1 FROM campaign_device cd WHERE cd.campaign_id = c.id AND cd.device_id = $1) THEN 1
              WHEN EXISTS (SELECT 1 FROM campaign_sector cs WHERE cs.campaign_id = c.id AND cs.sector_id = $3) THEN 2
              ELSE 3
          END ASC,
          c.priority ASC,
          plays_last_24h DESC,
          c.created_at DESC
      LIMIT 1`;

  const campaignResult = await db.query(campaignQuery, [
    deviceId,
    companyId,
    sectorId,
  ]);

  if (deviceType !== "digital_menu") {
    if (campaignResult.rows.length === 0) return null;
    const campaign = campaignResult.rows[0];
    const uploadsQuery = `
        SELECT id, file_path, file_type, duration, zone
        FROM campaign_uploads
        WHERE campaign_id = $1
        ORDER BY zone, execution_order ASC`;
    const uploadsResult = await db.query(uploadsQuery, [campaign.id]);
    const playlistData = {
      campaign_id: campaign.id,
      layout_type: campaign.layout_type,
      uploads: uploadsResult.rows,
      city: campaign.city,
      state: campaign.state,
      cep: campaign.cep,
    };
    if (playlistData.layout_type === "split-80-20-weather") {
      try {
        playlistData.weather = await weatherService.getWeather(
          playlistData.city,
          playlistData.state,
          playlistData.cep
        );
      } catch (weatherError) {
        logger.error("Falha ao buscar clima.", weatherError);
        playlistData.weather = null;
      }
    }
    return playlistData;
  }

  const butcherProductsGroups = await butcherService.getButcherProducts(
    companyId
  );
  let campaign = campaignResult.rows.length > 0 ? campaignResult.rows[0] : null;
  let primaryMedia = [];
  let secondaryMedia = null;
  let layout_type = "fullscreen";
  let campaign_id = null;

  if (campaign) {
    layout_type = campaign.layout_type;
    campaign_id = campaign.id;
    const uploadsResult = await db.query(
      `SELECT id, file_path, file_type, duration, zone
       FROM campaign_uploads
       WHERE campaign_id = $1
       ORDER BY zone, execution_order ASC`,
      [campaign.id]
    );
    primaryMedia = uploadsResult.rows.filter(
      (u) => u.zone === "main" || !u.zone
    );
    secondaryMedia = uploadsResult.rows.find((u) => u.zone === "secondary");

    if (layout_type === "split-80-20-weather") {
      try {
        const weatherData = await weatherService.getWeather(
          campaign.city,
          campaign.state,
          campaign.cep
        );
        if (weatherData) {
          secondaryMedia = {
            type: "weather",
            weather: weatherData,
            city: campaign.city,
          };
        } else {
          secondaryMedia = null;
        }
      } catch (weatherError) {
        logger.error("Falha ao buscar clima para menu.", weatherError);
        secondaryMedia = null;
      }
    }

    if (layout_type.startsWith("split-") && !secondaryMedia) {
      layout_type = "fullscreen";
    }
  }

  if (!campaign && butcherProductsGroups.length > 0) {
    layout_type = "fullscreen";
  }

  return {
    campaign_id,
    layout_type: layout_type,
    product_groups: butcherProductsGroups,
    primary_media: primaryMedia,
    secondary_media: secondaryMedia,
  };
};

const getActiveDigitalMenuDevicesByCompany = async (companyId) => {
  const query = `
        SELECT id FROM devices
        WHERE company_id = $1
        AND is_active = TRUE
        AND device_type = 'digital_menu'
    `;
  const result = await db.query(query, [companyId]);
  return result.rows.map((row) => row.id);
};

module.exports = {
  getFullDeviceList,
  getDeviceById,
  createDevice,
  updateDevice,
  deleteDevice,
  createOtpForDevice,
  createMagicLinkForDevice,
  revokeDeviceAccess,
  reactivateDevice,
  getDeviceDetails,
  getDevicePlaylist,
  getActiveDigitalMenuDevicesByCompany,
};