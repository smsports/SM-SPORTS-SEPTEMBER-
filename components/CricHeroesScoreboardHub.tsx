import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  Award,
  BarChart3,
  Calendar,
  ExternalLink,
  ListOrdered,
  MessageSquareText,
  Radio,
  RefreshCw,
  Shield,
  Trophy,
  Users,
  Globe,
} from 'lucide-react';
import {
  CricHeroesSectionId,
  LiveStreamItem,
  Match,
} from '../types';
import {
  GRADIENT_PRESETS,
  parseCricHeroesUrl,
} from '../utils/liveStreamUtils';

interface CricHeroesMetaResponse {
  ok: boolean;
  source?: string;
  status?: number;
  protectedByCloudflare?: boolean;
  fetchedAt?: number;
  iframeBlocked?: boolean;
  title?: string;
  description?: string;
  imageUrl?: string;
  error?: string;
  parsed?: {
    tournamentDetail?: any;
    matches?: any[] | null;
    pointsTable?: any[] | null;
    leaderboard?: any;
    teams?: any[] | null;
    scorecard?: any;
  } | null;
}

interface CricHeroesScoreboardHubProps {
  stream: LiveStreamItem;
  linkedMatch?: Match | null;
  testerMode?: boolean;
}

const SECTION_TABS: Array<{
  id: CricHeroesSectionId;
  label: string;
  icon: React.ReactNode;
}> = [
  { id: 'SCORECARD', label: 'Live Scorecard', icon: <Activity className="w-4 h-4" /> },
  { id: 'LIVE_FEED', label: 'Commentary', icon: <MessageSquareText className="w-4 h-4" /> },
  { id: 'POINTS_TABLE', label: 'Points Table', icon: <ListOrdered className="w-4 h-4" /> },
  { id: 'MATCHES', label: 'Matches', icon: <Calendar className="w-4 h-4" /> },
  { id: 'LEADERBOARD', label: 'Leaderboard', icon: <Award className="w-4 h-4" /> },
  { id: 'TEAMS', label: 'Teams', icon: <Users className="w-4 h-4" /> },
  { id: 'STATS', label: 'CricHeroes Hub', icon: <BarChart3 className="w-4 h-4" /> },
];

const CricHeroesScoreboardHub: React.FC<CricHeroesScoreboardHubProps> = ({
  stream,
  linkedMatch,
  testerMode = false,
}) => {
  const [activeSection, setActiveSection] = useState<CricHeroesSectionId>('SCORECARD');
  const [cricMeta, setCricMeta] = useState<CricHeroesMetaResponse | null>(null);
  const [loadingMeta, setLoadingMeta] = useState(false);
  const [autoSyncEnabled, setAutoSyncEnabled] = useState(true);
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(null);
  const [showEmbeddedFrame, setShowEmbeddedFrame] = useState(false);

  const theme =
    GRADIENT_PRESETS[stream.playerGradientPreset || 'JIO_GOLD'] ||
    GRADIENT_PRESETS.JIO_GOLD;

  const parsedLinks = useMemo(
    () => parseCricHeroesUrl(stream.cricHeroesUrl, stream.cricHeroesMatchUrl),
    [stream.cricHeroesUrl, stream.cricHeroesMatchUrl]
  );

  const activeSectionInfo = parsedLinks.sections[activeSection];

  const fetchCricHeroesMeta = useCallback(
    async (targetUrl?: string) => {
      const urlToFetch = targetUrl || parsedLinks.baseUrl;
      if (!urlToFetch) {
        setCricMeta(null);
        return;
      }
      setLoadingMeta(true);
      try {
        const params = new URLSearchParams({ url: urlToFetch });
        if (stream.cricHeroesMatchUrl) {
          params.set('matchUrl', stream.cricHeroesMatchUrl);
        }
        const resp = await fetch(`/api/cricheroes-info?${params.toString()}`);
        const data: CricHeroesMetaResponse = await resp.json();
        setCricMeta(data);
        setLastSyncedAt(data.fetchedAt || Date.now());
      } catch {
        setCricMeta({
          ok: false,
          iframeBlocked: true,
          error: 'Could not sync live CricHeroes metadata.',
        });
      } finally {
        setLoadingMeta(false);
      }
    },
    [parsedLinks.baseUrl, stream.cricHeroesMatchUrl]
  );

  // Initial fetch & real-time 10-second polling while stream is LIVE
  useEffect(() => {
    setShowEmbeddedFrame(false);
    if (!parsedLinks.isValid) {
      setCricMeta(null);
      return;
    }

    fetchCricHeroesMeta(parsedLinks.baseUrl);

    if (stream.status === 'LIVE' && autoSyncEnabled) {
      const intervalId = window.setInterval(() => {
        fetchCricHeroesMeta(parsedLinks.baseUrl);
      }, 10000);
      return () => window.clearInterval(intervalId);
    }
  }, [parsedLinks.isValid, parsedLinks.baseUrl, stream.status, autoSyncEnabled, fetchCricHeroesMeta]);

  const innings1 = linkedMatch?.innings?.[1];
  const innings2 = linkedMatch?.innings?.[2];
  const currentInn = linkedMatch
    ? linkedMatch.innings?.[linkedMatch.currentInnings]
    : undefined;
  const batsmenList = currentInn ? Object.values(currentInn.batsmen || {}) : [];
  const bowlersList = currentInn ? Object.values(currentInn.bowlers || {}) : [];

  const snap = stream.scoreSnapshot;
  const hasSnapshot = Boolean(
    snap?.teamAName || snap?.teamAScore || snap?.teamBName || snap?.statusNote
  );

  const parsedPoints: any[] = Array.isArray(cricMeta?.parsed?.pointsTable)
    ? cricMeta!.parsed!.pointsTable!
    : [];
  const parsedMatches: any[] = Array.isArray(cricMeta?.parsed?.matches)
    ? cricMeta!.parsed!.matches!
    : [];
  const parsedTeams: any[] = Array.isArray(cricMeta?.parsed?.teams)
    ? cricMeta!.parsed!.teams!
    : [];
  const parsedScorecard: any = cricMeta?.parsed?.scorecard || null;
  const parsedLeaderboard: any = cricMeta?.parsed?.leaderboard || null;

  // Pick first active CricHeroes live match if match-list is populated
  const liveCricMatch = useMemo(() => {
    if (!parsedMatches.length) return null;
    return (
      parsedMatches.find((m: any) =>
        String(m.status || m.match_status || '').toLowerCase().includes('live')
      ) || parsedMatches[0]
    );
  }, [parsedMatches]);

  const cricScoreInnings: any[] = useMemo(() => {
    if (!parsedScorecard) return [];
    if (Array.isArray(parsedScorecard)) return parsedScorecard;
    if (Array.isArray(parsedScorecard.innings)) return parsedScorecard.innings;
    if (Array.isArray(parsedScorecard.scorecard)) return parsedScorecard.scorecard;
    return [];
  }, [parsedScorecard]);

  return (
    <section className="rounded-2xl bg-[#0D1322] border border-white/10 overflow-hidden shadow-2xl">
      {/* JioHotstar IPL Live Match Hero Scoreboard Header */}
      <div className="p-4 sm:p-6 bg-gradient-to-r from-[#111A30] via-[#0E1629] to-[#131B2E] border-b border-white/10">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-zinc-400">
              <Trophy className="w-3.5 h-3.5 text-amber-400" />
              <span className="text-zinc-200">{parsedLinks.tournamentTitle || stream.tournamentName}</span>
              {(linkedMatch || cricMeta?.ok) && (
                <span className="inline-flex items-center gap-1.5 text-[11px] font-mono text-emerald-400">
                  <Radio className="w-3 h-3 animate-pulse" />
                  LIVE TELEMETRY
                </span>
              )}
              {testerMode && cricMeta && (
                <span className="text-[11px] font-mono tabular-nums text-cyan-300">
                  {cricMeta.ok
                    ? `HTTP ${cricMeta.status || 200} • Web Extract OK`
                    : `HTTP ${cricMeta.status || 403} • ${cricMeta.protectedByCloudflare ? 'Cloudflare Shield' : 'Unavailable'}`}
                </span>
              )}
              {lastSyncedAt && (
                <span className="text-[11px] font-mono text-zinc-500 tabular-nums">
                  Updated {new Date(lastSyncedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                </span>
              )}
            </div>
            <h2 className="text-lg sm:text-xl font-bold text-white tracking-tight">
              {linkedMatch
                ? `${linkedMatch.teamAName} vs ${linkedMatch.teamBName}`
                : liveCricMatch
                ? `${liveCricMatch.team_a || liveCricMatch.teamAName || 'Team A'} vs ${liveCricMatch.team_b || liveCricMatch.teamBName || 'Team B'}`
                : snap?.teamAName && snap?.teamBName
                ? `${snap.teamAName} vs ${snap.teamBName}`
                : cricMeta?.title || parsedLinks.matchTitle || parsedLinks.tournamentTitle || stream.title}
            </h2>
            {(snap?.statusNote || liveCricMatch?.match_result || cricMeta?.description) && (
              <p className="text-xs sm:text-sm text-cyan-300 font-medium">
                {snap?.statusNote || liveCricMatch?.match_result || cricMeta?.description}
              </p>
            )}
          </div>

          {/* Real-Time Score Readout Cards */}
          {(linkedMatch || hasSnapshot || liveCricMatch) && (
            <div className="flex flex-wrap items-center gap-3">
              {linkedMatch ? (
                <>
                  <div className="px-4 py-2.5 rounded-xl bg-black/35 border border-white/10 min-w-[155px]">
                    <div className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">
                      {linkedMatch.teamAName}
                    </div>
                    <div className="text-xl font-bold text-white font-mono tabular-nums mt-0.5">
                      {innings1?.battingTeamId === linkedMatch.teamAId
                        ? `${innings1.totalRuns}/${innings1.wickets} (${innings1.overs}.${innings1.ballsInCurrentOver})`
                        : innings2?.battingTeamId === linkedMatch.teamAId
                        ? `${innings2.totalRuns}/${innings2.wickets} (${innings2.overs}.${innings2.ballsInCurrentOver})`
                        : 'Yet to Bat'}
                    </div>
                  </div>
                  <div className="px-4 py-2.5 rounded-xl bg-black/35 border border-white/10 min-w-[155px]">
                    <div className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">
                      {linkedMatch.teamBName}
                    </div>
                    <div className="text-xl font-bold text-white font-mono tabular-nums mt-0.5">
                      {innings1?.battingTeamId === linkedMatch.teamBId
                        ? `${innings1.totalRuns}/${innings1.wickets} (${innings1.overs}.${innings1.ballsInCurrentOver})`
                        : innings2?.battingTeamId === linkedMatch.teamBId
                        ? `${innings2.totalRuns}/${innings2.wickets} (${innings2.overs}.${innings2.ballsInCurrentOver})`
                        : 'Yet to Bat'}
                    </div>
                  </div>
                </>
              ) : liveCricMatch && (liveCricMatch.team_a_summary || liveCricMatch.team_b_summary) ? (
                <>
                  <div className="px-4 py-2.5 rounded-xl bg-black/35 border border-white/10 min-w-[155px]">
                    <div className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">
                      {liveCricMatch.team_a || 'Team A'}
                    </div>
                    <div className="text-xl font-bold text-white font-mono tabular-nums mt-0.5">
                      {liveCricMatch.team_a_summary || '—'}
                    </div>
                  </div>
                  <div className="px-4 py-2.5 rounded-xl bg-black/35 border border-white/10 min-w-[155px]">
                    <div className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">
                      {liveCricMatch.team_b || 'Team B'}
                    </div>
                    <div className="text-xl font-bold text-white font-mono tabular-nums mt-0.5">
                      {liveCricMatch.team_b_summary || 'Yet to Bat'}
                    </div>
                  </div>
                </>
              ) : (
                <>
                  {snap?.teamAName && (
                    <div className="px-4 py-2.5 rounded-xl bg-black/35 border border-white/10 min-w-[150px]">
                      <div className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">
                        {snap.teamAName}
                      </div>
                      <div className="text-xl font-bold text-white font-mono tabular-nums mt-0.5">
                        {snap.teamAScore || '—'}
                        {snap.teamAOvers && (
                          <span className="text-xs text-zinc-400 font-normal ml-1.5">
                            ({snap.teamAOvers} ov)
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                  {snap?.teamBName && (
                    <div className="px-4 py-2.5 rounded-xl bg-black/35 border border-white/10 min-w-[150px]">
                      <div className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">
                        {snap.teamBName}
                      </div>
                      <div className="text-xl font-bold text-white font-mono tabular-nums mt-0.5">
                        {snap.teamBScore || 'Yet to Bat'}
                        {snap.teamBOvers && (
                          <span className="text-xs text-zinc-400 font-normal ml-1.5">
                            ({snap.teamBOvers} ov)
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* Real-Time Auto-Sync Controls + CricHeroes Launcher */}
          {parsedLinks.isValid && (
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              {stream.status === 'LIVE' && (
                <button
                  type="button"
                  onClick={() => setAutoSyncEnabled((v) => !v)}
                  className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                    autoSyncEnabled
                      ? 'bg-emerald-500/15 border-emerald-500/35 text-emerald-300'
                      : 'bg-white/5 border-white/10 text-zinc-400'
                  }`}
                >
                  <Radio className={`w-3.5 h-3.5 ${autoSyncEnabled ? 'animate-pulse' : ''}`} />
                  {autoSyncEnabled ? 'Auto-Sync 10s' : 'Auto-Sync Off'}
                </button>
              )}
              <button
                type="button"
                onClick={() => fetchCricHeroesMeta(activeSectionInfo.url || parsedLinks.baseUrl)}
                disabled={loadingMeta}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-semibold text-zinc-200 transition-colors whitespace-nowrap shrink-0"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loadingMeta ? 'animate-spin' : ''}`} />
                Sync Now
              </button>
              <a
                href={activeSectionInfo.url || parsedLinks.baseUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{ background: theme.buttonGradient, boxShadow: theme.glowShadow }}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-white text-xs font-bold transition-transform hover:scale-[1.02] whitespace-nowrap shrink-0"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                Open CricHeroes
              </a>
            </div>
          )}
        </div>
      </div>

      {/* JioHotstar-Style Segmented CricHeroes Section Bar */}
      <div className="px-4 sm:px-6 py-3 bg-[#090E1B] border-b border-white/10 flex items-center gap-2 overflow-x-auto no-scrollbar">
        {SECTION_TABS.map((tab) => {
          const isActive = activeSection === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveSection(tab.id)}
              style={
                isActive
                  ? { background: theme.buttonGradient, boxShadow: theme.glowShadow }
                  : undefined
              }
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all whitespace-nowrap shrink-0 ${
                isActive
                  ? 'text-white shadow-lg'
                  : 'bg-white/[0.04] hover:bg-white/[0.08] text-zinc-400 hover:text-white border border-white/5'
              }`}
            >
              {tab.icon}
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Active Section Workspace */}
      <div className="p-4 sm:p-6 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-white/5">
          <div>
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              {activeSectionInfo.label}
              {parsedLinks.tournamentId && (
                <span className="text-xs font-mono text-zinc-500">
                  #{parsedLinks.tournamentId}
                </span>
              )}
            </h3>
            <p className="text-xs text-zinc-400 mt-0.5">{activeSectionInfo.description}</p>
          </div>
          {parsedLinks.isValid && activeSectionInfo.url && (
            <div className="flex items-center gap-2 shrink-0">
              {!cricMeta?.iframeBlocked && (
                <button
                  type="button"
                  onClick={() => setShowEmbeddedFrame((prev) => !prev)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-semibold text-zinc-200 whitespace-nowrap shrink-0"
                >
                  <Globe className="w-3.5 h-3.5" />
                  {showEmbeddedFrame ? 'Show Native Stats View' : 'Embed CricHeroes Page'}
                </button>
              )}
              <a
                href={activeSectionInfo.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 border border-white/15 text-xs font-semibold text-white whitespace-nowrap shrink-0"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                Open {activeSectionInfo.label} on CricHeroes
              </a>
            </div>
          )}
        </div>

        {/* Calm notice when CricHeroes restricts automated server scraping */}
        {!linkedMatch && cricMeta?.protectedByCloudflare && (
          <div className="rounded-xl bg-amber-500/10 border border-amber-500/25 px-4 py-3 text-xs text-amber-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <span>
              CricHeroes restricts automated background page requests on this tournament link. Use the section tabs above to jump straight to any CricHeroes view, or link an active SM SPORTS Match for ball-by-ball telemetry below.
            </span>
            {activeSectionInfo.url && (
              <a
                href={activeSectionInfo.url}
                target="_blank"
                rel="noopener noreferrer"
                className="font-bold underline shrink-0"
              >
                Open Live Tab
              </a>
            )}
          </div>
        )}

        {showEmbeddedFrame && parsedLinks.isValid && activeSectionInfo.url ? (
          <div className="rounded-xl overflow-hidden border border-white/10 bg-black">
            <iframe
              src={activeSectionInfo.url}
              title={`CricHeroes - ${activeSectionInfo.label}`}
              className="w-full h-[540px] bg-white"
              loading="lazy"
            />
          </div>
        ) : (
          <>
            {/* SECTION 1: LIVE SCORECARD */}
            {activeSection === 'SCORECARD' && (
              <div className="space-y-5">
                {linkedMatch && currentInn ? (
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                    {/* Batting Table */}
                    <div className="rounded-xl bg-black/30 border border-white/10 overflow-hidden">
                      <div className="px-4 py-2.5 bg-white/[0.04] border-b border-white/10 flex items-center justify-between">
                        <span className="text-xs font-bold uppercase tracking-wider text-zinc-200">
                          Batters • Innings {linkedMatch.currentInnings}
                        </span>
                        <span className="text-xs font-mono tabular-nums text-cyan-300">
                          CRR {currentInn.currentRunRate?.toFixed(2) || '0.00'}
                        </span>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs">
                          <thead className="text-zinc-500 border-b border-white/5">
                            <tr>
                              <th className="py-2.5 px-4 font-semibold">Batter</th>
                              <th className="py-2.5 px-2 text-right font-semibold">R</th>
                              <th className="py-2.5 px-2 text-right font-semibold">B</th>
                              <th className="py-2.5 px-2 text-right font-semibold">4s</th>
                              <th className="py-2.5 px-2 text-right font-semibold">6s</th>
                              <th className="py-2.5 px-4 text-right font-semibold">SR</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-white/5">
                            {batsmenList.length > 0 ? (
                              batsmenList.map((bat) => {
                                const sr =
                                  bat.balls > 0
                                    ? ((bat.runs / bat.balls) * 100).toFixed(1)
                                    : '0.0';
                                return (
                                  <tr key={bat.playerId} className="hover:bg-white/[0.02]">
                                    <td className="py-2.5 px-4 font-semibold text-white">
                                      {bat.name}
                                      {bat.isStriker && (
                                        <span className="ml-1 text-amber-400">*</span>
                                      )}
                                      {bat.outBy && (
                                        <div className="text-[11px] font-normal text-zinc-500">
                                          {bat.outBy}
                                        </div>
                                      )}
                                    </td>
                                    <td className="py-2.5 px-2 text-right font-mono tabular-nums font-bold text-white">
                                      {bat.runs}
                                    </td>
                                    <td className="py-2.5 px-2 text-right font-mono tabular-nums text-zinc-300">
                                      {bat.balls}
                                    </td>
                                    <td className="py-2.5 px-2 text-right font-mono tabular-nums text-zinc-400">
                                      {bat.fours}
                                    </td>
                                    <td className="py-2.5 px-2 text-right font-mono tabular-nums text-zinc-400">
                                      {bat.sixes}
                                    </td>
                                    <td className="py-2.5 px-4 text-right font-mono tabular-nums text-cyan-300">
                                      {sr}
                                    </td>
                                  </tr>
                                );
                              })
                            ) : (
                              <tr>
                                <td colSpan={6} className="py-6 text-center text-zinc-500">
                                  Waiting for first ball to be bowled
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    {/* Bowling Table */}
                    <div className="rounded-xl bg-black/30 border border-white/10 overflow-hidden">
                      <div className="px-4 py-2.5 bg-white/[0.04] border-b border-white/10 flex items-center justify-between">
                        <span className="text-xs font-bold uppercase tracking-wider text-zinc-200">
                          Bowlers
                        </span>
                        <span className="text-xs font-mono tabular-nums text-zinc-400">
                          Extras:{' '}
                          {(currentInn.extras?.wides || 0) +
                            (currentInn.extras?.noBalls || 0) +
                            (currentInn.extras?.byes || 0) +
                            (currentInn.extras?.legByes || 0)}
                        </span>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs">
                          <thead className="text-zinc-500 border-b border-white/5">
                            <tr>
                              <th className="py-2.5 px-4 font-semibold">Bowler</th>
                              <th className="py-2.5 px-2 text-right font-semibold">O</th>
                              <th className="py-2.5 px-2 text-right font-semibold">M</th>
                              <th className="py-2.5 px-2 text-right font-semibold">R</th>
                              <th className="py-2.5 px-2 text-right font-semibold">W</th>
                              <th className="py-2.5 px-4 text-right font-semibold">ECON</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-white/5">
                            {bowlersList.length > 0 ? (
                              bowlersList.map((bowl) => {
                                const oversDecimal =
                                  Math.floor(bowl.ballsBowled / 6) +
                                  (bowl.ballsBowled % 6) / 10;
                                const econ =
                                  bowl.ballsBowled > 0
                                    ? (bowl.runsConceded / (bowl.ballsBowled / 6)).toFixed(2)
                                    : '0.00';
                                return (
                                  <tr key={bowl.playerId} className="hover:bg-white/[0.02]">
                                    <td className="py-2.5 px-4 font-semibold text-white">
                                      {bowl.name}
                                    </td>
                                    <td className="py-2.5 px-2 text-right font-mono tabular-nums text-zinc-300">
                                      {oversDecimal.toFixed(1)}
                                    </td>
                                    <td className="py-2.5 px-2 text-right font-mono tabular-nums text-zinc-400">
                                      {bowl.maidens}
                                    </td>
                                    <td className="py-2.5 px-2 text-right font-mono tabular-nums text-zinc-300">
                                      {bowl.runsConceded}
                                    </td>
                                    <td className="py-2.5 px-2 text-right font-mono tabular-nums font-bold text-amber-300">
                                      {bowl.wickets}
                                    </td>
                                    <td className="py-2.5 px-4 text-right font-mono tabular-nums text-cyan-300">
                                      {econ}
                                    </td>
                                  </tr>
                                );
                              })
                            ) : (
                              <tr>
                                <td colSpan={6} className="py-6 text-center text-zinc-500">
                                  No bowling spells recorded yet
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                ) : cricScoreInnings.length > 0 ? (
                  <div className="space-y-4">
                    {cricScoreInnings.map((inn: any, idx: number) => {
                      const bats: any[] = inn.batting || inn.batsmen || [];
                      const bowls: any[] = inn.bowling || inn.bowlers || [];
                      return (
                        <div
                          key={idx}
                          className="rounded-xl bg-black/30 border border-white/10 p-4 space-y-4"
                        >
                          <div className="flex items-center justify-between border-b border-white/10 pb-2">
                            <span className="text-sm font-bold text-white">
                              {inn.teamName || inn.team_name || `Innings ${idx + 1}`}
                            </span>
                            <span className="text-sm font-mono font-bold text-cyan-300 tabular-nums">
                              {inn.score || `${inn.total_runs ?? 0}/${inn.total_wicket ?? 0}`}
                            </span>
                          </div>
                          {bats.length > 0 && (
                            <div className="overflow-x-auto">
                              <table className="w-full text-left text-xs">
                                <thead className="text-zinc-500 border-b border-white/5">
                                  <tr>
                                    <th className="py-2 pr-4">Batter</th>
                                    <th className="py-2 px-2 text-right">R</th>
                                    <th className="py-2 px-2 text-right">B</th>
                                    <th className="py-2 px-2 text-right">4s</th>
                                    <th className="py-2 px-2 text-right">6s</th>
                                    <th className="py-2 pl-2 text-right">SR</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-white/5">
                                  {bats.map((b: any, bIdx: number) => (
                                    <tr key={bIdx}>
                                      <td className="py-2 pr-4 font-semibold text-white">
                                        {b.name || b.player_name}
                                        {b.out_string && (
                                          <div className="text-[11px] font-normal text-zinc-500">
                                            {b.out_string}
                                          </div>
                                        )}
                                      </td>
                                      <td className="py-2 px-2 text-right font-mono tabular-nums font-bold text-white">
                                        {b.runs ?? 0}
                                      </td>
                                      <td className="py-2 px-2 text-right font-mono tabular-nums text-zinc-300">
                                        {b.balls ?? 0}
                                      </td>
                                      <td className="py-2 px-2 text-right font-mono tabular-nums text-zinc-400">
                                        {b['4s'] ?? b.fours ?? 0}
                                      </td>
                                      <td className="py-2 px-2 text-right font-mono tabular-nums text-zinc-400">
                                        {b['6s'] ?? b.sixes ?? 0}
                                      </td>
                                      <td className="py-2 pl-2 text-right font-mono tabular-nums text-cyan-300">
                                        {b.strike_rate ?? b.SR ?? '—'}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}
                          {bowls.length > 0 && (
                            <div className="overflow-x-auto pt-2 border-t border-white/5">
                              <table className="w-full text-left text-xs">
                                <thead className="text-zinc-500 border-b border-white/5">
                                  <tr>
                                    <th className="py-2 pr-4">Bowler</th>
                                    <th className="py-2 px-2 text-right">O</th>
                                    <th className="py-2 px-2 text-right">M</th>
                                    <th className="py-2 px-2 text-right">R</th>
                                    <th className="py-2 px-2 text-right">W</th>
                                    <th className="py-2 pl-2 text-right">ECON</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-white/5">
                                  {bowls.map((bw: any, bwIdx: number) => (
                                    <tr key={bwIdx}>
                                      <td className="py-2 pr-4 font-semibold text-white">
                                        {bw.name || bw.player_name}
                                      </td>
                                      <td className="py-2 px-2 text-right font-mono tabular-nums text-zinc-300">
                                        {bw.overs ?? 0}
                                      </td>
                                      <td className="py-2 px-2 text-right font-mono tabular-nums text-zinc-400">
                                        {bw.maidens ?? 0}
                                      </td>
                                      <td className="py-2 px-2 text-right font-mono tabular-nums text-zinc-300">
                                        {bw.runs ?? 0}
                                      </td>
                                      <td className="py-2 px-2 text-right font-mono tabular-nums font-bold text-amber-300">
                                        {bw.wickets ?? 0}
                                      </td>
                                      <td className="py-2 pl-2 text-right font-mono tabular-nums text-cyan-300">
                                        {bw.economy_rate ?? bw.econ ?? '—'}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="rounded-xl bg-black/30 border border-white/10 p-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                    <div className="space-y-1.5">
                      <div className="text-xs font-bold uppercase tracking-wider text-cyan-300">
                        CricHeroes Live Scorecard Ready
                      </div>
                      <p className="text-sm text-zinc-300 max-w-2xl">
                        {cricMeta?.description ||
                          (parsedLinks.isValid
                            ? 'Access the complete batting card, bowling figures, fall of wickets, and live CricHeroes scorecard directly using the section launcher.'
                            : 'Super Admin has not attached a CricHeroes tournament link to this broadcast yet.')}
                      </p>
                    </div>
                    {parsedLinks.isValid && activeSectionInfo.url && (
                      <a
                        href={activeSectionInfo.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ background: theme.buttonGradient, boxShadow: theme.glowShadow }}
                        className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-white text-xs font-bold shrink-0 whitespace-nowrap"
                      >
                        <ExternalLink className="w-4 h-4" />
                        View Full Scorecard
                      </a>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* SECTION 2: COMMENTARY & RECENT BALLS */}
            {activeSection === 'LIVE_FEED' && (
              <div className="space-y-4">
                {linkedMatch && currentInn && currentInn.recentBalls?.length > 0 ? (
                  <div className="rounded-xl bg-black/30 border border-white/10 p-5 space-y-4">
                    <div className="text-xs font-bold uppercase tracking-wider text-zinc-300">
                      This Over & Recent Balls
                    </div>
                    <div className="flex flex-wrap gap-2.5">
                      {currentInn.recentBalls.slice(-18).map((b, idx) => {
                        let badgeStyle = 'bg-white/10 text-white border-white/15';
                        let label = String(b.runs);
                        if (b.isWicket) {
                          badgeStyle = 'bg-red-600 text-white border-red-400';
                          label = 'W';
                        } else if (b.runs === 6) {
                          badgeStyle = 'bg-amber-500 text-black border-amber-300 font-extrabold';
                        } else if (b.runs === 4) {
                          badgeStyle = 'bg-cyan-500 text-black border-cyan-300 font-extrabold';
                        } else if (b.isWide) {
                          label = `${b.runs || 0}Wd`;
                          badgeStyle = 'bg-purple-500/25 text-purple-200 border-purple-400/40';
                        } else if (b.isNoBall) {
                          label = `${b.runs || 0}Nb`;
                          badgeStyle = 'bg-purple-500/25 text-purple-200 border-purple-400/40';
                        }
                        return (
                          <div
                            key={`${b.overNumber}-${b.ballNumber}-${idx}`}
                            className={`w-10 h-10 rounded-xl border flex flex-col items-center justify-center font-mono text-xs tabular-nums ${badgeStyle}`}
                          >
                            <span>{label}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <div className="rounded-xl bg-black/30 border border-white/10 p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                      <h4 className="text-sm font-bold text-white">Ball-by-Ball Commentary</h4>
                      <p className="text-xs text-zinc-400 mt-1">
                        {parsedLinks.isValid
                          ? 'Open live ball-by-ball CricHeroes commentary feed in one tap.'
                          : 'Attach a CricHeroes tournament or SM SPORTS match to stream commentary.'}
                      </p>
                    </div>
                    {parsedLinks.isValid && (
                      <a
                        href={activeSectionInfo.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ background: theme.buttonGradient }}
                        className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-white text-xs font-bold shrink-0 whitespace-nowrap"
                      >
                        <ExternalLink className="w-4 h-4" />
                        Open Live Feed
                      </a>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* SECTION 3: POINTS TABLE */}
            {activeSection === 'POINTS_TABLE' && (
              <div className="space-y-4">
                {parsedPoints.length > 0 ? (
                  <div className="rounded-xl bg-black/30 border border-white/10 overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-white/[0.04] text-zinc-400 border-b border-white/10">
                        <tr>
                          <th className="py-3 px-4 font-semibold">#</th>
                          <th className="py-3 px-4 font-semibold">Team</th>
                          <th className="py-3 px-3 text-right font-semibold">M</th>
                          <th className="py-3 px-3 text-right font-semibold">W</th>
                          <th className="py-3 px-3 text-right font-semibold">L</th>
                          <th className="py-3 px-3 text-right font-semibold">NRR</th>
                          <th className="py-3 px-4 text-right font-semibold">PTS</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5">
                        {parsedPoints.map((row: any, idx: number) => (
                          <tr key={idx} className="hover:bg-white/[0.02]">
                            <td className="py-2.5 px-4 font-mono tabular-nums text-zinc-400">{idx + 1}</td>
                            <td className="py-2.5 px-4 font-semibold text-white">
                              {row.team_name || row.teamName || row.name || `Team ${idx + 1}`}
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono tabular-nums text-zinc-300">
                              {row.played ?? row.matches ?? 0}
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono tabular-nums text-emerald-400">
                              {row.won ?? row.win ?? 0}
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono tabular-nums text-rose-400">
                              {row.lost ?? row.loss ?? 0}
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono tabular-nums text-zinc-300">
                              {row.nrr ?? row.net_run_rate ?? '0.000'}
                            </td>
                            <td className="py-2.5 px-4 text-right font-mono tabular-nums font-bold text-amber-300">
                              {row.points ?? row.pts ?? 0}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="rounded-xl bg-black/30 border border-white/10 p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                      <h4 className="text-sm font-bold text-white">Tournament Standings & NRR</h4>
                      <p className="text-xs text-zinc-400 mt-1">
                        View updated group standings, points, and Net Run Rate directly from CricHeroes.
                      </p>
                    </div>
                    {parsedLinks.isValid && (
                      <a
                        href={activeSectionInfo.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ background: theme.buttonGradient }}
                        className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-white text-xs font-bold shrink-0 whitespace-nowrap"
                      >
                        <ExternalLink className="w-4 h-4" />
                        View Points Table
                      </a>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* SECTION 4: MATCHES */}
            {activeSection === 'MATCHES' && (
              <div className="space-y-4">
                {parsedMatches.length > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {parsedMatches.slice(0, 8).map((m: any, idx: number) => (
                      <div
                        key={m.match_id || idx}
                        className="rounded-xl bg-black/30 border border-white/10 p-4 space-y-2"
                      >
                        <div className="flex items-center justify-between text-[11px] text-zinc-400">
                          <span>{m.match_type || m.round_name || 'Match'}</span>
                          <span className="font-semibold text-cyan-300">
                            {m.status || m.match_status || ''}
                          </span>
                        </div>
                        <div className="text-sm font-bold text-white">
                          {m.team_a || m.teamAName || 'Team A'} vs{' '}
                          {m.team_b || m.teamBName || 'Team B'}
                        </div>
                        {(m.match_result || m.win_by) && (
                          <div className="text-xs text-amber-300">
                            {m.match_result || m.win_by}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-xl bg-black/30 border border-white/10 p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                      <h4 className="text-sm font-bold text-white">Tournament Schedule & Results</h4>
                      <p className="text-xs text-zinc-400 mt-1">
                        Browse live matches, upcoming fixtures, and finished tournament scores on CricHeroes.
                      </p>
                    </div>
                    {parsedLinks.isValid && (
                      <a
                        href={activeSectionInfo.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ background: theme.buttonGradient }}
                        className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-white text-xs font-bold shrink-0 whitespace-nowrap"
                      >
                        <ExternalLink className="w-4 h-4" />
                        Browse Matches
                      </a>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* SECTION 5: LEADERBOARD */}
            {activeSection === 'LEADERBOARD' && (
              <div className="space-y-4">
                {parsedLeaderboard &&
                (Array.isArray(parsedLeaderboard.batting) ||
                  Array.isArray(parsedLeaderboard.bowling) ||
                  Array.isArray(parsedLeaderboard)) ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {Array.isArray(parsedLeaderboard.batting || parsedLeaderboard) && (
                      <div className="rounded-xl bg-black/30 border border-white/10 p-4 space-y-2">
                        <div className="text-xs font-bold uppercase tracking-wider text-amber-300">
                          Top Run Scorers
                        </div>
                        {(parsedLeaderboard.batting || parsedLeaderboard)
                          .slice(0, 6)
                          .map((p: any, idx: number) => (
                            <div
                              key={idx}
                              className="flex items-center justify-between py-1.5 border-b border-white/5 last:border-0 text-xs"
                            >
                              <span className="text-white font-semibold">
                                {idx + 1}. {p.player_name || p.name}
                              </span>
                              <span className="font-mono tabular-nums font-bold text-cyan-300">
                                {p.runs ?? p.total_runs ?? 0} runs
                              </span>
                            </div>
                          ))}
                      </div>
                    )}
                    {Array.isArray(parsedLeaderboard.bowling) && (
                      <div className="rounded-xl bg-black/30 border border-white/10 p-4 space-y-2">
                        <div className="text-xs font-bold uppercase tracking-wider text-fuchsia-300">
                          Top Wicket Takers
                        </div>
                        {parsedLeaderboard.bowling.slice(0, 6).map((p: any, idx: number) => (
                          <div
                            key={idx}
                            className="flex items-center justify-between py-1.5 border-b border-white/5 last:border-0 text-xs"
                          >
                            <span className="text-white font-semibold">
                              {idx + 1}. {p.player_name || p.name}
                            </span>
                            <span className="font-mono tabular-nums font-bold text-amber-300">
                              {p.wickets ?? p.total_wickets ?? 0} wkts
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="rounded-xl bg-black/30 border border-white/10 p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                      <h4 className="text-sm font-bold text-white">
                        Top Batters, Top Bowlers & Tournament MVP
                      </h4>
                      <p className="text-xs text-zinc-400 mt-1">
                        Access live run-scoring leaders, wicket-taking rankings, and MVP standings on CricHeroes.
                      </p>
                    </div>
                    {parsedLinks.isValid && (
                      <a
                        href={activeSectionInfo.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ background: theme.buttonGradient }}
                        className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-white text-xs font-bold shrink-0 whitespace-nowrap"
                      >
                        <ExternalLink className="w-4 h-4" />
                        View Leaderboard
                      </a>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* SECTION 6: TEAMS */}
            {activeSection === 'TEAMS' && (
              <div className="space-y-4">
                {parsedTeams.length > 0 ? (
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                    {parsedTeams.map((t: any, idx: number) => (
                      <div
                        key={t.team_id || idx}
                        className="rounded-xl bg-black/30 border border-white/10 p-3.5 flex items-center gap-3"
                      >
                        <div className="w-9 h-9 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center shrink-0">
                          <Shield className="w-4 h-4 text-cyan-300" />
                        </div>
                        <span className="text-xs font-bold text-white truncate">
                          {t.team_name || t.name || `Team ${idx + 1}`}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-xl bg-black/30 border border-white/10 p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                      <h4 className="text-sm font-bold text-white">Participating Tournament Teams</h4>
                      <p className="text-xs text-zinc-400 mt-1">
                        Explore full team squads, captains, and roster details on CricHeroes.
                      </p>
                    </div>
                    {parsedLinks.isValid && (
                      <a
                        href={activeSectionInfo.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ background: theme.buttonGradient }}
                        className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-white text-xs font-bold shrink-0 whitespace-nowrap"
                      >
                        <ExternalLink className="w-4 h-4" />
                        View All Teams
                      </a>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* SECTION 7: CRICHEROES HUB ALL-CONTROLS DIRECTORY */}
            {activeSection === 'STATS' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {(Object.keys(parsedLinks.sections) as CricHeroesSectionId[]).map((key) => {
                  const sec = parsedLinks.sections[key];
                  return (
                    <a
                      key={key}
                      href={sec.url || parsedLinks.baseUrl || '#'}
                      target={sec.url ? '_blank' : undefined}
                      rel="noopener noreferrer"
                      className="rounded-xl bg-black/30 hover:bg-white/[0.06] border border-white/10 hover:border-cyan-400/40 p-4 flex items-start justify-between gap-3 transition-all group"
                    >
                      <div>
                        <div className="text-xs font-bold text-white group-hover:text-cyan-300 transition-colors">
                          {sec.label}
                        </div>
                        <p className="text-[11px] text-zinc-400 mt-1">{sec.description}</p>
                      </div>
                      <ExternalLink className="w-4 h-4 text-zinc-500 group-hover:text-cyan-300 shrink-0 mt-0.5" />
                    </a>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
};

export default CricHeroesScoreboardHub;
