require("dotenv").config();
const { Client } = require("pg");

const { DB_USER, DB_PASSWORD, DB_HOST, DB_PORT, DB_NAME } = process.env;

const schemaSqlContent = `

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS companies (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    cnpj VARCHAR(18) NOT NULL UNIQUE,
    cep VARCHAR(9),
    address TEXT,
    city VARCHAR(100),
    state VARCHAR(2),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sectors (
    id SERIAL PRIMARY KEY,
    company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (company_id, name)
);

CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    company_id INTEGER REFERENCES companies(id) ON DELETE SET NULL,
    username VARCHAR(100) NOT NULL UNIQUE,
    password VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    user_role VARCHAR(20) DEFAULT 'user' NOT NULL,
    display_name VARCHAR(100),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS devices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    sector_id INTEGER REFERENCES sectors(id) ON DELETE SET NULL,
    name VARCHAR(100) NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    last_seen TIMESTAMPTZ,
    registered_at TIMESTAMPTZ DEFAULT NOW(),
    device_type VARCHAR(30) DEFAULT 'unknown',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS campaigns (
    id SERIAL PRIMARY KEY,
    company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    start_date TIMESTAMPTZ,
    end_date TIMESTAMPTZ,
    layout_type VARCHAR(50) DEFAULT 'fullscreen',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tokens (
    id SERIAL PRIMARY KEY,
    device_id UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
    token TEXT NOT NULL,
    refresh_token TEXT NOT NULL,
    is_revoked BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS campaign_device (
    campaign_id INTEGER NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
    device_id UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
    PRIMARY KEY (campaign_id, device_id)
);

CREATE TABLE IF NOT EXISTS campaign_sector (
    campaign_id INTEGER NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
    sector_id INTEGER NOT NULL REFERENCES sectors(id) ON DELETE CASCADE,
    PRIMARY KEY (campaign_id, sector_id)
);

CREATE TABLE IF NOT EXISTS campaign_uploads (
    id SERIAL PRIMARY KEY,
    campaign_id INTEGER NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
    file_name VARCHAR(255) NOT NULL,
    file_path VARCHAR(500) NOT NULL,
    file_type VARCHAR(50) NOT NULL,
    execution_order INTEGER DEFAULT 0,
    duration INTEGER DEFAULT 10,
    zone VARCHAR(50) DEFAULT 'main',
    uploaded_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS magic_links (
    id SERIAL PRIMARY KEY,
    device_id UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
    token_hash VARCHAR(255) NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS otp_pairing (
    id SERIAL PRIMARY KEY,
    device_id UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
    otp_hash VARCHAR(256) NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS butcher_products (
    id SERIAL PRIMARY KEY,
    company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    product_name VARCHAR(255) NOT NULL,
    price NUMERIC(10, 2) NOT NULL,
    section_id INTEGER NOT NULL,
    section_name VARCHAR(100) NOT NULL,
    last_updated TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (company_id, product_name)
);

CREATE TABLE IF NOT EXISTS "user_sessions" (
  "sid" varchar NOT NULL,
  "sess" json NOT NULL,
  "expire" timestamp(6) NOT NULL,
  CONSTRAINT "session_pkey" PRIMARY KEY ("sid")
);
CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON "user_sessions" ("expire");

CREATE TABLE IF NOT EXISTS play_logs (
    id SERIAL PRIMARY KEY,
    device_id UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
    campaign_id INTEGER NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
    upload_id INTEGER NOT NULL REFERENCES campaign_uploads(id) ON DELETE CASCADE,
    played_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_username ON users (username);
CREATE INDEX IF NOT EXISTS idx_tokens_refresh_token ON tokens (refresh_token);
CREATE INDEX IF NOT EXISTS idx_tokens_device_id ON tokens (device_id);
CREATE INDEX IF NOT EXISTS idx_devices_company_id ON devices (company_id);
CREATE INDEX IF NOT EXISTS idx_devices_sector_id ON devices (sector_id);
CREATE INDEX IF NOT EXISTS idx_sectors_company_id ON sectors (company_id);
CREATE INDEX IF NOT EXISTS idx_campaigns_company_id ON campaigns (company_id);
CREATE INDEX IF NOT EXISTS idx_campaigns_active_period ON campaigns (start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_campaign_device_device_id ON campaign_device (device_id);
CREATE INDEX IF NOT EXISTS idx_campaign_sector_sector_id ON campaign_sector (sector_id);
CREATE INDEX IF NOT EXISTS idx_campaign_uploads_campaign_id ON campaign_uploads (campaign_id);
CREATE INDEX IF NOT EXISTS idx_otp_pairing_device_id ON otp_pairing (device_id);
CREATE INDEX IF NOT EXISTS idx_magic_links_device_id ON magic_links (device_id);
CREATE INDEX IF NOT EXISTS idx_butcher_products_company_id ON butcher_products (company_id);
CREATE INDEX IF NOT EXISTS idx_play_logs_device_id ON play_logs (device_id);
CREATE INDEX IF NOT EXISTS idx_play_logs_campaign_id ON play_logs (campaign_id);
CREATE INDEX IF NOT EXISTS idx_play_logs_upload_id ON play_logs (upload_id);

`;

const resetDatabase = async () => {
  const adminClient = new Client({
    user: DB_USER,
    host: DB_HOST,
    password: DB_PASSWORD,
    port: DB_PORT,
    database: "postgres",
  });

  try {
    await adminClient.connect();
    await adminClient.query(`DROP DATABASE IF EXISTS ${DB_NAME}`);
    await adminClient.query(`CREATE DATABASE ${DB_NAME}`);
  } catch (err) {
    console.error("Erro ao dropar/criar o banco:", err);
    process.exit(1);
  } finally {
    await adminClient.end();
  }
};

const applySchema = async () => {
  const dbClient = new Client({
    user: DB_USER,
    host: DB_HOST,
    password: DB_PASSWORD,
    port: DB_PORT,
    database: DB_NAME,
  });

  try {
    await dbClient.connect();
    await dbClient.query(schemaSqlContent);
  } catch (err) {
    console.error("Erro ao aplicar o schema:", err);
    process.exit(1);
  } finally {
    await dbClient.end();
  }
};

const main = async () => {
  await resetDatabase();
  await applySchema();
};

main();
