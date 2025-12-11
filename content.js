// --- STATE & CONFIG ---
let lyrics = [];
let activeLineIndex = -1;

// Visualizer State
let audioData = new Array(64).fill(0); // Audio frequency data (0-255)
let visualizerCtx = null;
let visualizerCanvas = null;
let visualizerPreset = "bars"; // Options: "bars", "wave", "shockwave"

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
    bgOpacity: "0.85",
    showVisualizer: true
};

let currentSettings = { ...defaultSettings };

// --- 1. INITIALIZATION & RESCUE ---
function init() {
    console.log("[YTM Lyric Fixer] Initializing...");
    
    // Attempt to start audio capture (requires background/offscreen setup)
    try {
        chrome.runtime.sendMessage({ type: 'START_VISUALIZER' });
    } catch (e) {
        console.warn("Visualizer backend not ready yet.");
    }

    // Listen for Audio Data from Offscreen Document
    chrome.runtime.onMessage.addListener((msg) => {
        if (msg.type === 'VISUALIZER_UPDATE') {
            audioData = msg.data;
        }
    });

    loadSettings(() => {
        // RESCUE PROTOCOL: Check if box is off-screen
        validatePosition();
        
        createOverlay();

        // Song Watcher (Media Session API)
        let lastTitle = "";
        setInterval(() => {
            if ('mediaSession' in navigator && navigator.mediaSession.metadata) {
                const md = navigator.mediaSession.metadata;
                const title = md.title;
                const artist = md.artist;
                const video = document.querySelector('video');
                
                if (title && title !== lastTitle && video && video.duration > 1) {
                    console.log(`[YTM Lyric Fixer] New Song: ${title}`);
                    lastTitle = title;
                    fetchLyrics(title, artist, video.duration);
                }
            }
        }, 1000);

        // Time Watcher
        setInterval(() => {
            const video = document.querySelector('video');
            if (video && !video.hasAttribute('data-lyric-listener')) {
                video.addEventListener('timeupdate', () => highlightLyrics(video.currentTime));
                video.setAttribute('data-lyric-listener', 'true');
            }
        }, 1000);
    });
}

function validatePosition() {
    // If top is negative or off-screen, reset to safe defaults
    const topVal = parseInt(currentSettings.top);
    const leftVal = parseInt(currentSettings.left);
    const headerHeight = 40;

    // Check if it's "stuck" above the screen
    if (!isNaN(topVal) && topVal < 0) {
        console.log("[YTM Lyric Fixer] Rescue: Resetting Top position");
        currentSettings.top = "20px";
    }
    
    // Check if it's "stuck" to the far left
    if (!isNaN(leftVal) && leftVal < 0) {
        currentSettings.left = "20px";
    }

    // Check if it's lost off the bottom/right (simple check)
    if (!isNaN(topVal) && topVal > window.innerHeight - headerHeight) {
        currentSettings.top = (window.innerHeight - 200) + "px";
    }
}

// --- 2. API & PARSING ---
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

async function fetchLyrics(title, artist, duration) {
    updateStatus("Searching...");
    const url = new URL("https://lrclib.net/api/get");
    url.searchParams.append("track_name", title);
    url.searchParams.append("artist_name", artist);
    url.searchParams.append("duration", duration);

    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error("404");
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

// --- 3. UI GENERATION ---
function createOverlay() {
    if (document.getElementById('ytm-lyrics-container')) return;

    const container = document.createElement('div');
    container.id = 'ytm-lyrics-container';
    
    // Visualizer Background
    const canvas = document.createElement('canvas');
    canvas.id = 'ytm-visualizer-canvas';
    container.appendChild(canvas);
    visualizerCanvas = canvas;
    visualizerCtx = canvas.getContext('2d');

    // Header
    const header = document.createElement('div');
    header.id = 'ytm-header';
    header.innerHTML = `<span id="ytm-title-label">Lyric Fixer</span><span id="ytm-settings-btn">⚙️</span>`;

    // Settings Panel
    const settingsPanel = document.createElement('div');
    settingsPanel.id = 'ytm-settings-panel';
    settingsPanel.innerHTML = `
        <h3>Settings</h3>
        <div class="setting-row">
            <label>Active Color</label> <input type="color" id="set-color" value="${currentSettings.activeColor}">
        </div>
        <div class="setting-row">
            <label>Font Size</label> <input type="range" id="set-font" min="12" max="32" value="${currentSettings.fontSize}">
        </div>
        <div class="setting-row">
            <label>Opacity</label> <input type="range" id="set-opacity" min="0.1" max="1" step="0.1" value="${currentSettings.bgOpacity}">
        </div>
        <div class="setting-row">
            <label>Visualizer</label> <input type="checkbox" id="set-vis" ${currentSettings.showVisualizer ? 'checked' : ''}>
        </div>
        <div class="setting-row">
            <label>Vis. Mode</label>
            <select id="set-preset" style="background:#333; color:#fff; border:none; padding:5px; border-radius:4px;">
                <option value="bars">Classic Bars</option>
                <option value="wave">Waveform</option>
                <option value="shockwave">Shockwave</option>
            </select>
        </div>
        <button class="save-btn" id="save-settings">Done</button>
    `;

    // Status & List
    const status = document.createElement('div');
    status.id = 'lyric-status';
    status.innerText = "Ready";
    status.style.cssText = "padding: 5px 20px; font-size: 12px; color: #aaa; position:relative; z-index:2;";
    
    const list = document.createElement('div');
    list.id = 'lyric-list';

    container.appendChild(header);
    container.appendChild(settingsPanel);
    container.appendChild(status);
    container.appendChild(list);
    document.body.appendChild(container);

    // Apply everything
    applyStyles();
    setupDrag(container, header);
    setupSettingsEvents();
    
    // Start Animation Loop
    requestAnimationFrame(renderVisualizer);
}

// --- 4. VISUALIZER ENGINE ---
function renderVisualizer() {
    if (!visualizerCanvas || !visualizerCtx) return;
    
    // Auto-resize canvas
    const container = document.getElementById('ytm-lyrics-container');
    if (container.clientWidth !== visualizerCanvas.width || container.clientHeight !== visualizerCanvas.height) {
        visualizerCanvas.width = container.clientWidth;
        visualizerCanvas.height = container.clientHeight;
    }

    const w = visualizerCanvas.width;
    const h = visualizerCanvas.height;
    const ctx = visualizerCtx;

    // Check if song is playing
    const video = document.querySelector('video');
    const isPlaying = video && !video.paused;

    // Clear (or Fade for trails)
    ctx.clearRect(0, 0, w, h);
    
    if (currentSettings.showVisualizer && isPlaying) {
        if (visualizerPreset === 'bars') drawBars(ctx, w, h);
        else if (visualizerPreset === 'wave') drawWave(ctx, w, h);
        else if (visualizerPreset === 'shockwave') drawShockwave(ctx, w, h);
    }
    
    requestAnimationFrame(renderVisualizer);
}

// Preset 1: Bars
function drawBars(ctx, w, h) {
    const bars = 20; // Reduced for cleaner look
    const barWidth = w / bars;
    const step = Math.floor(audioData.length / bars);

    for (let i = 0; i < bars; i++) {
        // Get average freq for this bar range
        let sum = 0;
        for(let j=0; j<step; j++) sum += audioData[i*step + j] || 0;
        const avg = sum / step;

        const barHeight = (avg / 255) * h * 0.6;
        
        ctx.fillStyle = currentSettings.activeColor;
        ctx.globalAlpha = 0.3; // Subtle transparency
        ctx.fillRect(i * barWidth, h - barHeight, barWidth - 2, barHeight);
    }
    ctx.globalAlpha = 1.0;
}

// Preset 2: Wave
function drawWave(ctx, w, h) {
    ctx.beginPath();
    ctx.lineWidth = 2;
    ctx.strokeStyle = currentSettings.activeColor;
    ctx.globalAlpha = 0.5;

    const sliceWidth = w / audioData.length;
    let x = 0;

    for (let i = 0; i < audioData.length; i++) {
        const v = audioData[i] / 128.0; 
        const y = (v * h) / 4 + h/2; // Center vertical

        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
        x += sliceWidth;
    }
    ctx.stroke();
    ctx.globalAlpha = 1.0;
}

// Preset 3: Shockwave
function drawShockwave(ctx, w, h) {
    const centerX = w / 2;
    const centerY = h / 2;
    
    // Calculate Bass intensity (first 4 bins)
    const bass = (audioData[0] + audioData[1] + audioData[2]) / 3;
    const radius = 30 + (bass / 255) * 80;

    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, 0, 2 * Math.PI);
    ctx.lineWidth = 5 + (bass/255) * 10;
    ctx.strokeStyle = currentSettings.activeColor;
    ctx.globalAlpha = (bass / 255) * 0.6; // Opacity based on loudness
    ctx.stroke();
    ctx.globalAlpha = 1.0;
}

// --- 5. DRAG & SETTINGS LOGIC ---
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
        
        let newLeft = e.clientX - offsetX;
        let newTop = e.clientY - offsetY;

        // BOUNDARY CHECK (Anti-stuck logic)
        // 1. Prevent going off the top
        if (newTop < 0) newTop = 0;
        
        // 2. Prevent going off the bottom (keep header visible)
        const maxTop = window.innerHeight - 30;
        if (newTop > maxTop) newTop = maxTop;

        // 3. Prevent going off left/right
        if (newLeft < 0) newLeft = 0;
        if (newLeft > window.innerWidth - 50) newLeft = window.innerWidth - 50;

        element.style.left = newLeft + 'px';
        element.style.top = newTop + 'px';
    };

    document.onmouseup = () => {
        if (isDragging) {
            isDragging = false;
            document.body.style.cursor = 'default';
            saveSettings();
        }
    };
}

function setupSettingsEvents() {
    const btn = document.getElementById('ytm-settings-btn');
    const panel = document.getElementById('ytm-settings-panel');
    const saveBtn = document.getElementById('save-settings');

    btn.onclick = () => panel.classList.toggle('show');

    // Live Config Updates
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
    document.getElementById('set-preset').onchange = (e) => {
        visualizerPreset = e.target.value;
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

// --- 6. RENDER HELPERS ---
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
function renderUnsynced(text) {
    document.getElementById('lyric-list').innerHTML = `<div style="white-space: pre-wrap;">${text}</div>`;
}
function updateStatus(msg) {
    const el = document.getElementById('lyric-status');
    if (el) el.innerText = msg;
}
function clearLyrics() {
    lyrics = [];
    document.getElementById('lyric-list').innerHTML = '';
}
function loadSettings(callback) {
    chrome.storage.local.get(['ytmSettings'], (result) => {
        if (result.ytmSettings) currentSettings = { ...defaultSettings, ...result.ytmSettings };
        callback();
    });
}

// --- START ---
if (document.readyState === "complete" || document.readyState === "interactive") {
    init();
} else {
    window.addEventListener('DOMContentLoaded', init);
}