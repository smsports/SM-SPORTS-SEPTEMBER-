
import React, { useState, useMemo } from 'react';
import { useAuction } from '../hooks/useAuction';
import { useTheme } from '../contexts/ThemeContext';
import { Gavel, Wallet, Shirt, Users, Info, Calculator, ShieldCheck, Sparkles, Scale } from 'lucide-react';
import { calculateMaxBid, resolveTeamSquad } from '../utils';
import TeamStrategyCalculator, { normalizeRole } from './TeamStrategyCalculator';

const MyTeamPanel: React.FC = () => {
  const { state, placeBid, userProfile, nextBid } = useAuction();
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const { teams, highestBidder, currentPlayerId, players } = state;
  const [activeTab, setActiveTab] = useState<'MY_SQUAD' | 'ALL_TEAMS' | 'CALCULATOR'>('MY_SQUAD');
  const [showCalcModal, setShowCalcModal] = useState(false);

  // Find the specific team belonging to this logged-in user
  const userTeam = teams.find(t => String(t.id) === String(userProfile?.teamId));
  
  const currentPlayer = currentPlayerId ? players.find(p => String(p.id) === String(currentPlayerId)) : null;
  const { maxBidAllowed } = useMemo(() => {
    if (!userTeam) return { maxBidAllowed: 0 };
    const result = calculateMaxBid(userTeam, state, currentPlayer);
    return { maxBidAllowed: result.maxBid };
  }, [userTeam, state, currentPlayer]);

  const teamPlayers = React.useMemo(() => {
    if (!userTeam) return [];
    const merged = [...(userTeam.players || [])];
    const soldToMe = (players || []).filter(p => p.status === 'SOLD' && (String(p.soldTo).toLowerCase() === userTeam.name.toLowerCase() || String((p as any).soldToId) === String(userTeam.id)));
    soldToMe.forEach(sp => {
      if (!merged.some(mp => String(mp.id) === String(sp.id))) {
        merged.push({
          id: sp.id,
          name: sp.name,
          role: sp.role || '',
          category: sp.category || '',
          soldPrice: sp.soldPrice || 0,
          soldTo: sp.soldTo || userTeam.name,
          status: 'SOLD',
          isTraded: (sp as any).isTraded || false
        } as any);
      }
    });
    return merged;
  }, [userTeam, players]);

  // Target squad and role quotas
  const targetSquadSize = state.maxPlayersPerTeam || (state as any).playersPerTeam || 11;
  const currentSquadCount = teamPlayers.length;
  const neededPlayers = Math.max(0, targetSquadSize - currentSquadCount);
  const globalBasePrice = Math.max(1, Number(state.basePrice || 100));

  // Role shortfalls calculation
  const roleShortfalls = useMemo(() => {
    if (!userTeam) return [];
    const counts: { [key: string]: number } = { 'Batsman': 0, 'Bowler': 0, 'All-Rounder': 0, 'Wicketkeeper': 0 };
    teamPlayers.forEach(p => {
      const r = normalizeRole(p.role || p.speciality || p.category);
      if (counts[r] !== undefined) counts[r]++;
    });

    // Check configured categories if any have minPerTeam
    const configuredWithMin = (state.categories || []).filter(c => (c.minPerTeam || 0) > 0);
    if (configuredWithMin.length > 0) {
      return configuredWithMin
        .map(c => {
          const inSquad = teamPlayers.filter(p => 
            p.category?.toLowerCase().trim() === c.name.toLowerCase().trim() || 
            p.role?.toLowerCase().trim() === c.name.toLowerCase().trim()
          ).length;
          const deficit = Math.max(0, (c.minPerTeam || 0) - inSquad);
          return { name: c.name, needed: deficit, basePrice: Number(c.basePrice || globalBasePrice) };
        })
        .filter(c => c.needed > 0);
    }

    // Default cricket squad balance targets
    const defaultQuotas = [
      { name: 'Batsman', target: 4, current: counts['Batsman'] || 0, basePrice: globalBasePrice },
      { name: 'Bowler', target: 3, current: counts['Bowler'] || 0, basePrice: globalBasePrice },
      { name: 'All-Rounder', target: 2, current: counts['All-Rounder'] || 0, basePrice: globalBasePrice },
      { name: 'Wicketkeeper', target: 1, current: counts['Wicketkeeper'] || 0, basePrice: globalBasePrice }
    ];

    return defaultQuotas
      .map(q => ({ name: q.name, needed: Math.max(0, q.target - q.current), basePrice: q.basePrice }))
      .filter(q => q.needed > 0);
  }, [userTeam, teamPlayers, state.categories, globalBasePrice]);

  const shortfallSummary = roleShortfalls.length > 0
    ? roleShortfalls.map(r => `${r.needed} ${r.name}`).join(', ')
    : 'All quotas met';

  // Calculate reserve for subsequent slots
  const subsequentReserve = useMemo(() => {
    if (neededPlayers <= 1) return 0;
    const slotsAfterThis = neededPlayers - 1;
    let shortfallPrices: number[] = [];
    roleShortfalls.forEach(r => {
      for (let i = 0; i < r.needed; i++) shortfallPrices.push(r.basePrice);
    });
    shortfallPrices.sort((a, b) => a - b);
    const mandatoryReserve = shortfallPrices.slice(0, Math.min(slotsAfterThis, Math.max(0, shortfallPrices.length - 1))).reduce((a, b) => a + b, 0);
    const flexSlots = Math.max(0, slotsAfterThis - shortfallPrices.length);
    return mandatoryReserve + (flexSlots * globalBasePrice);
  }, [neededPlayers, roleShortfalls, globalBasePrice]);

  const maxSafeBidCalc = Math.max(0, (userTeam?.budget || 0) - subsequentReserve);

  if (!userTeam) return (
      <div className={`rounded-[2rem] p-8 text-center border-2 border-dashed ${isDark ? 'bg-secondary/50 border-zinc-800 text-zinc-500' : 'bg-gray-50 border-gray-200 text-gray-400'}`}>
          <p className="text-xs font-black uppercase tracking-widest">Team data not found.</p>
      </div>
  );

  const canAfford = userTeam.budget >= nextBid && (state.unlimitedPurse || maxBidAllowed >= nextBid);
  const isLeading = highestBidder && String(highestBidder.id) === String(userTeam.id);

  const handleBid = async () => {
    if (canAfford) {
        try {
             await placeBid(userTeam.id, nextBid);
        } catch (e) {
             console.error(e);
        }
    }
  };

  const sortedTeams = [...teams].sort((a,b) => b.budget - a.budget);

  return (
    <div className={`rounded-[2.5rem] shadow-2xl p-6 flex flex-col h-full border-4 transition-all duration-500 ${isDark ? 'bg-secondary border-accent/20 shadow-accent/5' : 'bg-white border-blue-500/20 shadow-blue-600/10'}`}>
      <div className={`flex items-center mb-6 border-b pb-4 ${isDark ? 'border-accent/20' : 'border-blue-500/20'}`}>
        {userTeam.logoUrl ? (
            <div className={`w-14 h-14 rounded-2xl border-2 p-1.5 shadow-xl flex items-center justify-center overflow-hidden mr-4 ${isDark ? 'bg-black border-accent/50' : 'bg-white border-blue-500/50'}`}>
                <img src={userTeam.logoUrl} alt={userTeam.name} className="max-w-full max-h-full object-contain" />
            </div>
        ) : (
            <div className={`w-14 h-14 rounded-2xl mr-4 flex items-center justify-center font-black text-xl shadow-xl ${isDark ? 'bg-accent text-zinc-950' : 'bg-blue-600 text-white'}`}>
                {userTeam.name.charAt(0)}
            </div>
        )}
        <div className="flex-1">
            <h3 className={`text-xl font-black uppercase tracking-tighter italic ${isDark ? 'text-white' : 'text-gray-900'}`}>{userTeam.name}</h3>
            <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1">
                <p className="flex items-center">
                    <Wallet className={`w-3.5 h-3.5 mr-2 ${isDark ? 'text-accent' : 'text-blue-500'}`} /> 
                    <span className={`text-lg font-black tracking-tight ${isDark ? 'text-white' : 'text-gray-900'}`}>₹{userTeam.budget}</span>
                    <span className={`text-[9px] font-black uppercase tracking-widest ml-2 ${isDark ? 'text-zinc-500' : 'text-gray-400'}`}>Left</span>
                </p>
                {currentPlayer && !state.unlimitedPurse && (
                    <p className="flex items-center">
                        <Info className={`w-3.5 h-3.5 mr-2 ${isDark ? 'text-accent/60' : 'text-blue-400'}`} />
                        <span className={`text-lg font-black tracking-tight ${isDark ? 'text-accent' : 'text-blue-600'}`}>₹{Math.max(0, Math.floor(maxBidAllowed))}</span>
                        <span className={`text-[9px] font-black uppercase tracking-widest ml-2 ${isDark ? 'text-zinc-500' : 'text-gray-400'}`}>Bid Limit</span>
                    </p>
                )}
            </div>
        </div>
      </div>

      {/* LIVE STRATEGY & BUDGET DIRECTIVE BANNER */}
      <div className={`mb-4 p-3.5 rounded-2xl border transition-all ${
        isDark ? 'bg-gradient-to-r from-blue-950/40 via-indigo-950/30 to-zinc-900 border-blue-500/30 shadow-md' : 'bg-gradient-to-r from-blue-50 via-indigo-50 to-white border-blue-200 shadow-sm'
      }`}>
        <div className="flex items-center justify-between mb-1.5">
          <div className="flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-blue-500" />
            <span className="text-[9px] font-black uppercase tracking-wider text-blue-500">
              Strategy &amp; Quota Directive
            </span>
          </div>
          <button
            onClick={() => setShowCalcModal(true)}
            className="flex items-center gap-1 text-[8px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md bg-blue-600 hover:bg-blue-500 text-white shadow-sm transition-all active:scale-95"
            title="Open Interactive Strategy & Budget Calculator"
          >
            <Calculator className="w-3 h-3" /> Live Calculator
          </button>
        </div>
        <p className={`text-[11px] font-black leading-snug tracking-tight ${isDark ? 'text-zinc-200' : 'text-gray-800'}`}>
          &ldquo;You have <span className="text-emerald-500 font-black">₹{userTeam.budget.toLocaleString()}</span> left and need{' '}
          <span className="text-blue-500 font-black">{neededPlayers} player{neededPlayers !== 1 ? 's' : ''}</span>{' '}
          {roleShortfalls.length > 0 && <span className="text-amber-500 font-black">({shortfallSummary})</span>}.{' '}
          Max bid for next player:{' '}
          <span className="text-indigo-600 dark:text-cyan-400 underline font-black">₹{maxSafeBidCalc.toLocaleString()}</span>{' '}
          to maintain minimum squad base prices.&rdquo;
        </p>
      </div>
      
      <div className="mb-4">
        <button
          onClick={handleBid}
          disabled={!canAfford || isLeading}
          className={`w-full flex items-center justify-center font-black py-4 px-6 rounded-2xl transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed active:scale-95 shadow-xl uppercase tracking-widest text-xs ${
            isLeading 
            ? (isDark ? 'bg-green-500 text-black shadow-green-500/20' : 'bg-green-600 text-white shadow-green-600/20')
            : (isDark ? 'bg-accent text-zinc-950 hover:bg-white shadow-accent/20' : 'bg-blue-600 text-white hover:bg-blue-700 shadow-blue-600/20')
          }`}
        >
          <Gavel className="mr-2 h-5 w-5"/> {isLeading ? 'Leading' : `Bid ₹${nextBid}`}
        </button>
        {!canAfford && <p className="text-red-500 text-[9px] mt-2 text-center font-black uppercase tracking-widest">Insufficient budget.</p>}
        {isLeading && <p className="text-green-500 text-[9px] mt-2 text-center font-black uppercase tracking-widest animate-pulse">You are the highest bidder!</p>}
      </div>

      <div className={`flex p-1 rounded-2xl mb-4 transition-colors ${isDark ? 'bg-zinc-900/50' : 'bg-gray-100'}`}>
          <button 
            onClick={() => setActiveTab('MY_SQUAD')} 
            className={`flex-1 text-[9px] font-black py-2 rounded-xl uppercase tracking-widest transition-all ${activeTab === 'MY_SQUAD' ? (isDark ? 'bg-accent text-zinc-950 shadow-lg shadow-accent/20' : 'bg-white text-blue-600 shadow-sm') : (isDark ? 'text-zinc-500 hover:text-zinc-300' : 'text-gray-400 hover:text-gray-600')}`}
          >
            My Squad ({teamPlayers.length})
          </button>
          <button 
            onClick={() => setActiveTab('ALL_TEAMS')} 
            className={`flex-1 text-[9px] font-black py-2 rounded-xl uppercase tracking-widest transition-all ${activeTab === 'ALL_TEAMS' ? (isDark ? 'bg-accent text-zinc-950 shadow-lg shadow-accent/20' : 'bg-white text-blue-600 shadow-sm') : (isDark ? 'text-zinc-500 hover:text-zinc-300' : 'text-gray-400 hover:text-gray-600')}`}
          >
            All Purses
          </button>
          <button 
            onClick={() => setActiveTab('CALCULATOR')} 
            className={`flex-1 text-[9px] font-black py-2 rounded-xl uppercase tracking-widest transition-all flex items-center justify-center gap-1 ${activeTab === 'CALCULATOR' ? (isDark ? 'bg-accent text-zinc-950 shadow-lg shadow-accent/20' : 'bg-white text-blue-600 shadow-sm') : (isDark ? 'text-zinc-500 hover:text-zinc-300' : 'text-gray-400 hover:text-gray-600')}`}
          >
            <Calculator className="w-3 h-3" /> Strategy
          </button>
      </div>

      <div className="flex-grow flex flex-col min-h-0">
         {activeTab === 'MY_SQUAD' ? (
             <>
                <h4 className={`text-[10px] font-black uppercase tracking-[0.2em] mb-4 flex items-center border-b pb-2 ${isDark ? 'text-accent border-accent/10' : 'text-blue-600 border-blue-500/10'}`}>
                    <Shirt className="w-4 h-4 mr-2"/>
                    Players ({teamPlayers.length})
                </h4>
                <div className="space-y-2 pr-1 flex-grow overflow-y-auto custom-scrollbar">
                    {teamPlayers.length > 0 ? teamPlayers.map(player => (
                        <div key={player.id} className={`p-3 rounded-2xl border-l-4 flex justify-between items-center transition-all ${isDark ? 'bg-zinc-900/40 border-accent/50 hover:bg-zinc-800/60' : 'bg-gray-50 border-blue-500/50 hover:bg-white hover:shadow-md'}`}>
                            <div>
                                <div className="flex items-center gap-1.5">
                                    <p className={`text-xs font-black uppercase tracking-tight ${isDark ? 'text-white' : 'text-gray-900'}`}>{player.name}</p>
                                    {player.isTraded && (
                                        <span className="text-[7px] bg-amber-500/20 text-amber-500 px-1 rounded uppercase font-black tracking-widest border border-amber-500/20">Traded</span>
                                    )}
                                </div>
                                <p className={`text-[8px] font-black uppercase tracking-widest ${isDark ? 'text-zinc-500' : 'text-gray-400'}`}>{player.category}</p>
                            </div>
                            {(player as any).soldPrice && (
                                <span className={`font-black text-xs ${isDark ? 'text-accent' : 'text-blue-600'}`}>
                                    ₹{(player as any).soldPrice}
                                </span>
                            )}
                        </div>
                    )) : (
                        <div className={`text-[10px] font-black uppercase tracking-widest text-center py-8 opacity-30 ${isDark ? 'text-zinc-500' : 'text-gray-400'}`}>
                            No players bought yet.
                        </div>
                    )}
                </div>
             </>
         ) : activeTab === 'ALL_TEAMS' ? (
             <>
                <h4 className={`text-[10px] font-black uppercase tracking-[0.2em] mb-4 flex items-center border-b pb-2 ${isDark ? 'text-accent border-accent/10' : 'text-blue-600 border-blue-500/10'}`}>
                    <Users className="w-4 h-4 mr-2"/>
                    Leaderboard
                </h4>
                <div className="space-y-2 pr-1 flex-grow overflow-y-auto custom-scrollbar">
                    {sortedTeams.map(t => (
                        <div key={t.id} className={`p-3 rounded-2xl border transition-all flex justify-between items-center ${t.id === userTeam.id ? (isDark ? 'bg-accent/10 border-accent/30' : 'bg-blue-50 border-blue-500/30') : (isDark ? 'bg-zinc-900/40 border-zinc-800' : 'bg-gray-50 border-gray-100')}`}>
                            <div className="flex items-center gap-3">
                                <span className={`text-xs font-black uppercase tracking-tight ${t.id === userTeam.id ? (isDark ? 'text-accent' : 'text-blue-600') : (isDark ? 'text-zinc-300' : 'text-gray-700')}`}>{t.name}</span>
                                <span className={`text-[8px] font-black uppercase tracking-widest ${isDark ? 'text-zinc-600' : 'text-gray-400'}`}>({(t.players || []).length})</span>
                            </div>
                            <span className={`font-black text-xs ${isDark ? 'text-white' : 'text-gray-900'}`}>₹{t.budget}</span>
                        </div>
                    ))}
                </div>
             </>
         ) : (
             <div className="flex-grow overflow-y-auto custom-scrollbar pr-1">
                 <TeamStrategyCalculator team={userTeam} isEmbedded={true} onPlaceBid={() => handleBid()} />
             </div>
         )}
      </div>

      {/* Strategy & Budget Calculator Modal */}
      <TeamStrategyCalculator
        team={userTeam}
        isOpen={showCalcModal}
        onClose={() => setShowCalcModal(false)}
        onPlaceBid={() => handleBid()}
      />
    </div>
  );
};

export default MyTeamPanel;
