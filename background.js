let activeStreamId = null;
let activeTabId = null;

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    // 1. Listen for START from Popup
    if (msg.type === 'START_VISUALIZER') {
        // The popup sends the tabId manually
        const targetTabId = msg.tabId || sender.tab.id;
        console.log("[Background] Received START for Tab:", targetTabId);
        
        setupOffscreenAndCapture(targetTabId);
        sendResponse({ received: true }); // Keep popup happy
        return true;
    }
    
    // 2. Listen for READY from Offscreen
    if (msg.type === 'OFFSCREEN_LOADED') {
        console.log("[Background] Offscreen Ready. Handing off ID...");
        if (activeStreamId && activeTabId) {
            chrome.runtime.sendMessage({
                type: 'INIT_AUDIO',
                streamId: activeStreamId,
                tabId: activeTabId
            });
        }
    }
});

async function setupOffscreenAndCapture(tabId) {
    try {
        // THIS CALL must happen immediately after the Popup button click
        const streamId = await chrome.tabCapture.getMediaStreamId({
            targetTabId: tabId
        });
        
        activeStreamId = streamId;
        activeTabId = tabId;
        console.log("[Background] Stream ID Generated:", streamId);

        // Check/Create Offscreen
        const existingContexts = await chrome.runtime.getContexts({
            contextTypes: ['OFFSCREEN_DOCUMENT'],
        });

        if (existingContexts.length > 0) {
            chrome.runtime.sendMessage({
                type: 'INIT_AUDIO',
                streamId: streamId,
                tabId: tabId
            });
        } else {
            await chrome.offscreen.createDocument({
                url: 'offscreen.html',
                reasons: ['USER_MEDIA'],
                justification: 'Visualizer audio analysis',
            });
        }
    } catch (e) {
        console.error("[Background] Capture Failed:", e);
    }
}