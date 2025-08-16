const deviceService = require("../services/device.service");
const tokenService = require("../services/token.service");
const companyService = require("../services/company.service");
const deviceUtils = require("../utils/device.utils");
const logger = require("../utils/logger");
const { DateTime } = require("luxon");
const crypto = require("crypto");
const bcrypt = require("bcrypt");
const weatherService = require("../services/weather.service");

const getFullDeviceDetailsForBroadcast = async (deviceId, clients) => {
  const device = await deviceService.getDeviceDetails(deviceId);
  if (!device) return null;

  return {
    ...device,
    status: deviceUtils.getDeviceStatus(device, clients),
  };
};

const sendDeviceCommand = (req, res) => {
  const { id } = req.params;
  const { command } = req.body;
  const { clients, sendUpdateToDevice } = req.app.locals;

  if (!command) {
    return res.status(400).json({ message: "Comando não especificado." });
  }

  if (!clients[id]) {
    return res.status(404).json({ message: "Dispositivo não está online." });
  }

  sendUpdateToDevice(id, { type: "REMOTE_COMMAND", payload: { command } });

  res.status(200).json({ message: `Comando '${command}' enviado.` });
};

const listDevicesPage = async (req, res) => {
  try {
    const { clients } = req.app.locals;
    const deviceList = await deviceService.getFullDeviceList();
    const companies = await companyService.getAllCompanies();

    const devices = deviceList.map((device) => {
      const lastSeenFormatted = device.last_seen
        ? DateTime.fromJSDate(device.last_seen)
            .setZone("America/Sao_Paulo")
            .toFormat("dd/MM/yyyy HH:mm:ss")
        : "Nunca";

      return {
        ...device,
        last_seen_formatted: lastSeenFormatted,
        status: deviceUtils.getDeviceStatus(device, clients),
      };
    });

    res.render("devices", { devices, companies });
  } catch (err) {
    logger.error("Erro ao carregar dispositivos.", err);
    res.status(500).send("Erro ao carregar dispositivos.");
  }
};

const createDevice = async (req, res) => {
  const { name, device_type, company_id, sector_id } = req.body;
  if (!name || !device_type || !company_id || !sector_id) {
    return res
      .status(400)
      .json({ message: "Todos os campos são obrigatórios." });
  }
  try {
    const newDevice = await deviceService.createDevice(
      name,
      device_type,
      company_id,
      sector_id
    );
    const { broadcastToAdmins, clients } = req.app.locals;
    const fullDeviceDetails = await getFullDeviceDetailsForBroadcast(
      newDevice.id,
      clients
    );
    if (fullDeviceDetails) {
      broadcastToAdmins({
        type: "DEVICE_CREATED",
        payload: {
          ...fullDeviceDetails,
          message: `Dispositivo "${fullDeviceDetails.name}" criado.`,
        },
      });
    }

    res.json({ message: "Dispositivo cadastrado com sucesso." });
  } catch (err) {
    logger.error("Erro ao cadastrar dispositivo.", err);
    res
      .status(500)
      .json({ message: "Erro ao cadastrar dispositivo. Tente novamente." });
  }
};

const editDevice = async (req, res) => {
  const { id } = req.params;
  const { name, device_type, company_id, sector_id } = req.body;
  if (!name || !device_type || !company_id || !sector_id) {
    return res
      .status(400)
      .json({ message: "Todos os campos são obrigatórios." });
  }
  try {
    const oldDevice = await deviceService.getDeviceById(id);
    if (!oldDevice) {
      return res.status(404).json({ message: "Dispositivo não encontrado." });
    }

    await deviceService.updateDevice(id, req.body);

    const { sendUpdateToDevice, broadcastToAdmins, clients } = req.app.locals;
    const fullDeviceDetails = await getFullDeviceDetailsForBroadcast(
      id,
      clients
    );
    if (fullDeviceDetails) {
      broadcastToAdmins({
        type: "DEVICE_UPDATED",
        payload: {
          ...fullDeviceDetails,
          message: `Dispositivo "${fullDeviceDetails.name}" atualizado.`,
        },
      });
    }

    if (oldDevice.device_type !== device_type) {
      sendUpdateToDevice(id, {
        type: "TYPE_CHANGED",
        payload: { newType: device_type },
      });
    }
    res.json({ message: "Dispositivo atualizado com sucesso." });
  } catch (err) {
    logger.error("Erro ao atualizar dispositivo.", err);
    res
      .status(500)
      .json({ message: "Erro ao atualizar dispositivo. Tente novamente." });
  }
};

const deleteDevice = async (req, res) => {
  const { id } = req.params;
  try {
    await deviceService.deleteDevice(id);
    const { sendUpdateToDevice, broadcastToAdmins } = req.app.locals;
    broadcastToAdmins({ type: "DEVICE_DELETED", payload: { deviceId: id } });
    sendUpdateToDevice(id, { type: "DEVICE_REVOKED" });
    res.status(200).json({
      message: "Dispositivo excluído e sessão encerrada com sucesso.",
    });
  } catch (err) {
    logger.error("Erro ao excluir dispositivo:", err);
    res.status(500).json({ message: "Erro ao excluir o dispositivo." });
  }
};

const generateOtp = async (req, res) => {
  const { id } = req.params;
  const otp = crypto.randomInt(100000, 999999).toString();
  const expiresAt = DateTime.now().plus({ minutes: 5 }).toJSDate();

  try {
    const salt = await bcrypt.genSalt(10);
    const otpHash = await bcrypt.hash(otp, salt);
    await deviceService.createOtpForDevice(id, otpHash, expiresAt);
    res.status(200).json({ otp, expiresAt });
  } catch (err) {
    logger.error(`Erro ao gerar OTP para o dispositivo ${id}.`, err);
    res.status(500).json({ message: "Erro ao gerar OTP." });
  }
};

const generateMagicLink = async (req, res) => {
  const { id } = req.params;
  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = DateTime.now().plus({ hours: 24 }).toJSDate();
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
  try {
    await deviceService.createMagicLinkForDevice(id, tokenHash, expiresAt);
    const magicLink = `${req.protocol}://${req.get(
      "host"
    )}/pair/magic?token=${token}`;
    res.status(200).json({ magicLink });
  } catch (err) {
    logger.error("Erro ao gerar link mágico.", err);
    res.status(500).json({ message: "Erro ao gerar link mágico." });
  }
};

const revokeDevice = async (req, res) => {
  const { id } = req.params;
  try {
    await deviceService.revokeDeviceAccess(id);
    const { sendUpdateToDevice, broadcastToAdmins, clients } = req.app.locals;
    sendUpdateToDevice(id, { type: "DEVICE_REVOKED" });

    const fullDeviceDetails = await getFullDeviceDetailsForBroadcast(
      id,
      clients
    );
    if (fullDeviceDetails) {
      broadcastToAdmins({
        type: "DEVICE_UPDATED",
        payload: {
          ...fullDeviceDetails,
          message: `Dispositivo "${fullDeviceDetails.name}" revogado.`,
        },
      });
    }

    res.status(200).json({
      message:
        "Acesso do dispositivo revogado e status atualizado com sucesso.",
    });
  } catch (err) {
    logger.error("Erro ao revogar acesso do dispositivo.", err);
    res.status(500).json({ message: "Erro ao revogar acesso do dispositivo." });
  }
};

const reactivateDevice = async (req, res) => {
  const { id } = req.params;
  try {
    const rowCount = await deviceService.reactivateDevice(id);
    if (rowCount === 0) {
      return res.status(404).json({ message: "Dispositivo não encontrado." });
    }

    const { broadcastToAdmins, clients } = req.app.locals;
    const fullDeviceDetails = await getFullDeviceDetailsForBroadcast(
      id,
      clients
    );
    if (fullDeviceDetails) {
      broadcastToAdmins({
        type: "DEVICE_UPDATED",
        payload: {
          ...fullDeviceDetails,
          message: `Dispositivo "${fullDeviceDetails.name}" reativado.`,
        },
      });
    }

    res.status(200).json({ message: "Dispositivo reativado com sucesso." });
  } catch (err) {
    logger.error("Erro ao reativar o dispositivo.", err);
    res.status(500).json({ message: "Erro ao reativar o dispositivo." });
  }
};

const getDeviceDetails = async (req, res) => {
  const { id } = req.params;
  try {
    const device = await deviceService.getDeviceDetails(id);
    if (!device) {
      return res.status(404).json({ message: "Dispositivo não encontrado." });
    }

    const { clients } = req.app.locals;
    const status = deviceUtils.getDeviceStatus(device, clients);
    const formatOptions = { zone: "America/Sao_Paulo", locale: "pt-BR" };

    const registeredAtFormatted = DateTime.fromJSDate(
      device.registered_at,
      formatOptions
    ).toFormat("dd/MM/yyyy HH:mm:ss");
    const lastSeenFormatted = device.last_seen
      ? DateTime.fromJSDate(device.last_seen, formatOptions).toFormat(
          "dd/MM/yyyy HH:mm:ss"
        )
      : "Nunca";

    res.json({
      ...device,
      registered_at_formatted: registeredAtFormatted,
      last_seen_formatted: lastSeenFormatted,
      status: status,
    });
  } catch (err) {
    logger.error("Erro ao buscar detalhes do dispositivo.", err);
    res.status(500).json({ message: "Erro interno do servidor." });
  }
};

const getDevicePlaylist = async (req, res) => {
  try {
    if (!req.device || !req.device.id) {
      return res.status(401).json({ message: "Dispositivo não autenticado." });
    }
    const { id, company_id, sector_id, device_type } = req.device;

    const playlistData = await deviceService.getDevicePlaylist(
      id,
      company_id,
      sector_id,
      device_type
    );

    if (!playlistData) {
      return res.json(null);
    }

    const etag = crypto
      .createHash("sha1")
      .update(JSON.stringify(playlistData))
      .digest("hex");
    res.setHeader("ETag", etag);

    if (req.headers["if-none-match"] === etag) {
      return res.status(304).end();
    }

    res.setHeader(
      "Cache-Control",
      "no-store, no-cache, must-revalidate, private"
    );
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
    res.json(playlistData);
  } catch (err) {
    logger.error("Erro ao buscar playlist do dispositivo.", err);
    res.status(500).json({ message: "Erro ao buscar playlist." });
  }
};

const getDeviceWeather = async (req, res) => {
  try {
    if (!req.device || !req.device.company_id) {
      return res.status(401).json({ message: "Dispositivo não autenticado." });
    }
    const { company_id } = req.device;
    const company = await companyService.getCompanyById(company_id);
    if (!company) {
      return res.status(404).json({ message: "Empresa não encontrada." });
    }
    const { city, state, cep } = company;
    const weather = await weatherService.getWeather(city, state, cep);
    res.json({ weather, city });
  } catch (err) {
    logger.error("Erro ao buscar clima para o dispositivo.", err);
    res.status(500).json({ message: "Erro ao buscar clima." });
  }
};

const getWsToken = (req, res) => {
  try {
    if (!req.device) {
      return res.status(401).json({ message: "Dispositivo não autenticado." });
    }
    const accessToken = tokenService.generateAccessToken(req.device);
    res.json({ accessToken });
  } catch (err) {
    logger.error("Erro ao gerar token para WebSocket.", err);
    res.status(500).json({ message: "Erro ao gerar token para WebSocket." });
  }
};

module.exports = {
  listDevicesPage,
  createDevice,
  editDevice,
  deleteDevice,
  generateOtp,
  generateMagicLink,
  revokeDevice,
  reactivateDevice,
  getDeviceDetails,
  getDevicePlaylist,
  getDeviceWeather,
  getWsToken,
  sendDeviceCommand,
};
