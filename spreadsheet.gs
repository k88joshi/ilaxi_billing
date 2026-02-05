// ========================================
// SPREADSHEET ACCESS CONFIGURATION
// ========================================

/**
 * Spreadsheet ID for web app mode.
 * Set this to your Google Sheet's ID (found in the URL after /d/).
 * Example: https://docs.google.com/spreadsheets/d/YOUR_SPREADSHEET_ID_HERE/edit
 * @const {string}
 */
const SPREADSHEET_ID = 'YOUR_SPREADSHEET_ID_HERE';

/**
 * Gets the target sheet for operations.
 * In add-on mode: returns the active sheet
 * In web app mode: opens the sheet by SPREADSHEET_ID
 *
 * @returns {GoogleAppsScript.Spreadsheet.Sheet} The target sheet
 * @throws {Error} If no sheet can be accessed
 */
function getTargetSheet_() {
  // Try add-on mode first (active sheet)
  try {
    const activeSheet = SpreadsheetApp.getActiveSheet();
    if (activeSheet) {
      return activeSheet;
    }
  } catch (e) {
    // Not in add-on context, fall through to web app mode
    Logger.log('getTargetSheet_: Not in add-on context, using SPREADSHEET_ID');
  }

  // Web app mode: open by ID
  if (!SPREADSHEET_ID || SPREADSHEET_ID === 'YOUR_SPREADSHEET_ID_HERE') {
    throw new Error('SPREADSHEET_ID not configured. Please set it in spreadsheet.gs');
  }

  try {
    const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = spreadsheet.getSheets()[0]; // Get first sheet
    if (!sheet) {
      throw new Error('No sheets found in the spreadsheet');
    }
    return sheet;
  } catch (e) {
    Logger.log(`getTargetSheet_ error opening spreadsheet: ${e.message}`);
    throw new Error(`Failed to open spreadsheet: ${e.message}`);
  }
}

/**
 * Gets the target spreadsheet for operations.
 * In add-on mode: returns the active spreadsheet
 * In web app mode: opens the spreadsheet by SPREADSHEET_ID
 *
 * @returns {GoogleAppsScript.Spreadsheet.Spreadsheet} The target spreadsheet
 * @throws {Error} If no spreadsheet can be accessed
 */
function getTargetSpreadsheet_() {
  // Try add-on mode first
  try {
    const active = SpreadsheetApp.getActive();
    if (active) {
      return active;
    }
  } catch (e) {
    // Not in add-on context
  }

  // Web app mode
  if (!SPREADSHEET_ID || SPREADSHEET_ID === 'YOUR_SPREADSHEET_ID_HERE') {
    throw new Error('SPREADSHEET_ID not configured. Please set it in spreadsheet.gs');
  }

  return SpreadsheetApp.openById(SPREADSHEET_ID);
}

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
        const score = calculateMatchScore(header, synonyms);
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
function calculateMatchScore(header, synonyms) {
  if (!header || !synonyms || !Array.isArray(synonyms)) {
    return 0;
  }

  const normalizedHeader = normalizeHeader(header);
  let maxScore = 0;

  synonyms.forEach(synonym => {
    const normalizedSynonym = normalizeHeader(synonym);
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
function normalizeHeader(header) {
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

/**
 * Formats a raw phone number from the sheet into E.164 format required by Twilio.
 * E.164 format: +[country code][number] (e.g., +16475551234)
 *
 * Handles common formats:
 * - 10 digits (6475551234) → +16475551234 (assumes North America)
 * - 11 digits starting with 1 (16475551234) → +16475551234
 * - International with + prefix (+919876543210) → +919876543210
 * - Already formatted with spaces/dashes (+1 (647) 555-1234) → +16475551234
 *
 * @param {string|number} phone - The phone number to format (raw from sheet).
 * @returns {string|null} Formatted E.164 phone number string or null if invalid.
 */
function formatPhoneNumber(phone) {
  if (!phone) return null;

  const originalPhone = String(phone).trim();

  // For international numbers with + prefix, preserve the full number
  if (originalPhone.startsWith('+')) {
    // Remove all non-digit characters except the leading +
    const intlCleaned = '+' + originalPhone.substring(1).replace(/\D/g, '');
    // E.164 allows 1-15 digits after country code (typically 10-15 total including country code)
    if (intlCleaned.length >= 8 && intlCleaned.length <= 16) {
      return intlCleaned;
    }
    Logger.log(`❌ Invalid international phone number format: "${phone}" (cleaned: "${intlCleaned}")`);
    return null;
  }

  // Remove all non-digit characters for domestic processing
  const cleaned = originalPhone.replace(/\D/g, '');

  // Format based on cleaned number length
  if (cleaned.length === 11 && cleaned.startsWith('1')) {
    // 11 digits starting with 1 (e.g., 16475551234) - North American with country code
    return `+${cleaned}`;
  }

  if (cleaned.length === 10) {
    // 10 digits (e.g., 6475551234) - assume North America
    return `+1${cleaned}`;
  }

  // If we reach here, the format is unrecognized
  Logger.log(`❌ Invalid phone number format: "${phone}" (cleaned: "${cleaned}", length: ${cleaned.length})`);
  return null;
}

/**
 * Formats a balance/amount value into a consistent "$XXX.XX" currency format.
 *
 * @param {string|number} balance - The balance value (raw from sheet).
 * @returns {string} Formatted string in format "$XXX.XX".
 */
function formatBalance(balance) {
  if (!balance && balance !== 0) return "$0.00";
  
  // Remove all non-numeric characters except the decimal point
  let cleaned = String(balance).replace(/[^\d.]/g, '');
  let num = parseFloat(cleaned);
  
  // Validate that we have a valid number
  if (isNaN(num)) {
    Logger.log(`⚠️ Warning: Invalid balance format "${balance}", using $0.00`);
    return "$0.00";
  }
  
  // Return formatted with 2 decimal places
  return `$${num.toFixed(2)}`;
}

/**
 * Extracts a clean month name (e.g., "October") from a sheet value.
 * This fulfills the user request to only show the month name in the SMS.
 *
 * @param {Date|string|number} monthValue - The value from the "Due Date" column.
 * @returns {string} Month name as a string (e.g., "October") or "Unknown" if invalid.
 */
function getMonthFromValue(monthValue) {
  if (!monthValue) return "Unknown";
  
  // If it's already a Date object, extract the month name
  if (monthValue instanceof Date) {
    return monthValue.toLocaleString('default', { month: 'long', timeZone: 'UTC' }); // Use UTC to avoid timezone shifts
  }
  
  // If it's a date string (e.g., "2025-10-31" or "10/31/2025"), try to parse it
  if (typeof monthValue === 'string' && (monthValue.includes('-') || monthValue.includes('/'))) {
    try {
      const date = new Date(monthValue);
      // Check if the date is valid (Date("October") is invalid, Date("10/31/2025") is valid)
      if (!isNaN(date.getTime())) {
         return date.toLocaleString('default', { month: 'long', timeZone: 'UTC' });
      }
    } catch (e) {
      Logger.log(`⚠️ Failed to parse date string "${monthValue}": ${e.message}`);
      // Fall through to return as plain text
    }
  }
  
  // Otherwise, assume it's already a plain text month (e.g., "October")
  return String(monthValue);
}

/**
 * Prompts the user to select a message type (First Notice, Follow-up, Final Notice).
 * Returns the selected template type ID or null if cancelled.
 *
 * @returns {string|null} Template type ID ("firstNotice", "followUp", "finalNotice") or null
 */
function promptForMessageType() {
  const templateTypes = getBillTemplateTypes();
  const options = templateTypes.map((t, i) => `${i + 1}. ${t.name}`).join("\n");

  const result = getUi_().prompt(
    "Select Message Type",
    `Which message would you like to send?\n\n${options}\n\nEnter the number (1-${templateTypes.length}):`,
    getUi_().ButtonSet.OK_CANCEL
  );

  if (result.getSelectedButton() !== getUi_().Button.OK) {
    return null;
  }

  const choice = parseInt(result.getResponseText().trim(), 10);
  if (isNaN(choice) || choice < 1 || choice > templateTypes.length) {
    getUi_().alert(`Invalid selection. Please enter a number between 1 and ${templateTypes.length}`);
    return null;
  }

  return templateTypes[choice - 1].id;
}

/**
 * Validates that all required columns exist in the sheet.
 *
 * @param {Object} columns - Column name to index mapping from getHeaderColumnMap()
 * @param {Object} cols - Column name settings from settings.columns
 * @returns {string[]} Array of missing header names (empty if all present)
 */
function validateRequiredColumns(columns, cols) {
  // Input validation
  if (!columns || typeof columns !== "object") {
    Logger.log("validateRequiredColumns: Invalid columns mapping");
    return ["Invalid column mapping provided"];
  }
  if (!cols || typeof cols !== "object") {
    Logger.log("validateRequiredColumns: Invalid cols settings");
    return ["Invalid column settings provided"];
  }

  const requiredHeaders = [
    cols.phoneNumber, cols.customerName, cols.balance,
    cols.numTiffins, cols.dueDate, cols.messageStatus, cols.paymentStatus
  ];
  return requiredHeaders.filter(h => h && columns[h] === undefined);
}

/**
 * Applies batch status updates to the spreadsheet.
 * IMPORTANT: This function writes to data rows only, skipping the header row.
 *
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet - The active sheet
 * @param {Array} statusUpdates - Array of {row, status, color} objects (row is 1-based sheet row)
 * @param {number} statusCol - 0-based column index for status
 * @param {number} totalRows - Total number of rows including header
 * @returns {Object} Result with success boolean and optional error message
 */
function applyStatusUpdates(sheet, statusUpdates, statusCol, totalRows) {
  // Input validation
  if (!sheet) {
    const error = "applyStatusUpdates: Invalid sheet object";
    Logger.log(error);
    return { success: false, error: error };
  }
  if (!Array.isArray(statusUpdates) || statusUpdates.length === 0) {
    return { success: true, error: null }; // Nothing to update is not an error
  }
  if (typeof statusCol !== "number" || statusCol < 0) {
    const error = "applyStatusUpdates: Invalid statusCol";
    Logger.log(error);
    return { success: false, error: error };
  }
  if (typeof totalRows !== "number" || totalRows <= 0) {
    const error = "applyStatusUpdates: Invalid totalRows";
    Logger.log(error);
    return { success: false, error: error };
  }

  const settings = getSettings();
  const headerRowIndex = settings.behavior.headerRowIndex;
  const dataRowCount = totalRows - headerRowIndex;

  if (dataRowCount <= 0) {
    return { success: true, error: null }; // No data rows to update
  }

  try {
    // Arrays are indexed from 0, but represent data rows starting after the header
    const statusValues = Array(dataRowCount).fill(null).map(() => [null]);
    const statusColors = Array(dataRowCount).fill(null).map(() => [null]);

    statusUpdates.forEach(update => {
      // Convert 1-based sheet row to 0-based array index (relative to data start)
      const arrayIndex = update.row - headerRowIndex - 1;
      if (arrayIndex >= 0 && arrayIndex < dataRowCount) {
        statusValues[arrayIndex][0] = update.status;
        statusColors[arrayIndex][0] = update.color;
      }
    });

    // Start writing from the first data row (after header)
    const startRow = headerRowIndex + 1;
    const range = sheet.getRange(startRow, statusCol + 1, dataRowCount, 1);
    range.setValues(statusValues);
    range.setBackgrounds(statusColors);

    return { success: true, error: null };
  } catch (e) {
    const error = `applyStatusUpdates: Failed to write updates - ${e.message}`;
    Logger.log(error);
    return { success: false, error: error };
  }
}

// ========================================
// ADD-ON UI WRAPPERS
// Thin wrappers that show UI prompts/alerts and delegate to billing-core.gs.
// PARITY: Each wrapper here should have a corresponding web handler in api.gs.
// See the parity table in CLAUDE.md.
// ========================================

/**
 * Prompts the user to choose between Test Mode (dry run) and real sending.
 * Returns true for dry run, false for real send, or null if cancelled.
 *
 * @returns {boolean|null} true = dry run, false = real send, null = cancelled
 * @private
 */
function promptForDryRunMode_() {
  const response = getUi_().alert(
    "Send Mode",
    "Would you like to send in Test Mode?\n\n\u2022 YES = Test Mode (no real SMS sent)\n\u2022 NO = Send for real",
    getUi_().ButtonSet.YES_NO_CANCEL
  );
  if (response === getUi_().Button.CANCEL) return null;
  return response === getUi_().Button.YES;
}

/**
 * Sends billing SMS messages to ALL customers with "Unpaid" status.
 * This function will send reminders even if a message was "Sent" before,
 * as long as the payment status is still "Unpaid".
 */
function sendBillsToUnpaid() {
  if (!checkCredentials()) return;

  const templateType = promptForMessageType();
  if (!templateType) return;

  const dryRunMode = promptForDryRunMode_();
  if (dryRunMode === null) return;

  const result = sendBillsCore_({ filter: 'unpaid', templateType: templateType, dryRunMode: dryRunMode });

  if (!result.success) {
    getUi_().alert(`Error: ${result.error}`);
    return;
  }

  const d = result.data;
  showSendSummary(d.sentCount, d.errorCount, d.skippedCount, d.errorDetails, "", d.dryRunMode);
}

/**
 * Processes rows and sends bills, collecting results.
 *
 * @param {Array} rowsToProcess - Array of {data, row} objects
 * @param {Object} columns - Column name to index mapping
 * @param {Object} cols - Column name settings
 * @param {Object} settings - Current settings
 * @param {string} templateType - Template type to use
 * @param {boolean} [dryRunMode] - If defined, overrides settings.behavior.dryRunMode for this batch.
 * @returns {Object} Results with sentCount, errorCount, errorDetails, statusUpdates
 */
function processRowsForSending(rowsToProcess, columns, cols, settings, templateType, dryRunMode) {
  // Input validation
  if (!Array.isArray(rowsToProcess)) {
    Logger.log("processRowsForSending: Invalid rowsToProcess array");
    return { sentCount: 0, errorCount: 0, errorDetails: [], statusUpdates: [] };
  }
  if (!columns || typeof columns !== "object") {
    Logger.log("processRowsForSending: Invalid columns mapping");
    return { sentCount: 0, errorCount: rowsToProcess.length, errorDetails: [{ name: "System", error: "Invalid column mapping" }], statusUpdates: [] };
  }
  if (!cols || typeof cols !== "object") {
    Logger.log("processRowsForSending: Invalid cols settings");
    return { sentCount: 0, errorCount: rowsToProcess.length, errorDetails: [{ name: "System", error: "Invalid column settings" }], statusUpdates: [] };
  }
  if (!settings || typeof settings !== "object") {
    Logger.log("processRowsForSending: Invalid settings, using defaults");
    settings = getSettings();
  }
  if (!templateType || typeof templateType !== "string") {
    Logger.log("processRowsForSending: Invalid templateType, using firstNotice");
    templateType = "firstNotice";
  }

  let sentCount = 0;
  let errorCount = 0;
  const errorDetails = [];
  const statusUpdates = [];

  const phoneCol = columns[cols.phoneNumber];
  const nameCol = columns[cols.customerName];
  const balanceCol = columns[cols.balance];
  const tiffinsCol = columns[cols.numTiffins];
  const dueDateCol = columns[cols.dueDate];

  for (const { data: rowData, row } of rowsToProcess) {
    if (!rowData[phoneCol] || !rowData[nameCol] || !rowData[balanceCol] || !rowData[tiffinsCol]) {
      errorCount++;
      errorDetails.push({ name: rowData[nameCol] || `Row ${row}`, error: "Missing required data" });
      statusUpdates.push({ row, status: "Error: Missing data", color: settings.colors.error });
      continue;
    }

    const result = sendBill_(rowData[phoneCol], rowData[nameCol], rowData[balanceCol], rowData[tiffinsCol], rowData[dueDateCol], templateType, dryRunMode, settings);
    statusUpdates.push({ row, status: result.status, color: result.color });

    if (result.success) {
      sentCount++;
    } else {
      errorCount++;
      errorDetails.push({ name: rowData[nameCol], error: result.status });
    }

    Utilities.sleep(settings.behavior.messageDelayMs);
  }

  return { sentCount, errorCount, errorDetails, statusUpdates };
}

/**
 * Sends billing SMS messages to unpaid customers filtered by a specific due date.
 * Prompts user to enter a date or month to filter by (e.g., "October" or "2025-10-31").
 */
function sendUnpaidByDueDate() {
  const dateResult = getUi_().prompt("Enter the due date or month to filter for (e.g., October or 2025-10-31):");
  if (dateResult.getSelectedButton() !== getUi_().Button.OK || !dateResult.getResponseText()) {
    return;
  }
  const targetDate = dateResult.getResponseText().trim();

  const templateType = promptForMessageType();
  if (!templateType) return;

  if (!checkCredentials()) return;

  const dryRunMode = promptForDryRunMode_();
  if (dryRunMode === null) return;

  const result = sendBillsCore_({ filter: 'byDate', dueDate: targetDate, templateType: templateType, dryRunMode: dryRunMode });

  if (!result.success) {
    getUi_().alert(`Error: ${result.error}`);
    return;
  }

  const d = result.data;
  const settings = getSettings();
  const templateName = getBillTemplate(templateType, settings).name;
  showSendSummary(d.sentCount, d.errorCount, d.skippedCount, d.errorDetails, `(${templateName}) for "${targetDate}"`, d.dryRunMode);
}

/**
 * Finds a single customer by their Order ID and sends them a bill.
 * Useful for resending a single bill or testing a specific row.
 */
function sendBillByOrderID() {
  const promptResult = getUi_().prompt("Enter the exact Order ID to send the bill for:");
  if (promptResult.getSelectedButton() !== getUi_().Button.OK || !promptResult.getResponseText()) {
    return;
  }
  const targetOrderID = promptResult.getResponseText().trim();

  // Look up customer for preview
  const lookup = lookupCustomerByOrderId_(targetOrderID);
  if (!lookup.success) {
    getUi_().alert(`Error: ${lookup.error}`);
    return;
  }

  const customer = lookup.data;
  if (!customer.phone || !customer.name || !customer.balance || !customer.tiffins) {
    getUi_().alert(`Found Order ID ${targetOrderID} at row ${customer.rowIndex}, but it is missing required data (Phone, Name, Balance, or Tiffins).`);
    return;
  }

  const templateType = promptForMessageType();
  if (!templateType) return;

  if (!checkCredentials()) return;

  const dryRunMode = promptForDryRunMode_();
  if (dryRunMode === null) return;

  // Show preview and confirm
  const settings = getSettings();
  const templateName = getBillTemplate(templateType, settings).name;
  const dryRunNote = dryRunMode ? "\n\n[TEST MODE - No actual SMS will be sent]" : "";
  const confirmResult = getUi_().alert(
    "Confirm Send by Order ID",
    `Found Order ID ${targetOrderID}:\n\nName: ${customer.name}\nPhone: ${customer.phone}\nBalance: ${formatBalance(customer.balance)}\nMessage Type: ${templateName}\n\nContinue?${dryRunNote}`,
    getUi_().ButtonSet.YES_NO
  );

  if (confirmResult !== getUi_().Button.YES) {
    getUi_().alert("Operation cancelled.");
    return;
  }

  // Send via core
  const sendResult = sendSingleBillCore_({ orderId: targetOrderID, templateType: templateType, dryRunMode: dryRunMode });

  // Notify user
  const dryRunPrefix = dryRunMode ? "[TEST MODE] " : "";
  if (sendResult.success) {
    getUi_().alert(`${templateName} ${dryRunPrefix}sent successfully to ${customer.name} for Order ${targetOrderID}!`);
  } else {
    getUi_().alert(`${templateName} failed to send: ${sendResult.error}`);
  }
}


/**
 * Sends a test message to the *first* unpaid customer found in the spreadsheet.
 * Shows a preview before sending to confirm the data looks correct.
 */
function testSingleMessage() {
  if (!checkCredentials()) return;

  const templateType = promptForMessageType();
  if (!templateType) return;

  const settings = getSettings();
  const cols = settings.columns;
  const testOrderId = settings.behavior.testOrderId;

  // If testOrderId is configured, use it to find the test customer
  if (testOrderId) {
    const lookup = lookupCustomerByOrderId_(testOrderId);
    if (lookup.success) {
      const customer = lookup.data;
      if (!customer.phone || !customer.name || !customer.balance || !customer.tiffins) {
        getUi_().alert(`Test customer (Order ID: ${testOrderId}) is missing required data (Phone, Name, Balance, or Tiffins).`);
        return;
      }

      const templateName = getBillTemplate(templateType, settings).name;
      const confirmResult = getUi_().alert(
        "Test Message Preview",
        `About to send a test "${templateName}" to configured test customer (Order ID: ${testOrderId}):\n\nName: ${customer.name}\nPhone: ${customer.phone}\nBalance: ${formatBalance(customer.balance)}\n\n[TEST MODE - No actual SMS will be sent]\n\nContinue?`,
        getUi_().ButtonSet.YES_NO
      );

      if (confirmResult !== getUi_().Button.YES) {
        getUi_().alert("Test cancelled.");
        return;
      }

      const sendResult = sendSingleBillCore_({ orderId: testOrderId, templateType: templateType, dryRunMode: true });

      if (sendResult.success) {
        getUi_().alert(`Test "${templateName}" [TEST MODE] sent successfully to ${customer.name}!`);
      } else {
        getUi_().alert(`Test "${templateName}" failed: ${sendResult.error}`);
      }
      return;
    }
    // Lookup failed — fall through to first-unpaid logic
    Logger.log(`testSingleMessage: Test Order ID "${testOrderId}" not found, falling back to first unpaid.`);
  }

  // Fallback: find the first unpaid customer
  const sheet = getTargetSheet_();
  const columns = getHeaderColumnMap();
  const data = sheet.getDataRange().getValues();

  const paymentCol = columns[cols.paymentStatus];
  const statusCol = columns[cols.messageStatus];
  if (paymentCol === undefined || statusCol === undefined) {
    getUi_().alert(`Error: Missing required columns: "${cols.paymentStatus}" or "${cols.messageStatus}".`);
    return;
  }
  if (data.length <= settings.behavior.headerRowIndex) {
    getUi_().alert("No customer data found.");
    return;
  }

  let testRow = -1;
  for (let i = settings.behavior.headerRowIndex; i < data.length; i++) {
    if (String(data[i][paymentCol]).toLowerCase() === "unpaid") {
      testRow = i;
      break;
    }
  }

  if (testRow === -1) {
    getUi_().alert("No UNPAID customers found to test.");
    return;
  }

  const rowData = data[testRow];
  const currentRow = testRow + 1;
  const phone = rowData[columns[cols.phoneNumber]];
  const name = rowData[columns[cols.customerName]];
  const balance = rowData[columns[cols.balance]];
  const tiffins = rowData[columns[cols.numTiffins]];
  const dueDate = rowData[columns[cols.dueDate]];

  if (!phone || !name || !balance || !tiffins) {
    getUi_().alert(`The first unpaid row (row ${currentRow}) is missing required data (Phone, Name, Balance, or Tiffins).`);
    return;
  }

  const templateName = getBillTemplate(templateType, settings).name;
  const confirmResult = getUi_().alert(
    "Test Message Preview",
    `About to send a test "${templateName}" to the first UNPAID customer (row ${currentRow}):\n\nName: ${name}\nPhone: ${phone}\nBalance: ${formatBalance(balance)}\n\n[TEST MODE - No actual SMS will be sent]\n\nContinue?`,
    getUi_().ButtonSet.YES_NO
  );

  if (confirmResult !== getUi_().Button.YES) {
    getUi_().alert("Test cancelled.");
    return;
  }

  // Always dry run for test messages
  const sendResult = sendBill_(phone, name, balance, tiffins, dueDate, templateType, true, settings);
  const statusRange = sheet.getRange(currentRow, statusCol + 1);
  statusRange.setValue(sendResult.status);
  statusRange.setBackground(sendResult.color);

  if (sendResult.success) {
    getUi_().alert(`Test "${templateName}" [TEST MODE] sent successfully to ${name}!`);
  } else {
    getUi_().alert(`Test "${templateName}" failed. Check the Message Status column on row ${currentRow} for details.`);
  }
}

/**
 * Clears all message status entries in the spreadsheet.
 * Asks for confirmation before clearing.
 */
function clearAllStatuses() {
  const response = getUi_().alert(
    "Clear Message Statuses",
    "This will clear all message status entries in the 'Message Status' column. Are you sure?",
    getUi_().ButtonSet.YES_NO
  );

  if (response !== getUi_().Button.YES) return;

  const result = clearAllStatusesCore_();

  if (!result.success) {
    getUi_().alert(`Error: ${result.error}`);
    return;
  }

  getUi_().alert("All message statuses cleared!");
}
