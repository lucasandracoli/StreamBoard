require("dotenv").config();
const fs = require("fs");
const path = require("path");
const { Client } = require("pg");

const { DB_USER, DB_PASSWORD, DB_HOST, DB_PORT, DB_NAME } = process.env;

const schemaPath = path.join(__dirname, "../database/schema.sql");

const schemaSqlContent = `
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(100) NOT NULL UNIQUE,
    password VARCHAR(255) NOT NULL,
    role VARCHAR(20) DEFAULT 'user',
    displayName VARCHAR(100),
    createdAt TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS devices (
    id SERIAL PRIMARY KEY,
    userId INTEGER REFERENCES users(id),
    name VARCHAR(100),
    isActive BOOLEAN DEFAULT TRUE,
    pairingToken VARCHAR(64) UNIQUE,
    pairedAt TIMESTAMP,
    lastSeen TIMESTAMP,
    createdAt TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS deviceTokens (
    id SERIAL PRIMARY KEY,
    deviceId INTEGER REFERENCES devices(id),
    authToken VARCHAR(64) UNIQUE NOT NULL,
    createdAt TIMESTAMP DEFAULT NOW(),
    revoked BOOLEAN DEFAULT FALSE
);
`;

const main = async () => {
  console.log("🔧 Iniciando setup do banco de dados...");

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
    console.log("📦 Executando script de criação de tabelas...");
    await dbClient.query(schemaSql);
    await dbClient.end();

    console.log("✅ Banco de dados configurado com sucesso!");
  } catch (err) {
    console.error("❌ Erro durante o setup:", err.message);
  }
};

main();
