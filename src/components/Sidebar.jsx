import React from "react";

export const NAV_ITEMS = [
  { id: "dashboard", label: "Dashboard", icon: "📊" },
  { id: "startTest", label: "Start Mock Test", icon: "⏱️" },
  { id: "history", label: "Test History", icon: "📜" },
  { id: "analytics", label: "Performance Analytics", icon: "📈" },
  { id: "goals", label: "Goals & Study Progress", icon: "🎯" },
  { id: "questionBank", label: "Question Bank", icon: "📚" },
  { id: "profile", label: "Student Profile", icon: "👤" },
  { id: "adminUpload", label: "Admin Question Upload", icon: "⚙️", adminOnly: true },
];

export default function Sidebar({
  currentPage,
  onNavigate,
  currentUser,
  studentProfile,
  onLogout,
  mobileOpen,
  onCloseMobile,
}) {
  const isAdmin = Boolean(currentUser?.isAdmin);

  const navContent = (
    <>
      <div className="sidebar-brand">
        <div className="brand-logo">N</div>
        <div className="brand-text">
          <span className="brand-title">NEET CBT</span>
          <span className="brand-subtitle">Computer-Based Test Simulator</span>
        </div>
      </div>

      <div className="sidebar-student-card">
        <div className="student-card-top">
          <div className="student-avatar">
            {(currentUser?.name || "S").charAt(0).toUpperCase()}
          </div>
          <div>
            <div className="student-name">{currentUser?.name || "Student"}</div>
            <span className="student-role-badge">
              {isAdmin ? "Administrator" : "NEET Aspirant"}
            </span>
          </div>
        </div>
        <div className="student-card-meta">
          <span>Target: {studentProfile?.targetScore || 650}/720</span>
          <span>NEET {studentProfile?.targetYear || "2027"}</span>
        </div>
      </div>

      <nav className="sidebar-nav">
        {NAV_ITEMS.map((item) => {
          if (item.adminOnly && !isAdmin) return null;
          const isActive = currentPage === item.id;
          return (
            <button
              key={item.id}
              className={`sidebar-nav-item ${isActive ? "active" : ""} ${
                item.adminOnly ? "admin-item" : ""
              }`}
              onClick={() => {
                onNavigate(item.id);
                if (onCloseMobile) onCloseMobile();
              }}
            >
              <span className="nav-icon">{item.icon}</span>
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>

      <div className="sidebar-footer">
        <button className="sidebar-logout-btn" onClick={onLogout}>
          <span>🚪</span>
          <span>Sign Out</span>
        </button>
      </div>
    </>
  );

  return (
    <>
      {/* Desktop Persistent Sidebar */}
      <aside className="app-sidebar">{navContent}</aside>

      {/* Mobile Drawer */}
      {mobileOpen && (
        <div className="mobile-nav-drawer" onClick={onCloseMobile}>
          <div
            className="mobile-drawer-content"
            onClick={(e) => e.stopPropagation()}
          >
            {navContent}
          </div>
        </div>
      )}
    </>
  );
}
