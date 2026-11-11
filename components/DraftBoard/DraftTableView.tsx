import React, { useState, useMemo } from 'react';
import { Player, Team, AuctionCategory, DraftPickHistory } from '../../types';
import { Check, X, Shield, ArrowUpDown, Undo2, Trophy } from 'lucide-react';

interface Props {
    players: Player[];
    categories: AuctionCategory[];
    teams: Team[];
    draftPickMap: Map<string, DraftPickHistory>;
    onSelectPlayer: (player: Player) => void;
    onUndoPlayer?: (player: Player) => void;
    isDark?: boolean;
    isAdmin?: boolean;
    isProjectorView?: boolean;
    isOBSView?: boolean;
}

export const DraftTableView: React.FC<Props> = ({
    players,
    categories,
    teams,
    draftPickMap,
    onSelectPlayer,
    onUndoPlayer,
    isDark = true,
    isAdmin = false,
    isProjectorView = false,
    isOBSView = false
}) => {
    const isBroadcast = isProjectorView || isOBSView;
    const [sortField, setSortField] = useState<'name' | 'category' | 'status'>('name');
    const [sortAsc, setSortAsc] = useState(true);

    const handleSort = (field: 'name' | 'category' | 'status') => {
        if (isBroadcast) return;
        if (sortField === field) {
            setSortAsc(!sortAsc);
        } else {
            setSortField(field);
            setSortAsc(true);
        }
    };

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

    const sortedPlayers = useMemo(() => {
        return [...players].sort((a, b) => {
            let valA: any = a[sortField] || '';
            let valB: any = b[sortField] || '';

            if (sortField === 'status') {
                valA = a.status === 'SOLD' || draftPickMap.has(String(a.id)) ? 'SOLD' : 'AVAILABLE';
                valB = b.status === 'SOLD' || draftPickMap.has(String(b.id)) ? 'SOLD' : 'AVAILABLE';
            }

            if (typeof valA === 'string') {
                return sortAsc ? valA.localeCompare(valB) : valB.localeCompare(valA);
            }
            return sortAsc ? valA - valB : valB - valA;
        });
    }, [players, sortField, sortAsc, draftPickMap]);

    return (
        <div className={`w-full h-full flex flex-col min-h-0 rounded-2xl border overflow-hidden shadow-2xl ${
            isDark ? 'bg-zinc-900 border-zinc-800' : 'bg-white border-gray-200'
        }`}>
            {/* Table Header Bar */}
            <div className="shrink-0 flex items-center justify-between px-4 py-2.5 border-b border-white/5 bg-zinc-950/80">
                <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-blue-500 animate-pulse" />
                    <h3 className="text-xs md:text-sm font-black uppercase tracking-wider text-white">
                        Draft Roster Table ({players.length} Players)
                    </h3>
                </div>
                <div className="flex items-center gap-3 text-xs font-bold">
                    <span className="text-emerald-400">
                        Available: {players.filter(p => p.status !== 'SOLD' && !draftPickMap.has(String(p.id))).length}
                    </span>
                    <span className="text-amber-400">
                        Drafted: {players.filter(p => p.status === 'SOLD' || draftPickMap.has(String(p.id))).length}
                    </span>
                </div>
            </div>

            {/* Scrollable Table Body - Consuming 100% Available Screen Space */}
            <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar">
                <table className="w-full text-left border-collapse table-fixed">
                    <thead className="sticky top-0 z-20">
                        <tr className={`border-b text-[10px] md:text-xs font-black uppercase tracking-wider ${
                            isDark ? 'bg-zinc-950/95 border-zinc-800 text-zinc-400' : 'bg-gray-100 border-gray-200 text-gray-600'
                        }`}>
                            <th className="py-3 px-3 w-12 text-center">#</th>
                            <th className="py-3 px-4 w-4/12">Player Name</th>
                            <th 
                                onClick={() => handleSort('category')}
                                className={`py-3 px-3 w-2/12 ${!isBroadcast ? 'cursor-pointer hover:text-blue-400' : ''}`}
                            >
                                <div className="flex items-center gap-1">
                                    Category
                                    {!isBroadcast && <ArrowUpDown className="w-3 h-3" />}
                                </div>
                            </th>
                            <th className="py-3 px-3 w-2/12">Role</th>
                            <th 
                                onClick={() => handleSort('status')}
                                className={`py-3 px-3 w-2/12 text-center ${!isBroadcast ? 'cursor-pointer hover:text-blue-400' : ''}`}
                            >
                                <div className="flex items-center justify-center gap-1">
                                    Status
                                    {!isBroadcast && <ArrowUpDown className="w-3 h-3" />}
                                </div>
                            </th>
                            <th className="py-3 px-4 w-3/12">Drafted Franchise</th>
                            {!isBroadcast && <th className="py-3 px-3 w-20 text-right">Action</th>}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-black/5 dark:divide-white/5 text-xs md:text-sm">
                        {sortedPlayers.map((player, idx) => {
                            const pickInfo = draftPickMap.get(String(player.id));
                            const isSold = player.status === 'SOLD' || !!pickInfo;
                            const soldTeam = pickInfo?.teamName || player.soldTo || '';
                            const teamLogo = pickInfo?.teamLogo || (soldTeam ? teamLogoMap.get(soldTeam.trim().toLowerCase()) : undefined);

                            return (
                                <tr 
                                    key={player.id}
                                    onClick={!isBroadcast ? () => onSelectPlayer(player) : undefined}
                                    className={`transition-colors ${
                                        !isBroadcast ? 'cursor-pointer' : 'cursor-default'
                                    } ${
                                        isSold
                                            ? isDark ? 'bg-red-950/20 text-zinc-300 hover:bg-red-950/30' : 'bg-red-50 text-gray-700'
                                            : isDark ? 'hover:bg-zinc-800/60 text-zinc-200' : 'hover:bg-blue-50/60 text-gray-800'
                                    }`}
                                >
                                    <td className="py-2.5 px-3 font-bold text-gray-400 text-center text-xs">
                                        {idx + 1}
                                    </td>
                                    
                                    {/* Player Info with Photo */}
                                    <td className="py-2.5 px-4">
                                        <div className="flex items-center gap-3">
                                            {player.photoUrl ? (
                                                <img 
                                                    src={player.photoUrl} 
                                                    alt="" 
                                                    className={`w-9 h-9 md:w-10 md:h-10 rounded-xl object-cover shrink-0 border border-zinc-700 ${
                                                        isSold ? 'grayscale contrast-125 opacity-60' : ''
                                                    }`} 
                                                />
                                            ) : (
                                                <div className="w-9 h-9 md:w-10 md:h-10 rounded-xl bg-zinc-800 flex items-center justify-center font-black text-xs md:text-sm shrink-0">
                                                    {player.name.charAt(0)}
                                                </div>
                                            )}
                                            <div className="min-w-0">
                                                <p className="font-black uppercase tracking-tight text-white line-clamp-1 text-xs md:text-sm">
                                                    {player.name}
                                                </p>
                                                {player.jerseyNumber ? (
                                                    <span className="text-[10px] text-amber-400 font-bold">#{player.jerseyNumber}</span>
                                                ) : (
                                                    <span className="text-[9px] text-zinc-500 font-bold">#{player.id}</span>
                                                )}
                                            </div>
                                        </div>
                                    </td>

                                    {/* Category */}
                                    <td className="py-2.5 px-3 font-black text-zinc-300 uppercase text-[11px] md:text-xs truncate">
                                        {player.category || 'General'}
                                    </td>

                                    {/* Role */}
                                    <td className="py-2.5 px-3 font-bold uppercase text-[11px] md:text-xs text-zinc-400 truncate">
                                        {player.role || 'Player'}
                                    </td>

                                    {/* STATUS: Bold Vibrant Colors & Text */}
                                    <td className="py-2.5 px-3 text-center">
                                        {isSold ? (
                                            <span className="px-3 py-1 rounded-md text-[10px] md:text-xs font-black uppercase tracking-widest bg-gradient-to-r from-red-600 to-rose-600 text-white shadow-md ring-2 ring-red-500/50 inline-flex items-center gap-1">
                                                SOLD
                                            </span>
                                        ) : (
                                            <span className="px-3 py-1 rounded-md text-[10px] md:text-xs font-black uppercase tracking-wider bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 inline-flex items-center gap-1 shadow-sm">
                                                <Check className="w-3 h-3 text-emerald-400 stroke-[3]" /> Available
                                            </span>
                                        )}
                                    </td>

                                    {/* DRAFTED TEAM: Fit to size with Bold Colors & Text */}
                                    <td className="py-2.5 px-4 font-bold">
                                        {isSold && soldTeam ? (
                                            <div className="flex items-center gap-2 py-1 px-2.5 rounded-xl bg-amber-500/20 border-2 border-amber-400/60 shadow-sm w-fit max-w-full">
                                                {teamLogo ? (
                                                    <img src={teamLogo} alt="" className="w-5 h-5 md:w-6 md:h-6 rounded-full object-contain bg-white p-0.5 shadow shrink-0" />
                                                ) : (
                                                    <div className="w-5 h-5 md:w-6 md:h-6 rounded-full bg-blue-600 text-white font-black text-[9px] flex items-center justify-center shrink-0">
                                                        {soldTeam.charAt(0)}
                                                    </div>
                                                )}
                                                <span className="text-xs md:text-sm font-black uppercase tracking-tight text-amber-300 drop-shadow truncate">
                                                    {soldTeam}
                                                </span>
                                            </div>
                                        ) : (
                                            <span className="text-zinc-600 font-bold text-xs">—</span>
                                        )}
                                    </td>

                                    {/* Action Column for Admin */}
                                    {!isBroadcast && (
                                        <td className="py-2.5 px-3 text-right">
                                            {isAdmin && isSold && onUndoPlayer && (
                                                <button
                                                    type="button"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        onUndoPlayer(player);
                                                    }}
                                                    className="px-2.5 py-1 rounded-lg bg-red-600/20 hover:bg-red-600 text-red-400 hover:text-white font-bold text-[10px] uppercase transition-all flex items-center gap-1 active:scale-95 shadow-sm ml-auto"
                                                    title={`Undo ${player.name} pick`}
                                                >
                                                    <Undo2 className="w-3 h-3" /> Undo
                                                </button>
                                            )}
                                        </td>
                                    )}
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default DraftTableView;
