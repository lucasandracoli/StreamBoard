const logService = require("../services/log.service");
const logger = require("../utils/logger");

const recordPlayback = async (req, res) => {
  const { campaignId, uploadId } = req.body;
  const deviceId = req.device.id;

  if (!campaignId || !uploadId) {
    return res.status(400).json({ message: "Dados de log incompletos." });
  }

  try {
    await logService.createPlayLog(deviceId, campaignId, uploadId);
    res.status(201).json({ message: "Log registrado." });
  } catch (err) {
    logger.error("Erro ao registrar log de exibição.", {
      deviceId,
      campaignId,
      uploadId,
      error: err.message,
    });
    res.status(500).json({ message: "Erro ao registrar log." });
  }
};

module.exports = {
  recordPlayback,
};