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
  if (DRY_RUN_MODE) {
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
