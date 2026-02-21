// ========================================
// SETTINGS MANAGEMENT
// Centralized configuration storage and retrieval
// ========================================

/**
 * Property key for storing app settings in ScriptProperties.
 * Using ScriptProperties allows settings to persist across web app requests.
 * @const {string}
 */
const SETTINGS_PROPERTY_KEY = "APP_SETTINGS";

/**
 * Current settings schema version. Increment when settings structure changes.
 * @const {number}
 */
const SETTINGS_VERSION = 2;

/**
 * Returns the default settings object with all configuration values.
 * Used as a fallback and for initial setup.
 *
 * @returns {Object} Default settings object
 */
function getDefaultSettings() {
  return {
    version: SETTINGS_VERSION,
    business: {
      name: "Ilaxi's Gujarati Tiffin",
      etransferEmail: "info@ilaxifoods.ca",
      phoneNumber: "+1 (647) 537-5956",
      whatsappLink: "https://bit.ly/ilaxi-tiffins-etransfer-screenshot"
    },
    templates: {
      billMessages: {
        firstNotice: {
          name: "First Notice",
          message: `{{businessName}} - Monthly Bill

Please see below your total bill pending for the month of {{month}}:

Total - {{balance}}
Tiffins - {{numTiffins}}

Please e-transfer the amount to {{etransferEmail}} in the next 1-2 days. During the e-transfer, please include: your full name, phone number and month of payment to avoid any errors. If you have any questions, please call {{phoneNumber}}.

Thank you,
{{businessName}}`
        },
        followUp: {
          name: "Follow-up Reminder",
          message: `{{businessName}} - Payment Reminder

Hi {{customerName}},

This is a friendly reminder that your payment of {{balance}} for the month of {{month}} is still pending.

Total - {{balance}}
Tiffins - {{numTiffins}}

Please e-transfer to {{etransferEmail}} at your earliest convenience. Include your full name, phone number and month of payment.

Questions? Call us at {{phoneNumber}}.

Thank you,
{{businessName}}`
        },
        finalNotice: {
          name: "Final Notice",
          message: `{{businessName}} - Final Payment Notice

Dear {{customerName}},

This is a final reminder regarding your outstanding balance of {{balance}} for {{month}}.

Total Due - {{balance}}
Tiffins - {{numTiffins}}

Please e-transfer to {{etransferEmail}} immediately to avoid service interruption. Include your full name, phone number and month of payment.

If you have already paid, please disregard this message. For questions, call {{phoneNumber}}.

Thank you,
{{businessName}}`
        }
      },
      thankYouMessage: `Hello {{customerName}},

Thank you for your payment for Order {{orderId}}. We have marked your bill as PAID.

We appreciate your business!
- {{businessName}}`
    },
    behavior: {
      dryRunMode: false,
      autoThankYouEnabled: false,
      batchSize: 75,
      messageDelayMs: 1000,
      headerRowIndex: 1,
      testOrderId: ""
    },
    colors: {
      success: "#d9ead3",
      error: "#f4cccc",
      dryRun: "#fff2cc"
    },
    columns: {
      phoneNumber: "Phone Number",
      customerName: "Customer Name",
      balance: "Balance",
      numTiffins: "No. of Tiffins",
      dueDate: "Due Date",
      messageStatus: "Message Status",
      orderId: "Order ID",
      paymentStatus: "Payment"
    },
    testData: {
      customerName: "",
      balance: "",
      numTiffins: "",
      month: "",
      orderId: ""
    }
  };
}

/**
 * Retrieves settings from ScriptProperties, merging with defaults.
 * Automatically migrates from legacy config.gs constants on first call.
 * Uses ScriptProperties for web app compatibility.
 *
 * @returns {Object} Current settings object
 */
function getSettings() {
  const stored = scriptProperties.getProperty(SETTINGS_PROPERTY_KEY);

  if (!stored) {
    // No settings found - attempt migration from legacy config.gs
    Logger.log("No settings found. Attempting migration from legacy config...");
    const migrated = migrateFromLegacyConfig();
    if (migrated) {
      return migrated;
    }
    // Migration failed or not applicable - use defaults
    const defaults = getDefaultSettings();
    saveSettings(defaults);
    return defaults;
  }

  try {
    const parsed = JSON.parse(stored);
    // Deep merge with defaults to ensure all keys exist
    const merged = deepMerge(getDefaultSettings(), parsed);

    // Check for version upgrade needs
    if (parsed.version < SETTINGS_VERSION) {
      Logger.log(`Settings version ${parsed.version} -> ${SETTINGS_VERSION} upgrade needed.`);
      const upgraded = migrateSettingsVersion(parsed, merged);
      upgraded.version = SETTINGS_VERSION;
      saveSettings(upgraded);
      return upgraded;
    }

    return merged;
  } catch (e) {
    Logger.log(`Error parsing settings: ${e.message}. Using defaults.`);
    // Attempt to notify user via UI (may fail in triggers, but worth trying)
    try {
      SpreadsheetApp.getUi().alert(
        "Settings Error",
        `Your saved settings could not be loaded due to a parsing error. Using default settings instead.\n\nError: ${e.message}\n\nYou may want to check Settings > Export/Import to fix this.`,
        SpreadsheetApp.getUi().ButtonSet.OK
      );
    } catch (uiError) {
      // UI alert may fail in triggers - that's okay, we already logged the error
      Logger.log(`Could not show UI alert for settings error: ${uiError.message}`);
    }
    return getDefaultSettings();
  }
}

/**
 * Saves settings to ScriptProperties after validation.
 * Uses ScriptProperties for web app compatibility.
 *
 * @param {Object} settings - Settings object to save
 * @returns {Object} Result with success boolean and optional error message
 */
function saveSettings(settings) {
  const validation = validateSettings(settings);
  if (!validation.valid) {
    // Format errors for display - extract message from error objects
    const errorMessages = validation.errors.map(err =>
      typeof err === "string" ? err : err.message
    );
    Logger.log(`Settings validation failed: ${errorMessages.join(", ")}`);
    return { success: false, error: errorMessages.join(", "), errors: validation.errors };
  }

  try {
    scriptProperties.setProperty(SETTINGS_PROPERTY_KEY, JSON.stringify(settings));
    Logger.log("Settings saved successfully.");

    // Sync the installable onEdit trigger with the auto thank-you setting
    let triggerWarning = null;
    try {
      syncEditTrigger_(!!settings.behavior.autoThankYouEnabled);
    } catch (triggerErr) {
      Logger.log(`Warning: Could not sync edit trigger: ${triggerErr.message}`);
      if (settings.behavior.autoThankYouEnabled) {
        triggerWarning = "Settings saved, but the trigger could not be created from this context. To install it: open the Apps Script editor (Extensions > Apps Script), select 'installAutoThankYouTrigger' from the function dropdown, and click Run.";
      }
    }

    if (triggerWarning) {
      return { success: true, warning: triggerWarning };
    }
    return { success: true };
  } catch (e) {
    Logger.log(`Error saving settings: ${e.message}`);
    return { success: false, error: e.message };
  }
}

/**
 * Validates a settings object for required fields and value constraints.
 * Returns detailed error information including field names and guidance.
 *
 * @param {Object} settings - Settings object to validate
 * @returns {Object} Validation result with valid boolean and errors array (with field/tab/message details)
 */
function validateSettings(settings) {
  const errors = [];

  // Top-level validation
  if (!settings || typeof settings !== "object") {
    return { valid: false, errors: [{ field: null, tab: null, message: "Settings must be a valid object" }] };
  }

  // Business validations
  if (!settings.business) {
    errors.push({ field: null, tab: "business", message: "Missing business section" });
  } else {
    if (!settings.business.name || settings.business.name.length > 100) {
      errors.push({
        field: "businessName",
        tab: "business",
        message: "Business name is required and must be <= 100 characters"
      });
    }
    if (!settings.business.etransferEmail || !isValidEmail(settings.business.etransferEmail)) {
      errors.push({
        field: "etransferEmail",
        tab: "business",
        message: "Valid e-transfer email is required"
      });
    }
    if (!settings.business.phoneNumber || settings.business.phoneNumber.length > 20) {
      errors.push({
        field: "phoneNumber",
        tab: "business",
        message: "Phone number is required and must be <= 20 characters"
      });
    }
  }

  // Template validations
  if (!settings.templates) {
    errors.push({ field: null, tab: "templates", message: "Missing templates section" });
  } else {
    // Validate bill message templates (new structure)
    if (settings.templates.billMessages) {
      const templateTypes = ["firstNotice", "followUp", "finalNotice"];
      templateTypes.forEach(type => {
        const template = settings.templates.billMessages[type];
        if (!template) {
          errors.push({ field: `${type}Message`, tab: "templates", message: `Missing bill template: ${type}` });
        } else {
          if (!template.name || template.name.length > 50) {
            errors.push({
              field: `${type}Name`,
              tab: "templates",
              message: `${type} template name must be <= 50 characters`
            });
          }
          if (!template.message ||
              template.message.length < 50 ||
              template.message.length > 1600) {
            errors.push({
              field: `${type}Message`,
              tab: "templates",
              message: `${type} message must be between 50-1600 characters`
            });
          }
        }
      });
    } else if (settings.templates.billMessage) {
      // Legacy single template validation (for migration)
      if (settings.templates.billMessage.length < 50 ||
          settings.templates.billMessage.length > 1600) {
        errors.push({ field: null, tab: "templates", message: "Bill message template must be between 50-1600 characters" });
      }
    } else {
      errors.push({ field: null, tab: "templates", message: "Missing bill message templates" });
    }

    if (!settings.templates.thankYouMessage ||
        settings.templates.thankYouMessage.length < 50 ||
        settings.templates.thankYouMessage.length > 1600) {
      errors.push({
        field: "thankYouMessage",
        tab: "templates",
        message: "Thank you message must be between 50-1600 characters"
      });
    }
  }

  // Behavior validations
  if (!settings.behavior) {
    errors.push({ field: null, tab: "behavior", message: "Missing behavior section" });
  } else {
    if (typeof settings.behavior.batchSize !== "number" ||
        settings.behavior.batchSize < 1 ||
        settings.behavior.batchSize > 200) {
      errors.push({
        field: "batchSize",
        tab: "behavior",
        message: "Batch size must be a number between 1-200"
      });
    }
    if (typeof settings.behavior.messageDelayMs !== "number" ||
        settings.behavior.messageDelayMs < 500 ||
        settings.behavior.messageDelayMs > 5000) {
      errors.push({
        field: "messageDelayMs",
        tab: "behavior",
        message: "Message delay must be between 500-5000ms"
      });
    }
    if (typeof settings.behavior.headerRowIndex !== "number" ||
        settings.behavior.headerRowIndex < 1) {
      errors.push({
        field: "headerRowIndex",
        tab: "behavior",
        message: "Header row index must be >= 1"
      });
    }
  }

  // Color validations
  if (!settings.colors) {
    errors.push({ field: null, tab: "behavior", message: "Missing colors section" });
  } else {
    const colorFields = ["success", "error", "dryRun"];
    colorFields.forEach(field => {
      if (!settings.colors[field] || !isValidHexColor(settings.colors[field])) {
        errors.push({
          field: `color${field.charAt(0).toUpperCase() + field.slice(1)}`,
          tab: "behavior",
          message: `Invalid hex color for ${field}`
        });
      }
    });
  }

  // Column validations
  if (!settings.columns) {
    errors.push({ field: null, tab: "columns", message: "Missing columns section" });
  } else {
    const requiredColumns = ["phoneNumber", "customerName", "balance", "numTiffins",
                            "dueDate", "messageStatus", "orderId", "paymentStatus"];
    requiredColumns.forEach(col => {
      if (!settings.columns[col] || typeof settings.columns[col] !== "string") {
        errors.push({
          field: `col${col.charAt(0).toUpperCase() + col.slice(1)}`,
          tab: "columns",
          message: `Missing or invalid column mapping for ${col}`
        });
      }
    });
  }

  return {
    valid: errors.length === 0,
    errors: errors
  };
}

/**
 * Processes a message template by replacing placeholders with actual values.
 * Placeholders use {{name}} syntax.
 *
 * @param {string} template - Template string with placeholders
 * @param {Object} data - Object containing placeholder values
 * @returns {string} Processed template with placeholders replaced
 * @throws {Error} If template is invalid (null, undefined, or not a string)
 */
function processTemplate(template, data) {
  if (!template || typeof template !== "string") {
    const errorMsg = `Invalid template: expected non-empty string, got ${typeof template}`;
    Logger.log(`ERROR in processTemplate: ${errorMsg}`);
    throw new Error(errorMsg);
  }

  if (!data || typeof data !== "object") {
    Logger.log(`WARNING in processTemplate: Invalid data object, using empty object`);
    data = {};
  }

  let result = template;

  // Replace all {{placeholder}} patterns
  const placeholderRegex = /\{\{(\w+)\}\}/g;
  result = result.replace(placeholderRegex, (match, key) => {
    if (Object.prototype.hasOwnProperty.call(data, key) && data[key] !== undefined && data[key] !== null) {
      return String(data[key]);
    }
    // Keep original placeholder if no value found
    Logger.log(`Warning: No value found for placeholder: ${key}`);
    return match;
  });

  return result;
}

/**
 * Migrates settings from legacy config.gs constants to the new settings system.
 * Called automatically on first getSettings() if no settings exist.
 *
 * @returns {Object|null} Migrated settings object or null if migration not applicable
 */
function migrateFromLegacyConfig() {
  try {
    // Check if legacy constants exist (they should if config.gs is loaded)
    if (typeof BUSINESS_NAME === "undefined") {
      Logger.log("Legacy config.gs constants not found. Using defaults.");
      return null;
    }

    Logger.log("Migrating from legacy config.gs...");

    const migrated = getDefaultSettings();

    // Migrate business info
    migrated.business.name = BUSINESS_NAME || migrated.business.name;
    migrated.business.etransferEmail = ETRANSFER_EMAIL || migrated.business.etransferEmail;
    migrated.business.phoneNumber = SCREENSHOT_PHONE || migrated.business.phoneNumber;
    migrated.business.whatsappLink = WHATSAPP_LINK || migrated.business.whatsappLink;

    // Migrate behavior settings
    migrated.behavior.batchSize = typeof BATCH_SIZE !== "undefined" ? BATCH_SIZE : 75;
    migrated.behavior.messageDelayMs = typeof MESSAGE_DELAY_MS !== "undefined" ? MESSAGE_DELAY_MS : 1000;
    migrated.behavior.headerRowIndex = typeof HEADER_ROW_INDEX !== "undefined" ? HEADER_ROW_INDEX : 1;

    // Migrate column mappings
    migrated.columns.phoneNumber = PHONE_NUMBER_HEADER || migrated.columns.phoneNumber;
    migrated.columns.customerName = CUSTOMER_NAME_HEADER || migrated.columns.customerName;
    migrated.columns.balance = BALANCE_HEADER || migrated.columns.balance;
    migrated.columns.numTiffins = NUM_TIFFINS_HEADER || migrated.columns.numTiffins;
    migrated.columns.dueDate = DUE_DATE_HEADER || migrated.columns.dueDate;
    migrated.columns.messageStatus = MESSAGE_STATUS_HEADER || migrated.columns.messageStatus;
    migrated.columns.orderId = ORDER_ID_HEADER || migrated.columns.orderId;
    migrated.columns.paymentStatus = PAYMENT_STATUS_HEADER || migrated.columns.paymentStatus;

    // Save migrated settings
    const saveResult = saveSettings(migrated);
    if (saveResult.success) {
      Logger.log(`Migration completed at ${new Date().toISOString()}`);
      return migrated;
    } else {
      Logger.log(`Migration save failed: ${saveResult.error}`);
      return null;
    }
  } catch (e) {
    Logger.log(`Migration error: ${e.message}`);
    return null;
  }
}

/**
 * Migrates settings from one version to another.
 * Handles structural changes between settings versions.
 *
 * @param {Object} oldSettings - Original settings object
 * @param {Object} mergedSettings - Settings merged with defaults
 * @returns {Object} Migrated settings object
 */
function migrateSettingsVersion(oldSettings, mergedSettings) {
  // Input validation
  if (!oldSettings || typeof oldSettings !== "object") {
    Logger.log("migrateSettingsVersion: Invalid oldSettings, returning mergedSettings");
    return mergedSettings || getDefaultSettings();
  }
  if (!mergedSettings || typeof mergedSettings !== "object") {
    Logger.log("migrateSettingsVersion: Invalid mergedSettings, using defaults");
    return getDefaultSettings();
  }

  const result = { ...mergedSettings };

  // Migration from v1 to v2: Convert single billMessage to billMessages object
  if (oldSettings.version === 1 || !oldSettings.version) {
    if (oldSettings.templates && oldSettings.templates.billMessage && !oldSettings.templates.billMessages) {
      Logger.log("Migrating v1 -> v2: Converting single billMessage to billMessages structure");

      // Keep the old message as the first notice template
      result.templates.billMessages = {
        firstNotice: {
          name: "First Notice",
          message: oldSettings.templates.billMessage
        },
        followUp: mergedSettings.templates.billMessages.followUp,
        finalNotice: mergedSettings.templates.billMessages.finalNotice
      };

      // Remove legacy billMessage field if present
      delete result.templates.billMessage;
    }
  }

  return result;
}

/**
 * Resets all settings to defaults.
 *
 * @returns {Object} Result with success boolean
 */
function resetToDefaults() {
  const oldSettings = getSettings();
  const defaults = getDefaultSettings();
  const result = saveSettings(defaults);
  const changes = describeSettingsChanges_(oldSettings, defaults);
  logEvent_('settings', 'Reset to defaults', changes, result.success, getCurrentUserEmail_());
  return result;
}

/**
 * Exports current settings as a JSON string for backup.
 *
 * @returns {string} JSON string of current settings
 */
function exportSettings() {
  const settings = getSettings();
  return JSON.stringify(settings, null, 2);
}

/**
 * Imports settings from a JSON string.
 *
 * @param {string} jsonString - JSON string containing settings
 * @returns {Object} Result with success boolean and optional error message
 */
function importSettings(jsonString) {
  try {
    const parsed = JSON.parse(jsonString);

    // Validate before saving
    const validation = validateSettings(parsed);
    if (!validation.valid) {
      return { success: false, error: `Invalid settings: ${validation.errors.join(", ")}` };
    }

    // Ensure version is set
    parsed.version = SETTINGS_VERSION;

    const oldSettings = getSettings();
    const result = saveSettings(parsed);
    const changes = describeSettingsChanges_(oldSettings, parsed);
    logEvent_('settings', 'Import settings', changes, result.success, getCurrentUserEmail_());
    return result;
  } catch (e) {
    return { success: false, error: `Failed to parse JSON: ${e.message}` };
  }
}

// ========================================
// HELPER FUNCTIONS
// ========================================

/**
 * Validates an email address format.
 *
 * @param {string} email - Email address to validate
 * @returns {boolean} True if valid email format
 */
function isValidEmail(email) {
  if (!email || typeof email !== "string") return false;
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Validates a hex color code.
 *
 * @param {string} color - Hex color code to validate
 * @returns {boolean} True if valid hex color (#RRGGBB format)
 */
function isValidHexColor(color) {
  if (!color || typeof color !== "string") return false;
  const hexRegex = /^#[0-9A-Fa-f]{6}$/;
  return hexRegex.test(color);
}

/**
 * Deep merges two objects, with source values overriding target values.
 * Handles nested objects recursively.
 * Includes protection against prototype pollution attacks.
 *
 * @param {Object} target - Target object (defaults)
 * @param {Object} source - Source object (stored values)
 * @returns {Object} Merged object
 */
function deepMerge(target, source) {
  // Input validation - handle null/undefined gracefully
  if (!target || typeof target !== "object") {
    target = {};
  }
  if (!source || typeof source !== "object") {
    return { ...target };
  }

  const result = { ...target };

  // Dangerous keys that could lead to prototype pollution
  const dangerousKeys = ["__proto__", "constructor", "prototype"];

  for (const key in source) {
    // Skip dangerous keys to prevent prototype pollution
    if (dangerousKeys.includes(key)) {
      Logger.log(`deepMerge: Skipping dangerous key "${key}" to prevent prototype pollution`);
      continue;
    }

    if (Object.prototype.hasOwnProperty.call(source, key)) {
      if (source[key] && typeof source[key] === "object" && !Array.isArray(source[key])) {
        // Recursive merge for nested objects
        result[key] = deepMerge(target[key] || {}, source[key]);
      } else {
        // Direct assignment for primitives and arrays
        result[key] = source[key];
      }
    }
  }

  return result;
}

/**
 * Gets sample data for template preview.
 *
 * @returns {Object} Sample data object with all placeholder values
 */
function getSampleDataForPreview() {
  const settings = getSettings();
  const businessData = {
    businessName: settings.business.name,
    etransferEmail: settings.business.etransferEmail,
    phoneNumber: settings.business.phoneNumber,
    whatsappLink: settings.business.whatsappLink
  };

  const hardcodedDefaults = {
    customerName: "John Doe",
    balance: "$150.00",
    numTiffins: "30",
    month: "January",
    orderId: "ORD-2024-001"
  };

  // Priority 1: Custom test data (if any field is non-empty)
  const td = settings.testData || {};
  const hasCustomTestData = Object.keys(td).some(function(k) { return td[k] && td[k].trim(); });
  if (hasCustomTestData) {
    return Object.assign({}, businessData, {
      customerName: (td.customerName && td.customerName.trim()) || hardcodedDefaults.customerName,
      balance: (td.balance && td.balance.trim()) || hardcodedDefaults.balance,
      numTiffins: (td.numTiffins && td.numTiffins.trim()) || hardcodedDefaults.numTiffins,
      month: (td.month && td.month.trim()) || hardcodedDefaults.month,
      orderId: (td.orderId && td.orderId.trim()) || hardcodedDefaults.orderId
    });
  }

  // Priority 2: Real customer data via testOrderId
  const testOrderId = settings.behavior.testOrderId;
  if (testOrderId) {
    try {
      const lookup = lookupCustomerByOrderId_(testOrderId);
      if (lookup.success) {
        return Object.assign({}, businessData, {
          customerName: String(lookup.data.name || ""),
          balance: formatBalance_(lookup.data.balance) || "$0.00",
          numTiffins: String(lookup.data.tiffins || "0"),
          month: getMonthFromValue_(lookup.data.dueDate),
          orderId: testOrderId
        });
      }
    } catch (e) {
      Logger.log("getSampleDataForPreview: test customer lookup failed: " + e.message);
    }
  }

  // Priority 3: Hardcoded fallback
  return Object.assign({}, businessData, hardcodedDefaults);
}

/**
 * Builds the template data object for a bill message from row data.
 *
 * @param {Object} rowData - Data from the spreadsheet row
 * @param {Object} settings - Current settings object
 * @returns {Object} Template data object
 */
function buildBillTemplateData(rowData, settings) {
  // Input validation
  if (!rowData || typeof rowData !== "object") {
    Logger.log("buildBillTemplateData: Invalid rowData provided");
    rowData = {};
  }
  if (!settings || typeof settings !== "object" || !settings.business) {
    Logger.log("buildBillTemplateData: Invalid settings, using defaults");
    settings = getDefaultSettings();
  }

  return {
    businessName: settings.business.name || "",
    etransferEmail: settings.business.etransferEmail || "",
    phoneNumber: settings.business.phoneNumber || "",
    whatsappLink: settings.business.whatsappLink || "",
    customerName: rowData.customerName || "",
    balance: rowData.formattedBalance || "$0.00",
    numTiffins: rowData.numTiffins || "0",
    month: rowData.month || "Unknown"
  };
}

/**
 * Builds the template data object for a thank you message from row data.
 *
 * @param {Object} rowData - Data from the spreadsheet row
 * @param {Object} settings - Current settings object
 * @returns {Object} Template data object
 */
function buildThankYouTemplateData(rowData, settings) {
  // Input validation
  if (!rowData || typeof rowData !== "object") {
    Logger.log("buildThankYouTemplateData: Invalid rowData provided");
    rowData = {};
  }
  if (!settings || typeof settings !== "object" || !settings.business) {
    Logger.log("buildThankYouTemplateData: Invalid settings, using defaults");
    settings = getDefaultSettings();
  }

  return {
    businessName: settings.business.name || "",
    customerName: rowData.customerName || "",
    orderId: rowData.orderId || ""
  };
}

/**
 * Gets a specific bill message template by type.
 *
 * @param {string} templateType - Template type: "firstNotice", "followUp", or "finalNotice"
 * @param {Object} [settings] - Optional settings object (will be fetched if not provided)
 * @returns {Object} Template object with name and message properties
 * @throws {Error} If templateType is invalid
 */
function getBillTemplate(templateType, settings) {
  // Input validation for settings
  const s = (settings && typeof settings === "object" && settings.templates && settings.templates.billMessages)
    ? settings
    : getSettings();

  const validTypes = ["firstNotice", "followUp", "finalNotice"];

  if (!templateType || typeof templateType !== "string") {
    throw new Error(`Invalid template type: expected string, got ${typeof templateType}`);
  }

  if (!validTypes.includes(templateType)) {
    throw new Error(`Invalid template type: "${templateType}". Valid types are: ${validTypes.join(", ")}`);
  }

  return s.templates.billMessages[templateType];
}

/**
 * Gets all available bill template types with their display names.
 *
 * @param {Object} [settings] - Optional settings object
 * @returns {Array} Array of {id, name} objects
 */
function getBillTemplateTypes(settings) {
  // Input validation for settings
  const s = (settings && typeof settings === "object" && settings.templates && settings.templates.billMessages)
    ? settings
    : getSettings();

  const templates = s.templates.billMessages;

  return [
    { id: "firstNotice", name: templates.firstNotice?.name || "First Notice" },
    { id: "followUp", name: templates.followUp?.name || "Follow-up Reminder" },
    { id: "finalNotice", name: templates.finalNotice?.name || "Final Notice" }
  ];
}
