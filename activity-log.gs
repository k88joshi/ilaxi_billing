// ========================================
// ACTIVITY LOG
// Event logging with sharded storage,
// web API endpoints, and admin access control.
// ========================================

const ACTIVITY_LOG_KEY_A = "ACTIVITY_LOG_A";
const ACTIVITY_LOG_KEY_B = "ACTIVITY_LOG_B";
const ACTIVITY_LOG_CHUNK_SIZE = 50;

/**
 * Appends an event to the rolling activity log.
 * Uses two-key sharding (A/B) to stay within the ~9KB per-property limit.
 * Wrapped in try/catch so logging never breaks the caller.
 *
 * @param {string} cat - Category: billing, settings, credentials, users, system
 * @param {string} act - Action description
 * @param {string} det - Detail string
 * @param {boolean} ok - Whether the action succeeded
 * @param {string} [userEmail] - User who performed the action
 */
function logEvent_(cat, act, det, ok, userEmail) {
  try {
    const entry = {
      ts: Date.now(),
      user: userEmail || "",
      cat: cat || "system",
      act: act || "",
      det: det || "",
      ok: ok !== false
    };

    const props = scriptProperties;
    const chunkB = safeJsonParse_(props.getProperty(ACTIVITY_LOG_KEY_B), []);

    chunkB.push(entry);

    if (chunkB.length > ACTIVITY_LOG_CHUNK_SIZE) {
      // Rotate: current B becomes A, start fresh B
      props.setProperty(ACTIVITY_LOG_KEY_A, JSON.stringify(chunkB));
      props.setProperty(ACTIVITY_LOG_KEY_B, "[]");
    } else {
      props.setProperty(ACTIVITY_LOG_KEY_B, JSON.stringify(chunkB));
    }
  } catch (e) {
    Logger.log("logEvent_ error (non-fatal): " + e.message);
  }
}

/**
 * Reads and concatenates both log chunks, returns sorted array (newest first).
 *
 * @returns {Array} Array of log entry objects
 */
function getActivityLog_() {
  const props = scriptProperties;
  const chunkA = safeJsonParse_(props.getProperty(ACTIVITY_LOG_KEY_A), []);
  const chunkB = safeJsonParse_(props.getProperty(ACTIVITY_LOG_KEY_B), []);
  const all = (Array.isArray(chunkA) ? chunkA : []).concat(Array.isArray(chunkB) ? chunkB : []);
  all.sort(function(a, b) { return (b.ts || 0) - (a.ts || 0); });
  return all;
}

/**
 * Web API handler: returns the activity log.
 * @returns {Object} {success: true, data: Array}
 */
function getActivityLogForWeb() {
  try {
    return { success: true, data: getActivityLog_() };
  } catch (error) {
    Logger.log(`getActivityLogForWeb error: ${error.message}`);
    return { success: false, error: error.message };
  }
}

/**
 * Web API handler: clears the activity log.
 * @returns {Object} {success: true}
 */
function clearActivityLogForWeb() {
  try {
    const chunkA = safeJsonParse_(scriptProperties.getProperty(ACTIVITY_LOG_KEY_A), []);
    const chunkB = safeJsonParse_(scriptProperties.getProperty(ACTIVITY_LOG_KEY_B), []);
    const entryCount = (Array.isArray(chunkA) ? chunkA.length : 0) + (Array.isArray(chunkB) ? chunkB.length : 0);
    scriptProperties.deleteProperty(ACTIVITY_LOG_KEY_A);
    scriptProperties.deleteProperty(ACTIVITY_LOG_KEY_B);
    logEvent_('system', 'Clear activity log', 'Cleared ' + entryCount + ' entries', true, getCurrentUserEmail_());
    return { success: true };
  } catch (error) {
    Logger.log(`clearActivityLogForWeb error: ${error.message}`);
    return { success: false, error: error.message };
  }
}
