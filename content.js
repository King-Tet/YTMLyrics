// --- STATE & CONFIG ---
let lyrics = [];
let activeLineIndex = -1;
let visualizerCtx = null;
let visualizerCanvas = null;
let isVisualizerOn = true; // Default ON

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

// Format seconds to mm:ss
function formatTime(seconds) {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
}

// --- 2. API ---
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

// --- 3. UI ---
function createOverlay() {
    if (document.getElementById('ytm-lyrics-container')) return;

    const container = document.createElement('div');
    container.id = 'ytm-lyrics-container';
    
    // Header
    const header = document.createElement('div');
    header.id = 'ytm-header';
    header.innerHTML = `<span id="ytm-title-label">Lyric Fixer</span><span id="ytm-settings-btn">⚙️</span>`;

    // Visualizer Canvas (Background)
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
        <button class="save-btn" id="save-settings">Done</button>
    `;

    // List & Status
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

    applyStyles();
    setupDrag(container, header);
    setupSettingsEvents();
    
    // Start Visualizer Loop
    requestAnimationFrame(renderVisualizer);
}

// --- 4. VISUALIZER ENGINE ---
function renderVisualizer() {
    if (!visualizerCanvas || !visualizerCtx) return;
    
    // Handle Canvas Resize
    const container = document.getElementById('ytm-lyrics-container');
    if (container.clientWidth !== visualizerCanvas.width || container.clientHeight !== visualizerCanvas.height) {
        visualizerCanvas.width = container.clientWidth;
        visualizerCanvas.height = container.clientHeight;
    }

    const width = visualizerCanvas.width;
    const height = visualizerCanvas.height;
    const ctx = visualizerCtx;

    // Clear
    ctx.clearRect(0, 0, width, height);

    // Only draw if ON and Video is Playing
    const video = document.querySelector('video');
    const isPlaying = video && !video.paused;

    if (currentSettings.showVisualizer && isPlaying) {
        ctx.fillStyle = currentSettings.activeColor;
        
        // Create 20 bars
        const bars = 20;
        const barWidth = width / bars;
        
        for (let i = 0; i < bars; i++) {
            // Generate a random height based on time to make it look smooth (Perlin noise-ish)
            const time = Date.now() / 150; 
            const noise = Math.sin(time + i * 0.5) * Math.cos(time * 0.9 + i * 0.2);
            // Map -1..1 to 0..1 then scale
            const barHeight = Math.abs(noise) * (height * 0.4); 
            
            // Draw bars at the bottom
            const x = i * barWidth;
            const y = height - barHeight;
            
            // Add some transparency to the bars
            ctx.globalAlpha = 0.2;
            ctx.fillRect(x, y, barWidth - 2, barHeight);
        }
    }
    
    requestAnimationFrame(renderVisualizer);
}

// --- 5. RENDER LOGIC (Updated for Timestamps) ---
function renderLyrics() {
    const list = document.getElementById('lyric-list');
    list.innerHTML = '';
    lyrics.forEach((line, index) => {
        const row = document.createElement('div');
        row.className = 'lyric-line';
        row.dataset.index = index;
        
        // 1. Timestamp Span
        const timeSpan = document.createElement('span');
        timeSpan.className = 'lyric-time';
        timeSpan.innerText = formatTime(line.time);
        
        // 2. Text Span
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

// --- 6. SETTINGS & EVENTS ---
function setupSettingsEvents() {
    const btn = document.getElementById('ytm-settings-btn');
    const panel = document.getElementById('ytm-settings-panel');
    const saveBtn = document.getElementById('save-settings');

    btn.onclick = () => panel.classList.toggle('show');

    // Inputs
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

// ... (Rest of init/drag/save logic remains similar to previous step) ...

// --- RE-INSERT STANDARD INIT/SAVE LOGIC HERE TO COMPLETE THE FILE ---
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

function loadSettings(callback) {
    chrome.storage.local.get(['ytmSettings'], (result) => {
        if (result.ytmSettings) currentSettings = { ...defaultSettings, ...result.ytmSettings };
        callback();
    });
}

function init() {
    loadSettings(() => {
        createOverlay();
        setInterval(() => {
            const video = document.querySelector('video');
            if (video && !video.hasAttribute('data-lyric-listener')) {
                video.addEventListener('timeupdate', () => highlightLyrics(video.currentTime));
                video.setAttribute('data-lyric-listener', 'true');
            }
        }, 1000);
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
    });
}

init();