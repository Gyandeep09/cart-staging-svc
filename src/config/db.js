const { Pool } = require("pg");
require("dotenv").config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false,
  },
});

pool.on("connect", () => {
  console.log("[Cart-Checkout] PostgreSQL pool connected.");
});

pool.on("error", (err) => {
  console.error("[Cart-Checkout] Unexpected PG pool error:", err);
  process.exit(-1);
});

module.exports = pool;
