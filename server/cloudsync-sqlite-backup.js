const Database = require("better-sqlite3");
const path = require("path");

// --------------------------------------------------
// DATABASE
// --------------------------------------------------

const dbPath = path.join(__dirname, "neet.sqlite");

const db = new Database(dbPath);

db.pragma("foreign_keys = ON");

// --------------------------------------------------
// CLOUD SYNC TABLES
// --------------------------------------------------

db.exec(`
  CREATE TABLE IF NOT EXISTS mock_tests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    mock_id TEXT NOT NULL,
    name TEXT NOT NULL,
    questions TEXT NOT NULL,
    answer_key TEXT NOT NULL,
    metadata TEXT DEFAULT '{}',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,

    FOREIGN KEY (user_id)
      REFERENCES users(id)
      ON DELETE CASCADE,

    UNIQUE(user_id, mock_id)
  );

  CREATE TABLE IF NOT EXISTS exam_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    exam_id TEXT NOT NULL,
    session_data TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,

    FOREIGN KEY (user_id)
      REFERENCES users(id)
      ON DELETE CASCADE,

    UNIQUE(user_id, exam_id)
  );

  CREATE TABLE IF NOT EXISTS attempt_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    exam_id TEXT,
    attempt_data TEXT NOT NULL,
    attempted_at TEXT NOT NULL,

    FOREIGN KEY (user_id)
      REFERENCES users(id)
      ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_mock_tests_user
  ON mock_tests(user_id);

  CREATE INDEX IF NOT EXISTS idx_exam_sessions_user
  ON exam_sessions(user_id);

  CREATE INDEX IF NOT EXISTS idx_attempt_history_user
  ON attempt_history(user_id);
`);

console.log("Cloud sync tables ready.");

// --------------------------------------------------
// MOCK TESTS
// --------------------------------------------------

function getMockTests(userId) {
  const rows = db
    .prepare(
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
      WHERE user_id = ?
      ORDER BY updated_at DESC
      `
    )
    .all(userId);

  return rows.map((row) => ({
    id: row.mock_id,
    name: row.name,
    questions: JSON.parse(row.questions),
    answerKey: JSON.parse(row.answer_key),
    metadata: JSON.parse(row.metadata || "{}"),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

function saveMockTest(userId, mockTest) {
  const now = new Date().toISOString();

  const mockId = String(mockTest.id);

  const name = String(mockTest.name || "Untitled Mock Test");

  const questions = Array.isArray(mockTest.questions)
    ? mockTest.questions
    : [];

  const answerKey = mockTest.answerKey || {};

  const metadata =
    mockTest.metadata && typeof mockTest.metadata === "object"
      ? mockTest.metadata
      : {};

  db.prepare(
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
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)

    ON CONFLICT(user_id, mock_id)
    DO UPDATE SET
      name = excluded.name,
      questions = excluded.questions,
      answer_key = excluded.answer_key,
      metadata = excluded.metadata,
      updated_at = excluded.updated_at
    `
  ).run(
    userId,
    mockId,
    name,
    JSON.stringify(questions),
    JSON.stringify(answerKey),
    JSON.stringify(metadata),
    now,
    now
  );

  return getMockTests(userId).find(
    (mock) => mock.id === mockId
  );
}

function deleteMockTest(userId, mockId) {
  const result = db
    .prepare(
      `
      DELETE FROM mock_tests
      WHERE user_id = ?
      AND mock_id = ?
      `
    )
    .run(userId, String(mockId));

  return result.changes > 0;
}

// --------------------------------------------------
// EXAM SESSIONS
// --------------------------------------------------

function getExamSessions(userId) {
  const rows = db
    .prepare(
      `
      SELECT
        exam_id,
        session_data,
        created_at,
        updated_at
      FROM exam_sessions
      WHERE user_id = ?
      ORDER BY updated_at DESC
      `
    )
    .all(userId);

  return rows.map((row) => ({
    examId: row.exam_id,
    sessionData: JSON.parse(row.session_data),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

function saveExamSession(userId, examId, sessionData) {
  const now = new Date().toISOString();

  const existing = db
    .prepare(
      `
      SELECT created_at
      FROM exam_sessions
      WHERE user_id = ?
      AND exam_id = ?
      `
    )
    .get(userId, String(examId));

  const createdAt = existing?.created_at || now;

  db.prepare(
    `
    INSERT INTO exam_sessions (
      user_id,
      exam_id,
      session_data,
      created_at,
      updated_at
    )
    VALUES (?, ?, ?, ?, ?)

    ON CONFLICT(user_id, exam_id)
    DO UPDATE SET
      session_data = excluded.session_data,
      updated_at = excluded.updated_at
    `
  ).run(
    userId,
    String(examId),
    JSON.stringify(sessionData),
    createdAt,
    now
  );

  return {
    examId: String(examId),
    sessionData,
    createdAt,
    updatedAt: now,
  };
}

function deleteExamSession(userId, examId) {
  const result = db
    .prepare(
      `
      DELETE FROM exam_sessions
      WHERE user_id = ?
      AND exam_id = ?
      `
    )
    .run(userId, String(examId));

  return result.changes > 0;
}

// --------------------------------------------------
// ATTEMPT HISTORY
// --------------------------------------------------

function getAttemptHistory(userId) {
  const rows = db
    .prepare(
      `
      SELECT
        id,
        exam_id,
        attempt_data,
        attempted_at
      FROM attempt_history
      WHERE user_id = ?
      ORDER BY attempted_at DESC
      `
    )
    .all(userId);

  return rows.map((row) => ({
    id: row.id,
    examId: row.exam_id,
    ...JSON.parse(row.attempt_data),
    attemptedAt: row.attempted_at,
  }));
}

function saveAttempt(userId, attempt) {
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

  const result = db
    .prepare(
      `
      INSERT INTO attempt_history (
        user_id,
        exam_id,
        attempt_data,
        attempted_at
      )
      VALUES (?, ?, ?, ?)
      `
    )
    .run(
      userId,
      examId,
      JSON.stringify(attemptData),
      attemptedAt
    );

  return {
    id: result.lastInsertRowid,
    examId,
    ...attemptData,
    attemptedAt,
  };
}

function deleteAttemptHistory(userId) {
  const result = db
    .prepare(
      `
      DELETE FROM attempt_history
      WHERE user_id = ?
      `
    )
    .run(userId);

  return result.changes;
}

// --------------------------------------------------
// EXPORT
// --------------------------------------------------

module.exports = {
  db,
  getMockTests,
  saveMockTest,
  deleteMockTest,
  getExamSessions,
  saveExamSession,
  deleteExamSession,
  getAttemptHistory,
  saveAttempt,
  deleteAttemptHistory,
};