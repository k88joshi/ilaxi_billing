// ========================================
// WEB APP API HANDLERS
// Thin wrappers that delegate to billing-core.gs.
// PARITY: Each handler here should have a corresponding add-on wrapper in spreadsheet.gs.
// See the parity table in CLAUDE.md.
// ========================================

/**
 * Routes API requests to appropriate handlers.
 * Authorization is handled by doPost before this function is called.
 *
 * @param {string} action - The API action to perform
 * @param {Object} payload - Action-specific data
 * @returns {Object} Result object with success boolean and data/error
 * @private
 */
function handleApiRequest_(action, payload) {
  try {
    switch (action) {
      // Customer data
      case 'getCustomers':
        return getCustomersForWeb();

      case 'getCustomerStats':
        return getCustomerStatsForWeb();

      // Billing actions
      case 'sendBills':
        return sendBillsForWeb(payload);

      case 'sendSingleBill':
        return sendSingleBillForWeb(payload);

      case 'clearStatuses':
        return clearAllStatusesForWeb();

      // Settings
      case 'getSettings':
        return { success: true, data: getSettingsForUI() };

      case 'saveSettings':
        return saveSettingsFromUI(payload);

      case 'resetSettings':
        return resetToDefaults();

      case 'importSettings':
        return importSettings(payload);

      // Credentials
      case 'testCredentials':
        return testTwilioCredentialsFromSettings();

      case 'saveCredentials':
        return saveCredentialsForWeb(payload);

      case 'getCredentialStatus':
        return getCredentialStatusForWeb();

      // Template preview
      case 'previewTemplate':
        return { success: true, preview: previewTemplate(payload?.template) };

      // Column detection
      case 'autoDetectColumns':
        return { success: true, data: autoDetectColumns() };

      // Spreadsheet link
      case 'getSpreadsheetUrl':
        return { success: true, data: getTargetSpreadsheet_().getUrl() };

      default:
        return { success: false, error: `Unknown action: ${action}`, errorCode: 'UNKNOWN_ACTION' };
    }
  } catch (error) {
    Logger.log(`API Error [${action}]: ${error.message}`);
    return { success: false, error: error.message, errorCode: 'SERVER_ERROR' };
  }
}

// ========================================
// CUSTOMER DATA HANDLERS
// ========================================

/**
 * Retrieves all customer data from the spreadsheet for web display.
 * Delegates to getCustomersCore_ with date serialization enabled.
 *
 * @returns {Object} Result with customers array
 * @private
 */
function getCustomersForWeb() {
  return getCustomersCore_({ serializeDates: true });
}

/**
 * Gets summary statistics about customers.
 *
 * @returns {Object} Stats including counts and totals
 * @private
 */
function getCustomerStatsForWeb() {
  try {
    const result = getCustomersForWeb();
    if (!result.success) return result;

    const customers = result.data;
    const stats = {
      total: customers.length,
      unpaid: 0,
      paid: 0,
      totalBalance: 0,
      unpaidBalance: 0,
      messagesSent: 0,
      messagesError: 0
    };

    customers.forEach(c => {
      const paymentStatus = String(c.paymentStatus).toLowerCase();
      const balance = parseFloat(String(c.balance).replace(/[^0-9.-]/g, '')) || 0;

      if (paymentStatus === 'paid') {
        stats.paid++;
      } else if (paymentStatus === 'unpaid') {
        stats.unpaid++;
        stats.unpaidBalance += balance;
      }

      stats.totalBalance += balance;

      const msgStatus = String(c.messageStatus).toLowerCase();
      if (msgStatus.includes('sent')) {
        stats.messagesSent++;
      } else if (msgStatus.includes('error')) {
        stats.messagesError++;
      }
    });

    return { success: true, data: stats };
  } catch (error) {
    Logger.log(`getCustomerStatsForWeb_ error: ${error.message}`);
    return { success: false, error: error.message };
  }
}

// ========================================
// BILLING ACTION HANDLERS
// ========================================

/**
 * Sends bills to customers based on filter criteria.
 * Delegates to sendBillsCore_ with payload parameters.
 *
 * @param {Object} payload - Filter options (filter, dueDate, templateType)
 * @returns {Object} Result with sent/error counts
 * @private
 */
function sendBillsForWeb(payload) {
  return sendBillsCore_({
    filter: payload?.filter,
    dueDate: payload?.dueDate,
    templateType: payload?.templateType,
    dryRunMode: payload?.dryRunMode
  });
}

/**
 * Sends a bill to a single customer by row index or order ID.
 * Delegates to sendSingleBillCore_ with payload parameters.
 *
 * @param {Object} payload - { rowIndex, orderId, templateType }
 * @returns {Object} Result
 * @private
 */
function sendSingleBillForWeb(payload) {
  return sendSingleBillCore_({
    rowIndex: payload?.rowIndex,
    orderId: payload?.orderId,
    templateType: payload?.templateType,
    dryRunMode: payload?.dryRunMode
  });
}

/**
 * Clears all message statuses in the spreadsheet.
 * Delegates to clearAllStatusesCore_.
 *
 * @returns {Object} Result
 * @private
 */
function clearAllStatusesForWeb() {
  return clearAllStatusesCore_();
}

// ========================================
// CREDENTIAL HANDLERS
// ========================================

/**
 * Saves Twilio credentials from the web interface.
 *
 * @param {Object} payload - { accountSid, authToken, twilioPhone }
 * @returns {Object} Result
 * @private
 */
function saveCredentialsForWeb(payload) {
  try {
    if (payload?.accountSid) {
      scriptProperties.setProperty('TWILIO_ACCOUNT_SID', payload.accountSid.trim());
    }
    if (payload?.authToken) {
      scriptProperties.setProperty('TWILIO_AUTH_TOKEN', payload.authToken.trim());
    }
    if (payload?.twilioPhone) {
      scriptProperties.setProperty('TWILIO_PHONE_NUMBER', payload.twilioPhone.trim());
    }

    Logger.log('Twilio credentials saved from web interface');
    return { success: true };
  } catch (error) {
    Logger.log(`saveCredentialsForWeb_ error: ${error.message}`);
    return { success: false, error: error.message };
  }
}

/**
 * Gets the current credential status (set/not set, masked values).
 *
 * @returns {Object} Credential status
 * @private
 */
function getCredentialStatusForWeb() {
  try {
    const sid = scriptProperties.getProperty('TWILIO_ACCOUNT_SID');
    const token = scriptProperties.getProperty('TWILIO_AUTH_TOKEN');
    const phone = scriptProperties.getProperty('TWILIO_PHONE_NUMBER');

    return {
      success: true,
      data: {
        hasAccountSid: !!sid && sid !== 'placeholder',
        hasAuthToken: !!token && token !== 'placeholder',
        hasPhoneNumber: !!phone && phone !== 'placeholder',
        maskedSid: sid ? `${sid.substring(0, 6)}...${sid.substring(sid.length - 4)}` : null,
        maskedPhone: phone ? `***${phone.slice(-4)}` : null,
        allSet: !!sid && !!token && !!phone && sid !== 'placeholder' && token !== 'placeholder' && phone !== 'placeholder'
      }
    };
  } catch (error) {
    Logger.log(`getCredentialStatusForWeb_ error: ${error.message}`);
    return { success: false, error: error.message };
  }
}

/**
 * Wraps autoDetectColumns for web app usage.
 * Returns the standard {success, data} format expected by the webapp.
 *
 * @returns {Object} Result with success boolean and data containing headers/detections
 */
function autoDetectColumnsForWeb() {
  try {
    const result = autoDetectColumns();
    return { success: true, data: result };
  } catch (error) {
    Logger.log(`autoDetectColumnsForWeb error: ${error.message}`);
    return { success: false, error: error.message };
  }
}
