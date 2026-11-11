import React, { useState, useMemo } from 'react';
import { Team, Player, DraftBoardState, DraftPickHistory, AuctionCategory } from '../../types';
import { 
    LayoutGrid, Users, Trophy, History, Star, BookOpen, Clock, Check, 
    Search, Filter, Shield, User, ArrowRight, Sparkles, Printer, Download,
    CheckCircle2, AlertCircle, ChevronRight, Lock
} from 'lucide-react';
import SoldCelebrationPopup from './SoldCelebrationPopup';

interface Props {
    myTeam: Team;
    teams: Team[];
    players: Player[];
    categories?: AuctionCategory[];
    draftState: DraftBoardState;
    draftPickMap: Map<string, DraftPickHistory>;
    auctionId: string;
    globalBasePrice?: number;
    onNominatePlayer: (player: Player) => void;
    isDark?: boolean;
}

export const TeamDraftDashboard: React.FC<Props> = ({
    myTeam,
    teams,
    players,
    categories = [],
    draftState,
    draftPickMap,
    auctionId,
    globalBasePrice = 100,
    onNominatePlayer,
    isDark = true
}) => {
    // Active navigation tab
    const [activeTab, setActiveTab] = useState<'DRAFT_BOARD' | 'MY_SQUAD' | 'ALL_TEAMS' | 'PICK_FEED' | 'WISHLIST' | 'RULES'>('DRAFT_BOARD');
    
    // Filter & search states for Draft Board
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
    const [statusFilter, setStatusFilter] = useState<'ALL' | 'AVAILABLE' | 'SOLD'>('AVAILABLE');
    
    // Target Wishlist (bookmarked player IDs stored in local state)
    const [wishlistIds, setWishlistIds] = useState<Set<string>>(() => {
        try {
            const saved = localStorage.getItem(`draft_wishlist_${auctionId}_${myTeam.id}`);
            return saved ? new Set(JSON.parse(saved)) : new Set<string>();
        } catch {
            return new Set<string>();
        }
    });

    const toggleWishlist = (playerId: string | number) => {
        const idStr = String(playerId);
        setWishlistIds(prev => {
            const next = new Set(prev);
            if (next.has(idStr)) {
                next.delete(idStr);
            } else {
                next.add(idStr);
            }
            try {
                localStorage.setItem(`draft_wishlist_${auctionId}_${myTeam.id}`, JSON.stringify(Array.from(next)));
            } catch (e) {
                console.error(e);
            }
            return next;
        });
    };

    // Selected team for viewing in ALL_TEAMS tab
    const [viewedTeamId, setViewedTeamId] = useState<string | number>(myTeam.id);

    // Is it my team's turn?
    const isMyTurn = String(draftState.currentTeamId) === String(myTeam.id) && draftState.roundStatus === 'IN_PROGRESS';

    // Admin toggle for team self-picking permission
    const isPickingAllowed = draftState.teamPickingEnabled !== false;
    const canPickNow = isMyTurn && isPickingAllowed;

    // Current turn team
    const currentTurnTeam = useMemo(() => {
        if (!draftState.currentTeamId) return null;
        return teams.find(t => String(t.id) === String(draftState.currentTeamId)) || null;
    }, [teams, draftState.currentTeamId]);

    // My team's drafted squad
    const mySquad = useMemo(() => {
        const picks = (draftState.history || []).filter(h => String(h.teamId) === String(myTeam.id));
        const pickIds = new Set(picks.map(p => String(p.playerId)));
        
        // Combine full player info
        const result: {
            id: string | number;
            name: string;
            role: string;
            category: string;
            photoUrl: string;
            jerseyNumber: string | number;
            soldPrice: number;
            pickNumber?: number;
            round?: number;
        }[] = [];

        picks.forEach(p => {
            const fullP = players.find(pl => String(pl.id) === String(p.playerId));
            result.push({
                id: p.playerId,
                name: p.playerName,
                role: p.playerRole || fullP?.role || 'Player',
                category: p.playerCategory || fullP?.category || 'General',
                photoUrl: p.playerPhoto || fullP?.photoUrl || '',
                jerseyNumber: fullP?.jerseyNumber || '',
                soldPrice: p.soldPrice || 0,
                pickNumber: p.pickNumber,
                round: p.round
            });
        });

        // Add any other players in team.players
        (myTeam.players || []).forEach(p => {
            if (!pickIds.has(String(p.id))) {
                result.push({
                    id: p.id,
                    name: p.name,
                    role: p.role || p.category || 'Player',
                    category: p.category || p.role || 'General',
                    photoUrl: p.photoUrl || '',
                    jerseyNumber: p.jerseyNumber || '',
                    soldPrice: p.soldPrice || 0
                });
            }
        });

        return result;
    }, [myTeam, players, draftState.history]);

    // Role breakdown for My Squad
    const roleCounts = useMemo(() => {
        const counts: Record<string, number> = {
            'Batsman': 0,
            'Bowler': 0,
            'All-Rounder': 0,
            'Wicketkeeper': 0,
            'Other': 0
        };

        mySquad.forEach(p => {
            const r = (p.role || p.category || '').toLowerCase();
            if (r.includes('bat')) counts['Batsman']++;
            else if (r.includes('bowl')) counts['Bowler']++;
            else if (r.includes('all') || r.includes('round')) counts['All-Rounder']++;
            else if (r.includes('keep') || r.includes('wk')) counts['Wicketkeeper']++;
            else counts['Other']++;
        });

        return counts;
    }, [mySquad]);

    // Categories list
    const availableCategories = useMemo(() => {
        const set = new Set<string>();
        categories.forEach(c => c.name && set.add(c.name));
        players.forEach(p => {
            const cat = p.category || p.role;
            if (cat) set.add(cat);
        });
        return Array.from(set);
    }, [categories, players]);

    // Filtered players for the Full Draft Board tab
    const filteredPlayers = useMemo(() => {
        return players.filter(p => {
            const matchesSearch = !searchQuery || 
                p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                (p.role && p.role.toLowerCase().includes(searchQuery.toLowerCase())) ||
                (p.category && p.category.toLowerCase().includes(searchQuery.toLowerCase()));

            const isSold = p.status === 'SOLD' || draftPickMap.has(String(p.id));
            const matchesStatus = statusFilter === 'ALL' ||
                (statusFilter === 'AVAILABLE' && !isSold) ||
                (statusFilter === 'SOLD' && isSold);

            const pCat = (p.category || p.role || '').toLowerCase();
            const matchesCat = selectedCategory === 'ALL' || pCat === selectedCategory.toLowerCase();

            return matchesSearch && matchesStatus && matchesCat;
        });
    }, [players, searchQuery, statusFilter, selectedCategory, draftPickMap]);

    // Group filtered players by category for row-wise display
    const categoryGroups = useMemo(() => {
        const groupMap = new Map<string, Player[]>();

        // Pre-populate with available categories
        availableCategories.forEach(cat => {
            groupMap.set(cat, []);
        });

        filteredPlayers.forEach(p => {
            const cat = p.category || p.role || 'General';
            let matchedKey = Array.from(groupMap.keys()).find(k => k.toLowerCase() === cat.toLowerCase());
            if (!matchedKey) {
                matchedKey = cat;
                groupMap.set(matchedKey, []);
            }
            groupMap.get(matchedKey)!.push(p);
        });

        const groups: {
            category: string;
            players: Player[];
            availableCount: number;
            soldCount: number;
        }[] = [];

        groupMap.forEach((catPlayers, category) => {
            const totalInCat = players.filter(p => (p.category || p.role || 'General').toLowerCase() === category.toLowerCase());
            const soldInCat = totalInCat.filter(p => p.status === 'SOLD' || draftPickMap.has(String(p.id))).length;
            const availInCat = totalInCat.length - soldInCat;

            if (selectedCategory === 'ALL') {
                if (catPlayers.length > 0) {
                    groups.push({
                        category,
                        players: catPlayers,
                        availableCount: availInCat,
                        soldCount: soldInCat
                    });
                }
            } else if (category.toLowerCase() === selectedCategory.toLowerCase()) {
                groups.push({
                    category,
                    players: catPlayers,
                    availableCount: availInCat,
                    soldCount: soldInCat
                });
            }
        });

        return groups;
    }, [availableCategories, filteredPlayers, players, draftPickMap, selectedCategory]);

    // Wishlist players
    const wishlistPlayers = useMemo(() => {
        return players.filter(p => wishlistIds.has(String(p.id)));
    }, [players, wishlistIds]);

    // Max squad limit
    const squadLimit = myTeam.maxPlayers || 15;
    const squadCount = mySquad.length;
    const totalSpent = mySquad.reduce((sum, p) => sum + (p.soldPrice || 0), 0);

    return (
        <div className="flex flex-col h-full min-h-0 w-full overflow-hidden bg-zinc-950 text-white select-none">
            {/* TOP TEAM HERO BANNER */}
            <div className="shrink-0 p-3 md:p-4 bg-gradient-to-r from-zinc-900 via-indigo-950/40 to-zinc-900 border-b border-zinc-800 shadow-xl">
                <div className="flex flex-col md:flex-row items-center justify-between gap-3">
                    {/* Team Identity */}
                    <div className="flex items-center gap-3 w-full md:w-auto">
                        {myTeam.logoUrl ? (
                            <img 
                                src={myTeam.logoUrl} 
                                alt={myTeam.name} 
                                className="w-12 h-12 md:w-14 md:h-14 rounded-2xl object-contain bg-white p-1 border-2 border-amber-400 shadow-lg shrink-0" 
                            />
                        ) : (
                            <div className="w-12 h-12 md:w-14 md:h-14 rounded-2xl bg-blue-600 text-white font-black text-2xl flex items-center justify-center border-2 border-amber-400 shrink-0">
                                {myTeam.name.charAt(0)}
                            </div>
                        )}
                        <div className="min-w-0">
                            <div className="flex items-center gap-2">
                                <span className="px-2 py-0.5 rounded-md bg-blue-500/20 text-blue-400 font-black text-[9px] uppercase tracking-wider border border-blue-500/30">
                                    Team Portal
                                </span>
                                {myTeam.owner && (
                                    <span className="text-[10px] text-zinc-400 font-bold truncate">
                                        Owner: {myTeam.owner}
                                    </span>
                                )}
                            </div>
                            <h1 className="text-lg md:text-xl font-black uppercase italic tracking-tight text-white truncate drop-shadow">
                                {myTeam.name}
                            </h1>
                        </div>
                    </div>

                    {/* TURN STATUS BANNER (SOLID HIGH-CONTRAST COLORS) */}
                    <div className="w-full md:w-auto flex items-center justify-between md:justify-end gap-3">
                        {isMyTurn ? (
                            isPickingAllowed ? (
                                <div className="flex-1 md:flex-initial px-4 py-2 rounded-xl bg-emerald-500 text-black font-black text-xs md:text-sm uppercase tracking-wider shadow-lg border-2 border-emerald-200 flex items-center gap-2 animate-pulse">
                                    <Sparkles className="w-4 h-4 fill-black text-black shrink-0" />
                                    <span className="text-black font-black">YOUR TURN TO PICK! ({draftState.timerTimeRemaining}s)</span>
                                </div>
                            ) : (
                                <div className="flex-1 md:flex-initial px-4 py-2 rounded-xl bg-amber-400 text-black font-black text-xs md:text-sm uppercase tracking-wider shadow-lg border-2 border-amber-200 flex items-center gap-2">
                                    <Lock className="w-4 h-4 text-black shrink-0" />
                                    <span className="text-black font-black">YOUR TURN (ADMIN PICKING) ({draftState.timerTimeRemaining}s)</span>
                                </div>
                            )
                        ) : (
                            <div className="flex-1 md:flex-initial px-3.5 py-1.5 rounded-xl bg-zinc-900 border border-zinc-700 text-xs flex items-center gap-2">
                                <Clock className="w-4 h-4 text-amber-400 shrink-0" />
                                <div>
                                    <p className="text-[8px] font-bold text-zinc-400 uppercase">On The Clock</p>
                                    <p className="font-black text-amber-300 text-xs uppercase truncate max-w-[140px]">
                                        {currentTurnTeam?.name || 'Waiting...'} ({draftState.timerTimeRemaining}s)
                                    </p>
                                </div>
                            </div>
                        )}

                        {/* Squad & Targets Stats (No Purse/Bidding) */}
                        <div className="flex items-center gap-2">
                            <div className="px-3 py-1.5 rounded-xl bg-black/60 border border-white/10 text-right">
                                <p className="text-[8px] font-bold text-zinc-400 uppercase">Drafted Squad</p>
                                <p className="text-xs font-black text-amber-400 tabular-nums">
                                    {squadCount}{myTeam.maxPlayers ? `/${myTeam.maxPlayers}` : ''}
                                </p>
                            </div>
                            <div className="px-3 py-1.5 rounded-xl bg-black/60 border border-white/10 text-right">
                                <p className="text-[8px] font-bold text-zinc-400 uppercase">Targets</p>
                                <p className="text-xs font-black text-yellow-400 tabular-nums">
                                    {wishlistIds.size}
                                </p>
                            </div>
                        </div>
                    </div>
                </div>

                {/* NAVIGATION TABS */}
                <div className="flex items-center gap-1.5 overflow-x-auto custom-scrollbar pt-3 mt-2 border-t border-white/10">
                    <button
                        onClick={() => setActiveTab('DRAFT_BOARD')}
                        className={`px-3 py-2 rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-1.5 whitespace-nowrap transition-all ${
                            activeTab === 'DRAFT_BOARD'
                                ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/30 ring-1 ring-blue-400'
                                : 'bg-zinc-900 text-zinc-400 hover:text-white hover:bg-zinc-800'
                        }`}
                    >
                        <LayoutGrid className="w-3.5 h-3.5" /> Full Draft Board
                    </button>
                    <button
                        onClick={() => setActiveTab('MY_SQUAD')}
                        className={`px-3 py-2 rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-1.5 whitespace-nowrap transition-all ${
                            activeTab === 'MY_SQUAD'
                                ? 'bg-amber-500 text-black shadow-lg shadow-amber-500/30 font-black'
                                : 'bg-zinc-900 text-zinc-400 hover:text-white hover:bg-zinc-800'
                        }`}
                    >
                        <Users className="w-3.5 h-3.5" /> My Squad ({squadCount})
                    </button>
                    <button
                        onClick={() => setActiveTab('ALL_TEAMS')}
                        className={`px-3 py-2 rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-1.5 whitespace-nowrap transition-all ${
                            activeTab === 'ALL_TEAMS'
                                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30'
                                : 'bg-zinc-900 text-zinc-400 hover:text-white hover:bg-zinc-800'
                        }`}
                    >
                        <Trophy className="w-3.5 h-3.5" /> All Teams Squads
                    </button>
                    <button
                        onClick={() => setActiveTab('PICK_FEED')}
                        className={`px-3 py-2 rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-1.5 whitespace-nowrap transition-all ${
                            activeTab === 'PICK_FEED'
                                ? 'bg-purple-600 text-white shadow-lg shadow-purple-600/30'
                                : 'bg-zinc-900 text-zinc-400 hover:text-white hover:bg-zinc-800'
                        }`}
                    >
                        <History className="w-3.5 h-3.5" /> Live Pick Feed ({draftState.history?.length || 0})
                    </button>
                    <button
                        onClick={() => setActiveTab('WISHLIST')}
                        className={`px-3 py-2 rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-1.5 whitespace-nowrap transition-all ${
                            activeTab === 'WISHLIST'
                                ? 'bg-yellow-500 text-black shadow-lg shadow-yellow-500/30 font-black'
                                : 'bg-zinc-900 text-zinc-400 hover:text-white hover:bg-zinc-800'
                        }`}
                    >
                        <Star className="w-3.5 h-3.5" /> Target Wishlist ({wishlistIds.size})
                    </button>
                    <button
                        onClick={() => setActiveTab('RULES')}
                        className={`px-3 py-2 rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-1.5 whitespace-nowrap transition-all ${
                            activeTab === 'RULES'
                                ? 'bg-zinc-700 text-white'
                                : 'bg-zinc-900 text-zinc-400 hover:text-white hover:bg-zinc-800'
                        }`}
                    >
                        <BookOpen className="w-3.5 h-3.5" /> Rules &amp; Order
                    </button>
                </div>
            </div>

            {/* TAB CONTENTS */}
            <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar p-3 md:p-6">
                {/* =========================================================================
                    TAB 1: FULL DRAFT BOARD
                    ========================================================================= */}
                {activeTab === 'DRAFT_BOARD' && (
                    <div className="space-y-4">
                        {/* Notification when it's your turn (SOLID HIGH-CONTRAST COLORS) */}
                        {isMyTurn && (
                            canPickNow ? (
                                <div className="p-4 md:p-5 rounded-2xl bg-emerald-600 border-4 border-emerald-300 text-white shadow-2xl flex flex-wrap items-center justify-between gap-3 animate-pulse">
                                    <div className="flex items-center gap-3">
                                        <div className="w-11 h-11 rounded-xl bg-white text-emerald-800 flex items-center justify-center font-black shadow-lg shrink-0">
                                            <Sparkles className="w-6 h-6 fill-emerald-800 text-emerald-800" />
                                        </div>
                                        <div>
                                            <h3 className="text-base md:text-lg font-black uppercase text-white tracking-wider">
                                                Captain, It is Your Turn to Pick!
                                            </h3>
                                            <p className="text-xs md:text-sm font-bold text-emerald-100">
                                                Click &apos;Draft Now&apos; on any available player below to draft them into {myTeam.name}.
                                            </p>
                                        </div>
                                    </div>
                                    <div className="px-4 py-2 rounded-xl bg-white text-black font-mono font-black text-sm md:text-base border-2 border-black shadow">
                                        ⏱ {draftState.timerTimeRemaining}s REMAINING
                                    </div>
                                </div>
                            ) : (
                                <div className="p-4 md:p-5 rounded-2xl bg-amber-500 border-4 border-amber-200 text-black shadow-2xl flex flex-wrap items-center justify-between gap-3">
                                    <div className="flex items-center gap-3">
                                        <div className="w-11 h-11 rounded-xl bg-black text-amber-400 flex items-center justify-center font-black shadow-lg shrink-0">
                                            <Lock className="w-6 h-6 text-amber-400" />
                                        </div>
                                        <div>
                                            <h3 className="text-base md:text-lg font-black uppercase text-black tracking-wider">
                                                Your Turn is Active (Admin Picking Mode)
                                            </h3>
                                            <p className="text-xs md:text-sm font-bold text-zinc-900">
                                                Team self-picking is currently locked by Administrator. The admin will select your player from the control board.
                                            </p>
                                        </div>
                                    </div>
                                    <div className="px-4 py-2 rounded-xl bg-black text-white font-mono font-black text-sm md:text-base border-2 border-black shadow">
                                        ⏱ {draftState.timerTimeRemaining}s REMAINING
                                    </div>
                                </div>
                            )
                        )}

                        {/* Admin Picking Locked Notice when not your turn */}
                        {!isPickingAllowed && !isMyTurn && (
                            <div className="p-2.5 px-4 rounded-xl bg-zinc-900 border border-zinc-700/80 flex items-center justify-between text-xs text-zinc-300">
                                <span className="flex items-center gap-2 font-bold">
                                    <Lock className="w-3.5 h-3.5 text-amber-400" />
                                    <span>Team self-picking is disabled by Admin (Admin picks on behalf of teams)</span>
                                </span>
                                <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded bg-zinc-800 text-amber-400">
                                    Admin Controlled
                                </span>
                            </div>
                        )}

                        {/* Search & Category Filter Controls */}
                        <div className="p-3 rounded-2xl bg-zinc-900/80 border border-zinc-800 flex flex-wrap items-center justify-between gap-3 shadow-md">
                            <div className="flex items-center gap-2 flex-1 min-w-[200px]">
                                <Search className="w-4 h-4 text-zinc-400" />
                                <input
                                    type="text"
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    placeholder="Search by player name, role, or category..."
                                    className="w-full bg-black/50 border border-zinc-700 rounded-xl px-3 py-1.5 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-blue-500"
                                />
                            </div>

                            <div className="flex items-center gap-2 flex-wrap">
                                {/* Status Filter */}
                                <div className="flex items-center p-0.5 rounded-xl bg-black/60 border border-zinc-700">
                                    <button
                                        onClick={() => setStatusFilter('AVAILABLE')}
                                        className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all ${
                                            statusFilter === 'AVAILABLE' ? 'bg-emerald-600 text-white shadow' : 'text-zinc-400 hover:text-white'
                                        }`}
                                    >
                                        Available
                                    </button>
                                    <button
                                        onClick={() => setStatusFilter('SOLD')}
                                        className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all ${
                                            statusFilter === 'SOLD' ? 'bg-red-600 text-white shadow' : 'text-zinc-400 hover:text-white'
                                        }`}
                                    >
                                        Sold
                                    </button>
                                    <button
                                        onClick={() => setStatusFilter('ALL')}
                                        className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all ${
                                            statusFilter === 'ALL' ? 'bg-zinc-700 text-white shadow' : 'text-zinc-400 hover:text-white'
                                        }`}
                                    >
                                        All
                                    </button>
                                </div>

                                {/* Category Dropdown */}
                                <select
                                    value={selectedCategory}
                                    onChange={(e) => setSelectedCategory(e.target.value)}
                                    className="bg-black/60 border border-zinc-700 rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none font-bold uppercase tracking-wider"
                                >
                                    <option value="ALL">★ All Categories</option>
                                    {availableCategories.map(cat => (
                                        <option key={cat} value={cat}>{cat}</option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        {/* CATEGORIES IN ROW-WISE WITH CATEGORY NAME COLUMN ON LEFT */}
                        <div className="space-y-4">
                            {categoryGroups.map(group => {
                                const groupPlayers = group.players;
                                if (groupPlayers.length === 0) return null;

                                return (
                                    <div
                                        key={group.category}
                                        className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-3 md:p-4 flex flex-col md:flex-row items-stretch gap-3 md:gap-4 shadow-xl"
                                    >
                                        {/* LEFT COLUMN: CATEGORY NAME & STATS */}
                                        <div className="w-full md:w-44 lg:w-48 shrink-0 rounded-xl bg-gradient-to-b from-zinc-900 via-zinc-950 to-zinc-900 border-2 border-amber-500/40 p-3 flex flex-row md:flex-col justify-between items-center text-center shadow-md">
                                            <div className="flex items-center md:flex-col gap-2 md:gap-1 text-left md:text-center w-full">
                                                <div className="w-8 h-8 rounded-full bg-amber-500/20 border border-amber-500/50 mx-auto flex items-center justify-center text-amber-400 shadow shrink-0">
                                                    <Trophy className="w-4 h-4" />
                                                </div>
                                                <div className="min-w-0 flex-1 md:w-full">
                                                    <h3 className="text-xs md:text-sm font-black uppercase tracking-wider text-amber-400 truncate md:break-words leading-tight">
                                                        {group.category}
                                                    </h3>
                                                    <span className="text-[9px] font-bold text-zinc-400 uppercase mt-0.5 block">
                                                        ({groupPlayers.length} Players)
                                                    </span>
                                                </div>
                                            </div>

                                            <div className="flex md:flex-col gap-1.5 md:gap-1 md:w-full md:pt-2 md:border-t md:border-white/10 shrink-0">
                                                <div className="py-0.5 px-2 rounded-md bg-emerald-500/15 border border-emerald-500/30 text-[9px] font-black text-emerald-400 uppercase flex items-center justify-between gap-1">
                                                    <span>Avail</span>
                                                    <span>{group.availableCount}</span>
                                                </div>
                                                <div className="py-0.5 px-2 rounded-md bg-red-500/15 border border-red-500/30 text-[9px] font-black text-red-400 uppercase flex items-center justify-between gap-1">
                                                    <span>Sold</span>
                                                    <span>{group.soldCount}</span>
                                                </div>
                                            </div>
                                        </div>

                                        {/* RIGHT MAIN AREA: PLAYERS IN THIS CATEGORY */}
                                        <div className="flex-1 min-w-0">
                                            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7 gap-2.5">
                                                {groupPlayers.map(player => {
                                                    const pickInfo = draftPickMap.get(String(player.id));
                                                    const isSold = player.status === 'SOLD' || !!pickInfo;
                                                    const soldTeamName = pickInfo?.teamName || player.soldTo || 'Assigned';
                                                    const isWishlisted = wishlistIds.has(String(player.id));

                                                    return (
                                                        <div
                                                            key={player.id}
                                                            onClick={() => {
                                                                if (!isSold && canPickNow) {
                                                                    onNominatePlayer(player);
                                                                }
                                                            }}
                                                            className={`group relative rounded-2xl border-2 p-2 flex flex-col justify-between transition-all duration-200 overflow-hidden shadow-lg ${
                                                                isSold
                                                                    ? 'bg-gradient-to-b from-red-950/40 via-zinc-900 to-zinc-950 border-red-500/70 opacity-80 cursor-default'
                                                                    : canPickNow
                                                                    ? 'bg-zinc-900 border-emerald-500/90 hover:border-emerald-400 hover:shadow-emerald-500/20 hover:scale-[1.02] cursor-pointer ring-2 ring-emerald-500/30'
                                                                    : 'bg-zinc-900 border-zinc-700/80 hover:border-zinc-500 cursor-default'
                                                            }`}
                                                        >
                                                            {/* Top Bar on Card: Role, Jersey #, and Wishlist Star */}
                                                            <div className="flex items-center justify-between gap-1 mb-1 z-10">
                                                                <span className="text-[8px] font-black uppercase px-2 py-0.5 rounded bg-black/80 text-amber-300 border border-amber-400/30 truncate max-w-[65%]">
                                                                    {player.role || player.category || 'PLAYER'}
                                                                </span>
                                                                <div className="flex items-center gap-1">
                                                                    <button
                                                                        type="button"
                                                                        onClick={(e) => {
                                                                            e.stopPropagation();
                                                                            toggleWishlist(player.id);
                                                                        }}
                                                                        className={`p-1 rounded-md transition-all ${
                                                                            isWishlisted ? 'text-yellow-400 bg-yellow-400/20' : 'text-zinc-600 hover:text-zinc-400'
                                                                        }`}
                                                                        title={isWishlisted ? 'Remove from Wishlist' : 'Add to Wishlist'}
                                                                    >
                                                                        <Star className={`w-3 h-3 ${isWishlisted ? 'fill-yellow-400' : ''}`} />
                                                                    </button>
                                                                    {player.jerseyNumber ? (
                                                                        <span className="text-[8px] font-bold text-zinc-300 bg-zinc-800 px-1 rounded">
                                                                            #{player.jerseyNumber}
                                                                        </span>
                                                                    ) : null}
                                                                </div>
                                                            </div>

                                                            {/* Player Photo & Sold Badge */}
                                                            <div className="relative aspect-square w-full rounded-xl overflow-hidden bg-zinc-950 border border-zinc-800 my-1 flex items-center justify-center">
                                                                {player.photoUrl ? (
                                                                    <img 
                                                                        src={player.photoUrl} 
                                                                        alt={player.name}
                                                                        className={`w-full h-full object-cover ${isSold ? 'grayscale contrast-125 opacity-30' : ''}`}
                                                                    />
                                                                ) : (
                                                                    <div className="w-full h-full flex items-center justify-center font-black text-2xl text-zinc-600 bg-zinc-900">
                                                                        {player.name.charAt(0)}
                                                                    </div>
                                                                )}

                                                                {/* SOLD Overlay */}
                                                                {isSold && (
                                                                    <div className="absolute inset-0 bg-black/80 backdrop-blur-[1px] flex flex-col items-center justify-center p-1 text-center">
                                                                        <span className="px-2 py-0.5 rounded bg-red-600 text-white font-black text-[9px] uppercase tracking-wider shadow">
                                                                            SOLD
                                                                        </span>
                                                                        <p className="text-[10px] font-black text-amber-300 uppercase mt-1 truncate max-w-full px-1">
                                                                            {soldTeamName}
                                                                        </p>
                                                                    </div>
                                                                )}
                                                            </div>

                                                            {/* Player Name */}
                                                            <div className="text-center mt-1">
                                                                <h4 className="text-xs font-black uppercase tracking-tight text-white truncate drop-shadow">
                                                                    {player.name}
                                                                </h4>
                                                            </div>

                                                            {/* Bottom Action: Draft Button (If My Turn & Allowed) or Status */}
                                                            <div className="mt-2 pt-1 border-t border-white/10">
                                                                {isSold ? (
                                                                    <div className="py-0.5 text-center text-[9px] font-bold text-zinc-400 uppercase truncate">
                                                                        ★ {soldTeamName}
                                                                    </div>
                                                                ) : canPickNow ? (
                                                                    <button
                                                                        type="button"
                                                                        onClick={(e) => {
                                                                            e.stopPropagation();
                                                                            onNominatePlayer(player);
                                                                        }}
                                                                        className="w-full py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-black font-black text-[10px] uppercase tracking-wider shadow-md flex items-center justify-center gap-1 active:scale-95 transition-all"
                                                                    >
                                                                        <Check className="w-3 h-3 stroke-[3]" /> Draft Now
                                                                    </button>
                                                                ) : isMyTurn && !isPickingAllowed ? (
                                                                    <div className="py-1 rounded bg-amber-500/20 border border-amber-500/40 text-center text-[8px] font-bold text-amber-300 uppercase flex items-center justify-center gap-1">
                                                                        <Lock className="w-2.5 h-2.5" /> Admin Only
                                                                    </div>
                                                                ) : (
                                                                    <div className="py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20 text-center text-[8px] font-bold text-emerald-400 uppercase">
                                                                        Available
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}

                            {categoryGroups.every(g => g.players.length === 0) && (
                                <div className="p-12 text-center rounded-3xl border border-zinc-800 bg-zinc-900/40 text-zinc-500">
                                    <p className="text-sm font-black uppercase">No players found matching your filter</p>
                                    <p className="text-xs text-zinc-600 mt-1">Try resetting the search query or status filter.</p>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* =========================================================================
                    TAB 2: MY SQUAD
                    ========================================================================= */}
                {activeTab === 'MY_SQUAD' && (
                    <div className="space-y-6">
                        {/* Squad Metrics Overview (No purse/budget) */}
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                            <div className="p-4 rounded-2xl bg-zinc-900 border border-zinc-800 shadow-md">
                                <p className="text-[9px] font-bold uppercase text-zinc-400">Total Players Drafted</p>
                                <p className="text-2xl font-black text-amber-400 mt-1">
                                    {squadCount} {myTeam.maxPlayers ? <span className="text-sm text-zinc-500 font-bold">/ {myTeam.maxPlayers} max</span> : ''}
                                </p>
                            </div>
                            <div className="p-4 rounded-2xl bg-zinc-900 border border-zinc-800 shadow-md">
                                <p className="text-[9px] font-bold uppercase text-zinc-400">Draft Status</p>
                                <p className="text-base font-black text-emerald-400 mt-1 uppercase">
                                    {squadCount >= squadLimit ? 'Squad Complete' : `${squadLimit - squadCount} Slots Open`}
                                </p>
                            </div>
                            <div className="p-4 rounded-2xl bg-zinc-900 border border-zinc-800 shadow-md">
                                <p className="text-[9px] font-bold uppercase text-zinc-400">Target Wishlist</p>
                                <p className="text-2xl font-black text-yellow-400 mt-1">
                                    {wishlistPlayers.length} Bookmarked
                                </p>
                            </div>
                            <div className="p-4 rounded-2xl bg-zinc-900 border border-zinc-800 shadow-md flex items-center justify-between">
                                <div>
                                    <p className="text-[9px] font-bold uppercase text-zinc-400">Squad Balance</p>
                                    <p className="text-xs font-black text-blue-400 mt-1">
                                        {roleCounts['Batsman']} Bat · {roleCounts['Bowler']} Bowl · {roleCounts['All-Rounder']} AR · {roleCounts['Wicketkeeper']} WK
                                    </p>
                                </div>
                                <button
                                    onClick={() => window.print()}
                                    className="p-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 shadow"
                                    title="Print Squad Roster"
                                >
                                    <Printer className="w-4 h-4" />
                                </button>
                            </div>
                        </div>

                        {/* Roster Cards Grid */}
                        <div>
                            <div className="flex items-center justify-between mb-3">
                                <h3 className="text-sm font-black uppercase tracking-wider text-white flex items-center gap-2">
                                    <Users className="w-4 h-4 text-amber-400" /> Official Roster ({squadCount} Players)
                                </h3>
                            </div>

                            {squadCount === 0 ? (
                                <div className="p-12 rounded-3xl border border-zinc-800 bg-zinc-900/40 text-center space-y-3">
                                    <Users className="w-12 h-12 text-zinc-600 mx-auto" />
                                    <h4 className="text-base font-black uppercase text-zinc-300">No Players Drafted Yet</h4>
                                    <p className="text-xs text-zinc-500 max-w-md mx-auto">
                                        Your drafted players will appear here in real-time as your team makes selections during each round of the draft board.
                                    </p>
                                </div>
                            ) : (
                                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
                                    {mySquad.map((player, idx) => (
                                        <div
                                            key={player.id}
                                            className="rounded-2xl border border-amber-500/40 bg-gradient-to-b from-zinc-900 via-zinc-950 to-black p-2.5 flex flex-col justify-between shadow-xl"
                                        >
                                            <div className="flex items-center justify-between gap-1 mb-1">
                                                <span className="text-[8px] font-black uppercase px-2 py-0.5 rounded bg-black/70 text-amber-400 border border-amber-500/30">
                                                    {player.role}
                                                </span>
                                                <span className="text-[9px] font-bold text-zinc-400">
                                                    #{idx + 1}
                                                </span>
                                            </div>

                                            <div className="relative aspect-square w-full rounded-xl overflow-hidden bg-zinc-950 border border-white/5 my-1">
                                                {player.photoUrl ? (
                                                    <img src={player.photoUrl} alt="" className="w-full h-full object-cover" />
                                                ) : (
                                                    <div className="w-full h-full flex items-center justify-center font-black text-2xl text-zinc-600">
                                                        {player.name.charAt(0)}
                                                    </div>
                                                )}
                                            </div>

                                            <div className="text-center mt-1">
                                                <h4 className="text-xs font-black uppercase tracking-tight text-white truncate">
                                                    {player.name}
                                                </h4>
                                                {player.jerseyNumber ? (
                                                    <p className="text-[9px] text-zinc-400 font-bold">Jersey #{player.jerseyNumber}</p>
                                                ) : null}
                                            </div>

                                            <div className="mt-2 pt-1 border-t border-white/10 flex items-center justify-between text-[9px] font-black text-emerald-400">
                                                <span className="flex items-center gap-1"><CheckCircle2 className="w-3 h-3 text-emerald-400" /> Drafted</span>
                                                <span className="text-zinc-400 font-bold">{player.round ? `Round ${player.round}` : 'Official Pick'}</span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* =========================================================================
                    TAB 3: ALL TEAMS SQUADS
                    ========================================================================= */}
                {activeTab === 'ALL_TEAMS' && (
                    <div className="space-y-4">
                        {/* Team Picker Bar */}
                        <div className="flex items-center gap-2 overflow-x-auto custom-scrollbar pb-2">
                            {teams.map(t => {
                                const isSelected = String(t.id) === String(viewedTeamId);
                                const count = (draftState.history || []).filter(h => String(h.teamId) === String(t.id)).length;
                                return (
                                    <button
                                        key={t.id}
                                        onClick={() => setViewedTeamId(t.id)}
                                        className={`px-3 py-2 rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-2 transition-all whitespace-nowrap border ${
                                            isSelected
                                                ? 'bg-amber-500 text-black border-amber-400 shadow-lg font-black'
                                                : 'bg-zinc-900 text-zinc-300 border-zinc-800 hover:border-zinc-700'
                                        }`}
                                    >
                                        {t.logoUrl ? (
                                            <img src={t.logoUrl} alt="" className="w-4 h-4 rounded-full object-contain bg-white" />
                                        ) : null}
                                        <span>{t.name}</span>
                                        <span className={`text-[9px] px-1.5 py-0.5 rounded-full ${isSelected ? 'bg-black text-amber-300' : 'bg-zinc-800 text-zinc-400'}`}>
                                            {count}
                                        </span>
                                    </button>
                                );
                            })}
                        </div>

                        {/* Selected Rival Team Roster */}
                        {(() => {
                            const targetTeam = teams.find(t => String(t.id) === String(viewedTeamId)) || myTeam;
                            const targetPicks = (draftState.history || []).filter(h => String(h.teamId) === String(targetTeam.id));
                            return (
                                <div className="space-y-4 p-4 rounded-3xl bg-zinc-900/60 border border-zinc-800">
                                    <div className="flex items-center justify-between pb-3 border-b border-white/10">
                                        <div className="flex items-center gap-3">
                                            {targetTeam.logoUrl ? (
                                                <img src={targetTeam.logoUrl} alt="" className="w-10 h-10 rounded-xl object-contain bg-white p-0.5" />
                                            ) : (
                                                <div className="w-10 h-10 rounded-xl bg-blue-600 text-white font-black flex items-center justify-center">
                                                    {targetTeam.name.charAt(0)}
                                                </div>
                                            )}
                                            <div>
                                                <h3 className="text-base font-black uppercase text-white">{targetTeam.name}</h3>
                                                <p className="text-[10px] text-zinc-400">
                                                    Owner: {targetTeam.owner || 'Franchise'} • {targetPicks.length} Drafted Players
                                                </p>
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-[9px] uppercase font-bold text-zinc-400">Squad Fill</p>
                                            <p className="text-sm font-black text-amber-400">{targetPicks.length} Players</p>
                                        </div>
                                    </div>

                                    {targetPicks.length === 0 ? (
                                        <p className="text-xs text-zinc-500 py-8 text-center uppercase tracking-wider">
                                            This team has not made any draft picks yet.
                                        </p>
                                    ) : (
                                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
                                            {targetPicks.map(pick => (
                                                <div key={pick.id} className="rounded-2xl border border-zinc-800 bg-zinc-950 p-2 text-center space-y-1.5">
                                                    <div className="aspect-square w-full rounded-xl overflow-hidden bg-zinc-900 mx-auto">
                                                        {pick.playerPhoto ? (
                                                            <img src={pick.playerPhoto} alt="" className="w-full h-full object-cover" />
                                                        ) : (
                                                            <div className="w-full h-full flex items-center justify-center text-zinc-600 font-black">
                                                                {pick.playerName.charAt(0)}
                                                            </div>
                                                        )}
                                                    </div>
                                                    <h5 className="text-xs font-black uppercase text-white truncate">{pick.playerName}</h5>
                                                    <p className="text-[9px] text-amber-400 uppercase font-bold">{pick.playerRole || pick.playerCategory}</p>
                                                    <span className="text-[8px] text-zinc-500 block">R{pick.round} Pick #{pick.pickNumber}</span>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            );
                        })()}
                    </div>
                )}

                {/* =========================================================================
                    TAB 4: LIVE PICK FEED
                    ========================================================================= */}
                {activeTab === 'PICK_FEED' && (
                    <div className="max-w-3xl mx-auto space-y-2">
                        <div className="flex items-center justify-between mb-2">
                            <h3 className="text-sm font-black uppercase tracking-wider text-white flex items-center gap-2">
                                <History className="w-4 h-4 text-purple-400" /> Chronological Draft Pick History
                            </h3>
                            <span className="text-xs text-zinc-400 font-bold">
                                {draftState.history?.length || 0} Picks Completed
                            </span>
                        </div>

                        {(!draftState.history || draftState.history.length === 0) ? (
                            <div className="p-12 text-center text-zinc-500 uppercase tracking-widest text-xs">
                                No picks have occurred yet. Picks will stream here in real-time.
                            </div>
                        ) : (
                            draftState.history.slice().reverse().map(h => (
                                <div
                                    key={h.id}
                                    className="p-3 rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center justify-between gap-3 shadow-md hover:border-zinc-700 transition-all"
                                >
                                    <div className="flex items-center gap-3 min-w-0">
                                        <div className="w-10 h-10 rounded-xl overflow-hidden bg-zinc-950 shrink-0 border border-white/10">
                                            {h.playerPhoto ? (
                                                <img src={h.playerPhoto} alt="" className="w-full h-full object-cover" />
                                            ) : (
                                                <div className="w-full h-full flex items-center justify-center font-black text-sm text-zinc-600">
                                                    {h.playerName.charAt(0)}
                                                </div>
                                            )}
                                        </div>
                                        <div className="min-w-0">
                                            <p className="text-xs md:text-sm font-black uppercase text-white truncate">{h.playerName}</p>
                                            <div className="flex items-center gap-2 mt-0.5">
                                                <span className="text-[9px] font-bold text-amber-400 uppercase">{h.playerRole || h.playerCategory}</span>
                                                <span className="text-zinc-600">•</span>
                                                <span className="text-[9px] font-black text-blue-400 uppercase">{h.teamName}</span>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="text-right shrink-0">
                                        <span className="px-2 py-0.5 rounded-lg bg-black text-amber-300 font-black text-xs border border-amber-500/30">
                                            Round {h.round} • #{h.pickNumber}
                                        </span>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                )}

                {/* =========================================================================
                    TAB 5: TARGET WISHLIST
                    ========================================================================= */}
                {activeTab === 'WISHLIST' && (
                    <div className="space-y-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <h3 className="text-sm font-black uppercase tracking-wider text-white flex items-center gap-2">
                                    <Star className="w-4 h-4 text-yellow-400 fill-yellow-400" /> Captain&apos;s Target Shortlist
                                </h3>
                                <p className="text-[10px] text-zinc-400 mt-0.5">
                                    Pin key players you want to acquire so you can draft them quickly during your turn.
                                </p>
                            </div>
                            <span className="text-xs font-bold text-amber-400 bg-amber-500/10 border border-amber-500/30 px-3 py-1 rounded-full">
                                {wishlistPlayers.length} Bookmarked
                            </span>
                        </div>

                        {wishlistPlayers.length === 0 ? (
                            <div className="p-12 text-center rounded-3xl border border-zinc-800 bg-zinc-900/40 space-y-2">
                                <Star className="w-10 h-10 text-zinc-600 mx-auto" />
                                <p className="text-sm font-black uppercase text-zinc-400">Your Target Shortlist is Empty</p>
                                <p className="text-xs text-zinc-500 max-w-sm mx-auto">
                                    Go to the <strong>Full Draft Board</strong> tab and click the star icon on any player to add them to your priority targets.
                                </p>
                            </div>
                        ) : (
                            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
                                {wishlistPlayers.map(player => {
                                    const pickInfo = draftPickMap.get(String(player.id));
                                    const isSold = player.status === 'SOLD' || !!pickInfo;
                                    const soldTeamName = pickInfo?.teamName || player.soldTo || 'Assigned';

                                    return (
                                        <div
                                            key={player.id}
                                            className={`rounded-2xl border-2 p-2 flex flex-col justify-between overflow-hidden shadow-lg ${
                                                isSold ? 'bg-red-950/30 border-red-500/50 opacity-70' : 'bg-zinc-900 border-amber-500/50'
                                            }`}
                                        >
                                            <div className="flex items-center justify-between gap-1 mb-1">
                                                <span className="text-[8px] font-black uppercase px-2 py-0.5 rounded bg-black/80 text-amber-300">
                                                    {player.role || player.category}
                                                </span>
                                                <button
                                                    onClick={() => toggleWishlist(player.id)}
                                                    className="p-1 text-yellow-400 hover:text-red-400 transition-colors"
                                                    title="Remove from target list"
                                                >
                                                    <Star className="w-3.5 h-3.5 fill-yellow-400" />
                                                </button>
                                            </div>

                                            <div className="aspect-square w-full rounded-xl overflow-hidden bg-zinc-950 my-1 relative">
                                                {player.photoUrl ? (
                                                    <img src={player.photoUrl} alt="" className={`w-full h-full object-cover ${isSold ? 'grayscale opacity-30' : ''}`} />
                                                ) : (
                                                    <div className="w-full h-full flex items-center justify-center font-black text-xl text-zinc-600">
                                                        {player.name.charAt(0)}
                                                    </div>
                                                )}
                                                {isSold && (
                                                    <div className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center p-1 text-center">
                                                        <span className="px-2 py-0.5 bg-red-600 text-white font-black text-[8px] rounded uppercase">SOLD</span>
                                                        <span className="text-[9px] font-black text-amber-300 truncate max-w-full px-1">{soldTeamName}</span>
                                                    </div>
                                                )}
                                            </div>

                                            <h4 className="text-xs font-black uppercase text-white truncate text-center mt-1">
                                                {player.name}
                                            </h4>

                                            <div className="mt-2 pt-1 border-t border-white/10">
                                                {isSold ? (
                                                    <span className="text-[8px] text-zinc-500 block text-center uppercase font-bold">Unavailable</span>
                                                ) : isMyTurn ? (
                                                    <button
                                                        onClick={() => onNominatePlayer(player)}
                                                        className="w-full py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-black font-black text-[10px] uppercase tracking-wider shadow active:scale-95 transition-all flex items-center justify-center gap-1"
                                                    >
                                                        <Check className="w-3 h-3 stroke-[3]" /> Draft Now
                                                    </button>
                                                ) : (
                                                    <span className="text-[9px] text-emerald-400 block text-center uppercase font-bold">★ Target Ready</span>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                )}

                {/* =========================================================================
                    TAB 6: RULES & ORDER
                    ========================================================================= */}
                {activeTab === 'RULES' && (
                    <div className="max-w-2xl mx-auto space-y-4">
                        <div className="p-4 rounded-3xl bg-zinc-900 border border-zinc-800 space-y-3">
                            <h3 className="text-sm font-black uppercase tracking-wider text-amber-400 flex items-center gap-2">
                                <BookOpen className="w-4 h-4" /> Category Draft Board Format
                            </h3>
                            <div className="space-y-2 text-xs text-zinc-300 leading-relaxed">
                                <p>
                                    • <strong>Turn Order Style:</strong> {draftState.orderType === 'SNAKE' ? '🐍 Snake Draft (1 → N, then N → 1 each round to ensure fair distribution)' : 'Linear Draft (1 → N each round)'}.
                                </p>
                                <p>
                                    • <strong>Turn Duration:</strong> {draftState.turnTimerSeconds || 45} seconds per pick. Teams must make their draft choice before the countdown reaches zero.
                                </p>
                                <p>
                                    • <strong>Current Status:</strong> Round {draftState.currentRound} ({draftState.roundStatus === 'IN_PROGRESS' ? 'Active' : 'Completed'}).
                                </p>
                            </div>
                        </div>

                        {/* Round Turn Order Table */}
                        <div className="p-4 rounded-3xl bg-zinc-900 border border-zinc-800 space-y-3">
                            <h4 className="text-xs font-black uppercase tracking-wider text-white">
                                Current Round Pick Sequence
                            </h4>
                            <div className="space-y-1.5">
                                {(draftState.roundOrder || teams.map(t => t.id)).map((tId, idx) => {
                                    const team = teams.find(t => String(t.id) === String(tId));
                                    const isCurrent = idx === draftState.currentTurnIndex;
                                    const isPast = idx < draftState.currentTurnIndex;
                                    const isMy = team && String(team.id) === String(myTeam.id);

                                    return (
                                        <div
                                            key={tId}
                                            className={`p-2.5 rounded-xl border flex items-center justify-between text-xs transition-all ${
                                                isCurrent
                                                    ? 'bg-amber-500/20 border-amber-500 text-amber-300 font-black ring-1 ring-amber-500/50'
                                                    : isPast
                                                    ? 'bg-black/40 border-zinc-800 text-zinc-500'
                                                    : 'bg-zinc-950 border-zinc-800 text-zinc-300'
                                            }`}
                                        >
                                            <div className="flex items-center gap-2.5">
                                                <span className="w-5 font-mono text-[10px] font-bold text-zinc-500">
                                                    #{idx + 1}
                                                </span>
                                                {team?.logoUrl ? (
                                                    <img src={team.logoUrl} alt="" className="w-5 h-5 rounded-full object-contain bg-white" />
                                                ) : null}
                                                <span className={`uppercase font-black ${isMy ? 'text-amber-400 underline' : ''}`}>
                                                    {team?.name || 'Team'} {isMy ? '(You)' : ''}
                                                </span>
                                            </div>

                                            <span className="text-[9px] font-bold uppercase">
                                                {isCurrent ? '⚡ Currently Picking' : isPast ? '✓ Pick Complete' : 'Upcoming'}
                                            </span>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* 5-SECOND LARGE SOLD CELEBRATION POPUP */}
            <SoldCelebrationPopup
                celebrationData={draftState.lastSoldCelebration}
                durationMs={5000}
            />
        </div>
    );
};

export default TeamDraftDashboard;
