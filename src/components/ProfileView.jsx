import React, { useState } from "react";
import api from "../api/client";

export default function ProfileView({
  currentUser,
  studentProfile,
  onProfileUpdated,
  attemptHistory,
}) {
  const [name, setName] = useState(currentUser?.name || "");
  const [targetYear, setTargetYear] = useState(studentProfile?.targetYear || "2027");
  const [preferredSubjects, setPreferredSubjects] = useState(
    studentProfile?.preferredSubjects || ["Biology", "Physics", "Chemistry"]
  );

  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const handleToggleSubject = (sub) => {
    if (preferredSubjects.includes(sub)) {
      if (preferredSubjects.length > 1) {
        setPreferredSubjects(preferredSubjects.filter((s) => s !== sub));
      }
    } else {
      setPreferredSubjects([...preferredSubjects, sub]);
    }
  };

  const handleSaveProfile = async (e) => {
    e.preventDefault();
    setSaving(true);
    setMessage("");
    setError("");

    try {
      await api.profile.update({
        targetYear: Number(targetYear),
        preferredSubjects,
      });

      setMessage("✅ Profile updated successfully!");
      if (onProfileUpdated) onProfileUpdated();
    } catch (err) {
      setError(err.message || "Failed to update profile.");
    } finally {
      setSaving(false);
    }
  };

  const bestScore = attemptHistory.length > 0 ? Math.max(...attemptHistory.map((a) => a.score)) : 0;

  return (
    <div className="profile-view">
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
          ACCOUNT CREDENTIALS & PREFERENCES
        </span>
        <h1 style={{ margin: "4px 0 6px", fontSize: 24, fontWeight: 800, color: "#0f172a" }}>
          Student Profile & Account Settings
        </h1>
        <p style={{ margin: 0, color: "#64748b", fontSize: 14 }}>
          Manage your personal details, target examination cycle, and view platform account stats.
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

      {/* Grid: Profile Form on Left, Account Stats on Right */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))", gap: 24 }}>
        {/* Profile Edit Form */}
        <div style={{ background: "#ffffff", padding: 26, borderRadius: 14, border: "1px solid #e2e8f0", boxShadow: "0 2px 8px rgba(0,0,0,0.03)" }}>
          <h3 style={{ margin: "0 0 16px", fontSize: 17, fontWeight: 800, color: "#0f172a" }}>
            👤 Personal Details
          </h3>

          <form onSubmit={handleSaveProfile}>
            <div style={{ marginBottom: 14 }}>
              <label style={{ display: "block", fontSize: 13, fontWeight: 700, color: "#334155", marginBottom: 6 }}>
                Full Name
              </label>
              <input
                type="text"
                value={name}
                disabled
                style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid #cbd5e1", background: "#f8fafc", color: "#475569" }}
              />
              <small style={{ color: "#64748b" }}>Registered student name linked to account.</small>
            </div>

            <div style={{ marginBottom: 14 }}>
              <label style={{ display: "block", fontSize: 13, fontWeight: 700, color: "#334155", marginBottom: 6 }}>
                Email Address
              </label>
              <input
                type="email"
                value={currentUser?.email || ""}
                disabled
                style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid #cbd5e1", background: "#f8fafc", color: "#475569" }}
              />
            </div>

            <div style={{ marginBottom: 14 }}>
              <label style={{ display: "block", fontSize: 13, fontWeight: 700, color: "#334155", marginBottom: 6 }}>
                Target NEET Examination Year
              </label>
              <select
                value={targetYear}
                onChange={(e) => setTargetYear(e.target.value)}
                style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid #cbd5e1", fontSize: 14 }}
              >
                <option value="2026">NEET UG 2026</option>
                <option value="2027">NEET UG 2027</option>
                <option value="2028">NEET UG 2028</option>
              </select>
            </div>

            <div style={{ marginBottom: 20 }}>
              <label style={{ display: "block", fontSize: 13, fontWeight: 700, color: "#334155", marginBottom: 8 }}>
                Subjects under Preparation
              </label>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                {["Biology", "Physics", "Chemistry"].map((sub) => {
                  const isChecked = preferredSubjects.includes(sub);
                  return (
                    <button
                      type="button"
                      key={sub}
                      onClick={() => handleToggleSubject(sub)}
                      style={{
                        padding: "8px 14px",
                        borderRadius: 8,
                        fontSize: 13,
                        fontWeight: 600,
                        border: isChecked ? "2px solid #2563eb" : "1px solid #cbd5e1",
                        background: isChecked ? "#eff6ff" : "#fff",
                        color: isChecked ? "#1d4ed8" : "#64748b",
                        cursor: "pointer",
                      }}
                    >
                      {isChecked ? "✔ " : ""}{sub}
                    </button>
                  );
                })}
              </div>
            </div>

            <button
              type="submit"
              className="primary-button"
              disabled={saving}
              style={{ width: "100%", padding: "11px", background: "#2563eb", fontWeight: 700 }}
            >
              {saving ? "Saving Changes..." : "Save Profile Details"}
            </button>
          </form>
        </div>

        {/* Account Status & Verification Card */}
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <div style={{ background: "#ffffff", padding: 26, borderRadius: 14, border: "1px solid #e2e8f0", boxShadow: "0 2px 8px rgba(0,0,0,0.03)" }}>
            <h3 style={{ margin: "0 0 14px", fontSize: 16, fontWeight: 700, color: "#0f172a" }}>
              📋 Student Account Verification
            </h3>

            <div style={{ display: "flex", flexDirection: "column", gap: 10, fontSize: 14, color: "#334155" }}>
              <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid #f1f5f9", paddingBottom: 8 }}>
                <span>Account Role:</span>
                <span
                  style={{
                    fontWeight: 700,
                    padding: "2px 8px",
                    borderRadius: 4,
                    background: currentUser?.isAdmin ? "#f3e8ff" : "#eff6ff",
                    color: currentUser?.isAdmin ? "#7e22ce" : "#1d4ed8",
                    fontSize: 12,
                  }}
                >
                  {currentUser?.isAdmin ? "Administrator" : "Registered Student"}
                </span>
              </div>

              <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid #f1f5f9", paddingBottom: 8 }}>
                <span>Database Sync:</span>
                <span style={{ color: "#10b981", fontWeight: 700 }}>PostgreSQL Online ✔</span>
              </div>

              <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid #f1f5f9", paddingBottom: 8 }}>
                <span>Tests Completed:</span>
                <strong>{attemptHistory.length} attempts</strong>
              </div>

              <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid #f1f5f9", paddingBottom: 8 }}>
                <span>Highest Score:</span>
                <strong style={{ color: "#10b981" }}>{bestScore > 0 ? `${bestScore} / 720` : "No tests"}</strong>
              </div>

              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span>Registered At:</span>
                <span>{currentUser?.created_at ? new Date(currentUser.created_at).toLocaleDateString() : "Active"}</span>
              </div>
            </div>
          </div>

          <div style={{ background: "#f8fafc", padding: 20, borderRadius: 14, border: "1px dashed #cbd5e1" }}>
            <h4 style={{ margin: "0 0 6px", fontSize: 14, color: "#0f172a" }}>🔒 Data Protection Guarantee</h4>
            <p style={{ margin: 0, fontSize: 13, color: "#64748b", lineHeight: 1.5 }}>
              All your test responses, timer timestamps, and scores are securely validated and stored in cloud PostgreSQL with bcrypt password hashing.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
