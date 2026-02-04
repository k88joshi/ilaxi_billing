# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Google Apps Script automation for a tiffin (Indian lunch box delivery) service billing system. Reads customer data from Google Sheets, sends SMS bills via Twilio API, and logs delivery status back to the spreadsheet.

## Architecture

**Runtime:** Google Apps Script V8 (not Node.js - no `require`, `window`, or `document`)

**File Organization:**
- `main.gs` - Entry points (`onOpen`, `onEdit` triggers) and menu handlers
- `config.gs` - Legacy constants (deprecated, kept for migration compatibility)
- `settings-manager.gs` - Settings management, template processing, validation
- `settings-manager.test.gs` - Unit tests for settings management
- `settings.html` - Modal dialog UI with first-time setup wizard and inline validation
- `spreadsheet.gs` - Sheet utilities, data processing, and column auto-detection
- `twilio.gs` - Twilio API integration and SMS sending with retry logic
- `ui.gs` - UI dialogs, credential management, settings dialog, and credential testing

**Settings System:**
All configuration is stored in `PropertiesService.getUserProperties()` as JSON under key `APP_SETTINGS`. The `getSettings()` function auto-migrates from legacy `config.gs` constants on first call.

Settings structure:
```javascript
{
  version: 2,
  business: { name, etransferEmail, phoneNumber, whatsappLink },
  templates: {
    billMessages: {
      firstNotice: { name, message },   // First payment request
      followUp: { name, message },      // Follow-up reminder
      finalNotice: { name, message }    // Final notice
    },
    thankYouMessage  // Auto-sent when payment marked as Paid
  },
  behavior: { dryRunMode, batchSize, messageDelayMs, headerRowIndex },
  colors: { success, error, dryRun },
  columns: { phoneNumber, customerName, balance, numTiffins, dueDate, messageStatus, orderId, paymentStatus }
}
```

**Template Placeholders:** `{{businessName}}`, `{{etransferEmail}}`, `{{phoneNumber}}`, `{{whatsappLink}}`, `{{customerName}}`, `{{balance}}`, `{{numTiffins}}`, `{{month}}`, `{{orderId}}`

**Core Google Services:**
- `SpreadsheetApp` - Data read/write, UI menus, modal dialogs
- `UrlFetchApp` - HTTP requests to Twilio
- `PropertiesService.getUserProperties()` - Credential and settings storage
- `HtmlService` - Settings modal dialog UI
- `Utilities` - Base64 encoding, sleep delays

**UI Context Pattern:**
Use `getUi_()` (lazy-loaded function in ui.gs) instead of global `SpreadsheetApp.getUi()` to avoid errors when running tests outside spreadsheet context.

**Data Flow:**
1. Menu action triggers function in `main.gs`
2. `getSettings()` loads configuration from UserProperties
3. `getHeaderColumnMap()` maps column names to indices (resilient to column reordering)
4. Batch read via `getDataRange().getValues()`
5. Filter/process rows in memory
6. `sendBill_()` uses `processTemplate()` to build SMS, calls Twilio API with delays
7. Batch update status column + colors from settings
8. Show summary dialog

**Triggers:**
- `onOpen()` - Simple trigger, creates Credentials/Send Bills/Settings menus
- `onEdit()` - Simple trigger, auto-sends "Thank You" when Payment="Paid" (has 30-second timeout limitation)

## Development

**Deployment with clasp:**
```bash
clasp push              # Push local changes to Apps Script
clasp push -f           # Force push (overwrites remote)
clasp pull              # Pull remote changes to local
clasp open-script       # Open project in browser
clasp logs              # View execution logs
```

**Running Unit Tests:**
1. Push code to Apps Script: `clasp push`
2. Open Apps Script editor: `clasp open-script`
3. Select `runAllSettingsManagerTests` from the function dropdown
4. Click Run and view results in the Execution Log

**Test Utilities (in settings-manager.test.gs):**
- `TestIsolation.setup()/teardown()` - Backup/restore UserProperties to prevent test pollution
- `TestRunner.assertEqual/assertTrue/assertNotNull` - Simple assertion framework
- Tests cover: settings CRUD, template processing, validation, column auto-detection, credential testing

**Manual Testing:**
- Enable Dry Run Mode via Settings > Open Settings > Behavior tab
- Use "Test with First Unpaid Row" menu option for quick validation
- View logs in Apps Script editor's Execution Log (`Logger.log()`)

**Credential Setup:**
Use the "Credentials" menu to set Twilio Account SID, Auth Token, and Phone Number (stored in UserProperties)

## Code Style Requirements

- Use `const`/`let` exclusively (never `var`)
- Full JSDoc on all top-level functions
- **CRITICAL: Never call `getValue()`/`setValue()`/`getRange()` inside loops** - batch read all data, process array, batch write results
- Use `Utilities.sleep()` between API calls (configurable via `settings.behavior.messageDelayMs`)
- `try...catch` on all `UrlFetchApp` calls
- Use `getSettings()` for all configuration values, not legacy constants
- Use `processTemplate()` for message construction with `{{placeholder}}` syntax
- Use `getHeaderColumnMap()` for column lookups (supports column reordering)
- Use `getUi_()` instead of `SpreadsheetApp.getUi()` to support test execution outside spreadsheet context

## Constraints

- 6-minute execution limit (hence default `batchSize = 75`)
- Twilio rate limiting (hence default `messageDelayMs = 1000`)
- No external dependencies beyond Google Services and Twilio REST API

## Required Sheet Headers

Default column names (configurable via Settings > Columns):
`Phone Number`, `Customer Name`, `Balance`, `No. of Tiffins`, `Due Date`, `Message Status`, `Order ID`, `Payment`

Column order is flexible - script uses header names to find columns.

## Key Backend Functions

**Credential Testing (ui.gs):**
- `testTwilioCredentials(sid, token, phone)` - Validates credentials via Twilio account lookup API (doesn't send SMS)
- `testTwilioCredentialsFromSettings()` - Tests credentials stored in UserProperties

**Column Auto-Detection (spreadsheet.gs):**
- `autoDetectColumns()` - Fuzzy matches sheet headers to expected columns using `COLUMN_SYNONYMS`
- Returns confidence scores: high (≥90%), medium (70-89%), low (<70%)

**First-Time Setup (ui.gs):**
- `isFirstTimeSetup()` - Returns `{isFirstTime: true}` when no `SETUP_COMPLETED` flag and no credentials
- `completeFirstTimeSetup(setupData)` - Saves wizard data and marks setup complete
