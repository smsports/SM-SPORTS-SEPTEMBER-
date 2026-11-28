import React from 'react';
import { useOnlineStatus } from '../hooks/useOnlineStatus';

export const OfflineIndicator: React.FC = () => {
  const isOnline = useOnlineStatus();

  if (isOnline) return null;

  return (
    <div className="fixed bottom-4 left-4 z-50 flex items-center gap-2 rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-semibold text-[#0b1220] shadow-lg">
      <span className="h-2 w-2 rounded-full bg-[#0b1220] animate-pulse" />
      Offline Mode — Cached data is being used.
    </div>
  );
};

export default OfflineIndicator;
