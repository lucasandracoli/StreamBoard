const db = require("../../config/streamboard");
const logger = require("../utils/logger")
const pairingService = require("../services/pairing.service");
const tokenService = require("../services/token.service");
const { setAuthCookies, deviceAuth } = require("../middlewares/auth.middleware");

const renderPairPage = (req, res) => {
  const { error } = req.query;
  const accessToken = req.cookies.access_token;
  const refreshToken = req.cookies.refresh_token;

  if (req.session.userId) {
    return res.redirect("/dashboard");
  }

  if (accessToken || refreshToken) {
    return deviceAuth(req, res, () => {
      const type = req.device.device_type;
      return res.redirect(type === "terminal_consulta" ? "/price" : "/player");
    });
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
        if(result.error) {
            return res.render("pair", { error: result.error });
        }
        
        const { device } = result;
        const accessToken = tokenService.generateAccessToken(device);
        const refreshToken = tokenService.generateRefreshToken(device);
        
        await db.query("INSERT INTO tokens (device_id, token, refresh_token) VALUES ($1, $2, $3)", [device.id, accessToken, refreshToken]);
        setAuthCookies(res, accessToken, refreshToken);
        
        return res.redirect(device.device_type === "terminal_consulta" ? "/price" : "/player");

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
        if(result.error) {
            return res.render("pair", { error: result.error });
        }
        
        const { device } = result;
        const accessToken = tokenService.generateAccessToken(device);
        const refreshToken = tokenService.generateRefreshToken(device);
        
        await db.query("INSERT INTO tokens (device_id, token, refresh_token) VALUES ($1, $2, $3)", [device.id, accessToken, refreshToken]);
        setAuthCookies(res, accessToken, refreshToken);
        
        return res.redirect(device.device_type === "terminal_consulta" ? "/price" : "/player");
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
             LEFT JOIN campaign_device cd ON c.id = cd.campaign_id
             LEFT JOIN campaign_sector cs ON c.id = cs.campaign_id
             WHERE c.start_date <= NOW() AND c.end_date >= NOW()
             AND (cd.device_id = $1 OR cs.sector_id = $2)`,
            [req.device.id, req.device.sector_id]
        );
        res.render("price", { deviceName: req.device.name, offers: campaignsResult.rows });
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
    renderPricePage
};