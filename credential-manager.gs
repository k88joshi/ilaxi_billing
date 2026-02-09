// ========================================
// CREDENTIAL MANAGEMENT FUNCTIONS
// ========================================

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

/**
 * Gets masked credential status for the settings dialog.
 * Returns masked values so the UI can show what's configured without exposing secrets.
 *
 * @returns {Object} Credential status with masked values
 * @private
 */
function getCredentialStatusForSettings_() {
  const sid = scriptProperties.getProperty('TWILIO_ACCOUNT_SID');
  const token = scriptProperties.getProperty('TWILIO_AUTH_TOKEN');
  const phone = scriptProperties.getProperty('TWILIO_PHONE_NUMBER');
  return {
    hasAccountSid: !!sid && sid !== 'placeholder',
    hasAuthToken: !!token && token !== 'placeholder',
    hasPhoneNumber: !!phone && phone !== 'placeholder',
    maskedSid: sid && sid !== 'placeholder' ? sid.substring(0, 6) + '...' + sid.substring(sid.length - 4) : '',
    maskedPhone: phone && phone !== 'placeholder' ? '***' + phone.slice(-4) : ''
  };
}

/**
 * Saves Twilio credentials from the settings UI.
 * Only saves fields that contain actual new values (not masked placeholders).
 *
 * @param {Object} creds - Object with accountSid, authToken, twilioPhone
 * @returns {Object} Result with success boolean
 */
function saveTwilioCredentialsFromUI(creds) {
  if (!creds || typeof creds !== 'object') {
    return { success: false, error: 'Invalid credentials data' };
  }
  try {
    const saved = [];
    if (creds.accountSid) {
      scriptProperties.setProperty('TWILIO_ACCOUNT_SID', creds.accountSid.trim());
      saved.push('Account SID');
    }
    if (creds.authToken) {
      scriptProperties.setProperty('TWILIO_AUTH_TOKEN', creds.authToken.trim());
      saved.push('Auth Token');
    }
    if (creds.twilioPhone) {
      scriptProperties.setProperty('TWILIO_PHONE_NUMBER', creds.twilioPhone.trim());
      saved.push('Phone Number');
    }
    if (saved.length > 0) {
      logEvent_('credentials', 'Save credentials', 'Saved: ' + saved.join(', '), true, getCurrentUserEmail_());
    }
    return { success: true };
  } catch (e) {
    Logger.log('saveTwilioCredentialsFromUI error: ' + e.message);
    logEvent_('credentials', 'Save credentials', e.message, false, getCurrentUserEmail_());
    return { success: false, error: e.message };
  }
}

/**
 * Checks if this is a first-time setup (no credentials and no setup completed flag).
 *
 * @returns {Object} Object with isFirstTime boolean
 */
function isFirstTimeSetup() {
  const setupCompleted = scriptProperties.getProperty("SETUP_COMPLETED");
  const hasAccountSid = scriptProperties.getProperty("TWILIO_ACCOUNT_SID");

  return {
    isFirstTime: !setupCompleted && !hasAccountSid
  };
}

/**
 * Marks the setup wizard as skipped so it doesn't show again.
 */
function markSetupSkipped() {
  scriptProperties.setProperty("SETUP_COMPLETED", "skipped");
  logEvent_('system', 'Setup wizard skipped', '', true, getCurrentUserEmail_());
}

/**
 * Tests Twilio credentials by calling the Twilio API account lookup endpoint.
 * This verifies credentials without sending an SMS.
 *
 * @param {string} accountSid - Twilio Account SID
 * @param {string} authToken - Twilio Auth Token
 * @param {string} twilioPhone - Twilio phone number (optional, for validation)
 * @returns {Object} Result with success boolean, accountName, and error details
 */
function testTwilioCredentials(accountSid, authToken, twilioPhone) {
  // Input validation
  if (!accountSid || typeof accountSid !== "string") {
    return { success: false, error: "Account SID is required", errorCode: "INVALID_CREDENTIALS" };
  }
  if (!authToken || typeof authToken !== "string") {
    return { success: false, error: "Auth Token is required", errorCode: "INVALID_CREDENTIALS" };
  }

  // Validate Account SID format
  if (!/^AC[a-f0-9]{32}$/i.test(accountSid)) {
    return {
      success: false,
      error: "Account SID format is invalid. It should start with 'AC' and be 34 characters.",
      errorCode: "INVALID_CREDENTIALS"
    };
  }

  try {
    const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}.json`;
    const options = {
      method: "get",
      headers: {
        "Authorization": "Basic " + Utilities.base64Encode(accountSid + ":" + authToken)
      },
      muteHttpExceptions: true
    };

    const response = UrlFetchApp.fetch(url, options);
    const responseCode = response.getResponseCode();

    if (responseCode === 200) {
      const accountInfo = JSON.parse(response.getContentText());
      return {
        success: true,
        accountName: accountInfo.friendly_name || "Twilio Account",
        accountStatus: accountInfo.status
      };
    } else if (responseCode === 401) {
      return {
        success: false,
        error: "Authentication failed. Please check your Account SID and Auth Token.",
        errorCode: "AUTH_FAILED"
      };
    } else if (responseCode === 404) {
      return {
        success: false,
        error: "Account not found. Please verify your Account SID.",
        errorCode: "INVALID_CREDENTIALS"
      };
    } else {
      const errorData = JSON.parse(response.getContentText());
      return {
        success: false,
        error: errorData.message || `Request failed with status ${responseCode}`,
        errorCode: "UNKNOWN"
      };
    }
  } catch (e) {
    Logger.log(`testTwilioCredentials error: ${e.message}`);
    return {
      success: false,
      error: `Connection error: ${e.message}`,
      errorCode: "UNKNOWN"
    };
  }
}

/**
 * Tests Twilio credentials using credentials already stored in UserProperties.
 * Called from the Settings UI to verify existing credentials.
 *
 * @returns {Object} Result with success boolean and details
 */
function testTwilioCredentialsFromSettings() {
  const accountSid = scriptProperties.getProperty("TWILIO_ACCOUNT_SID");
  const authToken = scriptProperties.getProperty("TWILIO_AUTH_TOKEN");
  const twilioPhone = scriptProperties.getProperty("TWILIO_PHONE_NUMBER");

  if (!accountSid || !authToken) {
    return {
      success: false,
      error: "Twilio credentials not set. Use the Credentials menu to configure them.",
      errorCode: "INVALID_CREDENTIALS"
    };
  }

  const result = testTwilioCredentials(accountSid, authToken, twilioPhone);
  logEvent_('credentials', 'Test credentials', result.success ? 'Passed' : (result.error || 'Failed'), result.success, getCurrentUserEmail_());
  return result;
}

/**
 * Completes the first-time setup wizard by saving credentials and settings.
 *
 * @param {Object} setupData - Data collected from the wizard
 * @returns {Object} Result with success boolean and optional error
 */
function completeFirstTimeSetup(setupData) {
  // Validate input
  if (!setupData || typeof setupData !== "object") {
    return { success: false, error: "Invalid setup data" };
  }

  try {
    // Save Twilio credentials
    if (setupData.credentials) {
      if (setupData.credentials.accountSid) {
        scriptProperties.setProperty("TWILIO_ACCOUNT_SID", setupData.credentials.accountSid);
      }
      if (setupData.credentials.authToken) {
        scriptProperties.setProperty("TWILIO_AUTH_TOKEN", setupData.credentials.authToken);
      }
      if (setupData.credentials.twilioPhone) {
        scriptProperties.setProperty("TWILIO_PHONE_NUMBER", setupData.credentials.twilioPhone);
      }
    }

    // Get current settings and update with wizard data
    const settings = getSettings();

    // Update business info
    if (setupData.business) {
      settings.business.name = setupData.business.name || settings.business.name;
      settings.business.etransferEmail = setupData.business.etransferEmail || settings.business.etransferEmail;
      settings.business.phoneNumber = setupData.business.phoneNumber || settings.business.phoneNumber;
      settings.business.whatsappLink = setupData.business.whatsappLink || settings.business.whatsappLink;
    }

    // Update column mappings
    if (setupData.columns) {
      Object.keys(setupData.columns).forEach(key => {
        if (setupData.columns[key] && settings.columns[key] !== undefined) {
          settings.columns[key] = setupData.columns[key];
        }
      });
    }

    // Save settings
    const saveResult = saveSettings(settings);
    if (!saveResult.success) {
      return { success: false, error: saveResult.error };
    }

    // Mark setup as completed
    scriptProperties.setProperty("SETUP_COMPLETED", new Date().toISOString());

    const parts = [
      setupData.credentials ? 'credentials' : '',
      setupData.business ? 'business info' : '',
      setupData.columns ? 'column mappings' : ''
    ].filter(Boolean).join(', ');
    Logger.log("First-time setup completed successfully");
    logEvent_('system', 'First-time setup', parts, true, getCurrentUserEmail_());
    return { success: true };
  } catch (e) {
    Logger.log(`completeFirstTimeSetup error: ${e.message}`);
    logEvent_('system', 'First-time setup', e.message, false, getCurrentUserEmail_());
    return { success: false, error: e.message };
  }
}
