// background.js
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type === 'START_VISUALIZER') {
        startCapture(sender.tab.id);
    }
});

async function startCapture(tabId) {
    // 1. Create the offscreen document if it doesn't exist
    const existingContexts = await chrome.runtime.getContexts({
        contextTypes: ['OFFSCREEN_DOCUMENT'],
    });

    if (existingContexts.length === 0) {
        await chrome.offscreen.createDocument({
            url: 'offscreen.html',
            reasons: ['USER_MEDIA'],
            justification: 'Visualizer audio analysis',
        });
    }

    // 2. Get the Stream ID (The "Key" to the audio)
    // specific to the tab that requested it
    const streamId = await chrome.tabCapture.getMediaStreamId({
        targetTabId: tabId
    });

    // 3. Send the Key to the Offscreen Document
    chrome.runtime.sendMessage({
        type: 'INIT_AUDIO',
        streamId: streamId,
        tabId: tabId
    });
}