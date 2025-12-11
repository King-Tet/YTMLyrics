// offscreen.js
chrome.runtime.onMessage.addListener(async (msg) => {
    if (msg.type === 'INIT_AUDIO') {
        startAudioAnalysis(msg.streamId, msg.tabId);
    }
});

async function startAudioAnalysis(streamId, targetTabId) {
    try {
        // 1. Redeem the Stream ID for a Real Media Stream
        const stream = await navigator.mediaDevices.getUserMedia({
            audio: {
                mandatory: {
                    chromeMediaSource: 'tab',
                    chromeMediaSourceId: streamId
                }
            },
            video: false
        });

        // 2. Setup Audio Context
        const audioCtx = new AudioContext();
        const source = audioCtx.createMediaStreamSource(stream);
        const analyser = audioCtx.createAnalyser();
        
        analyser.fftSize = 128; // Resolution of bars (64 data points)
        analyser.smoothingTimeConstant = 0.8; // Make it less jittery
        
        source.connect(analyser);
        source.connect(audioCtx.destination); // IMPORTANT: Keeps audio playing in speakers

        const dataArray = new Uint8Array(analyser.frequencyBinCount);

        // 3. The Broadcast Loop
        function report() {
            if (!stream.active) return; // Stop if stream dies
            
            analyser.getByteFrequencyData(dataArray);
            
            // Send data back to the specific tab that requested it
            chrome.tabs.sendMessage(targetTabId, {
                type: 'VISUALIZER_UPDATE',
                data: Array.from(dataArray)
            }).catch(err => {
                // If tab closed, stop loop
                if(err.message.includes("receiving end does not exist")) {
                     stream.getTracks().forEach(t => t.stop());
                }
            });

            requestAnimationFrame(report);
        }

        report();
        console.log("Audio analysis started!");

    } catch (e) {
        console.error("Offscreen Audio Error:", e);
    }
}