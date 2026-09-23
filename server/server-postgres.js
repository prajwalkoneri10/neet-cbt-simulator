const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { Pool } = require("pg");

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
} = require("./postgresCloudSync");

dotenv.config();

const app = express();

// --------------------------------------------------
// CONFIG
// --------------------------------------------------

const PORT = 5001;

const JWT_SECRET =
  process.env.JWT_SECRET ||
  "neet-cbt-local-secret-change-this";

const CLIENT_URL =
  process.env.CLIENT_URL ||
  "http://localhost:5173";

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL is missing from server/.env"
  );
}

// --------------------------------------------------
// POSTGRESQL
// --------------------------------------------------

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false,
  },
});

// --------------------------------------------------
// MIDDLEWARE
// --------------------------------------------------

app.use(
  cors({
    origin: CLIENT_URL,
    methods: [
      "GET",
      "POST",
      "PUT",
      "DELETE",
      "OPTIONS",
    ],
    allowedHeaders: [
      "Content-Type",
      "Authorization",
    ],
  })
);

app.use(express.json({ limit: "10mb" }));

// --------------------------------------------------
// DATABASE SETUP
// --------------------------------------------------

async function initializeDatabase() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL
    );

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

  console.log("PostgreSQL users/profile tables ready.");
}

// --------------------------------------------------
// HELPERS
// --------------------------------------------------

function normalizeEmail(email) {
  return String(email || "")
    .trim()
    .toLowerCase();
}

function createToken(user) {
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
    },
    JWT_SECRET,
    {
      expiresIn: "7d",
    }
  );
}

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

async function getProfile(userId) {
  const result = await pool.query(
    `
    SELECT
      user_id,
      target_year,
      target_score,
      preferred_subjects,
      updated_at
    FROM profiles
    WHERE user_id = $1
    `,
    [userId]
  );

  const profile = result.rows[0];

  if (!profile) {
    return {
      targetYear: "",
      targetScore: "",
      preferredSubjects: [],
    };
  }

  return {
    targetYear: profile.target_year ?? "",
    targetScore: profile.target_score ?? "",
    preferredSubjects:
      profile.preferred_subjects || [],
  };
}

async function saveProfile(userId, data) {
  const targetYear =
    data.targetYear === "" ||
    data.targetYear == null
      ? null
      : Number(data.targetYear);

  const targetScore =
    data.targetScore === "" ||
    data.targetScore == null
      ? null
      : Number(data.targetScore);

  const preferredSubjects =
    Array.isArray(data.preferredSubjects)
      ? data.preferredSubjects
      : [];

  const updatedAt =
    new Date().toISOString();

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
      userId,
      targetYear,
      targetScore,
      JSON.stringify(preferredSubjects),
      updatedAt,
    ]
  );

  return getProfile(userId);
}

// --------------------------------------------------
// AUTH MIDDLEWARE
// --------------------------------------------------

function authenticateToken(
  req,
  res,
  next
) {
  const authHeader =
    req.headers.authorization || "";

  if (!authHeader.startsWith("Bearer ")) {
    return res.status(401).json({
      message:
        "Authentication token required.",
    });
  }

  const token =
    authHeader.substring(7);

  try {
    const decoded =
      jwt.verify(token, JWT_SECRET);

    req.user = decoded;

    next();
  } catch {
    return res.status(401).json({
      message:
        "Invalid or expired authentication token.",
    });
  }
}

// --------------------------------------------------
// HEALTH
// --------------------------------------------------

app.get("/api/health", async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT NOW() AS current_time"
    );

    res.json({
      ok: true,
      service: "NEET CBT Backend",
      database: "PostgreSQL",
      cloudSync: true,
      timestamp:
        result.rows[0].current_time,
    });
  } catch (error) {
    console.error(
      "Health check error:",
      error
    );

    res.status(500).json({
      ok: false,
      message:
        "PostgreSQL database unavailable.",
    });
  }
});

// ==================================================
// AUTH
// ==================================================

// --------------------------------------------------
// SIGNUP
// --------------------------------------------------

app.post(
  "/api/auth/signup",
  async (req, res) => {
    try {
      const name =
        String(req.body.name || "")
          .trim();

      const email =
        normalizeEmail(
          req.body.email
        );

      const password =
        String(
          req.body.password || ""
        );

      if (!name) {
        return res.status(400).json({
          message:
            "Name is required.",
        });
      }

      if (
        !email ||
        !email.includes("@")
      ) {
        return res.status(400).json({
          message:
            "Please enter a valid email address.",
        });
      }

      if (password.length < 6) {
        return res.status(400).json({
          message:
            "Password must contain at least 6 characters.",
        });
      }

      const existingUser =
        await pool.query(
          `
          SELECT id
          FROM users
          WHERE email = $1
          `,
          [email]
        );

      if (
        existingUser.rows.length > 0
      ) {
        return res.status(409).json({
          message:
            "An account with this email already exists.",
        });
      }

      const passwordHash =
        await bcrypt.hash(
          password,
          12
        );

      const createdAt =
        new Date().toISOString();

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
            $4
          )
          RETURNING id
          `,
          [
            name,
            email,
            passwordHash,
            createdAt,
          ]
        );

      const userId =
        result.rows[0].id;

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
          NULL,
          NULL,
          '[]'::jsonb,
          $2
        )
        `,
        [
          userId,
          createdAt,
        ]
      );

      const user =
        await getUserById(
          userId
        );

      const profile =
        await getProfile(
          userId
        );

      const token =
        createToken(user);

      res.status(201).json({
        success: true,
        token,
        user,
        profile,
      });
    } catch (error) {
      console.error(
        "Signup error:",
        error
      );

      res.status(500).json({
        message:
          "Unable to create account.",
      });
    }
  }
);

// --------------------------------------------------
// LOGIN
// --------------------------------------------------

app.post(
  "/api/auth/login",
  async (req, res) => {
    try {
      const email =
        normalizeEmail(
          req.body.email
        );

      const password =
        String(
          req.body.password || ""
        );

      if (!email || !password) {
        return res.status(400).json({
          message:
            "Email and password are required.",
        });
      }

      const result =
        await pool.query(
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

      const user =
        result.rows[0];

      if (!user) {
        return res.status(401).json({
          message:
            "Invalid email or password.",
        });
      }

      const passwordMatch =
        await bcrypt.compare(
          password,
          user.password_hash
        );

      if (!passwordMatch) {
        return res.status(401).json({
          message:
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

      const token =
        createToken(
          safeUser
        );

      const profile =
        await getProfile(
          user.id
        );

      res.json({
        success: true,
        token,
        user: safeUser,
        profile,
      });
    } catch (error) {
      console.error(
        "Login error:",
        error
      );

      res.status(500).json({
        message:
          "Unable to login.",
      });
    }
  }
);

// --------------------------------------------------
// CURRENT USER
// --------------------------------------------------

app.get(
  "/api/auth/me",
  authenticateToken,
  async (req, res) => {
    try {
      const user =
        await getUserById(
          req.user.id
        );

      if (!user) {
        return res.status(404).json({
          message:
            "User account not found.",
        });
      }

      res.json({
        success: true,
        user,
      });
    } catch (error) {
      console.error(
        "Current user error:",
        error
      );

      res.status(500).json({
        message:
          "Unable to load user.",
      });
    }
  }
);

// --------------------------------------------------
// RESET PASSWORD
// --------------------------------------------------

app.post(
  "/api/auth/reset-password",
  async (req, res) => {
    try {
      const email =
        normalizeEmail(
          req.body.email
        );

      const newPassword =
        String(
          req.body.newPassword || ""
        );

      if (!email || !newPassword) {
        return res.status(400).json({
          message:
            "Email and new password are required.",
        });
      }

      if (
        newPassword.length < 6
      ) {
        return res.status(400).json({
          message:
            "Password must contain at least 6 characters.",
        });
      }

      const result =
        await pool.query(
          `
          SELECT id
          FROM users
          WHERE email = $1
          `,
          [email]
        );

      const user =
        result.rows[0];

      if (!user) {
        return res.status(404).json({
          message:
            "No account found with this email.",
        });
      }

      const passwordHash =
        await bcrypt.hash(
          newPassword,
          12
        );

      await pool.query(
        `
        UPDATE users
        SET password_hash = $1
        WHERE id = $2
        `,
        [
          passwordHash,
          user.id,
        ]
      );

      res.json({
        success: true,
        message:
          "Password reset successfully.",
      });
    } catch (error) {
      console.error(
        "Reset password error:",
        error
      );

      res.status(500).json({
        message:
          "Unable to reset password.",
      });
    }
  }
);

// ==================================================
// PROFILE
// ==================================================

// --------------------------------------------------
// GET PROFILE
// --------------------------------------------------

app.get(
  "/api/profile",
  authenticateToken,
  async (req, res) => {
    try {
      const profile =
        await getProfile(
          req.user.id
        );

      res.json({
        success: true,
        profile,
      });
    } catch (error) {
      console.error(
        "Get profile error:",
        error
      );

      res.status(500).json({
        message:
          "Unable to load profile.",
      });
    }
  }
);

// --------------------------------------------------
// UPDATE PROFILE
// --------------------------------------------------

app.put(
  "/api/profile",
  authenticateToken,
  async (req, res) => {
    try {
      const {
        targetYear,
        targetScore,
        preferredSubjects,
      } = req.body;

      if (
        targetYear !== "" &&
        targetYear != null &&
        (
          !Number.isInteger(
            Number(targetYear)
          ) ||
          Number(targetYear) < 2025 ||
          Number(targetYear) > 2100
        )
      ) {
        return res.status(400).json({
          message:
            "Please enter a valid target NEET year.",
        });
      }

      if (
        targetScore !== "" &&
        targetScore != null &&
        (
          !Number.isInteger(
            Number(targetScore)
          ) ||
          Number(targetScore) < 0 ||
          Number(targetScore) > 720
        )
      ) {
        return res.status(400).json({
          message:
            "Target score must be between 0 and 720.",
        });
      }

      if (
        preferredSubjects !==
          undefined &&
        !Array.isArray(
          preferredSubjects
        )
      ) {
        return res.status(400).json({
          message:
            "Preferred subjects must be an array.",
        });
      }

      const profile =
        await saveProfile(
          req.user.id,
          {
            targetYear,
            targetScore,
            preferredSubjects,
          }
        );

      res.json({
        success: true,
        profile,
      });
    } catch (error) {
      console.error(
        "Update profile error:",
        error
      );

      res.status(500).json({
        message:
          "Unable to update profile.",
      });
    }
  }
);

// ==================================================
// CLOUD SYNC — MOCK TESTS
// ==================================================

app.get(
  "/api/cloud/mock-tests",
  authenticateToken,
  async (req, res) => {
    try {
      const mockTests =
        await getMockTests(
          req.user.id
        );

      res.json({
        success: true,
        mockTests,
      });
    } catch (error) {
      console.error(
        "Get mock tests error:",
        error
      );

      res.status(500).json({
        message:
          "Unable to load mock tests.",
      });
    }
  }
);

app.post(
  "/api/cloud/mock-tests",
  authenticateToken,
  async (req, res) => {
    try {
      if (
        !req.body ||
        !req.body.id
      ) {
        return res.status(400).json({
          message:
            "Mock test ID is required.",
        });
      }

      const mockTest =
        await saveMockTest(
          req.user.id,
          req.body
        );

      res.json({
        success: true,
        mockTest,
      });
    } catch (error) {
      console.error(
        "Save mock test error:",
        error
      );

      res.status(500).json({
        message:
          "Unable to save mock test.",
      });
    }
  }
);

app.delete(
  "/api/cloud/mock-tests/:mockId",
  authenticateToken,
  async (req, res) => {
    try {
      const deleted =
        await deleteMockTest(
          req.user.id,
          req.params.mockId
        );

      res.json({
        success: true,
        deleted,
      });
    } catch (error) {
      console.error(
        "Delete mock test error:",
        error
      );

      res.status(500).json({
        message:
          "Unable to delete mock test.",
      });
    }
  }
);

// ==================================================
// CLOUD SYNC — EXAM SESSIONS
// ==================================================

app.get(
  "/api/cloud/exam-sessions",
  authenticateToken,
  async (req, res) => {
    try {
      const sessions =
        await getExamSessions(
          req.user.id
        );

      res.json({
        success: true,
        sessions,
      });
    } catch (error) {
      console.error(
        "Get exam sessions error:",
        error
      );

      res.status(500).json({
        message:
          "Unable to load exam sessions.",
      });
    }
  }
);

app.post(
  "/api/cloud/exam-sessions",
  authenticateToken,
  async (req, res) => {
    try {
      const examId =
        req.body.examId;

      const sessionData =
        req.body.sessionData;

      if (!examId) {
        return res.status(400).json({
          message:
            "Exam ID is required.",
        });
      }

      if (
        !sessionData ||
        typeof sessionData !==
          "object"
      ) {
        return res.status(400).json({
          message:
            "Session data is required.",
        });
      }

      const session =
        await saveExamSession(
          req.user.id,
          examId,
          sessionData
        );

      res.json({
        success: true,
        session,
      });
    } catch (error) {
      console.error(
        "Save exam session error:",
        error
      );

      res.status(500).json({
        message:
          "Unable to save exam session.",
      });
    }
  }
);

app.delete(
  "/api/cloud/exam-sessions/:examId",
  authenticateToken,
  async (req, res) => {
    try {
      const deleted =
        await deleteExamSession(
          req.user.id,
          req.params.examId
        );

      res.json({
        success: true,
        deleted,
      });
    } catch (error) {
      console.error(
        "Delete exam session error:",
        error
      );

      res.status(500).json({
        message:
          "Unable to delete exam session.",
      });
    }
  }
);

// ==================================================
// CLOUD SYNC — ATTEMPT HISTORY
// ==================================================

app.get(
  "/api/cloud/attempt-history",
  authenticateToken,
  async (req, res) => {
    try {
      const attempts =
        await getAttemptHistory(
          req.user.id
        );

      res.json({
        success: true,
        attempts,
      });
    } catch (error) {
      console.error(
        "Get attempt history error:",
        error
      );

      res.status(500).json({
        message:
          "Unable to load attempt history.",
      });
    }
  }
);

app.post(
  "/api/cloud/attempt-history",
  authenticateToken,
  async (req, res) => {
    try {
      if (!req.body) {
        return res.status(400).json({
          message:
            "Attempt data is required.",
        });
      }

      const attempt =
        await saveAttempt(
          req.user.id,
          req.body
        );

      res.json({
        success: true,
        attempt,
      });
    } catch (error) {
      console.error(
        "Save attempt error:",
        error
      );

      res.status(500).json({
        message:
          "Unable to save attempt.",
      });
    }
  }
);

app.delete(
  "/api/cloud/attempt-history",
  authenticateToken,
  async (req, res) => {
    try {
      const deleted =
        await deleteAttemptHistory(
          req.user.id
        );

      res.json({
        success: true,
        deleted,
      });
    } catch (error) {
      console.error(
        "Delete attempt history error:",
        error
      );

      res.status(500).json({
        message:
          "Unable to delete attempt history.",
      });
    }
  }
);

// ==================================================
// ERROR HANDLER
// ==================================================

app.use(
  (err, req, res, next) => {
    console.error(
      "Server error:",
      err
    );

    res.status(500).json({
      message:
        "Internal server error.",
    });
  }
);

// ==================================================
// START
// ==================================================

async function startServer() {
  try {
    await initializeDatabase();

    await pool.query(
      "SELECT NOW()"
    );

    app.listen(
      PORT,
      () => {
        console.log("");
        console.log(
          "======================================"
        );
        console.log(
          " NEET CBT POSTGRESQL TEST BACKEND"
        );
        console.log(
          "======================================"
        );
        console.log(
          ` Server: http://localhost:${PORT}`
        );
        console.log(
          ` API:    http://localhost:${PORT}/api`
        );
        console.log(
          ` Health: http://localhost:${PORT}/api/health`
        );
        console.log(
          " Database: PostgreSQL"
        );
        console.log(
          " Cloud sync: ENABLED"
        );
        console.log(
          "======================================"
        );
        console.log("");
      }
    );
  } catch (error) {
    console.error(
      "❌ PostgreSQL backend failed to start:"
    );
    console.error(
      error.message
    );

    process.exit(1);
  }
}

startServer();