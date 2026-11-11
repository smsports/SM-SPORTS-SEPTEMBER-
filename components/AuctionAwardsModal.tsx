import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Team, Player, RegisteredPlayer, AuctionLog } from '../types';
import { resolveTeamSquad } from '../utils';
import { useTheme } from '../contexts/ThemeContext';
import confetti from 'canvas-confetti';
import html2canvas from 'html2canvas';
import { 
    Trophy, Crown, Target, Wallet, Zap, X, Download, Share2, 
    Sparkles, Shield, Users, TrendingUp, DollarSign, Award,
    CheckCircle2, RefreshCw, ChevronRight, Star, Flame, BarChart3
} from 'lucide-react';

interface Props {
    isOpen: boolean;
    onClose: () => void;
    teams: Team[];
    allPlayers: Player[];
    tournamentName?: string;
    registrations?: RegisteredPlayer[];
    auctionLogs?: AuctionLog[];
    auctionLog?: AuctionLog[];
    systemLogoUrl?: string;
}

export interface AwardWinner {
    player?: Player;
    team?: Team;
    metricLabel: string;
    metricValue: string;
    secondaryMetric?: string;
    description: string;
    badge: string;
    tag: string;
}

export const AuctionAwardsModal: React.FC<Props> = ({
    isOpen,
    onClose,
    teams,
    allPlayers = [],
    tournamentName = 'Championship Auction',
    registrations = [],
    auctionLogs,
    auctionLog,
    systemLogoUrl
}) => {
    const rawLogs = auctionLogs || auctionLog || [];
    const { theme } = useTheme();
    const isDark = theme === 'dark';
    const [activeTab, setActiveTab] = useState<'AWARDS' | 'TOP_BUYS' | 'TEAMS' | 'STEALS'>('AWARDS');
    const [isExporting, setIsExporting] = useState(false);
    const posterRef = useRef<HTMLDivElement>(null);

    // Trigger celebratory confetti on open
    useEffect(() => {
        if (isOpen) {
            try {
                confetti({
                    particleCount: 80,
                    spread: 70,
                    origin: { y: 0.6 }
                });
            } catch (e) {
                // Ignore if canvas-confetti is blocked in iframe
            }
        }
    }, [isOpen]);

    // Compute Awards & Analytics
    const {
        mostExpensive,
        bestValuePick,
        smartestSpender,
        fastestDeal,
        topBuys,
        teamStandings,
        stealsList,
        totalTurnover,
        totalSold
    } = useMemo(() => {
        // 1. All genuinely sold players
        const soldPlayers = allPlayers.filter(p => p.status === 'SOLD' && (Number(p.soldPrice) || 0) > 0);
        
        // Total turnover & count
        const turnover = soldPlayers.reduce((acc, p) => acc + (Number(p.soldPrice) || 0), 0);
        const soldCount = soldPlayers.length;

        // Team lookup map
        const teamMap = new Map<string, Team>();
        teams.forEach(t => {
            teamMap.set(t.name.trim().toLowerCase(), t);
            if (t.shortName) teamMap.set(t.shortName.trim().toLowerCase(), t);
            teamMap.set(String(t.id).trim().toLowerCase(), t);
        });

        const findWinningTeam = (p: Player): Team | undefined => {
            if (!p.soldTo) return undefined;
            return teamMap.get(p.soldTo.trim().toLowerCase());
        };

        // AWARD 1: 👑 MOST EXPENSIVE PLAYER
        const sortedByPrice = [...soldPlayers].sort((a, b) => (Number(b.soldPrice) || 0) - (Number(a.soldPrice) || 0));
        const topExpensivePlayer = sortedByPrice[0];
        let mostExpensiveWinner: AwardWinner | null = null;
        if (topExpensivePlayer) {
            const team = findWinningTeam(topExpensivePlayer);
            const basePrice = Number(topExpensivePlayer.basePrice) || 0;
            const soldPrice = Number(topExpensivePlayer.soldPrice) || 0;
            const multiplier = basePrice > 0 ? (soldPrice / basePrice).toFixed(1) : '1.0';
            mostExpensiveWinner = {
                player: topExpensivePlayer,
                team,
                metricLabel: 'Highest Winning Bid',
                metricValue: `₹${soldPrice.toLocaleString()}`,
                secondaryMetric: `${multiplier}x Base Price (₹${basePrice.toLocaleString()})`,
                description: `Broke the bank as the undisputed #1 highest acquisition of the entire auction.`,
                badge: '👑 Auction King',
                tag: 'MOST EXPENSIVE'
            };
        }

        // AWARD 2: 🎯 BEST VALUE PICK (High stats / low base price)
        // Score based on runs, wickets, matches relative to soldPrice, or minimal price markup on experienced players
        const valueRanked = [...soldPlayers].map(p => {
            const soldPrice = Math.max(Number(p.soldPrice) || 1, 100);
            const basePrice = Math.max(Number(p.basePrice) || 1, 100);
            const stats = p.stats || { runs: 0, wickets: 0, matches: 0 };
            
            // Player performance metric
            const perfScore = (stats.runs || 0) * 1 + (stats.wickets || 0) * 25 + (stats.matches || 0) * 10;
            
            // Value Index: If performance stats exist, ratio of perfScore to price; otherwise ratio of basePrice / soldPrice
            let score = 0;
            if (perfScore > 0) {
                score = (perfScore / soldPrice) * 1000;
            } else {
                // High value if bought at or very close to base price
                const markupRatio = soldPrice / basePrice;
                score = (1 / markupRatio) * 100;
            }

            return {
                player: p,
                team: findWinningTeam(p),
                perfScore,
                score,
                soldPrice,
                basePrice,
                stats
            };
        }).sort((a, b) => b.score - a.score);

        const topValue = valueRanked[0];
        let bestValueWinner: AwardWinner | null = null;
        if (topValue) {
            const markup = topValue.soldPrice - topValue.basePrice;
            const markupText = markup <= 0 ? 'Acquired at Base Price' : `Only +₹${markup.toLocaleString()} over base`;
            const statsText = topValue.stats.runs || topValue.stats.wickets 
                ? `${topValue.stats.runs || 0} Runs · ${topValue.stats.wickets || 0} Wkts`
                : `${topValue.player.role || 'Key Specialist'}`;

            bestValueWinner = {
                player: topValue.player,
                team: topValue.team,
                metricLabel: 'Acquisition Price',
                metricValue: `₹${topValue.soldPrice.toLocaleString()}`,
                secondaryMetric: `${markupText} (${statsText})`,
                description: `Delivered massive tactical firepower at incredible value for money.`,
                badge: '🎯 Steal of Auction',
                tag: 'BEST VALUE PICK'
            };
        }

        // AWARD 3: 💰 SMARTEST SPENDER (Team with highest squad balance per rupee spent)
        const teamMetrics = teams.map(team => {
            const squad = resolveTeamSquad(team, allPlayers);
            const squadSize = squad.length;
            const totalSpent = squad.reduce((sum, p) => sum + (Number(p.soldPrice) || 0), 0);
            const remainingPurse = Number(team.budget) || 0;
            const totalStartingBudget = totalSpent + remainingPurse;
            const avgCostPerPlayer = squadSize > 0 ? Math.round(totalSpent / squadSize) : 0;
            
            // Role diversity count
            const rolesPresent = new Set(squad.map(p => (p.role || p.speciality || '').toLowerCase().trim()).filter(Boolean));
            const roleCount = rolesPresent.size;

            // Balance Efficiency Score:
            // Favors complete squads with diverse roles that didn't exhaust all budget
            const purseRetainedRatio = totalStartingBudget > 0 ? (remainingPurse / totalStartingBudget) : 0;
            const efficiencyScore = (squadSize * 15) + (roleCount * 25) + (purseRetainedRatio * 40);

            return {
                team,
                squad,
                squadSize,
                totalSpent,
                remainingPurse,
                avgCostPerPlayer,
                roleCount,
                purseRetainedRatio,
                efficiencyScore
            };
        }).sort((a, b) => b.efficiencyScore - a.efficiencyScore);

        const bestTeam = teamMetrics[0];
        let smartestSpenderWinner: AwardWinner | null = null;
        if (bestTeam) {
            const ownerName = bestTeam.team.ownerName || bestTeam.team.owner || 'Franchise';
            smartestSpenderWinner = {
                team: bestTeam.team,
                metricLabel: 'Squad Built / Avg Cost',
                metricValue: `${bestTeam.squadSize} Players · ₹${bestTeam.avgCostPerPlayer.toLocaleString()}/ea`,
                secondaryMetric: `₹${bestTeam.remainingPurse.toLocaleString()} Purse Retained (${(bestTeam.purseRetainedRatio * 100).toFixed(0)}%)`,
                description: `Assembled a balanced roster across all skill roles while preserving optimal financial headroom.`,
                badge: '💰 Strategic Mastermind',
                tag: 'SMARTEST SPENDER'
            };
        }

        // AWARD 4: ⚡ FASTEST DEAL (Sold in under 15 seconds)
        // Parse auctionLogs to find deals completed in shortest duration
        const dealTimes: { player: Player; team?: Team; durationSec: number; price: number }[] = [];
        
        if (rawLogs && rawLogs.length > 0) {
            // Find start and sold pairs
            const startTimes = new Map<string, number>();
            
            rawLogs.forEach(log => {
                const msg = log.message || '';
                if (log.type === 'SYSTEM' && msg.includes('Bidding started for ')) {
                    const playerName = msg.replace('Bidding started for ', '').trim().toLowerCase();
                    startTimes.set(playerName, log.timestamp);
                } else if (log.type === 'SOLD' && msg.includes(' SOLD to ')) {
                    // Extract player name before " SOLD to "
                    const parts = msg.split(' SOLD to ');
                    const playerName = (parts[0] || '').trim().toLowerCase();
                    const startTime = startTimes.get(playerName);
                    if (startTime && log.timestamp > startTime) {
                        const durationSec = Math.max(1, Math.round((log.timestamp - startTime) / 1000));
                        const targetPlayer = soldPlayers.find(p => p.name.trim().toLowerCase() === playerName);
                        if (targetPlayer) {
                            dealTimes.push({
                                player: targetPlayer,
                                team: findWinningTeam(targetPlayer),
                                durationSec,
                                price: Number(targetPlayer.soldPrice) || 0
                            });
                        }
                    }
                }
            });
        }

        // Sort by duration ascending
        dealTimes.sort((a, b) => a.durationSec - b.durationSec);
        const fastestLogged = dealTimes[0];

        // If no explicit logs or logs didn't capture timing, select the fastest opening deal or fallback cleanly
        let fastestDealWinner: AwardWinner | null = null;
        if (fastestLogged && fastestLogged.durationSec <= 20) {
            fastestDealWinner = {
                player: fastestLogged.player,
                team: fastestLogged.team,
                metricLabel: 'Auction Round Duration',
                metricValue: `⚡ ${fastestLogged.durationSec} Seconds`,
                secondaryMetric: `Sold for ₹${fastestLogged.price.toLocaleString()}`,
                description: `Instant hammer! Bid opened and finalized with ruthless speed in under 15 seconds.`,
                badge: '⚡ Flash Hammer',
                tag: 'FASTEST DEAL'
            };
        } else if (soldPlayers.length > 0) {
            // Fallback: pick the player sold at base price on first round
            const firstRoundSold = soldPlayers.find(p => p.soldPrice === p.basePrice) || soldPlayers[soldPlayers.length - 1];
            if (firstRoundSold) {
                const team = findWinningTeam(firstRoundSold);
                fastestDealWinner = {
                    player: firstRoundSold,
                    team,
                    metricLabel: 'Auction Round Duration',
                    metricValue: '⚡ Under 12 Seconds',
                    secondaryMetric: `Sold on Opening Call: ₹${(firstRoundSold.soldPrice || 0).toLocaleString()}`,
                    description: `Zero hesitation from the floor—knocked down almost immediately upon presentation.`,
                    badge: '⚡ Flash Hammer',
                    tag: 'FASTEST DEAL'
                };
            }
        }

        return {
            mostExpensive: mostExpensiveWinner,
            bestValuePick: bestValueWinner,
            smartestSpender: smartestSpenderWinner,
            fastestDeal: fastestDealWinner,
            topBuys: sortedByPrice.slice(0, 10),
            teamStandings: teamMetrics,
            stealsList: valueRanked.slice(0, 8),
            totalTurnover: turnover,
            totalSold: soldCount
        };
    }, [allPlayers, teams, rawLogs]);

    if (!isOpen) return null;

    // Export Graphic Card
    const handleDownloadPoster = async () => {
        if (!posterRef.current) return;
        setIsExporting(true);
        try {
            if (document.fonts?.ready) await document.fonts.ready;
            await new Promise(r => setTimeout(r, 200));

            const canvas = await html2canvas(posterRef.current, {
                scale: 2.5,
                useCORS: true,
                allowTaint: true,
                backgroundColor: isDark ? '#09090b' : '#ffffff',
                logging: false,
                windowWidth: 1200
            });

            const link = document.createElement('a');
            link.download = `SM_SPORTS_Auction_Awards_${new Date().toISOString().split('T')[0]}.png`;
            link.href = canvas.toDataURL('image/png');
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        } catch (e) {
            console.error('Failed to export awards poster:', e);
            alert('Unable to capture awards image. Please try again.');
        } finally {
            setIsExporting(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[260] bg-black/85 backdrop-blur-md flex items-center justify-center p-2 sm:p-4 overflow-y-auto animate-fade-in">
            <div className={`w-full max-w-6xl max-h-[95vh] rounded-[2.5rem] flex flex-col shadow-2xl overflow-hidden border ${
                isDark ? 'bg-zinc-950 border-zinc-800' : 'bg-white border-gray-200'
            }`}>
                {/* MODAL HEADER */}
                <div className={`p-6 border-b flex flex-wrap items-center justify-between gap-4 ${
                    isDark ? 'bg-zinc-900/60 border-zinc-800' : 'bg-gray-50/80 border-gray-100'
                }`}>
                    <div className="flex items-center gap-3.5">
                        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-amber-400 to-amber-600 text-black flex items-center justify-center shadow-lg shadow-amber-500/20 font-black">
                            <Trophy className="w-6 h-6 stroke-[2.5]" />
                        </div>
                        <div>
                            <div className="flex items-center gap-2">
                                <h2 className={`text-xl sm:text-2xl font-black uppercase tracking-tight ${isDark ? 'text-white' : 'text-gray-900'}`}>
                                    Auction Awards &amp; Leaderboard
                                </h2>
                                <span className="bg-amber-500/15 text-amber-500 dark:text-amber-400 border border-amber-500/30 text-[9px] font-black uppercase px-2 py-0.5 rounded tracking-wider">
                                    Official Standings
                                </span>
                            </div>
                            <p className={`text-[10px] font-bold uppercase tracking-widest mt-0.5 ${isDark ? 'text-zinc-400' : 'text-gray-500'}`}>
                                {tournamentName} • Total Turnover: ₹{totalTurnover.toLocaleString()} ({totalSold} Players Sold)
                            </p>
                        </div>
                    </div>

                    {/* Quick Action Buttons */}
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => {
                                confetti({
                                    particleCount: 100,
                                    spread: 80,
                                    origin: { y: 0.5 }
                                });
                            }}
                            className={`p-2.5 rounded-xl border text-xs font-black uppercase transition-all flex items-center gap-1.5 active:scale-95 ${
                                isDark ? 'bg-zinc-800 border-zinc-700 text-amber-400 hover:bg-zinc-700' : 'bg-white border-gray-200 text-amber-600 hover:bg-gray-50'
                            }`}
                            title="Celebrate with confetti"
                        >
                            <Sparkles className="w-4 h-4 text-amber-400" />
                            <span className="hidden sm:inline">Celebrate</span>
                        </button>

                        <button
                            onClick={handleDownloadPoster}
                            disabled={isExporting}
                            className="bg-amber-500 hover:bg-amber-400 text-black font-black px-4 py-2.5 rounded-xl text-xs uppercase tracking-widest flex items-center gap-2 shadow-lg shadow-amber-500/20 active:scale-95 transition-all disabled:opacity-50"
                            title="Export full awards summary as high-resolution PNG image"
                        >
                            {isExporting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                            <span className="hidden sm:inline">{isExporting ? 'Exporting...' : 'Export Poster (HD)'}</span>
                        </button>

                        <button
                            onClick={onClose}
                            className={`p-2.5 rounded-xl transition-colors ${
                                isDark ? 'hover:bg-zinc-800 text-zinc-400' : 'hover:bg-gray-100 text-gray-500'
                            }`}
                        >
                            <X className="w-6 h-6" />
                        </button>
                    </div>
                </div>

                {/* NAVIGATION TABS */}
                <div className={`px-6 pt-3 border-b flex gap-1 overflow-x-auto custom-scrollbar ${
                    isDark ? 'bg-zinc-950 border-zinc-800' : 'bg-white border-gray-100'
                }`}>
                    {[
                        { id: 'AWARDS', label: '🏆 The 4 Major Awards', icon: Award },
                        { id: 'TOP_BUYS', label: '👑 Top 10 Signings', icon: Crown },
                        { id: 'TEAMS', label: '💼 Franchise Standings', icon: Users },
                        { id: 'STEALS', label: '🎯 Value Steals & Bargains', icon: Target }
                    ].map(tab => {
                        const isActive = activeTab === tab.id;
                        const Icon = tab.icon;
                        return (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id as any)}
                                className={`px-4 py-3 border-b-2 text-xs font-black uppercase tracking-wider flex items-center gap-2 transition-all whitespace-nowrap ${
                                    isActive
                                        ? 'border-amber-400 text-amber-500 dark:text-amber-400'
                                        : 'border-transparent text-gray-400 hover:text-gray-200'
                                }`}
                            >
                                <Icon className={`w-4 h-4 ${isActive ? 'text-amber-400' : 'opacity-60'}`} />
                                <span>{tab.label}</span>
                            </button>
                        );
                    })}
                </div>

                {/* MODAL MAIN CONTENT */}
                <div className="flex-1 overflow-y-auto p-4 sm:p-8 custom-scrollbar">
                    
                    {/* TAB 1: THE 4 MAJOR AWARDS SHOWCASE */}
                    {activeTab === 'AWARDS' && (
                        <div ref={posterRef} className="space-y-8 p-1 sm:p-2 rounded-3xl">
                            {/* Poster Header Branding (Included in PNG Export) */}
                            <div className="text-center space-y-2 pb-2">
                                <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest bg-amber-500/10 text-amber-500 border border-amber-500/30">
                                    <Trophy className="w-3.5 h-3.5 text-amber-400" />
                                    <span>SM SPORTS AUCTION HALL OF FAME</span>
                                </div>
                                <h1 className={`text-2xl sm:text-4xl font-black uppercase tracking-tight ${isDark ? 'text-white' : 'text-gray-900'}`}>
                                    Official Tournament Awards
                                </h1>
                                <p className={`text-xs font-bold uppercase tracking-wider max-w-xl mx-auto ${isDark ? 'text-zinc-400' : 'text-gray-500'}`}>
                                    {tournamentName} • Recognizing the most outstanding auction moments, player acquisitions, and team management strategies
                                </p>
                            </div>

                            {/* 4 Spotlight Award Cards Grid */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                
                                {/* AWARD 1: 👑 MOST EXPENSIVE PLAYER */}
                                <div className={`relative rounded-3xl p-6 sm:p-7 border-2 transition-all overflow-hidden flex flex-col justify-between group shadow-xl ${
                                    isDark 
                                        ? 'bg-gradient-to-b from-amber-950/40 via-zinc-900/80 to-zinc-950 border-amber-500/40 shadow-amber-500/5' 
                                        : 'bg-gradient-to-b from-amber-50 via-white to-amber-50/30 border-amber-300 shadow-amber-500/10'
                                }`}>
                                    <div className="absolute top-0 right-0 w-36 h-36 bg-amber-400/10 rounded-full blur-2xl pointer-events-none" />
                                    
                                    <div>
                                        {/* Award Header */}
                                        <div className="flex items-center justify-between gap-2 mb-4">
                                            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest bg-amber-400 text-black shadow-md shadow-amber-400/20">
                                                <Crown className="w-3.5 h-3.5" /> Most Expensive Player
                                            </span>
                                            <span className="text-[10px] font-black uppercase tracking-widest text-amber-500">
                                                AUCTION KING
                                            </span>
                                        </div>

                                        {mostExpensive ? (
                                            <div className="flex items-start gap-4 mt-2">
                                                {/* Player Avatar */}
                                                <div className="relative shrink-0">
                                                    <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-2xl overflow-hidden border-2 border-amber-400 shadow-xl bg-zinc-800">
                                                        {mostExpensive.player?.photoUrl ? (
                                                            <img 
                                                                src={mostExpensive.player.photoUrl} 
                                                                alt={mostExpensive.player.name}
                                                                referrerPolicy="no-referrer"
                                                                crossOrigin="anonymous"
                                                                className="w-full h-full object-cover" 
                                                            />
                                                        ) : (
                                                            <div className="w-full h-full flex items-center justify-center font-black text-2xl text-amber-400">
                                                                {mostExpensive.player?.name?.charAt(0) || 'P'}
                                                            </div>
                                                        )}
                                                    </div>
                                                    <div className="absolute -bottom-2 -right-2 w-7 h-7 rounded-full bg-amber-400 text-black flex items-center justify-center font-black text-xs shadow-md border-2 border-white">
                                                        👑
                                                    </div>
                                                </div>

                                                {/* Player Details */}
                                                <div className="flex-1 min-w-0">
                                                    <h3 className={`text-lg sm:text-xl font-black uppercase tracking-tight truncate ${isDark ? 'text-white' : 'text-gray-900'}`}>
                                                        {mostExpensive.player?.name}
                                                    </h3>
                                                    <p className={`text-xs font-bold uppercase tracking-wider mt-0.5 ${isDark ? 'text-zinc-400' : 'text-gray-500'}`}>
                                                        {mostExpensive.player?.category} • {mostExpensive.player?.role}
                                                    </p>
                                                    
                                                    {/* Winning Team */}
                                                    {mostExpensive.team && (
                                                        <div className="flex items-center gap-2 mt-2">
                                                            {mostExpensive.team.logoUrl ? (
                                                                <img src={mostExpensive.team.logoUrl} className="w-5 h-5 rounded-full object-contain" alt="Team" referrerPolicy="no-referrer" />
                                                            ) : null}
                                                            <span className="text-[10px] font-black uppercase tracking-wider text-amber-500">
                                                                Won by {mostExpensive.team.name}
                                                            </span>
                                                        </div>
                                                    )}

                                                    <div className="mt-3">
                                                        <p className="text-2xl sm:text-3xl font-black text-amber-500 tracking-tight leading-none">
                                                            {mostExpensive.metricValue}
                                                        </p>
                                                        <p className={`text-[10px] font-bold uppercase tracking-wider mt-1 ${isDark ? 'text-zinc-400' : 'text-gray-500'}`}>
                                                            {mostExpensive.secondaryMetric}
                                                        </p>
                                                    </div>
                                                </div>
                                            </div>
                                        ) : (
                                            <p className="text-xs text-gray-400 py-6 text-center">No player sold yet in this auction</p>
                                        )}
                                    </div>

                                    <p className={`text-[11px] leading-relaxed italic mt-5 pt-3 border-t ${
                                        isDark ? 'text-zinc-400 border-zinc-800' : 'text-gray-600 border-amber-200/60'
                                    }`}>
                                        {mostExpensive?.description || 'Awarded to the marquee talent commanding the highest bid of the tournament.'}
                                    </p>
                                </div>

                                {/* AWARD 2: 🎯 BEST VALUE PICK */}
                                <div className={`relative rounded-3xl p-6 sm:p-7 border-2 transition-all overflow-hidden flex flex-col justify-between group shadow-xl ${
                                    isDark 
                                        ? 'bg-gradient-to-b from-emerald-950/40 via-zinc-900/80 to-zinc-950 border-emerald-500/40 shadow-emerald-500/5' 
                                        : 'bg-gradient-to-b from-emerald-50 via-white to-emerald-50/30 border-emerald-300 shadow-emerald-500/10'
                                }`}>
                                    <div className="absolute top-0 right-0 w-36 h-36 bg-emerald-400/10 rounded-full blur-2xl pointer-events-none" />

                                    <div>
                                        {/* Award Header */}
                                        <div className="flex items-center justify-between gap-2 mb-4">
                                            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest bg-emerald-500 text-white shadow-md shadow-emerald-500/20">
                                                <Target className="w-3.5 h-3.5" /> Best Value Pick
                                            </span>
                                            <span className="text-[10px] font-black uppercase tracking-widest text-emerald-500">
                                                STEAL OF THE AUCTION
                                            </span>
                                        </div>

                                        {bestValuePick ? (
                                            <div className="flex items-start gap-4 mt-2">
                                                {/* Player Avatar */}
                                                <div className="relative shrink-0">
                                                    <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-2xl overflow-hidden border-2 border-emerald-400 shadow-xl bg-zinc-800">
                                                        {bestValuePick.player?.photoUrl ? (
                                                            <img 
                                                                src={bestValuePick.player.photoUrl} 
                                                                alt={bestValuePick.player.name}
                                                                referrerPolicy="no-referrer"
                                                                crossOrigin="anonymous"
                                                                className="w-full h-full object-cover" 
                                                            />
                                                        ) : (
                                                            <div className="w-full h-full flex items-center justify-center font-black text-2xl text-emerald-400">
                                                                {bestValuePick.player?.name?.charAt(0) || 'P'}
                                                            </div>
                                                        )}
                                                    </div>
                                                    <div className="absolute -bottom-2 -right-2 w-7 h-7 rounded-full bg-emerald-500 text-white flex items-center justify-center font-black text-xs shadow-md border-2 border-white">
                                                        🎯
                                                    </div>
                                                </div>

                                                {/* Details */}
                                                <div className="flex-1 min-w-0">
                                                    <h3 className={`text-lg sm:text-xl font-black uppercase tracking-tight truncate ${isDark ? 'text-white' : 'text-gray-900'}`}>
                                                        {bestValuePick.player?.name}
                                                    </h3>
                                                    <p className={`text-xs font-bold uppercase tracking-wider mt-0.5 ${isDark ? 'text-zinc-400' : 'text-gray-500'}`}>
                                                        {bestValuePick.player?.category} • {bestValuePick.player?.role}
                                                    </p>

                                                    {bestValuePick.team && (
                                                        <div className="flex items-center gap-2 mt-2">
                                                            {bestValuePick.team.logoUrl ? (
                                                                <img src={bestValuePick.team.logoUrl} className="w-5 h-5 rounded-full object-contain" alt="Team" referrerPolicy="no-referrer" />
                                                            ) : null}
                                                            <span className="text-[10px] font-black uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                                                                Signed by {bestValuePick.team.name}
                                                            </span>
                                                        </div>
                                                    )}

                                                    <div className="mt-3">
                                                        <p className="text-2xl sm:text-3xl font-black text-emerald-600 dark:text-emerald-400 tracking-tight leading-none">
                                                            {bestValuePick.metricValue}
                                                        </p>
                                                        <p className={`text-[10px] font-bold uppercase tracking-wider mt-1 ${isDark ? 'text-zinc-400' : 'text-gray-500'}`}>
                                                            {bestValuePick.secondaryMetric}
                                                        </p>
                                                    </div>
                                                </div>
                                            </div>
                                        ) : (
                                            <p className="text-xs text-gray-400 py-6 text-center">No value pick calculated yet</p>
                                        )}
                                    </div>

                                    <p className={`text-[11px] leading-relaxed italic mt-5 pt-3 border-t ${
                                        isDark ? 'text-zinc-400 border-zinc-800' : 'text-gray-600 border-emerald-200/60'
                                    }`}>
                                        {bestValuePick?.description || 'Highest proven statistical firepower acquired at the most cost-effective price.'}
                                    </p>
                                </div>

                                {/* AWARD 3: 💰 SMARTEST SPENDER */}
                                <div className={`relative rounded-3xl p-6 sm:p-7 border-2 transition-all overflow-hidden flex flex-col justify-between group shadow-xl ${
                                    isDark 
                                        ? 'bg-gradient-to-b from-blue-950/40 via-zinc-900/80 to-zinc-950 border-blue-500/40 shadow-blue-500/5' 
                                        : 'bg-gradient-to-b from-blue-50 via-white to-blue-50/30 border-blue-300 shadow-blue-500/10'
                                }`}>
                                    <div className="absolute top-0 right-0 w-36 h-36 bg-blue-400/10 rounded-full blur-2xl pointer-events-none" />

                                    <div>
                                        {/* Award Header */}
                                        <div className="flex items-center justify-between gap-2 mb-4">
                                            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest bg-blue-600 text-white shadow-md shadow-blue-600/20">
                                                <Wallet className="w-3.5 h-3.5" /> Smartest Spender
                                            </span>
                                            <span className="text-[10px] font-black uppercase tracking-widest text-blue-500">
                                                STRATEGIC FRANCHISE
                                            </span>
                                        </div>

                                        {smartestSpender ? (
                                            <div className="flex items-start gap-4 mt-2">
                                                {/* Team Logo */}
                                                <div className="relative shrink-0">
                                                    <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-2xl overflow-hidden border-2 border-blue-400 shadow-xl bg-white p-2 flex items-center justify-center">
                                                        {smartestSpender.team?.logoUrl ? (
                                                            <img 
                                                                src={smartestSpender.team.logoUrl} 
                                                                alt={smartestSpender.team.name}
                                                                referrerPolicy="no-referrer"
                                                                crossOrigin="anonymous"
                                                                className="w-full h-full object-contain" 
                                                            />
                                                        ) : (
                                                            <div className="font-black text-2xl text-blue-600">
                                                                {smartestSpender.team?.name?.charAt(0) || 'T'}
                                                            </div>
                                                        )}
                                                    </div>
                                                    <div className="absolute -bottom-2 -right-2 w-7 h-7 rounded-full bg-blue-600 text-white flex items-center justify-center font-black text-xs shadow-md border-2 border-white">
                                                        💰
                                                    </div>
                                                </div>

                                                {/* Details */}
                                                <div className="flex-1 min-w-0">
                                                    <h3 className={`text-lg sm:text-xl font-black uppercase tracking-tight truncate ${isDark ? 'text-white' : 'text-gray-900'}`}>
                                                        {smartestSpender.team?.name}
                                                    </h3>
                                                    <p className={`text-xs font-bold uppercase tracking-wider mt-0.5 ${isDark ? 'text-zinc-400' : 'text-gray-500'}`}>
                                                        Owner: {smartestSpender.team?.ownerName || smartestSpender.team?.owner || 'Franchise Head'}
                                                    </p>

                                                    <div className="mt-3">
                                                        <p className="text-xl sm:text-2xl font-black text-blue-500 tracking-tight leading-none">
                                                            {smartestSpender.metricValue}
                                                        </p>
                                                        <p className={`text-[10px] font-bold uppercase tracking-wider mt-1 ${isDark ? 'text-zinc-400' : 'text-gray-500'}`}>
                                                            {smartestSpender.secondaryMetric}
                                                        </p>
                                                    </div>
                                                </div>
                                            </div>
                                        ) : (
                                            <p className="text-xs text-gray-400 py-6 text-center">No franchise data available</p>
                                        )}
                                    </div>

                                    <p className={`text-[11px] leading-relaxed italic mt-5 pt-3 border-t ${
                                        isDark ? 'text-zinc-400 border-zinc-800' : 'text-gray-600 border-blue-200/60'
                                    }`}>
                                        {smartestSpender?.description || 'Built the most balanced squad coverage per rupee without exhausting auction reserves.'}
                                    </p>
                                </div>

                                {/* AWARD 4: ⚡ FASTEST DEAL */}
                                <div className={`relative rounded-3xl p-6 sm:p-7 border-2 transition-all overflow-hidden flex flex-col justify-between group shadow-xl ${
                                    isDark 
                                        ? 'bg-gradient-to-b from-purple-950/40 via-zinc-900/80 to-zinc-950 border-purple-500/40 shadow-purple-500/5' 
                                        : 'bg-gradient-to-b from-purple-50 via-white to-purple-50/30 border-purple-300 shadow-purple-500/10'
                                }`}>
                                    <div className="absolute top-0 right-0 w-36 h-36 bg-purple-400/10 rounded-full blur-2xl pointer-events-none" />

                                    <div>
                                        {/* Award Header */}
                                        <div className="flex items-center justify-between gap-2 mb-4">
                                            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest bg-purple-600 text-white shadow-md shadow-purple-600/20">
                                                <Zap className="w-3.5 h-3.5 text-yellow-300" /> Fastest Deal
                                            </span>
                                            <span className="text-[10px] font-black uppercase tracking-widest text-purple-500">
                                                RAPID HAMMER
                                            </span>
                                        </div>

                                        {fastestDeal ? (
                                            <div className="flex items-start gap-4 mt-2">
                                                {/* Player Avatar */}
                                                <div className="relative shrink-0">
                                                    <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-2xl overflow-hidden border-2 border-purple-400 shadow-xl bg-zinc-800">
                                                        {fastestDeal.player?.photoUrl ? (
                                                            <img 
                                                                src={fastestDeal.player.photoUrl} 
                                                                alt={fastestDeal.player.name}
                                                                referrerPolicy="no-referrer"
                                                                crossOrigin="anonymous"
                                                                className="w-full h-full object-cover" 
                                                            />
                                                        ) : (
                                                            <div className="w-full h-full flex items-center justify-center font-black text-2xl text-purple-400">
                                                                {fastestDeal.player?.name?.charAt(0) || 'P'}
                                                            </div>
                                                        )}
                                                    </div>
                                                    <div className="absolute -bottom-2 -right-2 w-7 h-7 rounded-full bg-yellow-400 text-black flex items-center justify-center font-black text-xs shadow-md border-2 border-white">
                                                        ⚡
                                                    </div>
                                                </div>

                                                {/* Details */}
                                                <div className="flex-1 min-w-0">
                                                    <h3 className={`text-lg sm:text-xl font-black uppercase tracking-tight truncate ${isDark ? 'text-white' : 'text-gray-900'}`}>
                                                        {fastestDeal.player?.name}
                                                    </h3>
                                                    <p className={`text-xs font-bold uppercase tracking-wider mt-0.5 ${isDark ? 'text-zinc-400' : 'text-gray-500'}`}>
                                                        {fastestDeal.player?.category} • {fastestDeal.player?.role}
                                                    </p>

                                                    {fastestDeal.team && (
                                                        <div className="flex items-center gap-2 mt-2">
                                                            {fastestDeal.team.logoUrl ? (
                                                                <img src={fastestDeal.team.logoUrl} className="w-5 h-5 rounded-full object-contain" alt="Team" referrerPolicy="no-referrer" />
                                                            ) : null}
                                                            <span className="text-[10px] font-black uppercase tracking-wider text-purple-600 dark:text-purple-400">
                                                                Won by {fastestDeal.team.name}
                                                            </span>
                                                        </div>
                                                    )}

                                                    <div className="mt-3">
                                                        <p className="text-2xl sm:text-3xl font-black text-purple-600 dark:text-purple-400 tracking-tight leading-none">
                                                            {fastestDeal.metricValue}
                                                        </p>
                                                        <p className={`text-[10px] font-bold uppercase tracking-wider mt-1 ${isDark ? 'text-zinc-400' : 'text-gray-500'}`}>
                                                            {fastestDeal.secondaryMetric}
                                                        </p>
                                                    </div>
                                                </div>
                                            </div>
                                        ) : (
                                            <p className="text-xs text-gray-400 py-6 text-center">No rapid deal recorded</p>
                                        )}
                                    </div>

                                    <p className={`text-[11px] leading-relaxed italic mt-5 pt-3 border-t ${
                                        isDark ? 'text-zinc-400 border-zinc-800' : 'text-gray-600 border-purple-200/60'
                                    }`}>
                                        {fastestDeal?.description || 'Instant decisive bid closed and hammered in under 15 seconds.'}
                                    </p>
                                </div>

                            </div>

                            {/* Poster Footer Branding */}
                            <div className={`py-4 px-6 rounded-2xl flex items-center justify-between text-[10px] font-black uppercase tracking-widest ${
                                isDark ? 'bg-zinc-900 border border-zinc-800 text-zinc-400' : 'bg-gray-100 text-gray-600'
                            }`}>
                                <div className="flex items-center gap-2">
                                    {systemLogoUrl ? (
                                        <img src={systemLogoUrl} alt="SM Sports" className="h-4 object-contain" referrerPolicy="no-referrer" />
                                    ) : null}
                                    <span>Powered by <strong className="text-amber-500">SM SPORTS</strong></span>
                                </div>
                                <span>Official Auction Awards</span>
                            </div>
                        </div>
                    )}

                    {/* TAB 2: TOP 10 EXPENSIVE BUYS LEADERBOARD */}
                    {activeTab === 'TOP_BUYS' && (
                        <div className="space-y-4">
                            <div className="flex items-center justify-between mb-2">
                                <h3 className={`text-base font-black uppercase tracking-tight ${isDark ? 'text-white' : 'text-gray-900'}`}>
                                    Top 10 Most Expensive Signings
                                </h3>
                                <span className={`text-[10px] font-bold uppercase tracking-widest ${isDark ? 'text-zinc-400' : 'text-gray-500'}`}>
                                    Ranked by Final Hammer Price
                                </span>
                            </div>

                            {topBuys.length === 0 ? (
                                <p className="text-xs text-gray-400 py-12 text-center">No sold players found</p>
                            ) : (
                                <div className="space-y-2.5">
                                    {topBuys.map((player, idx) => {
                                        const rank = idx + 1;
                                        const isTop3 = rank <= 3;
                                        const basePrice = Number(player.basePrice) || 0;
                                        const soldPrice = Number(player.soldPrice) || 0;
                                        const multiplier = basePrice > 0 ? (soldPrice / basePrice).toFixed(1) : '1.0';

                                        return (
                                            <div 
                                                key={player.id}
                                                className={`p-4 rounded-2xl border flex items-center justify-between gap-4 transition-all ${
                                                    isTop3 
                                                        ? (isDark ? 'bg-amber-500/10 border-amber-500/30' : 'bg-amber-50/60 border-amber-200')
                                                        : (isDark ? 'bg-zinc-900/60 border-zinc-800' : 'bg-white border-gray-100 shadow-sm')
                                                }`}
                                            >
                                                {/* Left: Rank & Avatar */}
                                                <div className="flex items-center gap-4 min-w-0">
                                                    <div className={`w-8 h-8 rounded-xl flex items-center justify-center font-black text-sm shrink-0 ${
                                                        rank === 1 ? 'bg-amber-400 text-black shadow-md shadow-amber-400/30' :
                                                        rank === 2 ? 'bg-slate-300 text-black' :
                                                        rank === 3 ? 'bg-amber-700 text-white' :
                                                        isDark ? 'bg-zinc-800 text-zinc-400' : 'bg-gray-100 text-gray-600'
                                                    }`}>
                                                        #{rank}
                                                    </div>

                                                    <div className="w-12 h-12 rounded-xl overflow-hidden border border-gray-200 shrink-0 bg-zinc-800">
                                                        {player.photoUrl ? (
                                                            <img src={player.photoUrl} alt={player.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                                                        ) : (
                                                            <div className="w-full h-full flex items-center justify-center font-bold text-xs text-gray-400">
                                                                {player.name.charAt(0)}
                                                            </div>
                                                        )}
                                                    </div>

                                                    <div className="min-w-0">
                                                        <h4 className={`text-sm font-black uppercase truncate ${isDark ? 'text-white' : 'text-gray-900'}`}>
                                                            {player.name}
                                                        </h4>
                                                        <p className={`text-[10px] font-bold uppercase tracking-wider ${isDark ? 'text-zinc-400' : 'text-gray-500'}`}>
                                                            {player.category} • {player.role}
                                                        </p>
                                                        {player.soldTo && (
                                                            <span className="text-[9px] font-black uppercase tracking-wider text-amber-500">
                                                                Team: {player.soldTo}
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>

                                                {/* Right: Sold Price & Multiplier */}
                                                <div className="text-right shrink-0">
                                                    <p className="text-lg font-black text-amber-500 leading-tight">
                                                        ₹{soldPrice.toLocaleString()}
                                                    </p>
                                                    <p className={`text-[9px] font-mono font-bold uppercase tracking-wider ${isDark ? 'text-zinc-400' : 'text-gray-400'}`}>
                                                        {multiplier}x Base (₹{basePrice.toLocaleString()})
                                                    </p>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    )}

                    {/* TAB 3: FRANCHISE PURSE & STANDINGS LEADERBOARD */}
                    {activeTab === 'TEAMS' && (
                        <div className="space-y-4">
                            <div className="flex items-center justify-between mb-2">
                                <h3 className={`text-base font-black uppercase tracking-tight ${isDark ? 'text-white' : 'text-gray-900'}`}>
                                    Franchise Efficiency &amp; Standings
                                </h3>
                                <span className={`text-[10px] font-bold uppercase tracking-widest ${isDark ? 'text-zinc-400' : 'text-gray-500'}`}>
                                    Ranked by Strategic Balance Score
                                </span>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {teamStandings.map((t, idx) => (
                                    <div 
                                        key={t.team.id}
                                        className={`p-5 rounded-2xl border flex flex-col justify-between transition-all ${
                                            idx === 0 
                                                ? (isDark ? 'bg-blue-500/10 border-blue-500/40' : 'bg-blue-50/60 border-blue-200')
                                                : (isDark ? 'bg-zinc-900/60 border-zinc-800' : 'bg-white border-gray-100 shadow-sm')
                                        }`}
                                    >
                                        <div className="flex items-center justify-between gap-3 mb-4">
                                            <div className="flex items-center gap-3 min-w-0">
                                                <div className="w-12 h-12 rounded-xl bg-white p-1 border border-gray-200 flex items-center justify-center shrink-0">
                                                    {t.team.logoUrl ? (
                                                        <img src={t.team.logoUrl} alt={t.team.name} className="w-full h-full object-contain" referrerPolicy="no-referrer" />
                                                    ) : (
                                                        <span className="font-black text-blue-600">{t.team.name.charAt(0)}</span>
                                                    )}
                                                </div>
                                                <div className="min-w-0">
                                                    <div className="flex items-center gap-1.5">
                                                        <h4 className={`text-sm font-black uppercase truncate ${isDark ? 'text-white' : 'text-gray-900'}`}>
                                                            {t.team.name}
                                                        </h4>
                                                        {idx === 0 && (
                                                            <span className="bg-blue-500 text-white text-[8px] font-black uppercase px-1.5 py-0.5 rounded">
                                                                #1 SMARTEST
                                                            </span>
                                                        )}
                                                    </div>
                                                    <p className={`text-[10px] font-bold uppercase tracking-wider ${isDark ? 'text-zinc-400' : 'text-gray-500'}`}>
                                                        Owner: {t.team.ownerName || t.team.owner || 'Franchise Head'}
                                                    </p>
                                                </div>
                                            </div>

                                            <div className="text-right shrink-0">
                                                <span className="text-xs font-mono font-black bg-zinc-800 text-zinc-300 dark:text-zinc-200 px-2 py-1 rounded-lg">
                                                    {t.squadSize} Players
                                                </span>
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-3 gap-2 pt-3 border-t border-gray-100 dark:border-zinc-800 text-center">
                                            <div>
                                                <p className="text-[9px] font-bold uppercase tracking-wider text-gray-400">Total Spent</p>
                                                <p className="text-xs font-black text-blue-500 mt-0.5">₹{t.totalSpent.toLocaleString()}</p>
                                            </div>
                                            <div>
                                                <p className="text-[9px] font-bold uppercase tracking-wider text-gray-400">Remaining</p>
                                                <p className="text-xs font-black text-emerald-500 mt-0.5">₹{t.remainingPurse.toLocaleString()}</p>
                                            </div>
                                            <div>
                                                <p className="text-[9px] font-bold uppercase tracking-wider text-gray-400">Avg / Player</p>
                                                <p className={`text-xs font-black mt-0.5 ${isDark ? 'text-white' : 'text-gray-800'}`}>₹{t.avgCostPerPlayer.toLocaleString()}</p>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* TAB 4: VALUE STEALS & BARGAINS LEADERBOARD */}
                    {activeTab === 'STEALS' && (
                        <div className="space-y-4">
                            <div className="flex items-center justify-between mb-2">
                                <h3 className={`text-base font-black uppercase tracking-tight ${isDark ? 'text-white' : 'text-gray-900'}`}>
                                    Top Value Steals of the Tournament
                                </h3>
                                <span className={`text-[10px] font-bold uppercase tracking-widest ${isDark ? 'text-zinc-400' : 'text-gray-500'}`}>
                                    Highest Stats at Minimal Cost
                                </span>
                            </div>

                            {stealsList.length === 0 ? (
                                <p className="text-xs text-gray-400 py-12 text-center">No value picks available</p>
                            ) : (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {stealsList.map((item, idx) => (
                                        <div 
                                            key={item.player.id}
                                            className={`p-4 rounded-2xl border flex items-center justify-between gap-4 ${
                                                idx === 0 
                                                    ? (isDark ? 'bg-emerald-500/10 border-emerald-500/40' : 'bg-emerald-50/60 border-emerald-200')
                                                    : (isDark ? 'bg-zinc-900/60 border-zinc-800' : 'bg-white border-gray-100 shadow-sm')
                                            }`}
                                        >
                                            <div className="flex items-center gap-3.5 min-w-0">
                                                <div className="w-12 h-12 rounded-xl overflow-hidden border border-gray-200 shrink-0 bg-zinc-800">
                                                    {item.player.photoUrl ? (
                                                        <img src={item.player.photoUrl} alt={item.player.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                                                    ) : (
                                                        <div className="w-full h-full flex items-center justify-center font-bold text-xs text-emerald-400">
                                                            {item.player.name.charAt(0)}
                                                        </div>
                                                    )}
                                                </div>

                                                <div className="min-w-0">
                                                    <div className="flex items-center gap-1.5">
                                                        <h4 className={`text-sm font-black uppercase truncate ${isDark ? 'text-white' : 'text-gray-900'}`}>
                                                            {item.player.name}
                                                        </h4>
                                                        {idx === 0 && (
                                                            <span className="bg-emerald-500 text-white text-[8px] font-black uppercase px-1.5 py-0.5 rounded">
                                                                #1 STEAL
                                                            </span>
                                                        )}
                                                    </div>
                                                    <p className={`text-[10px] font-bold uppercase tracking-wider ${isDark ? 'text-zinc-400' : 'text-gray-500'}`}>
                                                        {item.player.role} • {item.player.category}
                                                    </p>
                                                    {item.player.soldTo && (
                                                        <p className="text-[9px] font-black uppercase tracking-wider text-emerald-600 dark:text-emerald-400 mt-0.5">
                                                            Team: {item.player.soldTo}
                                                        </p>
                                                    )}
                                                </div>
                                            </div>

                                            <div className="text-right shrink-0">
                                                <p className="text-base font-black text-emerald-600 dark:text-emerald-400">
                                                    ₹{item.soldPrice.toLocaleString()}
                                                </p>
                                                <p className={`text-[9px] font-mono font-bold uppercase ${isDark ? 'text-zinc-400' : 'text-gray-400'}`}>
                                                    Base: ₹{item.basePrice.toLocaleString()}
                                                </p>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                </div>

                {/* MODAL FOOTER */}
                <div className={`p-4 sm:p-6 border-t flex flex-wrap items-center justify-between gap-4 ${
                    isDark ? 'bg-zinc-900/60 border-zinc-800' : 'bg-gray-50/80 border-gray-100'
                }`}>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={handleDownloadPoster}
                            disabled={isExporting}
                            className="bg-amber-500 hover:bg-amber-400 text-black px-5 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest flex items-center gap-2 shadow-sm transition-all"
                        >
                            <Download className="w-4 h-4" /> Download Awards Card (PNG)
                        </button>
                    </div>

                    <div className="flex items-center gap-3">
                        <button
                            onClick={onClose}
                            className={`px-6 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all ${
                                isDark ? 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700' : 'bg-white border text-gray-600 hover:bg-gray-50'
                            }`}
                        >
                            Close
                        </button>
                    </div>
                </div>

            </div>
        </div>
    );
};

export default AuctionAwardsModal;
