import { useEffect, useMemo, useState } from "react";
import "./style.css";
import defaultQuestions from "./questions/neetQuestions";
import defaultAnswerKey from "./answerKeys/answerKey";

const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:5000/api";
const SUBJECTS = ["Biology", "Physics", "Chemistry"];
const ANSWERS = { A: 0, B: 1, C: 2, D: 3 };
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function App() {
  const [page, setPage] = useState(() => {
    const token = new URLSearchParams(window.location.hash.replace(/^#/, "")).get("reset");
    if (token) return "reset";
    return localStorage.getItem("neetAuthToken") ? "home" : "login";
  });
  const [currentUser, setCurrentUser] = useState(null), [authChecking, setAuthChecking] = useState(true);
  const [authMode, setAuthMode] = useState("login"), [authName, setAuthName] = useState(""), [authEmail, setAuthEmail] = useState(""), [authPassword, setAuthPassword] = useState(""), [authConfirmPassword, setAuthConfirmPassword] = useState(""), [authMessage, setAuthMessage] = useState("");
  const [resetToken, setResetToken] = useState(() => new URLSearchParams(window.location.hash.replace(/^#/, "")).get("reset") || "");
  const [resetUrl, setResetUrl] = useState("");
  const [questions, setQuestions] = useState(defaultQuestions), [selectedSubject, setSelectedSubject] = useState("Biology"), [examName, setExamName] = useState("NEET Mock Test 01"), [currentQuestion, setCurrentQuestion] = useState(0), [selectedAnswers, setSelectedAnswers] = useState({}), [markedQuestions, setMarkedQuestions] = useState(new Set()), [timeLeft, setTimeLeft] = useState(180 * 60), [submitted, setSubmitted] = useState(false), [showSubmitConfirmation, setShowSubmitConfirmation] = useState(false);
  const [uploadedAnswerKey, setUploadedAnswerKey] = useState(defaultAnswerKey), [questionFileName, setQuestionFileName] = useState(""), [answerFileName, setAnswerFileName] = useState(""), [uploadMessage, setUploadMessage] = useState(""), [questionValidation, setQuestionValidation] = useState(null), [answerValidation, setAnswerValidation] = useState(null), [paperAnswerMatch, setPaperAnswerMatch] = useState(null), [showPaperPreview, setShowPaperPreview] = useState(false);
  const [activeExamId, setActiveExamId] = useState("default");
  const [savedSessions, setSavedSessions] = useState(() => { try { const x = localStorage.getItem("neetExamSessions"); if (x) return JSON.parse(x); const old = localStorage.getItem("neetExamSession"); if (old) { const s = JSON.parse(old), id = s.examId || "default"; return { [id]: { ...s, examId: id } }; } } catch {} return {}; });
  const [attemptHistory, setAttemptHistory] = useState(() => { try { return JSON.parse(localStorage.getItem("neetAttemptHistory") || "[]"); } catch { return []; } });
  const [examAttemptHistory, setExamAttemptHistory] = useState(() => { try { return JSON.parse(localStorage.getItem("neetExamAttemptHistory") || "{}"); } catch { return {}; } });
  const [examLibrary, setExamLibrary] = useState(() => { try { return JSON.parse(localStorage.getItem("neetExamLibrary") || "[]"); } catch { return []; } });
  const [selectedMockTestDetails, setSelectedMockTestDetails] = useState(null);
  const [builderQuestions, setBuilderQuestions] = useState([]), [builderAnswerKey, setBuilderAnswerKey] = useState({}), [builderQuestionFileName, setBuilderQuestionFileName] = useState(""), [builderAnswerFileName, setBuilderAnswerFileName] = useState(""), [builderMessage, setBuilderMessage] = useState(""), [builderExamName, setBuilderExamName] = useState("Custom NEET Mock Test"), [generatedMock, setGeneratedMock] = useState(null);
  const [builderCounts, setBuilderCounts] = useState({ Biology: 90, Physics: 45, Chemistry: 45 });
  const [builderChapterSelections, setBuilderChapterSelections] = useState({ Biology: [], Physics: [], Chemistry: [] });
  const [studentProfile, setStudentProfile] = useState(() => { try { return JSON.parse(localStorage.getItem("neetStudentProfile")) || { name: "", targetYear: "2027", targetScore: "650", preferredSubjects: [...SUBJECTS] }; } catch { return { name: "", targetYear: "2027", targetScore: "650", preferredSubjects: [...SUBJECTS] }; } });
  const [profileMessage, setProfileMessage] = useState("");
  const [cloudSyncMessage, setCloudSyncMessage] = useState("");
  const [cloudSyncing, setCloudSyncing] = useState(false);

  const apiRequest = async (path, options = {}) => {
  const token = localStorage.getItem("neetAuthToken");

  try {
    const response = await fetch(`${API_BASE_URL}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(options.headers || {}),
      },
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(
        data.message ||
        data.error ||
        `Request failed with status ${response.status}`
      );
    }

    return data;
  } catch (error) {
    console.error("API request failed:", error);
    throw error;
  }
};

  const getMergedProfile = (profile, user = currentUser) => ({
    name: String(profile?.name || user?.name || "").trim(),
    targetYear: String(profile?.targetYear || "2027"),
    targetScore: String(profile?.targetScore ?? "650"),
    preferredSubjects: Array.isArray(profile?.preferredSubjects)
      ? profile.preferredSubjects
      : [...SUBJECTS],
  });

  const loadProfile = async (user = currentUser) => {
    try {
      const d = await apiRequest("/profile");
      if (d.profile) {
        const merged = getMergedProfile(d.profile, user);
        setStudentProfile(merged);
        localStorage.setItem("neetStudentProfile", JSON.stringify(merged));
      } else if (user?.name) {
        const merged = getMergedProfile({}, user);
        setStudentProfile(merged);
        localStorage.setItem("neetStudentProfile", JSON.stringify(merged));
      }
    } catch (e) {
      console.error("Unable to load profile:", e);
      if (user?.name) {
        setStudentProfile(prev => getMergedProfile(prev, user));
      }
    }
  };

  const syncCloudData = async (user = currentUser) => {
    if (!user) return;

    setCloudSyncing(true);
    setCloudSyncMessage("");

    try {
      const [mockData, sessionData, attemptData] = await Promise.all([
        apiRequest("/cloud/mock-tests"),
        apiRequest("/cloud/exam-sessions"),
        apiRequest("/cloud/attempt-history")
      ]);

      const ownerKey = "neetLocalDataOwner";
      const previousOwner = localStorage.getItem(ownerKey);
      const sameOwner = !previousOwner || previousOwner === user.email;

      const localMocks = sameOwner
        ? JSON.parse(localStorage.getItem("neetExamLibrary") || "[]")
        : [];
      const localSessions = sameOwner
        ? JSON.parse(localStorage.getItem("neetExamSessions") || "{}")
        : {};
      const localAttempts = sameOwner
        ? JSON.parse(localStorage.getItem("neetAttemptHistory") || "[]")
        : [];
      const localExamAttempts = sameOwner
        ? JSON.parse(localStorage.getItem("neetExamAttemptHistory") || "{}")
        : {};

      const cloudMocks = Array.isArray(mockData.mockTests) ? mockData.mockTests : [];
      const cloudSessions = Array.isArray(sessionData.sessions) ? sessionData.sessions : [];
      const cloudAttempts = Array.isArray(attemptData.attempts) ? attemptData.attempts : [];

      // Merge legacy local data into the account only when it belongs to
      // this user (or has never been assigned to an account before).
      const mockMap = new Map();
      [...cloudMocks, ...localMocks].forEach(m => {
        if (m?.id) mockMap.set(String(m.id), m);
      });
      const mergedMocks = [...mockMap.values()];

      const sessionMap = new Map();
      cloudSessions.forEach(s => {
        if (s?.examId) sessionMap.set(String(s.examId), s.sessionData || s);
      });
      if (sameOwner) {
        Object.entries(localSessions || {}).forEach(([id, session]) => {
          if (session && !sessionMap.has(String(id))) {
            sessionMap.set(String(id), session);
          }
        });
      }
      const mergedSessions = Object.fromEntries(sessionMap.entries());

      const attemptMap = new Map();
      [...cloudAttempts, ...localAttempts].forEach(a => {
        if (a?.id != null) attemptMap.set(String(a.id), a);
      });
      const mergedAttempts = [...attemptMap.values()]
        .sort((a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0))
        .slice(0, 10);

      const mergedExamAttempts = { ...localExamAttempts };
      cloudAttempts.forEach(a => {
        if (!a?.examId) return;
        mergedExamAttempts[a.examId] = [
          a,
          ...(mergedExamAttempts[a.examId] || []).filter(x => String(x.id) !== String(a.id))
        ].slice(0, 50);
      });

      setExamLibrary(mergedMocks);
      setSavedSessions(mergedSessions);
      setAttemptHistory(mergedAttempts);
      setExamAttemptHistory(mergedExamAttempts);

      localStorage.setItem("neetExamLibrary", JSON.stringify(mergedMocks));
      localStorage.setItem("neetExamSessions", JSON.stringify(mergedSessions));
      localStorage.setItem("neetAttemptHistory", JSON.stringify(mergedAttempts));
      localStorage.setItem("neetExamAttemptHistory", JSON.stringify(mergedExamAttempts));
      localStorage.setItem(ownerKey, user.email);

      // Upload local records that are not already present in the cloud.
      if (sameOwner) {
        const cloudMockIds = new Set(cloudMocks.map(x => String(x.id)));
        await Promise.all(
          localMocks
            .filter(m => m?.id && !cloudMockIds.has(String(m.id)))
            .map(m =>
              apiRequest("/cloud/mock-tests", {
                method: "POST",
                body: JSON.stringify(m)
              }).catch(() => null)
            )
        );

        const cloudSessionIds = new Set(cloudSessions.map(x => String(x.examId)));
        await Promise.all(
          Object.entries(localSessions || {})
            .filter(([id]) => !cloudSessionIds.has(String(id)))
            .map(([examId, sessionData]) =>
              apiRequest("/cloud/exam-sessions", {
                method: "POST",
                body: JSON.stringify({ examId, sessionData })
              }).catch(() => null)
            )
        );

        const cloudAttemptIds = new Set(cloudAttempts.map(x => String(x.id)));
        await Promise.all(
          localAttempts
            .filter(a => a?.id != null && !cloudAttemptIds.has(String(a.id)))
            .map(a =>
              apiRequest("/cloud/attempt-history", {
                method: "POST",
                body: JSON.stringify(a)
              }).catch(() => null)
            )
        );
      }

      setCloudSyncMessage("☁️ Cloud Sync connected");
    } catch (error) {
      console.error("Cloud sync load error:", error);
      setCloudSyncMessage("⚠️ Cloud Sync unavailable. Local data is still available.");
    } finally {
      setCloudSyncing(false);
    }
  };

  useEffect(() => {
    const tokenFromHash = new URLSearchParams(window.location.hash.replace(/^#/, "")).get("reset");
    if (tokenFromHash) {
      setResetToken(tokenFromHash);
      setPage("reset");
      setAuthChecking(false);
      return;
    }

    const token = localStorage.getItem("neetAuthToken");
    if (!token) { setPage("login"); setAuthChecking(false); return; }
    apiRequest("/auth/me").then(async d => { setCurrentUser(d.user); setPage("home"); await loadProfile(d.user); await syncCloudData(d.user); }).catch(() => { localStorage.removeItem("neetAuthToken"); setCurrentUser(null); setPage("login"); }).finally(() => setAuthChecking(false));
  }, []);

  const resetAuth = () => { setAuthName(""); setAuthEmail(""); setAuthPassword(""); setAuthConfirmPassword(""); setAuthMessage(""); setResetUrl(""); };
  const switchAuth = mode => { resetAuth(); setAuthMode(mode); setPage(mode); };
  const openResetUrl = url => {
    try {
      const parsed = new URL(url);
      const token = new URLSearchParams(parsed.hash.replace(/^#/, "")).get("reset");
      if (!token) throw new Error("Reset token was not found.");
      setResetToken(token);
      setAuthPassword("");
      setAuthConfirmPassword("");
      setAuthMessage("");
      window.history.replaceState(null, "", `${parsed.pathname}${parsed.search}#reset=${encodeURIComponent(token)}`);
      setPage("reset");
    } catch (e) {
      setAuthMessage(`❌ ${e.message}`);
    }
  };

  const handleSignup = async () => {
    const name = authName.trim(), email = authEmail.trim().toLowerCase();
    if (!name) return setAuthMessage("❌ Please enter your name.");
    if (!emailRegex.test(email)) return setAuthMessage("❌ Please enter a valid email address.");
    if (authPassword.length < 6) return setAuthMessage("❌ Password must contain at least 6 characters.");
    if (authPassword !== authConfirmPassword) return setAuthMessage("❌ Passwords do not match.");
    try { const d = await apiRequest("/api/auth/signup", { method: "POST", body: JSON.stringify({ name, email, password: authPassword }) }); if (!d.token) throw new Error("Server did not return an authentication token."); localStorage.setItem("neetAuthToken", d.token); setCurrentUser(d.user); const merged = getMergedProfile(d.profile, d.user || { name }); setStudentProfile(merged); localStorage.setItem("neetStudentProfile", JSON.stringify(merged)); await syncCloudData(d.user || { name, email }); resetAuth(); setPage("home"); } catch (e) { setAuthMessage(`❌ ${e.message}`); }
  };
  const handleLogin = async () => {
    const email = authEmail.trim().toLowerCase();
    if (!email || !authPassword) return setAuthMessage("❌ Enter your email and password.");
    try { const d = await apiRequest("/auth/login", { method: "POST", body: JSON.stringify({ email, password: authPassword }) }); if (!d.token) throw new Error("Server did not return an authentication token."); localStorage.setItem("neetAuthToken", d.token); setCurrentUser(d.user); if (d.profile) { const merged = getMergedProfile(d.profile, d.user); setStudentProfile(merged); localStorage.setItem("neetStudentProfile", JSON.stringify(merged)); } else await loadProfile(d.user); resetAuth(); setPage("home"); } catch (e) { setAuthMessage(`❌ ${e.message}`); }
  };
  const handleForgotPassword = async () => {
  const email = authEmail.trim().toLowerCase();

  if (!emailRegex.test(email)) {
    return setAuthMessage(
      "❌ Please enter a valid email address."
    );
  }

  try {
    const d = await apiRequest(
      "/auth/request-password-reset",
      {
        method: "POST",
        body: JSON.stringify({ email }),
      }
    );

    setAuthPassword("");
    setAuthConfirmPassword("");

    if (d.resetUrl) {
      setResetUrl(d.resetUrl);

      setAuthMessage(
        "✅ Reset link created. Check your email for the password reset link."
      );
    } else {
      setAuthMessage(
        "✅ If an account exists for that email, a password reset link has been sent. Check your email."
      );
    }
  } catch (e) {
    setAuthMessage(`❌ ${e.message}`);
  }
};
  const handleResetPassword = async () => {
    if (!resetToken) return setAuthMessage("❌ Reset token is missing or invalid.");
    if (authPassword.length < 6) return setAuthMessage("❌ New password must contain at least 6 characters.");
    if (authPassword !== authConfirmPassword) return setAuthMessage("❌ Passwords do not match.");
    try {
      await apiRequest("/auth/reset-password", {
        method: "POST",
        body: JSON.stringify({ token: resetToken, newPassword: authPassword }),
      });
      setAuthMessage("✅ Password reset successfully. You can now log in.");
      setAuthPassword("");
      setAuthConfirmPassword("");
      setResetToken("");
      window.history.replaceState(null, "", window.location.pathname + window.location.search);
      setTimeout(() => { resetAuth(); setPage("login"); }, 900);
    } catch (e) {
      setAuthMessage(`❌ ${e.message}`);
    }
  };
  const logout = () => { localStorage.removeItem("neetAuthToken"); setCurrentUser(null); resetAuth(); setPage("login"); };

  useEffect(() => {
    if (page !== "exam" || submitted) return;
    if (timeLeft <= 0) { calculateResult(); return; }
    const timer = setInterval(() => setTimeLeft(v => Math.max(0, v - 1)), 1000);
    return () => clearInterval(timer);
  }, [page, submitted, timeLeft]);

  useEffect(() => {
    if (page !== "exam" || submitted || !questions.length) return;
    const session = { examId: activeExamId, questions, examName, uploadedAnswerKey, questionFileName, answerFileName, questionValidation, answerValidation, paperAnswerMatch, currentQuestion, selectedAnswers, markedQuestions: [...markedQuestions], selectedSubject, timeLeft, savedAt: new Date().toISOString() };
    try {
      setSavedSessions(prev => {
        const next = { ...prev, [activeExamId]: session };
        localStorage.setItem("neetExamSessions", JSON.stringify(next));
        localStorage.setItem("neetExamSession", JSON.stringify(session));
        return next;
      });
      apiRequest("/cloud/exam-sessions", {
        method: "POST",
        body: JSON.stringify({ examId: activeExamId, sessionData: session })
      }).catch(error => console.error("Cloud session sync error:", error));
    } catch (e) {
      console.error("Unable to save exam session:", e);
    }
  }, [page, submitted, questions, examName, uploadedAnswerKey, questionFileName, answerFileName, questionValidation, answerValidation, paperAnswerMatch, currentQuestion, selectedAnswers, markedQuestions, selectedSubject, timeLeft, activeExamId]);

  const parseCSV = text => {
    const rows = []; let row = [], value = "", quotes = false;
    for (let i = 0; i < text.length; i++) { const c = text[i], n = text[i + 1]; if (c === '"' && quotes && n === '"') { value += '"'; i++; } else if (c === '"') quotes = !quotes; else if (c === "," && !quotes) { row.push(value.trim()); value = ""; } else if ((c === "\n" || c === "\r") && !quotes) { if (c === "\r" && n === "\n") i++; row.push(value.trim()); if (row.some(Boolean)) rows.push(row); row = []; value = ""; } else value += c; }
    if (value !== "" || row.length) { row.push(value.trim()); if (row.some(Boolean)) rows.push(row); }
    return rows;
  };

  const validateQuestionCSV = text => {
    const rows = parseCSV(text); if (rows.length < 2) throw new Error("Question paper CSV is empty.");
    const headers = rows[0].map(h => h.replace(/^\uFEFF/, "").toLowerCase().trim());
    const required = ["id", "subject", "chapter", "question", "optiona", "optionb", "optionc", "optiond"];
    const missing = required.filter(h => !headers.includes(h)); if (missing.length) throw new Error(`Missing columns: ${missing.join(", ")}`);
    const dup = headers.filter((h, i) => h && headers.indexOf(h) !== i); if (dup.length) throw new Error(`Duplicate columns: ${[...new Set(dup)].join(", ")}`);
    const ix = h => headers.indexOf(h), errors = [], ids = new Set(), out = [];
    rows.slice(1).forEach((r, i) => { const rn = i + 2, id = Number(r[ix("id")]?.trim() || ""), rawSubject = r[ix("subject")]?.trim() || "", subject = SUBJECTS.find(s => s.toLowerCase() === rawSubject.toLowerCase()), chapter = r[ix("chapter")]?.trim() || "", question = r[ix("question")]?.trim() || "", options = ["optiona", "optionb", "optionc", "optiond"].map(h => r[ix(h)]?.trim() || "");
      if (!Number.isInteger(id) || id <= 0) errors.push(`Row ${rn}: invalid question ID.`); else if (ids.has(id)) errors.push(`Row ${rn}: duplicate question ID ${id}.`); else ids.add(id);
      if (!subject) errors.push(`Row ${rn}: invalid subject.`); if (!chapter) errors.push(`Row ${rn}: missing chapter.`); if (!question) errors.push(`Row ${rn}: missing question text.`); options.forEach((o, j) => { if (!o) errors.push(`Row ${rn}: missing option ${String.fromCharCode(65 + j)}.`); });
      if (Number.isInteger(id) && id > 0 && subject && chapter && question && options.every(Boolean)) out.push({ id, subject, chapter, question, options });
    });
    if (!out.length) throw new Error("No valid questions found."); if (errors.length) throw new Error(`Validation failed.\n\n${errors.slice(0, 8).join("\n")}${errors.length > 8 ? `\n...and ${errors.length - 8} more error(s).` : ""}`); return out;
  };

  const handleQuestionUpload = e => { const file = e.target.files?.[0]; if (!file) return; const reader = new FileReader(); reader.onload = ev => { try { const parsed = validateQuestionCSV(String(ev.target.result || "")); const counts = Object.fromEntries(SUBJECTS.map(s => [s, parsed.filter(q => q.subject === s).length])); setQuestions(parsed); setSelectedAnswers({}); setMarkedQuestions(new Set()); setCurrentQuestion(0); setSelectedSubject(counts.Biology ? "Biology" : parsed[0].subject); setQuestionFileName(file.name); setQuestionValidation({ total: parsed.length, biology: counts.Biology, physics: counts.Physics, chemistry: counts.Chemistry, chapters: new Set(parsed.map(q => q.chapter)).size }); setShowPaperPreview(false); if (answerFileName) checkPaperAnswerMatch(parsed, uploadedAnswerKey); else { setPaperAnswerMatch(null); setUploadMessage(`✅ Question paper validated successfully.\n\nQuestions: ${parsed.length}\nBiology: ${counts.Biology}\nPhysics: ${counts.Physics}\nChemistry: ${counts.Chemistry}\nChapters: ${new Set(parsed.map(q => q.chapter)).size}`); } } catch (err) { setQuestionValidation(null); setUploadMessage(`❌ ${err.message}`); } }; reader.readAsText(file); };

  const validateAnswerCSV = text => {
    const rows = parseCSV(text); if (rows.length < 2) throw new Error("Answer key CSV is empty."); const headers = rows[0].map(h => h.replace(/^\uFEFF/, "").toLowerCase().trim()); if (!headers.includes("question") || !headers.includes("answer")) throw new Error("Answer key must contain Question and Answer columns.");
    const qi = headers.indexOf("question"), ai = headers.indexOf("answer"), errors = [], ids = new Set(), key = {};
    rows.slice(1).forEach((r, i) => { const rn = i + 2, id = Number(r[qi]?.trim() || ""), a = r[ai]?.trim().toUpperCase() || ""; if (!Number.isInteger(id) || id <= 0) errors.push(`Row ${rn}: invalid question number.`); else if (ids.has(id)) errors.push(`Row ${rn}: duplicate question number ${id}.`); else ids.add(id); if (ANSWERS[a] === undefined) errors.push(`Row ${rn}: invalid answer. Use A, B, C or D.`); if (Number.isInteger(id) && id > 0 && ANSWERS[a] !== undefined && key[id] === undefined) key[id] = ANSWERS[a]; });
    if (!Object.keys(key).length) throw new Error("No valid answers found."); if (errors.length) throw new Error(`Validation failed.\n\n${errors.slice(0, 8).join("\n")}${errors.length > 8 ? `\n...and ${errors.length - 8} more error(s).` : ""}`); return key;
  };

  const handleAnswerKeyUpload = e => { const file = e.target.files?.[0]; if (!file) return; const reader = new FileReader(); reader.onload = ev => { try { const key = validateAnswerCSV(String(ev.target.result || "")); setUploadedAnswerKey(key); setAnswerFileName(file.name); setAnswerValidation({ total: Object.keys(key).length }); if (questionFileName) checkPaperAnswerMatch(questions, key); else { setPaperAnswerMatch(null); setUploadMessage(`✅ Answer key validated successfully.\n\nAnswers: ${Object.keys(key).length}`); } } catch (err) { setAnswerValidation(null); setUploadMessage(`❌ ${err.message}`); } }; reader.readAsText(file); };

  const checkPaperAnswerMatch = (paper, key) => {
    const p = new Set(paper.map(q => Number(q.id))), a = new Set(Object.keys(key).map(Number)); const missing = [...p].filter(id => !a.has(id)).sort((x, y) => x - y), extra = [...a].filter(id => !p.has(id)).sort((x, y) => x - y), matched = !missing.length && !extra.length && p.size === a.size; const result = { paperCount: p.size, answerCount: a.size, matchedCount: p.size - missing.length, missingAnswers: missing, extraAnswers: extra, matched }; setPaperAnswerMatch(result); setUploadMessage(matched ? `✅ Paper and Answer Key Matched\n\nQuestions: ${p.size}\nAnswers: ${a.size}\nMatched: ${p.size}/${p.size}` : `❌ Paper and Answer Key do not match.\n\nQuestions in paper: ${p.size}\nAnswers in key: ${a.size}\nMatched: ${p.size - missing.length}/${p.size}\n${missing.length ? `Missing answers: Q${missing.slice(0, 10).join(", Q")}\n` : ""}${extra.length ? `Extra answers: Q${extra.slice(0, 10).join(", Q")}` : ""}`); return result;
  };

  const saveMockTestToLibrary = async () => {
    const name = examName.trim(); if (!name) return setUploadMessage("❌ Please enter a mock test name before saving."); if (!questionValidation || !answerValidation || !paperAnswerMatch?.matched) return setUploadMessage("❌ Upload a valid Question Paper and matching Answer Key first.");
    const now = new Date().toISOString(), mock = { id: `mock-${Date.now()}`, name, questions, uploadedAnswerKey, questionFileName, answerFileName, questionValidation, answerValidation, paperAnswerMatch, createdAt: now, updatedAt: now };
    try { const old = JSON.parse(localStorage.getItem("neetExamLibrary") || "[]"), i = old.findIndex(x => String(x.name || "").trim().toLowerCase() === name.toLowerCase()), next = i >= 0 ? old.map((x, n) => n === i ? { ...x, ...mock, id: x.id || mock.id, createdAt: x.createdAt || now } : x) : [mock, ...old]; localStorage.setItem("neetExamLibrary", JSON.stringify(next));
      setExamLibrary(next);
      try {
        await apiRequest("/cloud/mock-tests", {
          method: "POST",
          body: JSON.stringify(mock)
        });
        setCloudSyncMessage("☁️ Mock test synced to cloud");
      } catch (cloudError) {
        console.error("Cloud mock save error:", cloudError);
        setCloudSyncMessage("⚠️ Mock saved locally; cloud sync failed.");
      }
      setUploadMessage(`✅ Mock test saved to My Mock Tests.\n\n${name}\n${questions.length} questions`);
    } catch { setUploadMessage("❌ Unable to save this mock test. Browser storage may be full."); }
  };

  const startSavedMockTest = mock => {
    if (!mock?.questions?.length) return setUploadMessage("❌ This saved mock test is invalid or empty."); const id = mock.id || `mock-${Date.now()}`; setActiveExamId(id); setSavedSessions(prev => { const next = { ...prev }; delete next[id]; localStorage.setItem("neetExamSessions", JSON.stringify(next)); return next; }); apiRequest(`/cloud/exam-sessions/${encodeURIComponent(id)}`, { method: "DELETE" }).catch(() => null); setQuestions(mock.questions); setExamName(mock.name || "NEET Mock Test"); setUploadedAnswerKey(mock.uploadedAnswerKey || {}); setQuestionFileName(mock.questionFileName || ""); setAnswerFileName(mock.answerFileName || ""); setQuestionValidation(mock.questionValidation || null); setAnswerValidation(mock.answerValidation || null); setPaperAnswerMatch(mock.paperAnswerMatch || null); setCurrentQuestion(0); setSelectedAnswers({}); setMarkedQuestions(new Set()); setSubmitted(false); setShowSubmitConfirmation(false); setTimeLeft(180 * 60); setSelectedSubject(mock.questions.some(q => q.subject === "Biology") ? "Biology" : mock.questions[0]?.subject || "Biology"); setPage("instructions");
  };

  const restoreSession = s => { if (!s?.questions?.length) throw new Error("Invalid saved questions."); setActiveExamId(s.examId || "default"); setQuestions(s.questions); setExamName(s.examName || "NEET Mock Test 01"); setUploadedAnswerKey(s.uploadedAnswerKey || {}); setQuestionFileName(s.questionFileName || ""); setAnswerFileName(s.answerFileName || ""); setQuestionValidation(s.questionValidation || null); setAnswerValidation(s.answerValidation || null); setPaperAnswerMatch(s.paperAnswerMatch || null); setCurrentQuestion(Math.min(Math.max(Number(s.currentQuestion) || 0, 0), s.questions.length - 1)); setSelectedAnswers(s.selectedAnswers || {}); setMarkedQuestions(new Set(s.markedQuestions || [])); setSelectedSubject(s.selectedSubject || s.questions[0]?.subject || "Biology"); setTimeLeft(Math.max(0, Number(s.timeLeft) || 0)); setSubmitted(false); setShowSubmitConfirmation(false); setPage("exam"); };
  const resumeExam = () => { const list = Object.values(savedSessions || {}); if (!list.length) return setUploadMessage("No saved exam session found."); try { restoreSession([...list].sort((a, b) => new Date(b.savedAt || 0) - new Date(a.savedAt || 0))[0]); } catch { setUploadMessage("❌ The saved exam session could not be restored."); } };
  const resumeSavedMockTest = mock => { const s = savedSessions[mock?.id]; if (!s) return setUploadMessage("No saved progress was found for this mock test."); try { restoreSession(s); setUploadMessage(`✅ ${mock.name || "Mock test"} resumed.`); } catch { setUploadMessage("❌ Saved progress could not be restored."); } };

  const shuffle = arr => { const x = [...arr]; for (let i = x.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [x[i], x[j]] = [x[j], x[i]]; } return x; };
  const parseBuilderQuestions = text => validateQuestionCSV(text);
  const handleBuilderQuestionUpload = e => { const f = e.target.files?.[0]; if (!f) return; const r = new FileReader(); r.onload = ev => { try { const q = parseBuilderQuestions(String(ev.target.result || "")); setBuilderQuestions(q); setBuilderQuestionFileName(f.name); setBuilderChapterSelections({ Biology: [], Physics: [], Chemistry: [] }); setGeneratedMock(null); setBuilderMessage(`✅ Dataset loaded successfully.\n\nQuestions: ${q.length}\nBiology: ${q.filter(x => x.subject === "Biology").length}\nPhysics: ${q.filter(x => x.subject === "Physics").length}\nChemistry: ${q.filter(x => x.subject === "Chemistry").length}`); } catch (err) { setBuilderQuestions([]); setBuilderMessage(`❌ ${err.message}`); } }; r.readAsText(f); };
  const handleBuilderAnswerKeyUpload = e => { const f = e.target.files?.[0]; if (!f) return; const r = new FileReader(); r.onload = ev => { try { const key = validateAnswerCSV(String(ev.target.result || "")); setBuilderAnswerKey(key); setBuilderAnswerFileName(f.name); setGeneratedMock(null); setBuilderMessage(`✅ Answer key loaded successfully.\n\nAnswers: ${Object.keys(key).length}`); } catch (err) { setBuilderAnswerKey({}); setBuilderMessage(`❌ ${err.message}`); } }; r.readAsText(f); };
  const builderChapters = s => [...new Set(builderQuestions.filter(q => q.subject === s).map(q => q.chapter))].sort();
  const toggleChapter = (s, c) => setBuilderChapterSelections(p => ({ ...p, [s]: (p[s] || []).includes(c) ? p[s].filter(x => x !== c) : [...(p[s] || []), c] }));
  const updateCount = (s, v) => setBuilderCounts(p => ({ ...p, [s]: Math.max(0, Number(v) || 0) }));
  const generateCustomMock = () => {
    if (!builderQuestions.length) return setBuilderMessage("❌ Upload a question dataset first."); if (!Object.keys(builderAnswerKey).length) return setBuilderMessage("❌ Upload a matching answer key first."); const name = builderExamName.trim(); if (!name) return setBuilderMessage("❌ Enter a name for the custom mock test."); const selected = [], shortages = [];
    SUBJECTS.forEach(s => { const n = Number(builderCounts[s]) || 0, chapters = builderChapterSelections[s] || [], pool = builderQuestions.filter(q => q.subject === s && (!chapters.length || chapters.includes(q.chapter)) && builderAnswerKey[q.id] !== undefined); if (n > pool.length) shortages.push(`${s}: requested ${n}, only ${pool.length} available.`); else selected.push(...shuffle(pool).slice(0, n)); });
    if (shortages.length) return setBuilderMessage(`❌ Cannot generate mock.\n\n${shortages.join("\n")}`); if (!selected.length) return setBuilderMessage("❌ Select at least one question."); const original = shuffle(selected), qs = original.map((q, i) => ({ ...q, id: i + 1 })), key = {}; qs.forEach((q, i) => { key[q.id] = builderAnswerKey[original[i].id]; }); const mock = { name, questions: qs, uploadedAnswerKey: key, questionFileName: `Generated from ${builderQuestionFileName || "dataset"}`, answerFileName: `Generated from ${builderAnswerFileName || "answer key"}`, questionValidation: { total: qs.length, biology: qs.filter(q => q.subject === "Biology").length, physics: qs.filter(q => q.subject === "Physics").length, chemistry: qs.filter(q => q.subject === "Chemistry").length, chapters: new Set(qs.map(q => q.chapter)).size }, answerValidation: { total: qs.length }, paperAnswerMatch: { paperCount: qs.length, answerCount: qs.length, matchedCount: qs.length, missingAnswers: [], extraAnswers: [], matched: true } }; setGeneratedMock(mock); setBuilderMessage(`✅ Custom mock generated successfully.\n\n${qs.length} questions selected.`);
  };
  const saveGeneratedMock = async () => { if (!generatedMock) return; const now = new Date().toISOString(), mock = { id: `mock-${Date.now()}`, ...generatedMock, createdAt: now, updatedAt: now }; try { const old = JSON.parse(localStorage.getItem("neetExamLibrary") || "[]"), i = old.findIndex(x => String(x.name || "").trim().toLowerCase() === generatedMock.name.trim().toLowerCase()), next = i >= 0 ? old.map((x, n) => n === i ? { ...x, ...mock, id: x.id || mock.id, createdAt: x.createdAt || now } : x) : [mock, ...old]; localStorage.setItem("neetExamLibrary", JSON.stringify(next));
      setExamLibrary(next);
      try {
        await apiRequest("/cloud/mock-tests", {
          method: "POST",
          body: JSON.stringify(mock)
        });
        setCloudSyncMessage("☁️ Mock test synced to cloud");
      } catch (cloudError) {
        console.error("Cloud generated mock save error:", cloudError);
        setCloudSyncMessage("⚠️ Mock saved locally; cloud sync failed.");
      }
      setBuilderMessage(`✅ ${generatedMock.name} saved to My Mock Tests.`);
    } catch { setBuilderMessage("❌ Unable to save generated mock test."); } };
  const startGeneratedMock = () => generatedMock && startSavedMockTest({ id: `generated-${Date.now()}`, ...generatedMock });

  const renameMockTest = mock => { const n = window.prompt("Enter a new name for this mock test:", mock?.name || "Untitled Mock Test"); if (n === null) return; const name = n.trim(); if (!name) return setUploadMessage("❌ Mock test name cannot be empty."); if (examLibrary.some(x => x.id !== mock.id && String(x.name || "").trim().toLowerCase() === name.toLowerCase())) return setUploadMessage("❌ A mock test with this name already exists."); const updatedAt = new Date().toISOString(), next = examLibrary.map(x => x.id === mock.id ? { ...x, name, updatedAt } : x); localStorage.setItem("neetExamLibrary", JSON.stringify(next));
    setExamLibrary(next);
    const updatedMock = next.find(x => x.id === mock.id);
    if (updatedMock) {
      apiRequest("/cloud/mock-tests", {
        method: "POST",
        body: JSON.stringify(updatedMock)
      }).catch(error => console.error("Cloud rename sync error:", error));
    }
    setSelectedMockTestDetails(x => x?.id === mock.id ? { ...x, name, updatedAt } : x);
    setUploadMessage(`✅ Mock test renamed to "${name}".`); };
  const deleteMockTest = mock => { if (!window.confirm(`Delete "${mock?.name || "Untitled Mock Test"}" from My Mock Tests?\n\nThis cannot be undone.`)) return; const next = examLibrary.filter(x => x.id !== mock.id), sessions = { ...savedSessions }; delete sessions[mock.id]; const history = { ...examAttemptHistory }; delete history[mock.id]; localStorage.setItem("neetExamLibrary", JSON.stringify(next));
    localStorage.setItem("neetExamSessions", JSON.stringify(sessions));
    localStorage.setItem("neetExamAttemptHistory", JSON.stringify(history));
    setExamLibrary(next);
    setSavedSessions(sessions);
    setExamAttemptHistory(history);
    setSelectedMockTestDetails(null);
    apiRequest(`/cloud/mock-tests/${encodeURIComponent(mock.id)}`, { method: "DELETE" })
      .catch(error => console.error("Cloud mock delete error:", error));
    apiRequest(`/cloud/exam-sessions/${encodeURIComponent(mock.id)}`, { method: "DELETE" })
      .catch(() => null);
  };
  const librarySummary = mock => { const q = Array.isArray(mock?.questions) ? mock.questions : []; return { total: q.length, biology: q.filter(x => x.subject === "Biology").length, physics: q.filter(x => x.subject === "Physics").length, chemistry: q.filter(x => x.subject === "Chemistry").length, chapters: new Set(q.map(x => x.chapter || "General")).size }; };
  const formatDate = x => { if (!x) return "—"; const d = new Date(x); return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString(); };

  const startExam = () => { const name = examName.trim(); if (!name) return setUploadMessage("❌ Please enter a name for this mock test."); const paper = Boolean(questionFileName), key = Boolean(answerFileName); if (paper && !key) return setUploadMessage("❌ Upload the Answer Key for the Question Paper."); if (key && !paper) return setUploadMessage("❌ Upload the Question Paper for the Answer Key."); if (paper && key && !paperAnswerMatch?.matched) return setUploadMessage("❌ The Question Paper and Answer Key do not match."); setExamName(name); setActiveExamId(`adhoc-${Date.now()}`); setSelectedAnswers({}); setMarkedQuestions(new Set()); setCurrentQuestion(0); setSubmitted(false); setShowSubmitConfirmation(false); setTimeLeft(180 * 60); setSelectedSubject(questions.some(q => q.subject === "Biology") ? "Biology" : questions[0]?.subject || "Biology"); setPage("exam"); };
  const selectAnswer = i => { const q = questions[currentQuestion]; if (q) setSelectedAnswers(p => ({ ...p, [q.id]: i })); };
  const toggleMark = () => { const id = questions[currentQuestion]?.id; if (!id) return; setMarkedQuestions(p => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; }); };
  const clearResponse = () => { const id = questions[currentQuestion]?.id; if (!id) return; setSelectedAnswers(p => { const n = { ...p }; delete n[id]; return n; }); };
  const changeSubject = s => { setSelectedSubject(s); const i = questions.findIndex(q => q.subject === s); if (i >= 0) setCurrentQuestion(i); };

  const getResult = () => { let correct = 0, wrong = 0, unanswered = 0; questions.forEach(q => { const selected = selectedAnswers[q.id]; if (selected === undefined) unanswered++; else if (selected === (uploadedAnswerKey[q.id] ?? q.answer ?? 0)) correct++; else wrong++; }); const attempted = correct + wrong, score = correct * 4 - wrong, maxScore = questions.length * 4, accuracy = attempted ? Math.round(correct / attempted * 100) : 0; return { correct, wrong, unanswered, attempted, score, maxScore, accuracy }; };
  const saveAttempt = () => { const r = getResult(), a = { id: Date.now(), examId: activeExamId, examName, date: new Date().toLocaleDateString(), timestamp: new Date().toISOString(), score: r.score, maxScore: r.maxScore, accuracy: r.accuracy, attempted: r.attempted, correct: r.correct, wrong: r.wrong, unanswered: r.unanswered }; setAttemptHistory(p => { const n = [a, ...p].slice(0, 10); localStorage.setItem("neetAttemptHistory", JSON.stringify(n)); return n; }); apiRequest("/cloud/attempt-history", { method: "POST", body: JSON.stringify(a) }).catch(error => console.error("Cloud attempt sync error:", error)); setExamAttemptHistory(p => { const n = { ...p, [activeExamId]: [a, ...(p[activeExamId] || [])].slice(0, 50) }; localStorage.setItem("neetExamAttemptHistory", JSON.stringify(n)); return n; }); };
  const calculateResult = () => { if (!submitted) { setSubmitted(true); saveAttempt(); } setSavedSessions(p => { const n = { ...p }; delete n[activeExamId]; localStorage.setItem("neetExamSessions", JSON.stringify(n)); localStorage.removeItem("neetExamSession"); apiRequest(`/cloud/exam-sessions/${encodeURIComponent(activeExamId)}`, { method: "DELETE" }).catch(() => null); return n; }); setShowSubmitConfirmation(false); setPage("result"); };
  const restartExam = () => { setSavedSessions(p => { const n = { ...p }; delete n[activeExamId]; localStorage.setItem("neetExamSessions", JSON.stringify(n)); apiRequest(`/cloud/exam-sessions/${encodeURIComponent(activeExamId)}`, { method: "DELETE" }).catch(() => null); return n; }); setSelectedAnswers({}); setMarkedQuestions(new Set()); setCurrentQuestion(0); setSubmitted(false); setShowSubmitConfirmation(false); setTimeLeft(180 * 60); setPage("exam"); };
  const getSubjectResult = s => { const qs = questions.filter(q => q.subject === s); let correct = 0, wrong = 0, unanswered = 0; qs.forEach(q => { const x = selectedAnswers[q.id]; if (x === undefined) unanswered++; else if (x === (uploadedAnswerKey[q.id] ?? q.answer ?? 0)) correct++; else wrong++; }); return { total: qs.length, correct, wrong, unanswered, score: correct * 4 - wrong }; };
  const getChapterResults = () => { const m = {}; questions.forEach(q => { const c = q.chapter || "General"; if (!m[c]) m[c] = { chapter: c, total: 0, correct: 0, wrong: 0, unanswered: 0 }; m[c].total++; const x = selectedAnswers[q.id]; if (x === undefined) m[c].unanswered++; else if (x === (uploadedAnswerKey[q.id] ?? q.answer ?? 0)) m[c].correct++; else m[c].wrong++; }); return Object.values(m); };
  const getWeakAreas = () => { const m = {}; questions.forEach(q => { const c = q.chapter || "General", key = `${q.subject}__${c}`; if (!m[key]) m[key] = { chapter: c, subject: q.subject, total: 0, correct: 0, wrong: 0, unanswered: 0 }; m[key].total++; const x = selectedAnswers[q.id]; if (x === undefined) m[key].unanswered++; else if (x === (uploadedAnswerKey[q.id] ?? q.answer ?? 0)) m[key].correct++; else m[key].wrong++; }); return Object.values(m).map(x => { const attempted = x.correct + x.wrong, accuracy = attempted ? Math.round(x.correct / attempted * 100) : null; return { ...x, attempted, accuracy, status: accuracy === null ? "Insufficient Data" : accuracy < 50 ? "Weak" : accuracy < 70 ? "Needs Practice" : "Strong" }; }).filter(x => x.attempted).sort((a, b) => a.accuracy - b.accuracy); };
  const dashboardData = useMemo(() => { if (!attemptHistory.length) return { totalTests: 0, bestScore: 0, averageScore: 0, averageAccuracy: 0 }; return { totalTests: attemptHistory.length, bestScore: Math.max(...attemptHistory.map(x => Number(x.score) || 0)), averageScore: Math.round(attemptHistory.reduce((s, x) => s + (Number(x.score) || 0), 0) / attemptHistory.length), averageAccuracy: Math.round(attemptHistory.reduce((s, x) => s + (Number(x.accuracy) || 0), 0) / attemptHistory.length) }; }, [attemptHistory]);
  const saveProfile = async () => { const name = studentProfile.name.trim() || String(currentUser?.name || "").trim(), score = Number(studentProfile.targetScore); if (!name) return setProfileMessage("❌ Please enter your name."); if (!String(studentProfile.targetYear || "").trim()) return setProfileMessage("❌ Please enter your target NEET year."); if (!Number.isFinite(score) || score < 0 || score > 720) return setProfileMessage("❌ Target score must be between 0 and 720."); const p = { ...studentProfile, name, targetScore: String(score), preferredSubjects: studentProfile.preferredSubjects || [] }; try { const d = await apiRequest("/profile", { method: "PUT", body: JSON.stringify(p) }); const saved = { ...p, ...(d.profile || {}), name: String(d.profile?.name || d.user?.name || name).trim() }; setStudentProfile(saved); localStorage.setItem("neetStudentProfile", JSON.stringify(saved)); if (d.user) setCurrentUser(d.user); setProfileMessage("✅ Profile and goals saved to your account."); } catch (e) { localStorage.setItem("neetStudentProfile", JSON.stringify(p)); setStudentProfile(p); setProfileMessage(`❌ ${e.message}`); } };
  const toggleProfileSubject = s => { setStudentProfile(p => ({ ...p, preferredSubjects: (p.preferredSubjects || []).includes(s) ? p.preferredSubjects.filter(x => x !== s) : [...(p.preferredSubjects || []), s] })); setProfileMessage(""); };

  if (authChecking) return <div className="app"><main className="dashboard-page" style={{ minHeight: "100vh", display: "flex", alignItems: "center" }}><section style={card}><h1>Checking your account...</h1><p>Please wait.</p></section></main></div>;
  if (!currentUser && !["login", "signup", "forgot", "reset"].includes(page)) return null;

  if (page === "reset") {
    return <div className="app"><header className="top-header"><div><h1>NEET CBT Simulator</h1><p>Password Recovery</p></div></header><main className="dashboard-page" style={{ minHeight: "calc(100vh - 100px)", display: "flex", alignItems: "center" }}><section style={card}><span className="section-label">PHASE 7E • SECURE PASSWORD RESET</span><h1 style={{ marginTop: 10 }}>🔐 Create New Password</h1><p style={{ color: "#64748b" }}>Choose a new password for your account. This reset link is valid for 15 minutes and can only be used once.</p><Field label="New Password"><input type="password" value={authPassword} placeholder="Minimum 6 characters" autoComplete="new-password" onChange={e => { setAuthPassword(e.target.value); setAuthMessage(""); }} style={input} /></Field><Field label="Confirm New Password"><input type="password" value={authConfirmPassword} placeholder="Re-enter new password" autoComplete="new-password" onChange={e => { setAuthConfirmPassword(e.target.value); setAuthMessage(""); }} style={input} /></Field>{authMessage && <div style={{ marginTop: 16, padding: 12, borderRadius: 8, background: authMessage.startsWith("❌") ? "#fef2f2" : "#f0fdf4" }}>{authMessage}</div>}<div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 18 }}><button className="primary-button" onClick={handleResetPassword}>🔑 Reset Password</button><button className="secondary-button" onClick={() => { setResetToken(""); window.history.replaceState(null, "", window.location.pathname + window.location.search); resetAuth(); setPage("login"); }}>Back to Login</button></div></section></main></div>;
  }

  if (["login", "signup", "forgot"].includes(page)) {
    const signup = page === "signup", forgot = page === "forgot";
    return <div className="app"><header className="top-header"><div><h1>NEET CBT Simulator</h1><p>{signup ? "Create your student account" : forgot ? "Password Recovery" : "Computer Based Test Practice Platform"}</p></div></header><main className="dashboard-page" style={{ minHeight: "calc(100vh - 100px)", display: "flex", alignItems: "center" }}><section style={card}><span className="section-label">PHASE 7E • {signup ? "SIGN UP" : forgot ? "PASSWORD RESET" : "LOGIN"}</span><h1 style={{ marginTop: 10 }}>{signup ? "👤 Create Account" : forgot ? "🔑 Password Recovery" : "🔐 Welcome Back"}</h1><p style={{ color: "#64748b" }}>{signup ? "Create an account stored in the database." : forgot ? "Enter your email and we will create a secure, time-limited reset link." : "Log in to continue to your NEET CBT Simulator."}</p>{signup && <Field label="Student Name"><input type="text" value={authName} maxLength={60} placeholder="Enter your name" onChange={e => { setAuthName(e.target.value); setAuthMessage(""); }} style={input} /></Field>}<Field label="Email"><input type="email" value={authEmail} placeholder="you@example.com" autoComplete="email" onChange={e => { setAuthEmail(e.target.value); setAuthMessage(""); }} style={input} /></Field>{!forgot && <Field label="Password"><input type="password" value={authPassword} placeholder="Minimum 6 characters" autoComplete={signup ? "new-password" : "current-password"} onChange={e => { setAuthPassword(e.target.value); setAuthMessage(""); }} style={input} /></Field>}{signup && <Field label="Confirm Password"><input type="password" value={authConfirmPassword} placeholder="Re-enter password" autoComplete="new-password" onChange={e => { setAuthConfirmPassword(e.target.value); setAuthMessage(""); }} style={input} /></Field>}{authMessage && <div style={{ marginTop: 16, padding: 12, borderRadius: 8, background: authMessage.startsWith("❌") ? "#fef2f2" : "#f0fdf4" }}>{authMessage}</div>}{forgot && resetUrl && <div style={{ marginTop: 16, padding: 14, borderRadius: 8, background: "#eff6ff", border: "1px solid #bfdbfe" }}><strong>Development reset link</strong><p style={{ margin: "8px 0", color: "#475569", wordBreak: "break-all", fontSize: 13 }}>{resetUrl}</p><button className="primary-button" onClick={() => openResetUrl(resetUrl)}>🔐 Open Reset Page</button></div>}<div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 18 }}><button className="primary-button" onClick={signup ? handleSignup : forgot ? handleForgotPassword : handleLogin}>{signup ? "Create Account" : forgot ? "Send Reset Link" : "🔐 Login"}</button><button className="secondary-button" onClick={() => switchAuth(signup || forgot ? "login" : "signup")}>{signup || forgot ? "Back to Login" : "Create Account"}</button></div>{!signup && !forgot && <button style={linkButton} onClick={() => switchAuth("forgot")}>Forgot password?</button>}</section></main></div>;
  }

  if (page === "home") return <Home currentUser={currentUser} logout={logout} setPage={setPage} hasSaved={Object.keys(savedSessions).length > 0} resume={resumeExam} cloudSyncing={cloudSyncing} cloudSyncMessage={cloudSyncMessage} />;

  if (page === "profile") { const best = dashboardData.bestScore || 0, target = Number(studentProfile.targetScore) || 0, preferred = studentProfile.preferredSubjects || []; return <div className="app"><header className="top-header"><div><h1>NEET CBT Simulator</h1><p>Student Profile & Goals</p></div><button className="header-home-button" onClick={() => setPage("dashboard")}>Dashboard</button></header><main className="dashboard-page"><section className="dashboard-welcome"><div><span>PHASE 6A</span><h1>👤 Student Profile</h1><p>Set your NEET target and keep your goals in one place.</p></div></section><section className="dashboard-section"><div className="dashboard-section-header"><h2>Profile Information</h2><p>Your profile is synchronized with your account when the backend is available.</p></div><div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))", gap: 18 }}><Field label="Student Name"><input value={studentProfile.name} maxLength={60} placeholder="Enter your name" onChange={e => { setStudentProfile(p => ({ ...p, name: e.target.value })); setProfileMessage(""); }} style={input} /></Field><Field label="Target NEET Year"><input type="number" min="2026" max="2100" value={studentProfile.targetYear} onChange={e => setStudentProfile(p => ({ ...p, targetYear: e.target.value }))} style={input} /></Field><Field label="Target Score"><input type="number" min="0" max="720" value={studentProfile.targetScore} onChange={e => setStudentProfile(p => ({ ...p, targetScore: e.target.value }))} style={input} /></Field></div><strong>Preferred Subjects</strong><div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 10 }}>{SUBJECTS.map(s => <label key={s} style={{ display: "flex", gap: 8, alignItems: "center", padding: "10px 14px", background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8 }}><input type="checkbox" checked={preferred.includes(s)} onChange={() => toggleProfileSubject(s)} />{s}</label>)}</div>{profileMessage && <div style={{ marginTop: 18, padding: 12, borderRadius: 8, background: profileMessage.startsWith("❌") ? "#fef2f2" : "#f0fdf4" }}>{profileMessage}</div>}<div style={{ display: "flex", gap: 10, marginTop: 20 }}><button className="primary-button" onClick={saveProfile}>💾 Save Profile</button><button className="secondary-button" onClick={() => setPage("dashboard")}>Back to Dashboard</button></div></section><section className="dashboard-section"><h2>🎯 Goal Summary</h2><div className="dashboard-stats"><Stat icon="🎯" label="Target Score" value={`${target}/720`} /><Stat icon="🏆" label="Best Score" value={best} /><Stat icon="📌" label="Score Remaining" value={Math.max(0, target - best)} /><Stat icon="📝" label="Mock Tests" value={dashboardData.totalTests} /></div><p style={{ marginTop: 18, padding: 16, background: "#f8fafc", borderRadius: 10 }}><strong>{studentProfile.name || "Student"}</strong> is targeting NEET {studentProfile.targetYear || "—"} with a goal of {target}/720.<br /><span style={{ color: "#64748b" }}>Preferred subjects: {preferred.length ? preferred.join(", ") : "None selected"}</span></p></section></main></div>; }

  if (page === "builder") return <Builder builderQuestions={builderQuestions} builderAnswerKey={builderAnswerKey} builderQuestionFileName={builderQuestionFileName} builderAnswerFileName={builderAnswerFileName} builderMessage={builderMessage} builderExamName={builderExamName} setBuilderExamName={setBuilderExamName} builderCounts={builderCounts} builderChapterSelections={builderChapterSelections} generatedMock={generatedMock} onQ={handleBuilderQuestionUpload} onA={handleBuilderAnswerKeyUpload} chapters={builderChapters} toggleChapter={toggleChapter} updateCount={updateCount} generate={generateCustomMock} save={saveGeneratedMock} start={startGeneratedMock} setPage={setPage} />;

  if (page === "dashboard") return <Dashboard {...{ dashboardData, attemptHistory, examLibrary, savedSessions, selectedMockTestDetails, setSelectedMockTestDetails, resumeSavedMockTest, startSavedMockTest, renameMockTest, deleteMockTest, librarySummary, formatDate, examAttemptHistory, setPage }} />;

  if (page === "instructions") return <Instructions examName={examName} setExamName={setExamName} questions={questions} uploadMessage={uploadMessage} startExam={startExam} setPage={setPage} />;

  if (page === "result") { const result = getResult(), weak = getWeakAreas(), subjects = [...new Set(questions.map(q => q.subject))]; return <Result examName={examName} result={result} questions={questions} selectedAnswers={selectedAnswers} uploadedAnswerKey={uploadedAnswerKey} subjects={subjects} getSubjectResult={getSubjectResult} chapters={getChapterResults()} weak={weak} restart={restartExam} setPage={setPage} />; }

  const q = questions[currentQuestion], selected = selectedAnswers[q?.id], attempted = Object.keys(selectedAnswers).length, unanswered = Math.max(0, questions.length - attempted), formatTime = s => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
  return <div className="app"><header className="exam-header"><div><h1>NEET CBT Simulator</h1><p>{examName} • Computer Based Test</p></div><div className="timer-box">⏱ {formatTime(timeLeft)}</div></header><div className="upload-section"><UploadCard title="Question Paper" fileName={questionFileName} onChange={handleQuestionUpload} /><UploadCard title="Answer Key" fileName={answerFileName} onChange={handleAnswerKeyUpload} />{uploadMessage && <div className="upload-message" style={{ whiteSpace: "pre-line" }}>{uploadMessage}</div>}{questionFileName && questionValidation && <button className="secondary-button" onClick={() => setShowPaperPreview(v => !v)}>{showPaperPreview ? "Hide Paper Preview" : "Preview Question Paper"}</button>}{showPaperPreview && <PaperPreview questions={questions} summary={{ total: questions.length, biology: questions.filter(x => x.subject === "Biology").length, physics: questions.filter(x => x.subject === "Physics").length, chemistry: questions.filter(x => x.subject === "Chemistry").length, chapters: new Set(questions.map(x => x.chapter || "General")).size, maxMarks: questions.length * 4 }} />}{questionValidation && answerValidation && paperAnswerMatch?.matched && <button className="secondary-button" onClick={saveMockTestToLibrary}>💾 Save to My Mock Tests</button>}</div><div className="subject-bar">{[...new Set(questions.map(x => x.subject))].map(s => <button key={s} className={selectedSubject === s ? "active" : ""} onClick={() => changeSubject(s)}>{s}</button>)}</div><main className="exam-layout"><section className="question-panel"><div className="question-top"><div>Question {currentQuestion + 1} of {questions.length}</div><div className="chapter-label">{q?.chapter || "General"}</div></div><h2>Q{currentQuestion + 1}. {q?.question}</h2><div className="options-list">{q?.options.map((o, i) => <button key={i} className={selected === i ? "option selected" : "option"} onClick={() => selectAnswer(i)}><span>{String.fromCharCode(65 + i)}</span>{o}</button>)}</div><div className="question-actions"><button onClick={toggleMark} className={markedQuestions.has(q?.id) ? "marked" : ""}>{markedQuestions.has(q?.id) ? "★ Marked" : "☆ Mark for Review"}</button><button onClick={clearResponse}>Clear Response</button></div><div className="navigation-buttons"><button disabled={currentQuestion === 0} onClick={() => setCurrentQuestion(x => x - 1)}>← Previous</button>{currentQuestion === questions.length - 1 ? <button className="submit-button" onClick={() => setShowSubmitConfirmation(true)}>Submit Exam</button> : <button onClick={() => setCurrentQuestion(x => x + 1)}>Next →</button>}</div></section><aside className="question-palette"><h3>Question Palette</h3><div className="palette-grid">{questions.filter(x => x.subject === selectedSubject).map(x => { const i = questions.findIndex(y => y.id === x.id), answered = selectedAnswers[x.id] !== undefined, marked = markedQuestions.has(x.id); return <button key={x.id} className={`palette-number${i === currentQuestion ? " current" : marked && answered ? " answered-marked" : marked ? " marked" : answered ? " answered" : ""}`} onClick={() => setCurrentQuestion(i)}>{x.id}</button>; })}</div><div className="palette-legend"><div><span className="legend-box answered" />Answered</div><div><span className="legend-box marked" />Marked</div><div><span className="legend-box" />Not Visited</div></div></aside></main>{showSubmitConfirmation && <div className="submit-modal-overlay"><div className="submit-modal"><div className="submit-modal-icon">⚠️</div><h2>Submit Exam?</h2><p>Are you sure you want to submit your exam?</p><div className="submit-summary"><div><span>Attempted</span><strong>{attempted}</strong></div><div><span>Unanswered</span><strong>{unanswered}</strong></div></div><div className="submit-modal-actions"><button className="secondary-button" onClick={() => setShowSubmitConfirmation(false)}>Continue Exam</button><button className="submit-button" onClick={calculateResult}>Yes, Submit Exam</button></div></div></div>}</div>;
}

const card = { width: "100%", maxWidth: 460, margin: "0 auto", padding: 32, background: "white", borderRadius: 14, boxSizing: "border-box", boxShadow: "0 12px 35px rgba(15,23,42,.10)" };
const input = { width: "100%", padding: "13px 14px", border: "1px solid #cbd5e1", borderRadius: 8, boxSizing: "border-box", fontSize: 15 };
const linkButton = { marginTop: 16, border: "none", background: "transparent", color: "#1d4ed8", cursor: "pointer", padding: 0 };
const Field = ({ label, children }) => <div style={{ marginTop: 16 }}><label style={{ display: "block", fontWeight: 700, marginBottom: 7 }}>{label}</label>{children}</div>;
const Stat = ({ icon, label, value }) => <div className="dashboard-stat-card"><span>{icon}</span><div><small>{label}</small><strong>{value}</strong></div></div>;
const UploadCard = ({ title, fileName, onChange }) => <div className="upload-card"><h3>{title}</h3><label className="upload-button">Upload CSV<input type="file" accept=".csv" onChange={onChange} /></label>{fileName && <small>{fileName}</small>}</div>;
const PaperPreview = ({ questions, summary }) => <div style={{ width: "100%", marginTop: 14, padding: 18, border: "1px solid #dbe3ef", borderRadius: 12, background: "#fff" }}><h3>Paper Summary</h3><p>{summary.total} Questions • Biology {summary.biology} • Physics {summary.physics} • Chemistry {summary.chemistry} • {summary.chapters} Chapters • {summary.maxMarks} Max Marks</p><h3>Question Preview</h3>{questions.slice(0, 5).map((q, i) => <div key={q.id} style={{ padding: "14px 0", borderTop: "1px solid #e8edf4" }}><strong>Q{i + 1}. {q.question}</strong><small style={{ display: "block" }}>{q.subject} • {q.chapter}</small>{q.options.map((o, j) => <div key={j}>{String.fromCharCode(65 + j)}. {o}</div>)}</div>)}</div>;

function Home({ currentUser, logout, setPage, hasSaved, resume, cloudSyncing, cloudSyncMessage }) { return <div className="app"><header className="top-header"><div><h1>NEET CBT Simulator</h1><p>Computer Based Test Practice Platform</p></div><div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}><span style={{ color: "white", fontSize: 14 }}>👤 {currentUser?.name || currentUser?.email}</span><span style={{ color: "white", fontSize: 13, opacity: 0.9 }}>{cloudSyncing ? "☁️ Syncing..." : cloudSyncMessage || "☁️ Cloud Synced"}</span><button className="header-home-button" onClick={() => setPage("dashboard")}>Dashboard</button><button className="header-home-button" onClick={logout}>Logout</button></div></header><main className="home-page"><section className="hero-section"><div className="hero-badge">NEET 2026 • CBT PRACTICE</div><h1>Practice smarter.<br />Prepare better.</h1><p>Take full-length mock tests, analyze your performance and track your progress.</p><div className="hero-buttons"><button className="primary-button" onClick={() => setPage("instructions")}>Start Mock Test</button>{hasSaved && <button className="secondary-button" onClick={resume}>Resume Saved Exam</button>}<button className="secondary-button" onClick={() => setPage("dashboard")}>Student Dashboard</button><button className="secondary-button" onClick={() => setPage("profile")}>👤 Student Profile</button><button className="secondary-button" onClick={() => setPage("builder")}>🛠️ Build Custom Mock</button></div></section><section className="feature-grid"><Feature icon="📝" title="Mock Tests">Full-length CBT simulation with timer, negative marking and detailed results.</Feature><Feature icon="📊" title="Performance Analysis">Analyze your score, accuracy, subjects and chapter performance.</Feature><Feature icon="📈" title="Progress Tracking">Track your previous mock test attempts from the student dashboard.</Feature><Feature icon="📚" title="Question Bank">Upload your own NEET question paper and answer key using CSV files.</Feature></section></main></div>; }
const Feature = ({ icon, title, children }) => <div className="feature-card"><div className="feature-icon">{icon}</div><h3>{title}</h3><p>{children}</p></div>;

function Instructions({ examName, setExamName, questions, uploadMessage, startExam, setPage }) { return <div className="app"><header className="top-header"><div><h1>NEET CBT Simulator</h1><p>Mock Test Instructions</p></div><button className="header-home-button" onClick={() => setPage("home")}>Home</button></header><main className="instructions-page"><section className="instructions-card"><span className="section-label">MOCK TEST</span><h1>Instructions</h1><Field label="Mock Test Name"><input value={examName} maxLength={60} onChange={e => setExamName(e.target.value)} style={input} /></Field><ul><li>The mock test contains the available questions in the question paper.</li><li>The total test duration is 180 minutes.</li><li>Each correct answer carries +4 marks.</li><li>Each incorrect answer carries -1 mark.</li><li>Unanswered questions receive 0 marks.</li><li>You can mark questions for review.</li><li>You can navigate using the question palette.</li><li>Your final performance is shown after submission.</li></ul>{uploadMessage && <div className="upload-message" style={{ whiteSpace: "pre-line" }}>{uploadMessage}</div>}<div className="exam-summary"><div><strong>{questions.length}</strong><span>Questions</span></div><div><strong>180</strong><span>Minutes</span></div><div><strong>{questions.length * 4}</strong><span>Max Marks</span></div></div><div className="instruction-actions"><button className="secondary-button" onClick={() => setPage("dashboard")}>Back to Dashboard</button><button className="primary-button" onClick={startExam}>Start Exam →</button></div></section></main></div>; }

function Builder({ builderQuestions, builderAnswerKey, builderQuestionFileName, builderAnswerFileName, builderMessage, builderExamName, setBuilderExamName, builderCounts, builderChapterSelections, generatedMock, onQ, onA, chapters, toggleChapter, updateCount, generate, save, start, setPage }) { const total = SUBJECTS.reduce((s, x) => s + (Number(builderCounts[x]) || 0), 0); return <div className="app"><header className="top-header"><div><h1>NEET CBT Simulator</h1><p>Custom Question Paper Builder</p></div><button className="header-home-button" onClick={() => setPage("home")}>Home</button></header><main className="dashboard-page"><section className="dashboard-welcome"><div><span>PHASE 5F</span><h1>🛠️ Build Custom Mock Test</h1><p>Upload a large question dataset and answer key, choose subjects and chapters, then generate a new mock paper.</p></div></section><section className="dashboard-section"><h2>1. Upload Question Dataset</h2><label className="upload-button">Upload Question Dataset CSV<input type="file" accept=".csv" onChange={onQ} /></label>{builderQuestionFileName && <p><strong>Loaded:</strong> {builderQuestionFileName}</p>}</section><section className="dashboard-section"><h2>2. Upload Answer Key</h2><label className="upload-button">Upload Answer Key CSV<input type="file" accept=".csv" onChange={onA} /></label>{builderAnswerFileName && <p><strong>Loaded:</strong> {builderAnswerFileName}</p>}</section>{builderQuestions.length > 0 && Object.keys(builderAnswerKey).length > 0 && <section className="dashboard-section"><h2>3. Configure Mock Test</h2><Field label="Mock Test Name"><input value={builderExamName} maxLength={60} onChange={e => setBuilderExamName(e.target.value)} style={input} /></Field>{SUBJECTS.map(s => <div key={s} style={{ border: "1px solid #e2e8f0", borderRadius: 12, padding: 16, marginTop: 16 }}><h3>{s}</h3><small>{builderQuestions.filter(q => q.subject === s && builderAnswerKey[q.id] !== undefined).length} questions available</small><Field label="Number of Questions"><input type="number" min="0" value={builderCounts[s]} onChange={e => updateCount(s, e.target.value)} style={{ ...input, width: 120 }} /></Field><div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 8 }}>{chapters(s).map(c => <label key={c} style={{ padding: 8, background: "#f8fafc", borderRadius: 8 }}><input type="checkbox" checked={(builderChapterSelections[s] || []).includes(c)} onChange={() => toggleChapter(s, c)} /> {c}</label>)}</div></div>)}<p style={{ padding: 14, background: "#eff6ff", borderRadius: 10 }}>Total Questions: <strong>{total}</strong></p><button className="primary-button" onClick={generate}>⚡ Generate Custom Mock</button></section>}{builderMessage && <section className="dashboard-section"><div className="upload-message" style={{ whiteSpace: "pre-line" }}>{builderMessage}</div></section>}{generatedMock && <section className="dashboard-section"><h2>4. Generated Mock Test</h2><p><strong>{generatedMock.name}</strong> • {generatedMock.questions.length} questions • {generatedMock.questionValidation.chapters} chapters</p><button className="primary-button" onClick={save}>💾 Save to My Mock Tests</button> <button className="secondary-button" onClick={start}>▶️ Start Mock Test</button></section>}<section className="dashboard-section"><button className="secondary-button" onClick={() => setPage("dashboard")}>← Back to Dashboard</button></section></main></div>; }

function Dashboard({ dashboardData, attemptHistory, examLibrary, savedSessions, selectedMockTestDetails, setSelectedMockTestDetails, resumeSavedMockTest, startSavedMockTest, renameMockTest, deleteMockTest, librarySummary, formatDate, examAttemptHistory, setPage }) { const stats = selectedMockTestDetails ? (examAttemptHistory[selectedMockTestDetails.id] || []) : []; return <div className="app"><header className="top-header"><div><h1>NEET CBT Simulator</h1><p>Student Dashboard</p></div><button className="header-home-button" onClick={() => setPage("home")}>Home</button></header><main className="dashboard-page"><section className="dashboard-welcome"><div><span>STUDENT DASHBOARD</span><h1>Welcome back 👋</h1><p>Track your mock tests and continue your NEET preparation.</p></div><button className="dashboard-start-button" onClick={() => setPage("instructions")}>+ Start New Mock Test</button></section><section className="dashboard-stats"><Stat icon="📝" label="Total Mock Tests" value={dashboardData.totalTests} /><Stat icon="🏆" label="Best Score" value={dashboardData.bestScore} /><Stat icon="📊" label="Average Score" value={dashboardData.averageScore} /><Stat icon="🎯" label="Average Accuracy" value={`${dashboardData.averageAccuracy}%`} /></section><section className="dashboard-section"><h2>Recent Attempts</h2>{attemptHistory.length ? <div className="attempt-table-wrapper"><table className="attempt-table"><thead><tr><th>#</th><th>Mock Test</th><th>Date</th><th>Score</th><th>Accuracy</th><th>Attempted</th><th>Correct</th><th>Wrong</th></tr></thead><tbody>{attemptHistory.map((a, i) => <tr key={a.id}><td>{i + 1}</td><td>{a.examName}</td><td>{a.date}</td><td><strong>{a.score}/{a.maxScore}</strong></td><td>{a.accuracy}%</td><td>{a.attempted}</td><td>{a.correct}</td><td>{a.wrong}</td></tr>)}</tbody></table></div> : <div className="empty-dashboard"><h3>No mock tests yet</h3><button onClick={() => setPage("instructions")}>Start Mock Test</button></div>}</section><section className="dashboard-section"><h2>My Mock Tests</h2>{examLibrary.length ? <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))", gap: 16 }}>{examLibrary.map(m => { const s = librarySummary(m); return <div key={m.id} style={{ border: "1px solid #dbe3ef", borderRadius: 14, padding: 18, background: "#fff" }}><h3>{m.name}</h3><p>{s.total} questions • {s.chapters} chapters</p>{savedSessions[m.id] && <button className="primary-button" style={{ width: "100%" }} onClick={() => resumeSavedMockTest(m)}>▶️ Resume Saved Progress</button>}<button className="secondary-button" style={{ width: "100%", marginTop: 8 }} onClick={() => startSavedMockTest(m)}>🆕 Start Fresh</button><div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8, marginTop: 10 }}><button onClick={() => setSelectedMockTestDetails(m)}>👁 Details</button><button onClick={() => renameMockTest(m)}>✏️ Rename</button><button onClick={() => deleteMockTest(m)} style={{ color: "#dc2626" }}>🗑 Delete</button></div><small>Saved: {formatDate(m.updatedAt || m.createdAt)}</small></div>; })}</div> : <div className="empty-dashboard"><h3>No saved mock tests</h3><p>Upload a Question Paper and matching Answer Key to create one.</p></div>}</section>{selectedMockTestDetails && <section className="dashboard-section"><h2>Mock Test Details</h2><h3>{selectedMockTestDetails.name}</h3>{(() => { const s = librarySummary(selectedMockTestDetails); return <><p>{s.total} questions • Biology {s.biology} • Physics {s.physics} • Chemistry {s.chemistry} • {s.chapters} chapters</p><p><strong>Question Paper:</strong> {selectedMockTestDetails.questionFileName || "—"}</p><p><strong>Answer Key:</strong> {selectedMockTestDetails.answerFileName || "—"}</p><p><strong>Attempts:</strong> {stats.length}</p>{stats.length > 0 && <p><strong>Best Score:</strong> {Math.max(...stats.map(x => Number(x.score) || 0))}/{s.total * 4}</p>}<button className="secondary-button" onClick={() => setSelectedMockTestDetails(null)}>Close Details</button></>; })()}</section>}<section className="dashboard-section"><h2>Quick Actions</h2><div className="dashboard-actions"><button onClick={() => setPage("instructions")}>📝 New Mock Test</button><button onClick={() => setPage("builder")}>🛠️ Question Paper Builder</button><button onClick={() => setPage("profile")}>👤 Student Profile</button></div></section></main></div>; }

function Result({ examName, result, questions, selectedAnswers, uploadedAnswerKey, subjects, getSubjectResult, chapters, weak, restart, setPage }) { return <div className="app"><header className="top-header"><div><h1>NEET CBT Simulator</h1><p>{examName} • Test Result & Performance Analysis</p></div><button className="header-home-button" onClick={() => setPage("home")}>Home</button></header><main className="result-page"><section className="performance-dashboard"><span className="section-label">PERFORMANCE DASHBOARD</span><h1>Your Test Performance</h1><p>Review your score, accuracy, subject performance and chapter-wise results.</p></section><section className="score-box"><span>YOUR SCORE</span><strong>{result.score} / {result.maxScore}</strong><div className="score-progress"><div style={{ width: `${result.maxScore ? Math.max(0, Math.min(100, result.score / result.maxScore * 100)) : 0}%` }} /></div></section><section className="result-stats"><div><span>Attempted</span><strong>{result.attempted}</strong></div><div><span>Correct</span><strong>{result.correct}</strong></div><div><span>Wrong</span><strong>{result.wrong}</strong></div><div><span>Unanswered</span><strong>{result.unanswered}</strong></div><div><span>Accuracy</span><strong>{result.accuracy}%</strong></div></section><section className="result-section"><h2>Subject Analysis</h2><div className="subject-result-grid">{subjects.map(s => { const x = getSubjectResult(s); return <div className="subject-result-card" key={s}><h3>{s}</h3><div className="subject-result-score">{x.score}</div><div className="subject-result-row"><span>Total</span><strong>{x.total}</strong></div><div className="subject-result-row"><span>Correct</span><strong>{x.correct}</strong></div><div className="subject-result-row"><span>Wrong</span><strong>{x.wrong}</strong></div><div className="subject-result-row"><span>Unanswered</span><strong>{x.unanswered}</strong></div></div>; })}</div></section><section className="result-section"><h2>🎯 Weak Area Analysis</h2><p>Below 50% = Weak, 50–69% = Needs Practice, 70%+ = Strong.</p><div className="chapter-table-wrapper"><table className="chapter-table"><thead><tr><th>Subject</th><th>Chapter</th><th>Attempted</th><th>Correct</th><th>Wrong</th><th>Accuracy</th><th>Status</th></tr></thead><tbody>{weak.map(x => <tr key={`${x.subject}-${x.chapter}`}><td>{x.subject}</td><td>{x.chapter}</td><td>{x.attempted}</td><td>{x.correct}</td><td>{x.wrong}</td><td>{x.accuracy}%</td><td>{x.status}</td></tr>)}</tbody></table></div></section><section className="result-section"><h2>Chapter Analysis</h2><div className="chapter-table-wrapper"><table className="chapter-table"><thead><tr><th>Chapter</th><th>Total</th><th>Correct</th><th>Wrong</th><th>Unanswered</th></tr></thead><tbody>{chapters.map(x => <tr key={x.chapter}><td>{x.chapter}</td><td>{x.total}</td><td>{x.correct}</td><td>{x.wrong}</td><td>{x.unanswered}</td></tr>)}</tbody></table></div></section><section className="result-section"><h2>Answer Review</h2><div className="answer-review-list">{questions.map((q, i) => { const selected = selectedAnswers[q.id], correct = uploadedAnswerKey[q.id] ?? q.answer ?? 0, ok = selected !== undefined && selected === correct; return <div className={`answer-review-item ${selected === undefined ? "unanswered" : ok ? "review-correct" : "review-wrong"}`} key={q.id}><div><strong>Q{i + 1}</strong></div><div className="review-content"><p>{q.question}</p><span>Your answer: {selected === undefined ? "Not answered" : `${String.fromCharCode(65 + selected)}. ${q.options[selected]}`}</span><span>Correct answer: {String.fromCharCode(65 + correct)}. {q.options[correct]}</span></div><div className="review-status">{selected === undefined ? "Unanswered" : ok ? "Correct" : "Wrong"}</div></div>; })}</div></section><div className="result-actions"><button className="secondary-button" onClick={restart}>Retake Test</button><button className="primary-button" onClick={() => setPage("dashboard")}>View Dashboard</button><button className="secondary-button" onClick={() => setPage("home")}>Back to Home</button></div></main></div>; }

export default App;
