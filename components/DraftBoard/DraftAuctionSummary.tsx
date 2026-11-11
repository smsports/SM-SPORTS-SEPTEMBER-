import React, { useEffect, useMemo, useState } from 'react';
import { Team, Player, DraftBoardState, DraftPickHistory } from '../../types';
import { Trophy, Users, Download, RotateCcw, Printer, ArrowLeft, Check, Shield, Star, Sparkles } from 'lucide-react';
import confetti from 'canvas-confetti';
import * as XLSX from 'xlsx';
import { getDraftTheme } from '../../utils/draftThemes';

interface Props {
    tournamentName?: string;
    auctionLogoUrl?: string;
    systemLogoUrl?: string;
    teams: Team[];
    players: Player[];
    draftPickMap: Map<string, DraftPickHistory>;
    draftState: DraftBoardState;
    isAdmin?: boolean;
    isProjectorView?: boolean;
    isOBSView?: boolean;
    auctionId?: string;
    onReopenDraft?: () => Promise<void>;
}

export const DraftAuctionSummary: React.FC<Props> = ({
    tournamentName = "LIVE AUCTION",
    auctionLogoUrl,
    systemLogoUrl,
    teams,
    players,
    draftPickMap,
    draftState,
    isAdmin = false,
    isProjectorView = false,
    isOBSView = false,
    auctionId,
    onReopenDraft
}) => {
    const themeConfig = getDraftTheme(draftState.broadcastTheme);

    // Launch celebratory confetti on summary display
    useEffect(() => {
        try {
            confetti({
                particleCount: 100,
                spread: 100,
                origin: { y: 0.4 }
            });
            const t1 = setTimeout(() => {
                confetti({
                    particleCount: 60,
                    angle: 60,
                    spread: 60,
                    origin: { x: 0, y: 0.6 }
                });
                confetti({
                    particleCount: 60,
                    angle: 120,
                    spread: 60,
                    origin: { x: 1, y: 0.6 }
                });
            }, 500);
            return () => clearTimeout(t1);
        } catch (_) {}
    }, []);

    // Build consolidated team squads
    const teamSquads = useMemo(() => {
        return teams.map(team => {
            const teamPicks = (draftState.history || []).filter(h => String(h.teamId) === String(team.id));
            const seenIds = new Set<string>();
            const roster: {
                id: string | number;
                name: string;
                role: string;
                category: string;
                photoUrl: string;
                soldPrice: number;
            }[] = [];

            // Add draft picks
            teamPicks.forEach(pick => {
                const pid = String(pick.playerId);
                if (!seenIds.has(pid)) {
                    seenIds.add(pid);
                    const pFull = players.find(p => String(p.id) === pid);
                    roster.push({
                        id: pick.playerId,
                        name: pick.playerName,
                        role: pick.playerRole || pick.playerCategory || 'Player',
                        category: pick.playerCategory || 'General',
                        photoUrl: pick.playerPhoto || pFull?.photoUrl || '',
                        soldPrice: Number(pick.soldPrice || 0)
                    });
                }
            });

            // Also merge any existing squad players on team object
            (team.players || []).forEach(p => {
                const pid = String(p.id);
                if (!seenIds.has(pid)) {
                    seenIds.add(pid);
                    roster.push({
                        id: p.id,
                        name: p.name,
                        role: p.role || p.category || 'Player',
                        category: p.category || 'General',
                        photoUrl: p.photoUrl || '',
                        soldPrice: Number(p.soldPrice || 0)
                    });
                }
            });

            const totalSpent = roster.reduce((sum, p) => sum + p.soldPrice, 0);

            return {
                team,
                squad: roster,
                totalSpent
            };
        });
    }, [teams, players, draftState.history]);

    // Global stats
    const totalSold = useMemo(() => {
        return players.filter(p => p.status === 'SOLD' || draftPickMap.has(String(p.id))).length;
    }, [players, draftPickMap]);

    const totalPurseSpent = useMemo(() => {
        return teamSquads.reduce((sum, ts) => sum + ts.totalSpent, 0);
    }, [teamSquads]);

    // Category breakdown
    const categoryCounts = useMemo(() => {
        const map = new Map<string, number>();
        players.forEach(p => {
            const isSold = p.status === 'SOLD' || draftPickMap.has(String(p.id));
            if (isSold) {
                const cat = p.category || p.role || 'Player';
                map.set(cat, (map.get(cat) || 0) + 1);
            }
        });
        return Array.from(map.entries());
    }, [players, draftPickMap]);

    // Export to Excel
    const handleExportExcel = () => {
        const rows: any[] = [];
        teamSquads.forEach(({ team, squad }) => {
            squad.forEach((p, idx) => {
                rows.push({
                    'Team Name': team.name,
                    'Pick #': idx + 1,
                    'Player Name': p.name,
                    'Role / Category': p.role,
                    'Sold Price': p.soldPrice
                });
            });
        });

        const ws = XLSX.utils.json_to_sheet(rows);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Draft Summary");
        XLSX.writeFile(wb, `${tournamentName.replace(/\s+/g, '_')}_Draft_Summary.xlsx`);
    };

    // Print summary
    const handlePrint = () => {
        window.print();
    };

    // Dynamic grid columns for all teams in summary
    const teamsGridCols = useMemo(() => {
        const count = teams.length;
        if (count <= 2) return 'grid-cols-2';
        if (count <= 4) return 'grid-cols-2 lg:grid-cols-4';
        if (count <= 6) return 'grid-cols-2 md:grid-cols-3 lg:grid-cols-6';
        if (count <= 8) return 'grid-cols-2 md:grid-cols-4';
        return 'grid-cols-2 md:grid-cols-3 lg:grid-cols-5';
    }, [teams.length]);

    return (
        <div className={`w-full h-full min-h-0 flex flex-col p-2 md:p-3 overflow-hidden select-none ${themeConfig.containerBg}`}>
            {/* Grand Header */}
            <div className={`shrink-0 flex items-center justify-between px-4 py-2.5 rounded-2xl border mb-2 shadow-2xl backdrop-blur-md ${themeConfig.headerBg} ${themeConfig.headerBorder}`}>
                {/* Left: Tournament Identity */}
                <div className="flex items-center gap-3">
                    {auctionLogoUrl ? (
                        <img src={auctionLogoUrl} alt="" className="w-10 h-10 rounded-xl object-contain bg-white p-1 border shadow" />
                    ) : systemLogoUrl ? (
                        <img src={systemLogoUrl} alt="" className="h-9 w-auto object-contain" />
                    ) : (
                        <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400 font-black shadow">
                            <Trophy className="w-6 h-6" />
                        </div>
                    )}
                    <div>
                        <div className="flex items-center gap-2">
                            <span className="px-2 py-0.5 rounded-md bg-emerald-500/20 border border-emerald-500/40 text-[9px] font-black uppercase tracking-widest text-emerald-400 flex items-center gap-1 shadow-sm">
                                <Sparkles className="w-3 h-3 text-emerald-400 animate-spin" /> AUCTION COMPLETED
                            </span>
                            <span className="text-[10px] font-bold text-amber-400 uppercase tracking-widest">
                                Official Summary
                            </span>
                        </div>
                        <h1 className="text-base md:text-xl font-black uppercase italic tracking-tight text-white drop-shadow">
                            {tournamentName}
                        </h1>
                    </div>
                </div>

                {/* Center / Right: Global Metrics & Admin Action Buttons */}
                <div className="flex items-center gap-3">
                    {/* Metrics Badges */}
                    <div className="hidden sm:flex items-center gap-2">
                        <div className="px-3 py-1 rounded-xl bg-black/60 border border-white/10 text-center">
                            <p className="text-[7px] font-bold text-zinc-400 uppercase tracking-wider">Players Drafted</p>
                            <p className="text-sm font-black text-emerald-400">{totalSold} / {players.length}</p>
                        </div>
                        <div className="px-3 py-1 rounded-xl bg-black/60 border border-white/10 text-center">
                            <p className="text-[7px] font-bold text-zinc-400 uppercase tracking-wider">Franchises</p>
                            <p className="text-sm font-black text-amber-400">{teams.length}</p>
                        </div>
                    </div>

                    {/* Admin Action Buttons (Hidden on Projector & OBS for clean broadcast) */}
                    {!isProjectorView && !isOBSView && isAdmin && (
                        <div className="flex items-center gap-1.5">
                            <button
                                onClick={handleExportExcel}
                                className="py-2 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs uppercase tracking-wider flex items-center gap-1.5 shadow-md active:scale-95 transition-all"
                                title="Download Summary as Excel (.xlsx)"
                            >
                                <Download className="w-3.5 h-3.5" /> Export Excel
                            </button>
                            <button
                                onClick={handlePrint}
                                className="py-2 px-3 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 font-bold text-xs uppercase tracking-wider flex items-center gap-1.5 shadow-sm active:scale-95 transition-all"
                                title="Print Summary Document"
                            >
                                <Printer className="w-3.5 h-3.5" /> Print
                            </button>
                            {onReopenDraft && (
                                <button
                                    onClick={onReopenDraft}
                                    className="py-2 px-3 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-400 border border-amber-500/40 font-black text-xs uppercase tracking-wider flex items-center gap-1.5 active:scale-95 transition-all"
                                    title="Reopen Draft Auction to make more picks"
                                >
                                    <RotateCcw className="w-3.5 h-3.5" /> Reopen Draft
                                </button>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {/* Quick Category Summary Bar */}
            {categoryCounts.length > 0 && (
                <div className="shrink-0 flex items-center gap-2 mb-2 px-3 py-1.5 rounded-xl bg-zinc-950/80 border border-white/10 overflow-x-auto custom-scrollbar">
                    <span className="text-[9px] font-black uppercase tracking-wider text-zinc-400 shrink-0">
                        Category Draft Counts:
                    </span>
                    {categoryCounts.map(([catName, count]) => (
                        <div key={catName} className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg bg-black/60 border border-white/10 text-[9px] font-bold text-white shrink-0">
                            <span className="text-amber-400 font-black">{catName}:</span>
                            <span className="text-emerald-400 font-black">{count}</span>
                        </div>
                    ))}
                </div>
            )}

            {/* Team Squads Grid (Consumes 100% Height with Zero Scrolling on Projector) */}
            <div className={`grid ${teamsGridCols} auto-rows-fr gap-2 flex-1 min-h-0 w-full overflow-hidden`}>
                {teamSquads.map(({ team, squad, totalSpent }) => {
                    return (
                        <div 
                            key={team.id}
                            className={`h-full min-h-0 flex flex-col rounded-2xl border-2 p-2 overflow-hidden shadow-2xl ${themeConfig.cardBg} ${themeConfig.cardBorder}`}
                        >
                            {/* Team Header */}
                            <div className="shrink-0 flex items-center justify-between pb-1.5 mb-1.5 border-b border-white/10">
                                <div className="flex items-center gap-2 min-w-0 pr-1">
                                    {team.logoUrl ? (
                                        <img 
                                            src={team.logoUrl} 
                                            alt={team.name} 
                                            className="w-8 h-8 rounded-full object-contain bg-white p-0.5 border-2 border-amber-400/80 shrink-0 shadow-md" 
                                        />
                                    ) : (
                                        <div className="w-8 h-8 rounded-full bg-blue-600 text-white font-black text-xs flex items-center justify-center shrink-0 border border-amber-400">
                                            {team.name.charAt(0)}
                                        </div>
                                    )}
                                    <div className="min-w-0">
                                        <h3 className="font-black uppercase tracking-tight text-white text-xs md:text-sm truncate drop-shadow">
                                            {team.name}
                                        </h3>
                                        <div className="flex items-center gap-1.5 text-[8px] font-bold text-amber-400 uppercase">
                                            <span>{squad.length} Drafted</span>
                                            {totalSpent > 0 && <span>• ₹{totalSpent.toLocaleString()}</span>}
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Squad Roster Body (Fits 100% Height) */}
                            <div className="flex-1 min-h-0 flex flex-col justify-start gap-1 overflow-hidden">
                                {squad.length === 0 ? (
                                    <div className="h-full flex flex-col items-center justify-center text-zinc-600 text-center p-2 border border-dashed border-zinc-800/80 rounded-xl">
                                        <p className="text-[10px] font-black uppercase text-zinc-500">No Draft Picks</p>
                                    </div>
                                ) : (
                                    squad.map((player, idx) => (
                                        <div 
                                            key={player.id}
                                            className="flex-1 min-h-[26px] max-h-[40px] flex items-center justify-between px-2 py-0.5 rounded-lg bg-zinc-950/90 border border-white/[0.08] overflow-hidden"
                                        >
                                            <div className="flex items-center gap-1.5 min-w-0 pr-1">
                                                <span className="text-[8px] font-bold text-zinc-500 w-3.5 shrink-0">
                                                    #{idx + 1}
                                                </span>
                                                {player.photoUrl ? (
                                                    <img 
                                                        src={player.photoUrl} 
                                                        alt="" 
                                                        className="w-5 h-5 rounded-md object-cover border border-zinc-700 shrink-0" 
                                                    />
                                                ) : (
                                                    <div className="w-5 h-5 rounded-md bg-zinc-800 text-zinc-400 font-black text-[9px] flex items-center justify-center shrink-0">
                                                        {player.name.charAt(0)}
                                                    </div>
                                                )}
                                                <div className="min-w-0">
                                                    <p className="font-black uppercase text-white text-[10px] md:text-xs truncate leading-tight drop-shadow">
                                                        {player.name}
                                                    </p>
                                                </div>
                                            </div>

                                            <span className="text-[8px] font-bold text-amber-400 uppercase px-1.5 py-0.2 rounded bg-amber-500/10 border border-amber-500/20 shrink-0">
                                                {player.role || player.category}
                                            </span>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

export default DraftAuctionSummary;
