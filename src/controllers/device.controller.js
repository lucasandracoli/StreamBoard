const deviceService = require("../services/device.service");
const tokenService = require("../services/token.service");
const companyService = require("../services/company.service");
const deviceUtils = require("../utils/device.utils");
const logger = require("../utils/logger")
const { DateTime } = require("luxon");
const crypto = require("crypto");
const bcrypt = require("bcrypt");

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
        return res.status(400).json({ message: "Todos os campos são obrigatórios." });
    }
    try {
        await deviceService.createDevice(name, device_type, company_id, sector_id);
        res.json({ message: "Dispositivo cadastrado com sucesso." });
    } catch (err) {
        logger.error("Erro ao cadastrar dispositivo.", err);
        res.status(500).json({ message: "Erro ao cadastrar dispositivo. Tente novamente." });
    }
};

const editDevice = async (req, res) => {
    const { id } = req.params;
    const { name, device_type, company_id, sector_id } = req.body;
     if (!name || !device_type || !company_id || !sector_id) {
        return res.status(400).json({ message: "Todos os campos são obrigatórios." });
    }
    try {
        const oldDevice = await deviceService.getDeviceById(id);
        if (!oldDevice) {
            return res.status(404).json({ message: "Dispositivo não encontrado." });
        }
        
        await deviceService.updateDevice(id, req.body);
        
        if (oldDevice.device_type !== device_type) {
            const { sendUpdateToDevice } = req.app.locals;
            sendUpdateToDevice(id, {
                type: "TYPE_CHANGED",
                payload: { newType: device_type },
            });
        }
        res.json({ message: "Dispositivo atualizado com sucesso." });
    } catch (err) {
        logger.error("Erro ao atualizar dispositivo.", err);
        res.status(500).json({ message: "Erro ao atualizar dispositivo. Tente novamente." });
    }
};

const deleteDevice = async (req, res) => {
    const { id } = req.params;
    try {
        await deviceService.deleteDevice(id);
        const { sendUpdateToDevice } = req.app.locals;
        sendUpdateToDevice(id, { type: "DEVICE_REVOKED" });
        res.status(200).json({ message: "Dispositivo excluído e sessão encerrada com sucesso." });
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
        const magicLink = `${req.protocol}://${req.get("host")}/pair/magic?token=${token}`;
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
        const { sendUpdateToDevice } = req.app.locals;
        sendUpdateToDevice(id, { type: "DEVICE_REVOKED" });
        res.status(200).json({ message: "Acesso do dispositivo revogado e status atualizado com sucesso." });
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
        
        const registeredAtFormatted = DateTime.fromJSDate(device.registered_at, formatOptions).toFormat("dd/MM/yyyy HH:mm:ss");
        const lastSeenFormatted = device.last_seen
            ? DateTime.fromJSDate(device.last_seen, formatOptions).toFormat("dd/MM/yyyy HH:mm:ss")
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
        const { id, company_id, sector_id } = req.device;
        const playlist = await deviceService.getDevicePlaylist(id, company_id, sector_id);
        res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, private");
        res.setHeader("Pragma", "no-cache");
        res.setHeader("Expires", "0");
        res.json(playlist);
    } catch (err) {
        logger.error("Erro ao buscar playlist do dispositivo.", err);
        res.status(500).json({ message: "Erro ao buscar playlist." });
    }
};

const getWsToken = (req, res) => {
    try {
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
    getWsToken,
};