import { db } from '../firebase';

/**
 * Web Audio API synthesizer + Custom Audio URL player for Auction & Draft Board.
 * Generates Heartbeat & Tik-Tik pulses (last 10s countdown), 3-Ring Arena Buzzer,
 * Celebratory Sold Fanfare, Unsold Pass tone, and plays custom uploaded tracks
 * (Firebase Storage URLs, Data URLs, or `firestore-asset://` references).
 */

let audioCtx: AudioContext | null = null;
let isMuted: boolean = typeof window !== 'undefined' ? localStorage.getItem('draft_sound_muted') === 'true' : false;
let currentCustomAudio: HTMLAudioElement | null = null;
const resolvedAssetCache = new Map<string, string>();

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
    if (muted) {
        stopCustomAudio();
    }
    if (typeof window !== 'undefined') {
        localStorage.setItem('draft_sound_muted', muted ? 'true' : 'false');
    }
}

export function stopCustomAudio(): void {
    if (currentCustomAudio) {
        try {
            currentCustomAudio.pause();
            currentCustomAudio.currentTime = 0;
        } catch {
            // ignore
        }
        currentCustomAudio = null;
    }
}

/**
 * Resolves `firestore-asset://`, `scoring-asset://`, and `draft-asset://` references
 * or passes through regular HTTP/HTTPS URLs and Data URLs.
 */
async function resolveAudioSourceUrl(rawUrl: string): Promise<string | null> {
    if (!rawUrl) return null;

    if (
        !rawUrl.startsWith('firestore-asset://') &&
        !rawUrl.startsWith('scoring-asset://') &&
        !rawUrl.startsWith('draft-asset://')
    ) {
        return rawUrl;
    }

    const cached = resolvedAssetCache.get(rawUrl);
    if (cached) return cached;

    try {
        let dataUrl: string | undefined;

        if (rawUrl.startsWith('firestore-asset://')) {
            const clean = rawUrl.replace('firestore-asset://', '').split('?')[0];
            const [auctionId, assetId] = clean.split('/');
            if (auctionId && assetId) {
                const snap = await db.collection('auctions').doc(auctionId).collection('audioAssets').doc(assetId).get();
                if (snap.exists) dataUrl = snap.data()?.dataUrl as string | undefined;
            }
        } else if (rawUrl.startsWith('scoring-asset://')) {
            const docId = rawUrl.replace('scoring-asset://', '').split('?')[0];
            if (docId) {
                const snap = await db.collection('scoringAssets').doc(docId).get();
                if (snap.exists) dataUrl = snap.data()?.dataUrl as string | undefined;
            }
        } else if (rawUrl.startsWith('draft-asset://')) {
            const clean = rawUrl.replace('draft-asset://', '').split('?')[0];
            const [auctionId, docId] = clean.split('/');
            if (auctionId && docId) {
                const snap = await db.collection('auctions').doc(auctionId).collection('arrangementDrafts').doc(docId).get();
                if (snap.exists) dataUrl = snap.data()?.dataUrl as string | undefined;
            }
        }

        if (dataUrl) {
            resolvedAssetCache.set(rawUrl, dataUrl);
            return dataUrl;
        }
    } catch (err) {
        console.warn('Could not resolve custom Firestore audio asset:', err);
    }
    return null;
}

/**
 * Plays a custom uploaded audio track with graceful fallback callback if unavailable/blocked.
 */
async function playCustomAudioUrl(
    rawUrl: string | undefined,
    volume: number,
    fallbackSynth: () => void
): Promise<boolean> {
    if (isMuted) return false;
    if (!rawUrl || !rawUrl.trim()) {
        fallbackSynth();
        return false;
    }

    try {
        const resolvedUrl = await resolveAudioSourceUrl(rawUrl.trim());
        if (!resolvedUrl) {
            fallbackSynth();
            return false;
        }

        stopCustomAudio();
        const audio = new Audio(resolvedUrl);
        audio.volume = Math.max(0, Math.min(1, volume));
        currentCustomAudio = audio;

        audio.onended = () => {
            if (currentCustomAudio === audio) {
                currentCustomAudio = null;
            }
        };

        await audio.play();
        return true;
    } catch (err) {
        console.warn('Custom audio playback fallback to synth:', err);
        fallbackSynth();
        return false;
    }
}

/**
 * Play authentic 'Heartbeat + Tik-Tik' hybrid countdown audio
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

        // LAYER 1: Sharp Clock "Tik-Tik" Mechanical Click Transient
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

        // LAYER 2: Heartbeat Sub-Bass "Lub" Thump (85Hz -> 40Hz)
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

        // LAYER 3: Heartbeat Secondary "Dub" Thump at +0.12s (70Hz -> 35Hz)
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

export function playHeartbeatSound(customVolume: number = 0.65): void {
    playCountdownTickSound(customVolume);
}

/**
 * Play 3-Ring Arena Time's-Up Buzzer (Synthesized default)
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

            const osc1 = ctx.createOscillator();
            osc1.type = 'sawtooth';
            osc1.frequency.setValueAtTime(isFinal ? 134 : 142, startTime);

            const osc2 = ctx.createOscillator();
            osc2.type = 'square';
            osc2.frequency.setValueAtTime(isFinal ? 140 : 148, startTime);

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

        triggerBlast(now, 0.25, false);
        triggerBlast(now + 0.36, 0.25, false);
        triggerBlast(now + 0.72, 0.48, true);
    } catch {
        // Safe failover
    }
}

/**
 * Play celebratory fanfare when a player is marked as SOLD (Synthesized default)
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

/**
 * Play descending stadium pass tone when a player goes UNSOLD (Synthesized default)
 */
export function playUnsoldSound(customVolume: number = 0.65): void {
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

        const notes = [
            { freq: 311.13, start: now, dur: 0.18 },
            { freq: 233.08, start: now + 0.18, dur: 0.22 },
            { freq: 155.56, start: now + 0.40, dur: 0.45 }
        ];

        notes.forEach(n => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sawtooth';
            const filter = ctx.createBiquadFilter();
            filter.type = 'lowpass';
            filter.frequency.setValueAtTime(700, n.start);

            osc.frequency.setValueAtTime(n.freq, n.start);
            osc.frequency.exponentialRampToValueAtTime(n.freq * 0.88, n.start + n.dur);

            gain.gain.setValueAtTime(0.001, n.start);
            gain.gain.linearRampToValueAtTime(0.4, n.start + 0.02);
            gain.gain.exponentialRampToValueAtTime(0.001, n.start + n.dur);

            osc.connect(filter);
            filter.connect(gain);
            gain.connect(masterGain);

            osc.start(n.start);
            osc.stop(n.start + n.dur + 0.05);
        });
    } catch {
        // Safe failover
    }
}

export async function playSoldSound(customUrl?: string, volume: number = 0.85): Promise<void> {
    await playCustomAudioUrl(customUrl, volume, () => playSoldFanfareSound(volume));
}

export async function playTimeUpSound(customUrl?: string, volume: number = 0.85): Promise<void> {
    await playCustomAudioUrl(customUrl, volume, () => playBuzzerSound(volume));
}

export async function playUnsoldSoundTrack(customUrl?: string, volume: number = 0.85): Promise<void> {
    await playCustomAudioUrl(customUrl, volume, () => playUnsoldSound(volume));
}

export async function previewAudioSound(
    type: 'sold' | 'timeup' | 'unsold',
    customUrl?: string
): Promise<void> {
    if (type === 'sold') return playSoldSound(customUrl, 0.85);
    if (type === 'timeup') return playTimeUpSound(customUrl, 0.85);
    return playUnsoldSoundTrack(customUrl, 0.85);
}

