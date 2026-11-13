import React, { useState, useEffect, useRef } from 'react';
import { DraftCelebrationData } from '../../types';
import { Trophy, Sparkles, X, CheckCircle, Shield } from 'lucide-react';
import confetti from 'canvas-confetti';
import { playSoldSound } from '../../utils/draftAudio';

interface Props {
    celebrationData?: DraftCelebrationData | null;
    durationMs?: number; // default 5000ms (0 = audio only, no popup)
    customSoldAudioUrl?: string;
    onClose?: () => void;
}

export const SoldCelebrationPopup: React.FC<Props> = ({
    celebrationData,
    durationMs = 5000,
    customSoldAudioUrl,
    onClose
}) => {
    const [isVisible, setIsVisible] = useState(false);
    const [timeLeftMs, setTimeLeftMs] = useState(durationMs);
    const lastTimestampRef = useRef<number>(0);
    const animFrameRef = useRef<number | null>(null);

    useEffect(() => {
        if (!celebrationData || !celebrationData.timestamp) {
            setIsVisible(false);
            return;
        }

        const now = Date.now();
        const elapsed = now - celebrationData.timestamp;

        // If durationMs <= 0 (Popup Disabled), still play Sold audio for newly triggered picks
        if (durationMs <= 0) {
            setIsVisible(false);
            if (elapsed < 4000 && celebrationData.timestamp !== lastTimestampRef.current) {
                lastTimestampRef.current = celebrationData.timestamp;
                playSoldSound(customSoldAudioUrl, 0.85);
            }
            return;
        }

        const effectiveWindowMs = Math.max(durationMs + 500, 1500);

        // Only show if the pick happened within the active popup window
        if (elapsed < effectiveWindowMs && celebrationData.timestamp !== lastTimestampRef.current) {
            lastTimestampRef.current = celebrationData.timestamp;
            setIsVisible(true);
            const remaining = Math.max(100, durationMs - elapsed);
            setTimeLeftMs(remaining);

            // Audio fanfare or uploaded Sold Music
            playSoldSound(customSoldAudioUrl, 0.85);

            // Confetti celebration burst
            try {
                confetti({
                    particleCount: 80,
                    spread: 85,
                    origin: { y: 0.6 },
                    colors: ['#ef4444', '#f59e0b', '#10b981', '#3b82f6', '#fbbf24', '#ffffff']
                });

                // Secondary blast after 250ms for theater depth
                setTimeout(() => {
                    confetti({
                        particleCount: 50,
                        angle: 60,
                        spread: 60,
                        origin: { x: 0.1, y: 0.7 }
                    });
                    confetti({
                        particleCount: 50,
                        angle: 120,
                        spread: 60,
                        origin: { x: 0.9, y: 0.7 }
                    });
                }, 250);
            } catch {
                // Ignore if canvas unavailable
            }

            // Smooth countdown progress bar
            const startTime = performance.now();
            const startRemaining = remaining;

            const updateTimer = (currentPerfTime: number) => {
                const diff = currentPerfTime - startTime;
                const nextRemaining = Math.max(0, startRemaining - diff);
                setTimeLeftMs(nextRemaining);

                if (nextRemaining > 0) {
                    animFrameRef.current = requestAnimationFrame(updateTimer);
                } else {
                    setIsVisible(false);
                    if (onClose) onClose();
                }
            };

            animFrameRef.current = requestAnimationFrame(updateTimer);
        } else if (elapsed >= effectiveWindowMs) {
            setIsVisible(false);
        }

        return () => {
            if (animFrameRef.current) {
                cancelAnimationFrame(animFrameRef.current);
            }
        };
    }, [celebrationData, durationMs, customSoldAudioUrl, onClose]);

    if (!isVisible || !celebrationData || durationMs <= 0) return null;

    const progressPercent = Math.max(0, Math.min(100, (timeLeftMs / Math.max(1, durationMs)) * 100));
    const secondsRemainingFormatted = (timeLeftMs / 1000).toFixed(1);

    return (
        <div 
            className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/95 backdrop-blur-xl animate-fade-in select-none"
            role="dialog"
            aria-modal="true"
        >
            {/* AMBIENT GLOW BACKDROP */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[700px] bg-red-600/25 rounded-full blur-[140px] animate-pulse"></div>
                <div className="absolute top-1/3 left-1/3 w-[500px] h-[500px] bg-amber-500/20 rounded-full blur-[120px]"></div>
            </div>

            {/* MAIN CELEBRATION CONTAINER */}
            <div className="relative w-full max-w-4xl rounded-[2.5rem] bg-gradient-to-b from-zinc-900 via-zinc-950 to-black border-4 border-amber-400/90 p-5 sm:p-8 md:p-10 shadow-[0_0_100px_rgba(245,158,11,0.4)] flex flex-col items-center justify-between text-white overflow-hidden animate-zoom-in">
                {/* Close Button in corner */}
                <button
                    type="button"
                    onClick={() => {
                        setIsVisible(false);
                        if (onClose) onClose();
                    }}
                    className="absolute top-4 right-4 p-2.5 rounded-full bg-zinc-800/80 hover:bg-zinc-700 text-zinc-400 hover:text-white transition-all shadow-lg z-30"
                    title="Dismiss Celebration"
                >
                    <X className="w-5 h-5 stroke-[2.5]" />
                </button>

                {/* 1. GIANT SOLD HEADER BADGE */}
                <div className="mb-4 sm:mb-6 text-center">
                    <div className="inline-block relative">
                        <div className="px-8 sm:px-14 py-2 sm:py-3.5 rounded-3xl bg-gradient-to-r from-red-600 via-rose-600 to-red-600 text-white font-black text-3xl sm:text-5xl md:text-6xl uppercase tracking-[0.25em] shadow-[0_0_50px_rgba(220,38,38,0.8)] border-4 border-white drop-shadow-[0_4px_12px_rgba(0,0,0,0.9)] transform -rotate-1">
                            SOLD
                        </div>
                        <div className="flex items-center justify-center gap-2 mt-2">
                            <Sparkles className="w-4 h-4 text-amber-400 fill-amber-400 animate-spin" />
                            <span className="text-[10px] sm:text-xs font-black uppercase tracking-[0.3em] text-amber-300 drop-shadow">
                                Official Draft Selection
                            </span>
                            <Sparkles className="w-4 h-4 text-amber-400 fill-amber-400 animate-spin" />
                        </div>
                    </div>
                </div>

                {/* 2. PLAYER & TEAM DETAILS SPLIT SECTION */}
                <div className="w-full grid grid-cols-1 md:grid-cols-12 gap-5 sm:gap-8 items-center my-2">
                    {/* Left: Giant Player Photo */}
                    <div className="md:col-span-5 flex flex-col items-center">
                        <div className="relative aspect-square w-48 sm:w-60 md:w-full max-w-[280px] rounded-3xl overflow-hidden bg-zinc-950 border-4 border-amber-400 shadow-[0_0_35px_rgba(245,158,11,0.5)] ring-4 ring-black">
                            {celebrationData.playerPhoto ? (
                                <img
                                    src={celebrationData.playerPhoto}
                                    alt={celebrationData.playerName}
                                    className="w-full h-full object-cover"
                                />
                            ) : (
                                <div className="w-full h-full flex items-center justify-center font-black text-6xl text-zinc-600 bg-zinc-900">
                                    {celebrationData.playerName?.charAt(0) || '★'}
                                </div>
                            )}

                            {/* Jersey Number Tag */}
                            {celebrationData.jerseyNumber ? (
                                <div className="absolute top-3 right-3 px-3 py-1 rounded-xl bg-black/80 text-amber-400 font-mono font-black text-base border-2 border-amber-400/50 shadow-lg">
                                    #{celebrationData.jerseyNumber}
                                </div>
                            ) : null}

                            {/* Role Ribbon on Bottom of photo */}
                            <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black via-black/80 to-transparent p-2 text-center">
                                <span className="px-3 py-1 rounded-lg bg-amber-400 text-black font-black text-xs uppercase tracking-wider shadow">
                                    {celebrationData.role || celebrationData.category || 'PLAYER'}
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* Right: Player Name & SOLD TO Franchise */}
                    <div className="md:col-span-7 flex flex-col justify-center text-center md:text-left space-y-4">
                        {/* Player Category */}
                        <div>
                            <span className="inline-block px-3 py-1 rounded-xl bg-blue-500/20 text-blue-300 font-black text-xs uppercase tracking-widest border border-blue-400/30">
                                ★ {celebrationData.category || 'General'}
                            </span>
                            <h2 className="text-3xl sm:text-5xl md:text-6xl font-black uppercase text-white tracking-tight drop-shadow-[0_4px_16px_rgba(0,0,0,0.95)] leading-tight mt-2">
                                {celebrationData.playerName}
                            </h2>
                        </div>

                        {/* Divider */}
                        <div className="h-0.5 w-full bg-gradient-to-r from-amber-400/80 via-white/40 to-transparent"></div>

                        {/* SOLD TO TEAM SECTION */}
                        <div className="p-4 sm:p-5 rounded-2xl bg-gradient-to-r from-zinc-900 via-amber-950/30 to-zinc-900 border-2 border-amber-400/60 shadow-xl flex items-center justify-center md:justify-start gap-4">
                            {/* Team Logo */}
                            {celebrationData.teamLogo ? (
                                <img
                                    src={celebrationData.teamLogo}
                                    alt={celebrationData.teamName}
                                    className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl object-contain bg-white p-1.5 shadow-2xl border-2 border-amber-400 shrink-0"
                                />
                            ) : (
                                <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-blue-600 text-white font-black text-3xl flex items-center justify-center border-2 border-amber-400 shadow-2xl shrink-0">
                                    {celebrationData.teamName?.charAt(0) || 'T'}
                                </div>
                            )}

                            {/* Team Text */}
                            <div className="min-w-0 text-left">
                                <p className="text-[10px] sm:text-xs font-black uppercase tracking-[0.25em] text-emerald-400 flex items-center gap-1.5">
                                    <CheckCircle className="w-4 h-4 text-emerald-400" /> SOLD TO FRANCHISE
                                </p>
                                <h3 className="text-2xl sm:text-3xl md:text-4xl font-black uppercase italic text-amber-300 tracking-wide leading-tight truncate drop-shadow">
                                    {celebrationData.teamName}
                                </h3>
                            </div>
                        </div>
                    </div>
                </div>

                {/* 3. 5-SECOND AUTO-DISMISS COUNTDOWN BAR */}
                <div className="w-full mt-5 sm:mt-8 pt-3 border-t border-white/10 flex flex-col gap-1.5">
                    <div className="flex items-center justify-between text-[10px] sm:text-xs font-black uppercase text-zinc-400 tracking-wider">
                        <span>Broadcast Auto-Closing</span>
                        <span className="text-amber-400 font-mono font-black">{secondsRemainingFormatted}s</span>
                    </div>
                    {/* Glowing Progress Bar */}
                    <div className="w-full h-2.5 bg-black/60 rounded-full overflow-hidden border border-zinc-700/80 p-0.5">
                        <div
                            className="h-full bg-gradient-to-r from-red-500 via-amber-400 to-emerald-400 rounded-full shadow-[0_0_10px_rgba(245,158,11,0.8)] transition-all duration-75 ease-linear"
                            style={{ width: `${progressPercent}%` }}
                        ></div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default SoldCelebrationPopup;
