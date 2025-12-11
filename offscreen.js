// Notify background that we are alive and listening
chrome.runtime.sendMessage({ type: 'OFFSCREEN_LOADED' });

chrome.runtime.onMessage.addListener(async (msg) => {
    if (msg.type === 'INIT_AUDIO') {
        console.log("[Offscreen] Received Stream ID. Starting capture...");
        startAudioAnalysis(msg.streamId, msg.tabId);
    }
});

async function startAudioAnalysis(streamId, targetTabId) {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({
            audio: {
                mandatory: {
                    chromeMediaSource: 'tab',
                    chromeMediaSourceId: streamId
                }
            },
            video: false
        });

        const audioCtx = new AudioContext();
        const source = audioCtx.createMediaStreamSource(stream);
        const analyser = audioCtx.createAnalyser();
        
        analyser.fftSize = 128;
        analyser.smoothingTimeConstant = 0.5;
        
        source.connect(analyser);
        // CRITICAL: Connect to speakers so you can still hear the music
        source.connect(audioCtx.destination); 

        const dataArray = new Uint8Array(analyser.frequencyBinCount);

        function report() {
            if (!stream.active) {
                console.log("[Offscreen] Stream inactive.");
                return;
            }
            
            analyser.getByteFrequencyData(dataArray);
            
            // Send raw data back to the content script
            chrome.tabs.sendMessage(targetTabId, {
                type: 'VISUALIZER_UPDATE',
                data: Array.from(dataArray)
            }).catch(e => {
                // Consuming tab is likely closed/refreshed
            });

            requestAnimationFrame(report);
        }

        report();
        console.log("[Offscreen] Audio Loop Started!");

    } catch (e) {
        console.error("[Offscreen] getUserMedia Failed:", e);
    }
}