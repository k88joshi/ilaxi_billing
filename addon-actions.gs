// ========================================
// ADD-ON MENU ACTION WRAPPERS
// UI-facing functions for the Google Sheets add-on.
// Each wraps a billing-core.gs function with
// add-on-specific UI (prompts, alerts, confirmation).
// ========================================

/**
 * Sends billing SMS messages to ALL customers with "Unpaid" status.
 * This function will send reminders even if a message was "Sent" before,
 * as long as the payment status is still "Unpaid".
 */
function sendBillsToUnpaid() {
  if (!checkCredentials()) return;

  // Check for duplicates before sending
  const dupCheck = getCustomersCore_();
  if (dupCheck.success && dupCheck.duplicateSummary && dupCheck.duplicateSummary.exactCount > 0) {
    const ds = dupCheck.duplicateSummary;
    const proceed = getUi_().alert(
      'Duplicate Rows Detected',
      ds.exactCount + ' exact duplicate row(s) found (same phone + due date).\n' +
      'Multiple messages will be sent to the same number.\n\nContinue anyway?',
      getUi_().ButtonSet.YES_NO
    );
    if (proceed !== getUi_().Button.YES) return;
  }

  const templateType = promptForMessageType_();
  if (!templateType) return;

  const dryRunMode = promptForDryRunMode_();
  if (dryRunMode === null) return;

  const result = sendBillsCore_({ filter: 'unpaid', templateType: templateType, dryRunMode: dryRunMode });

  if (!result.success) {
    getUi_().alert(`Error: ${result.error}`);
    return;
  }

  const d = result.data;
  const dupInfo = dupCheck.success ? dupCheck.duplicateSummary : null;
  showSendSummary(d.sentCount, d.errorCount, d.skippedCount, d.errorDetails, "", d.dryRunMode, dupInfo);
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

  // Check for duplicates before sending
  const dupCheck = getCustomersCore_();
  if (dupCheck.success && dupCheck.duplicateSummary && dupCheck.duplicateSummary.exactCount > 0) {
    const ds = dupCheck.duplicateSummary;
    const proceed = getUi_().alert(
      'Duplicate Rows Detected',
      ds.exactCount + ' exact duplicate row(s) found (same phone + due date).\n' +
      'Multiple messages will be sent to the same number.\n\nContinue anyway?',
      getUi_().ButtonSet.YES_NO
    );
    if (proceed !== getUi_().Button.YES) return;
  }

  const templateType = promptForMessageType_();
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
  const dupInfo = dupCheck.success ? dupCheck.duplicateSummary : null;
  showSendSummary(d.sentCount, d.errorCount, d.skippedCount, d.errorDetails, `(${templateName}) for "${targetDate}"`, d.dryRunMode, dupInfo);
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

  const templateType = promptForMessageType_();
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
    `Found Order ID ${targetOrderID}:\n\nName: ${customer.name}\nPhone: ${customer.phone}\nBalance: ${formatBalance_(customer.balance)}\nMessage Type: ${templateName}\n\nContinue?${dryRunNote}`,
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

  const templateType = promptForMessageType_();
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
        `About to send a test "${templateName}" to configured test customer (Order ID: ${testOrderId}):\n\nName: ${customer.name}\nPhone: ${customer.phone}\nBalance: ${formatBalance_(customer.balance)}\n\n[TEST MODE - No actual SMS will be sent]\n\nContinue?`,
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
    `About to send a test "${templateName}" to the first UNPAID customer (row ${currentRow}):\n\nName: ${name}\nPhone: ${phone}\nBalance: ${formatBalance_(balance)}\n\n[TEST MODE - No actual SMS will be sent]\n\nContinue?`,
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
