# GEMINI.md: AI Development Guide for Ilaxi's Gujarati Tiffin Billing System

This document guides the use of gemini-cli (or other AI tools) for developing and managing this Google Apps Script project. Its purpose is to provide context, establish rules, and store common "prompt recipes" to ensure consistent, high-quality, and maintainable code.

## 1. Project Overview

**Project Goal:** To automate the billing process for Ilaxi's Gujarati Tiffin. The script reads customer data from a Google Sheet, sends SMS bills and payment reminders via the Twilio API, and logs the message status back to the sheet.

**Core Services Used:** `SpreadsheetApp` (UI, data read/write), `UrlFetchApp` (Twilio API calls), `PropertiesService` (storing API credentials), `Utilities` (Base64 encoding, sleep), and simple/installable triggers (`onOpen`, `onEdit`).

**Key Functionality:**

- Creates a custom menu (`onOpen`) to manage Twilio credentials ("Set/Delete SID", "Set/Delete Token", etc.).
- Adds a "Send Bills" menu for various bulk-sending operations ("Send to All UNPAID", "Send by Due Date", "Send by Order ID").
- Includes a test function ("Test with First Unpaid Row") and a utility to clear message statuses.
- Automatically triggers a "Thank You" SMS when a customer's 'Payment' column is marked as "Paid" (`onEdit`).
- Securely stores and retrieves Twilio credentials using `PropertiesService.getUserProperties()`.
- Includes a `DRY_RUN_MODE` toggle for safe testing.
- Performs data validation and formatting for phone numbers (to E.164), currency, and dates.
- Provides a summary report (`showSendSummary`) after bulk-sending operations.

## 2. Core System Prompt

Paste this into your gemini-cli session to set the persona.

### System Prompt:

Act as an expert Google Apps Script developer with deep, specialized knowledge of the V8 runtime, `SpreadsheetApp`, `UrlFetchApp`, and related Google Workspace services. You are working on a billing system for a tiffin service.

### Your Core Directives:

- **Prioritize Performance:** Always write code that minimizes calls to Google services. Use batch operations (`getValues()`, `setValues()`, `setBackgroundColors()`, etc.) instead of operating on single cells inside loops.
- **Modern JavaScript:** Use `const` and `let` exclusively. Never use `var`. Use modern features like arrow functions, destructuring, and template literals where appropriate.
- **Strict Mode:** All `.gs` files must begin with `"use strict";`.
- **Full JSDoc:** All top-level functions must have complete JSDoc comments (`@param`, `@returns`, `@customfunction` if applicable).
- **Clarity and Readability:** Write clean, well-commented, and maintainable code.
- **Environment Awareness:** Remember this is Apps Script, not Node.js or a browser. There is no `window`, `document`, or `require`. Use built-in services like `UrlFetchApp` (for HTTP) and `Logger.log` (for logging).
- **Security:** Never hard-code API keys or secrets. Use `PropertiesService.getUserProperties()` or `PropertiesService.getScriptProperties()` (as this script already does).

## 3. Style Guide & Best Practices

| Rule | Description |
|------|-------------|
| **Batch Operations** | CRITICAL: Never call `getValue()`, `setValue()`, or `getRange()` inside a `for` or `while` loop. Read all data into a 2D array, process the array, and write all data back in one call. (Note: This script correctly reads all data first, but writes status updates one by one inside the loop. This is acceptable for this use case to provide real-time feedback and avoid data loss on timeout, but for pure data processing, batch writes are preferred.) |
| **Error Handling** | Use `try...catch` blocks for all external API calls (`UrlFetchApp`) and major `SpreadsheetApp` operations. Log errors clearly with `Logger.log()`. |
| **Logging** | Use `Logger.log()` for debugging. This is viewable in the Apps Script editor's Execution Log. |
| **Globals** | Avoid global variables where possible, but `const` for configuration (like `PHONE_NUMBER_HEADER`) is excellent practice. |
| **Custom Functions** | If a function is for the Sheet UI (e.g., `=MY_FUNCTION()`), it must be marked with `@customfunction` and can only return values (no service calls that require permissions). |
| **Manifest** | Remind me to check `appsscript.json` if we need to add scopes (like `https://api.twilio.com`) or advanced services. |
| **Rate Limiting** | Use `Utilities.sleep()` between API calls in a loop to avoid rate-limiting errors (as this script correctly does with `Utilities.sleep(1000)`). |

## 4. gemini-cli Prompt Recipes

Use these as templates for common tasks.

### Recipe: Create a New Function

**Your Prompt:**

```
"Write a new Google Apps Script function named `[functionName]` for the tiffin billing system that does the following:

1.  [Requirement 1, e.g., "Accepts a sheet name as a string."]
2.  [Requirement 2, e.g., "Gets all data from that sheet using getRange() and getValues()."]
3.  [Requirement 3, e.g., "Filters the 2D array to find rows where column 3 (index 2) is 'Pending'."]
4.  [Requirement 4, e.g., "Returns a new 2D array with only the 'Pending' rows."]

Remember to include "use strict";, full JSDoc, and follow the project's style guide (use the getHeaderColumnMap() utility, etc.)."
```

### Recipe: Refactor for Performance

**Your Prompt:**

*(Pipe the file using cat or paste the code after the prompt)*

```
"The following Apps Script code is slow because it calls `getValue` inside a loop. Please refactor it for maximum performance, following the style of the existing billing script (read all data at once, use getHeaderColumnMap(), process the array, and write results back).

[Paste code here or use cat file.gs | gemini-cli ...]"
```

### Recipe: Explain This Code

**Your Prompt:**

*(Pipe the file using cat or paste the code after the prompt)*

```
"Explain this Apps Script code in the context of the Tiffin Billing System. Focus on:
1.  What is its primary purpose?
2.  How does it interact with the Google Sheet and Twilio?
3.  Are there any performance or security issues?
4.  Does it follow the existing project style?

[Paste code here or use cat file.gs | gemini-cli ...]"
```

### Recipe: Debug an Error

**Your Prompt:**

```
"I'm getting this error in the Tiffin Billing script:
[Paste the full error message, e.g., "Exception: The parameters (number,number) don't match the method signature for SpreadsheetApp.Spreadsheet.getRange..."]

This is the function that's causing it:
[Paste the function code]

The column headers are: [List any relevant headers, e.g., PAYMENT_STATUS_HEADER, MESSAGE_STATUS_HEADER]

What is the most likely cause of this error and how do I fix it?"
```

### Recipe: Write JSDoc / Comments

**Your Prompt:**

*(Pipe the file using cat or paste the code after the prompt)*

```
"Write complete JSDoc comments for the following function(s), matching the style of the existing `code.gs` file. Make sure to identify all parameters and the return value.

[Paste code here or use cat file.gs | gemini-cli ...]"
```
