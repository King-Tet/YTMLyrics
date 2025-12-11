let lyrics = []; // Array to store { time, text }
let activeLineIndex = -1;

// 1. HELPER: Parse LRC format [00:12.50] -> seconds
function parseLRC(lrcString) {
    const lines = lrcString.split('\n');
    const result = [];
    
    lines.forEach(line => {
        // Regex to match timestamp [mm:ss.xx]
        const match = line.match(/\[(\d{2}):(\d{2}\.\d{2,3})\](.*)/);
        if (match) {
            const minutes = parseFloat(match[1]);
            const seconds = parseFloat(match[2]);
            const text = match[3].trim();
            const time = minutes * 60 + seconds;
            
            if (text) { // Ignore empty lines
                result.push({ time, text });
            }
        }
    });
    return result;
}

// 2. API: Fetch from LRCLIB
async function fetchLyrics(title, artist, duration) {
    updateStatus("Searching...");
    
    // LRCLIB requires duration to be reasonably accurate
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
            updateStatus("Synced Lyrics");
        } else if (data.plainLyrics) {
            updateStatus("Unsynced Lyrics");
            renderUnsynced(data.plainLyrics);
        } else {
            updateStatus("No lyrics found");
            clearLyrics();
        }
    } catch (e) {
        console.log("YTM Lyrics: API Error or Not Found", e);
        updateStatus("No lyrics found");
        clearLyrics();
    }
}

// 3. UI: Create the Overlay
function createOverlay() {
    if (document.getElementById('ytm-lyrics-container')) return;

    const container = document.createElement('div');
    container.id = 'ytm-lyrics-container';
    
    const status = document.createElement('div');
    status.className = 'lyric-status';
    status.id = 'lyric-status';
    status.innerText = "Ready";
    
    const list = document.createElement('div');
    list.id = 'lyric-list';

    container.appendChild(status);
    container.appendChild(list);
    document.body.appendChild(container);
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
    const list = document.getElementById('lyric-list');
    list.innerHTML = `<div style="white-space: pre-wrap;">${text}</div>`;
}

function renderLyrics() {
    const list = document.getElementById('lyric-list');
    list.innerHTML = '';
    
    lyrics.forEach((line, index) => {
        const p = document.createElement('div');
        p.className = 'lyric-line';
        p.innerText = line.text;
        p.dataset.index = index;
        
        // Allow clicking a line to seek video (Optional cool feature)
        p.onclick = () => {
            const video = document.querySelector('video');
            if(video) video.currentTime = line.time;
        };
        
        list.appendChild(p);
    });
}

// 4. SYNC: The Loop
function highlightLyrics(time) {
    if (lyrics.length === 0) return;

    // Find the current line (the last line where time >= line.time)
    let newIndex = -1;
    for (let i = 0; i < lyrics.length; i++) {
        if (time >= lyrics[i].time) {
            newIndex = i;
        } else {
            break; 
        }
    }

    if (newIndex !== activeLineIndex && newIndex !== -1) {
        const lines = document.querySelectorAll('.lyric-line');
        
        // Remove old active class
        if (activeLineIndex !== -1 && lines[activeLineIndex]) {
            lines[activeLineIndex].classList.remove('active');
        }

        // Add new active class
        if (lines[newIndex]) {
            lines[newIndex].classList.add('active');
            
            // Auto-scroll logic
            lines[newIndex].scrollIntoView({
                behavior: 'smooth',
                block: 'center'
            });
        }
        
        activeLineIndex = newIndex;
    }
}

// 5. MAIN: Initialization & Observers
function init() {
    createOverlay();

    // Watch for video updates
    const videoObserver = setInterval(() => {
        const video = document.querySelector('video');
        if (video) {
            // Attach listener only once
            if (!video.hasAttribute('data-lyric-listener')) {
                video.addEventListener('timeupdate', () => {
                    highlightLyrics(video.currentTime);
                });
                video.setAttribute('data-lyric-listener', 'true');
            }
        }
    }, 1000);

    // Watch for Song Changes
    let lastTitle = "";
    
    setInterval(() => {
        // YTM selectors (These can change, but these are currently standard)
        // Title is usually in the bottom bar "ytmusic-player-bar"
        const titleEl = document.querySelector('ytmusic-player-bar .title');
        const artistEl = document.querySelector('ytmusic-player-bar .byline');
        const video = document.querySelector('video');

        if (titleEl && artistEl && video && !isNaN(video.duration)) {
            const title = titleEl.innerText;
            // The byline often contains "Artist • Album • Year", we just want the Artist
            // Usually the first part before the bullet point
            let artist = artistEl.innerText;
            if (artist.includes('•')) {
                artist = artist.split('•')[0].trim();
            }

            // Detect change
            if (title !== lastTitle && video.duration > 0) {
                lastTitle = title;
                console.log(`New Song Detected: ${title} by ${artist}`);
                fetchLyrics(title, artist, video.duration);
            }
        }
    }, 2000); // Check every 2s
}

// Start
init();