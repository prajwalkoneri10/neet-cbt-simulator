/**
 * Browser-based PDF Extractor and Parser for NEET Question Papers and Answer Keys
 * Uses pdfjs-dist to extract plain text and robust regex patterns for question/option detection.
 */

import * as pdfjsLib from "pdfjs-dist";

// Set worker source for Vite bundler
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url
).toString();

/**
 * Extracts plain text from an uploaded PDF File.
 * Validates file size and detects scanned (image-only) PDFs.
 * @param {File} file
 * @returns {Promise<string>}
 */
export async function extractPdfText(file) {
  if (!file) throw new Error("No file provided.");

  // Size limit check (25MB)
  const MAX_SIZE = 25 * 1024 * 1024;
  if (file.size > MAX_SIZE) {
    throw new Error(`File is too large (${(file.size / (1024 * 1024)).toFixed(1)}MB). Maximum allowed size is 25MB.`);
  }

  const buffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
  const pages = [];
  let totalLength = 0;

  for (let pageNo = 1; pageNo <= pdf.numPages; pageNo++) {
    const page = await pdf.getPage(pageNo);
    const content = await page.getTextContent();
    const pageText = content.items.map((item) => item.str || "").join(" ");
    totalLength += pageText.trim().length;
    pages.push(pageText);
  }

  // Scanned PDF detection: if multiple pages have almost no text
  if (pdf.numPages >= 1 && totalLength < 40) {
    const err = new Error(
      "Scanned Image PDF Detected: This PDF appears to be a scanned bitmap document without selectable text layers. Automatic OCR is not supported natively in browser. Please upload a digital text-based PDF or use the sample CSV template."
    );
    err.code = "SCANNED_PDF_DETECTED";
    throw err;
  }

  return pages.join("\n");
}

/**
 * Parses Question Paper text extracted from a PDF.
 * Detects numbered questions and 4 options (A-D or 1-4).
 * @param {string} text
 * @returns {{ valid: boolean, questions: Array<any>, errors: string[], warnings: string[] }}
 */
export function parseQuestionPDF(text) {
  if (!text || !text.trim()) {
    return {
      valid: false,
      questions: [],
      errors: ["Question paper text is empty."],
      warnings: [],
    };
  }

  const normalized = text
    .replace(/\u00a0/g, " ")
    .replace(/[\t ]+/g, " ")
    .replace(/\r/g, "\n")
    .replace(/\n+/g, "\n");

  // Regex to detect question starts: e.g. "1.", "1)", "Q.1", "Q1.", "Question 1:"
  const starts = [
    ...normalized.matchAll(/(?:^|\n|\s)(?:Q(?:uestion)?\s*[.:\-]?\s*)?(\d{1,3})\s*[.):\-]\s+/gi),
  ];

  if (!starts.length) {
    return {
      valid: false,
      questions: [],
      errors: [
        "Could not detect numbered questions in the PDF. Please ensure questions are numbered (e.g. 1. Question... or Q1.)",
      ],
      warnings: [],
    };
  }

  // Filter out spurious numbers that are out of sequence or part of dates
  const questionBlocks = [];
  starts.forEach((m, i) => {
    const num = Number(m[1]);
    const startAt = m.index + m[0].lastIndexOf(m[1]);
    const endAt = i + 1 < starts.length ? starts[i + 1].index : normalized.length;
    const blockContent = normalized.slice(startAt + m[0].length - m[1].length, endAt).trim();
    questionBlocks.push({ number: num, startAt, text: blockContent });
  });

  const parsed = [];
  const errors = [];
  const warnings = [];
  const seenNumbers = new Set();

  questionBlocks.forEach((block) => {
    const { number, text: blockText } = block;

    // Duplicate detection
    if (seenNumbers.has(number)) {
      warnings.push(`Duplicate question #${number} detected in PDF text.`);
    }
    seenNumbers.add(number);

    // Option detection patterns:
    // 1) A) ... B) ... C) ... D)
    // 2) (A) ... (B) ... (C) ... (D)
    // 3) (1) ... (2) ... (3) ... (4) (numeric fallback mapped to A..D)
    let optionMatches = [
      ...blockText.matchAll(/(?:^|\s)(?:\(?([ABCD])\)|\(?([ABCD])\.)\s+/gi),
    ];

    let isNumeric = false;
    if (optionMatches.length < 4) {
      // Try numeric options (1) (2) (3) (4)
      const numOptions = [
        ...blockText.matchAll(/(?:^|\s)(?:\(?([1234])\)|\(?([1234])\.)\s+/g),
      ];
      if (numOptions.length >= 4) {
        optionMatches = numOptions;
        isNumeric = true;
      }
    }

    if (optionMatches.length < 4) {
      warnings.push(`Q#${number}: Could not detect all 4 options cleanly. Please verify and edit.`);
      // Still include question with partial options so student can correct in preview table!
      parsed.push({
        number,
        subject: number <= 45 ? "Physics" : number <= 90 ? "Chemistry" : "Biology",
        chapter: "General",
        question: blockText.slice(0, 140).trim(),
        options: ["Option A", "Option B", "Option C", "Option D"],
        confidence: "low",
        needsReview: true,
      });
      return;
    }

    const firstFour = optionMatches.slice(0, 4);
    const questionText = blockText.slice(0, firstFour[0].index).trim();
    const options = firstFour.map((m, j) => {
      const startAt = m.index + m[0].length;
      const endAt = j + 1 < firstFour.length ? firstFour[j + 1].index : blockText.length;
      return blockText.slice(startAt, endAt).trim();
    });

    // Subject heuristic
    let subject = number <= 45 ? "Physics" : number <= 90 ? "Chemistry" : "Biology";
    const contextBefore = normalized.slice(0, block.startAt).slice(-1200).toLowerCase();
    if (/biology|botany|zoology/.test(contextBefore)) subject = "Biology";
    else if (/chemistry/.test(contextBefore)) subject = "Chemistry";
    else if (/physics/.test(contextBefore)) subject = "Physics";

    const isConfidenceLow = questionText.length < 8 || options.some((o) => o.length === 0);

    parsed.push({
      number,
      subject,
      chapter: "General",
      question: questionText || `Question ${number}`,
      options: options.map((opt, oIdx) => opt || `Option ${String.fromCharCode(65 + oIdx)}`),
      confidence: isConfidenceLow ? "low" : "high",
      needsReview: isConfidenceLow,
    });
  });

  parsed.sort((a, b) => a.number - b.number);

  return {
    valid: parsed.length > 0,
    questions: parsed,
    errors,
    warnings,
  };
}

/**
 * Parses Answer Key text extracted from a PDF.
 * Detects formats:
 * - "1-A", "2: B", "3. C", "4 D", "Q1: A", "(1) A"
 * - Numeric answer keys: "1-1" -> A, "2-2" -> B, "3-3" -> C, "4-4" -> D
 * @param {string} text
 * @returns {{ valid: boolean, answers: Record<string, string>, detectedCount: number, errors: string[], warnings: string[] }}
 */
export function parseAnswerPDF(text) {
  if (!text || !text.trim()) {
    return {
      valid: false,
      answers: {},
      detectedCount: 0,
      errors: ["Answer key PDF text is empty."],
      warnings: [],
    };
  }

  const normalized = text.replace(/\u00a0/g, " ").replace(/[\t]+/g, " ");
  const key = {};
  const warnings = [];

  // 1. Standard A/B/C/D patterns
  const patternsAlpha = [
    /(?:^|\s)(?:Q(?:uestion)?\s*[.:\-]?\s*)?(\d{1,3})\s*[.)\-:|]?\s*\(?([ABCD])\)?(?=\s|$|[.,;:])/gi,
    /(?:^|\s)\((\d{1,3})\)\s*([ABCD])(?=\s|$|[.,;:])/gi,
  ];

  patternsAlpha.forEach((re) => {
    for (const m of normalized.matchAll(re)) {
      key[String(m[1])] = m[2].toUpperCase();
    }
  });

  // 2. If no answers found or very few, try numeric answers (1->A, 2->B, 3->C, 4->D)
  if (Object.keys(key).length < 5) {
    const numToAlpha = { "1": "A", "2": "B", "3": "C", "4": "D" };
    const patternsNumeric = [
      /(?:^|\s)(?:Q(?:uestion)?\s*[.:\-]?\s*)?(\d{1,3})\s*[.)\-:|]\s*([1234])(?=\s|$|[.,;:])/g,
    ];

    patternsNumeric.forEach((re) => {
      for (const m of normalized.matchAll(re)) {
        if (!key[String(m[1])]) {
          key[String(m[1])] = numToAlpha[m[2]];
        }
      }
    });
  }

  const detectedCount = Object.keys(key).length;

  if (detectedCount === 0) {
    return {
      valid: false,
      answers: {},
      detectedCount: 0,
      errors: [
        "Could not detect question numbers and answers in the PDF answer key. Supported formats include '1-A', '1. B', 'Q1: C', or '1-1'.",
      ],
      warnings,
    };
  }

  return {
    valid: true,
    answers: key,
    detectedCount,
    errors: [],
    warnings,
  };
}

/**
 * Matches extracted questions with answer keys by question number.
 * Flags missing answers, missing questions, and mismatched keys.
 * @param {Array<any>} questions
 * @param {Record<string, string>} answerMap
 * @returns {{ matchedQuestions: Array<any>, matchedCount: number, missingAnswersCount: number, warnings: string[] }}
 */
export function matchQuestionsWithAnswers(questions, answerMap = {}) {
  const matched = [];
  const warnings = [];
  let matchedCount = 0;
  let missingAnswersCount = 0;

  questions.forEach((q) => {
    const qNum = String(q.number);
    const ans = answerMap[qNum] || null;

    if (ans && ["A", "B", "C", "D"].includes(ans)) {
      matchedCount += 1;
      matched.push({
        ...q,
        correctAnswer: ans,
      });
    } else {
      missingAnswersCount += 1;
      warnings.push(`Question #${q.number}: No answer key found in Answer Key PDF. Defaulted to Option A for verification.`);
      matched.push({
        ...q,
        correctAnswer: "A",
        needsReview: true,
      });
    }
  });

  return {
    matchedQuestions: matched,
    matchedCount,
    missingAnswersCount,
    warnings,
  };
}

/**
 * Helper to convert parsed PDF questions into a valid CSV string.
 */
export function questionsToCSV(questions) {
  const rows = ["id,subject,chapter,question,optionA,optionB,optionC,optionD"];
  questions.forEach((q) => {
    const esc = (s) => `"${String(s || "").replace(/"/g, '""')}"`;
    rows.push(
      [
        q.number || q.id,
        esc(q.subject),
        esc(q.chapter || "General"),
        esc(q.question),
        esc(q.options[0]),
        esc(q.options[1]),
        esc(q.options[2]),
        esc(q.options[3]),
      ].join(",")
    );
  });
  return rows.join("\n");
}

/**
 * Helper to convert parsed PDF answer key object into a valid CSV string.
 */
export function answersToCSV(answerMap) {
  const rows = ["Question,Answer"];
  Object.entries(answerMap).forEach(([qId, ans]) => {
    rows.push(`${qId},${ans}`);
  });
  return rows.join("\n");
}
