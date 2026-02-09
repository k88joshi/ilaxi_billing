// ========================================
// WEB APP ENTRY POINTS
// Handles web app deployment and Google account authentication
// ========================================

/**
 * Safely parses a JSON string, returning a default value on failure.
 *
 * @param {string} jsonString - The JSON string to parse
 * @param {*} defaultValue - Value to return if parsing fails
 * @returns {*} Parsed value or defaultValue
 * @private
 */
function safeJsonParse_(jsonString, defaultValue) {
  if (jsonString === null || jsonString === undefined) return defaultValue;
  try { return JSON.parse(jsonString); }
  catch (e) { Logger.log('safeJsonParse_ error: ' + e.message); return defaultValue; }
}

// ========================================
// WEB APP ROUTES
// ========================================

/**
 * Main entry point for web app GET requests.
 * Serves the main app if user is authorized, otherwise shows access denied page.
 *
 * @param {Object} e - Event object from web app request
 * @returns {HtmlOutput} HTML page to display
 */
function doGet(e) {
  const userEmail = getCurrentUserEmail_();

  if (!userEmail) {
    return createUnauthorizedPage_('', 'Unable to determine your Google account. Please ensure you are signed in.');
  }

  if (!isUserAuthorized_(userEmail)) {
    return createUnauthorizedPage_(userEmail, 'Your account is not authorized to access this application.');
  }

  // User is authorized - serve main app
  const template = HtmlService.createTemplateFromFile('webapp-main');
  return createHtmlOutput_(template, 'Ilaxi Billing');
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
    // Check authorization first
    const userEmail = getCurrentUserEmail_();
    if (!userEmail || !isUserAuthorized_(userEmail)) {
      return ContentService.createTextOutput(JSON.stringify({
        success: false,
        error: 'Unauthorized',
        errorCode: 'AUTH_REQUIRED'
      })).setMimeType(ContentService.MimeType.JSON);
    }

    const data = JSON.parse(e.postData.contents);
    const result = handleApiRequest_(data.action, data.payload, userEmail);
    return ContentService.createTextOutput(JSON.stringify(result))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (error) {
    Logger.log(`doPost error: ${error.message}`);
    return ContentService.createTextOutput(JSON.stringify({
      success: false,
      error: 'Request failed'
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

// ========================================
// HTML OUTPUT HELPERS
// ========================================

/**
 * Creates an HTML page for unauthorized access.
 *
 * @param {string} email - The user's email (for display)
 * @param {string} reason - The reason for denial
 * @returns {HtmlOutput} The access denied page
 * @private
 */
function createUnauthorizedPage_(email, reason) {
  // HTML-escape user-provided values to prevent XSS
  const escapeHtml = (str) => String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const safeEmail = escapeHtml(email);
  const safeReason = escapeHtml(reason);
  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Access Denied - Ilaxi Billing</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
    }
    .card {
      background: white;
      border-radius: 16px;
      padding: 40px;
      max-width: 450px;
      width: 100%;
      text-align: center;
      box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
    }
    .icon {
      width: 80px;
      height: 80px;
      background: #fee2e2;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      margin: 0 auto 24px;
    }
    .icon svg { width: 40px; height: 40px; color: #ef4444; }
    h1 { color: #1e293b; font-size: 24px; margin-bottom: 12px; }
    p { color: #64748b; line-height: 1.6; margin-bottom: 16px; }
    .email {
      background: #f1f5f9;
      padding: 12px 16px;
      border-radius: 8px;
      font-family: monospace;
      font-size: 14px;
      color: #475569;
      word-break: break-all;
      margin-bottom: 24px;
    }
    .help {
      font-size: 13px;
      color: #94a3b8;
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">
      <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
      </svg>
    </div>
    <h1>Access Denied</h1>
    <p>${safeReason}</p>
    ${safeEmail ? `<div class="email">${safeEmail}</div>` : ''}
    <p class="help">If you believe you should have access, please contact the administrator.</p>
  </div>
</body>
</html>
  `.trim();

  return HtmlService.createHtmlOutput(html)
    .setTitle('Access Denied - Ilaxi Billing')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
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
 *
 * @param {HtmlTemplate} template - The template to evaluate
 * @param {string} title - The page title
 * @returns {HtmlOutput} The configured HTML output
 * @private
 */
function createHtmlOutput_(template, title) {
  return template.evaluate()
    .setTitle(title)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
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
