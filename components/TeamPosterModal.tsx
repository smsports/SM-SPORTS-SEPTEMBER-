import React, { useState, useRef } from 'react';
import { Team, Player, RegisteredPlayer } from '../types';
import { Download, X, Check, Image as ImageIcon, Sparkles, ChevronDown, Trophy, Shield, RefreshCw, Crown } from 'lucide-react';
import html2canvas from 'html2canvas';
import { resolveTeamSquad } from '../utils';

export type PosterThemeId = 
  | 'INDEPENDENCE_DAY' 
  | 'BHARAT' 
  | 'BLUE_DYNAMITE' 
  | 'WHITE' 
  | 'BLUE_CRACKERS' 
  | 'RCB_THUNDER';

interface ThemeConfig {
  id: PosterThemeId;
  name: string;
  subtitle: string;
  bgClass: string;
  cardBg: string;
  headerAccent: string;
  textColor: string;
  subtextColor: string;
  avatarRing: string;
  badgeBg: string;
  footerBg: string;
  decorType: 'tricolor' | 'saffron_gold' | 'neon_cyan' | 'athletic_stripes' | 'crackers_sparkle' | 'rcb_thunder';
}

const THEMES: ThemeConfig[] = [
  {
    id: 'INDEPENDENCE_DAY',
    name: 'Independence Day Theme',
    subtitle: 'Tricolor celebration with stadium light',
    bgClass: 'bg-gradient-to-b from-orange-50 via-white to-emerald-50',
    cardBg: '#ffffff',
    headerAccent: 'text-slate-900',
    textColor: 'text-slate-900',
    subtextColor: 'text-slate-500',
    avatarRing: 'border-orange-500 ring-2 ring-emerald-500',
    badgeBg: 'bg-orange-100 text-orange-700 border-orange-200',
    footerBg: 'bg-slate-900 text-white',
    decorType: 'tricolor'
  },
  {
    id: 'BHARAT',
    name: 'Bharat Theme',
    subtitle: 'Warm saffron sunburst and golden prestige',
    bgClass: 'bg-gradient-to-b from-amber-500 via-orange-500 to-amber-700',
    cardBg: '#fffbeb',
    headerAccent: 'text-amber-950',
    textColor: 'text-amber-950',
    subtextColor: 'text-amber-800',
    avatarRing: 'border-amber-400 ring-2 ring-amber-600',
    badgeBg: 'bg-amber-100 text-amber-900 border-amber-300',
    footerBg: 'bg-amber-950 text-amber-100',
    decorType: 'saffron_gold'
  },
  {
    id: 'BLUE_DYNAMITE',
    name: 'Blue Dynamite',
    subtitle: 'Electric neon cyan geometric sports arena',
    bgClass: 'bg-gradient-to-b from-slate-950 via-blue-950 to-indigo-950',
    cardBg: '#090d16',
    headerAccent: 'text-cyan-400',
    textColor: 'text-white',
    subtextColor: 'text-cyan-200/70',
    avatarRing: 'border-cyan-400 ring-2 ring-blue-500 shadow-[0_0_12px_rgba(6,182,212,0.5)]',
    badgeBg: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40',
    footerBg: 'bg-cyan-950/80 text-cyan-200',
    decorType: 'neon_cyan'
  },
  {
    id: 'WHITE',
    name: 'White Theme',
    subtitle: 'Crisp minimal white with athletic edge stripes',
    bgClass: 'bg-slate-50',
    cardBg: '#ffffff',
    headerAccent: 'text-slate-900',
    textColor: 'text-slate-900',
    subtextColor: 'text-slate-500',
    avatarRing: 'border-slate-300 ring-2 ring-slate-800',
    badgeBg: 'bg-slate-100 text-slate-800 border-slate-200',
    footerBg: 'bg-slate-900 text-white',
    decorType: 'athletic_stripes'
  },
  {
    id: 'BLUE_CRACKERS',
    name: 'Blue Crackers',
    subtitle: 'Royal midnight celebration with festive cracker lights',
    bgClass: 'bg-gradient-to-b from-slate-950 via-indigo-950 to-slate-900',
    cardBg: '#0a0f1d',
    headerAccent: 'text-amber-300',
    textColor: 'text-white',
    subtextColor: 'text-indigo-200/70',
    avatarRing: 'border-amber-400 ring-2 ring-indigo-400 shadow-[0_0_12px_rgba(251,191,36,0.4)]',
    badgeBg: 'bg-amber-400/20 text-amber-300 border-amber-400/30',
    footerBg: 'bg-black/60 text-amber-200',
    decorType: 'crackers_sparkle'
  },
  {
    id: 'RCB_THUNDER',
    name: 'RCB Thunder',
    subtitle: 'Bold crimson and dark charcoal championship fire',
    bgClass: 'bg-gradient-to-b from-red-950 via-zinc-950 to-red-950',
    cardBg: '#120406',
    headerAccent: 'text-amber-400',
    textColor: 'text-white',
    subtextColor: 'text-red-200/70',
    avatarRing: 'border-red-500 ring-2 ring-amber-400 shadow-[0_0_12px_rgba(239,68,68,0.5)]',
    badgeBg: 'bg-red-900/40 text-amber-300 border-red-500/40',
    footerBg: 'bg-black/80 text-amber-300',
    decorType: 'rcb_thunder'
  }
];

interface Props {
  isOpen: boolean;
  onClose: () => void;
  teams: Team[];
  allPlayers?: Player[];
  initialTeamId?: string | number;
  tournamentName?: string;
  registrations?: RegisteredPlayer[];
  systemLogoUrl?: string;
}

export const TeamPosterModal: React.FC<Props> = ({
  isOpen,
  onClose,
  teams,
  allPlayers = [],
  initialTeamId,
  tournamentName = 'Tournament Championship',
  registrations = [],
  systemLogoUrl
}) => {
  const [selectedTeamId, setSelectedTeamId] = useState<string | number>(
    initialTeamId || (teams[0]?.id ?? '')
  );
  const [selectedThemeId, setSelectedThemeId] = useState<PosterThemeId>('INDEPENDENCE_DAY');
  const [isExporting, setIsExporting] = useState(false);
  const posterRef = useRef<HTMLDivElement>(null);

  if (!isOpen) return null;

  const currentTeam = teams.find(t => String(t.id) === String(selectedTeamId)) || teams[0];
  const activeTheme = THEMES.find(th => th.id === selectedThemeId) || THEMES[0];

  // Resolve complete squad including directly assigned players
  const rawPlayers = currentTeam ? resolveTeamSquad(currentTeam, allPlayers) : [];

  const ownerName = currentTeam?.ownerName || currentTeam?.owner || '';
  const isOwnerCaptain = currentTeam?.isOwnerCaptain !== false && !currentTeam?.captainName && !!ownerName;
  const captainName = currentTeam?.captainName || (isOwnerCaptain ? ownerName : '');

  // Check if owner is already in players list
  const ownerInPlayers = rawPlayers.find(p => p.name.trim().toLowerCase() === ownerName.trim().toLowerCase());

  interface PosterPlayerItem {
    id: string | number;
    name: string;
    role: string;
    category?: string;
    photoUrl?: string;
    isCaptain?: boolean;
    isOwner?: boolean;
  }

  const squadItems: PosterPlayerItem[] = [];

  // If owner is designated as captain and not in players, add owner first
  if (isOwnerCaptain && !ownerInPlayers && ownerName) {
    const ownerReg = registrations.find(r => r.fullName.trim().toLowerCase() === ownerName.trim().toLowerCase());
    squadItems.push({
      id: 'owner_captain',
      name: ownerName,
      role: 'Captain & Owner',
      category: 'Owner',
      photoUrl: currentTeam.ownerPhoto || ownerReg?.profilePic || currentTeam.logoUrl || '',
      isCaptain: true,
      isOwner: true
    });
  }

  // Add all other players
  rawPlayers.forEach((p, idx) => {
    const reg = registrations.find(r => r.fullName.trim().toLowerCase() === p.name.trim().toLowerCase());
    const isThisPlayerCaptain = (captainName && p.name.trim().toLowerCase() === captainName.trim().toLowerCase()) ||
                                p.isCaptain ||
                                (isOwnerCaptain && ownerInPlayers && p.name.trim().toLowerCase() === ownerName.trim().toLowerCase());
    
    squadItems.push({
      id: p.id || `p_${idx}`,
      name: p.name,
      role: p.role || p.speciality || 'Player',
      category: p.category,
      photoUrl: p.photoUrl || reg?.profilePic || '',
      isCaptain: !!isThisPlayerCaptain,
      isOwner: !!(ownerName && p.name.trim().toLowerCase() === ownerName.trim().toLowerCase())
    });
  });

  const handleDownload = async () => {
    if (!posterRef.current || !currentTeam) return;
    setIsExporting(true);
    try {
      // Ensure fonts and assets are fully settled
      if (document.fonts?.ready) {
        await document.fonts.ready;
      }
      await new Promise(r => setTimeout(r, 250));

      const canvas = await html2canvas(posterRef.current, {
        scale: 2.5,
        useCORS: true,
        allowTaint: true,
        backgroundColor: null,
        logging: false,
        windowWidth: 1200,
        onclone: (clonedDoc) => {
          const poster = clonedDoc.querySelector('[data-poster-root="true"]') as HTMLElement;
          if (poster) {
            poster.style.transform = 'none';
          }
          const playerNames = clonedDoc.querySelectorAll<HTMLElement>('.poster-player-name');
          playerNames.forEach(el => {
            el.style.overflow = 'visible';
            el.style.display = 'block';
            (el.style as any).webkitLineClamp = 'unset';
            (el.style as any).webkitBoxOrient = 'unset';
            el.style.lineHeight = '1.35';
            el.style.paddingBottom = '4px';
          });
          const playerRoles = clonedDoc.querySelectorAll<HTMLElement>('.poster-player-role');
          playerRoles.forEach(el => {
            el.style.overflow = 'visible';
            el.style.display = 'block';
            (el.style as any).webkitLineClamp = 'unset';
            el.style.lineHeight = '1.3';
            el.style.paddingBottom = '3px';
          });
          const teamHeader = clonedDoc.querySelector<HTMLElement>('.poster-team-title');
          if (teamHeader) {
            teamHeader.style.lineHeight = '1.25';
            teamHeader.style.paddingBottom = '4px';
            teamHeader.style.overflow = 'visible';
          }
        }
      });

      const image = canvas.toDataURL('image/png');
      const link = document.createElement('a');
      const safeTeamName = currentTeam.name.replace(/[^a-zA-Z0-9_-]/g, '_');
      link.download = `${safeTeamName}_Squad_Poster_${activeTheme.id}.png`;
      link.href = image;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      console.error('Error generating poster image:', err);
      alert('Unable to capture poster image. Please try again.');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[250] bg-black/85 backdrop-blur-md flex items-center justify-center p-2 sm:p-4 overflow-y-auto animate-fade-in">
      <div className="bg-zinc-900 border border-zinc-800 rounded-[2rem] w-full max-w-6xl max-h-[95vh] flex flex-col shadow-2xl overflow-hidden my-auto">
        
        {/* Modal Top Control Bar */}
        <div className="p-4 sm:p-6 border-b border-zinc-800 flex flex-wrap items-center justify-between gap-4 bg-zinc-950/80">
          <div className="flex items-center gap-3">
            <button 
              onClick={onClose}
              className="p-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition-colors"
              title="Close modal"
            >
              <X className="w-5 h-5" />
            </button>
            <div>
              <h2 className="text-lg sm:text-xl font-black text-white uppercase tracking-tight flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-amber-400" /> Select Design &amp; Export Poster
              </h2>
              <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">
                Team-wise squad posters with SM SPORTS branding
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Team Picker */}
            <div className="relative">
              <select
                value={selectedTeamId}
                onChange={e => setSelectedTeamId(e.target.value)}
                className="bg-zinc-800 border border-zinc-700 text-white rounded-xl px-4 py-2.5 text-xs font-black uppercase tracking-wider pr-8 appearance-none outline-none focus:border-amber-400 cursor-pointer"
              >
                {teams.map(t => (
                  <option key={t.id} value={t.id}>
                    {t.name} ({(t.players || []).length} players)
                  </option>
                ))}
              </select>
              <ChevronDown className="w-4 h-4 text-zinc-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>

            <button
              onClick={handleDownload}
              disabled={isExporting}
              className="bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-black font-black px-5 py-2.5 rounded-xl text-xs uppercase tracking-widest flex items-center gap-2 shadow-lg shadow-amber-500/20 active:scale-95 transition-all disabled:opacity-50"
            >
              {isExporting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
              {isExporting ? 'Generating HD Poster...' : 'Download Poster (HD)'}
            </button>
          </div>
        </div>

        {/* Modal Main Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 grid grid-cols-1 lg:grid-cols-12 gap-6 custom-scrollbar">
          
          {/* Left Column: Theme Thumbnails / Selectors */}
          <div className="lg:col-span-4 space-y-3">
            <h3 className="text-xs font-black text-zinc-400 uppercase tracking-widest mb-3 flex items-center gap-2">
              <ImageIcon className="w-4 h-4 text-amber-400" /> Choose Style ({THEMES.length} Themes)
            </h3>
            
            <div className="grid grid-cols-2 lg:grid-cols-1 gap-2.5">
              {THEMES.map(theme => {
                const isSelected = theme.id === selectedThemeId;
                return (
                  <button
                    key={theme.id}
                    onClick={() => setSelectedThemeId(theme.id)}
                    className={`p-3 rounded-2xl border-2 text-left transition-all relative overflow-hidden flex items-center justify-between group ${
                      isSelected
                        ? 'border-amber-400 bg-amber-500/10 shadow-lg shadow-amber-500/10'
                        : 'border-zinc-800 bg-zinc-800/40 hover:border-zinc-700 hover:bg-zinc-800/80'
                    }`}
                  >
                    <div className="min-w-0 pr-2">
                      <p className={`text-xs font-black uppercase tracking-tight truncate ${isSelected ? 'text-amber-400' : 'text-zinc-200'}`}>
                        {theme.name}
                      </p>
                      <p className="text-[9px] text-zinc-400 font-medium truncate mt-0.5">
                        {theme.subtitle}
                      </p>
                    </div>

                    <div className="shrink-0 flex items-center gap-2">
                      {/* Color Palette swatch */}
                      <div className="w-6 h-6 rounded-lg overflow-hidden border border-zinc-700 flex items-center justify-center">
                        {theme.id === 'INDEPENDENCE_DAY' && (
                          <div className="w-full h-full bg-gradient-to-br from-orange-500 via-white to-emerald-600" />
                        )}
                        {theme.id === 'BHARAT' && (
                          <div className="w-full h-full bg-gradient-to-br from-amber-400 via-orange-500 to-amber-700" />
                        )}
                        {theme.id === 'BLUE_DYNAMITE' && (
                          <div className="w-full h-full bg-gradient-to-br from-cyan-400 to-blue-900" />
                        )}
                        {theme.id === 'WHITE' && (
                          <div className="w-full h-full bg-white border border-slate-300" />
                        )}
                        {theme.id === 'BLUE_CRACKERS' && (
                          <div className="w-full h-full bg-gradient-to-br from-indigo-900 via-blue-950 to-amber-400" />
                        )}
                        {theme.id === 'RCB_THUNDER' && (
                          <div className="w-full h-full bg-gradient-to-br from-red-600 via-black to-amber-500" />
                        )}
                      </div>

                      {isSelected && (
                        <div className="w-5 h-5 rounded-full bg-amber-400 text-black flex items-center justify-center">
                          <Check className="w-3 h-3 stroke-[3]" />
                        </div>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Current Team Information Panel */}
            {currentTeam && (
              <div className="mt-4 p-4 rounded-2xl bg-zinc-950/60 border border-zinc-800 text-xs text-zinc-400 space-y-1.5">
                <p className="text-[10px] font-black uppercase text-zinc-300 tracking-wider">
                  Squad Highlights
                </p>
                <p className="text-zinc-400">
                  <span className="font-bold text-zinc-200">Team:</span> {currentTeam.name}
                </p>
                {ownerName && (
                  <p className="text-zinc-400">
                    <span className="font-bold text-amber-400">Owner &amp; Captain:</span> {ownerName}
                  </p>
                )}
                <p className="text-zinc-400">
                  <span className="font-bold text-zinc-200">Total Players:</span> {squadItems.length}
                </p>
              </div>
            )}
          </div>

          {/* Right Column: Live HD Poster Preview Area */}
          <div className="lg:col-span-8 flex flex-col items-center justify-center bg-black/40 p-3 sm:p-6 rounded-2xl border border-zinc-800 overflow-x-auto">
            
            {/* The Actual Rendered Poster Node for html2canvas */}
            <div
              ref={posterRef}
              data-poster-root="true"
              className={`w-[540px] max-w-[540px] shrink-0 rounded-3xl shadow-2xl overflow-hidden relative border flex flex-col transition-all duration-300 ${activeTheme.bgClass}`}
              style={{
                minHeight: '700px',
                borderColor: activeTheme.id === 'BLUE_DYNAMITE' ? '#06b6d4' : activeTheme.id === 'RCB_THUNDER' ? '#dc2626' : '#e2e8f0'
              }}
            >
              {/* DECORATIVE BACKGROUND ACCENTS */}
              {activeTheme.decorType === 'tricolor' && (
                <>
                  {/* Top-right flowing saffron-white-green ribbon */}
                  <div className="absolute top-0 right-0 w-44 h-16 pointer-events-none overflow-hidden opacity-90">
                    <div className="absolute -top-6 -right-6 w-32 h-10 bg-orange-500 rotate-12 rounded-full" />
                    <div className="absolute -top-3 -right-3 w-32 h-10 bg-white rotate-12 rounded-full shadow-sm" />
                    <div className="absolute top-0 right-0 w-32 h-10 bg-emerald-600 rotate-12 rounded-full" />
                  </div>
                  {/* Bottom-left flowing ribbon */}
                  <div className="absolute bottom-12 left-0 w-44 h-16 pointer-events-none overflow-hidden opacity-90">
                    <div className="absolute bottom-0 -left-6 w-32 h-10 bg-orange-500 -rotate-12 rounded-full" />
                    <div className="absolute bottom-3 -left-3 w-32 h-10 bg-white -rotate-12 rounded-full shadow-sm" />
                    <div className="absolute bottom-6 left-0 w-32 h-10 bg-emerald-600 -rotate-12 rounded-full" />
                  </div>
                </>
              )}

              {activeTheme.decorType === 'saffron_gold' && (
                <>
                  <div className="absolute top-0 inset-x-0 h-48 bg-gradient-to-b from-amber-300/30 to-transparent pointer-events-none" />
                  <div className="absolute top-10 left-1/2 -translate-x-1/2 w-64 h-64 bg-amber-300/20 rounded-full blur-3xl pointer-events-none" />
                </>
              )}

              {activeTheme.decorType === 'neon_cyan' && (
                <>
                  {/* Futuristic cyan geometry accents */}
                  <div className="absolute top-0 right-0 w-36 h-36 bg-cyan-500/10 rounded-full blur-2xl pointer-events-none" />
                  <div className="absolute top-4 right-4 flex gap-1">
                    <div className="w-6 h-1 bg-cyan-400 rotate-45 transform" />
                    <div className="w-4 h-1 bg-cyan-400 rotate-45 transform" />
                    <div className="w-2 h-1 bg-cyan-400 rotate-45 transform" />
                  </div>
                  <div className="absolute bottom-14 left-4 flex gap-1">
                    <div className="w-6 h-1 bg-cyan-400 rotate-45 transform" />
                    <div className="w-4 h-1 bg-cyan-400 rotate-45 transform" />
                  </div>
                </>
              )}

              {activeTheme.decorType === 'athletic_stripes' && (
                <>
                  <div className="absolute top-0 right-0 w-28 h-28 pointer-events-none overflow-hidden">
                    <div className="absolute top-3 -right-6 w-32 h-3 bg-red-600 rotate-45" />
                    <div className="absolute top-7 -right-6 w-32 h-3 bg-blue-900 rotate-45" />
                  </div>
                  <div className="absolute bottom-12 left-0 w-28 h-28 pointer-events-none overflow-hidden">
                    <div className="absolute bottom-3 -left-6 w-32 h-3 bg-red-600 rotate-45" />
                    <div className="absolute bottom-7 -left-6 w-32 h-3 bg-blue-900 rotate-45" />
                  </div>
                </>
              )}

              {activeTheme.decorType === 'crackers_sparkle' && (
                <>
                  <div className="absolute top-4 left-6 text-amber-300 text-lg opacity-80 pointer-events-none">✨</div>
                  <div className="absolute top-12 right-10 text-cyan-300 text-xl opacity-80 pointer-events-none">🎆</div>
                  <div className="absolute bottom-20 right-8 text-amber-300 text-lg opacity-70 pointer-events-none">✨</div>
                  <div className="absolute bottom-32 left-8 text-indigo-300 text-xl opacity-70 pointer-events-none">🎇</div>
                </>
              )}

              {activeTheme.decorType === 'rcb_thunder' && (
                <>
                  <div className="absolute top-0 inset-x-0 h-40 bg-gradient-to-b from-red-600/25 to-transparent pointer-events-none" />
                  <div className="absolute top-6 right-6 text-amber-400 text-2xl font-black opacity-80">⚡</div>
                  <div className="absolute bottom-20 left-6 text-amber-400 text-2xl font-black opacity-80">⚡</div>
                </>
              )}

              {/* POSTER HEADER */}
              <div className="relative z-10 px-6 pt-7 pb-4 text-center">
                {/* Tournament Name Badge */}
                <div className="inline-flex items-center gap-2 px-4 py-1 rounded-full text-[10px] font-black uppercase tracking-wider mb-3 shadow-sm border border-black/10 bg-white/80 backdrop-blur-sm text-slate-800">
                  <Trophy className="w-3.5 h-3.5 text-amber-500" />
                  <span>{tournamentName}</span>
                </div>

                {/* Team Logo & Name Header */}
                <div className="flex items-center justify-center gap-3.5 mt-1">
                  {currentTeam?.logoUrl ? (
                    <img 
                      src={currentTeam.logoUrl} 
                      alt={currentTeam.name} 
                      crossOrigin="anonymous"
                      referrerPolicy="no-referrer"
                      className="w-14 h-14 sm:w-16 sm:h-16 rounded-full object-contain p-1 bg-white shadow-md border-2 border-white/80" 
                    />
                  ) : (
                    <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-slate-900 text-white font-black text-2xl flex items-center justify-center shadow-md border-2 border-white/80">
                      {currentTeam?.name?.charAt(0) || 'T'}
                    </div>
                  )}

                  <div className="text-left">
                    <h1 className={`poster-team-title text-xl sm:text-2xl font-black uppercase tracking-tight leading-snug pb-0.5 ${activeTheme.textColor}`}>
                      {currentTeam?.name}
                    </h1>
                    {ownerName && (
                      <p className={`text-[10px] font-black uppercase tracking-widest mt-1 flex items-center gap-1.5 leading-snug pb-0.5 ${activeTheme.subtextColor}`}>
                        <Shield className="w-3 h-3 text-amber-500 shrink-0" />
                        <span>Owner: {ownerName} {isOwnerCaptain && '(Captain)'}</span>
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {/* SQUAD PLAYERS GRID (CIRCULAR AVATARS) */}
              <div className="relative z-10 flex-1 px-4 sm:px-6 py-4">
                {squadItems.length === 0 ? (
                  <div className="py-20 text-center text-slate-400">
                    <p className="text-xs uppercase font-bold tracking-widest">No players in this team squad yet</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-4 gap-y-4 gap-x-2 sm:gap-x-3 items-start justify-items-center">
                    {squadItems.map((player) => (
                      <div key={player.id} className="flex flex-col items-center text-center w-full max-w-[115px] px-0.5">
                        {/* Circular Avatar */}
                        <div className="relative mb-1.5 shrink-0">
                          <div className={`w-14 h-14 sm:w-16 sm:h-16 rounded-full overflow-hidden border-2 bg-slate-200 shadow-md flex items-center justify-center ${activeTheme.avatarRing}`}>
                            {player.photoUrl ? (
                              <img 
                                src={player.photoUrl} 
                                alt={player.name} 
                                crossOrigin="anonymous"
                                referrerPolicy="no-referrer"
                                className="w-full h-full object-cover" 
                              />
                            ) : (
                              <div className="w-full h-full bg-gradient-to-br from-slate-200 to-slate-400 text-slate-700 font-black text-sm flex items-center justify-center uppercase">
                                {player.name.charAt(0)}
                              </div>
                            )}
                          </div>

                          {/* Captain Badge */}
                          {player.isCaptain && (
                            <span className="absolute -bottom-1 -right-1 bg-amber-400 text-slate-950 font-black text-[9px] w-5 h-5 rounded-full flex items-center justify-center shadow-md border border-white">
                              C
                            </span>
                          )}
                        </div>

                        {/* Player Name Container */}
                        <div className="w-full flex flex-col items-center justify-start min-h-[36px]">
                          <p 
                            className={`poster-player-name text-[10px] sm:text-[10.5px] font-black uppercase tracking-tight leading-snug text-center break-words w-full px-0.5 ${activeTheme.textColor}`}
                            style={{
                              lineHeight: 1.3,
                              wordBreak: 'break-word',
                              overflowWrap: 'break-word',
                              paddingBottom: '2px'
                            }}
                          >
                            {player.name}
                          </p>

                          {/* Player Role */}
                          <p 
                            className={`poster-player-role text-[8px] sm:text-[8.5px] font-bold uppercase tracking-wider text-center w-full truncate mt-0.5 ${activeTheme.subtextColor}`}
                            style={{
                              lineHeight: 1.25,
                              paddingBottom: '2px'
                            }}
                          >
                            {player.role}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* POSTER FOOTER: BRANDING */}
              <div className={`relative z-10 py-3.5 px-6 flex items-center justify-between text-[10px] font-black tracking-widest uppercase mt-auto ${activeTheme.footerBg}`}>
                <div className="flex items-center gap-2">
                  {systemLogoUrl ? (
                    <img src={systemLogoUrl} alt="SM Sports" crossOrigin="anonymous" className="h-4 object-contain" />
                  ) : null}
                  <span>Designed by <strong className="text-amber-400">SM SPORTS</strong></span>
                </div>
                <div className="text-[9px] opacity-80">
                  Official Squad
                </div>
              </div>
            </div>

            <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest mt-4">
              HD Resolution: 2.5x crisp rendering • Instant PNG export
            </p>
          </div>

        </div>

      </div>
    </div>
  );
};

export default TeamPosterModal;
