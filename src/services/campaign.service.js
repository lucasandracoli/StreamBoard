const db = require("../../config/streamboard");
const logger = require("../utils/logger");

const getAllCampaigns = async () => {
  const query = `
    SELECT
      c.*,
      co.name as company_name,
      (
        SELECT json_agg(s.name)
        FROM sectors s
        JOIN campaign_sector cs ON s.id = cs.sector_id
        WHERE cs.campaign_id = c.id
      ) as sector_names,
      (
        SELECT json_agg(d.name)
        FROM devices d
        JOIN campaign_device cd ON d.id = cd.device_id
        WHERE cd.campaign_id = c.id
      ) as device_names,
      (SELECT COUNT(*) FROM campaign_uploads cu WHERE cu.campaign_id = c.id) as uploads_count,
      (SELECT cu.file_type FROM campaign_uploads cu WHERE cu.campaign_id = c.id ORDER BY cu.execution_order ASC LIMIT 1) as first_upload_type
    FROM campaigns c
    JOIN companies co ON c.company_id = co.id
    ORDER BY c.created_at DESC`;
  const result = await db.query(query);
  return result.rows;
};

const getCampaignWithDetails = async (id) => {
  const query = `
        SELECT
            c.*,
            co.name as company_name,
            (SELECT json_agg(s.name) FROM sectors s JOIN campaign_sector cs ON s.id = cs.sector_id WHERE cs.campaign_id = c.id) as sector_names,
            (SELECT json_agg(d.name) FROM devices d JOIN campaign_device cd ON d.id = cd.device_id WHERE cd.campaign_id = c.id) as device_names
        FROM campaigns c
        JOIN companies co ON c.company_id = co.id
        WHERE c.id = $1`;
  const campaignResult = await db.query(query, [id]);
  if (campaignResult.rows.length === 0) return null;

  const campaign = campaignResult.rows[0];

  const uploadsResult = await db.query(
    "SELECT id, file_name, file_path, file_type, duration FROM campaign_uploads WHERE campaign_id = $1 ORDER BY execution_order ASC",
    [id]
  );
  campaign.uploads = uploadsResult.rows;

  return campaign;
};

const getAffectedDevicesForCampaign = async (campaignId) => {
  const query = `
        SELECT DISTINCT d.id FROM devices d
        LEFT JOIN campaign_device cd ON d.id = cd.device_id
        LEFT JOIN campaign_sector cs ON d.sector_id = cs.sector_id
        WHERE cd.campaign_id = $1 OR cs.campaign_id = $1`;
  const result = await db.query(query, [campaignId]);
  return result.rows.map((row) => row.id);
};

const createCampaign = async (data, files, deviceIds, sectorIds) => {
  const { name, parsedStartDate, parsedEndDate, company_id, media_metadata } =
    data;
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const campaignResult = await client.query(
      `INSERT INTO campaigns (name, start_date, end_date, company_id) VALUES ($1, $2, $3, $4) RETURNING *`,
      [name, parsedStartDate, parsedEndDate, company_id]
    );
    const newCampaign = campaignResult.rows[0];

    if (files && files.length > 0) {
      for (const [index, file] of files.entries()) {
        const metadata = media_metadata[index] || {};
        const filePath = `/uploads/${file.filename}`;
        await client.query(
          `INSERT INTO campaign_uploads (campaign_id, file_name, file_path, file_type, execution_order, duration) VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            newCampaign.id,
            file.originalname,
            filePath,
            file.mimetype,
            metadata.order,
            metadata.duration,
          ]
        );
      }
    }

    for (const device_id of deviceIds) {
      await client.query(
        `INSERT INTO campaign_device (campaign_id, device_id) VALUES ($1, $2)`,
        [newCampaign.id, device_id]
      );
    }
    for (const sector_id of sectorIds) {
      await client.query(
        `INSERT INTO campaign_sector (campaign_id, sector_id) VALUES ($1, $2)`,
        [newCampaign.id, sector_id]
      );
    }
    await client.query("COMMIT");
    return newCampaign;
  } catch (err) {
    await client.query("ROLLBACK");
    logger.error("Erro interno ao criar campanha.", err);
    throw err;
  } finally {
    client.release();
  }
};

const deleteCampaign = async (id) => {
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const uploadsResult = await db.query(
      "SELECT file_path FROM campaign_uploads WHERE campaign_id = $1",
      [id]
    );

    await client.query("DELETE FROM campaign_device WHERE campaign_id = $1", [
      id,
    ]);
    await client.query("DELETE FROM campaign_sector WHERE campaign_id = $1", [
      id,
    ]);
    await client.query("DELETE FROM campaign_uploads WHERE campaign_id = $1", [
      id,
    ]);
    const deleteResult = await client.query(
      "DELETE FROM campaigns WHERE id = $1",
      [id]
    );

    await client.query("COMMIT");

    const filesToDelete = uploadsResult.rows.map((row) => row.file_path);
    return { deletedCount: deleteResult.rowCount, filesToDelete };
  } catch (err) {
    await client.query("ROLLBACK");
    logger.error(`Erro ao excluir campanha ID ${id}.`, err);
    throw err;
  } finally {
    client.release();
  }
};

module.exports = {
  getAllCampaigns,
  getCampaignWithDetails,
  getAffectedDevicesForCampaign,
  createCampaign,
  deleteCampaign,
};
