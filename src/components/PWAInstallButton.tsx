import React, { useState } from 'react';
import { Download, WifiOff, X } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';
import { useNetworkStatus } from '../lib/network';

interface PWAInstallButtonProps {
  variant?: 'button' | 'menu-item';
  onComplete?: () => void;
}

export const PWAInstallButton: React.FC<PWAInstallButtonProps> = ({
  variant = 'button',
  onComplete,
}) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [guideMode, setGuideMode] = useState<'ios' | 'browser' | null>(null);

  if (isInstalled) {
    return null;
  }

  // On desktop inline toolbar, only show when native install prompt or iOS is available
  if (variant === 'button' && !isInstallable && !isIOS) {
    return null;
  }

  const buttonClass =
    variant === 'menu-item'
      ? 'w-full flex items-center gap-2.5 px-3.5 py-2.5 text-left text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors'
      : 'inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0 min-h-[40px]';

  const handleClick = async () => {
    if (isInstallable) {
      await install();
      onComplete?.();
      return;
    }
    if (isIOS) {
      setGuideMode('ios');
      return;
    }
    setGuideMode('browser');
  };

  const isInsecureHttp =
    typeof window !== 'undefined' &&
    window.location.protocol !== 'https:' &&
    window.location.hostname !== 'localhost' &&
    window.location.hostname !== '127.0.0.1';

  return (
    <>
      <button type="button" onClick={handleClick} className={buttonClass}>
        <Download className="w-3.5 h-3.5 text-teal-700 shrink-0" />
        {isIOS && variant === 'button' ? 'Install on iOS' : 'Install App'}
      </button>

      {guideMode && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
          <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 shadow-xl">
            <div className="flex items-start justify-between gap-4">
              <h3 className="font-display text-lg font-semibold text-slate-900">
                {guideMode === 'ios' ? 'Install on iPhone or iPad' : 'Install TravelLog App'}
              </h3>
              <button
                type="button"
                onClick={() => {
                  setGuideMode(null);
                  onComplete?.();
                }}
                className="rounded-lg p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100"
                aria-label="Close install guide"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {guideMode === 'ios' ? (
              <p className="mt-3 text-sm leading-relaxed text-slate-600">
                1. Tap the <strong>Share</strong> button in the Safari toolbar.
                <br />
                2. Scroll down and tap <strong>Add to Home Screen</strong>.
              </p>
            ) : (
              <div className="mt-3 space-y-2.5 text-sm leading-relaxed text-slate-600">
                <p>
                  1. Open your browser menu (<strong>⋮</strong> or <strong>⋯</strong>).
                  <br />
                  2. Tap <strong>Install app</strong> or <strong>Add to Home screen</strong>.
                </p>
                {isInsecureHttp && (
                  <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                    One-tap PWA installation requires serving the site over HTTPS.
                  </p>
                )}
              </div>
            )}

            <button
              type="button"
              onClick={() => {
                setGuideMode(null);
                onComplete?.();
              }}
              className="mt-5 w-full rounded-lg bg-slate-900 py-2.5 text-sm font-medium text-white hover:bg-slate-800 transition-colors"
            >
              Got it
            </button>
          </div>
        </div>
      )}
    </>
  );
};

export const OfflineIndicator: React.FC<{ pendingCount: number }> = ({ pendingCount }) => {
  const { isOnline } = useNetworkStatus();

  if (isOnline) return null;

  return (
    <div
      role="status"
      className="bg-amber-50 border-b border-amber-200 px-4 py-2 text-xs text-amber-900 flex items-center justify-center gap-2"
    >
      <WifiOff className="w-3.5 h-3.5 shrink-0 text-amber-700" />
      <span>
        Offline mode — changes and photos are saved locally on this device
        {pendingCount > 0 ? ` (${pendingCount} queued for Wi-Fi sync)` : ''}.
      </span>
    </div>
  );
};
