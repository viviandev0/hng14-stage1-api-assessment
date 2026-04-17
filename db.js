const { Pool } = require('pg');

// We are defining the URL here directly so the disappearing .env doesn't matter
const pool = new Pool({
  connectionString: "postgresql://postgres:YLYWPSqHVqoVSoVbqzBmrPCLtTLqHPmj@yamanote.proxy.rlwy.net:49861/railway",
  // connectionString: "postgresql://postgres:YLYWPSqHVqoVSoVbqzBmrPCLtTLqHPmj@yamanote.proxy.rlwy.net:49861/railway";
  ssl: {
    rejectUnauthorized: false
  },
  connectionTimeoutMillis: 30000 
});

module.exports = {
  query: (text, params) => pool.query(text, params),
};