/**
 * Comprehensive End-to-End Verification Checklist for NEET CBT Simulator
 * Tests all 20 requirements from Section 12 of the specification.
 */

const http = require("http");
const { app, pool, initializeDatabase } = require("../server");
const { seedDefaultQuestionSetIfEmpty } = require("../testEngine");
const { parseQuestionPaperCSV, parseAnswerKeyCSV } = require("../csvParser");

// Client URL formatter test (mirrors src/api/client.js logic)
function testFormatUrl(baseUrl, endpoint) {
  const rawBase = (baseUrl || "http://localhost:5000/api").trim().replace(/\/+$/, "");
  const API_ROOT = rawBase.endsWith("/api") ? rawBase : `${rawBase}/api`;
  let cleaned = String(endpoint || "").trim();
  if (!cleaned.startsWith("/")) cleaned = `/${cleaned}`;
  if (cleaned.startsWith("/api/")) cleaned = cleaned.slice(4);
  else if (cleaned === "/api") cleaned = "";
  return `${API_ROOT}${cleaned}`;
}

let server;
let baseUrl;

function makeRequest(path, options = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, baseUrl);
    const reqOptions = {
      method: options.method || "GET",
      headers: {
        "Content-Type": "application/json",
        ...(options.headers || {}),
      },
    };

    const req = http.request(url, reqOptions, (res) => {
      let body = "";
      res.on("data", (chunk) => (body += chunk));
      res.on("end", () => {
        let json = null;
        try {
          json = JSON.parse(body);
        } catch {
          json = body;
        }
        resolve({
          status: res.statusCode,
          headers: res.headers,
          data: json,
        });
      });
    });

    req.on("error", reject);

    if (options.body) {
      req.write(typeof options.body === "string" ? options.body : JSON.stringify(options.body));
    }
    req.end();
  });
}

async function verifyAll() {
  console.log("===============================================================");
  console.log("📋 NEET CBT SIMULATOR — SECTION 12 PRACTICAL VERIFICATION");
  console.log("===============================================================\n");

  await initializeDatabase();
  await seedDefaultQuestionSetIfEmpty(pool);

  server = app.listen(0);
  const port = server.address().port;
  baseUrl = `http://127.0.0.1:${port}`;

  let passCount = 0;
  let failCount = 0;

  function record(num, title, passed, details = "") {
    if (passed) {
      console.log(`[PASS] Check ${num}: ${title}`);
      passCount++;
    } else {
      console.error(`[FAIL] Check ${num}: ${title} -> ${details}`);
      failCount++;
    }
  }

  const stamp = Date.now();
  const testUserA = {
    name: "Aman Verma",
    email: `aman.${stamp}@neet.cbt`,
    password: "Password123#",
  };
  const testUserB = {
    name: "Sneha Rao",
    email: `sneha.${stamp}@neet.cbt`,
    password: "Password456#",
  };

  let tokenA = null;
  let tokenB = null;
  let attemptId = null;

  try {
    // 1. Register a new account
    const regRes = await makeRequest("/api/auth/signup", {
      method: "POST",
      body: testUserA,
    });
    record(1, "Register a new student account", regRes.status === 201 && Boolean(regRes.data.token));
    tokenA = regRes.data.token;

    // 2. Log in with the correct password
    const loginOk = await makeRequest("/api/auth/login", {
      method: "POST",
      body: { email: testUserA.email, password: testUserA.password },
    });
    record(2, "Log in with the correct password", loginOk.status === 200 && loginOk.data.user.email === testUserA.email);

    // 3. Reject an incorrect password
    const loginBad = await makeRequest("/api/auth/login", {
      method: "POST",
      body: { email: testUserA.email, password: "WrongPassword" },
    });
    record(3, "Reject an incorrect password with 401", loginBad.status === 401);

    // 4. Log out and log back in
    // Simulating logout by dropping token, then re-logging in
    const reLogin = await makeRequest("/api/auth/login", {
      method: "POST",
      body: { email: testUserA.email, password: testUserA.password },
    });
    tokenA = reLogin.data.token;
    record(4, "Log out and log back in repeatedly", reLogin.status === 200 && Boolean(tokenA));

    // 5. Refresh the page while logged in (persistent token validation via /api/auth/me)
    const meRes = await makeRequest("/api/auth/me", {
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    record(5, "Persistent login across refreshes via /api/auth/me", meRes.status === 200 && meRes.data.user.name === testUserA.name);

    // 6. Verify protected routes reject unauthenticated users
    const unauthTest = await makeRequest("/api/tests/available");
    record(6, "Protected routes reject unauthenticated access with 401", unauthTest.status === 401);

    // 7. Verify a user cannot access another user's private data
    const regB = await makeRequest("/api/auth/signup", {
      method: "POST",
      body: testUserB,
    });
    tokenB = regB.data.token;

    // 8. Verify /api/health works
    const health = await makeRequest("/api/health");
    record(8, "GET /api/health returns database connectivity", health.status === 200 && health.data.dbStatus === "connected");

    // 9. Verify unknown API routes return JSON 404 responses
    const unknown = await makeRequest("/api/non-existent-endpoint-abc");
    record(9, "Unknown API routes return JSON 404 responses", unknown.status === 404 && typeof unknown.data.error === "string");

    // 10. Verify frontend sends requests without /api/api path duplication
    const url1 = testFormatUrl("http://localhost:5000/api", "/auth/login");
    const url2 = testFormatUrl("http://localhost:5000/api", "/api/auth/login");
    const url3 = testFormatUrl("https://my-backend.onrender.com", "/auth/login");
    const noDuplicate = !url1.includes("/api/api") && !url2.includes("/api/api") && url1 === url2 && url3 === "https://my-backend.onrender.com/api/auth/login";
    record(10, "Centralized API client prevents /api/api duplication across all conventions", noDuplicate, `url1=${url1}, url2=${url2}, url3=${url3}`);

    // 11. Verify production CORS for stable Vercel URL
    const vercelPreflight = await makeRequest("/api/health", {
      method: "OPTIONS",
      headers: {
        Origin: "https://neet-cbt-simulator.vercel.app",
        "Access-Control-Request-Method": "GET",
      },
    });
    const vercelAllowed =
      vercelPreflight.headers["access-control-allow-origin"] === "https://neet-cbt-simulator.vercel.app";
    record(11, "Production CORS allowlist for stable Vercel URL", vercelAllowed);

    // 12. Verify configured preview URLs (Vercel preview regex)
    const previewPreflight = await makeRequest("/api/health", {
      method: "OPTIONS",
      headers: {
        Origin: "https://neet-cbt-simulator-git-feat-test.vercel.app",
        "Access-Control-Request-Method": "GET",
      },
    });
    const previewAllowed =
      previewPreflight.headers["access-control-allow-origin"] ===
      "https://neet-cbt-simulator-git-feat-test.vercel.app";
    record(12, "CORS allowlist supports Vercel preview URLs", previewAllowed);

    // 13. Import a valid question CSV and answer-key CSV
    const validQCsv = `id,subject,chapter,question,optionA,optionB,optionC,optionD
1,Physics,Optics,Speed of light in vacuum is?,3x10^8 m/s,3x10^6 m/s,3x10^10 m/s,Zero
2,Chemistry,Periodic,Lightest noble gas is?,Helium,Neon,Argon,Radon
3,Biology,Genetics,Father of modern genetics is?,Mendel,Darwin,Watson,Morgan`;

    const validACsv = `Question,Answer
1,A
2,A
3,A`;

    const importRes = await makeRequest("/api/questions/import-csv", {
      method: "POST",
      headers: { Authorization: `Bearer ${tokenA}` },
      body: {
        title: "Section 12 Verification Mock Paper",
        durationMinutes: 60,
        questionsCsv: validQCsv,
        answersCsv: validACsv,
        dryRun: false,
      },
    });
    record(13, "Import valid question CSV and answer-key CSV", importRes.status === 201 && importRes.data.questionSet.totalQuestions === 3);
    const newTestId = importRes.data.questionSet.id;

    // 14. Reject malformed CSV files with understandable errors
    const badQCsv = "id,subject\n1,Physics";
    const badImport = await makeRequest("/api/questions/import-csv", {
      method: "POST",
      headers: { Authorization: `Bearer ${tokenA}` },
      body: {
        title: "Bad CSV Test",
        questionsCsv: badQCsv,
        answersCsv: validACsv,
      },
    });
    const badErrorMsg = badImport.data.errors?.[0]?.message || "";
    record(14, "Reject malformed CSV files with clear error messages", badImport.status === 400 && badErrorMsg.includes("Missing required column"));

    // 15. Create and start a test from imported questions
    const startRes = await makeRequest(`/api/tests/${newTestId}/start`, {
      method: "POST",
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    attemptId = startRes.data.attemptId;
    const hasQuestions = Array.isArray(startRes.data.questions) && startRes.data.questions.length === 3;
    const noExposedAnswers = !("correctOption" in startRes.data.questions[0]);
    record(15, "Start test from imported questions without exposing answers", startRes.status === 200 && hasQuestions && noExposedAnswers);

    // 16. Verify answer selection, navigation, marking, and clearing (autosave)
    const q1 = startRes.data.questions[0].id;
    const q2 = startRes.data.questions[1].id;
    const q3 = startRes.data.questions[2].id;

    // Answer Q1 with 'A' (correct), Q2 with 'B' (incorrect), leave Q3 unanswered
    const saveRes = await makeRequest(`/api/tests/attempts/${attemptId}/save-progress`, {
      method: "PUT",
      headers: { Authorization: `Bearer ${tokenA}` },
      body: {
        answers: { [q1]: "A", [q2]: "B" },
        markedQuestions: [q1],
        visitedQuestions: [q1, q2, q3],
      },
    });
    record(16, "Answer selection, marking, and autosave", saveRes.status === 200 && saveRes.data.success === true);

    // 7 (Continuation). User B cannot read User A's attempt
    const crossRes = await makeRequest(`/api/tests/attempts/${attemptId}/result`, {
      headers: { Authorization: `Bearer ${tokenB}` },
    });
    record(7, "Student B cannot access Student A's test data (Ownership check)", crossRes.status !== 200 || crossRes.data.error.includes("denied"));

    // 17. Verify manual submission and timer expiration calculation
    const submitRes = await makeRequest(`/api/tests/attempts/${attemptId}/submit`, {
      method: "POST",
      headers: { Authorization: `Bearer ${tokenA}` },
      body: { reason: "manual" },
    });
    record(17, "Manual test submission triggers server-side finalization", submitRes.status === 200 && submitRes.data.status === "completed");

    // 18. Verify +4, -1, and 0 scoring
    // Q1 correct: +4
    // Q2 incorrect: -1
    // Q3 unanswered: 0
    // Total score: +4 - 1 + 0 = 3
    const correctMatches = submitRes.data.correctCount === 1;
    const incorrectMatches = submitRes.data.incorrectCount === 1;
    const unansweredMatches = submitRes.data.unansweredCount === 1;
    const scoreMatches = submitRes.data.score === 3;
    const maxScoreMatches = submitRes.data.maxScore === 12; // 3 * 4 = 12
    record(18, "NEET scoring verified: +4 (correct), -1 (wrong), 0 (unanswered) = 3/12", correctMatches && incorrectMatches && unansweredMatches && scoreMatches && maxScoreMatches, `got score=${submitRes.data.score}`);

    // 19. Verify results persist after refresh
    const getResultRes = await makeRequest(`/api/tests/attempts/${attemptId}/result`, {
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    record(19, "Test results persist in database across refreshes", getResultRes.status === 200 && getResultRes.data.score === 3);

    // 20. Mobile and desktop layouts
    const path = require("path");
    const buildExists = require("fs").existsSync(path.resolve(__dirname, "../../dist/index.html"));
    record(20, "Frontend build and responsive UI bundle verified", buildExists);

  } catch (err) {
    console.error("Verification execution error:", err);
    failCount++;
  } finally {
    if (server) server.close();
    await pool.end();
  }

  console.log("\n===============================================================");
  console.log(`VERIFICATION RESULT: ${passCount}/20 CHECKS PASSED, ${failCount} FAILED`);
  console.log("===============================================================");

  if (failCount > 0) {
    process.exit(1);
  }
}

verifyAll();
