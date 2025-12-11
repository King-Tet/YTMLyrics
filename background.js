// background.js
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type === 'START_VISUALIZER') {
        setupOffscreenDocument(msg.streamId).then(() => {
            sendResponse({ success: true });
        });
        return true; 
    }
});

let creating; // A global promise to avoid race conditions
async function setupOffscreenDocument(path) {
    // Check if offscreen doc already exists
    const existingContexts = await chrome.runtime.getContexts({
        contextTypes: ['OFFSCREEN_DOCUMENT'],
    });

    if (existingContexts.length > 0) {
        return;
    }

    // Create it
    if (creating) {
        await creating;
    } else {
        creating = chrome.offscreen.createDocument({
            url: 'offscreen.html',
            reasons: ['USER_MEDIA'],
            justification: 'To analyze audio frequencies for a music visualizer',
        });
        await creating;
        creating = null;
    }
}