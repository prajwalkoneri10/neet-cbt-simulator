import React, { useState, useEffect, useRef } from "react";
import api from "../api/client";

const SUBJECTS = ["Biology", "Physics", "Chemistry"];

export default function ExamView({
  testId,
  examSession,
  onExamSubmitted,
  currentUser,
}) {
  const { attemptId, testTitle, durationMinutes, questions = [] } = examSession;

  const [currentIdx, setCurrentIdx] = useState(0);
  const [selectedAnswers, setSelectedAnswers] = useState(() => {
    const map = {};
    if (examSession.answers) {
      examSession.answers.forEach((a) => {
        if (a.selectedOption) map[a.questionId] = a.selectedOption;
      });
    }
    return map;
  });

  const [markedQuestions, setMarkedQuestions] = useState(() => {
    const set = new Set();
    if (examSession.answers) {
      examSession.answers.forEach((a) => {
        if (a.isMarkedForReview) set.add(a.questionId);
      });
    }
    return set;
  });

  const [visitedQuestions, setVisitedQuestions] = useState(() => {
    const set = new Set();
    if (questions.length > 0) set.add(questions[0].id);
    return set;
  });

  const [timeLeft, setTimeLeft] = useState(() => {
    if (examSession.startedAt) {
      const elapsed = Math.floor((Date.now() - new Date(examSession.startedAt).getTime()) / 1000);
      const remaining = durationMinutes * 60 - elapsed;
      return Math.max(10, remaining);
    }
    return durationMinutes * 60;
  });

  const [selectedSubjectTab, setSelectedSubjectTab] = useState("Biology");
  const [showSubmitModal, setShowSubmitModal] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [paletteMobileOpen, setPaletteMobileOpen] = useState(false);

  // Timer countdown
  useEffect(() => {
    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          handleAutoSubmit();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  // Autosave answers to backend periodically
  const saveTimeoutRef = useRef(null);

  const triggerAutosave = (answersMap, markedSet, visitedSet) => {
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(async () => {
      try {
        await api.tests.saveProgress(attemptId, {
          answers: answersMap,
          markedQuestions: Array.from(markedSet),
          visitedQuestions: Array.from(visitedSet),
        });
      } catch (e) {
        console.warn("Autosave failed temporarily:", e.message);
      }
    }, 800);
  };

  const currentQ = questions[currentIdx] || null;

  // Track visited questions when moving
  const handleJumpTo = (index) => {
    if (index < 0 || index >= questions.length) return;
    setCurrentIdx(index);
    const targetQ = questions[index];
    if (targetQ) {
      setVisitedQuestions((prev) => {
        const next = new Set(prev);
        next.add(targetQ.id);
        triggerAutosave(selectedAnswers, markedQuestions, next);
        return next;
      });
      if (targetQ.subject && targetQ.subject !== selectedSubjectTab) {
        setSelectedSubjectTab(targetQ.subject);
      }
    }
  };

  const handleSelectOption = (optionLetter) => {
    if (!currentQ) return;
    setSelectedAnswers((prev) => {
      const next = { ...prev, [currentQ.id]: optionLetter };
      triggerAutosave(next, markedQuestions, visitedQuestions);
      return next;
    });
  };

  const handleClearResponse = () => {
    if (!currentQ) return;
    setSelectedAnswers((prev) => {
      const next = { ...prev };
      delete next[currentQ.id];
      triggerAutosave(next, markedQuestions, visitedQuestions);
      return next;
    });
  };

  const handleToggleMarkForReview = () => {
    if (!currentQ) return;
    setMarkedQuestions((prev) => {
      const next = new Set(prev);
      if (next.has(currentQ.id)) {
        next.delete(currentQ.id);
      } else {
        next.add(currentQ.id);
      }
      triggerAutosave(selectedAnswers, next, visitedQuestions);
      return next;
    });
    // Move to next question after marking
    if (currentIdx < questions.length - 1) {
      handleJumpTo(currentIdx + 1);
    }
  };

  const handleSaveAndNext = () => {
    if (currentIdx < questions.length - 1) {
      handleJumpTo(currentIdx + 1);
    }
  };

  const handleAutoSubmit = () => {
    handleSubmit("timeout");
  };

  const handleSubmit = async (reason = "manual") => {
    setIsSubmitting(true);
    try {
      const result = await api.tests.submit(attemptId, {
        finalAnswers: selectedAnswers,
        reason,
      });
      onExamSubmitted(result);
    } catch (err) {
      alert(`Error submitting exam: ${err.message}`);
      setIsSubmitting(false);
    }
  };

  // Format Time: HH:MM:SS
  const formatTime = (seconds) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (h > 0) {
      return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
    }
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  };

  // Stats for palette
  const answeredCount = Object.keys(selectedAnswers).length;
  const markedCount = markedQuestions.size;
  const unansweredCount = questions.length - answeredCount;

  const filteredQuestions = questions.filter((q) => q.subject === selectedSubjectTab);

  return (
    <div className="exam-mode" style={{ minHeight: "100vh", background: "#f1f5f9", display: "flex", flexDirection: "column" }}>
      {/* Top Fixed Header */}
      <header
        style={{
          height: 60,
          background: "#0f172a",
          color: "#ffffff",
          padding: "0 20px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
          position: "sticky",
          top: 0,
          zIndex: 100,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ background: "#2563eb", color: "#fff", padding: "4px 10px", borderRadius: 6, fontWeight: 800, fontSize: 13 }}>
            NEET CBT
          </span>
          <span style={{ fontWeight: 700, fontSize: 15 }}>{testTitle}</span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          {/* Timer Display */}
          <div
            style={{
              background: timeLeft < 300 ? "#dc2626" : timeLeft < 600 ? "#d97706" : "#1e40af",
              color: "#ffffff",
              padding: "6px 14px",
              borderRadius: 8,
              fontWeight: 800,
              fontSize: 16,
              display: "flex",
              alignItems: "center",
              gap: 6,
              letterSpacing: 1,
            }}
          >
            <span>⏱️</span>
            <span>{formatTime(timeLeft)}</span>
          </div>

          <button
            className="primary-button"
            style={{ background: "#16a34a", padding: "8px 18px", fontWeight: 800 }}
            onClick={() => setShowSubmitModal(true)}
          >
            Submit Exam
          </button>

          <button
            className="secondary-button mobile-palette-btn"
            onClick={() => setPaletteMobileOpen((prev) => !prev)}
            style={{ padding: "6px 12px" }}
          >
            📋 Palette
          </button>
        </div>
      </header>

      {/* Subject Navigation Tabs */}
      <div
        style={{
          background: "#ffffff",
          borderBottom: "1px solid #e2e8f0",
          padding: "10px 20px",
          display: "flex",
          gap: 10,
          alignItems: "center",
        }}
      >
        <span style={{ fontSize: 13, fontWeight: 700, color: "#64748b", marginRight: 6 }}>SECTIONS:</span>
        {SUBJECTS.map((sub) => {
          const count = questions.filter((x) => x.subject === sub).length;
          if (count === 0) return null;
          const isActive = selectedSubjectTab === sub;
          return (
            <button
              key={sub}
              onClick={() => {
                setSelectedSubjectTab(sub);
                const firstSubIdx = questions.findIndex((x) => x.subject === sub);
                if (firstSubIdx !== -1) handleJumpTo(firstSubIdx);
              }}
              style={{
                padding: "8px 16px",
                borderRadius: 8,
                fontSize: 13,
                fontWeight: 700,
                cursor: "pointer",
                border: "none",
                background: isActive ? "#1e3a8a" : "#f1f5f9",
                color: isActive ? "#ffffff" : "#475569",
              }}
            >
              {sub} ({count})
            </button>
          );
        })}
      </div>

      {/* Main Examination Split Layout */}
      <main style={{ flex: 1, display: "flex", gap: 20, padding: 20, alignItems: "flex-start", maxWidth: 1400, margin: "0 auto", width: "100%" }}>
        {/* Question Panel */}
        <section
          style={{
            flex: 1,
            background: "#ffffff",
            borderRadius: 14,
            border: "1px solid #e2e8f0",
            padding: 28,
            boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            minHeight: 520,
          }}
        >
          {currentQ ? (
            <div>
              {/* Question Header */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid #e2e8f0", paddingBottom: 12, marginBottom: 18 }}>
                <span style={{ fontSize: 18, fontWeight: 800, color: "#1e3a8a" }}>
                  Question {currentQ.number || currentIdx + 1} of {questions.length}
                </span>
                <span style={{ fontSize: 13, color: "#64748b" }}>
                  Subject: <strong>{currentQ.subject}</strong> • Chapter: <strong>{currentQ.chapter || "General"}</strong> •{" "}
                  <strong style={{ color: "#16a34a" }}>+4</strong> / <strong style={{ color: "#dc2626" }}>-1</strong>
                </span>
              </div>

              {/* Question Text */}
              <div style={{ fontSize: 17, lineHeight: 1.6, color: "#0f172a", fontWeight: 500, marginBottom: 28 }}>
                {currentQ.question}
              </div>

              {/* 4 Options */}
              <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 28 }}>
                {["A", "B", "C", "D"].map((optLetter, optIdx) => {
                  const optText = currentQ.options ? currentQ.options[optIdx] : "";
                  const isSelected = selectedAnswers[currentQ.id] === optLetter;

                  return (
                    <div
                      key={optLetter}
                      onClick={() => handleSelectOption(optLetter)}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 14,
                        padding: "14px 18px",
                        borderRadius: 10,
                        border: isSelected ? "2px solid #2563eb" : "1px solid #cbd5e1",
                        background: isSelected ? "#eff6ff" : "#ffffff",
                        cursor: "pointer",
                        transition: "all 0.15s ease",
                      }}
                    >
                      <div
                        style={{
                          width: 28,
                          height: 28,
                          borderRadius: "50%",
                          background: isSelected ? "#2563eb" : "#f1f5f9",
                          color: isSelected ? "#ffffff" : "#475569",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontWeight: 800,
                          fontSize: 13,
                        }}
                      >
                        {optLetter}
                      </div>
                      <span style={{ fontSize: 15, color: isSelected ? "#1e3a8a" : "#1e293b", fontWeight: isSelected ? 600 : 400 }}>
                        {optText}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div>Loading question...</div>
          )}

          {/* Bottom Action Bar */}
          <div
            style={{
              borderTop: "1px solid #e2e8f0",
              paddingTop: 18,
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexWrap: "wrap",
              gap: 10,
            }}
          >
            <div style={{ display: "flex", gap: 10 }}>
              <button
                type="button"
                className="secondary-button"
                onClick={handleClearResponse}
                style={{ fontSize: 13, padding: "8px 14px" }}
              >
                Clear Response
              </button>
              <button
                type="button"
                className="secondary-button"
                onClick={handleToggleMarkForReview}
                style={{
                  fontSize: 13,
                  padding: "8px 14px",
                  background: currentQ && markedQuestions.has(currentQ.id) ? "#f3e8ff" : "#fff",
                  borderColor: currentQ && markedQuestions.has(currentQ.id) ? "#a855f7" : "#cbd5e1",
                  color: currentQ && markedQuestions.has(currentQ.id) ? "#7e22ce" : "#334155",
                  fontWeight: 600,
                }}
              >
                {currentQ && markedQuestions.has(currentQ.id) ? "★ Marked for Review" : "☆ Mark for Review & Next"}
              </button>
            </div>

            <div style={{ display: "flex", gap: 10 }}>
              <button
                type="button"
                className="secondary-button"
                disabled={currentIdx === 0}
                onClick={() => handleJumpTo(currentIdx - 1)}
                style={{ fontSize: 13, padding: "8px 16px" }}
              >
                ← Previous
              </button>
              <button
                type="button"
                className="primary-button"
                onClick={handleSaveAndNext}
                style={{ fontSize: 13, padding: "8px 20px", background: "#2563eb", fontWeight: 700 }}
              >
                Save & Next →
              </button>
            </div>
          </div>
        </section>

        {/* Question Palette Sidebar */}
        <aside
          style={{
            width: 320,
            background: "#ffffff",
            borderRadius: 14,
            border: "1px solid #e2e8f0",
            padding: 20,
            boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
            <h4 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: "#0f172a" }}>
              Question Palette ({selectedSubjectTab})
            </h4>
          </div>

          {/* Palette Legend */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, fontSize: 12, marginBottom: 16, background: "#f8fafc", padding: 10, borderRadius: 8 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ width: 14, height: 14, borderRadius: 3, background: "#16a34a" }} />
              <span>Answered ({answeredCount})</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ width: 14, height: 14, borderRadius: 3, background: "#dc2626" }} />
              <span>Not Answered ({unansweredCount})</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ width: 14, height: 14, borderRadius: 3, background: "#9333ea" }} />
              <span>Marked ({markedCount})</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ width: 14, height: 14, borderRadius: 3, background: "#cbd5e1" }} />
              <span>Not Visited</span>
            </div>
          </div>

          {/* Questions Grid for Selected Subject */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(5, 1fr)",
              gap: 8,
              maxHeight: 380,
              overflowY: "auto",
              padding: "4px 2px",
            }}
          >
            {filteredQuestions.map((item) => {
              const actualIdx = questions.findIndex((x) => x.id === item.id);
              const isCurrent = actualIdx === currentIdx;
              const isAns = selectedAnswers[item.id] !== undefined;
              const isMkd = markedQuestions.has(item.id);
              const isVis = visitedQuestions.has(item.id);

              let bg = "#f1f5f9";
              let color = "#334155";
              let border = "1px solid #cbd5e1";

              if (isAns && isMkd) {
                bg = "#7e22ce";
                color = "#fff";
              } else if (isMkd) {
                bg = "#9333ea";
                color = "#fff";
              } else if (isAns) {
                bg = "#16a34a";
                color = "#fff";
              } else if (isVis) {
                bg = "#dc2626";
                color = "#fff";
              }

              if (isCurrent) {
                border = "2px solid #000000";
              }

              return (
                <button
                  key={item.id}
                  onClick={() => handleJumpTo(actualIdx)}
                  style={{
                    height: 38,
                    borderRadius: 6,
                    background: bg,
                    color: color,
                    border: border,
                    fontWeight: 700,
                    cursor: "pointer",
                    fontSize: 13,
                  }}
                  title={`Question ${item.number || actualIdx + 1} (${item.subject})`}
                >
                  {item.number || actualIdx + 1}
                </button>
              );
            })}
          </div>
        </aside>
      </main>

      {/* Submit Confirmation Modal */}
      {showSubmitModal && (
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
          onClick={() => setShowSubmitModal(false)}
        >
          <div
            style={{
              background: "#ffffff",
              borderRadius: 16,
              maxWidth: 460,
              width: "100%",
              padding: 30,
              textAlign: "center",
              boxShadow: "0 20px 40px rgba(0,0,0,0.3)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ fontSize: 44, marginBottom: 8 }}>⚠️</div>
            <h2 style={{ margin: "0 0 10px", fontSize: 22, fontWeight: 800, color: "#0f172a" }}>
              Submit Examination?
            </h2>
            <p style={{ color: "#64748b", fontSize: 14, margin: "0 0 20px" }}>
              Are you sure you want to finish? Once submitted, your answers cannot be changed and your scorecard will be computed server-side.
            </p>

            {/* Breakdown Grid */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 12,
                background: "#f8fafc",
                padding: 16,
                borderRadius: 10,
                marginBottom: 24,
              }}
            >
              <div>
                <small style={{ color: "#64748b", fontWeight: 600 }}>Answered Questions</small>
                <div style={{ fontSize: 26, fontWeight: 800, color: "#16a34a" }}>{answeredCount}</div>
              </div>
              <div>
                <small style={{ color: "#64748b", fontWeight: 600 }}>Unanswered Questions</small>
                <div style={{ fontSize: 26, fontWeight: 800, color: "#dc2626" }}>{unansweredCount}</div>
              </div>
            </div>

            <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
              <button
                type="button"
                className="secondary-button"
                disabled={isSubmitting}
                onClick={() => setShowSubmitModal(false)}
                style={{ padding: "10px 18px", fontSize: 14 }}
              >
                Return to Test
              </button>
              <button
                type="button"
                className="primary-button"
                disabled={isSubmitting}
                onClick={() => handleSubmit("manual")}
                style={{ background: "#16a34a", padding: "10px 22px", fontSize: 14, fontWeight: 800 }}
              >
                {isSubmitting ? "Calculating Results..." : "Confirm & Submit Exam"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
