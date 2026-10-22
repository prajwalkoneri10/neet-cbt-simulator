import React, { useState, useEffect } from "react";
import api from "../api/client";
import {
  extractPdfText,
  parseQuestionPDF,
  parseAnswerPDF,
  questionsToCSV,
  answersToCSV,
} from "../utils/pdfParser";

export default function AdminUploadView({ currentUser, onTestPublished }) {
  const isAdmin = Boolean(currentUser?.isAdmin);

  // Platform Stats
  const [stats, setStats] = useState(null);
  const [statsLoading, setStatsLoading] = useState(false);

  // Upload & Extraction Form State
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [durationMinutes, setDurationMinutes] = useState(180);
  const [category, setCategory] = useState("full_mock");

  // Files
  const [qFile, setQFile] = useState(null);
  const [aFile, setAFile] = useState(null);
  const [parsingStatus, setParsingStatus] = useState("");

  // Extracted Questions Preview Grid (Editable before publish)
  const [extractedQuestions, setExtractedQuestions] = useState([]);
  const [validationErrors, setValidationErrors] = useState([]);
  const [publishMessage, setPublishMessage] = useState("");
  const [isPublishing, setIsPublishing] = useState(false);

  useEffect(() => {
    if (isAdmin) {
      loadStats();
    }
  }, [isAdmin]);

  const loadStats = async () => {
    setStatsLoading(true);
    try {
      const data = await api.admin.getStats();
      setStats(data);
    } catch (err) {
      console.warn("Could not load admin stats:", err.message);
    } finally {
      setStatsLoading(false);
    }
  };

  // Handle PDF / CSV Question File Upload
  const handleQuestionFileUpload = async (file) => {
    if (!file) return;
    setQFile(file);
    setParsingStatus(`Reading ${file.name}...`);
    setValidationErrors([]);
    setPublishMessage("");

    try {
      if (file.name.toLowerCase().endsWith(".pdf")) {
        setParsingStatus("Extracting text from Question Paper PDF with pdfjs-dist...");
        const rawText = await extractPdfText(file);
        const parsed = parseQuestionPDF(rawText);

        if (!parsed.valid || parsed.questions.length === 0) {
          setValidationErrors(parsed.errors || ["Could not find questions in PDF."]);
          setParsingStatus("Failed to extract questions from PDF.");
          return;
        }

        setParsingStatus(`Successfully extracted ${parsed.questions.length} questions from PDF!`);
        // Populate preview items
        const items = parsed.questions.map((q, idx) => ({
          number: q.number || idx + 1,
          subject: q.subject || (idx < 90 ? "Biology" : idx < 135 ? "Physics" : "Chemistry"),
          chapter: q.chapter || "General",
          question: q.question,
          options: q.options || ["", "", "", ""],
          correctAnswer: "A", // Default until answer key is parsed
          explanation: "",
        }));
        setExtractedQuestions(items);
        if (!title) setTitle(file.name.replace(/\.[^/.]+$/, ""));
      } else {
        // CSV Question Paper
        const text = await file.text();
        const lines = text.split(/\r?\n/).filter(Boolean);
        const items = [];
        for (let i = 1; i < lines.length; i++) {
          const parts = lines[i].split(",").map((s) => s.trim().replace(/^"|"$/g, ""));
          if (parts.length >= 7) {
            items.push({
              number: Number(parts[0]) || i,
              subject: parts[1] || "Biology",
              chapter: parts[2] || "General",
              question: parts[3] || "",
              options: [parts[4] || "", parts[5] || "", parts[6] || "", parts[7] || ""],
              correctAnswer: "A",
              explanation: "",
            });
          }
        }
        setExtractedQuestions(items);
        setParsingStatus(`Parsed ${items.length} questions from CSV.`);
        if (!title) setTitle(file.name.replace(/\.[^/.]+$/, ""));
      }
    } catch (err) {
      setParsingStatus(`Error parsing file: ${err.message}`);
    }
  };

  // Handle PDF / CSV Answer Key Upload
  const handleAnswerFileUpload = async (file) => {
    if (!file) return;
    setAFile(file);
    setParsingStatus(`Parsing Answer Key: ${file.name}...`);

    try {
      let answerMap = {};
      if (file.name.toLowerCase().endsWith(".pdf")) {
        const text = await extractPdfText(file);
        const parsed = parseAnswerPDF(text);
        if (parsed.valid) {
          parsed.answers.forEach((item) => {
            answerMap[item.questionNumber] = item.correctOption;
          });
        }
      } else {
        const text = await file.text();
        const lines = text.split(/\r?\n/).filter(Boolean);
        for (let i = 1; i < lines.length; i++) {
          const [qNum, ans] = lines[i].split(",").map((s) => s.trim().replace(/^"|"$/g, ""));
          if (qNum && ans) {
            answerMap[Number(qNum)] = ans.toUpperCase();
          }
        }
      }

      // Merge with extracted questions
      if (extractedQuestions.length > 0) {
        const updated = extractedQuestions.map((q) => ({
          ...q,
          correctAnswer: answerMap[q.number] || q.correctAnswer || "A",
        }));
        setExtractedQuestions(updated);
        setParsingStatus(`Matched answer keys for ${Object.keys(answerMap).length} questions!`);
      }
    } catch (err) {
      setParsingStatus(`Error reading answer key: ${err.message}`);
    }
  };

  // Edit question field inline in preview grid
  const handleUpdateItem = (index, field, value) => {
    setExtractedQuestions((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], [field]: value };
      return copy;
    });
  };

  // Publish to Database
  const handlePublish = async () => {
    if (!title.trim()) {
      alert("Please enter a test title.");
      return;
    }

    if (extractedQuestions.length === 0) {
      alert("No questions to publish. Please upload a Question Paper PDF or CSV.");
      return;
    }

    // Validate
    const errors = [];
    extractedQuestions.forEach((q, idx) => {
      if (!q.question || !q.question.trim()) {
        errors.push(`Question #${q.number || idx + 1} has empty text.`);
      }
      if (!q.options || q.options.length < 4 || q.options.some((o) => !o.trim())) {
        errors.push(`Question #${q.number || idx + 1} is missing one or more of the 4 options.`);
      }
      if (!["A", "B", "C", "D"].includes(String(q.correctAnswer).trim().toUpperCase())) {
        errors.push(`Question #${q.number || idx + 1} has invalid correct option: "${q.correctAnswer}".`);
      }
    });

    if (errors.length > 0) {
      setValidationErrors(errors);
      return;
    }

    setIsPublishing(true);
    setValidationErrors([]);
    setPublishMessage("");

    try {
      const res = await api.admin.publishQuestions({
        title,
        description: description || `Uploaded by ${currentUser?.name}`,
        durationMinutes: Number(durationMinutes),
        category,
        questions: extractedQuestions,
      });

      setPublishMessage(`🎉 Test "${title}" successfully published to PostgreSQL with ${extractedQuestions.length} questions!`);
      setExtractedQuestions([]);
      setQFile(null);
      setAFile(null);
      loadStats();
      if (onTestPublished) onTestPublished();
    } catch (err) {
      setValidationErrors([err.message || "Failed to publish question set."]);
    } finally {
      setIsPublishing(false);
    }
  };

  if (!isAdmin) {
    return (
      <div className="admin-upload-view">
        <section
          style={{
            background: "#ffffff",
            border: "1px solid #fee2e2",
            borderRadius: 14,
            padding: "40px 24px",
            textAlign: "center",
            maxWidth: 600,
            margin: "40px auto",
            boxShadow: "0 4px 12px rgba(239, 68, 68, 0.08)",
          }}
        >
          <div style={{ fontSize: 44, marginBottom: 12 }}>🛡️</div>
          <h2 style={{ margin: "0 0 8px", color: "#b91c1c" }}>Administrator Access Restricted</h2>
          <p style={{ color: "#64748b", fontSize: 14, lineHeight: 1.6, margin: "0 0 20px" }}>
            The Question Upload & Publishing Console is protected and restricted to verified administrators and faculty members.
          </p>
          <div style={{ background: "#f8fafc", padding: 14, borderRadius: 8, fontSize: 13, color: "#475569" }}>
            Logged in as: <strong>{currentUser?.email || "Student"}</strong> (Role: Aspirant)
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="admin-upload-view">
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
            ADMINISTRATOR MANAGEMENT
          </span>
          <h1 style={{ margin: "4px 0 6px", fontSize: 24, fontWeight: 800, color: "#0f172a" }}>
            Admin Question Paper & Answer Key Ingestion
          </h1>
          <p style={{ margin: 0, color: "#64748b", fontSize: 14 }}>
            Upload raw question papers and answer keys (PDF/CSV), inspect and edit questions inline, and publish directly to PostgreSQL.
          </p>
        </div>
      </section>

      {/* Platform Statistics */}
      {stats && (
        <div className="kpi-grid" style={{ marginBottom: 24 }}>
          <div className="kpi-card">
            <span className="kpi-label">Total Platform Users</span>
            <div className="kpi-value">{stats.totalUsers || 0}</div>
          </div>
          <div className="kpi-card">
            <span className="kpi-label">Active Question Sets</span>
            <div className="kpi-value">{stats.totalSets || 0}</div>
          </div>
          <div className="kpi-card">
            <span className="kpi-label">Total Questions in Bank</span>
            <div className="kpi-value">{stats.totalQuestions || 0}</div>
          </div>
          <div className="kpi-card">
            <span className="kpi-label">Completed Tests Taken</span>
            <div className="kpi-value">{stats.totalCompletedAttempts || 0}</div>
          </div>
        </div>
      )}

      {publishMessage && (
        <div style={{ background: "#ecfdf5", border: "1px solid #a7f3d0", color: "#065f46", padding: "14px 18px", borderRadius: 10, marginBottom: 20, fontWeight: 700 }}>
          {publishMessage}
        </div>
      )}

      {validationErrors.length > 0 && (
        <div style={{ background: "#fee2e2", border: "1px solid #fca5a5", color: "#b91c1c", padding: "14px 18px", borderRadius: 10, marginBottom: 20 }}>
          <strong>Please resolve the following issues before publishing:</strong>
          <ul style={{ margin: "6px 0 0", paddingLeft: 20, fontSize: 13 }}>
            {validationErrors.slice(0, 5).map((err, i) => (
              <li key={i}>{err}</li>
            ))}
            {validationErrors.length > 5 && <li>...and {validationErrors.length - 5} more issues.</li>}
          </ul>
        </div>
      )}

      {/* Uploader Form */}
      <section style={{ background: "#ffffff", padding: 26, borderRadius: 14, border: "1px solid #e2e8f0", marginBottom: 24, boxShadow: "0 2px 8px rgba(0,0,0,0.03)" }}>
        <h3 style={{ margin: "0 0 16px", fontSize: 17, fontWeight: 800, color: "#0f172a" }}>
          📄 Step 1: Test Metadata & File Ingestion
        </h3>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 16, marginBottom: 16 }}>
          <div>
            <label style={{ display: "block", fontSize: 13, fontWeight: 700, color: "#334155", marginBottom: 6 }}>
              Test Title
            </label>
            <input
              type="text"
              placeholder="e.g. NEET 2026 National Mock Test 02"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid #cbd5e1" }}
            />
          </div>

          <div>
            <label style={{ display: "block", fontSize: 13, fontWeight: 700, color: "#334155", marginBottom: 6 }}>
              Category
            </label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid #cbd5e1" }}
            >
              <option value="full_mock">Full Length Mock (180Q / 720M)</option>
              <option value="biology">Biology Practice (90Q / 360M)</option>
              <option value="physics">Physics Practice (45Q / 180M)</option>
              <option value="chemistry">Chemistry Practice (45Q / 180M)</option>
              <option value="custom">Sectional / Custom</option>
            </select>
          </div>

          <div>
            <label style={{ display: "block", fontSize: 13, fontWeight: 700, color: "#334155", marginBottom: 6 }}>
              Duration (Minutes)
            </label>
            <input
              type="number"
              min="15"
              max="240"
              value={durationMinutes}
              onChange={(e) => setDurationMinutes(e.target.value)}
              style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid #cbd5e1" }}
            />
          </div>
        </div>

        {/* File Drag/Drop Zones */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginTop: 14 }}>
          {/* Question Paper */}
          <div style={{ border: "2px dashed #cbd5e1", borderRadius: 10, padding: 20, textAlign: "center", background: "#f8fafc" }}>
            <div style={{ fontSize: 32, marginBottom: 6 }}>📘</div>
            <strong style={{ display: "block", color: "#0f172a", fontSize: 14, marginBottom: 4 }}>
              1. Upload Question Paper (PDF or CSV)
            </strong>
            <p style={{ margin: "0 0 10px", fontSize: 12, color: "#64748b" }}>
              Upload standard PDF with numbered questions or CSV with question, optionA..D.
            </p>
            <input
              type="file"
              accept=".pdf,.csv"
              onChange={(e) => handleQuestionFileUpload(e.target.files[0])}
              style={{ fontSize: 12 }}
            />
            {qFile && <div style={{ marginTop: 6, fontSize: 12, color: "#2563eb", fontWeight: 600 }}>Selected: {qFile.name}</div>}
          </div>

          {/* Answer Key */}
          <div style={{ border: "2px dashed #cbd5e1", borderRadius: 10, padding: 20, textAlign: "center", background: "#f8fafc" }}>
            <div style={{ fontSize: 32, marginBottom: 6 }}>🔑</div>
            <strong style={{ display: "block", color: "#0f172a", fontSize: 14, marginBottom: 4 }}>
              2. Upload Answer Key (PDF or CSV)
            </strong>
            <p style={{ margin: "0 0 10px", fontSize: 12, color: "#64748b" }}>
              PDF text or CSV with Question,Answer format (e.g. 1-A, 2-B).
            </p>
            <input
              type="file"
              accept=".pdf,.csv"
              onChange={(e) => handleAnswerFileUpload(e.target.files[0])}
              style={{ fontSize: 12 }}
            />
            {aFile && <div style={{ marginTop: 6, fontSize: 12, color: "#2563eb", fontWeight: 600 }}>Selected: {aFile.name}</div>}
          </div>
        </div>

        {parsingStatus && (
          <div style={{ marginTop: 14, padding: "8px 12px", background: "#eff6ff", borderRadius: 6, fontSize: 13, color: "#1d4ed8" }}>
            ℹ️ {parsingStatus}
          </div>
        )}
      </section>

      {/* Editable Preview Grid before publish */}
      {extractedQuestions.length > 0 && (
        <section style={{ background: "#ffffff", padding: 26, borderRadius: 14, border: "1px solid #e2e8f0", boxShadow: "0 2px 8px rgba(0,0,0,0.03)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <div>
              <h3 style={{ margin: "0 0 4px", fontSize: 17, fontWeight: 800, color: "#0f172a" }}>
                Step 2: Review & Edit Questions Before Publishing ({extractedQuestions.length} Total)
              </h3>
              <p style={{ margin: 0, fontSize: 13, color: "#64748b" }}>
                You can adjust question text, correct answers, and subject classifications inline.
              </p>
            </div>

            <button
              className="primary-button"
              disabled={isPublishing}
              onClick={handlePublish}
              style={{ background: "#16a34a", padding: "10px 24px", fontWeight: 800 }}
            >
              {isPublishing ? "Publishing to PostgreSQL..." : "🚀 Publish Question Set to Live Platform"}
            </button>
          </div>

          <div style={{ maxHeight: 600, overflowY: "auto", border: "1px solid #e2e8f0", borderRadius: 8 }}>
            <table className="custom-table" style={{ border: "none" }}>
              <thead>
                <tr>
                  <th style={{ width: 60 }}>#</th>
                  <th style={{ width: 120 }}>Subject</th>
                  <th style={{ width: 140 }}>Chapter</th>
                  <th>Question & Options</th>
                  <th style={{ width: 100 }}>Correct Option</th>
                </tr>
              </thead>
              <tbody>
                {extractedQuestions.map((q, idx) => (
                  <tr key={idx}>
                    <td>
                      <strong>{q.number || idx + 1}</strong>
                    </td>
                    <td>
                      <select
                        value={q.subject}
                        onChange={(e) => handleUpdateItem(idx, "subject", e.target.value)}
                        style={{ width: "100%", padding: "4px", fontSize: 12 }}
                      >
                        <option value="Biology">Biology</option>
                        <option value="Physics">Physics</option>
                        <option value="Chemistry">Chemistry</option>
                      </select>
                    </td>
                    <td>
                      <input
                        type="text"
                        value={q.chapter}
                        onChange={(e) => handleUpdateItem(idx, "chapter", e.target.value)}
                        style={{ width: "100%", padding: "4px", fontSize: 12 }}
                      />
                    </td>
                    <td>
                      <textarea
                        rows={2}
                        value={q.question}
                        onChange={(e) => handleUpdateItem(idx, "question", e.target.value)}
                        style={{ width: "100%", fontSize: 13, padding: "4px 8px", marginBottom: 6 }}
                      />
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4 }}>
                        {["A", "B", "C", "D"].map((optLetter, optIdx) => (
                          <input
                            key={optLetter}
                            type="text"
                            placeholder={`Opt ${optLetter}`}
                            value={q.options[optIdx] || ""}
                            onChange={(e) => {
                              const opts = [...q.options];
                              opts[optIdx] = e.target.value;
                              handleUpdateItem(idx, "options", opts);
                            }}
                            style={{ fontSize: 12, padding: "3px 6px" }}
                          />
                        ))}
                      </div>
                    </td>
                    <td>
                      <select
                        value={q.correctAnswer}
                        onChange={(e) => handleUpdateItem(idx, "correctAnswer", e.target.value)}
                        style={{ width: "100%", padding: "6px", fontWeight: 700, fontSize: 14 }}
                      >
                        <option value="A">A</option>
                        <option value="B">B</option>
                        <option value="C">C</option>
                        <option value="D">D</option>
                      </select>
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
