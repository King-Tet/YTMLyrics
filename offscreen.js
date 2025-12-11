// Listen for the command to start capturing
chrome.runtime.onMessage.addListener(async (msg) => {
    if (msg.type === 'INIT_AUDIO') {
        startCapture(msg.tabId);
    }
});

async function startCapture(tabId) {
    try {
        // 1. Capture the audio stream
        const stream = await navigator.mediaDevices.getUserMedia({
            audio: {
                mandatory: {
                    chromeMediaSource: 'tab',
                    chromeMediaSourceId: tabId // We will get this ID differently in MV3
                }
            },
            video: false
        });

        // 2. Setup Audio Context
        const audioCtx = new AudioContext();
        const source = audioCtx.createMediaStreamSource(stream);
        const analyser = audioCtx.createAnalyser();
        
        analyser.fftSize = 256; // Detail level (higher = more bars)
        source.connect(analyser);
        // Important: Connect to destination so user can still hear it!
        source.connect(audioCtx.destination); 

        const dataArray = new Uint8Array(analyser.frequencyBinCount);

        // 3. The Broadcast Loop
        function report() {
            if (!stream.active) return;
            
            analyser.getByteFrequencyData(dataArray);
            
            // Send data to content script
            // We convert TypedArray to normal Array for messaging
            chrome.runtime.sendMessage({
                type: 'AUDIO_DATA',
                data: Array.from(dataArray)
            });

            requestAnimationFrame(report);
        }

        report();
    } catch (e) {
        console.error("Audio Capture Failed:", e);
    }
}

// MV3 specific trigger
chrome.tabCapture.getMediaStreamId({ consumerTabId: null }, (streamId) => {
    // In MV3 offscreen, we actually use this ID with getUserMedia
    navigator.mediaDevices.getUserMedia({
        audio: {
            mandatory: {
                chromeMediaSource: 'tab',
                chromeMediaSourceId: streamId
            }
        },
        video: false
    }).then(stream => {
        const audioCtx = new AudioContext();
        const source = audioCtx.createMediaStreamSource(stream);
        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = 128; // 64 frequency bins
        source.connect(analyser);
        source.connect(audioCtx.destination); // Play audio to speakers

        const dataArray = new Uint8Array(analyser.frequencyBinCount);

        function loop() {
            analyser.getByteFrequencyData(dataArray);
            // Broadcast to all tabs (content scripts)
            chrome.tabs.query({}, (tabs) => {
                for (const tab of tabs) {
                    chrome.tabs.sendMessage(tab.id, {
                        type: 'VISUALIZER_UPDATE',
                        data: Array.from(dataArray)
                    }).catch(() => {}); // Ignore errors from inactive tabs
                }
            });
            requestAnimationFrame(loop);
        }
        loop();
    });
});