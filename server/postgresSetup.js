const { Pool } = require("pg");
const dotenv = require("dotenv");
const { runMigrations } = require("./migrations");

dotenv.config();

if (!process.env.DATABASE_URL) {
  console.error("❌ DATABASE_URL is missing from server/.env");
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false,
  },
});

async function setupDatabase() {
  const client = await pool.connect();

  try {
    console.log("🔌 Connecting to PostgreSQL...");

    await client.query("BEGIN");
    await runMigrations(client);
    await client.query("COMMIT");

    console.log("");
    console.log("======================================");
    console.log("✅ POSTGRESQL DATABASE READY");
    console.log("======================================");
    console.log("Tables verified / updated:");
    console.log("✔ users");
    console.log("✔ profiles");
    console.log("✔ question_sets");
    console.log("✔ questions");
    console.log("✔ answer_keys");
    console.log("✔ test_attempts");
    console.log("✔ attempt_answers");
    console.log("✔ mock_tests");
    console.log("✔ exam_sessions");
    console.log("✔ attempt_history");
    console.log("✔ password_reset_tokens");
    console.log("✔ performance indexes");
    console.log("======================================");
    console.log("");
  } catch (error) {
    await client.query("ROLLBACK");

    console.error("");
    console.error("❌ PostgreSQL setup failed.");
    console.error(error.message);
    console.error("");

    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

if (require.main === module) {
  setupDatabase();
}

module.exports = { setupDatabase };
