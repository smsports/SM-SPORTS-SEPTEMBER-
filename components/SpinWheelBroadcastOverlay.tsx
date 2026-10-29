import React, { useEffect, useRef, useState } from 'react';
import { useAuction } from '../hooks/useAuction';
import { SpinWheelItem, SpinWheelState } from '../types';
import confetti from 'canvas-confetti';
import { Trophy, User, Sparkles, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

const SLICE_COLORS = [
  '#F59E0B', '#10B981', '#3B82F6', '#EC4899', 
  '#8B5CF6', '#14B8A6', '#F97316', '#06B6D4',
  '#EAB308', '#6366F1', '#84CC16', '#EF4444'
];

interface Props {
  target: 'PROJECTOR' | 'OBS';
}

export const SpinWheelBroadcastOverlay: React.FC<Props> = ({ target }) => {
  const { state } = useAuction();
  const wheelState = state.spinWheelState;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [rotation, setRotation] = useState<number>(0);
  const animationFrameRef = useRef<number | null>(null);
  const lastWinnerRef = useRef<string | null>(null);

  const isVisible = Boolean(
    wheelState?.isActive && (
      (target === 'PROJECTOR' && wheelState.showOnProjector) ||
      (target === 'OBS' && wheelState.showOnOBS)
    )
  );

  const items = wheelState?.items || [];
  const isSpinning = Boolean(wheelState?.isSpinning);
  const winner = wheelState?.winner || null;
  const showWinnerPopup = Boolean(wheelState?.showWinnerPopup && winner);

  // Trigger confetti when winner popup appears on broadcast
  useEffect(() => {
    if (isVisible && showWinnerPopup && winner) {
      const winnerKey = `${winner.id}-${winner.name}-${wheelState?.spinStartTime || 0}`;
      if (lastWinnerRef.current !== winnerKey) {
        lastWinnerRef.current = winnerKey;
        // Big celebratory confetti blast
        confetti({
          particleCount: 160,
          spread: 100,
          origin: { y: 0.5 },
          zIndex: 99999
        });
        setTimeout(() => {
          confetti({
            particleCount: 100,
            angle: 60,
            spread: 70,
            origin: { x: 0.1, y: 0.6 },
            zIndex: 99999
          });
          confetti({
            particleCount: 100,
            angle: 120,
            spread: 70,
            origin: { x: 0.9, y: 0.6 },
            zIndex: 99999
          });
        }, 300);
      }
    }
  }, [isVisible, showWinnerPopup, winner, wheelState?.spinStartTime]);

  // Handle synchronized rotation animation
  useEffect(() => {
    if (!isVisible || items.length === 0) return;

    if (isSpinning && wheelState?.targetRotation !== undefined && wheelState?.spinStartTime) {
      const duration = wheelState.spinDuration || 5000;
      const startRot = rotation % 360;
      const targetRot = wheelState.targetRotation;
      const startTime = wheelState.spinStartTime;

      const easeOutQuart = (x: number): number => {
        return 1 - Math.pow(1 - x, 4);
      };

      const animate = () => {
        const now = Date.now();
        const elapsed = now - startTime;
        const progress = Math.min(1, Math.max(0, elapsed / duration));
        const currentRot = startRot + (targetRot - startRot) * easeOutQuart(progress);
        
        setRotation(currentRot);

        if (progress < 1) {
          animationFrameRef.current = requestAnimationFrame(animate);
        } else {
          setRotation(targetRot);
        }
      };

      animationFrameRef.current = requestAnimationFrame(animate);

      return () => {
        if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
      };
    } else if (wheelState?.targetRotation !== undefined) {
      setRotation(wheelState.targetRotation);
    }
  }, [isSpinning, wheelState?.targetRotation, wheelState?.spinStartTime, isVisible, items.length]);

  // Draw the wheel on canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || items.length === 0 || !isVisible) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;
    const centerX = width / 2;
    const centerY = height / 2;
    const radius = Math.min(centerX, centerY) - 15;
    const sliceAngle = (2 * Math.PI) / items.length;

    ctx.clearRect(0, 0, width, height);

    ctx.save();
    ctx.translate(centerX, centerY);
    ctx.rotate((rotation * Math.PI) / 180);

    // Draw slices
    items.forEach((item, index) => {
      const angle = index * sliceAngle;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, radius, angle, angle + sliceAngle);
      ctx.closePath();

      const color = item.color || SLICE_COLORS[index % SLICE_COLORS.length];
      ctx.fillStyle = color;
      ctx.fill();

      // Slice inner stroke
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
      ctx.lineWidth = 2;
      ctx.stroke();

      // Draw text
      ctx.save();
      ctx.rotate(angle + sliceAngle / 2);
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#FFFFFF';
      ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
      ctx.shadowBlur = 6;
      ctx.font = items.length > 20 ? 'bold 11px sans-serif' : items.length > 12 ? 'bold 13px sans-serif' : 'bold 16px sans-serif';

      const displayName = item.shortName || item.name;
      const maxTextWidth = radius - 45;
      let text = displayName;
      if (ctx.measureText(text).width > maxTextWidth) {
        while (ctx.measureText(text + '...').width > maxTextWidth && text.length > 3) {
          text = text.slice(0, -1);
        }
        text += '...';
      }

      ctx.fillText(text, radius - 20, 0);
      ctx.restore();
    });

    // Outer wheel border with decorative lights
    ctx.restore();

    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, 0, 2 * Math.PI);
    ctx.strokeStyle = '#F59E0B';
    ctx.lineWidth = 8;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(centerX, centerY, radius + 5, 0, 2 * Math.PI);
    ctx.strokeStyle = '#18181B';
    ctx.lineWidth = 4;
    ctx.stroke();

    // Center hub
    ctx.beginPath();
    ctx.arc(centerX, centerY, 38, 0, 2 * Math.PI);
    ctx.fillStyle = '#09090B';
    ctx.fill();
    ctx.strokeStyle = '#F59E0B';
    ctx.lineWidth = 5;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(centerX, centerY, 18, 0, 2 * Math.PI);
    ctx.fillStyle = '#F59E0B';
    ctx.fill();
  }, [items, rotation, isVisible]);

  if (!isVisible || items.length === 0) return null;

  const isObs = target === 'OBS';

  return (
    <div className={`fixed inset-0 z-[9999] flex items-center justify-center p-4 select-none pointer-events-auto ${
      isObs ? 'bg-black/60 backdrop-blur-sm' : 'bg-black/85 backdrop-blur-xl'
    }`}>
      {/* Background ambient lighting */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[700px] bg-amber-500/10 rounded-full blur-[140px] pointer-events-none" />

      {/* Main Container */}
      <motion.div 
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        className="relative flex flex-col items-center justify-center max-w-2xl w-full"
      >
        {/* Top Header Badge */}
        <div className="flex items-center gap-3 px-6 py-2.5 rounded-full bg-black/80 border-2 border-amber-500/40 text-amber-400 font-black uppercase tracking-[0.3em] text-xs shadow-2xl mb-6">
          <Sparkles className="w-4 h-4 text-amber-400 animate-spin" />
          <span>LUCKY DRAW • {wheelState?.mode === 'TEAMS' ? 'TEAM' : wheelState?.mode === 'CUSTOM' ? 'CUSTOM' : 'PLAYER'} RANDOMIZER</span>
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
        </div>

        {/* Wheel Wrapper */}
        <div className="relative flex items-center justify-center">
          {/* Top Pointer (Arrow pointing down at 12 o'clock) */}
          <div className="absolute -top-3 z-30 flex flex-col items-center drop-shadow-[0_4px_10px_rgba(0,0,0,0.8)]">
            <div className="w-0 h-0 border-l-[18px] border-l-transparent border-r-[18px] border-r-transparent border-t-[34px] border-t-amber-400 filter drop-shadow-[0_2px_4px_rgba(0,0,0,0.7)]" />
            <div className="w-3.5 h-3.5 rounded-full bg-zinc-950 border-2 border-amber-400 -mt-7 z-40" />
          </div>

          {/* Canvas Wheel */}
          <div className="relative rounded-full p-2 bg-gradient-to-b from-amber-500/40 via-zinc-900 to-black border-4 border-amber-500/60 shadow-[0_0_80px_rgba(245,158,11,0.25)]">
            <canvas 
              ref={canvasRef} 
              width={isObs ? 420 : 540} 
              height={isObs ? 420 : 540} 
              className="rounded-full shadow-2xl"
            />
          </div>
        </div>

        {/* Spinning status pill */}
        {isSpinning && (
          <motion.div 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-6 px-8 py-3 rounded-2xl bg-amber-500 text-black font-black uppercase tracking-[0.25em] text-sm shadow-[0_0_30px_rgba(245,158,11,0.6)] animate-pulse"
          >
            🎡 SPINNING THE WHEEL...
          </motion.div>
        )}
      </motion.div>

      {/* Winner Celebration Modal Overlay */}
      <AnimatePresence>
        {showWinnerPopup && winner && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.8, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.8 }}
            className="fixed inset-0 z-[10000] flex items-center justify-center p-6 bg-black/80 backdrop-blur-2xl"
          >
            <div className="relative max-w-xl w-full bg-gradient-to-b from-zinc-900 via-zinc-950 to-black border-4 border-amber-500 rounded-[3rem] p-8 md:p-12 text-center shadow-[0_0_120px_rgba(245,158,11,0.5)] overflow-hidden">
              {/* Golden shimmer beams */}
              <div className="absolute -top-24 -left-24 w-72 h-72 bg-amber-500/20 rounded-full blur-3xl pointer-events-none" />
              <div className="absolute -bottom-24 -right-24 w-72 h-72 bg-amber-500/20 rounded-full blur-3xl pointer-events-none" />

              {/* Header Badge */}
              <div className="inline-flex items-center gap-2 px-6 py-2 rounded-full bg-amber-500/15 border border-amber-500/40 text-amber-400 font-black uppercase tracking-[0.3em] text-xs mb-6 shadow-inner">
                <Sparkles className="w-4 h-4 text-amber-400 animate-spin" />
                <span>OFFICIAL DRAW RESULT</span>
              </div>

              {/* Winner Visual */}
              {winner.type === 'TEAM' ? (
                <div className="flex flex-col items-center">
                  <div className="w-40 h-40 md:w-48 md:h-48 rounded-[2.5rem] bg-zinc-900/90 border-4 border-amber-500 p-4 shadow-[0_0_50px_rgba(245,158,11,0.4)] flex items-center justify-center mb-6 overflow-hidden">
                    {winner.logoUrl ? (
                      <img src={winner.logoUrl} alt={winner.name} className="max-w-full max-h-full object-contain drop-shadow-xl" />
                    ) : (
                      <Trophy className="w-20 h-20 text-amber-400" />
                    )}
                  </div>
                  <h3 className="text-xs font-black uppercase tracking-[0.35em] text-amber-400/80 mb-1">
                    WINNING TEAM
                  </h3>
                  <h1 className="text-3xl md:text-5xl font-black uppercase tracking-tight text-white italic drop-shadow-md mb-2">
                    {winner.name}
                  </h1>
                  {winner.shortName && (
                    <span className="px-4 py-1 rounded-xl bg-white/10 text-white font-black text-xs uppercase tracking-widest border border-white/20">
                      {winner.shortName}
                    </span>
                  )}
                </div>
              ) : winner.type === 'PLAYER' ? (
                <div className="flex flex-col items-center">
                  <div className="w-40 h-40 md:w-48 md:h-48 rounded-[2.5rem] bg-zinc-900/90 border-4 border-amber-500 p-2 shadow-[0_0_50px_rgba(245,158,11,0.4)] flex items-center justify-center mb-6 overflow-hidden">
                    {winner.logoUrl ? (
                      <img src={winner.logoUrl} alt={winner.name} className="w-full h-full object-cover rounded-[2rem]" />
                    ) : (
                      <User className="w-20 h-20 text-amber-400" />
                    )}
                  </div>
                  <h3 className="text-xs font-black uppercase tracking-[0.35em] text-amber-400/80 mb-1">
                    SELECTED PLAYER
                  </h3>
                  <h1 className="text-3xl md:text-5xl font-black uppercase tracking-tight text-white italic drop-shadow-md mb-3">
                    {winner.name}
                  </h1>

                  <div className="flex flex-wrap items-center justify-center gap-2.5">
                    {winner.category && (
                      <span className="px-4 py-1.5 rounded-xl bg-amber-500/20 text-amber-300 font-black text-xs uppercase tracking-wider border border-amber-500/40">
                        {winner.category}
                      </span>
                    )}
                    {winner.role && (
                      <span className="px-4 py-1.5 rounded-xl bg-blue-500/20 text-blue-300 font-black text-xs uppercase tracking-wider border border-blue-500/40">
                        {winner.role}
                      </span>
                    )}
                    {winner.basePrice !== undefined && winner.basePrice > 0 && (
                      <span className="px-4 py-1.5 rounded-xl bg-emerald-500/20 text-emerald-300 font-black text-xs uppercase tracking-wider border border-emerald-500/40 tabular-nums">
                        Base: ₹{winner.basePrice.toLocaleString()}
                      </span>
                    )}
                  </div>
                </div>
              ) : (
                /* CUSTOM ITEM WINNER */
                <div className="flex flex-col items-center">
                  <div className="w-40 h-40 md:w-48 md:h-48 rounded-[2.5rem] bg-zinc-900/90 border-4 border-amber-500 p-4 shadow-[0_0_50px_rgba(245,158,11,0.4)] flex items-center justify-center mb-6 overflow-hidden">
                    <Sparkles className="w-20 h-20 text-amber-400 animate-pulse" />
                  </div>
                  <h3 className="text-xs font-black uppercase tracking-[0.35em] text-amber-400/80 mb-1">
                    SELECTED OPTION
                  </h3>
                  <h1 className="text-3xl md:text-5xl font-black uppercase tracking-tight text-white italic drop-shadow-md mb-2">
                    {winner.name}
                  </h1>
                  {winner.shortName && (
                    <span className="px-4 py-1 rounded-xl bg-amber-500/20 text-amber-300 font-black text-xs uppercase tracking-widest border border-amber-500/40">
                      {winner.shortName}
                    </span>
                  )}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
