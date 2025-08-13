const db = require("../../config/streamboard");
const fsPromises = require("fs").promises;
const path = require("path");
const { DateTime } = require("luxon");
const campaignService = require("../services/campaign.service");
const companyService = require("../services/company.service");
const formatUtils = require("../utils/format.utils");
const logger = require("../utils/logger");

const listCampaignsPage = async (req, res) => {
  try {
    const campaignList = await campaignService.getAllCampaigns();
    const companies = await companyService.getAllCompanies();
    const now = DateTime.now().setZone("America/Sao_Paulo");

    const campaigns = campaignList.map((campaign) => {
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

    res.render("campaigns", { campaigns, companies, sectors: [] });
  } catch (err) {
    logger.error("Erro ao carregar campanhas.", err);
    res.status(500).send("Erro ao carregar campanhas.");
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
    parsedStartDate,
    parsedEndDate,
    media_metadata: mediaMetadata,
  };
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

  try {
    const newCampaign = await campaignService.createCampaign(
      serviceData,
      req.files,
      newDeviceIds,
      newSectorIds
    );

    const affectedDeviceIds =
      await campaignService.getAffectedDevicesForCampaign(newCampaign.id);

    const { sendUpdateToDevice } = req.app.locals;
    affectedDeviceIds.forEach((deviceId) => {
      sendUpdateToDevice(deviceId, {
        type: "NEW_CAMPAIGN",
        payload: { campaignId: newCampaign.id },
      });
    });

    res
      .status(200)
      .json({ message: "Campanha criada.", campaign: newCampaign });
  } catch (err) {
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
      const fullPath = path.join(__dirname, "../../", filePath);
      fsPromises.unlink(fullPath).catch((err) => {
        logger.error(`Falha ao excluir arquivo de mídia: ${fullPath}`, err);
      });
    }

    const { sendUpdateToDevice } = req.app.locals;
    affectedDeviceIds.forEach((deviceId) => {
      sendUpdateToDevice(deviceId, {
        type: "DELETE_CAMPAIGN",
        payload: { campaignId: Number(id) },
      });
    });

    res.status(200).json({
      message: "Campanha e mídias associadas foram excluídas com sucesso.",
    });
  } catch (err) {
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
    logger.error(`Erro ao buscar detalhes da campanha ${id}.`, err);
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

  const client = await db.connect();
  try {
    const oldAffectedDeviceIds =
      await campaignService.getAffectedDevicesForCampaign(id);
    await client.query("BEGIN");

    await client.query(
      "UPDATE campaigns SET name = $1, start_date = $2, end_date = $3, company_id = $4, layout_type = $5 WHERE id = $6",
      [
        name,
        parsedStartDate,
        parsedEndDate,
        company_id,
        layout_type || "fullscreen",
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
            .unlink(path.join(__dirname, "../../", upload.file_path))
            .catch((err) =>
              logger.error(`Falha ao remover arquivo: ${upload.file_path}`, err)
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

    const { sendUpdateToDevice } = req.app.locals;
    allAffectedDeviceIds.forEach((deviceId) => {
      sendUpdateToDevice(deviceId, {
        type: "UPDATE_CAMPAIGN",
        payload: { campaignId: Number(id) },
      });
    });

    const campaignFromDb = await campaignService.getCampaignWithDetails(id);

    const now = DateTime.now().setZone("America/Sao_Paulo");
    const startDate = DateTime.fromJSDate(campaignFromDb.start_date, {
      zone: "America/Sao_Paulo",
    });
    const endDate = DateTime.fromJSDate(campaignFromDb.end_date, {
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
    const uploadsCount = campaignFromDb.uploads.length;
    if (uploadsCount > 1) {
      campaign_type = "Playlist";
    } else if (uploadsCount === 1) {
      if (campaignFromDb.uploads[0].file_type?.startsWith("image/"))
        campaign_type = "Imagem";
      else if (campaignFromDb.uploads[0].file_type?.startsWith("video/"))
        campaign_type = "Vídeo";
      else campaign_type = "Arquivo";
    }

    let target_names = [];
    if (campaignFromDb.sector_names && campaignFromDb.sector_names.length > 0)
      target_names = campaignFromDb.sector_names;
    else if (
      campaignFromDb.device_names &&
      campaignFromDb.device_names.length > 0
    )
      target_names = campaignFromDb.device_names;

    const campaignForResponse = {
      ...campaignFromDb,
      status,
      target_names,
      periodo_formatado: formatUtils.formatarPeriodo(
        campaignFromDb.start_date,
        campaignFromDb.end_date
      ),
      campaign_type,
    };

    res.status(200).json({
      message: "Campanha atualizada com sucesso.",
      campaign: campaignForResponse,
    });
  } catch (err) {
    await client.query("ROLLBACK");
    logger.error(`Erro ao editar campanha ${id}.`, err);
    res.status(500).json({ message: "Erro ao atualizar campanha." });
  } finally {
    client.release();
  }
};

module.exports = {
  listCampaignsPage,
  createCampaign,
  deleteCampaign,
  getCampaignDetails,
  editCampaign,
};
