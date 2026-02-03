/**
 * Global variable for the Google Sheets UI.
 * @type {GoogleAppsScript.Base.Ui}
 */
const ui = SpreadsheetApp.getUi();



/**
 * Prompts user to enter their Twilio Account SID and saves it securely to User Properties.
 */
function setAccountSid() {
  const result = ui.prompt("Enter your Twilio Account SID (found at twilio.com/console):");
  if (result.getSelectedButton() == ui.Button.OK) {
    userProperties.setProperty("TWILIO_ACCOUNT_SID", result.getResponseText().trim());
    ui.alert("Account SID saved successfully!");
  }
}

/**
 * Prompts user to enter their Twilio Auth Token and saves it securely to User Properties.
 */
function setAuthToken() {
  const result = ui.prompt("Enter your Twilio Auth Token (found at twilio.com/console):");
  if (result.getSelectedButton() == ui.Button.OK) {
    userProperties.setProperty("TWILIO_AUTH_TOKEN", result.getResponseText().trim());
    ui.alert("Auth Token saved successfully!");
  }
}

/**
 * Prompts user to enter their Twilio Phone Number and saves it securely to User Properties.
 */
function setPhoneNumber() {
  const result = ui.prompt("Enter your Twilio Phone Number (format: +1XXXXXXXXXX):");
  if (result.getSelectedButton() == ui.Button.OK) {
    userProperties.setProperty("TWILIO_PHONE_NUMBER", result.getResponseText().trim());
    ui.alert("Phone Number saved successfully!");
  }
}

/**
 * Deletes the stored Twilio Account SID from User Properties.
 */
function deleteAccountSid() {
  userProperties.deleteProperty("TWILIO_ACCOUNT_SID");
  ui.alert("Account SID deleted.");
}

/**
 * Deletes the stored Twilio Auth Token from User Properties.
 */
function deleteAuthToken() {
  userProperties.deleteProperty("TWILIO_AUTH_TOKEN");
  ui.alert("Auth Token deleted.");
}

/**
 * Deletes the stored Twilio Phone Number from User Properties.
 */
function deletePhoneNumber() {
  userProperties.deleteProperty("TWILIO_PHONE_NUMBER");
  ui.alert("Phone Number deleted.");
}


// ========================================
// SETTINGS SIDEBAR FUNCTIONS
// ========================================

/**
 * Opens the settings dialog in the Google Sheets UI.
 * Uses a modal dialog for more screen space than a sidebar.
 */
function showSettingsSidebar() {
  const html = HtmlService.createHtmlOutputFromFile("settings")
    .setWidth(950)
    .setHeight(650);
  SpreadsheetApp.getUi().showModalDialog(html, "Settings");
}

/**
 * Retrieves settings and sheet headers for the sidebar UI.
 * Called from settings.html via google.script.run.
 *
 * @returns {Object} Object containing settings and headers
 */
function getSettingsForUI() {
  const settings = getSettings();
  const headers = getSheetHeaders();
  return {
    settings: settings,
    headers: headers
  };
}

/**
 * Saves settings from the sidebar UI.
 * Called from settings.html via google.script.run.
 *
 * @param {Object} settings - Settings object from the UI form
 * @returns {Object} Result with success boolean and optional error message
 */
function saveSettingsFromUI(settings) {
  return saveSettings(settings);
}

/**
 * Generates a preview of a message template with sample data.
 * Called from settings.html via google.script.run.
 *
 * @param {string} template - Template string to preview
 * @param {string} type - "bill" or "thankYou"
 * @returns {string} Processed template with sample values
 */
function previewTemplate(template, type) {
  const sampleData = getSampleDataForPreview();
  return processTemplate(template, sampleData);
}

/**
 * Retrieves all column headers from the active sheet.
 * Used to populate column mapping dropdowns in the settings UI.
 *
 * @returns {Array<string>} Array of header names
 */
function getSheetHeaders() {
  const sheet = SpreadsheetApp.getActiveSheet();
  const settings = getSettings();
  const headerRow = settings.behavior.headerRowIndex || 1;

  const lastCol = sheet.getLastColumn();
  if (lastCol === 0) return [];

  const headers = sheet.getRange(headerRow, 1, 1, lastCol).getValues()[0];
  return headers.filter(h => h && String(h).trim() !== "").map(h => String(h).trim());
}

/**
 * Exports current settings to a downloadable JSON file.
 * Shows a dialog with the JSON content that can be copied.
 */
function exportSettingsToFile() {
  const json = exportSettings();
  const html = HtmlService.createHtmlOutput(
    '<pre style="white-space: pre-wrap; word-wrap: break-word; font-size: 12px; max-height: 400px; overflow-y: auto;">' +
    json.replace(/</g, '&lt;').replace(/>/g, '&gt;') +
    '</pre>' +
    '<p style="margin-top: 16px; font-size: 13px;">Copy the above JSON and save it to a file.</p>'
  )
    .setWidth(450)
    .setHeight(350);
  SpreadsheetApp.getUi().showModalDialog(html, "Export Settings");
}

/**
 * Prompts user to paste JSON settings for import.
 */
function importSettingsFromPrompt() {
  const result = ui.prompt(
    "Import Settings",
    "Paste the JSON settings content below:",
    ui.ButtonSet.OK_CANCEL
  );

  if (result.getSelectedButton() !== ui.Button.OK) return;

  const jsonString = result.getResponseText().trim();
  if (!jsonString) {
    ui.alert("Import cancelled: No content provided.");
    return;
  }

  const importResult = importSettings(jsonString);
  if (importResult.success) {
    ui.alert("Settings imported successfully!");
  } else {
    ui.alert("Import failed: " + importResult.error);
  }
}

/**
 * Shows confirmation dialog before resetting settings to defaults.
 */
function confirmResetSettings() {
  const response = ui.alert(
    "Reset Settings",
    "This will reset ALL settings to their default values. This cannot be undone.\n\nAre you sure?",
    ui.ButtonSet.YES_NO
  );

  if (response === ui.Button.YES) {
    const result = resetToDefaults();
    if (result.success) {
      ui.alert("Settings have been reset to defaults.");
    } else {
      ui.alert("Reset failed: " + result.error);
    }
  }
}

// ========================================
// SEND SUMMARY FUNCTIONS
// ========================================

/**
 * Displays a formatted summary report in a UI alert box after a bulk send.
 *
 * @param {number} sentCount - Number of messages sent successfully.
 * @param {number} errorCount - Number of messages that failed.
 * @param {number} skippedCount - Number of rows skipped (e.g., 'Paid', missing data).
 * @param {Array<Object>} errorDetails - Array of {name, error} objects for logging.
 * @param {string} [filter=""] - Optional string describing any filter (e.g., "for October").
 */
function showSendSummary(sentCount, errorCount, skippedCount, errorDetails, filter = "") {
  let summary = `📊 SEND SUMMARY ${filter}\n\n`;
  summary += `✅ Sent: ${sentCount}\n`;
  summary += `❌ Errors: ${errorCount}\n`;
  summary += `⊗ Skipped: ${skippedCount} (e.g., 'Paid', missing data, or wrong date)\n`;
  summary += `━━━━━━━━━━━━━━━━━━━━\n`;
  summary += `Total Processed: ${sentCount + errorCount + skippedCount}\n`;
  
  // Add dry run warning if applicable
  const settings = getSettings();
  if (settings.behavior.dryRunMode) {
    summary += `\n⚠️ DRY RUN MODE - No actual messages were sent!\n`;
  }
  
  // Add error details if any errors occurred
  if (errorDetails && errorDetails.length > 0) {
    summary += `\n❌ Error Details (first 5):\n`;
    // Show first 5 errors
    errorDetails.slice(0, 5).forEach(err => {
      summary += `• ${err.name}: ${err.error}\n`;
    });
    
    if (errorDetails.length > 5) {
      summary += `\n... and ${errorDetails.length - 5} more errors.\n`;
    }
  }
  
  // Display the summary in a dialog box
  ui.alert("Send Complete", summary, ui.ButtonSet.OK);
  
  // Also log to Apps Script logger for debugging
  Logger.log(summary);
}
