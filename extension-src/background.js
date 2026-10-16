'use strict';

/**
 * Etsy Profit Assistant - Extension Background Service Worker
 * 
 * Minimal Manifest V3 service worker.
 * Strictly local and offline:
 * - Listens for toolbar action clicks and opens the packaged local analysis page in a new tab.
 * - No background network requests.
 * - No telemetry or analytics.
 * - No reading Etsy tabs, cookies, DOM, credentials, or browsing history.
 * - No persistent financial storage.
 */

chrome.action.onClicked.addListener(async () => {
  try {
    await chrome.tabs.create({
      url: chrome.runtime.getURL('index.html')
    });
  } catch (err) {
    console.error('Failed to open Etsy Profit Assistant tab:', err);
  }
});
