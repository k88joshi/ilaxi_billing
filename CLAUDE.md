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

**Server-side (.gs) — all compile into one namespace:**

| File | Purpose |
|------|---------|
| `main.gs` | Entry points: `onOpen()` menus, `onEdit()` auto-thank-you trigger |
| `billing-core.gs` | **Shared business logic** — mode-independent core functions called by both modes |
| `settings-manager.gs` | Settings CRUD via `PropertiesService`, validation, migration, export/import |
| `template-manager.gs` | Template processing (`processTemplate()`), preview data builders, template type lookups |
| `activity-log.gs` | Event logging with sharded storage (`ACTIVITY_LOG_A`/`B`), web API endpoints |
| `api.gs` | Web app API router — thin wrappers that delegate to `billing-core.gs` |
| `webapp.gs` | Web app auth (`doGet`/`doPost`), Google account whitelist, live user heartbeat, `include()` helper |
| `twilio.gs` | Twilio SMS with exponential backoff retry (max 4 attempts) |
| `spreadsheet.gs` | Sheet access (dual-mode), column auto-detection, formatting, validation helpers |
| `addon-actions.gs` | **Add-on menu action wrappers** — UI prompts/alerts around `billing-core.gs` calls |
| `ui.gs` | Settings dialog bridge — functions called by `settings.html` to load/save settings |
| `credentials-ui.gs` | Add-on credential prompts — menu-driven set/delete for Twilio credentials |
| `settings-manager.test.gs` | Unit tests — run `runAllSettingsManagerTests()` in Apps Script editor |

**Client-side (.html) — modular via `<?!= include('filename') ?>`:**

| File | Purpose |
|------|---------|
| `design-tokens.html` | **Shared CSS** — custom properties, reset, mobile base rules |
| `webapp-main.html` | Web app HTML shell — structure only, includes all modules below |
| `webapp-styles.html` | Web app CSS — layout, components, dark theme, responsive breakpoints |
| `webapp-app.html` | Web app JS core — state, theme, initialization, utilities, tab navigation |
| `webapp-dashboard.html` | Web app JS — dashboard tab: stats, customer table, filters, send bar |
| `webapp-messages.html` | Web app JS — messages tab: template editor, credentials modal, preview |
| `webapp-settings-tab.html` | Web app JS — settings tab: form, column mapping, activity log |
| `settings.html` | Settings modal HTML shell — structure only, includes modules below |
| `settings-styles.html` | Settings modal CSS — forms, wizard, cards, footer |
| `settings-app.html` | Settings modal JS — state, tabs, forms, validation, wizard flow |
| `shared-utils.html` | Shared JS utilities — `showToast()`, icon definitions |

### Data Flow
```
Sheet Data → billing-core.gs → Settings/Templates → Twilio API → Status written back
```

### Storage
- **ScriptProperties**: Project-wide settings (web app mode, shared config)
- **UserProperties**: User-specific settings (add-on mode)
- **ScriptProperties sharding**: For data that may exceed ~9KB per-property limit, use two-key sharding (e.g., `ACTIVITY_LOG_A`/`ACTIVITY_LOG_B`)

### Dual-Mode Parity (IMPORTANT)

Every user-facing feature must work in **both** add-on and web app modes. Business logic lives in `billing-core.gs`; each mode has thin wrappers.

**When adding or changing a feature, update BOTH columns:**

| Core Function (`billing-core.gs`) | Add-on Wrapper (`addon-actions.gs`) | Web Wrapper (`api.gs`) | Notes |
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
| `getActivityLog_()` | — | `getActivityLogForWeb()` | Web only, admin-only (both in `activity-log.gs`) |
| — | — | `clearActivityLogForWeb()` | Web only, admin-only (in `activity-log.gs`) |

**Shared CSS**: Design tokens live in `design-tokens.html`. Both `settings.html` and `webapp-main.html` include it via `<?!= include('design-tokens') ?>`. Dark theme overrides are webapp-only (in `webapp-styles.html`).

**HTML module include order** (each file wraps its content in `<style>` or `<script>` tags):
```
webapp-main.html includes:
  design-tokens.html → webapp-styles.html → [HTML body] →
  webapp-app.html → webapp-dashboard.html → webapp-messages.html →
  webapp-settings-tab.html → shared-utils.html

settings.html includes:
  design-tokens.html → settings-styles.html → [HTML body] →
  settings-app.html → shared-utils.html
```

**Checklist for new features:**
1. Write core logic in `billing-core.gs` (return `{success, data, error}`)
2. Add add-on wrapper in `addon-actions.gs` (UI prompts/alerts around the core call)
3. Add web wrapper in `api.gs` (extract params from payload, call core)
4. Add API route in `handleApiRequest_()` switch statement (activity logging lives inside each function via `logEvent_()`, not centralized)
5. Add menu item in `onOpen()` if needed
6. Add web UI in the appropriate `webapp-*.html` JS module
7. Update the parity table above

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

Key shared globals defined elsewhere:
- `scriptProperties` (defined in `twilio.gs`) — `PropertiesService.getScriptProperties()`, used across many files
- `safeJsonParse_(jsonString, defaultValue)` (defined in `webapp.gs`) — safe JSON parse with fallback

### Template Placeholders
Use `processTemplate()` for: `{{businessName}}`, `{{customerName}}`, `{{balance}}`, `{{numTiffins}}`, `{{month}}`, `{{orderId}}`, `{{etransferEmail}}`, `{{phoneNumber}}`, `{{whatsappLink}}`

### Return Objects
```javascript
return { success: true, data: result };
return { success: false, error: "Error message" };
```

## CI/CD

GitHub Actions workflow with two paths:

**On pull requests** (lint → push):
1. **Lint**: ESLint syntax check on all `.gs` files
2. **Push**: `clasp push -f` updates HEAD — testable at the `/dev` URL

**On merge to master** (lint → push → deploy):
1. **Lint**: ESLint syntax check on all `.gs` files
2. **Push**: `clasp push -f` updates HEAD
3. **Deploy**: `clasp deploy --deploymentId` updates the production `/exec` URL

### Required GitHub Secrets
| Secret | Purpose |
|--------|---------|
| `CLASP_TOKEN` | Contents of `~/.clasprc.json` for CLASP authentication |
| `SCRIPT_ID` | Apps Script project ID (from `.clasp.json` `scriptId` field, or URL: `/projects/{ID}/edit`) |
| `SPREADSHEET_ID` | Google Sheet ID for web app mode (from URL: `/d/{ID}/edit`) |
| `DEPLOYMENT_ID` | Web app deployment ID for production `/exec` deploys (get from Apps Script editor > Deploy > Manage deployments, or run `clasp deployments`) |

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
