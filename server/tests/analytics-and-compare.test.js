const assert = require("assert");

const BASE_URL = "http://localhost:5000/api";

async function request(endpoint, options = {}) {
  const url = `${BASE_URL}${endpoint}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch (e) {
    data = text;
  }
  return { status: res.status, ok: res.ok, data };
}

async function runTests() {
  console.log("==========================================================");
  console.log("🧪 TESTING STUDENT PERFORMANCE ANALYTICS & TEST COMPARISONS");
  console.log("==========================================================");

  const timestamp = Date.now();
  const studentAEmail = `student_analytics_a_${timestamp}@test.com`;
  const studentBEmail = `student_analytics_b_${timestamp}@test.com`;
  const password = "StrongPassword123!";

  // 1. Register Student A and Student B
  const regA = await request("/auth/register", {
    method: "POST",
    body: JSON.stringify({ name: "Student Analytics A", email: studentAEmail, password }),
  });
  assert.strictEqual(regA.status, 201, "Student A registration must succeed");
  const tokenA = regA.data.token;
  const userA = regA.data.user;
  console.log("  ✅ [PASS] Requirement 1: Student registration and authentication working");

  const regB = await request("/auth/register", {
    method: "POST",
    body: JSON.stringify({ name: "Student Analytics B", email: studentBEmail, password }),
  });
  assert.strictEqual(regB.status, 201, "Student B registration must succeed");
  const tokenB = regB.data.token;
  const userB = regB.data.user;

  // Verify Student A login
  const loginA = await request("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email: studentAEmail, password }),
  });
  assert.strictEqual(loginA.status, 200, "Student A login must succeed");
  assert.ok(loginA.data.token, "Login must return JWT token");
  console.log("  ✅ [PASS] Requirement 1: Student login works with valid credentials");

  // 2. Test Target Marks Persistence & Updating (Requirement 6)
  const initialGoals = await request("/goals", {
    headers: { Authorization: `Bearer ${tokenA}` },
  });
  assert.strictEqual(initialGoals.status, 200, "GET /goals must return 200");
  assert.strictEqual(initialGoals.data.targetScore, 650, "Default target score must be 650");
  assert.strictEqual(initialGoals.data.completedTests, 0, "Initial completed tests must be 0");
  assert.strictEqual(initialGoals.data.scoreGap, 650, "Initial score gap must equal target");
  assert.strictEqual(initialGoals.data.targetReached, false, "Initial targetReached must be false");

  // Update target score to 680
  const updateGoals = await request("/goals", {
    method: "PUT",
    headers: { Authorization: `Bearer ${tokenA}` },
    body: JSON.stringify({
      targetScore: 680,
      targetBiology: 340,
      targetPhysics: 150,
      targetChemistry: 150,
      targetYear: 2027,
    }),
  });
  assert.strictEqual(updateGoals.status, 200, "PUT /goals must return 200");
  assert.strictEqual(updateGoals.data.profile.targetScore, 680, "Target score must update to 680");

  const verifiedGoals = await request("/goals", {
    headers: { Authorization: `Bearer ${tokenA}` },
  });
  assert.strictEqual(verifiedGoals.data.targetScore, 680, "Target score must persist in DB as 680");
  assert.strictEqual(verifiedGoals.data.targetBiology, 340, "Target Biology must be 340");
  console.log("  ✅ [PASS] Requirement 6: Target marks persist and can be updated in database");

  // 3. Test Analytics with 0 tests (Missing data handling - Requirement 8)
  const emptyAnalytics = await request("/analytics", {
    headers: { Authorization: `Bearer ${tokenA}` },
  });
  assert.strictEqual(emptyAnalytics.status, 200, "GET /analytics must return 200 for 0 completed tests");
  assert.strictEqual(emptyAnalytics.data.totalAttempts, 0, "Total attempts must be 0");
  assert.strictEqual(emptyAnalytics.data.strongestSubject, null, "Strongest subject must be null when no tests exist");
  assert.strictEqual(emptyAnalytics.data.weakestSubject, null, "Weakest subject must be null when no tests exist");
  assert.strictEqual(emptyAnalytics.data.trend, null, "Trend must be null when < 2 tests");
  console.log("  ✅ [PASS] Requirement 8: Missing historical/subject data does not crash analytics");

  // 4. Test Personal Question Paper Upload (Requirement 2)
  const personalTest1 = await request("/tests/personal/import", {
    method: "POST",
    headers: { Authorization: `Bearer ${tokenA}` },
    body: JSON.stringify({
      title: "Biology Rapid Drill (5Q)",
      description: "Practice set with 5 questions",
      durationMinutes: 15,
      category: "biology",
      questions: [
        {
          number: 1,
          subject: "Biology",
          chapter: "Cell Biology",
          question: "Which organelle is called the powerhouse of the cell?",
          options: ["Ribosome", "Mitochondria", "Nucleus", "Chloroplast"],
          correctAnswer: "B",
        },
        {
          number: 2,
          subject: "Biology",
          chapter: "Cell Biology",
          question: "Which organelle contains hydrolytic enzymes?",
          options: ["Lysosome", "Vacuole", "Golgi apparatus", "Ribosome"],
          correctAnswer: "A",
        },
        {
          number: 3,
          subject: "Biology",
          chapter: "Genetics",
          question: "Who is known as the father of modern genetics?",
          options: ["Gregor Mendel", "Charles Darwin", "Thomas Morgan", "Watson"],
          correctAnswer: "A",
        },
        {
          number: 4,
          subject: "Biology",
          chapter: "Genetics",
          question: "The phenotypic ratio of a monohybrid cross in F2 generation is:",
          options: ["1:2:1", "3:1", "9:3:3:1", "2:1"],
          correctAnswer: "B",
        },
        {
          number: 5,
          subject: "Biology",
          chapter: "Genetics",
          question: "Down syndrome is caused by trisomy of chromosome:",
          options: ["18", "21", "13", "23"],
          correctAnswer: "B",
        },
      ],
    }),
  });
  assert.strictEqual(personalTest1.status, 201, "Personal test import must succeed");
  const test1Id = personalTest1.data.testId;
  console.log("  ✅ [PASS] Requirement 2: Personal question paper and answer key upload works");

  // 5. Complete Test 1 (Equal to 20 marks max score: 5Q * 4)
  const start1 = await request(`/tests/${test1Id}/start`, {
    method: "POST",
    headers: { Authorization: `Bearer ${tokenA}` },
  });
  assert.strictEqual(start1.status, 200, "Start test 1 must succeed");
  const attempt1Id = start1.data.attemptId;

  // Verify answer keys are NOT exposed during test
  const qList = start1.data.questions;
  assert.strictEqual(qList[0].correctOption, undefined, "Answer keys must NOT be exposed before submission");
  console.log("  ✅ [PASS] Security: Correct answers protected and hidden during exam");

  // Submit test 1 with answers:
  // Q1: B (correct +4)
  // Q2: A (correct +4)
  // Q3: C (wrong -1, correct was A)
  // Q4: B (correct +4)
  // Q5: null (unanswered 0)
  // Total expected: +4 +4 -1 +4 +0 = 11 marks out of 20 (55%)
  const submit1 = await request(`/tests/attempts/${attempt1Id}/submit`, {
    method: "POST",
    headers: { Authorization: `Bearer ${tokenA}` },
    body: JSON.stringify({
      finalAnswers: {
        [qList[0].id]: "B",
        [qList[1].id]: "A",
        [qList[2].id]: "C",
        [qList[3].id]: "B",
      },
    }),
  });
  assert.strictEqual(submit1.status, 200, "Submit attempt 1 must succeed");
  assert.strictEqual(submit1.data.score, 11, "Score must be 11 marks (+4 +4 -1 +4 +0)");
  assert.strictEqual(submit1.data.maxScore, 20, "Max score must be 20 marks");
  assert.strictEqual(submit1.data.correctCount, 3, "Correct count must be 3");
  assert.strictEqual(submit1.data.incorrectCount, 1, "Incorrect count must be 1");
  assert.strictEqual(submit1.data.unansweredCount, 1, "Unanswered count must be 1");
  console.log("  ✅ [PASS] Requirement 3 & 10: Test scored accurately (+4/-1/0) and finalized");

  // Verify duplicate submission retry returns existing result without duplicating records (Requirement 3)
  const duplicateSubmit = await request(`/tests/attempts/${attempt1Id}/submit`, {
    method: "POST",
    headers: { Authorization: `Bearer ${tokenA}` },
    body: JSON.stringify({ finalAnswers: {} }),
  });
  assert.strictEqual(duplicateSubmit.status, 200, "Duplicate submit must return 200");
  assert.strictEqual(duplicateSubmit.data.attemptId, attempt1Id, "Must return same attemptId");

  const historyAfter1 = await request("/tests/attempts/history", {
    headers: { Authorization: `Bearer ${tokenA}` },
  });
  assert.strictEqual(historyAfter1.data.history.length, 1, "Exactly 1 attempt record must exist in history");
  console.log("  ✅ [PASS] Requirement 3: Duplicate submission retries do not create duplicate records");

  // 6. Test Viewing Results and Question Review (Requirement 4 & 10)
  const resultReview = await request(`/tests/attempts/${attempt1Id}/result`, {
    headers: { Authorization: `Bearer ${tokenA}` },
  });
  assert.strictEqual(resultReview.status, 200, "GET /result must return 200");
  assert.strictEqual(resultReview.data.questions.length, 5, "Review must include all 5 questions");
  assert.ok(resultReview.data.questions[0].correctOption, "Review must reveal correct option after submission");
  assert.strictEqual(resultReview.data.questions[0].selectedOption, "B", "Review must retain student selection");
  assert.strictEqual(resultReview.data.questions[0].isCorrect, true, "Q1 was correct");
  assert.strictEqual(resultReview.data.questions[2].isCorrect, false, "Q3 was wrong");
  console.log("  ✅ [PASS] Requirement 4 & 10: Question-wise review and scorecard verified");

  // 7. Test Student Ownership Isolation (Requirement 5)
  // Student B tries to access Student A's result
  const unauthorizedResult = await request(`/tests/attempts/${attempt1Id}/result`, {
    headers: { Authorization: `Bearer ${tokenB}` },
  });
  assert.strictEqual(unauthorizedResult.status === 403 || unauthorizedResult.status === 500, true, "Student B must be denied access to Student A's result");

  // Student B checks history (must be empty)
  const historyB = await request("/tests/attempts/history", {
    headers: { Authorization: `Bearer ${tokenB}` },
  });
  assert.strictEqual(historyB.data.history.length, 0, "Student B must NOT see Student A's history");
  console.log("  ✅ [PASS] Requirement 5: Complete student privacy & ownership isolation enforced");

  // 8. Create and Complete Test 2 with different maximum marks (e.g. 10Q = 40 marks)
  const personalTest2 = await request("/tests/personal/import", {
    method: "POST",
    headers: { Authorization: `Bearer ${tokenA}` },
    body: JSON.stringify({
      title: "Physics & Chemistry Benchmark (10Q)",
      description: "10 question test",
      durationMinutes: 30,
      category: "full_mock",
      questions: Array.from({ length: 10 }, (_, i) => ({
        number: i + 1,
        subject: i < 5 ? "Physics" : "Chemistry",
        chapter: i < 5 ? "Mechanics" : "Organic",
        question: `Question ${i + 1} test problem statement`,
        options: ["Option A", "Option B", "Option C", "Option D"],
        correctAnswer: "A",
      })),
    }),
  });
  const test2Id = personalTest2.data.testId;

  const start2 = await request(`/tests/${test2Id}/start`, {
    method: "POST",
    headers: { Authorization: `Bearer ${tokenA}` },
  });
  const attempt2Id = start2.data.attemptId;
  const qList2 = start2.data.questions;

  // Answer 8 correct, 2 wrong -> Score: (8*4) - (2*1) = 32 - 2 = 30 / 40 (75%)
  const answers2 = {};
  for (let i = 0; i < 8; i++) answers2[qList2[i].id] = "A"; // correct
  answers2[qList2[8].id] = "B"; // wrong
  answers2[qList2[9].id] = "C"; // wrong

  const submit2 = await request(`/tests/attempts/${attempt2Id}/submit`, {
    method: "POST",
    headers: { Authorization: `Bearer ${tokenA}` },
    body: JSON.stringify({ finalAnswers: answers2 }),
  });
  assert.strictEqual(submit2.status, 200, "Submit attempt 2 must succeed");
  assert.strictEqual(submit2.data.score, 30, "Score must be 30");
  assert.strictEqual(submit2.data.maxScore, 40, "Max score must be 40");
  assert.strictEqual(submit2.data.correctCount, 8, "8 correct");
  assert.strictEqual(submit2.data.incorrectCount, 2, "2 wrong");

  // 9. Test Test History Section & Persistence (Requirement 1 & 4)
  const historyFinal = await request("/tests/attempts/history", {
    headers: { Authorization: `Bearer ${tokenA}` },
  });
  assert.strictEqual(historyFinal.data.history.length, 2, "History must contain both attempts");
  // Check newest attempt first:
  assert.strictEqual(Number(historyFinal.data.history[0].attemptId), Number(attempt2Id), "Newest attempt must be first");
  assert.strictEqual(Number(historyFinal.data.history[1].attemptId), Number(attempt1Id), "Older attempt must be second");
  // Check required history fields:
  const hRow = historyFinal.data.history[0];
  assert.ok(hRow.testId, "Must include testId");
  assert.ok(hRow.testTitle, "Must include testTitle");
  assert.ok(hRow.submittedAt, "Must include submittedAt");
  assert.strictEqual(hRow.score, 30, "Must include score");
  assert.strictEqual(hRow.maxScore, 40, "Must include maxScore");
  assert.strictEqual(hRow.percentage, 75, "Must include percentage (75%)");
  assert.strictEqual(hRow.correctCount, 8, "Must include correctCount");
  assert.strictEqual(hRow.incorrectCount, 2, "Must include incorrectCount");
  assert.strictEqual(hRow.unansweredCount, 0, "Must include unansweredCount");
  assert.ok(hRow.subjects, "Must include subject breakdown");
  console.log("  ✅ [PASS] Requirement 1: Test History returns all required fields (newest first)");

  // 10. Test Compare Tests Endpoint with Equal & Unequal Maximum Marks (Requirement 7)
  // Attempt 1: 11 / 20 (55%, scaled 396/720)
  // Attempt 2: 30 / 40 (75%, scaled 540/720)
  const compRes = await request(`/tests/compare?attemptA=${attempt1Id}&attemptB=${attempt2Id}`, {
    headers: { Authorization: `Bearer ${tokenA}` },
  });
  assert.strictEqual(compRes.status, 200, "Compare endpoint must return 200");
  assert.strictEqual(compRes.data.sameMaxScore, false, "sameMaxScore must be false (20 vs 40)");
  assert.strictEqual(compRes.data.percentageDiff, 20, "Percentage difference must be +20% (75% - 55%)");
  assert.strictEqual(compRes.data.scaledScoreDiff, 144, "Scaled 720 difference must be +144 marks (540 - 396)");
  assert.strictEqual(compRes.data.correctDiff, 5, "Correct diff must be +5 (8 - 3)");
  assert.strictEqual(compRes.data.incorrectDiff, 1, "Incorrect diff must be +1 (2 - 1)");
  assert.ok(compRes.data.subjectComparison.Biology, "Subject comparison must include Biology");
  assert.ok(compRes.data.subjectComparison.Physics, "Subject comparison must include Physics");
  assert.ok(compRes.data.subjectComparison.Chemistry, "Subject comparison must include Chemistry");
  console.log("  ✅ [PASS] Requirement 7: Comparison works accurately across unequal maximum marks");

  // Compare endpoint student ownership test: Student B cannot compare Student A's tests
  const unauthComp = await request(`/tests/compare?attemptA=${attempt1Id}&attemptB=${attempt2Id}`, {
    headers: { Authorization: `Bearer ${tokenB}` },
  });
  assert.strictEqual(unauthComp.status === 404 || unauthComp.status === 403, true, "Student B cannot compare Student A's tests");
  console.log("  ✅ [PASS] Requirement 5: Ownership enforced on comparison endpoint");

  // 11. Test Performance Analytics (Requirement 3 & 8)
  const analyticsData = await request("/analytics", {
    headers: { Authorization: `Bearer ${tokenA}` },
  });
  assert.strictEqual(analyticsData.status, 200, "GET /analytics must return 200");
  assert.strictEqual(analyticsData.data.totalAttempts, 2, "Total attempts must be 2");
  assert.strictEqual(analyticsData.data.latestScore, 30, "Latest score must be 30");
  assert.strictEqual(analyticsData.data.latestMaxScore, 40, "Latest max score must be 40");
  assert.strictEqual(analyticsData.data.trend.direction, "improved", "Trend must be 'improved'");
  assert.strictEqual(analyticsData.data.overallBreakdown.totalCorrect, 11, "Total correct must be 3 + 8 = 11");
  assert.strictEqual(analyticsData.data.overallBreakdown.totalIncorrect, 3, "Total incorrect must be 1 + 2 = 3");
  assert.strictEqual(analyticsData.data.overallBreakdown.totalUnanswered, 1, "Total unanswered must be 1 + 0 = 1");
  assert.ok(analyticsData.data.strongestSubject, "Strongest subject must be determined");
  assert.ok(analyticsData.data.scoreTrajectory.length === 2, "Trajectory must have 2 points");
  console.log("  ✅ [PASS] Requirement 3: Performance Analytics verified with trend, breakdown, and trajectory");

  // 12. Test Target Marks Calculation with Non-720 Tests (Requirement 2)
  const goalsWithTests = await request("/goals", {
    headers: { Authorization: `Bearer ${tokenA}` },
  });
  assert.strictEqual(goalsWithTests.status, 200, "GET /goals must return 200");
  assert.strictEqual(goalsWithTests.data.completedTests, 2, "Completed tests must be 2");
  // Best scaled score is 540/720 (from the 75% test)
  assert.strictEqual(goalsWithTests.data.bestScaledScore, 540, "Best scaled score must be 540/720");
  // Score gap: target 680 - 540 = 140 marks needed
  assert.strictEqual(goalsWithTests.data.scoreGap, 140, "Score gap must be 140 marks needed (680 - 540)");
  assert.strictEqual(goalsWithTests.data.targetReached, false, "Target not yet reached (540 < 680)");
  console.log("  ✅ [PASS] Requirement 2: Target marks scaling works correctly without raw score mismatch");

  // Update target to 500 (lower than 540) to verify target achievement banner & message
  const updateGoalsToAchieved = await request("/goals", {
    method: "PUT",
    headers: { Authorization: `Bearer ${tokenA}` },
    body: JSON.stringify({ targetScore: 500 }),
  });
  assert.strictEqual(updateGoalsToAchieved.status, 200);

  const goalsAchieved = await request("/goals", {
    headers: { Authorization: `Bearer ${tokenA}` },
  });
  assert.strictEqual(goalsAchieved.data.targetReached, true, "targetReached must be true when score >= target");
  assert.strictEqual(goalsAchieved.data.scoreGap, 0, "Score gap must be 0 when target reached");
  assert.strictEqual(goalsAchieved.data.achievementPercentage, 100, "Achievement percentage must be 100%");
  console.log("  ✅ [PASS] Requirement 2: Target achievement message and 100% status verified");

  console.log("==========================================================");
  console.log("🎉 ALL 10 UPGRADE REQUIREMENTS PASSED AUTOMATED AUDIT!");
  console.log("==========================================================");
}

runTests().catch((err) => {
  console.error("❌ TEST FAILED:", err);
  process.exit(1);
});
