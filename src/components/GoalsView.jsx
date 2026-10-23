import React, { useState, useEffect } from "react";
import api from "../api/client";

export default function GoalsView({ studentProfile, onGoalsUpdated }) {
  const [goals, setGoals] = useState({
    targetYear: 2027,
    targetScore: 650,
    targetBiology: 320,
    targetPhysics: 140,
    targetChemistry: 140,
    completedTests: 0,
    bestScore: 0,
    averageScore: 0,
    scoreGap: 650,
    biologyAverage: 0,
    physicsAverage: 0,
    chemistryAverage: 0,
  });

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    fetchGoals();
  }, []);

  const fetchGoals = async () => {
    setLoading(true);
    try {
      const data = await api.goals.get();
      setGoals(data);
    } catch (err) {
      setError(err.message || "Failed to load goals.");
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    setMessage("");
    setError("");

    try {
      await api.goals.update({
        targetYear: Number(goals.targetYear),
        targetScore: Number(goals.targetScore),
        targetBiology: Number(goals.targetBiology),
        targetPhysics: Number(goals.targetPhysics),
        targetChemistry: Number(goals.targetChemistry),
      });

      setMessage("✅ Goal scores successfully updated and persisted to PostgreSQL!");
      if (onGoalsUpdated) onGoalsUpdated();
      fetchGoals();
    } catch (err) {
      setError(err.message || "Failed to update goals.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div style={{ textAlign: "center", padding: "60px 20px", color: "#64748b" }}>
        <div style={{ fontSize: 36, marginBottom: 12 }}>🎯</div>
        <p>Loading your student target goals from database...</p>
      </div>
    );
  }

  const overallProgress = Math.min(100, Math.round(((goals.averageScore || 0) / (goals.targetScore || 720)) * 100));
  const bioProgress = Math.min(100, Math.round(((goals.biologyAverage || 0) / (goals.targetBiology || 360)) * 100));
  const physProgress = Math.min(100, Math.round(((goals.physicsAverage || 0) / (goals.targetPhysics || 180)) * 100));
  const chemProgress = Math.min(100, Math.round(((goals.chemistryAverage || 0) / (goals.targetChemistry || 180)) * 100));

  return (
    <div className="goals-view">
      {/* Header */}
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
        <span style={{ fontSize: 11, fontWeight: 700, color: "#2563eb", letterSpacing: 1, textTransform: "uppercase" }}>
          TARGET STRATEGY & MILESTONES
        </span>
        <h1 style={{ margin: "4px 0 6px", fontSize: 24, fontWeight: 800, color: "#0f172a" }}>
          NEET Target Score & Study Milestones
        </h1>
        <p style={{ margin: 0, color: "#64748b", fontSize: 14 }}>
          Establish your target marks for Biology, Physics, and Chemistry. Measure your current average against your target goal.
        </p>
      </section>

      {message && (
        <div style={{ background: "#ecfdf5", border: "1px solid #a7f3d0", color: "#065f46", padding: "12px 16px", borderRadius: 10, marginBottom: 20, fontSize: 14, fontWeight: 600 }}>
          {message}
        </div>
      )}

      {error && (
        <div style={{ background: "#fee2e2", border: "1px solid #fca5a5", color: "#b91c1c", padding: "12px 16px", borderRadius: 10, marginBottom: 20, fontSize: 14 }}>
          {error}
        </div>
      )}

      {/* Target Achievement Celebratory Banner */}
      {goals.targetReached && (
        <div
          style={{
            background: "linear-gradient(135deg, #059669, #10b981)",
            color: "#ffffff",
            padding: "20px 24px",
            borderRadius: 14,
            marginBottom: 24,
            display: "flex",
            alignItems: "center",
            gap: 16,
            boxShadow: "0 6px 20px rgba(16, 185, 129, 0.25)",
          }}
        >
          <div style={{ fontSize: 36 }}>🎯</div>
          <div>
            <h3 style={{ margin: "0 0 4px", fontSize: 18, fontWeight: 800 }}>
              Target Score Achieved! Congratulations!
            </h3>
            <p style={{ margin: 0, fontSize: 14, opacity: 0.95 }}>
              Your mock performance has reached your target of <strong>{goals.targetScore} marks</strong>. You are in prime shape for NEET! You can raise your target score below to aim for higher national ranks.
            </p>
          </div>
        </div>
      )}

      {/* Target & Score Milestone Cards */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: 16,
          marginBottom: 24,
        }}
      >
        <div style={{ background: "#ffffff", padding: 20, borderRadius: 12, border: "1px solid #e2e8f0", boxShadow: "0 2px 6px rgba(0,0,0,0.03)" }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: "#64748b", textTransform: "uppercase" }}>Target Score</span>
          <div style={{ fontSize: 26, fontWeight: 800, color: "#1e3a8a", margin: "4px 0" }}>
            {goals.targetScore} <span style={{ fontSize: 14, color: "#64748b", fontWeight: 500 }}>/ 720</span>
          </div>
          <span style={{ fontSize: 12, color: "#64748b" }}>Goal for NEET UG {goals.targetYear || 2027}</span>
        </div>

        <div style={{ background: "#ffffff", padding: 20, borderRadius: 12, border: "1px solid #e2e8f0", boxShadow: "0 2px 6px rgba(0,0,0,0.03)" }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: "#64748b", textTransform: "uppercase" }}>Best Score</span>
          <div style={{ fontSize: 26, fontWeight: 800, color: "#10b981", margin: "4px 0" }}>
            {goals.bestScore > 0 ? goals.bestScore : "—"}
            <span style={{ fontSize: 14, color: "#64748b", fontWeight: 500 }}>
              {goals.bestScore > 0 ? ` / ${goals.bestMaxScore || 720}` : ""}
            </span>
          </div>
          <span style={{ fontSize: 12, color: "#10b981", fontWeight: 600 }}>
            {goals.bestPercentage != null && goals.bestScore > 0
              ? `${goals.bestPercentage}% accuracy ${goals.bestMaxScore !== 720 ? `(${goals.bestScaledScore}/720 scaled)` : ""}`
              : "No completed tests"}
          </span>
        </div>

        <div style={{ background: "#ffffff", padding: 20, borderRadius: 12, border: "1px solid #e2e8f0", boxShadow: "0 2px 6px rgba(0,0,0,0.03)" }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: "#64748b", textTransform: "uppercase" }}>Latest Score</span>
          <div style={{ fontSize: 26, fontWeight: 800, color: "#0f172a", margin: "4px 0" }}>
            {goals.latestScore > 0 ? goals.latestScore : "—"}
            <span style={{ fontSize: 14, color: "#64748b", fontWeight: 500 }}>
              {goals.latestScore > 0 ? ` / ${goals.latestMaxScore || 720}` : ""}
            </span>
          </div>
          <span style={{ fontSize: 12, color: "#64748b" }}>
            {goals.latestPercentage != null && goals.latestScore > 0
              ? `${goals.latestPercentage}% (${goals.latestTitle || "Recent"})`
              : "Take a mock test"}
          </span>
        </div>

        <div style={{ background: "#ffffff", padding: 20, borderRadius: 12, border: "1px solid #e2e8f0", boxShadow: "0 2px 6px rgba(0,0,0,0.03)" }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: "#64748b", textTransform: "uppercase" }}>Marks Needed</span>
          <div style={{ fontSize: 26, fontWeight: 800, color: goals.scoreGap <= 0 ? "#10b981" : "#d97706", margin: "4px 0" }}>
            {goals.scoreGap <= 0 ? "Target Met! 🎯" : `${goals.scoreGap} Marks`}
          </div>
          <span style={{ fontSize: 12, color: goals.scoreGap <= 0 ? "#10b981" : "#d97706", fontWeight: 600 }}>
            {goals.scoreGap <= 0 ? "Goal successfully reached" : `Gap to reach ${goals.targetScore} target`}
          </span>
        </div>
      </div>

      {/* Goal Summary / Progress Bar Card */}
      <section
        style={{
          background: "linear-gradient(135deg, #1e3a8a, #1d4ed8)",
          color: "#ffffff",
          borderRadius: 16,
          padding: 28,
          marginBottom: 24,
          boxShadow: "0 8px 24px rgba(30, 58, 138, 0.2)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12, marginBottom: 16 }}>
          <div>
            <span style={{ fontSize: 12, letterSpacing: 1, opacity: 0.9, textTransform: "uppercase" }}>
              TARGET ACHIEVEMENT PROGRESS
            </span>
            <div style={{ fontSize: 36, fontWeight: 800, margin: "4px 0" }}>
              {goals.effectiveScore || goals.bestScaledScore || goals.averageScore || 0}{" "}
              <span style={{ fontSize: 20, fontWeight: 400, opacity: 0.8 }}>/ {goals.targetScore} Marks</span>
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <span style={{ fontSize: 13, opacity: 0.85 }}>Achievement Status:</span>
            <div style={{ fontSize: 24, fontWeight: 800, color: goals.targetReached ? "#86efac" : "#fef08a" }}>
              {goals.targetReached ? "Target Achieved! 🎯" : `${goals.scoreGap} Marks Needed`}
            </div>
          </div>
        </div>

        {/* Progress Track */}
        <div style={{ background: "rgba(255,255,255,0.2)", height: 14, borderRadius: 7, overflow: "hidden", marginBottom: 12 }}>
          <div
            style={{
              height: "100%",
              width: `${goals.achievementPercentage != null ? goals.achievementPercentage : overallProgress}%`,
              background: (goals.achievementPercentage || overallProgress) >= 90 ? "#10b981" : "#38bdf8",
              borderRadius: 7,
              transition: "width 0.4s ease",
            }}
          />
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, opacity: 0.85 }}>
          <span>Current Score: {goals.effectiveScore || goals.bestScaledScore || 0}/720</span>
          <span>{goals.achievementPercentage != null ? goals.achievementPercentage : overallProgress}% of Target Achieved</span>
          <span>Target Goal: {goals.targetScore}/720</span>
        </div>
      </section>

      {/* Main Grid: Form on Left, Subject Progress on Right */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))", gap: 24, marginBottom: 24 }}>
        {/* Form Card */}
        <div style={{ background: "#ffffff", padding: 26, borderRadius: 14, border: "1px solid #e2e8f0", boxShadow: "0 2px 8px rgba(0,0,0,0.03)" }}>
          <h3 style={{ margin: "0 0 16px", fontSize: 17, fontWeight: 800, color: "#0f172a" }}>
            🎯 Configure Target Scores
          </h3>

          <form onSubmit={handleSave}>
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: "block", fontSize: 13, fontWeight: 700, color: "#334155", marginBottom: 6 }}>
                Overall NEET Target Score (Max: 720)
              </label>
              <input
                type="number"
                min="0"
                max="720"
                value={goals.targetScore}
                onChange={(e) => setGoals({ ...goals, targetScore: Number(e.target.value) })}
                required
                style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid #cbd5e1", fontSize: 15, fontWeight: 600 }}
              />
              <span style={{ fontSize: 12, color: "#64748b" }}>Recommended: 650+ for Government Medical Colleges.</span>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 16 }}>
              <div>
                <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: "#047857", marginBottom: 6 }}>
                  Biology (Max 360)
                </label>
                <input
                  type="number"
                  min="0"
                  max="360"
                  value={goals.targetBiology}
                  onChange={(e) => setGoals({ ...goals, targetBiology: Number(e.target.value) })}
                  style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid #cbd5e1", fontSize: 14 }}
                />
              </div>

              <div>
                <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: "#b45309", marginBottom: 6 }}>
                  Physics (Max 180)
                </label>
                <input
                  type="number"
                  min="0"
                  max="180"
                  value={goals.targetPhysics}
                  onChange={(e) => setGoals({ ...goals, targetPhysics: Number(e.target.value) })}
                  style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid #cbd5e1", fontSize: 14 }}
                />
              </div>

              <div>
                <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: "#86198f", marginBottom: 6 }}>
                  Chemistry (Max 180)
                </label>
                <input
                  type="number"
                  min="0"
                  max="180"
                  value={goals.targetChemistry}
                  onChange={(e) => setGoals({ ...goals, targetChemistry: Number(e.target.value) })}
                  style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid #cbd5e1", fontSize: 14 }}
                />
              </div>
            </div>

            <div style={{ marginBottom: 20 }}>
              <label style={{ display: "block", fontSize: 13, fontWeight: 700, color: "#334155", marginBottom: 6 }}>
                Target Examination Year
              </label>
              <select
                value={goals.targetYear}
                onChange={(e) => setGoals({ ...goals, targetYear: Number(e.target.value) })}
                style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid #cbd5e1", fontSize: 14 }}
              >
                <option value="2026">NEET UG 2026</option>
                <option value="2027">NEET UG 2027</option>
                <option value="2028">NEET UG 2028</option>
              </select>
            </div>

            <button
              type="submit"
              className="primary-button"
              disabled={saving}
              style={{ width: "100%", padding: "12px", background: "#2563eb", fontWeight: 700 }}
            >
              {saving ? "Saving to PostgreSQL..." : "Save Target Goals"}
            </button>
          </form>
        </div>

        {/* Subject Gap Analysis & Reference Cutoffs */}
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          {/* Subject Breakdown Card */}
          <div style={{ background: "#ffffff", padding: 24, borderRadius: 14, border: "1px solid #e2e8f0", boxShadow: "0 2px 8px rgba(0,0,0,0.03)" }}>
            <h3 style={{ margin: "0 0 14px", fontSize: 16, fontWeight: 700, color: "#0f172a" }}>
              📊 Subject Targets vs Current Averages
            </h3>

            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {/* Bio */}
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 4 }}>
                  <strong style={{ color: "#047857" }}>Biology Target: {goals.targetBiology} Marks</strong>
                  <span style={{ color: "#64748b" }}>Current: {goals.biologyAverage} avg</span>
                </div>
                <div className="progress-bar-track">
                  <div className="progress-bar-fill" style={{ width: `${bioProgress}%`, background: "#10b981" }} />
                </div>
              </div>

              {/* Physics */}
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 4 }}>
                  <strong style={{ color: "#b45309" }}>Physics Target: {goals.targetPhysics} Marks</strong>
                  <span style={{ color: "#64748b" }}>Current: {goals.physicsAverage} avg</span>
                </div>
                <div className="progress-bar-track">
                  <div className="progress-bar-fill" style={{ width: `${physProgress}%`, background: "#f59e0b" }} />
                </div>
              </div>

              {/* Chem */}
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 4 }}>
                  <strong style={{ color: "#86198f" }}>Chemistry Target: {goals.targetChemistry} Marks</strong>
                  <span style={{ color: "#64748b" }}>Current: {goals.chemistryAverage} avg</span>
                </div>
                <div className="progress-bar-track">
                  <div className="progress-bar-fill" style={{ width: `${chemProgress}%`, background: "#8b5cf6" }} />
                </div>
              </div>
            </div>
          </div>

          {/* Reference Medical College Cutoffs */}
          <div style={{ background: "#ffffff", padding: 24, borderRadius: 14, border: "1px solid #e2e8f0", boxShadow: "0 2px 8px rgba(0,0,0,0.03)" }}>
            <h3 style={{ margin: "0 0 10px", fontSize: 16, fontWeight: 700, color: "#0f172a" }}>
              🏥 Benchmark College Cutoffs (General)
            </h3>
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: "#475569", lineHeight: 1.7 }}>
              <li><strong>AIIMS New Delhi:</strong> 705+ Marks</li>
              <li><strong>VMMC & MAMC Delhi:</strong> 690+ Marks</li>
              <li><strong>Top State Govt Medical Colleges:</strong> 650+ Marks</li>
              <li><strong>All India Quota Safe Zone:</strong> 620+ Marks</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
