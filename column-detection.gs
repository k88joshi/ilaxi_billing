// ========================================
// COLUMN DETECTION
// ========================================

/**
 * Synonyms for column name matching in auto-detection.
 * Each key maps to an array of possible column name variations.
 * @const {Object<string, string[]>}
 */
const COLUMN_SYNONYMS = {
  phoneNumber: ["phone", "mobile", "cell", "telephone", "contact", "phone number", "phone no", "mobile number", "cell number", "contact number", "tel"],
  customerName: ["name", "customer", "client", "full name", "customer name", "client name", "customer_name", "fullname"],
  balance: ["balance", "amount", "total", "due", "owing", "amount due", "total due", "balance due", "amount owing", "price", "cost"],
  numTiffins: ["tiffins", "tiffin", "quantity", "qty", "count", "number", "no. of tiffins", "no of tiffins", "num tiffins", "tiffin count", "items"],
  dueDate: ["date", "due date", "due", "month", "billing date", "invoice date", "period", "billing month", "billing period"],
  messageStatus: ["status", "message status", "msg status", "sms status", "delivery status", "message", "sent"],
  orderId: ["order", "order id", "order number", "order no", "invoice", "invoice id", "invoice number", "invoice no", "id", "ref", "reference"],
  paymentStatus: ["payment", "payment status", "paid", "payment state", "pay status", "paid status", "payment_status"]
};

/**
 * Auto-detects column mappings by matching header names against known synonyms.
 * Returns headers and detection results with confidence scores.
 *
 * @returns {Object} Object with headers array and detections object
 */
function autoDetectColumns() {
  try {
    const sheet = getTargetSheet_();
    if (!sheet) {
      return { headers: [], detections: {} };
    }

    const settings = getSettings();
    const headerRowIndex = settings.behavior.headerRowIndex || 1;
    const lastCol = sheet.getLastColumn();

    if (lastCol === 0) {
      return { headers: [], detections: {} };
    }

    const headers = sheet.getRange(headerRowIndex, 1, 1, lastCol).getValues()[0]
      .filter(h => h && String(h).trim() !== "")
      .map(h => String(h).trim());

    if (headers.length === 0) {
      return { headers: [], detections: {} };
    }

    // Auto-detect mappings
    const detections = {};

    Object.keys(COLUMN_SYNONYMS).forEach(columnKey => {
      const synonyms = COLUMN_SYNONYMS[columnKey];
      let bestMatch = null;
      let bestScore = 0;

      headers.forEach(header => {
        const score = calculateMatchScore_(header, synonyms);
        if (score > bestScore) {
          bestScore = score;
          bestMatch = header;
        }
      });

      if (bestMatch && bestScore >= 50) {
        detections[columnKey] = {
          match: bestMatch,
          confidence: bestScore
        };
      }
    });

    return {
      headers: headers,
      detections: detections
    };
  } catch (e) {
    Logger.log(`autoDetectColumns error: ${e.message}`);
    return { headers: [], detections: {} };
  }
}

/**
 * Calculates a match score between a header and a list of synonyms.
 * Uses exact match, starts-with, contains, and fuzzy matching strategies.
 *
 * @param {string} header - The header name to match
 * @param {string[]} synonyms - Array of possible synonym strings
 * @returns {number} Match score from 0-100
 */
function calculateMatchScore_(header, synonyms) {
  if (!header || !synonyms || !Array.isArray(synonyms)) {
    return 0;
  }

  const normalizedHeader = normalizeHeader_(header);
  let maxScore = 0;

  synonyms.forEach(synonym => {
    const normalizedSynonym = normalizeHeader_(synonym);
    let score = 0;

    // Exact match = 100%
    if (normalizedHeader === normalizedSynonym) {
      score = 100;
    }
    // Header starts with synonym = 90%
    else if (normalizedHeader.startsWith(normalizedSynonym)) {
      score = 90;
    }
    // Synonym starts with header = 85%
    else if (normalizedSynonym.startsWith(normalizedHeader)) {
      score = 85;
    }
    // Header contains synonym = 80%
    else if (normalizedHeader.includes(normalizedSynonym)) {
      score = 80;
    }
    // Synonym contains header = 75%
    else if (normalizedSynonym.includes(normalizedHeader)) {
      score = 75;
    }
    // Word boundary match (e.g., "Customer Name" contains "name" as word)
    else {
      const headerWords = normalizedHeader.split(/[\s_-]+/);
      const synonymWords = normalizedSynonym.split(/[\s_-]+/);

      // Check if any synonym word matches any header word exactly
      let wordMatch = false;
      synonymWords.forEach(sWord => {
        if (headerWords.includes(sWord)) {
          wordMatch = true;
        }
      });

      if (wordMatch) {
        score = 70;
      }
    }

    if (score > maxScore) {
      maxScore = score;
    }
  });

  return maxScore;
}

/**
 * Normalizes a header string for comparison by lowercasing and removing special characters.
 *
 * @param {string} header - Header string to normalize
 * @returns {string} Normalized header string
 */
function normalizeHeader_(header) {
  if (!header || typeof header !== "string") {
    return "";
  }

  return header
    .toLowerCase()
    .replace(/[^\w\s]/g, "") // Remove special characters except word chars and spaces
    .replace(/\s+/g, " ")    // Normalize whitespace
    .trim();
}

/**
 * Auto-persists high-confidence column resolutions to settings.
 * Only saves matches with confidence >= 90 (exact or starts-with).
 * Lower-confidence matches are left as suggestions for the user.
 *
 * @param {Array<Object>} warnings - Column mismatch warnings from getSheetContext_
 * @param {Object} settings - Current settings object
 * @returns {{warnings: Array<Object>, didPersist: boolean}}
 * @private
 */
function persistHighConfidenceColumns_(warnings, settings) {
  const highConfidence = warnings.filter(w => w.resolved && w.confidence >= 90);
  if (highConfidence.length === 0) return { warnings, didPersist: false };

  for (const w of highConfidence) {
    settings.columns[w.key] = w.actual;
    w.persisted = true;
  }

  const result = saveSettings(settings);
  if (result.success) {
    const details = highConfidence.map(w => `${w.key}: "${w.saved}" → "${w.actual}"`).join(', ');
    Logger.log(`Auto-persisted ${highConfidence.length} column mapping(s): ${details}`);
    logEvent_('columns', 'Auto-persist columns', details, true, getCurrentUserEmail_());
  } else {
    // Rollback persisted flags on save failure
    for (const w of highConfidence) { w.persisted = false; }
    Logger.log(`Failed to auto-persist columns: ${result.error}`);
  }

  return { warnings, didPersist: result.success };
}

/**
 * Reads the header row and creates a mapping of column names to their 0-based column index.
 * Uses dynamic header row index from settings.
 * This makes the script resilient to column reordering.
 * Also detects and logs warnings for duplicate header names.
 *
 * @returns {Object<string, number>} An object where keys are header names
 * and values are their 0-based indices.
 * e.g., {"Customer Name": 1, "Phone Number": 0}
 * @throws {Error} If unable to read the sheet or headers
 */
function getHeaderColumnMap() {
  try {
    const sheet = getTargetSheet_();
    if (!sheet) {
      throw new Error("No sheet found");
    }

    const settings = getSettings();
    const headerRowIndex = settings.behavior.headerRowIndex;
    const lastCol = sheet.getLastColumn();

    if (lastCol === 0) {
      Logger.log("getHeaderColumnMap: Sheet has no columns");
      return {};
    }

    const headers = sheet.getRange(headerRowIndex, 1, 1, lastCol).getValues()[0];
    const map = {};
    const seen = {};

    headers.forEach((header, index) => {
      if (header) {
        const trimmed = String(header).trim();

        // Check for duplicate headers, which can cause confusion
        if (seen[trimmed]) {
          Logger.log(`⚠️ Warning: Duplicate header "${trimmed}" found at columns ${seen[trimmed]} and ${index + 1}. Using the last occurrence.`);
          // Note: Not showing UI alert here as this function may be called during batch operations or triggers
        }

        map[trimmed] = index; // 0-based index
        seen[trimmed] = index + 1; // 1-based column for logging
      }
    });

    return map;
  } catch (e) {
    Logger.log(`ERROR in getHeaderColumnMap: ${e.message}`);
    throw new Error(`Failed to read sheet headers: ${e.message}`);
  }
}
