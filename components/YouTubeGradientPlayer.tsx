import React from 'react';
import { ExternalLink, Lock, Radio } from 'lucide-react';
import { LiveStreamItem } from '../types';
import { extractYouTubeVideoId, GRADIENT_PRESETS } from '../utils/liveStreamUtils';

interface YouTubeGradientPlayerProps {
  stream: LiveStreamItem;
  autoPlay?: boolean;
}

const YouTubeGradientPlayer: React.FC<YouTubeGradientPlayerProps> = ({
  stream,
  autoPlay = true,
}) => {
  const videoId = stream.youtubeVideoId || extractYouTubeVideoId(stream.youtubeUrl) || '';
  const theme =
    GRADIENT_PRESETS[stream.playerGradientPreset || 'JIO_GOLD'] ||
    GRADIENT_PRESETS.JIO_GOLD;
  const isLive = stream.status === 'LIVE';

  const embedUrl = videoId
    ? `https://www.youtube-nocookie.com/embed/${videoId}?autoplay=${
        autoPlay ? 1 : 0
      }&controls=1&rel=0&playsinline=1&modestbranding=1`
    : '';

  return (
    <div className="space-y-3">
      {/* Clean full-frame native YouTube nocookie embed with zero overlapping custom overlays */}
      <div className="live-player w-full aspect-video bg-black rounded-2xl overflow-hidden border border-white/10 shadow-[0_24px_80px_rgba(0,0,0,0.75)]">
        {embedUrl ? (
          <iframe
            key={embedUrl}
            src={embedUrl}
            title={stream.title || 'SM SPORTS Live'}
            allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
            allowFullScreen
            className="w-full h-full border-0"
          />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center p-6 text-center space-y-3 bg-[#070B14]">
            <p className="text-sm font-semibold text-zinc-300">
              No valid YouTube stream link configured for this broadcast.
            </p>
          </div>
        )}
      </div>

      {/* Clean below-player broadcast strip (never overlaps YouTube video or controls) */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 rounded-xl bg-[#0D1322] border border-white/10">
        <div className="flex items-center gap-3 min-w-0">
          {isLive && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-red-600 text-white text-[11px] font-bold tracking-wider uppercase shrink-0">
              <Radio className="w-3.5 h-3.5 animate-pulse" />
              LIVE
            </span>
          )}
          {stream.status === 'UPCOMING' && (
            <span className="inline-flex items-center px-2.5 py-1 rounded-md bg-amber-400 text-black text-[11px] font-bold tracking-wider uppercase shrink-0">
              UPCOMING
            </span>
          )}
          {stream.streamVisibility !== 'PUBLIC' && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-white/10 border border-white/15 text-zinc-200 text-[11px] font-semibold uppercase shrink-0">
              <Lock className="w-3 h-3" />
              {stream.streamVisibility}
            </span>
          )}
          <span className="text-xs sm:text-sm font-semibold text-zinc-200 truncate">
            {stream.tournamentName}
            {stream.metaText ? ` • ${stream.metaText}` : ''}
          </span>
        </div>

        {stream.youtubeUrl && (
          <a
            href={stream.youtubeUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{ background: theme.buttonGradient, boxShadow: theme.glowShadow }}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-white text-xs font-bold whitespace-nowrap shrink-0 transition-transform hover:scale-[1.02]"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            {stream.streamVisibility === 'PRIVATE'
              ? 'Open Private Stream on YouTube'
              : 'Watch on YouTube'}
          </a>
        )}
      </div>
    </div>
  );
};

export default YouTubeGradientPlayer;
