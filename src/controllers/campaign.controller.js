const db = require("../../config/streamboard");
const fsPromises = require("fs").promises;
const path = require("path");
const { DateTime } = require("luxon");
const campaignService = require("../services/campaign.service");
const companyService = require("../services/company.service");
const formatUtils = require("../utils/format.utils");
const logger = require("../utils/logger");

const transformCampaign = (campaign) => {
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

  let campaign_type = "Sem Mídia";
  const uploadsCount =
    campaign.uploads_count !== undefined
      ? parseInt(campaign.uploads_count, 10)
      : (campaign.uploads || []).length;
  const firstUpload = (campaign.uploads || [])[0];
  const firstUploadType =
    campaign.first_upload_type || (firstUpload ? firstUpload.file_type : null);

  if (uploadsCount > 1) {
    campaign_type = "Playlist";
  } else if (uploadsCount === 1) {
    if (firstUploadType?.startsWith("image/")) {
      campaign_type = "Imagem";
    } else if (firstUploadType?.startsWith("video/")) {
      campaign_type = "Vídeo";
    } else {
      campaign_type = "Arquivo";
    }
  }

  let target_names = [];
  if (campaign.sector_names && campaign.sector_names.length > 0) {
    target_names = campaign.sector_names;
  } else if (campaign.device_names && campaign.device_names.length > 0) {
    target_names = campaign.device_names;
  }

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
};

const listCampaignsPage = async (req, res) => {
  try {
    const campaignList = await campaignService.getAllCampaigns();
    const companies = await companyService.getAllCompanies();
    const campaigns = campaignList.map(transformCampaign);

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
  } = req.body;
  if (!name || !start_date || !end_date || !company_id) {
    return res
      .status(400)
      .json({ message: "Todos os campos são obrigatórios." });
  }

  const serviceData = {
    name,
    company_id,
    parsedStartDate: DateTime.fromFormat(
      start_date,
      "dd/MM/yyyy HH:mm"
    ).toJSDate(),
    parsedEndDate: DateTime.fromFormat(end_date, "dd/MM/yyyy HH:mm").toJSDate(),
    media_metadata: media_metadata ? JSON.parse(media_metadata) : [],
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

    const allAffectedDevices = await db.query(
      `SELECT id FROM devices WHERE id = ANY($1::uuid[]) OR sector_id = ANY($2::int[])`,
      [newDeviceIds, newSectorIds]
    );

    const { sendUpdateToDevice } = req.app.locals;
    allAffectedDevices.rows.forEach((row) => {
      sendUpdateToDevice(row.id, {
        type: "NEW_CAMPAIGN",
        payload: newCampaign,
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
  } = req.body;

  if (!name || !start_date || !end_date || !company_id) {
    return res
      .status(400)
      .json({ message: "Todos os campos são obrigatórios." });
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
  const parsedStartDate = DateTime.fromFormat(
    start_date,
    "dd/MM/yyyy HH:mm"
  ).toJSDate();
  const parsedEndDate = DateTime.fromFormat(
    end_date,
    "dd/MM/yyyy HH:mm"
  ).toJSDate();

  const client = await db.connect();
  try {
    const oldAffectedDeviceIds =
      await campaignService.getAffectedDevicesForCampaign(id);
    await client.query("BEGIN");

    await client.query(
      "UPDATE campaigns SET name = $1, start_date = $2, end_date = $3, company_id = $4 WHERE id = $5",
      [name, parsedStartDate, parsedEndDate, company_id, id]
    );

    if (media_touched === "true") {
      const mediaMetadata = req.body.media_metadata
        ? JSON.parse(req.body.media_metadata)
        : [];
      const keptMediaIds = mediaMetadata
        .filter((m) => m.id !== null)
        .map((m) => m.id);
      const newFilesMetadata = mediaMetadata.filter((m) => m.id === null);

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
            "UPDATE campaign_uploads SET execution_order = $1, duration = $2 WHERE id = $3",
            [meta.order, meta.duration, meta.id]
          );
        }
      }
      let fileIndex = 0;
      for (const meta of newFilesMetadata) {
        const file = req.files[fileIndex++];
        if (file) {
          const newFilePath = `/uploads/${file.filename}`;
          await client.query(
            `INSERT INTO campaign_uploads (campaign_id, file_name, file_path, file_type, execution_order, duration) VALUES ($1, $2, $3, $4, $5, $6)`,
            [
              id,
              file.originalname,
              newFilePath,
              file.mimetype,
              meta.order,
              meta.duration,
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

    const newAffectedDevicesResult = await client.query(
      `SELECT id FROM devices WHERE id = ANY($1::uuid[]) OR sector_id = ANY($2::int[])`,
      [newDeviceIds, newSectorIds]
    );
    const newAffectedDeviceIds = newAffectedDevicesResult.rows.map((r) => r.id);
    const allAffectedDeviceIds = [
      ...new Set([...oldAffectedDeviceIds, ...newAffectedDeviceIds]),
    ];

    const { sendUpdateToDevice } = req.app.locals;
    allAffectedDeviceIds.forEach((deviceId) => {
      sendUpdateToDevice(deviceId, {
        type: "UPDATE_CAMPAIGN",
        payload: { campaignId: id },
      });
    });

    const campaignForResponse = await campaignService.getCampaignWithDetails(
      id
    );

    const companyData = await companyService.getCompanyById(
      campaignForResponse.company_id
    );
    campaignForResponse.company_name = companyData ? companyData.name : "";
    campaignForResponse.device_names = (campaignForResponse.devices || []).map(
      (d) => d.name
    );

    if (
      campaignForResponse.sector_ids &&
      campaignForResponse.sector_ids.length > 0
    ) {
      const sectorsData = await db.query(
        "SELECT name FROM sectors WHERE id = ANY($1::int[])",
        [campaignForResponse.sector_ids]
      );
      campaignForResponse.sector_names = sectorsData.rows.map((s) => s.name);
    } else {
      campaignForResponse.sector_names = [];
    }

    const transformedCampaign = transformCampaign(campaignForResponse);

    res.status(200).json({
      message: "Campanha atualizada com sucesso.",
      campaign: transformedCampaign,
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
