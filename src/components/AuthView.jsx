import React, { useState } from "react";
import api from "../api/client";

export default function AuthView({ onLoginSuccess }) {
  const [mode, setMode] = useState("login"); // 'login' | 'signup' | 'forgot'
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setMessage("");
    setLoading(true);

    try {
      if (mode === "signup") {
        if (!name.trim()) throw new Error("Name is required.");
        if (password.length < 6) throw new Error("Password must be at least 6 characters.");
        if (password !== confirmPassword) throw new Error("Passwords do not match.");

        const res = await api.auth.signup({ name: name.trim(), email: email.trim(), password });
        localStorage.setItem("neetAuthToken", res.token);
        onLoginSuccess(res.user, res.profile);
      } else if (mode === "login") {
        const res = await api.auth.login({ email: email.trim(), password });
        localStorage.setItem("neetAuthToken", res.token);
        onLoginSuccess(res.user, res.profile);
      } else if (mode === "forgot") {
        await api.auth.requestReset(email.trim());
        setMessage("If an account exists for this email, password reset instructions have been sent.");
      }
    } catch (err) {
      setError(err.message || "Authentication failed. Please check credentials.");
    } finally {
      setLoading(false);
    }
  };

  const handleFillDemo = (demoEmail, demoPass) => {
    setEmail(demoEmail);
    setPassword(demoPass);
    setMode("login");
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "linear-gradient(135deg, #0f172a, #1e3a8a)",
        padding: 20,
      }}
    >
      <div
        style={{
          background: "#ffffff",
          borderRadius: 18,
          maxWidth: 440,
          width: "100%",
          padding: 34,
          boxShadow: "0 20px 45px rgba(0,0,0,0.3)",
        }}
      >
        {/* Brand */}
        <div style={{ textAlign: "center", marginBottom: 24 }}>
          <div
            style={{
              width: 52,
              height: 52,
              background: "linear-gradient(135deg, #2563eb, #38bdf8)",
              borderRadius: 12,
              margin: "0 auto 12px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 26,
              fontWeight: 800,
              color: "#fff",
              boxShadow: "0 6px 16px rgba(37, 99, 235, 0.35)",
            }}
          >
            N
          </div>
          <h1 style={{ margin: "0 0 4px", fontSize: 22, fontWeight: 800, color: "#0f172a" }}>
            NEET CBT Simulator
          </h1>
          <p style={{ margin: 0, color: "#64748b", fontSize: 13 }}>
            National Eligibility cum Entrance Test Practice Portal
          </p>
        </div>

        {/* Tab switch */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 6,
            background: "#f1f5f9",
            padding: 4,
            borderRadius: 10,
            marginBottom: 20,
          }}
        >
          <button
            type="button"
            onClick={() => { setMode("login"); setError(""); setMessage(""); }}
            style={{
              border: "none",
              padding: "9px",
              borderRadius: 8,
              fontWeight: 700,
              fontSize: 13,
              cursor: "pointer",
              background: mode === "login" ? "#ffffff" : "transparent",
              color: mode === "login" ? "#1e3a8a" : "#64748b",
              boxShadow: mode === "login" ? "0 2px 6px rgba(0,0,0,0.06)" : "none",
            }}
          >
            Sign In
          </button>
          <button
            type="button"
            onClick={() => { setMode("signup"); setError(""); setMessage(""); }}
            style={{
              border: "none",
              padding: "9px",
              borderRadius: 8,
              fontWeight: 700,
              fontSize: 13,
              cursor: "pointer",
              background: mode === "signup" ? "#ffffff" : "transparent",
              color: mode === "signup" ? "#1e3a8a" : "#64748b",
              boxShadow: mode === "signup" ? "0 2px 6px rgba(0,0,0,0.06)" : "none",
            }}
          >
            Create Account
          </button>
        </div>

        {error && (
          <div style={{ background: "#fee2e2", border: "1px solid #fca5a5", color: "#b91c1c", padding: "10px 14px", borderRadius: 8, marginBottom: 16, fontSize: 13 }}>
            {error}
          </div>
        )}

        {message && (
          <div style={{ background: "#ecfdf5", border: "1px solid #a7f3d0", color: "#065f46", padding: "10px 14px", borderRadius: 8, marginBottom: 16, fontSize: 13 }}>
            {message}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          {mode === "signup" && (
            <div style={{ marginBottom: 14 }}>
              <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: "#334155", marginBottom: 5 }}>
                Full Name
              </label>
              <input
                type="text"
                required
                placeholder="Dr. Prajwal Koneri"
                value={name}
                onChange={(e) => setName(e.target.value)}
                style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid #cbd5e1", fontSize: 14 }}
              />
            </div>
          )}

          <div style={{ marginBottom: 14 }}>
            <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: "#334155", marginBottom: 5 }}>
              Email Address
            </label>
            <input
              type="email"
              required
              placeholder="student@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid #cbd5e1", fontSize: 14 }}
            />
          </div>

          {mode !== "forgot" && (
            <div style={{ marginBottom: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
                <label style={{ fontSize: 12, fontWeight: 700, color: "#334155" }}>
                  Password
                </label>
                {mode === "login" && (
                  <button
                    type="button"
                    onClick={() => setMode("forgot")}
                    style={{ background: "none", border: "none", padding: 0, fontSize: 12, color: "#2563eb", cursor: "pointer" }}
                  >
                    Forgot password?
                  </button>
                )}
              </div>
              <input
                type="password"
                required
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid #cbd5e1", fontSize: 14 }}
              />
            </div>
          )}

          {mode === "signup" && (
            <div style={{ marginBottom: 18 }}>
              <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: "#334155", marginBottom: 5 }}>
                Confirm Password
              </label>
              <input
                type="password"
                required
                placeholder="••••••••"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid #cbd5e1", fontSize: 14 }}
              />
            </div>
          )}

          <button
            type="submit"
            className="primary-button"
            disabled={loading}
            style={{ width: "100%", padding: "12px", background: "#1e3a8a", fontWeight: 700, fontSize: 14, marginTop: 6 }}
          >
            {loading
              ? "Connecting to PostgreSQL..."
              : mode === "signup"
              ? "Register Account & Begin"
              : mode === "login"
              ? "Sign In to Test Dashboard"
              : "Send Password Reset Link"}
          </button>
        </form>

        {/* Demo Accounts Bar */}
        <div style={{ marginTop: 22, paddingTop: 18, borderTop: "1px solid #f1f5f9", textAlign: "center" }}>
          <span style={{ fontSize: 11, color: "#94a3b8", display: "block", marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.5 }}>
            Quick Demo Accounts
          </span>
          <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
            <button
              type="button"
              className="secondary-button"
              style={{ fontSize: 11, padding: "5px 10px" }}
              onClick={() => handleFillDemo("prajwalkoneri10@gmail.com", "password123")}
            >
              🔑 Prajwal (Admin)
            </button>
            <button
              type="button"
              className="secondary-button"
              style={{ fontSize: 11, padding: "5px 10px" }}
              onClick={() => handleFillDemo("postgrestest@example.com", "password123")}
            >
              👤 Student Demo
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
