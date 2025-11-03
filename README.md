# Ilaxi's Gujarati Tiffin - Billing System

This Google Apps Script is designed to automate the billing process for Ilaxi's Gujarati Tiffin service. It reads customer data from a Google Sheet, sends SMS bills and payment reminders via the Twilio API, and logs the message status back to the sheet.

## Features

- **Automated SMS Billing:** Send bills to all unpaid customers or filter by due date.
- **Individual Billing:** Send a bill to a specific customer using their Order ID.
- **Automated "Thank You" Messages:** Automatically send a "Thank You" SMS when a customer's payment status is marked as "Paid".
- **Secure Credential Storage:** Securely store and manage your Twilio API credentials.
- **Dry Run Mode:** Test the script's functionality without sending actual SMS messages.
- **Performance Optimized:** Uses batch operations to efficiently update the spreadsheet, even with a large number of customers.
- **Color-Coded Status:** Provides at-a-glance feedback on the status of each message using background colors.

## Setup

1.  **Copy the Script Files:**
    *   Open your Google Sheet.
    *   Go to **Extensions > Apps Script**.
    *   You will need to create a new script file for each of the `.gs` files in this project.
    *   Create the following files in your Apps Script project:
        *   `main.gs`
        *   `config.gs`
        *   `twilio.gs`
        *   `ui.gs`
        *   `spreadsheet.gs`
    *   Copy the contents of each file from this project into the corresponding file in your Apps Script project.
    *   Save the project.

2.  **Set Up Twilio Credentials:**
    *   In your Google Sheet, you will see a new **Credentials** menu.
    *   Use this menu to set your Twilio Account SID, Auth Token, and Twilio Phone Number.
    *   These credentials will be stored securely in your user properties.

3.  **Format Your Google Sheet:**
    *   The script requires your Google Sheet to have a specific set of column headers in the first row. The script is designed to be flexible, so the order of the columns does not matter.
    *   Here are the required headers:
        *   `Phone Number`
        *   `Customer Name`
        *   `Balance`
        *   `No. of Tiffins`
        *   `Due Date`
        *   `Message Status` (The script will update this column)
        *   `Order ID`
        *   `Payment`

    *   Here is an example of how your sheet should be structured:

| Phone Number | Customer Name | Balance | No. of Tiffins | Due Date   | Message Status | Order ID | Payment |
| :----------- | :------------ | :------ | :------------- | :--------- | :------------- | :------- | :------ |
| +15197816446 | Kamal Joshi   | $120.50 | 12             | 10/31/2025 |                | 1001     | Unpaid  |
| +16475707004 | Dev Yagnik    | $250.00 | 25             | 9/30/2025  |                | 1002     | Unpaid  |

## Usage

### Sending Bills

The **Send Bills** menu provides several options for sending bills:

-   **Send to All UNPAID Customers:** Sends a bill to every customer with the "Unpaid" status in the "Payment" column.
-   **Send to UNPAID (Specific Due Date):** Prompts you to enter a due date or month and then sends a bill to all unpaid customers with a matching due date.
-   **Send Bill to Specific Order ID:** Prompts you to enter an Order ID and sends a bill to that specific customer.
-   **Test with First Unpaid Row:** Sends a test bill to the first unpaid customer found in the sheet.
-   **Clear All Message Statuses:** Clears all the values in the "Message Status" column.

### Automated "Thank You" Messages

When you change a customer's **Payment** status to "Paid" (case-insensitive), the script will automatically send them a "Thank You" SMS.

### Dry Run Mode

The `DRY_RUN_MODE` is a configuration option in the `config.gs` file. When set to `true`, the script will simulate sending messages without actually sending any SMS messages. Instead, it will log the actions to the Apps Script logger and update the "Message Status" column with a "[DRY RUN]" message. This is useful for testing the script's logic without incurring Twilio charges.

## Configuration

The `config.gs` file contains a configuration section at the top where you can customize the script's behavior:

-   **`PHONE_NUMBER_HEADER`, `CUSTOMER_NAME_HEADER`, etc.:** These constants define the exact names of the column headers in your sheet. If you change the header names in your sheet, you must also update them here.
-   **`BUSINESS_NAME`, `ETRANSFER_EMAIL`, `SCREENSHOT_PHONE`:** These constants are used to customize the content of the SMS messages.
-   **`DRY_RUN_MODE`:** Set to `true` to enable testing mode, or `false` for production use.
-   **`BATCH_SIZE`:** The maximum number of messages to send per execution.
-   **`MESSAGE_DELAY_MS`:** The delay in milliseconds between each message to avoid rate-limiting errors.

## Troubleshooting

-   **"Error: Twilio Account SID is not set.":** This error means that you have not set your Twilio credentials. Use the **Credentials** menu to set your Account SID, Auth Token, and Phone Number.
-   **"Error: One or more required columns are missing...":** This error means that one or more of the required column headers are missing from your sheet. Make sure that all the required headers are present in the first row of your sheet.
-   **"Thank You Error: Invalid Phone":** This error in the "Message Status" column means that the phone number for that customer is not in a valid format. The script expects phone numbers in the E.164 format (e.g., +16475551234).