/**
 * Robust RFC 4180 compliant CSV Parser and Validator for NEET CBT
 */

const ALLOWED_SUBJECTS = ["Physics", "Chemistry", "Biology"];

/**
 * Parses raw CSV string into rows of string arrays, properly handling quotes, commas, and newlines.
 * @param {string} text
 * @returns {string[][]}
 */
function parseRawCSV(text) {
  if (typeof text !== "string") return [];
  const rows = [];
  let currentRow = [];
  let currentField = "";
  let inQuotes = false;

  // Normalize line breaks
  const str = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  for (let i = 0; i < str.length; i++) {
    const char = str[i];
    const nextChar = str[i + 1];

    if (inQuotes) {
      if (char === '"' && nextChar === '"') {
        currentField += '"';
        i++; // skip escaped quote
      } else if (char === '"') {
        inQuotes = false;
      } else {
        currentField += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === ",") {
        currentRow.push(currentField);
        currentField = "";
      } else if (char === "\n") {
        currentRow.push(currentField);
        currentField = "";
        // Only push non-empty rows
        if (currentRow.some((f) => f.trim().length > 0)) {
          rows.push(currentRow);
        }
        currentRow = [];
      } else {
        currentField += char;
      }
    }
  }

  // Push last field & row if pending
  if (currentField.length > 0 || currentRow.length > 0) {
    currentRow.push(currentField);
    if (currentRow.some((f) => f.trim().length > 0)) {
      rows.push(currentRow);
    }
  }

  return rows;
}

/**
 * Normalizes header string (lowercase, strips spaces and underscores)
 */
function normalizeHeader(h) {
  return String(h || "")
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, "");
}

/**
 * Validates and parses Question Paper CSV
 * Expected headers: id, subject, chapter, question, optiona, optionb, optionc, optiond
 */
function parseQuestionPaperCSV(csvText) {
  const rawRows = parseRawCSV(csvText);
  const errors = [];
  const warnings = [];

  if (rawRows.length < 2) {
    return {
      valid: false,
      errors: [{ row: 0, message: "CSV file is empty or missing data rows." }],
      warnings: [],
      questions: [],
    };
  }

  const headerRow = rawRows[0];
  const normalizedHeaders = headerRow.map(normalizeHeader);

  // Expected column mapping
  const colMap = {
    id: normalizedHeaders.findIndex((h) => h === "id" || h === "qno" || h === "questionno" || h === "number"),
    subject: normalizedHeaders.findIndex((h) => h === "subject"),
    chapter: normalizedHeaders.findIndex((h) => h === "chapter" || h === "topic"),
    question: normalizedHeaders.findIndex((h) => h === "question" || h === "questiontext" || h === "q"),
    optiona: normalizedHeaders.findIndex((h) => h === "optiona" || h === "opt1" || h === "a"),
    optionb: normalizedHeaders.findIndex((h) => h === "optionb" || h === "opt2" || h === "b"),
    optionc: normalizedHeaders.findIndex((h) => h === "optionc" || h === "opt3" || h === "c"),
    optiond: normalizedHeaders.findIndex((h) => h === "optiond" || h === "opt4" || h === "d"),
  };

  const missingColumns = [];
  if (colMap.id === -1) missingColumns.push("id");
  if (colMap.subject === -1) missingColumns.push("subject");
  if (colMap.question === -1) missingColumns.push("question");
  if (colMap.optiona === -1) missingColumns.push("optiona");
  if (colMap.optionb === -1) missingColumns.push("optionb");
  if (colMap.optionc === -1) missingColumns.push("optionc");
  if (colMap.optiond === -1) missingColumns.push("optiond");

  if (missingColumns.length > 0) {
    return {
      valid: false,
      errors: [{ row: 1, message: `Missing required column(s): ${missingColumns.join(", ")}` }],
      warnings: [],
      questions: [],
    };
  }

  const questions = [];
  const seenIds = new Set();
  const subjectCounts = { Physics: 0, Chemistry: 0, Biology: 0 };
  const chapterSet = new Set();

  for (let r = 1; r < rawRows.length; r++) {
    const rowNum = r + 1; // 1-indexed line number in file
    const row = rawRows[r];

    const rawId = (row[colMap.id] || "").trim();
    const rawSubject = (row[colMap.subject] || "").trim();
    const rawChapter = colMap.chapter !== -1 && row[colMap.chapter] ? row[colMap.chapter].trim() : "General";
    const questionText = (row[colMap.question] || "").trim();
    const optA = (row[colMap.optiona] || "").trim();
    const optB = (row[colMap.optionb] || "").trim();
    const optC = (row[colMap.optionc] || "").trim();
    const optD = (row[colMap.optiond] || "").trim();

    if (!rawId) {
      errors.push({ row: rowNum, column: "id", message: "Question ID / number cannot be empty." });
      continue;
    }

    if (seenIds.has(rawId)) {
      errors.push({ row: rowNum, column: "id", message: `Duplicate question identifier '${rawId}'.` });
      continue;
    }
    seenIds.add(rawId);

    // Subject validation
    const matchedSubject = ALLOWED_SUBJECTS.find(
      (s) => s.toLowerCase() === rawSubject.toLowerCase()
    );
    if (!matchedSubject) {
      errors.push({
        row: rowNum,
        column: "subject",
        message: `Invalid subject '${rawSubject}'. Must be Physics, Chemistry, or Biology.`,
      });
      continue;
    }

    if (!questionText) {
      errors.push({ row: rowNum, column: "question", message: "Question text cannot be empty." });
      continue;
    }

    if (!optA || !optB || !optC || !optD) {
      errors.push({
        row: rowNum,
        column: "options",
        message: "All four options (optionA, optionB, optionC, optionD) must be provided.",
      });
      continue;
    }

    subjectCounts[matchedSubject] = (subjectCounts[matchedSubject] || 0) + 1;
    if (rawChapter) chapterSet.add(rawChapter);

    questions.push({
      id: rawId,
      number: questions.length + 1,
      subject: matchedSubject,
      chapter: rawChapter || "General",
      question: questionText,
      options: [optA, optB, optC, optD],
    });
  }

  const valid = errors.length === 0 && questions.length > 0;

  return {
    valid,
    errors,
    warnings,
    totalQuestions: questions.length,
    subjectCounts,
    chapters: Array.from(chapterSet),
    questions,
    preview: questions.slice(0, 5),
  };
}

/**
 * Validates and parses Answer Key CSV
 * Expected headers: Question, Answer
 */
function parseAnswerKeyCSV(csvText) {
  const rawRows = parseRawCSV(csvText);
  const errors = [];
  const warnings = [];

  if (rawRows.length < 2) {
    return {
      valid: false,
      errors: [{ row: 0, message: "Answer key CSV is empty or missing data rows." }],
      warnings: [],
      answerMap: {},
    };
  }

  const headerRow = rawRows[0];
  const normalizedHeaders = headerRow.map(normalizeHeader);

  const colQuestion = normalizedHeaders.findIndex(
    (h) => h === "question" || h === "qno" || h === "id" || h === "number"
  );
  const colAnswer = normalizedHeaders.findIndex(
    (h) => h === "answer" || h === "key" || h === "correct" || h === "correctoption"
  );

  if (colQuestion === -1 || colAnswer === -1) {
    return {
      valid: false,
      errors: [{ row: 1, message: "Answer key must contain 'Question' and 'Answer' columns." }],
      warnings: [],
      answerMap: {},
    };
  }

  const answerMap = {};
  const seenIds = new Set();

  for (let r = 1; r < rawRows.length; r++) {
    const rowNum = r + 1;
    const row = rawRows[r];

    const qKey = (row[colQuestion] || "").trim();
    let ansRaw = (row[colAnswer] || "").trim().toUpperCase();

    if (!qKey) {
      errors.push({ row: rowNum, column: "Question", message: "Question identifier cannot be empty." });
      continue;
    }

    if (seenIds.has(qKey)) {
      errors.push({ row: rowNum, column: "Question", message: `Duplicate question key '${qKey}' in answer key.` });
      continue;
    }
    seenIds.add(qKey);

    // Normalize answer option: support A, B, C, D or 0, 1, 2, 3 or 1, 2, 3, 4
    if (ansRaw === "0" || ansRaw === "1" && row[colAnswer].trim() === "1" && !["A","B","C","D"].includes(ansRaw)) {
      // check if numeric
    }
    if (["A", "B", "C", "D"].includes(ansRaw)) {
      // standard
    } else if (ansRaw === "1") ansRaw = "A";
    else if (ansRaw === "2") ansRaw = "B";
    else if (ansRaw === "3") ansRaw = "C";
    else if (ansRaw === "4") ansRaw = "D";
    else {
      errors.push({
        row: rowNum,
        column: "Answer",
        message: `Invalid answer '${ansRaw}' for question '${qKey}'. Must be A, B, C, or D.`,
      });
      continue;
    }

    answerMap[qKey] = ansRaw;
  }

  return {
    valid: errors.length === 0 && Object.keys(answerMap).length > 0,
    errors,
    warnings,
    totalAnswers: Object.keys(answerMap).length,
    answerMap,
  };
}

/**
 * Matches parsed questions with parsed answer key
 * Supports matching by question ID/number or matching by question text
 */
function matchQuestionsAndAnswers(questions, answerKeyResult) {
  const { answerMap } = answerKeyResult;
  const errors = [];
  const warnings = [];
  const matched = [];

  let matchMode = "id"; // 'id' or 'number' or 'text'

  // Test if keys in answerMap match question id
  const idMatches = questions.filter((q) => answerMap[q.id] !== undefined).length;
  const numMatches = questions.filter((q) => answerMap[String(q.number)] !== undefined).length;
  const textMatches = questions.filter((q) => answerMap[q.question] !== undefined).length;

  if (idMatches >= numMatches && idMatches >= textMatches && idMatches > 0) {
    matchMode = "id";
  } else if (numMatches >= textMatches && numMatches > 0) {
    matchMode = "number";
  } else if (textMatches > 0) {
    matchMode = "text";
  }

  const missingAnswers = [];

  for (const q of questions) {
    let ans = null;
    if (matchMode === "id" && answerMap[q.id]) {
      ans = answerMap[q.id];
    } else if (matchMode === "number" && answerMap[String(q.number)]) {
      ans = answerMap[String(q.number)];
    } else if (matchMode === "text" && answerMap[q.question]) {
      ans = answerMap[q.question];
    } else if (answerMap[q.id] || answerMap[String(q.number)] || answerMap[q.question]) {
      ans = answerMap[q.id] || answerMap[String(q.number)] || answerMap[q.question];
    }

    if (!ans) {
      missingAnswers.push(q.id);
    } else {
      matched.push({
        ...q,
        correctAnswer: ans,
      });
    }
  }

  if (missingAnswers.length > 0) {
    errors.push({
      message: `Answer key is missing answers for ${missingAnswers.length} question(s): [${missingAnswers.slice(0, 10).join(", ")}${missingAnswers.length > 10 ? "..." : ""}].`,
    });
  }

  const totalQuestions = questions.length;
  const totalAnswers = Object.keys(answerMap).length;
  if (totalAnswers > totalQuestions) {
    warnings.push(`Answer key contains ${totalAnswers - totalQuestions} extra answers not found in question paper.`);
  }

  return {
    matched: errors.length === 0,
    matchMode,
    errors,
    warnings,
    matchedCount: matched.length,
    totalQuestions,
    questionsWithAnswers: matched,
  };
}

module.exports = {
  parseRawCSV,
  parseQuestionPaperCSV,
  parseAnswerKeyCSV,
  matchQuestionsAndAnswers,
  ALLOWED_SUBJECTS,
};
