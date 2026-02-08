/**
 * Lazily gets the Google Sheets UI.
 * This avoids errors when running tests outside of a spreadsheet context.
 * @returns {GoogleAppsScript.Base.Ui}
 */
function getUi_() {
  return SpreadsheetApp.getUi();
}

/**
 * Prompts user to enter a credential value and saves it to User Properties.
 *
 * @param {string} propertyKey - The key to store in UserProperties
 * @param {string} promptMessage - The message to display in the prompt
 * @param {string} successMessage - The message to display on success
 */
function setCredential_(propertyKey, promptMessage, successMessage) {
  const result = getUi_().prompt(promptMessage);
  if (result.getSelectedButton() === getUi_().Button.OK) {
    scriptProperties.setProperty(propertyKey, result.getResponseText().trim());
    getUi_().alert(successMessage);
    logEvent_('credentials', 'Set credential', propertyKey, true, getCurrentUserEmail_());
  }
}

/**
 * Deletes a credential from User Properties.
 *
 * @param {string} propertyKey - The key to delete
 * @param {string} successMessage - The message to display on success
 */
function deleteCredential_(propertyKey, successMessage) {
  scriptProperties.deleteProperty(propertyKey);
  getUi_().alert(successMessage);
  logEvent_('credentials', 'Delete credential', propertyKey, true, getCurrentUserEmail_());
}

/** Prompts user to enter their Twilio Account SID and saves it securely. */
function setAccountSid() {
  setCredential_("TWILIO_ACCOUNT_SID", "Enter your Twilio Account SID (found at twilio.com/console):", "Account SID saved successfully!");
}

/** Prompts user to enter their Twilio Auth Token and saves it securely. */
function setAuthToken() {
  setCredential_("TWILIO_AUTH_TOKEN", "Enter your Twilio Auth Token (found at twilio.com/console):", "Auth Token saved successfully!");
}

/** Prompts user to enter their Twilio Phone Number and saves it securely. */
function setPhoneNumber() {
  setCredential_("TWILIO_PHONE_NUMBER", "Enter your Twilio Phone Number (format: +1XXXXXXXXXX):", "Phone Number saved successfully!");
}

/** Deletes the stored Twilio Account SID from User Properties. */
function deleteAccountSid() {
  deleteCredential_("TWILIO_ACCOUNT_SID", "Account SID deleted.");
}

/** Deletes the stored Twilio Auth Token from User Properties. */
function deleteAuthToken() {
  deleteCredential_("TWILIO_AUTH_TOKEN", "Auth Token deleted.");
}

/** Deletes the stored Twilio Phone Number from User Properties. */
function deletePhoneNumber() {
  deleteCredential_("TWILIO_PHONE_NUMBER", "Phone Number deleted.");
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
 * Gets masked credential status for the settings dialog.
 * Returns masked values so the UI can show what's configured without exposing secrets.
 *
 * @returns {Object} Credential status with masked values
 * @private
 */
function getCredentialStatusForSettings_() {
  const sid = scriptProperties.getProperty('TWILIO_ACCOUNT_SID');
  const token = scriptProperties.getProperty('TWILIO_AUTH_TOKEN');
  const phone = scriptProperties.getProperty('TWILIO_PHONE_NUMBER');
  return {
    hasAccountSid: !!sid && sid !== 'placeholder',
    hasAuthToken: !!token && token !== 'placeholder',
    hasPhoneNumber: !!phone && phone !== 'placeholder',
    maskedSid: sid && sid !== 'placeholder' ? sid.substring(0, 6) + '...' + sid.substring(sid.length - 4) : '',
    maskedPhone: phone && phone !== 'placeholder' ? '***' + phone.slice(-4) : ''
  };
}

/**
 * Saves Twilio credentials from the settings UI.
 * Only saves fields that contain actual new values (not masked placeholders).
 *
 * @param {Object} creds - Object with accountSid, authToken, twilioPhone
 * @returns {Object} Result with success boolean
 */
function saveTwilioCredentialsFromUI(creds) {
  if (!creds || typeof creds !== 'object') {
    return { success: false, error: 'Invalid credentials data' };
  }
  try {
    const saved = [];
    if (creds.accountSid) {
      scriptProperties.setProperty('TWILIO_ACCOUNT_SID', creds.accountSid.trim());
      saved.push('Account SID');
    }
    if (creds.authToken) {
      scriptProperties.setProperty('TWILIO_AUTH_TOKEN', creds.authToken.trim());
      saved.push('Auth Token');
    }
    if (creds.twilioPhone) {
      scriptProperties.setProperty('TWILIO_PHONE_NUMBER', creds.twilioPhone.trim());
      saved.push('Phone Number');
    }
    if (saved.length > 0) {
      logEvent_('credentials', 'Save credentials', 'Saved: ' + saved.join(', '), true, getCurrentUserEmail_());
    }
    return { success: true };
  } catch (e) {
    Logger.log('saveTwilioCredentialsFromUI error: ' + e.message);
    logEvent_('credentials', 'Save credentials', e.message, false, getCurrentUserEmail_());
    return { success: false, error: e.message };
  }
}

/**
 * Checks if this is a first-time setup (no credentials and no setup completed flag).
 *
 * @returns {Object} Object with isFirstTime boolean
 */
function isFirstTimeSetup() {
  const setupCompleted = scriptProperties.getProperty("SETUP_COMPLETED");
  const hasAccountSid = scriptProperties.getProperty("TWILIO_ACCOUNT_SID");

  return {
    isFirstTime: !setupCompleted && !hasAccountSid
  };
}

/**
 * Marks the setup wizard as skipped so it doesn't show again.
 */
function markSetupSkipped() {
  scriptProperties.setProperty("SETUP_COMPLETED", "skipped");
  logEvent_('system', 'Setup wizard skipped', '', true, getCurrentUserEmail_());
}

/**
 * Tests Twilio credentials by calling the Twilio API account lookup endpoint.
 * This verifies credentials without sending an SMS.
 *
 * @param {string} accountSid - Twilio Account SID
 * @param {string} authToken - Twilio Auth Token
 * @param {string} twilioPhone - Twilio phone number (optional, for validation)
 * @returns {Object} Result with success boolean, accountName, and error details
 */
function testTwilioCredentials(accountSid, authToken, twilioPhone) {
  // Input validation
  if (!accountSid || typeof accountSid !== "string") {
    return { success: false, error: "Account SID is required", errorCode: "INVALID_CREDENTIALS" };
  }
  if (!authToken || typeof authToken !== "string") {
    return { success: false, error: "Auth Token is required", errorCode: "INVALID_CREDENTIALS" };
  }

  // Validate Account SID format
  if (!/^AC[a-f0-9]{32}$/i.test(accountSid)) {
    return {
      success: false,
      error: "Account SID format is invalid. It should start with 'AC' and be 34 characters.",
      errorCode: "INVALID_CREDENTIALS"
    };
  }

  try {
    const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}.json`;
    const options = {
      method: "get",
      headers: {
        "Authorization": "Basic " + Utilities.base64Encode(accountSid + ":" + authToken)
      },
      muteHttpExceptions: true
    };

    const response = UrlFetchApp.fetch(url, options);
    const responseCode = response.getResponseCode();

    if (responseCode === 200) {
      const accountInfo = JSON.parse(response.getContentText());
      return {
        success: true,
        accountName: accountInfo.friendly_name || "Twilio Account",
        accountStatus: accountInfo.status
      };
    } else if (responseCode === 401) {
      return {
        success: false,
        error: "Authentication failed. Please check your Account SID and Auth Token.",
        errorCode: "AUTH_FAILED"
      };
    } else if (responseCode === 404) {
      return {
        success: false,
        error: "Account not found. Please verify your Account SID.",
        errorCode: "INVALID_CREDENTIALS"
      };
    } else {
      const errorData = JSON.parse(response.getContentText());
      return {
        success: false,
        error: errorData.message || `Request failed with status ${responseCode}`,
        errorCode: "UNKNOWN"
      };
    }
  } catch (e) {
    Logger.log(`testTwilioCredentials error: ${e.message}`);
    return {
      success: false,
      error: `Connection error: ${e.message}`,
      errorCode: "UNKNOWN"
    };
  }
}

/**
 * Tests Twilio credentials using credentials already stored in UserProperties.
 * Called from the Settings UI to verify existing credentials.
 *
 * @returns {Object} Result with success boolean and details
 */
function testTwilioCredentialsFromSettings() {
  const accountSid = scriptProperties.getProperty("TWILIO_ACCOUNT_SID");
  const authToken = scriptProperties.getProperty("TWILIO_AUTH_TOKEN");
  const twilioPhone = scriptProperties.getProperty("TWILIO_PHONE_NUMBER");

  if (!accountSid || !authToken) {
    return {
      success: false,
      error: "Twilio credentials not set. Use the Credentials menu to configure them.",
      errorCode: "INVALID_CREDENTIALS"
    };
  }

  const result = testTwilioCredentials(accountSid, authToken, twilioPhone);
  logEvent_('credentials', 'Test credentials', result.success ? 'Passed' : (result.error || 'Failed'), result.success, getCurrentUserEmail_());
  return result;
}

/**
 * Completes the first-time setup wizard by saving credentials and settings.
 *
 * @param {Object} setupData - Data collected from the wizard
 * @returns {Object} Result with success boolean and optional error
 */
function completeFirstTimeSetup(setupData) {
  // Validate input
  if (!setupData || typeof setupData !== "object") {
    return { success: false, error: "Invalid setup data" };
  }

  try {
    // Save Twilio credentials
    if (setupData.credentials) {
      if (setupData.credentials.accountSid) {
        scriptProperties.setProperty("TWILIO_ACCOUNT_SID", setupData.credentials.accountSid);
      }
      if (setupData.credentials.authToken) {
        scriptProperties.setProperty("TWILIO_AUTH_TOKEN", setupData.credentials.authToken);
      }
      if (setupData.credentials.twilioPhone) {
        scriptProperties.setProperty("TWILIO_PHONE_NUMBER", setupData.credentials.twilioPhone);
      }
    }

    // Get current settings and update with wizard data
    const settings = getSettings();

    // Update business info
    if (setupData.business) {
      settings.business.name = setupData.business.name || settings.business.name;
      settings.business.etransferEmail = setupData.business.etransferEmail || settings.business.etransferEmail;
      settings.business.phoneNumber = setupData.business.phoneNumber || settings.business.phoneNumber;
      settings.business.whatsappLink = setupData.business.whatsappLink || settings.business.whatsappLink;
    }

    // Update column mappings
    if (setupData.columns) {
      Object.keys(setupData.columns).forEach(key => {
        if (setupData.columns[key] && settings.columns[key] !== undefined) {
          settings.columns[key] = setupData.columns[key];
        }
      });
    }

    // Save settings
    const saveResult = saveSettings(settings);
    if (!saveResult.success) {
      return { success: false, error: saveResult.error };
    }

    // Mark setup as completed
    scriptProperties.setProperty("SETUP_COMPLETED", new Date().toISOString());

    const parts = [
      setupData.credentials ? 'credentials' : '',
      setupData.business ? 'business info' : '',
      setupData.columns ? 'column mappings' : ''
    ].filter(Boolean).join(', ');
    Logger.log("First-time setup completed successfully");
    logEvent_('system', 'First-time setup', parts, true, getCurrentUserEmail_());
    return { success: true };
  } catch (e) {
    Logger.log(`completeFirstTimeSetup error: ${e.message}`);
    logEvent_('system', 'First-time setup', e.message, false, getCurrentUserEmail_());
    return { success: false, error: e.message };
  }
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
