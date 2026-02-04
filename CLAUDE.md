# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Google Apps Script automation for a tiffin delivery service. Sends SMS bills via Twilio, reads/writes customer data in Google Sheets, supports both spreadsheet add-on and standalone web app modes.

**Runtime**: Google Apps Script V8 (ES6 JavaScript, NOT Node.js - no `require()` or npm modules)

## Commands

### CLASP (deployment)
```bash
clasp push          # Push local changes to Apps Script
clasp push -f       # Force push (overwrite remote)
clasp pull          # Pull remote changes
clasp logs          # View execution logs
clasp open-script   # Open in Apps Script editor
```

### Linting (matches CI)
```bash
npm install eslint @eslint/js --save-dev
npx eslint "*.gs" --max-warnings 0
```

### Testing
Run `runAllSettingsManagerTests()` in Apps Script editor (defined in `settings-manager.test.gs`). For manual testing, enable Dry Run Mode in Settings > Behavior tab.

## Architecture

### Dual-Mode Operation
- **Add-on mode**: Runs in active Google Sheet via `SpreadsheetApp.getActive()`
- **Web app mode**: Uses `SPREADSHEET_ID` constant in `spreadsheet.gs` for `SpreadsheetApp.openById()`

### Key Files
| File | Purpose |
|------|---------|
| `main.gs` | Entry points: `onOpen()` menus, `onEdit()` auto-thank-you trigger |
| `settings-manager.gs` | Settings via `PropertiesService`, template processing, validation |
| `api.gs` | Web app API router - routes POST requests to handlers |
| `webapp.gs` | Web app auth (`doGet`/`doPost`), password validation (SHA-256) |
| `twilio.gs` | Twilio SMS with exponential backoff retry (max 4 attempts) |
| `spreadsheet.gs` | Sheet utilities, column mapping via `getHeaderColumnMap()` |
| `ui.gs` | Menu dialogs, credential management |
| `settings.html` | Settings modal UI (tabbed interface) |

### Data Flow
```
Sheet Data → getHeaderColumnMap() → Settings/Templates → Twilio API → Status written back
```

### Storage
- **ScriptProperties**: Project-wide settings (web app mode, shared config)
- **UserProperties**: User-specific settings (add-on mode)

## Critical Patterns

### Batch Operations (REQUIRED)
Never use `getValue()`/`setValue()` in loops. Always batch:
```javascript
// Read all at once
const data = sheet.getDataRange().getValues();
// Process in memory
// Write all at once
columnRange.setValues(results);
```

### Cross-File Globals
All `.gs` files compile into one namespace. Functions defined in any file are globally accessible.

### Template Placeholders
Use `processTemplate()` for: `{{businessName}}`, `{{customerName}}`, `{{balance}}`, `{{numTiffins}}`, `{{month}}`, `{{orderId}}`, `{{etransferEmail}}`, `{{phoneNumber}}`, `{{whatsappLink}}`

### Return Objects
```javascript
return { success: true, data: result };
return { success: false, error: "Error message" };
```

## CI/CD

GitHub Actions on push to master:
1. **Lint**: ESLint syntax check on all `.gs` files
2. **Deploy**: Auto-push via CLASP (requires `CLASP_TOKEN` secret)

## Web App Password Setup

To set the password for web app login (one-time setup):

1. Open Apps Script editor: `clasp open-script`
2. Add this temporary function to any `.gs` file:
   ```javascript
   function setupPassword() {
     setAppPassword("your-password-here");
   }
   ```
3. Select `setupPassword` from the function dropdown and click **Run**
4. Check execution log for "App password set successfully"
5. Delete the `setupPassword` function (don't leave password in code)

Related functions in `webapp.gs`: `hasAppPassword()`, `clearAppPassword()`

## Constraints

- 6-minute Google Apps Script execution timeout
- Twilio rate limiting (default 1s delay between messages)
- Trial Twilio accounts require verified recipient numbers
