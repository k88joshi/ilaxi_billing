/**
 * Reads the header row (defined by HEADER_ROW_INDEX) and creates a mapping
 * of column names (e.g., "Customer Name") to their 0-based column index (e.g., 1).
 * This makes the script resilient to column reordering.
 * Also detects and logs warnings for duplicate header names.
 *
 * @returns {Object<string, number>} An object where keys are header names
 * and values are their 0-based indices.
 * e.g., {"Customer Name": 1, "Phone Number": 0}
 */
function getHeaderColumnMap() {
  const sheet = SpreadsheetApp.getActiveSheet();
  const headers = sheet.getRange(HEADER_ROW_INDEX, 1, 1, sheet.getLastColumn()).getValues()[0];
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
 * Sends billing SMS messages to ALL customers with "Unpaid" status.
 * This function will send reminders even if a message was "Sent" before,
 * as long as the payment status is still "Unpaid".
 */
function sendBillsToUnpaid() {
  // 1. Validate credentials
  if (!checkCredentials()) {
    return;
  }

  // 2. Get dynamic column mapping and data
  const sheet = SpreadsheetApp.getActiveSheet();
  const columns = getHeaderColumnMap();
  const data = sheet.getDataRange().getValues();

  // 3. Validate columns and data
  const requiredHeaders = [PHONE_NUMBER_HEADER, CUSTOMER_NAME_HEADER, BALANCE_HEADER, NUM_TIFFINS_HEADER, DUE_DATE_HEADER, MESSAGE_STATUS_HEADER, PAYMENT_STATUS_HEADER];
  const missingHeaders = requiredHeaders.filter(h => columns[h] === undefined);

  if (missingHeaders.length > 0) {
    ui.alert(`Error: The following required columns are missing: ${missingHeaders.join(", ")}.`);
    return;
  }
  if (data.length <= HEADER_ROW_INDEX) {
    ui.alert("No customer data found.");
    return;
  }

  // 4. Prepare data for processing
  const { [PAYMENT_STATUS_HEADER]: paymentCol, [MESSAGE_STATUS_HEADER]: statusCol } = columns;
  const rowsToProcess = [];
  for (let i = HEADER_ROW_INDEX; i < data.length; i++) {
    const rowData = data[i];
    if (rowData[paymentCol] && rowData[paymentCol].toString().toLowerCase() === "unpaid") {
      rowsToProcess.push({ data: rowData, row: i + 1 });
    }
  }

  // 5. Process rows and collect results
  let sentCount = 0, errorCount = 0;
  const errorDetails = [];
  const statusUpdates = []; // Array to hold {row, status, color}

  for (const item of rowsToProcess) {
    const { data: rowData, row } = item;
    const { [PHONE_NUMBER_HEADER]: phone, [CUSTOMER_NAME_HEADER]: name, [BALANCE_HEADER]: balance, [NUM_TIFFINS_HEADER]: tiffins, [DUE_DATE_HEADER]: dueDate } = columns;

    if (!rowData[phone] || !rowData[name] || !rowData[balance] || !rowData[tiffins]) {
      errorCount++;
      errorDetails.push({ name: rowData[name] || `Row ${row}`, error: "Missing required data" });
      statusUpdates.push({ row, status: "Error: Missing data", color: "#f4cccc" });
      continue;
    }

    const result = sendBill_(rowData[phone], rowData[name], rowData[balance], rowData[tiffins], rowData[dueDate]);
    statusUpdates.push({ row, status: result.status, color: result.color });

    if (result.success) {
      sentCount++;
    } else {
      errorCount++;
      errorDetails.push({ name: rowData[name], error: result.status });
    }

    Utilities.sleep(MESSAGE_DELAY_MS);
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
  const skippedCount = data.length - HEADER_ROW_INDEX - rowsToProcess.length;
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

  // 2. Validate credentials and data
  if (!checkCredentials()) return;
  const sheet = SpreadsheetApp.getActiveSheet();
  const columns = getHeaderColumnMap();
  const data = sheet.getDataRange().getValues();

  // 3. Validate columns and data
  const requiredHeaders = [PHONE_NUMBER_HEADER, CUSTOMER_NAME_HEADER, BALANCE_HEADER, NUM_TIFFINS_HEADER, DUE_DATE_HEADER, MESSAGE_STATUS_HEADER, PAYMENT_STATUS_HEADER];
  const missingHeaders = requiredHeaders.filter(h => columns[h] === undefined);

  if (missingHeaders.length > 0) {
    ui.alert(`Error: The following required columns are missing: ${missingHeaders.join(", ")}.`);
    return;
  }
  if (data.length <= HEADER_ROW_INDEX) {
    ui.alert("No customer data found.");
    return;
  }

  // 4. Prepare data for processing
  const { [PAYMENT_STATUS_HEADER]: paymentCol, [DUE_DATE_HEADER]: dueDateCol, [MESSAGE_STATUS_HEADER]: statusCol } = columns;
  const rowsToProcess = [];
  for (let i = HEADER_ROW_INDEX; i < data.length; i++) {
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

  for (const item of rowsToProcess) {
    const { data: rowData, row } = item;
    const { [PHONE_NUMBER_HEADER]: phone, [CUSTOMER_NAME_HEADER]: name, [BALANCE_HEADER]: balance, [NUM_TIFFINS_HEADER]: tiffins, [DUE_DATE_HEADER]: dueDate } = columns;

    if (!rowData[phone] || !rowData[name] || !rowData[balance] || !rowData[tiffins]) {
      errorCount++;
      errorDetails.push({ name: rowData[name] || `Row ${row}`, error: "Missing required data" });
      statusUpdates.push({ row, status: "Error: Missing data", color: "#f4cccc" });
      continue;
    }

    const result = sendBill_(rowData[phone], rowData[name], rowData[balance], rowData[tiffins], rowData[dueDate]);
    statusUpdates.push({ row, status: result.status, color: result.color });

    if (result.success) {
      sentCount++;
    } else {
      errorCount++;
      errorDetails.push({ name: rowData[name], error: result.status });
    }

    Utilities.sleep(MESSAGE_DELAY_MS);
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
  const skippedCount = data.length - HEADER_ROW_INDEX - rowsToProcess.length;
  showSendSummary(sentCount, errorCount, skippedCount, errorDetails, `for "${targetDate}"`);
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

  // 2. Validate credentials and data
  if (!checkCredentials()) return;
  const sheet = SpreadsheetApp.getActiveSheet();
  const columns = getHeaderColumnMap();
  const data = sheet.getDataRange().getValues();

  // 3. Find the row with the matching Order ID
  const { [ORDER_ID_HEADER]: orderIdCol } = columns;
  if (orderIdCol === undefined) {
    ui.alert(`Error: The column "${ORDER_ID_HEADER}" was not found.`);
    return;
  }

  let foundRow = -1;
  for (let i = HEADER_ROW_INDEX; i < data.length; i++) {
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
  const { [PHONE_NUMBER_HEADER]: phoneCol, [CUSTOMER_NAME_HEADER]: nameCol, [BALANCE_HEADER]: balanceCol, [NUM_TIFFINS_HEADER]: tiffinsCol, [DUE_DATE_HEADER]: dueDateCol, [MESSAGE_STATUS_HEADER]: statusCol } = columns;

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
  const dryRunNote = DRY_RUN_MODE ? '\n\n⚠️ [DRY RUN MODE - No actual SMS will be sent]' : '';
  const preview = ui.alert(
    "Confirm Send by Order ID",
    `Found Order ID ${targetOrderID}:\n\nName: ${name}\nPhone: ${phone}\nBalance: ${formatBalance(balance)}\n\nContinue?${dryRunNote}`,
    ui.ButtonSet.YES_NO
  );

  if (preview != ui.Button.YES) {
    ui.alert("Operation cancelled.");
    return;
  }

  // 7. Send the bill and update the sheet
  const sendResult = sendBill_(phone, name, balance, tiffins, dueDate);
  const statusRange = sheet.getRange(currentRow, statusCol + 1);
  statusRange.setValue(sendResult.status);
  statusRange.setBackground(sendResult.color);

  // 8. Notify user of the outcome
  if (sendResult.success) {
    const dryRunPrefix = DRY_RUN_MODE ? '[DRY RUN] ' : '';
    ui.alert(`✓ Bill ${dryRunPrefix}sent successfully to ${name} for Order ${targetOrderID}!`);
  } else {
    ui.alert(`✗ Bill failed to send. Check the Message Status column for details on row ${currentRow}.`);
  }
}


/**
 * Sends a test message to the *first* unpaid customer found in the spreadsheet.
 * Shows a preview before sending to confirm the data looks correct.
 */
function testSingleMessage() {
  // 1. Validate credentials and data
  if (!checkCredentials()) return;
  const sheet = SpreadsheetApp.getActiveSheet();
  const columns = getHeaderColumnMap();
  const data = sheet.getDataRange().getValues();

  // 2. Validate columns and data
  const { [PAYMENT_STATUS_HEADER]: paymentCol, [MESSAGE_STATUS_HEADER]: statusCol } = columns;
  if (paymentCol === undefined || statusCol === undefined) {
    ui.alert(`Error: Missing required columns: "${PAYMENT_STATUS_HEADER}" or "${MESSAGE_STATUS_HEADER}".`);
    return;
  }
  if (data.length <= HEADER_ROW_INDEX) {
    ui.alert("No customer data found.");
    return;
  }

  // 3. Find the first unpaid customer
  let testRow = -1;
  for (let i = HEADER_ROW_INDEX; i < data.length; i++) {
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
  const { [PHONE_NUMBER_HEADER]: phoneCol, [CUSTOMER_NAME_HEADER]: nameCol, [BALANCE_HEADER]: balanceCol, [NUM_TIFFINS_HEADER]: tiffinsCol, [DUE_DATE_HEADER]: dueDateCol } = columns;

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
  const dryRunNote = DRY_RUN_MODE ? '\n\n⚠️ [DRY RUN MODE - No actual SMS will be sent]' : '';
  const preview = ui.alert(
    "Test Message Preview",
    `About to send a test bill to the first UNPAID customer (row ${currentRow}):\n\nName: ${name}\nPhone: ${phone}\nBalance: ${formatBalance(balance)}\n\nContinue?${dryRunNote}`,
    ui.ButtonSet.YES_NO
  );

  if (preview != ui.Button.YES) {
    ui.alert("Test cancelled.");
    return;
  }

  // 6. Send the bill and update the sheet
  const sendResult = sendBill_(phone, name, balance, tiffins, dueDate);
  const statusRange = sheet.getRange(currentRow, statusCol + 1);
  statusRange.setValue(sendResult.status);
  statusRange.setBackground(sendResult.color);

  // 7. Notify user of the outcome
  if (sendResult.success) {
    const dryRunPrefix = DRY_RUN_MODE ? '[DRY RUN] ' : '';
    ui.alert(`✓ Test bill ${dryRunPrefix}sent successfully to ${name}!`);
  } else {
    ui.alert(`✗ Test bill failed. Check the Message Status column on row ${currentRow} for details.`);
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
    const sheet = SpreadsheetApp.getActiveSheet();
    const columns = getHeaderColumnMap();
    const statusColIndex = columns[MESSAGE_STATUS_HEADER];

    // Validate that the status column exists
    if (statusColIndex === undefined) {
      ui.alert(`Error: Could not find the '${MESSAGE_STATUS_HEADER}' column header. Please ensure it exists in row ${HEADER_ROW_INDEX}.`);
      return;
    }

    const data = sheet.getDataRange().getValues();
    const statusCol = statusColIndex + 1; // 1-based
    
    // Clear status for all data rows (skip header)
    for (let i = HEADER_ROW_INDEX; i < data.length; i++) {
      // Check if cell is not already empty
      if (data[i][statusColIndex] !== "") {
        sheet.getRange(i + 1, statusCol).setValue("");
      }
    }
    
    ui.alert("All message statuses cleared!");
  }
}
