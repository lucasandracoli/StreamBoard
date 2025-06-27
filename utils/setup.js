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
    email VARCHAR(255) UNIQUE NOT NULL,
    userRole VARCHAR(20) DEFAULT 'user',
    displayName VARCHAR(100),
    lastLogin TIMESTAMP,
    createdAt TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS devices (
    id SERIAL PRIMARY KEY,
    userId INTEGER REFERENCES users(id),
    deviceName VARCHAR(100),
    deviceType VARCHAR(50),
    isActive BOOLEAN DEFAULT TRUE,
    pairingToken VARCHAR(64) UNIQUE,
    pairedAt TIMESTAMP,
    lastSeen TIMESTAMP,
    createdAt TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS deviceTokens (
    id SERIAL PRIMARY KEY,
    deviceId INTEGER REFERENCES devices(id),
    authToken VARCHAR(256) UNIQUE NOT NULL,
    createdAt TIMESTAMP DEFAULT NOW(),
    expiresAt TIMESTAMP,
    revoked BOOLEAN DEFAULT FALSE
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

    console.log("✅ Banco de dados configurado com sucesso!");
  } catch (err) {
    console.error("❌ Erro durante o setup:", err.message);
  }
};

main();
