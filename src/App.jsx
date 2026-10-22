import React, { useEffect, useState } from "react";
import "./style.css";
import api from "./api/client";

import Sidebar, { NAV_ITEMS } from "./components/Sidebar";
import DashboardView from "./components/DashboardView";
import StartTestView from "./components/StartTestView";
import TestHistoryView from "./components/TestHistoryView";
import AnalyticsView from "./components/AnalyticsView";
import GoalsView from "./components/GoalsView";
import QuestionBankView from "./components/QuestionBankView";
import ProfileView from "./components/ProfileView";
import AdminUploadView from "./components/AdminUploadView";
import ExamView from "./components/ExamView";
import ResultView from "./components/ResultView";
import AuthView from "./components/AuthView";

export default function App() {
  // Navigation State
  const [page, setPage] = useState(() => {
    if (window.location.hash === "#start-mock-test") return "startTest";
    return localStorage.getItem("neetAuthToken") ? "dashboard" : "login";
  });
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Authenticated User & Profile
  const [currentUser, setCurrentUser] = useState(null);
  const [studentProfile, setStudentProfile] = useState(null);
  const [goalsData, setGoalsData] = useState(null);
  const [authChecking, setAuthChecking] = useState(true);

  // Tests & History Data
  const [availableTests, setAvailableTests] = useState([]);
  const [loadingTests, setLoadingTests] = useState(false);
  const [attemptHistory, setAttemptHistory] = useState([]);

  // Active Exam Session & Result
  const [activeExamSession, setActiveExamSession] = useState(null);
  const [activeTestId, setActiveTestId] = useState(null);
  const [testResult, setTestResult] = useState(null);

  // Listen for hash changes
  useEffect(() => {
    const handleHash = () => {
      if (window.location.hash === "#start-mock-test" && localStorage.getItem("neetAuthToken")) {
        setPage("startTest");
      }
    };
    window.addEventListener("hashchange", handleHash);
    return () => window.removeEventListener("hashchange", handleHash);
  }, []);

  // Sync hash with current page
  useEffect(() => {
    if (page === "startTest") {
      if (window.location.hash !== "#start-mock-test") {
        window.location.hash = "#start-mock-test";
      }
    } else if (window.location.hash === "#start-mock-test") {
      history.replaceState(null, "", window.location.pathname + window.location.search);
    }
  }, [page]);

  // Check existing session on mount
  useEffect(() => {
    checkAuthSession();
  }, []);

  const checkAuthSession = async () => {
    const token = localStorage.getItem("neetAuthToken");
    if (!token) {
      setAuthChecking(false);
      setPage("login");
      return;
    }

    try {
      const res = await api.auth.me();
      setCurrentUser(res.user);
      setStudentProfile(res.profile);
      await loadInitialData(res.user.id);
      setPage((prev) => (prev === "login" ? "dashboard" : prev));
    } catch (err) {
      console.warn("Auth check failed:", err.message);
      localStorage.removeItem("neetAuthToken");
      setPage("login");
    } finally {
      setAuthChecking(false);
    }
  };

  const loadInitialData = async () => {
    try {
      setLoadingTests(true);
      const [testsRes, historyRes, goalsRes] = await Promise.all([
        api.tests.getAvailable().catch(() => ({ tests: [] })),
        api.tests.getHistory().catch(() => ({ history: [] })),
        api.goals.get().catch(() => null),
      ]);

      setAvailableTests(testsRes.tests || []);
      setAttemptHistory(historyRes.history || []);
      if (goalsRes) setGoalsData(goalsRes);
    } catch (err) {
      console.error("Error loading student data:", err);
    } finally {
      setLoadingTests(false);
    }
  };

  const handleLoginSuccess = async (user, profile) => {
    setCurrentUser(user);
    setStudentProfile(profile);
    await loadInitialData(user.id);
    setPage("dashboard");
  };

  const handleLogout = () => {
    localStorage.removeItem("neetAuthToken");
    setCurrentUser(null);
    setStudentProfile(null);
    setGoalsData(null);
    setAttemptHistory([]);
    setTestResult(null);
    setActiveExamSession(null);
    setPage("login");
  };

  // Launch Exam Mode
  const handleStartTest = async (testId) => {
    try {
      const session = await api.tests.start(testId);
      setActiveTestId(testId);
      setActiveExamSession(session);
      setPage("exam");
    } catch (err) {
      alert(`Could not start test: ${err.message}`);
    }
  };

  // Create Custom Test
  const handleCreateCustomTest = async (customConfig) => {
    const res = await api.tests.createCustom(customConfig);
    await handleStartTest(res.questionSet.id);
  };

  // Exam Submission Handler
  const handleExamSubmitted = (result) => {
    setTestResult(result);
    setActiveExamSession(null);
    setActiveTestId(null);
    setPage("result");
    // Refresh history and goals
    loadInitialData();
  };

  // View Scorecard of a past attempt
  const handleViewResult = async (attemptId) => {
    try {
      const result = await api.tests.getResult(attemptId);
      setTestResult(result);
      setPage("result");
    } catch (err) {
      alert(`Failed to load test scorecard: ${err.message}`);
    }
  };

  // Loading Screen
  if (authChecking) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#0f172a", color: "#fff" }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 38, marginBottom: 10 }}>🩺</div>
          <h2 style={{ margin: "0 0 6px" }}>NEET CBT Simulator</h2>
          <p style={{ color: "#94a3b8", fontSize: 13 }}>Initializing verified PostgreSQL connection...</p>
        </div>
      </div>
    );
  }

  // Not Logged In
  if (!currentUser || page === "login") {
    return <AuthView onLoginSuccess={handleLoginSuccess} />;
  }

  // Exam Mode: Full-screen CBT engine
  if (page === "exam" && activeExamSession) {
    return (
      <ExamView
        testId={activeTestId}
        examSession={activeExamSession}
        onExamSubmitted={handleExamSubmitted}
        currentUser={currentUser}
      />
    );
  }

  // Result Mode: Full scorecard and review
  if (page === "result" && testResult) {
    return (
      <div className="app-shell">
        <Sidebar
          currentPage={page}
          onNavigate={(p) => setPage(p)}
          currentUser={currentUser}
          studentProfile={studentProfile}
          onLogout={handleLogout}
          mobileOpen={mobileMenuOpen}
          onCloseMobile={() => setMobileMenuOpen(false)}
        />
        <div className="app-main-content">
          <div className="main-top-navbar">
            <button className="mobile-nav-toggle" onClick={() => setMobileMenuOpen(true)}>
              ☰
            </button>
            <div className="page-title-badge">
              <h2>Scorecard & Performance Analysis</h2>
            </div>
            <button className="secondary-button" style={{ fontSize: 13 }} onClick={() => setPage("dashboard")}>
              Dashboard →
            </button>
          </div>
          <div className="page-body-container">
            <ResultView testResult={testResult} onNavigate={(p) => setPage(p)} />
          </div>
        </div>
      </div>
    );
  }

  // Current page title mapping
  const activeNavItem = NAV_ITEMS.find((item) => item.id === page);
  const pageTitle = activeNavItem ? activeNavItem.label : "Dashboard";

  return (
    <div className="app-shell">
      {/* Persistent Sidebar */}
      <Sidebar
        currentPage={page}
        onNavigate={(targetPage) => setPage(targetPage)}
        currentUser={currentUser}
        studentProfile={studentProfile}
        onLogout={handleLogout}
        mobileOpen={mobileMenuOpen}
        onCloseMobile={() => setMobileMenuOpen(false)}
      />

      {/* Main Content Area */}
      <div className="app-main-content">
        {/* Top Navbar */}
        <header className="main-top-navbar">
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <button className="mobile-nav-toggle" onClick={() => setMobileMenuOpen(true)}>
              ☰
            </button>
            <div className="page-title-badge">
              <span style={{ fontSize: 20 }}>{activeNavItem?.icon || "📊"}</span>
              <h2>{pageTitle}</h2>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <span style={{ fontSize: 13, color: "#64748b" }}>
              Target: <strong style={{ color: "#1e3a8a" }}>{goalsData?.targetScore || studentProfile?.targetScore || 650}/720</strong>
            </span>
            <div
              style={{
                width: 34,
                height: 34,
                borderRadius: "50%",
                background: "#2563eb",
                color: "#fff",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontWeight: 700,
                fontSize: 14,
                cursor: "pointer",
              }}
              title={currentUser?.name}
              onClick={() => setPage("profile")}
            >
              {(currentUser?.name || "S").charAt(0).toUpperCase()}
            </div>
          </div>
        </header>

        {/* Dynamic Page Container */}
        <main className="page-body-container">
          {page === "dashboard" && (
            <DashboardView
              currentUser={currentUser}
              studentProfile={studentProfile}
              goalsData={goalsData}
              attemptHistory={attemptHistory}
              availableTests={availableTests}
              onNavigate={(p) => setPage(p)}
              onViewResult={handleViewResult}
            />
          )}

          {page === "startTest" && (
            <StartTestView
              availableTests={availableTests}
              loadingTests={loadingTests}
              onStartTest={handleStartTest}
              onCreateCustomTest={handleCreateCustomTest}
              currentUser={currentUser}
            />
          )}

          {page === "history" && (
            <TestHistoryView
              attemptHistory={attemptHistory}
              onViewResult={handleViewResult}
              onNavigate={(p) => setPage(p)}
            />
          )}

          {page === "analytics" && (
            <AnalyticsView onNavigate={(p) => setPage(p)} />
          )}

          {page === "goals" && (
            <GoalsView
              studentProfile={studentProfile}
              onGoalsUpdated={loadInitialData}
            />
          )}

          {page === "questionBank" && (
            <QuestionBankView
              availableTests={availableTests}
              onStartTest={handleStartTest}
              onNavigate={(p) => setPage(p)}
              currentUser={currentUser}
            />
          )}

          {page === "profile" && (
            <ProfileView
              currentUser={currentUser}
              studentProfile={studentProfile}
              onProfileUpdated={loadInitialData}
              attemptHistory={attemptHistory}
            />
          )}

          {page === "adminUpload" && (
            <AdminUploadView
              currentUser={currentUser}
              onTestPublished={loadInitialData}
            />
          )}
        </main>
      </div>
    </div>
  );
}
