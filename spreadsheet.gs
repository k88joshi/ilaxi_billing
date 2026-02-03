/**
 * Reads the header row and creates a mapping of column names to their 0-based column index.
 * Uses dynamic header row index from settings.
 * This makes the script resilient to column reordering.
 * Also detects and logs warnings for duplicate header names.
 *
 * @returns {Object<string, number>} An object where keys are header names
 * and values are their 0-based indices.
 * e.g., {"Customer Name": 1, "Phone Number": 0}
 */
function getHeaderColumnMap() {
  const sheet = SpreadsheetApp.getActiveSheet();
  const settings = getSettings();
  const headerRowIndex = settings.behavior.headerRowIndex;
  const headers = sheet.getRange(headerRowIndex, 1, 1, sheet.getLastColumn()).getValues()[0];
  const map = {};
  const seen = {};

  headers.forEach((header, index) => {
    if (header) {
      const trimmed = header.trim();

      // Check for duplicate headers, which can cause confusion
      if (seen[trimmed]) {
        Logger.log(`⚠️ Warning: Duplicate header "${trimmed}" found at columns ${seen[trimmed]} and ${index + 1}`);
        ui.alert(`Warning: Duplicate header "${trimmed}" found. Using the last occurrence (column ${index + 1}).`);
      }

      map[trimmed] = index; // 0-based index
      seen[trimmed] = index + 1; // 1-based column for logging
    }
  });

  return map;
}

/**
 * Formats a raw phone number from the sheet into E.164 format required by Twilio.
 * E.164 format: +[country code][number] (e.g., +16475551234)
 *
 * Handles common North American formats:
 * - 10 digits (6475551234) → +16475551234
 * - 11 digits starting with 1 (16475551234) → +16475551234
 * - Already formatted with spaces/dashes (+1 (647) 555-1234) → +16475551234
 *
 * @param {string|number} phone - The phone number to format (raw from sheet).
 * @returns {string|null} Formatted E.164 phone number string or null if invalid.
 */
function formatPhoneNumber(phone) {
  if (!phone) return null;
  
  // Remove all non-digit characters (spaces, dashes, parens, etc.)
  let cleaned = String(phone).replace(/\D/g, '');
  
  // Remove common extensions (anything beyond 11 digits)
  if (cleaned.length > 11) {
    cleaned = cleaned.substring(0, 11);
  }
  
  // Format based on cleaned number length
  if (cleaned.length === 11 && cleaned.startsWith('1')) {
    // 11 digits starting with 1 (e.g., 16475551234)
    return `+${cleaned}`;
  }
  
  if (cleaned.length === 10) {
    // 10 digits (e.g., 6475551234) - assume North America
    return `+1${cleaned}`;
  }
  
  // For international numbers, require + prefix in original input
  if (String(phone).trim().startsWith('+')) {
    const intlCleaned = String(phone).replace(/[\s-()]/g, ''); // Keep '+' but remove spaces/dashes
    // Validate length (international numbers are typically 10-15 digits)
    if (intlCleaned.length >= 10 && intlCleaned.length <= 15) {
      return intlCleaned;
    }
  }
  
  // If we reach here, the format is unrecognized
  Logger.log(`❌ Invalid phone number format: "${phone}" (cleaned: "${cleaned}")`);
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
      // Failed to parse, will fall through to default
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
  const settings = getSettings();
  const templateTypes = getBillTemplateTypes(settings);

  // Build the prompt options
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
    ui.alert("Invalid selection. Please enter a number between 1 and " + templateTypes.length);
    return null;
  }

  return templateTypes[choice - 1].id;
}

/**
 * Sends billing SMS messages to ALL customers with "Unpaid" status.
 * This function will send reminders even if a message was "Sent" before,
 * as long as the payment status is still "Unpaid".
 */
function sendBillsToUnpaid() {
  // 1. Validate credentials
  if (!checkCredentials()) {
    return;
  }

  // 1.5. Prompt for message type
  const templateType = promptForMessageType();
  if (!templateType) return;

  // 2. Get settings and dynamic column mapping
  const settings = getSettings();
  const cols = settings.columns;
  const sheet = SpreadsheetApp.getActiveSheet();
  const columns = getHeaderColumnMap();
  const data = sheet.getDataRange().getValues();

  // 3. Validate columns and data
  const requiredHeaders = [cols.phoneNumber, cols.customerName, cols.balance, cols.numTiffins, cols.dueDate, cols.messageStatus, cols.paymentStatus];
  const missingHeaders = requiredHeaders.filter(h => columns[h] === undefined);

  if (missingHeaders.length > 0) {
    ui.alert(`Error: The following required columns are missing: ${missingHeaders.join(", ")}.`);
    return;
  }
  if (data.length <= settings.behavior.headerRowIndex) {
    ui.alert("No customer data found.");
    return;
  }

  // 4. Prepare data for processing
  const paymentCol = columns[cols.paymentStatus];
  const statusCol = columns[cols.messageStatus];
  const rowsToProcess = [];
  for (let i = settings.behavior.headerRowIndex; i < data.length; i++) {
    const rowData = data[i];
    if (rowData[paymentCol] && rowData[paymentCol].toString().toLowerCase() === "unpaid") {
      rowsToProcess.push({ data: rowData, row: i + 1 });
    }
  }

  // 5. Process rows and collect results
  let sentCount = 0, errorCount = 0;
  const errorDetails = [];
  const statusUpdates = []; // Array to hold {row, status, color}

  const phoneCol = columns[cols.phoneNumber];
  const nameCol = columns[cols.customerName];
  const balanceCol = columns[cols.balance];
  const tiffinsCol = columns[cols.numTiffins];
  const dueDateCol = columns[cols.dueDate];

  for (const item of rowsToProcess) {
    const { data: rowData, row } = item;

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

  // 6. Batch update the spreadsheet
  if (statusUpdates.length > 0) {
    const statusValues = data.map(() => [null]); // Create array of arrays
    const statusColors = data.map(() => [null]);
    statusUpdates.forEach(update => {
      statusValues[update.row - 1][0] = update.status;
      statusColors[update.row - 1][0] = update.color;
    });

    // Update only the status column to avoid overwriting other data
    sheet.getRange(1, statusCol + 1, data.length, 1).setValues(statusValues);
    sheet.getRange(1, statusCol + 1, data.length, 1).setBackgrounds(statusColors);
  }

  // 7. Display summary report
  const skippedCount = data.length - settings.behavior.headerRowIndex - rowsToProcess.length;
  showSendSummary(sentCount, errorCount, skippedCount, errorDetails);
}

/**
 * Sends billing SMS messages to unpaid customers filtered by a specific due date.
 * Prompts user to enter a date or month to filter by (e.g., "October" or "2025-10-31").
 */
function sendUnpaidByDueDate() {
  // 1. Prompt for date filter
  const result = ui.prompt("Enter the due date or month to filter for (e.g., October or 2025-10-31):");
  if (result.getSelectedButton() != ui.Button.OK || !result.getResponseText()) {
    return; // User cancelled or entered nothing
  }
  const targetDate = result.getResponseText().trim().toLowerCase();

  // 1.5. Prompt for message type
  const templateType = promptForMessageType();
  if (!templateType) return;

  // 2. Validate credentials and get settings
  if (!checkCredentials()) return;
  const settings = getSettings();
  const cols = settings.columns;
  const sheet = SpreadsheetApp.getActiveSheet();
  const columns = getHeaderColumnMap();
  const data = sheet.getDataRange().getValues();

  // 3. Validate columns and data
  const requiredHeaders = [cols.phoneNumber, cols.customerName, cols.balance, cols.numTiffins, cols.dueDate, cols.messageStatus, cols.paymentStatus];
  const missingHeaders = requiredHeaders.filter(h => columns[h] === undefined);

  if (missingHeaders.length > 0) {
    ui.alert(`Error: The following required columns are missing: ${missingHeaders.join(", ")}.`);
    return;
  }
  if (data.length <= settings.behavior.headerRowIndex) {
    ui.alert("No customer data found.");
    return;
  }

  // 4. Prepare data for processing
  const paymentCol = columns[cols.paymentStatus];
  const dueDateCol = columns[cols.dueDate];
  const statusCol = columns[cols.messageStatus];
  const rowsToProcess = [];
  for (let i = settings.behavior.headerRowIndex; i < data.length; i++) {
    const rowData = data[i];
    const paymentStatus = rowData[paymentCol] ? rowData[paymentCol].toString().toLowerCase() : "";
    const dueDate = rowData[dueDateCol];
    const dueDateStr = dueDate ? String(dueDate).toLowerCase() : "";
    const monthFromDate = getMonthFromValue(dueDate).toLowerCase();

    if (paymentStatus === "unpaid" && (dueDateStr.includes(targetDate) || monthFromDate.includes(targetDate))) {
      rowsToProcess.push({ data: rowData, row: i + 1 });
    }
  }

  // 5. Process rows and collect results
  let sentCount = 0, errorCount = 0;
  const errorDetails = [];
  const statusUpdates = [];

  const phoneCol = columns[cols.phoneNumber];
  const nameCol = columns[cols.customerName];
  const balanceCol = columns[cols.balance];
  const tiffinsCol = columns[cols.numTiffins];

  for (const item of rowsToProcess) {
    const { data: rowData, row } = item;

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

  // 6. Batch update the spreadsheet
  if (statusUpdates.length > 0) {
    const statusValues = data.map(() => [null]);
    const statusColors = data.map(() => [null]);
    statusUpdates.forEach(update => {
      statusValues[update.row - 1][0] = update.status;
      statusColors[update.row - 1][0] = update.color;
    });

    sheet.getRange(1, statusCol + 1, data.length, 1).setValues(statusValues);
    sheet.getRange(1, statusCol + 1, data.length, 1).setBackgrounds(statusColors);
  }

  // 7. Display summary report
  const templateName = getBillTemplate(templateType, settings).name;
  const skippedCount = data.length - settings.behavior.headerRowIndex - rowsToProcess.length;
  showSendSummary(sentCount, errorCount, skippedCount, errorDetails, `(${templateName}) for "${targetDate}"`);
}

/**
 * Finds a single customer by their Order ID and sends them a bill.
 * Useful for resending a single bill or testing a specific row.
 */
function sendBillByOrderID() {
  // 1. Prompt for Order ID
  const result = ui.prompt("Enter the exact Order ID to send the bill for:");
  if (result.getSelectedButton() != ui.Button.OK || !result.getResponseText()) {
    return; // User cancelled or entered nothing
  }
  const targetOrderID = result.getResponseText().trim();

  // 1.5. Prompt for message type
  const templateType = promptForMessageType();
  if (!templateType) return;

  // 2. Validate credentials and get settings
  if (!checkCredentials()) return;
  const settings = getSettings();
  const cols = settings.columns;
  const sheet = SpreadsheetApp.getActiveSheet();
  const columns = getHeaderColumnMap();
  const data = sheet.getDataRange().getValues();

  // 3. Find the row with the matching Order ID
  const orderIdCol = columns[cols.orderId];
  if (orderIdCol === undefined) {
    ui.alert(`Error: The column "${cols.orderId}" was not found.`);
    return;
  }

  let foundRow = -1;
  for (let i = settings.behavior.headerRowIndex; i < data.length; i++) {
    if (data[i][orderIdCol] && String(data[i][orderIdCol]).trim() === targetOrderID) {
      foundRow = i;
      break;
    }
  }

  // 4. Handle if not found
  if (foundRow === -1) {
    ui.alert(`Error: Could not find any row with Order ID "${targetOrderID}".`);
    return;
  }

  // 5. Extract data and validate
  const rowData = data[foundRow];
  const currentRow = foundRow + 1;
  const phoneCol = columns[cols.phoneNumber];
  const nameCol = columns[cols.customerName];
  const balanceCol = columns[cols.balance];
  const tiffinsCol = columns[cols.numTiffins];
  const dueDateCol = columns[cols.dueDate];
  const statusCol = columns[cols.messageStatus];

  const phone = rowData[phoneCol];
  const name = rowData[nameCol];
  const balance = rowData[balanceCol];
  const tiffins = rowData[tiffinsCol];
  const dueDate = rowData[dueDateCol];

  if (!phone || !name || !balance || !tiffins) {
    ui.alert(`Found Order ID ${targetOrderID} at row ${currentRow}, but it is missing required data (Phone, Name, Balance, or Tiffins).`);
    return;
  }

  // 6. Show preview and confirm with user
  const templateName = getBillTemplate(templateType, settings).name;
  const dryRunNote = settings.behavior.dryRunMode ? '\n\n⚠️ [DRY RUN MODE - No actual SMS will be sent]' : '';
  const preview = ui.alert(
    "Confirm Send by Order ID",
    `Found Order ID ${targetOrderID}:\n\nName: ${name}\nPhone: ${phone}\nBalance: ${formatBalance(balance)}\nMessage Type: ${templateName}\n\nContinue?${dryRunNote}`,
    ui.ButtonSet.YES_NO
  );

  if (preview != ui.Button.YES) {
    ui.alert("Operation cancelled.");
    return;
  }

  // 7. Send the bill and update the sheet
  const sendResult = sendBill_(phone, name, balance, tiffins, dueDate, templateType);
  const statusRange = sheet.getRange(currentRow, statusCol + 1);
  statusRange.setValue(sendResult.status);
  statusRange.setBackground(sendResult.color);

  // 8. Notify user of the outcome
  if (sendResult.success) {
    const dryRunPrefix = settings.behavior.dryRunMode ? '[DRY RUN] ' : '';
    ui.alert(`✓ ${templateName} ${dryRunPrefix}sent successfully to ${name} for Order ${targetOrderID}!`);
  } else {
    ui.alert(`✗ ${templateName} failed to send. Check the Message Status column for details on row ${currentRow}.`);
  }
}


/**
 * Sends a test message to the *first* unpaid customer found in the spreadsheet.
 * Shows a preview before sending to confirm the data looks correct.
 */
function testSingleMessage() {
  // 1. Validate credentials and get settings
  if (!checkCredentials()) return;

  // 1.5. Prompt for message type
  const templateType = promptForMessageType();
  if (!templateType) return;
  const settings = getSettings();
  const cols = settings.columns;
  const sheet = SpreadsheetApp.getActiveSheet();
  const columns = getHeaderColumnMap();
  const data = sheet.getDataRange().getValues();

  // 2. Validate columns and data
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

  // 3. Find the first unpaid customer
  let testRow = -1;
  for (let i = settings.behavior.headerRowIndex; i < data.length; i++) {
    if (data[i][paymentCol] && data[i][paymentCol].toString().toLowerCase() === "unpaid") {
      testRow = i;
      break;
    }
  }

  if (testRow === -1) {
    ui.alert("No UNPAID customers found to test.");
    return;
  }

  // 4. Extract data and validate
  const rowData = data[testRow];
  const currentRow = testRow + 1;
  const phoneCol = columns[cols.phoneNumber];
  const nameCol = columns[cols.customerName];
  const balanceCol = columns[cols.balance];
  const tiffinsCol = columns[cols.numTiffins];
  const dueDateCol = columns[cols.dueDate];

  const phone = rowData[phoneCol];
  const name = rowData[nameCol];
  const balance = rowData[balanceCol];
  const tiffins = rowData[tiffinsCol];
  const dueDate = rowData[dueDateCol];

  if (!phone || !name || !balance || !tiffins) {
    ui.alert(`The first unpaid row (row ${currentRow}) is missing required data (Phone, Name, Balance, or Tiffins).`);
    return;
  }

  // 5. Show preview and confirm with user
  const templateName = getBillTemplate(templateType, settings).name;
  const dryRunNote = settings.behavior.dryRunMode ? '\n\n⚠️ [DRY RUN MODE - No actual SMS will be sent]' : '';
  const preview = ui.alert(
    "Test Message Preview",
    `About to send a test "${templateName}" to the first UNPAID customer (row ${currentRow}):\n\nName: ${name}\nPhone: ${phone}\nBalance: ${formatBalance(balance)}\n\nContinue?${dryRunNote}`,
    ui.ButtonSet.YES_NO
  );

  if (preview != ui.Button.YES) {
    ui.alert("Test cancelled.");
    return;
  }

  // 6. Send the bill and update the sheet
  const sendResult = sendBill_(phone, name, balance, tiffins, dueDate, templateType);
  const statusRange = sheet.getRange(currentRow, statusCol + 1);
  statusRange.setValue(sendResult.status);
  statusRange.setBackground(sendResult.color);

  // 7. Notify user of the outcome
  if (sendResult.success) {
    const dryRunPrefix = settings.behavior.dryRunMode ? '[DRY RUN] ' : '';
    ui.alert(`✓ Test "${templateName}" ${dryRunPrefix}sent successfully to ${name}!`);
  } else {
    ui.alert(`✗ Test "${templateName}" failed. Check the Message Status column on row ${currentRow} for details.`);
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

  if (response == ui.Button.YES) {
    const settings = getSettings();
    const cols = settings.columns;
    const sheet = SpreadsheetApp.getActiveSheet();
    const columns = getHeaderColumnMap();
    const statusColIndex = columns[cols.messageStatus];

    // Validate that the status column exists
    if (statusColIndex === undefined) {
      ui.alert(`Error: Could not find the '${cols.messageStatus}' column header. Please ensure it exists in row ${settings.behavior.headerRowIndex}.`);
      return;
    }

    const data = sheet.getDataRange().getValues();
    const statusCol = statusColIndex + 1; // 1-based

    // Batch clear: collect all cells that need clearing and update at once
    const clearValues = [];
    const clearBackgrounds = [];
    for (let i = settings.behavior.headerRowIndex; i < data.length; i++) {
      clearValues.push([""]);
      clearBackgrounds.push([null]);
    }

    if (clearValues.length > 0) {
      const startRow = settings.behavior.headerRowIndex + 1;
      sheet.getRange(startRow, statusCol, clearValues.length, 1).setValues(clearValues);
      sheet.getRange(startRow, statusCol, clearValues.length, 1).setBackgrounds(clearBackgrounds);
    }

    ui.alert("All message statuses cleared!");
  }
}
