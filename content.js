// ============================================================================
//  YTM ULTIMATE LYRICS - CONTENT SCRIPT (v3.0 - Robust Fix)
// ============================================================================

// --- GLOBAL STATE ---
let lyrics = [];
let activeLineIndex = -1;
let currentSongSignature = ""; // Combination of Title + Artist to detect changes



// Default Settings
const defaultSettings = {
    top: "auto", left: "auto", bottom: "120px", right: "20px",
    width: "350px", height: "400px",
    activeColor: "#3ea6ff", fontSize: "16", bgOpacity: "0.85",

};
let currentSettings = { ...defaultSettings };

// ============================================================================
//  1. INITIALIZATION
// ============================================================================

function init() {
    console.log("[YTM Lyric Fixer] Initializing...");



    // B. Load Settings & Create UI
    loadSettings(() => {
        validatePosition();
        createOverlay();

        // C. Start The loops
        // Check for song changes every 1 second
        setInterval(checkForSongChange, 1000);

        // Sync lyrics to video time every 0.2 seconds (faster = smoother)
        setInterval(syncLyrics, 200);


    });
}

// ============================================================================
//  2. HYBRID SONG DETECTION (The Fix)
// ============================================================================

function checkForSongChange() {
    const video = document.querySelector('video');
    if (!video || video.duration < 1) return; // Wait for video to load

    let title = "";
    let artist = "";

    // METHOD A: Try Media Session API (Best/Cleanest)
    if ('mediaSession' in navigator && navigator.mediaSession.metadata) {
        title = navigator.mediaSession.metadata.title;
        artist = navigator.mediaSession.metadata.artist;
    }

    // METHOD B: DOM Scraping Fallback (If Method A fails)
    if (!title) {
        const titleEl = document.querySelector('.content-info-wrapper .title');
        const artistEl = document.querySelector('.content-info-wrapper .subtitle'); // Class names vary, this is a common one
        if (titleEl) title = titleEl.innerText;
        if (artistEl) artist = artistEl.innerText;
    }

    // If we still have nothing, stop.
    if (!title) return;

    // Check if song changed
    const signature = title + " - " + artist;
    if (signature !== currentSongSignature) {
        console.log(`[YTM Lyric Fixer] New Song: ${signature}`);
        currentSongSignature = signature;

        // Update UI immediately so you know it worked
        updateStatus(`Detected: ${title}`);

        fetchLyrics(title, artist, video.duration);
    }
}

function syncLyrics() {
    const video = document.querySelector('video');
    if (video) highlightLyrics(video.currentTime);
}

// ============================================================================
//  3. API FETCHING
// ============================================================================

async function fetchLyrics(title, artist, duration) {
    updateStatus(`Searching: ${title}...`);

    // Clean up artist name (remove "feat.", etc for better matching)
    const cleanArtist = artist ? artist.split('•')[0].split('feat')[0].trim() : "";

    const url = new URL("https://lrclib.net/api/get");
    url.searchParams.append("track_name", title);
    url.searchParams.append("artist_name", cleanArtist);
    url.searchParams.append("duration", duration);

    try {
        const response = await fetch(url);

        if (!response.ok) {
            updateStatus("Lyrics not found in DB");
            clearLyrics();
            return;
        }

        const data = await response.json();

        if (data.syncedLyrics) {
            lyrics = parseLRC(data.syncedLyrics);
            renderLyrics();
            updateStatus("Synced Lyrics");
        } else if (data.plainLyrics) {
            renderUnsynced(data.plainLyrics);
            updateStatus("Unsynced Lyrics");
        } else {
            updateStatus("No lyrics found");
            clearLyrics();
        }
    } catch (e) {
        console.error(e);
        updateStatus("Network/API Error");
        clearLyrics();
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
            if (text) result.push({ time, text });
        }
    });
    return result;
}

// ============================================================================
//  4. UI & RENDERING
// ============================================================================

function createOverlay() {
    if (document.getElementById('ytm-lyrics-container')) return;

    const container = document.createElement('div');
    container.id = 'ytm-lyrics-container';



    // Header
    const header = document.createElement('div');
    header.id = 'ytm-header';
    header.innerHTML = `<span id="ytm-title-label">Lyric Fixer</span><span id="ytm-settings-btn"><svg viewBox="0 0 24 24" width="20" height="20" fill="white"><path d="M19.14,12.94c0.04-0.3,0.06-0.61,0.06-0.94c0-0.32-0.02-0.64-0.07-0.94l2.03-1.58c0.18-0.14,0.23-0.41,0.12-0.61 l-1.92-3.32c-0.12-0.22-0.37-0.29-0.59-0.22l-2.39,0.96c-0.5-0.38-1.03-0.7-1.62-0.94L14.4,2.81c-0.04-0.24-0.24-0.41-0.48-0.41 h-3.84c-0.24,0-0.43,0.17-0.47,0.41L9.25,5.35C8.66,5.59,8.12,5.92,7.63,6.29L5.24,5.33c-0.22-0.08-0.47,0-0.59,0.22L2.74,8.87 C2.62,9.08,2.66,9.34,2.86,9.48l2.03,1.58C4.84,11.36,4.8,11.69,4.8,12s0.02,0.64,0.07,0.94l-2.03,1.58 c-0.18,0.14-0.23,0.41-0.12,0.61l1.92,3.32c0.12,0.22,0.37,0.29,0.59,0.22l2.39-0.96c0.5,0.38,1.03,0.7,1.62,0.94l0.36,2.54 c0.05,0.24,0.24,0.41,0.48,0.41h3.84c0.24,0,0.44-0.17,0.47-0.41l0.36-2.54c0.59-0.24,1.13-0.56,1.62-0.94l2.39,0.96 c0.22,0.08,0.47,0,0.59-0.22l1.92-3.32c0.12-0.22,0.07-0.47-0.12-0.61L19.14,12.94z M12,15.6c-1.98,0-3.6-1.62-3.6-3.6 s1.62-3.6,3.6-3.6s3.6,1.62,3.6,3.6S13.98,15.6,12,15.6z"/></svg></span>`;

    // Settings Panel
    const settingsPanel = document.createElement('div');
    settingsPanel.id = 'ytm-settings-panel';
    settingsPanel.innerHTML = `
        <h3>Settings</h3>
        <div class="setting-row"><label>Color</label> <input type="color" id="set-color" value="${currentSettings.activeColor}"></div>
        <div class="setting-row"><label>Font Size</label> <input type="range" id="set-font" min="12" max="32" value="${currentSettings.fontSize}"></div>
        <div class="setting-row"><label>Opacity</label> <input type="range" id="set-opacity" min="0.1" max="1" step="0.1" value="${currentSettings.bgOpacity}"></div>
        <button class="save-btn" id="save-settings">Done</button>
    `;

    // Status Bar (Debugging Area)
    const status = document.createElement('div');
    status.id = 'lyric-status';
    status.innerText = "Waiting for song...";
    status.style.cssText = "padding: 5px 20px; font-size: 11px; color: #ffcc00; position:relative; z-index:2; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;";

    const list = document.createElement('div');
    list.id = 'lyric-list';

    container.appendChild(header);
    container.appendChild(settingsPanel);
    container.appendChild(status);
    container.appendChild(list);
    document.body.appendChild(container);

    applyStyles();
    setupDrag(container, header);
    setupSettingsEvents();
}

function renderLyrics() {
    const list = document.getElementById('lyric-list');
    list.innerHTML = '';
    lyrics.forEach((line, index) => {
        const row = document.createElement('div');
        row.className = 'lyric-line';
        row.dataset.index = index;

        // Format time mm:ss
        const m = Math.floor(line.time / 60);
        const s = Math.floor(line.time % 60);
        const timeStr = `${m}:${s.toString().padStart(2, '0')}`;

        row.innerHTML = `<span class="lyric-time">${timeStr}</span><span>${line.text}</span>`;
        row.onclick = () => { document.querySelector('video').currentTime = line.time; };
        list.appendChild(row);
    });
}

function renderUnsynced(text) {
    document.getElementById('lyric-list').innerHTML = `<div style="white-space: pre-wrap; padding:10px;">${text}</div>`;
}

function updateStatus(msg) {
    const el = document.getElementById('lyric-status');
    if (el) el.innerText = msg;
}

function clearLyrics() {
    lyrics = [];
    document.getElementById('lyric-list').innerHTML = '<div style="padding:20px; opacity:0.5; font-style:italic;">No lyrics available.</div>';
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

// ============================================================================
//  5. SETTINGS & DRAG
// ============================================================================

function setupDrag(element, handle) {
    let isDragging = false, offsetX, offsetY;
    handle.onmousedown = (e) => {
        isDragging = true;
        offsetX = e.clientX - element.getBoundingClientRect().left;
        offsetY = e.clientY - element.getBoundingClientRect().top;
        element.style.bottom = 'auto'; element.style.right = 'auto';
        document.body.style.cursor = 'grabbing';
    };
    document.onmousemove = (e) => {
        if (!isDragging) return;
        let newLeft = e.clientX - offsetX;
        let newTop = e.clientY - offsetY;
        if (newTop < 0) newTop = 0;
        if (newTop > window.innerHeight - 30) newTop = window.innerHeight - 30;
        if (newLeft < 0) newLeft = 0;
        if (newLeft > window.innerWidth - 50) newLeft = window.innerWidth - 50;
        element.style.left = newLeft + 'px';
        element.style.top = newTop + 'px';
    };
    document.onmouseup = () => { if (isDragging) { isDragging = false; document.body.style.cursor = 'default'; saveSettings(); } };
}

function setupSettingsEvents() {
    const btn = document.getElementById('ytm-settings-btn');
    const panel = document.getElementById('ytm-settings-panel');
    const saveBtn = document.getElementById('save-settings');
    btn.onclick = () => panel.classList.toggle('show');
    document.getElementById('set-color').oninput = (e) => {
        currentSettings.activeColor = e.target.value;
        document.documentElement.style.setProperty('--lyric-active', e.target.value);
    };
    document.getElementById('set-font').oninput = (e) => {
        currentSettings.fontSize = e.target.value;
        document.documentElement.style.setProperty('--lyric-font-size', e.target.value + 'px');
    };
    document.getElementById('set-opacity').oninput = (e) => {
        currentSettings.bgOpacity = e.target.value;
        document.documentElement.style.setProperty('--lyric-bg', `rgba(0, 0, 0, ${e.target.value})`);
    };

    saveBtn.onclick = () => { panel.classList.remove('show'); saveSettings(); };
}

function saveSettings() {
    const container = document.getElementById('ytm-lyrics-container');
    if (!container) return;
    const rect = container.getBoundingClientRect();
    currentSettings.top = rect.top + "px";
    currentSettings.left = rect.left + "px";
    currentSettings.width = rect.width + "px";
    currentSettings.height = rect.height + "px";
    chrome.storage.local.set({ 'ytmSettings': currentSettings });
}

function loadSettings(callback) {
    chrome.storage.local.get(['ytmSettings'], (result) => {
        if (result.ytmSettings) currentSettings = { ...defaultSettings, ...result.ytmSettings };
        callback();
    });
}
function applyStyles() {
    const container = document.getElementById('ytm-lyrics-container');
    if (!container) return;
    container.style.top = currentSettings.top;
    container.style.left = currentSettings.left;
    container.style.width = currentSettings.width;
    container.style.height = currentSettings.height;
    document.documentElement.style.setProperty('--lyric-active', currentSettings.activeColor);
    document.documentElement.style.setProperty('--lyric-font-size', currentSettings.fontSize + 'px');
    document.documentElement.style.setProperty('--lyric-bg', `rgba(0, 0, 0, ${currentSettings.bgOpacity})`);
}

function validatePosition() {
    const topVal = parseInt(currentSettings.top);
    const leftVal = parseInt(currentSettings.left);
    if (!isNaN(topVal) && topVal < 0) currentSettings.top = "20px";
    if (!isNaN(leftVal) && leftVal < 0) currentSettings.left = "20px";
    if (!isNaN(topVal) && topVal > window.innerHeight - 50) currentSettings.top = (window.innerHeight - 300) + "px";
}

// START
if (document.readyState === "complete" || document.readyState === "interactive") init();
else window.addEventListener('DOMContentLoaded', init);