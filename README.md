# NEET Computer-Based Test (CBT) Simulator

A production-ready, full-stack NEET (National Eligibility cum Entrance Test) Computer-Based Test Simulator designed for laptops, tablets, and mobile devices.

Features a real-time exam engine with standard NEET marking (+4 for correct, -1 for incorrect, 0 for unanswered), question bank CSV importing, autosave with crash/refresh resumption, server-enforced countdown timers, subject and chapter weak area analysis, and secure JWT authentication backed by PostgreSQL.

---

## Table of Contents

1. [Features](#features)
2. [Tech Stack](#tech-stack)
3. [Project Structure](#project-structure)
4. [Prerequisites](#prerequisites)
5. [Local Development Setup](#local-development-setup)
6. [Environment Variables Reference](#environment-variables-reference)
7. [CSV Format & Question Bank Specifications](#csv-format--question-bank-specifications)
8. [Deployment Guide: Render (Backend)](#deployment-guide-render-backend)
9. [Deployment Guide: Vercel (Frontend)](#deployment-guide-vercel-frontend)
10. [CORS & API URL Architecture](#cors--api-url-architecture)
11. [Troubleshooting Guide](#troubleshooting-guide)
12. [Automated Verification Tests](#automated-verification-tests)

---

## 1. Features

- **Authentication & Security**:
  - Student registration and login with `bcrypt` (12 rounds) password hashing.
  - Signed JWT tokens (`7d` expiry) stored safely in `localStorage`.
  - Rate limiting on authentication and password reset routes.
  - Helmet HTTP security headers and CORS allowlisting.
  - Ownership validation: Students cannot view or modify other students' test sessions or results.
- **NEET CBT Exam Engine**:
  - Questions loaded from PostgreSQL (Physics, Chemistry, Biology).
  - Protected answer keys: Correct answers are never sent to the client during an exam.
  - Question Palette displaying Question Numbers and Color States:
    - 🟢 Answered
    - 🔴 Not Answered
    - 🟣 Marked for Review
    - 🟣+⭐ Answered & Marked for Review
    - ⚪ Not Visited
  - Server-enforced countdown timer with automatic server-side submission on timer expiration.
  - Resumption of in-progress test attempts upon browser refresh or reconnection.
  - Duplicate submission prevention.
  - Standard NEET scoring (+4, -1, 0) and configurable marking rules.
- **Question Bank & CSV Importer**:
  - Import full question papers with columns: `id,subject,chapter,question,optionA,optionB,optionC,optionD`.
  - Import matching answer keys with columns: `Question,Answer`.
  - Pre-import validation preview with row-level error reporting.
  - Database transaction safety: Rolled back completely if validation fails.
- **Custom Mock Builder**:
  - Sample specific question counts per subject (Physics, Chemistry, Biology) and chapters from the question bank.
- **Performance Analysis & Result Review**:
  - Visual score card with total score, maximum marks, and accuracy percentage.
  - Subject-wise score breakdown (Physics, Chemistry, Biology).
  - Chapter-wise strength & weak area identification (<50% Weak, 50–69% Needs Practice, 70%+ Strong).
  - Full Question-by-Question review revealing student choice, correct answer, and detailed explanations.

---

## 2. Tech Stack

- **Frontend**: React 19, Vite 8, Responsive CSS.
- **Backend**: Node.js, Express 5, REST API.
- **Database**: PostgreSQL with `pg` connection pool, parameterized SQL queries, and safe idempotent migrations.
- **Deployment**:
  - Frontend: Vercel
  - Backend: Render
  - Database: Render PostgreSQL or compatible PostgreSQL instance.

---

## 3. Project Structure

```text
neet-cbt-simulator/
├── dist/                          # Compiled production frontend build
├── public/                        # Static public assets
├── src/
│   ├── api/
│   │   └── client.js              # Centralized API client (prevents /api/api duplication)
│   ├── answerKeys/                # Fallback reference answer keys
│   ├── questionBank/              # Fallback reference datasets
│   ├── questions/                 # Fallback reference questions
│   ├── App.jsx                    # Main application and views
│   ├── main.jsx                   # React entry point
│   └── style.css                  # Comprehensive navy/blue responsive CBT styles
├── server/
│   ├── data/
│   │   ├── neet_180q_questions.csv    # Seed NEET 180-Question paper
│   │   ├── neet_180q_answers.csv      # Seed NEET 180-Question answer key
│   │   ├── sample_10q_questions.csv   # Sample test question paper
│   │   └── sample_10q_answers.csv     # Sample test answer key
│   ├── tests/
│   │   ├── api.test.js            # Automated backend API test suite (33 assertions)
│   │   └── e2e-verify.js          # Section 12 20-Point practical verification checklist
│   ├── csvParser.js               # RFC 4180 CSV parser & validator
│   ├── migrations.js              # Idempotent PostgreSQL migrations
│   ├── postgresCloudSync.js       # Cloud sync services & legacy session compatibility
│   ├── postgresSetup.js           # Database initialization runner
│   ├── testEngine.js              # Core test engine, scoring, attempts & question sets
│   ├── server.js                  # Main Express backend server
│   ├── package.json               # Backend dependencies and scripts
│   └── .env.example               # Backend environment variables template
├── .env.example                   # Frontend environment variables template
├── index.html                     # HTML root template
├── package.json                   # Root frontend dependencies and scripts
├── render.yaml                    # Render Blueprint deployment specification
├── vercel.json                    # Vercel SPA rewrites and cache headers
└── README.md                      # Documentation
```

---

## 4. Prerequisites

- **Node.js**: v18.0.0 or higher (Node 20+ recommended).
- **npm**: v9.0.0 or higher.
- **PostgreSQL Database**: A local PostgreSQL server or a cloud PostgreSQL instance (e.g. Render PostgreSQL, Neon, Supabase, or AWS RDS).

---

## 5. Local Development Setup

### Step 1: Clone the repository
```bash
git clone https://github.com/prajwalkoneri10/neet-cbt-simulator.git
cd neet-cbt-simulator
```

### Step 2: Install frontend and backend dependencies
```bash
# Install frontend dependencies
npm install

# Install backend dependencies
cd server
npm install
cd ..
```

### Step 3: Configure Environment Variables
1. **Backend Environment**:
   Copy `server/.env.example` to `server/.env`:
   ```bash
   cp server/.env.example server/.env
   ```
   Set your PostgreSQL database connection string in `DATABASE_URL`:
   ```env
   PORT=5000
   JWT_SECRET=super_strong_jwt_secret_with_more_than_32_characters_12345
   DATABASE_URL=postgresql://username:password@localhost:5432/neet_cbt
   CLIENT_URLS=http://localhost:5173
   CLIENT_URL=http://localhost:5173
   ALLOW_VERCEL_PREVIEWS=true
   NODE_ENV=development
   ```

2. **Frontend Environment**:
   Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```
   Set the API URL:
   ```env
   VITE_API_URL=http://localhost:5000/api
   ```

### Step 4: Run Database Migrations
Initialize PostgreSQL tables and seed the default 180-Question NEET Mock Test:
```bash
cd server
npm run setup-db
cd ..
```

### Step 5: Start the Development Servers
In two separate terminal windows:

**Terminal 1 (Backend Server)**:
```bash
cd server
npm start
```
*Backend runs on `http://localhost:5000` with API health at `http://localhost:5000/api/health`.*

**Terminal 2 (Frontend Client)**:
```bash
npm run dev
```
*Frontend opens at `http://localhost:5173`.*

---

## 6. Environment Variables Reference

### Backend (`server/.env`)

| Variable | Required | Description | Example (Development) | Example (Production) |
|---|---|---|---|---|
| `PORT` | Optional | Express server port | `5000` | Provided by Render automatically |
| `DATABASE_URL` | **Yes** | PostgreSQL connection string | `postgresql://postgres:pass@localhost:5432/neet_cbt` | `postgresql://user:pass@dpg-xxx.oregon-postgres.render.com/neet_db?sslmode=require` |
| `JWT_SECRET` | **Yes** | Secret for signing JWTs (min 32 chars) | `dev_secret_key_at_least_32_characters_1234` | `6f9b2a7d4e1c8b3f5a0e2d4c7b9a1f3e5d7c9b1a` |
| `CLIENT_URLS` | **Yes** | Comma-separated allowed frontend origins | `http://localhost:5173` | `https://neet-cbt-simulator.vercel.app` |
| `CLIENT_URL` | Optional | Fallback single frontend origin | `http://localhost:5173` | `https://neet-cbt-simulator.vercel.app` |
| `ALLOW_VERCEL_PREVIEWS` | Optional | Permit Vercel preview branch domains | `true` | `true` |
| `NODE_ENV` | Optional | Environment mode | `development` | `production` |
| `RESEND_API_KEY` | Optional | API key for password reset emails | *(optional)* | `re_123456789` |
| `RESET_EMAIL_FROM` | Optional | Sender address for password emails | `onboarding@resend.dev` | `support@yourdomain.com` |

### Frontend (`.env`)

| Variable | Required | Description | Example (Development) | Example (Production) |
|---|---|---|---|---|
| `VITE_API_URL` | **Yes** | Backend API base URL | `http://localhost:5000/api` | `https://neet-cbt-backend.onrender.com/api` |

> [!IMPORTANT]
> Vite environment variables are baked into JavaScript bundles at build time. Whenever you change `VITE_API_URL`, you must trigger a new frontend build (`npm run build`).

---

## 7. CSV Format & Question Bank Specifications

### Question Paper CSV Format
File extension: `.csv`  
Required header row (case-insensitive):
```csv
id,subject,chapter,question,optionA,optionB,optionC,optionD
1,Biology,Cell Biology,"The basic structural and functional unit of life is","Tissue","Cell","Organ","Organ system"
2,Physics,Thermal Physics,"The SI unit of impulse is","N/s","N·s","J/s","kg/s"
3,Chemistry,Atomic Structure,"Which subatomic particle has a negative charge?","Proton","Neutron","Electron","Positron"
```

- `id`: Unique identifier (number or alphanumeric).
- `subject`: Must be one of `Physics`, `Chemistry`, or `Biology`.
- `chapter`: Chapter or topic name (defaults to "General" if omitted).
- `question`: Question text.
- `optionA`, `optionB`, `optionC`, `optionD`: Four option texts.

### Answer Key CSV Format
File extension: `.csv`  
Required header row (case-insensitive):
```csv
Question,Answer
1,B
2,B
3,C
```

- `Question`: Matches the `id` from the Question Paper CSV.
- `Answer`: Must be `A`, `B`, `C`, or `D`.

Sample files are located in `server/data/` and can also be downloaded directly from the UI Question Bank page.

---

## 8. Deployment Guide: Render (Backend)

### Option A: Using the Render Blueprint (`render.yaml`)
1. Push your repository to GitHub.
2. In the Render Dashboard, click **New +** > **Blueprint**.
3. Select your GitHub repository.
4. Render will detect `render.yaml` and configure the Web Service and PostgreSQL database automatically.

### Option B: Manual Setup on Render
1. **Create a PostgreSQL Database**:
   - Go to Render Dashboard > **New +** > **PostgreSQL**.
   - Name: `neet-cbt-db`.
   - Copy the **Internal Database URL** (or External Database URL if connecting externally).
2. **Create a Web Service**:
   - Go to Render Dashboard > **New +** > **Web Service**.
   - Connect your GitHub repository.
   - **Root Directory**: `server`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
3. **Configure Environment Variables** in Render:
   - `NODE_ENV`: `production`
   - `DATABASE_URL`: *(Your Render PostgreSQL connection string)*
   - `JWT_SECRET`: *(A strong random 64-character secret)*
   - `CLIENT_URLS`: `https://neet-cbt-simulator.vercel.app`
   - `ALLOW_VERCEL_PREVIEWS`: `true`
4. Deploy the service. Copy the assigned URL (e.g., `https://neet-cbt-backend.onrender.com`).
5. Verify health: Open `https://neet-cbt-backend.onrender.com/api/health` in your browser.

---

## 9. Deployment Guide: Vercel (Frontend)

1. Push your repository to GitHub.
2. In the Vercel Dashboard, click **Add New...** > **Project**.
3. Import your `neet-cbt-simulator` repository.
4. Configure Project Settings:
   - **Framework Preset**: Vite
   - **Root Directory**: `./` (Root)
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`
5. **Environment Variables**:
   - Key: `VITE_API_URL`
   - Value: `https://neet-cbt-backend.onrender.com/api` *(replace with your deployed Render URL)*
6. Click **Deploy**.
7. In Render, ensure your Vercel production URL (e.g. `https://neet-cbt-simulator.vercel.app`) is included in `CLIENT_URLS`.

---

## 10. CORS & API URL Architecture

### Why previous implementations failed
1. Inconsistent route paths (`/api/auth/signup` vs `/auth/login`) caused requests to resolve to `/api/api/auth/signup` (404 Not Found).
2. Hardcoding a single origin rejected localhost and Vercel preview environments.
3. Client-side scoring allowed answer keys to be exposed in the browser payload.

### How this project systematically prevents errors
1. **Centralized Client (`src/api/client.js`)**: Automatically normalizes any endpoint string (`formatUrl`). Whether a caller writes `/auth/login` or `/api/auth/login`, it safely formats to `${API_BASE_URL}/auth/login` without duplicate `/api` segments.
2. **Explicit CORS Allowlist (`server/server.js`)**: Express checks `CLIENT_URLS`, `CLIENT_URL`, localhost origins, and Vercel preview domains dynamically.
3. **Preflight Interception**: `app.options(/(.*)/, cors(...))` handles preflight `OPTIONS` requests before route execution.
4. **Server-Side Test Engine**: The client receives questions **without** correct answers. Answers are kept in PostgreSQL until the student submits or the official timer expires.

---

## 11. Troubleshooting Guide

| Issue | Root Cause | Solution |
|---|---|---|
| **Failed to fetch** | Frontend cannot reach backend (backend is down, wrong URL, or CORS error). | 1. Check `GET /api/health` in browser. <br/> 2. Verify `VITE_API_URL` in `.env` matches your backend URL. <br/> 3. Verify Render web service is not in sleep/starting state. |
| **API route not found (404)** | Route misspelled or duplicated `/api/api` path. | Use `api.client.js` functions. Our client automatically strips redundant `/api` prefixes. |
| **CORS error: Request origin not permitted (403)** | The frontend origin is not in `CLIENT_URLS`. | Add your frontend domain (e.g. `https://neet-cbt-simulator.vercel.app`) to `CLIENT_URLS` in `server/.env` (or Render Dashboard). |
| **401 Unauthorized** | Token missing or expired. | Log in again. The token is stored in `localStorage.getItem("neetAuthToken")` and expires after 7 days. |
| **409 Conflict** | An account with this email already exists. | Use a different email address or log in using existing credentials. |
| **500 Internal Server Error** | Unhandled server exception or database query failure. | Inspect server console logs. Check PostgreSQL table connection. |
| **Database Connection Failure** | Invalid `DATABASE_URL` or SSL configuration. | Ensure `DATABASE_URL` includes `?sslmode=require` for cloud instances. The backend pool automatically sets `ssl: { rejectUnauthorized: false }`. |

---

## 12. Automated Verification Tests

Run the test suite from the `server/` directory:

```bash
cd server

# Run core API unit & integration tests (33 tests)
npm test

# Run the Section 12 20-Point Practical Verification Checklist
node tests/e2e-verify.js
```

### Verification Checklist Output:
```text
===============================================================
📋 NEET CBT SIMULATOR — SECTION 12 PRACTICAL VERIFICATION
===============================================================
[PASS] Check 1: Register a new student account
[PASS] Check 2: Log in with the correct password
[PASS] Check 3: Reject an incorrect password with 401
[PASS] Check 4: Log out and log back in repeatedly
[PASS] Check 5: Persistent login across refreshes via /api/auth/me
[PASS] Check 6: Protected routes reject unauthenticated access with 401
[PASS] Check 8: GET /api/health returns database connectivity
[PASS] Check 9: Unknown API routes return JSON 404 responses
[PASS] Check 10: Centralized API client prevents /api/api duplication across all conventions
[PASS] Check 11: Production CORS allowlist for stable Vercel URL
[PASS] Check 12: CORS allowlist supports Vercel preview URLs
[PASS] Check 13: Import valid question CSV and answer-key CSV
[PASS] Check 14: Reject malformed CSV files with clear error messages
[PASS] Check 15: Start test from imported questions without exposing answers
[PASS] Check 16: Answer selection, marking, and autosave
[PASS] Check 7: Student B cannot access Student A's test data (Ownership check)
[PASS] Check 17: Manual test submission triggers server-side finalization
[PASS] Check 18: NEET scoring verified: +4 (correct), -1 (wrong), 0 (unanswered) = 3/12
[PASS] Check 19: Test results persist in database across refreshes
[PASS] Check 20: Frontend build and responsive UI bundle verified
===============================================================
VERIFICATION RESULT: 20/20 CHECKS PASSED, 0 FAILED
===============================================================
```
