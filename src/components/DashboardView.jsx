import React from "react";

export default function DashboardView({
  currentUser,
  studentProfile,
  goalsData,
  attemptHistory,
  availableTests,
  onNavigate,
  onViewResult,
}) {
  const latestAttempt = attemptHistory.length > 0 ? attemptHistory[0] : null;
  const bestScore = goalsData?.bestScore ?? (attemptHistory.length > 0 ? Math.max(...attemptHistory.map((a) => a.score)) : 0);
  const avgScore = goalsData?.averageScore ?? (attemptHistory.length > 0 ? Math.round(attemptHistory.reduce((s, a) => s + a.score, 0) / attemptHistory.length) : 0);
  const totalCompleted = goalsData?.completedTests ?? attemptHistory.length;
  const targetScore = studentProfile?.targetScore || goalsData?.targetScore || 650;
  const targetProgress = Math.min(100, Math.round((avgScore / targetScore) * 100));

  // Build SVG Score Progression points from oldest to newest
  const sortedAttempts = [...attemptHistory].reverse();
  const maxPossible = 720;
  const chartHeight = 160;
  const chartWidth = 520;
  const paddingX = 40;
  const paddingY = 24;

  const points = sortedAttempts.map((att, idx) => {
    const x =
      sortedAttempts.length === 1
        ? chartWidth / 2
        : paddingX + (idx / (sortedAttempts.length - 1)) * (chartWidth - paddingX * 2);
    const scoreVal = Math.max(0, Math.min(maxPossible, att.score));
    const y = chartHeight - paddingY - (scoreVal / maxPossible) * (chartHeight - paddingY * 2);
    return { x, y, score: att.score, title: att.testTitle, date: new Date(att.submittedAt).toLocaleDateString() };
  });

  const svgPolyline = points.map((p) => `${p.x},${p.y}`).join(" ");

  return (
    <div className="dashboard-view">
      {/* Welcome Header */}
      <section
        style={{
          background: "linear-gradient(135deg, #1e3a8a, #2563eb)",
          color: "#ffffff",
          borderRadius: 16,
          padding: "28px 32px",
          marginBottom: 24,
          boxShadow: "0 8px 24px rgba(37, 99, 235, 0.18)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 16,
        }}
      >
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
            <span
              style={{
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: 1,
                background: "rgba(255, 255, 255, 0.2)",
                padding: "3px 10px",
                borderRadius: 20,
              }}
            >
              NEET {studentProfile?.targetYear || "2027"} ASPIRANT
            </span>
            <span style={{ fontSize: 13, opacity: 0.85 }}>
              Today: {new Date().toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
            </span>
          </div>
          <h1 style={{ margin: "4px 0 8px", fontSize: 26, fontWeight: 800 }}>
            Welcome back, {currentUser?.name || "Doctor in the making"}! 🩺
          </h1>
          <p style={{ margin: 0, opacity: 0.9, fontSize: 14 }}>
            Your target NEET score is <strong>{goalsData?.targetScore || targetScore}/720</strong>.{" "}
            {goalsData?.targetReached ? (
              <span style={{ color: "#86efac", fontWeight: 700 }}>
                🎉 Congratulations! You have achieved your target score! Set a higher target or take more mocks to maintain your rank.
              </span>
            ) : goalsData?.scoreGap > 0 ? (
              `You are ${goalsData.scoreGap} marks away from your target score!`
            ) : (
              "Keep practicing consistently to maintain exam speed and accuracy."
            )}
          </p>
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button
            className="primary-button"
            style={{ background: "#ffffff", color: "#1e3a8a", fontWeight: 700 }}
            onClick={() => onNavigate("startTest")}
          >
            ⏱️ Start Mock Test
          </button>
          <button
            className="secondary-button"
            style={{ border: "1px solid rgba(255,255,255,0.4)", color: "#fff", background: "transparent" }}
            onClick={() => onNavigate("goals")}
          >
            🎯 Update Goals
          </button>
          {attemptHistory.length >= 2 && (
            <button
              className="secondary-button"
              style={{ border: "1px solid rgba(255,255,255,0.4)", color: "#fff", background: "transparent" }}
              onClick={() => onNavigate("compare")}
            >
              ⚖️ Compare Tests
            </button>
          )}
        </div>
      </section>

      {/* Target Achievement Banner if reached */}
      {goalsData?.targetReached && (
        <div
          style={{
            background: "linear-gradient(135deg, #059669, #10b981)",
            color: "#ffffff",
            padding: "16px 20px",
            borderRadius: 12,
            marginBottom: 20,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: 12,
            boxShadow: "0 4px 14px rgba(16, 185, 129, 0.25)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ fontSize: 28 }}>🎯</span>
            <div>
              <strong style={{ fontSize: 16 }}>Target Score Reached!</strong>
              <div style={{ fontSize: 13, opacity: 0.95 }}>
                Your best mock performance meets your target goal of {goalsData.targetScore} marks. Keep challenging yourself!
              </div>
            </div>
          </div>
          <button
            className="secondary-button"
            style={{ background: "#ffffff", color: "#065f46", fontWeight: 700, fontSize: 12 }}
            onClick={() => onNavigate("goals")}
          >
            Raise Target Goal →
          </button>
        </div>
      )}

      {/* Top Metric Cards */}
      <div className="kpi-grid">
        <div className="kpi-card">
          <span className="kpi-label">Latest Score</span>
          <div className="kpi-value" style={{ color: latestAttempt ? "#1e3a8a" : "#94a3b8" }}>
            {latestAttempt ? latestAttempt.score : "—"}
            <span style={{ fontSize: 14, fontWeight: 500, color: "#64748b" }}>
              {latestAttempt ? ` / ${latestAttempt.maxScore}` : ""}
            </span>
          </div>
          <span className="kpi-subtext" style={{ color: "#64748b" }}>
            {latestAttempt
              ? `${latestAttempt.accuracy}% accuracy (${Math.round((latestAttempt.score / latestAttempt.maxScore) * 100)}%)`
              : "No tests completed"}
          </span>
        </div>

        <div className="kpi-card">
          <span className="kpi-label">Best Score</span>
          <div className="kpi-value" style={{ color: bestScore > 0 ? "#10b981" : "#94a3b8" }}>
            {goalsData?.bestScore != null ? goalsData.bestScore : (bestScore > 0 ? bestScore : "—")}
            <span style={{ fontSize: 14, fontWeight: 500, color: "#64748b" }}>
              {goalsData?.bestMaxScore ? ` / ${goalsData.bestMaxScore}` : (bestScore > 0 ? " / 720" : "")}
            </span>
          </div>
          <span className="kpi-subtext" style={{ color: "#10b981" }}>
            {goalsData?.bestPercentage != null
              ? `${goalsData.bestPercentage}% (${goalsData.bestScaledScore}/720 scaled)`
              : bestScore >= 650
              ? "AIIMS Tier Score!"
              : bestScore > 0
              ? "Keep pushing for 650+"
              : "Take a test to set best"}
          </span>
        </div>

        <div className="kpi-card">
          <span className="kpi-label">Average Score</span>
          <div className="kpi-value" style={{ color: avgScore > 0 ? "#0f172a" : "#94a3b8" }}>
            {avgScore > 0 ? avgScore : "—"}
          </div>
          <span className="kpi-subtext" style={{ color: "#64748b" }}>
            Across {totalCompleted} test{totalCompleted === 1 ? "" : "s"}
          </span>
        </div>

        <div className="kpi-card">
          <span className="kpi-label">Tests Completed</span>
          <div className="kpi-value" style={{ color: "#0f172a" }}>
            {totalCompleted}
          </div>
          <span className="kpi-subtext" style={{ color: "#3b82f6" }}>
            {availableTests.length} tests available
          </span>
        </div>

        <div className="kpi-card">
          <span className="kpi-label">Target Progress</span>
          <div className="kpi-value" style={{ color: "#2563eb" }}>
            {goalsData?.achievementPercentage != null ? `${goalsData.achievementPercentage}%` : `${targetProgress}%`}
          </div>
          <div className="progress-bar-track" style={{ marginTop: 6 }}>
            <div
              className="progress-bar-fill"
              style={{
                width: `${goalsData?.achievementPercentage != null ? goalsData.achievementPercentage : targetProgress}%`,
                background:
                  (goalsData?.achievementPercentage || targetProgress) >= 80 ? "#10b981" : "#2563eb",
              }}
            />
          </div>
        </div>
      </div>

      {/* Main Grid: Score Trend + Subject Mastery */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))", gap: 20, marginBottom: 24 }}>
        {/* Score Trend Card */}
        <div style={{ background: "#ffffff", padding: 22, borderRadius: 14, border: "1px solid #e2e8f0", boxShadow: "0 2px 8px rgba(0,0,0,0.04)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "#0f172a" }}>
              📈 Score Progression Trajectory
            </h3>
            <span style={{ fontSize: 12, color: "#64748b", fontWeight: 600 }}>
              Max: 720 Marks
            </span>
          </div>

          {sortedAttempts.length > 0 ? (
            <div>
              <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} style={{ width: "100%", height: "auto", overflow: "visible" }}>
                {/* Horizontal reference grid lines */}
                <line x1={paddingX} y1={paddingY} x2={chartWidth - paddingX} y2={paddingY} stroke="#e2e8f0" strokeDasharray="3 3" />
                <text x={paddingX - 8} y={paddingY + 4} fontSize="10" fill="#94a3b8" textAnchor="end">720</text>

                <line x1={paddingX} y1={chartHeight / 2} x2={chartWidth - paddingX} y2={chartHeight / 2} stroke="#e2e8f0" strokeDasharray="3 3" />
                <text x={paddingX - 8} y={chartHeight / 2 + 4} fontSize="10" fill="#94a3b8" textAnchor="end">360</text>

                <line x1={paddingX} y1={chartHeight - paddingY} x2={chartWidth - paddingX} y2={chartHeight - paddingY} stroke="#cbd5e1" />
                <text x={paddingX - 8} y={chartHeight - paddingY + 4} fontSize="10" fill="#94a3b8" textAnchor="end">0</text>

                {/* Score Target line */}
                {targetScore && (
                  <>
                    <line
                      x1={paddingX}
                      y1={chartHeight - paddingY - (targetScore / maxPossible) * (chartHeight - paddingY * 2)}
                      x2={chartWidth - paddingX}
                      y2={chartHeight - paddingY - (targetScore / maxPossible) * (chartHeight - paddingY * 2)}
                      stroke="#ef4444"
                      strokeWidth="1.5"
                      strokeDasharray="4 4"
                    />
                    <text
                      x={chartWidth - paddingX + 6}
                      y={chartHeight - paddingY - (targetScore / maxPossible) * (chartHeight - paddingY * 2) + 3}
                      fontSize="10"
                      fill="#ef4444"
                      fontWeight="bold"
                    >
                      Target ({targetScore})
                    </text>
                  </>
                )}

                {/* Polyline */}
                {sortedAttempts.length > 1 && (
                  <polyline
                    fill="none"
                    stroke="#2563eb"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    points={svgPolyline}
                  />
                )}

                {/* Data points */}
                {points.map((p, idx) => (
                  <g key={idx}>
                    <circle cx={p.x} cy={p.y} r="5" fill="#2563eb" stroke="#ffffff" strokeWidth="2" />
                    <text x={p.x} y={p.y - 10} fontSize="11" fontWeight="bold" fill="#1e3a8a" textAnchor="middle">
                      {p.score}
                    </text>
                    <text x={p.x} y={chartHeight - 6} fontSize="10" fill="#64748b" textAnchor="middle">
                      #{idx + 1}
                    </text>
                  </g>
                ))}
              </svg>
            </div>
          ) : (
            <div style={{ textAlign: "center", padding: "36px 16px", color: "#64748b" }}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>📊</div>
              <strong style={{ display: "block", color: "#0f172a" }}>No mock attempts recorded yet</strong>
              <span style={{ fontSize: 13 }}>Complete your first mock test to see your score trajectory.</span>
              <div style={{ marginTop: 14 }}>
                <button className="primary-button" style={{ fontSize: 13, padding: "8px 16px" }} onClick={() => onNavigate("startTest")}>
                  Start First Mock Test
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Subject-Wise Mastery Cards */}
        <div style={{ background: "#ffffff", padding: 22, borderRadius: 14, border: "1px solid #e2e8f0", boxShadow: "0 2px 8px rgba(0,0,0,0.04)", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "#0f172a" }}>
                🧬 Subject Mastery Summary
              </h3>
              <button
                className="secondary-button"
                style={{ fontSize: 12, padding: "4px 10px" }}
                onClick={() => onNavigate("analytics")}
              >
                Detailed Analytics →
              </button>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {/* Biology */}
              <div style={{ border: "1px solid #e2e8f0", borderRadius: 10, padding: "12px 14px", background: "#f8fafc" }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                  <div>
                    <strong style={{ color: "#047857", fontSize: 14 }}>Biology (Botany + Zoology)</strong>
                    <div style={{ fontSize: 12, color: "#64748b" }}>Max: 360 Marks • Target: {goalsData?.targetBiology || 320}</div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <strong style={{ fontSize: 15, color: "#0f172a" }}>
                      {goalsData?.biologyAverage ? `${goalsData.biologyAverage} avg` : "—"}
                    </strong>
                  </div>
                </div>
                <div className="progress-bar-track">
                  <div
                    className="progress-bar-fill"
                    style={{
                      width: `${Math.min(100, Math.round(((goalsData?.biologyAverage || 0) / 360) * 100))}%`,
                      background: "#10b981",
                    }}
                  />
                </div>
              </div>

              {/* Physics */}
              <div style={{ border: "1px solid #e2e8f0", borderRadius: 10, padding: "12px 14px", background: "#f8fafc" }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                  <div>
                    <strong style={{ color: "#b45309", fontSize: 14 }}>Physics</strong>
                    <div style={{ fontSize: 12, color: "#64748b" }}>Max: 180 Marks • Target: {goalsData?.targetPhysics || 140}</div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <strong style={{ fontSize: 15, color: "#0f172a" }}>
                      {goalsData?.physicsAverage ? `${goalsData.physicsAverage} avg` : "—"}
                    </strong>
                  </div>
                </div>
                <div className="progress-bar-track">
                  <div
                    className="progress-bar-fill"
                    style={{
                      width: `${Math.min(100, Math.round(((goalsData?.physicsAverage || 0) / 180) * 100))}%`,
                      background: "#f59e0b",
                    }}
                  />
                </div>
              </div>

              {/* Chemistry */}
              <div style={{ border: "1px solid #e2e8f0", borderRadius: 10, padding: "12px 14px", background: "#f8fafc" }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                  <div>
                    <strong style={{ color: "#86198f", fontSize: 14 }}>Chemistry</strong>
                    <div style={{ fontSize: 12, color: "#64748b" }}>Max: 180 Marks • Target: {goalsData?.targetChemistry || 140}</div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <strong style={{ fontSize: 15, color: "#0f172a" }}>
                      {goalsData?.chemistryAverage ? `${goalsData.chemistryAverage} avg` : "—"}
                    </strong>
                  </div>
                </div>
                <div className="progress-bar-track">
                  <div
                    className="progress-bar-fill"
                    style={{
                      width: `${Math.min(100, Math.round(((goalsData?.chemistryAverage || 0) / 180) * 100))}%`,
                      background: "#a855f7",
                    }}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Test History Section on Dashboard */}
      <section style={{ background: "#ffffff", padding: 22, borderRadius: 14, border: "1px solid #e2e8f0", boxShadow: "0 2px 8px rgba(0,0,0,0.04)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 10 }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: "#0f172a" }}>
              📜 Test History
            </h3>
            <span style={{ fontSize: 13, color: "#64748b" }}>
              Your completed mock test attempts (newest first)
            </span>
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            {attemptHistory.length >= 2 && (
              <button
                className="secondary-button"
                style={{ fontSize: 13, padding: "6px 12px" }}
                onClick={() => onNavigate("compare")}
              >
                ⚖️ Compare Tests
              </button>
            )}
            <button
              className="secondary-button"
              style={{ fontSize: 13, padding: "6px 12px" }}
              onClick={() => onNavigate("history")}
            >
              View Complete Archive ({attemptHistory.length}) →
            </button>
          </div>
        </div>

        {attemptHistory.length > 0 ? (
          <div style={{ overflowX: "auto" }}>
            <table className="custom-table">
              <thead>
                <tr>
                  <th>Test ID & Name</th>
                  <th>Completion Date & Time</th>
                  <th>Score & %</th>
                  <th>Questions Breakdown</th>
                  <th>Subject Marks</th>
                  <th>Time Taken</th>
                  <th>Max Marks</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {attemptHistory.slice(0, 5).map((att) => {
                  const pct = att.maxScore > 0 ? ((att.score / att.maxScore) * 100).toFixed(1) : 0;
                  const bioScore = att.subjects?.Biology?.score != null ? `${att.subjects.Biology.score}` : "—";
                  const phyScore = att.subjects?.Physics?.score != null ? `${att.subjects.Physics.score}` : "—";
                  const chemScore = att.subjects?.Chemistry?.score != null ? `${att.subjects.Chemistry.score}` : "—";

                  return (
                    <tr key={att.attemptId}>
                      <td>
                        <div style={{ fontWeight: 700, color: "#0f172a" }}>{att.testTitle}</div>
                        <span style={{ fontSize: 11, color: "#64748b" }}>Attempt #{att.attemptId}</span>
                      </td>
                      <td>
                        <div>{new Date(att.submittedAt).toLocaleDateString()}</div>
                        <span style={{ fontSize: 11, color: "#64748b" }}>
                          {new Date(att.submittedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        </span>
                      </td>
                      <td>
                        <span style={{ fontWeight: 800, color: "#1e3a8a", fontSize: 15 }}>{att.score}</span>
                        <span style={{ color: "#64748b", fontSize: 13 }}> / {att.maxScore}</span>
                        <div style={{ fontSize: 12, fontWeight: 700, color: Number(pct) >= 75 ? "#10b981" : Number(pct) >= 50 ? "#2563eb" : "#ef4444" }}>
                          {pct}%
                        </div>
                      </td>
                      <td>
                        <div style={{ fontSize: 12, whiteSpace: "nowrap" }}>
                          <span style={{ color: "#15803d", fontWeight: 700 }} title="Correct (+4)">✓ {att.correctCount}</span>{" • "}
                          <span style={{ color: "#b91c1c", fontWeight: 700 }} title="Incorrect (-1)">✗ {att.incorrectCount}</span>{" • "}
                          <span style={{ color: "#64748b" }} title="Unanswered">⚪ {att.unansweredCount}</span>
                        </div>
                        <div style={{ fontSize: 11, color: "#64748b" }}>
                          Acc: {att.accuracy}%
                        </div>
                      </td>
                      <td>
                        <div style={{ fontSize: 12, whiteSpace: "nowrap" }}>
                          <span style={{ color: "#047857" }} title="Biology Marks">Bio: {bioScore}</span>{" • "}
                          <span style={{ color: "#b45309" }} title="Physics Marks">Phy: {phyScore}</span>{" • "}
                          <span style={{ color: "#86198f" }} title="Chemistry Marks">Chem: {chemScore}</span>
                        </div>
                      </td>
                      <td>
                        <span style={{ fontSize: 13, fontWeight: 600 }}>
                          {Math.round((att.timeTakenSeconds || 0) / 60)} mins
                        </span>
                      </td>
                      <td>
                        <span style={{ fontSize: 13, color: "#475569", fontWeight: 600 }}>
                          {att.maxScore} marks
                        </span>
                      </td>
                      <td>
                        <button
                          className="secondary-button"
                          style={{ fontSize: 12, padding: "5px 12px", whiteSpace: "nowrap" }}
                          onClick={() => onViewResult(att.attemptId)}
                        >
                          Scorecard & Review
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div style={{ textAlign: "center", padding: "32px 16px", color: "#64748b" }}>
            <p style={{ margin: "0 0 12px" }}>You haven't completed any mock tests yet.</p>
            <button className="primary-button" onClick={() => onNavigate("startTest")}>
              Choose a Test & Start Now
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
