/**
 * Core NEET CBT Test Engine & Question Bank Service
 * Handles Question Sets, Questions, Protected Answer Keys, Attempts, Autosave,
 * Official Timer Enforcement, and Server-Side NEET Score Calculation (+4, -1, 0).
 */

const fs = require("fs");
const path = require("path");
const {
  parseQuestionPaperCSV,
  parseAnswerKeyCSV,
  matchQuestionsAndAnswers,
} = require("./csvParser");

/**
 * Seeds default question set if question_sets is empty.
 */
async function seedDefaultQuestionSetIfEmpty(pool) {
  try {
    const res = await pool.query("SELECT COUNT(*) FROM question_sets");
    if (Number(res.rows[0].count) > 0) {
      return;
    }

    console.log("🌱 Seeding default NEET 180-Question Mock Test into PostgreSQL...");
    const qPath = path.join(__dirname, "data", "neet_180q_questions.csv");
    const aPath = path.join(__dirname, "data", "neet_180q_answers.csv");

    if (!fs.existsSync(qPath) || !fs.existsSync(aPath)) {
      console.log("⚠️ Seed files not found in server/data, skipping seed.");
      return;
    }

    const qCsv = fs.readFileSync(qPath, "utf8");
    const aCsv = fs.readFileSync(aPath, "utf8");

    const qParsed = parseQuestionPaperCSV(qCsv);
    const aParsed = parseAnswerKeyCSV(aCsv);

    if (!qParsed.valid || !aParsed.valid) {
      console.error("❌ Failed to parse seed CSVs:", qParsed.errors, aParsed.errors);
      return;
    }

    const matched = matchQuestionsAndAnswers(qParsed.questions, aParsed);
    if (!matched.matched) {
      console.error("❌ Failed to match seed questions and answers:", matched.errors);
      return;
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const setRes = await client.query(
        `
        INSERT INTO question_sets (
          title, description, is_public, total_questions, duration_minutes,
          marks_per_correct, marks_per_incorrect, created_by, created_at, updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, NULL, NOW(), NOW())
        RETURNING id
        `,
        [
          "NEET Full Length Mock Test 01 (180 Questions)",
          "Official NEET CBT simulation covering Physics (45Q), Chemistry (45Q), and Biology (90Q). Standard +4 / -1 marking scheme.",
          true,
          matched.questionsWithAnswers.length,
          180,
          4,
          -1,
        ]
      );

      const setId = setRes.rows[0].id;

      for (const item of matched.questionsWithAnswers) {
        const qRes = await client.query(
          `
          INSERT INTO questions (
            question_set_id, question_number, subject, chapter,
            question_text, option_a, option_b, option_c, option_d, created_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
          RETURNING id
          `,
          [
            setId,
            item.number,
            item.subject,
            item.chapter,
            item.question,
            item.options[0],
            item.options[1],
            item.options[2],
            item.options[3],
          ]
        );

        const qId = qRes.rows[0].id;

        await client.query(
          `
          INSERT INTO answer_keys (question_id, correct_option, explanation, created_at)
          VALUES ($1, $2, $3, NOW())
          `,
          [
            qId,
            item.correctAnswer,
            `Correct answer is Option ${item.correctAnswer}.`,
          ]
        );
      }

      await client.query("COMMIT");
      console.log(`✅ Successfully seeded default NEET Mock Test (Set ID: ${setId}, ${matched.questionsWithAnswers.length} questions).`);
    } catch (err) {
      await client.query("ROLLBACK");
      console.error("❌ Error seeding default question set:", err.message);
    } finally {
      client.release();
    }
  } catch (err) {
    console.error("Error in seedDefaultQuestionSetIfEmpty:", err.message);
  }
}

/**
 * Seeds subject practice sets (Biology 90Q, Physics 45Q, Chemistry 45Q) from default mock if missing.
 */
async function seedSubjectPracticeSetsIfMissing(pool) {
  try {
    const existing = await pool.query(
      "SELECT category, COUNT(*) FROM question_sets WHERE category IN ('biology', 'physics', 'chemistry') GROUP BY category"
    );
    const existingCats = new Set(existing.rows.map((r) => r.category));

    const subjectsToSeed = [
      {
        category: "biology",
        title: "NEET Biology Practice Mock (90 Questions)",
        description: "Official 90-question Biology practice test covering Botany & Zoology with standard NEET +4/-1 marking.",
        subject: "Biology",
        durationMinutes: 90,
        limit: 90,
      },
      {
        category: "physics",
        title: "NEET Physics Practice Mock (45 Questions)",
        description: "Standard 45-question Physics mock covering Mechanics, Thermodynamics, Electromagnetism, and Modern Physics.",
        subject: "Physics",
        durationMinutes: 45,
        limit: 45,
      },
      {
        category: "chemistry",
        title: "NEET Chemistry Practice Mock (45 Questions)",
        description: "Targeted 45-question Chemistry test covering Physical, Organic, and Inorganic Chemistry.",
        subject: "Chemistry",
        durationMinutes: 45,
        limit: 45,
      },
    ];

    for (const spec of subjectsToSeed) {
      if (existingCats.has(spec.category)) continue;

      const qRes = await pool.query(
        `
        SELECT q.question_number, q.subject, q.chapter, q.question_text,
               q.option_a, q.option_b, q.option_c, q.option_d,
               ak.correct_option, ak.explanation
        FROM questions q
        JOIN answer_keys ak ON ak.question_id = q.id
        WHERE q.question_set_id = 1 AND q.subject = $1
        ORDER BY q.question_number ASC
        LIMIT $2
        `,
        [spec.subject, spec.limit]
      );

      if (qRes.rows.length === 0) continue;

      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const setRes = await client.query(
          `
          INSERT INTO question_sets (
            title, description, is_public, total_questions, duration_minutes,
            marks_per_correct, marks_per_incorrect, category, total_marks, created_at, updated_at
          )
          VALUES ($1, $2, true, $3, $4, 4, -1, $5, $6, NOW(), NOW())
          RETURNING id
          `,
          [
            spec.title,
            spec.description,
            qRes.rows.length,
            spec.durationMinutes,
            spec.category,
            qRes.rows.length * 4,
          ]
        );
        const newSetId = setRes.rows[0].id;

        for (let i = 0; i < qRes.rows.length; i++) {
          const item = qRes.rows[i];
          const newQ = await client.query(
            `
            INSERT INTO questions (
              question_set_id, question_number, subject, chapter,
              question_text, option_a, option_b, option_c, option_d, created_at
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
            RETURNING id
            `,
            [
              newSetId,
              i + 1,
              item.subject,
              item.chapter,
              item.question_text,
              item.option_a,
              item.option_b,
              item.option_c,
              item.option_d,
            ]
          );

          await client.query(
            `
            INSERT INTO answer_keys (question_id, correct_option, explanation, created_at)
            VALUES ($1, $2, $3, NOW())
            `,
            [
              newQ.rows[0].id,
              item.correct_option,
              item.explanation || `Correct answer is Option ${item.correct_option}.`,
            ]
          );
        }

        await client.query("COMMIT");
        console.log(`✅ Seeded ${spec.title} (Set ID: ${newSetId}, ${qRes.rows.length} questions).`);
      } catch (e) {
        await client.query("ROLLBACK");
        console.error(`Failed to seed ${spec.title}:`, e.message);
      } finally {
        client.release();
      }
    }
  } catch (err) {
    console.error("Error in seedSubjectPracticeSetsIfMissing:", err.message);
  }
}

/**
 * Imports a new Question Set from Question Paper and Answer Key CSVs within a safe database transaction.
 */
async function importQuestionSetFromCSVs(pool, {
  userId,
  title,
  description = "",
  durationMinutes = 180,
  marksPerCorrect = 4,
  marksPerIncorrect = -1,
  questionsCsv,
  answersCsv,
  dryRun = false,
}) {
  const qParsed = parseQuestionPaperCSV(questionsCsv);
  if (!qParsed.valid) {
    return {
      success: false,
      errors: qParsed.errors,
      warnings: qParsed.warnings,
      stage: "question_csv",
    };
  }

  const aParsed = parseAnswerKeyCSV(answersCsv);
  if (!aParsed.valid) {
    return {
      success: false,
      errors: aParsed.errors,
      warnings: aParsed.warnings,
      stage: "answer_csv",
    };
  }

  const matchResult = matchQuestionsAndAnswers(qParsed.questions, aParsed);
  if (!matchResult.matched) {
    return {
      success: false,
      errors: matchResult.errors,
      warnings: matchResult.warnings,
      stage: "matching",
    };
  }

  if (dryRun) {
    return {
      success: true,
      dryRun: true,
      totalQuestions: matchResult.questionsWithAnswers.length,
      subjectCounts: qParsed.subjectCounts,
      chapters: qParsed.chapters,
      preview: matchResult.questionsWithAnswers.slice(0, 5).map((q) => ({
        number: q.number,
        subject: q.subject,
        chapter: q.chapter,
        question: q.question,
        options: q.options,
        answer: q.correctAnswer,
      })),
      warnings: matchResult.warnings,
    };
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const setRes = await client.query(
      `
      INSERT INTO question_sets (
        title, description, is_public, total_questions, duration_minutes,
        marks_per_correct, marks_per_incorrect, created_by, created_at, updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())
      RETURNING id, title, total_questions, duration_minutes, created_at
      `,
      [
        title || `Question Set ${new Date().toLocaleDateString()}`,
        description,
        true,
        matchResult.questionsWithAnswers.length,
        Number(durationMinutes) || 180,
        Number(marksPerCorrect) || 4,
        Number(marksPerIncorrect) !== undefined ? Number(marksPerIncorrect) : -1,
        userId || null,
      ]
    );

    const questionSet = setRes.rows[0];

    for (const item of matchResult.questionsWithAnswers) {
      const qRes = await client.query(
        `
        INSERT INTO questions (
          question_set_id, question_number, subject, chapter,
          question_text, option_a, option_b, option_c, option_d, created_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
        RETURNING id
        `,
        [
          questionSet.id,
          item.number,
          item.subject,
          item.chapter,
          item.question,
          item.options[0],
          item.options[1],
          item.options[2],
          item.options[3],
        ]
      );

      const qId = qRes.rows[0].id;

      await client.query(
        `
        INSERT INTO answer_keys (question_id, correct_option, explanation, created_at)
        VALUES ($1, $2, $3, NOW())
        `,
        [
          qId,
          item.correctAnswer,
          `Correct answer is Option ${item.correctAnswer}.`,
        ]
      );
    }

    await client.query("COMMIT");

    return {
      success: true,
      questionSet: {
        id: questionSet.id,
        title: questionSet.title,
        totalQuestions: questionSet.total_questions,
        durationMinutes: questionSet.duration_minutes,
        subjectCounts: qParsed.subjectCounts,
        chapters: qParsed.chapters,
        createdAt: questionSet.created_at,
      },
      warnings: matchResult.warnings,
    };
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Error importing question set:", err);
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Gets list of all available tests for a student.
 */
async function getAvailableTests(pool, userId) {
  const res = await pool.query(
    `
    SELECT
      qs.id,
      qs.title,
      qs.description,
      qs.is_public AS "isPublic",
      qs.total_questions AS "totalQuestions",
      qs.duration_minutes AS "durationMinutes",
      qs.marks_per_correct AS "marksPerCorrect",
      qs.marks_per_incorrect AS "marksPerIncorrect",
      qs.category,
      qs.total_marks AS "totalMarks",
      qs.created_by AS "createdBy",
      qs.created_at AS "createdAt",
      u.name AS "authorName",
      COALESCE(
        json_object_agg(sub.subject, sub.count) FILTER (WHERE sub.subject IS NOT NULL),
        '{}'::json
      ) AS "subjectCounts",
      COUNT(DISTINCT ta.id) AS "attemptsCount",
      MAX(ta.score) AS "bestScore",
      (
        SELECT ta2.score
        FROM test_attempts ta2
        WHERE ta2.question_set_id = qs.id AND ta2.user_id = $1 AND ta2.status = 'completed'
        ORDER BY ta2.submitted_at DESC
        LIMIT 1
      ) AS "lastScore"
    FROM question_sets qs
    LEFT JOIN users u ON qs.created_by = u.id
    LEFT JOIN (
      SELECT question_set_id, subject, COUNT(*) AS count
      FROM questions
      GROUP BY question_set_id, subject
    ) sub ON sub.question_set_id = qs.id
    LEFT JOIN test_attempts ta ON ta.question_set_id = qs.id AND ta.user_id = $1 AND ta.status = 'completed'
    WHERE qs.is_public = true OR qs.created_by = $1
    GROUP BY qs.id, u.name
    ORDER BY qs.id ASC
    `,
    [userId]
  );

  return res.rows.map((row) => ({
    id: row.id,
    title: row.title,
    description: row.description || "",
    category: row.category || "full_mock",
    isPublic: row.isPublic,
    createdBy: row.createdBy,
    isPersonal: row.createdBy === userId,
    totalQuestions: Number(row.totalQuestions),
    durationMinutes: Number(row.durationMinutes),
    totalMarks: row.totalMarks != null ? Number(row.totalMarks) : Number(row.totalQuestions) * 4,
    marksPerCorrect: Number(row.marksPerCorrect),
    marksPerIncorrect: Number(row.marksPerIncorrect),
    createdAt: row.createdAt,
    authorName: row.authorName || (row.createdBy === userId ? "You (Personal)" : "System"),
    subjectCounts: row.subjectCounts || {},
    attemptsCount: Number(row.attemptsCount || 0),
    bestScore: row.bestScore != null ? Number(row.bestScore) : null,
    lastScore: row.lastScore != null ? Number(row.lastScore) : null,
  }));
}

/**
 * Creates a custom mock test from the existing question bank by sampling subject/chapter counts.
 */
async function createCustomMockTest(pool, {
  userId,
  title,
  durationMinutes = 180,
  counts = { Biology: 90, Physics: 45, Chemistry: 45 },
  selectedChapters = {},
}) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Gather available questions matching subject & chapter criteria
    const subjects = Object.keys(counts);
    const chosenQuestions = [];

    for (const subject of subjects) {
      const needed = Number(counts[subject]) || 0;
      if (needed <= 0) continue;

      const chapters = selectedChapters[subject] || [];
      let query = `
        SELECT q.id, q.subject, q.chapter, q.question_text, q.option_a, q.option_b, q.option_c, q.option_d, ak.correct_option
        FROM questions q
        JOIN answer_keys ak ON ak.question_id = q.id
        WHERE q.subject = $1
      `;
      const params = [subject];

      if (chapters.length > 0) {
        query += ` AND q.chapter = ANY($2)`;
        params.push(chapters);
      }

      query += ` ORDER BY RANDOM() LIMIT $${params.length + 1}`;
      params.push(needed);

      const res = await client.query(query, params);
      chosenQuestions.push(...res.rows);
    }

    if (chosenQuestions.length === 0) {
      throw new Error("No questions available matching the selected criteria.");
    }

    const setRes = await client.query(
      `
      INSERT INTO question_sets (
        title, description, is_public, total_questions, duration_minutes,
        marks_per_correct, marks_per_incorrect, created_by, created_at, updated_at
      )
      VALUES ($1, $2, false, $3, $4, 4, -1, $5, NOW(), NOW())
      RETURNING id, title, total_questions, duration_minutes
      `,
      [
        title || `Custom Mock - ${new Date().toLocaleDateString()}`,
        `Custom generated test with ${chosenQuestions.length} questions.`,
        chosenQuestions.length,
        Number(durationMinutes) || 180,
        userId,
      ]
    );

    const newSetId = setRes.rows[0].id;

    for (let i = 0; i < chosenQuestions.length; i++) {
      const q = chosenQuestions[i];
      const qRes = await client.query(
        `
        INSERT INTO questions (
          question_set_id, question_number, subject, chapter,
          question_text, option_a, option_b, option_c, option_d, created_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
        RETURNING id
        `,
        [
          newSetId,
          i + 1,
          q.subject,
          q.chapter,
          q.question_text,
          q.option_a,
          q.option_b,
          q.option_c,
          q.option_d,
        ]
      );

      const newQId = qRes.rows[0].id;
      await client.query(
        `
        INSERT INTO answer_keys (question_id, correct_option, explanation, created_at)
        VALUES ($1, $2, $3, NOW())
        `,
        [newQId, q.correct_option, `Correct answer is Option ${q.correct_option}.`]
      );
    }

    await client.query("COMMIT");
    return {
      success: true,
      testId: newSetId,
      title: setRes.rows[0].title,
      totalQuestions: setRes.rows[0].total_questions,
      durationMinutes: setRes.rows[0].duration_minutes,
    };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Starts a new test attempt or resumes an active in-progress attempt.
 * NEVER returns correct answers in the response.
 */
async function startOrResumeTestAttempt(pool, userId, testId) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Check if test exists and is public or owned by user
    const testRes = await client.query(
      `
      SELECT id, title, duration_minutes, total_questions, marks_per_correct, marks_per_incorrect, is_public, created_by
      FROM question_sets
      WHERE id = $1 AND (is_public = true OR created_by = $2)
      `,
      [testId, userId]
    );

    if (testRes.rows.length === 0) {
      throw new Error("Test not found or access denied.");
    }

    const test = testRes.rows[0];

    // Check if user already has an active in_progress attempt for this test
    const activeRes = await client.query(
      `
      SELECT id, started_at, duration_minutes, status
      FROM test_attempts
      WHERE user_id = $1 AND question_set_id = $2 AND status = 'in_progress'
      ORDER BY started_at DESC
      LIMIT 1
      `,
      [userId, testId]
    );

    let attemptId;
    let startedAt;
    const now = new Date();

    if (activeRes.rows.length > 0) {
      const active = activeRes.rows[0];
      const expiry = new Date(new Date(active.started_at).getTime() + active.duration_minutes * 60 * 1000);

      if (now < expiry) {
        // Resume existing attempt
        attemptId = active.id;
        startedAt = active.started_at;
      } else {
        // Past time: auto-submit it
        await client.query("COMMIT");
        client.release();
        return await submitTestAttempt(pool, {
          userId,
          attemptId: active.id,
          reason: "timed_out",
        });
      }
    }

    if (!attemptId) {
      // Create new attempt
      const attemptRes = await client.query(
        `
        INSERT INTO test_attempts (
          user_id, question_set_id, test_title, status, started_at,
          duration_minutes, total_questions, max_score, created_at
        )
        VALUES ($1, $2, $3, 'in_progress', NOW(), $4, $5, $6, NOW())
        RETURNING id, started_at
        `,
        [
          userId,
          test.id,
          test.title,
          test.duration_minutes,
          test.total_questions,
          test.total_questions * Number(test.marks_per_correct),
        ]
      );

      attemptId = attemptRes.rows[0].id;
      startedAt = attemptRes.rows[0].started_at;

      // Populate attempt_answers placeholders
      const qRows = await client.query(
        `SELECT id FROM questions WHERE question_set_id = $1 ORDER BY question_number ASC`,
        [test.id]
      );

      for (const q of qRows.rows) {
        await client.query(
          `
          INSERT INTO attempt_answers (attempt_id, question_id, is_visited, is_marked_for_review)
          VALUES ($1, $2, false, false)
          ON CONFLICT (attempt_id, question_id) DO NOTHING
          `,
          [attemptId, q.id]
        );
      }
    }

    // Load questions WITHOUT answer keys
    const questionsRes = await client.query(
      `
      SELECT
        q.id,
        q.question_number AS "number",
        q.subject,
        q.chapter,
        q.question_text AS "question",
        json_build_array(q.option_a, q.option_b, q.option_c, q.option_d) AS "options",
        aa.selected_option AS "selectedOption",
        aa.is_marked_for_review AS "isMarked",
        aa.is_visited AS "isVisited"
      FROM questions q
      LEFT JOIN attempt_answers aa ON aa.question_id = q.id AND aa.attempt_id = $1
      WHERE q.question_set_id = $2
      ORDER BY q.question_number ASC
      `,
      [attemptId, test.id]
    );

    await client.query("COMMIT");

    const elapsedSeconds = Math.max(0, Math.floor((now.getTime() - new Date(startedAt).getTime()) / 1000));
    const totalDurationSeconds = test.duration_minutes * 60;
    const remainingSeconds = Math.max(0, totalDurationSeconds - elapsedSeconds);

    return {
      attemptId,
      testId: test.id,
      title: test.title,
      startedAt,
      durationMinutes: test.duration_minutes,
      remainingSeconds,
      totalQuestions: test.total_questions,
      marksPerCorrect: Number(test.marks_per_correct),
      marksPerIncorrect: Number(test.marks_per_incorrect),
      questions: questionsRes.rows,
    };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Gets currently active in-progress attempt for a student (for page refreshes / reconnection).
 */
async function getActiveAttemptForStudent(pool, userId) {
  const activeRes = await pool.query(
    `
    SELECT id, question_set_id, test_title, started_at, duration_minutes, total_questions
    FROM test_attempts
    WHERE user_id = $1 AND status = 'in_progress'
    ORDER BY started_at DESC
    LIMIT 1
    `,
    [userId]
  );

  if (activeRes.rows.length === 0) {
    return null;
  }

  const active = activeRes.rows[0];
  const now = new Date();
  const startedAt = new Date(active.started_at);
  const totalSeconds = active.duration_minutes * 60;
  const elapsedSeconds = Math.floor((now.getTime() - startedAt.getTime()) / 1000);
  const remainingSeconds = totalSeconds - elapsedSeconds;

  if (remainingSeconds <= 0) {
    // Attempt has expired server-side: auto-submit it
    return await submitTestAttempt(pool, {
      userId,
      attemptId: active.id,
      reason: "timed_out",
    });
  }

  // Load questions without answer keys
  const questionsRes = await pool.query(
    `
    SELECT
      q.id,
      q.question_number AS "number",
      q.subject,
      q.chapter,
      q.question_text AS "question",
      json_build_array(q.option_a, q.option_b, q.option_c, q.option_d) AS "options",
      aa.selected_option AS "selectedOption",
      aa.is_marked_for_review AS "isMarked",
      aa.is_visited AS "isVisited"
    FROM questions q
    LEFT JOIN attempt_answers aa ON aa.question_id = q.id AND aa.attempt_id = $1
    WHERE q.question_set_id = $2
    ORDER BY q.question_number ASC
    `,
    [active.id, active.question_set_id]
  );

  return {
    attemptId: active.id,
    testId: active.question_set_id,
    title: active.test_title,
    startedAt: active.started_at,
    durationMinutes: active.duration_minutes,
    remainingSeconds,
    totalQuestions: active.total_questions,
    questions: questionsRes.rows,
  };
}

/**
 * Autosaves student test answers and question status (visited, marked for review) during the exam.
 */
async function saveAttemptProgress(pool, {
  userId,
  attemptId,
  answers = {}, // map of { questionId: 'A' | 'B' | 'C' | 'D' | null }
  markedQuestions = [], // array of question IDs
  visitedQuestions = [], // array of question IDs
}) {
  const attemptRes = await pool.query(
    `SELECT id, user_id, status FROM test_attempts WHERE id = $1`,
    [attemptId]
  );

  if (attemptRes.rows.length === 0) {
    throw new Error("Attempt not found.");
  }

  const attempt = attemptRes.rows[0];
  if (attempt.user_id !== userId) {
    throw new Error("Access denied: You do not own this attempt.");
  }

  if (attempt.status !== "in_progress") {
    return { success: false, message: "Attempt already completed." };
  }

  const markedSet = new Set((markedQuestions || []).map(Number));
  const visitedSet = new Set((visitedQuestions || []).map(Number));

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    for (const [qIdStr, opt] of Object.entries(answers)) {
      const qId = Number(qIdStr);
      const isMarked = markedSet.has(qId);
      const isVisited = visitedSet.has(qId) || opt !== null;
      const cleanOpt = opt && ["A", "B", "C", "D"].includes(String(opt).toUpperCase())
        ? String(opt).toUpperCase()
        : null;

      await client.query(
        `
        INSERT INTO attempt_answers (attempt_id, question_id, selected_option, is_marked_for_review, is_visited, updated_at)
        VALUES ($1, $2, $3, $4, $5, NOW())
        ON CONFLICT (attempt_id, question_id)
        DO UPDATE SET
          selected_option = EXCLUDED.selected_option,
          is_marked_for_review = EXCLUDED.is_marked_for_review,
          is_visited = EXCLUDED.is_visited,
          updated_at = NOW()
        `,
        [attemptId, qId, cleanOpt, isMarked, isVisited]
      );
    }

    await client.query("COMMIT");
    return { success: true };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Submits the test attempt, validates official server timer, calculates +4 / -1 / 0 score,
 * generates subject and chapter analyses, marks attempt completed, and reveals review.
 */
async function submitTestAttempt(pool, {
  userId,
  attemptId,
  finalAnswers = null,
  reason = "manual",
}) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const attemptRes = await client.query(
      `
      SELECT
        ta.id, ta.user_id, ta.question_set_id, ta.test_title, ta.status,
        ta.started_at, ta.duration_minutes, ta.total_questions,
        qs.marks_per_correct, qs.marks_per_incorrect
      FROM test_attempts ta
      LEFT JOIN question_sets qs ON qs.id = ta.question_set_id
      WHERE ta.id = $1
      `,
      [attemptId]
    );

    if (attemptRes.rows.length === 0) {
      throw new Error("Attempt not found.");
    }

    const attempt = attemptRes.rows[0];

    // Ownership check
    if (attempt.user_id !== userId) {
      throw new Error("Access denied: You do not own this attempt.");
    }

    // Duplicate submission prevention
    if (attempt.status !== "in_progress") {
      await client.query("COMMIT");
      return await getAttemptResult(pool, { userId, attemptId });
    }

    // Save any pending final answers sent with the submission
    if (finalAnswers && typeof finalAnswers === "object") {
      for (const [qIdStr, opt] of Object.entries(finalAnswers)) {
        const qId = Number(qIdStr);
        const cleanOpt = opt && ["A", "B", "C", "D"].includes(String(opt).toUpperCase())
          ? String(opt).toUpperCase()
          : null;

        await client.query(
          `
          INSERT INTO attempt_answers (attempt_id, question_id, selected_option, is_visited, updated_at)
          VALUES ($1, $2, $3, true, NOW())
          ON CONFLICT (attempt_id, question_id)
          DO UPDATE SET
            selected_option = EXCLUDED.selected_option,
            is_visited = true,
            updated_at = NOW()
          `,
          [attemptId, qId, cleanOpt]
        );
      }
    }

    const now = new Date();
    const startedAt = new Date(attempt.started_at);
    const timeTakenSeconds = Math.max(1, Math.min(
      Math.floor((now.getTime() - startedAt.getTime()) / 1000),
      attempt.duration_minutes * 60
    ));

    const marksCorrect = Number(attempt.marks_per_correct) || 4;
    const marksIncorrect = Number(attempt.marks_per_incorrect) !== undefined
      ? Number(attempt.marks_per_incorrect)
      : -1;

    // Fetch questions with protected answer keys
    const itemsRes = await client.query(
      `
      SELECT
        q.id,
        q.question_number AS "number",
        q.subject,
        q.chapter,
        q.question_text AS "question",
        json_build_array(q.option_a, q.option_b, q.option_c, q.option_d) AS "options",
        ak.correct_option AS "correctOption",
        ak.explanation,
        aa.selected_option AS "selectedOption",
        aa.is_marked_for_review AS "isMarked"
      FROM questions q
      JOIN answer_keys ak ON ak.question_id = q.id
      LEFT JOIN attempt_answers aa ON aa.question_id = q.id AND aa.attempt_id = $1
      WHERE q.question_set_id = $2
      ORDER BY q.question_number ASC
      `,
      [attemptId, attempt.question_set_id]
    );

    let totalScore = 0;
    let correctCount = 0;
    let incorrectCount = 0;
    let unansweredCount = 0;
    let attemptedCount = 0;

    const subjectStats = {
      Biology: { total: 0, attempted: 0, correct: 0, wrong: 0, unanswered: 0, score: 0 },
      Physics: { total: 0, attempted: 0, correct: 0, wrong: 0, unanswered: 0, score: 0 },
      Chemistry: { total: 0, attempted: 0, correct: 0, wrong: 0, unanswered: 0, score: 0 },
    };

    const chapterStats = {};
    const questionReview = [];

    for (const item of itemsRes.rows) {
      const subj = item.subject || "General";
      if (!subjectStats[subj]) {
        subjectStats[subj] = { total: 0, attempted: 0, correct: 0, wrong: 0, unanswered: 0, score: 0 };
      }
      subjectStats[subj].total += 1;

      const chap = item.chapter || "General";
      if (!chapterStats[chap]) {
        chapterStats[chap] = { subject: subj, chapter: chap, total: 0, attempted: 0, correct: 0, wrong: 0, unanswered: 0 };
      }
      chapterStats[chap].total += 1;

      const selected = item.selectedOption;
      const correct = item.correctOption;

      let isCorrect = null;
      let marksAwarded = 0;

      if (!selected) {
        unansweredCount += 1;
        subjectStats[subj].unanswered += 1;
        chapterStats[chap].unanswered += 1;
      } else {
        attemptedCount += 1;
        subjectStats[subj].attempted += 1;
        chapterStats[chap].attempted += 1;

        if (selected.toUpperCase() === correct.toUpperCase()) {
          isCorrect = true;
          marksAwarded = marksCorrect;
          totalScore += marksCorrect;
          correctCount += 1;
          subjectStats[subj].correct += 1;
          subjectStats[subj].score += marksCorrect;
          chapterStats[chap].correct += 1;
        } else {
          isCorrect = false;
          marksAwarded = marksIncorrect;
          totalScore += marksIncorrect;
          incorrectCount += 1;
          subjectStats[subj].wrong += 1;
          subjectStats[subj].score += marksIncorrect;
          chapterStats[chap].wrong += 1;
        }
      }

      await client.query(
        `
        UPDATE attempt_answers
        SET is_correct = $1, marks_awarded = $2, updated_at = NOW()
        WHERE attempt_id = $3 AND question_id = $4
        `,
        [isCorrect, marksAwarded, attemptId, item.id]
      );

      questionReview.push({
        id: item.id,
        number: item.number,
        subject: item.subject,
        chapter: item.chapter,
        question: item.question,
        options: item.options,
        selectedOption: selected,
        correctOption: correct,
        isCorrect,
        marksAwarded,
        explanation: item.explanation || `Correct answer is Option ${correct}.`,
      });
    }

    const totalQuestions = itemsRes.rows.length;
    const maxScore = totalQuestions * marksCorrect;
    const accuracy = attemptedCount > 0
      ? Number(((correctCount / attemptedCount) * 100).toFixed(1))
      : 0;

    // Build weak areas analysis
    const weakAreas = Object.values(chapterStats).map((c) => {
      const acc = c.attempted > 0 ? Number(((c.correct / c.attempted) * 100).toFixed(1)) : 0;
      let status = "Needs Practice";
      if (acc < 50) status = "Weak";
      else if (acc >= 70) status = "Strong";
      return {
        ...c,
        accuracy: acc,
        status,
      };
    });

    // Finalize test attempt row
    await client.query(
      `
      UPDATE test_attempts
      SET
        status = 'completed',
        submitted_at = NOW(),
        time_taken_seconds = $1,
        attempted_count = $2,
        correct_count = $3,
        incorrect_count = $4,
        unanswered_count = $5,
        score = $6,
        max_score = $7,
        accuracy = $8,
        subject_breakdown = $9::jsonb,
        chapter_breakdown = $10::jsonb
      WHERE id = $11
      `,
      [
        timeTakenSeconds,
        attemptedCount,
        correctCount,
        incorrectCount,
        unansweredCount,
        totalScore,
        maxScore,
        accuracy,
        JSON.stringify(subjectStats),
        JSON.stringify(weakAreas),
        attemptId,
      ]
    );

    // Sync to legacy attempt_history table for backward compatibility
    await client.query(
      `
      INSERT INTO attempt_history (user_id, exam_id, attempt_data, attempted_at)
      VALUES ($1, $2, $3::jsonb, NOW())
      `,
      [
        userId,
        `attempt-${attemptId}`,
        JSON.stringify({
          attemptId,
          examName: attempt.test_title,
          score: totalScore,
          maxScore,
          totalQuestions,
          attempted: attemptedCount,
          correct: correctCount,
          wrong: incorrectCount,
          unanswered: unansweredCount,
          accuracy,
          timeTakenSeconds,
          subjects: subjectStats,
          submittedAt: now.toISOString(),
        }),
      ]
    );

    await client.query("COMMIT");

    return {
      attemptId,
      testTitle: attempt.test_title,
      status: "completed",
      submittedAt: now.toISOString(),
      timeTakenSeconds,
      score: totalScore,
      maxScore,
      totalQuestions,
      attemptedCount,
      correctCount,
      incorrectCount,
      unansweredCount,
      accuracy,
      subjects: subjectStats,
      chapters: weakAreas,
      questions: questionReview,
    };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Retrieves the full result and question review of a submitted attempt.
 */
async function getAttemptResult(pool, { userId, attemptId }) {
  const attemptRes = await pool.query(
    `
    SELECT
      id, user_id, question_set_id, test_title, status, submitted_at,
      time_taken_seconds, total_questions, attempted_count, correct_count,
      incorrect_count, unanswered_count, score, max_score, accuracy,
      subject_breakdown, chapter_breakdown
    FROM test_attempts
    WHERE id = $1
    `,
    [attemptId]
  );

  if (attemptRes.rows.length === 0) {
    throw new Error("Attempt not found.");
  }

  const attempt = attemptRes.rows[0];
  if (attempt.user_id !== userId) {
    throw new Error("Access denied: You do not own this attempt.");
  }

  const reviewRes = await pool.query(
    `
    SELECT
      q.id,
      q.question_number AS "number",
      q.subject,
      q.chapter,
      q.question_text AS "question",
      json_build_array(q.option_a, q.option_b, q.option_c, q.option_d) AS "options",
      ak.correct_option AS "correctOption",
      ak.explanation,
      aa.selected_option AS "selectedOption",
      aa.is_correct AS "isCorrect",
      aa.marks_awarded AS "marksAwarded"
    FROM questions q
    JOIN answer_keys ak ON ak.question_id = q.id
    LEFT JOIN attempt_answers aa ON aa.question_id = q.id AND aa.attempt_id = $1
    WHERE q.question_set_id = $2
    ORDER BY q.question_number ASC
    `,
    [attemptId, attempt.question_set_id]
  );

  return {
    attemptId: attempt.id,
    testTitle: attempt.test_title,
    status: attempt.status,
    submittedAt: attempt.submitted_at,
    timeTakenSeconds: attempt.time_taken_seconds,
    score: Number(attempt.score),
    maxScore: Number(attempt.max_score),
    totalQuestions: Number(attempt.total_questions),
    attemptedCount: Number(attempt.attempted_count),
    correctCount: Number(attempt.correct_count),
    incorrectCount: Number(attempt.incorrect_count),
    unansweredCount: Number(attempt.unanswered_count),
    accuracy: Number(attempt.accuracy),
    subjects: attempt.subject_breakdown,
    chapters: attempt.chapter_breakdown,
    questions: reviewRes.rows,
  };
}

/**
 * Gets student's past attempts history.
 */
async function getStudentAttemptHistory(pool, userId) {
  const res = await pool.query(
    `
    SELECT
      id AS "attemptId",
      question_set_id AS "testId",
      test_title AS "testTitle",
      status,
      started_at AS "startedAt",
      submitted_at AS "submittedAt",
      time_taken_seconds AS "timeTakenSeconds",
      total_questions AS "totalQuestions",
      score,
      max_score AS "maxScore",
      accuracy,
      correct_count AS "correctCount",
      incorrect_count AS "incorrectCount",
      unanswered_count AS "unansweredCount",
      subject_breakdown AS "subjects"
    FROM test_attempts
    WHERE user_id = $1 AND status = 'completed'
    ORDER BY submitted_at DESC
    `,
    [userId]
  );

  return res.rows.map((row) => ({
    ...row,
    score: Number(row.score),
    maxScore: Number(row.maxScore),
    accuracy: Number(row.accuracy),
    subjects: row.subjects || {},
  }));
}

module.exports = {
  seedDefaultQuestionSetIfEmpty,
  seedSubjectPracticeSetsIfMissing,
  importQuestionSetFromCSVs,
  getAvailableTests,
  createCustomMockTest,
  startOrResumeTestAttempt,
  getActiveAttemptForStudent,
  saveAttemptProgress,
  submitTestAttempt,
  getAttemptResult,
  getStudentAttemptHistory,
};
