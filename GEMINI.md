# Gemini Context for Ilaxi's Billing System

This file provides context and instructions for Gemini when working on this project.

## Project Overview

**Ilaxi's Billing System** is a Google Apps Script automation tool designed for a tiffin (lunch box) delivery service. It streamlines the billing process by:
*   Reading customer data and payment status from a Google Sheet.
*   Sending automated SMS bills and reminders using the Twilio API.
*   Logging message delivery status back to the sheet.
*   Providing a user-friendly Sidebar UI for configuration (no code editing required).

## Key Technologies

*   **Runtime:** Google Apps Script V8.
*   **Database:** Google Sheets.
*   **SMS Gateway:** Twilio API.
*   **Development Tool:** CLASP (Command Line Apps Script Projects).
*   **UI:** HTML Service (for the settings sidebar and modal dialogs).

## Architecture & Key Files

The project follows a modular structure. **Do not use `require` or Node.js modules**; this runs in the Apps Script environment.

*   **`main.gs`**: The entry point. Handles `onOpen` (menu creation) and `onEdit` triggers.
*   **`settings-manager.gs`**: Manages application settings, stored in `PropertiesService.getUserProperties()`. Handles template processing and migration from legacy config.
*   **`twilio.gs`**: Wraps the Twilio REST API. Handles SMS sending, error handling, and retry logic.
*   **`spreadsheet.gs`**: Contains utilities for interacting with the Google Sheet. **Crucially**, it implements batch reading (`getValues`) and writing to avoid API quotas.
*   **`ui.gs`**: Manages the custom menu, sidebar display, and credential management dialogs.
*   **`settings.html`**: The HTML/CSS/JS for the configuration sidebar.
*   **`settings-manager.test.gs`**: Unit tests for the settings logic.

## Development Workflow

### CLI Commands (CLASP)

This project uses `clasp` for local development.

*   `clasp push`: Pushes local changes to the Apps Script project.
*   `clasp push -f`: Force push (overwrite remote).
*   `clasp pull`: Pulls remote changes to your local machine.
*   `clasp open-script`: Opens the project in the Apps Script editor.
*   `clasp logs`: View execution logs.

### Testing

*   **Unit Tests:** Run `runAllSettingsManagerTests` in the Apps Script editor (found in `settings-manager.test.gs`).
*   **Manual Testing:**
    1.  Enable **Dry Run Mode** in the Settings Sidebar (`Behavior` tab).
    2.  Use the **Test with First Unpaid Row** menu option.
    3.  Check the `Execution Log` and the `Message Status` column (entries will be prefixed with `[DRY RUN]`).

## Coding Conventions & Best Practices

1.  **Variable Declaration:** Use `const` and `let`. Avoid `var`.
2.  **Batch Operations:** **NEVER** call `range.getValue()` or `range.setValue()` inside a loop.
    *   **Read:** Get the entire data range into a 2D array: `const data = sheet.getDataRange().getValues();`
    *   **Process:** Iterate over the array in memory.
    *   **Write:** Prepare a 2D array of results and write it back in one operation: `columnRange.setValues(results);`
3.  **Settings Access:** Do not hardcode configuration. Use `SettingsManager.getSettings()` to retrieve values from `UserProperties`.
4.  **UI Interaction:** Use `getUi_()` (lazy-loaded in `ui.gs`) instead of `SpreadsheetApp.getUi()` to ensure tests can run outside the spreadsheet context.
5.  **Documentation:** Add JSDoc comments to all top-level functions.
6.  **Error Handling:** Wrap external API calls (Twilio) in `try...catch` blocks.
7.  **Delays:** Use `Utilities.sleep()` between API calls to respect rate limits (controlled by `settings.behavior.messageDelayMs`).

## Data Structure (Google Sheet)

The script relies on specific column headers to map data. The default expected headers are:
*   `Phone Number` (E.164 format, e.g., `+15551234567`)
*   `Customer Name`
*   `Balance`
*   `No. of Tiffins`
*   `Due Date`
*   `Message Status` (Script writes here)
*   `Order ID`
*   `Payment` ("Paid" or "Unpaid")

*Note: Column mapping is configurable in the Settings Sidebar if headers differ.*
