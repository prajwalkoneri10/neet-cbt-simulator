const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const rateLimit = require("express-rate-limit");
const helmet = require("helmet");
const crypto = require("crypto");
const { Pool } = require("pg");
const { Resend } = require("resend");

const { runMigrations } = require("./migrations");
const {
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
} = require("./testEngine");

const {
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
} = require("./postgresCloudSync");

dotenv.config();

const app = express();

app.set("trust proxy", 1);

const PORT = Number(process.env.PORT || 5000);
const JWT_SECRET = process.env.JWT_SECRET || "default_development_secret_change_in_production_min_32_chars";
const DATABASE_URL = process.env.DATABASE_URL;
const NODE_ENV = process.env.NODE_ENV || "development";
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const RESET_EMAIL_FROM = process.env.RESET_EMAIL_FROM || "onboarding@resend.dev";

// Parse allowed frontend origins from CLIENT_URLS and CLIENT_URL
function getAllowedOrigins() {
  const origins = new Set();

  if (process.env.CLIENT_URLS) {
    process.env.CLIENT_URLS.split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .forEach((o) => origins.add(o.replace(/\/+$/, "")));
  }

  if (process.env.CLIENT_URL) {
    origins.add(process.env.CLIENT_URL.trim().replace(/\/+$/, ""));
  }

  // Stable production Vercel app origin
  origins.add("https://neet-cbt-simulator.vercel.app");

  // Always support standard local frontend ports in development
  origins.add("http://localhost:5173");
  origins.add("http://127.0.0.1:5173");
  origins.add("http://localhost:3000");
  origins.add("http://localhost:4173");

  return Array.from(origins);
}

const allowedOriginsList = getAllowedOrigins();

function isOriginAllowed(origin) {
  if (!origin) return true; // allow same-origin, curl, server-to-server
  const clean = origin.replace(/\/+$/, "");

  // Exact allowlist match
  if (allowedOriginsList.includes(clean)) return true;

  // Localhost match with any port in non-production
  if (NODE_ENV !== "production") {
    if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(clean)) {
      return true;
    }
  }

  // Vercel preview deployment URLs (e.g., https://neet-cbt-simulator-*.vercel.app)
  const allowPreviews = process.env.ALLOW_VERCEL_PREVIEWS !== "false";
  if (
    allowPreviews &&
    /^https:\/\/(neet-cbt-simulator|[a-z0-9-]+-neet-cbt)[a-z0-9-]*\.vercel\.app$/.test(clean)
  ) {
    return true;
  }

  return false;
}

const resend = RESEND_API_KEY ? new Resend(RESEND_API_KEY) : null;

/* =========================================================
   SECURITY VALIDATION
========================================================= */

if (!JWT_SECRET || JWT_SECRET.length < 32) {
  if (NODE_ENV === "production") {
    throw new Error("JWT_SECRET is missing or too short (must be at least 32 chars). Set JWT_SECRET in .env");
  } else {
    console.warn("⚠️ Warning: JWT_SECRET is short or default. Use a strong secret in production.");
  }
}

if (!DATABASE_URL) {
  throw new Error("DATABASE_URL is missing. Set DATABASE_URL in server/.env");
}

/* =========================================================
   POSTGRESQL CONNECTION POOL
========================================================= */

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: {
    rejectUnauthorized: false,
  },
});

// Handle idle connection errors without crashing the server process
pool.on("error", (err, client) => {
  console.warn("⚠️ Non-fatal idle PostgreSQL client disconnected:", err.message);
});

/* =========================================================
   HELMET SECURITY HEADERS
========================================================= */

app.use(
  helmet({
    crossOriginResourcePolicy: {
      policy: "cross-origin",
    },
  })
);

/* =========================================================
   CORS CONFIGURATION
========================================================= */

const corsOptions = {
  origin: (origin, callback) => {
    if (isOriginAllowed(origin)) {
      callback(null, true);
    } else {
      console.warn(`[CORS Blocked] Origin not allowed: ${origin}`);
      callback(new Error(`Origin '${origin}' not permitted by CORS policy.`));
    }
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
};

app.use(cors(corsOptions));
// Support preflight OPTIONS for all paths in Express 5
app.options(/(.*)/, cors(corsOptions));

/* =========================================================
   JSON BODY PARSER
========================================================= */

app.use(express.json({ limit: "15mb" }));

/* =========================================================
   RATE LIMITERS
========================================================= */

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30, // reasonable limit for auth actions
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: "Too many authentication attempts. Please try again after a few minutes.",
  },
});

const resetRequestLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: "Too many password-reset requests. Please try again later.",
  },
});

/* =========================================================
   DATABASE INITIALIZATION & MIGRATIONS
========================================================= */

async function initializeDatabase() {
  const client = await pool.connect();
  try {
    await runMigrations(client);
  } finally {
    client.release();
  }
}

/* =========================================================
   HELPERS & AUTH MIDDLEWARE
========================================================= */

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function createToken(user) {
  return jwt.sign(
    {
      userId: user.id,
      email: user.email,
      name: user.name,
      isAdmin: Boolean(user.is_admin || user.isAdmin),
    },
    JWT_SECRET,
    {
      expiresIn: "7d",
    }
  );
}

async function getUserById(id) {
  const result = await pool.query(
    `SELECT id, name, email, is_admin AS "isAdmin", created_at FROM users WHERE id = $1`,
    [id]
  );
  return result.rows[0] || null;
}

async function getUserByEmail(email) {
  const result = await pool.query(
    `SELECT id, name, email, password_hash, is_admin AS "isAdmin", created_at FROM users WHERE email = $1`,
    [email]
  );
  return result.rows[0] || null;
}

async function getProfile(userId) {
  const result = await pool.query(
    `
      SELECT
        target_year AS "targetYear",
        target_score AS "targetScore",
        target_biology AS "targetBiology",
        target_physics AS "targetPhysics",
        target_chemistry AS "targetChemistry",
        preferred_subjects AS "preferredSubjects"
      FROM profiles
      WHERE user_id = $1
    `,
    [userId]
  );
  return result.rows[0] || null;
}

async function saveProfile(userId, profile) {
  const targetYear =
    profile.targetYear == null || profile.targetYear === ""
      ? null
      : Number(profile.targetYear);

  const targetScore =
    profile.targetScore == null || profile.targetScore === ""
      ? 650
      : Number(profile.targetScore);

  const targetBiology =
    profile.targetBiology == null || profile.targetBiology === ""
      ? 320
      : Number(profile.targetBiology);

  const targetPhysics =
    profile.targetPhysics == null || profile.targetPhysics === ""
      ? 140
      : Number(profile.targetPhysics);

  const targetChemistry =
    profile.targetChemistry == null || profile.targetChemistry === ""
      ? 140
      : Number(profile.targetChemistry);

  const preferredSubjects = Array.isArray(profile.preferredSubjects)
    ? profile.preferredSubjects
    : ["Biology", "Physics", "Chemistry"];

  await pool.query(
    `
      INSERT INTO profiles (
        user_id, target_year, target_score, target_biology, target_physics, target_chemistry, preferred_subjects, updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, NOW())
      ON CONFLICT (user_id)
      DO UPDATE SET
        target_year = EXCLUDED.target_year,
        target_score = EXCLUDED.target_score,
        target_biology = EXCLUDED.target_biology,
        target_physics = EXCLUDED.target_physics,
        target_chemistry = EXCLUDED.target_chemistry,
        preferred_subjects = EXCLUDED.preferred_subjects,
        updated_at = NOW()
    `,
    [
      userId,
      targetYear,
      targetScore,
      targetBiology,
      targetPhysics,
      targetChemistry,
      JSON.stringify(preferredSubjects),
    ]
  );

  return getProfile(userId);
}

function authenticateToken(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({
      error: "Authentication required.",
    });
  }

  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    if (err) {
      return res.status(401).json({
        error: "Invalid or expired authentication token.",
      });
    }
    req.user = decoded;
    next();
  });
}

function requireAdmin(req, res, next) {
  if (!req.user || !req.user.isAdmin) {
    return res.status(403).json({
      error: "Access denied. Administrator privileges are required to access this resource.",
    });
  }
  next();
}

function hashResetToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function createResetToken() {
  return crypto.randomBytes(32).toString("hex");
}

function validateNewPassword(password) {
  const value = String(password || "");
  if (value.length < 6) {
    return "Password must contain at least 6 characters.";
  }
  if (value.length > 128) {
    return "Password must not exceed 128 characters.";
  }
  return null;
}

/* =========================================================
   ROUTES: HEALTH CHECK
========================================================= */

app.get("/api/health", async (req, res) => {
  try {
    const dbRes = await pool.query("SELECT NOW() AS current_time");
    res.json({
      ok: true,
      service: "NEET CBT Simulator Backend",
      database: "PostgreSQL",
      dbStatus: "connected",
      cloudSync: true,
      security: {
        helmet: true,
        rateLimit: true,
        jwtProtection: true,
        corsAllowlist: allowedOriginsList.length,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Health check DB query failed:", error.message);
    res.status(503).json({
      ok: false,
      error: "Database unavailable.",
      timestamp: new Date().toISOString(),
    });
  }
});

/* =========================================================
   ROUTES: AUTHENTICATION
========================================================= */

app.post("/api/auth/signup", authLimiter, async (req, res, next) => {
  try {
    const name = String(req.body.name || "").trim();
    const email = normalizeEmail(req.body.email);
    const password = String(req.body.password || "");

    if (!name || name.length > 60) {
      return res.status(400).json({
        error: "Please enter a valid student name (up to 60 characters).",
      });
    }

    if (!email || !email.includes("@") || email.length > 255) {
      return res.status(400).json({
        error: "Please enter a valid email address.",
      });
    }

    const passwordError = validateNewPassword(password);
    if (passwordError) {
      return res.status(400).json({
        error: passwordError,
      });
    }

    const existing = await getUserByEmail(email);
    if (existing) {
      return res.status(409).json({
        error: "An account with this email already exists.",
      });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const result = await pool.query(
      `
        INSERT INTO users (name, email, password_hash, created_at)
        VALUES ($1, $2, $3, NOW())
        RETURNING id, name, email, is_admin AS "isAdmin", created_at
      `,
      [name, email, passwordHash]
    );

    const user = {
      ...result.rows[0],
      isAdmin: Boolean(result.rows[0].isAdmin),
    };

    await saveProfile(user.id, {
      targetYear: 2027,
      targetScore: 650,
      targetBiology: 320,
      targetPhysics: 140,
      targetChemistry: 140,
      preferredSubjects: ["Biology", "Physics", "Chemistry"],
    });

    res.status(201).json({
      token: createToken(user),
      user,
      profile: await getProfile(user.id),
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/auth/login", authLimiter, async (req, res, next) => {
  try {
    const email = normalizeEmail(req.body.email);
    const password = String(req.body.password || "");

    if (!email || !password) {
      return res.status(400).json({
        error: "Email and password are required.",
      });
    }

    const user = await getUserByEmail(email);

    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      return res.status(401).json({
        error: "Invalid email or password.",
      });
    }

    const safeUser = {
      id: user.id,
      name: user.name,
      email: user.email,
      isAdmin: Boolean(user.isAdmin),
      created_at: user.created_at,
    };

    res.json({
      token: createToken(safeUser),
      user: safeUser,
      profile: await getProfile(user.id),
    });
  } catch (error) {
    next(error);
  }
});

app.get("/api/auth/me", authenticateToken, async (req, res, next) => {
  try {
    const user = await getUserById(req.user.userId);
    if (!user) {
      return res.status(401).json({
        error: "Account not found.",
      });
    }

    res.json({
      user,
      profile: await getProfile(user.id),
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/auth/request-password-reset", resetRequestLimiter, async (req, res, next) => {
  try {
    const email = normalizeEmail(req.body.email);
    if (!email || !email.includes("@")) {
      return res.status(400).json({
        error: "Enter a valid email address.",
      });
    }

    const user = await getUserByEmail(email);
    if (!user) {
      // Do not disclose whether email exists
      return res.json({
        success: true,
        message: "If that email is registered, password-reset instructions have been generated.",
      });
    }

    const token = createResetToken();
    const tokenHash = hashResetToken(token);
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    await pool.query(
      `
        INSERT INTO password_reset_tokens (user_id, token_hash, expires_at, created_at)
        VALUES ($1, $2, $3, NOW())
      `,
      [user.id, tokenHash, expiresAt]
    );

    const clientOrigin = allowedOriginsList[0] || "http://localhost:5173";
    const resetUrl = `${clientOrigin}/#reset=${token}`;

    if (resend) {
      try {
        await resend.emails.send({
          from: RESET_EMAIL_FROM,
          to: user.email,
          subject: "Reset your NEET CBT Simulator password",
          html: `
            <div style="font-family: sans-serif; max-width: 500px; margin: 0 auto; padding: 20px;">
              <h2>NEET CBT Simulator Password Reset</h2>
              <p>Hello ${user.name},</p>
              <p>You requested a password reset. Click the button below to set a new password:</p>
              <a href="${resetUrl}" style="display:inline-block; padding:10px 20px; background:#1e3a8a; color:#fff; text-decoration:none; border-radius:4px; font-weight:bold;">Reset Password</a>
              <p style="margin-top:20px; color:#666; font-size:12px;">This link will expire in 1 hour.</p>
            </div>
          `,
        });
      } catch (err) {
        console.error("Resend email delivery failed:", err.message);
      }
    } else {
      console.log(`[Development Password Reset Link for ${user.email}]: ${resetUrl}`);
    }

    res.json({
      success: true,
      message: "If that email is registered, password-reset instructions have been sent.",
      // Include resetUrl in development mode for easy testing
      ...(NODE_ENV !== "production" ? { devResetUrl: resetUrl } : {}),
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/auth/reset-password", authLimiter, async (req, res, next) => {
  try {
    const token = String(req.body.token || "").trim();
    const newPassword = String(req.body.newPassword || "");

    if (!token) {
      return res.status(400).json({ error: "Reset token is required." });
    }

    const passwordError = validateNewPassword(newPassword);
    if (passwordError) {
      return res.status(400).json({ error: passwordError });
    }

    const tokenHash = hashResetToken(token);
    const tokenRes = await pool.query(
      `
        SELECT id, user_id, expires_at, used_at
        FROM password_reset_tokens
        WHERE token_hash = $1
      `,
      [tokenHash]
    );

    if (tokenRes.rows.length === 0) {
      return res.status(400).json({ error: "Invalid or expired reset token." });
    }

    const record = tokenRes.rows[0];
    if (record.used_at || new Date() > new Date(record.expires_at)) {
      return res.status(400).json({ error: "This reset link has expired or has already been used." });
    }

    const passwordHash = await bcrypt.hash(newPassword, 12);

    await pool.query("BEGIN");
    await pool.query(`UPDATE users SET password_hash = $1 WHERE id = $2`, [passwordHash, record.user_id]);
    await pool.query(`UPDATE password_reset_tokens SET used_at = NOW() WHERE id = $1`, [record.id]);
    await pool.query("COMMIT");

    res.json({
      success: true,
      message: "Password reset successfully. You may now log in with your new password.",
    });
  } catch (error) {
    await pool.query("ROLLBACK").catch(() => null);
    next(error);
  }
});

/* =========================================================
   ROUTES: STUDENT PROFILE
========================================================= */

app.get("/api/profile", authenticateToken, async (req, res, next) => {
  try {
    res.json({
      profile: await getProfile(req.user.userId),
    });
  } catch (error) {
    next(error);
  }
});

app.put("/api/profile", authenticateToken, async (req, res, next) => {
  try {
    res.json({
      profile: await saveProfile(req.user.userId, req.body || {}),
    });
  } catch (error) {
    next(error);
  }
});

/* =========================================================
   ROUTES: STUDENT GOALS
========================================================= */

app.get("/api/goals", authenticateToken, async (req, res, next) => {
  try {
    const profile = (await getProfile(req.user.userId)) || {};

    const statsRes = await pool.query(
      `
      SELECT
        COUNT(*) AS "completedTests",
        COALESCE(MAX(score), 0) AS "bestScore",
        COALESCE(ROUND(AVG(score)), 0) AS "averageScore",
        COALESCE(ROUND(AVG(accuracy)), 0) AS "averageAccuracy"
      FROM test_attempts
      WHERE user_id = $1 AND status = 'completed'
      `,
      [req.user.userId]
    );

    const stats = statsRes.rows[0] || {};
    const targetScore = profile.targetScore != null ? Number(profile.targetScore) : 650;
    const targetBiology = profile.targetBiology != null ? Number(profile.targetBiology) : 320;
    const targetPhysics = profile.targetPhysics != null ? Number(profile.targetPhysics) : 140;
    const targetChemistry = profile.targetChemistry != null ? Number(profile.targetChemistry) : 140;
    const currentAvg = Number(stats.averageScore) || 0;
    const bestScore = Number(stats.bestScore) || 0;
    const gap = Math.max(0, targetScore - currentAvg);

    // Calculate subject averages from attempt rows
    const subjectRes = await pool.query(
      `
      SELECT
        ROUND(AVG((subject_breakdown->'Biology'->>'score')::numeric)) AS "bioAvg",
        ROUND(AVG((subject_breakdown->'Physics'->>'score')::numeric)) AS "physAvg",
        ROUND(AVG((subject_breakdown->'Chemistry'->>'score')::numeric)) AS "chemAvg"
      FROM test_attempts
      WHERE user_id = $1 AND status = 'completed' AND subject_breakdown IS NOT NULL
      `,
      [req.user.userId]
    );

    const subAvgs = subjectRes.rows[0] || {};

    res.json({
      targetYear: profile.targetYear || 2027,
      targetScore,
      targetBiology,
      targetPhysics,
      targetChemistry,
      completedTests: Number(stats.completedTests) || 0,
      bestScore,
      averageScore: currentAvg,
      averageAccuracy: Number(stats.averageAccuracy) || 0,
      scoreGap: gap,
      biologyAverage: Number(subAvgs.bioAvg) || 0,
      physicsAverage: Number(subAvgs.physAvg) || 0,
      chemistryAverage: Number(subAvgs.chemAvg) || 0,
    });
  } catch (error) {
    next(error);
  }
});

app.put("/api/goals", authenticateToken, async (req, res, next) => {
  try {
    const { targetScore, targetBiology, targetPhysics, targetChemistry, targetYear } = req.body || {};

    const tScore = Number(targetScore);
    const tBio = Number(targetBiology);
    const tPhys = Number(targetPhysics);
    const tChem = Number(targetChemistry);

    if (tScore < 0 || tScore > 720) {
      return res.status(400).json({ error: "Total target score must be between 0 and 720." });
    }
    if (tBio < 0 || tBio > 360) {
      return res.status(400).json({ error: "Biology target score must be between 0 and 360." });
    }
    if (tPhys < 0 || tPhys > 180) {
      return res.status(400).json({ error: "Physics target score must be between 0 and 180." });
    }
    if (tChem < 0 || tChem > 180) {
      return res.status(400).json({ error: "Chemistry target score must be between 0 and 180." });
    }

    const updated = await saveProfile(req.user.userId, {
      targetYear: targetYear || 2027,
      targetScore: tScore,
      targetBiology: tBio,
      targetPhysics: tPhys,
      targetChemistry: tChem,
    });

    res.json({ success: true, profile: updated });
  } catch (error) {
    next(error);
  }
});

/* =========================================================
   ROUTES: PERFORMANCE ANALYTICS
========================================================= */

app.get("/api/analytics", authenticateToken, async (req, res, next) => {
  try {
    const userId = req.user.userId;

    // 1. Attempts trajectory
    const attemptsRes = await pool.query(
      `
      SELECT
        id AS "attemptId",
        test_title AS "testTitle",
        score,
        max_score AS "maxScore",
        accuracy,
        submitted_at AS "submittedAt",
        time_taken_seconds AS "timeTakenSeconds",
        subject_breakdown AS "subjects",
        chapter_breakdown AS "chapters"
      FROM test_attempts
      WHERE user_id = $1 AND status = 'completed'
      ORDER BY submitted_at ASC
      `,
      [userId]
    );

    const attempts = attemptsRes.rows;

    // 2. Aggregate subject stats
    const subjects = {
      Biology: { totalQuestions: 0, attempted: 0, correct: 0, wrong: 0, unanswered: 0, totalScore: 0, testCount: 0, maxPossible: 0 },
      Physics: { totalQuestions: 0, attempted: 0, correct: 0, wrong: 0, unanswered: 0, totalScore: 0, testCount: 0, maxPossible: 0 },
      Chemistry: { totalQuestions: 0, attempted: 0, correct: 0, wrong: 0, unanswered: 0, totalScore: 0, testCount: 0, maxPossible: 0 },
    };

    const chapterAgg = {};

    attempts.forEach((att) => {
      const subs = att.subjects || {};
      for (const [sName, sData] of Object.entries(subs)) {
        if (subjects[sName]) {
          subjects[sName].totalQuestions += Number(sData.total || 0);
          subjects[sName].attempted += Number(sData.attempted || 0);
          subjects[sName].correct += Number(sData.correct || 0);
          subjects[sName].wrong += Number(sData.wrong || 0);
          subjects[sName].unanswered += Number(sData.unanswered || 0);
          subjects[sName].totalScore += Number(sData.score || 0);
          subjects[sName].maxPossible += (Number(sData.total || 0) * 4);
          subjects[sName].testCount += 1;
        }
      }

      const chaps = Array.isArray(att.chapters) ? att.chapters : [];
      chaps.forEach((ch) => {
        const key = `${ch.subject || "General"}: ${ch.chapter || "General"}`;
        if (!chapterAgg[key]) {
          chapterAgg[key] = {
            subject: ch.subject || "General",
            chapter: ch.chapter || "General",
            total: 0,
            attempted: 0,
            correct: 0,
            wrong: 0,
          };
        }
        chapterAgg[key].total += Number(ch.total || 0);
        chapterAgg[key].attempted += Number(ch.attempted || 0);
        chapterAgg[key].correct += Number(ch.correct || 0);
        chapterAgg[key].wrong += Number(ch.wrong || 0);
      });
    });

    const subjectAnalysis = {};
    let strongest = null;
    let weakest = null;
    let highestAcc = -1;
    let lowestAcc = 101;

    for (const [sName, sStat] of Object.entries(subjects)) {
      const acc = sStat.attempted > 0 ? Math.round((sStat.correct / sStat.attempted) * 100) : 0;
      const avgScore = sStat.testCount > 0 ? Math.round(sStat.totalScore / sStat.testCount) : 0;

      subjectAnalysis[sName] = {
        name: sName,
        totalQuestions: sStat.totalQuestions,
        attempted: sStat.attempted,
        correct: sStat.correct,
        wrong: sStat.wrong,
        unanswered: sStat.unanswered,
        accuracy: acc,
        averageScore: avgScore,
        maxScorePossible: sName === "Biology" ? 360 : 180,
      };

      if (sStat.attempted > 0) {
        if (acc > highestAcc) {
          highestAcc = acc;
          strongest = { name: sName, accuracy: acc, avgScore };
        }
        if (acc < lowestAcc) {
          lowestAcc = acc;
          weakest = { name: sName, accuracy: acc, avgScore };
        }
      }
    }

    const chapterList = Object.values(chapterAgg).map((c) => {
      const acc = c.attempted > 0 ? Math.round((c.correct / c.attempted) * 100) : 0;
      let status = "Needs Practice";
      if (acc < 50) status = "Weak";
      else if (acc >= 75) status = "Strong";
      return {
        ...c,
        accuracy: acc,
        status,
      };
    }).sort((a, b) => a.accuracy - b.accuracy);

    // Generate smart recommendations
    const recommendations = [];
    if (weakest) {
      recommendations.push({
        type: "focus",
        subject: weakest.name,
        title: `Prioritize ${weakest.name} revision`,
        detail: `Your ${weakest.name} accuracy is currently ${weakest.accuracy}%. Target solving 30 dedicated practice questions daily.`,
      });
    }

    const weakChapters = chapterList.filter((c) => c.status === "Weak").slice(0, 3);
    if (weakChapters.length > 0) {
      recommendations.push({
        type: "chapter",
        title: "High-Priority Chapters",
        detail: `Focus on: ${weakChapters.map((c) => `${c.chapter} (${c.accuracy}%)`).join(", ")}. Review fundamental theory and NCERT exemplars.`,
      });
    }

    if (strongest) {
      recommendations.push({
        type: "strength",
        subject: strongest.name,
        title: `Leverage strength in ${strongest.name}`,
        detail: `Maintaining high accuracy (${strongest.accuracy}%) in ${strongest.name} gives you a solid scoring buffer. Keep taking sectional timed mocks.`,
      });
    }

    if (recommendations.length === 0) {
      recommendations.push({
        type: "general",
        title: "Begin Your Mock Journey",
        detail: "Complete your first NEET Full Mock or Subject Test to unlock personalized AI diagnostic insights.",
      });
    }

    res.json({
      totalAttempts: attempts.length,
      scoreTrajectory: attempts.map((a) => ({
        attemptId: a.attemptId,
        testTitle: a.testTitle,
        score: Number(a.score),
        maxScore: Number(a.maxScore),
        accuracy: Number(a.accuracy),
        submittedAt: a.submittedAt,
        timeTakenMinutes: Math.round((Number(a.timeTakenSeconds) || 0) / 60),
        biologyScore: Number(a.subjects?.Biology?.score || 0),
        physicsScore: Number(a.subjects?.Physics?.score || 0),
        chemistryScore: Number(a.subjects?.Chemistry?.score || 0),
      })),
      subjectPerformance: subjectAnalysis,
      strongestSubject: strongest,
      weakestSubject: weakest,
      chapters: chapterList,
      recommendations,
    });
  } catch (error) {
    next(error);
  }
});

/* =========================================================
   ROUTES: TEST ENGINE & ATTEMPTS
========================================================= */

// Get all available tests (default mock tests + user's custom tests)
app.get("/api/tests/available", authenticateToken, async (req, res, next) => {
  try {
    const tests = await getAvailableTests(pool, req.user.userId);
    res.json({ tests });
  } catch (error) {
    next(error);
  }
});

// Create custom mock test from question bank
app.post("/api/tests/custom", authenticateToken, async (req, res, next) => {
  try {
    const result = await createCustomMockTest(pool, {
      userId: req.user.userId,
      title: req.body.title,
      durationMinutes: req.body.durationMinutes,
      counts: req.body.counts,
      selectedChapters: req.body.selectedChapters,
    });
    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
});

// Import and save a student's personal mock test from PDF / CSV
app.post("/api/tests/personal/import", authenticateToken, async (req, res, next) => {
  const client = await pool.connect();
  try {
    const {
      title,
      description = "",
      durationMinutes = 180,
      category = "personal",
      questions = [],
    } = req.body || {};

    if (!title || !String(title).trim()) {
      return res.status(400).json({ error: "Test title is required." });
    }

    if (!Array.isArray(questions) || questions.length === 0) {
      return res.status(400).json({ error: "At least one question is required." });
    }

    if (questions.length > 250) {
      return res.status(400).json({ error: "A maximum of 250 questions is permitted per test paper." });
    }

    // Validate each question & answer
    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      const qNum = q.number || i + 1;
      if (!q.question || !String(q.question).trim()) {
        return res.status(400).json({ error: `Question #${qNum} has empty question text.` });
      }
      if (!Array.isArray(q.options) || q.options.length < 4 || q.options.some((o) => !String(o || "").trim())) {
        return res.status(400).json({ error: `Question #${qNum} must have 4 non-empty options (A, B, C, D).` });
      }
      const ans = String(q.correctAnswer || "").trim().toUpperCase();
      if (!["A", "B", "C", "D"].includes(ans)) {
        return res.status(400).json({
          error: `Question #${qNum} has invalid correct answer: "${q.correctAnswer}". Must be Option A, B, C, or D.`,
        });
      }
    }

    await client.query("BEGIN");

    const totalMarks = questions.length * 4;
    const durMins = Math.max(5, Math.min(360, Number(durationMinutes) || 180));

    // Save with is_public = false, created_by = req.user.userId
    const setRes = await client.query(
      `
      INSERT INTO question_sets (
        title, description, is_public, total_questions, duration_minutes,
        marks_per_correct, marks_per_incorrect, category, total_marks, created_by, created_at, updated_at
      )
      VALUES ($1, $2, false, $3, $4, 4, -1, $5, $6, $7, NOW(), NOW())
      RETURNING id, title, total_questions, duration_minutes, category, total_marks, created_at
      `,
      [
        String(title).trim(),
        String(description || "Personal test uploaded by student").trim(),
        questions.length,
        durMins,
        category || "personal",
        totalMarks,
        req.user.userId,
      ]
    );

    const newSet = setRes.rows[0];

    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
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
          newSet.id,
          q.number || (i + 1),
          q.subject || "Biology",
          q.chapter || "General",
          String(q.question).trim(),
          String(q.options[0]).trim(),
          String(q.options[1]).trim(),
          String(q.options[2]).trim(),
          String(q.options[3]).trim(),
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
          String(q.correctAnswer).trim().toUpperCase(),
          q.explanation || `Correct answer is Option ${String(q.correctAnswer).trim().toUpperCase()}.`,
        ]
      );
    }

    await client.query("COMMIT");

    res.status(201).json({
      success: true,
      message: `Personal test "${newSet.title}" successfully saved with ${questions.length} questions.`,
      testId: newSet.id,
      questionSet: newSet,
    });
  } catch (error) {
    await client.query("ROLLBACK");
    next(error);
  } finally {
    client.release();
  }
});

// Start or resume test attempt (NEVER returns correct answer keys)
app.post("/api/tests/:testId/start", authenticateToken, async (req, res, next) => {
  try {
    const testId = Number(req.params.testId);
    if (!testId || isNaN(testId)) {
      return res.status(400).json({ error: "Invalid test ID." });
    }

    const session = await startOrResumeTestAttempt(pool, req.user.userId, testId);
    res.json(session);
  } catch (error) {
    next(error);
  }
});

// Get active in-progress attempt for current student
app.get("/api/tests/attempts/active", authenticateToken, async (req, res, next) => {
  try {
    const activeAttempt = await getActiveAttemptForStudent(pool, req.user.userId);
    res.json({ activeAttempt });
  } catch (error) {
    next(error);
  }
});

// Autosave progress (selected options, marked for review, visited)
app.put("/api/tests/attempts/:attemptId/save-progress", authenticateToken, async (req, res, next) => {
  try {
    const attemptId = Number(req.params.attemptId);
    if (!attemptId || isNaN(attemptId)) {
      return res.status(400).json({ error: "Invalid attempt ID." });
    }

    const { answers, markedQuestions, visitedQuestions } = req.body || {};
    const result = await saveAttemptProgress(pool, {
      userId: req.user.userId,
      attemptId,
      answers,
      markedQuestions,
      visitedQuestions,
    });
    res.json(result);
  } catch (error) {
    next(error);
  }
});

// Submit test attempt (Server-Side +4 / -1 / 0 Score Calculation)
app.post("/api/tests/attempts/:attemptId/submit", authenticateToken, async (req, res, next) => {
  try {
    const attemptId = Number(req.params.attemptId);
    if (!attemptId || isNaN(attemptId)) {
      return res.status(400).json({ error: "Invalid attempt ID." });
    }

    const { finalAnswers, reason } = req.body || {};
    const result = await submitTestAttempt(pool, {
      userId: req.user.userId,
      attemptId,
      finalAnswers,
      reason: reason || "manual",
    });
    res.json(result);
  } catch (error) {
    next(error);
  }
});

// Get completed test attempt result & answer review
app.get("/api/tests/attempts/:attemptId/result", authenticateToken, async (req, res, next) => {
  try {
    const attemptId = Number(req.params.attemptId);
    if (!attemptId || isNaN(attemptId)) {
      return res.status(400).json({ error: "Invalid attempt ID." });
    }

    const result = await getAttemptResult(pool, {
      userId: req.user.userId,
      attemptId,
    });
    res.json(result);
  } catch (error) {
    next(error);
  }
});

// Get student's previous completed attempts history
app.get("/api/tests/attempts/history", authenticateToken, async (req, res, next) => {
  try {
    const history = await getStudentAttemptHistory(pool, req.user.userId);
    res.json({ history });
  } catch (error) {
    next(error);
  }
});

/* =========================================================
   ROUTES: QUESTION BANK & CSV IMPORT
========================================================= */

app.post("/api/questions/import-csv", authenticateToken, async (req, res, next) => {
  try {
    const {
      title,
      description,
      durationMinutes,
      marksPerCorrect,
      marksPerIncorrect,
      questionsCsv,
      answersCsv,
      dryRun,
    } = req.body || {};

    if (!questionsCsv) {
      return res.status(400).json({
        error: "Question paper CSV content is required.",
      });
    }

    if (!answersCsv) {
      return res.status(400).json({
        error: "Answer key CSV content is required.",
      });
    }

    const result = await importQuestionSetFromCSVs(pool, {
      userId: req.user.userId,
      title,
      description,
      durationMinutes,
      marksPerCorrect,
      marksPerIncorrect,
      questionsCsv,
      answersCsv,
      dryRun: Boolean(dryRun),
    });

    if (!result.success) {
      return res.status(400).json(result);
    }

    res.status(dryRun ? 200 : 201).json(result);
  } catch (error) {
    next(error);
  }
});

/* =========================================================
   ROUTES: ADMIN QUESTION MANAGEMENT & STATS
========================================================= */

app.post("/api/admin/questions/publish", authenticateToken, requireAdmin, async (req, res, next) => {
  const client = await pool.connect();
  try {
    const {
      title,
      description = "",
      durationMinutes = 180,
      category = "full_mock",
      questions = [],
    } = req.body || {};

    if (!title || !title.trim()) {
      return res.status(400).json({ error: "Test title is required." });
    }

    if (!Array.isArray(questions) || questions.length === 0) {
      return res.status(400).json({ error: "Questions array cannot be empty." });
    }

    // Validate each question
    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      if (!q.question || !q.question.trim()) {
        return res.status(400).json({ error: `Question #${q.number || i + 1} is missing question text.` });
      }
      if (!Array.isArray(q.options) || q.options.length < 4) {
        return res.status(400).json({ error: `Question #${q.number || i + 1} must have 4 options (A, B, C, D).` });
      }
      if (!q.correctAnswer || !["A", "B", "C", "D"].includes(String(q.correctAnswer).trim().toUpperCase())) {
        return res.status(400).json({ error: `Question #${q.number || i + 1} has invalid correct option: "${q.correctAnswer}". Must be A, B, C, or D.` });
      }
    }

    await client.query("BEGIN");

    const totalMarks = questions.length * 4;

    const setRes = await client.query(
      `
      INSERT INTO question_sets (
        title, description, is_public, total_questions, duration_minutes,
        marks_per_correct, marks_per_incorrect, category, total_marks, created_by, created_at, updated_at
      )
      VALUES ($1, $2, true, $3, $4, 4, -1, $5, $6, $7, NOW(), NOW())
      RETURNING id, title, total_questions, duration_minutes, category, total_marks
      `,
      [
        title.trim(),
        description.trim(),
        questions.length,
        Number(durationMinutes) || 180,
        category || "full_mock",
        totalMarks,
        req.user.userId,
      ]
    );

    const newSet = setRes.rows[0];

    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
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
          newSet.id,
          q.number || (i + 1),
          q.subject || "General",
          q.chapter || "General",
          q.question.trim(),
          q.options[0],
          q.options[1],
          q.options[2],
          q.options[3],
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
          String(q.correctAnswer).trim().toUpperCase(),
          q.explanation || `Correct answer is Option ${String(q.correctAnswer).trim().toUpperCase()}.`,
        ]
      );
    }

    await client.query("COMMIT");

    res.status(201).json({
      success: true,
      message: `Successfully published "${newSet.title}" with ${questions.length} questions.`,
      questionSet: newSet,
    });
  } catch (error) {
    await client.query("ROLLBACK");
    next(error);
  } finally {
    client.release();
  }
});

app.get("/api/admin/stats", authenticateToken, requireAdmin, async (req, res, next) => {
  try {
    const stats = await pool.query(`
      SELECT
        (SELECT COUNT(*) FROM users) AS "totalUsers",
        (SELECT COUNT(*) FROM question_sets) AS "totalSets",
        (SELECT COUNT(*) FROM questions) AS "totalQuestions",
        (SELECT COUNT(*) FROM test_attempts WHERE status = 'completed') AS "totalCompletedAttempts"
    `);
    res.json(stats.rows[0] || {});
  } catch (error) {
    next(error);
  }
});

/* =========================================================
   LEGACY CLOUD SYNC ROUTES (Preserved for compatibility)
========================================================= */

app.get("/api/cloud/mock-tests", authenticateToken, async (req, res, next) => {
  try {
    res.json({ mockTests: await getMockTests(req.user.userId) });
  } catch (error) {
    next(error);
  }
});

app.post("/api/cloud/mock-tests", authenticateToken, async (req, res, next) => {
  try {
    res.json({ mockTest: await saveMockTest(req.user.userId, req.body) });
  } catch (error) {
    next(error);
  }
});

app.delete("/api/cloud/mock-tests/:mockId", authenticateToken, async (req, res, next) => {
  try {
    await deleteMockTest(req.user.userId, req.params.mockId);
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

app.get("/api/cloud/exam-sessions", authenticateToken, async (req, res, next) => {
  try {
    res.json({ sessions: await getExamSessions(req.user.userId) });
  } catch (error) {
    next(error);
  }
});

app.post("/api/cloud/exam-sessions", authenticateToken, async (req, res, next) => {
  try {
    const { examId, sessionData } = req.body || {};
    res.json({ session: await saveExamSession(req.user.userId, examId, sessionData) });
  } catch (error) {
    next(error);
  }
});

app.delete("/api/cloud/exam-sessions/:examId", authenticateToken, async (req, res, next) => {
  try {
    await deleteExamSession(req.user.userId, req.params.examId);
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

app.get("/api/cloud/attempt-history", authenticateToken, async (req, res, next) => {
  try {
    res.json({ attempts: await getAttemptHistory(req.user.userId) });
  } catch (error) {
    next(error);
  }
});

app.post("/api/cloud/attempt-history", authenticateToken, async (req, res, next) => {
  try {
    res.json({ attempt: await saveAttempt(req.user.userId, req.body) });
  } catch (error) {
    next(error);
  }
});

app.delete("/api/cloud/attempt-history", authenticateToken, async (req, res, next) => {
  try {
    await deleteAttemptHistory(req.user.userId);
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

/* =========================================================
   404 HANDLER FOR UNKNOWN API ROUTES
========================================================= */

app.use((req, res) => {
  res.status(404).json({
    error: `API route not found: ${req.method} ${req.originalUrl}`,
  });
});

/* =========================================================
   GLOBAL ERROR HANDLER
========================================================= */

app.use((err, req, res, next) => {
  // Safe logging without leaking sensitive payload data
  console.error(`[Error] ${req.method} ${req.originalUrl}:`, err.message || err);

  if (res.headersSent) {
    return next(err);
  }

  // Handle CORS errors specifically
  if (err.message && err.message.includes("CORS policy")) {
    return res.status(403).json({
      error: "CORS error: Request origin is not permitted.",
    });
  }

  res.status(err.status || 500).json({
    error: err.message && NODE_ENV !== "production" ? err.message : "Internal server error.",
  });
});

/* =========================================================
   START SERVER
========================================================= */

async function startServer() {
  try {
    await initializeDatabase();
    await seedDefaultQuestionSetIfEmpty(pool);
    await seedSubjectPracticeSetsIfMissing(pool);
    await testConnection();

    app.listen(PORT, () => {
      console.log("========================================");
      console.log("NEET CBT SIMULATOR BACKEND ONLINE");
      console.log(`Port: ${PORT}`);
      console.log(`Health: http://localhost:${PORT}/api/health`);
      console.log(`Allowed Origins: ${allowedOriginsList.join(", ")}`);
      console.log("Database: PostgreSQL Connected");
      console.log("========================================");
    });
  } catch (error) {
    console.error("Failed to start server:", error);
    process.exit(1);
  }
}

if (require.main === module) {
  startServer();
}

module.exports = { app, pool, initializeDatabase };
