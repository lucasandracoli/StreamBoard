const db = require("../../config/streamboard");
const fsPromises = require("fs").promises;
const path = require("path");
const { DateTime } = require("luxon");
const campaignService = require("../services/campaign.service");
const companyService = require("../services/company.service");
const formatUtils = require("../utils/format.utils");
const logger = require("../utils/logger");

const getFullCampaignDetailsForBroadcast = async (campaignId) => {
  const campaign = await campaignService.getCampaignWithDetails(campaignId);
  if (!campaign) return null;

  const now = DateTime.now().setZone("America/Sao_Paulo");
  const startDate = DateTime.fromJSDate(campaign.start_date, {
    zone: "America/Sao_Paulo",
  });
  const endDate = DateTime.fromJSDate(campaign.end_date, {
    zone: "America/Sao_Paulo",
  });
  let status;
  if (now < startDate) {
    status = { text: "Agendada", class: "scheduled" };
  } else if (now > endDate) {
    status = { text: "Finalizada", class: "offline" };
  } else {
    status = { text: "Ativa", class: "online" };
  }

  const uploadsCount = campaign.uploads ? campaign.uploads.length : 0;
  let campaign_type = "Sem Mídia";
  if (uploadsCount > 1) {
    campaign_type = "Playlist";
  } else if (uploadsCount === 1) {
    const firstUpload = campaign.uploads[0];
    if (firstUpload.file_type?.startsWith("image/")) campaign_type = "Imagem";
    else if (firstUpload.file_type?.startsWith("video/"))
      campaign_type = "Vídeo";
    else campaign_type = "Arquivo";
  }

  const allTargetNames = await campaignService.getTargetNamesForCampaign(
    campaignId
  );

  return {
    ...campaign,
    status,
    uploads_count: uploadsCount,
    target_names: allTargetNames,
    periodo_formatado: formatUtils.formatarPeriodo(
      campaign.start_date,
      campaign.end_date
    ),
    campaign_type,
  };
};

const listCampaignsPage = async (req, res) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = 8;
    const campaignData = await campaignService.getAllCampaigns(page, limit);
    const allCompanies = await companyService.getAllCompanies();
    const now = DateTime.now().setZone("America/Sao_Paulo");

    const campaigns = campaignData.campaigns.map((campaign) => {
      const startDate = DateTime.fromJSDate(campaign.start_date, {
        zone: "America/Sao_Paulo",
      });
      const endDate = DateTime.fromJSDate(campaign.end_date, {
        zone: "America/Sao_Paulo",
      });
      let status;
      if (now < startDate) {
        status = { text: "Agendada", class: "scheduled" };
      } else if (now > endDate) {
        status = { text: "Finalizada", class: "offline" };
      } else {
        status = { text: "Ativa", class: "online" };
      }

      let campaign_type = "Sem Mídia";
      const uploadsCount = parseInt(campaign.uploads_count, 10);
      if (uploadsCount > 1) {
        campaign_type = "Playlist";
      } else if (uploadsCount === 1) {
        if (campaign.first_upload_type?.startsWith("image/"))
          campaign_type = "Imagem";
        else if (campaign.first_upload_type?.startsWith("video/"))
          campaign_type = "Vídeo";
        else campaign_type = "Arquivo";
      }

      let target_names = [];
      if (campaign.sector_names && campaign.sector_names.length > 0)
        target_names = campaign.sector_names;
      else if (campaign.device_names && campaign.device_names.length > 0)
        target_names = campaign.device_names;

      return {
        ...campaign,
        status,
        target_names,
        periodo_formatado: formatUtils.formatarPeriodo(
          campaign.start_date,
          campaign.end_date
        ),
        campaign_type,
      };
    });

    res.render("campaigns", {
      campaigns,
      companies: allCompanies,
      sectors: [],
      currentPage: campaignData.currentPage,
      totalPages: campaignData.totalPages,
    });
  } catch (err) {
    logger.error({ err }, "Erro ao carregar campanhas.");
    res.status(500).send("Erro ao carregar campanhas.");
  }
};

const renderCampaignPipelinePage = async (req, res) => {
  try {
    const pipelineData = await campaignService.getCampaignPipeline();
    res.render("campaigns_pipeline", {
      pipeline: pipelineData,
      formatUtils,
    });
  } catch (err) {
    logger.error({ err }, "Erro ao carregar o pipeline de campanhas.");
    res.status(500).send("Erro ao carregar a página.");
  }
};

const createCampaign = async (req, res) => {
  let {
    name,
    start_date,
    end_date,
    device_ids,
    sector_ids,
    company_id,
    media_metadata,
    layout_type,
    priority,
    force,
  } = req.body;
  if (!name || !start_date || !end_date || !company_id) {
    return res
      .status(400)
      .json({ message: "Nome, datas e empresa são obrigatórios." });
  }

  const parsedStartDate = DateTime.fromFormat(
    start_date,
    "dd/MM/yyyy HH:mm"
  ).toJSDate();
  const parsedEndDate = DateTime.fromFormat(
    end_date,
    "dd/MM/yyyy HH:mm"
  ).toJSDate();

  if (parsedEndDate < parsedStartDate) {
    return res.status(400).json({
      message: "A data de término não pode ser anterior à data de início.",
    });
  }

  const newDeviceIds = device_ids
    ? Array.isArray(device_ids)
      ? device_ids
      : [device_ids]
    : [];
  const newSectorIds = sector_ids
    ? Array.isArray(sector_ids)
      ? sector_ids
      : [sector_ids]
    : [];

  if (force !== "true") {
    const overlapping = await campaignService.findOverlappingCampaigns(
      parsedStartDate,
      parsedEndDate,
      company_id,
      newDeviceIds,
      newSectorIds
    );
    if (overlapping.length > 0) {
      return res.status(409).json({
        conflict: true,
        message: `Esta campanha irá sobrepor a(s) seguinte(s) campanha(s) para os mesmos alvos.`,
        overlapping_campaigns: overlapping,
      });
    }
  }

  const mediaMetadata = media_metadata ? JSON.parse(media_metadata) : [];
  const hasMainMedia = mediaMetadata.some((item) => item.zone === "main");
  const hasSecondaryMedia = mediaMetadata.some(
    (item) => item.zone === "secondary"
  );

  if (!hasMainMedia) {
    return res.status(400).json({
      message: "A campanha deve conter ao menos uma mídia na zona Principal.",
    });
  }

  if (layout_type === "split-80-20" && !hasSecondaryMedia) {
    return res.status(400).json({
      message:
        "Para o layout 80/20, a zona Secundária também deve conter ao menos uma mídia.",
    });
  }

  const serviceData = {
    name,
    company_id,
    layout_type: layout_type || "fullscreen",
    priority: parseInt(priority, 10),
    parsedStartDate,
    parsedEndDate,
    media_metadata: mediaMetadata,
    created_by_user_id: req.user.id,
  };

  try {
    const newCampaign = await campaignService.createCampaign(
      serviceData,
      req.files,
      newDeviceIds,
      newSectorIds
    );

    const affectedDeviceIds =
      await campaignService.getAffectedDevicesForCampaign(newCampaign.id);

    const { sendUpdateToDevice, broadcastToAdmins } = req.app.locals;
    affectedDeviceIds.forEach((deviceId) => {
      sendUpdateToDevice(deviceId, {
        type: "NEW_CAMPAIGN",
        payload: { campaignId: newCampaign.id },
      });
    });

    const fullCampaignDetails = await getFullCampaignDetailsForBroadcast(
      newCampaign.id
    );
    if (fullCampaignDetails) {
      broadcastToAdmins({
        type: "CAMPAIGN_CREATED",
        payload: { ...fullCampaignDetails, affectedDeviceIds },
      });
    }

    res
      .status(200)
      .json({ message: "Campanha criada.", campaign: newCampaign });
  } catch (err) {
    logger.error({ err }, "Erro interno ao criar campanha.");
    res.status(500).json({ message: "Erro interno ao criar campanha." });
  }
};

const deleteCampaign = async (req, res) => {
  const { id } = req.params;
  try {
    const affectedDeviceIds =
      await campaignService.getAffectedDevicesForCampaign(id);
    const { deletedCount, filesToDelete } =
      await campaignService.deleteCampaign(id);

    if (deletedCount === 0) {
      return res.status(404).json({ message: "Campanha não encontrada." });
    }

    for (const filePath of filesToDelete) {
      const fullPath = path.join(process.cwd(), filePath.substring(1));
      fsPromises.unlink(fullPath).catch((err) => {
        logger.error({ err }, `Falha ao excluir arquivo de mídia: ${fullPath}`);
      });
    }

    const { sendUpdateToDevice, broadcastToAdmins } = req.app.locals;
    affectedDeviceIds.forEach((deviceId) => {
      sendUpdateToDevice(deviceId, {
        type: "DELETE_CAMPAIGN",
        payload: { campaignId: Number(id) },
      });
    });
    broadcastToAdmins({
      type: "CAMPAIGN_DELETED",
      payload: { campaignId: Number(id), affectedDeviceIds },
    });

    res.status(200).json({
      message: "Campanha e mídias associadas foram excluídas com sucesso.",
    });
  } catch (err) {
    logger.error({ err }, "Erro ao excluir campanha.");
    res.status(500).json({ message: "Erro ao excluir campanha." });
  }
};

const getCampaignDetails = async (req, res) => {
  const { id } = req.params;
  try {
    const campaign = await campaignService.getCampaignWithDetails(id);
    if (!campaign) {
      return res.status(404).json({ message: "Campanha não encontrada." });
    }
    res.json(campaign);
  } catch (err) {
    logger.error({ err }, `Erro ao buscar detalhes da campanha ${id}.`);
    res.status(500).json({ message: "Erro interno do servidor." });
  }
};

const editCampaign = async (req, res) => {
  const { id } = req.params;
  let {
    name,
    start_date,
    end_date,
    device_ids,
    sector_ids,
    company_id,
    media_touched,
    layout_type,
    priority,
    force,
  } = req.body;

  if (!name || !start_date || !end_date || !company_id) {
    return res
      .status(400)
      .json({ message: "Nome, datas e empresa são obrigatórios." });
  }

  const parsedStartDate = DateTime.fromFormat(
    start_date,
    "dd/MM/yyyy HH:mm"
  ).toJSDate();
  const parsedEndDate = DateTime.fromFormat(
    end_date,
    "dd/MM/yyyy HH:mm"
  ).toJSDate();

  if (parsedEndDate < parsedStartDate) {
    return res.status(400).json({
      message: "A data de término não pode ser anterior à data de início.",
    });
  }

  const newDeviceIds = device_ids
    ? Array.isArray(device_ids)
      ? device_ids
      : [device_ids]
    : [];
  const newSectorIds = sector_ids
    ? Array.isArray(sector_ids)
      ? sector_ids
      : [sector_ids]
    : [];

  if (force !== "true") {
    const overlapping = await campaignService.findOverlappingCampaigns(
      parsedStartDate,
      parsedEndDate,
      company_id,
      newDeviceIds,
      newSectorIds,
      id
    );
    if (overlapping.length > 0) {
      return res.status(409).json({
        conflict: true,
        message: `Esta campanha irá sobrepor a(s) seguinte(s) campanha(s) para os mesmos alvos.`,
        overlapping_campaigns: overlapping,
      });
    }
  }

  if (media_touched === "true") {
    const mediaMetadata = req.body.media_metadata
      ? JSON.parse(req.body.media_metadata)
      : [];
    const hasMainMedia = mediaMetadata.some((item) => item.zone === "main");
    const hasSecondaryMedia = mediaMetadata.some(
      (item) => item.zone === "secondary"
    );

    if (!hasMainMedia) {
      return res.status(400).json({
        message: "A campanha deve conter ao menos uma mídia na zona Principal.",
      });
    }

    if (layout_type === "split-80-20" && !hasSecondaryMedia) {
      return res.status(400).json({
        message:
          "Para o layout 80/20, a zona Secundária também deve conter ao menos uma mídia.",
      });
    }
  }

  const client = await db.connect();
  try {
    const oldAffectedDeviceIds =
      await campaignService.getAffectedDevicesForCampaign(id);
    await client.query("BEGIN");

    await client.query(
      "UPDATE campaigns SET name = $1, start_date = $2, end_date = $3, company_id = $4, layout_type = $5, priority = $6 WHERE id = $7",
      [
        name,
        parsedStartDate,
        parsedEndDate,
        company_id,
        layout_type || "fullscreen",
        priority || 99,
        id,
      ]
    );

    if (media_touched === "true") {
      const mediaMetadata = req.body.media_metadata
        ? JSON.parse(req.body.media_metadata)
        : [];
      const keptMediaIds = mediaMetadata
        .filter((m) => m.id !== null)
        .map((m) => m.id);

      const existingUploads = await client.query(
        "SELECT id, file_path FROM campaign_uploads WHERE campaign_id = $1",
        [id]
      );
      const uploadsToDelete = existingUploads.rows.filter(
        (upload) => !keptMediaIds.includes(upload.id)
      );

      if (uploadsToDelete.length > 0) {
        for (const upload of uploadsToDelete) {
          fsPromises
            .unlink(path.join(process.cwd(), upload.file_path.substring(1)))
            .catch((err) =>
              logger.error(
                { err },
                `Falha ao remover arquivo: ${upload.file_path}`
              )
            );
        }
        await client.query(
          "DELETE FROM campaign_uploads WHERE id = ANY($1::int[])",
          [uploadsToDelete.map((u) => u.id)]
        );
      }

      for (const meta of mediaMetadata) {
        if (meta.id !== null) {
          await client.query(
            "UPDATE campaign_uploads SET execution_order = $1, duration = $2, zone = $3 WHERE id = $4",
            [meta.order, meta.duration, meta.zone, meta.id]
          );
        }
      }

      const fileMap = new Map(req.files.map((f) => [f.originalname, f]));
      const newFilesMetadata = mediaMetadata.filter((m) => m.id === null);

      for (const meta of newFilesMetadata) {
        const file = fileMap.get(meta.name);
        if (file) {
          const newFilePath = `/uploads/${file.filename}`;
          await client.query(
            `INSERT INTO campaign_uploads (campaign_id, file_name, file_path, file_type, execution_order, duration, zone) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [
              id,
              file.originalname,
              newFilePath,
              file.mimetype,
              meta.order,
              meta.duration,
              meta.zone,
            ]
          );
        }
      }
    }

    await client.query("DELETE FROM campaign_device WHERE campaign_id = $1", [
      id,
    ]);
    await client.query("DELETE FROM campaign_sector WHERE campaign_id = $1", [
      id,
    ]);
    for (const device_id of newDeviceIds) {
      await client.query(
        "INSERT INTO campaign_device (campaign_id, device_id) VALUES ($1, $2)",
        [id, device_id]
      );
    }
    for (const sector_id of newSectorIds) {
      await client.query(
        "INSERT INTO campaign_sector (campaign_id, sector_id) VALUES ($1, $2)",
        [id, sector_id]
      );
    }

    await client.query("COMMIT");

    const newAffectedDeviceIds =
      await campaignService.getAffectedDevicesForCampaign(id);
    const allAffectedDeviceIds = [
      ...new Set([...oldAffectedDeviceIds, ...newAffectedDeviceIds]),
    ];

    const { sendUpdateToDevice, broadcastToAdmins } = req.app.locals;
    allAffectedDeviceIds.forEach((deviceId) => {
      sendUpdateToDevice(deviceId, {
        type: "UPDATE_CAMPAIGN",
        payload: { campaignId: Number(id) },
      });
    });

    const fullCampaignDetails = await getFullCampaignDetailsForBroadcast(id);
    if (fullCampaignDetails) {
      broadcastToAdmins({
        type: "CAMPAIGN_UPDATED",
        payload: {
          ...fullCampaignDetails,
          affectedDeviceIds: allAffectedDeviceIds,
        },
      });
    }

    res.status(200).json({
      message: "Campanha atualizada com sucesso.",
      campaign: fullCampaignDetails,
    });
  } catch (err) {
    await client.query("ROLLBACK");
    logger.error({ err }, `Erro ao editar campanha ${id}.`);
    res.status(500).json({ message: "Erro ao atualizar campanha." });
  } finally {
    client.release();
  }
};

const deprioritizeCampaign = async (req, res) => {
  const { id } = req.params;
  try {
    const result = await campaignService.deprioritizeCampaign(id);
    if (!result) {
      return res.status(404).json({ message: "Campanha não encontrada." });
    }
    res
      .status(200)
      .json({ message: "Prioridade da campanha concorrente foi rebaixada." });
  } catch (err) {
    logger.error({ err }, `Erro ao rebaixar prioridade da campanha ${id}.`);
    res.status(500).json({ message: "Erro ao rebaixar prioridade." });
  }
};

module.exports = {
  listCampaignsPage,
  renderCampaignPipelinePage,
  createCampaign,
  deleteCampaign,
  getCampaignDetails,
  editCampaign,
  deprioritizeCampaign,
};