document.getElementById('btn-start').onclick = async () => {
    const status = document.getElementById('status');
    status.innerText = "Connecting...";

    // 1. Get the current active tab (YouTube Music)
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (!tab) {
        status.innerText = "Error: No tab found";
        return;
    }

    // 2. Send the message to Background (Passed through from Popup = Trusted User Gesture)
    chrome.runtime.sendMessage({ type: 'START_VISUALIZER', tabId: tab.id }, (response) => {
        if (chrome.runtime.lastError) {
            status.innerText = "Error: " + chrome.runtime.lastError.message;
        } else {
            status.innerText = "Sync Active! You can close this.";
            document.getElementById('btn-start').style.background = "#2ba640";
        }
    });
};