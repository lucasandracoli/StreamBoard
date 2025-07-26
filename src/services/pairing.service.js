const db = require("../../config/streamboard");
const bcrypt = require("bcrypt");
const crypto = require("crypto");
const logger = require("../utils/logger")

const pairWithOtp = async (otpCode) => {
    const client = await db.connect();
    try {
        await client.query("BEGIN");
        const otpResult = await client.query( "SELECT * FROM otp_pairing WHERE expires_at > NOW() AND used_at IS NULL");

        let validOtpRecord = null;
        for (const record of otpResult.rows) {
            const match = await bcrypt.compare(otpCode, record.otp_hash);
            if (match) {
                validOtpRecord = record;
                break;
            }
        }

        if (!validOtpRecord) {
            await client.query("ROLLBACK");
            return { error: "Código OTP inválido ou expirado." };
        }

        await client.query("UPDATE otp_pairing SET used_at = NOW() WHERE id = $1", [validOtpRecord.id]);
        const deviceResult = await client.query("SELECT * FROM devices WHERE id = $1 AND is_active = true", [validOtpRecord.device_id]);

        if (deviceResult.rows.length === 0) {
            await client.query("ROLLBACK");
            return { error: "Dispositivo associado não está ativo." };
        }
        
        const device = deviceResult.rows[0];
        await client.query("UPDATE tokens SET is_revoked = TRUE WHERE device_id = $1", [device.id]);
        await client.query("UPDATE devices SET last_seen = NOW() WHERE id = $1", [device.id]);
        
        await client.query("COMMIT");
        return { device };
    } catch (err) {
        await client.query("ROLLBACK");
        logger.error("Erro ao autenticar dispositivo com OTP.", err);
        throw new Error("Erro interno ao validar OTP.");
    } finally {
        client.release();
    }
};

const pairWithMagicLink = async (token) => {
    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
    const client = await db.connect();
    try {
        await client.query("BEGIN");
        const linkResult = await db.query("SELECT * FROM magic_links WHERE token_hash = $1", [tokenHash]);

        if (linkResult.rows.length === 0) {
            await client.query("ROLLBACK");
            return { error: "Link de pareamento inválido ou expirado." };
        }
        const magicLink = linkResult.rows[0];

        if (magicLink.used_at) {
            await client.query("ROLLBACK");
            return { error: "Este link de pareamento já foi utilizado." };
        }
        if (new Date() > new Date(magicLink.expires_at)) {
            await client.query("ROLLBACK");
            return { error: "Este link de pareamento expirou." };
        }

        await client.query("UPDATE magic_links SET used_at = NOW() WHERE id = $1", [magicLink.id]);
        const deviceResult = await client.query("SELECT * FROM devices WHERE id = $1 AND is_active = true", [magicLink.device_id]);

        if (deviceResult.rows.length === 0) {
            await client.query("ROLLBACK");
            return { error: "O dispositivo associado a este link não está ativo." };
        }
        const device = deviceResult.rows[0];
        await client.query("UPDATE tokens SET is_revoked = TRUE WHERE device_id = $1", [device.id]);
        await client.query("UPDATE devices SET last_seen = NOW() WHERE id = $1", [device.id]);
        
        await client.query("COMMIT");
        return { device };
    } catch (err) {
        await client.query("ROLLBACK");
        logger.error("Erro ao autenticar dispositivo com link mágico.", err);
        throw new Error("Erro ao autenticar dispositivo.");
    } finally {
        client.release();
    }
};

module.exports = {
    pairWithOtp,
    pairWithMagicLink
};