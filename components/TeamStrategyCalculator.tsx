import React, { useState, useMemo } from 'react';
import { useAuction } from '../hooks/useAuction';
import { useTheme } from '../contexts/ThemeContext';
import { Team, Player, AuctionCategory, PlayerRole } from '../types';
import { resolveTeamSquad } from '../utils';
import { 
    Calculator, Wallet, ShieldCheck, AlertTriangle, AlertCircle, 
    CheckCircle2, Users, Target, Zap, Sliders, ChevronRight, 
    X, Info, ArrowRight, TrendingUp, Sparkles, Gavel, Scale
} from 'lucide-react';

interface RoleQuota {
    id: string;
    label: string;
    roleKey: 'Batsman' | 'Bowler' | 'All-Rounder' | 'Wicketkeeper' | 'Custom';
    current: number;
    target: number;
    unitBasePrice: number;
    shortfall: number;
    totalReserve: number;
    icon: string;
}

interface StrategyCalculatorProps {
    team?: Team;
    isOpen?: boolean;
    onClose?: () => void;
    isEmbedded?: boolean;
    onPlaceBid?: (amount: number) => void;
}

export const normalizeRole = (roleOrCategory?: string): 'Batsman' | 'Bowler' | 'All-Rounder' | 'Wicketkeeper' | 'Other' => {
    if (!roleOrCategory) return 'Other';
    const norm = roleOrCategory.trim().toLowerCase();
    if (norm.includes('wicket') || norm.includes('keeper') || norm === 'wk' || norm.includes('wk-')) return 'Wicketkeeper';
    if (norm.includes('all-round') || norm.includes('all round') || norm.includes('allround')) return 'All-Rounder';
    if (norm.includes('bowl') || norm.includes('pacer') || norm.includes('spin') || norm.includes('seamer')) return 'Bowler';
    if (norm.includes('bat') || norm.includes('batter')) return 'Batsman';
    return 'Other';
};

export const TeamStrategyCalculator: React.FC<StrategyCalculatorProps> = ({
    team: propTeam,
    isOpen = true,
    onClose,
    isEmbedded = false,
    onPlaceBid
}) => {
    const { state, userProfile, placeBid, nextBid } = useAuction();
    const { theme } = useTheme();
    const isDark = theme === 'dark';

    // Identify active team: propTeam or logged-in user's team or first team
    const activeTeam = useMemo(() => {
        if (propTeam) return propTeam;
        if (userProfile?.teamId) {
            const found = state.teams.find(t => String(t.id) === String(userProfile.teamId));
            if (found) return found;
        }
        return state.teams[0] || null;
    }, [propTeam, userProfile, state.teams]);

    const allPlayers = state.players || [];
    const currentLot = state.currentPlayerId ? allPlayers.find(p => String(p.id) === String(state.currentPlayerId)) : null;

    // Resolved full squad (including direct assigns and traded players)
    const squad = useMemo(() => {
        if (!activeTeam) return [];
        return resolveTeamSquad(activeTeam, allPlayers);
    }, [activeTeam, allPlayers]);

    // Current purse
    const purseRemaining = Number(activeTeam?.budget || 0);

    // Target squad size
    const defaultSquadTarget = state.maxPlayersPerTeam || (state as any).playersPerTeam || 11;
    const [targetSquadSize, setTargetSquadSize] = useState<number>(defaultSquadTarget);

    // Keep target squad size in sync if state updates and user hasn't overridden
    React.useEffect(() => {
        if (defaultSquadTarget && targetSquadSize === 11 && defaultSquadTarget !== 11) {
            setTargetSquadSize(defaultSquadTarget);
        }
    }, [defaultSquadTarget]);

    const globalBasePrice = Math.max(1, Number(state.basePrice || 100));

    // Custom role targets state (allows team owners to adjust their strategic quotas)
    // Defaults: Standard balanced cricket squad
    const [customTargets, setCustomTargets] = useState<{ [roleKey: string]: number }>({
        'Batsman': 4,
        'Bowler': 3,
        'All-Rounder': 2,
        'Wicketkeeper': 1
    });

    // Count roles in current squad
    const squadRoleCounts = useMemo(() => {
        const counts: { [key: string]: number } = {
            'Batsman': 0,
            'Bowler': 0,
            'All-Rounder': 0,
            'Wicketkeeper': 0,
            'Other': 0
        };

        squad.forEach(player => {
            const r = normalizeRole(player.role || player.speciality || player.category);
            counts[r] = (counts[r] || 0) + 1;
        });

        return counts;
    }, [squad]);

    // Quotas list combining configured categories or standard cricket roles
    const quotas: RoleQuota[] = useMemo(() => {
        // If tournament configured categories with minPerTeam, prioritize those
        const configuredCatsWithMin = (state.categories || []).filter(c => (c.minPerTeam || 0) > 0);

        if (configuredCatsWithMin.length > 0) {
            return configuredCatsWithMin.map(cat => {
                const countInTeam = squad.filter(p => 
                    p.category?.toLowerCase().trim() === cat.name.toLowerCase().trim() ||
                    p.role?.toLowerCase().trim() === cat.name.toLowerCase().trim()
                ).length;
                const target = cat.minPerTeam || 0;
                const shortfall = Math.max(0, target - countInTeam);
                const unitPrice = (cat.basePrice !== undefined && cat.basePrice !== null) ? Number(cat.basePrice) : globalBasePrice;
                const roleKey = normalizeRole(cat.name) as any;
                
                let icon = '🏏';
                if (cat.name.toLowerCase().includes('bowl')) icon = '🎯';
                else if (cat.name.toLowerCase().includes('all') || cat.name.toLowerCase().includes('round')) icon = '⚡';
                else if (cat.name.toLowerCase().includes('keep') || cat.name.toLowerCase().includes('wk')) icon = '🧤';

                return {
                    id: cat.id || cat.name,
                    label: cat.name,
                    roleKey: roleKey !== 'Other' ? roleKey : 'Custom',
                    current: countInTeam,
                    target: target,
                    unitBasePrice: unitPrice,
                    shortfall: shortfall,
                    totalReserve: shortfall * unitPrice,
                    icon: icon
                };
            });
        }

        // Standard cricket roles fallback
        const standardRoles: { key: 'Batsman' | 'Bowler' | 'All-Rounder' | 'Wicketkeeper'; label: string; icon: string; defaultBase: number }[] = [
            { key: 'Batsman', label: 'Batsman', icon: '🏏', defaultBase: globalBasePrice },
            { key: 'Bowler', label: 'Bowler', icon: '🎯', defaultBase: globalBasePrice },
            { key: 'All-Rounder', label: 'All-Rounder', icon: '⚡', defaultBase: globalBasePrice },
            { key: 'Wicketkeeper', label: 'Wicketkeeper', icon: '🧤', defaultBase: globalBasePrice }
        ];

        return standardRoles.map(r => {
            // Find base price from configured roles if any
            const matchedRole = (state.roles || []).find(sr => sr.name.toLowerCase().includes(r.key.toLowerCase()));
            const unitPrice = matchedRole ? Number(matchedRole.basePrice || globalBasePrice) : globalBasePrice;
            const current = squadRoleCounts[r.key] || 0;
            const target = customTargets[r.key] !== undefined ? customTargets[r.key] : 1;
            const shortfall = Math.max(0, target - current);

            return {
                id: r.key,
                label: r.label,
                roleKey: r.key,
                current: current,
                target: target,
                unitBasePrice: unitPrice,
                shortfall: shortfall,
                totalReserve: shortfall * unitPrice,
                icon: r.icon
            };
        });
    }, [state.categories, state.roles, squad, squadRoleCounts, customTargets, globalBasePrice]);

    // Players needed to reach target squad size
    const currentSquadCount = squad.length;
    const neededPlayersTotal = Math.max(0, targetSquadSize - currentSquadCount);

    // Detailed shortfalls (e.g. "1 Bowler, 1 All-Rounder")
    const shortfallsWithDeficit = quotas.filter(q => q.shortfall > 0);
    const shortfallDescription = useMemo(() => {
        if (shortfallsWithDeficit.length === 0) {
            return 'All role quotas fulfilled';
        }
        return shortfallsWithDeficit
            .map(q => `${q.shortfall} ${q.label}`)
            .join(', ');
    }, [shortfallsWithDeficit]);

    // Calculate reserve required for remaining players AFTER the next acquisition
    // When bidding on the next player, you will need (neededPlayersTotal - 1) players after
    const { maxSafeBid, reserveForRemaining, flexibleSlotsNeeded } = useMemo(() => {
        if (neededPlayersTotal <= 0) {
            return {
                maxSafeBid: purseRemaining,
                reserveForRemaining: 0,
                flexibleSlotsNeeded: 0
            };
        }

        if (neededPlayersTotal === 1) {
            // Only 1 player needed to finish the team! The owner can spend all remaining purse on this player
            return {
                maxSafeBid: purseRemaining,
                reserveForRemaining: 0,
                flexibleSlotsNeeded: 0
            };
        }

        // We need (neededPlayersTotal - 1) players subsequent to this one.
        // We determine minimum reserve for those (neededPlayersTotal - 1) slots.
        // Let's assume the next player could be any player (or specifically the current lot if active).
        const subsequentSlotsNeeded = neededPlayersTotal - 1;

        // Sum of all mandatory role shortfalls
        let totalRoleShortfalls = shortfallsWithDeficit.reduce((sum, q) => sum + q.shortfall, 0);

        // If next player helps a shortfall, one shortfall is fulfilled now
        let roleReserveRemaining = 0;
        let shortfallItems: { price: number; name: string }[] = [];
        shortfallsWithDeficit.forEach(q => {
            for (let i = 0; i < q.shortfall; i++) {
                shortfallItems.push({ price: q.unitBasePrice, name: q.label });
            }
        });

        // Sort shortfalls by lowest price to give owner maximum safe headroom
        shortfallItems.sort((a, b) => a.price - b.price);

        // The next player covers 1 slot. For the remaining (neededPlayersTotal - 1) slots:
        // Reserve the lowest base prices needed for the remaining mandatory roles
        const remainingMandatoryCount = Math.min(subsequentSlotsNeeded, Math.max(0, totalRoleShortfalls - 1));
        const itemsToReserve = shortfallItems.slice(0, remainingMandatoryCount);
        roleReserveRemaining = itemsToReserve.reduce((sum, it) => sum + it.price, 0);

        // Any flexible slots beyond mandatory roles
        const flexCount = Math.max(0, subsequentSlotsNeeded - remainingMandatoryCount);
        const flexReserve = flexCount * globalBasePrice;

        const totalReserve = roleReserveRemaining + flexReserve;
        const safeMax = Math.max(0, purseRemaining - totalReserve);

        return {
            maxSafeBid: safeMax,
            reserveForRemaining: totalReserve,
            flexibleSlotsNeeded: flexCount
        };
    }, [neededPlayersTotal, purseRemaining, shortfallsWithDeficit, globalBasePrice]);

    // Interactive "What-If" simulated bid
    const [simulatedBid, setSimulatedBid] = useState<number>(() => {
        if (currentLot && nextBid > 0) return nextBid;
        return Math.min(purseRemaining, Math.max(globalBasePrice, Math.floor(maxSafeBid * 0.75)));
    });

    // Update simulated bid if current lot changes
    React.useEffect(() => {
        if (currentLot && nextBid > 0) {
            setSimulatedBid(nextBid);
        }
    }, [currentLot?.id, nextBid]);

    // Simulation metrics
    const simRemainingPurse = purseRemaining - simulatedBid;
    const simSurplus = simRemainingPurse - reserveForRemaining;
    const simIsSafe = simSurplus >= 0;
    const simAvgRemainingPerSlot = neededPlayersTotal > 1 
        ? Math.max(0, Math.floor(simRemainingPurse / (neededPlayersTotal - 1))) 
        : 0;

    // Safety status calculation
    const safetyLevel = useMemo<'SAFE' | 'CAUTION' | 'BREACH'>(() => {
        if (simSurplus > (globalBasePrice * 2)) return 'SAFE';
        if (simSurplus >= 0) return 'CAUTION';
        return 'BREACH';
    }, [simSurplus, globalBasePrice]);

    if (!isOpen && !isEmbedded) return null;

    const handleAdjustTarget = (roleKey: string, delta: number) => {
        setCustomTargets(prev => {
            const cur = prev[roleKey] !== undefined ? prev[roleKey] : 1;
            const updated = Math.max(0, cur + delta);
            return { ...prev, [roleKey]: updated };
        });
    };

    const handleQuickBid = async () => {
        if (!activeTeam || !nextBid) return;
        if (onPlaceBid) {
            onPlaceBid(nextBid);
        } else {
            try {
                await placeBid(activeTeam.id, nextBid);
            } catch (err) {
                console.error("Bid error:", err);
            }
        }
    };

    const content = (
        <div className="flex flex-col h-full space-y-6">
            {/* Header info */}
            <div className={`p-4 md:p-6 rounded-3xl border flex flex-col md:flex-row md:items-center justify-between gap-4 transition-all ${
                isDark ? 'bg-zinc-900/90 border-zinc-800' : 'bg-white border-blue-100 shadow-sm'
            }`}>
                <div className="flex items-center gap-3.5">
                    {activeTeam?.logoUrl ? (
                        <div className="w-14 h-14 rounded-2xl bg-white p-1.5 border border-zinc-200 dark:border-zinc-700 shadow-md flex items-center justify-center shrink-0">
                            <img src={activeTeam.logoUrl} alt={activeTeam.name} className="max-w-full max-h-full object-contain" />
                        </div>
                    ) : (
                        <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-700 text-white font-black text-xl flex items-center justify-center shadow-lg shrink-0">
                            {activeTeam?.name?.charAt(0) || 'T'}
                        </div>
                    )}
                    <div>
                        <div className="flex items-center gap-2">
                            <span className="text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-500 border border-blue-500/20">
                                Franchise Live Calculator
                            </span>
                            <span className="text-[10px] font-bold text-gray-400">
                                {state.tournamentName || 'Championship'}
                            </span>
                        </div>
                        <h2 className={`text-xl md:text-2xl font-black uppercase tracking-tight ${isDark ? 'text-white' : 'text-gray-900'}`}>
                            {activeTeam?.name || 'Your Team'}
                        </h2>
                    </div>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                    <div className={`px-4 py-2.5 rounded-2xl border flex items-center gap-3 ${
                        isDark ? 'bg-zinc-800/80 border-zinc-700' : 'bg-emerald-50 border-emerald-200'
                    }`}>
                        <Wallet className="w-5 h-5 text-emerald-500" />
                        <div>
                            <p className="text-[9px] font-black uppercase tracking-wider text-gray-400">Purse Remaining</p>
                            <p className="text-lg md:text-xl font-black text-emerald-500 tabular-nums">
                                ₹{purseRemaining.toLocaleString()}
                            </p>
                        </div>
                    </div>

                    <div className={`px-4 py-2.5 rounded-2xl border flex items-center gap-3 ${
                        isDark ? 'bg-zinc-800/80 border-zinc-700' : 'bg-blue-50 border-blue-200'
                    }`}>
                        <Users className="w-5 h-5 text-blue-500" />
                        <div>
                            <p className="text-[9px] font-black uppercase tracking-wider text-gray-400">Squad Built</p>
                            <p className={`text-lg md:text-xl font-black tabular-nums ${isDark ? 'text-white' : 'text-gray-900'}`}>
                                {currentSquadCount} <span className="text-xs text-gray-400 font-bold">/ {targetSquadSize}</span>
                            </p>
                        </div>
                    </div>
                </div>
            </div>

            {/* MAIN SPOTLIGHT BANNER: EXACT USER STATEMENT FORMULA */}
            <div className={`relative overflow-hidden rounded-3xl p-5 md:p-7 border-2 shadow-xl transition-all ${
                safetyLevel === 'BREACH'
                    ? (isDark ? 'bg-red-950/40 border-red-500/60 shadow-red-900/20' : 'bg-red-50 border-red-300 shadow-red-200/50')
                    : safetyLevel === 'CAUTION'
                    ? (isDark ? 'bg-amber-950/40 border-amber-500/60 shadow-amber-900/20' : 'bg-amber-50 border-amber-300 shadow-amber-200/50')
                    : (isDark ? 'bg-gradient-to-br from-blue-950/50 via-slate-900 to-indigo-950/40 border-blue-500/50 shadow-blue-900/20' : 'bg-gradient-to-br from-blue-50 via-indigo-50/60 to-white border-blue-300 shadow-blue-100')
            }`}>
                <div className="flex items-start justify-between gap-4 mb-3">
                    <div className="flex items-center gap-2">
                        <span className={`p-2 rounded-xl flex items-center justify-center ${
                            safetyLevel === 'BREACH' ? 'bg-red-500 text-white' :
                            safetyLevel === 'CAUTION' ? 'bg-amber-500 text-black' :
                            'bg-blue-600 text-white'
                        }`}>
                            <ShieldCheck className="w-5 h-5" />
                        </span>
                        <div>
                            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-blue-400 dark:text-blue-300">
                                Live Strategy &amp; Quota Protection
                            </p>
                            <h3 className={`text-xs md:text-sm font-black uppercase ${isDark ? 'text-zinc-300' : 'text-gray-700'}`}>
                                Real-Time Squad Budget Directive
                            </h3>
                        </div>
                    </div>

                    <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5 ${
                        safetyLevel === 'BREACH' ? 'bg-red-500/20 text-red-500 border border-red-500/40' :
                        safetyLevel === 'CAUTION' ? 'bg-amber-500/20 text-amber-500 border border-amber-500/40' :
                        'bg-emerald-500/20 text-emerald-500 border border-emerald-500/40'
                    }`}>
                        <span className={`w-2 h-2 rounded-full animate-ping ${
                            safetyLevel === 'BREACH' ? 'bg-red-500' :
                            safetyLevel === 'CAUTION' ? 'bg-amber-500' : 'bg-emerald-500'
                        }`} />
                        {safetyLevel === 'BREACH' ? 'Purse Deficit Risk' : safetyLevel === 'CAUTION' ? 'Tight Margin' : 'Optimal Balance'}
                    </span>
                </div>

                {/* The Core Live Calculation Statement */}
                <div className="mt-2 pl-1">
                    <p className={`text-base md:text-xl lg:text-2xl font-black leading-snug tracking-tight ${
                        isDark ? 'text-white' : 'text-gray-900'
                    }`}>
                        &ldquo;You have <span className="text-emerald-500 font-black">₹{purseRemaining.toLocaleString()}</span> left and need{' '}
                        <span className="text-blue-500 dark:text-blue-400 font-black">
                            {neededPlayersTotal} player{neededPlayersTotal !== 1 ? 's' : ''}
                        </span>{' '}
                        {shortfallsWithDeficit.length > 0 && (
                            <span className="text-amber-500 dark:text-amber-400 font-black">
                                ({shortfallDescription})
                            </span>
                        )}
                        . Max bid for next player:{' '}
                        <span className="text-indigo-600 dark:text-cyan-400 underline decoration-2 underline-offset-4 font-black">
                            ₹{maxSafeBid.toLocaleString()}
                        </span>{' '}
                        to maintain minimum squad base prices.&rdquo;
                    </p>
                </div>

                <div className="mt-4 pt-4 border-t border-black/5 dark:border-white/5 flex flex-wrap items-center justify-between gap-3 text-xs">
                    <div className="flex items-center gap-2">
                        <Scale className="w-4 h-4 text-blue-500 shrink-0" />
                        <span className={`text-[11px] font-bold ${isDark ? 'text-zinc-300' : 'text-gray-600'}`}>
                            Minimum reserve locked for future slots: <b className="text-blue-500">₹{reserveForRemaining.toLocaleString()}</b>
                        </span>
                    </div>

                    <div className="flex items-center gap-2">
                        <Info className="w-4 h-4 text-gray-400 shrink-0" />
                        <span className="text-[10px] text-gray-400 font-semibold uppercase tracking-wider">
                            Guarantees you never breach squad quotas before filling required XI
                        </span>
                    </div>
                </div>
            </div>

            {/* LIVE HAMMER LINK (If auction is in progress and lot is active) */}
            {currentLot && (
                <div className={`p-4 md:p-5 rounded-3xl border transition-all ${
                    isDark ? 'bg-zinc-900/70 border-zinc-800' : 'bg-indigo-50/50 border-indigo-200'
                }`}>
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                        <div className="flex items-center gap-3">
                            <div className="relative">
                                {currentLot.photoUrl ? (
                                    <img src={currentLot.photoUrl} alt={currentLot.name} className="w-14 h-14 rounded-2xl object-cover border-2 border-indigo-500 shadow-md" />
                                ) : (
                                    <div className="w-14 h-14 rounded-2xl bg-indigo-600 text-white font-black text-xl flex items-center justify-center shadow-md">
                                        {currentLot.name.charAt(0)}
                                    </div>
                                )}
                                <span className="absolute -top-1.5 -right-1.5 px-1.5 py-0.5 rounded-full bg-amber-500 text-black text-[8px] font-black uppercase">
                                    LIVE
                                </span>
                            </div>
                            <div>
                                <div className="flex items-center gap-2">
                                    <span className="text-[10px] font-black uppercase tracking-wider text-indigo-500">
                                        On Hammer Now
                                    </span>
                                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${
                                        isDark ? 'bg-zinc-800 text-zinc-300' : 'bg-white text-gray-700 border'
                                    }`}>
                                        {currentLot.role || currentLot.category}
                                    </span>
                                </div>
                                <h4 className={`text-base md:text-lg font-black uppercase ${isDark ? 'text-white' : 'text-gray-900'}`}>
                                    {currentLot.name}
                                </h4>
                                <p className="text-xs text-gray-400">
                                    Base: ₹{(currentLot.basePrice || globalBasePrice).toLocaleString()} &bull; Next Bid: <b className="text-emerald-500">₹{(nextBid || 0).toLocaleString()}</b>
                                </p>
                            </div>
                        </div>

                        {/* Hammer action & verdict */}
                        <div className="flex items-center gap-3 w-full sm:w-auto">
                            <div className="text-right hidden sm:block">
                                <p className="text-[9px] font-black uppercase tracking-wider text-gray-400">Safety Verdict</p>
                                <p className={`text-xs font-black uppercase ${
                                    nextBid <= maxSafeBid ? 'text-emerald-500' : 'text-red-500'
                                }`}>
                                    {nextBid <= maxSafeBid ? '✅ Safe to Bid' : '⚠️ Exceeds Safe Quota'}
                                </p>
                            </div>

                            <button
                                onClick={handleQuickBid}
                                disabled={purseRemaining < nextBid || state.biddingStatus === 'PAUSED'}
                                className={`flex-1 sm:flex-none px-6 py-3 rounded-2xl font-black text-xs uppercase tracking-widest flex items-center justify-center gap-2 shadow-lg transition-all active:scale-95 disabled:opacity-50 ${
                                    nextBid <= maxSafeBid
                                        ? 'bg-gradient-to-r from-emerald-500 to-green-600 text-white shadow-emerald-500/20 hover:from-emerald-400 hover:to-green-500'
                                        : 'bg-gradient-to-r from-red-600 to-rose-700 text-white shadow-red-500/20 hover:from-red-500 hover:to-rose-600'
                                }`}
                            >
                                <Gavel className="w-4 h-4" /> Bid ₹{nextBid?.toLocaleString()}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* WHAT-IF SCENARIO SIMULATOR */}
            <div className={`p-5 md:p-6 rounded-3xl border transition-all ${
                isDark ? 'bg-zinc-900/60 border-zinc-800' : 'bg-white border-gray-200 shadow-sm'
            }`}>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5 border-b pb-4 border-black/5 dark:border-white/5">
                    <div className="flex items-center gap-2.5">
                        <div className="p-2 rounded-xl bg-indigo-500/10 text-indigo-500 border border-indigo-500/20">
                            <Sliders className="w-4 h-4" />
                        </div>
                        <div>
                            <h3 className={`text-sm font-black uppercase tracking-wider ${isDark ? 'text-white' : 'text-gray-900'}`}>
                                &ldquo;What-If&rdquo; Bid Simulator
                            </h3>
                            <p className="text-[10px] text-gray-400 uppercase tracking-widest font-semibold">
                                Test bidding scenarios before raising the paddle
                            </p>
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        <span className="text-[10px] font-bold text-gray-400 uppercase">Target Squad:</span>
                        <div className="flex items-center border rounded-xl overflow-hidden bg-black/5 dark:bg-white/5 border-zinc-300 dark:border-zinc-700">
                            <button
                                onClick={() => setTargetSquadSize(prev => Math.max(currentSquadCount, prev - 1))}
                                className="px-2.5 py-1 text-xs font-black hover:bg-black/10 dark:hover:bg-white/10"
                            >
                                -
                            </button>
                            <span className="px-3 py-1 text-xs font-black">{targetSquadSize}</span>
                            <button
                                onClick={() => setTargetSquadSize(prev => Math.min(30, prev + 1))}
                                className="px-2.5 py-1 text-xs font-black hover:bg-black/10 dark:hover:bg-white/10"
                            >
                                +
                            </button>
                        </div>
                    </div>
                </div>

                {/* Slider and direct input */}
                <div className="space-y-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <label className={`text-xs font-black uppercase tracking-wider ${isDark ? 'text-zinc-300' : 'text-gray-700'}`}>
                            Simulate Bidding Amount on Next Target:
                        </label>
                        <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-gray-400">₹</span>
                            <input
                                type="number"
                                min={0}
                                max={purseRemaining}
                                step={100}
                                value={simulatedBid}
                                onChange={(e) => setSimulatedBid(Math.min(purseRemaining, Math.max(0, Number(e.target.value))))}
                                className={`w-36 px-3 py-1.5 rounded-xl font-black text-sm text-right border focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                                    isDark ? 'bg-zinc-800 border-zinc-700 text-white' : 'bg-gray-50 border-gray-300 text-gray-900'
                                }`}
                            />
                        </div>
                    </div>

                    <input
                        type="range"
                        min={0}
                        max={purseRemaining}
                        step={Math.max(50, Math.floor(purseRemaining / 100))}
                        value={simulatedBid}
                        onChange={(e) => setSimulatedBid(Number(e.target.value))}
                        className="w-full h-2.5 bg-gray-200 dark:bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-blue-600"
                    />

                    {/* Quick preset buttons */}
                    <div className="flex flex-wrap gap-2 pt-1">
                        <button
                            onClick={() => setSimulatedBid(globalBasePrice)}
                            className="px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider bg-black/5 dark:bg-white/5 hover:bg-black/10 text-gray-400 hover:text-white"
                        >
                            Base (₹{globalBasePrice.toLocaleString()})
                        </button>
                        {nextBid > 0 && (
                            <button
                                onClick={() => setSimulatedBid(nextBid)}
                                className="px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider bg-blue-500/10 text-blue-500 border border-blue-500/20 hover:bg-blue-500/20"
                            >
                                Next Bid (₹{nextBid.toLocaleString()})
                            </button>
                        )}
                        <button
                            onClick={() => setSimulatedBid(maxSafeBid)}
                            className="px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 hover:bg-emerald-500/20"
                        >
                            Max Safe (₹{maxSafeBid.toLocaleString()})
                        </button>
                        <button
                            onClick={() => setSimulatedBid(Math.floor(purseRemaining * 0.5))}
                            className="px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider bg-black/5 dark:bg-white/5 hover:bg-black/10 text-gray-400 hover:text-white"
                        >
                            50% Purse
                        </button>
                    </div>

                    {/* Simulation Result Tiles */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-3">
                        <div className={`p-3.5 rounded-2xl border ${isDark ? 'bg-zinc-800/40 border-zinc-700/60' : 'bg-gray-50 border-gray-200'}`}>
                            <p className="text-[9px] font-black uppercase tracking-wider text-gray-400">Remaining Purse</p>
                            <p className={`text-base font-black tabular-nums mt-0.5 ${simRemainingPurse >= 0 ? (isDark ? 'text-white' : 'text-gray-900') : 'text-red-500'}`}>
                                ₹{simRemainingPurse.toLocaleString()}
                            </p>
                        </div>

                        <div className={`p-3.5 rounded-2xl border ${isDark ? 'bg-zinc-800/40 border-zinc-700/60' : 'bg-gray-50 border-gray-200'}`}>
                            <p className="text-[9px] font-black uppercase tracking-wider text-gray-400">Reserve Required</p>
                            <p className="text-base font-black tabular-nums mt-0.5 text-blue-500">
                                ₹{reserveForRemaining.toLocaleString()}
                            </p>
                        </div>

                        <div className={`p-3.5 rounded-2xl border ${
                            simIsSafe
                                ? (isDark ? 'bg-emerald-950/20 border-emerald-500/30' : 'bg-emerald-50 border-emerald-200')
                                : (isDark ? 'bg-red-950/20 border-red-500/30' : 'bg-red-50 border-red-200')
                        }`}>
                            <p className="text-[9px] font-black uppercase tracking-wider text-gray-400">Safety Margin</p>
                            <p className={`text-base font-black tabular-nums mt-0.5 ${simIsSafe ? 'text-emerald-500' : 'text-red-500'}`}>
                                {simSurplus >= 0 ? `+₹${simSurplus.toLocaleString()}` : `-₹${Math.abs(simSurplus).toLocaleString()}`}
                            </p>
                        </div>

                        <div className={`p-3.5 rounded-2xl border ${isDark ? 'bg-zinc-800/40 border-zinc-700/60' : 'bg-gray-50 border-gray-200'}`}>
                            <p className="text-[9px] font-black uppercase tracking-wider text-gray-400">Avg / Next Player</p>
                            <p className="text-base font-black tabular-nums mt-0.5 text-indigo-400">
                                ₹{simAvgRemainingPerSlot.toLocaleString()}
                            </p>
                        </div>
                    </div>
                </div>
            </div>

            {/* SQUAD ROLE & CATEGORY QUOTAS BREAKDOWN */}
            <div className={`p-5 md:p-6 rounded-3xl border transition-all ${
                isDark ? 'bg-zinc-900/60 border-zinc-800' : 'bg-white border-gray-200 shadow-sm'
            }`}>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4 border-b pb-3 border-black/5 dark:border-white/5">
                    <div className="flex items-center gap-2">
                        <Target className="w-4 h-4 text-amber-500" />
                        <h3 className={`text-sm font-black uppercase tracking-wider ${isDark ? 'text-white' : 'text-gray-900'}`}>
                            Role Quotas &amp; Minimum Base Price Reserves
                        </h3>
                    </div>
                    <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">
                        Use + / - to customize your franchise target XI
                    </span>
                </div>

                <div className="space-y-3">
                    {quotas.map(q => {
                        const isSatisfied = q.shortfall === 0;
                        const pct = q.target > 0 ? Math.min(100, Math.round((q.current / q.target) * 100)) : 100;

                        return (
                            <div
                                key={q.id}
                                className={`p-3.5 rounded-2xl border transition-all flex flex-col md:flex-row md:items-center justify-between gap-3 ${
                                    isSatisfied
                                        ? (isDark ? 'bg-zinc-800/20 border-zinc-700/40' : 'bg-gray-50 border-gray-100')
                                        : (isDark ? 'bg-amber-950/20 border-amber-500/30' : 'bg-amber-50/50 border-amber-200')
                                }`}
                            >
                                <div className="flex items-center gap-3">
                                    <span className="text-2xl">{q.icon}</span>
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <h4 className={`text-xs md:text-sm font-black uppercase ${isDark ? 'text-white' : 'text-gray-900'}`}>
                                                {q.label}
                                            </h4>
                                            <span className={`text-[8px] font-black uppercase px-2 py-0.5 rounded-full ${
                                                isSatisfied
                                                    ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20'
                                                    : 'bg-amber-500/10 text-amber-500 border border-amber-500/20'
                                            }`}>
                                                {isSatisfied ? 'Quota Met' : `Need ${q.shortfall} More`}
                                            </span>
                                        </div>
                                        <p className="text-[10px] text-gray-400 font-semibold">
                                            Base Price: ₹{q.unitBasePrice.toLocaleString()} &bull; Reserve Needed: <b className="text-blue-500">₹{q.totalReserve.toLocaleString()}</b>
                                        </p>
                                    </div>
                                </div>

                                <div className="flex items-center justify-between md:justify-end gap-5">
                                    {/* Progress Bar */}
                                    <div className="w-28 sm:w-36 hidden sm:block">
                                        <div className="flex items-center justify-between text-[9px] font-bold text-gray-400 mb-1">
                                            <span>Progress</span>
                                            <span>{pct}%</span>
                                        </div>
                                        <div className="h-1.5 w-full bg-zinc-200 dark:bg-zinc-700 rounded-full overflow-hidden">
                                            <div
                                                className={`h-full rounded-full transition-all duration-500 ${
                                                    isSatisfied ? 'bg-emerald-500' : 'bg-amber-500'
                                                }`}
                                                style={{ width: `${pct}%` }}
                                            />
                                        </div>
                                    </div>

                                    {/* Stepper Count */}
                                    <div className="flex items-center gap-3">
                                        <span className={`text-xs font-black ${isDark ? 'text-zinc-300' : 'text-gray-700'}`}>
                                            {q.current} / {q.target}
                                        </span>
                                        <div className="flex items-center border rounded-xl overflow-hidden bg-black/5 dark:bg-white/5 border-zinc-300 dark:border-zinc-700">
                                            <button
                                                onClick={() => handleAdjustTarget(q.id, -1)}
                                                className="px-2 py-0.5 text-xs font-black hover:bg-black/10 dark:hover:bg-white/10"
                                                title="Decrease target"
                                            >
                                                -
                                            </button>
                                            <button
                                                onClick={() => handleAdjustTarget(q.id, 1)}
                                                className="px-2 py-0.5 text-xs font-black hover:bg-black/10 dark:hover:bg-white/10"
                                                title="Increase target"
                                            >
                                                +
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* STRATEGIC TACTICAL INSIGHTS */}
            <div className={`p-4 md:p-5 rounded-3xl border ${
                isDark ? 'bg-zinc-900/40 border-zinc-800' : 'bg-slate-50 border-slate-200'
            }`}>
                <div className="flex items-center gap-2 mb-2">
                    <Sparkles className="w-4 h-4 text-amber-400" />
                    <h4 className={`text-xs font-black uppercase tracking-wider ${isDark ? 'text-white' : 'text-gray-900'}`}>
                        Franchise Tactical Advice
                    </h4>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                    <div className="flex items-start gap-2">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" />
                        <p className={isDark ? 'text-zinc-400' : 'text-gray-600'}>
                            {neededPlayersTotal > 0
                                ? `With ₹${purseRemaining.toLocaleString()} remaining and ${neededPlayersTotal} players to buy, your squad average budget per slot is ₹${Math.floor(purseRemaining / neededPlayersTotal).toLocaleString()}.`
                                : 'Your squad is full! Budget conservation successful.'}
                        </p>
                    </div>
                    <div className="flex items-start gap-2">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" />
                        <p className={isDark ? 'text-zinc-400' : 'text-gray-600'}>
                            {maxSafeBid >= globalBasePrice
                                ? `Your maximum marquee bid is ₹${maxSafeBid.toLocaleString()}. Any bid higher will risk quota forfeiture.`
                                : 'You are in critical reserve mode. Stick to opening base price calls.'}
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );

    if (isEmbedded) {
        return content;
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
            <div className={`w-full max-w-4xl max-h-[92vh] overflow-y-auto custom-scrollbar rounded-3xl border shadow-2xl p-5 md:p-8 flex flex-col ${
                isDark ? 'bg-zinc-950 border-zinc-800' : 'bg-white border-gray-200'
            }`}>
                <div className="flex items-center justify-between pb-4 border-b border-black/5 dark:border-white/5 mb-4">
                    <div className="flex items-center gap-2.5">
                        <div className="p-2 rounded-2xl bg-blue-600 text-white shadow-md">
                            <Calculator className="w-5 h-5" />
                        </div>
                        <div>
                            <h2 className={`text-lg md:text-xl font-black uppercase tracking-tight ${isDark ? 'text-white' : 'text-gray-900'}`}>
                                Strategy &amp; Budget Calculator
                            </h2>
                            <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">
                                Live Franchise Decision Intelligence
                            </p>
                        </div>
                    </div>

                    <button
                        onClick={onClose}
                        className={`p-2 rounded-2xl border transition-all active:scale-95 ${
                            isDark ? 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-white' : 'bg-gray-100 border-gray-200 text-gray-600 hover:text-black'
                        }`}
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {content}
            </div>
        </div>
    );
};

export default TeamStrategyCalculator;
