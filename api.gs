// ========================================
// WEB APP API HANDLERS
// Routes and processes API requests from the web interface
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
 *
 * @returns {Object} Result with customers array
 * @private
 */
function getCustomersForWeb() {
  try {
    const sheet = getTargetSheet_();
    const settings = getSettings();
    const cols = settings.columns;
    const headerRowIndex = settings.behavior.headerRowIndex;

    const data = sheet.getDataRange().getValues();
    if (data.length <= headerRowIndex) {
      return { success: true, data: [] };
    }

    // Build column map from headers
    const headers = data[headerRowIndex - 1];
    const colMap = {};
    headers.forEach((header, index) => {
      if (header) {
        colMap[String(header).trim()] = index;
      }
    });

    // Extract customer data
    const customers = [];
    for (let i = headerRowIndex; i < data.length; i++) {
      const row = data[i];
      const phoneCol = colMap[cols.phoneNumber];
      const nameCol = colMap[cols.customerName];
      const balanceCol = colMap[cols.balance];
      const tiffinsCol = colMap[cols.numTiffins];
      const dueDateCol = colMap[cols.dueDate];
      const statusCol = colMap[cols.messageStatus];
      const orderIdCol = colMap[cols.orderId];
      const paymentCol = colMap[cols.paymentStatus];

      // Skip rows without essential data
      if (!row[nameCol] && !row[phoneCol]) continue;

      customers.push({
        rowIndex: i + 1, // 1-based for sheet operations
        phone: row[phoneCol] || '',
        name: row[nameCol] || '',
        balance: row[balanceCol] || 0,
        formattedBalance: formatBalance(row[balanceCol]),
        numTiffins: row[tiffinsCol] || 0,
        dueDate: row[dueDateCol] || '',
        month: getMonthFromValue(row[dueDateCol]),
        messageStatus: row[statusCol] || '',
        orderId: row[orderIdCol] || '',
        paymentStatus: row[paymentCol] || ''
      });
    }

    return { success: true, data: customers };
  } catch (error) {
    Logger.log(`getCustomersForWeb_ error: ${error.message}`);
    return { success: false, error: error.message };
  }
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
 *
 * @param {Object} payload - Filter options (filter, dueDate, templateType)
 * @returns {Object} Result with sent/error counts
 * @private
 */
function sendBillsForWeb(payload) {
  try {
    // Ensure credentials are loaded
    if (!checkCredentials(true)) {
      return { success: false, error: 'Twilio credentials not configured' };
    }

    const filter = payload?.filter || 'unpaid'; // 'unpaid', 'all', 'byDate'
    const targetDate = payload?.dueDate || '';
    const templateType = payload?.templateType || 'firstNotice';

    const settings = getSettings();
    const cols = settings.columns;
    const sheet = getTargetSheet_();
    const data = sheet.getDataRange().getValues();

    // Build column map
    const headers = data[settings.behavior.headerRowIndex - 1];
    const colMap = {};
    headers.forEach((header, index) => {
      if (header) colMap[String(header).trim()] = index;
    });

    const phoneCol = colMap[cols.phoneNumber];
    const nameCol = colMap[cols.customerName];
    const balanceCol = colMap[cols.balance];
    const tiffinsCol = colMap[cols.numTiffins];
    const dueDateCol = colMap[cols.dueDate];
    const paymentCol = colMap[cols.paymentStatus];
    const statusCol = colMap[cols.messageStatus];

    // Filter rows to process
    const rowsToProcess = [];
    for (let i = settings.behavior.headerRowIndex; i < data.length; i++) {
      const row = data[i];
      const paymentStatus = String(row[paymentCol]).toLowerCase();
      const dueDate = row[dueDateCol];

      let shouldProcess = false;

      if (filter === 'unpaid' && paymentStatus === 'unpaid') {
        shouldProcess = true;
      } else if (filter === 'all') {
        shouldProcess = true;
      } else if (filter === 'byDate' && paymentStatus === 'unpaid') {
        const dueDateStr = String(dueDate).toLowerCase();
        const monthFromDate = getMonthFromValue(dueDate).toLowerCase();
        const targetLower = targetDate.toLowerCase();
        if (dueDateStr.includes(targetLower) || monthFromDate.includes(targetLower)) {
          shouldProcess = true;
        }
      }

      if (shouldProcess) {
        rowsToProcess.push({
          data: row,
          row: i + 1,
          phone: row[phoneCol],
          name: row[nameCol],
          balance: row[balanceCol],
          tiffins: row[tiffinsCol],
          dueDate: dueDate
        });
      }
    }

    // Process rows (respecting batch size)
    const batchSize = Math.min(rowsToProcess.length, settings.behavior.batchSize);
    let sentCount = 0;
    let errorCount = 0;
    const errorDetails = [];
    const statusUpdates = [];

    for (let i = 0; i < batchSize; i++) {
      const item = rowsToProcess[i];

      if (!item.phone || !item.name || !item.balance || !item.tiffins) {
        errorCount++;
        errorDetails.push({ name: item.name || `Row ${item.row}`, error: 'Missing required data' });
        statusUpdates.push({ row: item.row, status: 'Error: Missing data', color: settings.colors.error });
        continue;
      }

      const result = sendBill_(item.phone, item.name, item.balance, item.tiffins, item.dueDate, templateType);
      statusUpdates.push({ row: item.row, status: result.status, color: result.color });

      if (result.success) {
        sentCount++;
      } else {
        errorCount++;
        errorDetails.push({ name: item.name, error: result.status });
      }

      // Delay between messages
      if (i < batchSize - 1) {
        Utilities.sleep(settings.behavior.messageDelayMs);
      }
    }

    // Apply status updates to sheet
    applyStatusUpdates(sheet, statusUpdates, statusCol, data.length);

    return {
      success: true,
      data: {
        sentCount,
        errorCount,
        skippedCount: rowsToProcess.length - batchSize,
        totalProcessed: batchSize,
        errorDetails: errorDetails.slice(0, 10), // Limit error details
        dryRunMode: settings.behavior.dryRunMode
      }
    };
  } catch (error) {
    Logger.log(`sendBillsForWeb_ error: ${error.message}`);
    return { success: false, error: error.message };
  }
}

/**
 * Sends a bill to a single customer by row index or order ID.
 *
 * @param {Object} payload - { rowIndex, orderId, templateType }
 * @returns {Object} Result
 * @private
 */
function sendSingleBillForWeb(payload) {
  try {
    if (!checkCredentials(true)) {
      return { success: false, error: 'Twilio credentials not configured' };
    }

    const settings = getSettings();
    const cols = settings.columns;
    const sheet = getTargetSheet_();
    const data = sheet.getDataRange().getValues();
    const templateType = payload?.templateType || 'firstNotice';

    // Build column map
    const headers = data[settings.behavior.headerRowIndex - 1];
    const colMap = {};
    headers.forEach((header, index) => {
      if (header) colMap[String(header).trim()] = index;
    });

    let targetRow = -1;

    // Find by row index
    if (payload?.rowIndex) {
      targetRow = payload.rowIndex - 1; // Convert to 0-based
    }
    // Find by order ID
    else if (payload?.orderId) {
      const orderIdCol = colMap[cols.orderId];
      for (let i = settings.behavior.headerRowIndex; i < data.length; i++) {
        if (String(data[i][orderIdCol]).trim() === payload.orderId) {
          targetRow = i;
          break;
        }
      }
    }

    if (targetRow < settings.behavior.headerRowIndex || targetRow >= data.length) {
      return { success: false, error: 'Customer not found' };
    }

    const row = data[targetRow];
    const phone = row[colMap[cols.phoneNumber]];
    const name = row[colMap[cols.customerName]];
    const balance = row[colMap[cols.balance]];
    const tiffins = row[colMap[cols.numTiffins]];
    const dueDate = row[colMap[cols.dueDate]];
    const statusCol = colMap[cols.messageStatus];

    if (!phone || !name || !balance || !tiffins) {
      return { success: false, error: 'Customer is missing required data (phone, name, balance, or tiffins)' };
    }

    const result = sendBill_(phone, name, balance, tiffins, dueDate, templateType);

    // Update status in sheet
    const statusRange = sheet.getRange(targetRow + 1, statusCol + 1);
    statusRange.setValue(result.status);
    statusRange.setBackground(result.color);

    return {
      success: result.success,
      data: {
        customerName: name,
        status: result.status,
        dryRunMode: settings.behavior.dryRunMode
      },
      error: result.success ? null : result.status
    };
  } catch (error) {
    Logger.log(`sendSingleBillForWeb_ error: ${error.message}`);
    return { success: false, error: error.message };
  }
}

/**
 * Clears all message statuses in the spreadsheet.
 *
 * @returns {Object} Result
 * @private
 */
function clearAllStatusesForWeb() {
  try {
    const settings = getSettings();
    const cols = settings.columns;
    const sheet = getTargetSheet_();
    const data = sheet.getDataRange().getValues();

    // Build column map
    const headers = data[settings.behavior.headerRowIndex - 1];
    const colMap = {};
    headers.forEach((header, index) => {
      if (header) colMap[String(header).trim()] = index;
    });

    const statusColIndex = colMap[cols.messageStatus];
    if (statusColIndex === undefined) {
      return { success: false, error: `Column "${cols.messageStatus}" not found` };
    }

    const rowCount = data.length - settings.behavior.headerRowIndex;
    if (rowCount > 0) {
      const startRow = settings.behavior.headerRowIndex + 1;
      const statusCol = statusColIndex + 1;
      const clearValues = Array(rowCount).fill(['']);
      const clearBackgrounds = Array(rowCount).fill([null]);

      const range = sheet.getRange(startRow, statusCol, rowCount, 1);
      range.setValues(clearValues);
      range.setBackgrounds(clearBackgrounds);
    }

    return { success: true, data: { clearedCount: rowCount } };
  } catch (error) {
    Logger.log(`clearAllStatusesForWeb_ error: ${error.message}`);
    return { success: false, error: error.message };
  }
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
    const props = PropertiesService.getScriptProperties();

    if (payload?.accountSid) {
      props.setProperty('TWILIO_ACCOUNT_SID', payload.accountSid.trim());
    }
    if (payload?.authToken) {
      props.setProperty('TWILIO_AUTH_TOKEN', payload.authToken.trim());
    }
    if (payload?.twilioPhone) {
      props.setProperty('TWILIO_PHONE_NUMBER', payload.twilioPhone.trim());
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
    const props = PropertiesService.getScriptProperties();
    const sid = props.getProperty('TWILIO_ACCOUNT_SID');
    const token = props.getProperty('TWILIO_AUTH_TOKEN');
    const phone = props.getProperty('TWILIO_PHONE_NUMBER');

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
