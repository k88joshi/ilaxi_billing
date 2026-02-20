// ========================================
// USER MANAGEMENT & LIVE USERS
// Allowed/admin user lists, authorization checks, and heartbeat tracking
// ========================================

/**
 * Property key for storing the allowed users whitelist.
 * @const {string}
 */
const ALLOWED_USERS_KEY = 'ALLOWED_USERS';

/**
 * Property key for storing the admin users list.
 * @const {string}
 */
const ADMIN_USERS_KEY = 'ADMIN_USERS';

/**
 * Gets the list of admin user emails from ScriptProperties.
 *
 * @returns {string[]} Array of admin email addresses
 */
function getAdminUsers() {
  const stored = scriptProperties.getProperty(ADMIN_USERS_KEY);
  return stored ? safeJsonParse_(stored, []) : [];
}

/**
 * Generic helper to add or remove an email from a ScriptProperties-backed user list.
 *
 * @param {string} propertyKey - The ScriptProperties key storing the JSON array
 * @param {string} email - The email address to add or remove
 * @param {'add'|'remove'} operation - Whether to add or remove the email
 * @returns {Object} Result with success boolean and message or error
 * @private
 */
function manageUserList_(propertyKey, email, operation) {
  if (!email || typeof email !== 'string') {
    Logger.log(`manageUserList_: Invalid email provided for ${operation}`);
    return { success: false, error: 'Invalid email provided' };
  }

  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail.includes('@')) {
    Logger.log(`manageUserList_: Email must contain @ for ${operation}`);
    return { success: false, error: 'Invalid email format' };
  }

  const users = safeJsonParse_(scriptProperties.getProperty(propertyKey), []);
  const index = users.indexOf(normalizedEmail);

  if (operation === 'add') {
    if (index !== -1) {
      return { success: true, message: `${normalizedEmail} already in list` };
    }
    users.push(normalizedEmail);
  } else {
    if (index === -1) {
      return { success: false, error: 'User not found in list' };
    }
    users.splice(index, 1);
  }

  scriptProperties.setProperty(propertyKey, JSON.stringify(users));
  Logger.log(`manageUserList_: ${operation} ${normalizedEmail} in ${propertyKey}`);
  return { success: true, message: `${operation === 'add' ? 'Added' : 'Removed'} ${normalizedEmail}` };
}

/**
 * Adds an email to the admin users list.
 * Run this function from the Apps Script editor to grant admin access.
 *
 * @param {string} email - The email address to make admin
 * @returns {Object} Result with success boolean
 */
function addAdminUser(email) {
  const result = manageUserList_(ADMIN_USERS_KEY, email, 'add');
  logEvent_('users', 'Add admin user', email || '', result.success, getCurrentUserEmail_());
  return result;
}

/**
 * Removes an email from the admin users list.
 *
 * @param {string} email - The email address to remove from admins
 * @returns {Object} Result with success boolean
 */
function removeAdminUser(email) {
  const result = manageUserList_(ADMIN_USERS_KEY, email, 'remove');
  logEvent_('users', 'Remove admin user', email || '', result.success, getCurrentUserEmail_());
  return result;
}

/**
 * Checks if the given email is in the admin users list.
 *
 * @param {string} email - The email to check
 * @returns {boolean} True if user is an admin
 * @private
 */
function isAdminUser_(email) {
  if (!email) {
    return false;
  }
  const normalizedEmail = email.trim().toLowerCase();
  const admins = getAdminUsers();
  return admins.includes(normalizedEmail);
}

// ========================================
// CURRENT USER & ALLOWED USERS
// ========================================

/**
 * Gets the email address of the currently logged-in user.
 * Tries Session.getActiveUser() first, then falls back to decoding
 * the OpenID Connect identity token (JWT) which is more reliable
 * across different Google account domains.
 *
 * @returns {string|null} The user's email address, or null if unavailable
 * @private
 */
function getCurrentUserEmail_() {
  try {
    const email = Session.getActiveUser().getEmail();
    if (email) return email;
  } catch (e) {
    Logger.log(`getCurrentUserEmail_ getActiveUser error: ${e.message}`);
  }

  // Fallback: decode the OpenID Connect identity token (requires "openid" scope)
  try {
    const token = ScriptApp.getIdentityToken();
    if (token) {
      const payload = JSON.parse(
        Utilities.newBlob(Utilities.base64Decode(token.split('.')[1])).getDataAsString()
      );
      if (payload.email) return payload.email;
    }
  } catch (e) {
    Logger.log(`getCurrentUserEmail_ identity token error: ${e.message}`);
  }

  return null;
}

/**
 * Gets the list of allowed user emails from ScriptProperties.
 *
 * @returns {string[]} Array of allowed email addresses
 */
function getAllowedUsers() {
  const stored = scriptProperties.getProperty(ALLOWED_USERS_KEY);
  return stored ? safeJsonParse_(stored, []) : [];
}

/**
 * Adds an email to the allowed users whitelist.
 * Run this function from the Apps Script editor to authorize users.
 *
 * @param {string} email - The email address to authorize
 * @returns {Object} Result with success boolean
 */
function addAllowedUser(email) {
  return manageUserList_(ALLOWED_USERS_KEY, email, 'add');
}

/**
 * Removes an email from the allowed users whitelist.
 * Run this function from the Apps Script editor to revoke access.
 *
 * @param {string} email - The email address to remove
 * @returns {Object} Result with success boolean
 */
function removeAllowedUser(email) {
  return manageUserList_(ALLOWED_USERS_KEY, email, 'remove');
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
    entries = safeJsonParse_(stored, {});
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

  const entries = safeJsonParse_(stored, {});

  const cutoff = Date.now() - HEARTBEAT_TTL_SECONDS * 1000;
  const live = [];
  for (const key in entries) {
    if (entries[key] > cutoff) {
      live.push(key);
    }
  }
  return live;
}
