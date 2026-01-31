// ========================================
// SETTINGS MANAGEMENT
// Centralized configuration storage and retrieval
// ========================================

/**
 * Property key for storing app settings in UserProperties.
 * @const {string}
 */
const SETTINGS_PROPERTY_KEY = "APP_SETTINGS";

/**
 * Current settings schema version. Increment when settings structure changes.
 * @const {number}
 */
const SETTINGS_VERSION = 1;

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
      billMessage: `{{businessName}} - Monthly Bill

Please see below your total bill pending for the month of {{month}}:

Total - {{balance}}
Tiffins - {{numTiffins}}

Please e-transfer the amount to {{etransferEmail}} in the next 1-2 days. During the e-transfer, please include: your full name, phone number and month of payment to avoid any errors. If you have any questions, please call {{phoneNumber}}.

Thank you,
{{businessName}}`,
      thankYouMessage: `Hello {{customerName}},

Thank you for your payment for Order {{orderId}}. We have marked your bill as PAID.

We appreciate your business!
- {{businessName}}`
    },
    behavior: {
      dryRunMode: false,
      batchSize: 75,
      messageDelayMs: 1000,
      headerRowIndex: 1
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
    }
  };
}

/**
 * Retrieves settings from UserProperties, merging with defaults.
 * Automatically migrates from legacy config.gs constants on first call.
 *
 * @returns {Object} Current settings object
 */
function getSettings() {
  const props = PropertiesService.getUserProperties();
  const stored = props.getProperty(SETTINGS_PROPERTY_KEY);

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
      merged.version = SETTINGS_VERSION;
      saveSettings(merged);
    }

    return merged;
  } catch (e) {
    Logger.log(`Error parsing settings: ${e.message}. Using defaults.`);
    return getDefaultSettings();
  }
}

/**
 * Saves settings to UserProperties after validation.
 *
 * @param {Object} settings - Settings object to save
 * @returns {Object} Result with success boolean and optional error message
 */
function saveSettings(settings) {
  const validation = validateSettings(settings);
  if (!validation.valid) {
    Logger.log(`Settings validation failed: ${validation.errors.join(", ")}`);
    return { success: false, error: validation.errors.join(", ") };
  }

  try {
    const props = PropertiesService.getUserProperties();
    props.setProperty(SETTINGS_PROPERTY_KEY, JSON.stringify(settings));
    Logger.log("Settings saved successfully.");
    return { success: true };
  } catch (e) {
    Logger.log(`Error saving settings: ${e.message}`);
    return { success: false, error: e.message };
  }
}

/**
 * Validates a settings object for required fields and value constraints.
 *
 * @param {Object} settings - Settings object to validate
 * @returns {Object} Validation result with valid boolean and errors array
 */
function validateSettings(settings) {
  const errors = [];

  // Business validations
  if (!settings.business) {
    errors.push("Missing business section");
  } else {
    if (!settings.business.name || settings.business.name.length > 100) {
      errors.push("Business name is required and must be <= 100 characters");
    }
    if (!settings.business.etransferEmail || !isValidEmail(settings.business.etransferEmail)) {
      errors.push("Valid e-transfer email is required");
    }
    if (!settings.business.phoneNumber || settings.business.phoneNumber.length > 20) {
      errors.push("Phone number is required and must be <= 20 characters");
    }
  }

  // Template validations
  if (!settings.templates) {
    errors.push("Missing templates section");
  } else {
    if (!settings.templates.billMessage ||
        settings.templates.billMessage.length < 50 ||
        settings.templates.billMessage.length > 1600) {
      errors.push("Bill message template must be between 50-1600 characters");
    }
    if (!settings.templates.thankYouMessage ||
        settings.templates.thankYouMessage.length < 50 ||
        settings.templates.thankYouMessage.length > 1600) {
      errors.push("Thank you message template must be between 50-1600 characters");
    }
  }

  // Behavior validations
  if (!settings.behavior) {
    errors.push("Missing behavior section");
  } else {
    if (typeof settings.behavior.batchSize !== "number" ||
        settings.behavior.batchSize < 1 ||
        settings.behavior.batchSize > 200) {
      errors.push("Batch size must be a number between 1-200");
    }
    if (typeof settings.behavior.messageDelayMs !== "number" ||
        settings.behavior.messageDelayMs < 500 ||
        settings.behavior.messageDelayMs > 5000) {
      errors.push("Message delay must be between 500-5000ms");
    }
    if (typeof settings.behavior.headerRowIndex !== "number" ||
        settings.behavior.headerRowIndex < 1) {
      errors.push("Header row index must be >= 1");
    }
  }

  // Color validations
  if (!settings.colors) {
    errors.push("Missing colors section");
  } else {
    const colorFields = ["success", "error", "dryRun"];
    colorFields.forEach(field => {
      if (!settings.colors[field] || !isValidHexColor(settings.colors[field])) {
        errors.push(`Invalid hex color for ${field}`);
      }
    });
  }

  // Column validations
  if (!settings.columns) {
    errors.push("Missing columns section");
  } else {
    const requiredColumns = ["phoneNumber", "customerName", "balance", "numTiffins",
                            "dueDate", "messageStatus", "orderId", "paymentStatus"];
    requiredColumns.forEach(col => {
      if (!settings.columns[col] || typeof settings.columns[col] !== "string") {
        errors.push(`Missing or invalid column mapping for ${col}`);
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
 */
function processTemplate(template, data) {
  if (!template || typeof template !== "string") {
    return "";
  }

  let result = template;

  // Replace all {{placeholder}} patterns
  const placeholderRegex = /\{\{(\w+)\}\}/g;
  result = result.replace(placeholderRegex, (match, key) => {
    if (data.hasOwnProperty(key) && data[key] !== undefined && data[key] !== null) {
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
    migrated.behavior.dryRunMode = typeof DRY_RUN_MODE !== "undefined" ? DRY_RUN_MODE : false;
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
 * Resets all settings to defaults.
 *
 * @returns {Object} Result with success boolean
 */
function resetToDefaults() {
  const defaults = getDefaultSettings();
  return saveSettings(defaults);
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

    return saveSettings(parsed);
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
 *
 * @param {Object} target - Target object (defaults)
 * @param {Object} source - Source object (stored values)
 * @returns {Object} Merged object
 */
function deepMerge(target, source) {
  const result = { ...target };

  for (const key in source) {
    if (source.hasOwnProperty(key)) {
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
  return {
    businessName: settings.business.name,
    etransferEmail: settings.business.etransferEmail,
    phoneNumber: settings.business.phoneNumber,
    whatsappLink: settings.business.whatsappLink,
    customerName: "John Doe",
    balance: "$150.00",
    numTiffins: "30",
    month: "January",
    orderId: "ORD-2024-001"
  };
}

/**
 * Builds the template data object for a bill message from row data.
 *
 * @param {Object} rowData - Data from the spreadsheet row
 * @param {Object} settings - Current settings object
 * @returns {Object} Template data object
 */
function buildBillTemplateData(rowData, settings) {
  return {
    businessName: settings.business.name,
    etransferEmail: settings.business.etransferEmail,
    phoneNumber: settings.business.phoneNumber,
    whatsappLink: settings.business.whatsappLink,
    customerName: rowData.customerName,
    balance: rowData.formattedBalance,
    numTiffins: rowData.numTiffins,
    month: rowData.month
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
  return {
    businessName: settings.business.name,
    customerName: rowData.customerName,
    orderId: rowData.orderId
  };
}
