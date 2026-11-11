import React, { useMemo } from 'react';
import { Team, Player, DraftBoardState, DraftPickHistory } from '../../types';
import { Users, Shield, Trophy, Check, User } from 'lucide-react';
import { getDraftTheme } from '../../utils/draftThemes';

interface Props {
    teams: Team[];
    players: Player[];
    draftPickMap: Map<string, DraftPickHistory>;
    draftState: DraftBoardState;
    selectedTeamId?: string | number | 'ALL';
    isDark?: boolean;
}

export const ProjectorSquadsView: React.FC<Props> = ({
    teams,
    players,
    draftPickMap,
    draftState,
    selectedTeamId = 'ALL',
    isDark = true
}) => {
    // Theme styling based on Admin selected broadcast theme
    const themeConfig = getDraftTheme(draftState.broadcastTheme);

    // Map team id to their drafted players
    const teamSquads = useMemo(() => {
        return teams.map(team => {
            // Find all players picked by this team either from draft history or squad list
            const teamPicks = (draftState.history || []).filter(h => String(h.teamId) === String(team.id));
            const pickedPlayerIds = new Set(teamPicks.map(p => String(p.playerId)));
            
            // Also include any players in team.players
            const existingPlayers = (team.players || []).map(p => ({
                id: p.id,
                name: p.name,
                role: p.role || p.category || 'Player',
                category: p.category || p.role || 'Player',
                photoUrl: p.photoUrl || '',
                jerseyNumber: p.jerseyNumber || '',
                soldPrice: p.soldPrice || 0
            }));

            // Merge with full player profiles
            const mergedSquad: {
                id: string | number;
                name: string;
                role: string;
                category: string;
                photoUrl: string;
                jerseyNumber: string | number;
            }[] = [];

            const seenIds = new Set<string>();

            // Add draft picks first
            teamPicks.forEach(pick => {
                const fullP = players.find(p => String(p.id) === String(pick.playerId));
                const pid = String(pick.playerId);
                if (!seenIds.has(pid)) {
                    seenIds.add(pid);
                    mergedSquad.push({
                        id: pick.playerId,
                        name: pick.playerName,
                        role: pick.playerRole || pick.playerCategory || 'Player',
                        category: pick.playerCategory || 'General',
                        photoUrl: pick.playerPhoto || fullP?.photoUrl || '',
                        jerseyNumber: fullP?.jerseyNumber || ''
                    });
                }
            });

            // Add existing squad players if not already added
            existingPlayers.forEach(p => {
                const pid = String(p.id);
                if (!seenIds.has(pid)) {
                    seenIds.add(pid);
                    mergedSquad.push({
                        id: p.id,
                        name: p.name,
                        role: p.role,
                        category: p.category,
                        photoUrl: p.photoUrl,
                        jerseyNumber: p.jerseyNumber
                    });
                }
            });

            return {
                team,
                squad: mergedSquad
            };
        });
    }, [teams, players, draftState.history]);

    // If a specific team is focused
    const focusedTeamData = useMemo(() => {
        if (!selectedTeamId || selectedTeamId === 'ALL') return null;
        return teamSquads.find(ts => String(ts.team.id) === String(selectedTeamId)) || null;
    }, [teamSquads, selectedTeamId]);

    // Dynamic grid columns for all teams layout
    const allTeamsColsClass = useMemo(() => {
        const count = teams.length;
        if (count <= 2) return 'grid-cols-2';
        if (count <= 4) return 'grid-cols-2 lg:grid-cols-4';
        if (count <= 6) return 'grid-cols-2 md:grid-cols-3 lg:grid-cols-6';
        if (count <= 8) return 'grid-cols-2 md:grid-cols-4';
        return 'grid-cols-2 md:grid-cols-4 lg:grid-cols-5';
    }, [teams.length]);

    // =========================================================================
    // SINGLE FOCUSED TEAM SHOWCASE
    // =========================================================================
    if (focusedTeamData) {
        const { team, squad } = focusedTeamData;
        const totalDrafted = squad.length;

        return (
            <div className={`w-full h-full min-h-0 flex flex-col p-2 select-none overflow-hidden ${themeConfig.containerBg}`}>
                {/* Team Showcase Banner */}
                <div className={`shrink-0 flex items-center justify-between px-4 py-2 rounded-2xl ${themeConfig.headerBg} border-2 ${themeConfig.headerBorder} mb-2 shadow-2xl`}>
                    <div className="flex items-center gap-3">
                        {team.logoUrl ? (
                            <img 
                                src={team.logoUrl} 
                                alt={team.name} 
                                className="w-12 h-12 rounded-full object-contain bg-white p-1 shadow-md border-2 border-amber-400" 
                            />
                        ) : (
                            <div className="w-12 h-12 rounded-full bg-blue-600 text-white font-black text-xl flex items-center justify-center border-2 border-amber-400">
                                {team.name.charAt(0)}
                            </div>
                        )}
                        <div>
                            <div className="flex items-center gap-2">
                                <span className="text-[9px] font-black uppercase tracking-widest text-amber-400 px-2 py-0.5 rounded bg-black/60 border border-amber-500/40">
                                    Official Squad
                                </span>
                                <span className="text-xs font-bold text-zinc-400">
                                    Total Drafted: <strong className="text-white">{totalDrafted} Players</strong>
                                </span>
                            </div>
                            <h2 className="text-xl md:text-2xl font-black uppercase italic tracking-tight text-white drop-shadow">
                                {team.name}
                            </h2>
                        </div>
                    </div>

                    <div className="flex items-center gap-3">
                        <div className="text-right px-3 py-1 rounded-xl bg-black/60 border border-white/10">
                            <p className="text-[8px] font-black uppercase tracking-wider text-zinc-400">Squad Size</p>
                            <p className="text-base font-black text-amber-400">{totalDrafted}</p>
                        </div>
                    </div>
                </div>

                {/* Squad Players Grid (Fit 100% Height) */}
                <div className="flex-1 min-h-0 w-full overflow-hidden">
                    {squad.length === 0 ? (
                        <div className="w-full h-full flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-zinc-800 text-zinc-500">
                            <Users className="w-12 h-12 mb-2 opacity-40 text-amber-500" />
                            <p className="text-base font-black uppercase tracking-wider text-zinc-300">No Players Drafted Yet</p>
                            <p className="text-xs font-bold text-zinc-500 mt-1 uppercase">Selections for this franchise will appear here</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 auto-rows-fr gap-2 h-full w-full overflow-hidden">
                            {squad.map((player, idx) => (
                                <div 
                                    key={player.id}
                                    className="h-full min-h-0 rounded-2xl border-2 border-amber-500/40 bg-gradient-to-b from-zinc-900 via-zinc-900/90 to-zinc-950 p-2 flex flex-col justify-between overflow-hidden shadow-lg"
                                >
                                    <div className="flex items-center justify-between gap-1 mb-1">
                                        <span className="text-[8px] font-black uppercase px-2 py-0.5 rounded bg-black/60 text-amber-400 truncate max-w-[75%] border border-white/5">
                                            {player.role || player.category}
                                        </span>
                                        <span className="text-[9px] font-black text-zinc-400">
                                            #{idx + 1}
                                        </span>
                                    </div>

                                    {/* Player Avatar */}
                                    <div className="relative flex-1 min-h-0 rounded-xl overflow-hidden bg-zinc-950 border border-zinc-800 my-1 flex items-center justify-center">
                                        {player.photoUrl ? (
                                            <img src={player.photoUrl} alt="" className="w-full h-full object-cover" />
                                        ) : (
                                            <div className="w-full h-full flex items-center justify-center text-zinc-600 font-black text-2xl">
                                                {player.name.charAt(0)}
                                            </div>
                                        )}
                                    </div>

                                    {/* Player Name */}
                                    <div className="mt-1 text-center">
                                        <p className="font-black uppercase tracking-tight text-white text-xs md:text-sm truncate drop-shadow">
                                            {player.name}
                                        </p>
                                        <p className="text-[9px] font-bold text-amber-400 uppercase tracking-wider truncate">
                                            {player.role}
                                            {player.jerseyNumber ? ` • #${player.jerseyNumber}` : ''}
                                        </p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        );
    }

    // =========================================================================
    // ALL TEAMS SQUAD OVERVIEW (Fit 100% Height Side-by-Side)
    // =========================================================================
    return (
        <div className={`w-full h-full min-h-0 flex flex-col p-2 select-none overflow-hidden ${themeConfig.containerBg}`}>
            {/* Top Squad Overview Header */}
            <div className={`shrink-0 flex items-center justify-between px-3 py-1.5 rounded-xl ${themeConfig.headerBg} border ${themeConfig.headerBorder} mb-2 shadow-lg`}>
                <div className="flex items-center gap-2">
                    <Trophy className="w-4 h-4 text-amber-400" />
                    <h2 className="text-xs md:text-sm font-black uppercase tracking-wider text-white">
                        Tournament Squads Overview
                    </h2>
                    <span className="text-[9px] font-bold text-zinc-400 uppercase">
                        ({teams.length} Franchises)
                    </span>
                </div>
                <div className="text-[9px] font-black text-amber-400 uppercase tracking-widest flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                    Live Roster Summary
                </div>
            </div>

            {/* Grid of Teams (Auto-rows stretch to 100% height) */}
            <div className={`grid ${allTeamsColsClass} auto-rows-fr gap-2 flex-1 min-h-0 w-full overflow-hidden`}>
                {teamSquads.map(({ team, squad }) => {
                    return (
                        <div 
                            key={team.id}
                            className={`h-full min-h-0 flex flex-col rounded-2xl border-2 ${themeConfig.cardBorder} ${themeConfig.cardBg} p-2 overflow-hidden shadow-xl`}
                        >
                            {/* Team Card Header */}
                            <div className="shrink-0 flex items-center justify-between pb-1.5 mb-1.5 border-b border-white/10">
                                <div className="flex items-center gap-2 min-w-0 pr-1">
                                    {team.logoUrl ? (
                                        <img 
                                            src={team.logoUrl} 
                                            alt={team.name} 
                                            className="w-7 h-7 rounded-full object-contain bg-white p-0.5 border border-amber-400/60 shrink-0 shadow" 
                                        />
                                    ) : (
                                        <div className="w-7 h-7 rounded-full bg-blue-600 text-white font-black text-xs flex items-center justify-center shrink-0">
                                            {team.name.charAt(0)}
                                        </div>
                                    )}
                                    <div className="min-w-0">
                                        <h3 className="font-black uppercase tracking-tight text-white text-xs md:text-sm truncate drop-shadow">
                                            {team.name}
                                        </h3>
                                        <span className="text-[8px] font-bold text-amber-400 uppercase tracking-wider block">
                                            {squad.length} Picked
                                        </span>
                                    </div>
                                </div>
                            </div>

                            {/* Squad Roster List (Auto-distribute vertically to fit 100% height) */}
                            <div className="flex-1 min-h-0 flex flex-col justify-start gap-1 overflow-hidden">
                                {squad.length === 0 ? (
                                    <div className="h-full flex flex-col items-center justify-center text-zinc-600 text-center p-2 border border-dashed border-zinc-800/80 rounded-xl">
                                        <p className="text-[10px] font-black uppercase text-zinc-400">No Draft Picks Yet</p>
                                    </div>
                                ) : (
                                    squad.map((player, idx) => (
                                        <div 
                                            key={player.id}
                                            className="flex-1 min-h-[24px] max-h-[38px] flex items-center justify-between px-2 py-0.5 rounded-lg bg-zinc-950/80 border border-white/[0.06] overflow-hidden"
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
                                                    <p className="font-black uppercase text-white text-[10px] md:text-xs truncate leading-tight">
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

export default ProjectorSquadsView;
