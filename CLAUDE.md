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
- `settings.html` - Modal dialog UI for user configuration
- `spreadsheet.gs` - Sheet utilities and data processing functions
- `twilio.gs` - Twilio API integration and SMS sending with retry logic
- `ui.gs` - UI dialogs, credential management, settings dialog functions

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

## Constraints

- 6-minute execution limit (hence default `batchSize = 75`)
- Twilio rate limiting (hence default `messageDelayMs = 1000`)
- No external dependencies beyond Google Services and Twilio REST API

## Required Sheet Headers

Default column names (configurable via Settings > Columns):
`Phone Number`, `Customer Name`, `Balance`, `No. of Tiffins`, `Due Date`, `Message Status`, `Order ID`, `Payment`

Column order is flexible - script uses header names to find columns.
