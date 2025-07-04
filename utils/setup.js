require("dotenv").config();
const fs = require("fs");
const path = require("path");
const { Client } = require("pg");

const { DB_USER, DB_PASSWORD, DB_HOST, DB_PORT, DB_NAME } = process.env;

const schemaPath = path.join(__dirname, "../database/schema.sql");

const schemaSqlContent = `
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(100) NOT NULL UNIQUE,
    password VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    user_role VARCHAR(20) DEFAULT 'user',
    display_name VARCHAR(100),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS devices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL,
    device_identifier VARCHAR(100) UNIQUE NOT NULL,
    authentication_key TEXT NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    last_seen TIMESTAMPTZ,
    registered_at TIMESTAMPTZ DEFAULT NOW(),
    device_type VARCHAR(30) DEFAULT 'unknown',
    sector VARCHAR(50),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tokens (
    id SERIAL PRIMARY KEY,
    device_id UUID REFERENCES devices(id) ON DELETE CASCADE,
    token TEXT NOT NULL,
    refresh_token TEXT NOT NULL,
    is_revoked BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS campaigns (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    start_date TIMESTAMPTZ,
    end_date TIMESTAMPTZ,
    midia TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS campaign_device (
    campaign_id INTEGER REFERENCES campaigns(id) ON DELETE CASCADE,
    device_id UUID REFERENCES devices(id) ON DELETE CASCADE,
    execution_order INTEGER,
    PRIMARY KEY (campaign_id, device_id)
);

CREATE TABLE IF NOT EXISTS campaign_uploads (
    id SERIAL PRIMARY KEY,
    campaign_id INTEGER REFERENCES campaigns(id) ON DELETE CASCADE,
    file_name VARCHAR(255) NOT NULL,
    file_path VARCHAR(500) NOT NULL,
    file_type VARCHAR(50) NOT NULL,
    uploaded_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tokens_refresh_token ON tokens (refresh_token);
CREATE INDEX IF NOT EXISTS idx_campaign_device_device_id ON campaign_device (device_id);
`;

const main = async () => {
  const client = new Client({
    user: DB_USER,
    host: DB_HOST,
    password: DB_PASSWORD,
    port: DB_PORT,
  });

  try {
    await client.connect();

    console.log(`Deletando banco de dados "${DB_NAME}" se existir...`);
    await client.query(`DROP DATABASE IF EXISTS ${DB_NAME} WITH (FORCE)`);

    console.log(`Criando banco de dados "${DB_NAME}"...`);
    await client.query(`CREATE DATABASE ${DB_NAME}`);

    console.log(`Banco de dados "${DB_NAME}" recriado com sucesso.`);
    await client.end();

    const dbClient = new Client({
      user: DB_USER,
      host: DB_HOST,
      database: DB_NAME,
      password: DB_PASSWORD,
      port: DB_PORT,
    });

    await dbClient.connect();
    console.log(
      `Conectado ao banco de dados "${DB_NAME}". Aplicando schema...`
    );

    fs.mkdirSync(path.dirname(schemaPath), { recursive: true });
    fs.writeFileSync(schemaPath, schemaSqlContent.trim());

    await dbClient.query(schemaSqlContent);
    await dbClient.end();

    console.log("✅ Database e tabelas configurados com sucesso!");
  } catch (err) {
    console.error("❌ Erro no script de setup:", err.message);
  }
};

main();
