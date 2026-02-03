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
 * @returns {boolean} True if all credentials are set, false otherwise.
 */
function checkCredentials() {
  TWILIO_ACCOUNT_SID = userProperties.getProperty("TWILIO_ACCOUNT_SID");
  TWILIO_AUTH_TOKEN = userProperties.getProperty("TWILIO_AUTH_TOKEN");
  TWILIO_PHONE_NUMBER = userProperties.getProperty("TWILIO_PHONE_NUMBER");

  if (!TWILIO_ACCOUNT_SID || TWILIO_ACCOUNT_SID === "placeholder") {
    ui.alert("Error: Twilio Account SID is not set. Please set it via the 'Credentials' menu.");
    return false;
  }
  if (!TWILIO_AUTH_TOKEN || TWILIO_AUTH_TOKEN === "placeholder") {
    ui.alert("Error: Twilio Auth Token is not set. Please set it via the 'Credentials' menu.");
    return false;
  }
  if (!TWILIO_PHONE_NUMBER || TWILIO_PHONE_NUMBER === "placeholder") {
    ui.alert("Error: Twilio Phone Number is not set. Please set it via the 'Credentials' menu.");
    return false;
  }
  
  return true; // All credentials are set
}


/**
 * Sends the primary billing SMS message to a single customer via the Twilio API.
 * This is the main function for sending a bill.
 *
 * @param {string} customerPhone - The customer's phone number (raw from sheet).
 * @param {string} customerName - The customer's name.
 * @param {number|string} balance - The amount owed (raw from sheet).
 * @param {number|string} numTiffins - The number of tiffins (raw from sheet).
 * @param {Date|string} dueDate - The due date or month (raw from sheet).
 * @param {string} [templateType="firstNotice"] - The template type to use: "firstNotice", "followUp", or "finalNotice".
 * @returns {Object} Result object with success, status, and color properties.
 */
function sendBill_(customerPhone, customerName, balance, numTiffins, dueDate, templateType) {
  // Get current settings for dynamic configuration
  const settings = getSettings();

  // Default to firstNotice if no template type specified
  templateType = templateType || "firstNotice";

  // Get the appropriate template
  const template = getBillTemplate(templateType, settings);

  // 1. Format and validate phone number
  const formattedPhone = formatPhoneNumber(customerPhone);
  if (!formattedPhone) {
    const errorMsg = "Error: Invalid phone number format.";
    Logger.log(`✗ ${errorMsg} for ${customerName} (${customerPhone})`);
    return { success: false, status: errorMsg, color: settings.colors.error };
  }

  // 2. Format balance and month
  const formattedBalance = formatBalance(balance);
  const monthName = getMonthFromValue(dueDate);

  // 3. Build template data and construct the SMS message body
  const templateData = {
    businessName: settings.business.name,
    etransferEmail: settings.business.etransferEmail,
    phoneNumber: settings.business.phoneNumber,
    whatsappLink: settings.business.whatsappLink,
    customerName: customerName,
    balance: formattedBalance,
    numTiffins: numTiffins,
    month: monthName
  };
  const message = processTemplate(template.message, templateData);

  // 4. Check for DRY RUN MODE
  if (settings.behavior.dryRunMode) {
    Logger.log(`[DRY RUN] Would send ${template.name} to ${customerName} at ${formattedPhone}`);
    return { success: true, status: `[DRY RUN] ${template.name} at ${new Date().toLocaleString()}`, color: settings.colors.dryRun };
  }

  // 5. Prepare Twilio API request
  const url = `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`;
  const payload = {
    "To": formattedPhone,
    "From": TWILIO_PHONE_NUMBER,
    "Body": message
  };
  const options = {
    "method": "post",
    "payload": payload,
    "headers": {
      "Authorization": "Basic " + Utilities.base64Encode(TWILIO_ACCOUNT_SID + ":" + TWILIO_AUTH_TOKEN)
    },
    "muteHttpExceptions": true
  };

  // 6. Send the message and handle response
  try {
    const response = UrlFetchApp.fetch(url, options);
    const result = JSON.parse(response.getContentText());

    if (response.getResponseCode() === 201) {
      // Success (HTTP 201 Created)
      const timestamp = new Date().toLocaleString();
      Logger.log(`✓ ${template.name} sent to ${customerName} at ${formattedPhone}`);
      return { success: true, status: `${template.name} Sent: ${timestamp}`, color: settings.colors.success };
    } else {
      // Failed (Twilio returned an error)
      const errorMsg = `Error ${result.code || 'API'}: ${result.message || 'Unknown error'}`;
      Logger.log(`✗ Failed to send ${template.name} to ${customerName}: ${errorMsg}`);
      return { success: false, status: errorMsg, color: settings.colors.error };
    }
  } catch (error) {
    // Exception (e.g., network error, Twilio offline)
    const errorMsg = `Error: ${error.message || error}`;
    Logger.log(`✗ Exception sending ${template.name} to ${customerName}: ${errorMsg}`);
    return { success: false, status: errorMsg, color: settings.colors.error };
  }
}

function sendThankYouMessage_(customerPhone, customerName, orderId) {
  // Get current settings for dynamic configuration
  const settings = getSettings();

  // Check credentials silently
  if (!checkCredentials()) {
    Logger.log("ERROR: Cannot send 'Thank You' message. Twilio credentials not set.");
    return { success: false, status: "Thank You Error: Credentials not set", color: settings.colors.error };
  }

  // Format and validate phone
  const formattedPhone = formatPhoneNumber(customerPhone);
  if (!formattedPhone) {
    Logger.log(`✗ Invalid phone for 'Thank You' msg: ${customerPhone}`);
    return { success: false, status: "Thank You Error: Invalid Phone", color: settings.colors.error };
  }

  // Build template data and construct the message
  const templateData = {
    businessName: settings.business.name,
    customerName: customerName,
    orderId: orderId
  };
  const message = processTemplate(settings.templates.thankYouMessage, templateData);

  // Check for DRY RUN MODE
  if (settings.behavior.dryRunMode) {
    Logger.log(`[DRY RUN] Would send 'Thank You' to ${customerName}`);
    return { success: true, status: `[DRY RUN] Thank You at ${new Date().toLocaleString()}`, color: settings.colors.dryRun };
  }

  // Prepare and send the Twilio request
  const url = `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`;
  const payload = { "To": formattedPhone, "From": TWILIO_PHONE_NUMBER, "Body": message };
  const options = {
    "method": "post",
    "payload": payload,
    "headers": { "Authorization": "Basic " + Utilities.base64Encode(TWILIO_ACCOUNT_SID + ":" + TWILIO_AUTH_TOKEN) },
    "muteHttpExceptions": true
  };

  try {
    const response = UrlFetchApp.fetch(url, options);
    const result = JSON.parse(response.getContentText());

    if (response.getResponseCode() === 201) {
      Logger.log(`✓ 'Thank You' sent to ${customerName}`);
      return { success: true, status: `Thank You Sent: ${new Date().toLocaleString()}`, color: settings.colors.success };
    } else {
      const errorMsg = `Thank You Error: ${result.code || 'API'}: ${result.message || 'Unknown'}`;
      Logger.log(`✗ Failed to send 'Thank You' to ${customerName}: ${errorMsg}`);
      return { success: false, status: errorMsg, color: settings.colors.error };
    }
  } catch (error) {
    const errorMsg = `Thank You Error: ${error.message || error}`;
    Logger.log(`✗ Exception sending 'Thank You' to ${customerName}: ${errorMsg}`);
    return { success: false, status: errorMsg, color: settings.colors.error };
  }
}
