// ========================================
// SCRIPT CONFIGURATION
// All user-tweakable settings are in this section.
// ========================================

// --- A. Sheet Layout Configuration ---
/**
 * Column header names. These MUST exactly match the headers in row 1 of your spreadsheet.
 * The script uses these names to find columns, so reordering columns in your sheet is safe.
 */
const PHONE_NUMBER_HEADER = "Phone Number";
const CUSTOMER_NAME_HEADER = "Customer Name";
const BALANCE_HEADER = "Balance";
const NUM_TIFFINS_HEADER = "No. of Tiffins";
const DUE_DATE_HEADER = "Due Date"; // Used to get the billing month
const MESSAGE_STATUS_HEADER = "Message Status";
const ORDER_ID_HEADER = "Order ID";
const PAYMENT_STATUS_HEADER = "Payment";

/**
 * The row number where your column headers are located.
 * This is 1-based (1 = the very first row in the sheet).
 */
const HEADER_ROW_INDEX = 1;

// --- B. Business Information ---
/**
 * Your business details, used in the SMS messages.
 */
const BUSINESS_NAME = "Ilaxi's Gujarati Tiffin";
const ETRANSFER_EMAIL = "info@ilaxifoods.ca";
const SCREENSHOT_PHONE = "+1 (647) 537-5956"; // Used for display text

// --- C. WhatsApp & Link Configuration ---
/**
 * Creates a clickable WhatsApp link with a pre-filled message.
 */
const WHATSAPP_LINK = `https://bit.ly/ilaxi-tiffins-etransfer-screenshot`;

// --- D. Script Behavior Configuration ---
/**
 * Set to true to test the script's logic without sending actual SMS messages.
 * When true, it logs actions to the Logger and updates the sheet with "[DRY RUN]".
 * Set to false for production use.
 */
const DRY_RUN_MODE = false;

/**
 * Maximum number of messages to send per execution (to avoid timeout).
 * Google Apps Script has a 6-minute execution limit.
 * Recommended: 50-100 messages per batch (about 1-2 minutes with 1 second delays).
 */
const BATCH_SIZE = 75;

/**
 * Delay between messages in milliseconds (1000 = 1 second).
 * This prevents API rate limiting and helps avoid timeouts.
 */
const MESSAGE_DELAY_MS = 1000;