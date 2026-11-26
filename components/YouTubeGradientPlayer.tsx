import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  Play,
  Pause,
  Volume2,
  VolumeX,
  Maximize2,
  Minimize2,
  RotateCcw,
  RotateCw,
  Radio,
  ExternalLink,
  Lock,
  RefreshCw,
  AlertTriangle,
} from 'lucide-react';
import { LiveStreamItem } from '../types';
import {
  extractYouTubeVideoId,
  formatStreamTime,
  GRADIENT_PRESETS,
  getYouTubeThumbnail,
} from '../utils/liveStreamUtils';

declare global {
  interface Window {
    YT?: any;
    onYouTubeIframeAPIReady?: () => void;
    _ytApiCallbacks?: Array<() => void>;
    _ytApiLoading?: boolean;
  }
}

interface YouTubeGradientPlayerProps {
  stream: LiveStreamItem;
  autoPlay?: boolean;
}

function loadYouTubeIframeAPI(): Promise<any> {
  return new Promise((resolve) => {
    if (window.YT && window.YT.Player) {
      resolve(window.YT);
      return;
    }

    if (!window._ytApiCallbacks) {
      window._ytApiCallbacks = [];
    }
    window._ytApiCallbacks.push(() => resolve(window.YT));

    const prevReady = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      if (typeof prevReady === 'function') prevReady();
      const cbs = window._ytApiCallbacks || [];
      window._ytApiCallbacks = [];
      cbs.forEach((cb) => cb());
    };

    if (!window._ytApiLoading) {
      window._ytApiLoading = true;
      const existing = document.querySelector('script[src*="youtube.com/iframe_api"]');
      if (!existing) {
        const tag = document.createElement('script');
        tag.src = 'https://www.youtube.com/iframe_api';
        tag.async = true;
        document.head.appendChild(tag);
      }
    }
  });
}

const YouTubeGradientPlayer: React.FC<YouTubeGradientPlayerProps> = ({
  stream,
  autoPlay = true,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const playerMountRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<any>(null);
  const progressBarRef = useRef<HTMLDivElement>(null);
  const hideControlsTimerRef = useRef<number | null>(null);

  const videoId = stream.youtubeVideoId || extractYouTubeVideoId(stream.youtubeUrl) || '';
  const theme = GRADIENT_PRESETS[stream.playerGradientPreset || 'JIO_GOLD'] || GRADIENT_PRESETS.JIO_GOLD;
  const isLive = stream.status === 'LIVE';

  const [isReady, setIsReady] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isBuffering, setIsBuffering] = useState(true);
  const [isMuted, setIsMuted] = useState(false);
  const [volume, setVolume] = useState(100);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [bufferedFraction, setBufferedFraction] = useState(0);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [needsUnmutePrompt, setNeedsUnmutePrompt] = useState(false);
  const [embedError, setEmbedError] = useState<{ code?: number; message: string } | null>(null);
  const [centerIndicator, setCenterIndicator] = useState<'PLAY' | 'PAUSE' | null>(null);
  const [retrySeed, setRetrySeed] = useState(0);

  const scheduleHideControls = useCallback(() => {
    if (hideControlsTimerRef.current) {
      window.clearTimeout(hideControlsTimerRef.current);
    }
    setShowControls(true);
    hideControlsTimerRef.current = window.setTimeout(() => {
      setShowControls(false);
    }, 3200);
  }, []);

  useEffect(() => {
    const onFsChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  useEffect(() => {
    if (!videoId) {
      setEmbedError({ message: 'No valid YouTube stream URL or video ID is configured for this broadcast.' });
      setIsBuffering(false);
      return;
    }

    let cancelled = false;
    let pollTimer: number | null = null;
    let autoplayFallbackTimer: number | null = null;

    setIsReady(false);
    setIsPlaying(false);
    setIsBuffering(true);
    setEmbedError(null);
    setNeedsUnmutePrompt(false);
    setCurrentTime(0);
    setDuration(0);

    const mountPlayer = async () => {
      const YT = await loadYouTubeIframeAPI();
      if (cancelled || !playerMountRef.current) return;

      // Recreate inner target node cleanly for fresh YT.Player mount
      playerMountRef.current.innerHTML = '';
      const targetDiv = document.createElement('div');
      targetDiv.className = 'w-full h-full';
      playerMountRef.current.appendChild(targetDiv);

      const player = new YT.Player(targetDiv, {
        videoId,
        width: '100%',
        height: '100%',
        playerVars: {
          autoplay: autoPlay ? 1 : 0,
          controls: 0,
          disablekb: 1,
          enablejsapi: 1,
          fs: 0,
          iv_load_policy: 3,
          modestbranding: 1,
          playsinline: 1,
          rel: 0,
          cc_load_policy: 0,
          origin: window.location.origin,
        },
        events: {
          onReady: (event: any) => {
            if (cancelled) return;
            playerRef.current = event.target;
            setIsReady(true);
            setIsBuffering(false);
            try {
              const dur = event.target.getDuration?.() || 0;
              if (dur > 0) setDuration(dur);
            } catch {
              // ignore
            }

            if (autoPlay) {
              try {
                event.target.playVideo?.();
              } catch {
                // ignore
              }
              // Browser autoplay fallback: if still unstarted after 900ms, mute & play so live stream starts immediately
              autoplayFallbackTimer = window.setTimeout(() => {
                if (cancelled) return;
                try {
                  const st = event.target.getPlayerState?.();
                  if (st !== 1 && st !== 3) {
                    event.target.mute?.();
                    setIsMuted(true);
                    setNeedsUnmutePrompt(true);
                    event.target.playVideo?.();
                  }
                } catch {
                  // ignore
                }
              }, 900);
            }
          },
          onStateChange: (event: any) => {
            if (cancelled) return;
            const st = event.data;
            // 1 = PLAYING, 2 = PAUSED, 3 = BUFFERING, 0 = ENDED
            if (st === 1) {
              setIsPlaying(true);
              setIsBuffering(false);
              setEmbedError(null);
            } else if (st === 2 || st === 0) {
              setIsPlaying(false);
              setIsBuffering(false);
            } else if (st === 3) {
              setIsBuffering(true);
            }
          },
          onError: (event: any) => {
            if (cancelled) return;
            const code = Number(event?.data);
            let msg = 'This YouTube stream could not be played inside the embedded player.';
            if (code === 101 || code === 150) {
              msg =
                stream.streamVisibility === 'PRIVATE'
                  ? 'This stream is set to Private or Embed-Restricted by the YouTube channel. Signed-in authorized viewers can open it directly on YouTube below, or switch the stream to Unlisted with Embedding Allowed in YouTube Studio.'
                  : 'Embedding is disabled on YouTube Studio for this stream. Open it directly on YouTube or enable "Allow embedding" in YouTube Studio.';
            } else if (code === 100 || code === 2) {
              msg = 'Stream not found or currently private/offline on YouTube.';
            }
            setIsBuffering(false);
            setIsPlaying(false);
            setEmbedError({ code, message: msg });
          },
        },
      });

      pollTimer = window.setInterval(() => {
        if (cancelled || !playerRef.current) return;
        try {
          const ct = playerRef.current.getCurrentTime?.() || 0;
          const dur = playerRef.current.getDuration?.() || 0;
          const loaded = playerRef.current.getVideoLoadedFraction?.() || 0;
          const mutedState = Boolean(playerRef.current.isMuted?.());
          setCurrentTime(ct);
          if (dur > 0) setDuration(dur);
          setBufferedFraction(Math.min(1, Math.max(0, loaded)));
          setIsMuted(mutedState);
        } catch {
          // ignore
        }
      }, 350);
    };

    mountPlayer();

    return () => {
      cancelled = true;
      if (pollTimer) window.clearInterval(pollTimer);
      if (autoplayFallbackTimer) window.clearTimeout(autoplayFallbackTimer);
      try {
        playerRef.current?.destroy?.();
      } catch {
        // ignore
      }
      playerRef.current = null;
    };
  }, [videoId, autoPlay, retrySeed, stream.streamVisibility]);

  const flashIndicator = (mode: 'PLAY' | 'PAUSE') => {
    setCenterIndicator(mode);
    window.setTimeout(() => {
      setCenterIndicator((prev) => (prev === mode ? null : prev));
    }, 520);
  };

  const togglePlayPause = () => {
    if (!playerRef.current || !isReady) return;
    scheduleHideControls();
    try {
      if (isPlaying) {
        playerRef.current.pauseVideo();
        setIsPlaying(false);
        flashIndicator('PAUSE');
      } else {
        playerRef.current.playVideo();
        setIsPlaying(true);
        flashIndicator('PLAY');
      }
    } catch {
      // ignore
    }
  };

  const handleUnmute = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!playerRef.current) return;
    try {
      playerRef.current.unMute();
      playerRef.current.setVolume(volume > 0 ? volume : 85);
      setIsMuted(false);
      setNeedsUnmutePrompt(false);
      if (volume === 0) setVolume(85);
    } catch {
      // ignore
    }
  };

  const toggleMute = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!playerRef.current) return;
    try {
      if (isMuted) {
        playerRef.current.unMute();
        const nextVol = volume > 0 ? volume : 85;
        playerRef.current.setVolume(nextVol);
        setVolume(nextVol);
        setIsMuted(false);
        setNeedsUnmutePrompt(false);
      } else {
        playerRef.current.mute();
        setIsMuted(true);
      }
    } catch {
      // ignore
    }
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = Number(e.target.value);
    setVolume(val);
    if (!playerRef.current) return;
    try {
      if (val <= 0) {
        playerRef.current.mute();
        setIsMuted(true);
      } else {
        playerRef.current.unMute();
        playerRef.current.setVolume(val);
        setIsMuted(false);
        setNeedsUnmutePrompt(false);
      }
    } catch {
      // ignore
    }
  };

  const seekToFraction = (fraction: number) => {
    if (!playerRef.current || !duration) return;
    const clamped = Math.min(1, Math.max(0, fraction));
    const targetSeconds = clamped * duration;
    try {
      playerRef.current.seekTo(targetSeconds, true);
      setCurrentTime(targetSeconds);
    } catch {
      // ignore
    }
  };

  const handleTimelineClick = (e: React.MouseEvent<HTMLDivElement>) => {
    e.stopPropagation();
    if (!progressBarRef.current || !duration) return;
    const rect = progressBarRef.current.getBoundingClientRect();
    const frac = (e.clientX - rect.left) / rect.width;
    seekToFraction(frac);
    scheduleHideControls();
  };

  const handleSkip = (deltaSeconds: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!playerRef.current) return;
    const target = Math.max(0, Math.min(duration || currentTime + 60, currentTime + deltaSeconds));
    try {
      playerRef.current.seekTo(target, true);
      setCurrentTime(target);
      scheduleHideControls();
    } catch {
      // ignore
    }
  };

  const jumpToLive = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!playerRef.current || !duration) return;
    try {
      playerRef.current.seekTo(Math.max(0, duration - 1), true);
      playerRef.current.playVideo();
      setIsPlaying(true);
    } catch {
      // ignore
    }
  };

  const cyclePlaybackRate = (e: React.MouseEvent) => {
    e.stopPropagation();
    const rates = [1, 1.25, 1.5, 2];
    const next = rates[(rates.indexOf(playbackRate) + 1) % rates.length];
    setPlaybackRate(next);
    try {
      playerRef.current?.setPlaybackRate?.(next);
    } catch {
      // ignore
    }
  };

  const toggleFullscreen = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!containerRef.current) return;
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await containerRef.current.requestFullscreen();
      }
    } catch {
      // ignore
    }
  };

  const progressPercent = duration > 0 ? Math.min(100, (currentTime / duration) * 100) : isLive ? 100 : 0;
  const bufferedPercent = Math.min(100, bufferedFraction * 100);
  const isAtLiveEdge = isLive && (duration <= 0 || duration - currentTime <= 10);
  const posterThumb = getYouTubeThumbnail(videoId);

  return (
    <div
      ref={containerRef}
      onMouseMove={scheduleHideControls}
      onMouseEnter={scheduleHideControls}
      onClick={togglePlayPause}
      onDoubleClick={toggleFullscreen}
      className="relative w-full aspect-video bg-[#04070F] rounded-2xl overflow-hidden border border-white/10 shadow-[0_24px_80px_rgba(0,0,0,0.75)] select-none group cursor-pointer"
    >
      {/* YouTube IFrame Mount — pointer-events-none suppresses clicks onto native YouTube chrome */}
      <div
        ref={playerMountRef}
        className="w-full h-full pointer-events-none scale-[1.01]"
      />

      {/* Soft Thumbnail Backdrop while initial buffer loads */}
      {!isReady && !embedError && posterThumb && (
        <img
          src={posterThumb}
          alt={stream.title}
          className="absolute inset-0 w-full h-full object-cover opacity-35 pointer-events-none"
        />
      )}

      {/* Top Scrim Masking YouTube Header/Title Overlay + Custom Broadcast HUD */}
      <div
        className={`absolute inset-x-0 top-0 z-20 px-4 sm:px-6 pt-3.5 pb-12 bg-gradient-to-b from-[#04070F]/95 via-[#04070F]/70 to-transparent flex items-start justify-between gap-4 transition-opacity duration-300 pointer-events-none ${
          showControls || !isPlaying ? 'opacity-100' : 'opacity-0'
        }`}
      >
        <div className="min-w-0 flex items-center gap-3">
          {isLive && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-red-600 text-white text-[11px] font-bold tracking-wider uppercase shrink-0 shadow-lg shadow-red-600/30">
              <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
              LIVE
            </span>
          )}
          {stream.status === 'UPCOMING' && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-amber-500/90 text-black text-[11px] font-bold tracking-wider uppercase shrink-0">
              UPCOMING
            </span>
          )}
          {stream.streamVisibility !== 'PUBLIC' && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-white/10 border border-white/15 text-zinc-200 text-[10px] font-semibold tracking-wider uppercase shrink-0">
              <Lock className="w-3 h-3" />
              {stream.streamVisibility}
            </span>
          )}
          <div className="min-w-0">
            <p className="text-white font-semibold text-sm sm:text-base truncate drop-shadow">
              {stream.title}
            </p>
            <p className="text-zinc-300 text-xs truncate">
              {stream.tournamentName}
            </p>
          </div>
        </div>

        {/* Unmute button when browser autoplay starts muted */}
        {needsUnmutePrompt && isMuted && !embedError && (
          <button
            type="button"
            onClick={handleUnmute}
            style={{ background: theme.buttonGradient, boxShadow: theme.glowShadow }}
            className="pointer-events-auto inline-flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-white text-xs font-bold whitespace-nowrap shrink-0 transition-transform hover:scale-105 active:scale-95"
          >
            <VolumeX className="w-4 h-4" />
            Tap to Unmute
          </button>
        )}
      </div>

      {/* Bottom-Right Subtle Corner Blend Mask (shields any residual bottom-right corner badge) */}
      <div className="absolute right-0 bottom-0 w-36 h-16 bg-gradient-to-tl from-[#04070F]/90 via-[#04070F]/40 to-transparent pointer-events-none z-10" />

      {/* Center Play / Pause Flash Feedback */}
      {centerIndicator && !embedError && (
        <div className="absolute inset-0 z-20 flex items-center justify-center pointer-events-none">
          <div
            style={{ background: theme.buttonGradient, boxShadow: theme.glowShadow }}
            className="w-16 h-16 rounded-2xl flex items-center justify-center text-white opacity-95 scale-105 transition-all duration-300"
          >
            {centerIndicator === 'PLAY' ? (
              <Play className="w-7 h-7 fill-current ml-0.5" />
            ) : (
              <Pause className="w-7 h-7 fill-current" />
            )}
          </div>
        </div>
      )}

      {/* Centered Play Overlay when Paused & Ready */}
      {isReady && !isPlaying && !isBuffering && !embedError && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/25 pointer-events-none">
          <div
            style={{ background: theme.buttonGradient, boxShadow: theme.glowShadow }}
            className="w-20 h-20 rounded-2xl flex items-center justify-center text-white border border-white/25 transition-transform group-hover:scale-105"
          >
            <Play className="w-9 h-9 fill-current ml-1" />
          </div>
        </div>
      )}

      {/* Buffering Spinner */}
      {isBuffering && !embedError && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-black/35 pointer-events-none gap-2">
          <div
            className="w-11 h-11 rounded-full border-2 border-white/20 animate-spin"
            style={{ borderTopColor: theme.accentHex, borderRightColor: theme.secondaryHex }}
          />
          <span className="text-xs font-semibold text-zinc-200 tracking-wide">
            Connecting stream...
          </span>
        </div>
      )}

      {/* Private Stream / Embed Restricted Fallback Overlay */}
      {embedError && (
        <div
          onClick={(e) => e.stopPropagation()}
          className="absolute inset-0 z-30 flex items-center justify-center p-6 bg-[#070B14]/95 backdrop-blur-md cursor-default"
        >
          <div className="max-w-lg w-full text-center space-y-5">
            <div
              style={{ background: theme.buttonGradient }}
              className="w-14 h-14 rounded-2xl mx-auto flex items-center justify-center text-white shadow-xl"
            >
              {stream.streamVisibility === 'PRIVATE' ? (
                <Lock className="w-7 h-7" />
              ) : (
                <AlertTriangle className="w-7 h-7" />
              )}
            </div>
            <div>
              <h3 className="text-xl font-bold text-white tracking-tight">
                {stream.streamVisibility === 'PRIVATE'
                  ? 'Private Stream Playback Restricted Inline'
                  : 'Broadcast Stream Unavailable Inline'}
              </h3>
              <p className="text-sm text-zinc-400 mt-2 leading-relaxed">
                {embedError.message}
              </p>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-3 pt-1">
              <button
                type="button"
                onClick={() => setRetrySeed((s) => s + 1)}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/15 border border-white/15 text-white text-xs font-semibold transition-colors whitespace-nowrap shrink-0"
              >
                <RefreshCw className="w-4 h-4" />
                Retry Player
              </button>
              {stream.youtubeUrl && (
                <a
                  href={stream.youtubeUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ background: theme.buttonGradient, boxShadow: theme.glowShadow }}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-white text-xs font-bold transition-transform hover:scale-[1.02] whitespace-nowrap shrink-0"
                >
                  <ExternalLink className="w-4 h-4" />
                  Open Stream on YouTube
                </a>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Custom Gradient OTT Bottom Control Bar */}
      {!embedError && (
        <div
          onClick={(e) => e.stopPropagation()}
          className={`absolute inset-x-0 bottom-0 z-30 pt-14 pb-3.5 px-4 sm:px-6 bg-gradient-to-t from-[#03050B] via-[#040711]/92 to-transparent transition-opacity duration-300 cursor-default ${
            showControls || !isPlaying ? 'opacity-100' : 'opacity-0 pointer-events-none'
          }`}
        >
          {/* Custom Gradient Timeline Scrubber */}
          <div className="mb-3">
            <div
              ref={progressBarRef}
              onClick={handleTimelineClick}
              role="slider"
              aria-label="Stream timeline"
              aria-valuemin={0}
              aria-valuemax={duration || 100}
              aria-valuenow={currentTime}
              className="relative h-2.5 w-full rounded-full bg-white/15 cursor-pointer group/bar flex items-center"
            >
              {/* Buffered segment */}
              <div
                className="absolute inset-y-0 left-0 rounded-full bg-white/25 transition-all"
                style={{ width: `${bufferedPercent}%` }}
              />
              {/* Active Gradient Timeline Progress */}
              <div
                className="relative h-full rounded-full transition-all duration-150"
                style={{
                  width: `${progressPercent}%`,
                  background: theme.timelineGradient,
                  boxShadow: `0 0 14px ${theme.accentHex}88`,
                }}
              >
                {/* Glowing Gradient Scrubber Thumb */}
                <span
                  className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/2 w-4 h-4 rounded-full bg-white shadow-lg ring-2 ring-white/40 scale-90 group-hover/bar:scale-115 transition-transform"
                  style={{ boxShadow: `0 0 12px ${theme.secondaryHex}` }}
                />
              </div>
            </div>
          </div>

          {/* Controls Row */}
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 sm:gap-3 min-w-0">
              {/* Gradient Play / Pause Button */}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  togglePlayPause();
                }}
                style={{ background: theme.buttonGradient, boxShadow: theme.glowShadow }}
                aria-label={isPlaying ? 'Pause video' : 'Play video'}
                className="w-10 h-10 rounded-xl flex items-center justify-center text-white transition-transform hover:scale-105 active:scale-95 shrink-0 border border-white/20"
              >
                {isPlaying ? (
                  <Pause className="w-5 h-5 fill-current" />
                ) : (
                  <Play className="w-5 h-5 fill-current ml-0.5" />
                )}
              </button>

              {/* Skip Back / Forward 10s */}
              <button
                type="button"
                onClick={(e) => handleSkip(-10, e)}
                title="Rewind 10 seconds"
                className="p-2 rounded-lg text-zinc-300 hover:text-white hover:bg-white/10 transition-colors hidden sm:inline-flex"
              >
                <RotateCcw className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={(e) => handleSkip(10, e)}
                title="Forward 10 seconds"
                className="p-2 rounded-lg text-zinc-300 hover:text-white hover:bg-white/10 transition-colors hidden sm:inline-flex"
              >
                <RotateCw className="w-4 h-4" />
              </button>

              {/* Volume Control */}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={toggleMute}
                  aria-label={isMuted ? 'Unmute' : 'Mute'}
                  className="p-2 rounded-lg text-zinc-200 hover:text-white hover:bg-white/10 transition-colors"
                >
                  {isMuted || volume === 0 ? (
                    <VolumeX className="w-4 h-4 text-red-400" />
                  ) : (
                    <Volume2 className="w-4 h-4" />
                  )}
                </button>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={isMuted ? 0 : volume}
                  onChange={handleVolumeChange}
                  aria-label="Volume"
                  style={{ accentColor: theme.accentHex }}
                  className="w-16 sm:w-20 h-1.5 rounded-full cursor-pointer hidden md:block"
                />
              </div>

              {/* Time & Live Edge Control */}
              {isLive ? (
                <button
                  type="button"
                  onClick={jumpToLive}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold tabular-nums transition-colors whitespace-nowrap shrink-0 ${
                    isAtLiveEdge
                      ? 'bg-red-500/20 text-red-300 border border-red-500/40'
                      : 'bg-white/10 hover:bg-white/20 text-zinc-200 border border-white/15'
                  }`}
                >
                  <Radio className="w-3.5 h-3.5" />
                  {isAtLiveEdge ? 'LIVE' : 'GO LIVE'}
                </button>
              ) : (
                <span className="text-xs font-mono tabular-nums text-zinc-300 whitespace-nowrap">
                  {formatStreamTime(currentTime)}
                  {duration > 0 ? ` / ${formatStreamTime(duration)}` : ''}
                </span>
              )}
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {/* Speed Selector */}
              <button
                type="button"
                onClick={cyclePlaybackRate}
                className="px-2.5 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 border border-white/10 text-zinc-200 text-xs font-mono font-bold tabular-nums transition-colors whitespace-nowrap shrink-0"
                title="Playback speed"
              >
                {playbackRate}x
              </button>

              {/* Fullscreen Toggle (keeps our gradient controls visible) */}
              <button
                type="button"
                onClick={toggleFullscreen}
                aria-label={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
                className="p-2 rounded-lg bg-white/10 hover:bg-white/20 border border-white/10 text-white transition-colors"
              >
                {isFullscreen ? (
                  <Minimize2 className="w-4 h-4" />
                ) : (
                  <Maximize2 className="w-4 h-4" />
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default YouTubeGradientPlayer;
