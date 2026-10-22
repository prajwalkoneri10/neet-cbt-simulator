import React from "react";

export default function ResultView({ testResult, onNavigate }) {
  if (!testResult) return null;

  const r = testResult;

  return (
    <div className="result-view" style={{ maxWidth: 1040, margin: "0 auto", padding: "28px 16px" }}>
      {/* Top Banner */}
      <section
        style={{
          background: "linear-gradient(135deg, #1e3a8a, #2563eb)",
          color: "#ffffff",
          padding: "36px 32px",
          borderRadius: 16,
          textAlign: "center",
          marginBottom: 24,
          boxShadow: "0 10px 30px rgba(37, 99, 235, 0.22)",
        }}
      >
        <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: 1.5, opacity: 0.9, textTransform: "uppercase" }}>
          EXAMINATION REPORT CARD • {r.testTitle}
        </span>
        <div style={{ fontSize: 52, fontWeight: 800, margin: "8px 0" }}>
          {r.score} <span style={{ fontSize: 24, fontWeight: 400, opacity: 0.85 }}>/ {r.maxScore}</span>
        </div>
        <p style={{ margin: 0, opacity: 0.9, fontSize: 15 }}>
          Accuracy: <strong>{r.accuracy}%</strong> • Total Questions: <strong>{r.totalQuestions}</strong> •{" "}
          Duration: <strong>{Math.round((r.timeTakenSeconds || 0) / 60)} minutes</strong>
        </p>
      </section>

      {/* KPI Stats */}
      <div className="kpi-grid" style={{ marginBottom: 24 }}>
        <div className="kpi-card">
          <span className="kpi-label">Attempted</span>
          <div className="kpi-value" style={{ color: "#1e3a8a" }}>{r.attemptedCount}</div>
          <span className="kpi-subtext" style={{ color: "#64748b" }}>of {r.totalQuestions} total</span>
        </div>
        <div className="kpi-card">
          <span className="kpi-label">Correct (+4)</span>
          <div className="kpi-value" style={{ color: "#10b981" }}>{r.correctCount}</div>
          <span className="kpi-subtext" style={{ color: "#10b981" }}>+{r.correctCount * 4} marks</span>
        </div>
        <div className="kpi-card">
          <span className="kpi-label">Negative (-1)</span>
          <div className="kpi-value" style={{ color: "#ef4444" }}>{r.incorrectCount}</div>
          <span className="kpi-subtext" style={{ color: "#ef4444" }}>-{r.incorrectCount} negative</span>
        </div>
        <div className="kpi-card">
          <span className="kpi-label">Unanswered (0)</span>
          <div className="kpi-value" style={{ color: "#64748b" }}>{r.unansweredCount}</div>
          <span className="kpi-subtext" style={{ color: "#64748b" }}>0 marks change</span>
        </div>
      </div>

      {/* Subject Breakdown */}
      {r.subjects && Object.keys(r.subjects).length > 0 && (
        <section
          style={{
            background: "#ffffff",
            padding: 24,
            borderRadius: 14,
            border: "1px solid #e2e8f0",
            marginBottom: 24,
            boxShadow: "0 2px 8px rgba(0,0,0,0.03)",
          }}
        >
          <h3 style={{ margin: "0 0 16px", fontSize: 17, fontWeight: 800, color: "#0f172a" }}>
            Subject Breakdown
          </h3>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 16 }}>
            {Object.entries(r.subjects).map(([subName, s]) => (
              <div
                key={subName}
                style={{
                  border: "1px solid #e2e8f0",
                  borderRadius: 10,
                  padding: 16,
                  background: "#f8fafc",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                  <strong style={{ fontSize: 15, color: "#0f172a" }}>{subName}</strong>
                  <span style={{ fontWeight: 800, color: "#1e3a8a", fontSize: 16 }}>{s.score} marks</span>
                </div>
                <div style={{ fontSize: 13, color: "#64748b", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4 }}>
                  <div>Total: {s.total}</div>
                  <div>Attempted: {s.attempted}</div>
                  <div style={{ color: "#16a34a" }}>Correct (+4): {s.correct}</div>
                  <div style={{ color: "#dc2626" }}>Wrong (-1): {s.wrong}</div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Chapter Breakdown */}
      {r.chapters && r.chapters.length > 0 && (
        <section
          style={{
            background: "#ffffff",
            padding: 24,
            borderRadius: 14,
            border: "1px solid #e2e8f0",
            marginBottom: 24,
            boxShadow: "0 2px 8px rgba(0,0,0,0.03)",
          }}
        >
          <h3 style={{ margin: "0 0 16px", fontSize: 17, fontWeight: 800, color: "#0f172a" }}>
            Chapter Mastery & Weak Areas
          </h3>
          <div style={{ overflowX: "auto" }}>
            <table className="custom-table" style={{ border: "none" }}>
              <thead>
                <tr>
                  <th>Subject</th>
                  <th>Chapter</th>
                  <th>Attempted</th>
                  <th>Correct</th>
                  <th>Accuracy</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {r.chapters.map((ch, idx) => (
                  <tr key={idx}>
                    <td>{ch.subject}</td>
                    <td><strong>{ch.chapter}</strong></td>
                    <td>{ch.attempted}/{ch.total}</td>
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

      {/* Complete Question Review */}
      {r.questions && r.questions.length > 0 && (
        <section
          style={{
            background: "#ffffff",
            padding: 24,
            borderRadius: 14,
            border: "1px solid #e2e8f0",
            marginBottom: 28,
            boxShadow: "0 2px 8px rgba(0,0,0,0.03)",
          }}
        >
          <h3 style={{ margin: "0 0 16px", fontSize: 17, fontWeight: 800, color: "#0f172a" }}>
            Question-by-Question Review with Explanations
          </h3>

          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {r.questions.map((item, i) => {
              const isCorrect = item.isCorrect === true;
              const isUnanswered = !item.selectedOption;
              const isWrong = !isCorrect && !isUnanswered;

              let borderColor = "#cbd5e1";
              let statusText = "Unanswered (0)";
              let statusBg = "#f1f5f9";
              let statusColor = "#64748b";

              if (isCorrect) {
                borderColor = "#86efac";
                statusText = "Correct (+4)";
                statusBg = "#dcfce7";
                statusColor = "#15803d";
              } else if (isWrong) {
                borderColor = "#fca5a5";
                statusText = "Incorrect (-1)";
                statusBg = "#fee2e2";
                statusColor = "#b91c1c";
              }

              return (
                <div
                  key={item.id || i}
                  style={{
                    border: `1px solid ${borderColor}`,
                    borderRadius: 10,
                    padding: 18,
                    background: "#ffffff",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                    <span style={{ fontWeight: 800, color: "#1e3a8a", fontSize: 14 }}>
                      Q{i + 1}. {item.subject} • {item.chapter}
                    </span>
                    <span
                      style={{
                        padding: "3px 8px",
                        borderRadius: 4,
                        fontSize: 12,
                        fontWeight: 700,
                        background: statusBg,
                        color: statusColor,
                      }}
                    >
                      {statusText}
                    </span>
                  </div>

                  <p style={{ fontSize: 15, margin: "0 0 14px", color: "#0f172a", lineHeight: 1.5 }}>
                    {item.question}
                  </p>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, fontSize: 13, marginBottom: 12 }}>
                    {item.options &&
                      item.options.map((optText, oIdx) => {
                        const letter = String.fromCharCode(65 + oIdx);
                        const isUserPick = item.selectedOption === letter;
                        const isCorrectPick = item.correctOption === letter;

                        let bg = "#f8fafc";
                        let border = "1px solid #e2e8f0";
                        let color = "#334155";
                        let fw = 400;

                        if (isCorrectPick) {
                          bg = "#dcfce7";
                          border = "1px solid #86efac";
                          color = "#15803d";
                          fw = 700;
                        } else if (isUserPick) {
                          bg = "#fee2e2";
                          border = "1px solid #fca5a5";
                          color = "#b91c1c";
                          fw = 700;
                        }

                        return (
                          <div
                            key={letter}
                            style={{
                              padding: "8px 12px",
                              borderRadius: 6,
                              background: bg,
                              border,
                              color,
                              fontWeight: fw,
                            }}
                          >
                            <strong>{letter}.</strong> {optText}
                            {isUserPick && " (Your Choice)"}
                            {isCorrectPick && " (Correct Answer)"}
                          </div>
                        );
                      })}
                  </div>

                  {item.explanation && (
                    <div style={{ fontSize: 13, color: "#475569", background: "#f8fafc", padding: "10px 14px", borderRadius: 8, border: "1px solid #e2e8f0" }}>
                      💡 <strong>Explanation:</strong> {item.explanation}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Navigation Buttons */}
      <div style={{ display: "flex", gap: 14, justifyContent: "center" }}>
        <button className="primary-button" onClick={() => onNavigate("dashboard")}>
          Return to Dashboard
        </button>
        <button className="secondary-button" onClick={() => onNavigate("history")}>
          View Test History
        </button>
      </div>
    </div>
  );
}
