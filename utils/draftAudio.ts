/**
 * Web Audio API synthesizer for Category Draft Board
 * Generates realistic Heartbeat & Tik-Tik pulses (last 10s countdown),
 * 3-Ring Arena Buzzer (time's up), and Celebratory Sold Fanfare.
 * 100% client-side with zero external mp3/asset dependencies.
 */

let audioCtx: AudioContext | null = null;
let isMuted: boolean = typeof window !== 'undefined' ? localStorage.getItem('draft_sound_muted') === 'true' : false;

function getAudioContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    try {
        if (!audioCtx) {
            const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
            if (AudioContextClass) {
                audioCtx = new AudioContextClass();
            }
        }
        if (audioCtx && audioCtx.state === 'suspended') {
            audioCtx.resume().catch(() => {});
        }
        return audioCtx;
    } catch {
        return null;
    }
}

// Unlock audio on first user interaction
if (typeof window !== 'undefined') {
    const unlockAudio = () => {
        const ctx = getAudioContext();
        if (ctx && ctx.state === 'suspended') {
            ctx.resume().catch(() => {});
        }
        window.removeEventListener('click', unlockAudio);
        window.removeEventListener('touchstart', unlockAudio);
        window.removeEventListener('keydown', unlockAudio);
    };
    window.addEventListener('click', unlockAudio, { passive: true });
    window.addEventListener('touchstart', unlockAudio, { passive: true });
    window.addEventListener('keydown', unlockAudio, { passive: true });
}

export function isDraftAudioMuted(): boolean {
    return isMuted;
}

export function setDraftAudioMuted(muted: boolean): void {
    isMuted = muted;
    if (typeof window !== 'undefined') {
        localStorage.setItem('draft_sound_muted', muted ? 'true' : 'false');
    }
}

/**
 * Play authentic 'Heartbeat + Tik-Tik' hybrid countdown audio
 * Blends deep sub-bass chest-pounding thump ("lub-dub") with a prominent,
 * crisp mechanical clock tick so it cuts through room speakers and projector setups.
 */
export function playCountdownTickSound(customVolume: number = 0.65): void {
    if (isMuted) return;
    const ctx = getAudioContext();
    if (!ctx) return;

    try {
        if (ctx.state === 'suspended') {
            ctx.resume().catch(() => {});
        }

        const now = ctx.currentTime;
        const masterGain = ctx.createGain();
        masterGain.gain.setValueAtTime(customVolume, now);
        masterGain.connect(ctx.destination);

        // --- LAYER 1: Sharp Clock "Tik-Tik" Mechanical Click Transient ---
        const tickOsc = ctx.createOscillator();
        const tickGain = ctx.createGain();
        const tickFilter = ctx.createBiquadFilter();

        tickFilter.type = 'bandpass';
        tickFilter.frequency.setValueAtTime(1400, now);
        tickFilter.Q.setValueAtTime(3.0, now);

        tickOsc.type = 'triangle';
        tickOsc.frequency.setValueAtTime(1200, now);
        tickOsc.frequency.exponentialRampToValueAtTime(380, now + 0.045);

        tickGain.gain.setValueAtTime(0.001, now);
        tickGain.gain.linearRampToValueAtTime(0.85, now + 0.004);
        tickGain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);

        tickOsc.connect(tickFilter);
        tickFilter.connect(tickGain);
        tickGain.connect(masterGain);

        tickOsc.start(now);
        tickOsc.stop(now + 0.06);

        // --- LAYER 2: Heartbeat Sub-Bass "Lub" Thump (85Hz -> 40Hz) ---
        const osc1 = ctx.createOscillator();
        const gain1 = ctx.createGain();
        const subFilter1 = ctx.createBiquadFilter();

        subFilter1.type = 'lowpass';
        subFilter1.frequency.setValueAtTime(150, now);

        osc1.type = 'sine';
        osc1.frequency.setValueAtTime(85, now);
        osc1.frequency.exponentialRampToValueAtTime(38, now + 0.12);

        gain1.gain.setValueAtTime(0.001, now);
        gain1.gain.linearRampToValueAtTime(0.9, now + 0.02);
        gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.13);

        osc1.connect(gain1);
        gain1.connect(subFilter1);
        subFilter1.connect(masterGain);

        osc1.start(now);
        osc1.stop(now + 0.14);

        // --- LAYER 3: Heartbeat Secondary "Dub" Thump at +0.12s (70Hz -> 35Hz) ---
        const osc2 = ctx.createOscillator();
        const gain2 = ctx.createGain();
        const subFilter2 = ctx.createBiquadFilter();

        subFilter2.type = 'lowpass';
        subFilter2.frequency.setValueAtTime(140, now + 0.12);

        osc2.type = 'sine';
        osc2.frequency.setValueAtTime(70, now + 0.12);
        osc2.frequency.exponentialRampToValueAtTime(34, now + 0.25);

        gain2.gain.setValueAtTime(0.001, now + 0.12);
        gain2.gain.linearRampToValueAtTime(0.65, now + 0.14);
        gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.26);

        osc2.connect(gain2);
        gain2.connect(subFilter2);
        subFilter2.connect(masterGain);

        osc2.start(now + 0.12);
        osc2.stop(now + 0.28);
    } catch {
        // Safe failover
    }
}

/**
 * Backward compatibility alias for heartbeat countdown
 */
export function playHeartbeatSound(customVolume: number = 0.65): void {
    playCountdownTickSound(customVolume);
}

/**
 * Play 3-Ring Arena Time's-Up Buzzer
 * Rings 3 distinct, unmistakable horn blasts in rapid succession:
 * Blast 1 (0 to 0.26s) -> Gap (0.10s) -> Blast 2 (0.36 to 0.62s) -> Gap (0.10s) -> Blast 3 (0.72 to 1.18s)
 */
export function playBuzzerSound(customVolume: number = 0.65): void {
    if (isMuted) return;
    const ctx = getAudioContext();
    if (!ctx) return;

    try {
        if (ctx.state === 'suspended') {
            ctx.resume().catch(() => {});
        }

        const now = ctx.currentTime;

        // Helper to synthesize a single arena horn blast
        const triggerBlast = (startTime: number, blastDuration: number, isFinal: boolean = false) => {
            const filter = ctx.createBiquadFilter();
            filter.type = 'bandpass';
            filter.frequency.setValueAtTime(280, startTime);
            filter.Q.setValueAtTime(1.6, startTime);

            const blastGain = ctx.createGain();
            blastGain.gain.setValueAtTime(0.01, startTime);
            blastGain.gain.linearRampToValueAtTime(customVolume, startTime + 0.02);
            blastGain.gain.setValueAtTime(customVolume, startTime + blastDuration - 0.06);
            blastGain.gain.exponentialRampToValueAtTime(0.001, startTime + blastDuration);

            filter.connect(blastGain);
            blastGain.connect(ctx.destination);

            // Sawtooth primary
            const osc1 = ctx.createOscillator();
            osc1.type = 'sawtooth';
            osc1.frequency.setValueAtTime(isFinal ? 134 : 142, startTime);

            // Detuned square secondary
            const osc2 = ctx.createOscillator();
            osc2.type = 'square';
            osc2.frequency.setValueAtTime(isFinal ? 140 : 148, startTime);

            // Sub-bass growl
            const subOsc = ctx.createOscillator();
            subOsc.type = 'sawtooth';
            subOsc.frequency.setValueAtTime(isFinal ? 67 : 71, startTime);

            osc1.connect(filter);
            osc2.connect(filter);
            subOsc.connect(filter);

            osc1.start(startTime);
            osc2.start(startTime);
            subOsc.start(startTime);

            osc1.stop(startTime + blastDuration);
            osc2.stop(startTime + blastDuration);
            subOsc.stop(startTime + blastDuration);
        };

        // RING 1
        triggerBlast(now, 0.25, false);

        // RING 2 (after 0.36s)
        triggerBlast(now + 0.36, 0.25, false);

        // RING 3 (after 0.72s - longer resonant final blast)
        triggerBlast(now + 0.72, 0.48, true);
    } catch {
        // Safe failover
    }
}

/**
 * Play celebratory fanfare / hammer-down audio when a player is marked as SOLD
 */
export function playSoldFanfareSound(customVolume: number = 0.7): void {
    if (isMuted) return;
    const ctx = getAudioContext();
    if (!ctx) return;

    try {
        if (ctx.state === 'suspended') {
            ctx.resume().catch(() => {});
        }

        const now = ctx.currentTime;
        const masterGain = ctx.createGain();
        masterGain.gain.setValueAtTime(customVolume, now);
        masterGain.connect(ctx.destination);

        // Triumphant ascending triad notes: C4 (261.6Hz), E4 (329.6Hz), G4 (392Hz), C5 (523.25Hz)
        const notes = [
            { freq: 261.63, start: now, dur: 0.12 },
            { freq: 329.63, start: now + 0.10, dur: 0.12 },
            { freq: 392.00, start: now + 0.20, dur: 0.14 },
            { freq: 523.25, start: now + 0.32, dur: 0.65 }
        ];

        notes.forEach(n => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(n.freq, n.start);

            gain.gain.setValueAtTime(0.001, n.start);
            gain.gain.linearRampToValueAtTime(0.5, n.start + 0.02);
            gain.gain.exponentialRampToValueAtTime(0.001, n.start + n.dur);

            osc.connect(gain);
            gain.connect(masterGain);

            osc.start(n.start);
            osc.stop(n.start + n.dur + 0.05);
        });
    } catch {
        // Safe failover
    }
}
