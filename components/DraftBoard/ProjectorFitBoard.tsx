import React, { useMemo, useState, useEffect, useRef } from 'react';
import { Player, Team, AuctionCategory, DraftBoardState, DraftPickHistory } from '../../types';
import { Trophy, Check, User } from 'lucide-react';
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
    transparentBg?: boolean;
}

/**
 * Calculates optimal (rows, cols) for any number of players N to guarantee
 * cards have a balanced portrait/near-square aspect ratio (~0.85) without
 * squishing photos into horizontal slits or vertical slivers.
 */
function computeOptimalGrid(
    count: number,
    containerWidth: number = 1600,
    containerHeight: number = 800,
    targetCardAspect: number = 0.85
): { rows: number; cols: number } {
    if (count <= 0) return { rows: 1, cols: 1 };
    let bestRows = 1;
    let bestCols = count;
    let bestScore = Infinity;

    // Search row counts from 1 up to min(count, 50)
    const maxRows = Math.min(count, 50);
    for (let r = 1; r <= maxRows; r++) {
        const c = Math.ceil(count / r);
        const cellW = containerWidth / c;
        const cellH = containerHeight / r;
        const aspect = cellW / cellH;

        // Heavily penalize cards wider than 1.25 (which flatten photos into horizontal slits)
        // and cards narrower than 0.60 (which squeeze photos into tall slivers)
        let penalty = 0;
        if (aspect > 1.25) penalty = (aspect - 1.25) * 8;
        if (aspect < 0.60) penalty = (0.60 - aspect) * 6;

        const score = Math.abs(aspect - targetCardAspect) + penalty;
        if (score < bestScore) {
            bestScore = score;
            bestRows = r;
            bestCols = c;
        }
    }
    return { rows: bestRows, cols: bestCols };
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
    isDark = true,
    transparentBg = false
}) => {
    // Determine effective layout mode (synced with admin Firestore control, default to ROWS)
    const effectiveLayoutMode: 'ROWS' | 'COLUMNS' | 'GRID' | 'TABLE' = 
        draftState.projectorLayoutMode || layoutMode || 'ROWS';

    // Determine category filter (synced with admin Firestore control)
    const effectiveCategoryFilter = 
        draftState.broadcastCategoryFilter || categoryFilter || 'ALL';

    // Measure live container dimensions to compute mathematical grid
    const containerRef = useRef<HTMLDivElement>(null);
    const [containerSize, setContainerSize] = useState({
        width: typeof window !== 'undefined' ? window.innerWidth - 30 : 1800,
        height: typeof window !== 'undefined' ? window.innerHeight - 80 : 900
    });

    useEffect(() => {
        const updateSize = () => {
            if (containerRef.current) {
                const rect = containerRef.current.getBoundingClientRect();
                if (rect.width > 200 && rect.height > 200) {
                    setContainerSize({ width: rect.width, height: rect.height });
                    return;
                }
            }
            if (typeof window !== 'undefined') {
                setContainerSize({
                    width: Math.max(800, window.innerWidth - 30),
                    height: Math.max(500, window.innerHeight - 80)
                });
            }
        };

        updateSize();
        window.addEventListener('resize', updateSize);
        return () => window.removeEventListener('resize', updateSize);
    }, []);

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

    const totalPlayers = displayedPlayers.length;

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
    const outerBgClass = transparentBg ? 'bg-transparent' : themeConfig.containerBg;

    // =========================================================================
    // UNIVERSAL BULLETPROOF PLAYER CARD (PROPER PHOTO, NAME, ROLE)
    // Fits gracefully whether there are 10 players or 1000 players!
    // =========================================================================
    const renderPlayerCard = (player: Player, index: number) => {
        const pickInfo = draftPickMap.get(String(player.id));
        const isSold = player.status === 'SOLD' || !!pickInfo;
        const soldTeamName = pickInfo?.teamName || player.soldTo || '';
        const soldTeamLogo = pickInfo?.teamLogo || (soldTeamName ? teamLogoMap.get(soldTeamName.trim().toLowerCase()) : undefined);

        const hasValidPhoto = !!(player.photoUrl && player.photoUrl.trim() !== '');

        return (
            <div
                key={player.id}
                className={`h-full min-h-0 w-full rounded-xl border p-0.5 md:p-1 flex flex-col justify-between overflow-hidden shadow-md transition-all relative select-none ${
                    isSold
                        ? 'bg-gradient-to-b from-red-950/90 via-zinc-950 to-black border-red-500/80 shadow-red-500/20 ring-1 ring-red-500/40'
                        : `${themeConfig.cardBg} ${themeConfig.cardBorder} hover:border-amber-400`
                }`}
            >
                {/* HERO PHOTO AREA (70-75% OF CARD HEIGHT) */}
                <div className="relative flex-1 min-h-0 w-full rounded-lg overflow-hidden bg-zinc-950 flex items-center justify-center">
                    {hasValidPhoto ? (
                        <img 
                            src={player.photoUrl} 
                            alt={player.name} 
                            className="w-full h-full object-cover object-top filter contrast-105"
                            onError={(e) => {
                                // If image fails to load, gracefully fall back to initial
                                const target = e.currentTarget;
                                target.style.display = 'none';
                                const parent = target.parentElement;
                                if (parent && !parent.querySelector('.fallback-avatar')) {
                                    const fallback = document.createElement('div');
                                    fallback.className = 'fallback-avatar w-full h-full flex flex-col items-center justify-center bg-zinc-900 text-zinc-400 font-black';
                                    fallback.innerHTML = `<span style="font-size: clamp(10px, 1.2vw, 18px);">${player.name.charAt(0)}</span>`;
                                    parent.appendChild(fallback);
                                }
                            }}
                        />
                    ) : (
                        <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-zinc-850 to-zinc-950 text-zinc-400 font-black">
                            <User className="w-1/3 h-1/3 opacity-40 mb-0.5 text-amber-400" />
                            <span className="text-[clamp(9px,1.2vw,16px)]">{player.name.charAt(0)}</span>
                        </div>
                    )}

                    {/* TOP BADGES INSIDE PHOTO AREA: Role on left, Number on right */}
                    <div className="absolute top-0.5 left-0.5 right-0.5 flex items-center justify-between gap-1 pointer-events-none z-10">
                        <span className="px-1 py-0.2 rounded bg-black/85 text-amber-300 font-black text-[clamp(6px,0.55vw,8px)] uppercase border border-amber-400/30 truncate max-w-[65%] leading-tight drop-shadow">
                            {player.role || player.category || 'PLAYER'}
                        </span>
                        <span className="px-1 py-0.2 rounded bg-black/85 text-zinc-200 font-bold text-[clamp(6px,0.55vw,8px)] border border-white/10 shrink-0 leading-tight">
                            #{player.jerseyNumber ? player.jerseyNumber : index + 1}
                        </span>
                    </div>

                    {/* SOLD BADGE & WINNING FRANCHISE OVERLAY */}
                    {isSold && (
                        <>
                            {/* Prominent SOLD Badge */}
                            <div className="absolute top-1 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded bg-gradient-to-r from-red-600 via-rose-600 to-red-600 text-white font-black text-[clamp(7px,0.6vw,9px)] uppercase tracking-wider shadow-xl border border-red-300 z-20 whitespace-nowrap drop-shadow">
                                SOLD
                            </div>

                            {/* Winning Franchise Bottom Strip with Gradient Backdrop (Preserves player face) */}
                            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/95 via-black/80 to-transparent pt-3 pb-0.5 px-0.5 flex flex-col items-center justify-center text-center z-20">
                                {soldTeamLogo ? (
                                    <img 
                                        src={soldTeamLogo} 
                                        alt="" 
                                        className="w-4 h-4 md:w-5 md:h-5 rounded-full object-contain bg-white p-0.5 mb-0.5 border border-amber-400 shrink-0 shadow" 
                                    />
                                ) : (
                                    <div className="w-4 h-4 rounded-full bg-blue-600 text-white font-black text-[7px] flex items-center justify-center mb-0.5 border border-amber-400 shrink-0">
                                        {soldTeamName.charAt(0) || '★'}
                                    </div>
                                )}
                                <p className="text-[clamp(7px,0.6vw,9px)] font-black text-amber-300 uppercase tracking-tight truncate max-w-full drop-shadow leading-none">
                                    {soldTeamName}
                                </p>
                            </div>
                        </>
                    )}
                </div>

                {/* BOTTOM BAR: Player Name and Role/Status */}
                <div className="shrink-0 px-0.5 pt-0.5 text-center leading-tight">
                    <h4 className={`font-black uppercase tracking-tight text-[clamp(7px,0.75vw,11px)] truncate ${
                        themeConfig.isLightMode ? 'text-slate-900 font-extrabold' : 'text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)]'
                    }`}>
                        {player.name}
                    </h4>

                    {isSold ? (
                        <p className="text-[clamp(6px,0.6vw,8px)] font-bold text-amber-300 uppercase truncate leading-none mt-0.5">
                            ★ {soldTeamName}
                        </p>
                    ) : (
                        <p className="text-[clamp(6px,0.6vw,8px)] font-bold text-emerald-400 uppercase truncate leading-none mt-0.5 flex items-center justify-center gap-0.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block shrink-0 animate-pulse"></span>
                            {player.role || 'Available'}
                        </p>
                    )}
                </div>
            </div>
        );
    };

    // =========================================================================
    // MODE 1 (DEFAULT): CATEGORIES IN ROWS ON LEFT (100% Mathematical Fit)
    // =========================================================================
    if (effectiveLayoutMode === 'ROWS') {
        const numGroups = Math.max(1, displayedGroups.length);
        const sidebarWidth = numGroups <= 2 ? 140 : 120;
        const availableHeight = containerSize.height;
        const availableWidth = containerSize.width;
        const categoryHeight = Math.max(120, (availableHeight - (numGroups - 1) * 8) / numGroups);
        const playersWidth = Math.max(300, availableWidth - sidebarWidth - 24);

        return (
            <div 
                ref={containerRef}
                className={`w-full h-full min-h-0 flex flex-col gap-2 p-1 overflow-hidden select-none ${outerBgClass}`}
            >
                {displayedGroups.map(group => {
                    const groupCount = group.players.length;
                    const { rows, cols } = computeOptimalGrid(groupCount, playersWidth, categoryHeight - 16, 0.85);

                    return (
                        <div 
                            key={group.category}
                            className={`flex-1 min-h-0 w-full flex flex-row items-stretch rounded-2xl border-2 ${themeConfig.headerBorder} ${themeConfig.headerBg} p-1.5 overflow-hidden shadow-2xl gap-2`}
                        >
                            {/* LEFT SIDE: COMPACT CATEGORY BANNER */}
                            <div 
                                style={{ width: `${sidebarWidth}px` }}
                                className={`shrink-0 rounded-xl ${themeConfig.categoryStripBg} border ${themeConfig.categoryStripBorder} p-2 flex flex-col justify-between items-center text-center shadow-lg`}
                            >
                                <div className="w-full">
                                    <div className={`w-7 h-7 rounded-full mx-auto mb-1 flex items-center justify-center shadow ${
                                        themeConfig.isLightMode ? 'bg-blue-600 text-white' : 'bg-amber-500/20 border border-amber-500/50 text-amber-400'
                                    }`}>
                                        <Trophy className="w-3.5 h-3.5" />
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

                            {/* RIGHT SIDE: MATHEMATICALLY PERFECT PLAYER GRID (ZERO SCROLL, PROPER PHOTOS) */}
                            <div 
                                style={{
                                    display: 'grid',
                                    gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
                                    gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))`,
                                    gap: groupCount > 70 ? '2px' : groupCount > 35 ? '3px' : '5px',
                                    width: '100%',
                                    height: '100%',
                                }}
                                className="flex-1 min-h-0 overflow-hidden"
                            >
                                {group.players.map((player, idx) => renderPlayerCard(player, idx))}
                            </div>
                        </div>
                    );
                })}
            </div>
        );
    }

    // =========================================================================
    // MODE 2: CATEGORY COLUMNS SIDE-BY-SIDE (100% Mathematical Fit)
    // =========================================================================
    if (effectiveLayoutMode === 'COLUMNS') {
        const numGroups = Math.max(1, displayedGroups.length);
        const colWidth = (containerSize.width - (numGroups - 1) * 8) / numGroups;
        const colHeight = containerSize.height - 45;

        return (
            <div 
                ref={containerRef}
                className={`w-full h-full min-h-0 flex flex-row gap-2 p-1 overflow-hidden select-none ${outerBgClass}`}
            >
                {displayedGroups.map(group => {
                    const groupCount = group.players.length;
                    const { rows, cols } = computeOptimalGrid(groupCount, colWidth, colHeight, 0.85);

                    return (
                        <div 
                            key={group.category}
                            className={`flex-1 min-h-0 h-full flex flex-col rounded-2xl border ${themeConfig.isLightMode ? 'border-slate-300 bg-white' : 'border-zinc-800 bg-zinc-900/60'} p-1.5 overflow-hidden shadow-2xl`}
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
                            <div 
                                style={{
                                    display: 'grid',
                                    gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
                                    gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))`,
                                    gap: groupCount > 70 ? '2px' : groupCount > 35 ? '3px' : '5px',
                                    width: '100%',
                                    height: '100%',
                                }}
                                className="flex-1 min-h-0 overflow-hidden"
                            >
                                {group.players.map((player, idx) => renderPlayerCard(player, idx))}
                            </div>
                        </div>
                    );
                })}
            </div>
        );
    }

    // =========================================================================
    // MODE 3: UNIFIED AUTO-FIT GRID MATRIX (100% Mathematical Fit)
    // =========================================================================
    if (effectiveLayoutMode === 'GRID') {
        const { rows, cols } = computeOptimalGrid(totalPlayers, containerSize.width, containerSize.height, 0.85);

        return (
            <div 
                ref={containerRef}
                className={`w-full h-full min-h-0 p-1 overflow-hidden select-none ${outerBgClass}`}
            >
                <div 
                    style={{
                        display: 'grid',
                        gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
                        gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))`,
                        gap: totalPlayers > 100 ? '2px' : totalPlayers > 50 ? '3px' : '5px',
                        width: '100%',
                        height: '100%',
                    }}
                    className="w-full h-full min-h-0 overflow-hidden"
                >
                    {displayedPlayers.map((player, idx) => renderPlayerCard(player, idx))}
                </div>
            </div>
        );
    }

    // =========================================================================
    // MODE 4: MULTI-PANE FIT-TO-SCREEN TABLE (Zero Scroll)
    // =========================================================================
    return (
        <div 
            ref={containerRef}
            className={`w-full h-full min-h-0 flex flex-row gap-2.5 p-1 overflow-hidden select-none ${outerBgClass}`}
        >
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
                                                    className="w-8 h-8 rounded-lg object-cover object-top shrink-0 border border-zinc-700 shadow" 
                                                />
                                            ) : (
                                                <div className="w-8 h-8 rounded-lg bg-zinc-800 flex items-center justify-center font-black text-xs text-zinc-400 shrink-0">
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
