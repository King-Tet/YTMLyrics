// background.js - Service Worker
// Currently minimal/empty as visualizer logic has been removed.
// Kept for future extension features.

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type === 'LOG') {
        console.log("[Content Script]", msg.msg);
    }
});