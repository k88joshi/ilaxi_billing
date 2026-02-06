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
| `billing-core.gs` | **Shared business logic** — mode-independent core functions called by both modes |
| `settings-manager.gs` | Settings via `PropertiesService`, template processing, validation |
| `api.gs` | Web app API router — thin wrappers that delegate to `billing-core.gs` |
| `webapp.gs` | Web app auth (`doGet`/`doPost`), Google account whitelist, live user heartbeat via CacheService |
| `webapp-main.html` | Web app main UI (customer list, messages, settings tabs) |
| `twilio.gs` | Twilio SMS with exponential backoff retry (max 4 attempts) |
| `spreadsheet.gs` | Sheet utilities, column mapping, **add-on UI wrappers** that delegate to `billing-core.gs` |
| `ui.gs` | Menu dialogs, credential management |
| `settings.html` | Settings modal UI (tabbed interface, used by both modes) |
| `design-tokens.html` | Shared CSS custom properties and reset, included via `<?!= include('design-tokens') ?>` |
| `settings-manager.test.gs` | Unit tests - run `runAllSettingsManagerTests()` in Apps Script editor |

### Data Flow
```
Sheet Data → billing-core.gs → Settings/Templates → Twilio API → Status written back
```

### Storage
- **ScriptProperties**: Project-wide settings (web app mode, shared config)
- **UserProperties**: User-specific settings (add-on mode)

### Dual-Mode Parity (IMPORTANT)

Every user-facing feature must work in **both** add-on and web app modes. Business logic lives in `billing-core.gs`; each mode has thin wrappers.

**When adding or changing a feature, update BOTH columns:**

| Core Function (`billing-core.gs`) | Add-on Wrapper (`spreadsheet.gs`) | Web Wrapper (`api.gs`) | Notes |
|---|---|---|---|
| `getCustomersCore_()` | — | `getCustomersForWeb()` | Add-on reads sheet directly |
| `sendBillsCore_()` | `sendBillsToUnpaid()`, `sendUnpaidByDueDate()` | `sendBillsForWeb()` | Add-on has separate menu items per filter |
| `sendSingleBillCore_()` | `sendBillByOrderID()` | `sendSingleBillForWeb()` | Add-on shows confirm dialog |
| `clearAllStatusesCore_()` | `clearAllStatuses()` | `clearAllStatusesForWeb()` | Add-on shows confirm dialog |
| `lookupCustomerByOrderId_()` | Used by `sendBillByOrderID()` | — | Preview before send |
| `updatePaymentStatusCore_()` | — | `updatePaymentStatusForWeb()` | Web only (inline status edit) |
| — | — | `getCurrentUserForWeb()` | Web only (header user info, live + authorized users) |
| `recordHeartbeat_()` | — | `heartbeatForWeb()` | Web only (CacheService live user tracking) |
| `getLiveUsers_()` | — | `getLiveUsersForWeb()` | Web only (read live users from cache) |
| — | `testSingleMessage()` | — | Add-on only (finds first unpaid) |
| — | — | `getCustomerStatsForWeb()` | Web only (dashboard stats) |

**Shared CSS**: Design tokens live in `design-tokens.html`. Both `settings.html` and `webapp-main.html` include it via `<?!= include('design-tokens') ?>`. Dark theme overrides are webapp-only (in `webapp-main.html`).

**Checklist for new features:**
1. Write core logic in `billing-core.gs` (return `{success, data, error}`)
2. Add add-on wrapper in `spreadsheet.gs` (UI prompts/alerts around the core call)
3. Add web wrapper in `api.gs` (extract params from payload, call core)
4. Add API route in `handleApiRequest_()` switch statement
5. Add menu item in `onOpen()` if needed
6. Update the parity table above

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
2. **Inject secrets**: Replaces `SPREADSHEET_ID` placeholder before deploy
3. **Deploy**: Auto-push via CLASP

### Required GitHub Secrets
| Secret | Purpose |
|--------|---------|
| `CLASP_TOKEN` | Contents of `~/.clasprc.json` for CLASP authentication |
| `SPREADSHEET_ID` | Google Sheet ID for web app mode (from URL: `/d/{ID}/edit`) |

## Web App User Authorization Setup

Access is restricted to whitelisted Google accounts. To authorize users:

1. Open Apps Script editor: `clasp open-script`
2. In the function dropdown, select `addAllowedUser`
3. In the execution log console, run:
   ```javascript
   addAllowedUser("user@gmail.com")
   ```
4. Repeat for each user who needs access

**Deployment Settings** (when deploying as web app):
- Execute as: **Me** (script owner)
- Who has access: **Anyone with Google account**

The whitelist in ScriptProperties restricts actual access beyond Google's auth.

Related functions in `webapp.gs`:
- `addAllowedUser(email)` - Add a user to the whitelist
- `removeAllowedUser(email)` - Remove a user from the whitelist
- `getAllowedUsers()` - List all authorized emails

## Constraints

- 6-minute Google Apps Script execution timeout
- Twilio rate limiting (default 1s delay between messages)
- Trial Twilio accounts require verified recipient numbers
