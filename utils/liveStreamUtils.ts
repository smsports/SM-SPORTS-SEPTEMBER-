import { CricHeroesSectionId, PlayerGradientPreset } from '../types';

export interface GradientThemeConfig {
  id: PlayerGradientPreset;
  label: string;
  buttonGradient: string;
  timelineGradient: string;
  glowShadow: string;
  accentText: string;
  accentHex: string;
  secondaryHex: string;
}

export const GRADIENT_PRESETS: Record<PlayerGradientPreset, GradientThemeConfig> = {
  JIO_GOLD: {
    id: 'JIO_GOLD',
    label: 'JioGold & Electric Blue',
    buttonGradient: 'linear-gradient(135deg, #2563EB 0%, #06B6D4 52%, #F59E0B 100%)',
    timelineGradient: 'linear-gradient(90deg, #06B6D4 0%, #3B82F6 45%, #EC4899 78%, #F59E0B 100%)',
    glowShadow: '0 0 24px rgba(37, 99, 235, 0.55), 0 0 12px rgba(245, 158, 11, 0.35)',
    accentText: 'text-cyan-300',
    accentHex: '#06B6D4',
    secondaryHex: '#F59E0B',
  },
  CYBER_NEON: {
    id: 'CYBER_NEON',
    label: 'Cyber Violet & Cyan',
    buttonGradient: 'linear-gradient(135deg, #7C3AED 0%, #EC4899 50%, #06B6D4 100%)',
    timelineGradient: 'linear-gradient(90deg, #8B5CF6 0%, #EC4899 55%, #22D3EE 100%)',
    glowShadow: '0 0 24px rgba(236, 72, 153, 0.5)',
    accentText: 'text-fuchsia-300',
    accentHex: '#EC4899',
    secondaryHex: '#22D3EE',
  },
  CRIMSON_FIRE: {
    id: 'CRIMSON_FIRE',
    label: 'Crimson Stadium Gold',
    buttonGradient: 'linear-gradient(135deg, #E11D48 0%, #F97316 55%, #FACC15 100%)',
    timelineGradient: 'linear-gradient(90deg, #E11D48 0%, #F97316 50%, #FACC15 100%)',
    glowShadow: '0 0 24px rgba(225, 29, 72, 0.5)',
    accentText: 'text-amber-300',
    accentHex: '#F97316',
    secondaryHex: '#FACC15',
  },
  EMERALD_PULSE: {
    id: 'EMERALD_PULSE',
    label: 'Emerald & Aqua Pulse',
    buttonGradient: 'linear-gradient(135deg, #059669 0%, #10B981 50%, #06B6D4 100%)',
    timelineGradient: 'linear-gradient(90deg, #10B981 0%, #2DD4BF 50%, #38BDF8 100%)',
    glowShadow: '0 0 24px rgba(16, 185, 129, 0.5)',
    accentText: 'text-emerald-300',
    accentHex: '#10B981',
    secondaryHex: '#38BDF8',
  },
};

export function extractYouTubeVideoId(rawInput: string): string | null {
  if (!rawInput) return null;
  const trimmed = rawInput.trim();
  if (!trimmed) return null;

  // Bare 11-character video ID
  if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) {
    return trimmed;
  }

  try {
    const normalized = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    const url = new URL(normalized);
    const hostname = url.hostname.replace(/^www\./i, '').toLowerCase();

    if (hostname === 'youtu.be') {
      const id = url.pathname.split('/').filter(Boolean)[0];
      return id && /^[a-zA-Z0-9_-]{11}$/.test(id) ? id : id || null;
    }

    if (hostname.includes('youtube.com') || hostname.includes('youtube-nocookie.com')) {
      const vParam = url.searchParams.get('v');
      if (vParam) return vParam;

      const segments = url.pathname.split('/').filter(Boolean);
      const markerIndex = segments.findIndex((s) => ['live', 'embed', 'shorts', 'v', 'e'].includes(s.toLowerCase()));
      if (markerIndex !== -1 && segments[markerIndex + 1]) {
        return segments[markerIndex + 1];
      }
    }
  } catch {
    // Regex fallback for partial strings
    const match = trimmed.match(/(?:v=|\/live\/|\/embed\/|\/shorts\/|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
    if (match?.[1]) return match[1];
  }

  return null;
}

export function getYouTubeThumbnail(videoId?: string | null): string {
  if (!videoId) return '';
  return `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
}

export function formatStreamTime(totalSeconds: number): string {
  if (!Number.isFinite(totalSeconds) || totalSeconds < 0) return '00:00';
  const secs = Math.floor(totalSeconds);
  const hrs = Math.floor(secs / 3600);
  const mins = Math.floor((secs % 3600) / 60);
  const rem = secs % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  if (hrs > 0) return `${hrs}:${pad(mins)}:${pad(rem)}`;
  return `${pad(mins)}:${pad(rem)}`;
}

export interface ParsedCricHeroesLinks {
  isValid: boolean;
  baseUrl: string;
  tournamentId?: string;
  tournamentSlug?: string;
  tournamentTitle?: string;
  matchId?: string;
  matchTitle?: string;
  matchUrl?: string;
  sections: Record<CricHeroesSectionId, { label: string; url: string; description: string }>;
}

export function formatSlugTitle(slug?: string): string {
  if (!slug) return '';
  return slug
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .replace(/\bVs\b/g, 'vs')
    .trim();
}

export function parseCricHeroesUrl(rawUrl?: string, rawMatchUrl?: string): ParsedCricHeroesLinks {
  const cleanBase = (rawUrl || '').trim();
  const cleanMatch = (rawMatchUrl || '').trim();

  if (!cleanBase && !cleanMatch) {
    return {
      isValid: false,
      baseUrl: '',
      sections: {
        SCORECARD: { label: 'Live Scorecard', url: '', description: 'Full batting & bowling innings scorecard' },
        LIVE_FEED: { label: 'Live Matches', url: '', description: 'Live ongoing matches & commentary feed' },
        POINTS_TABLE: { label: 'Points Table', url: '', description: 'Standings, wins, losses & net run rate' },
        MATCHES: { label: 'Past & Fixtures', url: '', description: 'Upcoming fixtures & completed results' },
        LEADERBOARD: { label: 'Leaderboard', url: '', description: 'Top batters, bowlers & tournament MVP' },
        TEAMS: { label: 'Teams', url: '', description: 'Participating squads & franchise rosters' },
        STATS: { label: 'Tournament Stats', url: '', description: 'Tournament milestones, sixes & records' },
      },
    };
  }

  let normalizedBase = cleanBase || cleanMatch;
  if (!/^https?:\/\//i.test(normalizedBase)) {
    normalizedBase = `https://${normalizedBase}`;
  }

  let origin = 'https://cricheroes.com';
  let tournamentId: string | undefined;
  let tournamentSlug: string | undefined;
  let tournamentTitle: string | undefined;
  let tournamentRoot = normalizedBase;

  try {
    const parsed = new URL(normalizedBase);
    origin = `${parsed.protocol}//${parsed.host}`;
    const parts = parsed.pathname.split('/').filter(Boolean);

    const tIndex = parts.findIndex((p) => p === 'tournament-detail' || p === 'tournament');
    if (tIndex !== -1 && parts[tIndex + 1]) {
      tournamentId = parts[tIndex + 1];
      tournamentSlug = parts[tIndex + 2] || 'tournament';
      tournamentTitle = formatSlugTitle(tournamentSlug);
      tournamentRoot = `${origin}/${parts[tIndex]}/${tournamentId}/${tournamentSlug}`;
    }
  } catch {
    // keep normalizedBase
  }

  const normalizedMatch = cleanMatch
    ? /^https?:\/\//i.test(cleanMatch)
      ? cleanMatch
      : `https://${cleanMatch}`
    : undefined;

  let matchId: string | undefined;
  let matchTitle: string | undefined;
  const matchSource = normalizedMatch || normalizedBase;
  try {
    const mp = new URL(matchSource).pathname.split('/').filter(Boolean);
    const mIdx = mp.findIndex((p) => ['scorecard', 'live', 'match-detail'].includes(p));
    if (mIdx !== -1 && mp[mIdx + 1]) {
      matchId = mp[mIdx + 1];
      if (mp[mIdx + 2] && !['live', 'scorecard', 'info', 'commentary'].includes(mp[mIdx + 2].toLowerCase())) {
        matchTitle = formatSlugTitle(mp[mIdx + 2]);
      }
    }
  } catch {
    // ignore
  }

  const makeTournamentTabUrl = (tabPath: string) => {
    if (tournamentId && tournamentSlug) {
      return `${tournamentRoot}/${tabPath}`;
    }
    return normalizedBase;
  };

  const matchScorecardUrl = normalizedMatch
    ? normalizedMatch.includes('/scorecard')
      ? normalizedMatch
      : `${normalizedMatch.replace(/\/+$/, '')}/scorecard`
    : makeTournamentTabUrl('matches/live-matches');

  const liveFeedUrl = normalizedMatch
    ? `${normalizedMatch.replace(/\/+$/, '')}/live`
    : makeTournamentTabUrl('matches/live-matches');

  return {
    isValid: true,
    baseUrl: normalizedBase,
    tournamentId,
    tournamentSlug,
    tournamentTitle,
    matchId,
    matchTitle,
    matchUrl: normalizedMatch,
    sections: {
      SCORECARD: {
        label: 'Live Scorecard',
        url: matchScorecardUrl,
        description: 'Batting, bowling, extras & fall of wickets',
      },
      LIVE_FEED: {
        label: 'Live Matches',
        url: liveFeedUrl,
        description: 'Ongoing match tracker & live commentary',
      },
      POINTS_TABLE: {
        label: 'Points Table',
        url: makeTournamentTabUrl('point-table'),
        description: 'League standings, points & Net Run Rate',
      },
      MATCHES: {
        label: 'Matches',
        url: makeTournamentTabUrl('matches/past-matches'),
        description: 'Live, upcoming & completed match center',
      },
      LEADERBOARD: {
        label: 'Leaderboard',
        url: makeTournamentTabUrl('leaderboard'),
        description: 'Most runs, most wickets & MVP rankings',
      },
      TEAMS: {
        label: 'Teams',
        url: makeTournamentTabUrl('matches/teams'),
        description: 'Franchise teams & player rosters',
      },
      STATS: {
        label: 'Stats',
        url: makeTournamentTabUrl('stats'),
        description: 'Boundary leaders, strike rates & economy',
      },
    },
  };
}
