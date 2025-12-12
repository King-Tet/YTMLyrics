// ============================================================================
//  YTM ULTIMATE LYRICS - CONTENT SCRIPT (v3.1 - Native Overhaul)
// ============================================================================

// --- GLOBAL STATE ---
let lyrics = [];
let activeLineIndex = -1;
let currentSongSignature = "";
let isDragging = false;
let retryCount = 0;
const MAX_RETRIES = 3;

// Default Settings
const defaultSettings = {
    top: "auto", left: "auto", bottom: "120px", right: "20px",
    width: "360px", height: "500px",
    activeColor: "#3ea6ff", fontSize: "16", bgOpacity: "0.85",
    align: "left"
};
let currentSettings = { ...defaultSettings };

// ============================================================================
//  1. INITIALIZATION & LIFECYCLE
// ============================================================================

function init() {
    console.log("[YTM Lyrics] Initializing...");

    // Load Settings First
    loadSettings(() => {
        createOverlay();
        applyStyles();

        // Start loops
        setInterval(checkForSongChange, 1000);
        setInterval(syncLyrics, 200);

        // Watch for navigation & title changes (SPA)
        const observer = new MutationObserver((mutations) => {
            // Trigger check if we suspect title/metadata changed
            // This allows faster detection than the 1s interval
            checkForSongChange();
        });

        // Observe body is broad, but necessary due to dynamic YTM structure. 
        // We can optimize if we know the specific container, but YTM changes classes often.
        // Limiting to childList helps performance.
        observer.observe(document.body, { childList: true, subtree: true });
    });
}

// Listen for messages from Popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === 'RELOAD_LYRICS') {
        console.log("[YTM Lyrics] Manual Reload Triggered");
        currentSongSignature = ""; // Force re-detection
        checkForSongChange();
    }
});

// Listen for Settings Changes
chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'local' && changes.ytmSettings) {
        currentSettings = { ...currentSettings, ...changes.ytmSettings.newValue };
        applyStyles();
        // If color changed, re-render active line to ensure it picks it up immediately
        if (changes.ytmSettings.newValue.activeColor) {
            const active = document.querySelector('.lyric-line.active');
            if (active) active.style.color = currentSettings.activeColor;
        }
    }
});

// ============================================================================
//  2. SONG DETECTION (ROBUST)
// ============================================================================

function checkForSongChange() {
    const video = document.querySelector('video');
    if (!video || video.duration < 1) return;

    // 1. Try Media Session (Primary)
    let title = navigator.mediaSession?.metadata?.title;
    let artist = navigator.mediaSession?.metadata?.artist;

    // 2. Fallback DOM Scraping
    if (!title) {
        const titleEl = document.querySelector('yt-formatted-string.title');
        const artistEl = document.querySelector('span.subtitle');
        if (titleEl) title = titleEl.innerText;
        if (artistEl) artist = artistEl.innerText;
    }

    if (!title) return;

    const signature = `${title} - ${artist}`;
    if (signature !== currentSongSignature) {
        console.log(`[YTM Lyrics] New Song Detected: ${signature}`);
        currentSongSignature = signature;

        // Reset State & Clear UI IMMEDIATELY
        lyrics = [];
        activeLineIndex = -1;

        const list = document.getElementById('lyric-list');
        if (list) list.innerHTML = '<div style="padding:20px; opacity:0.6;">Loading...</div>';

        updateStatus(`Detected: ${title}`);

        fetchLyrics(title, artist, video.duration);
    }
}

// ============================================================================
//  3. LYRIC FETCHING
// ============================================================================

async function fetchLyrics(title, artist, duration) {
    updateStatus("Searching...");

    // Cleanup artist for better matching
    const cleanArtist = artist ? artist.split('•')[0].split('feat')[0].trim() : "";

    // Helper to build URL
    const buildUrl = (useDuration) => {
        const url = new URL("https://lrclib.net/api/get");
        url.searchParams.append("track_name", title);
        url.searchParams.append("artist_name", cleanArtist);
        if (useDuration) url.searchParams.append("duration", duration);
        return url;
    };

    try {
        // Attempt 1: Strict match with duration
        let response = await fetch(buildUrl(true));

        // Attempt 2: Fallback to loose match (no duration)
        if (!response.ok) {
            console.log("[YTM Lyrics] Exact match failed. Retrying without duration...");
            updateStatus("Retry w/o time...");
            response = await fetch(buildUrl(false));
        }

        if (!response.ok) {
            updateStatus("Lyrics not found");
            renderMessage("No lyrics found for this song.");
            return;
        }

        const data = await response.json();

        if (data.syncedLyrics) {
            lyrics = parseLRC(data.syncedLyrics);
            renderLyricsList();
            updateStatus("Synced");
        } else if (data.plainLyrics) {
            renderUnsynced(data.plainLyrics);
            updateStatus("Unsynced");
        } else {
            updateStatus("No lyrics found");
            renderMessage("No lyrics found.");
        }
    } catch (e) {
        console.error("[YTM Lyrics] Fetch Error:", e);
        updateStatus("Error");
        renderMessage("Connection error. Try reloading.");
    }
}

function parseLRC(lrcString) {
    const lines = lrcString.split('\n');
    const result = [];
    lines.forEach(line => {
        const match = line.match(/\[(\d{2}):(\d{2}\.\d{2,3})\](.*)/);
        if (match) {
            const time = parseFloat(match[1]) * 60 + parseFloat(match[2]);
            const text = match[3].trim();
            // Allow empty lines for spacing if desired, but usually we skip
            if (text) result.push({ time, text });
        }
    });
    return result;
}

// ============================================================================
//  4. SYNC ENGINE
// ============================================================================

function syncLyrics() {
    const video = document.querySelector('video');
    if (!video || lyrics.length === 0) return;

    const currentTime = video.currentTime;

    // Find the current line
    let newIndex = -1;
    for (let i = 0; i < lyrics.length; i++) {
        if (currentTime >= lyrics[i].time) {
            newIndex = i;
        } else {
            break;
        }
    }

    if (newIndex !== activeLineIndex) {
        highlightLine(newIndex);
        activeLineIndex = newIndex;
    }
}

function highlightLine(index) {
    const lines = document.querySelectorAll('.lyric-line');

    // Deactivate old
    if (activeLineIndex >= 0 && lines[activeLineIndex]) {
        lines[activeLineIndex].classList.remove('active');
        lines[activeLineIndex].style.color = '';
    }

    // Activate new
    if (index >= 0 && lines[index]) {
        const line = lines[index];
        line.classList.add('active');
        line.style.color = currentSettings.activeColor;

        // Custom Scroll Logic (Prevents container scrolling)
        const list = document.getElementById('lyric-list');
        if (list) {
            // Calculate position to center the line
            const listHeight = list.clientHeight;
            const lineTop = line.offsetTop;
            const lineHeight = line.offsetHeight;

            list.scrollTo({
                top: lineTop - listHeight / 2 + lineHeight / 2,
                behavior: 'smooth'
            });
        }
    }
}

// ============================================================================
//  5. UI GENERATION (NATIVE STYLE)
// ============================================================================

function createOverlay() {
    if (document.getElementById('ytm-lyrics-container')) return;

    const container = document.createElement('div');
    container.id = 'ytm-lyrics-container';

    // HTML Structure
    container.innerHTML = `
        <div id="ytm-header">
            <span id="ytm-title-label">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" style="margin-right: 8px;">
                    <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/>
                </svg>
                Lyrics
            </span>
            <div class="header-controls">
                <!-- Settings Toggle -->
                <div class="icon-btn" id="ytm-settings-toggle" title="Settings">
                    <svg viewBox="0 0 24 24"><path d="M19.43 12.98c.04-.32.07-.64.07-.98 0-.34-.03-.66-.07-.98l2.11-1.65c.19-.15.24-.42.12-.64l-2-3.46c-.12-.22-.39-.3-.61-.22l-2.49 1c-.52-.4-1.08-.73-1.69-.98l-.38-2.65C14.46 2.18 14.25 2 14 2h-4c-.25 0-.46.18-.49.42l-.38 2.65c-.61.25-1.17.59-1.69.98l-2.49-1c-.23-.09-.49 0-.61.22l-2 3.46c-.13.22-.07.49.12.64l2.11 1.65c-.04.32-.07.65-.07.98 0 .33.03.66.07.98l-2.11 1.65c-.19.15-.24.42-.12.64l2 3.46c.12.22.39.3.61.22l2.49-1c.52.4 1.08.73 1.69.98l.38 2.65c.03.24.24.42.49.42h4c.25 0 .46-.18.49-.42l.38-2.65c.61-.25 1.17-.59 1.69-.98l2.49 1c.23.09.49 0 .61-.22l2-3.46c.12-.22.07-.49-.12-.64l-2.11-1.65zM12 15.5c-1.93 0-3.5-1.57-3.5-3.5s1.57-3.5 3.5-3.5 3.5 1.57 3.5 3.5-1.57 3.5-3.5 3.5z"/></svg>
                </div>
            </div>
        </div>

        <div id="lyric-status">Waiting...</div>

        <!-- Main Lyrics List -->
        <div id="lyric-list"></div>

        <!-- In-App Settings Overlay -->
        <div id="ytm-settings-overlay">

            <div class="settings-group">
                <span class="settings-label">Appearance</span>

                <div class="settings-row">
                    <span>Font Size</span>
                    <input type="range" class="ytm-slider" id="set-font" min="12" max="32" value="${currentSettings.fontSize}">
                </div>

                <div class="settings-row">
                    <span>Opacity</span>
                    <input type="range" class="ytm-slider" id="set-opacity" min="0.1" max="1" step="0.05" value="${currentSettings.bgOpacity}">
                </div>

                <div class="settings-row">
                    <span>Color</span>
                    <input type="color" id="set-color" value="${currentSettings.activeColor}" style="border:none; width:30px; height:30px; background:none; cursor:pointer;">
                </div>
            </div>

            <div class="settings-group">
                <span class="settings-label">Alignment</span>
                <div class="toggle-group">
                    <button class="toggle-btn ${currentSettings.align === 'left' ? 'active' : ''}" data-align="left" title="Left">
                        <svg viewBox="0 0 24 24"><path d="M15 15H3v2h12v-2zm0-8H3v2h12V7zM3 13h18v-2H3v2zm0 8h18v-2H3v2zM3 3v2h18V3H3z"/></svg>
                    </button>
                    <button class="toggle-btn ${currentSettings.align === 'center' ? 'active' : ''}" data-align="center" title="Center">
                        <svg viewBox="0 0 24 24"><path d="M7 15v2h10v-2H7zm-4 6h18v-2H3v2zm0-8h18v-2H3v2zm4-6v2h10V7H7zM3 3v2h18V3H3z"/></svg>
                    </button>
                    <button class="toggle-btn ${currentSettings.align === 'right' ? 'active' : ''}" data-align="right" title="Right">
                        <svg viewBox="0 0 24 24"><path d="M3 21h18v-2H3v2zm6-4h12v-2H9v2zm-6-4h18v-2H3v2zm6-4h12V7H9v2zM3 3v2h18V3H3z"/></svg>
                    </button>
                </div>
            </div>

            <div class="credits-box">
                <div class="credits-title">YT Music Lyrics</div>
                <div>v3.1</div>
                <div style="margin-top:4px; opacity:0.7;">Made using LRCLIB API.</div>
            </div>
        </div>
    `;

    document.body.appendChild(container);

    // Bind Header Events
    const header = container.querySelector('#ytm-header');
    setupDrag(container, header);

    // Toggle Settings
    const settingsBtn = container.querySelector('#ytm-settings-toggle');
    const settingsPanel = container.querySelector('#ytm-settings-overlay');

    settingsBtn.onclick = () => {
        const isVisible = settingsPanel.classList.contains('visible');
        if (isVisible) {
            settingsPanel.classList.remove('visible');
            settingsBtn.style.opacity = "0.7";
        } else {
            settingsPanel.classList.add('visible');
            settingsBtn.style.opacity = "1";
        }
    };

    // Bind Setting Inputs
    const setFont = container.querySelector('#set-font');
    setFont.oninput = (e) => {
        currentSettings.fontSize = e.target.value;
        saveSettings();
        applyStyles();
    };

    const setOpacity = container.querySelector('#set-opacity');
    setOpacity.oninput = (e) => {
        currentSettings.bgOpacity = e.target.value;
        saveSettings();
        applyStyles();
    };

    const setColor = container.querySelector('#set-color');
    setColor.oninput = (e) => {
        currentSettings.activeColor = e.target.value;
        saveSettings();
        applyStyles();

        // Immediate active line update
        const active = document.querySelector('.lyric-line.active');
        if (active) active.style.color = currentSettings.activeColor;
    };

    // Alignment Toggles
    const alignBtns = container.querySelectorAll('.toggle-btn');
    alignBtns.forEach(btn => {
        btn.onclick = () => {
            // Reset UI
            alignBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            // Apply
            currentSettings.align = btn.dataset.align;
            saveSettings();
            applyStyles();
        };
    });
}

function renderLyricsList() {
    const list = document.getElementById('lyric-list');
    list.innerHTML = '';

    lyrics.forEach((line, index) => {
        const row = document.createElement('div');
        row.className = 'lyric-line';
        row.dataset.index = index;

        const m = Math.floor(line.time / 60);
        const s = Math.floor(line.time % 60);
        const timeStr = `${m}:${s.toString().padStart(2, '0')}`;

        row.innerHTML = `<span class="lyric-time">${timeStr}</span><span class="lyric-text">${line.text}</span>`;

        row.onclick = () => {
            const video = document.querySelector('video');
            if (video) video.currentTime = line.time;
        };

        list.appendChild(row);
    });
}

function renderUnsynced(text) {
    const list = document.getElementById('lyric-list');
    list.innerHTML = `<div style="padding:24px; line-height:1.6; white-space: pre-wrap; opacity:0.8;">${text}</div>`;
}

function renderMessage(msg) {
    const list = document.getElementById('lyric-list');
    list.innerHTML = `<div style="padding:40px 24px; text-align:center; opacity:0.6; font-style:italic;">${msg}</div>`;
}

function updateStatus(msg) {
    const el = document.getElementById('lyric-status');
    if (el) el.innerText = msg;
}

function applyStyles() {
    const container = document.getElementById('ytm-lyrics-container');
    if (!container) return;

    if (currentSettings.top !== "auto") container.style.top = currentSettings.top;
    if (currentSettings.left !== "auto") container.style.left = currentSettings.left;
    if (currentSettings.bottom !== "auto") container.style.bottom = currentSettings.bottom;
    if (currentSettings.right !== "auto") container.style.right = currentSettings.right;

    if (container.style.height !== '48px') {
        container.style.width = currentSettings.width || defaultSettings.width;
        container.style.height = currentSettings.height || defaultSettings.height;
    }

    document.documentElement.style.setProperty('--lyric-font-size', currentSettings.fontSize + "px");
    document.documentElement.style.setProperty('--lyric-active', currentSettings.activeColor);

    const alpha = currentSettings.bgOpacity;
    document.documentElement.style.setProperty('--lyric-bg', `rgba(20, 20, 20, ${alpha})`);

    // Handle Alignment
    const list = document.getElementById('lyric-list');
    if (list) list.style.textAlign = currentSettings.align || 'left';

    // Update Slider inputs if styles came from storage/external
    const fontInput = container.querySelector('#set-font');
    if (fontInput) fontInput.value = currentSettings.fontSize;

    const opacityInput = container.querySelector('#set-opacity');
    if (opacityInput) opacityInput.value = currentSettings.bgOpacity;

    const colorInput = container.querySelector('#set-color');
    if (colorInput) colorInput.value = currentSettings.activeColor;

    const alignBtns = container.querySelectorAll('.toggle-btn');
    if (alignBtns.length > 0) {
        alignBtns.forEach(btn => {
            if (btn.dataset.align === (currentSettings.align || 'left')) btn.classList.add('active');
            else btn.classList.remove('active');
        });
    }
}

// ============================================================================
//  6. DRAGGING & STORAGE
// ============================================================================

function setupDrag(element, handle) {
    let startX, startY;

    handle.onmousedown = (e) => {
        isDragging = true;

        // Calculate offset from top-left of element
        const rect = element.getBoundingClientRect();
        startX = e.clientX - rect.left;
        startY = e.clientY - rect.top;

        // Switch to absolute positioning if not already
        element.style.bottom = 'auto';
        element.style.right = 'auto';
        document.body.style.cursor = 'grabbing';
    };

    document.onmousemove = (e) => {
        if (!isDragging) return;

        let newX = e.clientX - startX;
        let newY = e.clientY - startY;

        // Constraint check
        const winW = window.innerWidth;
        const winH = window.innerHeight;

        // Prevent going off screen completely
        if (newX < 0) newX = 0;
        if (newY < 0) newY = 0;
        if (newX + 100 > winW) newX = winW - 100;
        if (newY + 50 > winH) newY = winH - 50;

        element.style.left = newX + 'px';
        element.style.top = newY + 'px';
    };

    document.onmouseup = () => {
        if (isDragging) {
            isDragging = false;
            document.body.style.cursor = 'default';
            savePosition();
        }
    };
}

function savePosition() {
    const container = document.getElementById('ytm-lyrics-container');
    if (!container) return;

    const rect = container.getBoundingClientRect();
    currentSettings.top = rect.top + "px";
    currentSettings.left = rect.left + "px";
    currentSettings.width = rect.width + "px";
    currentSettings.height = rect.height + "px";

    // Save to storage
    chrome.storage.local.set({ 'ytmSettings': currentSettings });
}

function loadSettings(callback) {
    chrome.storage.local.get(['ytmSettings'], (result) => {
        if (result.ytmSettings) {
            currentSettings = { ...defaultSettings, ...result.ytmSettings };
        }
        callback();
    });
}

// Start
if (document.readyState === "complete" || document.readyState === "interactive") init();
else window.addEventListener('DOMContentLoaded', init);
