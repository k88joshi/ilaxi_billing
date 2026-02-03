/**
 * Global variable for storing/retrieving secure credentials.
 * @type {GoogleAppsScript.Properties.Properties}
 */
const userProperties = PropertiesService.getUserProperties();

/**
 * Twilio credentials. These are populated by checkCredentials().
 */
let TWILIO_ACCOUNT_SID = "";
let TWILIO_AUTH_TOKEN = "";
let TWILIO_PHONE_NUMBER = "";

/**
 * Validates that all required Twilio credentials are set in User Properties.
 * Loads credentials into global variables if they exist.
 *
 * @param {boolean} [silent=false] - If true, suppresses UI alerts for missing credentials.
 * @returns {boolean} True if all credentials are set, false otherwise.
 */
function checkCredentials(silent = false) {
  TWILIO_ACCOUNT_SID = userProperties.getProperty("TWILIO_ACCOUNT_SID");
  TWILIO_AUTH_TOKEN = userProperties.getProperty("TWILIO_AUTH_TOKEN");
  TWILIO_PHONE_NUMBER = userProperties.getProperty("TWILIO_PHONE_NUMBER");

  const missingCredentials = [];
  if (!TWILIO_ACCOUNT_SID || TWILIO_ACCOUNT_SID === "placeholder") {
    missingCredentials.push("Account SID");
  }
  if (!TWILIO_AUTH_TOKEN || TWILIO_AUTH_TOKEN === "placeholder") {
    missingCredentials.push("Auth Token");
  }
  if (!TWILIO_PHONE_NUMBER || TWILIO_PHONE_NUMBER === "placeholder") {
    missingCredentials.push("Phone Number");
  }

  if (missingCredentials.length > 0) {
    if (!silent) {
      ui.alert(`Error: Twilio ${missingCredentials.join(", ")} not set. Please set via the 'Credentials' menu.`);
    }
    return false;
  }

  return true;
}


/**
 * HTTP status codes that indicate transient errors worth retrying.
 * @const {number[]}
 */
const RETRYABLE_STATUS_CODES = [408, 429, 500, 502, 503, 504];

/**
 * Maximum number of total attempts (1 initial + N retries) for transient failures.
 * With MAX_ATTEMPTS = 4, we try once initially and retry up to 3 times.
 * @const {number}
 */
const MAX_ATTEMPTS = 4;

/**
 * Base delay in milliseconds for exponential backoff.
 * @const {number}
 */
const BASE_RETRY_DELAY_MS = 1000;

/**
 * Determines if an HTTP status code or error is retryable.
 *
 * @param {number} statusCode - HTTP response status code.
 * @param {Error} [error] - Optional error object for network failures.
 * @returns {boolean} True if the error is transient and worth retrying.
 */
function isRetryableError_(statusCode, error) {
  // Retry on specific HTTP status codes
  if (RETRYABLE_STATUS_CODES.includes(statusCode)) {
    return true;
  }

  // Retry on network-level errors (timeouts, connection issues)
  if (error) {
    const errorMessage = String(error.message || error).toLowerCase();
    const retryablePatterns = [
      "timeout",
      "timed out",
      "connection reset",
      "connection refused",
      "network",
      "econnreset",
      "socket",
      "temporarily unavailable"
    ];
    return retryablePatterns.some(pattern => errorMessage.includes(pattern));
  }

  return false;
}

/**
 * Calculates the delay for exponential backoff with jitter.
 *
 * @param {number} attempt - Current retry attempt (0-based).
 * @returns {number} Delay in milliseconds.
 */
function calculateBackoffDelay_(attempt) {
  // Exponential backoff: base * 2^attempt
  const exponentialDelay = BASE_RETRY_DELAY_MS * Math.pow(2, attempt);
  // Add jitter (±25%) to prevent thundering herd
  const jitter = exponentialDelay * 0.25 * (Math.random() * 2 - 1);
  return Math.round(exponentialDelay + jitter);
}

/**
 * Sends an SMS message via Twilio API with retry logic for transient failures.
 * Implements exponential backoff with jitter for resilient message delivery.
 *
 * This function handles all Twilio API errors internally and returns a result
 * object rather than throwing. Errors are logged and returned in the status field.
 *
 * @param {string} formattedPhone - E.164 formatted phone number.
 * @param {string} message - The message body to send.
 * @param {string} messageType - Description for logging (e.g., "First Notice", "Thank You").
 * @param {string} customerName - Customer name for logging.
 * @param {Object} settings - Current settings object.
 * @returns {Object} Result object with:
 *   - success {boolean}: true if message was sent successfully
 *   - status {string}: Human-readable status message
 *   - color {string}: Hex color code for cell background
 */
function sendTwilioMessage_(formattedPhone, message, messageType, customerName, settings) {
  // Check for DRY RUN MODE
  if (settings.behavior.dryRunMode) {
    Logger.log(`[DRY RUN] Would send ${messageType} to ${customerName} at ${maskPhoneNumber_(formattedPhone)}`);
    return { success: true, status: `[DRY RUN] ${messageType} at ${new Date().toLocaleString()}`, color: settings.colors.dryRun };
  }

  const url = `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`;
  const options = {
    method: "post",
    payload: { To: formattedPhone, From: TWILIO_PHONE_NUMBER, Body: message },
    headers: { Authorization: "Basic " + Utilities.base64Encode(TWILIO_ACCOUNT_SID + ":" + TWILIO_AUTH_TOKEN) },
    muteHttpExceptions: true
  };

  let lastError = null;
  let lastStatusCode = 0;
  let lastErrorMsg = "";

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    try {
      const response = UrlFetchApp.fetch(url, options);
      const statusCode = response.getResponseCode();
      lastStatusCode = statusCode;

      // Success - message sent
      if (statusCode === 201) {
        if (attempt > 0) {
          Logger.log(`✓ ${messageType} sent to ${customerName} after ${attempt} retry(ies)`);
        } else {
          Logger.log(`✓ ${messageType} sent to ${customerName} at ${maskPhoneNumber_(formattedPhone)}`);
        }
        return { success: true, status: `${messageType} Sent: ${new Date().toLocaleString()}`, color: settings.colors.success };
      }

      // Parse error response
      let result;
      try {
        result = JSON.parse(response.getContentText());
      } catch (parseError) {
        result = { message: response.getContentText() || "Unknown error" };
      }

      lastErrorMsg = `Error ${result.code || statusCode}: ${result.message || "Unknown error"}`;

      // Check if this error is retryable
      if (isRetryableError_(statusCode, null) && attempt < MAX_ATTEMPTS - 1) {
        const delay = calculateBackoffDelay_(attempt);
        Logger.log(`⚠️ Retryable error (HTTP ${statusCode}) for ${customerName}. Retrying in ${delay}ms (attempt ${attempt + 1}/${MAX_ATTEMPTS - 1})...`);
        Utilities.sleep(delay);
        continue;
      }

      // Non-retryable error or max retries reached
      Logger.log(`✗ Failed to send ${messageType} to ${customerName}: ${lastErrorMsg}`);
      return { success: false, status: lastErrorMsg, color: settings.colors.error };

    } catch (error) {
      lastError = error;
      lastErrorMsg = `Error: ${error.message || error}`;

      // Check if this exception is retryable
      if (isRetryableError_(0, error) && attempt < MAX_ATTEMPTS - 1) {
        const delay = calculateBackoffDelay_(attempt);
        Logger.log(`⚠️ Retryable exception for ${customerName}: ${error.message}. Retrying in ${delay}ms (attempt ${attempt + 1}/${MAX_ATTEMPTS - 1})...`);
        Utilities.sleep(delay);
        continue;
      }

      // Non-retryable exception or max retries reached
      Logger.log(`✗ Exception sending ${messageType} to ${customerName}: ${lastErrorMsg}`);
      return { success: false, status: lastErrorMsg, color: settings.colors.error };
    }
  }

  // Should not reach here, but handle it gracefully
  const finalMsg = `Error: Max retries (${MAX_ATTEMPTS - 1}) exceeded. Last error: ${lastErrorMsg}`;
  Logger.log(`✗ ${finalMsg} for ${customerName}`);
  return { success: false, status: finalMsg, color: settings.colors.error };
}

/**
 * Sends the primary billing SMS message to a single customer via the Twilio API.
 *
 * @param {string} customerPhone - The customer's phone number (raw from sheet).
 * @param {string} customerName - The customer's name.
 * @param {number|string} balance - The amount owed (raw from sheet).
 * @param {number|string} numTiffins - The number of tiffins (raw from sheet).
 * @param {Date|string} dueDate - The due date or month (raw from sheet).
 * @param {string} [templateType="firstNotice"] - Template type: "firstNotice", "followUp", or "finalNotice".
 * @returns {Object} Result object with success, status, and color properties.
 */
function sendBill_(customerPhone, customerName, balance, numTiffins, dueDate, templateType) {
  const settings = getSettings();

  // Ensure credentials are loaded (silent check since calling functions should have validated already)
  if (!checkCredentials(true)) {
    Logger.log(`ERROR: Cannot send bill to ${customerName}. Twilio credentials not set.`);
    return { success: false, status: "Error: Twilio credentials not set", color: settings.colors.error };
  }

  const template = getBillTemplate(templateType || "firstNotice", settings);

  const formattedPhone = formatPhoneNumber(customerPhone);
  if (!formattedPhone) {
    const errorMsg = "Error: Invalid phone number format.";
    Logger.log(`✗ ${errorMsg} for ${customerName} (${customerPhone})`);
    return { success: false, status: errorMsg, color: settings.colors.error };
  }

  const templateData = buildBillTemplateData({
    customerName: customerName,
    formattedBalance: formatBalance(balance),
    numTiffins: numTiffins,
    month: getMonthFromValue(dueDate)
  }, settings);

  const message = processTemplate(template.message, templateData);
  return sendTwilioMessage_(formattedPhone, message, template.name, customerName, settings);
}

/**
 * Sends a thank-you SMS message to a customer after payment is received.
 *
 * @param {string} customerPhone - The customer's phone number (raw from sheet).
 * @param {string} customerName - The customer's name.
 * @param {string} orderId - The order ID for the payment.
 * @returns {Object} Result object with success, status, and color properties.
 */
function sendThankYouMessage_(customerPhone, customerName, orderId) {
  const settings = getSettings();

  if (!checkCredentials(true)) {
    Logger.log("ERROR: Cannot send 'Thank You' message. Twilio credentials not set.");
    return { success: false, status: "Thank You Error: Credentials not set", color: settings.colors.error };
  }

  const formattedPhone = formatPhoneNumber(customerPhone);
  if (!formattedPhone) {
    Logger.log(`✗ Invalid phone for 'Thank You' msg: ${maskPhoneNumber_(customerPhone)}`);
    return { success: false, status: "Thank You Error: Invalid Phone", color: settings.colors.error };
  }

  const templateData = buildThankYouTemplateData({ customerName, orderId }, settings);
  const message = processTemplate(settings.templates.thankYouMessage, templateData);
  return sendTwilioMessage_(formattedPhone, message, "Thank You", customerName, settings);
}

/**
 * Helper to mask phone numbers for logging privacy.
 * Shows only the last 4 digits.
 * @param {string} phone - The phone number.
 * @returns {string} Masked phone number (e.g., "***-***-1234").
 */
function maskPhoneNumber_(phone) {
  if (!phone) return "unknown";
  const s = String(phone);
  if (s.length < 5) return s;
  return "***-***-" + s.slice(-4);
}
