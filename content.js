// --- STATE & CONFIG ---
let lyrics = [];
let activeLineIndex = -1;
let observerInterval;

// Default Settings
const defaultSettings = {
    top: "auto",
    left: "auto",
    bottom: "120px",
    right: "20px",
    width: "350px",
    height: "400px",
    activeColor: "#3ea6ff",
    fontSize: "16",
    bgOpacity: "0.85"
};

let currentSettings = { ...defaultSettings };

// --- 1. CORE LYRIC LOGIC (Same as before) ---
function parseLRC(lrcString) {
    const lines = lrcString.split('\n');
    const result = [];
    lines.forEach(line => {
        const match = line.match(/\[(\d{2}):(\d{2}\.\d{2,3})\](.*)/);
        if (match) {
            const time = parseFloat(match[1]) * 60 + parseFloat(match[2]);
            const text = match[3].trim();
            if (text) result.push({ time, text });
        }
    });
    return result;
}

async function fetchLyrics(title, artist, duration) {
    updateStatus("Searching...");
    const url = new URL("https://lrclib.net/api/get");
    url.searchParams.append("track_name", title);
    url.searchParams.append("artist_name", artist);
    url.searchParams.append("duration", duration);

    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error("Not found");
        const data = await response.json();
        
        if (data.syncedLyrics) {
            lyrics = parseLRC(data.syncedLyrics);
            renderLyrics();
            updateStatus("Synced");
        } else if (data.plainLyrics) {
            updateStatus("Unsynced");
            renderUnsynced(data.plainLyrics);
        } else {
            updateStatus("No lyrics");
            clearLyrics();
        }
    } catch (e) {
        updateStatus("No lyrics");
        clearLyrics();
    }
}

// --- 2. UI CREATION ---
function createOverlay() {
    if (document.getElementById('ytm-lyrics-container')) return;

    const container = document.createElement('div');
    container.id = 'ytm-lyrics-container';
    
    // Header for Dragging
    const header = document.createElement('div');
    header.id = 'ytm-header';
    header.innerHTML = `
        <span id="ytm-title-label">Lyric Fixer</span>
        <span id="ytm-settings-btn">⚙️</span>
    `;

    // Status/Info Bar
    const status = document.createElement('div');
    status.id = 'lyric-status';
    status.style.padding = '5px 20px';
    status.style.fontSize = '12px';
    status.style.color = '#aaa';
    status.innerText = "Ready";

    // List Area
    const list = document.createElement('div');
    list.id = 'lyric-list';

    // Settings Panel
    const settingsPanel = document.createElement('div');
    settingsPanel.id = 'ytm-settings-panel';
    settingsPanel.innerHTML = `
        <h3>Settings</h3>
        <div class="setting-row">
            <label>Active Color</label>
            <input type="color" id="set-color" value="${currentSettings.activeColor}">
        </div>
        <div class="setting-row">
            <label>Font Size (px)</label>
            <input type="range" id="set-font" min="12" max="32" value="${currentSettings.fontSize}">
        </div>
        <div class="setting-row">
            <label>Background Opacity</label>
            <input type="range" id="set-opacity" min="0.1" max="1" step="0.1" value="${currentSettings.bgOpacity}">
        </div>
        <button class="save-btn" id="save-settings">Done</button>
    `;

    container.appendChild(header);
    container.appendChild(settingsPanel); // Hidden by default
    container.appendChild(status);
    container.appendChild(list);
    document.body.appendChild(container);

    // Load saved position/styles
    applyStyles();

    // Event Listeners
    setupDrag(container, header);
    setupSettingsEvents();
}

// --- 3. SETTINGS & STYLES ---
function applyStyles() {
    const container = document.getElementById('ytm-lyrics-container');
    if (!container) return;

    // Apply Position
    container.style.top = currentSettings.top;
    container.style.left = currentSettings.left;
    container.style.bottom = currentSettings.bottom;
    container.style.right = currentSettings.right;
    container.style.width = currentSettings.width;
    container.style.height = currentSettings.height;

    // Apply CSS Variables
    document.documentElement.style.setProperty('--lyric-active', currentSettings.activeColor);
    document.documentElement.style.setProperty('--lyric-font-size', currentSettings.fontSize + 'px');
    document.documentElement.style.setProperty('--lyric-bg', `rgba(0, 0, 0, ${currentSettings.bgOpacity})`);
}

function setupSettingsEvents() {
    const btn = document.getElementById('ytm-settings-btn');
    const panel = document.getElementById('ytm-settings-panel');
    const saveBtn = document.getElementById('save-settings');

    // Toggle Menu
    btn.onclick = () => {
        panel.classList.toggle('show');
    };

    // Live Preview Inputs
    document.getElementById('set-color').oninput = (e) => {
        document.documentElement.style.setProperty('--lyric-active', e.target.value);
        currentSettings.activeColor = e.target.value;
    };
    document.getElementById('set-font').oninput = (e) => {
        document.documentElement.style.setProperty('--lyric-font-size', e.target.value + 'px');
        currentSettings.fontSize = e.target.value;
    };
    document.getElementById('set-opacity').oninput = (e) => {
        document.documentElement.style.setProperty('--lyric-bg', `rgba(0, 0, 0, ${e.target.value})`);
        currentSettings.bgOpacity = e.target.value;
    };

    // Save & Close
    saveBtn.onclick = () => {
        panel.classList.remove('show');
        saveSettings();
    };
}

function saveSettings() {
    const container = document.getElementById('ytm-lyrics-container');
    
    // Capture final position/size (in case they dragged/resized)
    const rect = container.getBoundingClientRect();
    
    // We save "top/left" and clear "bottom/right" to ensure absolute positioning works
    currentSettings.top = rect.top + "px";
    currentSettings.left = rect.left + "px";
    currentSettings.bottom = "auto";
    currentSettings.right = "auto";
    currentSettings.width = rect.width + "px";
    currentSettings.height = rect.height + "px";

    chrome.storage.local.set({ 'ytmSettings': currentSettings }, () => {
        console.log("Settings Saved");
    });
}

function loadSettings(callback) {
    chrome.storage.local.get(['ytmSettings'], (result) => {
        if (result.ytmSettings) {
            currentSettings = { ...defaultSettings, ...result.ytmSettings };
        }
        callback();
    });
}

// --- 4. DRAG LOGIC ---
function setupDrag(element, handle) {
    let isDragging = false;
    let offsetX, offsetY;

    handle.onmousedown = (e) => {
        isDragging = true;
        offsetX = e.clientX - element.getBoundingClientRect().left;
        offsetY = e.clientY - element.getBoundingClientRect().top;
        element.style.bottom = 'auto';
        element.style.right = 'auto';
        document.body.style.cursor = 'grabbing';
    };

    document.onmousemove = (e) => {
        if (!isDragging) return;
        element.style.left = (e.clientX - offsetX) + 'px';
        element.style.top = (e.clientY - offsetY) + 'px';
    };

    document.onmouseup = () => {
        if (isDragging) {
            isDragging = false;
            document.body.style.cursor = 'default';
            saveSettings(); // Auto-save position on drop
        }
    };
}

// --- 5. RENDER & UPDATE HELPERS ---
function updateStatus(msg) {
    const el = document.getElementById('lyric-status');
    if (el) el.innerText = msg;
}
function clearLyrics() {
    lyrics = [];
    document.getElementById('lyric-list').innerHTML = '';
}
function renderUnsynced(text) {
    document.getElementById('lyric-list').innerHTML = `<div style="white-space: pre-wrap;">${text}</div>`;
}
function renderLyrics() {
    const list = document.getElementById('lyric-list');
    list.innerHTML = '';
    lyrics.forEach((line, index) => {
        const p = document.createElement('div');
        p.className = 'lyric-line';
        p.innerText = line.text;
        p.dataset.index = index;
        p.onclick = () => { document.querySelector('video').currentTime = line.time; };
        list.appendChild(p);
    });
}
function highlightLyrics(time) {
    if (lyrics.length === 0) return;
    let newIndex = -1;
    for (let i = 0; i < lyrics.length; i++) {
        if (time >= lyrics[i].time) newIndex = i;
        else break;
    }
    if (newIndex !== activeLineIndex && newIndex !== -1) {
        const lines = document.querySelectorAll('.lyric-line');
        if (activeLineIndex !== -1 && lines[activeLineIndex]) lines[activeLineIndex].classList.remove('active');
        if (lines[newIndex]) {
            lines[newIndex].classList.add('active');
            lines[newIndex].scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
        activeLineIndex = newIndex;
    }
}

// --- 6. INITIALIZATION ---
function init() {
    loadSettings(() => {
        createOverlay();
        
        // Video Time Listener
        const videoCheck = setInterval(() => {
            const video = document.querySelector('video');
            if (video && !video.hasAttribute('data-lyric-listener')) {
                video.addEventListener('timeupdate', () => highlightLyrics(video.currentTime));
                video.setAttribute('data-lyric-listener', 'true');
            }
        }, 1000);

        // Song Change Listener
        let lastTitle = "";
        setInterval(() => {
            const titleEl = document.querySelector('ytmusic-player-bar .title');
            const artistEl = document.querySelector('ytmusic-player-bar .byline');
            const video = document.querySelector('video');

            if (titleEl && artistEl && video && !isNaN(video.duration)) {
                const title = titleEl.innerText;
                let artist = artistEl.innerText.split('•')[0].trim();
                
                if (title !== lastTitle && video.duration > 0) {
                    lastTitle = title;
                    fetchLyrics(title, artist, video.duration);
                }
            }
        }, 2000);
        
        // Save Resize Changes (Using ResizeObserver)
        const resizeObserver = new ResizeObserver(() => {
           // We could save here, but let's just wait for user interaction to stop to avoid spamming storage
           // Or just save on settings close. For now, settings close handles explicit saves.
        });
        const container = document.getElementById('ytm-lyrics-container');
        if(container) resizeObserver.observe(container);
    });
}

init();