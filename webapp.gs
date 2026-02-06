// ========================================
// WEB APP ENTRY POINTS
// Handles web app deployment and Google account authentication
// ========================================

/**
 * Property key for storing the allowed users whitelist.
 * @const {string}
 */
const ALLOWED_USERS_KEY = 'ALLOWED_USERS';

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
    const result = handleApiRequest_(data.action, data.payload);
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
// USER AUTHORIZATION MANAGEMENT
// ========================================

/**
 * Gets the email address of the currently logged-in user.
 *
 * @returns {string|null} The user's email address, or null if unavailable
 * @private
 */
function getCurrentUserEmail_() {
  try {
    const email = Session.getActiveUser().getEmail();
    return email || null;
  } catch (e) {
    Logger.log(`getCurrentUserEmail_ error: ${e.message}`);
    return null;
  }
}

/**
 * Gets the list of allowed user emails from ScriptProperties.
 *
 * @returns {string[]} Array of allowed email addresses
 */
function getAllowedUsers() {
  const stored = scriptProperties.getProperty(ALLOWED_USERS_KEY);
  if (!stored) {
    return [];
  }
  try {
    return JSON.parse(stored);
  } catch (e) {
    Logger.log(`getAllowedUsers parse error: ${e.message}`);
    return [];
  }
}

/**
 * Adds an email to the allowed users whitelist.
 * Run this function from the Apps Script editor to authorize users.
 *
 * @param {string} email - The email address to authorize
 * @returns {Object} Result with success boolean
 */
function addAllowedUser(email) {
  if (!email || typeof email !== 'string') {
    Logger.log('addAllowedUser: Invalid email provided');
    return { success: false, error: 'Invalid email provided' };
  }

  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail.includes('@')) {
    Logger.log('addAllowedUser: Email must contain @');
    return { success: false, error: 'Invalid email format' };
  }

  const users = getAllowedUsers();
  if (users.includes(normalizedEmail)) {
    Logger.log(`addAllowedUser: ${normalizedEmail} is already authorized`);
    return { success: true, message: 'User already authorized' };
  }

  users.push(normalizedEmail);
  scriptProperties.setProperty(ALLOWED_USERS_KEY, JSON.stringify(users));
  Logger.log(`addAllowedUser: Added ${normalizedEmail} to allowed users`);
  return { success: true, message: `Added ${normalizedEmail} to allowed users` };
}

/**
 * Removes an email from the allowed users whitelist.
 * Run this function from the Apps Script editor to revoke access.
 *
 * @param {string} email - The email address to remove
 * @returns {Object} Result with success boolean
 */
function removeAllowedUser(email) {
  if (!email || typeof email !== 'string') {
    Logger.log('removeAllowedUser: Invalid email provided');
    return { success: false, error: 'Invalid email provided' };
  }

  const normalizedEmail = email.trim().toLowerCase();
  const users = getAllowedUsers();
  const index = users.indexOf(normalizedEmail);

  if (index === -1) {
    Logger.log(`removeAllowedUser: ${normalizedEmail} not found in allowed users`);
    return { success: false, error: 'User not found in allowed list' };
  }

  users.splice(index, 1);
  scriptProperties.setProperty(ALLOWED_USERS_KEY, JSON.stringify(users));
  Logger.log(`removeAllowedUser: Removed ${normalizedEmail} from allowed users`);
  return { success: true, message: `Removed ${normalizedEmail} from allowed users` };
}

/**
 * Checks if the given email is in the allowed users whitelist.
 *
 * @param {string} email - The email to check
 * @returns {boolean} True if user is authorized
 * @private
 */
function isUserAuthorized_(email) {
  if (!email) {
    return false;
  }

  const normalizedEmail = email.trim().toLowerCase();
  const users = getAllowedUsers();
  return users.includes(normalizedEmail);
}

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

// ========================================
// LIVE USERS (CacheService Heartbeat)
// ========================================

/**
 * Cache key for tracking live users via heartbeat.
 * @const {string}
 */
const LIVE_USERS_CACHE_KEY = 'LIVE_USERS';

/**
 * How long (in seconds) before a user is considered stale.
 * @const {number}
 */
const HEARTBEAT_TTL_SECONDS = 120;

/**
 * Records a heartbeat for the given email and returns the list of currently
 * live (non-stale) user emails. Entries older than HEARTBEAT_TTL_SECONDS are pruned.
 *
 * @param {string} email - The email address of the user sending the heartbeat
 * @returns {string[]} Array of currently live email addresses
 * @private
 */
function recordHeartbeat_(email) {
  const cache = CacheService.getScriptCache();
  const now = Date.now();
  let entries = {};

  const stored = cache.get(LIVE_USERS_CACHE_KEY);
  if (stored) {
    try {
      entries = JSON.parse(stored);
    } catch (e) {
      Logger.log('recordHeartbeat_ parse error: ' + e.message);
    }
  }

  // Prune stale entries
  const cutoff = now - HEARTBEAT_TTL_SECONDS * 1000;
  const pruned = {};
  for (const key in entries) {
    if (entries[key] > cutoff) {
      pruned[key] = entries[key];
    }
  }

  // Record this user's heartbeat
  pruned[email.toLowerCase()] = now;

  // Store with a generous TTL (cache auto-expires; we prune manually)
  cache.put(LIVE_USERS_CACHE_KEY, JSON.stringify(pruned), HEARTBEAT_TTL_SECONDS * 3);

  return Object.keys(pruned);
}

/**
 * Returns the list of currently live (non-stale) user emails from the cache.
 *
 * @returns {string[]} Array of currently live email addresses
 * @private
 */
function getLiveUsers_() {
  const cache = CacheService.getScriptCache();
  const stored = cache.get(LIVE_USERS_CACHE_KEY);
  if (!stored) return [];

  let entries;
  try {
    entries = JSON.parse(stored);
  } catch (e) {
    Logger.log('getLiveUsers_ parse error: ' + e.message);
    return [];
  }

  const cutoff = Date.now() - HEARTBEAT_TTL_SECONDS * 1000;
  const live = [];
  for (const key in entries) {
    if (entries[key] > cutoff) {
      live.push(key);
    }
  }
  return live;
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
