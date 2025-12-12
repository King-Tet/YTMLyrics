
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type === 'LOG') {
        console.log("[Content Script]", msg.msg);
    }
});