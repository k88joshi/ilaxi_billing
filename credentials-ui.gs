// ========================================
// CREDENTIAL UI PROMPTS (Add-on Mode)
// Menu-driven dialogs for setting and deleting
// Twilio credentials via SpreadsheetApp UI.
// ========================================

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


