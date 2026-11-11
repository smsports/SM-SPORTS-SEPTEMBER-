import React, { useMemo } from 'react';
import { Player, Team, AuctionCategory, DraftBoardState, DraftPickHistory } from '../../types';
import { Check, Trophy, Users, Shield } from 'lucide-react';
import { getDraftTheme } from '../../utils/draftThemes';

interface Props {
    players: Player[];
    categories: AuctionCategory[];
    teams: Team[];
    draftPickMap: Map<string, DraftPickHistory>;
    draftState: DraftBoardState;
    categoryGroups: {
        category: string;
        players: Player[];
        availableCount: number;
        soldCount: number;
    }[];
    layoutMode?: 'ROWS' | 'COLUMNS' | 'GRID' | 'TABLE';
    categoryFilter?: string;
    isDark?: boolean;
}

export const ProjectorFitBoard: React.FC<Props> = ({
    players,
    categories,
    teams,
    draftPickMap,
    draftState,
    categoryGroups,
    layoutMode,
    categoryFilter,
    isDark = true
}) => {
    // Determine effective layout mode (synced with admin Firestore control, default to ROWS)
    const effectiveLayoutMode: 'ROWS' | 'COLUMNS' | 'GRID' | 'TABLE' = 
        draftState.projectorLayoutMode || layoutMode || 'ROWS';

    // Determine category filter (synced with admin Firestore control)
    const effectiveCategoryFilter = 
        draftState.broadcastCategoryFilter || categoryFilter || 'ALL';

    // Team logo and color map
    const teamLogoMap = useMemo(() => {
        const map = new Map<string, string>();
        teams.forEach(t => {
            if (t.logoUrl) {
                map.set(String(t.id), t.logoUrl);
                map.set(t.name.trim().toLowerCase(), t.logoUrl);
            }
        });
        return map;
    }, [teams]);

    // Filter categories if Admin specified a necessary category
    const displayedGroups = useMemo(() => {
        const groupsWithPlayers = categoryGroups.filter(g => g.players.length > 0);
        const base = groupsWithPlayers.length > 0 ? groupsWithPlayers : categoryGroups;

        if (effectiveCategoryFilter && effectiveCategoryFilter !== 'ALL') {
            const filtered = base.filter(g => g.category.trim().toLowerCase() === effectiveCategoryFilter.trim().toLowerCase());
            return filtered.length > 0 ? filtered : base;
        }
        return base;
    }, [categoryGroups, effectiveCategoryFilter]);

    // Flat list of players shown
    const displayedPlayers = useMemo(() => {
        return displayedGroups.flatMap(g => g.players);
    }, [displayedGroups]);

    // Dynamic grid columns for unified GRID mode
    const totalPlayers = displayedPlayers.length;
    const gridColsClass = useMemo(() => {
        if (totalPlayers <= 8) return 'grid-cols-2 sm:grid-cols-4';
        if (totalPlayers <= 12) return 'grid-cols-3 sm:grid-cols-4';
        if (totalPlayers <= 20) return 'grid-cols-4 sm:grid-cols-5';
        if (totalPlayers <= 30) return 'grid-cols-5 sm:grid-cols-6';
        if (totalPlayers <= 42) return 'grid-cols-6 sm:grid-cols-7';
        if (totalPlayers <= 56) return 'grid-cols-7 sm:grid-cols-8';
        if (totalPlayers <= 72) return 'grid-cols-8 sm:grid-cols-9';
        return 'grid-cols-9 sm:grid-cols-10 lg:grid-cols-12';
    }, [totalPlayers]);

    // Split players into multi-column panes for fit-to-screen TABLE mode
    const tablePanes = useMemo(() => {
        if (totalPlayers <= 20) {
            return [displayedPlayers];
        }
        if (totalPlayers <= 45) {
            const mid = Math.ceil(totalPlayers / 2);
            return [displayedPlayers.slice(0, mid), displayedPlayers.slice(mid)];
        }
        const third = Math.ceil(totalPlayers / 3);
        return [
            displayedPlayers.slice(0, third),
            displayedPlayers.slice(third, third * 2),
            displayedPlayers.slice(third * 2)
        ];
    }, [displayedPlayers, totalPlayers]);

    // Theme configuration based on Admin selected broadcast theme
    const themeConfig = getDraftTheme(draftState.broadcastTheme);

    // Helper: Render a Single Player Card with Large Sold and Large Text
    const renderPlayerCard = (player: Player) => {
        const pickInfo = draftPickMap.get(String(player.id));
        const isSold = player.status === 'SOLD' || !!pickInfo;
        const soldTeamName = pickInfo?.teamName || player.soldTo || '';
        const soldTeamLogo = pickInfo?.teamLogo || (soldTeamName ? teamLogoMap.get(soldTeamName.trim().toLowerCase()) : undefined);

        return (
            <div
                key={player.id}
                className={`h-full min-h-0 rounded-2xl border-2 p-1.5 md:p-2 flex flex-col justify-between overflow-hidden shadow-xl transition-all ${
                    isSold
                        ? 'bg-gradient-to-b from-red-950/95 via-zinc-950 to-black border-red-500 shadow-red-500/30 ring-2 ring-red-500/50'
                        : `${themeConfig.cardBg} ${themeConfig.cardBorder} hover:border-amber-400`
                }`}
            >
                {/* Top Bar: Role badge & Jersey Number */}
                <div className="flex items-center justify-between gap-1 mb-1 shrink-0">
                    <span className={`text-[8px] md:text-[9px] font-black uppercase px-2 py-0.5 rounded-md truncate max-w-[75%] ${
                        themeConfig.isLightMode 
                            ? 'bg-blue-100 text-blue-900 border border-blue-200' 
                            : 'bg-black/80 text-amber-300 border border-amber-400/30'
                    }`}>
                        {player.role || player.category || 'PLAYER'}
                    </span>
                    <span className={`text-[9px] md:text-[10px] font-black ${
                        themeConfig.isLightMode ? 'text-slate-700' : 'text-amber-300 drop-shadow'
                    }`}>
                        {player.jerseyNumber ? `#${player.jerseyNumber}` : `#${player.id}`}
                    </span>
                </div>

                {/* Center: Photo Area & LARGE SOLD Badge fitting Player Section */}
                <div className={`relative flex-1 min-h-0 rounded-xl overflow-hidden my-0.5 flex items-center justify-center ${
                    themeConfig.isLightMode ? 'bg-slate-100 border border-slate-200' : 'bg-zinc-950 border border-white/5'
                }`}>
                    {player.photoUrl ? (
                        <img 
                            src={player.photoUrl} 
                            alt={player.name} 
                            className={`w-full h-full object-cover ${
                                isSold ? 'grayscale contrast-125 opacity-20' : ''
                            }`} 
                        />
                    ) : (
                        <div className={`w-full h-full flex items-center justify-center font-black text-2xl ${
                            themeConfig.isLightMode ? 'text-slate-400 bg-slate-100' : 'text-zinc-600 bg-zinc-900'
                        }`}>
                            {player.name.charAt(0)}
                        </div>
                    )}

                    {/* LARGE SOLD AND TEAM NAME OVERLAY (FITS ENTIRE SECTION) */}
                    {isSold && (
                        <div className="absolute inset-0 bg-black/92 flex flex-col items-center justify-center p-1 text-center animate-fade-in backdrop-blur-[2px] z-20">
                            {/* LARGE SOLD BADGE */}
                            <div className="px-3.5 py-1 rounded-xl bg-gradient-to-r from-red-600 via-rose-600 to-red-600 text-white font-black text-xs md:text-sm lg:text-base uppercase tracking-widest shadow-xl shadow-red-600/70 border-2 border-red-300 drop-shadow">
                                SOLD
                            </div>

                            {/* TEAM LOGO */}
                            {soldTeamLogo ? (
                                <img 
                                    src={soldTeamLogo} 
                                    alt="" 
                                    className="w-8 h-8 md:w-11 md:h-11 rounded-full object-contain bg-white p-0.5 my-1 shadow-lg border-2 border-amber-400 shrink-0" 
                                />
                            ) : (
                                <div className="w-8 h-8 md:w-10 md:h-10 rounded-full bg-blue-600 text-white font-black text-xs md:text-sm flex items-center justify-center my-1 border-2 border-amber-400 shrink-0 shadow-lg">
                                    {soldTeamName.charAt(0) || '★'}
                                </div>
                            )}

                            {/* LARGE WINNING TEAM NAME */}
                            <p className="text-xs md:text-sm lg:text-base font-black text-amber-300 uppercase tracking-tight line-clamp-2 drop-shadow-[0_2px_8px_rgba(0,0,0,0.95)] px-1 leading-tight">
                                {soldTeamName}
                            </p>
                        </div>
                    )}
                </div>

                {/* Bottom: Player Name (Large, Bold, High-Contrast) & Status */}
                <div className="mt-1 shrink-0 text-center">
                    <h4 className={`font-black uppercase tracking-tight text-xs md:text-sm lg:text-base truncate leading-tight ${
                        themeConfig.isLightMode ? 'text-slate-900 font-extrabold' : 'text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)]'
                    }`}>
                        {player.name}
                    </h4>

                {/* Status Pill */}
                {isSold ? (
                    <div className="mt-0.5 py-0.5 px-1.5 rounded-md bg-gradient-to-r from-red-600/30 via-amber-500/30 to-yellow-500/30 border border-amber-400/60 text-center">
                        <span className="text-[9px] md:text-[10px] font-black uppercase text-amber-300 truncate drop-shadow">
                            ★ {soldTeamName}
                        </span>
                    </div>
                ) : (
                    <div className="mt-0.5 py-0.5 px-1 rounded-md bg-emerald-500/20 border border-emerald-500/40 text-center">
                        <span className="text-[8px] md:text-[9px] font-black uppercase tracking-wider text-emerald-400 flex items-center justify-center gap-1">
                            <Check className="w-2.5 h-2.5 text-emerald-400 stroke-[3]" /> Available
                        </span>
                    </div>
                )}
            </div>
        </div>
        );
    };

    // =========================================================================
    // MODE 1 (DEFAULT / USER REQUEST): CATEGORIES ON LEFT IN ROWS WISE (Zero Scroll)
    // =========================================================================
    if (effectiveLayoutMode === 'ROWS') {
        return (
            <div className={`w-full h-full min-h-0 flex flex-col gap-2 p-1 overflow-hidden select-none ${themeConfig.containerBg}`}>
                {displayedGroups.map(group => {
                    const groupCount = group.players.length;
                    // Compute columns in player row based on player count
                    const rowColsClass = groupCount <= 4 
                        ? 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4' 
                        : groupCount <= 6 
                        ? 'grid-cols-3 sm:grid-cols-4 md:grid-cols-6'
                        : groupCount <= 8
                        ? 'grid-cols-4 sm:grid-cols-6 md:grid-cols-8'
                        : groupCount <= 10
                        ? 'grid-cols-5 sm:grid-cols-8 md:grid-cols-10'
                        : groupCount <= 14
                        ? 'grid-cols-6 sm:grid-cols-8 md:grid-cols-12'
                        : 'grid-cols-7 sm:grid-cols-9 md:grid-cols-14';

                    return (
                        <div 
                            key={group.category}
                            className={`flex-1 min-h-0 w-full flex flex-row items-stretch rounded-2xl border-2 ${themeConfig.headerBorder} ${themeConfig.headerBg} p-1.5 overflow-hidden shadow-2xl gap-2`}
                        >
                            {/* LEFT SIDE: CATEGORY BANNER COLUMN */}
                            <div className={`w-32 md:w-44 shrink-0 rounded-xl ${themeConfig.categoryStripBg} border ${themeConfig.categoryStripBorder} p-2 flex flex-col justify-between items-center text-center shadow-lg`}>
                                <div className="w-full">
                                    <div className={`w-8 h-8 rounded-full mx-auto mb-1 flex items-center justify-center shadow ${
                                        themeConfig.isLightMode ? 'bg-blue-600 text-white' : 'bg-amber-500/20 border border-amber-500/50 text-amber-400'
                                    }`}>
                                        <Trophy className="w-4 h-4" />
                                    </div>
                                    <h3 className={`text-xs md:text-sm font-black uppercase tracking-wider ${themeConfig.categoryText} break-words leading-tight drop-shadow`}>
                                        {group.category}
                                    </h3>
                                    <span className={`text-[9px] font-bold uppercase mt-0.5 block ${themeConfig.subTextColor}`}>
                                        ({groupCount} Players)
                                    </span>
                                </div>

                                <div className={`w-full space-y-1 pt-1.5 border-t ${themeConfig.isLightMode ? 'border-slate-300' : 'border-white/10'}`}>
                                    <div className={`py-0.5 px-2 rounded-md text-[9px] font-black uppercase flex items-center justify-between ${
                                        themeConfig.isLightMode ? 'bg-emerald-100 border border-emerald-300 text-emerald-800' : 'bg-emerald-500/15 border border-emerald-500/30 text-emerald-400'
                                    }`}>
                                        <span>Avail</span>
                                        <span>{group.availableCount}</span>
                                    </div>
                                    <div className={`py-0.5 px-2 rounded-md text-[9px] font-black uppercase flex items-center justify-between ${
                                        themeConfig.isLightMode ? 'bg-red-100 border border-red-300 text-red-800' : 'bg-red-500/15 border border-red-500/30 text-red-400'
                                    }`}>
                                        <span>Sold</span>
                                        <span>{group.soldCount}</span>
                                    </div>
                                </div>
                            </div>

                            {/* RIGHT SIDE: PLAYERS ROW (Fits 100% Height) */}
                            <div className={`flex-1 min-h-0 h-full grid ${rowColsClass} auto-rows-fr gap-1.5 overflow-hidden`}>
                                {group.players.map(player => renderPlayerCard(player))}
                            </div>
                        </div>
                    );
                })}
            </div>
        );
    }

    // =========================================================================
    // MODE 2: CATEGORY COLUMNS SIDE-BY-SIDE (Zero Scroll)
    // =========================================================================
    if (effectiveLayoutMode === 'COLUMNS') {
        return (
            <div className={`w-full h-full min-h-0 flex flex-row gap-2 p-1 overflow-hidden select-none ${themeConfig.containerBg}`}>
                {displayedGroups.map(group => {
                    const groupCount = group.players.length;
                    const subCols = groupCount <= 8 ? 1 : groupCount <= 16 ? 2 : groupCount <= 26 ? 3 : 4;
                    const subColsClass = subCols === 1 
                        ? 'grid-cols-1' 
                        : subCols === 2 
                        ? 'grid-cols-2' 
                        : subCols === 3
                        ? 'grid-cols-3'
                        : 'grid-cols-4';

                    return (
                        <div 
                            key={group.category}
                            style={{ flex: subCols }}
                            className={`min-h-0 h-full flex flex-col rounded-2xl border ${themeConfig.isLightMode ? 'border-slate-300 bg-white' : 'border-zinc-800 bg-zinc-900/60'} p-1.5 overflow-hidden shadow-2xl`}
                        >
                            {/* Category Column Header */}
                            <div className={`shrink-0 flex items-center justify-between px-2.5 py-1.5 rounded-xl border ${themeConfig.isLightMode ? 'border-slate-300 bg-slate-100 text-slate-900' : 'border-white/5 bg-zinc-950/90 text-white'} mb-1.5 shadow-sm`}>
                                <div className="flex items-center gap-1.5 min-w-0">
                                    <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse shrink-0" />
                                    <h3 className={`text-xs md:text-sm font-black uppercase tracking-wider truncate ${themeConfig.isLightMode ? 'text-blue-900' : 'text-white'}`}>
                                        {group.category}
                                    </h3>
                                    <span className={`text-[9px] font-bold shrink-0 ${themeConfig.subTextColor}`}>
                                        ({groupCount})
                                    </span>
                                </div>
                                <div className="flex items-center gap-2 text-[9px] font-bold shrink-0">
                                    <span className="text-emerald-500">{group.availableCount} Avail</span>
                                    <span className="text-amber-500">{group.soldCount} Sold</span>
                                </div>
                            </div>

                            {/* Players in this Category Column */}
                            <div className={`grid ${subColsClass} auto-rows-fr gap-1 h-full flex-1 min-h-0 overflow-hidden`}>
                                {group.players.map(player => renderPlayerCard(player))}
                            </div>
                        </div>
                    );
                })}
            </div>
        );
    }

    // =========================================================================
    // MODE 3: UNIFIED AUTO-FIT GRID MATRIX (Zero Scroll)
    // =========================================================================
    if (effectiveLayoutMode === 'GRID') {
        return (
            <div className={`w-full h-full min-h-0 p-1 overflow-hidden select-none ${themeConfig.containerBg}`}>
                <div className={`grid ${gridColsClass} auto-rows-fr gap-1.5 w-full h-full min-h-0 overflow-hidden`}>
                    {displayedPlayers.map(player => renderPlayerCard(player))}
                </div>
            </div>
        );
    }

    // =========================================================================
    // MODE 4: MULTI-PANE FIT-TO-SCREEN TABLE (Zero Scroll)
    // =========================================================================
    return (
        <div className={`w-full h-full min-h-0 flex flex-row gap-2.5 p-1 overflow-hidden select-none ${themeConfig.containerBg}`}>
            {tablePanes.map((panePlayers, paneIdx) => {
                const offsetIdx = tablePanes.slice(0, paneIdx).reduce((acc, p) => acc + p.length, 0);

                return (
                    <div 
                        key={paneIdx} 
                        className={`flex-1 min-h-0 h-full flex flex-col rounded-2xl border ${themeConfig.isLightMode ? 'border-slate-300 bg-white' : 'border-zinc-800 bg-zinc-900/80'} overflow-hidden shadow-2xl`}
                    >
                        {/* Pane Header */}
                        <div className={`shrink-0 flex items-center justify-between px-3 py-1.5 border-b ${themeConfig.isLightMode ? 'border-slate-200 bg-slate-100 text-slate-700' : 'border-white/5 bg-zinc-950/90 text-zinc-400'} text-[10px] font-black uppercase`}>
                            <span>Roster Pane {paneIdx + 1} ({panePlayers.length} Players)</span>
                            <span>Status / Winning Team</span>
                        </div>

                        {/* Dense Table Body Fitting 100% Height */}
                        <div className="flex-1 min-h-0 flex flex-col justify-between overflow-hidden">
                            {panePlayers.map((player, pIdx) => {
                                const pickInfo = draftPickMap.get(String(player.id));
                                const isSold = player.status === 'SOLD' || !!pickInfo;
                                const soldTeam = pickInfo?.teamName || player.soldTo || '';
                                const teamLogo = pickInfo?.teamLogo || (soldTeam ? teamLogoMap.get(soldTeam.trim().toLowerCase()) : undefined);

                                return (
                                    <div 
                                        key={player.id}
                                        className={`flex-1 min-h-0 flex items-center justify-between px-2.5 py-1 border-b border-white/[0.04] transition-colors ${
                                            isSold ? 'bg-red-950/30' : 'hover:bg-zinc-800/40'
                                        }`}
                                    >
                                        <div className="flex items-center gap-2 min-w-0 pr-2">
                                            <span className="text-[9px] font-bold text-zinc-500 w-5 shrink-0">
                                                #{offsetIdx + pIdx + 1}
                                            </span>
                                            {player.photoUrl ? (
                                                <img 
                                                    src={player.photoUrl} 
                                                    alt="" 
                                                    className={`w-7 h-7 rounded-md object-cover shrink-0 border border-zinc-700 ${
                                                        isSold ? 'grayscale contrast-125 opacity-40' : ''
                                                    }`} 
                                                />
                                            ) : (
                                                <div className="w-7 h-7 rounded-md bg-zinc-800 flex items-center justify-center font-black text-xs text-zinc-400 shrink-0">
                                                    {player.name.charAt(0)}
                                                </div>
                                            )}
                                            <div className="min-w-0">
                                                <p className="font-black uppercase tracking-tight text-white text-xs md:text-sm truncate">
                                                    {player.name}
                                                </p>
                                                <p className="text-[8px] font-bold uppercase text-zinc-400 truncate">
                                                    {player.role || player.category || 'Player'}
                                                    {player.jerseyNumber ? ` • #${player.jerseyNumber}` : ''}
                                                </p>
                                            </div>
                                        </div>

                                        {/* Status Badge */}
                                        <div className="shrink-0 text-right">
                                            {isSold && soldTeam ? (
                                                <div className="flex items-center gap-1.5 py-1 px-2.5 rounded-lg bg-gradient-to-r from-red-600/30 via-red-950 to-amber-950 border-2 border-red-500 shadow-sm max-w-[170px]">
                                                    <span className="px-1.5 py-0.5 rounded bg-red-600 text-white font-black text-[8px] uppercase tracking-wider shrink-0 shadow">
                                                        SOLD
                                                    </span>
                                                    {teamLogo && (
                                                        <img src={teamLogo} alt="" className="w-5 h-5 rounded-full object-contain bg-white p-0.5 shrink-0 shadow" />
                                                    )}
                                                    <span className="text-xs font-black uppercase text-amber-300 truncate drop-shadow">
                                                        {soldTeam}
                                                    </span>
                                                </div>
                                            ) : (
                                                <span className="px-2.5 py-1 rounded-md text-[9px] font-black uppercase tracking-wider bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 inline-flex items-center gap-1 shadow-sm">
                                                    <Check className="w-3 h-3 text-emerald-400 stroke-[3]" /> Available
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                );
            })}
        </div>
    );
};

export default ProjectorFitBoard;
