const Database = require("better-sqlite3");
const { Pool } = require("pg");
const dotenv = require("dotenv");

dotenv.config();

// --------------------------------------------------
// CONFIG
// --------------------------------------------------

const sqlite = new Database("./neet.sqlite");

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL is missing from server/.env"
  );
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false,
  },
});

// --------------------------------------------------
// HELPERS
// --------------------------------------------------

function parseJson(value, fallback) {
  if (value == null) {
    return fallback;
  }

  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

// --------------------------------------------------
// MAIN MIGRATION
// --------------------------------------------------

async function migrate() {
  const client = await pool.connect();

  try {
    console.log("");
    console.log("======================================");
    console.log(" SQLITE → POSTGRESQL MIGRATION");
    console.log("======================================");
    console.log("");

    await client.query("BEGIN");

    // ------------------------------------------------
    // USERS
    // ------------------------------------------------

    console.log("Migrating users...");

    const users = sqlite
      .prepare(`
        SELECT
          id,
          name,
          email,
          password_hash,
          created_at
        FROM users
        ORDER BY id
      `)
      .all();

    const userIdMap = new Map();

    for (const user of users) {
      const existing = await client.query(
        `
        SELECT id
        FROM users
        WHERE email = $1
        `,
        [user.email]
      );

      let postgresUserId;

      if (existing.rows.length > 0) {
        postgresUserId =
          existing.rows[0].id;

        console.log(
          `  ↳ Existing user: ${user.email}`
        );
      } else {
        const result =
          await client.query(
            `
            INSERT INTO users (
              name,
              email,
              password_hash,
              created_at
            )
            VALUES (
              $1,
              $2,
              $3,
              $4
            )
            RETURNING id
            `,
            [
              user.name,
              user.email,
              user.password_hash,
              user.created_at,
            ]
          );

        postgresUserId =
          result.rows[0].id;

        console.log(
          `  ✓ Migrated user: ${user.email}`
        );
      }

      userIdMap.set(
        Number(user.id),
        Number(postgresUserId)
      );
    }

    // ------------------------------------------------
    // PROFILES
    // ------------------------------------------------

    console.log("");
    console.log("Migrating profiles...");

    const profiles = sqlite
      .prepare(`
        SELECT
          user_id,
          target_year,
          target_score,
          preferred_subjects,
          updated_at
        FROM profiles
      `)
      .all();

    for (const profile of profiles) {
      const postgresUserId =
        userIdMap.get(
          Number(profile.user_id)
        );

      if (!postgresUserId) {
        console.log(
          `  ⚠ Skipping profile for user ${profile.user_id}`
        );
        continue;
      }

      await client.query(
        `
        INSERT INTO profiles (
          user_id,
          target_year,
          target_score,
          preferred_subjects,
          updated_at
        )
        VALUES (
          $1,
          $2,
          $3,
          $4::jsonb,
          $5
        )
        ON CONFLICT (user_id)
        DO UPDATE SET
          target_year =
            EXCLUDED.target_year,
          target_score =
            EXCLUDED.target_score,
          preferred_subjects =
            EXCLUDED.preferred_subjects,
          updated_at =
            EXCLUDED.updated_at
        `,
        [
          postgresUserId,
          profile.target_year,
          profile.target_score,
          JSON.stringify(
            parseJson(
              profile.preferred_subjects,
              []
            )
          ),
          profile.updated_at,
        ]
      );
    }

    console.log(
      `  ✓ Profiles processed: ${profiles.length}`
    );

    // ------------------------------------------------
    // MOCK TESTS
    // ------------------------------------------------

    console.log("");
    console.log("Migrating mock tests...");

    const mockTests = sqlite
      .prepare(`
        SELECT
          user_id,
          mock_id,
          name,
          questions,
          answer_key,
          metadata,
          created_at,
          updated_at
        FROM mock_tests
      `)
      .all();

    let migratedMocks = 0;

    for (const mock of mockTests) {
      const postgresUserId =
        userIdMap.get(
          Number(mock.user_id)
        );

      if (!postgresUserId) {
        console.log(
          `  ⚠ Skipping mock ${mock.mock_id}`
        );
        continue;
      }

      await client.query(
        `
        INSERT INTO mock_tests (
          user_id,
          mock_id,
          name,
          questions,
          answer_key,
          metadata,
          created_at,
          updated_at
        )
        VALUES (
          $1,
          $2,
          $3,
          $4::jsonb,
          $5::jsonb,
          $6::jsonb,
          $7,
          $8
        )
        ON CONFLICT (user_id, mock_id)
        DO UPDATE SET
          name =
            EXCLUDED.name,
          questions =
            EXCLUDED.questions,
          answer_key =
            EXCLUDED.answer_key,
          metadata =
            EXCLUDED.metadata,
          updated_at =
            EXCLUDED.updated_at
        `,
        [
          postgresUserId,
          String(mock.mock_id),
          mock.name,
          JSON.stringify(
            parseJson(
              mock.questions,
              []
            )
          ),
          JSON.stringify(
            parseJson(
              mock.answer_key,
              {}
            )
          ),
          JSON.stringify(
            parseJson(
              mock.metadata,
              {}
            )
          ),
          mock.created_at,
          mock.updated_at,
        ]
      );

      migratedMocks++;
    }

    console.log(
      `  ✓ Mock tests processed: ${migratedMocks}`
    );

    // ------------------------------------------------
    // EXAM SESSIONS
    // ------------------------------------------------

    console.log("");
    console.log("Migrating exam sessions...");

    const sessions = sqlite
      .prepare(`
        SELECT
          user_id,
          exam_id,
          session_data,
          created_at,
          updated_at
        FROM exam_sessions
      `)
      .all();

    let migratedSessions = 0;

    for (const session of sessions) {
      const postgresUserId =
        userIdMap.get(
          Number(session.user_id)
        );

      if (!postgresUserId) {
        console.log(
          `  ⚠ Skipping session ${session.exam_id}`
        );
        continue;
      }

      await client.query(
        `
        INSERT INTO exam_sessions (
          user_id,
          exam_id,
          session_data,
          created_at,
          updated_at
        )
        VALUES (
          $1,
          $2,
          $3::jsonb,
          $4,
          $5
        )
        ON CONFLICT (user_id, exam_id)
        DO UPDATE SET
          session_data =
            EXCLUDED.session_data,
          updated_at =
            EXCLUDED.updated_at
        `,
        [
          postgresUserId,
          String(session.exam_id),
          JSON.stringify(
            parseJson(
              session.session_data,
              {}
            )
          ),
          session.created_at,
          session.updated_at,
        ]
      );

      migratedSessions++;
    }

    console.log(
      `  ✓ Exam sessions processed: ${migratedSessions}`
    );

    // ------------------------------------------------
    // ATTEMPT HISTORY
    // ------------------------------------------------

    console.log("");
    console.log("Migrating attempt history...");

    const attempts = sqlite
      .prepare(`
        SELECT
          user_id,
          exam_id,
          attempt_data,
          attempted_at
        FROM attempt_history
        ORDER BY id
      `)
      .all();

    let migratedAttempts = 0;

    for (const attempt of attempts) {
      const postgresUserId =
        userIdMap.get(
          Number(attempt.user_id)
        );

      if (!postgresUserId) {
        console.log(
          `  ⚠ Skipping attempt`
        );
        continue;
      }

      await client.query(
        `
        INSERT INTO attempt_history (
          user_id,
          exam_id,
          attempt_data,
          attempted_at
        )
        VALUES (
          $1,
          $2,
          $3::jsonb,
          $4
        )
        `,
        [
          postgresUserId,
          attempt.exam_id != null
            ? String(attempt.exam_id)
            : null,
          JSON.stringify(
            parseJson(
              attempt.attempt_data,
              {}
            )
          ),
          attempt.attempted_at,
        ]
      );

      migratedAttempts++;
    }

    console.log(
      `  ✓ Attempts processed: ${migratedAttempts}`
    );

    // ------------------------------------------------
    // COMMIT
    // ------------------------------------------------

    await client.query("COMMIT");

    console.log("");
    console.log("======================================");
    console.log("✅ MIGRATION COMPLETED");
    console.log("======================================");
    console.log(
      `Users:          ${users.length}`
    );
    console.log(
      `Profiles:       ${profiles.length}`
    );
    console.log(
      `Mock Tests:     ${migratedMocks}`
    );
    console.log(
      `Exam Sessions:  ${migratedSessions}`
    );
    console.log(
      `Attempts:       ${migratedAttempts}`
    );
    console.log("======================================");
    console.log("");
    console.log(
      "Original SQLite database was NOT modified."
    );
    console.log("");
  } catch (error) {
    await client.query("ROLLBACK");

    console.error("");
    console.error("❌ MIGRATION FAILED");
    console.error(error);
    console.error("");
    console.error(
      "PostgreSQL transaction rolled back."
    );

    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
    sqlite.close();
  }
}

migrate();