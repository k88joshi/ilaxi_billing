// ========================================
// ILAXI'S GUJARATI TIFFIN - BILLING SYSTEM
// ========================================

// ========================================
// SCRIPT ENTRY POINTS (onOpen, onEdit)
// ========================================

/**
 * Creates the custom menus in the Google Sheet UI when the spreadsheet is opened.
 * This function is a "simple trigger" and runs automatically.
 * It builds the 'Credentials' and 'Send Bills' menus.
 * @see https://developers.google.com/apps-script/guides/triggers
 */
function onOpen() {
  const ui = SpreadsheetApp.getUi();
  ui.createMenu("Credentials")
    .addItem("Set Twilio Account SID", "setAccountSid")
    .addItem("Set Twilio Auth Token", "setAuthToken")
    .addItem("Set Twilio Phone Number", "setPhoneNumber")
    .addSeparator()
    .addItem("Delete Account SID", "deleteAccountSid")
    .addItem("Delete Auth Token", "deleteAuthToken")
    .addItem("Delete Phone Number", "deletePhoneNumber")
    .addToUi();
  
  ui.createMenu("Send Bills")
    .addItem("Send to All UNPAID Customers", "sendBillsToUnpaid")
    .addItem("Send to UNPAID (Specific Due Date)", "sendUnpaidByDueDate")
    .addSeparator()
    .addItem("Send Bill to Specific Order ID", "sendBillByOrderID")
    .addSeparator()
    .addItem("Test with First Unpaid Row", "testSingleMessage")
    .addItem("Clear All Message Statuses", "clearAllStatuses")
    .addToUi();

  ui.createMenu("Settings")
    .addItem("Open Settings", "showSettingsDialog")
    .addSeparator()
    .addItem("Export Settings", "exportSettingsToFile")
    .addItem("Import Settings", "importSettingsFromPrompt")
    .addSeparator()
    .addItem("Reset to Defaults", "confirmResetSettings")
    .addToUi();
}


/**
 * Validates the edit event and checks preconditions for auto thank-you.
 * Returns context needed for further processing, or null to abort.
 *
 * @param {Object} e - The event object from Google Sheets
 * @returns {?{range: GoogleAppsScript.Spreadsheet.Range, sheet: GoogleAppsScript.Spreadsheet.Sheet, settings: Object}} Context or null
 * @private
 */
function validateEditContext_(e) {
  if (!e || !e.range) {
    Logger.log("onEdit called without valid event object");
    return null;
  }

  // Quick check: single-cell edit that isn't "paid" can be skipped immediately
  if (e.value && String(e.value).toLowerCase() !== "paid") {
    return null;
  }

  const settings = getSettings();
  if (!settings.behavior.autoThankYouEnabled) {
    return null;
  }

  const range = e.range;
  if (range.getRow() <= settings.behavior.headerRowIndex) {
    return null;
  }

  return { range, sheet: range.getSheet(), settings };
}

/**
 * Validates that all required columns for thank-you messages exist in the header map.
 * Returns an object with the column indices, or null if any are missing.
 *
 * @param {Object} columns - Column name to 0-based index map from getHeaderColumnMap()
 * @param {Object} cols - Column name settings from settings.columns
 * @returns {?{payment: number, name: number, phone: number, orderId: number, status: number}} Column indices or null
 * @private
 */
function validateThankYouColumns_(columns, cols) {
  const payment = columns[cols.paymentStatus];
  const name = columns[cols.customerName];
  const phone = columns[cols.phoneNumber];
  const orderId = columns[cols.orderId];
  const status = columns[cols.messageStatus];

  if (payment === undefined) {
    Logger.log(`Auto thank-you: Payment column "${cols.paymentStatus}" not found in sheet headers. Check Settings > Spreadsheet > Column Mappings.`);
    return null;
  }

  const missingCols = [];
  if (name === undefined) missingCols.push(`"${cols.customerName}"`);
  if (phone === undefined) missingCols.push(`"${cols.phoneNumber}"`);
  if (orderId === undefined) missingCols.push(`"${cols.orderId}"`);
  if (status === undefined) missingCols.push(`"${cols.messageStatus}"`);
  if (missingCols.length > 0) {
    Logger.log(`Auto thank-you: Required columns not found in sheet headers: ${missingCols.join(", ")}. Check Settings > Spreadsheet > Column Mappings.`);
    return null;
  }

  return { payment, name, phone, orderId, status };
}

/**
 * Processes rows that have been marked as "Paid", sending thank-you messages.
 * Returns an array of status updates for batch writing.
 *
 * @param {Array[]} fullData - Row data for the affected range
 * @param {{payment: number, name: number, phone: number, orderId: number, status: number}} colIndices - Column indices
 * @param {Object} settings - Current settings
 * @param {number} startRow - 1-based start row in the sheet
 * @returns {Array<{row: number, status: string, color: string}>} Status updates
 * @private
 */
function processPaidRows_(fullData, colIndices, settings, startRow) {
  const statusUpdates = [];

  for (let i = 0; i < fullData.length; i++) {
    const currentRow = startRow + i;
    const rowData = fullData[i];
    const paymentValue = String(rowData[colIndices.payment]).toLowerCase();

    if (paymentValue !== "paid") continue;

    // Duplicate-send guard
    const existingStatus = String(rowData[colIndices.status] || "").toLowerCase();
    if (existingStatus.includes("thank you sent")) {
      Logger.log(`Skipping auto-thanks for row ${currentRow}: already sent (status: "${rowData[colIndices.status]}")`);
      continue;
    }

    Logger.log(`Payment status detected as "Paid" for row ${currentRow}. Processing "Thank You" message.`);

    const customerName = rowData[colIndices.name];
    const customerPhone = rowData[colIndices.phone];
    const orderId = rowData[colIndices.orderId];

    if (!customerName || !customerPhone || !orderId) {
      Logger.log(`Skipping auto-thanks for row ${currentRow}: missing Name, Phone, or Order ID.`);
      statusUpdates.push({
        row: currentRow,
        status: "Payment 'Paid', but auto-thanks failed: Missing data",
        color: settings.colors.error
      });
      continue;
    }

    const result = sendThankYouMessage_(customerPhone, customerName, orderId, settings);
    statusUpdates.push({ row: currentRow, status: result.status, color: result.color });

    Utilities.sleep(500);
  }

  return statusUpdates;
}

/**
 * Installable edit trigger handler for auto thank-you messages.
 * Must be installed via installEditTrigger() — simple onEdit() cannot call UrlFetchApp.
 *
 * @param {Object} e The event object passed by Google Sheets, containing info about the edit.
 */
function onEditInstallable(e) {
  try {
    const ctx = validateEditContext_(e);
    if (!ctx) return;

    const { range, sheet, settings } = ctx;
    const cols = settings.columns;
    const columns = getHeaderColumnMap();

    const colIndices = validateThankYouColumns_(columns, cols);
    if (!colIndices) return;

    const paymentCol = colIndices.payment + 1; // 1-based
    if (range.getColumn() > paymentCol || range.getLastColumn() < paymentCol) {
      return;
    }

    const startRow = range.getRow();
    const numRows = range.getNumRows();

    // Quick scan for "Paid" before fetching full data
    const paymentValues = sheet.getRange(startRow, paymentCol, numRows, 1).getValues();
    let hasPaid = false;
    for (let i = 0; i < paymentValues.length; i++) {
      if (String(paymentValues[i][0]).toLowerCase() === "paid") {
        hasPaid = true;
        break;
      }
    }
    if (!hasPaid) return;

    const fullData = sheet.getRange(startRow, 1, numRows, sheet.getLastColumn()).getValues();
    const statusUpdates = processPaidRows_(fullData, colIndices, settings, startRow);

    // Batch write status updates
    if (statusUpdates.length > 0) {
      const statusCol = colIndices.status + 1; // 1-based
      const currentValues = sheet.getRange(startRow, statusCol, numRows, 1).getValues();
      const currentBgs = sheet.getRange(startRow, statusCol, numRows, 1).getBackgrounds();

      for (const update of statusUpdates) {
        const idx = update.row - startRow;
        if (idx >= 0 && idx < numRows) {
          currentValues[idx][0] = update.status;
          currentBgs[idx][0] = update.color;
        }
      }

      const statusRange = sheet.getRange(startRow, statusCol, numRows, 1);
      statusRange.setValues(currentValues);
      statusRange.setBackgrounds(currentBgs);

      const sent = statusUpdates.filter(u => u.color === settings.colors.success).length;
      const failed = statusUpdates.length - sent;
      let toastMsg = `Thank-you sent to ${sent} customer${sent !== 1 ? "s" : ""}`;
      if (failed > 0) toastMsg += ` (${failed} failed)`;
      SpreadsheetApp.getActive().toast(toastMsg, "Auto Thank-You", 5);
    }
  } catch (error) {
    Logger.log(`ERROR in onEdit trigger: ${error.message}\nStack: ${error.stack || "N/A"}`);
  }
}


// ========================================
// TRIGGER MANAGEMENT
// ========================================

/**
 * Ensures the installable onEdit trigger matches the autoThankYouEnabled setting.
 * Called automatically when settings are saved.
 *
 * NOTE: This requires ScriptApp permissions which are only available from the
 * add-on context or Script Editor — NOT from the web app sandbox.
 * If this fails in web app mode, use installAutoThankYouTrigger() from the Script Editor.
 */
function syncEditTrigger_(enabled) {
  const triggers = ScriptApp.getProjectTriggers();
  const existing = triggers.find(t => t.getHandlerFunction() === "onEditInstallable");

  if (enabled && !existing) {
    const spreadsheet = getTargetSpreadsheet_();
    ScriptApp.newTrigger("onEditInstallable")
      .forSpreadsheet(spreadsheet)
      .onEdit()
      .create();
    Logger.log("Installable onEdit trigger created.");
  } else if (!enabled && existing) {
    ScriptApp.deleteTrigger(existing);
    Logger.log("Installable onEdit trigger removed.");
  }
}

/**
 * Manually installs the auto thank-you onEdit trigger.
 * Run this from the Apps Script editor if the web app cannot create triggers.
 *
 * Steps: Open Apps Script editor → Select this function → Click Run
 */
function installAutoThankYouTrigger() {
  const triggers = ScriptApp.getProjectTriggers();
  const existing = triggers.find(t => t.getHandlerFunction() === "onEditInstallable");

  if (existing) {
    Logger.log("Auto thank-you trigger already exists. No action needed.");
    return;
  }

  const spreadsheet = getTargetSpreadsheet_();
  ScriptApp.newTrigger("onEditInstallable")
    .forSpreadsheet(spreadsheet)
    .onEdit()
    .create();
  Logger.log("Auto thank-you trigger installed successfully.");
}