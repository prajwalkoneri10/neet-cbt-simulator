const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const Database = require("better-sqlite3");
const path = require("path");

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
} = require("./cloudsync");

dotenv.config();

const app = express();

const PORT = process.env.PORT || 5000;
const JWT_SECRET =
  process.env.JWT_SECRET || "neet-cbt-local-secret-change-this";

const CLIENT_URL =
  process.env.CLIENT_URL || "http://localhost:5173";

// --------------------------------------------------
// MIDDLEWARE
// --------------------------------------------------

app.use(
  cors({
    origin: CLIENT_URL,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

app.use(express.json({ limit: "10mb" }));

// --------------------------------------------------
// DATABASE
// --------------------------------------------------

const dbPath = path.join(__dirname, "neet.sqlite");

const db = new Database(dbPath);

db.pragma("foreign_keys = ON");

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS profiles (
    user_id INTEGER PRIMARY KEY,
    target_year INTEGER,
    target_score INTEGER,
    preferred_subjects TEXT DEFAULT '[]',
    updated_at TEXT NOT NULL,

    FOREIGN KEY (user_id)
      REFERENCES users(id)
      ON DELETE CASCADE
  );
`);

console.log("Database connected:", dbPath);

// --------------------------------------------------
// HELPERS
// --------------------------------------------------

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
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

function getUserById(id) {
  return db
    .prepare(
      `
      SELECT
        id,
        name,
        email,
        created_at
      FROM users
      WHERE id = ?
      `
    )
    .get(id);
}

function getProfile(userId) {
  const profile = db
    .prepare(
      `
      SELECT
        user_id,
        target_year,
        target_score,
        preferred_subjects,
        updated_at
      FROM profiles
      WHERE user_id = ?
      `
    )
    .get(userId);

  if (!profile) {
    return {
      targetYear: "",
      targetScore: "",
      preferredSubjects: [],
    };
  }

  let preferredSubjects = [];

  try {
    preferredSubjects = JSON.parse(
      profile.preferred_subjects || "[]"
    );
  } catch {
    preferredSubjects = [];
  }

  return {
    targetYear: profile.target_year ?? "",
    targetScore: profile.target_score ?? "",
    preferredSubjects,
  };
}

function saveProfile(userId, data) {
  const targetYear =
    data.targetYear === "" || data.targetYear == null
      ? null
      : Number(data.targetYear);

  const targetScore =
    data.targetScore === "" || data.targetScore == null
      ? null
      : Number(data.targetScore);

  const preferredSubjects = Array.isArray(
    data.preferredSubjects
  )
    ? data.preferredSubjects
    : [];

  const updatedAt = new Date().toISOString();

  db.prepare(
    `
    INSERT INTO profiles (
      user_id,
      target_year,
      target_score,
      preferred_subjects,
      updated_at
    )
    VALUES (?, ?, ?, ?, ?)

    ON CONFLICT(user_id)
    DO UPDATE SET
      target_year = excluded.target_year,
      target_score = excluded.target_score,
      preferred_subjects = excluded.preferred_subjects,
      updated_at = excluded.updated_at
    `
  ).run(
    userId,
    targetYear,
    targetScore,
    JSON.stringify(preferredSubjects),
    updatedAt
  );

  return getProfile(userId);
}

// --------------------------------------------------
// AUTH MIDDLEWARE
// --------------------------------------------------

function authenticateToken(req, res, next) {
  const authHeader = req.headers.authorization || "";

  if (!authHeader.startsWith("Bearer ")) {
    return res.status(401).json({
      message: "Authentication token required.",
    });
  }

  const token = authHeader.substring(7);

  try {
    const decoded = jwt.verify(token, JWT_SECRET);

    req.user = decoded;

    next();
  } catch {
    return res.status(401).json({
      message: "Invalid or expired authentication token.",
    });
  }
}

// --------------------------------------------------
// HEALTH
// --------------------------------------------------

app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    service: "NEET CBT Backend",
    cloudSync: true,
    timestamp: new Date().toISOString()
  });
});

// ==================================================
// AUTH
// ==================================================

// --------------------------------------------------
// SIGNUP
// --------------------------------------------------

app.post("/api/auth/signup", async (req, res) => {
  try {
    const name = String(req.body.name || "").trim();
    const email = normalizeEmail(req.body.email);
    const password = String(req.body.password || "");

    if (!name) {
      return res.status(400).json({
        message: "Name is required.",
      });
    }

    if (!email || !email.includes("@")) {
      return res.status(400).json({
        message: "Please enter a valid email address.",
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        message: "Password must contain at least 6 characters.",
      });
    }

    const existingUser = db
      .prepare(
        `
        SELECT id
        FROM users
        WHERE email = ?
        `
      )
      .get(email);

    if (existingUser) {
      return res.status(409).json({
        message: "An account with this email already exists.",
      });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const createdAt = new Date().toISOString();

    const result = db
      .prepare(
        `
        INSERT INTO users (
          name,
          email,
          password_hash,
          created_at
        )
        VALUES (?, ?, ?, ?)
        `
      )
      .run(
        name,
        email,
        passwordHash,
        createdAt
      );

    const userId = result.lastInsertRowid;

    db.prepare(
      `
      INSERT INTO profiles (
        user_id,
        target_year,
        target_score,
        preferred_subjects,
        updated_at
      )
      VALUES (?, ?, ?, ?, ?)
      `
    ).run(
      userId,
      null,
      null,
      JSON.stringify([]),
      createdAt
    );

    const user = getUserById(userId);
    const profile = getProfile(userId);
    const token = createToken(user);

    res.status(201).json({
      success: true,
      token,
      user,
      profile,
    });
  } catch (error) {
    console.error("Signup error:", error);

    res.status(500).json({
      message: "Unable to create account.",
    });
  }
});

// --------------------------------------------------
// LOGIN
// --------------------------------------------------

app.post("/api/auth/login", async (req, res) => {
  try {
    const email = normalizeEmail(req.body.email);
    const password = String(req.body.password || "");

    if (!email || !password) {
      return res.status(400).json({
        message: "Email and password are required.",
      });
    }

    const user = db
      .prepare(
        `
        SELECT
          id,
          name,
          email,
          password_hash,
          created_at
        FROM users
        WHERE email = ?
        `
      )
      .get(email);

    if (!user) {
      return res.status(401).json({
        message: "Invalid email or password.",
      });
    }

    const passwordMatch = await bcrypt.compare(
      password,
      user.password_hash
    );

    if (!passwordMatch) {
      return res.status(401).json({
        message: "Invalid email or password.",
      });
    }

    const safeUser = {
      id: user.id,
      name: user.name,
      email: user.email,
      created_at: user.created_at,
    };

    const token = createToken(safeUser);
    const profile = getProfile(user.id);

    res.json({
      success: true,
      token,
      user: safeUser,
      profile,
    });
  } catch (error) {
    console.error("Login error:", error);

    res.status(500).json({
      message: "Unable to login.",
    });
  }
});

// --------------------------------------------------
// CURRENT USER
// --------------------------------------------------

app.get(
  "/api/auth/me",
  authenticateToken,
  (req, res) => {
    const user = getUserById(req.user.id);

    if (!user) {
      return res.status(404).json({
        message: "User account not found.",
      });
    }

    res.json({
      success: true,
      user,
    });
  }
);

// --------------------------------------------------
// RESET PASSWORD
// --------------------------------------------------

app.post(
  "/api/auth/reset-password",
  async (req, res) => {
    try {
      const email = normalizeEmail(req.body.email);
      const newPassword = String(
        req.body.newPassword || ""
      );

      if (!email || !newPassword) {
        return res.status(400).json({
          message:
            "Email and new password are required.",
        });
      }

      if (newPassword.length < 6) {
        return res.status(400).json({
          message:
            "Password must contain at least 6 characters.",
        });
      }

      const user = db
        .prepare(
          `
          SELECT id
          FROM users
          WHERE email = ?
          `
        )
        .get(email);

      if (!user) {
        return res.status(404).json({
          message:
            "No account found with this email.",
        });
      }

      const passwordHash = await bcrypt.hash(
        newPassword,
        12
      );

      db.prepare(
        `
        UPDATE users
        SET password_hash = ?
        WHERE id = ?
        `
      ).run(passwordHash, user.id);

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
  (req, res) => {
    try {
      const profile = getProfile(req.user.id);

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
  (req, res) => {
    try {
      const {
        targetYear,
        targetScore,
        preferredSubjects,
      } = req.body;

      if (
        targetYear !== "" &&
        targetYear != null &&
        (!Number.isInteger(Number(targetYear)) ||
          Number(targetYear) < 2025 ||
          Number(targetYear) > 2100)
      ) {
        return res.status(400).json({
          message:
            "Please enter a valid target NEET year.",
        });
      }

      if (
        targetScore !== "" &&
        targetScore != null &&
        (!Number.isInteger(Number(targetScore)) ||
          Number(targetScore) < 0 ||
          Number(targetScore) > 720)
      ) {
        return res.status(400).json({
          message:
            "Target score must be between 0 and 720.",
        });
      }

      if (
        preferredSubjects !== undefined &&
        !Array.isArray(preferredSubjects)
      ) {
        return res.status(400).json({
          message:
            "Preferred subjects must be an array.",
        });
      }

      const profile = saveProfile(
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

// GET ALL MOCK TESTS

app.get(
  "/api/cloud/mock-tests",
  authenticateToken,
  (req, res) => {
    try {
      const mockTests = getMockTests(
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

// SAVE MOCK TEST

app.post(
  "/api/cloud/mock-tests",
  authenticateToken,
  (req, res) => {
    try {
      if (!req.body || !req.body.id) {
        return res.status(400).json({
          message:
            "Mock test ID is required.",
        });
      }

      const mockTest = saveMockTest(
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

// DELETE MOCK TEST

app.delete(
  "/api/cloud/mock-tests/:mockId",
  authenticateToken,
  (req, res) => {
    try {
      const deleted = deleteMockTest(
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

// GET SESSIONS

app.get(
  "/api/cloud/exam-sessions",
  authenticateToken,
  (req, res) => {
    try {
      const sessions = getExamSessions(
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

// SAVE SESSION

app.post(
  "/api/cloud/exam-sessions",
  authenticateToken,
  (req, res) => {
    try {
      const examId = req.body.examId;
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
        typeof sessionData !== "object"
      ) {
        return res.status(400).json({
          message:
            "Session data is required.",
        });
      }

      const session = saveExamSession(
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

// DELETE SESSION

app.delete(
  "/api/cloud/exam-sessions/:examId",
  authenticateToken,
  (req, res) => {
    try {
      const deleted = deleteExamSession(
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

// GET ATTEMPT HISTORY

app.get(
  "/api/cloud/attempt-history",
  authenticateToken,
  (req, res) => {
    try {
      const attempts =
        getAttemptHistory(
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

// SAVE ATTEMPT

app.post(
  "/api/cloud/attempt-history",
  authenticateToken,
  (req, res) => {
    try {
      if (!req.body) {
        return res.status(400).json({
          message:
            "Attempt data is required.",
        });
      }

      const attempt = saveAttempt(
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

// CLEAR ATTEMPT HISTORY

app.delete(
  "/api/cloud/attempt-history",
  authenticateToken,
  (req, res) => {
    try {
      const deleted =
        deleteAttemptHistory(
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

app.use((err, req, res, next) => {
  console.error(
    "Server error:",
    err
  );

  res.status(500).json({
    message:
      "Internal server error.",
  });
});

// ==================================================
// START SERVER
// ==================================================

app.listen(PORT, () => {
  console.log("");
  console.log(
    "======================================"
  );
  console.log(
    " NEET CBT BACKEND + CLOUD SYNC"
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
    " Cloud sync: ENABLED"
  );
  console.log(
    "======================================"
  );
  console.log("");
});