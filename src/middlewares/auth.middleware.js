const db = require("../../config/streamboard");
const logger = require("../utils/logger");
const tokenService = require("../services/token.service");

const JWT_REFRESH_COOKIE_MAX_AGE = 90 * 24 * 60 * 60 * 1000;

const isAuthenticated = async (req, res, next) => {
  if (!req.session.userId) {
    return res.redirect("/login");
  }
  try {
    const result = await db.query(
      "SELECT id, username, user_role FROM users WHERE id = $1",
      [req.session.userId]
    );
    if (result.rows.length === 0) {
      req.session.destroy(() => res.redirect("/login"));
    } else {
      req.user = result.rows[0];
      next();
    }
  } catch (err) {
    logger.error("Erro ao validar sessão do usuário.", err);
    res.status(500).send("Erro ao validar sessão.");
  }
};

const isAdmin = (req, res, next) => {
  if (req.user && req.user.user_role !== "admin") {
    return res.status(403).send("Acesso negado. Você não tem permissão.");
  }
  next();
};

const setAuthCookies = (res, accessToken, refreshToken) => {
  res.cookie("access_token", accessToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    maxAge: 900000,
  });
  res.cookie("refresh_token", refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    maxAge: JWT_REFRESH_COOKIE_MAX_AGE,
  });
};

const deviceAuth = async (req, res, next) => {
  const accessToken = req.cookies.access_token;
  const refreshToken = req.cookies.refresh_token;

  if (accessToken) {
    const payload = tokenService.verifyToken(accessToken);
    if (payload && payload.id) {
      const d = await db.query(
        "SELECT id, name, device_type, company_id, sector_id, is_active FROM devices WHERE id = $1 AND is_active = TRUE",
        [payload.id]
      );
      if (d.rows.length > 0) {
        req.device = d.rows[0];
        return next();
      }
    }
  }

  if (!refreshToken) {
    return res.status(401).redirect("/pair?error=session_expired");
  }

  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const tokenResult = await client.query(
      "SELECT id, device_id FROM tokens WHERE refresh_token = $1 AND is_revoked = false",
      [refreshToken]
    );

    if (tokenResult.rows.length === 0) {
      const oldTokenPayload = tokenService.verifyToken(refreshToken);
      if (oldTokenPayload && oldTokenPayload.id) {
        await client.query(
          "UPDATE tokens SET is_revoked = TRUE WHERE device_id = $1",
          [oldTokenPayload.id]
        );
      }
      await client.query("COMMIT");
      return res.status(403).redirect("/pair?error=compromised_session");
    }

    const storedToken = tokenResult.rows[0];
    await client.query("UPDATE tokens SET is_revoked = TRUE WHERE id = $1", [
      storedToken.id,
    ]);

    const d = await client.query(
      "SELECT id, name, device_type, company_id, sector_id, is_active FROM devices WHERE id = $1 AND is_active = TRUE",
      [storedToken.device_id]
    );
    if (d.rows.length === 0) {
      await client.query("COMMIT");
      res.clearCookie("access_token");
      res.clearCookie("refresh_token");
      return res.redirect("/pair?error=device_not_found");
    }
    const device = d.rows[0];

    const newAccessToken = tokenService.generateAccessToken(device);
    const newRefreshToken = tokenService.generateRefreshToken(device);

    await client.query(
      "INSERT INTO tokens (device_id, token, refresh_token) VALUES ($1, $2, $3)",
      [device.id, newAccessToken, newRefreshToken]
    );
    await client.query("COMMIT");

    setAuthCookies(res, newAccessToken, newRefreshToken);

    req.device = device;
    next();
  } catch (err) {
    await client.query("ROLLBACK");
    logger.error("Erro na autenticação do dispositivo via refresh token.", err);
    return res.status(403).redirect("/pair?error=session_error");
  } finally {
    client.release();
  }
};

module.exports = {
  isAuthenticated,
  isAdmin,
  deviceAuth,
  setAuthCookies,
};