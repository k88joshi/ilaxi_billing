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
    const { settings, data, colMap } = options?._ctx || getSheetContext_();
    const cols = settings.columns;
    const headerRowIndex = settings.behavior.headerRowIndex;

    if (data.length <= headerRowIndex) {
      return { success: true, data: [] };
    }

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
        formattedBalance: formatBalance_(row[colMap[cols.balance]]),
        numTiffins: row[colMap[cols.numTiffins]] || 0,
        dueDate: dueDateValue,
        month: getMonthFromValue_(dueDateRaw),
        messageStatus: String(row[colMap[cols.messageStatus]] || ''),
        orderId: String(row[colMap[cols.orderId]] || ''),
        paymentStatus: String(row[colMap[cols.paymentStatus]] || '')
      });
    }

    const dupResult = detectDuplicates_(customers);
    return { success: true, data: dupResult.customers, duplicateSummary: dupResult.summary };
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

    const { settings, sheet, data, colMap } = getSheetContext_();
    const cols = settings.columns;

    const missingHeaders = validateRequiredColumns_(colMap, cols);
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
        const monthFromDate = getMonthFromValue_(dueDate).toLowerCase();
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
    applyStatusUpdates_(sheet, statusUpdates, colMap[cols.messageStatus], data.length);

    logEvent_('billing', 'Send bills', `Sent: ${sentCount}, Errors: ${errorCount}`, true, getCurrentUserEmail_());
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
    logEvent_('billing', 'Send bills', error.message, false, getCurrentUserEmail_());
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

    const { settings, sheet, data, colMap } = getSheetContext_();
    const cols = settings.columns;
    const templateType = params?.templateType || 'firstNotice';
    const dryRunMode = params?.dryRunMode;

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

    logEvent_('billing', 'Send single bill', String(name || ''), result.success, getCurrentUserEmail_());
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
    logEvent_('billing', 'Send single bill', error.message, false, getCurrentUserEmail_());
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
    const { settings, sheet, data, colMap } = getSheetContext_();
    const cols = settings.columns;

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

    logEvent_('billing', 'Clear all statuses', `Cleared: ${rowCount}`, true, getCurrentUserEmail_());
    return { success: true, data: { clearedCount: rowCount } };
  } catch (error) {
    Logger.log(`clearAllStatusesCore_ error: ${error.message}`);
    logEvent_('billing', 'Clear all statuses', error.message, false, getCurrentUserEmail_());
    return { success: false, error: error.message };
  }
}

/**
 * Updates the payment status of a customer by row index.
 *
 * @param {Object} params
 * @param {number} params.rowIndex - 1-based sheet row index
 * @param {string} params.paymentStatus - New status value ('Paid', 'Unpaid', or custom)
 * @returns {Object} Result with {success, data: {rowIndex, paymentStatus}, error}
 */
function updatePaymentStatusCore_(params) {
  try {
    const rowIndex = params?.rowIndex;
    const newStatus = params?.paymentStatus;

    if (!rowIndex || !newStatus) {
      return { success: false, error: 'Row index and payment status are required' };
    }

    // Validate against allowed statuses
    const allowedStatuses = ['paid', 'unpaid'];
    const normalizedStatus = String(newStatus).trim().toLowerCase();
    if (allowedStatuses.indexOf(normalizedStatus) === -1) {
      return { success: false, error: 'Invalid payment status. Allowed values: Paid, Unpaid' };
    }
    // Title case for display
    const titleCaseStatus = normalizedStatus.charAt(0).toUpperCase() + normalizedStatus.slice(1);

    const { settings, sheet, data, colMap } = getSheetContext_();
    const cols = settings.columns;

    const paymentStatusCol = colMap[cols.paymentStatus];
    if (paymentStatusCol === undefined) {
      return { success: false, error: `Payment status column "${cols.paymentStatus}" not found` };
    }

    if (rowIndex < 1 || rowIndex > data.length) {
      return { success: false, error: 'Invalid row index' };
    }

    // Update the cell (rowIndex is 1-based, paymentStatusCol is 0-based)
    sheet.getRange(rowIndex, paymentStatusCol + 1).setValue(titleCaseStatus);

    // Auto thank-you for "Paid" status (web app equivalent of onEditInstallable)
    let thankYouSent = null;
    if (normalizedStatus === 'paid' && settings.behavior.autoThankYouEnabled) {
      thankYouSent = sendAutoThankYou_(rowIndex, data, colMap, cols, settings, sheet);
    }

    logEvent_('billing', 'Update payment', `Row ${rowIndex} → ${titleCaseStatus}`, true, getCurrentUserEmail_());
    return { success: true, data: { rowIndex: rowIndex, paymentStatus: titleCaseStatus, thankYouSent: thankYouSent } };
  } catch (error) {
    Logger.log(`updatePaymentStatusCore_ error: ${error.message}`);
    logEvent_('billing', 'Update payment', error.message, false, getCurrentUserEmail_());
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
    const { settings, data, colMap } = getSheetContext_();
    const cols = settings.columns;

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
// DUPLICATE DETECTION
// ========================================

/**
 * Detects duplicate customers by normalized phone number.
 * Two levels:
 *   - 'exact': same phone + same due-date month (likely data-entry errors)
 *   - 'related': same phone but different months (multi-period entries)
 *
 * Annotates each customer object in-place with:
 *   duplicateType, duplicateGroupId, duplicateGroupSize
 *
 * @param {Object[]} customers - Array of customer objects from getCustomersCore_
 * @returns {{customers: Object[], summary: Object}} Annotated customers and summary stats
 * @private
 */
function detectDuplicates_(customers) {
  const summary = { exactGroups: 0, exactCount: 0, relatedGroups: 0, relatedCount: 0 };
  if (!customers || customers.length === 0) {
    return { customers: customers || [], summary: summary };
  }

  // Group by normalized phone
  const phoneGroups = {};
  customers.forEach(function(c) {
    const normalized = formatPhoneNumber_(c.phone);
    if (!normalized) return;
    if (!phoneGroups[normalized]) phoneGroups[normalized] = [];
    phoneGroups[normalized].push(c);
  });

  let groupId = 0;
  Object.keys(phoneGroups).forEach(function(phone) {
    const group = phoneGroups[phone];
    if (group.length < 2) return;

    groupId++;
    // Sub-group by month (lowercase, trimmed) to find exact duplicates
    const monthMap = {};
    group.forEach(function(c) {
      const monthKey = (c.month || '').toLowerCase().trim();
      if (!monthMap[monthKey]) monthMap[monthKey] = [];
      monthMap[monthKey].push(c);
    });

    let hasExact = false;
    Object.keys(monthMap).forEach(function(month) {
      if (monthMap[month].length > 1) {
        hasExact = true;
        summary.exactGroups++;
        summary.exactCount += monthMap[month].length;
        monthMap[month].forEach(function(c) {
          c.duplicateType = 'exact';
          c.duplicateGroupId = groupId;
          c.duplicateGroupSize = group.length;
        });
      }
    });

    // Mark remaining members as 'related' if they weren't marked as 'exact'
    let hasRelated = false;
    group.forEach(function(c) {
      if (!c.duplicateType) {
        c.duplicateType = 'related';
        c.duplicateGroupId = groupId;
        c.duplicateGroupSize = group.length;
        hasRelated = true;
        summary.relatedCount++;
      }
    });
    if (hasRelated) summary.relatedGroups++;
  });

  return { customers: customers, summary: summary };
}

// ========================================
// INTERNAL HELPERS
// ========================================

/**
 * Loads the sheet, settings, data, and column map in one call.
 * Reduces the repeated 4-line boilerplate across core functions.
 *
 * @returns {{settings: Object, sheet: GoogleAppsScript.Spreadsheet.Sheet, data: Array[], colMap: Object}}
 * @private
 */
function getSheetContext_() {
  const settings = getSettings();
  const sheet = getTargetSheet_();
  const data = sheet.getDataRange().getValues();
  const colMap = buildColumnMap_(data[settings.behavior.headerRowIndex - 1]);

  // Validate stored column settings against actual headers
  const warnings = [];
  const cols = settings.columns;
  const columnKeys = ['phoneNumber', 'customerName', 'balance', 'numTiffins',
                      'dueDate', 'messageStatus', 'orderId', 'paymentStatus'];

  for (const key of columnKeys) {
    const savedName = cols[key];
    if (savedName && colMap[savedName] === undefined) {
      const synonyms = COLUMN_SYNONYMS[key];
      if (synonyms) {
        let bestMatch = null;
        let bestScore = 0;
        Object.keys(colMap).forEach(header => {
          const score = calculateMatchScore_(header, synonyms);
          if (score > bestScore) {
            bestScore = score;
            bestMatch = header;
          }
        });
        if (bestMatch && bestScore >= 70) {
          // Use auto-detected column as runtime fallback (don't persist)
          colMap[savedName] = colMap[bestMatch];
          warnings.push({ key, saved: savedName, actual: bestMatch, confidence: bestScore, resolved: true });
          Logger.log(`Column "${savedName}" not found; using "${bestMatch}" (score: ${bestScore})`);
        } else {
          warnings.push({ key, saved: savedName, actual: null, confidence: 0, resolved: false });
          Logger.log(`WARNING: Column "${savedName}" for ${key} not found and could not be auto-resolved.`);
        }
      }
    }
  }

  // Auto-persist high-confidence column resolutions (>= 90)
  if (warnings.length > 0) {
    const persisted = persistHighConfidenceColumns_(warnings, settings);
    // Filter out persisted warnings — they're resolved and saved
    const remaining = persisted.warnings.filter(w => !w.persisted);
    return { settings, sheet, data, colMap, warnings: remaining };
  }

  return { settings, sheet, data, colMap, warnings };
}

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

/**
 * Sends an auto thank-you message for a customer whose payment was just set to "Paid".
 * Used by updatePaymentStatusCore_() to provide web app parity with onEditInstallable().
 *
 * @param {number} rowIndex - 1-based sheet row index
 * @param {Array[]} data - Full sheet data from getDataRange().getValues()
 * @param {Object} colMap - Column name to 0-based index map
 * @param {Object} cols - Column name settings from settings.columns
 * @param {Object} settings - Current settings object
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet - The target sheet
 * @returns {boolean} true if thank-you was sent, false otherwise
 * @private
 */
function sendAutoThankYou_(rowIndex, data, colMap, cols, settings, sheet) {
  try {
    const row = data[rowIndex - 1]; // rowIndex is 1-based, data is 0-based
    const statusColIndex = colMap[cols.messageStatus];
    if (statusColIndex === undefined) return false;

    // Duplicate-send guard (same pattern as processPaidRows_ in main.gs)
    const existingStatus = String(row[statusColIndex] || '').toLowerCase();
    if (existingStatus.includes('thank you sent')) return false;

    const customerName = row[colMap[cols.customerName]];
    const customerPhone = row[colMap[cols.phoneNumber]];
    const orderId = row[colMap[cols.orderId]];

    if (!customerName || !customerPhone || !orderId) {
      const statusRange = sheet.getRange(rowIndex, statusColIndex + 1);
      statusRange.setValue("Payment 'Paid', but auto-thanks failed: Missing data");
      statusRange.setBackground(settings.colors.error);
      return false;
    }

    const result = sendThankYouMessage_(customerPhone, customerName, orderId, settings);

    const statusRange = sheet.getRange(rowIndex, statusColIndex + 1);
    statusRange.setValue(result.status);
    statusRange.setBackground(result.color);

    logEvent_('billing', 'Auto thank-you (web)',
              result.success ? `Sent to ${customerName}` : `Failed: ${result.status}`,
              result.success, getCurrentUserEmail_());
    return result.success;
  } catch (e) {
    Logger.log('sendAutoThankYou_ error (non-fatal): ' + e.message);
    return false;
  }
}
