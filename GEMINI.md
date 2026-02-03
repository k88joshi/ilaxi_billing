# Ilaxi's Gujarati Tiffin - Billing System

## Project Overview

This is a **Google Apps Script (GAS)** project designed to automate the billing process for "Ilaxi's Gujarati Tiffin" service. It integrates **Google Sheets** with the **Twilio API** to send SMS bills, reminders, and payment confirmations to customers.

**Key Features:**
*   **Automated SMS Billing:** Sends bills based on payment status in Google Sheets.
*   **Template System:** Supports First Notice, Follow-up, Final Notice, and Thank You messages.
*   **Settings UI:** A custom sidebar allows non-technical users to configure messages, business details, and behavior without editing code.
*   **Twilio Integration:** Uses `UrlFetchApp` to communicate with the Twilio API for sending SMS.
*   **Dry Run Mode:** Allows testing the logic without sending actual messages.

## Tech Stack

*   **Platform:** Google Apps Script (JavaScript/V8 Runtime)
*   **Database/UI:** Google Sheets
*   **External API:** Twilio (SMS)
*   **Frontend (Settings):** HTML, CSS, client-side JavaScript (served via `HtmlService`)

## Directory Structure

*   `main.gs`: **Entry Point**. Contains `onOpen` (menu creation) and `onEdit` (auto-reply triggers).
*   `twilio.gs`: **API Integration**. Functions for formatting phone numbers and sending SMS via Twilio.
*   `settings-manager.gs`: **Configuration**. Manages loading/saving settings from `PropertiesService` and processing message templates.
*   `spreadsheet.gs`: **Data Access**. Utilities for reading/writing to the active Google Sheet.
*   `ui.gs`: **User Interface**. Functions to open the sidebar and handle alerts.
*   `config.gs`: **Legacy**. Deprecated constants file. Kept for reference or backward compatibility.
*   `settings.html`: **Frontend**. The HTML/CSS/JS for the Settings Sidebar.
*   `README.md`: Comprehensive user guide and installation instructions.

## Setup & Deployment

This project is deployed manually to the Google Apps Script environment attached to a specific Google Sheet.

**Installation:**
1.  Open the target Google Sheet.
2.  Navigate to **Extensions > Apps Script**.
3.  Create `.gs` files corresponding to the local files (e.g., `main.gs`, `twilio.gs`).
4.  Create an `.html` file for `settings.html`.
5.  Copy-paste the local content into the respective GAS files.
6.  Save the project.

**Configuration:**
1.  **Twilio Credentials:** Set via the custom **Credentials** menu in the Sheet (stored in User Properties).
2.  **App Settings:** Configured via **Settings > Open Settings** sidebar (stored in Script Properties).

## Development Conventions

*   **Triggers:**
    *   `onOpen`: Simple trigger to create custom menus.
    *   `onEdit`: Installable trigger (conceptually) used to detect "Paid" status changes for auto-replies.
*   **Error Handling:** Most functions return a result object `{ success: boolean, status: string, color: string }` to update the Sheet's status column visually.
*   **Properties:**
    *   `UserProperties`: Used for sensitive secrets (Twilio SID/Token).
    *   `ScriptProperties`: Used for shared application settings (Business name, templates).
*   **Naming:** Private helper functions often end with an underscore (e.g., `sendBill_`, `sendThankYouMessage_`).

## Key Commands (Manual)

Since this is a GAS project, there are no CLI build commands.
*   **Run/Test:** Functions are executed from the Google Sheets menu or the GAS editor.
*   **Logs:** `Logger.log()` is used for debugging. View logs in the GAS editor.
