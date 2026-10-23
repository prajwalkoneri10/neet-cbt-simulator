import React, { useState } from "react";

export default function TestHistoryView({
  attemptHistory = [],
  onViewResult,
  onNavigate,
  onCompare,
}) {
  const [searchTerm, setSearchTerm] = useState("");

  const filtered = attemptHistory.filter((att) =>
    (att.testTitle || "").toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleStartCompare = (idA = null, idB = null) => {
    if (onCompare) {
      onCompare(idA, idB);
    } else if (onNavigate) {
      onNavigate("compare");
    }
  };

  return (
    <div className="test-history-view">
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
            EXAM RECORDS & ARCHIVE
          </span>
          <h1 style={{ margin: "4px 0 6px", fontSize: 24, fontWeight: 800, color: "#0f172a" }}>
            Test Attempt History & Detailed Reviews
          </h1>
          <p style={{ margin: 0, color: "#64748b", fontSize: 14 }}>
            Review past mock scores, question-by-question answer keys with explanations, and benchmark your improvement over time.
          </p>
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          {attemptHistory.length >= 2 && (
            <button
              className="primary-button"
              style={{ background: "#7c3aed", fontWeight: 700 }}
              onClick={() => handleStartCompare()}
            >
              ⚖️ Compare Two Attempts
            </button>
          )}
          <input
            type="text"
            placeholder="🔍 Filter past tests..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{
              padding: "10px 14px",
              borderRadius: 8,
              border: "1px solid #cbd5e1",
              fontSize: 14,
              outline: "none",
            }}
          />
        </div>
      </section>

      {/* History Table */}
      {attemptHistory.length > 0 ? (
        <div style={{ background: "#ffffff", borderRadius: 14, border: "1px solid #e2e8f0", overflow: "hidden", boxShadow: "0 2px 8px rgba(0,0,0,0.03)" }}>
          <div style={{ overflowX: "auto" }}>
            <table className="custom-table" style={{ border: "none" }}>
              <thead>
                <tr>
                  <th>Test ID & Name</th>
                  <th>Completion Date & Time</th>
                  <th>Score & %</th>
                  <th>Accuracy</th>
                  <th>Questions Breakdown</th>
                  <th>Subject Marks</th>
                  <th>Time Taken</th>
                  <th>Max Marks</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((att) => {
                  const pct = att.maxScore > 0 ? ((att.score / att.maxScore) * 100).toFixed(1) : 0;
                  const bioScore = att.subjects?.Biology?.score != null ? `${att.subjects.Biology.score}` : "—";
                  const phyScore = att.subjects?.Physics?.score != null ? `${att.subjects.Physics.score}` : "—";
                  const chemScore = att.subjects?.Chemistry?.score != null ? `${att.subjects.Chemistry.score}` : "—";

                  return (
                    <tr key={att.attemptId}>
                      <td>
                        <strong style={{ color: "#0f172a", display: "block" }}>{att.testTitle}</strong>
                        <span style={{ fontWeight: 600, color: "#64748b", fontSize: 12 }}>
                          Attempt #{att.attemptId}
                        </span>
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
                        <span
                          style={{
                            fontWeight: 700,
                            padding: "3px 8px",
                            borderRadius: 4,
                            fontSize: 12,
                            background: att.accuracy >= 75 ? "#dcfce7" : att.accuracy >= 50 ? "#eff6ff" : "#fee2e2",
                            color: att.accuracy >= 75 ? "#15803d" : att.accuracy >= 50 ? "#1d4ed8" : "#b91c1c",
                          }}
                        >
                          {att.accuracy}%
                        </span>
                      </td>
                      <td>
                        <div style={{ fontSize: 12, whiteSpace: "nowrap" }}>
                          <span style={{ color: "#15803d", fontWeight: 700 }} title="Correct (+4)">✓ {att.correctCount}</span>{" • "}
                          <span style={{ color: "#b91c1c", fontWeight: 700 }} title="Incorrect (-1)">✗ {att.incorrectCount}</span>{" • "}
                          <span style={{ color: "#64748b" }} title="Unanswered">⚪ {att.unansweredCount}</span>
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
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                          <button
                            className="primary-button"
                            style={{ fontSize: 12, padding: "5px 10px", background: "#1e3a8a", whiteSpace: "nowrap" }}
                            onClick={() => onViewResult(att.attemptId)}
                          >
                            Review Scorecard
                          </button>
                          {attemptHistory.length >= 2 && (
                            <button
                              className="secondary-button"
                              style={{ fontSize: 12, padding: "5px 10px", whiteSpace: "nowrap" }}
                              onClick={() => handleStartCompare(att.attemptId, null)}
                              title="Compare this attempt with another test"
                            >
                              ⚖️ Compare
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div style={{ background: "#ffffff", padding: "50px 20px", textAlign: "center", borderRadius: 14, border: "1px solid #e2e8f0" }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>📜</div>
          <h3 style={{ margin: "0 0 8px", color: "#0f172a" }}>No Attempt History Found</h3>
          <p style={{ color: "#64748b", fontSize: 14, margin: "0 0 18px" }}>
            You haven't completed any mock tests yet. As soon as you complete a mock test, detailed answer keys, scorecards, and comparisons will appear here.
          </p>
          <button className="primary-button" onClick={() => onNavigate("startTest")}>
            Take Your First Test
          </button>
        </div>
      )}
    </div>
  );
}
