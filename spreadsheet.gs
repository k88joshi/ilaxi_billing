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
    const sheet = SpreadsheetApp.getActiveSheet();
    if (!sheet) {
      throw new Error("No active sheet found");
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

  const result = ui.prompt(
    "Select Message Type",
    `Which message would you like to send?\n\n${options}\n\nEnter the number (1-${templateTypes.length}):`,
    ui.ButtonSet.OK_CANCEL
  );

  if (result.getSelectedButton() !== ui.Button.OK) {
    return null;
  }

  const choice = parseInt(result.getResponseText().trim(), 10);
  if (isNaN(choice) || choice < 1 || choice > templateTypes.length) {
    ui.alert(`Invalid selection. Please enter a number between 1 and ${templateTypes.length}`);
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

/**
 * Sends billing SMS messages to ALL customers with "Unpaid" status.
 * This function will send reminders even if a message was "Sent" before,
 * as long as the payment status is still "Unpaid".
 */
function sendBillsToUnpaid() {
  if (!checkCredentials()) return;

  const templateType = promptForMessageType();
  if (!templateType) return;

  const settings = getSettings();
  const cols = settings.columns;
  const sheet = SpreadsheetApp.getActiveSheet();
  const columns = getHeaderColumnMap();
  const data = sheet.getDataRange().getValues();

  const missingHeaders = validateRequiredColumns(columns, cols);
  if (missingHeaders.length > 0) {
    ui.alert(`Error: The following required columns are missing: ${missingHeaders.join(", ")}.`);
    return;
  }
  if (data.length <= settings.behavior.headerRowIndex) {
    ui.alert("No customer data found.");
    return;
  }

  // Filter for unpaid rows
  const paymentCol = columns[cols.paymentStatus];
  const rowsToProcess = [];
  for (let i = settings.behavior.headerRowIndex; i < data.length; i++) {
    const rowData = data[i];
    if (String(rowData[paymentCol]).toLowerCase() === "unpaid") {
      rowsToProcess.push({ data: rowData, row: i + 1 });
    }
  }

  // Process rows
  const { sentCount, errorCount, errorDetails, statusUpdates } = processRowsForSending(
    rowsToProcess, columns, cols, settings, templateType
  );

  // Update spreadsheet
  applyStatusUpdates(sheet, statusUpdates, columns[cols.messageStatus], data.length);

  // Display summary
  const skippedCount = data.length - settings.behavior.headerRowIndex - rowsToProcess.length;
  showSendSummary(sentCount, errorCount, skippedCount, errorDetails);
}

/**
 * Processes rows and sends bills, collecting results.
 *
 * @param {Array} rowsToProcess - Array of {data, row} objects
 * @param {Object} columns - Column name to index mapping
 * @param {Object} cols - Column name settings
 * @param {Object} settings - Current settings
 * @param {string} templateType - Template type to use
 * @returns {Object} Results with sentCount, errorCount, errorDetails, statusUpdates
 */
function processRowsForSending(rowsToProcess, columns, cols, settings, templateType) {
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

    const result = sendBill_(rowData[phoneCol], rowData[nameCol], rowData[balanceCol], rowData[tiffinsCol], rowData[dueDateCol], templateType);
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
  const dateResult = ui.prompt("Enter the due date or month to filter for (e.g., October or 2025-10-31):");
  if (dateResult.getSelectedButton() !== ui.Button.OK || !dateResult.getResponseText()) {
    return;
  }
  const targetDate = dateResult.getResponseText().trim().toLowerCase();

  const templateType = promptForMessageType();
  if (!templateType) return;

  if (!checkCredentials()) return;

  const settings = getSettings();
  const cols = settings.columns;
  const sheet = SpreadsheetApp.getActiveSheet();
  const columns = getHeaderColumnMap();
  const data = sheet.getDataRange().getValues();

  const missingHeaders = validateRequiredColumns(columns, cols);
  if (missingHeaders.length > 0) {
    ui.alert(`Error: The following required columns are missing: ${missingHeaders.join(", ")}.`);
    return;
  }
  if (data.length <= settings.behavior.headerRowIndex) {
    ui.alert("No customer data found.");
    return;
  }

  // Filter for unpaid rows matching the target date
  const paymentCol = columns[cols.paymentStatus];
  const dueDateCol = columns[cols.dueDate];
  const rowsToProcess = [];

  for (let i = settings.behavior.headerRowIndex; i < data.length; i++) {
    const rowData = data[i];
    const paymentStatus = String(rowData[paymentCol]).toLowerCase();
    const dueDate = rowData[dueDateCol];
    const dueDateStr = String(dueDate).toLowerCase();
    const monthFromDate = getMonthFromValue(dueDate).toLowerCase();

    if (paymentStatus === "unpaid" && (dueDateStr.includes(targetDate) || monthFromDate.includes(targetDate))) {
      rowsToProcess.push({ data: rowData, row: i + 1 });
    }
  }

  // Process rows
  const { sentCount, errorCount, errorDetails, statusUpdates } = processRowsForSending(
    rowsToProcess, columns, cols, settings, templateType
  );

  // Update spreadsheet
  applyStatusUpdates(sheet, statusUpdates, columns[cols.messageStatus], data.length);

  // Display summary
  const templateName = getBillTemplate(templateType, settings).name;
  const skippedCount = data.length - settings.behavior.headerRowIndex - rowsToProcess.length;
  showSendSummary(sentCount, errorCount, skippedCount, errorDetails, `(${templateName}) for "${targetDate}"`);
}

/**
 * Finds a single customer by their Order ID and sends them a bill.
 * Useful for resending a single bill or testing a specific row.
 */
function sendBillByOrderID() {
  const result = ui.prompt("Enter the exact Order ID to send the bill for:");
  if (result.getSelectedButton() !== ui.Button.OK || !result.getResponseText()) {
    return;
  }
  const targetOrderID = result.getResponseText().trim();

  const templateType = promptForMessageType();
  if (!templateType) return;

  if (!checkCredentials()) return;

  const settings = getSettings();
  const cols = settings.columns;
  const sheet = SpreadsheetApp.getActiveSheet();
  const columns = getHeaderColumnMap();
  const data = sheet.getDataRange().getValues();

  const orderIdCol = columns[cols.orderId];
  if (orderIdCol === undefined) {
    ui.alert(`Error: The column "${cols.orderId}" was not found.`);
    return;
  }

  // Find the row with the matching Order ID
  let foundRow = -1;
  for (let i = settings.behavior.headerRowIndex; i < data.length; i++) {
    if (String(data[i][orderIdCol]).trim() === targetOrderID) {
      foundRow = i;
      break;
    }
  }

  if (foundRow === -1) {
    ui.alert(`Error: Could not find any row with Order ID "${targetOrderID}".`);
    return;
  }

  // Extract and validate data
  const rowData = data[foundRow];
  const currentRow = foundRow + 1;
  const phone = rowData[columns[cols.phoneNumber]];
  const name = rowData[columns[cols.customerName]];
  const balance = rowData[columns[cols.balance]];
  const tiffins = rowData[columns[cols.numTiffins]];
  const dueDate = rowData[columns[cols.dueDate]];
  const statusCol = columns[cols.messageStatus];

  if (!phone || !name || !balance || !tiffins) {
    ui.alert(`Found Order ID ${targetOrderID} at row ${currentRow}, but it is missing required data (Phone, Name, Balance, or Tiffins).`);
    return;
  }

  // Show preview and confirm
  const templateName = getBillTemplate(templateType, settings).name;
  const dryRunNote = settings.behavior.dryRunMode ? "\n\n[DRY RUN MODE - No actual SMS will be sent]" : "";
  const confirmResult = ui.alert(
    "Confirm Send by Order ID",
    `Found Order ID ${targetOrderID}:\n\nName: ${name}\nPhone: ${phone}\nBalance: ${formatBalance(balance)}\nMessage Type: ${templateName}\n\nContinue?${dryRunNote}`,
    ui.ButtonSet.YES_NO
  );

  if (confirmResult !== ui.Button.YES) {
    ui.alert("Operation cancelled.");
    return;
  }

  // Send the bill and update the sheet
  const sendResult = sendBill_(phone, name, balance, tiffins, dueDate, templateType);
  const statusRange = sheet.getRange(currentRow, statusCol + 1);
  statusRange.setValue(sendResult.status);
  statusRange.setBackground(sendResult.color);

  // Notify user
  const dryRunPrefix = settings.behavior.dryRunMode ? "[DRY RUN] " : "";
  if (sendResult.success) {
    ui.alert(`${templateName} ${dryRunPrefix}sent successfully to ${name} for Order ${targetOrderID}!`);
  } else {
    ui.alert(`${templateName} failed to send. Check the Message Status column for details on row ${currentRow}.`);
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
  const sheet = SpreadsheetApp.getActiveSheet();
  const columns = getHeaderColumnMap();
  const data = sheet.getDataRange().getValues();

  const paymentCol = columns[cols.paymentStatus];
  const statusCol = columns[cols.messageStatus];
  if (paymentCol === undefined || statusCol === undefined) {
    ui.alert(`Error: Missing required columns: "${cols.paymentStatus}" or "${cols.messageStatus}".`);
    return;
  }
  if (data.length <= settings.behavior.headerRowIndex) {
    ui.alert("No customer data found.");
    return;
  }

  // Find the first unpaid customer
  let testRow = -1;
  for (let i = settings.behavior.headerRowIndex; i < data.length; i++) {
    if (String(data[i][paymentCol]).toLowerCase() === "unpaid") {
      testRow = i;
      break;
    }
  }

  if (testRow === -1) {
    ui.alert("No UNPAID customers found to test.");
    return;
  }

  // Extract and validate data
  const rowData = data[testRow];
  const currentRow = testRow + 1;
  const phone = rowData[columns[cols.phoneNumber]];
  const name = rowData[columns[cols.customerName]];
  const balance = rowData[columns[cols.balance]];
  const tiffins = rowData[columns[cols.numTiffins]];
  const dueDate = rowData[columns[cols.dueDate]];

  if (!phone || !name || !balance || !tiffins) {
    ui.alert(`The first unpaid row (row ${currentRow}) is missing required data (Phone, Name, Balance, or Tiffins).`);
    return;
  }

  // Show preview and confirm
  const templateName = getBillTemplate(templateType, settings).name;
  const dryRunNote = settings.behavior.dryRunMode ? "\n\n[DRY RUN MODE - No actual SMS will be sent]" : "";
  const confirmResult = ui.alert(
    "Test Message Preview",
    `About to send a test "${templateName}" to the first UNPAID customer (row ${currentRow}):\n\nName: ${name}\nPhone: ${phone}\nBalance: ${formatBalance(balance)}\n\nContinue?${dryRunNote}`,
    ui.ButtonSet.YES_NO
  );

  if (confirmResult !== ui.Button.YES) {
    ui.alert("Test cancelled.");
    return;
  }

  // Send the bill and update the sheet
  const sendResult = sendBill_(phone, name, balance, tiffins, dueDate, templateType);
  const statusRange = sheet.getRange(currentRow, statusCol + 1);
  statusRange.setValue(sendResult.status);
  statusRange.setBackground(sendResult.color);

  // Notify user
  const dryRunPrefix = settings.behavior.dryRunMode ? "[DRY RUN] " : "";
  if (sendResult.success) {
    ui.alert(`Test "${templateName}" ${dryRunPrefix}sent successfully to ${name}!`);
  } else {
    ui.alert(`Test "${templateName}" failed. Check the Message Status column on row ${currentRow} for details.`);
  }
}

/**
 * Clears all message status entries in the spreadsheet.
 * Asks for confirmation before clearing.
 */
function clearAllStatuses() {
  const response = ui.alert(
    "Clear Message Statuses",
    "This will clear all message status entries in the 'Message Status' column. Are you sure?",
    ui.ButtonSet.YES_NO
  );

  if (response !== ui.Button.YES) return;

  const settings = getSettings();
  const cols = settings.columns;
  const sheet = SpreadsheetApp.getActiveSheet();
  const columns = getHeaderColumnMap();
  const statusColIndex = columns[cols.messageStatus];

  if (statusColIndex === undefined) {
    ui.alert(`Error: Could not find the '${cols.messageStatus}' column header. Please ensure it exists in row ${settings.behavior.headerRowIndex}.`);
    return;
  }

  const data = sheet.getDataRange().getValues();
  const rowCount = data.length - settings.behavior.headerRowIndex;

  if (rowCount > 0) {
    const startRow = settings.behavior.headerRowIndex + 1;
    const statusCol = statusColIndex + 1;
    const clearValues = Array(rowCount).fill([""]);
    const clearBackgrounds = Array(rowCount).fill([null]);

    const range = sheet.getRange(startRow, statusCol, rowCount, 1);
    range.setValues(clearValues);
    range.setBackgrounds(clearBackgrounds);
  }

  ui.alert("All message statuses cleared!");
}
