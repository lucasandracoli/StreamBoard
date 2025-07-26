const jwt = require("jsonwebtoken");

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRATION = "15m";
const JWT_REFRESH_EXPIRATION = "90d";

const generateAccessToken = (device) => {
  return jwt.sign({ id: device.id }, JWT_SECRET, {
    expiresIn: JWT_EXPIRATION,
  });
};

const generateRefreshToken = (device) => {
  return jwt.sign({ id: device.id }, JWT_SECRET, {
    expiresIn: JWT_REFRESH_EXPIRATION,
  });
};

const verifyToken = (token) => {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (err) {
    return null;
  }
};

module.exports = {
  generateAccessToken,
  generateRefreshToken,
  verifyToken,
};