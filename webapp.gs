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
  try {
    // Debug mode: add ?debug=1 to URL to test basic server response
    if (e?.parameter?.debug === '1') {
      const debugInfo = {
        timestamp: new Date().toISOString(),
        hasPassword: !!PropertiesService.getScriptProperties().getProperty(APP_PASSWORD_KEY),
        spreadsheetId: SPREADSHEET_ID,
        spreadsheetConfigured: SPREADSHEET_ID !== 'YOUR_SPREADSHEET_ID_HERE'
      };
      return HtmlService.createHtmlOutput(
        '<html><body style="font-family:monospace;padding:20px;">' +
        '<h1>Debug Info</h1>' +
        '<pre>' + JSON.stringify(debugInfo, null, 2) + '</pre>' +
        '<p>If you see this, server-side is working!</p>' +
        '</body></html>'
      ).setTitle('Debug');
    }

    // Debug mode 2: test template evaluation with a fake password
    if (e?.parameter?.debug === '2') {
      try {
        const template = HtmlService.createTemplateFromFile('webapp-main');
        template.password = 'test123'; // Safe test password
        const evaluated = template.evaluate();
        const content = evaluated.getContent();
        return HtmlService.createHtmlOutput(
          '<html><body style="font-family:monospace;padding:20px;">' +
          '<h1>Template Evaluation: SUCCESS</h1>' +
          '<p>Template evaluated successfully. Length: ' + content.length + ' chars</p>' +
          '<p>First 500 chars:</p>' +
          '<pre style="background:#f0f0f0;padding:10px;overflow:auto;">' +
          content.substring(0, 500).replace(/</g, '&lt;').replace(/>/g, '&gt;') +
          '</pre>' +
          '</body></html>'
        ).setTitle('Debug 2');
      } catch (err) {
        return HtmlService.createHtmlOutput(
          '<html><body style="font-family:monospace;padding:20px;color:red;">' +
          '<h1>Template Evaluation: FAILED</h1>' +
          '<p><strong>Error:</strong> ' + err.toString() + '</p>' +
          '<p><strong>Stack:</strong></p><pre>' + err.stack + '</pre>' +
          '</body></html>'
        ).setTitle('Debug 2 - Error');
      }
    }

    // Debug mode 4: exact same code path as normal login - serves actual webapp-main
    if (e?.parameter?.debug === '4' && e?.parameter?.p) {
      if (validatePassword_(e.parameter.p)) {
        const template = HtmlService.createTemplateFromFile('webapp-main');
        template.password = e.parameter.p;
        return createHtmlOutput_(template, 'Ilaxi Billing - Debug 4');
      } else {
        return HtmlService.createHtmlOutput('<h1>Invalid password for debug=4</h1>');
      }
    }

    // Debug mode 5: serve webapp-main WITHOUT going through createHtmlOutput_
    if (e?.parameter?.debug === '5' && e?.parameter?.p) {
      if (validatePassword_(e.parameter.p)) {
        const template = HtmlService.createTemplateFromFile('webapp-main');
        template.password = e.parameter.p;
        // Direct evaluate without the helper function
        return template.evaluate().setTitle('Ilaxi Billing - Debug 5');
      } else {
        return HtmlService.createHtmlOutput('<h1>Invalid password for debug=5</h1>');
      }
    }

    // Debug mode 3: test with actual password from URL
    if (e?.parameter?.debug === '3' && e?.parameter?.p) {
      try {
        const template = HtmlService.createTemplateFromFile('webapp-main');
        template.password = e.parameter.p;
        const evaluated = template.evaluate();
        const content = evaluated.getContent();
        // Show the part around APP_PASSWORD to check for issues
        const pwIndex = content.indexOf('APP_PASSWORD');
        const snippet = pwIndex > -1 ? content.substring(Math.max(0, pwIndex - 50), pwIndex + 200) : 'APP_PASSWORD not found';
        return HtmlService.createHtmlOutput(
          '<html><body style="font-family:monospace;padding:20px;">' +
          '<h1>Template with Real Password: SUCCESS</h1>' +
          '<p>Length: ' + content.length + ' chars</p>' +
          '<p>APP_PASSWORD section:</p>' +
          '<pre style="background:#f0f0f0;padding:10px;overflow:auto;">' +
          snippet.replace(/</g, '&lt;').replace(/>/g, '&gt;') +
          '</pre>' +
          '</body></html>'
        ).setTitle('Debug 3');
      } catch (err) {
        return HtmlService.createHtmlOutput(
          '<html><body style="font-family:monospace;padding:20px;color:red;">' +
          '<h1>Template with Real Password: FAILED</h1>' +
          '<p><strong>Error:</strong> ' + err.toString() + '</p>' +
          '<p><strong>Stack:</strong></p><pre>' + err.stack + '</pre>' +
          '</body></html>'
        ).setTitle('Debug 3 - Error');
      }
    }

    const password = e?.parameter?.p;

    if (validatePassword_(password)) {
      // Password valid - serve main app
      const template = HtmlService.createTemplateFromFile('webapp-main');
      template.password = password; // Pass password for API calls
      return createHtmlOutput_(template, 'Ilaxi Billing');
    }

    // No valid password - serve login page
    // Show error if password was provided but invalid
    const template = HtmlService.createTemplateFromFile('login');
    template.errorMessage = password ? 'Invalid password. Please try again.' : '';
    return createHtmlOutput_(template, 'Login - Ilaxi Billing');
  } catch (error) {
    return ContentService.createTextOutput('Server Error: ' + error.toString() + '\nStack: ' + error.stack);
  }
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
  if (HtmlService.XFrameOptionsMode && HtmlService.XFrameOptionsMode.ALLOWALL != null) {
    output.setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
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
