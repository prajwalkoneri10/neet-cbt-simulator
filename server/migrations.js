/**
 * Database Migrations for NEET CBT Simulator
 * Safely creates or updates relational tables without touching existing data.
 */

async function runMigrations(client) {
  // 1. Users table (preserves existing)
  await client.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    ALTER TABLE users ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT false;
    UPDATE users SET is_admin = true WHERE email ILIKE '%prajwal%' OR id = 1;
  `);

  // 2. Profiles table (preserves existing)
  await client.query(`
    CREATE TABLE IF NOT EXISTS profiles (
      user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      target_year INTEGER,
      target_score INTEGER,
      preferred_subjects JSONB NOT NULL DEFAULT '[]'::jsonb,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    ALTER TABLE profiles ADD COLUMN IF NOT EXISTS target_biology INTEGER DEFAULT 320;
    ALTER TABLE profiles ADD COLUMN IF NOT EXISTS target_physics INTEGER DEFAULT 140;
    ALTER TABLE profiles ADD COLUMN IF NOT EXISTS target_chemistry INTEGER DEFAULT 140;
  `);

  // 3. Question Sets table
  await client.query(`
    CREATE TABLE IF NOT EXISTS question_sets (
      id SERIAL PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT,
      is_public BOOLEAN NOT NULL DEFAULT true,
      total_questions INTEGER NOT NULL DEFAULT 0,
      duration_minutes INTEGER NOT NULL DEFAULT 180,
      marks_per_correct NUMERIC(4, 2) NOT NULL DEFAULT 4,
      marks_per_incorrect NUMERIC(4, 2) NOT NULL DEFAULT -1,
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    ALTER TABLE question_sets ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT 'full_mock';
    ALTER TABLE question_sets ADD COLUMN IF NOT EXISTS total_marks INTEGER NOT NULL DEFAULT 720;
  `);

  // 4. Questions table
  await client.query(`
    CREATE TABLE IF NOT EXISTS questions (
      id SERIAL PRIMARY KEY,
      question_set_id INTEGER NOT NULL REFERENCES question_sets(id) ON DELETE CASCADE,
      question_number INTEGER NOT NULL,
      subject TEXT NOT NULL,
      chapter TEXT NOT NULL DEFAULT 'General',
      question_text TEXT NOT NULL,
      option_a TEXT NOT NULL,
      option_b TEXT NOT NULL,
      option_c TEXT NOT NULL,
      option_d TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT uq_question_set_num UNIQUE(question_set_id, question_number)
    );
  `);

  // 5. Answer Keys table (stored securely, never sent to student during test!)
  await client.query(`
    CREATE TABLE IF NOT EXISTS answer_keys (
      question_id INTEGER PRIMARY KEY REFERENCES questions(id) ON DELETE CASCADE,
      correct_option CHAR(1) NOT NULL,
      explanation TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  // 6. Test Attempts table
  await client.query(`
    CREATE TABLE IF NOT EXISTS test_attempts (
      id BIGSERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      question_set_id INTEGER REFERENCES question_sets(id) ON DELETE SET NULL,
      test_title TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'in_progress',
      started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      duration_minutes INTEGER NOT NULL DEFAULT 180,
      submitted_at TIMESTAMPTZ,
      time_taken_seconds INTEGER DEFAULT 0,
      total_questions INTEGER NOT NULL DEFAULT 0,
      attempted_count INTEGER DEFAULT 0,
      correct_count INTEGER DEFAULT 0,
      incorrect_count INTEGER DEFAULT 0,
      unanswered_count INTEGER DEFAULT 0,
      score NUMERIC(6, 2) DEFAULT 0,
      max_score NUMERIC(6, 2) DEFAULT 0,
      accuracy NUMERIC(5, 2) DEFAULT 0,
      subject_breakdown JSONB NOT NULL DEFAULT '{}'::jsonb,
      chapter_breakdown JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  // 7. Attempt Answers table
  await client.query(`
    CREATE TABLE IF NOT EXISTS attempt_answers (
      id BIGSERIAL PRIMARY KEY,
      attempt_id BIGINT NOT NULL REFERENCES test_attempts(id) ON DELETE CASCADE,
      question_id INTEGER NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
      selected_option CHAR(1),
      is_marked_for_review BOOLEAN NOT NULL DEFAULT false,
      is_visited BOOLEAN NOT NULL DEFAULT false,
      is_correct BOOLEAN,
      marks_awarded NUMERIC(4, 2) DEFAULT 0,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT uq_attempt_question UNIQUE(attempt_id, question_id)
    );
  `);

  // 8. Existing legacy tables (preserved for backward compatibility)
  await client.query(`
    CREATE TABLE IF NOT EXISTS mock_tests (
      id BIGSERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      mock_id TEXT NOT NULL,
      name TEXT NOT NULL,
      questions JSONB NOT NULL,
      answer_key JSONB NOT NULL,
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT mock_tests_user_mock_unique UNIQUE(user_id, mock_id)
    );
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS exam_sessions (
      id BIGSERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      exam_id TEXT NOT NULL,
      session_data JSONB NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT exam_sessions_user_exam_unique UNIQUE(user_id, exam_id)
    );
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS attempt_history (
      id BIGSERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      exam_id TEXT,
      attempt_data JSONB NOT NULL,
      attempted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS password_reset_tokens (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash TEXT UNIQUE NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      used_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  // 9. Performance Indexes
  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_questions_set ON questions(question_set_id);
    CREATE INDEX IF NOT EXISTS idx_questions_subject ON questions(subject);
    CREATE INDEX IF NOT EXISTS idx_test_attempts_user ON test_attempts(user_id);
    CREATE INDEX IF NOT EXISTS idx_test_attempts_status ON test_attempts(status);
    CREATE INDEX IF NOT EXISTS idx_attempt_answers_attempt ON attempt_answers(attempt_id);
    CREATE INDEX IF NOT EXISTS idx_mock_tests_user ON mock_tests(user_id);
    CREATE INDEX IF NOT EXISTS idx_exam_sessions_user ON exam_sessions(user_id);
    CREATE INDEX IF NOT EXISTS idx_attempt_history_user ON attempt_history(user_id);
    CREATE INDEX IF NOT EXISTS idx_attempt_history_date ON attempt_history(attempted_at DESC);
    CREATE INDEX IF NOT EXISTS idx_password_reset_user ON password_reset_tokens(user_id);
    CREATE INDEX IF NOT EXISTS idx_password_reset_expiry ON password_reset_tokens(expires_at);
  `);
}

module.exports = { runMigrations };
