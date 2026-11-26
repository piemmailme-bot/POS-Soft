import React, { useEffect, useState } from 'react';
import { Store } from 'lucide-react';

interface SplashScreenProps {
  societyName?: string;
  address?: string;
  durationMs?: number;
  onComplete: () => void;
}

export const SOCIETY_LOGO_SRC = '/assets/society-logo.png';

export const SplashScreen: React.FC<SplashScreenProps> = ({
  societyName = 'Deganga CADPFSCS Ltd',
  address = 'Village : Berachampa · Dist. North 24 Parganas',
  durationMs = 8000,
  onComplete,
}) => {
  const [isExiting, setIsExiting] = useState(false);
  const [imgFailed, setImgFailed] = useState(false);

  useEffect(() => {
    const fadeOutAt = Math.max(0, durationMs - 220);
    const fadeTimer = window.setTimeout(() => {
      setIsExiting(true);
    }, fadeOutAt);

    const completeTimer = window.setTimeout(() => {
      onComplete();
    }, durationMs);

    const handleKeySkip = (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === 'Escape' || e.key === ' ') {
        onComplete();
      }
    };
    window.addEventListener('keydown', handleKeySkip);

    return () => {
      window.clearTimeout(fadeTimer);
      window.clearTimeout(completeTimer);
      window.removeEventListener('keydown', handleKeySkip);
    };
  }, [durationMs, onComplete]);

  return (
    <div
      onClick={onComplete}
      className={`fixed inset-0 z-[100] bg-[#14171c] text-white flex flex-col items-center justify-center p-6 select-none cursor-pointer transition-opacity duration-200 ease-out ${
        isExiting ? 'opacity-0 pointer-events-none' : 'opacity-100'
      }`}
      role="status"
      aria-live="polite"
      aria-label={`Loading ${societyName}`}
      title="Click anywhere or press Enter to skip"
    >
      {/* Subtle centered ambient glow tuned to emblem green & gold */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 overflow-hidden flex items-center justify-center"
      >
        <div className="w-[420px] h-[420px] rounded-full bg-gradient-to-tr from-emerald-900/20 via-amber-500/10 to-transparent blur-3xl" />
      </div>

      <div className="relative flex flex-col items-center text-center max-w-md w-full animate-splash-enter">
        {/* Circular Emblem Container */}
        <div className="relative w-44 h-44 sm:w-52 sm:h-52 rounded-full flex items-center justify-center shadow-2xl shadow-black/60">
          {/* Rotating subtle golden-emerald outer halo ring */}
          <div
            aria-hidden="true"
            className="absolute -inset-2 rounded-full border border-amber-400/25 border-t-amber-400/80 border-r-emerald-400/60 animate-[spin_3s_linear_infinite]"
          />

          <div className="w-full h-full rounded-full overflow-hidden bg-[#171a1f] border-2 border-amber-400/40 flex items-center justify-center">
            {!imgFailed ? (
              <img
                src={SOCIETY_LOGO_SRC}
                alt={`${societyName} Official Emblem`}
                referrerPolicy="no-referrer"
                onError={() => setImgFailed(true)}
                className="w-full h-full object-cover object-center scale-[1.07]"
              />
            ) : (
              <div className="w-full h-full bg-gradient-to-br from-emerald-700 to-emerald-950 flex flex-col items-center justify-center text-amber-300">
                <Store className="w-16 h-16 mb-1" />
                <span className="text-xs font-bold tracking-wider">DEGANGA</span>
              </div>
            )}
          </div>
        </div>

        {/* Society Title & Location */}
        <h1 className="mt-7 text-2xl sm:text-3xl font-extrabold tracking-tight text-white">
          {societyName}
        </h1>
        <p className="mt-1.5 text-xs sm:text-sm font-medium text-amber-300/90 tracking-wide">
          {address}
        </p>

        {/* Loading Bar */}
        <div className="mt-8 w-64 sm:w-72">
          <div className="h-1.5 w-full rounded-full bg-slate-800/90 overflow-hidden border border-slate-700/60">
            <div className="h-full w-full origin-left bg-gradient-to-r from-emerald-500 via-amber-400 to-emerald-400 animate-splash-progress" />
          </div>
          <p className="mt-2.5 text-[11px] font-medium text-slate-400 tracking-wide">
            Opening Smart POS &amp; Inventory Register... (Click to skip)
          </p>
        </div>
      </div>
    </div>
  );
};
