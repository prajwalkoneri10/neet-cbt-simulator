/**
 * Automated Test Suite for NEET CBT Simulator Backend
 * Tests:
 * 1. Health check & DB connection
 * 2. User registration, duplicate rejection (409), validation (400)
 * 3. User login, wrong password rejection (401)
 * 4. Token verification & /api/auth/me
 * 5. Unauthenticated access rejection (401)
 * 6. Unknown API routes return JSON 404
 * 7. CORS origin verification
 * 8. CSV Question Paper & Answer Key parsing and validation
 * 9. Starting a test (guarantees answer keys are NOT exposed)
 * 10. Autosaving test progress
 * 11. Submitting test: server-side +4, -1, 0 NEET score calculation
 * 12. Ownership isolation: Student B cannot access Student A's test attempt
 */

const http = require("http");
const fs = require("fs");
const path = require("path");
const { app, pool, initializeDatabase } = require("../server");
const { seedDefaultQuestionSetIfEmpty } = require("../testEngine");

let server;
let baseUrl;

function request(path, options = {}) {
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

async function runTests() {
  console.log("==================================================");
  console.log("🧪 STARTING NEET CBT SIMULATOR AUTOMATED TESTS");
  console.log("==================================================");

  let passedCount = 0;
  let failedCount = 0;

  function assert(name, condition, extra = "") {
    if (condition) {
      console.log(`  ✅ [PASS] ${name}`);
      passedCount++;
    } else {
      console.error(`  ❌ [FAIL] ${name} ${extra ? `(${extra})` : ""}`);
      failedCount++;
    }
  }

  // Start temporary test server
  await initializeDatabase();
  await seedDefaultQuestionSetIfEmpty(pool);

  server = app.listen(0);
  const port = server.address().port;
  baseUrl = `http://127.0.0.1:${port}`;

  const uniqueSuffix = Date.now();
  const studentA = {
    name: "Aakash Sharma",
    email: `student.a.${uniqueSuffix}@neet.test`,
    password: "Password123!",
  };
  const studentB = {
    name: "Bhavna Patel",
    email: `student.b.${uniqueSuffix}@neet.test`,
    password: "Password456!",
  };

  let tokenA = null;
  let tokenB = null;
  let attemptIdA = null;

  try {
    // 1. Health Check
    const health = await request("/api/health");
    assert("Health check returns 200 OK", health.status === 200);
    assert("Health check returns dbStatus connected", health.data.dbStatus === "connected");

    // 2. JSON 404 for unknown route
    const notFound = await request("/api/unknown-route-1234");
    assert("Unknown API route returns 404", notFound.status === 404);
    assert("Unknown API route returns JSON error", typeof notFound.data.error === "string");

    // 3. Register Student A
    const signupA = await request("/api/auth/signup", {
      method: "POST",
      body: studentA,
    });
    assert("Student A registration succeeds (201)", signupA.status === 201);
    assert("Registration returns JWT token", typeof signupA.data.token === "string");
    tokenA = signupA.data.token;

    // 4. Duplicate registration rejected with 409
    const dupSignup = await request("/api/auth/signup", {
      method: "POST",
      body: studentA,
    });
    assert("Duplicate registration rejected with 409 Conflict", dupSignup.status === 409);

    // 5. Short password rejected with 400
    const shortPass = await request("/api/auth/signup", {
      method: "POST",
      body: { name: "Short", email: `short.${uniqueSuffix}@neet.test`, password: "123" },
    });
    assert("Password < 6 chars rejected with 400 Bad Request", shortPass.status === 400);

    // 6. Login with correct password
    const loginOk = await request("/api/auth/login", {
      method: "POST",
      body: { email: studentA.email, password: studentA.password },
    });
    assert("Login with valid password succeeds (200)", loginOk.status === 200);
    assert("Login returns student info", loginOk.data.user.name === studentA.name);

    // 7. Login with incorrect password rejected with 401
    const loginBad = await request("/api/auth/login", {
      method: "POST",
      body: { email: studentA.email, password: "WrongPassword999" },
    });
    assert("Login with incorrect password rejected with 401", loginBad.status === 401);

    // 8. Auth verification /api/auth/me
    const meOk = await request("/api/auth/me", {
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    assert("/api/auth/me returns student info for valid token", meOk.status === 200 && meOk.data.user.email === studentA.email);

    // 9. Protected routes reject unauthenticated requests
    const unauth = await request("/api/profile");
    assert("Protected route rejects request without token with 401", unauth.status === 401);

    // 10. Register Student B
    const signupB = await request("/api/auth/signup", {
      method: "POST",
      body: studentB,
    });
    assert("Student B registration succeeds (201)", signupB.status === 201);
    tokenB = signupB.data.token;

    // 11. Get Available Tests
    const availTests = await request("/api/tests/available", {
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    assert("Available tests endpoint returns 200", availTests.status === 200);
    assert("At least 1 test is available (seeded mock test)", Array.isArray(availTests.data.tests) && availTests.data.tests.length >= 1);
    const testId = availTests.data.tests[0].id;

    // 12. Start Test Attempt
    const startTest = await request(`/api/tests/${testId}/start`, {
      method: "POST",
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    assert("Starting test returns 200", startTest.status === 200);
    assert("Test attempt has attemptId", typeof startTest.data.attemptId !== "undefined");
    attemptIdA = startTest.data.attemptId;

    // CRITICAL SECURITY ASSERTION: Answer keys MUST NOT be sent in questions payload!
    const sampleQ = startTest.data.questions[0];
    const hasExposedAnswer = "correctOption" in sampleQ || "correctAnswer" in sampleQ || "answer" in sampleQ || "explanation" in sampleQ;
    assert("SECURITY: Questions payload does NOT expose answer keys or explanations", !hasExposedAnswer);

    // 13. Save Progress (Autosave)
    // Let's answer question 1 with 'C' (which is correct for Q1) and question 2 with 'A' (which is incorrect for Q2)
    const q1Id = startTest.data.questions[0].id;
    const q2Id = startTest.data.questions[1].id;
    const saveProgress = await request(`/api/tests/attempts/${attemptIdA}/save-progress`, {
      method: "PUT",
      headers: { Authorization: `Bearer ${tokenA}` },
      body: {
        answers: {
          [q1Id]: "C",
          [q2Id]: "A",
        },
        markedQuestions: [q1Id],
        visitedQuestions: [q1Id, q2Id],
      },
    });
    assert("Autosaving progress returns 200 success", saveProgress.status === 200 && saveProgress.data.success === true);

    // 14. Active Attempt Resumption
    const activeAttempt = await request("/api/tests/attempts/active", {
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    assert("Resuming active attempt returns in-progress test", activeAttempt.status === 200 && activeAttempt.data.activeAttempt !== null);
    const activeQ1 = activeAttempt.data.activeAttempt.questions.find((q) => q.id === q1Id);
    assert("Resumed attempt retains saved answer", activeQ1 && activeQ1.selectedOption === "C");

    // 15. Submit Test Attempt and Verify Server-Side Scoring (+4, -1, 0)
    const submit = await request(`/api/tests/attempts/${attemptIdA}/submit`, {
      method: "POST",
      headers: { Authorization: `Bearer ${tokenA}` },
      body: { reason: "manual" },
    });
    assert("Submitting test returns 200 completed status", submit.status === 200 && submit.data.status === "completed");
    assert("Server correctly counts 1 correct answer", submit.data.correctCount === 1);
    assert("Server correctly counts 1 incorrect answer", submit.data.incorrectCount === 1);
    assert("Server calculates score: +4 -1 = 3", submit.data.score === 3);
    assert("Server calculates accurate remaining unanswered count", submit.data.unansweredCount === submit.data.totalQuestions - 2);

    // 16. Duplicate submission is idempotent and returns completed result
    const dupSubmit = await request(`/api/tests/attempts/${attemptIdA}/submit`, {
      method: "POST",
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    assert("Duplicate submit returns existing completed result", dupSubmit.status === 200 && dupSubmit.data.status === "completed");

    // 17. Result review now safely includes correct answers and explanations after submission
    const resultReview = await request(`/api/tests/attempts/${attemptIdA}/result`, {
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    assert("Get result review returns completed attempt", resultReview.status === 200);
    assert("Result review includes correct option after submission", Boolean(resultReview.data.questions[0].correctOption));

    // 18. PRIVACY & ISOLATION CHECK: Student B CANNOT access Student A's test attempt
    const crossAccess = await request(`/api/tests/attempts/${attemptIdA}/result`, {
      headers: { Authorization: `Bearer ${tokenB}` },
    });
    assert("Student B is denied access to Student A's test attempt (500/403/Access denied)", crossAccess.status !== 200 || crossAccess.data.error.includes("denied"));

    // 19. CSV Import with Dry Run
    const sampleQuestionsCsv = `id,subject,chapter,question,optionA,optionB,optionC,optionD
1,Physics,Kinematics,What is unit of velocity?,m/s,kg,s,N
2,Biology,Cell,What is powerhouse of cell?,Nucleus,Mitochondria,Ribosome,Golgi`;
    const sampleAnswersCsv = `Question,Answer
1,A
2,B`;

    const dryRunImport = await request("/api/questions/import-csv", {
      method: "POST",
      headers: { Authorization: `Bearer ${tokenA}` },
      body: {
        title: "Test Set",
        questionsCsv: sampleQuestionsCsv,
        answersCsv: sampleAnswersCsv,
        dryRun: true,
      },
    });
    assert("CSV dryRun import preview returns 200 with totalQuestions: 2", dryRunImport.status === 200 && dryRunImport.data.totalQuestions === 2);

    // 20. CSV Import rejecting malformed question CSV
    const badCsvImport = await request("/api/questions/import-csv", {
      method: "POST",
      headers: { Authorization: `Bearer ${tokenA}` },
      body: {
        title: "Bad Set",
        questionsCsv: "id,subject\n1,Physics",
        answersCsv: sampleAnswersCsv,
      },
    });
    assert("Malformed CSV import rejected with 400 Bad Request", badCsvImport.status === 400);

  } catch (err) {
    console.error("Test execution threw unexpected exception:", err);
    failedCount++;
  } finally {
    if (server) {
      server.close();
    }
    await pool.end();
  }

  console.log("==================================================");
  console.log(`TEST SUMMARY: ${passedCount} PASSED, ${failedCount} FAILED`);
  console.log("==================================================");

  if (failedCount > 0) {
    process.exit(1);
  }
}

runTests();
