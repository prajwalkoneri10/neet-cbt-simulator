const { Pool } = require("pg");
const dotenv = require("dotenv");

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

    // --------------------------------------------------
    // USERS
    // --------------------------------------------------

    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL
      );
    `);

    // --------------------------------------------------
    // PROFILES
    // --------------------------------------------------

    await client.query(`
      CREATE TABLE IF NOT EXISTS profiles (
        user_id INTEGER PRIMARY KEY,
        target_year INTEGER,
        target_score INTEGER,
        preferred_subjects JSONB NOT NULL DEFAULT '[]'::jsonb,
        updated_at TIMESTAMPTZ NOT NULL,

        CONSTRAINT profiles_user_fk
          FOREIGN KEY (user_id)
          REFERENCES users(id)
          ON DELETE CASCADE
      );
    `);

    // --------------------------------------------------
    // MOCK TESTS
    // --------------------------------------------------

    await client.query(`
      CREATE TABLE IF NOT EXISTS mock_tests (
        id BIGSERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL,
        mock_id TEXT NOT NULL,
        name TEXT NOT NULL,
        questions JSONB NOT NULL,
        answer_key JSONB NOT NULL,
        metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL,

        CONSTRAINT mock_tests_user_fk
          FOREIGN KEY (user_id)
          REFERENCES users(id)
          ON DELETE CASCADE,

        CONSTRAINT mock_tests_user_mock_unique
          UNIQUE(user_id, mock_id)
      );
    `);

    // --------------------------------------------------
    // EXAM SESSIONS
    // --------------------------------------------------

    await client.query(`
      CREATE TABLE IF NOT EXISTS exam_sessions (
        id BIGSERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL,
        exam_id TEXT NOT NULL,
        session_data JSONB NOT NULL,
        created_at TIMESTAMPTZ NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL,

        CONSTRAINT exam_sessions_user_fk
          FOREIGN KEY (user_id)
          REFERENCES users(id)
          ON DELETE CASCADE,

        CONSTRAINT exam_sessions_user_exam_unique
          UNIQUE(user_id, exam_id)
      );
    `);

    // --------------------------------------------------
    // ATTEMPT HISTORY
    // --------------------------------------------------

    await client.query(`
      CREATE TABLE IF NOT EXISTS attempt_history (
        id BIGSERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL,
        exam_id TEXT,
        attempt_data JSONB NOT NULL,
        attempted_at TIMESTAMPTZ NOT NULL,

        CONSTRAINT attempt_history_user_fk
          FOREIGN KEY (user_id)
          REFERENCES users(id)
          ON DELETE CASCADE
      );
    `);

    // --------------------------------------------------
    // INDEXES
    // --------------------------------------------------

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_mock_tests_user
      ON mock_tests(user_id);
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_exam_sessions_user
      ON exam_sessions(user_id);
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_attempt_history_user
      ON attempt_history(user_id);
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_attempt_history_attempted_at
      ON attempt_history(attempted_at DESC);
    `);

    await client.query("COMMIT");

    console.log("");
    console.log("======================================");
    console.log("✅ POSTGRESQL DATABASE READY");
    console.log("======================================");
    console.log("Tables created:");
    console.log("✔ users");
    console.log("✔ profiles");
    console.log("✔ mock_tests");
    console.log("✔ exam_sessions");
    console.log("✔ attempt_history");
    console.log("✔ indexes");
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

setupDatabase();