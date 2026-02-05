// ========================================
// BILLING CORE — Shared Business Logic
// Mode-independent functions called by both add-on (spreadsheet.gs) and web app (api.gs).
//
// PARITY: When adding/changing a core function, update BOTH callers:
//   - Add-on wrapper: spreadsheet.gs (UI prompts + core call)
//   - Web wrapper:    api.gs         (payload extract + core call)
// Also update the parity table in CLAUDE.md.
// ========================================

/**
 * Retrieves all customer data from the spreadsheet.
 *
 * @param {Object} [options] - Options
 * @param {boolean} [options.serializeDates=false] - Convert Date objects to ISO strings
 *   (required for google.script.run serialization in web app mode)
 * @returns {Object} Result with {success, data: customers[], error}
 */
function getCustomersCore_(options) {
  try {
    const serializeDates = options?.serializeDates || false;
    const sheet = getTargetSheet_();
    const settings = getSettings();
    const cols = settings.columns;
    const headerRowIndex = settings.behavior.headerRowIndex;

    const data = sheet.getDataRange().getValues();
    if (data.length <= headerRowIndex) {
      return { success: true, data: [] };
    }

    const colMap = buildColumnMap_(data[headerRowIndex - 1]);

    const customers = [];
    for (let i = headerRowIndex; i < data.length; i++) {
      const row = data[i];
      const nameCol = colMap[cols.customerName];
      const phoneCol = colMap[cols.phoneNumber];

      if (!row[nameCol] && !row[phoneCol]) continue;

      const dueDateRaw = row[colMap[cols.dueDate]];
      const dueDateValue = serializeDates && dueDateRaw instanceof Date
        ? dueDateRaw.toISOString()
        : (dueDateRaw ? String(dueDateRaw) : '');

      customers.push({
        rowIndex: i + 1,
        phone: String(row[phoneCol] || ''),
        name: String(row[nameCol] || ''),
        balance: row[colMap[cols.balance]] || 0,
        formattedBalance: formatBalance(row[colMap[cols.balance]]),
        numTiffins: row[colMap[cols.numTiffins]] || 0,
        dueDate: dueDateValue,
        month: getMonthFromValue(dueDateRaw),
        messageStatus: String(row[colMap[cols.messageStatus]] || ''),
        orderId: String(row[colMap[cols.orderId]] || ''),
        paymentStatus: String(row[colMap[cols.paymentStatus]] || '')
      });
    }

    return { success: true, data: customers };
  } catch (error) {
    Logger.log('getCustomersCore_ error: ' + error.message + '\nStack: ' + error.stack);
    return { success: false, error: error.message };
  }
}

/**
 * Sends bills to customers based on filter criteria.
 *
 * @param {Object} params
 * @param {string} [params.filter='unpaid'] - 'unpaid', 'all', or 'byDate'
 * @param {string} [params.dueDate=''] - Target date string for 'byDate' filter
 * @param {string} [params.templateType='firstNotice'] - Template type ID
 * @param {number} [params.batchSize] - Override batch size (defaults to settings value)
 * @param {boolean} [params.dryRunMode] - If defined, overrides settings dry run mode for this send
 * @returns {Object} Result with {success, data: {sentCount, errorCount, skippedCount, totalProcessed, errorDetails, dryRunMode}, error}
 */
function sendBillsCore_(params) {
  try {
    if (!checkCredentials(true)) {
      return { success: false, error: 'Twilio credentials not configured' };
    }

    const filter = params?.filter || 'unpaid';
    const targetDate = params?.dueDate || '';
    const templateType = params?.templateType || 'firstNotice';
    const dryRunMode = params?.dryRunMode;

    const settings = getSettings();
    const cols = settings.columns;
    const sheet = getTargetSheet_();
    const data = sheet.getDataRange().getValues();
    const colMap = buildColumnMap_(data[settings.behavior.headerRowIndex - 1]);

    const missingHeaders = validateRequiredColumns(colMap, cols);
    if (missingHeaders.length > 0) {
      return { success: false, error: `Missing required columns: ${missingHeaders.join(', ')}` };
    }
    if (data.length <= settings.behavior.headerRowIndex) {
      return { success: false, error: 'No customer data found' };
    }

    // Filter rows
    const paymentCol = colMap[cols.paymentStatus];
    const dueDateCol = colMap[cols.dueDate];
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
        rowsToProcess.push({ data: row, row: i + 1 });
      }
    }

    // Respect batch size
    const maxBatch = params?.batchSize || settings.behavior.batchSize;
    const batchSize = Math.min(rowsToProcess.length, maxBatch);
    const batch = rowsToProcess.slice(0, batchSize);

    // Send using existing processRowsForSending
    const { sentCount, errorCount, errorDetails, statusUpdates } = processRowsForSending(
      batch, colMap, cols, settings, templateType, dryRunMode
    );

    // Write statuses back
    applyStatusUpdates(sheet, statusUpdates, colMap[cols.messageStatus], data.length);

    return {
      success: true,
      data: {
        sentCount,
        errorCount,
        skippedCount: rowsToProcess.length - batchSize,
        totalProcessed: batchSize,
        errorDetails: errorDetails.slice(0, 10),
        dryRunMode: dryRunMode !== undefined ? dryRunMode : settings.behavior.dryRunMode
      }
    };
  } catch (error) {
    Logger.log(`sendBillsCore_ error: ${error.message}`);
    return { success: false, error: error.message };
  }
}

/**
 * Sends a bill to a single customer identified by row index or order ID.
 *
 * @param {Object} params
 * @param {number} [params.rowIndex] - 1-based sheet row index
 * @param {string} [params.orderId] - Order ID to look up
 * @param {string} [params.templateType='firstNotice'] - Template type ID
 * @param {boolean} [params.dryRunMode] - If defined, overrides settings dry run mode for this send
 * @returns {Object} Result with {success, data: {customerName, status, dryRunMode}, error}
 */
function sendSingleBillCore_(params) {
  try {
    if (!checkCredentials(true)) {
      return { success: false, error: 'Twilio credentials not configured' };
    }

    const settings = getSettings();
    const cols = settings.columns;
    const sheet = getTargetSheet_();
    const data = sheet.getDataRange().getValues();
    const templateType = params?.templateType || 'firstNotice';
    const dryRunMode = params?.dryRunMode;
    const colMap = buildColumnMap_(data[settings.behavior.headerRowIndex - 1]);

    // Find target row
    let targetRow = -1;
    if (params?.rowIndex) {
      targetRow = params.rowIndex - 1; // Convert to 0-based
    } else if (params?.orderId) {
      targetRow = findRowByOrderId_(data, colMap, cols, settings.behavior.headerRowIndex, params.orderId);
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

    const result = sendBill_(phone, name, balance, tiffins, dueDate, templateType, dryRunMode, settings);

    // Update status in sheet
    const statusRange = sheet.getRange(targetRow + 1, statusCol + 1);
    statusRange.setValue(result.status);
    statusRange.setBackground(result.color);

    return {
      success: result.success,
      data: {
        customerName: name,
        status: result.status,
        dryRunMode: dryRunMode !== undefined ? dryRunMode : settings.behavior.dryRunMode
      },
      error: result.success ? null : result.status
    };
  } catch (error) {
    Logger.log(`sendSingleBillCore_ error: ${error.message}`);
    return { success: false, error: error.message };
  }
}

/**
 * Clears all message statuses in the spreadsheet.
 *
 * @returns {Object} Result with {success, data: {clearedCount}, error}
 */
function clearAllStatusesCore_() {
  try {
    const settings = getSettings();
    const cols = settings.columns;
    const sheet = getTargetSheet_();
    const data = sheet.getDataRange().getValues();
    const colMap = buildColumnMap_(data[settings.behavior.headerRowIndex - 1]);

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
    Logger.log(`clearAllStatusesCore_ error: ${error.message}`);
    return { success: false, error: error.message };
  }
}

/**
 * Looks up a customer by order ID and returns their data for preview.
 *
 * @param {string} orderId - The order ID to search for
 * @returns {Object} Result with {success, data: {rowIndex, name, phone, balance, tiffins, dueDate}, error}
 */
function lookupCustomerByOrderId_(orderId) {
  try {
    const settings = getSettings();
    const cols = settings.columns;
    const sheet = getTargetSheet_();
    const data = sheet.getDataRange().getValues();
    const colMap = buildColumnMap_(data[settings.behavior.headerRowIndex - 1]);

    const orderIdColIndex = colMap[cols.orderId];
    if (orderIdColIndex === undefined) {
      return { success: false, error: `Column "${cols.orderId}" not found` };
    }

    const foundRow = findRowByOrderId_(data, colMap, cols, settings.behavior.headerRowIndex, orderId);
    if (foundRow === -1) {
      return { success: false, error: `Could not find any row with Order ID "${orderId}"` };
    }

    const row = data[foundRow];
    return {
      success: true,
      data: {
        rowIndex: foundRow + 1,
        name: row[colMap[cols.customerName]],
        phone: row[colMap[cols.phoneNumber]],
        balance: row[colMap[cols.balance]],
        tiffins: row[colMap[cols.numTiffins]],
        dueDate: row[colMap[cols.dueDate]]
      }
    };
  } catch (error) {
    Logger.log(`lookupCustomerByOrderId_ error: ${error.message}`);
    return { success: false, error: error.message };
  }
}

// ========================================
// INTERNAL HELPERS
// ========================================

/**
 * Builds a column name to 0-based index map from a header row array.
 * This is the inline equivalent of getHeaderColumnMap() but works on an
 * already-loaded header array, avoiding a redundant sheet read.
 *
 * @param {Array} headerRow - Array of header values from the sheet
 * @returns {Object<string, number>} Map of trimmed header name to 0-based column index
 * @private
 */
function buildColumnMap_(headerRow) {
  const colMap = {};
  headerRow.forEach((header, index) => {
    if (header) {
      colMap[String(header).trim()] = index;
    }
  });
  return colMap;
}

/**
 * Finds a row index by order ID within loaded sheet data.
 *
 * @param {Array[]} data - Full sheet data from getDataRange().getValues()
 * @param {Object} colMap - Column name to index map
 * @param {Object} cols - Column name settings from settings.columns
 * @param {number} headerRowIndex - 0-based index of the first data row
 * @param {string} orderId - Order ID to search for
 * @returns {number} 0-based row index, or -1 if not found
 * @private
 */
function findRowByOrderId_(data, colMap, cols, headerRowIndex, orderId) {
  const orderIdCol = colMap[cols.orderId];
  if (orderIdCol === undefined) return -1;

  for (let i = headerRowIndex; i < data.length; i++) {
    if (String(data[i][orderIdCol]).trim() === orderId) {
      return i;
    }
  }
  return -1;
}
