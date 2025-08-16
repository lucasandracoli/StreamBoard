const db = require("../../config/streamboard");
const logger = require("../utils/logger");

const findOverlappingCampaigns = async (
  startDate,
  endDate,
  companyId,
  deviceIds,
  sectorIds,
  campaignIdToIgnore = null
) => {
  const hasDeviceTargets = deviceIds && deviceIds.length > 0;
  const hasSectorTargets = sectorIds && sectorIds.length > 0;
  const isTargetingAll = !hasDeviceTargets && !hasSectorTargets;

  let params = [startDate, endDate, companyId, campaignIdToIgnore || 0];
  let paramIndex = 5;
  let conflictConditions = [];

  conflictConditions.push(`(
    NOT EXISTS (SELECT 1 FROM campaign_device cd WHERE cd.campaign_id = c.id) AND
    NOT EXISTS (SELECT 1 FROM campaign_sector cs WHERE cs.campaign_id = c.id)
  )`);

  if (hasDeviceTargets) {
    conflictConditions.push(
      `c.id IN (SELECT campaign_id FROM campaign_device WHERE device_id = ANY($${paramIndex}::uuid[]))`
    );
    params.push(deviceIds);
    paramIndex++;
  }

  if (hasSectorTargets) {
    conflictConditions.push(
      `c.id IN (SELECT campaign_id FROM campaign_sector WHERE sector_id = ANY($${paramIndex}::int[]))`
    );
    params.push(sectorIds);
    paramIndex++;
  }

  const conflictQueryPart = isTargetingAll
    ? "true"
    : `(${conflictConditions.join(" OR ")})`;

  const query = `
    SELECT c.name FROM campaigns c
    WHERE c.company_id = $3
      AND c.id != $4
      AND (c.start_date, c.end_date) OVERLAPS ($1::timestamptz, $2::timestamptz)
      AND ${conflictQueryPart}
  `;

  const result = await db.query(query, params);
  return result.rows.map((r) => r.name);
};

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
            (SELECT json_agg(cs.sector_id) FROM campaign_sector cs WHERE cs.campaign_id = c.id) as sector_ids,
            (SELECT json_agg(cd.device_id) FROM campaign_device cd WHERE cd.campaign_id = c.id) as device_ids
        FROM campaigns c
        JOIN companies co ON c.company_id = co.id
        WHERE c.id = $1`;
  const campaignResult = await db.query(query, [id]);
  if (campaignResult.rows.length === 0) return null;

  const campaign = campaignResult.rows[0];

  const uploadsResult = await db.query(
    "SELECT id, file_name, file_path, file_type, duration, zone FROM campaign_uploads WHERE campaign_id = $1 ORDER BY zone, execution_order ASC",
    [id]
  );
  campaign.uploads = uploadsResult.rows;

  return campaign;
};

const getTargetNamesForCampaign = async (campaignId) => {
  const query = `
        SELECT
            (SELECT json_agg(s.name) FROM sectors s JOIN campaign_sector cs ON s.id = cs.sector_id WHERE cs.campaign_id = $1) as sector_names,
            (SELECT json_agg(d.name) FROM devices d JOIN campaign_device cd ON d.id = cd.device_id WHERE cd.campaign_id = $1) as device_names
    `;
  const result = await db.query(query, [campaignId]);
  const { sector_names, device_names } = result.rows[0];
  return [...(sector_names || []), ...(device_names || [])];
};

const getAffectedDevicesForCampaign = async (campaignId) => {
  const client = await db.connect();
  try {
    const targetingQuery = `
      SELECT
        c.company_id,
        EXISTS (SELECT 1 FROM campaign_device cd WHERE cd.campaign_id = c.id) as has_device_targets,
        EXISTS (SELECT 1 FROM campaign_sector cs WHERE cs.campaign_id = c.id) as has_sector_targets
      FROM campaigns c
      WHERE c.id = $1
    `;
    const targetingResult = await client.query(targetingQuery, [campaignId]);

    if (targetingResult.rows.length === 0) {
      return [];
    }

    const { company_id, has_device_targets, has_sector_targets } =
      targetingResult.rows[0];

    if (has_device_targets || has_sector_targets) {
      const specificDevicesQuery = `
        SELECT DISTINCT d.id FROM devices d
        LEFT JOIN campaign_device cd ON d.id = cd.device_id
        LEFT JOIN campaign_sector cs ON d.sector_id = cs.sector_id
        WHERE d.company_id = $1 AND (cd.campaign_id = $2 OR cs.campaign_id = $2)`;
      const result = await client.query(specificDevicesQuery, [
        company_id,
        campaignId,
      ]);
      return result.rows.map((row) => row.id);
    } else {
      const allDevicesQuery = `SELECT id FROM devices WHERE company_id = $1 AND is_active = TRUE`;
      const result = await client.query(allDevicesQuery, [company_id]);
      return result.rows.map((row) => row.id);
    }
  } finally {
    client.release();
  }
};

const createCampaign = async (data, files, deviceIds, sectorIds) => {
  const {
    name,
    parsedStartDate,
    parsedEndDate,
    company_id,
    media_metadata,
    layout_type,
  } = data;
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const campaignResult = await client.query(
      `INSERT INTO campaigns (name, start_date, end_date, company_id, layout_type) VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [name, parsedStartDate, parsedEndDate, company_id, layout_type]
    );
    const newCampaign = campaignResult.rows[0];

    const fileMap = new Map(files.map((f) => [f.originalname, f]));

    if (media_metadata && media_metadata.length > 0) {
      for (const meta of media_metadata) {
        const file = fileMap.get(meta.name);
        if (file) {
          const filePath = `/uploads/${file.filename}`;
          await client.query(
            `INSERT INTO campaign_uploads (campaign_id, file_name, file_path, file_type, execution_order, duration, zone) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [
              newCampaign.id,
              file.originalname,
              filePath,
              file.mimetype,
              meta.order,
              meta.duration,
              meta.zone,
            ]
          );
        }
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
  getTargetNamesForCampaign,
  getAffectedDevicesForCampaign,
  createCampaign,
  deleteCampaign,
  findOverlappingCampaigns,
};
