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

const JWT_SECRET = process.env.JWT_SECRET;

const CLIENT_URL =
  process.env.CLIENT_URL || "http://localhost:5173";

const DATABASE_URL = process.env.DATABASE_URL;

const NODE_ENV = process.env.NODE_ENV || "development";
const RESEND_API_KEY = process.env.RESEND_API_KEY;

const RESET_EMAIL_FROM =
  process.env.RESET_EMAIL_FROM || "onboarding@resend.dev";

const APP_URL =
  process.env.APP_URL || CLIENT_URL;

if (!RESEND_API_KEY) {
  throw new Error(
    "RESEND_API_KEY is missing. Set RESEND_API_KEY in server/.env"
  );
}

const resend = new Resend(RESEND_API_KEY);

/* =========================================================
   SECURITY VALIDATION
========================================================= */

if (!JWT_SECRET || JWT_SECRET.length < 32) {
  throw new Error(
    "JWT_SECRET is missing or too short. Set a strong JWT_SECRET in server/.env"
  );
}

if (!DATABASE_URL) {
  throw new Error(
    "DATABASE_URL is missing. Set DATABASE_URL in server/.env"
  );
}

/* =========================================================
   POSTGRESQL
========================================================= */

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: {
    rejectUnauthorized: false,
  },
});

/* =========================================================
   HELMET
========================================================= */

app.use(
  helmet({
    crossOriginResourcePolicy: {
      policy: "cross-origin",
    },
  })
);

/* =========================================================
   CORS
========================================================= */

app.use(
  cors({
    origin: CLIENT_URL,
    credentials: false,
  })
);

/* =========================================================
   JSON BODY
========================================================= */

app.use(
  express.json({
    limit: "10mb",
  })
);

/* =========================================================
   AUTH RATE LIMITER
========================================================= */

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,

  max: 10,

  standardHeaders: true,

  legacyHeaders: false,

  message: {
    error:
      "Too many authentication attempts. Please try again later.",
  },
});

/* =========================================================
   PASSWORD RESET RATE LIMITER
========================================================= */

const resetRequestLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,

  max: 5,

  standardHeaders: true,

  legacyHeaders: false,

  message: {
    error:
      "Too many password-reset requests. Please try again later.",
  },
});

/* =========================================================
   DATABASE INITIALIZATION
========================================================= */

async function initializeDatabase() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS profiles (
      user_id INTEGER PRIMARY KEY
        REFERENCES users(id)
        ON DELETE CASCADE,

      target_year INTEGER,

      target_score INTEGER,

      preferred_subjects JSONB
        NOT NULL DEFAULT '[]'::jsonb,

      updated_at TIMESTAMPTZ
        NOT NULL DEFAULT NOW()
    )
  `);

  /* =====================================================
     PASSWORD RESET TOKENS
  ===================================================== */

  await pool.query(`
    CREATE TABLE IF NOT EXISTS password_reset_tokens (
      id SERIAL PRIMARY KEY,

      user_id INTEGER NOT NULL
        REFERENCES users(id)
        ON DELETE CASCADE,

      token_hash TEXT UNIQUE NOT NULL,

      expires_at TIMESTAMPTZ NOT NULL,

      used_at TIMESTAMPTZ,

      created_at TIMESTAMPTZ
        NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS
    idx_password_reset_user
    ON password_reset_tokens(user_id)
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS
    idx_password_reset_expiry
    ON password_reset_tokens(expires_at)
  `);
}

/* =========================================================
   HELPERS
========================================================= */

function normalizeEmail(email) {
  return String(email || "")
    .trim()
    .toLowerCase();
}

/* =========================================================
   JWT
========================================================= */

function createToken(user) {
  return jwt.sign(
    {
      userId: user.id,
      email: user.email,
    },
    JWT_SECRET,
    {
      expiresIn: "7d",
    }
  );
}

/* =========================================================
   GET USER BY ID
========================================================= */

async function getUserById(id) {
  const result = await pool.query(
    `
      SELECT
        id,
        name,
        email,
        created_at
      FROM users
      WHERE id = $1
    `,
    [id]
  );

  return result.rows[0] || null;
}

/* =========================================================
   GET USER BY EMAIL
========================================================= */

async function getUserByEmail(email) {
  const result = await pool.query(
    `
      SELECT
        id,
        name,
        email,
        password_hash,
        created_at
      FROM users
      WHERE email = $1
    `,
    [email]
  );

  return result.rows[0] || null;
}

/* =========================================================
   GET PROFILE
========================================================= */

async function getProfile(userId) {
  const result = await pool.query(
    `
      SELECT
        target_year AS "targetYear",
        target_score AS "targetScore",
        preferred_subjects AS "preferredSubjects"
      FROM profiles
      WHERE user_id = $1
    `,
    [userId]
  );

  return result.rows[0] || null;
}

/* =========================================================
   SAVE PROFILE
========================================================= */

async function saveProfile(userId, profile) {
  const targetYear =
    profile.targetYear == null ||
    profile.targetYear === ""
      ? null
      : Number(profile.targetYear);

  const targetScore =
    profile.targetScore == null ||
    profile.targetScore === ""
      ? null
      : Number(profile.targetScore);

  const preferredSubjects = Array.isArray(
    profile.preferredSubjects
  )
    ? profile.preferredSubjects
    : [];

  await pool.query(
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
        NOW()
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
          NOW()
    `,
    [
      userId,
      targetYear,
      targetScore,
      JSON.stringify(preferredSubjects),
    ]
  );

  return getProfile(userId);
}

/* =========================================================
   AUTHENTICATION MIDDLEWARE
========================================================= */

function authenticateToken(req, res, next) {
  const header =
    req.headers.authorization || "";

  const token = header.startsWith("Bearer ")
    ? header.slice(7)
    : null;

  if (!token) {
    return res.status(401).json({
      error: "Authentication required.",
    });
  }

  jwt.verify(
    token,
    JWT_SECRET,
    (err, decoded) => {
      if (err) {
        return res.status(401).json({
          error:
            "Invalid or expired authentication token.",
        });
      }

      req.user = decoded;

      next();
    }
  );
}

/* =========================================================
   PASSWORD RESET TOKEN HELPERS
========================================================= */

function hashResetToken(token) {
  return crypto
    .createHash("sha256")
    .update(token)
    .digest("hex");
}

function createResetToken() {
  return crypto
    .randomBytes(32)
    .toString("hex");
}

/* =========================================================
   PASSWORD VALIDATION
========================================================= */

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
   HEALTH CHECK
========================================================= */

app.get("/api/health", async (req, res) => {
  try {
    await pool.query("SELECT 1");

    res.json({
      ok: true,

      service: "NEET CBT Backend",

      database: "PostgreSQL",

      cloudSync: true,

      security: {
        helmet: true,
        rateLimit: true,
        jwtProtection: true,
        passwordResetTokens: true,
      },

      timestamp:
        new Date().toISOString(),
    });
  } catch (error) {
    res.status(503).json({
      ok: false,
      error: "Database unavailable.",
    });
  }
});

/* =========================================================
   SIGNUP
========================================================= */

app.post(
  "/api/auth/signup",
  authLimiter,
  async (req, res, next) => {
    try {
      const name =
        String(req.body.name || "").trim();

      const email =
        normalizeEmail(req.body.email);

      const password =
        String(req.body.password || "");

      if (!name || name.length > 60) {
        return res.status(400).json({
          error: "Enter a valid name.",
        });
      }

      if (
        !email ||
        !email.includes("@")
      ) {
        return res.status(400).json({
          error:
            "Enter a valid email address.",
        });
      }

      const passwordError =
        validateNewPassword(password);

      if (passwordError) {
        return res.status(400).json({
          error: passwordError,
        });
      }

      const existing =
        await getUserByEmail(email);

      if (existing) {
        return res.status(409).json({
          error:
            "An account with this email already exists.",
        });
      }

      const passwordHash =
        await bcrypt.hash(
          password,
          12
        );

      const result =
  await pool.query(
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
        NOW()
      )

      RETURNING
        id,
        name,
        email,
        created_at
    `,
    [
      name,
      email,
      passwordHash,
    ]
  );
      const user =
        result.rows[0];

      await saveProfile(
        user.id,
        {
          targetYear: "",
          targetScore: "",
          preferredSubjects: [],
        }
      );

      res.status(201).json({
        token:
          createToken(user),

        user,

        profile:
          await getProfile(user.id),
      });
    } catch (error) {
      next(error);
    }
  }
);

/* =========================================================
   LOGIN
========================================================= */

app.post(
  "/api/auth/login",
  authLimiter,
  async (req, res, next) => {
    try {
      const email =
        normalizeEmail(req.body.email);

      const password =
        String(req.body.password || "");

      const user =
        await getUserByEmail(email);

      if (
        !user ||
        !(await bcrypt.compare(
          password,
          user.password_hash
        ))
      ) {
        return res.status(401).json({
          error:
            "Invalid email or password.",
        });
      }

      const safeUser = {
        id: user.id,
        name: user.name,
        email: user.email,
        created_at:
          user.created_at,
      };

      res.json({
        token:
          createToken(safeUser),

        user: safeUser,

        profile:
          await getProfile(user.id),
      });
    } catch (error) {
      next(error);
    }
  }
);

/* =========================================================
   CURRENT USER
========================================================= */

app.get(
  "/api/auth/me",
  authenticateToken,
  async (req, res, next) => {
    try {
      const user =
        await getUserById(
          req.user.userId
        );

      if (!user) {
        return res.status(401).json({
          error:
            "Account not found.",
        });
      }

      res.json({
        user,

        profile:
          await getProfile(user.id),
      });
    } catch (error) {
      next(error);
    }
  }
);

/* =========================================================
   REQUEST PASSWORD RESET
========================================================= */

app.post(
  "/api/auth/request-password-reset",
  resetRequestLimiter,
  async (req, res, next) => {
    try {
      const email =
        normalizeEmail(
          req.body.email
        );

      const genericResponse = {
        message:
          "If an account exists for that email, a password reset link has been created.",
      };

      /*
       IMPORTANT:

       We intentionally return the same response
       whether the account exists or not.

       This helps prevent email/account enumeration.
      */

      if (
        !email ||
        !email.includes("@")
      ) {
        return res.json(
          genericResponse
        );
      }

      const user =
        await getUserByEmail(email);

      if (!user) {
        return res.json(
          genericResponse
        );
      }

      /*
       Invalidate all previous
       unused reset tokens.
      */

      await pool.query(
        `
          UPDATE password_reset_tokens

          SET used_at = NOW()

          WHERE
            user_id = $1
            AND used_at IS NULL
        `,
        [user.id]
      );

      /*
       Generate cryptographically
       secure random token.
      */

      const rawToken =
        createResetToken();

      /*
       Store ONLY the hash
       in PostgreSQL.
      */

      const tokenHash =
        hashResetToken(
          rawToken
        );

      /*
       Token valid for 15 minutes.
      */

      const expiresAt =
        new Date(
          Date.now() +
            15 * 60 * 1000
        );

      await pool.query(
        `
          INSERT INTO password_reset_tokens (
            user_id,
            token_hash,
            expires_at
          )

          VALUES (
            $1,
            $2,
            $3
          )
        `,
        [
          user.id,
          tokenHash,
          expiresAt,
        ]
      );

      /*
       DEVELOPMENT ONLY

       In production the token must be
       sent through an email provider.

       We expose the URL only while
       NODE_ENV is not production so
       you can test the system locally.
      */

     const resetUrl =
  `${APP_URL}/#reset=${encodeURIComponent(rawToken)}`;

const safeName =
  String(user.name || "Student")
    .replace(/[<>&"']/g, "");

const emailResult =
  await resend.emails.send({
    from: RESET_EMAIL_FROM,

    to: [user.email],

    subject:
      "NEET CBT Simulator - Reset Your Password",

    text:
      `Hello ${safeName},

` +
      `We received a request to reset your NEET CBT Simulator password.

` +
      `Open this link to create a new password:

` +
      `${resetUrl}

` +
      `This link expires in 15 minutes and can only be used once.

` +
      `If you did not request this password reset, you can safely ignore this email.

` +
      `NEET CBT Simulator`,

    html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;color:#1e293b">

        <h2 style="color:#0f172a">
          NEET CBT Simulator
        </h2>

        <p>Hello ${safeName},</p>

        <p>
          We received a request to reset your NEET CBT Simulator password.
        </p>

        <p>
          Click the button below to create a new password:
        </p>

        <p style="margin:28px 0">
          <a
            href="${resetUrl}"
            style="display:inline-block;padding:12px 20px;background:#2563eb;color:#ffffff;text-decoration:none;border-radius:8px;font-weight:700"
          >
            Reset Password
          </a>
        </p>

        <p>
          This link expires in <strong>15 minutes</strong>
          and can only be used once.
        </p>

        <p style="color:#64748b;font-size:14px">
          If you did not request this password reset,
          you can safely ignore this email.
        </p>

        <hr style="border:0;border-top:1px solid #e2e8f0;margin:24px 0">

        <p style="color:#64748b;font-size:13px">
          NEET CBT Simulator
        </p>

      </div>
    `,
  });

if (emailResult?.error) {
  console.error(
    "Resend email error:",
    emailResult.error
  );

  await pool.query(
    `
      UPDATE password_reset_tokens
      SET used_at = NOW()
      WHERE token_hash = $1
        AND used_at IS NULL
    `,
    [tokenHash]
  );

  return res.status(502).json({
    error:
      "Unable to send the password reset email. Please try again later.",
  });
}

return res.json(
  genericResponse
);
      /*
       Production:

       Never return the token.

       Later an email provider will
       send the reset link.
      */

      return res.json(
        genericResponse
      );
    } catch (error) {
      next(error);
    }
  }
);

/* =========================================================
   RESET PASSWORD USING TOKEN
========================================================= */

app.post(
  "/api/auth/reset-password",
  authLimiter,
  async (req, res, next) => {
    const client =
      await pool.connect();

    try {
      const token =
        String(
          req.body.token || ""
        ).trim();

      const newPassword =
        String(
          req.body.newPassword || ""
        );

      if (!token) {
        return res.status(400).json({
          error:
            "Reset token is required.",
        });
      }

      const passwordError =
        validateNewPassword(
          newPassword
        );

      if (passwordError) {
        return res.status(400).json({
          error:
            passwordError,
        });
      }

      const tokenHash =
        hashResetToken(token);

      /*
       Transaction starts here.
      */

      await client.query(
        "BEGIN"
      );

      /*
       Find an unused,
       non-expired token.
      */

      const tokenResult =
        await client.query(
          `
            SELECT
              id,
              user_id

            FROM password_reset_tokens

            WHERE
              token_hash = $1
              AND used_at IS NULL
              AND expires_at > NOW()

            FOR UPDATE
          `,
          [tokenHash]
        );

      if (
        !tokenResult.rows[0]
      ) {
        await client.query(
          "ROLLBACK"
        );

        return res.status(400).json({
          error:
            "This reset link is invalid or has expired.",
        });
      }

      const resetRecord =
        tokenResult.rows[0];

      /*
       Hash the new password.
      */

      const passwordHash =
        await bcrypt.hash(
          newPassword,
          12
        );

      /*
       Update password.
      */

      await client.query(
        `
          UPDATE users

          SET password_hash = $1

          WHERE id = $2
        `,
        [
          passwordHash,
          resetRecord.user_id,
        ]
      );

      /*
       Invalidate the used token
       and any other unused tokens
       belonging to this account.
      */

      await client.query(
        `
          UPDATE password_reset_tokens

          SET used_at = NOW()

          WHERE
            user_id = $1
            AND used_at IS NULL
        `,
        [resetRecord.user_id]
      );

      await client.query(
        "COMMIT"
      );

      res.json({
        message:
          "Password reset successfully. You can now log in.",
      });
    } catch (error) {
      try {
        await client.query(
          "ROLLBACK"
        );
      } catch (_) {}

      next(error);
    } finally {
      client.release();
    }
  }
);

/* =========================================================
   PROFILE GET
========================================================= */

app.get(
  "/api/profile",
  authenticateToken,
  async (req, res, next) => {
    try {
      res.json({
        profile:
          await getProfile(
            req.user.userId
          ),
      });
    } catch (error) {
      next(error);
    }
  }
);

/* =========================================================
   PROFILE UPDATE
========================================================= */

app.put(
  "/api/profile",
  authenticateToken,
  async (req, res, next) => {
    try {
      res.json({
        profile:
          await saveProfile(
            req.user.userId,
            req.body || {}
          ),
      });
    } catch (error) {
      next(error);
    }
  }
);

/* =========================================================
   CLOUD MOCK TESTS
========================================================= */

app.get(
  "/api/cloud/mock-tests",
  authenticateToken,
  async (req, res, next) => {
    try {
      res.json({
        mockTests:
          await getMockTests(
            req.user.userId
          ),
      });
    } catch (error) {
      next(error);
    }
  }
);

app.post(
  "/api/cloud/mock-tests",
  authenticateToken,
  async (req, res, next) => {
    try {
      res.json({
        mockTest:
          await saveMockTest(
            req.user.userId,
            req.body
          ),
      });
    } catch (error) {
      next(error);
    }
  }
);

app.delete(
  "/api/cloud/mock-tests/:mockId",
  authenticateToken,
  async (req, res, next) => {
    try {
      await deleteMockTest(
        req.user.userId,
        req.params.mockId
      );

      res.json({
        success: true,
      });
    } catch (error) {
      next(error);
    }
  }
);

/* =========================================================
   CLOUD EXAM SESSIONS
========================================================= */

app.get(
  "/api/cloud/exam-sessions",
  authenticateToken,
  async (req, res, next) => {
    try {
      res.json({
        sessions:
          await getExamSessions(
            req.user.userId
          ),
      });
    } catch (error) {
      next(error);
    }
  }
);

app.post(
  "/api/cloud/exam-sessions",
  authenticateToken,
  async (req, res, next) => {
    try {
      const {
        examId,
        sessionData,
      } = req.body || {};

      res.json({
        session:
          await saveExamSession(
            req.user.userId,
            examId,
            sessionData
          ),
      });
    } catch (error) {
      next(error);
    }
  }
);

app.delete(
  "/api/cloud/exam-sessions/:examId",
  authenticateToken,
  async (req, res, next) => {
    try {
      await deleteExamSession(
        req.user.userId,
        req.params.examId
      );

      res.json({
        success: true,
      });
    } catch (error) {
      next(error);
    }
  }
);

/* =========================================================
   CLOUD ATTEMPT HISTORY
========================================================= */

app.get(
  "/api/cloud/attempt-history",
  authenticateToken,
  async (req, res, next) => {
    try {
      res.json({
        attempts:
          await getAttemptHistory(
            req.user.userId
          ),
      });
    } catch (error) {
      next(error);
    }
  }
);

app.post(
  "/api/cloud/attempt-history",
  authenticateToken,
  async (req, res, next) => {
    try {
      res.json({
        attempt:
          await saveAttempt(
            req.user.userId,
            req.body
          ),
      });
    } catch (error) {
      next(error);
    }
  }
);

app.delete(
  "/api/cloud/attempt-history",
  authenticateToken,
  async (req, res, next) => {
    try {
      await deleteAttemptHistory(
        req.user.userId
      );

      res.json({
        success: true,
      });
    } catch (error) {
      next(error);
    }
  }
);

/* =========================================================
   404
========================================================= */

app.use(
  (req, res) => {
    res.status(404).json({
      error:
        "API route not found.",
    });
  }
);

/* =========================================================
   GLOBAL ERROR HANDLER
========================================================= */

app.use(
  (err, req, res, next) => {
    console.error(
      "API error:",
      err
    );

    if (res.headersSent) {
      return next(err);
    }

    res.status(500).json({
      error:
        "Internal server error.",
    });
  }
);

/* =========================================================
   START SERVER
========================================================= */

async function startServer() {
  try {
    await initializeDatabase();

    await testConnection();

    app.listen(
      PORT,
      () => {
        console.log(
          "========================================"
        );

        console.log(
          "NEET CBT BACKEND + POSTGRESQL"
        );

        console.log(
          `Server: http://localhost:${PORT}`
        );

        console.log(
          `API: http://localhost:${PORT}/api`
        );

        console.log(
          `Health: http://localhost:${PORT}/api/health`
        );

        console.log(
          "Database: PostgreSQL"
        );

        console.log(
          "Cloud sync: ENABLED"
        );

        console.log(
          "Helmet security: ENABLED"
        );

        console.log(
          "Auth rate limit: ENABLED"
        );

        console.log(
          "JWT security: ENABLED"
        );

        console.log(
          "Password reset tokens: ENABLED"
        );
        console.log(
          "Password reset email: ENABLED"
      );

        console.log(
          "========================================"
        );
      }
    );
  } catch (error) {
    console.error(
      "Failed to start server:",
      error
    );

    process.exit(1);
  }
}

startServer();