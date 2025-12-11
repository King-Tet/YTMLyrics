// --- STATE & CONFIG ---
let lyrics = [];
let activeLineIndex = -1;
let visualizerCtx = null;
let visualizerCanvas = null;
let isVisualizerOn = true;

const defaultSettings = {
    top: "auto", left: "auto", bottom: "120px", right: "20px",
    width: "350px", height: "400px",
    activeColor: "#3ea6ff", fontSize: "16", bgOpacity: "0.85",
    showVisualizer: true
};

let currentSettings = { ...defaultSettings };

// --- 1. HELPERS ---
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

function formatTime(seconds) {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
}

// --- 2. API ---
async function fetchLyrics(title, artist, duration) {
    console.log(`[YTM Lyric Fixer] Fetching: ${title} by ${artist} (${duration}s)`);
    updateStatus("Searching...");
    
    const url = new URL("https://lrclib.net/api/get");
    url.searchParams.append("track_name", title);
    url.searchParams.append("artist_name", artist);
    url.searchParams.append("duration", duration);

    try {
        const response = await fetch(url);
        
        if (!response.ok) {
            console.warn("[YTM Lyric Fixer] API returned 404 or error");
            updateStatus("Not Found");
            clearLyrics();
            return;
        }

        const data = await response.json();
        
        if (data.syncedLyrics) {
            console.log("[YTM Lyric Fixer] Synced lyrics found!");
            lyrics = parseLRC(data.syncedLyrics);
            renderLyrics();
            updateStatus("Synced");
        } else if (data.plainLyrics) {
            console.log("[YTM Lyric Fixer] Plain lyrics found.");
            updateStatus("Unsynced");
            renderUnsynced(data.plainLyrics);
        } else {
            updateStatus("No lyrics");
            clearLyrics();
        }
    } catch (e) {
        console.error("[YTM Lyric Fixer] Network Error:", e);
        updateStatus("Error");
        clearLyrics();
    }
}

// --- 3. UI ---
function createOverlay() {
    if (document.getElementById('ytm-lyrics-container')) return;

    const container = document.createElement('div');
    container.id = 'ytm-lyrics-container';
    
    // Header
    const header = document.createElement('div');
    header.id = 'ytm-header';
    header.innerHTML = `<span id="ytm-title-label">Lyric Fixer</span><span id="ytm-settings-btn">⚙️</span>`;

    // Visualizer Canvas
    const canvas = document.createElement('canvas');
    canvas.id = 'ytm-visualizer-canvas';
    container.appendChild(canvas);
    visualizerCanvas = canvas;
    visualizerCtx = canvas.getContext('2d');

    // Settings Panel
    const settingsPanel = document.createElement('div');
    settingsPanel.id = 'ytm-settings-panel';
    settingsPanel.innerHTML = `
        <h3>Settings</h3>
        <div class="setting-row"><label>Active Color</label> <input type="color" id="set-color" value="${currentSettings.activeColor}"></div>
        <div class="setting-row"><label>Font Size</label> <input type="range" id="set-font" min="12" max="32" value="${currentSettings.fontSize}"></div>
        <div class="setting-row"><label>Opacity</label> <input type="range" id="set-opacity" min="0.1" max="1" step="0.1" value="${currentSettings.bgOpacity}"></div>
        <div class="setting-row"><label>Visualizer</label> <input type="checkbox" id="set-vis" ${currentSettings.showVisualizer ? 'checked' : ''}></div>
        <button class="save-btn" id="save-settings">Done</button>
    `;

    const status = document.createElement('div');
    status.id = 'lyric-status';
    status.innerText = "Waiting for song...";
    status.style.cssText = "padding: 5px 20px; font-size: 12px; color: #aaa; position:relative; z-index:2;";
    
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
    requestAnimationFrame(renderVisualizer);
}

// --- 4. VISUALIZER ---
function renderVisualizer() {
    if (!visualizerCanvas || !visualizerCtx) return;
    
    const container = document.getElementById('ytm-lyrics-container');
    // Safety check if container was removed
    if (!container) return; 
    
    if (container.clientWidth !== visualizerCanvas.width || container.clientHeight !== visualizerCanvas.height) {
        visualizerCanvas.width = container.clientWidth;
        visualizerCanvas.height = container.clientHeight;
    }

    const width = visualizerCanvas.width;
    const height = visualizerCanvas.height;
    const ctx = visualizerCtx;

    ctx.clearRect(0, 0, width, height);
    const video = document.querySelector('video');
    const isPlaying = video && !video.paused;

    if (currentSettings.showVisualizer && isPlaying) {
        ctx.fillStyle = currentSettings.activeColor;
        const bars = 20;
        const barWidth = width / bars;
        
        for (let i = 0; i < bars; i++) {
            const time = Date.now() / 150; 
            const noise = Math.sin(time + i * 0.5) * Math.cos(time * 0.9 + i * 0.2);
            const barHeight = Math.abs(noise) * (height * 0.4); 
            ctx.globalAlpha = 0.2;
            ctx.fillRect(i * barWidth, height - barHeight, barWidth - 2, barHeight);
        }
    }
    requestAnimationFrame(renderVisualizer);
}

// --- 5. RENDER LOGIC ---
function renderLyrics() {
    const list = document.getElementById('lyric-list');
    list.innerHTML = '';
    lyrics.forEach((line, index) => {
        const row = document.createElement('div');
        row.className = 'lyric-line';
        row.dataset.index = index;
        
        const timeSpan = document.createElement('span');
        timeSpan.className = 'lyric-time';
        timeSpan.innerText = formatTime(line.time);
        
        const textSpan = document.createElement('span');
        textSpan.innerText = line.text;

        row.appendChild(timeSpan);
        row.appendChild(textSpan);
        row.onclick = () => { document.querySelector('video').currentTime = line.time; };
        list.appendChild(row);
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

// --- 6. SETTINGS & DRAG ---
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
    document.getElementById('set-vis').onchange = (e) => {
        currentSettings.showVisualizer = e.target.checked;
    };
    saveBtn.onclick = () => {
        panel.classList.remove('show');
        saveSettings();
    };
}

function saveSettings() {
    const container = document.getElementById('ytm-lyrics-container');
    const rect = container.getBoundingClientRect();
    currentSettings.top = rect.top + "px";
    currentSettings.left = rect.left + "px";
    currentSettings.width = rect.width + "px";
    currentSettings.height = rect.height + "px";
    chrome.storage.local.set({ 'ytmSettings': currentSettings });
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

function setupDrag(element, handle) {
    let isDragging = false;
    let offsetX, offsetY;
    handle.onmousedown = (e) => {
        isDragging = true;
        offsetX = e.clientX - element.getBoundingClientRect().left;
        offsetY = e.clientY - element.getBoundingClientRect().top;
    };
    document.onmousemove = (e) => {
        if (!isDragging) return;
        element.style.left = (e.clientX - offsetX) + 'px';
        element.style.top = (e.clientY - offsetY) + 'px';
        element.style.bottom = 'auto'; element.style.right = 'auto';
    };
    document.onmouseup = () => { if(isDragging) { isDragging = false; saveSettings(); }};
}

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
function loadSettings(callback) {
    chrome.storage.local.get(['ytmSettings'], (result) => {
        if (result.ytmSettings) currentSettings = { ...defaultSettings, ...result.ytmSettings };
        callback();
    });
}

// --- 7. MAIN (The Fix) ---
function init() {
    console.log("[YTM Lyric Fixer] Initializing...");
    loadSettings(() => {
        createOverlay();

        // 1. WATCHER: Use Media Session API (The Robust Fix)
        let lastTitle = "";
        
        setInterval(() => {
            // Check if media session is available
            if ('mediaSession' in navigator && navigator.mediaSession.metadata) {
                const md = navigator.mediaSession.metadata;
                const title = md.title;
                const artist = md.artist;
                
                const video = document.querySelector('video');
                
                // Only fetch if title changed AND we have a valid video duration
                if (title && title !== lastTitle && video && video.duration > 1) {
                    console.log("[YTM Lyric Fixer] Detected Song Change:", title);
                    lastTitle = title;
                    fetchLyrics(title, artist, video.duration);
                }
            } else {
                // Fallback debug
                // console.log("MediaSession not ready yet...");
            }
        }, 1000);

        // 2. TIME SYNC
        setInterval(() => {
            const video = document.querySelector('video');
            if (video && !video.hasAttribute('data-lyric-listener')) {
                console.log("[YTM Lyric Fixer] Attached Time Listener to Video");
                video.addEventListener('timeupdate', () => highlightLyrics(video.currentTime+0.1));
                video.setAttribute('data-lyric-listener', 'true');
            }
        }, 1000);
    });
}

// Wait for page load
if (document.readyState === "complete" || document.readyState === "interactive") {
    init();
} else {
    window.addEventListener('DOMContentLoaded', init);
}