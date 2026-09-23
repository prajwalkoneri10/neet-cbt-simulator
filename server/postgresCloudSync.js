const { Pool } = require("pg");
const dotenv = require("dotenv");

dotenv.config();

// --------------------------------------------------
// POSTGRESQL CONNECTION
// --------------------------------------------------

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is missing from server/.env");
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false,
  },
});

// --------------------------------------------------
// MOCK TESTS
// --------------------------------------------------

async function getMockTests(userId) {
  const result = await pool.query(
    `
    SELECT
      mock_id,
      name,
      questions,
      answer_key,
      metadata,
      created_at,
      updated_at
    FROM mock_tests
    WHERE user_id = $1
    ORDER BY updated_at DESC
    `,
    [userId]
  );

  return result.rows.map((row) => ({
    id: row.mock_id,
    name: row.name,
    questions: row.questions,
    answerKey: row.answer_key,
    metadata: row.metadata || {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

async function saveMockTest(userId, mockTest) {
  const now = new Date().toISOString();

  const mockId = String(mockTest.id);

  const name = String(
    mockTest.name || "Untitled Mock Test"
  );

  const questions = Array.isArray(mockTest.questions)
    ? mockTest.questions
    : [];

  const answerKey =
    mockTest.answerKey &&
    typeof mockTest.answerKey === "object"
      ? mockTest.answerKey
      : {};

  const metadata =
    mockTest.metadata &&
    typeof mockTest.metadata === "object"
      ? mockTest.metadata
      : {};

  await pool.query(
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
      name = EXCLUDED.name,
      questions = EXCLUDED.questions,
      answer_key = EXCLUDED.answer_key,
      metadata = EXCLUDED.metadata,
      updated_at = EXCLUDED.updated_at
    `,
    [
      userId,
      mockId,
      name,
      JSON.stringify(questions),
      JSON.stringify(answerKey),
      JSON.stringify(metadata),
      now,
      now,
    ]
  );

  const mocks = await getMockTests(userId);

  return mocks.find(
    (mock) => mock.id === mockId
  );
}

async function deleteMockTest(userId, mockId) {
  const result = await pool.query(
    `
    DELETE FROM mock_tests
    WHERE user_id = $1
    AND mock_id = $2
    `,
    [userId, String(mockId)]
  );

  return result.rowCount > 0;
}

// --------------------------------------------------
// EXAM SESSIONS
// --------------------------------------------------

async function getExamSessions(userId) {
  const result = await pool.query(
    `
    SELECT
      exam_id,
      session_data,
      created_at,
      updated_at
    FROM exam_sessions
    WHERE user_id = $1
    ORDER BY updated_at DESC
    `,
    [userId]
  );

  return result.rows.map((row) => ({
    examId: row.exam_id,
    sessionData: row.session_data,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

async function saveExamSession(
  userId,
  examId,
  sessionData
) {
  const now = new Date().toISOString();

  const id = String(examId);

  const existing = await pool.query(
    `
    SELECT created_at
    FROM exam_sessions
    WHERE user_id = $1
    AND exam_id = $2
    `,
    [userId, id]
  );

  const createdAt =
    existing.rows[0]?.created_at || now;

  await pool.query(
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
      session_data = EXCLUDED.session_data,
      updated_at = EXCLUDED.updated_at
    `,
    [
      userId,
      id,
      JSON.stringify(sessionData),
      createdAt,
      now,
    ]
  );

  return {
    examId: id,
    sessionData,
    createdAt,
    updatedAt: now,
  };
}

async function deleteExamSession(
  userId,
  examId
) {
  const result = await pool.query(
    `
    DELETE FROM exam_sessions
    WHERE user_id = $1
    AND exam_id = $2
    `,
    [userId, String(examId)]
  );

  return result.rowCount > 0;
}

// --------------------------------------------------
// ATTEMPT HISTORY
// --------------------------------------------------

async function getAttemptHistory(userId) {
  const result = await pool.query(
    `
    SELECT
      id,
      exam_id,
      attempt_data,
      attempted_at
    FROM attempt_history
    WHERE user_id = $1
    ORDER BY attempted_at DESC
    `,
    [userId]
  );

  return result.rows.map((row) => ({
    id: row.id,
    examId: row.exam_id,
    ...row.attempt_data,
    attemptedAt: row.attempted_at,
  }));
}

async function saveAttempt(userId, attempt) {
  const attemptedAt =
    attempt.timestamp ||
    attempt.attemptedAt ||
    new Date().toISOString();

  const examId =
    attempt.examId != null
      ? String(attempt.examId)
      : null;

  const attemptData = {
    ...attempt,
    timestamp: attemptedAt,
  };

  delete attemptData.id;
  delete attemptData.examId;
  delete attemptData.attemptedAt;

  const result = await pool.query(
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
    RETURNING id
    `,
    [
      userId,
      examId,
      JSON.stringify(attemptData),
      attemptedAt,
    ]
  );

  return {
    id: result.rows[0].id,
    examId,
    ...attemptData,
    attemptedAt,
  };
}

async function deleteAttemptHistory(userId) {
  const result = await pool.query(
    `
    DELETE FROM attempt_history
    WHERE user_id = $1
    `,
    [userId]
  );

  return result.rowCount;
}

// --------------------------------------------------
// CONNECTION TEST
// --------------------------------------------------

async function testConnection() {
  const result = await pool.query(
    "SELECT NOW() AS current_time"
  );

  return result.rows[0];
}

// --------------------------------------------------
// EXPORT
// --------------------------------------------------

module.exports = {
  pool,
  getMockTests,
  saveMockTest,
  deleteMockTest,
  getExamSessions,
  saveExamSession,
  deleteExamSession,
  getAttemptHistory,
  saveAttempt,
  deleteAttemptHistory,
  testConnection,
};