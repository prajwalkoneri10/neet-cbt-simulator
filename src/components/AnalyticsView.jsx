import React, { useEffect, useState } from "react";
import api from "../api/client";

export default function AnalyticsView({ onNavigate }) {
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    fetchAnalytics();
  }, []);

  const fetchAnalytics = async () => {
    setLoading(true);
    setError("");
    try {
      const data = await api.analytics.get();
      setAnalytics(data);
    } catch (err) {
      setError(err.message || "Failed to load performance analytics.");
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div style={{ textAlign: "center", padding: "60px 20px", color: "#64748b" }}>
        <div style={{ fontSize: 36, marginBottom: 12 }}>📈</div>
        <p>Crunching your NEET exam analytics and performance data...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ background: "#fee2e2", border: "1px solid #fca5a5", color: "#b91c1c", padding: 20, borderRadius: 12, margin: 20 }}>
        <p style={{ margin: 0 }}>{error}</p>
        <button className="primary-button" style={{ marginTop: 12 }} onClick={fetchAnalytics}>
          Try Again
        </button>
      </div>
    );
  }

  const {
    totalAttempts = 0,
    scoreTrajectory = [],
    subjectPerformance = {},
    strongestSubject,
    weakestSubject,
    chapters = [],
    recommendations = [],
  } = analytics || {};

  // Build SVG points for trajectory
  const maxPossible = 720;
  const chartHeight = 180;
  const chartWidth = 600;
  const paddingX = 40;
  const paddingY = 24;

  const points = scoreTrajectory.map((att, idx) => {
    const x =
      scoreTrajectory.length === 1
        ? chartWidth / 2
        : paddingX + (idx / (scoreTrajectory.length - 1)) * (chartWidth - paddingX * 2);
    const scoreVal = Math.max(0, Math.min(maxPossible, att.score));
    const y = chartHeight - paddingY - (scoreVal / maxPossible) * (chartHeight - paddingY * 2);
    return { x, y, score: att.score, title: att.testTitle, date: new Date(att.submittedAt).toLocaleDateString() };
  });

  const svgPolyline = points.map((p) => `${p.x},${p.y}`).join(" ");

  return (
    <div className="analytics-view">
      {/* Header */}
      <section
        style={{
          background: "#ffffff",
          border: "1px solid #e2e8f0",
          borderRadius: 14,
          padding: "24px 28px",
          marginBottom: 24,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 16,
          boxShadow: "0 2px 8px rgba(0,0,0,0.03)",
        }}
      >
        <div>
          <span style={{ fontSize: 11, fontWeight: 700, color: "#2563eb", letterSpacing: 1, textTransform: "uppercase" }}>
            PERFORMANCE INTELLIGENCE
          </span>
          <h1 style={{ margin: "4px 0 6px", fontSize: 24, fontWeight: 800, color: "#0f172a" }}>
            Comprehensive Performance Analytics
          </h1>
          <p style={{ margin: 0, color: "#64748b", fontSize: 14 }}>
            Evidence-based insights into your subject mastery, error patterns, accuracy, and chapter readiness.
          </p>
        </div>

        <button className="primary-button" onClick={() => onNavigate("startTest")}>
          ⏱️ Take Practice Test
        </button>
      </section>

      {/* Strongest vs Weakest Subject Spotlight */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 16, marginBottom: 24 }}>
        {/* Strongest Subject */}
        <div style={{ background: "#ffffff", border: "1px solid #e2e8f0", borderLeft: "5px solid #10b981", borderRadius: 12, padding: "20px 22px", boxShadow: "0 2px 6px rgba(0,0,0,0.03)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
            <span style={{ fontSize: 18 }}>🏆</span>
            <span style={{ fontSize: 12, fontWeight: 700, color: "#047857", textTransform: "uppercase" }}>
              Strongest Subject
            </span>
          </div>
          <div style={{ fontSize: 22, fontWeight: 800, color: "#0f172a", marginBottom: 4 }}>
            {strongestSubject ? strongestSubject.name : "Not enough data"}
          </div>
          <p style={{ margin: 0, fontSize: 13, color: "#64748b" }}>
            {strongestSubject
              ? `Consistently your highest accuracy section at ${strongestSubject.accuracy}%. Average score: ${strongestSubject.avgScore} marks.`
              : "Complete more mock tests to compute strongest subject."}
          </p>
        </div>

        {/* Weakest Subject */}
        <div style={{ background: "#ffffff", border: "1px solid #e2e8f0", borderLeft: "5px solid #ef4444", borderRadius: 12, padding: "20px 22px", boxShadow: "0 2px 6px rgba(0,0,0,0.03)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
            <span style={{ fontSize: 18 }}>⚠️</span>
            <span style={{ fontSize: 12, fontWeight: 700, color: "#b91c1c", textTransform: "uppercase" }}>
              Area for Improvement
            </span>
          </div>
          <div style={{ fontSize: 22, fontWeight: 800, color: "#0f172a", marginBottom: 4 }}>
            {weakestSubject ? weakestSubject.name : "Not enough data"}
          </div>
          <p style={{ margin: 0, fontSize: 13, color: "#64748b" }}>
            {weakestSubject
              ? `Currently experiencing lowest accuracy at ${weakestSubject.accuracy}%. Prioritize daily practice in this subject.`
              : "Complete more mock tests to highlight focus areas."}
          </p>
        </div>
      </div>

      {/* Trajectory Chart */}
      <section style={{ background: "#ffffff", padding: 24, borderRadius: 14, border: "1px solid #e2e8f0", marginBottom: 24, boxShadow: "0 2px 8px rgba(0,0,0,0.03)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: "#0f172a" }}>
              Overall Score Progression Trajectory
            </h3>
            <span style={{ fontSize: 13, color: "#64748b" }}>
              Historical mock scores plotted over time
            </span>
          </div>
          <span style={{ fontSize: 13, fontWeight: 700, color: "#2563eb" }}>
            {scoreTrajectory.length} Tests Recorded
          </span>
        </div>

        {scoreTrajectory.length > 0 ? (
          <div>
            <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} style={{ width: "100%", height: "auto", overflow: "visible" }}>
              {/* Lines */}
              <line x1={paddingX} y1={paddingY} x2={chartWidth - paddingX} y2={paddingY} stroke="#e2e8f0" strokeDasharray="3 3" />
              <text x={paddingX - 8} y={paddingY + 4} fontSize="10" fill="#94a3b8" textAnchor="end">720</text>

              <line x1={paddingX} y1={chartHeight / 2} x2={chartWidth - paddingX} y2={chartHeight / 2} stroke="#e2e8f0" strokeDasharray="3 3" />
              <text x={paddingX - 8} y={chartHeight / 2 + 4} fontSize="10" fill="#94a3b8" textAnchor="end">360</text>

              <line x1={paddingX} y1={chartHeight - paddingY} x2={chartWidth - paddingX} y2={chartHeight - paddingY} stroke="#cbd5e1" />
              <text x={paddingX - 8} y={chartHeight - paddingY + 4} fontSize="10" fill="#94a3b8" textAnchor="end">0</text>

              {scoreTrajectory.length > 1 && (
                <polyline
                  fill="none"
                  stroke="#2563eb"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  points={svgPolyline}
                />
              )}

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
          <div style={{ textAlign: "center", padding: "30px", color: "#64748b" }}>
            No tests completed yet.
          </div>
        )}
      </section>

      {/* Subject Performance Breakdown */}
      <section style={{ background: "#ffffff", padding: 24, borderRadius: 14, border: "1px solid #e2e8f0", marginBottom: 24, boxShadow: "0 2px 8px rgba(0,0,0,0.03)" }}>
        <h3 style={{ margin: "0 0 16px", fontSize: 17, fontWeight: 700, color: "#0f172a" }}>
          Subject Mastery & Accuracy Breakdown
        </h3>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 18 }}>
          {["Biology", "Physics", "Chemistry"].map((subName) => {
            const data = subjectPerformance[subName] || {
              name: subName,
              totalQuestions: 0,
              attempted: 0,
              correct: 0,
              wrong: 0,
              unanswered: 0,
              accuracy: 0,
              averageScore: 0,
              maxScorePossible: subName === "Biology" ? 360 : 180,
            };

            const isBio = subName === "Biology";
            const isPhys = subName === "Physics";
            const themeColor = isBio ? "#10b981" : isPhys ? "#f59e0b" : "#8b5cf6";

            return (
              <div
                key={subName}
                style={{
                  border: "1px solid #e2e8f0",
                  borderRadius: 12,
                  padding: 18,
                  background: "#f8fafc",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                  <div>
                    <h4 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: "#0f172a" }}>{subName}</h4>
                    <span style={{ fontSize: 12, color: "#64748b" }}>Max: {data.maxScorePossible} Marks</span>
                  </div>
                  <span
                    style={{
                      fontSize: 16,
                      fontWeight: 800,
                      color: themeColor,
                      background: "#fff",
                      padding: "4px 10px",
                      borderRadius: 20,
                      border: "1px solid #e2e8f0",
                    }}
                  >
                    {data.accuracy}% Acc
                  </span>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, fontSize: 13, marginBottom: 14 }}>
                  <div>Total Attempted: <strong>{data.attempted}</strong></div>
                  <div>Average Marks: <strong>{data.averageScore}</strong></div>
                  <div style={{ color: "#16a34a" }}>Correct (+4): <strong>{data.correct}</strong></div>
                  <div style={{ color: "#dc2626" }}>Wrong (-1): <strong>{data.wrong}</strong></div>
                </div>

                <div className="progress-bar-track">
                  <div
                    className="progress-bar-fill"
                    style={{
                      width: `${data.accuracy}%`,
                      background: themeColor,
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* AI & Diagnostic Recommendations */}
      {recommendations.length > 0 && (
        <section style={{ background: "#ffffff", padding: 24, borderRadius: 14, border: "1px solid #e2e8f0", marginBottom: 24, boxShadow: "0 2px 8px rgba(0,0,0,0.03)" }}>
          <h3 style={{ margin: "0 0 16px", fontSize: 17, fontWeight: 700, color: "#0f172a" }}>
            💡 Actionable Recommendations
          </h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {recommendations.map((rec, idx) => (
              <div key={idx} className={`rec-card ${rec.type || "focus"}`}>
                <div style={{ fontSize: 24 }}>{rec.type === "strength" ? "⭐" : rec.type === "chapter" ? "📖" : "🎯"}</div>
                <div>
                  <strong style={{ display: "block", color: "#0f172a", fontSize: 15, marginBottom: 4 }}>
                    {rec.title}
                  </strong>
                  <p style={{ margin: 0, color: "#475569", fontSize: 13, lineHeight: 1.5 }}>
                    {rec.detail}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Chapter-Level Insights Table */}
      {chapters.length > 0 && (
        <section style={{ background: "#ffffff", padding: 24, borderRadius: 14, border: "1px solid #e2e8f0", boxShadow: "0 2px 8px rgba(0,0,0,0.03)" }}>
          <h3 style={{ margin: "0 0 16px", fontSize: 17, fontWeight: 700, color: "#0f172a" }}>
            Chapter-Level Mastery & Accuracy Table
          </h3>
          <div style={{ overflowX: "auto" }}>
            <table className="custom-table" style={{ border: "none" }}>
              <thead>
                <tr>
                  <th>Subject</th>
                  <th>Chapter</th>
                  <th>Questions Tested</th>
                  <th>Correct</th>
                  <th>Accuracy</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {chapters.map((ch, idx) => (
                  <tr key={idx}>
                    <td><strong>{ch.subject}</strong></td>
                    <td>{ch.chapter}</td>
                    <td>{ch.attempted}</td>
                    <td style={{ color: "#16a34a", fontWeight: 700 }}>{ch.correct}</td>
                    <td><strong>{ch.accuracy}%</strong></td>
                    <td>
                      <span
                        style={{
                          fontSize: 12,
                          fontWeight: 700,
                          padding: "3px 8px",
                          borderRadius: 4,
                          background: ch.status === "Weak" ? "#fee2e2" : ch.status === "Strong" ? "#dcfce7" : "#eff6ff",
                          color: ch.status === "Weak" ? "#b91c1c" : ch.status === "Strong" ? "#15803d" : "#1d4ed8",
                        }}
                      >
                        {ch.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
