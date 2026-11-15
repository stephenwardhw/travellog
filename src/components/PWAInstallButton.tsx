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
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  if (isInstalled) {
    return null;
  }

  const buttonClass =
    variant === 'menu-item'
      ? 'w-full flex items-center gap-2.5 px-3.5 py-2.5 text-left text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors'
      : 'inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0 min-h-[40px]';

  if (isInstallable) {
    return (
      <button
        type="button"
        onClick={async () => {
          await install();
          onComplete?.();
        }}
        className={buttonClass}
      >
        <Download className="w-3.5 h-3.5 text-teal-700 shrink-0" />
        Install App
      </button>
    );
  }

  if (isIOS) {
    return (
      <>
        <button
          type="button"
          onClick={() => setShowIOSGuide(true)}
          className={buttonClass}
        >
          <Download className="w-3.5 h-3.5 text-teal-700 shrink-0" />
          Install on iOS
        </button>

        {showIOSGuide && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
            <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 shadow-xl">
              <div className="flex items-start justify-between gap-4">
                <h3 className="font-display text-lg font-semibold text-slate-900">
                  Install on iPhone or iPad
                </h3>
                <button
                  type="button"
                  onClick={() => {
                    setShowIOSGuide(false);
                    onComplete?.();
                  }}
                  className="rounded-lg p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100"
                  aria-label="Close install guide"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <p className="mt-3 text-sm leading-relaxed text-slate-600">
                1. Tap the <strong>Share</strong> button in the Safari toolbar.
                <br />
                2. Scroll down and tap <strong>Add to Home Screen</strong>.
              </p>
              <button
                type="button"
                onClick={() => {
                  setShowIOSGuide(false);
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
  }

  return null;
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
