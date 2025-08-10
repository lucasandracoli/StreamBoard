const db = require("../../config/streamboard");

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
    VALUES ($1, $2, $3, $4, TRUE)`;
  await db.query(query, [name, device_type, company_id, sector_id]);
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
        SELECT c.name FROM campaigns c
            LEFT JOIN campaign_device cd ON c.id = cd.campaign_id
            LEFT JOIN campaign_sector cs ON c.id = cs.campaign_id
        WHERE (cd.device_id = $1 OR cs.sector_id = $2)
        AND NOW() BETWEEN c.start_date AND c.end_date`;
  const campaignsResult = await db.query(campaignsQuery, [
    id,
    device.sector_id,
  ]);

  device.active_campaigns = campaignsResult.rows.map((c) => c.name);
  return device;
};

const getDevicePlaylist = async (deviceId, companyId, sectorId) => {
  const campaignQuery = `
      SELECT c.id, c.layout_type, comp.city, comp.state, comp.cep
      FROM campaigns c
      JOIN companies comp ON c.company_id = comp.id
      WHERE
          c.company_id = $2 AND
          c.start_date <= NOW() AND
          c.end_date >= NOW() AND
          (
              NOT EXISTS (SELECT 1 FROM campaign_device cd WHERE cd.campaign_id = c.id) AND
              NOT EXISTS (SELECT 1 FROM campaign_sector cs WHERE cs.campaign_id = c.id)
              OR
              EXISTS (SELECT 1 FROM campaign_device cd WHERE cd.campaign_id = c.id AND cd.device_id = $1)
              OR
              EXISTS (SELECT 1 FROM campaign_sector cs WHERE cs.campaign_id = c.id AND cs.sector_id = $3)
          )
      ORDER BY c.created_at DESC
      LIMIT 1`;

  const campaignResult = await db.query(campaignQuery, [
    deviceId,
    companyId,
    sectorId,
  ]);

  if (campaignResult.rows.length === 0) {
    return null;
  }

  const campaign = campaignResult.rows[0];

  const uploadsQuery = `
      SELECT id, file_path, file_type, duration, zone
      FROM campaign_uploads
      WHERE campaign_id = $1
      ORDER BY execution_order ASC`;

  const uploadsResult = await db.query(uploadsQuery, [campaign.id]);

  return {
    layout_type: campaign.layout_type,
    uploads: uploadsResult.rows,
    city: campaign.city,
    state: campaign.state,
    cep: campaign.cep,
  };
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
};