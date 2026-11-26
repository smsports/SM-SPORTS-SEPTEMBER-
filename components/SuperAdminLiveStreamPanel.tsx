import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Calendar,
  CheckCircle2,
  Edit,
  ExternalLink,
  Film,
  Link2,
  Lock,
  Palette,
  Play,
  Plus,
  Radio,
  Save,
  Trash2,
  Trophy,
  Tv,
  X,
} from 'lucide-react';
import { db } from '../firebase';
import {
  LiveScoreSnapshot,
  LiveStreamItem,
  LiveStreamSettings,
  LiveStreamStatus,
  Match,
  PlayerGradientPreset,
  StreamVisibility,
} from '../types';
import {
  extractYouTubeVideoId,
  getYouTubeThumbnail,
  GRADIENT_PRESETS,
} from '../utils/liveStreamUtils';

const DEFAULT_FALLBACK_TITLE = 'No Live Broadcast On Air Right Now';
const DEFAULT_FALLBACK_SUBTITLE =
  'Check upcoming fixtures below or follow live tournament scores on SM SPORTS.';

interface StreamDraft {
  id?: string;
  title: string;
  subtitle: string;
  tournamentName: string;
  youtubeUrl: string;
  streamVisibility: StreamVisibility;
  status: LiveStreamStatus;
  scheduledAt: string;
  cricHeroesUrl: string;
  cricHeroesMatchUrl: string;
  linkedMatchId: string;
  playerGradientPreset: PlayerGradientPreset;
  isFeatured: boolean;
  scoreSnapshot: LiveScoreSnapshot;
}

const emptyDraft = (): StreamDraft => ({
  title: '',
  subtitle: '',
  tournamentName: '',
  youtubeUrl: '',
  streamVisibility: 'PUBLIC',
  status: 'LIVE',
  scheduledAt: '',
  cricHeroesUrl: '',
  cricHeroesMatchUrl: '',
  linkedMatchId: '',
  playerGradientPreset: 'JIO_GOLD',
  isFeatured: true,
  scoreSnapshot: {
    teamAName: '',
    teamAScore: '',
    teamAOvers: '',
    teamBName: '',
    teamBScore: '',
    teamBOvers: '',
    statusNote: '',
    venue: '',
  },
});

const SuperAdminLiveStreamPanel: React.FC = () => {
  const [settings, setSettings] = useState<LiveStreamSettings>({
    noLiveFallbackTitle: DEFAULT_FALLBACK_TITLE,
    noLiveFallbackSubtitle: DEFAULT_FALLBACK_SUBTITLE,
    streams: [],
    updatedAt: 0,
  });
  const [fallbackTitle, setFallbackTitle] = useState(DEFAULT_FALLBACK_TITLE);
  const [fallbackSubtitle, setFallbackSubtitle] = useState(DEFAULT_FALLBACK_SUBTITLE);
  const [draft, setDraft] = useState<StreamDraft>(emptyDraft());
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; msg: string } | null>(null);
  const [matches, setMatches] = useState<Match[]>([]);

  useEffect(() => {
    const unsubStreams = db
      .collection('appConfig')
      .doc('liveStreams')
      .onSnapshot((doc) => {
        if (doc.exists) {
          const data = doc.data() as Partial<LiveStreamSettings>;
          const loadedTitle = data.noLiveFallbackTitle || DEFAULT_FALLBACK_TITLE;
          const loadedSub = data.noLiveFallbackSubtitle || DEFAULT_FALLBACK_SUBTITLE;
          setSettings({
            noLiveFallbackTitle: loadedTitle,
            noLiveFallbackSubtitle: loadedSub,
            streams: Array.isArray(data.streams) ? data.streams : [],
            updatedAt: data.updatedAt || Date.now(),
          });
          setFallbackTitle(loadedTitle);
          setFallbackSubtitle(loadedSub);
        }
      });

    const unsubMatches = db
      .collection('matches')
      .orderBy('createdAt', 'desc')
      .limit(30)
      .onSnapshot(
        (snap) => {
          setMatches(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Match)));
        },
        () => {}
      );

    return () => {
      unsubStreams();
      unsubMatches();
    };
  }, []);

  const notify = (type: 'ok' | 'err', msg: string) => {
    setFeedback({ type, msg });
    window.setTimeout(() => {
      setFeedback((prev) => (prev?.msg === msg ? null : prev));
    }, 4500);
  };

  const persistSettings = async (next: LiveStreamSettings, successMsg: string) => {
    setSaving(true);
    try {
      await db.collection('appConfig').doc('liveStreams').set(next, { merge: true });
      notify('ok', successMsg);
    } catch (err: any) {
      notify('err', err?.message || 'Failed to save live stream configuration.');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveFallback = async (e: React.FormEvent) => {
    e.preventDefault();
    const next: LiveStreamSettings = {
      ...settings,
      noLiveFallbackTitle: fallbackTitle.trim() || DEFAULT_FALLBACK_TITLE,
      noLiveFallbackSubtitle: fallbackSubtitle.trim(),
      updatedAt: Date.now(),
    };
    await persistSettings(next, 'Offline standby title saved.');
  };

  const handleSaveStream = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft.title.trim()) {
      notify('err', 'Please enter a stream title.');
      return;
    }
    if (!draft.youtubeUrl.trim()) {
      notify('err', 'Please paste a YouTube live, unlisted, or private stream link.');
      return;
    }
    const videoId = extractYouTubeVideoId(draft.youtubeUrl);
    if (!videoId) {
      notify('err', 'Could not detect a valid YouTube video ID from that link.');
      return;
    }

    const now = Date.now();
    const existing = draft.id ? settings.streams.find((s) => s.id === draft.id) : undefined;
    const item: LiveStreamItem = {
      id: draft.id || `stream_${now}_${Math.random().toString(36).slice(2, 6)}`,
      title: draft.title.trim(),
      subtitle: draft.subtitle.trim(),
      tournamentName: draft.tournamentName.trim() || 'SM SPORTS Official',
      youtubeUrl: draft.youtubeUrl.trim(),
      youtubeVideoId: videoId,
      streamVisibility: draft.streamVisibility,
      status: draft.status,
      scheduledAt: draft.scheduledAt.trim(),
      cricHeroesUrl: draft.cricHeroesUrl.trim(),
      cricHeroesMatchUrl: draft.cricHeroesMatchUrl.trim(),
      linkedMatchId: draft.linkedMatchId,
      playerGradientPreset: draft.playerGradientPreset,
      isFeatured: draft.isFeatured,
      scoreSnapshot: {
        teamAName: draft.scoreSnapshot.teamAName?.trim() || '',
        teamAScore: draft.scoreSnapshot.teamAScore?.trim() || '',
        teamAOvers: draft.scoreSnapshot.teamAOvers?.trim() || '',
        teamBName: draft.scoreSnapshot.teamBName?.trim() || '',
        teamBScore: draft.scoreSnapshot.teamBScore?.trim() || '',
        teamBOvers: draft.scoreSnapshot.teamBOvers?.trim() || '',
        statusNote: draft.scoreSnapshot.statusNote?.trim() || '',
        venue: draft.scoreSnapshot.venue?.trim() || '',
      },
      createdAt: existing?.createdAt || now,
      updatedAt: now,
    };

    const nextStreams = existing
      ? settings.streams.map((s) => (s.id === existing.id ? item : s))
      : [item, ...settings.streams];

    await persistSettings(
      {
        ...settings,
        noLiveFallbackTitle: fallbackTitle.trim() || DEFAULT_FALLBACK_TITLE,
        noLiveFallbackSubtitle: fallbackSubtitle.trim(),
        streams: nextStreams,
        updatedAt: now,
      },
      existing ? 'Broadcast updated.' : 'Broadcast added to Live Center.'
    );

    setDraft(emptyDraft());
    setIsEditing(false);
  };

  const handleEditStream = (s: LiveStreamItem) => {
    setDraft({
      id: s.id,
      title: s.title,
      subtitle: s.subtitle || '',
      tournamentName: s.tournamentName || '',
      youtubeUrl: s.youtubeUrl || '',
      streamVisibility: s.streamVisibility || 'PUBLIC',
      status: s.status || 'LIVE',
      scheduledAt: s.scheduledAt || '',
      cricHeroesUrl: s.cricHeroesUrl || '',
      cricHeroesMatchUrl: s.cricHeroesMatchUrl || '',
      linkedMatchId: s.linkedMatchId || '',
      playerGradientPreset: s.playerGradientPreset || 'JIO_GOLD',
      isFeatured: Boolean(s.isFeatured),
      scoreSnapshot: {
        teamAName: s.scoreSnapshot?.teamAName || '',
        teamAScore: s.scoreSnapshot?.teamAScore || '',
        teamAOvers: s.scoreSnapshot?.teamAOvers || '',
        teamBName: s.scoreSnapshot?.teamBName || '',
        teamBScore: s.scoreSnapshot?.teamBScore || '',
        teamBOvers: s.scoreSnapshot?.teamBOvers || '',
        statusNote: s.scoreSnapshot?.statusNote || '',
        venue: s.scoreSnapshot?.venue || '',
      },
    });
    setIsEditing(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleQuickStatus = async (id: string, status: LiveStreamStatus) => {
    const nextStreams = settings.streams.map((s) =>
      s.id === id ? { ...s, status, updatedAt: Date.now() } : s
    );
    await persistSettings(
      { ...settings, streams: nextStreams, updatedAt: Date.now() },
      `Stream marked ${status}.`
    );
  };

  const handleDeleteStream = async (id: string) => {
    const nextStreams = settings.streams.filter((s) => s.id !== id);
    await persistSettings(
      { ...settings, streams: nextStreams, updatedAt: Date.now() },
      'Stream removed.'
    );
  };

  const sortedStreams = [...settings.streams].sort((a, b) => {
    const rank: Record<LiveStreamStatus, number> = { LIVE: 0, UPCOMING: 1, ENDED: 2 };
    if (rank[a.status] !== rank[b.status]) return rank[a.status] - rank[b.status];
    return (b.updatedAt || 0) - (a.updatedAt || 0);
  });

  const previewVideoId = extractYouTubeVideoId(draft.youtubeUrl);

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Header Row */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black uppercase tracking-tighter flex items-center gap-3">
            <Radio className="w-6 h-6 text-red-500" />
            Live Stream OTT Control
          </h2>
          <p className="text-xs text-zinc-400 mt-1">
            Manage ongoing YouTube streams (public, unlisted, or private links), upcoming fixtures, offline title, and CricHeroes tournament scoreboards.
          </p>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <Link
            to="/live"
            target="_blank"
            className="px-4 py-2.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-white/10 text-xs font-bold uppercase tracking-wider inline-flex items-center gap-2 transition-colors"
          >
            <ExternalLink className="w-4 h-4 text-cyan-400" />
            Preview /live
          </Link>
          <button
            type="button"
            onClick={() => {
              setDraft(emptyDraft());
              setIsEditing((prev) => !prev);
            }}
            className="px-5 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-black uppercase tracking-wider inline-flex items-center gap-2 transition-colors"
          >
            {isEditing ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
            {isEditing ? 'Close Editor' : 'Add Live Stream'}
          </button>
        </div>
      </div>

      {feedback && (
        <div
          className={`p-4 rounded-2xl border text-xs font-bold flex items-center gap-2 ${
            feedback.type === 'ok'
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
              : 'bg-red-500/10 border-red-500/30 text-red-300'
          }`}
        >
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{feedback.msg}</span>
        </div>
      )}

      {/* Offline / No Live Video Fallback Settings */}
      <form
        onSubmit={handleSaveFallback}
        className="bg-zinc-900/40 border border-white/10 rounded-3xl p-6 space-y-4"
      >
        <div className="flex items-center justify-between gap-4">
          <div>
            <h3 className="text-sm font-black uppercase tracking-wider text-white flex items-center gap-2">
              <Tv className="w-4 h-4 text-amber-400" />
              No-Live-Video Standby Title
            </h3>
            <p className="text-xs text-zinc-500 mt-0.5">
              Shown on the Live Broadcast page whenever no stream is marked LIVE.
            </p>
          </div>
          <button
            type="submit"
            disabled={saving}
            className="px-5 py-2.5 rounded-xl bg-white text-black hover:bg-cyan-400 text-xs font-black uppercase tracking-wider inline-flex items-center gap-2 transition-colors shrink-0 disabled:opacity-50"
          >
            <Save className="w-3.5 h-3.5" />
            Save Title
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-widest text-zinc-400 mb-1.5">
              Fallback Title (When No Live Video)
            </label>
            <input
              type="text"
              value={fallbackTitle}
              onChange={(e) => setFallbackTitle(e.target.value)}
              placeholder="e.g. No Live Match On Air — Next Broadcast Soon"
              className="w-full bg-black border border-white/10 rounded-xl px-4 py-3 text-sm font-semibold text-white outline-none focus:border-cyan-500"
            />
          </div>
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-widest text-zinc-400 mb-1.5">
              Fallback Subtitle
            </label>
            <input
              type="text"
              value={fallbackSubtitle}
              onChange={(e) => setFallbackSubtitle(e.target.value)}
              placeholder="Check upcoming fixtures below..."
              className="w-full bg-black border border-white/10 rounded-xl px-4 py-3 text-sm text-zinc-200 outline-none focus:border-cyan-500"
            />
          </div>
        </div>
      </form>

      {/* Add / Edit Stream Modal/Panel */}
      {isEditing && (
        <form
          onSubmit={handleSaveStream}
          className="bg-zinc-900/60 border border-cyan-500/30 rounded-3xl p-6 sm:p-8 space-y-6"
        >
          <div className="flex items-center justify-between border-b border-white/10 pb-4">
            <h3 className="text-lg font-black uppercase tracking-tight text-white">
              {draft.id ? 'Edit Broadcast Stream' : 'New Broadcast Stream'}
            </h3>
            <button
              type="button"
              onClick={() => setIsEditing(false)}
              className="text-zinc-500 hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-widest text-zinc-400 mb-1.5">
                Stream Title *
              </label>
              <input
                required
                type="text"
                value={draft.title}
                onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                placeholder="e.g. Royal Challengers vs Strikers - Final"
                className="w-full bg-black border border-white/10 rounded-xl px-4 py-3 text-sm font-semibold text-white outline-none focus:border-cyan-500"
              />
            </div>

            <div>
              <label className="block text-[10px] font-bold uppercase tracking-widest text-zinc-400 mb-1.5">
                Tournament Name *
              </label>
              <input
                required
                type="text"
                value={draft.tournamentName}
                onChange={(e) => setDraft({ ...draft, tournamentName: e.target.value })}
                placeholder="e.g. SM Premier League Season 4"
                className="w-full bg-black border border-white/10 rounded-xl px-4 py-3 text-sm font-semibold text-white outline-none focus:border-cyan-500"
              />
            </div>

            <div>
              <label className="block text-[10px] font-bold uppercase tracking-widest text-zinc-400 mb-1.5">
                Broadcast Status
              </label>
              <div className="grid grid-cols-3 gap-2">
                {(['LIVE', 'UPCOMING', 'ENDED'] as LiveStreamStatus[]).map((st) => (
                  <button
                    key={st}
                    type="button"
                    onClick={() => setDraft({ ...draft, status: st })}
                    className={`py-3 rounded-xl text-xs font-black uppercase tracking-wider border transition-all ${
                      draft.status === st
                        ? st === 'LIVE'
                          ? 'bg-red-600 border-red-500 text-white'
                          : st === 'UPCOMING'
                          ? 'bg-amber-500 border-amber-400 text-black'
                          : 'bg-zinc-700 border-zinc-500 text-white'
                        : 'bg-black border-white/10 text-zinc-400 hover:text-white'
                    }`}
                  >
                    {st}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-bold uppercase tracking-widest text-zinc-400 mb-1.5">
                Schedule Date / Time (for Upcoming)
              </label>
              <input
                type="text"
                value={draft.scheduledAt}
                onChange={(e) => setDraft({ ...draft, scheduledAt: e.target.value })}
                placeholder="e.g. Today, 7:30 PM IST"
                className="w-full bg-black border border-white/10 rounded-xl px-4 py-3 text-sm text-white outline-none focus:border-cyan-500"
              />
            </div>
          </div>

          {/* YouTube Stream URL + Private/Unlisted Visibility */}
          <div className="p-5 rounded-2xl bg-black/50 border border-white/10 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="text-xs font-black uppercase tracking-wider text-white flex items-center gap-2">
                <Play className="w-4 h-4 text-red-500" />
                YouTube Live / Private Stream Source
              </div>
              {previewVideoId && (
                <span className="text-[11px] font-mono text-emerald-400">
                  Detected Video ID: {previewVideoId}
                </span>
              )}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <div className="lg:col-span-2">
                <label className="block text-[10px] font-bold uppercase tracking-widest text-zinc-400 mb-1.5">
                  Paste YouTube Public, Unlisted, or Private Stream Link *
                </label>
                <input
                  required
                  type="text"
                  value={draft.youtubeUrl}
                  onChange={(e) => setDraft({ ...draft, youtubeUrl: e.target.value })}
                  placeholder="https://www.youtube.com/watch?v=... or https://youtube.com/live/..."
                  className="w-full bg-zinc-950 border border-white/10 rounded-xl px-4 py-3 text-sm text-white outline-none focus:border-cyan-500"
                />
                <p className="text-[11px] text-zinc-500 mt-1.5">
                  Tip: For seamless inline website playback without requiring viewer YouTube login, set the stream to Unlisted with &quot;Allow embedding&quot; enabled. Private stream links pasted here also play inline for authorized sessions or offer direct private YouTube access.
                </p>
              </div>

              <div>
                <label className="block text-[10px] font-bold uppercase tracking-widest text-zinc-400 mb-1.5">
                  Stream Access Type
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {(['PUBLIC', 'UNLISTED', 'PRIVATE'] as StreamVisibility[]).map((vis) => (
                    <button
                      key={vis}
                      type="button"
                      onClick={() => setDraft({ ...draft, streamVisibility: vis })}
                      className={`py-3 rounded-xl text-[10px] font-black uppercase tracking-wider border transition-all ${
                        draft.streamVisibility === vis
                          ? 'bg-cyan-600 border-cyan-400 text-white'
                          : 'bg-zinc-950 border-white/10 text-zinc-400'
                      }`}
                    >
                      {vis}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* CricHeroes Tournament & Scoreboard Links */}
          <div className="p-5 rounded-2xl bg-black/50 border border-white/10 space-y-4">
            <div className="text-xs font-black uppercase tracking-wider text-white flex items-center gap-2">
              <Trophy className="w-4 h-4 text-amber-400" />
              CricHeroes Tournament & Scoreboard Integration
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-widest text-zinc-400 mb-1.5">
                  CricHeroes Tournament Link
                </label>
                <input
                  type="url"
                  value={draft.cricHeroesUrl}
                  onChange={(e) => setDraft({ ...draft, cricHeroesUrl: e.target.value })}
                  placeholder="https://cricheroes.com/tournament/123456/Tournament-Name"
                  className="w-full bg-zinc-950 border border-white/10 rounded-xl px-4 py-3 text-sm text-white outline-none focus:border-amber-400"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold uppercase tracking-widest text-zinc-400 mb-1.5">
                  CricHeroes Active Match Scorecard Link (Optional)
                </label>
                <input
                  type="url"
                  value={draft.cricHeroesMatchUrl}
                  onChange={(e) => setDraft({ ...draft, cricHeroesMatchUrl: e.target.value })}
                  placeholder="https://cricheroes.com/scorecard/..."
                  className="w-full bg-zinc-950 border border-white/10 rounded-xl px-4 py-3 text-sm text-white outline-none focus:border-amber-400"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold uppercase tracking-widest text-zinc-400 mb-1.5">
                  Link SM SPORTS Live Scoring Match (Optional)
                </label>
                <select
                  value={draft.linkedMatchId}
                  onChange={(e) => setDraft({ ...draft, linkedMatchId: e.target.value })}
                  className="w-full bg-zinc-950 border border-white/10 rounded-xl px-4 py-3 text-sm text-white outline-none focus:border-cyan-500"
                >
                  <option value="">None (Use CricHeroes / Quick Score)</option>
                  {matches.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.teamAName} vs {m.teamBName} ({m.status})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-bold uppercase tracking-widest text-zinc-400 mb-1.5 flex items-center gap-1.5">
                  <Palette className="w-3.5 h-3.5 text-cyan-400" />
                  Player Gradient Theme (Play / Pause / Timeline)
                </label>
                <select
                  value={draft.playerGradientPreset}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      playerGradientPreset: e.target.value as PlayerGradientPreset,
                    })
                  }
                  className="w-full bg-zinc-950 border border-white/10 rounded-xl px-4 py-3 text-sm text-white outline-none focus:border-cyan-500"
                >
                  {Object.values(GRADIENT_PRESETS).map((preset) => (
                    <option key={preset.id} value={preset.id}>
                      {preset.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Optional Quick Live Score Snapshot Overlay */}
            <div className="pt-3 border-t border-white/5 space-y-3">
              <div className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">
                Quick Live Score Display Below Video (Optional)
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                <input
                  type="text"
                  placeholder="Team A Name"
                  value={draft.scoreSnapshot.teamAName || ''}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      scoreSnapshot: { ...draft.scoreSnapshot, teamAName: e.target.value },
                    })
                  }
                  className="bg-zinc-950 border border-white/10 rounded-xl px-3 py-2 text-xs text-white"
                />
                <input
                  type="text"
                  placeholder="Score (e.g. 142/3)"
                  value={draft.scoreSnapshot.teamAScore || ''}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      scoreSnapshot: { ...draft.scoreSnapshot, teamAScore: e.target.value },
                    })
                  }
                  className="bg-zinc-950 border border-white/10 rounded-xl px-3 py-2 text-xs text-white"
                />
                <input
                  type="text"
                  placeholder="Overs (e.g. 14.2)"
                  value={draft.scoreSnapshot.teamAOvers || ''}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      scoreSnapshot: { ...draft.scoreSnapshot, teamAOvers: e.target.value },
                    })
                  }
                  className="bg-zinc-950 border border-white/10 rounded-xl px-3 py-2 text-xs text-white"
                />
                <input
                  type="text"
                  placeholder="Team B Name"
                  value={draft.scoreSnapshot.teamBName || ''}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      scoreSnapshot: { ...draft.scoreSnapshot, teamBName: e.target.value },
                    })
                  }
                  className="bg-zinc-950 border border-white/10 rounded-xl px-3 py-2 text-xs text-white"
                />
                <input
                  type="text"
                  placeholder="Score / Target"
                  value={draft.scoreSnapshot.teamBScore || ''}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      scoreSnapshot: { ...draft.scoreSnapshot, teamBScore: e.target.value },
                    })
                  }
                  className="bg-zinc-950 border border-white/10 rounded-xl px-3 py-2 text-xs text-white"
                />
                <input
                  type="text"
                  placeholder="Status Note (e.g. Need 32 in 18)"
                  value={draft.scoreSnapshot.statusNote || ''}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      scoreSnapshot: { ...draft.scoreSnapshot, statusNote: e.target.value },
                    })
                  }
                  className="bg-zinc-950 border border-white/10 rounded-xl px-3 py-2 text-xs text-white"
                />
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-4">
            <label className="inline-flex items-center gap-2.5 text-xs font-semibold text-zinc-300 cursor-pointer">
              <input
                type="checkbox"
                checked={draft.isFeatured}
                onChange={(e) => setDraft({ ...draft, isFeatured: e.target.checked })}
                className="w-4 h-4 rounded accent-red-600"
              />
              Autoplay as Primary Featured Stream on /live
            </label>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setIsEditing(false)}
                className="px-5 py-3 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-xs font-bold uppercase tracking-wider text-zinc-200"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                style={{ background: GRADIENT_PRESETS[draft.playerGradientPreset].buttonGradient }}
                className="px-7 py-3 rounded-xl text-white text-xs font-black uppercase tracking-wider shadow-lg disabled:opacity-50"
              >
                {saving ? 'Saving...' : draft.id ? 'Update Broadcast' : 'Publish Broadcast'}
              </button>
            </div>
          </div>
        </form>
      )}

      {/* Configured Streams List */}
      <div className="space-y-4">
        <div className="text-xs font-black uppercase tracking-widest text-zinc-400">
          Configured Broadcasts ({sortedStreams.length})
        </div>

        {sortedStreams.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-white/10 bg-zinc-900/20 p-12 text-center space-y-3">
            <Tv className="w-10 h-10 text-zinc-700 mx-auto" />
            <p className="text-sm font-semibold text-zinc-400">
              No streams added yet. Click &quot;Add Live Stream&quot; to publish a live, upcoming, or private YouTube stream with a CricHeroes scoreboard.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4">
            {sortedStreams.map((stream) => {
              const vid = stream.youtubeVideoId || extractYouTubeVideoId(stream.youtubeUrl);
              const thumb = getYouTubeThumbnail(vid);
              const preset = GRADIENT_PRESETS[stream.playerGradientPreset || 'JIO_GOLD'];

              return (
                <div
                  key={stream.id}
                  className="bg-zinc-900/40 border border-white/10 rounded-3xl p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-5"
                >
                  <div className="flex items-center gap-4 min-w-0">
                    <div className="w-32 aspect-video rounded-xl bg-black border border-white/10 overflow-hidden shrink-0 relative">
                      {thumb ? (
                        <img
                          src={thumb}
                          alt={stream.title}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <Film className="w-6 h-6 text-zinc-700" />
                        </div>
                      )}
                      <span
                        className="absolute bottom-1 left-1 right-1 h-1 rounded-full"
                        style={{ background: preset.timelineGradient }}
                      />
                    </div>

                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`px-2.5 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider ${
                            stream.status === 'LIVE'
                              ? 'bg-red-600 text-white'
                              : stream.status === 'UPCOMING'
                              ? 'bg-amber-400 text-black'
                              : 'bg-zinc-800 text-zinc-300'
                          }`}
                        >
                          {stream.status}
                        </span>
                        {stream.streamVisibility !== 'PUBLIC' && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-white/10 text-zinc-200 text-[10px] font-bold uppercase">
                            <Lock className="w-3 h-3" />
                            {stream.streamVisibility}
                          </span>
                        )}
                        <span className="text-xs font-semibold text-cyan-400 truncate">
                          {stream.tournamentName}
                        </span>
                      </div>
                      <h4 className="text-base font-black text-white truncate">
                        {stream.title}
                      </h4>
                      <div className="flex flex-wrap items-center gap-4 text-[11px] text-zinc-400">
                        {stream.scheduledAt && (
                          <span className="inline-flex items-center gap-1">
                            <Calendar className="w-3.5 h-3.5" />
                            {stream.scheduledAt}
                          </span>
                        )}
                        {stream.cricHeroesUrl && (
                          <a
                            href={stream.cricHeroesUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-amber-400 hover:underline"
                          >
                            <Link2 className="w-3.5 h-3.5" />
                            CricHeroes Attached
                          </a>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    {stream.status !== 'LIVE' && (
                      <button
                        type="button"
                        onClick={() => handleQuickStatus(stream.id, 'LIVE')}
                        className="px-3.5 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-bold whitespace-nowrap"
                      >
                        Go Live
                      </button>
                    )}
                    {stream.status !== 'UPCOMING' && (
                      <button
                        type="button"
                        onClick={() => handleQuickStatus(stream.id, 'UPCOMING')}
                        className="px-3.5 py-2 rounded-xl bg-zinc-800 hover:bg-amber-500 hover:text-black text-zinc-200 text-xs font-bold whitespace-nowrap"
                      >
                        Set Upcoming
                      </button>
                    )}
                    {stream.status === 'LIVE' && (
                      <button
                        type="button"
                        onClick={() => handleQuickStatus(stream.id, 'ENDED')}
                        className="px-3.5 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-bold whitespace-nowrap"
                      >
                        End
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => handleEditStream(stream)}
                      className="p-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300"
                      title="Edit stream"
                    >
                      <Edit className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteStream(stream.id)}
                      className="p-2.5 rounded-xl bg-zinc-800 hover:bg-red-600 text-zinc-300 hover:text-white"
                      title="Delete stream"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default SuperAdminLiveStreamPanel;
