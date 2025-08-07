const db = require("../../config/streamboard");
const fsPromises = require("fs").promises;
const path = require("path");
const { DateTime } = require("luxon");
const campaignService = require("../services/campaign.service");
const companyService = require("../services/company.service");
const campaignScheduler = require("../services/campaignScheduler.service");
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

    campaignScheduler.scheduleCampaignStatusUpdates(newCampaign);

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

const editCampaign = async (req, res) => {
  const { id } = req.params;
  const {
    name,
    start_date,
    end_date,
    device_ids,
    sector_ids,
    company_id,
    media_touched,
    media_metadata,
  } = req.body;

  if (!name || !start_date || !end_date || !company_id) {
    return res
      .status(400)
      .json({ message: "Todos os campos são obrigatórios." });
  }

  try {
    campaignScheduler.cancelCampaignStatusUpdates(id);
    const oldAffectedDeviceIds =
      await campaignService.getAffectedDevicesForCampaign(id);

    const serviceData = {
      name,
      company_id,
      parsedStartDate: DateTime.fromFormat(
        start_date,
        "dd/MM/yyyy HH:mm"
      ).toJSDate(),
      parsedEndDate: DateTime.fromFormat(
        end_date,
        "dd/MM/yyyy HH:mm"
      ).toJSDate(),
      media_touched,
      media_metadata: media_metadata ? JSON.parse(media_metadata) : [],
      deviceIds: device_ids
        ? Array.isArray(device_ids)
          ? device_ids
          : [device_ids]
        : [],
      sectorIds: sector_ids
        ? Array.isArray(sector_ids)
          ? sector_ids
          : [sector_ids]
        : [],
    };

    const updatedCampaign = await campaignService.updateCampaign(
      id,
      serviceData,
      req.files
    );

    const newAffectedDeviceIds =
      await campaignService.getAffectedDevicesForCampaign(id);
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

    campaignScheduler.scheduleCampaignStatusUpdates(updatedCampaign);

    res.status(200).json({
      message: "Campanha atualizada com sucesso.",
      campaign: updatedCampaign,
    });
  } catch (err) {
    res.status(500).json({ message: "Erro ao atualizar campanha." });
  }
};

const deleteCampaign = async (req, res) => {
  const { id } = req.params;
  try {
    campaignScheduler.cancelCampaignStatusUpdates(id);

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

module.exports = {
  listCampaignsPage,
  createCampaign,
  editCampaign,
  deleteCampaign,
  getCampaignDetails,
};
