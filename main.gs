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
 * Installable edit trigger handler for auto thank-you messages.
 * Must be installed via installEditTrigger() — simple onEdit() cannot call UrlFetchApp.
 *
 * @param {Object} e The event object passed by Google Sheets, containing info about the edit.
 * @property {GoogleAppsScript.Spreadsheet.Range} e.range - The cell range that was edited.
 * @property {string} e.value - The new value of the cell (only for single cell edits).
 * @property {string} e.oldValue - The value of the cell before the edit (single cell only).
 */
function onEditInstallable(e) {
  try {
    // Validate event object
    if (!e || !e.range) {
      Logger.log("onEdit called without valid event object");
      return;
    }

    const range = e.range;
    const sheet = range.getSheet();

    // Optimization: Quick check if the edit is potentially relevant.
    // If e.value is present (single cell), check if it's "paid".
    // If e.value is NOT present (multi-cell), we must proceed to check the range.
    if (e.value && String(e.value).toLowerCase() !== "paid") {
      return;
    }

    // Now load settings, as we likely need to process this edit.
    const settings = getSettings();
    const cols = settings.columns;

    // Check if auto thank-you is enabled
    if (!settings.behavior.autoThankYouEnabled) {
      return;
    }

    // Ignore edits in header or above
    if (range.getRow() <= settings.behavior.headerRowIndex) return;

    // Get column indices
    const columns = getHeaderColumnMap();
    const paymentColIndex = columns[cols.paymentStatus]; // 0-based
    const paymentCol = paymentColIndex + 1; // 1-based

    // Check if the edited range includes the Payment column
    // range.getColumn() is start column, range.getLastColumn() is end column
    if (range.getColumn() > paymentCol || range.getLastColumn() < paymentCol) {
      return;
    }

    // Identify the intersection of the edited range and the Payment column
    // This handles both single cell and multi-cell pastes
    const startRow = range.getRow();
    const numRows = range.getNumRows();

    // Get values for the payment column within the edited rows
    // getRange(row, col, numRows, numCols)
    const paymentValues = sheet.getRange(startRow, paymentCol, numRows, 1).getValues();

    // Prepare to read other required data only if needed
    const nameColIndex = columns[cols.customerName];
    const phoneColIndex = columns[cols.phoneNumber];
    const orderIdColIndex = columns[cols.orderId];
    const statusColIndex = columns[cols.messageStatus];

    // We'll fetch the full data for these rows to get Name, Phone, OrderID
    // Optimization: Only fetch if we find at least one "Paid"
    let hasPaid = false;
    for (let i = 0; i < paymentValues.length; i++) {
      if (String(paymentValues[i][0]).toLowerCase() === "paid") {
        hasPaid = true;
        break;
      }
    }

    if (!hasPaid) return;

    // Fetch full data for the affected rows
    // We grab from column 1 to the last column
    const fullData = sheet.getRange(startRow, 1, numRows, sheet.getLastColumn()).getValues();

    // Collect status updates for batch write (per CLAUDE.md: never setValue inside loops)
    const statusUpdates = [];

    for (let i = 0; i < fullData.length; i++) {
      const currentRow = startRow + i;
      const rowData = fullData[i];
      const paymentValue = String(rowData[paymentColIndex]).toLowerCase();

      // Check if this specific row is "Paid"
      // Note: We don't strictly check oldValue here for multi-cell edits as it's not available per-cell in 'e'
      // This means pasting "Paid" over "Paid" might re-trigger, which is acceptable or can be guarded against by checking Message Status
      if (paymentValue === "paid") {
        Logger.log(`Payment status detected as "Paid" for row ${currentRow}. Processing "Thank You" message.`);

        const customerName = rowData[nameColIndex];
        const customerPhone = rowData[phoneColIndex];
        const orderId = rowData[orderIdColIndex];

        if (!customerName || !customerPhone || !orderId) {
          Logger.log(`Skipping auto-thanks for row ${currentRow}: missing Name, Phone, or Order ID.`);
          statusUpdates.push({
            row: currentRow,
            status: "Payment 'Paid', but auto-thanks failed: Missing data",
            color: settings.colors.error
          });
          continue;
        }

        // Check if we already sent a thank you recently to avoid loops?
        // For now, we assume the user intends to send if they type Paid.

        const result = sendThankYouMessage_(customerPhone, customerName, orderId, settings);
        statusUpdates.push({
          row: currentRow,
          status: result.status,
          color: result.color
        });

        // Sleep slightly to respect rate limits if processing many
        Utilities.sleep(500);
      }
    }

    // Batch write status updates using setValues/setBackgrounds (avoids per-cell round-trips)
    if (statusUpdates.length > 0) {
      // Read current status column for the affected row range
      const statusCol = statusColIndex + 1; // 1-based
      const currentValues = sheet.getRange(startRow, statusCol, numRows, 1).getValues();
      const currentBgs = sheet.getRange(startRow, statusCol, numRows, 1).getBackgrounds();

      // Merge updates into the arrays
      for (const update of statusUpdates) {
        const idx = update.row - startRow;
        if (idx >= 0 && idx < numRows) {
          currentValues[idx][0] = update.status;
          currentBgs[idx][0] = update.color;
        }
      }

      // Single batch write
      const range = sheet.getRange(startRow, statusCol, numRows, 1);
      range.setValues(currentValues);
      range.setBackgrounds(currentBgs);

      // Show toast notification summarizing results
      const sent = statusUpdates.filter(u => u.color === settings.colors.success).length;
      const failed = statusUpdates.length - sent;
      let toastMsg = `Thank-you sent to ${sent} customer${sent !== 1 ? "s" : ""}`;
      if (failed > 0) toastMsg += ` (${failed} failed)`;
      SpreadsheetApp.getActive().toast(toastMsg, "Auto Thank-You", 5);
    }
  } catch (error) {
    // Log error but don't show UI alert (triggers can't reliably show UI)
    Logger.log(`ERROR in onEdit trigger: ${error.message}\nStack: ${error.stack || "N/A"}`);
  }
}


// ========================================
// TRIGGER MANAGEMENT
// ========================================

/**
 * Ensures the installable onEdit trigger matches the autoThankYouEnabled setting.
 * Called automatically when settings are saved.
 */
function syncEditTrigger_(enabled) {
  const triggers = ScriptApp.getProjectTriggers();
  const existing = triggers.find(t => t.getHandlerFunction() === "onEditInstallable");

  if (enabled && !existing) {
    ScriptApp.newTrigger("onEditInstallable")
      .forSpreadsheet(SpreadsheetApp.getActive())
      .onEdit()
      .create();
    Logger.log("Installable onEdit trigger created.");
  } else if (!enabled && existing) {
    ScriptApp.deleteTrigger(existing);
    Logger.log("Installable onEdit trigger removed.");
  }
}