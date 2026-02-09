// ========================================
// TEMPLATE MANAGER
// Template processing, preview data builders,
// and template type lookups.
// ========================================

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

  // Try to use real customer data if testOrderId is configured
  const testOrderId = settings.behavior.testOrderId;
  if (testOrderId) {
    try {
      const lookup = lookupCustomerByOrderId_(testOrderId);
      if (lookup.success) {
        return Object.assign({}, businessData, {
          customerName: String(lookup.data.name || ""),
          balance: formatBalance_(lookup.data.balance),
          numTiffins: String(lookup.data.tiffins || "0"),
          month: getMonthFromValue_(lookup.data.dueDate),
          orderId: testOrderId
        });
      }
    } catch (e) {
      Logger.log("getSampleDataForPreview: test customer lookup failed: " + e.message);
    }
  }

  // Fallback to hardcoded sample data
  return Object.assign({}, businessData, {
    customerName: "John Doe",
    balance: "$150.00",
    numTiffins: "30",
    month: "January",
    orderId: "ORD-2024-001"
  });
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
