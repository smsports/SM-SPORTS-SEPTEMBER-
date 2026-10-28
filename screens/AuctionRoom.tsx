
import React from 'react';
import { useAuction } from '../hooks/useAuction';
import { useTheme } from '../contexts/ThemeContext';
import { UserRole } from '../types';
import PlayerFocus from '../components/PlayerFocus';
import MyTeamPanel from '../components/MyTeamPanel';
import AuctionLog from '../components/AuctionLog';
import PlayerPool from '../components/PlayerPool';
import BiddingPanel from '../components/BiddingPanel';
import { Loader2 } from 'lucide-react';

const AuctionRoom: React.FC = () => {
  const { state, userProfile } = useAuction();
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  
  // Find player by ID from full list to persist display after sale, instead of relying on unsold pool index
  const currentPlayer = state.currentPlayerId ? state.players.find(p => String(p.id) === String(state.currentPlayerId)) : null;
  
  const isTeamOwner = userProfile?.role === UserRole.TEAM_OWNER;

  return (
    <div className="h-full min-h-0 transition-all duration-500 flex flex-col">
      {currentPlayer ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-12 gap-3 lg:gap-4 h-full min-h-0 flex-1">
          {/* Left Column: Team Info or Log */}
          <div className="md:col-span-1 xl:col-span-3 xl:order-1 h-full min-h-0 flex flex-col space-y-3">
            {isTeamOwner && <div className="flex-1 min-h-[300px]"><MyTeamPanel /></div>}
            <div className="flex-1 min-h-0 h-full"><AuctionLog /></div>
          </div>

          {/* Center Column: Main Action (Live Player) */}
          <div className="md:col-span-2 xl:col-span-5 xl:order-2 h-full min-h-0 flex flex-col gap-3">
            <div className="flex-1 min-h-0 h-full"><PlayerFocus player={currentPlayer} /></div>
            {isTeamOwner && <div className="mt-auto shrink-0"><BiddingPanel /></div>}
          </div>

          {/* Right Column: Player Pool */}
          <div className="md:col-span-1 xl:col-span-4 xl:order-3 h-full min-h-0">
            <PlayerPool />
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-12 gap-3 lg:gap-4 h-full min-h-0 flex-1">
          {/* Left Column: Team Info or Log */}
          <div className="md:col-span-1 xl:col-span-3 xl:order-1 h-full min-h-0 flex flex-col space-y-3">
            {isTeamOwner && <div className="flex-1 min-h-[300px]"><MyTeamPanel /></div>}
            <div className="flex-1 min-h-0 h-full"><AuctionLog /></div>
          </div>

          {/* Center Column: Waiting state */}
          <div className="md:col-span-2 xl:col-span-5 xl:order-2 h-full min-h-0 flex flex-col gap-3 justify-center">
            <div className={`flex items-center justify-center h-full rounded-[2.5rem] border-4 border-dashed transition-all duration-500 ${isDark ? 'bg-secondary/30 border-accent/20' : 'bg-gray-50 border-blue-500/20'}`}>
                <div className="text-center p-6 sm:p-8">
                    <div className={`w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-2xl ${isDark ? 'bg-zinc-900' : 'bg-white'}`}>
                        <Loader2 className={`w-8 h-8 animate-spin ${isDark ? 'text-accent' : 'text-blue-600'}`} />
                    </div>
                    <h2 className={`text-2xl md:text-3xl font-black uppercase tracking-tighter italic mb-2 ${isDark ? 'advaya-text' : 'text-gray-900'}`}>Waiting for Auctioneer</h2>
                    <p className={`text-[10px] font-black uppercase tracking-[0.3em] animate-pulse ${isDark ? 'text-zinc-500' : 'text-gray-400'}`}>The next lot will appear shortly...</p>
                </div>
            </div>
          </div>

          {/* Right Column: Player Pool */}
          <div className="md:col-span-1 xl:col-span-4 xl:order-3 h-full min-h-0">
            <PlayerPool />
          </div>
        </div>
      )}
    </div>
  );
};

export default AuctionRoom;
