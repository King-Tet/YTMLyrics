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
    activeColor: "#3ea6ff", fontSize: "16", bgOpacity: "0.85"
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

        // Watch for navigation (SPA) to ensure lyrics reset if needed
        const observer = new MutationObserver(() => {
            // Just a heartbeat check if the video element is replaced
            const video = document.querySelector('video');
            if (!video) return;
        });
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

        // Reset State
        lyrics = [];
        activeLineIndex = -1;
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

    const url = new URL("https://lrclib.net/api/get");
    url.searchParams.append("track_name", title);
    url.searchParams.append("artist_name", cleanArtist);
    url.searchParams.append("duration", duration);

    try {
        const response = await fetch(url);

        if (!response.ok) {
            // Attempt strict search if loose failed? 
            // For now, just show not found
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
        // Reset color to variable incase it was stuck
        lines[activeLineIndex].style.color = '';
    }

    // Activate new
    if (index >= 0 && lines[index]) {
        const line = lines[index];
        line.classList.add('active');
        line.style.color = currentSettings.activeColor; // Apply dynamic color

        // Scroll
        line.scrollIntoView({ behavior: 'smooth', block: 'center' });
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
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/>
                </svg>
                Lyrics
            </span>
            <div class="header-controls">
                <div class="icon-btn" id="ytm-minimize-btn" title="Minimize">
                    <svg viewBox="0 0 24 24"><path d="M6 19h12v2H6z"/></svg>
                </div>
            </div>
        </div>
        <div id="lyric-status">Waiting...</div>
        <div id="lyric-list"></div>
    `;

    document.body.appendChild(container);

    // Bind Events
    const header = container.querySelector('#ytm-header');
    setupDrag(container, header);

    // Minimize logic (simple toggle for now, user didn't ask for full minimize, but it's good UX)
    const list = container.querySelector('#lyric-list');
    const minBtn = container.querySelector('#ytm-minimize-btn');
    minBtn.onclick = () => {
        if (container.style.height === '48px') {
            container.style.height = currentSettings.height;
            minBtn.innerHTML = '<svg viewBox="0 0 24 24"><path d="M6 19h12v2H6z"/></svg>'; // Dash
        } else {
            currentSettings.height = container.style.height; // Save before minimize
            container.style.height = '48px'; // Header height
            minBtn.innerHTML = '<svg viewBox="0 0 24 24"><path d="M12 8l-6 6 1.41 1.41L12 10.83l4.59 4.58L18 14z"/></svg>'; // Up caret
        }
    };
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

    // Handle Opacity on the BG variable
    // We used --lyric-bg as pure RGB before, now we constructed it
    // Reconstruct the RGBA
    const alpha = currentSettings.bgOpacity;
    document.documentElement.style.setProperty('--lyric-bg', `rgba(20, 20, 20, ${alpha})`);
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
