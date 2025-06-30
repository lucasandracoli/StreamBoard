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
    last_login TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS companies (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    cnpj VARCHAR(20) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    cep VARCHAR(20),
    city VARCHAR(100),
    state VARCHAR(50),
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS devices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL,
    device_identifier VARCHAR(100) UNIQUE NOT NULL,
    authentication_key TEXT NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    last_seen TIMESTAMP,
    registered_at TIMESTAMP DEFAULT NOW(),
    device_type VARCHAR(30) DEFAULT 'unknown',
    sector VARCHAR(50),  -- Campo do setor do dispositivo
    company_id INTEGER REFERENCES companies(id) ON DELETE SET NULL, -- Relacionando dispositivo com a empresa
    created_at TIMESTAMP DEFAULT NOW() -- Data de criação do dispositivo
);

CREATE TABLE IF NOT EXISTS device_tokens (
    id SERIAL PRIMARY KEY,
    device_id UUID REFERENCES devices(id) ON DELETE CASCADE,
    token TEXT NOT NULL,
    refresh_token TEXT NOT NULL,
    is_revoked BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT NOW()
);
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
    await client.query(`DROP DATABASE IF EXISTS ${DB_NAME}`);
    await client.query(`CREATE DATABASE ${DB_NAME}`);
    await client.end();

    const dbClient = new Client({
      user: DB_USER,
      host: DB_HOST,
      database: DB_NAME,
      password: DB_PASSWORD,
      port: DB_PORT,
    });

    await dbClient.connect();
    fs.mkdirSync(path.dirname(schemaPath), { recursive: true });
    fs.writeFileSync(schemaPath, schemaSqlContent.trim());

    const schemaSql = fs.readFileSync(schemaPath, "utf8");
    await dbClient.query(schemaSql);
    await dbClient.end();

    console.log("✅ Database successfully initialized!");
  } catch (err) {
    console.error("❌ Setup error:", err.message);
  }
};

main();
