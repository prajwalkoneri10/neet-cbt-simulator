const neetQuestions = [

  // =========================
  // BIOLOGY — 90 QUESTIONS
  // =========================

  ...Array.from({ length: 90 }, (_, index) => ({
    id: index + 1,
    subject: "Biology",
    question: `Biology Question ${index + 1}`,
    options: [
      "Option A",
      "Option B",
      "Option C",
      "Option D"
    ],
    answer: 0
  })),

  // =========================
  // PHYSICS — 45 QUESTIONS
  // =========================

  ...Array.from({ length: 45 }, (_, index) => ({
    id: index + 91,
    subject: "Physics",
    question: `Physics Question ${index + 1}`,
    options: [
      "Option A",
      "Option B",
      "Option C",
      "Option D"
    ],
    answer: 0
  })),

  // =========================
  // CHEMISTRY — 45 QUESTIONS
  // =========================

  ...Array.from({ length: 45 }, (_, index) => ({
    id: index + 136,
    subject: "Chemistry",
    question: `Chemistry Question ${index + 1}`,
    options: [
      "Option A",
      "Option B",
      "Option C",
      "Option D"
    ],
    answer: 0
  }))

];

export default neetQuestions;