import React, { useState } from 'react';
import { Player, Team } from '../../types';
import { 
    X, Check, Shield, Wallet, Trophy, User, CheckCircle2, 
    Crown, Sparkles, AlertCircle, Tag, Undo2
} from 'lucide-react';

interface Props {
    player: Player;
    teams: Team[];
    currentTurnTeam: Team | null;
    isAdmin: boolean;
    isMyTurn: boolean;
    onClose: () => void;
    onAssign: (player: Player, teamId: string | number, price: number) => void;
    onUndoPlayer?: (player: Player) => void;
}

export const DraftNominationModal: React.FC<Props> = ({
    player,
    teams,
    currentTurnTeam,
    isAdmin,
    isMyTurn,
    onClose,
    onAssign,
    onUndoPlayer
}) => {
    const isSold = player.status === 'SOLD';
    const defaultTeamId = currentTurnTeam ? currentTurnTeam.id : teams[0]?.id;
    const [selectedTeamId, setSelectedTeamId] = useState<string | number>(defaultTeamId || '');

    const selectedTeam = teams.find(t => String(t.id) === String(selectedTeamId));

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/85 backdrop-blur-md animate-in fade-in duration-200">
            <div className="w-full max-w-lg rounded-3xl border border-zinc-800 bg-zinc-950 p-5 md:p-7 shadow-2xl text-white space-y-6 max-h-[90vh] overflow-y-auto custom-scrollbar relative">
                {/* Close Button */}
                <button
                    onClick={onClose}
                    className="absolute top-5 right-5 p-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white transition-all"
                >
                    <X className="w-5 h-5" />
                </button>

                {/* Player Profile Header */}
                <div className="flex flex-col sm:flex-row items-center sm:items-start gap-4">
                    <div className="relative w-28 h-28 sm:w-32 sm:h-32 rounded-2xl overflow-hidden bg-zinc-900 border-2 border-zinc-700 shrink-0 shadow-xl">
                        {player.photoUrl ? (
                            <img src={player.photoUrl} alt={player.name} className="w-full h-full object-cover" />
                        ) : (
                            <div className="w-full h-full flex items-center justify-center text-4xl font-black text-zinc-600">
                                {player.name.charAt(0)}
                            </div>
                        )}
                        {isSold && (
                            <div className="absolute inset-0 bg-black/80 backdrop-blur-[2px] flex items-center justify-center">
                                <span className="px-3 py-1 rounded-md bg-red-600 text-white font-black text-xs uppercase tracking-widest -rotate-12 shadow-lg">
                                    SOLD
                                </span>
                            </div>
                        )}
                    </div>

                    <div className="flex-1 text-center sm:text-left min-w-0">
                        <div className="flex flex-wrap items-center justify-center sm:justify-start gap-1.5 mb-1.5">
                            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-blue-500/10 text-blue-400 border border-blue-500/30">
                                {player.category || 'General'}
                            </span>
                            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-zinc-800 text-zinc-300 border border-zinc-700">
                                {player.role || 'Player'}
                            </span>
                            {player.jerseyNumber && (
                                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-amber-500/10 text-amber-400 border border-amber-500/30">
                                    #{player.jerseyNumber}
                                </span>
                            )}
                        </div>

                        <h2 className="text-xl md:text-2xl font-black uppercase tracking-tight text-white truncate">
                            {player.name}
                        </h2>

                        {player.jerseyName && (
                            <p className="text-xs text-zinc-400 font-semibold mt-1">
                                Jersey Name: {player.jerseyName}
                            </p>
                        )}
                    </div>
                </div>

                {/* Player Profile Details */}
                <div className="grid grid-cols-2 gap-2.5">
                    <div className="p-3 rounded-2xl bg-zinc-900 border border-zinc-800 text-center">
                        <p className="text-[9px] font-black uppercase tracking-widest text-zinc-500">Category</p>
                        <p className="text-sm font-black text-white mt-0.5 uppercase">{player.category || 'Standard'}</p>
                    </div>
                    <div className="p-3 rounded-2xl bg-zinc-900 border border-zinc-800 text-center">
                        <p className="text-[9px] font-black uppercase tracking-widest text-zinc-500">Player Role</p>
                        <p className="text-sm font-black text-amber-400 mt-0.5 uppercase">{player.role || 'Player'}</p>
                    </div>
                </div>

                {/* If already SOLD */}
                {isSold ? (
                    <div className="p-4 rounded-2xl bg-zinc-900 border border-zinc-800 space-y-3">
                        <div className="flex items-center justify-between text-xs">
                            <span className="text-zinc-400 font-bold uppercase">Drafted To Team:</span>
                            <span className="text-amber-400 font-black uppercase text-sm">{player.soldTo || 'Assigned'}</span>
                        </div>
                        {isAdmin && onUndoPlayer && (
                            <button
                                type="button"
                                onClick={() => onUndoPlayer(player)}
                                className="w-full mt-2 py-3 px-4 rounded-xl font-black text-xs uppercase tracking-wider bg-red-600/20 hover:bg-red-600 text-red-400 hover:text-white border border-red-500/40 transition-all flex items-center justify-center gap-2 active:scale-95 shadow-md"
                            >
                                <Undo2 className="w-4 h-4" /> Undo Pick &amp; Restore to Available
                            </button>
                        )}
                    </div>
                ) : (
                    /* DRAFT PICK CONTROLS FOR ADMIN */
                    isAdmin ? (
                        <div className="p-4 rounded-2xl bg-zinc-900 border border-zinc-800 space-y-4">
                            <div className="flex items-center gap-2 border-b pb-2 border-zinc-800">
                                <Shield className="w-4 h-4 text-blue-500" />
                                <h4 className="text-xs font-black uppercase tracking-wider text-white">
                                    Draft Pick Selection
                                </h4>
                            </div>

                            <div className="space-y-3">
                                <div>
                                    <label className="block text-[10px] font-black uppercase text-zinc-400 mb-1">
                                        Select Franchise:
                                    </label>
                                    <select
                                        value={selectedTeamId}
                                        onChange={(e) => setSelectedTeamId(e.target.value)}
                                        className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-800 border border-zinc-700 text-white font-bold text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    >
                                        {teams.map(t => (
                                            <option key={t.id} value={t.id}>
                                                {t.name} ({t.players?.length || 0} Drafted)
                                                {currentTurnTeam && String(t.id) === String(currentTurnTeam.id) ? ' ★ Current Turn' : ''}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            <button
                                onClick={() => onAssign(player, selectedTeamId, 0)}
                                className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-black text-xs uppercase tracking-widest shadow-xl shadow-blue-600/25 active:scale-95 transition-all flex items-center justify-center gap-2"
                            >
                                <Check className="w-4 h-4 stroke-[3]" /> Confirm Draft Pick for {selectedTeam?.name || 'Selected Team'}
                            </button>
                        </div>
                    ) : isMyTurn ? (
                        /* Captain Nomination Prompt */
                        <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-center space-y-3">
                            <p className="text-xs font-black uppercase text-amber-400">
                                ★ It is your team&apos;s turn to pick!
                            </p>
                            <p className="text-[11px] text-zinc-300">
                                Request this player to be drafted to your squad:
                            </p>
                            <button
                                onClick={() => onAssign(player, selectedTeamId, 0)}
                                className="w-full py-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-black text-xs uppercase tracking-wider shadow-lg active:scale-95 transition-all"
                            >
                                Pick for {currentTurnTeam?.name}
                            </button>
                        </div>
                    ) : (
                        <div className="p-3 rounded-2xl bg-zinc-900 border border-zinc-800 text-center">
                            <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">
                                Waiting for {currentTurnTeam ? currentTurnTeam.name : 'Auctioneer'} to pick
                            </p>
                        </div>
                    )
                )}
            </div>
        </div>
    );
};

export default DraftNominationModal;
