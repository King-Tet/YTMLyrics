document.addEventListener('DOMContentLoaded', () => {
    // Elements
    const fontInput = document.getElementById('input-font');
    const opacityInput = document.getElementById('input-opacity');
    const colorInput = document.getElementById('input-color');
    const reloadBtn = document.getElementById('btn-reload');

    const fontVal = document.getElementById('font-val');
    const opacityVal = document.getElementById('opacity-val');

    // Defaults
    const defaultSettings = {
        fontSize: "16",
        bgOpacity: "0.85",
        activeColor: "#3ea6ff"
    };

    // Load Settings
    chrome.storage.local.get(['ytmSettings'], (result) => {
        const settings = { ...defaultSettings, ...(result.ytmSettings || {}) };

        fontInput.value = settings.fontSize;
        fontVal.innerText = settings.fontSize + 'px';

        opacityInput.value = settings.bgOpacity;
        opacityVal.innerText = Math.round(settings.bgOpacity * 100) + '%';

        colorInput.value = settings.activeColor;
    });

    // Listeners
    fontInput.addEventListener('input', (e) => {
        const val = e.target.value;
        fontVal.innerText = val + 'px';
        saveSetting('fontSize', val);
    });

    opacityInput.addEventListener('input', (e) => {
        const val = e.target.value;
        opacityVal.innerText = Math.round(val * 100) + '%';
        saveSetting('bgOpacity', val);
    });

    colorInput.addEventListener('input', (e) => {
        saveSetting('activeColor', e.target.value);
    });

    reloadBtn.addEventListener('click', () => {
        // Send message to active tab
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs[0]) {
                chrome.tabs.sendMessage(tabs[0].id, { type: 'RELOAD_LYRICS' });
            }
        });

        // Visual feedback
        const originalText = reloadBtn.innerHTML;
        reloadBtn.innerHTML = 'Reloading...';
        setTimeout(() => {
            reloadBtn.innerHTML = originalText;
        }, 1000);
    });

    function saveSetting(key, value) {
        chrome.storage.local.get(['ytmSettings'], (result) => {
            const current = result.ytmSettings || defaultSettings;
            current[key] = value;
            chrome.storage.local.set({ 'ytmSettings': current });
        });
    }
});
