# Ilaxi's Gujarati Tiffin - Billing System

Google Apps Script automation for a tiffin (Indian lunch box delivery) service. Reads customer data from Google Sheets, sends SMS bills via Twilio API, and logs delivery status back to the spreadsheet.

## Features

- **Multiple Bill Message Templates** - First Notice, Follow-up Reminder, and Final Notice templates for escalating payment requests
- **Automated SMS Billing** - Send bills to all unpaid customers or filter by due date
- **Individual Billing** - Send a bill to a specific customer using their Order ID
- **Automated "Thank You" Messages** - Auto-sends when payment status is marked as "Paid"
- **Settings Sidebar UI** - Configure all options without editing code
- **Secure Credential Storage** - Twilio API credentials stored in User Properties
- **Dry Run Mode** - Test functionality without sending actual SMS
- **Import/Export Settings** - Backup and restore your configuration
- **Color-Coded Status** - Visual feedback on message delivery status
- **Flexible Column Mapping** - Works with any column order; configure header names in settings

## Setup

### 1. Copy Script Files to Google Apps Script

1. Open your Google Sheet
2. Go to **Extensions > Apps Script**
3. Delete any existing code in the default `Code.gs` file
4. Create the following script files (click **+** next to Files, select **Script**):
   - `main` (rename the default Code.gs)
   - `config`
   - `settings-manager`
   - `spreadsheet`
   - `twilio`
   - `ui`
5. Create an HTML file (click **+** next to Files, select **HTML**):
   - `settings`
6. Copy the contents from each corresponding file in this repository
7. Save the project (Ctrl+S or Cmd+S)

### 2. Set Up Twilio Credentials

1. Sign up for a [Twilio account](https://www.twilio.com/try-twilio)
2. Get your Account SID and Auth Token from the [Twilio Console](https://www.twilio.com/console)
3. Purchase a phone number with SMS capabilities
4. In your Google Sheet, use the **Credentials** menu:
   - **Set Twilio Account SID** - Your account identifier
   - **Set Twilio Auth Token** - Your secret authentication token
   - **Set Twilio Phone Number** - Your Twilio phone number (format: `+1XXXXXXXXXX`)

### 3. Format Your Google Sheet

Create a sheet with the following column headers (order doesn't matter):

| Phone Number | Customer Name | Balance | No. of Tiffins | Due Date | Message Status | Order ID | Payment |
|:-------------|:--------------|:--------|:---------------|:---------|:---------------|:---------|:--------|
| +15197816446 | John Doe | $120.50 | 12 | 10/31/2025 | | 1001 | Unpaid |
| +16475707004 | Jane Smith | $250.00 | 25 | 9/30/2025 | | 1002 | Paid |

**Column descriptions:**
- **Phone Number** - Customer phone in E.164 format (e.g., `+16475551234`)
- **Customer Name** - Used in personalized messages
- **Balance** - Amount owed (include currency symbol)
- **No. of Tiffins** - Number of tiffins for the billing period
- **Due Date** - Payment due date (used for filtering)
- **Message Status** - Updated by the script with send results
- **Order ID** - Unique identifier for the customer/order
- **Payment** - Set to "Paid" or "Unpaid"

### 4. Authorize the Script

1. Run any menu function (e.g., **Send Bills > Test with First Unpaid Row**)
2. Click **Review permissions** when prompted
3. Select your Google account
4. Click **Advanced** > **Go to [Project Name] (unsafe)**
5. Click **Allow**

## Menu Reference

### Credentials Menu

| Option | Description |
|:-------|:------------|
| Set Twilio Account SID | Store your Twilio Account SID |
| Set Twilio Auth Token | Store your Twilio Auth Token |
| Set Twilio Phone Number | Store your Twilio sending number |
| Delete Account SID | Remove stored Account SID |
| Delete Auth Token | Remove stored Auth Token |
| Delete Phone Number | Remove stored Phone Number |

### Send Bills Menu

| Option | Description |
|:-------|:------------|
| Send to All UNPAID Customers | Send bills to every customer with "Unpaid" payment status |
| Send to UNPAID (Specific Due Date) | Filter by due date/month, then send to matching unpaid customers |
| Send Bill to Specific Order ID | Send a bill to one customer by their Order ID |
| Test with First Unpaid Row | Send a test bill to the first unpaid customer (for testing) |
| Clear All Message Statuses | Clear the Message Status column for all rows |

When sending bills, you'll be prompted to choose a message template:
1. **First Notice** - Initial payment request
2. **Follow-up Reminder** - For customers who haven't responded
3. **Final Notice** - Last reminder before service interruption

### Settings Menu

| Option | Description |
|:-------|:------------|
| Open Settings | Opens the settings sidebar with all configuration options |
| Export Settings | Export current settings as JSON for backup |
| Import Settings | Import settings from a JSON backup |
| Reset to Defaults | Reset all settings to factory defaults |

## Settings Configuration

Access via **Settings > Open Settings**. The sidebar has five tabs:

### Business Tab
- **Business Name** - Your business name (used in messages)
- **E-transfer Email** - Email for receiving payments
- **Phone Number** - Contact phone number
- **WhatsApp Link** - Link for payment screenshot submissions

### Templates Tab
Configure message templates with placeholders:

**Bill Message Templates:**
- **First Notice** - Initial payment request
- **Follow-up Reminder** - Second reminder
- **Final Notice** - Final warning

**Thank You Message** - Sent automatically when payment marked as "Paid"

**Available Placeholders:**
| Placeholder | Description |
|:------------|:------------|
| `{{businessName}}` | Your business name |
| `{{etransferEmail}}` | E-transfer email address |
| `{{phoneNumber}}` | Contact phone number |
| `{{whatsappLink}}` | WhatsApp screenshot link |
| `{{customerName}}` | Customer's name |
| `{{balance}}` | Amount owed |
| `{{numTiffins}}` | Number of tiffins |
| `{{month}}` | Billing month (from Due Date) |
| `{{orderId}}` | Customer's Order ID |

### Behavior Tab
- **Dry Run Mode** - When enabled, simulates sending without actual SMS
- **Batch Size** - Maximum messages per execution (default: 75)
- **Message Delay (ms)** - Delay between messages to avoid rate limiting (default: 1000)
- **Header Row Index** - Row number containing column headers (default: 1)

### Colors Tab
Customize status indicator colors:
- **Success** - Successful message delivery (default: green)
- **Error** - Failed message delivery (default: red)
- **Dry Run** - Simulated sends in dry run mode (default: yellow)

### Columns Tab
Map your sheet's column headers to the expected fields. Useful if your headers differ from the defaults.

## Automated Thank You Messages

When you change a customer's **Payment** status to "Paid" (case-insensitive), the script automatically sends a "Thank You" SMS using the configured template.

**Note:** For this to work automatically, you may need to set up an installable trigger:
1. In Apps Script, go to **Triggers** (clock icon in sidebar)
2. Click **+ Add Trigger**
3. Choose function: `onEdit`
4. Event source: From spreadsheet
5. Event type: On edit
6. Save

## Dry Run Mode

Test the system without sending real SMS messages:

1. Go to **Settings > Open Settings**
2. Click the **Behavior** tab
3. Enable **Dry Run Mode**
4. Save settings

In dry run mode:
- No actual SMS messages are sent
- Message Status shows "[DRY RUN]" prefix
- Rows are highlighted with the dry run color (yellow by default)
- All logic executes normally for testing

## Troubleshooting

| Error | Solution |
|:------|:---------|
| "Twilio Account SID is not set" | Use **Credentials** menu to set your Twilio credentials |
| "One or more required columns are missing" | Ensure all required headers exist; check column mappings in Settings |
| "Thank You Error: Invalid Phone" | Phone number must be E.164 format (e.g., `+16475551234`) |
| "Error 21608: Unverified phone" | Verify recipient number in Twilio console (trial accounts only) |
| "Error 21211: Invalid phone number" | Check the phone number format in your sheet |
| Script times out | Reduce **Batch Size** in Settings > Behavior |

## Constraints

- **6-minute execution limit** - Google Apps Script timeout; use batch size to stay within limit
- **Twilio rate limiting** - Default 1-second delay between messages; increase if needed
- **Trial account limitations** - Twilio trial requires verified recipient numbers

## File Structure

| File | Description |
|:-----|:------------|
| `main.gs` | Entry points (onOpen, onEdit triggers) and menu handlers |
| `config.gs` | Legacy constants (deprecated, kept for migration) |
| `settings-manager.gs` | Settings management, validation, template processing |
| `settings.html` | Sidebar UI for configuration |
| `spreadsheet.gs` | Sheet utilities and data processing |
| `twilio.gs` | Twilio API integration |
| `ui.gs` | UI dialogs, credential management, sidebar functions |

## License

Private project for Ilaxi's Gujarati Tiffin service.
