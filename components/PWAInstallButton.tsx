import React, { useState } from 'react';
import { Download, Share } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';

export const PWAInstallButton: React.FC = () => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  if (isInstalled) {
    return null;
  }

  if (isInstallable) {
    return (
      <button
        type="button"
        onClick={install}
        className="inline-flex items-center gap-1.5 rounded-xl border border-amber-400/40 bg-[#0b1220] px-3.5 py-2 text-[11px] font-black uppercase tracking-wider text-amber-300 shadow-lg hover:bg-amber-500/15 transition-all whitespace-nowrap shrink-0"
      >
        <Download className="w-3.5 h-3.5" />
        <span>Install App</span>
      </button>
    );
  }

  if (isIOS) {
    return (
      <>
        <button
          type="button"
          onClick={() => setShowIOSGuide(true)}
          className="inline-flex items-center gap-1.5 rounded-xl border border-amber-400/40 bg-[#0b1220] px-3.5 py-2 text-[11px] font-black uppercase tracking-wider text-amber-300 shadow-lg hover:bg-amber-500/15 transition-all whitespace-nowrap shrink-0"
        >
          <Share className="w-3.5 h-3.5" />
          <span>Install App</span>
        </button>

        {showIOSGuide && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
            <div className="w-full max-w-sm rounded-2xl bg-[#0b1220] border border-white/15 p-6 shadow-2xl text-left">
              <h3 className="text-lg font-extrabold text-white">Install SM SPORTS</h3>
              <p className="mt-2.5 text-sm text-zinc-300 leading-relaxed">
                1. Tap the <strong className="text-white">Share</strong> button in Safari&apos;s toolbar.<br />
                2. Scroll down and tap <strong className="text-white">Add to Home Screen</strong>.
              </p>
              <button
                type="button"
                onClick={() => setShowIOSGuide(false)}
                className="mt-5 w-full rounded-xl bg-amber-400 hover:bg-amber-300 py-2.5 text-xs font-black uppercase tracking-wider text-[#0b1220] transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
};

export default PWAInstallButton;
