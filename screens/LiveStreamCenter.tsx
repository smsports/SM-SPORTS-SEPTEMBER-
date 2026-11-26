import React, { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft,
  Calendar,
  Clock,
  ExternalLink,
  Film,
  Lock,
  Play,
  Radio,
  Trophy,
  Tv,
} from 'lucide-react';
import { db } from '../firebase';
import { useAuction } from '../hooks/useAuction';
import { LiveStreamItem, LiveStreamSettings, Match } from '../types';
import {
  extractYouTubeVideoId,
  getYouTubeThumbnail,
  GRADIENT_PRESETS,
} from '../utils/liveStreamUtils';
import YouTubeGradientPlayer from '../components/YouTubeGradientPlayer';
import CricHeroesScoreboardHub from '../components/CricHeroesScoreboardHub';

const DEFAULT_FALLBACK_TITLE = 'No Live Broadcast On Air Right Now';
const DEFAULT_FALLBACK_SUBTITLE =
  'Check upcoming fixtures below or follow live tournament scores on SM SPORTS.';

const LiveStreamCenter: React.FC = () => {
  const { state } = useAuction();
  const [searchParams, setSearchParams] = useSearchParams();
  const [settings, setSettings] = useState<LiveStreamSettings>({
    noLiveFallbackTitle: DEFAULT_FALLBACK_TITLE,
    noLiveFallbackSubtitle: DEFAULT_FALLBACK_SUBTITLE,
    streams: [],
    updatedAt: 0,
  });
  const [loading, setLoading] = useState(true);
  const [selectedStreamId, setSelectedStreamId] = useState<string | null>(
    searchParams.get('stream')
  );
  const [linkedMatch, setLinkedMatch] = useState<Match | null>(null);

  useEffect(() => {
    const unsub = db
      .collection('appConfig')
      .doc('liveStreams')
      .onSnapshot(
        (doc) => {
          if (doc.exists) {
            const data = doc.data() as Partial<LiveStreamSettings>;
            setSettings({
              noLiveFallbackTitle: data.noLiveFallbackTitle?.trim() || DEFAULT_FALLBACK_TITLE,
              noLiveFallbackSubtitle:
                data.noLiveFallbackSubtitle?.trim() || DEFAULT_FALLBACK_SUBTITLE,
              streams: Array.isArray(data.streams) ? data.streams : [],
              updatedAt: data.updatedAt || Date.now(),
            });
          } else {
            setSettings({
              noLiveFallbackTitle: DEFAULT_FALLBACK_TITLE,
              noLiveFallbackSubtitle: DEFAULT_FALLBACK_SUBTITLE,
              streams: [],
              updatedAt: 0,
            });
          }
          setLoading(false);
        },
        () => {
          setLoading(false);
        }
      );
    return () => unsub();
  }, []);

  const liveStreams = useMemo(
    () => settings.streams.filter((s) => s.status === 'LIVE'),
    [settings.streams]
  );

  const upcomingStreams = useMemo(
    () => settings.streams.filter((s) => s.status === 'UPCOMING'),
    [settings.streams]
  );

  const endedStreams = useMemo(
    () => settings.streams.filter((s) => s.status === 'ENDED'),
    [settings.streams]
  );

  const activeStream: LiveStreamItem | null = useMemo(() => {
    if (selectedStreamId) {
      const explicit = settings.streams.find((s) => s.id === selectedStreamId);
      if (explicit) return explicit;
    }
    const featuredLive = liveStreams.find((s) => s.isFeatured);
    if (featuredLive) return featuredLive;
    if (liveStreams.length > 0) return liveStreams[0];
    return null;
  }, [selectedStreamId, settings.streams, liveStreams]);

  useEffect(() => {
    const matchId = activeStream?.linkedMatchId;
    if (!matchId) {
      setLinkedMatch(null);
      return;
    }
    const unsub = db
      .collection('matches')
      .doc(matchId)
      .onSnapshot(
        (doc) => {
          if (doc.exists) {
            setLinkedMatch({ id: doc.id, ...doc.data() } as Match);
          } else {
            setLinkedMatch(null);
          }
        },
        () => setLinkedMatch(null)
      );
    return () => unsub();
  }, [activeStream?.linkedMatchId]);

  const handleSelectStream = (stream: LiveStreamItem) => {
    setSelectedStreamId(stream.id);
    setSearchParams({ stream: stream.id });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleBackToLive = () => {
    const primaryLive = liveStreams.find((s) => s.isFeatured) || liveStreams[0];
    if (primaryLive) {
      setSelectedStreamId(primaryLive.id);
      setSearchParams({ stream: primaryLive.id });
    } else {
      setSelectedStreamId(null);
      setSearchParams({});
    }
  };

  const activeTheme =
    GRADIENT_PRESETS[activeStream?.playerGradientPreset || 'JIO_GOLD'] ||
    GRADIENT_PRESETS.JIO_GOLD;

  return (
    <div
      className="min-h-screen bg-[#070B14] text-white selection:bg-cyan-500/30"
      style={{ fontFamily: "'Plus Jakarta Sans', 'Inter', sans-serif" }}
    >
      {/* Top Broadcast Navigation Bar */}
      <header className="sticky top-0 z-40 border-b border-white/10 bg-[#070B14]/90 backdrop-blur-xl">
        <div className="max-w-[1440px] mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <Link
              to="/"
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-semibold text-zinc-200 transition-colors shrink-0"
            >
              <ArrowLeft className="w-4 h-4" />
              <span className="hidden sm:inline">Home</span>
            </Link>
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-lg bg-black border border-white/15 p-1 flex items-center justify-center shrink-0 overflow-hidden">
                {state.systemLogoUrl ? (
                  <img
                    src={state.systemLogoUrl}
                    alt="SM SPORTS"
                    className="w-full h-full object-contain"
                  />
                ) : (
                  <Trophy className="w-4 h-4 text-amber-400" />
                )}
              </div>
              <div className="min-w-0">
                <h1
                  className="text-sm sm:text-base font-extrabold tracking-tight text-white truncate"
                  style={{ fontFamily: "'Outfit', sans-serif" }}
                >
                  SM SPORTS LIVE
                </h1>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            {liveStreams.length > 0 ? (
              <button
                type="button"
                onClick={handleBackToLive}
                className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-red-600/15 border border-red-500/40 text-red-300 text-xs font-bold whitespace-nowrap shrink-0"
              >
                <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                <span>
                  {liveStreams.length} Live {liveStreams.length === 1 ? 'Stream' : 'Streams'}
                </span>
              </button>
            ) : (
              <span className="text-xs font-semibold text-zinc-400 whitespace-nowrap">
                Off Air
              </span>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-[1440px] mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-8">
        {loading ? (
          <div className="space-y-6">
            <div className="w-full aspect-video rounded-2xl bg-white/[0.04] border border-white/10 animate-pulse" />
            <div className="h-44 rounded-2xl bg-white/[0.04] border border-white/10 animate-pulse" />
          </div>
        ) : activeStream ? (
          <>
            {/* Theater Video + Multi-Stream Rail */}
            <section className="space-y-4">
              <div className="flex flex-col md:flex-row md:items-end justify-between gap-3">
                <div className="space-y-1 min-w-0">
                  <div className="flex items-center gap-2 text-xs font-semibold text-cyan-300">
                    <Tv className="w-3.5 h-3.5" />
                    <span className="truncate">{activeStream.tournamentName}</span>
                  </div>
                  <h2
                    className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white"
                    style={{ fontFamily: "'Outfit', sans-serif" }}
                  >
                    {activeStream.title}
                  </h2>
                  {activeStream.subtitle && (
                    <p className="text-sm text-zinc-400">{activeStream.subtitle}</p>
                  )}
                </div>

                {activeStream.status !== 'LIVE' && liveStreams.length > 0 && (
                  <button
                    type="button"
                    onClick={handleBackToLive}
                    style={{
                      background: activeTheme.buttonGradient,
                      boxShadow: activeTheme.glowShadow,
                    }}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-white text-xs font-bold whitespace-nowrap shrink-0 self-start md:self-auto"
                  >
                    <Radio className="w-4 h-4" />
                    Return to Live Broadcast
                  </button>
                )}
              </div>

              {/* Autoplay Custom Gradient YouTube OTT Player */}
              <YouTubeGradientPlayer
                key={activeStream.id}
                stream={activeStream}
                autoPlay={activeStream.status === 'LIVE' || Boolean(selectedStreamId)}
              />

              {/* Multi-Match Live Switcher if > 1 Live Stream */}
              {liveStreams.length > 1 && (
                <div className="pt-2">
                  <div className="text-xs font-bold uppercase tracking-wider text-zinc-400 mb-2.5">
                    Live Channels
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {liveStreams.map((ls) => {
                      const isCurrent = ls.id === activeStream.id;
                      return (
                        <button
                          key={ls.id}
                          type="button"
                          onClick={() => handleSelectStream(ls)}
                          className={`text-left p-3.5 rounded-xl border transition-all flex items-center gap-3 ${
                            isCurrent
                              ? 'bg-white/10 border-cyan-400/50'
                              : 'bg-[#0D1322] hover:bg-white/[0.06] border-white/10'
                          }`}
                        >
                          <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded bg-red-600 text-white text-[10px] font-bold shrink-0">
                            <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                            LIVE
                          </span>
                          <div className="min-w-0">
                            <div className="text-sm font-bold text-white truncate">
                              {ls.title}
                            </div>
                            <div className="text-xs text-zinc-400 truncate">
                              {ls.tournamentName}
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </section>

            {/* JioHotstar IPL Live–style CricHeroes Scoreboard & Controls Below Video */}
            <CricHeroesScoreboardHub stream={activeStream} linkedMatch={linkedMatch} />
          </>
        ) : (
          /* No Live Video Standby Title Card */
          <section className="rounded-2xl bg-gradient-to-br from-[#0F172A] via-[#0B1120] to-[#080C17] border border-white/10 p-8 sm:p-14 text-center shadow-2xl relative overflow-hidden">
            <div
              className="absolute inset-x-0 -top-24 h-48 opacity-25 blur-3xl pointer-events-none"
              style={{ background: GRADIENT_PRESETS.JIO_GOLD.timelineGradient }}
            />
            <div className="relative z-10 max-w-2xl mx-auto space-y-5">
              <div
                style={{
                  background: GRADIENT_PRESETS.JIO_GOLD.buttonGradient,
                  boxShadow: GRADIENT_PRESETS.JIO_GOLD.glowShadow,
                }}
                className="w-16 h-16 rounded-2xl mx-auto flex items-center justify-center text-white"
              >
                <Tv className="w-8 h-8" />
              </div>
              <h2
                className="text-2xl sm:text-4xl font-extrabold tracking-tight text-white"
                style={{ fontFamily: "'Outfit', sans-serif" }}
              >
                {settings.noLiveFallbackTitle}
              </h2>
              {settings.noLiveFallbackSubtitle && (
                <p className="text-sm sm:text-base text-zinc-400 leading-relaxed">
                  {settings.noLiveFallbackSubtitle}
                </p>
              )}
              {upcomingStreams.length > 0 && (
                <div className="pt-2 flex items-center justify-center gap-3">
                  <span className="text-xs font-semibold text-cyan-300">
                    {upcomingStreams.length} Upcoming{' '}
                    {upcomingStreams.length === 1 ? 'Broadcast' : 'Broadcasts'} Scheduled Below
                  </span>
                </div>
              )}
            </div>
          </section>
        )}

        {/* Upcoming Live Streams Section */}
        <section className="space-y-4">
          <div className="flex items-center justify-between gap-4 border-b border-white/10 pb-3">
            <div className="flex items-center gap-2.5">
              <Calendar className="w-5 h-5 text-cyan-400" />
              <h3
                className="text-lg sm:text-xl font-bold text-white tracking-tight"
                style={{ fontFamily: "'Outfit', sans-serif" }}
              >
                Upcoming Live Streams
              </h3>
            </div>
            <span className="text-xs font-mono tabular-nums text-zinc-400">
              {upcomingStreams.length} Scheduled
            </span>
          </div>

          {upcomingStreams.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {upcomingStreams.map((stream) => {
                const vid =
                  stream.youtubeVideoId || extractYouTubeVideoId(stream.youtubeUrl);
                const thumb = getYouTubeThumbnail(vid);
                const cardTheme =
                  GRADIENT_PRESETS[stream.playerGradientPreset || 'JIO_GOLD'] ||
                  GRADIENT_PRESETS.JIO_GOLD;
                return (
                  <div
                    key={stream.id}
                    className="rounded-2xl bg-[#0D1322] border border-white/10 hover:border-cyan-400/40 overflow-hidden flex flex-col transition-all group"
                  >
                    <div className="relative aspect-video bg-black overflow-hidden">
                      {thumb ? (
                        <img
                          src={thumb}
                          alt={stream.title}
                          className="w-full h-full object-cover opacity-75 group-hover:scale-105 transition-transform duration-500"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center bg-white/[0.03]">
                          <Tv className="w-10 h-10 text-zinc-700" />
                        </div>
                      )}
                      <div className="absolute inset-0 bg-gradient-to-t from-[#0D1322] via-transparent to-black/50" />
                      <div className="absolute top-3 left-3 flex items-center gap-2">
                        <span className="px-2.5 py-1 rounded-md bg-amber-400 text-black text-[10px] font-extrabold uppercase tracking-wider">
                          UPCOMING
                        </span>
                        {stream.streamVisibility !== 'PUBLIC' && (
                          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-black/70 border border-white/15 text-zinc-200 text-[10px] font-semibold">
                            <Lock className="w-3 h-3" />
                            {stream.streamVisibility}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="p-4 sm:p-5 flex-1 flex flex-col justify-between gap-4">
                      <div className="space-y-1.5">
                        <div className="text-xs font-semibold text-cyan-300 truncate">
                          {stream.tournamentName}
                        </div>
                        <h4 className="text-base font-bold text-white line-clamp-2">
                          {stream.title}
                        </h4>
                        {stream.scheduledAt && (
                          <div className="flex items-center gap-1.5 text-xs text-zinc-400 font-mono tabular-nums pt-1">
                            <Clock className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                            <span>{stream.scheduledAt}</span>
                          </div>
                        )}
                      </div>

                      <div className="flex items-center gap-2 pt-2 border-t border-white/5">
                        <button
                          type="button"
                          onClick={() => handleSelectStream(stream)}
                          style={{ background: cardTheme.buttonGradient }}
                          className="flex-1 inline-flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl text-white text-xs font-bold transition-transform hover:scale-[1.01] whitespace-nowrap"
                        >
                          <Play className="w-3.5 h-3.5 fill-current" />
                          Open Stream
                        </button>
                        {stream.cricHeroesUrl && (
                          <a
                            href={stream.cricHeroesUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 py-2 px-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-zinc-200 text-xs font-semibold whitespace-nowrap shrink-0"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                            CricHeroes
                          </a>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-white/10 bg-[#0D1322]/50 p-8 text-center text-sm text-zinc-400">
              No upcoming streams scheduled right now.
            </div>
          )}
        </section>

        {/* Past / Replay Broadcasts */}
        {endedStreams.length > 0 && (
          <section className="space-y-4">
            <div className="flex items-center justify-between gap-4 border-b border-white/10 pb-3">
              <div className="flex items-center gap-2.5">
                <Film className="w-5 h-5 text-zinc-400" />
                <h3
                  className="text-lg font-bold text-white tracking-tight"
                  style={{ fontFamily: "'Outfit', sans-serif" }}
                >
                  Recent Broadcasts & Highlights
                </h3>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {endedStreams.map((stream) => {
                const vid =
                  stream.youtubeVideoId || extractYouTubeVideoId(stream.youtubeUrl);
                const thumb = getYouTubeThumbnail(vid);
                return (
                  <div
                    key={stream.id}
                    className="rounded-2xl bg-[#0D1322] border border-white/10 overflow-hidden flex flex-col group"
                  >
                    <div className="relative aspect-video bg-black overflow-hidden">
                      {thumb ? (
                        <img
                          src={thumb}
                          alt={stream.title}
                          className="w-full h-full object-cover opacity-75 group-hover:scale-105 transition-transform duration-500"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <Film className="w-9 h-9 text-zinc-700" />
                        </div>
                      )}
                      <div className="absolute inset-0 bg-gradient-to-t from-[#0D1322] via-transparent to-transparent" />
                      <button
                        type="button"
                        onClick={() => handleSelectStream(stream)}
                        className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <span className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white text-black text-xs font-bold">
                          <Play className="w-4 h-4 fill-current" />
                          Watch Replay
                        </span>
                      </button>
                    </div>
                    <div className="p-4 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-xs text-zinc-400 truncate">
                          {stream.tournamentName}
                        </div>
                        <h4 className="text-sm font-bold text-white truncate">
                          {stream.title}
                        </h4>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleSelectStream(stream)}
                        className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 text-xs font-semibold text-white shrink-0 whitespace-nowrap"
                      >
                        Watch
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}
      </main>
    </div>
  );
};

export default LiveStreamCenter;
