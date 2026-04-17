const db = require ('./db');

const createTable = async () => {
  const sql = `
    CREATE TABLE IF NOT EXISTS profiles (
      id UUID PRIMARY KEY,
      name VARCHAR(255) UNIQUE NOT NULL,
      gender VARCHAR(50),
      gender_probability FLOAT,
      sample_size INT,
      age_group VARCHAR(10),
      country_id VARCHAR(10),
      country_probability FLOAT,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );
  `;
  try {
    console.log("Talking to the Railway safe...");
    await db.query(sql);
    console.log("Database table'profiles' is ready!");
    process.exit(0);
  } catch (err) {
    console.error("error creating table", err);
    process.exit(1);
  }
};

createTable();