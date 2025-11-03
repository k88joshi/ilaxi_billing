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
 * @param {number} row - The 1-based row number in the spreadsheet (for updating status).
 * @param {number} statusColIndex - The 0-based column index for the "Message Status" column.
 * @returns {boolean} True if the message was successfully queued, false otherwise.
 */
function sendBill_(customerPhone, customerName, balance, numTiffins, dueDate) {
  // 1. Format and validate phone number
  const formattedPhone = formatPhoneNumber(customerPhone);
  if (!formattedPhone) {
    const errorMsg = "Error: Invalid phone number format.";
    Logger.log(`✗ ${errorMsg} for ${customerName} (${customerPhone})`);
    return { success: false, status: errorMsg, color: "#f4cccc" }; // Light red
  }

  // 2. Format balance and month
  const formattedBalance = formatBalance(balance);
  const monthName = getMonthFromValue(dueDate);

  // 3. Construct the SMS message body
  const message = `Ilaxi's Gujarati Tiffin - Monthly Bill\n\nPlease see below your total bill pending for the month of ${monthName}:\n\nTotal - ${formattedBalance}\nTiffins - ${numTiffins}\n\nPlease e-transfer the amount to ${ETRANSFER_EMAIL} in the next 1-2 days. During the e-transfer, please include: your full name, phone number and month of payment to avoid any errors. If you have any questions, please call ${SCREENSHOT_PHONE}.\n\nThank you,\nIlaxi Gujarati Tiffin`;

  // 4. Check for DRY RUN MODE
  if (DRY_RUN_MODE) {
    Logger.log(`[DRY RUN] Would send bill to ${customerName} at ${formattedPhone}`);
    return { success: true, status: `[DRY RUN] Bill at ${new Date().toLocaleString()}`, color: "#fff2cc" }; // Light yellow
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
      Logger.log(`✓ Bill sent to ${customerName} at ${formattedPhone}`);
      return { success: true, status: `Sent: ${timestamp}`, color: "#d9ead3" }; // Light green
    } else {
      // Failed (Twilio returned an error)
      const errorMsg = `Error ${result.code || 'API'}: ${result.message || 'Unknown error'}`;
      Logger.log(`✗ Failed to send to ${customerName}: ${errorMsg}`);
      return { success: false, status: errorMsg, color: "#f4cccc" }; // Light red
    }
  } catch (error) {
    // Exception (e.g., network error, Twilio offline)
    const errorMsg = `Error: ${error.message || error}`;
    Logger.log(`✗ Exception sending to ${customerName}: ${errorMsg}`);
    return { success: false, status: errorMsg, color: "#f4cccc" }; // Light red
  }
}

function sendThankYouMessage_(customerPhone, customerName, orderId) {
  // Check credentials silently
  if (!checkCredentials()) {
    Logger.log("ERROR: Cannot send 'Thank You' message. Twilio credentials not set.");
    return { success: false, status: "Thank You Error: Credentials not set", color: "#f4cccc" };
  }

  // Format and validate phone
  const formattedPhone = formatPhoneNumber(customerPhone);
  if (!formattedPhone) {
    Logger.log(`✗ Invalid phone for 'Thank You' msg: ${customerPhone}`);
    return { success: false, status: "Thank You Error: Invalid Phone", color: "#f4cccc" };
  }

  // Construct the message
  const message = `Hello ${customerName},\n\nThank you for your payment for Order ${orderId}. We have marked your bill as PAID.\n\nWe appreciate your business!\n- ${BUSINESS_NAME}`;

  // Check for DRY RUN MODE
  if (DRY_RUN_MODE) {
    Logger.log(`[DRY RUN] Would send 'Thank You' to ${customerName}`);
    return { success: true, status: `[DRY RUN] Thank You at ${new Date().toLocaleString()}`, color: "#fff2cc" };
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
      return { success: true, status: `Thank You Sent: ${new Date().toLocaleString()}`, color: "#d9ead3" };
    } else {
      const errorMsg = `Thank You Error: ${result.code || 'API'}: ${result.message || 'Unknown'}`;
      Logger.log(`✗ Failed to send 'Thank You' to ${customerName}: ${errorMsg}`);
      return { success: false, status: errorMsg, color: "#f4cccc" };
    }
  } catch (error) {
    const errorMsg = `Thank You Error: ${error.message || error}`;
    Logger.log(`✗ Exception sending 'Thank You' to ${customerName}: ${errorMsg}`);
    return { success: false, status: errorMsg, color: "#f4cccc" };
  }
}
