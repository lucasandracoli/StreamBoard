const { Pool } = require("pg");

const pool = new Pool({
  host: process.env.PG_HOST,
  port: parseInt(process.env.PG_PORT, 10) || 5432,
  user: process.env.PG_USER,
  password: process.env.PG_PASSWORD,
  database: process.env.PG_DATABASE,
  max: parseInt(process.env.PG_CONNECTION_LIMIT, 10) || 10,
  idleTimeoutMillis: parseInt(process.env.PG_IDLE_TIMEOUT, 10) || 30000,
  connectionTimeoutMillis: parseInt(process.env.PG_CONNECT_TIMEOUT, 10) || 2000,
});

module.exports = pool;
