// ========================================
// UNIT TESTS FOR SETTINGS-MANAGER.GS
// Run via: runAllSettingsManagerTests()
// ========================================

/**
 * Test isolation utilities for backing up and restoring UserProperties.
 * Prevents tests from interfering with each other or production data.
 */
const TestIsolation = {
  _backup: null,

  /**
   * Backs up the current APP_SETTINGS before running tests.
   */
  setup: function() {
    const props = PropertiesService.getUserProperties();
    this._backup = props.getProperty(SETTINGS_PROPERTY_KEY);
    Logger.log("TestIsolation: Settings backed up");
  },

  /**
   * Restores the original APP_SETTINGS after tests complete.
   */
  teardown: function() {
    const props = PropertiesService.getUserProperties();
    if (this._backup !== null) {
      props.setProperty(SETTINGS_PROPERTY_KEY, this._backup);
      Logger.log("TestIsolation: Settings restored from backup");
    } else {
      props.deleteProperty(SETTINGS_PROPERTY_KEY);
      Logger.log("TestIsolation: Settings cleared (no backup existed)");
    }
  },

  /**
   * Clears APP_SETTINGS for a clean test environment.
   */
  clearSettings: function() {
    PropertiesService.getUserProperties().deleteProperty(SETTINGS_PROPERTY_KEY);
  }
};

/**
 * Simple test framework for Google Apps Script.
 * Tracks passed/failed tests and provides assertions.
 */
const TestRunner = {
  passed: 0,
  failed: 0,
  errors: [],

  reset: function() {
    this.passed = 0;
    this.failed = 0;
    this.errors = [];
  },

  assertEqual: function(actual, expected, message) {
    if (actual === expected) {
      this.passed++;
      return true;
    } else {
      this.failed++;
      this.errors.push(`FAIL: ${message}\n  Expected: ${JSON.stringify(expected)}\n  Actual: ${JSON.stringify(actual)}`);
      return false;
    }
  },

  assertDeepEqual: function(actual, expected, message) {
    if (JSON.stringify(actual) === JSON.stringify(expected)) {
      this.passed++;
      return true;
    } else {
      this.failed++;
      this.errors.push(`FAIL: ${message}\n  Expected: ${JSON.stringify(expected)}\n  Actual: ${JSON.stringify(actual)}`);
      return false;
    }
  },

  assertTrue: function(value, message) {
    if (value === true) {
      this.passed++;
      return true;
    } else {
      this.failed++;
      this.errors.push(`FAIL: ${message}\n  Expected: true\n  Actual: ${value}`);
      return false;
    }
  },

  assertFalse: function(value, message) {
    if (value === false) {
      this.passed++;
      return true;
    } else {
      this.failed++;
      this.errors.push(`FAIL: ${message}\n  Expected: false\n  Actual: ${value}`);
      return false;
    }
  },

  assertThrows: function(fn, message) {
    try {
      fn();
      this.failed++;
      this.errors.push(`FAIL: ${message}\n  Expected: function to throw\n  Actual: no error thrown`);
      return false;
    } catch (e) {
      this.passed++;
      return true;
    }
  },

  assertNotNull: function(value, message) {
    if (value !== null && value !== undefined) {
      this.passed++;
      return true;
    } else {
      this.failed++;
      this.errors.push(`FAIL: ${message}\n  Expected: non-null value\n  Actual: ${value}`);
      return false;
    }
  },

  assertContains: function(str, substring, message) {
    if (typeof str === 'string' && str.includes(substring)) {
      this.passed++;
      return true;
    } else {
      this.failed++;
      this.errors.push(`FAIL: ${message}\n  Expected string to contain: "${substring}"\n  Actual: "${str}"`);
      return false;
    }
  },

  getSummary: function() {
    let summary = `\n========================================\n`;
    summary += `TEST RESULTS: ${this.passed} passed, ${this.failed} failed\n`;
    summary += `========================================\n`;
    if (this.errors.length > 0) {
      summary += `\nFailures:\n`;
      this.errors.forEach((err, i) => {
        summary += `\n${i + 1}. ${err}\n`;
      });
    }
    return summary;
  }
};

// ========================================
// TEST: isValidEmail()
// ========================================

function test_isValidEmail_validEmails() {
  TestRunner.assertTrue(isValidEmail("test@example.com"), "Standard email should be valid");
  TestRunner.assertTrue(isValidEmail("user.name@domain.co.uk"), "Email with dots and subdomains");
  TestRunner.assertTrue(isValidEmail("user+tag@example.org"), "Email with plus sign");
  TestRunner.assertTrue(isValidEmail("a@b.co"), "Minimal valid email");
}

function test_isValidEmail_invalidEmails() {
  TestRunner.assertFalse(isValidEmail(""), "Empty string should be invalid");
  TestRunner.assertFalse(isValidEmail(null), "Null should be invalid");
  TestRunner.assertFalse(isValidEmail(undefined), "Undefined should be invalid");
  TestRunner.assertFalse(isValidEmail("notanemail"), "Missing @ should be invalid");
  TestRunner.assertFalse(isValidEmail("@nodomain.com"), "Missing local part should be invalid");
  TestRunner.assertFalse(isValidEmail("user@"), "Missing domain should be invalid");
  TestRunner.assertFalse(isValidEmail("user@domain"), "Missing TLD should be invalid");
  TestRunner.assertFalse(isValidEmail(12345), "Number should be invalid");
  TestRunner.assertFalse(isValidEmail("user @example.com"), "Email with space should be invalid");
}

// ========================================
// TEST: isValidHexColor()
// ========================================

function test_isValidHexColor_validColors() {
  TestRunner.assertTrue(isValidHexColor("#000000"), "Black should be valid");
  TestRunner.assertTrue(isValidHexColor("#FFFFFF"), "White uppercase should be valid");
  TestRunner.assertTrue(isValidHexColor("#ffffff"), "White lowercase should be valid");
  TestRunner.assertTrue(isValidHexColor("#d9ead3"), "Mixed case hex should be valid");
  TestRunner.assertTrue(isValidHexColor("#AbCdEf"), "Mixed case hex should be valid");
  TestRunner.assertTrue(isValidHexColor("#123456"), "Numeric hex should be valid");
}

function test_isValidHexColor_invalidColors() {
  TestRunner.assertFalse(isValidHexColor(""), "Empty string should be invalid");
  TestRunner.assertFalse(isValidHexColor(null), "Null should be invalid");
  TestRunner.assertFalse(isValidHexColor(undefined), "Undefined should be invalid");
  TestRunner.assertFalse(isValidHexColor("#fff"), "Short hex (3 chars) should be invalid");
  TestRunner.assertFalse(isValidHexColor("000000"), "Missing # should be invalid");
  TestRunner.assertFalse(isValidHexColor("#0000000"), "Too long (7 chars) should be invalid");
  TestRunner.assertFalse(isValidHexColor("#GGGGGG"), "Invalid hex chars should be invalid");
  TestRunner.assertFalse(isValidHexColor("#12345"), "5 chars should be invalid");
  TestRunner.assertFalse(isValidHexColor("red"), "Color name should be invalid");
  TestRunner.assertFalse(isValidHexColor(123456), "Number should be invalid");
}

// ========================================
// TEST: deepMerge()
// ========================================

function test_deepMerge_simpleObjects() {
  const target = { a: 1, b: 2 };
  const source = { b: 3, c: 4 };
  const result = deepMerge(target, source);

  TestRunner.assertEqual(result.a, 1, "deepMerge should preserve target-only keys");
  TestRunner.assertEqual(result.b, 3, "deepMerge should override with source values");
  TestRunner.assertEqual(result.c, 4, "deepMerge should add source-only keys");
}

function test_deepMerge_nestedObjects() {
  const target = {
    level1: {
      a: 1,
      level2: { x: 10, y: 20 }
    }
  };
  const source = {
    level1: {
      b: 2,
      level2: { y: 30, z: 40 }
    }
  };
  const result = deepMerge(target, source);

  TestRunner.assertEqual(result.level1.a, 1, "deepMerge should preserve nested target keys");
  TestRunner.assertEqual(result.level1.b, 2, "deepMerge should add nested source keys");
  TestRunner.assertEqual(result.level1.level2.x, 10, "deepMerge should preserve deeply nested keys");
  TestRunner.assertEqual(result.level1.level2.y, 30, "deepMerge should override deeply nested values");
  TestRunner.assertEqual(result.level1.level2.z, 40, "deepMerge should add deeply nested keys");
}

function test_deepMerge_arrays() {
  const target = { arr: [1, 2, 3] };
  const source = { arr: [4, 5] };
  const result = deepMerge(target, source);

  TestRunner.assertDeepEqual(result.arr, [4, 5], "deepMerge should replace arrays (not merge)");
}

function test_deepMerge_nullAndUndefined() {
  const target = { a: 1, b: 2 };
  const source = { a: null, c: undefined };
  const result = deepMerge(target, source);

  TestRunner.assertEqual(result.a, null, "deepMerge should allow null values");
  TestRunner.assertEqual(result.c, undefined, "deepMerge should allow undefined values");
  TestRunner.assertEqual(result.b, 2, "deepMerge should preserve unaffected keys");
}

function test_deepMerge_emptyObjects() {
  const result1 = deepMerge({}, { a: 1 });
  const result2 = deepMerge({ a: 1 }, {});

  TestRunner.assertEqual(result1.a, 1, "deepMerge with empty target should return source");
  TestRunner.assertEqual(result2.a, 1, "deepMerge with empty source should return target");
}

// ========================================
// TEST: processTemplate()
// ========================================

function test_processTemplate_basicReplacement() {
  const template = "Hello {{name}}, your balance is {{balance}}.";
  const data = { name: "John", balance: "$100.00" };
  const result = processTemplate(template, data);

  TestRunner.assertEqual(result, "Hello John, your balance is $100.00.", "Basic placeholder replacement");
}

function test_processTemplate_multipleSamePlaceholder() {
  const template = "{{name}} owes {{balance}}. Pay now, {{name}}!";
  const data = { name: "Jane", balance: "$50" };
  const result = processTemplate(template, data);

  TestRunner.assertEqual(result, "Jane owes $50. Pay now, Jane!", "Multiple same placeholders");
}

function test_processTemplate_missingPlaceholderValue() {
  const template = "Hello {{name}}, your code is {{code}}.";
  const data = { name: "Bob" };
  const result = processTemplate(template, data);

  TestRunner.assertContains(result, "Hello Bob", "Should replace available placeholders");
  TestRunner.assertContains(result, "{{code}}", "Should keep missing placeholders");
}

function test_processTemplate_noPlaceholders() {
  const template = "This is a plain message with no placeholders.";
  const data = { name: "Test" };
  const result = processTemplate(template, data);

  TestRunner.assertEqual(result, template, "Template without placeholders should be unchanged");
}

function test_processTemplate_emptyData() {
  const template = "Hello {{name}}!";
  const result = processTemplate(template, {});

  TestRunner.assertEqual(result, "Hello {{name}}!", "Empty data should keep all placeholders");
}

function test_processTemplate_nullData() {
  const template = "Hello {{name}}!";
  const result = processTemplate(template, null);

  TestRunner.assertEqual(result, "Hello {{name}}!", "Null data should keep all placeholders");
}

function test_processTemplate_invalidTemplate() {
  TestRunner.assertThrows(() => processTemplate(null, {}), "Null template should throw");
  TestRunner.assertThrows(() => processTemplate(undefined, {}), "Undefined template should throw");
  TestRunner.assertThrows(() => processTemplate("", {}), "Empty template should throw");
  TestRunner.assertThrows(() => processTemplate(123, {}), "Number template should throw");
}

function test_processTemplate_specialCharactersInValues() {
  const template = "Message: {{content}}";
  const data = { content: "Test with $pecial ch@rs & symbols!" };
  const result = processTemplate(template, data);

  TestRunner.assertEqual(result, "Message: Test with $pecial ch@rs & symbols!", "Special characters should be preserved");
}

function test_processTemplate_numericValues() {
  const template = "Count: {{count}}, Price: {{price}}";
  const data = { count: 42, price: 99.99 };
  const result = processTemplate(template, data);

  TestRunner.assertEqual(result, "Count: 42, Price: 99.99", "Numeric values should be converted to strings");
}

function test_processTemplate_multilineTemplate() {
  const template = "Line 1: {{a}}\nLine 2: {{b}}\nLine 3: {{c}}";
  const data = { a: "A", b: "B", c: "C" };
  const result = processTemplate(template, data);

  TestRunner.assertEqual(result, "Line 1: A\nLine 2: B\nLine 3: C", "Multiline templates should work");
}

// ========================================
// TEST: getDefaultSettings()
// ========================================

function test_getDefaultSettings_structure() {
  const defaults = getDefaultSettings();

  TestRunner.assertNotNull(defaults.version, "Should have version");
  TestRunner.assertNotNull(defaults.business, "Should have business section");
  TestRunner.assertNotNull(defaults.templates, "Should have templates section");
  TestRunner.assertNotNull(defaults.behavior, "Should have behavior section");
  TestRunner.assertNotNull(defaults.colors, "Should have colors section");
  TestRunner.assertNotNull(defaults.columns, "Should have columns section");
}

function test_getDefaultSettings_businessDefaults() {
  const defaults = getDefaultSettings();

  TestRunner.assertNotNull(defaults.business.name, "Should have business name");
  TestRunner.assertNotNull(defaults.business.etransferEmail, "Should have etransfer email");
  TestRunner.assertNotNull(defaults.business.phoneNumber, "Should have phone number");
  TestRunner.assertNotNull(defaults.business.whatsappLink, "Should have whatsapp link");
  TestRunner.assertTrue(isValidEmail(defaults.business.etransferEmail), "Default email should be valid");
}

function test_getDefaultSettings_behaviorDefaults() {
  const defaults = getDefaultSettings();

  TestRunner.assertEqual(typeof defaults.behavior.dryRunMode, "boolean", "dryRunMode should be boolean");
  TestRunner.assertEqual(typeof defaults.behavior.batchSize, "number", "batchSize should be number");
  TestRunner.assertEqual(typeof defaults.behavior.messageDelayMs, "number", "messageDelayMs should be number");
  TestRunner.assertEqual(typeof defaults.behavior.headerRowIndex, "number", "headerRowIndex should be number");
  TestRunner.assertTrue(defaults.behavior.batchSize >= 1 && defaults.behavior.batchSize <= 200, "batchSize in valid range");
  TestRunner.assertTrue(defaults.behavior.messageDelayMs >= 500, "messageDelayMs at least 500");
  TestRunner.assertTrue(defaults.behavior.headerRowIndex >= 1, "headerRowIndex at least 1");
}

function test_getDefaultSettings_colorDefaults() {
  const defaults = getDefaultSettings();

  TestRunner.assertTrue(isValidHexColor(defaults.colors.success), "Success color should be valid hex");
  TestRunner.assertTrue(isValidHexColor(defaults.colors.error), "Error color should be valid hex");
  TestRunner.assertTrue(isValidHexColor(defaults.colors.dryRun), "DryRun color should be valid hex");
}

function test_getDefaultSettings_columnDefaults() {
  const defaults = getDefaultSettings();
  const requiredCols = ["phoneNumber", "customerName", "balance", "numTiffins",
                        "dueDate", "messageStatus", "orderId", "paymentStatus"];

  requiredCols.forEach(col => {
    TestRunner.assertNotNull(defaults.columns[col], `Should have column mapping for ${col}`);
    TestRunner.assertEqual(typeof defaults.columns[col], "string", `Column ${col} should be string`);
  });
}

function test_getDefaultSettings_templateDefaults() {
  const defaults = getDefaultSettings();

  TestRunner.assertNotNull(defaults.templates.billMessages, "Should have billMessages");
  TestRunner.assertNotNull(defaults.templates.billMessages.firstNotice, "Should have firstNotice template");
  TestRunner.assertNotNull(defaults.templates.billMessages.followUp, "Should have followUp template");
  TestRunner.assertNotNull(defaults.templates.billMessages.finalNotice, "Should have finalNotice template");
  TestRunner.assertNotNull(defaults.templates.thankYouMessage, "Should have thankYouMessage");

  // Check template structure
  TestRunner.assertNotNull(defaults.templates.billMessages.firstNotice.name, "firstNotice should have name");
  TestRunner.assertNotNull(defaults.templates.billMessages.firstNotice.message, "firstNotice should have message");
}

// ========================================
// TEST: validateSettings()
// ========================================

function test_validateSettings_validDefaults() {
  const defaults = getDefaultSettings();
  const result = validateSettings(defaults);

  TestRunner.assertTrue(result.valid, "Default settings should be valid");
  TestRunner.assertEqual(result.errors.length, 0, "Default settings should have no errors");
}

function test_validateSettings_missingBusiness() {
  const settings = getDefaultSettings();
  delete settings.business;
  const result = validateSettings(settings);

  TestRunner.assertFalse(result.valid, "Missing business should be invalid");
  TestRunner.assertTrue(result.errors.some(e => e.message && e.message.toLowerCase().includes("business")), "Should report business error");
}

function test_validateSettings_invalidEmail() {
  const settings = getDefaultSettings();
  settings.business.etransferEmail = "notanemail";
  const result = validateSettings(settings);

  TestRunner.assertFalse(result.valid, "Invalid email should be invalid");
  TestRunner.assertTrue(result.errors.some(e => e.message && e.message.toLowerCase().includes("email")), "Should report email error");
}

function test_validateSettings_businessNameTooLong() {
  const settings = getDefaultSettings();
  settings.business.name = "A".repeat(101);
  const result = validateSettings(settings);

  TestRunner.assertFalse(result.valid, "Business name > 100 chars should be invalid");
}

function test_validateSettings_missingTemplates() {
  const settings = getDefaultSettings();
  delete settings.templates;
  const result = validateSettings(settings);

  TestRunner.assertFalse(result.valid, "Missing templates should be invalid");
}

function test_validateSettings_templateTooShort() {
  const settings = getDefaultSettings();
  settings.templates.billMessages.firstNotice.message = "Too short";
  const result = validateSettings(settings);

  TestRunner.assertFalse(result.valid, "Template < 50 chars should be invalid");
}

function test_validateSettings_templateTooLong() {
  const settings = getDefaultSettings();
  settings.templates.billMessages.firstNotice.message = "X".repeat(1601);
  const result = validateSettings(settings);

  TestRunner.assertFalse(result.valid, "Template > 1600 chars should be invalid");
}

function test_validateSettings_invalidBatchSize() {
  const settings = getDefaultSettings();

  settings.behavior.batchSize = 0;
  let result = validateSettings(settings);
  TestRunner.assertFalse(result.valid, "batchSize 0 should be invalid");

  settings.behavior.batchSize = 201;
  result = validateSettings(settings);
  TestRunner.assertFalse(result.valid, "batchSize 201 should be invalid");

  settings.behavior.batchSize = "fifty";
  result = validateSettings(settings);
  TestRunner.assertFalse(result.valid, "batchSize as string should be invalid");
}

function test_validateSettings_invalidMessageDelay() {
  const settings = getDefaultSettings();

  settings.behavior.messageDelayMs = 499;
  let result = validateSettings(settings);
  TestRunner.assertFalse(result.valid, "messageDelayMs < 500 should be invalid");

  settings.behavior.messageDelayMs = 5001;
  result = validateSettings(settings);
  TestRunner.assertFalse(result.valid, "messageDelayMs > 5000 should be invalid");
}

function test_validateSettings_invalidHeaderRowIndex() {
  const settings = getDefaultSettings();
  settings.behavior.headerRowIndex = 0;
  const result = validateSettings(settings);

  TestRunner.assertFalse(result.valid, "headerRowIndex 0 should be invalid");
}

function test_validateSettings_invalidColors() {
  const settings = getDefaultSettings();
  settings.colors.success = "red";
  const result = validateSettings(settings);

  TestRunner.assertFalse(result.valid, "Invalid color name should be invalid");
}

function test_validateSettings_missingColumns() {
  const settings = getDefaultSettings();
  delete settings.columns.phoneNumber;
  const result = validateSettings(settings);

  TestRunner.assertFalse(result.valid, "Missing column mapping should be invalid");
}

// ========================================
// TEST: getBillTemplate()
// ========================================

function test_getBillTemplate_validTypes() {
  const settings = getDefaultSettings();

  const firstNotice = getBillTemplate("firstNotice", settings);
  const followUp = getBillTemplate("followUp", settings);
  const finalNotice = getBillTemplate("finalNotice", settings);

  TestRunner.assertNotNull(firstNotice.name, "firstNotice should have name");
  TestRunner.assertNotNull(firstNotice.message, "firstNotice should have message");
  TestRunner.assertNotNull(followUp.name, "followUp should have name");
  TestRunner.assertNotNull(finalNotice.name, "finalNotice should have name");
}

// Removed: test_getBillTemplate_invalidType - replaced by test_getBillTemplate_throwsOnInvalidType
// which tests that invalid types throw errors instead of silently falling back

// ========================================
// TEST: getBillTemplateTypes()
// ========================================

function test_getBillTemplateTypes_structure() {
  const settings = getDefaultSettings();
  const types = getBillTemplateTypes(settings);

  TestRunner.assertEqual(types.length, 3, "Should return 3 template types");
  TestRunner.assertEqual(types[0].id, "firstNotice", "First should be firstNotice");
  TestRunner.assertEqual(types[1].id, "followUp", "Second should be followUp");
  TestRunner.assertEqual(types[2].id, "finalNotice", "Third should be finalNotice");

  types.forEach(t => {
    TestRunner.assertNotNull(t.id, "Each type should have id");
    TestRunner.assertNotNull(t.name, "Each type should have name");
  });
}

// ========================================
// TEST: buildBillTemplateData()
// ========================================

function test_buildBillTemplateData_structure() {
  const settings = getDefaultSettings();
  const rowData = {
    customerName: "Test Customer",
    formattedBalance: "$200.00",
    numTiffins: 20,
    month: "February"
  };

  const result = buildBillTemplateData(rowData, settings);

  TestRunner.assertEqual(result.businessName, settings.business.name, "Should include businessName");
  TestRunner.assertEqual(result.etransferEmail, settings.business.etransferEmail, "Should include etransferEmail");
  TestRunner.assertEqual(result.phoneNumber, settings.business.phoneNumber, "Should include phoneNumber");
  TestRunner.assertEqual(result.whatsappLink, settings.business.whatsappLink, "Should include whatsappLink");
  TestRunner.assertEqual(result.customerName, "Test Customer", "Should include customerName from rowData");
  TestRunner.assertEqual(result.balance, "$200.00", "Should include balance from rowData");
  TestRunner.assertEqual(result.numTiffins, 20, "Should include numTiffins from rowData");
  TestRunner.assertEqual(result.month, "February", "Should include month from rowData");
}

// ========================================
// TEST: buildThankYouTemplateData()
// ========================================

function test_buildThankYouTemplateData_structure() {
  const settings = getDefaultSettings();
  const rowData = {
    customerName: "Thank You Customer",
    orderId: "ORD-12345"
  };

  const result = buildThankYouTemplateData(rowData, settings);

  TestRunner.assertEqual(result.businessName, settings.business.name, "Should include businessName");
  TestRunner.assertEqual(result.customerName, "Thank You Customer", "Should include customerName");
  TestRunner.assertEqual(result.orderId, "ORD-12345", "Should include orderId");
}

// ========================================
// TEST: migrateSettingsVersion()
// ========================================

function test_migrateSettingsVersion_v1ToV2() {
  const v1Settings = {
    version: 1,
    templates: {
      billMessage: "This is the old single bill message template with enough characters to pass validation and more text here.",
      thankYouMessage: getDefaultSettings().templates.thankYouMessage
    },
    business: getDefaultSettings().business,
    behavior: getDefaultSettings().behavior,
    colors: getDefaultSettings().colors,
    columns: getDefaultSettings().columns
  };

  const merged = deepMerge(getDefaultSettings(), v1Settings);
  const result = migrateSettingsVersion(v1Settings, merged);

  TestRunner.assertNotNull(result.templates.billMessages, "Should have billMessages after migration");
  TestRunner.assertEqual(result.templates.billMessages.firstNotice.message, v1Settings.templates.billMessage,
    "firstNotice should contain old billMessage");
  TestRunner.assertEqual(result.templates.billMessage, undefined, "Old billMessage field should be removed");
}

function test_migrateSettingsVersion_noMigrationNeeded() {
  const v2Settings = getDefaultSettings();
  v2Settings.version = 2;

  const merged = deepMerge(getDefaultSettings(), v2Settings);
  const result = migrateSettingsVersion(v2Settings, merged);

  // Should return merged settings unchanged
  TestRunner.assertDeepEqual(result.templates.billMessages, merged.templates.billMessages,
    "No migration needed for v2 settings");
}

// ========================================
// TEST: importSettings() and exportSettings()
// ========================================

function test_importSettings_validJson() {
  const settings = getDefaultSettings();
  const json = JSON.stringify(settings);

  // Note: This test modifies actual storage, should be followed by cleanup
  const result = importSettings(json);

  TestRunner.assertTrue(result.success, "Valid JSON should import successfully");
}

function test_importSettings_invalidJson() {
  const result = importSettings("not valid json");

  TestRunner.assertFalse(result.success, "Invalid JSON should fail");
  TestRunner.assertContains(result.error, "parse", "Error should mention parsing");
}

function test_importSettings_invalidSettings() {
  const invalidSettings = {
    version: 2,
    business: { name: "" } // Invalid: empty name
  };
  const result = importSettings(JSON.stringify(invalidSettings));

  TestRunner.assertFalse(result.success, "Invalid settings should fail");
  TestRunner.assertNotNull(result.error, "Should have error message");
}

function test_exportSettings_format() {
  const exported = exportSettings();

  // Should be valid JSON
  let parsed;
  try {
    parsed = JSON.parse(exported);
    TestRunner.assertTrue(true, "Exported settings should be valid JSON");
  } catch (e) {
    TestRunner.assertFalse(true, "Exported settings should be valid JSON");
    return;
  }

  TestRunner.assertNotNull(parsed.version, "Exported should have version");
  TestRunner.assertNotNull(parsed.business, "Exported should have business");
}

// ========================================
// TEST: getSampleDataForPreview()
// ========================================

function test_getSampleDataForPreview_structure() {
  const sample = getSampleDataForPreview();

  TestRunner.assertNotNull(sample.businessName, "Should have businessName");
  TestRunner.assertNotNull(sample.etransferEmail, "Should have etransferEmail");
  TestRunner.assertNotNull(sample.phoneNumber, "Should have phoneNumber");
  TestRunner.assertNotNull(sample.whatsappLink, "Should have whatsappLink");
  TestRunner.assertNotNull(sample.customerName, "Should have customerName");
  TestRunner.assertNotNull(sample.balance, "Should have balance");
  TestRunner.assertNotNull(sample.numTiffins, "Should have numTiffins");
  TestRunner.assertNotNull(sample.month, "Should have month");
  TestRunner.assertNotNull(sample.orderId, "Should have orderId");
}

function test_getSampleDataForPreview_usesCurrentSettings() {
  const settings = getSettings();
  const sample = getSampleDataForPreview();

  TestRunner.assertEqual(sample.businessName, settings.business.name,
    "Sample businessName should match current settings");
  TestRunner.assertEqual(sample.etransferEmail, settings.business.etransferEmail,
    "Sample etransferEmail should match current settings");
}

// ========================================
// TEST: getSettings() (with test isolation)
// ========================================

function test_getSettings_returnsDefaultsWhenNoSettings() {
  TestIsolation.clearSettings();
  const settings = getSettings();

  TestRunner.assertNotNull(settings, "getSettings should return an object");
  TestRunner.assertEqual(settings.version, SETTINGS_VERSION, "Should have current version");
  TestRunner.assertNotNull(settings.business, "Should have business section");
  TestRunner.assertNotNull(settings.templates, "Should have templates section");
}

function test_getSettings_returnsSavedSettings() {
  TestIsolation.clearSettings();
  const customSettings = getDefaultSettings();
  customSettings.business.name = "Test Business Name";
  saveSettings(customSettings);

  const retrieved = getSettings();
  TestRunner.assertEqual(retrieved.business.name, "Test Business Name",
    "Should return saved custom business name");
}

function test_getSettings_mergesWithDefaults() {
  TestIsolation.clearSettings();
  // Save partial settings (missing some fields)
  const partialSettings = {
    version: SETTINGS_VERSION,
    business: { name: "Partial Business" }
  };
  PropertiesService.getUserProperties().setProperty(SETTINGS_PROPERTY_KEY, JSON.stringify(partialSettings));

  const retrieved = getSettings();
  TestRunner.assertEqual(retrieved.business.name, "Partial Business", "Should keep custom value");
  TestRunner.assertNotNull(retrieved.business.etransferEmail, "Should fill in missing defaults");
  TestRunner.assertNotNull(retrieved.templates, "Should fill in missing sections");
}

// ========================================
// TEST: saveSettings()
// ========================================

function test_saveSettings_validSettings() {
  TestIsolation.clearSettings();
  const settings = getDefaultSettings();
  const result = saveSettings(settings);

  TestRunner.assertTrue(result.success, "Should successfully save valid settings");
  TestRunner.assertEqual(result.error, undefined, "Should have no error on success");
}

function test_saveSettings_invalidSettings() {
  TestIsolation.clearSettings();
  const invalidSettings = { business: {} }; // Missing required fields
  const result = saveSettings(invalidSettings);

  TestRunner.assertFalse(result.success, "Should fail for invalid settings");
  TestRunner.assertNotNull(result.error, "Should have error message");
}

function test_saveSettings_persistsToProperties() {
  TestIsolation.clearSettings();
  const settings = getDefaultSettings();
  settings.business.name = "Persisted Test Name";
  saveSettings(settings);

  const stored = PropertiesService.getUserProperties().getProperty(SETTINGS_PROPERTY_KEY);
  const parsed = JSON.parse(stored);
  TestRunner.assertEqual(parsed.business.name, "Persisted Test Name",
    "Settings should be persisted to UserProperties");
}

// ========================================
// TEST: migrateFromLegacyConfig()
// ========================================

function test_migrateFromLegacyConfig_whenNoLegacyConfig() {
  // This test checks behavior when legacy constants don't exist
  // In practice, if config.gs is loaded, they will exist
  TestIsolation.clearSettings();

  // Call getSettings which will trigger migration attempt
  const settings = getSettings();

  // Should still return valid settings (defaults)
  TestRunner.assertNotNull(settings, "Should return settings even without legacy config");
  TestRunner.assertEqual(settings.version, SETTINGS_VERSION, "Should have current version");
}

function test_migrateFromLegacyConfig_migratesOnFirstCall() {
  TestIsolation.clearSettings();

  // First call should trigger migration (if legacy config exists) or create defaults
  const settings = getSettings();

  // Verify settings were saved
  const stored = PropertiesService.getUserProperties().getProperty(SETTINGS_PROPERTY_KEY);
  TestRunner.assertNotNull(stored, "Settings should be saved after migration/initialization");

  const parsed = JSON.parse(stored);
  TestRunner.assertEqual(parsed.version, SETTINGS_VERSION, "Saved settings should have current version");
}

// ========================================
// TEST: deepMerge() prototype pollution protection
// ========================================

function test_deepMerge_prototypePollutionProtection() {
  const target = { a: 1 };
  const maliciousSource = JSON.parse('{"__proto__": {"polluted": true}, "b": 2}');

  const result = deepMerge(target, maliciousSource);

  TestRunner.assertEqual(result.a, 1, "Should preserve target values");
  TestRunner.assertEqual(result.b, 2, "Should merge safe keys");
  TestRunner.assertEqual(({}).polluted, undefined, "Object prototype should not be polluted");
}

// ========================================
// TEST: getBillTemplate() with error handling
// ========================================

function test_getBillTemplate_throwsOnInvalidType() {
  const settings = getDefaultSettings();

  TestRunner.assertThrows(
    () => getBillTemplate("nonExistentType", settings),
    "Should throw for non-existent template type"
  );

  TestRunner.assertThrows(
    () => getBillTemplate(null, settings),
    "Should throw for null template type"
  );

  TestRunner.assertThrows(
    () => getBillTemplate(123, settings),
    "Should throw for non-string template type"
  );
}

// ========================================
// INTEGRATION TEST: Full Template Processing
// ========================================

function test_integration_fullTemplateProcessing() {
  const settings = getDefaultSettings();
  const template = getBillTemplate("firstNotice", settings);
  const rowData = {
    customerName: "Integration Test",
    formattedBalance: "$123.45",
    numTiffins: 15,
    month: "March"
  };
  const data = buildBillTemplateData(rowData, settings);
  const result = processTemplate(template.message, data);

  TestRunner.assertContains(result, settings.business.name, "Should contain business name");
  TestRunner.assertContains(result, "Integration Test", "Should contain customer name");
  TestRunner.assertContains(result, "$123.45", "Should contain balance");
  TestRunner.assertContains(result, "15", "Should contain tiffins");
  TestRunner.assertContains(result, "March", "Should contain month");
  TestRunner.assertContains(result, settings.business.etransferEmail, "Should contain email");
  TestRunner.assertFalse(result.includes("{{"), "Should have no remaining placeholders");
}

function test_integration_thankYouTemplateProcessing() {
  const settings = getDefaultSettings();
  const template = settings.templates.thankYouMessage;
  const rowData = {
    customerName: "Thank You Test",
    orderId: "ORD-99999"
  };
  const data = buildThankYouTemplateData(rowData, settings);
  const result = processTemplate(template, data);

  TestRunner.assertContains(result, settings.business.name, "Should contain business name");
  TestRunner.assertContains(result, "Thank You Test", "Should contain customer name");
  TestRunner.assertContains(result, "ORD-99999", "Should contain order ID");
  TestRunner.assertFalse(result.includes("{{"), "Should have no remaining placeholders");
}

// ========================================
// AUTO-DETECT COLUMNS TESTS
// ========================================

function test_normalizeHeader_basicNormalization() {
  Logger.log("Testing normalizeHeader - basic normalization...");

  TestRunner.assertEqual(normalizeHeader("Phone Number"), "phone number", "Should lowercase and preserve spaces");
  TestRunner.assertEqual(normalizeHeader("  Customer Name  "), "customer name", "Should trim whitespace");
  TestRunner.assertEqual(normalizeHeader("Order_ID"), "orderid", "Should remove underscores");
  TestRunner.assertEqual(normalizeHeader("Phone #"), "phone", "Should remove special characters");
  TestRunner.assertEqual(normalizeHeader(""), "", "Should handle empty string");
  TestRunner.assertEqual(normalizeHeader(null), "", "Should handle null");
}

function test_calculateMatchScore_exactMatch() {
  Logger.log("Testing calculateMatchScore - exact match...");

  const synonyms = ["phone", "mobile", "cell"];
  TestRunner.assertEqual(calculateMatchScore("Phone", synonyms), 100, "Exact match (case insensitive) should be 100");
  TestRunner.assertEqual(calculateMatchScore("phone", synonyms), 100, "Exact match should be 100");
}

function test_calculateMatchScore_startsWithMatch() {
  Logger.log("Testing calculateMatchScore - starts with match...");

  const synonyms = ["phone"];
  TestRunner.assertEqual(calculateMatchScore("Phone Number", synonyms), 90, "Header starting with synonym should be 90");
}

function test_calculateMatchScore_containsMatch() {
  Logger.log("Testing calculateMatchScore - contains match...");

  const synonyms = ["phone"];
  TestRunner.assertEqual(calculateMatchScore("Customer Phone", synonyms), 80, "Header containing synonym should be 80");
}

function test_calculateMatchScore_wordMatch() {
  Logger.log("Testing calculateMatchScore - word boundary match...");

  const synonyms = ["name"];
  const score = calculateMatchScore("Customer Name", synonyms);
  TestRunner.assertTrue(score >= 70, "Word boundary match should be at least 70");
}

function test_calculateMatchScore_noMatch() {
  Logger.log("Testing calculateMatchScore - no match...");

  const synonyms = ["phone", "mobile"];
  TestRunner.assertEqual(calculateMatchScore("Customer Name", synonyms), 0, "Non-matching header should be 0");
}

function test_validateSettings_errorsHaveFieldAndTab() {
  Logger.log("Testing validateSettings - errors include field and tab info...");

  const settings = getDefaultSettings();
  settings.business.etransferEmail = "invalid-email";

  const result = validateSettings(settings);

  TestRunner.assertFalse(result.valid, "Should be invalid with bad email");
  TestRunner.assertTrue(result.errors.length > 0, "Should have errors");

  // Check that errors have the new structure
  const emailError = result.errors.find(e => e.field === "etransferEmail");
  TestRunner.assertTrue(emailError !== undefined, "Should have an error for etransferEmail field");
  TestRunner.assertEqual(emailError.tab, "business", "Error should include tab information");
}

// ========================================
// TWILIO CREDENTIAL TESTS (mocked)
// ========================================

function test_testTwilioCredentials_invalidAccountSidFormat() {
  Logger.log("Testing testTwilioCredentials - invalid Account SID format...");

  const result = testTwilioCredentials("INVALID_SID", "token123", "+15551234567");

  TestRunner.assertFalse(result.success, "Should fail with invalid SID format");
  TestRunner.assertEqual(result.errorCode, "INVALID_CREDENTIALS", "Should return INVALID_CREDENTIALS error code");
}

function test_testTwilioCredentials_missingCredentials() {
  Logger.log("Testing testTwilioCredentials - missing credentials...");

  const result1 = testTwilioCredentials("", "token", "+15551234567");
  TestRunner.assertFalse(result1.success, "Should fail without Account SID");

  const result2 = testTwilioCredentials("ACXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX", "", "+15551234567");
  TestRunner.assertFalse(result2.success, "Should fail without Auth Token");
}

// ========================================
// FIRST-TIME SETUP TESTS
// ========================================

function test_isFirstTimeSetup_noCredentials() {
  Logger.log("Testing isFirstTimeSetup - no credentials...");

  // Backup and clear properties for test
  const props = PropertiesService.getUserProperties();
  const backupSid = props.getProperty("TWILIO_ACCOUNT_SID");
  const backupSetup = props.getProperty("SETUP_COMPLETED");

  props.deleteProperty("TWILIO_ACCOUNT_SID");
  props.deleteProperty("SETUP_COMPLETED");

  const result = isFirstTimeSetup();
  TestRunner.assertTrue(result.isFirstTime, "Should be first time when no credentials and no setup flag");

  // Restore
  if (backupSid) props.setProperty("TWILIO_ACCOUNT_SID", backupSid);
  if (backupSetup) props.setProperty("SETUP_COMPLETED", backupSetup);
}

function test_isFirstTimeSetup_hasCredentials() {
  Logger.log("Testing isFirstTimeSetup - has credentials...");

  const props = PropertiesService.getUserProperties();
  const backupSid = props.getProperty("TWILIO_ACCOUNT_SID");

  props.setProperty("TWILIO_ACCOUNT_SID", "ACXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX");

  const result = isFirstTimeSetup();
  TestRunner.assertFalse(result.isFirstTime, "Should not be first time when credentials exist");

  // Restore
  if (backupSid) {
    props.setProperty("TWILIO_ACCOUNT_SID", backupSid);
  } else {
    props.deleteProperty("TWILIO_ACCOUNT_SID");
  }
}

function test_isFirstTimeSetup_setupCompleted() {
  Logger.log("Testing isFirstTimeSetup - setup completed flag...");

  const props = PropertiesService.getUserProperties();
  const backupSetup = props.getProperty("SETUP_COMPLETED");
  const backupSid = props.getProperty("TWILIO_ACCOUNT_SID");

  props.deleteProperty("TWILIO_ACCOUNT_SID");
  props.setProperty("SETUP_COMPLETED", "2024-01-01T00:00:00.000Z");

  const result = isFirstTimeSetup();
  TestRunner.assertFalse(result.isFirstTime, "Should not be first time when setup completed flag exists");

  // Restore
  if (backupSetup) {
    props.setProperty("SETUP_COMPLETED", backupSetup);
  } else {
    props.deleteProperty("SETUP_COMPLETED");
  }
  if (backupSid) props.setProperty("TWILIO_ACCOUNT_SID", backupSid);
}

// ========================================
// MAIN TEST RUNNER
// ========================================

/**
 * Runs all settings-manager unit tests.
 * Call this function from the Apps Script editor to execute tests.
 * Uses test isolation to backup and restore settings.
 */
function runAllSettingsManagerTests() {
  TestRunner.reset();

  Logger.log("Starting settings-manager.gs unit tests...\n");

  // Setup test isolation - backup current settings
  TestIsolation.setup();

  try {
    // isValidEmail tests
    test_isValidEmail_validEmails();
    test_isValidEmail_invalidEmails();

    // isValidHexColor tests
    test_isValidHexColor_validColors();
    test_isValidHexColor_invalidColors();

    // deepMerge tests
    test_deepMerge_simpleObjects();
    test_deepMerge_nestedObjects();
    test_deepMerge_arrays();
    test_deepMerge_nullAndUndefined();
    test_deepMerge_emptyObjects();
    test_deepMerge_prototypePollutionProtection();

    // processTemplate tests
    test_processTemplate_basicReplacement();
    test_processTemplate_multipleSamePlaceholder();
    test_processTemplate_missingPlaceholderValue();
    test_processTemplate_noPlaceholders();
    test_processTemplate_emptyData();
    test_processTemplate_nullData();
    test_processTemplate_invalidTemplate();
    test_processTemplate_specialCharactersInValues();
    test_processTemplate_numericValues();
    test_processTemplate_multilineTemplate();

    // getDefaultSettings tests
    test_getDefaultSettings_structure();
    test_getDefaultSettings_businessDefaults();
    test_getDefaultSettings_behaviorDefaults();
    test_getDefaultSettings_colorDefaults();
    test_getDefaultSettings_columnDefaults();
    test_getDefaultSettings_templateDefaults();

    // validateSettings tests
    test_validateSettings_validDefaults();
    test_validateSettings_missingBusiness();
    test_validateSettings_invalidEmail();
    test_validateSettings_businessNameTooLong();
    test_validateSettings_missingTemplates();
    test_validateSettings_templateTooShort();
    test_validateSettings_templateTooLong();
    test_validateSettings_invalidBatchSize();
    test_validateSettings_invalidMessageDelay();
    test_validateSettings_invalidHeaderRowIndex();
    test_validateSettings_invalidColors();
    test_validateSettings_missingColumns();

    // getBillTemplate tests
    test_getBillTemplate_validTypes();
    test_getBillTemplate_throwsOnInvalidType();

    // getBillTemplateTypes tests
    test_getBillTemplateTypes_structure();

    // buildBillTemplateData tests
    test_buildBillTemplateData_structure();

    // buildThankYouTemplateData tests
    test_buildThankYouTemplateData_structure();

    // migrateSettingsVersion tests
    test_migrateSettingsVersion_v1ToV2();
    test_migrateSettingsVersion_noMigrationNeeded();

    // getSettings tests (require isolation)
    test_getSettings_returnsDefaultsWhenNoSettings();
    test_getSettings_returnsSavedSettings();
    test_getSettings_mergesWithDefaults();

    // saveSettings tests (require isolation)
    test_saveSettings_validSettings();
    test_saveSettings_invalidSettings();
    test_saveSettings_persistsToProperties();

    // migrateFromLegacyConfig tests (require isolation)
    test_migrateFromLegacyConfig_whenNoLegacyConfig();
    test_migrateFromLegacyConfig_migratesOnFirstCall();

    // import/export tests
    test_importSettings_validJson();
    test_importSettings_invalidJson();
    test_importSettings_invalidSettings();
    test_exportSettings_format();

    // getSampleDataForPreview tests
    test_getSampleDataForPreview_structure();
    test_getSampleDataForPreview_usesCurrentSettings();

    // Integration tests
    test_integration_fullTemplateProcessing();
    test_integration_thankYouTemplateProcessing();

    // Auto-detect columns tests
    test_normalizeHeader_basicNormalization();
    test_calculateMatchScore_exactMatch();
    test_calculateMatchScore_startsWithMatch();
    test_calculateMatchScore_containsMatch();
    test_calculateMatchScore_wordMatch();
    test_calculateMatchScore_noMatch();

    // Validation error structure tests
    test_validateSettings_errorsHaveFieldAndTab();

    // Twilio credential tests
    test_testTwilioCredentials_invalidAccountSidFormat();
    test_testTwilioCredentials_missingCredentials();

    // First-time setup tests
    test_isFirstTimeSetup_noCredentials();
    test_isFirstTimeSetup_hasCredentials();
    test_isFirstTimeSetup_setupCompleted();
  } finally {
    // Teardown - always restore settings even if tests fail
    TestIsolation.teardown();
  }

  const summary = TestRunner.getSummary();
  Logger.log(summary);

  return {
    passed: TestRunner.passed,
    failed: TestRunner.failed,
    summary: summary
  };
}
