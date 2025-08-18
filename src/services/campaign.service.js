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
    SELECT c.id, c.name, c.priority FROM campaigns c
    WHERE c.company_id = $3
      AND c.id != $4
      AND (c.start_date, c.end_date) OVERLAPS ($1::timestamptz, $2::timestamptz)
      AND ${conflictQueryPart}
  `;

  const result = await db.query(query, params);
  return result.rows;
};

const getAllCampaigns = async (page = 1, limit = 8) => {
  const offset = (page - 1) * limit;
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
      (SELECT COUNT(*) FROM play_logs pl WHERE pl.campaign_id = c.id AND pl.played_at >= NOW() - INTERVAL '24 hours') as plays_last_24h,
      (SELECT cu.file_type FROM campaign_uploads cu WHERE cu.campaign_id = c.id ORDER BY cu.execution_order ASC LIMIT 1) as first_upload_type
    FROM campaigns c
    JOIN companies co ON c.company_id = co.id
    ORDER BY c.created_at DESC
    LIMIT $1 OFFSET $2`;

  const countQuery = `SELECT COUNT(*) FROM campaigns;`;

  const campaignsResult = await db.query(query, [limit, offset]);
  const countResult = await db.query(countQuery);

  const totalCampaigns = parseInt(countResult.rows[0].count, 10);
  const totalPages = Math.ceil(totalCampaigns / limit);

  return {
    campaigns: campaignsResult.rows,
    totalPages: totalPages,
    currentPage: page,
  };
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

const getOverwriteReason = (winner, loser) => {
  const priorityMap = {
    1: "Urgente",
    25: "Alta",
    50: "Normal",
  };
  const getPriorityName = (priority) =>
    priorityMap[priority] || `Nível ${priority}`;

  const getSpec = (campaign) =>
    campaign.device_ids?.length > 0
      ? 3
      : campaign.sector_ids?.length > 0
      ? 2
      : 1;
  const specMap = { 3: "Dispositivo Específico", 2: "Setor", 1: "Toda a Loja" };

  const winnerSpec = getSpec(winner);
  const loserSpec = getSpec(loser);

  let reason = "";

  if (winnerSpec > loserSpec) {
    reason = `Uma campanha com alvo mais específico (${specMap[winnerSpec]}) tem preferência.`;
  } else if (winner.priority < loser.priority) {
    reason = `A campanha "${winner.name}" tem prioridade "${getPriorityName(
      winner.priority
    )}", que é superior.`;
  } else {
    const winnerPlays = parseInt(winner.plays_last_24h, 10);
    const loserPlays = parseInt(loser.plays_last_24h, 10);
    if (winnerPlays !== loserPlays) {
      reason = `Como desempate, a campanha "${winner.name}" foi exibida mais vezes recentemente.`;
    } else {
      reason = `Como desempate, a campanha "${winner.name}" foi criada primeiro.`;
    }
  }

  return {
    winnerName: winner.name,
    reason,
  };
};

const getCampaignPipeline = async () => {
  const query = `
    SELECT
      c.id, c.name, c.start_date, c.end_date, c.created_at, c.company_id, c.priority,
      co.name as company_name,
      u.display_name as author_name,
      (SELECT json_agg(cd.device_id) FROM campaign_device cd WHERE cd.campaign_id = c.id) as device_ids,
      (SELECT json_agg(cs.sector_id) FROM campaign_sector cs WHERE cs.campaign_id = c.id) as sector_ids,
      (SELECT COUNT(*) FROM play_logs pl WHERE pl.campaign_id = c.id AND pl.played_at >= NOW() - INTERVAL '24 hours') as plays_last_24h
    FROM campaigns c
    JOIN companies co ON c.company_id = co.id
    LEFT JOIN users u ON c.created_by_user_id = u.id
    ORDER BY c.start_date ASC
  `;
  const allCampaigns = (await db.query(query)).rows;
  const now = new Date();
  const deviceEffectiveCampaign = new Map();
  const activeTimeCampaigns = allCampaigns.filter(
    (c) => now >= new Date(c.start_date) && now <= new Date(c.end_date)
  );
  const deviceTargetsCache = new Map();
  const winnerCampaigns = new Map();
  const priorityMap = {
    1: { name: "Urgente", class: "priority-urgent" },
    25: { name: "Alta", class: "priority-high" },
    50: { name: "Normal", class: "priority-normal" },
  };

  for (const campaign of activeTimeCampaigns) {
    let targetDevices = deviceTargetsCache.get(campaign.id);
    if (!targetDevices) {
      targetDevices = await getAffectedDevicesForCampaign(campaign.id);
      deviceTargetsCache.set(campaign.id, targetDevices);
    }

    for (const deviceId of targetDevices) {
      const currentWinner = deviceEffectiveCampaign.get(deviceId);
      if (!currentWinner) {
        deviceEffectiveCampaign.set(deviceId, campaign);
        continue;
      }

      const campaignSpec =
        campaign.device_ids?.length > 0
          ? 3
          : campaign.sector_ids?.length > 0
          ? 2
          : 1;
      const winnerSpec =
        currentWinner.device_ids?.length > 0
          ? 3
          : currentWinner.sector_ids?.length > 0
          ? 2
          : 1;

      let newWinner = currentWinner;
      if (campaignSpec > winnerSpec) {
        newWinner = campaign;
      } else if (campaignSpec === winnerSpec) {
        if (campaign.priority < currentWinner.priority) {
          newWinner = campaign;
        } else if (campaign.priority === currentWinner.priority) {
          if (
            parseInt(campaign.plays_last_24h, 10) >
            parseInt(currentWinner.plays_last_24h, 10)
          ) {
            newWinner = campaign;
          } else if (
            parseInt(campaign.plays_last_24h, 10) ===
            parseInt(currentWinner.plays_last_24h, 10)
          ) {
            if (
              new Date(campaign.created_at) > new Date(currentWinner.created_at)
            ) {
              newWinner = campaign;
            }
          }
        }
      }
      deviceEffectiveCampaign.set(deviceId, newWinner);
    }
  }

  deviceEffectiveCampaign.forEach((campaign, deviceId) => {
    winnerCampaigns.set(campaign.id, campaign);
  });

  const effectiveCampaignIds = new Set();
  deviceEffectiveCampaign.forEach((campaign) => {
    effectiveCampaignIds.add(campaign.id);
  });

  const pausedCampaigns = new Map();
  for (const campaign of activeTimeCampaigns) {
    if (!effectiveCampaignIds.has(campaign.id)) {
      const targetDevices = await getAffectedDevicesForCampaign(campaign.id);
      for (const deviceId of targetDevices) {
        const winningCampaign = deviceEffectiveCampaign.get(deviceId);
        if (winningCampaign && winningCampaign.id !== campaign.id) {
          pausedCampaigns.set(
            campaign.id,
            getOverwriteReason(winningCampaign, campaign)
          );
          break;
        }
      }
    }
  }

  const pipeline = allCampaigns.map((campaign) => {
    const campaignStatus = {
      ...campaign,
      status: "Finalizada",
      status_class: "offline",
      status_icon: "bi-check-circle-fill",
      targeting_info: "Todos",
      pausedBy: null,
      priority_details:
        priorityMap[campaign.priority] || "Nível " + campaign.priority,
    };

    if (campaign.device_ids?.length > 0) {
      campaignStatus.targeting_info = "Por Dispositivos";
    } else if (campaign.sector_ids?.length > 0) {
      campaignStatus.targeting_info = "Por Setores";
    }

    if (now < new Date(campaign.start_date)) {
      campaignStatus.status = "Agendada";
      campaignStatus.status_class = "scheduled";
      campaignStatus.status_icon = "bi-clock-history";
    } else if (
      now >= new Date(campaign.start_date) &&
      now <= new Date(campaign.end_date)
    ) {
      if (winnerCampaigns.has(campaign.id)) {
        campaignStatus.status = "Ativa";
        campaignStatus.status_class = "online";
        campaignStatus.status_icon = "bi-play-circle-fill";
      } else {
        campaignStatus.status = "Pausada";
        campaignStatus.status_class = "paused";
        campaignStatus.status_icon = "bi-pause-circle-fill";
        const pausedInfo = pausedCampaigns.get(campaign.id);
        campaignStatus.pausedBy = pausedInfo
          ? pausedInfo
          : {
              winnerName: "outra campanha",
              reason: "Critério de sobreposição mais forte.",
            };
      }
    }

    return campaignStatus;
  });

  return pipeline;
};

const createCampaign = async (data, files, deviceIds, sectorIds) => {
  const {
    name,
    parsedStartDate,
    parsedEndDate,
    company_id,
    media_metadata,
    layout_type,
    priority,
    created_by_user_id,
  } = data;
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const campaignResult = await client.query(
      `INSERT INTO campaigns (name, start_date, end_date, company_id, layout_type, priority, created_by_user_id) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [
        name,
        parsedStartDate,
        parsedEndDate,
        company_id,
        layout_type,
        priority || 99,
        created_by_user_id,
      ]
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

const deprioritizeCampaign = async (id) => {
  const result = await db.query(
    "UPDATE campaigns SET priority = priority + 1 WHERE id = $1 RETURNING priority",
    [id]
  );
  return result.rows[0];
};

module.exports = {
  getAllCampaigns,
  getCampaignWithDetails,
  getTargetNamesForCampaign,
  getAffectedDevicesForCampaign,
  createCampaign,
  deleteCampaign,
  findOverlappingCampaigns,
  getCampaignPipeline,
  deprioritizeCampaign,
};
