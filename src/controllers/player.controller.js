const db = require("../../config/streamboard");
const logger = require("../utils/logger");
const pairingService = require("../services/pairing.service");
const tokenService = require("../services/token.service");
const {
  setAuthCookies,
  deviceAuth,
} = require("../middlewares/auth.middleware");

const renderPairPage = (req, res) => {
  const { error } = req.query;

  if (req.session.userId) {
    return res.redirect("/dashboard");
  }

  res.clearCookie("access_token");
  res.clearCookie("refresh_token");
  res.render("pair", { error });
};

const handleOtpPairing = async (req, res) => {
  const { otp_code } = req.body;
  if (!otp_code) {
    return res.render("pair", { error: "O código OTP é obrigatório." });
  }

  try {
    const result = await pairingService.pairWithOtp(otp_code);
    if (result.error) {
      return res.render("pair", { error: result.error });
    }

    const { device } = result;
    const accessToken = tokenService.generateAccessToken(device);
    const refreshToken = tokenService.generateRefreshToken(device);

    await db.query(
      "INSERT INTO tokens (device_id, token, refresh_token) VALUES ($1, $2, $3)",
      [device.id, accessToken, refreshToken]
    );
    setAuthCookies(res, accessToken, refreshToken);

    const { broadcastToAdmins } = req.app.locals;
    broadcastToAdmins({
      type: "DEVICE_NEWLY_ACTIVE",
      payload: { deviceId: device.id, deviceName: device.name },
    });

    const redirectUrl =
      device.device_type === "terminal_consulta"
        ? "/price?paired=true"
        : "/player?paired=true";
    return res.redirect(redirectUrl);
  } catch (err) {
    res.render("pair", { error: err.message });
  }
};

const handleMagicLinkPairing = async (req, res) => {
  const { token } = req.query;
  if (!token) {
    return res.status(400).send("Token não fornecido.");
  }

  try {
    const result = await pairingService.pairWithMagicLink(token);
    if (result.error) {
      return res.render("pair", { error: result.error });
    }

    const { device } = result;
    const accessToken = tokenService.generateAccessToken(device);
    const refreshToken = tokenService.generateRefreshToken(device);

    await db.query(
      "INSERT INTO tokens (device_id, token, refresh_token) VALUES ($1, $2, $3)",
      [device.id, accessToken, refreshToken]
    );
    setAuthCookies(res, accessToken, refreshToken);

    const { broadcastToAdmins } = req.app.locals;
    broadcastToAdmins({
      type: "DEVICE_NEWLY_ACTIVE",
      payload: { deviceId: device.id, deviceName: device.name },
    });

    const redirectUrl =
      device.device_type === "terminal_consulta"
        ? "/price?paired=true"
        : "/player?paired=true";
    return res.redirect(redirectUrl);
  } catch (err) {
    res.render("pair", { error: err.message });
  }
};

const renderPlayerPage = async (req, res) => {
  if (req.device.device_type === "terminal_consulta") {
    return res.redirect("/price");
  }
  res.render("player", { deviceName: req.device.name });
};

const renderPricePage = async (req, res) => {
  if (req.device.device_type !== "terminal_consulta") {
    return res.redirect("/player");
  }
  try {
    const campaignsResult = await db.query(
      `SELECT c.* FROM campaigns c
             WHERE
                 c.company_id = $1 AND
                 c.start_date <= NOW() AND
                 c.end_date >= NOW() AND
                 (
                     (NOT EXISTS (SELECT 1 FROM campaign_device cd WHERE cd.campaign_id = c.id) AND
                      NOT EXISTS (SELECT 1 FROM campaign_sector cs WHERE cs.campaign_id = c.id))
                     OR
                     EXISTS (SELECT 1 FROM campaign_device cd WHERE cd.campaign_id = c.id AND cd.device_id = $2)
                     OR
                     EXISTS (SELECT 1 FROM campaign_sector cs WHERE cs.campaign_id = c.id AND cs.sector_id = $3)
                 )`,
      [req.device.company_id, req.device.id, req.device.sector_id]
    );
    res.render("price", {
      deviceName: req.device.name,
      offers: campaignsResult.rows,
    });
  } catch (err) {
    logger.error("Erro ao carregar a página de busca de preço.", err);
    res.status(500).send("Erro ao carregar dispositivo.");
  }
};

module.exports = {
  renderPairPage,
  handleOtpPairing,
  handleMagicLinkPairing,
  renderPlayerPage,
  renderPricePage,
};