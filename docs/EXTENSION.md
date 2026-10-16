# Etsy Profit Assistant · Browser Extension Guide

> **Manifest V3 Local Extension (Chrome & Microsoft Edge)**  
> **Version:** 0.1.0 · **Architecture:** 100% Offline In-Memory Client · **Permissions:** None (`permissions: []`)

---

## 1. What Is This Extension?

The **Etsy Profit Assistant** browser extension is a private, offline workbench designed for Etsy sellers to inspect order contributions, platform fees, and source-net subtotals without risking their account credentials or sending sensitive financial files to third-party cloud servers.

Clicking the extension icon in your browser toolbar opens the packaged analyzer in a dedicated tab.

### Important Disclaimers & Technical Limitations

* **Independent Tool:** This extension is **not affiliated with, endorsed by, or sponsored by Etsy, Inc.** "Etsy" is a registered trademark of Etsy, Inc.
* **Local Analysis Only:** This tool does **not** provide automatic Etsy account synchronization or API scraping. You import anonymized CSV files directly on your computer.
* **No Real Etsy Compatibility Guarantee:** The native statement parser was built and tested against synthetic data modeled after the supported historical English/USD profile (`Date,Type,Title,Info,Currency,Amount,Fees & Taxes,Net`). It has not been validated against arbitrary real shop exports or future Etsy format revisions.
* **Demonstration / Prototype V0.1:** Designed to test whether separating fee sources, missing costs, and unlinked events is clearer than presenting a single opaque profit figure. It is not an official accounting, tax, or legal tool.

---

## 2. Privacy & Security Architecture

This extension is built with defense-in-depth security boundaries:

| Guarantee | Technical Implementation | What It Means for Sellers |
| :--- | :--- | :--- |
| **No Sensitive Permissions** | `permissions: []` in Manifest V3 | Declares no privileged permission requests. The code does not read browsing history, tabs, cookies, bookmarks, or downloads. (The extension uses only unprivileged `chrome.tabs.create` to open its own local package page). |
| **No Host Permissions** | `host_permissions` not declared | Declares no website access. Combined with strict `connect-src 'none'` CSP and no network code, network requests and content scraping on any site (including `etsy.com`) are blocked. |
| **Strict Container CSP** | `connect-src 'none'; object-src 'none'; script-src 'self'` | Strictly blocks network calls (`fetch`, `XMLHttpRequest`, `WebSocket`, `sendBeacon`) in both the background service worker and extension pages. |
| **Volatile Session Memory** | No `chrome.storage` or persistent database for financials | Data exists only in JavaScript heap memory during the active session. Closing the tab or clicking "Clear session data" drops in-memory references and resets state (standard browser garbage collection / tab lifecycle, not a cryptographic OS memory overwrite). |
| **Packaged Scripts Only** | Packaged local scripts (No inline scripts / no `eval`) | All application scripts are locally packaged files; inline scripts and dynamic `eval` are disallowed by policy. |
| **100% Offline Capable** | Self-contained package | Operates without network connectivity. |

---

## 3. Installation Guide (Chromium Browsers)

Run `npm run build:extension` first: it generates `dist-extension/` and `dist-extension.zip`. Both are build output and are not committed to the repository, so a fresh clone has neither until you build them. The extension is then distributed as a local unpackaged folder (`dist-extension`) and a standalone archive (`dist-extension.zip`). You do not need to install anything from the Chrome Web Store.

### Verified Environment & Browser Status

* **Google Chrome**: Verified on Chrome 149 (Windows x64) via unpacked extension loading. Other Chrome versions are unverified.
* **Microsoft Edge**: Manual unpacked installation instructions are provided below, but Edge remains untested in this environment.
* Other Chromium-based browsers or operating systems have not been tested or verified.

---

### Method A: Install in Google Chrome

1. **Locate the Extension Folder:**
   * If you have `dist-extension.zip`, extract it to a convenient folder (e.g., `Documents/etsy-profit-assistant`).
   * If using the local workspace build, the folder is located at `dist-extension/`.

2. **Open Extensions Management:**
   * In Chrome's address bar, type `chrome://extensions` and press **Enter**.
   * Alternatively, click the three-dot menu (**⋮**) at the top-right $\rightarrow$ **Extensions** $\rightarrow$ **Manage Extensions**.

3. **Enable Developer Mode:**
   * In the top-right corner of the Extensions page, toggle the switch for **Developer mode** to **ON**.

4. **Load the Extension:**
   * Click the **Load unpacked** button in the top-left toolbar.
   * In the file picker dialog, select the `dist-extension` folder (the directory containing `manifest.json`) and click **Select Folder**.

5. **Pin to Toolbar:**
   * Click the puzzle icon (🧩) next to your address bar in Chrome.
   * Find **Etsy Profit Assistant - Offline Local Analyzer** and click the pin icon (📌) to keep it visible on your toolbar.

---

### Method B: Install in Microsoft Edge (Untested)

1. **Locate or Extract the Folder:**
   * Extract `dist-extension.zip` or use the `dist-extension/` directory.

2. **Open Edge Extensions:**
   * In Edge's address bar, type `edge://extensions` and press **Enter**.

3. **Enable Developer Mode:**
   * On the left sidebar menu, locate and toggle **Developer mode** to **ON**.

4. **Load the Unpacked Folder:**
   * Click the **Load unpacked** button in the top toolbar.
   * Select the `dist-extension` directory and click **Select Folder**.

5. **Pin to Edge Toolbar:**
   * Click the puzzle icon (🧩) in the Edge toolbar.
   * Click the eye icon (Show in toolbar) next to **Etsy Profit Assistant**.

---

## 4. How to Use the Extension

1. **Launch the Workbench:**
   * Click the **Etsy Profit Assistant** icon (∑) in your browser toolbar.
   * A full-width analysis tab opens immediately.

2. **Step 1: Explore with the Synthetic Demo:**
   * Click **Load synthetic demo** to inspect an example ledger with 5 orders, unassigned fees, shipping costs, and refund adjustments.
   * Or click **Try Etsy-format sample** to see how native monthly statements are categorized.

3. **Step 2: Input Your Actual Costs:**
   * In the orders table, click **Details / costs** for any order.
   * Enter actual product, shipping, or packaging costs. Leaving a cost blank marks it as *Unknown* (missing inputs are never assumed to be zero).
   * Confirm the direct fee scope to calculate the order contribution.

4. **Step 3: Analyze Your Own Anonymized CSV:**
   * Expand the **Import CSV** section on the left sidebar.
   * Choose either:
     * **Etsy monthly statement (English / USD)**: Automatic detection of the supported historical English/USD profile (`Date, Type, Title, Info, Currency, Amount, Fees & Taxes, Net`).
     * **Generic event CSV**: For custom ledgers (`event_id, date, type, amount, order_id, currency`).
   * Parsing and calculations run locally in the client.

5. **Step 4: Export Reports:**
   * **Orders CSV**: Export line-by-line order contribution metrics.
   * **Export full report**: Export a self-contained, standalone HTML report containing the source-net bridge, order details, and source ledger traces.
   * **Persistence & Backups**: Downloaded CSV and HTML reports persist on your local computer where you save them, but exported files are static snapshots and are not resumable session backups (sessions cannot be reloaded from an export).

6. **Step 5: Clearing Session Data:**
   * Click **Clear session data** or close the browser tab. In-memory data is dereferenced and discarded from application state.

---

## 5. Frequently Asked Questions (FAQ)

### Q1: Why doesn't the extension automatically sync with Etsy?
**Answer:** Automatic sync is not implemented in this local prototype. The extension is intentionally scoped as a local, offline CSV analysis tool without shop integration, network access, or account login mechanisms.

### Q2: Does this extension send any of my sales data to external servers?
**Answer:** No. The extension enforces `connect-src 'none'` in its Content Security Policy, declares no host permissions, and contains no network, analytics, or telemetry code. All calculations run strictly in local JavaScript.

### Q3: How do I update the extension when a new version is released?
**Answer:**
1. Replace the files in your local `dist-extension` folder with the new build.
2. Go to `chrome://extensions` (or `edge://extensions`).
3. Find **Etsy Profit Assistant** and click the circular **Reload** icon (🔄).

---

## 6. Verification & Auditing

Sellers and technical auditors can independently inspect the extension package:
* `manifest.json`: Confirm `permissions: []`, absence of `host_permissions`, and CSP `connect-src 'none'; object-src 'none'; script-src 'self'`.
* `background.js`: Confirm the service worker only handles `chrome.action.onClicked` to open `index.html`.
* `index.html`: Inspect the `<meta http-equiv="Content-Security-Policy">` tag ensuring `connect-src 'none'` and externalized scripts.
