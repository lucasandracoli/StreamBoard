const db = require("../../config/streamboard");
const bcrypt = require("bcrypt");
const logger = require("../utils/logger")

const findAndValidateUser = async (username, password) => {
  const result = await db.query("SELECT * FROM users WHERE username = $1", [
    username,
  ]);
  if (result.rows.length > 0) {
    const user = result.rows[0];
    const match = await bcrypt.compare(password, user.password);
    if (match) {
      return user;
    }
  }
  return null;
};

const revokeRefreshToken = async (refreshToken) => {
  try {
    await db.query(
      "UPDATE tokens SET is_revoked = TRUE WHERE refresh_token = $1",
      [refreshToken]
    );
  } catch (err) {
    logger.error("Erro ao revogar token durante o logout.", err);
  }
};

module.exports = {
  findAndValidateUser,
  revokeRefreshToken,
};