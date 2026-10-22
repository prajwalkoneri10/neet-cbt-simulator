import React, { useState } from "react";

export default function TestHistoryView({
  attemptHistory,
  onViewResult,
  onNavigate,
}) {
  const [searchTerm, setSearchTerm] = useState("");
  const [compareIdA, setCompareIdA] = useState("");
  const [compareIdB, setCompareIdB] = useState("");
  const [showComparisonModal, setShowComparisonModal] = useState(false);

  const filtered = attemptHistory.filter((att) =>
    att.testTitle.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const attemptA = attemptHistory.find((a) => String(a.attemptId) === String(compareIdA));
  const attemptB = attemptHistory.find((a) => String(a.attemptId) === String(compareIdB));

  const handleOpenCompare = (defaultA, defaultB) => {
    if (defaultA) setCompareIdA(String(defaultA));
    if (defaultB) setCompareIdB(String(defaultB));
    else if (attemptHistory.length >= 2) {
      setCompareIdA(String(attemptHistory[0].attemptId));
      setCompareIdB(String(attemptHistory[1].attemptId));
    }
    setShowComparisonModal(true);
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
            Test Attempt History & Comparisons
          </h1>
          <p style={{ margin: 0, color: "#64748b", fontSize: 14 }}>
            Review your past mock scores, question-by-question mistakes, and measure improvement across test attempts.
          </p>
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          {attemptHistory.length >= 2 && (
            <button
              className="primary-button"
              style={{ background: "#7c3aed", fontWeight: 700 }}
              onClick={() => handleOpenCompare()}
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
                  <th>Attempt ID</th>
                  <th>Test Title</th>
                  <th>Date & Time</th>
                  <th>Score / Max</th>
                  <th>Accuracy</th>
                  <th>Correct / Wrong</th>
                  <th>Time Taken</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((att, idx) => (
                  <tr key={att.attemptId}>
                    <td>
                      <span style={{ fontWeight: 700, color: "#64748b" }}>#{att.attemptId}</span>
                    </td>
                    <td>
                      <strong style={{ color: "#0f172a" }}>{att.testTitle}</strong>
                    </td>
                    <td>
                      {new Date(att.submittedAt).toLocaleDateString()} at{" "}
                      {new Date(att.submittedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </td>
                    <td>
                      <span style={{ fontWeight: 800, color: "#1e3a8a", fontSize: 15 }}>{att.score}</span>
                      <span style={{ color: "#64748b", fontSize: 13 }}> / {att.maxScore}</span>
                    </td>
                    <td>
                      <span
                        style={{
                          fontWeight: 700,
                          padding: "2px 8px",
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
                      <span style={{ color: "#15803d", fontWeight: 700 }}>+{att.correctCount}</span>{" "}
                      <span style={{ color: "#b91c1c", fontWeight: 700 }}>-{att.incorrectCount}</span>{" "}
                      <span style={{ color: "#64748b", fontSize: 12 }}>({att.unansweredCount} unans)</span>
                    </td>
                    <td>{Math.round((att.timeTakenSeconds || 0) / 60)} mins</td>
                    <td>
                      <div style={{ display: "flex", gap: 6 }}>
                        <button
                          className="primary-button"
                          style={{ fontSize: 12, padding: "5px 10px", background: "#1e3a8a" }}
                          onClick={() => onViewResult(att.attemptId)}
                        >
                          Review Answers
                        </button>
                        {attemptHistory.length >= 2 && (
                          <button
                            className="secondary-button"
                            style={{ fontSize: 12, padding: "5px 10px" }}
                            onClick={() => handleOpenCompare(att.attemptId, null)}
                            title="Compare this attempt with another"
                          >
                            Compare
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
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

      {/* Side-by-Side Attempt Comparison Modal */}
      {showComparisonModal && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15, 23, 42, 0.75)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
            padding: 16,
          }}
          onClick={() => setShowComparisonModal(false)}
        >
          <div
            style={{
              background: "#ffffff",
              borderRadius: 16,
              maxWidth: 780,
              width: "100%",
              padding: 28,
              maxHeight: "90vh",
              overflowY: "auto",
              boxShadow: "0 20px 50px rgba(0,0,0,0.3)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
              <div>
                <span style={{ fontSize: 11, fontWeight: 700, color: "#7c3aed", textTransform: "uppercase" }}>
                  PROGRESS COMPARISON
                </span>
                <h2 style={{ margin: "2px 0 0", fontSize: 20, fontWeight: 800, color: "#0f172a" }}>
                  Side-by-Side Test Marks Comparison
                </h2>
              </div>
              <button
                onClick={() => setShowComparisonModal(false)}
                style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "#64748b" }}
              >
                ✕
              </button>
            </div>

            {/* Selectors */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 20 }}>
              <div>
                <label style={{ display: "block", fontSize: 13, fontWeight: 700, color: "#334155", marginBottom: 6 }}>
                  Select Earlier Attempt (A)
                </label>
                <select
                  value={compareIdA}
                  onChange={(e) => setCompareIdA(e.target.value)}
                  style={{ width: "100%", padding: "10px", borderRadius: 8, border: "1px solid #cbd5e1", fontSize: 13 }}
                >
                  {attemptHistory.map((a) => (
                    <option key={a.attemptId} value={a.attemptId}>
                      #{a.attemptId}: {a.testTitle} ({a.score} marks - {new Date(a.submittedAt).toLocaleDateString()})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ display: "block", fontSize: 13, fontWeight: 700, color: "#334155", marginBottom: 6 }}>
                  Select Later Attempt (B)
                </label>
                <select
                  value={compareIdB}
                  onChange={(e) => setCompareIdB(e.target.value)}
                  style={{ width: "100%", padding: "10px", borderRadius: 8, border: "1px solid #cbd5e1", fontSize: 13 }}
                >
                  {attemptHistory.map((a) => (
                    <option key={a.attemptId} value={a.attemptId}>
                      #{a.attemptId}: {a.testTitle} ({a.score} marks - {new Date(a.submittedAt).toLocaleDateString()})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {attemptA && attemptB ? (
              <div>
                {/* Score Delta Highlight */}
                {(() => {
                  const scoreDiff = attemptB.score - attemptA.score;
                  const accDiff = attemptB.accuracy - attemptA.accuracy;
                  const isPositive = scoreDiff >= 0;

                  return (
                    <div
                      style={{
                        background: isPositive ? "#ecfdf5" : "#fef2f2",
                        border: `1px solid ${isPositive ? "#a7f3d0" : "#fecaca"}`,
                        borderRadius: 12,
                        padding: 18,
                        marginBottom: 20,
                        textAlign: "center",
                      }}
                    >
                      <span style={{ fontSize: 12, fontWeight: 700, color: isPositive ? "#047857" : "#b91c1c", textTransform: "uppercase" }}>
                        Overall Score Shift
                      </span>
                      <div style={{ fontSize: 36, fontWeight: 800, color: isPositive ? "#047857" : "#b91c1c", margin: "4px 0" }}>
                        {isPositive ? `+${scoreDiff}` : scoreDiff} Marks
                      </div>
                      <div style={{ fontSize: 13, color: isPositive ? "#065f46" : "#991b1b" }}>
                        Accuracy change: <strong>{accDiff >= 0 ? `+${accDiff}%` : `${accDiff}%`}</strong>
                      </div>
                    </div>
                  );
                })()}

                {/* Comparative Metrics Table */}
                <table className="custom-table">
                  <thead>
                    <tr>
                      <th>Metric</th>
                      <th>Attempt #{attemptA.attemptId}</th>
                      <th>Attempt #{attemptB.attemptId}</th>
                      <th>Delta</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td><strong>Total Score</strong></td>
                      <td>{attemptA.score} / {attemptA.maxScore}</td>
                      <td>{attemptB.score} / {attemptB.maxScore}</td>
                      <td style={{ fontWeight: 800, color: attemptB.score >= attemptA.score ? "#10b981" : "#ef4444" }}>
                        {attemptB.score - attemptA.score >= 0 ? `+${attemptB.score - attemptA.score}` : attemptB.score - attemptA.score}
                      </td>
                    </tr>
                    <tr>
                      <td><strong>Accuracy</strong></td>
                      <td>{attemptA.accuracy}%</td>
                      <td>{attemptB.accuracy}%</td>
                      <td style={{ fontWeight: 800, color: attemptB.accuracy >= attemptA.accuracy ? "#10b981" : "#ef4444" }}>
                        {attemptB.accuracy - attemptA.accuracy >= 0 ? `+${attemptB.accuracy - attemptA.accuracy}%` : `${attemptB.accuracy - attemptA.accuracy}%`}
                      </td>
                    </tr>
                    <tr>
                      <td><strong>Correct Answers (+4)</strong></td>
                      <td>{attemptA.correctCount}</td>
                      <td>{attemptB.correctCount}</td>
                      <td style={{ fontWeight: 700 }}>
                        {attemptB.correctCount - attemptA.correctCount >= 0 ? `+${attemptB.correctCount - attemptA.correctCount}` : attemptB.correctCount - attemptA.correctCount}
                      </td>
                    </tr>
                    <tr>
                      <td><strong>Negative Marks (-1)</strong></td>
                      <td>{attemptA.incorrectCount}</td>
                      <td>{attemptB.incorrectCount}</td>
                      <td style={{ fontWeight: 700, color: attemptB.incorrectCount <= attemptA.incorrectCount ? "#10b981" : "#ef4444" }}>
                        {attemptB.incorrectCount - attemptA.incorrectCount <= 0 ? `${attemptB.incorrectCount - attemptA.incorrectCount}` : `+${attemptB.incorrectCount - attemptA.incorrectCount}`}
                      </td>
                    </tr>
                    <tr>
                      <td><strong>Time Taken</strong></td>
                      <td>{Math.round((attemptA.timeTakenSeconds || 0) / 60)} mins</td>
                      <td>{Math.round((attemptB.timeTakenSeconds || 0) / 60)} mins</td>
                      <td>
                        {Math.round((attemptB.timeTakenSeconds || 0) / 60) - Math.round((attemptA.timeTakenSeconds || 0) / 60)} mins
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            ) : (
              <div style={{ textAlign: "center", padding: 20 }}>Please select two valid attempts to compare.</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
