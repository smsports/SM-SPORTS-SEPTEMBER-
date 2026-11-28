import { PlayerGradientPreset } from '../types';

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
