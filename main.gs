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
    .addItem("Open Settings", "showSettingsSidebar")
    .addSeparator()
    .addItem("Export Settings", "exportSettingsToFile")
    .addItem("Import Settings", "importSettingsFromPrompt")
    .addSeparator()
    .addItem("Reset to Defaults", "confirmResetSettings")
    .addToUi();
}


/**
 * Runs automatically when a user edits a cell.
 * This is an "installable trigger" but works as a simple trigger for this case.
 * It checks if the "Payment" column was changed to "Paid".
 * If so, it automatically triggers the sendThankYouMessage function.
 *
 * @param {Object} e The event object passed by Google Sheets, containing info about the edit.
 * @property {GoogleAppsScript.Spreadsheet.Range} e.range - The cell range that was edited.
 * @property {string} e.value - The new value of the cell.
 * @property {string} e.oldValue - The value of the cell before the edit.
 */
function onEdit(e) {
  const range = e.range;
  const sheet = range.getSheet();
  const row = range.getRow();

  // Get settings for dynamic configuration
  const settings = getSettings();
  const cols = settings.columns;

  if (row <= settings.behavior.headerRowIndex) return;

  const newValue = e.value ? String(e.value).toLowerCase() : "";
  const oldValue = e.oldValue ? String(e.oldValue).toLowerCase() : "";

  if (newValue !== "paid" || newValue === oldValue) return;

  const columns = getHeaderColumnMap();
  const paymentCol = columns[cols.paymentStatus];
  const statusCol = columns[cols.messageStatus];

  if (range.getColumn() !== (paymentCol + 1)) return;

  Logger.log(`Payment status changed to "Paid" for row ${row}. Triggering "Thank You" message.`);

  const nameCol = columns[cols.customerName];
  const phoneCol = columns[cols.phoneNumber];
  const orderIdCol = columns[cols.orderId];
  const rowData = sheet.getRange(row, 1, 1, sheet.getLastColumn()).getValues()[0];
  const customerName = rowData[nameCol];
  const customerPhone = rowData[phoneCol];
  const orderId = rowData[orderIdCol];

  const statusRange = sheet.getRange(row, statusCol + 1);

  if (!customerName || !customerPhone || !orderId) {
    Logger.log(`Skipping auto-thanks for row ${row}: missing Name, Phone, or Order ID.`);
    statusRange.setValue("Payment 'Paid', but auto-thanks failed: Missing data").setBackground(settings.colors.error);
    return;
  }

  const result = sendThankYouMessage_(customerPhone, customerName, orderId);
  statusRange.setValue(result.status).setBackground(result.color);
}