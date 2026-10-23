import React, { useState, useEffect } from "react";
import api from "../api/client";

export default function CompareTestsView({
  attemptHistory = [],
  initialCompareA = null,
  initialCompareB = null,
  onViewResult,
  onNavigate,
}) {
  const [compareIdA, setCompareIdA] = useState("");
  const [compareIdB, setCompareIdB] = useState("");
  const [comparisonData, setComparisonData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Initialize selected attempts
  useEffect(() => {
    if (attemptHistory.length >= 2) {
      const idA = initialCompareA ? String(initialCompareA) : String(attemptHistory[1].attemptId);
      const idB = initialCompareB ? String(initialCompareB) : String(attemptHistory[0].attemptId);
      setCompareIdA(idA);
      setCompareIdB(idB);
    } else if (attemptHistory.length === 1) {
      setCompareIdA(String(attemptHistory[0].attemptId));
    }
  }, [attemptHistory, initialCompareA, initialCompareB]);

  // Fetch comparison whenever selection changes
  useEffect(() => {
    if (compareIdA && compareIdB && compareIdA !== compareIdB) {
      fetchComparison(compareIdA, compareIdB);
    } else {
      setComparisonData(null);
    }
  }, [compareIdA, compareIdB]);

  const fetchComparison = async (idA, idB) => {
    setLoading(true);
    setError("");
    try {
      const data = await api.tests.compare(idA, idB);
      setComparisonData(data);
    } catch (err) {
      // Fallback: Compute on client from attemptHistory if server endpoint has any transient issue
      const attA = attemptHistory.find((a) => String(a.attemptId) === String(idA));
      const attB = attemptHistory.find((a) => String(a.attemptId) === String(idB));

      if (attA && attB) {
        const scoreDiff = attB.score - attA.score;
        const pctA = attA.maxScore > 0 ? (attA.score / attA.maxScore) * 100 : 0;
        const pctB = attB.maxScore > 0 ? (attB.score / attB.maxScore) * 100 : 0;
        const percentageDiff = Number((pctB - pctA).toFixed(1));
        const scaledA = attA.maxScore > 0 ? Math.round((attA.score / attA.maxScore) * 720) : 0;
        const scaledB = attB.maxScore > 0 ? Math.round((attB.score / attB.maxScore) * 720) : 0;

        setComparisonData({
          attemptA: { ...attA, percentage: Number(pctA.toFixed(1)), scaledScore720: scaledA },
          attemptB: { ...attB, percentage: Number(pctB.toFixed(1)), scaledScore720: scaledB },
          sameMaxScore: attA.maxScore === attB.maxScore,
          scoreDiff,
          percentageDiff,
          scaledScoreDiff: scaledB - scaledA,
          accuracyDiff: Number((attB.accuracy - attA.accuracy).toFixed(1)),
          timeDiffSeconds: (attB.timeTakenSeconds || 0) - (attA.timeTakenSeconds || 0),
          correctDiff: (attB.correctCount || 0) - (attA.correctCount || 0),
          incorrectDiff: (attB.incorrectCount || 0) - (attA.incorrectCount || 0),
          unansweredDiff: (attB.unansweredCount || 0) - (attA.unansweredCount || 0),
          subjectComparison: {},
        });
      } else {
        setError(err.message || "Failed to compare test attempts.");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSwap = () => {
    const temp = compareIdA;
    setCompareIdA(compareIdB);
    setCompareIdB(temp);
  };

  if (attemptHistory.length < 2) {
    return (
      <div className="compare-tests-view">
        <section
          style={{
            background: "#ffffff",
            border: "1px solid #e2e8f0",
            borderRadius: 14,
            padding: "24px 28px",
            marginBottom: 24,
            boxShadow: "0 2px 8px rgba(0,0,0,0.03)",
          }}
        >
          <span style={{ fontSize: 11, fontWeight: 700, color: "#7c3aed", letterSpacing: 1, textTransform: "uppercase" }}>
            EVALUATION & BENCHMARKING
          </span>
          <h1 style={{ margin: "4px 0 6px", fontSize: 24, fontWeight: 800, color: "#0f172a" }}>
            Side-by-Side Test Comparison
          </h1>
          <p style={{ margin: 0, color: "#64748b", fontSize: 14 }}>
            Benchmark any two completed mock tests to measure marks improvement, speed, and subject-wise accuracy shifts.
          </p>
        </section>

        <div style={{ background: "#ffffff", padding: "60px 20px", textAlign: "center", borderRadius: 14, border: "1px solid #e2e8f0" }}>
          <div style={{ fontSize: 44, marginBottom: 14 }}>⚖️</div>
          <h3 style={{ margin: "0 0 8px", color: "#0f172a" }}>
            {attemptHistory.length === 1 ? "Complete One More Test to Compare" : "No Completed Tests Found"}
          </h3>
          <p style={{ color: "#64748b", fontSize: 14, maxWidth: 480, margin: "0 auto 20px" }}>
            Test comparison requires at least <strong>2 completed tests</strong>. Take full mock tests or practice tests to analyze your score trajectory and accuracy differences.
          </p>
          <button className="primary-button" style={{ background: "#7c3aed" }} onClick={() => onNavigate("startTest")}>
            ⏱️ Take a Mock Test Now
          </button>
        </div>
      </div>
    );
  }

  const {
    attemptA,
    attemptB,
    sameMaxScore,
    scoreDiff,
    percentageDiff,
    scaledScoreDiff,
    accuracyDiff,
    timeDiffSeconds,
    correctDiff,
    incorrectDiff,
    unansweredDiff,
    subjectComparison = {},
  } = comparisonData || {};

  const isScorePositive = (sameMaxScore ? scoreDiff : percentageDiff) >= 0;
  const isAccPositive = (accuracyDiff || 0) >= 0;

  return (
    <div className="compare-tests-view">
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
          <span style={{ fontSize: 11, fontWeight: 700, color: "#7c3aed", letterSpacing: 1, textTransform: "uppercase" }}>
            EVALUATION & BENCHMARKING
          </span>
          <h1 style={{ margin: "4px 0 6px", fontSize: 24, fontWeight: 800, color: "#0f172a" }}>
            Side-by-Side Test Comparison
          </h1>
          <p style={{ margin: 0, color: "#64748b", fontSize: 14 }}>
            Compare any two tests to see exact score differences, percentage progression, and subject-wise mastery shifts.
          </p>
        </div>

        <button className="secondary-button" onClick={() => onNavigate("history")}>
          📜 View Test History →
        </button>
      </section>

      {/* Test Selectors Card */}
      <div
        style={{
          background: "#ffffff",
          padding: 24,
          borderRadius: 14,
          border: "1px solid #e2e8f0",
          marginBottom: 24,
          boxShadow: "0 2px 8px rgba(0,0,0,0.03)",
        }}
      >
        <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", gap: 14, alignItems: "center" }}>
          {/* Test A */}
          <div>
            <label style={{ display: "block", fontSize: 13, fontWeight: 700, color: "#334155", marginBottom: 6 }}>
              Baseline Attempt (Test A)
            </label>
            <select
              value={compareIdA}
              onChange={(e) => setCompareIdA(e.target.value)}
              style={{
                width: "100%",
                padding: "10px 12px",
                borderRadius: 8,
                border: "1px solid #cbd5e1",
                fontSize: 14,
                outline: "none",
                background: "#f8fafc",
                fontWeight: 600,
              }}
            >
              {attemptHistory.map((a) => (
                <option key={a.attemptId} value={a.attemptId}>
                  #{a.attemptId}: {a.testTitle} ({a.score}/{a.maxScore} marks • {new Date(a.submittedAt).toLocaleDateString()})
                </option>
              ))}
            </select>
          </div>

          {/* Swap Button */}
          <div style={{ paddingTop: 20 }}>
            <button
              className="secondary-button"
              onClick={handleSwap}
              title="Swap Test A and Test B"
              style={{
                borderRadius: "50%",
                width: 42,
                height: 42,
                padding: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 16,
              }}
            >
              ⇄
            </button>
          </div>

          {/* Test B */}
          <div>
            <label style={{ display: "block", fontSize: 13, fontWeight: 700, color: "#334155", marginBottom: 6 }}>
              Comparison Attempt (Test B)
            </label>
            <select
              value={compareIdB}
              onChange={(e) => setCompareIdB(e.target.value)}
              style={{
                width: "100%",
                padding: "10px 12px",
                borderRadius: 8,
                border: "1px solid #cbd5e1",
                fontSize: 14,
                outline: "none",
                background: "#f8fafc",
                fontWeight: 600,
              }}
            >
              {attemptHistory.map((a) => (
                <option key={a.attemptId} value={a.attemptId}>
                  #{a.attemptId}: {a.testTitle} ({a.score}/{a.maxScore} marks • {new Date(a.submittedAt).toLocaleDateString()})
                </option>
              ))}
            </select>
          </div>
        </div>

        {compareIdA === compareIdB && (
          <div style={{ marginTop: 14, padding: "10px 14px", background: "#fef3c7", border: "1px solid #fde68a", borderRadius: 8, color: "#92400e", fontSize: 13 }}>
            ⚠️ Please select two different attempts to generate a comparison delta.
          </div>
        )}
      </div>

      {loading && (
        <div style={{ textAlign: "center", padding: 40, color: "#64748b" }}>
          Calculating comparative metrics between attempts...
        </div>
      )}

      {error && (
        <div style={{ background: "#fee2e2", border: "1px solid #fca5a5", color: "#b91c1c", padding: 14, borderRadius: 10, marginBottom: 20 }}>
          {error}
        </div>
      )}

      {comparisonData && attemptA && attemptB && (
        <>
          {/* Difference Banner */}
          <section
            style={{
              background: isScorePositive ? "linear-gradient(135deg, #065f46, #047857)" : "linear-gradient(135deg, #991b1b, #b91c1c)",
              color: "#ffffff",
              borderRadius: 16,
              padding: "24px 28px",
              marginBottom: 24,
              boxShadow: isScorePositive ? "0 8px 24px rgba(4, 120, 87, 0.2)" : "0 8px 24px rgba(185, 28, 28, 0.2)",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexWrap: "wrap",
              gap: 16,
            }}
          >
            <div>
              <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1, opacity: 0.9, textTransform: "uppercase" }}>
                OVERALL PERFORMANCE DELTA (TEST B vs TEST A)
              </span>
              <div style={{ fontSize: 34, fontWeight: 800, margin: "4px 0" }}>
                {sameMaxScore
                  ? `${isScorePositive ? `+${scoreDiff}` : scoreDiff} Marks (${isScorePositive ? `+${percentageDiff}` : percentageDiff}%)`
                  : `${isScorePositive ? `+${percentageDiff}` : percentageDiff}% Accuracy Shift`}
              </div>
              <p style={{ margin: 0, fontSize: 14, opacity: 0.9 }}>
                {isScorePositive
                  ? `🚀 Progress demonstrated: Test B scored higher than Test A by ${Math.abs(percentageDiff)}% overall!`
                  : `⚠️ Noticeable dip: Test B scored lower than Test A by ${Math.abs(percentageDiff)}%. Review question mistakes below.`}
              </p>
              {!sameMaxScore && (
                <div style={{ marginTop: 8, fontSize: 12, opacity: 0.85, background: "rgba(0,0,0,0.15)", padding: "4px 10px", borderRadius: 6, display: "inline-block" }}>
                  ℹ️ Different Maximum Marks ({attemptA.maxScore} vs {attemptB.maxScore}): Scaled 720-equivalent shift is {scaledScoreDiff >= 0 ? `+${scaledScoreDiff}` : scaledScoreDiff} marks.
                </div>
              )}
            </div>

            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              <button
                className="secondary-button"
                style={{ background: "#ffffff", color: "#0f172a", fontWeight: 700, fontSize: 13 }}
                onClick={() => onViewResult(attemptA.attemptId)}
              >
                Review #{attemptA.attemptId} Answers
              </button>
              <button
                className="secondary-button"
                style={{ background: "#ffffff", color: "#0f172a", fontWeight: 700, fontSize: 13 }}
                onClick={() => onViewResult(attemptB.attemptId)}
              >
                Review #{attemptB.attemptId} Answers
              </button>
            </div>
          </section>

          {/* Metric Comparison Table */}
          <div style={{ background: "#ffffff", borderRadius: 14, border: "1px solid #e2e8f0", overflow: "hidden", marginBottom: 24, boxShadow: "0 2px 8px rgba(0,0,0,0.03)" }}>
            <div style={{ padding: "18px 22px", borderBottom: "1px solid #e2e8f0", background: "#f8fafc" }}>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: "#0f172a" }}>
                Detailed Metric Comparison
              </h3>
            </div>

            <div style={{ overflowX: "auto" }}>
              <table className="custom-table" style={{ border: "none" }}>
                <thead>
                  <tr>
                    <th>Performance Metric</th>
                    <th>
                      Attempt #{attemptA.attemptId}
                      <div style={{ fontSize: 11, fontWeight: 400, color: "#64748b" }}>{attemptA.testTitle}</div>
                    </th>
                    <th>
                      Attempt #{attemptB.attemptId}
                      <div style={{ fontSize: 11, fontWeight: 400, color: "#64748b" }}>{attemptB.testTitle}</div>
                    </th>
                    <th>Comparative Delta</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td><strong>Total Score</strong></td>
                    <td>
                      <span style={{ fontWeight: 800, fontSize: 15, color: "#1e3a8a" }}>{attemptA.score}</span> / {attemptA.maxScore}
                      <div style={{ fontSize: 11, color: "#64748b" }}>({attemptA.percentage}%)</div>
                    </td>
                    <td>
                      <span style={{ fontWeight: 800, fontSize: 15, color: "#1e3a8a" }}>{attemptB.score}</span> / {attemptB.maxScore}
                      <div style={{ fontSize: 11, color: "#64748b" }}>({attemptB.percentage}%)</div>
                    </td>
                    <td>
                      <strong style={{ color: isScorePositive ? "#10b981" : "#ef4444", fontSize: 15 }}>
                        {sameMaxScore
                          ? `${scoreDiff >= 0 ? `+${scoreDiff}` : scoreDiff} Marks`
                          : `${percentageDiff >= 0 ? `+${percentageDiff}` : percentageDiff}%`}
                      </strong>
                    </td>
                  </tr>

                  {!sameMaxScore && (
                    <tr>
                      <td><strong>Scaled Score (720 Equivalent)</strong></td>
                      <td>{attemptA.scaledScore720} / 720</td>
                      <td>{attemptB.scaledScore720} / 720</td>
                      <td>
                        <strong style={{ color: scaledScoreDiff >= 0 ? "#10b981" : "#ef4444" }}>
                          {scaledScoreDiff >= 0 ? `+${scaledScoreDiff}` : scaledScoreDiff} marks
                        </strong>
                      </td>
                    </tr>
                  )}

                  <tr>
                    <td><strong>Exam Accuracy</strong></td>
                    <td>{attemptA.accuracy}%</td>
                    <td>{attemptB.accuracy}%</td>
                    <td>
                      <strong style={{ color: isAccPositive ? "#10b981" : "#ef4444" }}>
                        {accuracyDiff >= 0 ? `+${accuracyDiff}%` : `${accuracyDiff}%`}
                      </strong>
                    </td>
                  </tr>

                  <tr>
                    <td><strong>Correct Answers (+4)</strong></td>
                    <td style={{ color: "#15803d", fontWeight: 700 }}>+{attemptA.correctCount}</td>
                    <td style={{ color: "#15803d", fontWeight: 700 }}>+{attemptB.correctCount}</td>
                    <td>
                      <strong style={{ color: correctDiff >= 0 ? "#10b981" : "#ef4444" }}>
                        {correctDiff >= 0 ? `+${correctDiff}` : correctDiff} correct
                      </strong>
                    </td>
                  </tr>

                  <tr>
                    <td><strong>Incorrect Answers (-1)</strong></td>
                    <td style={{ color: "#b91c1c", fontWeight: 700 }}>-{attemptA.incorrectCount}</td>
                    <td style={{ color: "#b91c1c", fontWeight: 700 }}>-{attemptB.incorrectCount}</td>
                    <td>
                      <strong style={{ color: incorrectDiff <= 0 ? "#10b981" : "#ef4444" }}>
                        {incorrectDiff <= 0 ? `${incorrectDiff}` : `+${incorrectDiff}`} errors
                      </strong>
                    </td>
                  </tr>

                  <tr>
                    <td><strong>Unanswered Questions</strong></td>
                    <td>{attemptA.unansweredCount}</td>
                    <td>{attemptB.unansweredCount}</td>
                    <td>
                      {unansweredDiff === 0 ? "Same (0)" : unansweredDiff > 0 ? `+${unansweredDiff} more unans` : `${unansweredDiff} fewer unans`}
                    </td>
                  </tr>

                  <tr>
                    <td><strong>Time Taken</strong></td>
                    <td>{Math.round((attemptA.timeTakenSeconds || 0) / 60)} mins</td>
                    <td>{Math.round((attemptB.timeTakenSeconds || 0) / 60)} mins</td>
                    <td>
                      {timeDiffSeconds === 0
                        ? "Exact same time"
                        : timeDiffSeconds > 0
                        ? `+${Math.round(timeDiffSeconds / 60)} mins slower`
                        : `${Math.abs(Math.round(timeDiffSeconds / 60))} mins faster`}
                    </td>
                  </tr>

                  <tr>
                    <td><strong>Completion Timestamp</strong></td>
                    <td>{new Date(attemptA.submittedAt).toLocaleString()}</td>
                    <td>{new Date(attemptB.submittedAt).toLocaleString()}</td>
                    <td>—</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Subject-Wise Comparison Cards */}
          <div style={{ background: "#ffffff", padding: 24, borderRadius: 14, border: "1px solid #e2e8f0", boxShadow: "0 2px 8px rgba(0,0,0,0.03)" }}>
            <h3 style={{ margin: "0 0 16px", fontSize: 16, fontWeight: 800, color: "#0f172a" }}>
              🧬 Subject-Wise Marks & Accuracy Comparison
            </h3>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 16 }}>
              {["Biology", "Physics", "Chemistry"].map((subName) => {
                const subComp = subjectComparison[subName] || null;
                const sA = subComp?.attemptA || { score: 0, percentage: 0 };
                const sB = subComp?.attemptB || { score: 0, percentage: 0 };
                const sDiff = sB.score - sA.score;
                const isSubPositive = sDiff >= 0;

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
                      <strong style={{ fontSize: 16, color: "#0f172a" }}>{subName}</strong>
                      <span
                        style={{
                          fontSize: 13,
                          fontWeight: 700,
                          padding: "3px 8px",
                          borderRadius: 6,
                          background: isSubPositive ? "#dcfce7" : "#fee2e2",
                          color: isSubPositive ? "#15803d" : "#b91c1c",
                        }}
                      >
                        {isSubPositive ? `+${sDiff} marks` : `${sDiff} marks`}
                      </span>
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, fontSize: 13, marginBottom: 10 }}>
                      <div style={{ background: "#ffffff", padding: "8px 10px", borderRadius: 8, border: "1px solid #e2e8f0" }}>
                        <span style={{ fontSize: 11, color: "#64748b", display: "block" }}>Test A (#{attemptA.attemptId})</span>
                        <strong style={{ fontSize: 15, color: "#1e3a8a" }}>{sA.score} marks</strong>
                        <div style={{ fontSize: 11, color: "#64748b" }}>{sA.percentage}% acc</div>
                      </div>

                      <div style={{ background: "#ffffff", padding: "8px 10px", borderRadius: 8, border: "1px solid #e2e8f0" }}>
                        <span style={{ fontSize: 11, color: "#64748b", display: "block" }}>Test B (#{attemptB.attemptId})</span>
                        <strong style={{ fontSize: 15, color: themeColor }}>{sB.score} marks</strong>
                        <div style={{ fontSize: 11, color: "#64748b" }}>{sB.percentage}% acc</div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
