/**
 * Lazily gets the Google Sheets UI.
 * This avoids errors when running tests outside of a spreadsheet context.
 * @returns {GoogleAppsScript.Base.Ui}
 */
function getUi_() {
  return SpreadsheetApp.getUi();
}


// ========================================
// SETTINGS DIALOG FUNCTIONS
// ========================================

/**
 * Opens the settings dialog in the Google Sheets UI.
 * Uses a modal dialog for more screen space than a sidebar.
 */
function showSettingsDialog() {
  const template = HtmlService.createTemplateFromFile("settings");
  const html = template.evaluate()
    .setWidth(950)
    .setHeight(650);
  SpreadsheetApp.getUi().showModalDialog(html, "Settings");
}

/**
 * Retrieves settings and sheet headers for the sidebar UI.
 * Called from settings.html via google.script.run.
 *
 * @returns {Object} Object containing settings, headers, and first-time setup status
 */
function getSettingsForUI() {
  const settings = getSettings();
  const headers = getSheetHeaders();
  const firstTimeCheck = isFirstTimeSetup();
  const credentialStatus = getCredentialStatusForSettings_();
  return {
    settings: settings,
    headers: headers,
    isFirstTime: firstTimeCheck.isFirstTime,  // Extract boolean from object
    credentials: credentialStatus
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
  const oldSettings = getSettings();
  const result = saveSettings(settings);
  const changes = describeSettingsChanges_(oldSettings, settings);
  logEvent_('settings', 'Save settings', changes, result.success, getCurrentUserEmail_());
  return result;
}

/**
 * Compares old and new settings to produce a human-readable summary of changes.
 *
 * @param {Object} oldS - Previous settings object
 * @param {Object} newS - New settings object
 * @returns {string} Comma-separated list of changes
 * @private
 */
function describeSettingsChanges_(oldS, newS) {
  const changes = [];

  // Business fields
  const biz = { name: 'Business name', etransferEmail: 'E-transfer email', phoneNumber: 'Phone', whatsappLink: 'WhatsApp link' };
  Object.keys(biz).forEach(function(k) {
    const o = (oldS.business && oldS.business[k]) || '';
    const n = (newS.business && newS.business[k]) || '';
    if (o !== n) changes.push(biz[k] + ' → ' + n);
  });

  // Behavior fields
  const behave = { batchSize: 'Batch size', messageDelayMs: 'Message delay', headerRowIndex: 'Header row',
    autoThankYouEnabled: 'Auto thank-you', dryRunMode: 'Dry run' };
  Object.keys(behave).forEach(function(k) {
    const o = oldS.behavior ? oldS.behavior[k] : undefined;
    const n = newS.behavior ? newS.behavior[k] : undefined;
    if (String(o) !== String(n)) changes.push(behave[k] + ' → ' + n);
  });

  // Column mappings
  const colLabels = { phoneNumber: 'Phone col', customerName: 'Name col', balance: 'Balance col',
    numTiffins: 'Tiffins col', dueDate: 'Date col', messageStatus: 'Msg status col',
    orderId: 'Order ID col', paymentStatus: 'Payment col' };
  Object.keys(colLabels).forEach(function(k) {
    const o = (oldS.columns && oldS.columns[k]) || '';
    const n = (newS.columns && newS.columns[k]) || '';
    if (o !== n) changes.push(colLabels[k] + ' → ' + n);
  });

  // Templates (just note which changed, content is too long)
  const templateTypes = ['firstNotice', 'followUp', 'finalNotice'];
  templateTypes.forEach(function(t) {
    const oldMsg = oldS.templates && oldS.templates.billMessages && oldS.templates.billMessages[t];
    const newMsg = newS.templates && newS.templates.billMessages && newS.templates.billMessages[t];
    const oldText = (oldMsg && oldMsg.message) || '';
    const newText = (newMsg && newMsg.message) || '';
    if (oldText !== newText) changes.push(t + ' template updated');
    const oldName = (oldMsg && oldMsg.name) || '';
    const newName = (newMsg && newMsg.name) || '';
    if (oldName !== newName) changes.push(t + ' name → ' + newName);
  });
  const oldTy = (oldS.templates && oldS.templates.thankYouMessage) || '';
  const newTy = (newS.templates && newS.templates.thankYouMessage) || '';
  if (oldTy !== newTy) changes.push('Thank-you template updated');

  return changes.length > 0 ? changes.join(', ') : 'No changes detected';
}

/**
 * Generates a preview of a message template with sample data.
 * Called from settings.html via google.script.run.
 *
 * @param {string} template - Template string to preview
 * @returns {string} Processed template with sample values
 */
function previewTemplate(template) {
  // Input validation
  if (!template || typeof template !== "string") {
    return "Error: Invalid template provided";
  }
  try {
    return processTemplate(template, getSampleDataForPreview());
  } catch (e) {
    Logger.log(`previewTemplate error: ${e.message}`);
    return `Error generating preview: ${e.message}`;
  }
}

/**
 * Retrieves all column headers from the active sheet.
 * Used to populate column mapping dropdowns in the settings UI.
 *
 * @returns {Array<string>} Array of header names
 */
function getSheetHeaders() {
  try {
    const sheet = getTargetSheet_();
    const settings = getSettings();
    const headerRow = settings.behavior.headerRowIndex || 1;

    const lastCol = sheet.getLastColumn();
    if (lastCol === 0) return [];

    const headers = sheet.getRange(headerRow, 1, 1, lastCol).getValues()[0];
    return headers.filter(h => h && String(h).trim() !== "").map(h => String(h).trim());
  } catch (e) {
    Logger.log(`getSheetHeaders error: ${e.message}`);
    return [];
  }
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
  const result = getUi_().prompt("Import Settings", "Paste the JSON settings content below:", getUi_().ButtonSet.OK_CANCEL);
  if (result.getSelectedButton() !== getUi_().Button.OK) return;

  const jsonString = result.getResponseText().trim();
  if (!jsonString) {
    getUi_().alert("Import cancelled: No content provided.");
    return;
  }

  const importResult = importSettings(jsonString);
  getUi_().alert(importResult.success ? "Settings imported successfully!" : "Import failed: " + importResult.error);
}

/**
 * Shows confirmation dialog before resetting settings to defaults.
 */
function confirmResetSettings() {
  const response = getUi_().alert(
    "Reset Settings",
    "This will reset ALL settings to their default values. This cannot be undone.\n\nAre you sure?",
    getUi_().ButtonSet.YES_NO
  );

  if (response !== getUi_().Button.YES) return;

  const result = resetToDefaults();
  getUi_().alert(result.success ? "Settings have been reset to defaults." : "Reset failed: " + result.error);
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
 * @param {boolean} [dryRunMode=false] - Whether this was a dry run send.
 * @param {Object} [duplicateInfo] - Optional duplicate info with {exactCount, relatedCount}.
 */
function showSendSummary(sentCount, errorCount, skippedCount, errorDetails, filter = "", dryRunMode = false, duplicateInfo = null) {
  // Input validation - ensure counts are valid numbers
  sentCount = typeof sentCount === "number" && !isNaN(sentCount) ? Math.max(0, sentCount) : 0;
  errorCount = typeof errorCount === "number" && !isNaN(errorCount) ? Math.max(0, errorCount) : 0;
  skippedCount = typeof skippedCount === "number" && !isNaN(skippedCount) ? Math.max(0, skippedCount) : 0;
  errorDetails = Array.isArray(errorDetails) ? errorDetails : [];
  filter = typeof filter === "string" ? filter : "";

  let summary = `📊 SEND SUMMARY ${filter}\n\n`;
  summary += `✅ Sent: ${sentCount}\n`;
  summary += `❌ Errors: ${errorCount}\n`;
  summary += `⊗ Skipped: ${skippedCount} (e.g., 'Paid', missing data, or wrong date)\n`;
  summary += `━━━━━━━━━━━━━━━━━━━━\n`;
  summary += `Total Processed: ${sentCount + errorCount + skippedCount}\n`;

  // Add dry run warning if applicable
  if (dryRunMode) {
    summary += `\n⚠️ TEST MODE - No actual messages were sent!\n`;
  }

  // Add duplicate warning if applicable
  if (duplicateInfo && duplicateInfo.exactCount > 0) {
    summary += `\n⚠️ DUPLICATES: ${duplicateInfo.exactCount} row(s) share the same phone + due date.\n`;
    summary += `Some recipients may have received multiple messages.\n`;
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
  getUi_().alert("Send Complete", summary, getUi_().ButtonSet.OK);

  // Also log to Apps Script logger for debugging
  Logger.log(summary);
}
