// ========================================
// WEB APP ENTRY POINTS
// Handles web app deployment and authentication
// ========================================

/**
 * Main entry point for web app GET requests.
 * Serves the login page or main app based on password validation.
 *
 * @param {Object} e - Event object from web app request
 * @returns {HtmlOutput} HTML page to display
 */
function doGet(e) {
  const password = e?.parameter?.p;

  if (validatePassword_(password)) {
    // Password valid - serve main app
    const template = HtmlService.createTemplateFromFile('webapp-main');
    template.password = password; // Pass password for API calls
    return createHtmlOutput_(template, 'Ilaxi Billing');
  }

  // No valid password - serve login page
  const errorParam = e?.parameter?.error;
  const template = HtmlService.createTemplateFromFile('login');
  template.errorMessage = errorParam === '1' ? 'Invalid password. Please try again.' : '';
  return createHtmlOutput_(template, 'Login - Ilaxi Billing');
}

/**
 * Handles POST requests from the web app.
 * All API calls go through this endpoint.
 *
 * @param {Object} e - Event object with postData
 * @returns {TextOutput} JSON response
 */
function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const result = handleApiRequest_(data.action, data.payload, data.password);
    return ContentService.createTextOutput(JSON.stringify(result))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (error) {
    Logger.log(`doPost error: ${error.message}`);
    return ContentService.createTextOutput(JSON.stringify({
      success: false,
      error: `Request failed: ${error.message}`
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

// ========================================
// PASSWORD MANAGEMENT
// ========================================

/**
 * Property key for storing the hashed app password.
 * @const {string}
 */
const APP_PASSWORD_KEY = 'APP_PASSWORD';

/**
 * Sets the app password (hashed with SHA-256).
 * Run this function manually from the Apps Script editor to set your password.
 *
 * @param {string} newPassword - The plaintext password to set
 * @returns {Object} Result with success boolean
 */
function setAppPassword(newPassword) {
  if (!newPassword || typeof newPassword !== 'string' || newPassword.length < 4) {
    Logger.log('setAppPassword: Password must be at least 4 characters');
    return { success: false, error: 'Password must be at least 4 characters' };
  }

  const hash = hashPassword_(newPassword);
  PropertiesService.getScriptProperties().setProperty(APP_PASSWORD_KEY, hash);
  Logger.log('App password set successfully');
  return { success: true };
}

/**
 * Validates an input password against the stored hash.
 *
 * @param {string} inputPassword - The plaintext password to validate
 * @returns {boolean} True if password is valid
 * @private
 */
function validatePassword_(inputPassword) {
  if (!inputPassword || typeof inputPassword !== 'string') {
    return false;
  }

  const stored = PropertiesService.getScriptProperties().getProperty(APP_PASSWORD_KEY);
  if (!stored) {
    Logger.log('validatePassword_: No password has been set. Run setAppPassword() first.');
    return false;
  }

  const inputHash = hashPassword_(inputPassword);
  return stored === inputHash;
}

/**
 * Hashes a password using SHA-256.
 *
 * @param {string} password - The plaintext password
 * @returns {string} Hex-encoded hash
 * @private
 */
function hashPassword_(password) {
  const hash = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, password);
  return hash.map(b => ('0' + (b & 0xFF).toString(16)).slice(-2)).join('');
}

/**
 * Checks if an app password has been set.
 * Useful for first-time setup verification.
 *
 * @returns {boolean} True if password exists
 */
function hasAppPassword() {
  const stored = PropertiesService.getScriptProperties().getProperty(APP_PASSWORD_KEY);
  return !!stored;
}

/**
 * Removes the app password.
 * WARNING: This will disable web app access until a new password is set.
 *
 * @returns {Object} Result with success boolean
 */
function clearAppPassword() {
  PropertiesService.getScriptProperties().deleteProperty(APP_PASSWORD_KEY);
  Logger.log('App password cleared');
  return { success: true };
}

/**
 * Gets the current web app deployment URL.
 * Useful for displaying the URL to users after deployment.
 *
 * @returns {string} The web app URL or a message if not deployed
 */
function getWebAppUrl() {
  try {
    return ScriptApp.getService().getUrl();
  } catch (e) {
    return 'Web app not deployed yet. Deploy via Publish > Deploy as web app.';
  }
}

/**
 * Creates the HTML output with standard settings.
 * Safely handles XFrameOptionsMode to avoid null errors.
 *
 * @param {HtmlTemplate} template - The template to evaluate
 * @param {string} title - The page title
 * @returns {HtmlOutput} The configured HTML output
 * @private
 */
function createHtmlOutput_(template, title) {
  const output = template.evaluate()
    .setTitle(title)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');

  // Safely set XFrameOptionsMode if available
  if (HtmlService.XFrameOptionsMode && HtmlService.XFrameOptionsMode.DENY != null) {
    output.setXFrameOptionsMode(HtmlService.XFrameOptionsMode.DENY);
  }

  return output;
}

/**
 * Helper function to include HTML files (for modular templates).
 *
 * @param {string} filename - Name of the HTML file to include
 * @returns {string} The file contents
 */
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}
