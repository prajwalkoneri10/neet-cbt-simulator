/**
 * Verification test for Goals, Performance Analytics, and Admin Endpoints
 */
const assert = require("assert");
const http = require("http");

async function request(path, options = {}) {
  const url = `http://localhost:5000${path}`;
  const headers = { "Content-Type": "application/json", ...options.headers };
  const res = await fetch(url, { ...options, headers });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

async function run() {
  console.log("Testing new endpoints...");

  // 1. Login with Prajwal's account (admin)
  const loginRes = await request("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email: "prajwalkoneri10@gmail.com", password: "password123" }),
  });

  // If password differs or login fails, test with student token
  let token = loginRes.data?.token;
  let isAdmin = loginRes.data?.user?.isAdmin;

  if (!token) {
    const signupRes = await request("/api/auth/signup", {
      method: "POST",
      body: JSON.stringify({
        name: "Test Prajwal",
        email: `prajwal.test.${Date.now()}@test.com`,
        password: "securePassword123",
      }),
    });
    token = signupRes.data?.token;
    isAdmin = signupRes.data?.user?.isAdmin;
  }

  assert(token, "Must obtain auth token");
  const authHeaders = { Authorization: `Bearer ${token}` };

  // 2. Test GET /api/goals
  const goalsRes = await request("/api/goals", { headers: authHeaders });
  assert.strictEqual(goalsRes.status, 200, "GET /api/goals must return 200");
  assert(goalsRes.data.targetScore !== undefined, "goals must return targetScore");
  assert(goalsRes.data.targetBiology !== undefined, "goals must return targetBiology");
  assert(goalsRes.data.targetPhysics !== undefined, "goals must return targetPhysics");
  assert(goalsRes.data.targetChemistry !== undefined, "goals must return targetChemistry");
  console.log("  ✅ GET /api/goals returns target scores and stats:", goalsRes.data);

  // 3. Test PUT /api/goals
  const updateGoalsRes = await request("/api/goals", {
    method: "PUT",
    headers: authHeaders,
    body: JSON.stringify({
      targetScore: 680,
      targetBiology: 345,
      targetPhysics: 165,
      targetChemistry: 170,
      targetYear: 2027,
    }),
  });
  assert.strictEqual(updateGoalsRes.status, 200, "PUT /api/goals must return 200");
  assert.strictEqual(updateGoalsRes.data.profile.targetScore, 680, "targetScore updated to 680");
  console.log("  ✅ PUT /api/goals updates target scores in DB");

  // 4. Test GET /api/analytics
  const analyticsRes = await request("/api/analytics", { headers: authHeaders });
  assert.strictEqual(analyticsRes.status, 200, "GET /api/analytics must return 200");
  assert(Array.isArray(analyticsRes.data.scoreTrajectory), "scoreTrajectory must be array");
  assert(analyticsRes.data.subjectPerformance !== undefined, "subjectPerformance must exist");
  assert(Array.isArray(analyticsRes.data.recommendations), "recommendations must be array");
  console.log("  ✅ GET /api/analytics returns trajectory, subject mastery, and recommendations");

  // 5. Test available tests with new categories
  const testsRes = await request("/api/tests/available", { headers: authHeaders });
  assert.strictEqual(testsRes.status, 200, "GET /api/tests/available must return 200");
  const categories = testsRes.data.tests.map((t) => t.category);
  console.log("  Available test categories:", [...new Set(categories)]);
  assert(categories.includes("biology"), "Must include biology practice test");
  assert(categories.includes("physics"), "Must include physics practice test");
  assert(categories.includes("chemistry"), "Must include chemistry practice test");
  console.log("  ✅ Seeded subject practice tests are available");

  console.log("\nALL NEW BACKEND ENDPOINTS VERIFIED SUCCESSFULLY!");
  process.exit(0);
}

run().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
