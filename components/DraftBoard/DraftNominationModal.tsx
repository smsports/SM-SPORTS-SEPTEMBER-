import React, { useState, useMemo } from 'react';
import { Player, Team, DraftPickHistory, AuctionCategory } from '../../types';
import { 
    X, Check, Shield, Wallet, Trophy, User, CheckCircle2, 
    Crown, Sparkles, AlertCircle, Tag, Undo2, Lock, Loader2, Star
} from 'lucide-react';
import { unlockDraftAudio } from '../../utils/draftAudio';
import { resolveDraftTeamSquad, validateDraftCategoryPick } from '../../utils';

interface Props {
    player: Player;
    teams: Team[];
    categories?: AuctionCategory[];
    maxPlayersPerTeam?: number;
    allPlayers?: Player[];
    draftHistory?: DraftPickHistory[];
    currentTurnTeam: Team | null;
    myTeam?: Team | null;
    isAdmin: boolean;
    isMyTurn: boolean;
    isPickingAllowed?: boolean;
    isPickRequestMode?: boolean;
    isSoldOverride?: boolean;
    soldToTeamName?: string;
    errorMessage?: string | null;
    hidePlayerNumbers?: boolean;
    isWishlisted?: boolean;
    onToggleWishlist?: (player: Player) => void;
    onClose: () => void;
    onAssign: (player: Player, teamId: string | number, price: number) => Promise<void> | void;
    onUndoPlayer?: (player: Player) => void;
}

export const DraftNominationModal: React.FC<Props> = ({
    player,
    teams,
    categories = [],
    maxPlayersPerTeam,
    allPlayers = [],
    draftHistory = [],
    currentTurnTeam,
    myTeam,
    isAdmin,
    isMyTurn,
    isPickingAllowed = true,
    isPickRequestMode = false,
    isSoldOverride,
    soldToTeamName,
    errorMessage,
    hidePlayerNumbers = false,
    isWishlisted = false,
    onToggleWishlist,
    onClose,
    onAssign,
    onUndoPlayer
}) => {
    const isSold = isSoldOverride ?? (player.status === 'SOLD');
    const defaultTeamId = isAdmin
        ? (currentTurnTeam?.id ?? teams[0]?.id ?? '')
        : (myTeam?.id ?? currentTurnTeam?.id ?? teams[0]?.id ?? '');
    const [selectedTeamId, setSelectedTeamId] = useState<string | number>(defaultTeamId);
    const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

    const selectedTeam = teams.find(t => String(t.id) === String(selectedTeamId));
    const targetCheckTeam = isAdmin ? selectedTeam : (myTeam ?? currentTurnTeam ?? selectedTeam);

    const teamValidations = useMemo(() => {
        const map = new Map<string, ReturnType<typeof validateDraftCategoryPick>>();
        teams.forEach(t => {
            map.set(
                String(t.id),
                validateDraftCategoryPick(t, player, categories, allPlayers, draftHistory, maxPlayersPerTeam)
            );
        });
        return map;
    }, [teams, player, categories, allPlayers, draftHistory, maxPlayersPerTeam]);

    const activeValidation = targetCheckTeam
        ? (teamValidations.get(String(targetCheckTeam.id)) ||
           validateDraftCategoryPick(targetCheckTeam, player, categories, allPlayers, draftHistory, maxPlayersPerTeam))
        : null;

    const handlePickSubmit = async (targetTeamId: string | number) => {
        if (isSubmitting || isSold) return;
        const v = teamValidations.get(String(targetTeamId));
        if (v && !v.allowed) return;
        unlockDraftAudio();
        setIsSubmitting(true);
        try {
            await onAssign(player, targetTeamId, 0);
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/85 backdrop-blur-md animate-in fade-in duration-200">
            <div className="w-full max-w-lg rounded-3xl border border-zinc-800 bg-zinc-950 p-5 md:p-7 shadow-2xl text-white space-y-6 max-h-[90vh] overflow-y-auto custom-scrollbar relative">
                {/* Close Button */}
                <button
                    onClick={onClose}
                    disabled={isSubmitting}
                    className="absolute top-5 right-5 p-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white transition-all disabled:opacity-50"
                >
                    <X className="w-5 h-5" />
                </button>

                {/* Player Profile Header */}
                <div className="flex flex-col sm:flex-row items-center sm:items-start gap-4">
                    <div className="relative w-28 h-28 sm:w-32 sm:h-32 rounded-2xl overflow-hidden bg-zinc-900 border-2 border-zinc-700 shrink-0 shadow-xl">
                        {player.photoUrl ? (
                            <img src={player.photoUrl} alt={player.name} className={`w-full h-full object-contain bg-zinc-950 ${isSold ? 'opacity-25 grayscale contrast-125' : ''}`} />
                        ) : (
                            <div className="w-full h-full flex items-center justify-center text-4xl font-black text-zinc-600">
                                {player.name.charAt(0)}
                            </div>
                        )}
                        {isSold && (
                            <div
                                style={{ containerType: 'size' }}
                                className="absolute inset-0 bg-gradient-to-b from-red-950/80 via-red-900/75 to-black/95 flex flex-col items-center justify-center p-[6%] text-center pointer-events-none select-none overflow-hidden"
                            >
                                <div
                                    style={{ fontSize: 'clamp(14px, 23cqmin, 32px)' }}
                                    className="w-[112%] py-[5%] bg-gradient-to-r from-red-600 via-rose-600 to-red-600 text-white font-black uppercase tracking-[0.16em] leading-none border-y border-red-200/80 shadow-[0_4px_18px_rgba(220,38,38,0.75)] -rotate-3"
                                >
                                    SOLD
                                </div>
                                {(soldToTeamName || player.soldTo) && (
                                    <p
                                        style={{ fontSize: 'clamp(8px, 11cqmin, 13px)' }}
                                        className="mt-[6%] font-black text-amber-300 uppercase tracking-tight line-clamp-2 leading-tight drop-shadow-[0_1px_3px_rgba(0,0,0,1)] max-w-full"
                                    >
                                        {soldToTeamName || player.soldTo}
                                    </p>
                                )}
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
                            {!hidePlayerNumbers && player.jerseyNumber && (
                                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-amber-500/10 text-amber-400 border border-amber-500/30">
                                    #{player.jerseyNumber}
                                </span>
                            )}
                            {onToggleWishlist && (
                                <button
                                    type="button"
                                    onClick={() => onToggleWishlist(player)}
                                    className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider border transition-all flex items-center gap-1 ${
                                        isWishlisted
                                            ? 'bg-yellow-500/20 text-yellow-300 border-yellow-400/60 shadow-sm'
                                            : 'bg-zinc-900 text-zinc-400 border-zinc-700 hover:text-yellow-300 hover:border-yellow-400/40'
                                    }`}
                                >
                                    <Star className={`w-3 h-3 ${isWishlisted ? 'fill-yellow-400 text-yellow-400' : ''}`} />
                                    {isWishlisted ? 'In Wishlist' : 'Add Wishlist'}
                                </button>
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

                {/* Inline Error or Category Limit Feedback */}
                {(errorMessage || (!isSold && activeValidation && !activeValidation.allowed)) && (
                    <div className="p-3.5 rounded-2xl bg-red-950/80 border border-red-500/70 text-red-100 text-xs font-bold flex items-start gap-2.5 shadow-lg">
                        <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                        <span>{errorMessage || activeValidation?.reason}</span>
                    </div>
                )}

                {/* Team Category Limits Overview for Active Team */}
                {!isSold && activeValidation && activeValidation.summary.categories.some(c => c.min > 0 || c.max > 0) && (
                    <div className="p-3 rounded-2xl bg-zinc-900/90 border border-zinc-800 space-y-2">
                        <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-wider text-zinc-400">
                            <span>{targetCheckTeam?.name} Category Limits</span>
                            <span className="text-amber-300 tabular-nums">
                                Squad: {activeValidation.summary.squadCount}
                                {activeValidation.summary.effectiveSquadMax > 0 ? `/${activeValidation.summary.effectiveSquadMax}` : ''}
                            </span>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                            {activeValidation.summary.categories.map(cat => {
                                const isPlayerCat = cat.name.trim().toLowerCase() === String(player.category || player.role || '').trim().toLowerCase();
                                return (
                                    <span
                                        key={cat.name}
                                        className={`px-2 py-1 rounded-lg border text-[10px] font-black uppercase tracking-tight flex items-center gap-1 ${
                                            cat.isMaxReached
                                                ? 'bg-red-950/70 border-red-500/60 text-red-300'
                                                : cat.neededForMin > 0
                                                ? 'bg-amber-950/60 border-amber-500/50 text-amber-300'
                                                : 'bg-emerald-950/50 border-emerald-500/40 text-emerald-300'
                                        } ${isPlayerCat ? 'ring-1 ring-white/50' : ''}`}
                                    >
                                        <span>{cat.name}:</span>
                                        <span className="tabular-nums">
                                            {cat.current}/{cat.max > 0 ? cat.max : '∞'}
                                        </span>
                                        {cat.min > 0 && (
                                            <span className="text-[9px] opacity-85">
                                                (Min {cat.min})
                                            </span>
                                        )}
                                    </span>
                                );
                            })}
                        </div>
                    </div>
                )}

                {/* If already SOLD */}
                {isSold ? (
                    <div className="p-4 rounded-2xl bg-zinc-900 border border-zinc-800 space-y-3">
                        <div className="flex items-center justify-between text-xs">
                            <span className="text-zinc-400 font-bold uppercase">Drafted To Team:</span>
                            <span className="text-amber-400 font-black uppercase text-sm">{soldToTeamName || player.soldTo || 'Assigned'}</span>
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
                                        disabled={isSubmitting}
                                        className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-800 border border-zinc-700 text-white font-bold text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    >
                                        {teams.map(t => {
                                            const tVal = teamValidations.get(String(t.id));
                                            const draftedCount = tVal?.summary.squadCount ?? (
                                                allPlayers.length > 0 || draftHistory.length > 0
                                                    ? resolveDraftTeamSquad(t, allPlayers, draftHistory).length
                                                    : (t.players?.length || 0)
                                            );
                                            const statusTag = tVal && !tVal.allowed && tVal.shortReason ? ` ⛔ ${tVal.shortReason}` : '';
                                            return (
                                                <option key={t.id} value={t.id}>
                                                    {t.name} ({draftedCount}{tVal?.summary.effectiveSquadMax ? `/${tVal.summary.effectiveSquadMax}` : ''} Drafted)
                                                    {currentTurnTeam && String(t.id) === String(currentTurnTeam.id) ? ' ★ Current Turn' : ''}
                                                    {statusTag}
                                                </option>
                                            );
                                        })}
                                    </select>
                                </div>
                            </div>

                            <button
                                type="button"
                                disabled={isSubmitting || Boolean(activeValidation && !activeValidation.allowed)}
                                onClick={() => handlePickSubmit(selectedTeamId)}
                                className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 disabled:from-zinc-700 disabled:to-zinc-800 disabled:text-zinc-400 disabled:cursor-not-allowed disabled:opacity-75 text-white font-black text-xs uppercase tracking-widest shadow-xl shadow-blue-600/25 active:scale-95 transition-all flex items-center justify-center gap-2"
                            >
                                {isSubmitting ? (
                                    <>
                                        <Loader2 className="w-4 h-4 animate-spin" /> Confirming Pick...
                                    </>
                                ) : activeValidation && !activeValidation.allowed ? (
                                    <>
                                        <Lock className="w-4 h-4" /> {activeValidation.shortReason || 'Category Limit Reached'}
                                    </>
                                ) : (
                                    <>
                                        <Check className="w-4 h-4 stroke-[3]" /> Confirm Draft Pick for {selectedTeam?.name || 'Selected Team'}
                                    </>
                                )}
                            </button>
                        </div>
                    ) : isMyTurn ? (
                        isPickingAllowed ? (
                            /* Captain Nomination Prompt */
                            <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-center space-y-3">
                                <p className="text-xs font-black uppercase text-amber-400">
                                    ★ It is your team&apos;s turn to pick!
                                </p>
                                <p className="text-[11px] text-zinc-300">
                                    {activeValidation && !activeValidation.allowed
                                        ? 'This player is restricted by your category/squad limit:'
                                        : isPickRequestMode
                                        ? 'Send a pick request to the Admin for approval:'
                                        : 'Draft this player directly to your squad:'}
                                </p>
                                <button
                                    type="button"
                                    disabled={isSubmitting || Boolean(activeValidation && !activeValidation.allowed)}
                                    onClick={() => handlePickSubmit(myTeam?.id ?? currentTurnTeam?.id ?? selectedTeamId)}
                                    className="w-full py-3 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:bg-zinc-800 disabled:text-zinc-400 disabled:cursor-not-allowed disabled:opacity-75 text-black font-black text-xs uppercase tracking-wider shadow-lg active:scale-95 transition-all flex items-center justify-center gap-2"
                                >
                                    {isSubmitting ? (
                                        <>
                                            <Loader2 className="w-4 h-4 animate-spin" /> {isPickRequestMode ? 'Sending Pick Request...' : 'Drafting Player...'}
                                        </>
                                    ) : activeValidation && !activeValidation.allowed ? (
                                        <>
                                            <Lock className="w-4 h-4" /> {activeValidation.shortReason || 'Limit Reached'}
                                        </>
                                    ) : (
                                        <>{isPickRequestMode ? `Send Pick Request (${myTeam?.name || currentTurnTeam?.name})` : `Pick for ${myTeam?.name || currentTurnTeam?.name}`}</>
                                    )}
                                </button>
                            </div>
                        ) : (
                            <div className="p-4 rounded-2xl bg-red-950/40 border border-red-500/40 text-center space-y-1.5">
                                <p className="text-xs font-black uppercase text-amber-400 flex items-center justify-center gap-1.5">
                                    <Lock className="w-4 h-4 text-red-400" /> Team Picking Locked
                                </p>
                                <p className="text-[11px] text-zinc-300">
                                    Admin has disabled team self-picking. Please ask the administrator to allot this player.
                                </p>
                            </div>
                        )
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
