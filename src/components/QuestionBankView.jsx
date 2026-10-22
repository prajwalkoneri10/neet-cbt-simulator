import React, { useState } from "react";

export default function QuestionBankView({
  availableTests,
  onStartTest,
  onNavigate,
  currentUser,
}) {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");

  const filteredSets = availableTests.filter((set) => {
    const matchesSearch =
      set.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      set.description.toLowerCase().includes(searchTerm.toLowerCase());

    if (!matchesSearch) return false;
    if (selectedCategory === "all") return true;
    return set.category === selectedCategory;
  });

  return (
    <div className="question-bank-view">
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
          <span style={{ fontSize: 11, fontWeight: 700, color: "#2563eb", letterSpacing: 1, textTransform: "uppercase" }}>
            EXPOSITORY REPOSITORY
          </span>
          <h1 style={{ margin: "4px 0 6px", fontSize: 24, fontWeight: 800, color: "#0f172a" }}>
            NEET Question Bank Catalog
          </h1>
          <p style={{ margin: 0, color: "#64748b", fontSize: 14 }}>
            Explore verified NCERT-mapped question papers, sectional mock sets, and chapter coverage.
          </p>
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          {currentUser?.isAdmin && (
            <button
              className="primary-button"
              style={{ background: "#0f172a", fontWeight: 700 }}
              onClick={() => onNavigate("adminUpload")}
            >
              ⚙️ Upload Question Set
            </button>
          )}
          <input
            type="text"
            placeholder="🔍 Search question sets..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{
              padding: "10px 14px",
              borderRadius: 8,
              border: "1px solid #cbd5e1",
              fontSize: 14,
              outline: "none",
            }}
          />
        </div>
      </section>

      {/* Category Pills */}
      <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
        {[
          { id: "all", label: "All Papers" },
          { id: "full_mock", label: "Full Length (180Q)" },
          { id: "biology", label: "Biology (Botany + Zoology)" },
          { id: "physics", label: "Physics" },
          { id: "chemistry", label: "Chemistry" },
        ].map((cat) => {
          const isActive = selectedCategory === cat.id;
          return (
            <button
              key={cat.id}
              onClick={() => setSelectedCategory(cat.id)}
              style={{
                padding: "8px 14px",
                borderRadius: 8,
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
                background: isActive ? "#2563eb" : "#ffffff",
                color: isActive ? "#ffffff" : "#475569",
                border: isActive ? "none" : "1px solid #e2e8f0",
              }}
            >
              {cat.label}
            </button>
          );
        })}
      </div>

      {/* Question Sets List */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))", gap: 20 }}>
        {filteredSets.map((set) => (
          <div
            key={set.id}
            style={{
              background: "#ffffff",
              border: "1px solid #e2e8f0",
              borderRadius: 14,
              padding: 22,
              boxShadow: "0 2px 8px rgba(0,0,0,0.03)",
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between",
            }}
          >
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    padding: "3px 8px",
                    borderRadius: 4,
                    background: "#eff6ff",
                    color: "#1d4ed8",
                    textTransform: "uppercase",
                  }}
                >
                  Set ID #{set.id}
                </span>
                <span style={{ fontSize: 12, color: "#64748b" }}>
                  By {set.authorName || "Faculty / Admin"}
                </span>
              </div>

              <h3 style={{ margin: "0 0 8px", fontSize: 17, fontWeight: 800, color: "#0f172a" }}>
                {set.title}
              </h3>
              <p style={{ margin: "0 0 16px", color: "#64748b", fontSize: 13, lineHeight: 1.5 }}>
                {set.description || "Official test paper with verified answer keys and detailed explanations."}
              </p>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr 1fr",
                  gap: 8,
                  background: "#f8fafc",
                  padding: "10px 12px",
                  borderRadius: 8,
                  marginBottom: 14,
                  fontSize: 12,
                  textAlign: "center",
                }}
              >
                <div>
                  <div style={{ color: "#64748b" }}>Questions</div>
                  <strong style={{ color: "#0f172a", fontSize: 14 }}>{set.totalQuestions}</strong>
                </div>
                <div>
                  <div style={{ color: "#64748b" }}>Duration</div>
                  <strong style={{ color: "#0f172a", fontSize: 14 }}>{set.durationMinutes}m</strong>
                </div>
                <div>
                  <div style={{ color: "#64748b" }}>Max Marks</div>
                  <strong style={{ color: "#0f172a", fontSize: 14 }}>{set.totalMarks || set.totalQuestions * 4}</strong>
                </div>
              </div>

              {/* Subject counts */}
              {set.subjectCounts && (
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 16 }}>
                  {Object.entries(set.subjectCounts).map(([sub, count]) => (
                    <span
                      key={sub}
                      style={{
                        fontSize: 11,
                        padding: "2px 6px",
                        borderRadius: 4,
                        background: "#f1f5f9",
                        color: "#334155",
                        fontWeight: 600,
                      }}
                    >
                      {sub}: {count} Qs
                    </span>
                  ))}
                </div>
              )}
            </div>

            <button
              className="primary-button"
              style={{ width: "100%", padding: "10px", background: "#1e3a8a", fontWeight: 700 }}
              onClick={() => onStartTest(set.id)}
            >
              ⏱️ Start CBT Mock with this Set
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
