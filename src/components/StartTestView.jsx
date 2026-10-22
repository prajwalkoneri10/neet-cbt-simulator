import React, { useState, useEffect } from "react";
import api from "../api/client";
import {
  extractPdfText,
  parseQuestionPDF,
  parseAnswerPDF,
  matchQuestionsWithAnswers,
} from "../utils/pdfParser";

export default function StartTestView({
  availableTests,
  loadingTests,
  onStartTest,
  onCreateCustomTest,
  currentUser,
}) {
  const [activeTab, setActiveTab] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTestForModal, setSelectedTestForModal] = useState(null);
  const [understoodInstructions, setUnderstoodInstructions] = useState(false);

  // Sync with URL hash
  useEffect(() => {
    if (window.location.hash !== "#start-mock-test") {
      window.location.hash = "#start-mock-test";
    }
  }, []);

  // ----------------------------------------------------
  // PERSONAL PDF UPLOADER STATE
  // ----------------------------------------------------
  const [pdfQuestionFile, setPdfQuestionFile] = useState(null);
  const [pdfAnswerFile, setPdfAnswerFile] = useState(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [parsingStatus, setParsingStatus] = useState("");
  const [parsingError, setParsingError] = useState("");
  const [parsingWarnings, setParsingWarnings] = useState([]);
  const [isExtracting, setIsExtracting] = useState(false);

  // Extracted preview items
  const [extractedQuestions, setExtractedQuestions] = useState([]);
  const [rawQuestionText, setRawQuestionText] = useState("");
  const [rawAnswerMap, setRawAnswerMap] = useState({});

  // Personal Test Metadata
  const [personalTitle, setPersonalTitle] = useState("");
  const [personalDuration, setPersonalDuration] = useState(180);
  const [isStartingPersonalTest, setIsStartingPersonalTest] = useState(false);

  // ----------------------------------------------------
  // CUSTOM PRACTICE GENERATOR STATE
  // ----------------------------------------------------
  const [customTitle, setCustomTitle] = useState("Custom NEET Practice Test");
  const [customBioCount, setCustomBioCount] = useState(30);
  const [customPhysCount, setCustomPhysCount] = useState(15);
  const [customChemCount, setCustomChemCount] = useState(15);
  const [customDuration, setCustomDuration] = useState(60);
  const [customCreating, setCustomCreating] = useState(false);
  const [customError, setCustomError] = useState("");

  // Handle Question Paper File (PDF or CSV)
  const handleSelectQuestionFile = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    // Validate size (max 25MB)
    if (file.size > 25 * 1024 * 1024) {
      setParsingError(`File too large (${(file.size / (1024 * 1024)).toFixed(1)}MB). Limit is 25MB.`);
      return;
    }

    setPdfQuestionFile(file);
    setParsingError("");
    setParsingWarnings([]);
    setIsExtracting(true);
    setUploadProgress(25);
    setParsingStatus(`Reading ${file.name}...`);

    try {
      let qList = [];

      if (file.name.toLowerCase().endsWith(".pdf")) {
        setParsingStatus("Extracting text layers from Question Paper PDF...");
        setUploadProgress(50);
        const text = await extractPdfText(file);
        setRawQuestionText(text);

        setParsingStatus("Detecting questions, subjects, and options...");
        setUploadProgress(75);
        const parsed = parseQuestionPDF(text);

        if (!parsed.valid || parsed.questions.length === 0) {
          setParsingError(parsed.errors.join("; ") || "No questions could be detected in this PDF.");
          setIsExtracting(false);
          return;
        }

        qList = parsed.questions;
        if (parsed.warnings.length > 0) {
          setParsingWarnings(parsed.warnings);
        }
      } else {
        // CSV Fallback
        const text = await file.text();
        const lines = text.split(/\r?\n/).filter(Boolean);
        for (let i = 1; i < lines.length; i++) {
          const parts = lines[i].split(",").map((s) => s.trim().replace(/^"|"$/g, ""));
          if (parts.length >= 7) {
            qList.push({
              number: Number(parts[0]) || i,
              subject: parts[1] || "Biology",
              chapter: parts[2] || "General",
              question: parts[3] || "",
              options: [parts[4] || "", parts[5] || "", parts[6] || "", parts[7] || ""],
              confidence: "high",
            });
          }
        }
      }

      // Merge with answer map if answer file was already uploaded
      const matched = matchQuestionsWithAnswers(qList, rawAnswerMap);
      setExtractedQuestions(matched.matchedQuestions);

      // Set default title & duration based on detected count
      if (!personalTitle) {
        setPersonalTitle(file.name.replace(/\.[^/.]+$/, "").replace(/[-_]/g, " "));
      }
      setPersonalDuration(qList.length >= 180 ? 180 : Math.max(15, qList.length));

      setUploadProgress(100);
      setParsingStatus(`✔ Successfully extracted ${qList.length} questions from ${file.name}!`);
    } catch (err) {
      if (err.code === "SCANNED_PDF_DETECTED") {
        setParsingError(err.message);
      } else {
        setParsingError(`Failed to process PDF: ${err.message}`);
      }
      setUploadProgress(0);
    } finally {
      setIsExtracting(false);
    }
  };

  // Handle Answer Key File (PDF or CSV)
  const handleSelectAnswerFile = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (file.size > 25 * 1024 * 1024) {
      setParsingError(`File too large. Limit is 25MB.`);
      return;
    }

    setPdfAnswerFile(file);
    setParsingError("");
    setIsExtracting(true);
    setParsingStatus(`Reading Answer Key ${file.name}...`);

    try {
      let answerMap = {};

      if (file.name.toLowerCase().endsWith(".pdf")) {
        const text = await extractPdfText(file);
        const parsed = parseAnswerPDF(text);
        if (!parsed.valid) {
          setParsingError(parsed.errors.join("; ") || "Could not detect answer key patterns in PDF.");
          setIsExtracting(false);
          return;
        }
        answerMap = parsed.answers;
      } else {
        // CSV Fallback
        const text = await file.text();
        const lines = text.split(/\r?\n/).filter(Boolean);
        for (let i = 1; i < lines.length; i++) {
          const [qNum, ans] = lines[i].split(",").map((s) => s.trim().replace(/^"|"$/g, ""));
          if (qNum && ans) {
            answerMap[String(Number(qNum))] = ans.toUpperCase();
          }
        }
      }

      setRawAnswerMap(answerMap);

      // Merge with extracted questions
      if (extractedQuestions.length > 0) {
        const matched = matchQuestionsWithAnswers(extractedQuestions, answerMap);
        setExtractedQuestions(matched.matchedQuestions);
        setParsingStatus(
          `✔ Answer Key mapped: ${matched.matchedCount} answers matched across ${extractedQuestions.length} questions!`
        );
      } else {
        setParsingStatus(`✔ Answer Key parsed with ${Object.keys(answerMap).length} answers. Now upload the Question Paper.`);
      }
    } catch (err) {
      setParsingError(`Answer key error: ${err.message}`);
    } finally {
      setIsExtracting(false);
    }
  };

  // Inline correction in preview grid
  const handleUpdateItem = (index, field, value) => {
    setExtractedQuestions((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], [field]: value, needsReview: false };
      return copy;
    });
  };

  // Start CBT Exam with Personal Uploaded Paper
  const handleStartPersonalExam = async () => {
    if (!personalTitle.trim()) {
      alert("Please enter a test title for your personal paper.");
      return;
    }

    if (extractedQuestions.length === 0) {
      alert("No questions extracted. Please upload a question paper first.");
      return;
    }

    // Validation
    const invalidItems = extractedQuestions.filter(
      (q) => !q.question.trim() || !q.options || q.options.length < 4 || !q.correctAnswer
    );

    if (invalidItems.length > 0) {
      alert(`There are ${invalidItems.length} questions with missing text, options, or answer key. Please review and correct them in the table before starting.`);
      return;
    }

    setIsStartingPersonalTest(true);
    setParsingError("");

    try {
      // 1. Save personal test to PostgreSQL (associated with currentUser)
      const res = await api.tests.importPersonalTest({
        title: personalTitle.trim(),
        description: `Personal test uploaded from ${pdfQuestionFile?.name || "PDF"} by ${currentUser?.name}`,
        durationMinutes: Number(personalDuration),
        category: "personal",
        questions: extractedQuestions,
      });

      // 2. Launch CBT Exam Mode with this newly created test!
      await onStartTest(res.testId);
    } catch (err) {
      setParsingError(err.message || "Failed to start personal CBT exam.");
      setIsStartingPersonalTest(false);
    }
  };

  // Filter available tests based on tab & search
  const personalTests = availableTests.filter((t) => t.isPersonal || t.category === "personal");

  const filteredTests = availableTests.filter((t) => {
    const matchesSearch =
      t.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.description.toLowerCase().includes(searchQuery.toLowerCase());

    if (!matchesSearch) return false;

    if (activeTab === "all") return true;
    if (activeTab === "my_uploads") return t.isPersonal || t.category === "personal";
    if (activeTab === "full_mock") return t.category === "full_mock" || t.totalQuestions >= 180;
    if (activeTab === "biology") return t.category === "biology" || (t.subjectCounts?.Biology && !t.subjectCounts?.Physics);
    if (activeTab === "physics") return t.category === "physics" || (t.subjectCounts?.Physics && !t.subjectCounts?.Biology);
    if (activeTab === "chemistry") return t.category === "chemistry" || (t.subjectCounts?.Chemistry && !t.subjectCounts?.Biology);
    return true;
  });

  const handleLaunchModal = (test) => {
    setSelectedTestForModal(test);
    setUnderstoodInstructions(false);
  };

  const handleConfirmStart = () => {
    if (!selectedTestForModal || !understoodInstructions) return;
    const testId = selectedTestForModal.id;
    setSelectedTestForModal(null);
    onStartTest(testId);
  };

  const handleCreateCustom = async (e) => {
    e.preventDefault();
    setCustomCreating(true);
    setCustomError("");
    try {
      await onCreateCustomTest({
        title: customTitle,
        durationMinutes: Number(customDuration),
        counts: {
          Biology: Number(customBioCount),
          Physics: Number(customPhysCount),
          Chemistry: Number(customChemCount),
        },
      });
    } catch (err) {
      setCustomError(err.message || "Failed to create custom test.");
    } finally {
      setCustomCreating(false);
    }
  };

  return (
    <div className="start-test-view">
      {/* Header Banner */}
      <section
        style={{
          background: "linear-gradient(135deg, #1e3a8a, #2563eb)",
          color: "#ffffff",
          borderRadius: 16,
          padding: "26px 30px",
          marginBottom: 24,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 16,
          boxShadow: "0 8px 24px rgba(37, 99, 235, 0.18)",
        }}
      >
        <div>
          <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1, background: "rgba(255,255,255,0.2)", padding: "3px 10px", borderRadius: 20 }}>
            START MOCK TEST PORTAL
          </span>
          <h1 style={{ margin: "6px 0 6px", fontSize: 24, fontWeight: 800 }}>
            Take NEET Mock Test or Upload Your Own Paper
          </h1>
          <p style={{ margin: 0, opacity: 0.9, fontSize: 14 }}>
            Practice with pre-loaded NEET papers or upload your coaching test series PDF with instant CBT simulation.
          </p>
        </div>

        <div style={{ display: "flex", gap: 10 }}>
          <button
            onClick={() => setActiveTab("upload")}
            style={{
              background: activeTab === "upload" ? "#ffffff" : "rgba(255,255,255,0.15)",
              color: activeTab === "upload" ? "#1e3a8a" : "#ffffff",
              border: "1px solid rgba(255,255,255,0.3)",
              padding: "9px 16px",
              borderRadius: 8,
              fontWeight: 700,
              fontSize: 13,
              cursor: "pointer",
            }}
          >
            📄 Upload Personal PDF
          </button>
          <button
            onClick={() => setActiveTab("all")}
            style={{
              background: activeTab !== "upload" && activeTab !== "custom" ? "#ffffff" : "rgba(255,255,255,0.15)",
              color: activeTab !== "upload" && activeTab !== "custom" ? "#1e3a8a" : "#ffffff",
              border: "1px solid rgba(255,255,255,0.3)",
              padding: "9px 16px",
              borderRadius: 8,
              fontWeight: 700,
              fontSize: 13,
              cursor: "pointer",
            }}
          >
            📚 Choose Available Test
          </button>
        </div>
      </section>

      {/* Mode 1: PERSONAL PDF UPLOADER */}
      {activeTab === "upload" && (
        <section
          style={{
            background: "#ffffff",
            borderRadius: 14,
            border: "1px solid #e2e8f0",
            padding: 26,
            marginBottom: 24,
            boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
            <div>
              <span style={{ fontSize: 11, fontWeight: 700, color: "#2563eb", textTransform: "uppercase" }}>
                STUDENT PERSONAL UPLOAD
              </span>
              <h2 style={{ margin: "4px 0 0", fontSize: 20, fontWeight: 800, color: "#0f172a" }}>
                📄 Upload Question Paper & Answer Key (PDF)
              </h2>
              <p style={{ margin: "4px 0 0", color: "#64748b", fontSize: 13 }}>
                Upload any medical coaching mock paper (Allen, Aakash, Resonance, etc.) or NEET past year paper.
              </p>
            </div>

            {personalTests.length > 0 && (
              <button
                className="secondary-button"
                style={{ fontSize: 12, padding: "6px 12px" }}
                onClick={() => setActiveTab("my_uploads")}
              >
                View Previously Saved Papers ({personalTests.length}) →
              </button>
            )}
          </div>

          {/* Two Upload Boxes */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 16, marginBottom: 20 }}>
            {/* Box 1: Question Paper */}
            <div
              style={{
                border: pdfQuestionFile ? "2px solid #2563eb" : "2px dashed #cbd5e1",
                background: pdfQuestionFile ? "#eff6ff" : "#f8fafc",
                borderRadius: 12,
                padding: 22,
                textAlign: "center",
              }}
            >
              <div style={{ fontSize: 36, marginBottom: 8 }}>📘</div>
              <strong style={{ display: "block", color: "#0f172a", fontSize: 15, marginBottom: 4 }}>
                1. Upload Question Paper (PDF)
              </strong>
              <p style={{ margin: "0 0 12px", fontSize: 12, color: "#64748b" }}>
                Digital text PDF containing questions and 4 options (A-D or 1-4).
              </p>
              <input
                type="file"
                accept=".pdf,.csv"
                onChange={handleSelectQuestionFile}
                style={{ fontSize: 12 }}
              />
              {pdfQuestionFile && (
                <div style={{ marginTop: 10, fontSize: 12, color: "#1e3a8a", fontWeight: 700 }}>
                  Selected: {pdfQuestionFile.name} ({(pdfQuestionFile.size / 1024).toFixed(0)} KB)
                </div>
              )}
            </div>

            {/* Box 2: Answer Key */}
            <div
              style={{
                border: pdfAnswerFile ? "2px solid #16a34a" : "2px dashed #cbd5e1",
                background: pdfAnswerFile ? "#f0fdf4" : "#f8fafc",
                borderRadius: 12,
                padding: 22,
                textAlign: "center",
              }}
            >
              <div style={{ fontSize: 36, marginBottom: 8 }}>🔑</div>
              <strong style={{ display: "block", color: "#0f172a", fontSize: 15, marginBottom: 4 }}>
                2. Upload Answer Key (PDF)
              </strong>
              <p style={{ margin: "0 0 12px", fontSize: 12, color: "#64748b" }}>
                PDF with answers (e.g. 1-A, 2-B, 3-C or numeric 1-1, 2-2).
              </p>
              <input
                type="file"
                accept=".pdf,.csv"
                onChange={handleSelectAnswerFile}
                style={{ fontSize: 12 }}
              />
              {pdfAnswerFile && (
                <div style={{ marginTop: 10, fontSize: 12, color: "#15803d", fontWeight: 700 }}>
                  Selected: {pdfAnswerFile.name} ({(pdfAnswerFile.size / 1024).toFixed(0)} KB)
                </div>
              )}
            </div>
          </div>

          {/* Progress / Status */}
          {isExtracting && (
            <div style={{ background: "#eff6ff", border: "1px solid #bfdbfe", padding: 14, borderRadius: 8, marginBottom: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "#1e3a8a", marginBottom: 6 }}>
                <strong>{parsingStatus}</strong>
                <span>{uploadProgress}%</span>
              </div>
              <div className="progress-bar-track">
                <div className="progress-bar-fill" style={{ width: `${uploadProgress}%`, background: "#2563eb" }} />
              </div>
            </div>
          )}

          {parsingStatus && !isExtracting && !parsingError && (
            <div style={{ background: "#ecfdf5", border: "1px solid #a7f3d0", color: "#065f46", padding: "10px 14px", borderRadius: 8, marginBottom: 16, fontSize: 13, fontWeight: 600 }}>
              {parsingStatus}
            </div>
          )}

          {parsingError && (
            <div style={{ background: "#fee2e2", border: "1px solid #fca5a5", color: "#b91c1c", padding: "14px 18px", borderRadius: 8, marginBottom: 16 }}>
              <strong style={{ display: "block", marginBottom: 4 }}>⚠️ Extraction Issue</strong>
              <p style={{ margin: 0, fontSize: 13, lineHeight: 1.5 }}>{parsingError}</p>
            </div>
          )}

          {/* Extracted Questions Preview & Start Section */}
          {extractedQuestions.length > 0 && (
            <div style={{ marginTop: 24, paddingTop: 20, borderTop: "1px solid #e2e8f0" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12, marginBottom: 16 }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: "#0f172a" }}>
                    Verified Question Paper Preview ({extractedQuestions.length} Questions Detected)
                  </h3>
                  <span style={{ fontSize: 13, color: "#64748b" }}>
                    Verify question text and answers below. You can make inline corrections before beginning the exam.
                  </span>
                </div>

                <button
                  className="primary-button"
                  disabled={isStartingPersonalTest}
                  onClick={handleStartPersonalExam}
                  style={{
                    background: "#16a34a",
                    padding: "12px 28px",
                    fontWeight: 800,
                    fontSize: 15,
                    boxShadow: "0 4px 14px rgba(22, 163, 74, 0.3)",
                  }}
                >
                  {isStartingPersonalTest ? "Saving & Launching CBT..." : "🚀 Start CBT Exam Now"}
                </button>
              </div>

              {/* Test Parameters */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
                  gap: 14,
                  background: "#f8fafc",
                  padding: 16,
                  borderRadius: 10,
                  border: "1px solid #e2e8f0",
                  marginBottom: 18,
                }}
              >
                <div>
                  <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: "#334155", marginBottom: 4 }}>
                    Test Paper Title
                  </label>
                  <input
                    type="text"
                    value={personalTitle}
                    onChange={(e) => setPersonalTitle(e.target.value)}
                    style={{ width: "100%", padding: "8px 10px", borderRadius: 6, border: "1px solid #cbd5e1", fontSize: 13 }}
                  />
                </div>

                <div>
                  <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: "#334155", marginBottom: 4 }}>
                    Duration (Minutes)
                  </label>
                  <input
                    type="number"
                    min="10"
                    max="300"
                    value={personalDuration}
                    onChange={(e) => setPersonalDuration(e.target.value)}
                    style={{ width: "100%", padding: "8px 10px", borderRadius: 6, border: "1px solid #cbd5e1", fontSize: 13 }}
                  />
                </div>

                <div>
                  <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: "#334155", marginBottom: 4 }}>
                    Questions / Max Score
                  </label>
                  <div style={{ paddingTop: 6, fontWeight: 800, color: "#0f172a", fontSize: 15 }}>
                    {extractedQuestions.length} Qs • {extractedQuestions.length * 4} Marks (+4/-1)
                  </div>
                </div>
              </div>

              {/* Editable Preview Table */}
              <div style={{ maxHeight: 480, overflowY: "auto", border: "1px solid #e2e8f0", borderRadius: 8 }}>
                <table className="custom-table" style={{ border: "none" }}>
                  <thead>
                    <tr>
                      <th style={{ width: 50 }}>#</th>
                      <th style={{ width: 120 }}>Subject</th>
                      <th>Question & Options</th>
                      <th style={{ width: 110 }}>Answer Key</th>
                    </tr>
                  </thead>
                  <tbody>
                    {extractedQuestions.map((q, idx) => {
                      const hasWarning = q.needsReview || !q.question || q.options.some((o) => !o.trim());

                      return (
                        <tr key={idx} style={{ background: hasWarning ? "#fffbeb" : "#ffffff" }}>
                          <td>
                            <strong>{q.number || idx + 1}</strong>
                            {hasWarning && <span style={{ color: "#d97706", display: "block", fontSize: 10 }}>Flagged</span>}
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
                                  placeholder={`Option ${optLetter}`}
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
                              value={q.correctAnswer || "A"}
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
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div style={{ marginTop: 16, display: "flex", justifyContent: "flex-end" }}>
                <button
                  className="primary-button"
                  disabled={isStartingPersonalTest}
                  onClick={handleStartPersonalExam}
                  style={{ background: "#16a34a", padding: "12px 28px", fontWeight: 800, fontSize: 15 }}
                >
                  {isStartingPersonalTest ? "Saving & Launching CBT..." : "🚀 Start CBT Exam Now"}
                </button>
              </div>
            </div>
          )}
        </section>
      )}

      {/* Mode 2: CHOOSE FROM EXISTING & PREVIOUSLY UPLOADED PAPERS */}
      {activeTab !== "upload" && (
        <>
          {/* Sub Navigation Tabs */}
          <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap", alignItems: "center" }}>
            {[
              { id: "all", label: "All Tests" },
              { id: "my_uploads", label: `My Uploaded Papers (${personalTests.length})` },
              { id: "full_mock", label: "Full NEET (180Q / 720M)" },
              { id: "biology", label: "Biology (90Q)" },
              { id: "physics", label: "Physics (45Q)" },
              { id: "chemistry", label: "Chemistry (45Q)" },
              { id: "custom", label: "⚡ Custom Generator" },
            ].map((tab) => {
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  style={{
                    padding: "8px 16px",
                    borderRadius: 8,
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: "pointer",
                    background: isActive ? "#1e3a8a" : "#ffffff",
                    color: isActive ? "#ffffff" : "#475569",
                    border: isActive ? "none" : "1px solid #e2e8f0",
                    boxShadow: isActive ? "0 4px 10px rgba(30, 58, 138, 0.2)" : "none",
                  }}
                >
                  {tab.label}
                </button>
              );
            })}

            <div style={{ marginLeft: "auto", minWidth: 220 }}>
              <input
                type="text"
                placeholder="🔍 Filter tests..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{
                  width: "100%",
                  padding: "8px 12px",
                  borderRadius: 8,
                  border: "1px solid #cbd5e1",
                  fontSize: 13,
                  outline: "none",
                }}
              />
            </div>
          </div>

          {/* Custom Generator Form */}
          {activeTab === "custom" && (
            <section
              style={{
                background: "#ffffff",
                border: "1px solid #e2e8f0",
                borderRadius: 14,
                padding: 28,
                marginBottom: 24,
                maxWidth: 680,
                boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
              }}
            >
              <h2 style={{ margin: "0 0 6px", fontSize: 18, fontWeight: 800, color: "#0f172a" }}>
                Generate Custom Practice Mock Test
              </h2>
              <p style={{ margin: "0 0 16px", color: "#64748b", fontSize: 13 }}>
                Sample questions across subjects from the verified NEET question bank.
              </p>

              {customError && (
                <div style={{ background: "#fee2e2", border: "1px solid #fca5a5", color: "#b91c1c", padding: "10px 14px", borderRadius: 8, marginBottom: 14, fontSize: 13 }}>
                  {customError}
                </div>
              )}

              <form onSubmit={handleCreateCustom}>
                <div style={{ marginBottom: 14 }}>
                  <label style={{ display: "block", fontSize: 13, fontWeight: 700, color: "#334155", marginBottom: 6 }}>
                    Test Title
                  </label>
                  <input
                    type="text"
                    value={customTitle}
                    onChange={(e) => setCustomTitle(e.target.value)}
                    required
                    style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid #cbd5e1", fontSize: 14 }}
                  />
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 14 }}>
                  <div>
                    <label style={{ display: "block", fontSize: 13, fontWeight: 700, color: "#047857", marginBottom: 6 }}>
                      Biology (Q)
                    </label>
                    <input
                      type="number"
                      min="0"
                      max="90"
                      value={customBioCount}
                      onChange={(e) => setCustomBioCount(e.target.value)}
                      style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid #cbd5e1" }}
                    />
                  </div>

                  <div>
                    <label style={{ display: "block", fontSize: 13, fontWeight: 700, color: "#b45309", marginBottom: 6 }}>
                      Physics (Q)
                    </label>
                    <input
                      type="number"
                      min="0"
                      max="45"
                      value={customPhysCount}
                      onChange={(e) => setCustomPhysCount(e.target.value)}
                      style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid #cbd5e1" }}
                    />
                  </div>

                  <div>
                    <label style={{ display: "block", fontSize: 13, fontWeight: 700, color: "#86198f", marginBottom: 6 }}>
                      Chemistry (Q)
                    </label>
                    <input
                      type="number"
                      min="0"
                      max="45"
                      value={customChemCount}
                      onChange={(e) => setCustomChemCount(e.target.value)}
                      style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid #cbd5e1" }}
                    />
                  </div>
                </div>

                <div style={{ marginBottom: 20 }}>
                  <label style={{ display: "block", fontSize: 13, fontWeight: 700, color: "#334155", marginBottom: 6 }}>
                    Duration (Minutes)
                  </label>
                  <input
                    type="number"
                    min="15"
                    max="200"
                    value={customDuration}
                    onChange={(e) => setCustomDuration(e.target.value)}
                    style={{ width: 140, padding: "8px 10px", borderRadius: 8, border: "1px solid #cbd5e1" }}
                  />
                </div>

                <button
                  type="submit"
                  className="primary-button"
                  disabled={customCreating}
                  style={{ background: "#2563eb", padding: "10px 20px" }}
                >
                  {customCreating ? "Generating Test..." : "Generate & Launch Practice Mock"}
                </button>
              </form>
            </section>
          )}

          {/* Test Cards Grid */}
          {loadingTests ? (
            <div style={{ textAlign: "center", padding: "40px", color: "#64748b" }}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>⏳</div>
              <p>Loading available test papers from database...</p>
            </div>
          ) : filteredTests.length > 0 ? (
            <div className="test-cards-grid">
              {filteredTests.map((test) => {
                const isPersonal = test.isPersonal || test.category === "personal";
                const isFullMock = test.category === "full_mock" || test.totalQuestions >= 180;
                const isBio = test.category === "biology";
                const isPhys = test.category === "physics";
                const isChem = test.category === "chemistry";

                let tagClass = "tag-full";
                let tagText = "Full Length Mock";
                if (isPersonal) {
                  tagClass = "tag-full";
                  tagText = "Personal Upload";
                } else if (isBio) {
                  tagClass = "tag-bio";
                  tagText = "Biology Practice";
                } else if (isPhys) {
                  tagClass = "tag-phys";
                  tagText = "Physics Practice";
                } else if (isChem) {
                  tagClass = "tag-chem";
                  tagText = "Chemistry Practice";
                }

                const maxMarks = test.totalMarks || test.totalQuestions * 4;

                return (
                  <div key={test.id} className="test-card">
                    <div>
                      <div className="test-card-header">
                        <span className={`test-category-tag ${tagClass}`}>{tagText}</span>
                        {isPersonal && (
                          <span style={{ fontSize: 11, background: "#ecfdf5", color: "#047857", padding: "2px 8px", borderRadius: 4, fontWeight: 700 }}>
                            👤 Your Paper
                          </span>
                        )}
                        <span style={{ fontSize: 12, color: "#64748b", fontWeight: 600 }}>
                          ID #{test.id}
                        </span>
                      </div>

                      <h3 className="test-card-title">{test.title}</h3>
                      <p className="test-card-desc">
                        {test.description || "Comprehensive NEET computer-based practice test."}
                      </p>

                      <div className="test-card-meta">
                        <div>
                          <small>Questions</small>
                          <strong>{test.totalQuestions} Qs</strong>
                        </div>
                        <div>
                          <small>Duration</small>
                          <strong>{test.durationMinutes} Mins</strong>
                        </div>
                        <div>
                          <small>Max Marks</small>
                          <strong>{maxMarks} M</strong>
                        </div>
                        <div>
                          <small>Marking</small>
                          <strong>+4 / -1</strong>
                        </div>
                      </div>

                      {/* Attempt Status */}
                      <div>
                        {test.attemptsCount > 0 ? (
                          <span className="test-status-pill status-attempted">
                            ✔ Completed {test.attemptsCount}x • Best: {test.bestScore}/{maxMarks}
                          </span>
                        ) : (
                          <span className="test-status-pill status-unattempted">
                            ○ Not Attempted Yet
                          </span>
                        )}
                      </div>
                    </div>

                    <button
                      className="primary-button"
                      style={{
                        width: "100%",
                        padding: "11px",
                        background: "#1e3a8a",
                        fontWeight: 700,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: 8,
                      }}
                      onClick={() => handleLaunchModal(test)}
                    >
                      <span>⏱️</span>
                      <span>{test.attemptsCount > 0 ? "Retake Test" : "Start Test"}</span>
                    </button>
                  </div>
                );
              })}
            </div>
          ) : (
            <div style={{ background: "#ffffff", padding: "40px 20px", textAlign: "center", borderRadius: 12, border: "1px solid #e2e8f0" }}>
              <div style={{ fontSize: 36, marginBottom: 10 }}>📄</div>
              <h3 style={{ margin: "0 0 6px" }}>
                {activeTab === "my_uploads" ? "No Personal Papers Uploaded Yet" : "No Tests Found"}
              </h3>
              <p style={{ color: "#64748b", fontSize: 14, margin: "0 0 16px" }}>
                {activeTab === "my_uploads"
                  ? "You haven't uploaded any personal mock test PDFs yet. Click below to upload your own question paper!"
                  : "No tests matched your current filter criteria."}
              </p>
              <button
                className="primary-button"
                onClick={() => setActiveTab("upload")}
              >
                Upload Question Paper (PDF) →
              </button>
            </div>
          )}
        </>
      )}

      {/* Pre-Exam Instructions Modal */}
      {selectedTestForModal && (
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
          onClick={() => setSelectedTestForModal(null)}
        >
          <div
            style={{
              background: "#ffffff",
              borderRadius: 16,
              maxWidth: 580,
              width: "100%",
              padding: 28,
              boxShadow: "0 20px 40px rgba(0,0,0,0.25)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
              <div>
                <span style={{ fontSize: 12, fontWeight: 700, color: "#2563eb", textTransform: "uppercase" }}>
                  EXAMINATION CONFIRMATION
                </span>
                <h2 style={{ margin: "4px 0 0", fontSize: 20, fontWeight: 800, color: "#0f172a" }}>
                  {selectedTestForModal.title}
                </h2>
              </div>
              <button
                onClick={() => setSelectedTestForModal(null)}
                style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "#64748b" }}
              >
                ✕
              </button>
            </div>

            {/* Test Summary Box */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr 1fr",
                gap: 10,
                background: "#f8fafc",
                padding: "12px 14px",
                borderRadius: 10,
                border: "1px solid #e2e8f0",
                marginBottom: 18,
                textAlign: "center",
              }}
            >
              <div>
                <div style={{ fontSize: 11, color: "#64748b" }}>Questions</div>
                <strong style={{ fontSize: 16, color: "#0f172a" }}>{selectedTestForModal.totalQuestions}</strong>
              </div>
              <div>
                <div style={{ fontSize: 11, color: "#64748b" }}>Duration</div>
                <strong style={{ fontSize: 16, color: "#0f172a" }}>{selectedTestForModal.durationMinutes} Mins</strong>
              </div>
              <div>
                <div style={{ fontSize: 11, color: "#64748b" }}>Max Score</div>
                <strong style={{ fontSize: 16, color: "#0f172a" }}>{selectedTestForModal.totalMarks || selectedTestForModal.totalQuestions * 4}</strong>
              </div>
            </div>

            {/* Instructions */}
            <div style={{ fontSize: 13, color: "#334155", lineHeight: 1.6, marginBottom: 18 }}>
              <h4 style={{ margin: "0 0 8px", fontSize: 14, color: "#0f172a" }}>Official Exam Instructions:</h4>
              <ul style={{ margin: 0, paddingLeft: 18 }}>
                <li><strong>Marking Scheme:</strong> <strong>+4 marks</strong> for every correct answer, <strong>-1 mark</strong> for every incorrect response, <strong>0 marks</strong> for unanswered questions.</li>
                <li><strong>Timer:</strong> The countdown timer will begin immediately when you click Begin. The test will automatically submit when the timer expires.</li>
                <li><strong>Question Palette:</strong> Green = Answered, Red = Visited/Unanswered, Purple = Marked for Review, Grey = Not Visited.</li>
                <li><strong>Autosave:</strong> All answers and marks for review are saved in real-time to the database.</li>
              </ul>
            </div>

            {/* Confirmation Checkbox */}
            <div
              style={{
                background: "#eff6ff",
                border: "1px solid #bfdbfe",
                padding: "12px 14px",
                borderRadius: 8,
                marginBottom: 20,
                display: "flex",
                alignItems: "center",
                gap: 10,
              }}
            >
              <input
                type="checkbox"
                id="ackCheck"
                checked={understoodInstructions}
                onChange={(e) => setUnderstoodInstructions(e.target.checked)}
                style={{ width: 18, height: 18, cursor: "pointer" }}
              />
              <label htmlFor="ackCheck" style={{ fontSize: 13, color: "#1e3a8a", fontWeight: 600, cursor: "pointer" }}>
                I have read, understood, and agreed to follow all examination rules.
              </label>
            </div>

            {/* Actions */}
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button
                type="button"
                className="secondary-button"
                onClick={() => setSelectedTestForModal(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="primary-button"
                disabled={!understoodInstructions}
                onClick={handleConfirmStart}
                style={{
                  background: understoodInstructions ? "#16a34a" : "#cbd5e1",
                  padding: "10px 20px",
                  fontWeight: 700,
                }}
              >
                Begin Examination Now →
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
