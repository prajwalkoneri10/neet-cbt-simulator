/**
 * Verification Test: Personal PDF/Question Paper Ingestion and CBT Attempt
 */
const assert = require("assert");

async function request(path, options = {}) {
  const url = `http://localhost:5000${path}`;
  const headers = { "Content-Type": "application/json", ...options.headers };
  const res = await fetch(url, { ...options, headers });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

async function run() {
  console.log("==================================================");
  console.log("🧪 VERIFYING PERSONAL QUESTION PAPER UPLOAD & CBT");
  console.log("==================================================");

  // 1. Register Student X
  const studentXEmail = `student.personal.${Date.now()}@neet.cbt`;
  const signupX = await request("/api/auth/signup", {
    method: "POST",
    body: JSON.stringify({
      name: "Personal Test Aspirant",
      email: studentXEmail,
      password: "password123",
    }),
  });
  assert.strictEqual(signupX.status, 201, "Student X registration must succeed");
  const tokenX = signupX.data.token;
  const userXId = signupX.data.user.id;
  const headersX = { Authorization: `Bearer ${tokenX}` };
  console.log("  ✅ [PASS] Student X registered and authenticated");

  // 2. Import Personal Question Paper (Simulating parsed PDF questions & answers)
  const personalQuestions = [
    {
      number: 1,
      subject: "Biology",
      chapter: "Cell Biology",
      question: "Which organelle is known as the powerhouse of the cell?",
      options: ["Chloroplast", "Mitochondria", "Ribosome", "Golgi apparatus"],
      correctAnswer: "B",
      explanation: "Mitochondria generates ATP via cellular respiration.",
    },
    {
      number: 2,
      subject: "Physics",
      chapter: "Kinematics",
      question: "What is the SI unit of acceleration?",
      options: ["m/s", "m/s^2", "N/kg", "m*s"],
      correctAnswer: "B",
      explanation: "Acceleration is defined as rate of change of velocity: m/s^2.",
    },
    {
      number: 3,
      subject: "Chemistry",
      chapter: "Atomic Structure",
      question: "What is the atomic number of Carbon?",
      options: ["5", "6", "7", "8"],
      correctAnswer: "B",
      explanation: "Carbon has 6 protons, so atomic number is 6.",
    },
  ];

  const importRes = await request("/api/tests/personal/import", {
    method: "POST",
    headers: headersX,
    body: JSON.stringify({
      title: "My Personal Allen Mock Paper 01",
      description: "Extracted from PDF via browser pdfjs parser",
      durationMinutes: 45,
      category: "personal",
      questions: personalQuestions,
    }),
  });

  assert.strictEqual(importRes.status, 201, "Personal import must return 201 Created");
  assert(importRes.data.testId, "Response must include testId");
  const personalTestId = importRes.data.testId;
  console.log(`  ✅ [PASS] Personal test imported and saved to PostgreSQL (Set ID: ${personalTestId})`);

  // 3. Verify that Student X sees their personal paper in available tests
  const testsResX = await request("/api/tests/available", { headers: headersX });
  assert.strictEqual(testsResX.status, 200);
  const foundInX = testsResX.data.tests.find((t) => t.id === personalTestId);
  assert(foundInX, "Student X must see their personal paper in available tests");
  assert.strictEqual(foundInX.isPersonal, true, "Test must be flagged as isPersonal = true for Student X");
  console.log("  ✅ [PASS] Personal test appears in Student X's test catalog as personal upload");

  // 4. Verify that Student Y (different student) CANNOT see Student X's private test
  const studentYEmail = `student.other.${Date.now()}@neet.cbt`;
  const signupY = await request("/api/auth/signup", {
    method: "POST",
    body: JSON.stringify({
      name: "Other Student",
      email: studentYEmail,
      password: "password123",
    }),
  });
  const headersY = { Authorization: `Bearer ${signupY.data.token}` };

  const testsResY = await request("/api/tests/available", { headers: headersY });
  const foundInY = testsResY.data.tests.find((t) => t.id === personalTestId);
  assert(!foundInY, "Student Y must NOT see Student X's personal private test");
  console.log("  ✅ [PASS] Privacy enforced: Other students cannot see Student X's personal test");

  // 5. Verify Student Y is rejected if they try to start Student X's private test
  const startDenyRes = await request(`/api/tests/${personalTestId}/start`, {
    method: "POST",
    headers: headersY,
  });
  assert(startDenyRes.status === 400 || startDenyRes.status === 500, "Student Y must be denied access to Student X's test");
  console.log("  ✅ [PASS] Authorization enforced: Unauthorized student cannot start private test");

  // 6. Student X starts their personal test
  const startResX = await request(`/api/tests/${personalTestId}/start`, {
    method: "POST",
    headers: headersX,
  });
  assert.strictEqual(startResX.status, 200, "Student X starting test must succeed (200)");
  const sessionX = startResX.data;
  assert(sessionX.attemptId, "Must return attemptId");
  assert.strictEqual(sessionX.questions.length, 3, "Must have 3 questions");

  // SECURITY: Verify answer keys NOT leaked
  sessionX.questions.forEach((q) => {
    assert.strictEqual(q.correctOption, undefined, "Security: correctOption must not be returned");
    assert.strictEqual(q.explanation, undefined, "Security: explanation must not be returned");
  });
  console.log("  ✅ [PASS] Started personal test; Answer keys are NOT exposed to frontend");

  // 7. Student X answers: Q1 -> B (Correct), Q2 -> A (Wrong), Q3 -> Unanswered
  const attemptId = sessionX.attemptId;
  const answers = {
    [sessionX.questions[0].id]: "B", // Correct (+4)
    [sessionX.questions[1].id]: "A", // Incorrect (-1)
  };

  const saveRes = await request(`/api/tests/attempts/${attemptId}/save-progress`, {
    method: "PUT",
    headers: headersX,
    body: JSON.stringify({ answers, markedQuestions: [], visitedQuestions: [] }),
  });
  assert.strictEqual(saveRes.status, 200, "Autosave progress must succeed");
  console.log("  ✅ [PASS] Answers autosaved in PostgreSQL");

  // 8. Submit test attempt
  const submitRes = await request(`/api/tests/attempts/${attemptId}/submit`, {
    method: "POST",
    headers: headersX,
    body: JSON.stringify({ finalAnswers: answers, reason: "manual" }),
  });
  assert.strictEqual(submitRes.status, 200, "Submit attempt must succeed");
  const result = submitRes.data;
  assert.strictEqual(result.correctCount, 1, "Should have 1 correct answer");
  assert.strictEqual(result.incorrectCount, 1, "Should have 1 incorrect answer");
  assert.strictEqual(result.unansweredCount, 1, "Should have 1 unanswered question");
  assert.strictEqual(result.score, 3, "Score must be 4 - 1 = 3");
  console.log(`  ✅ [PASS] Server evaluated score: +4 -1 = ${result.score} marks`);

  // 9. Verify results appear in Test History
  const historyRes = await request("/api/tests/attempts/history", { headers: headersX });
  assert.strictEqual(historyRes.status, 200);
  const foundHistory = historyRes.data.history.find((h) => h.attemptId == attemptId);
  assert(foundHistory, "Personal test attempt must appear in Test History");
  assert.strictEqual(foundHistory.score, 3, "Score in history must be 3");
  console.log("  ✅ [PASS] Personal test attempt is saved and visible in Test History");

  // 10. Verify results contribute to Analytics
  const analyticsRes = await request("/api/analytics", { headers: headersX });
  assert.strictEqual(analyticsRes.status, 200);
  assert.strictEqual(analyticsRes.data.totalAttempts, 1, "Analytics must reflect 1 completed test");
  assert.strictEqual(analyticsRes.data.scoreTrajectory[0].score, 3, "Trajectory includes personal score");
  console.log("  ✅ [PASS] Personal test attempt feeds into Performance Analytics");

  console.log("\n==================================================");
  console.log("🎉 ALL PERSONAL TEST UPLOAD & CBT CHECKS PASSED!");
  console.log("==================================================");
  process.exit(0);
}

run().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
