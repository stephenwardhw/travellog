import { useEffect, useState } from 'react';

interface NetworkInformationLike extends EventTarget {
  type?: 'bluetooth' | 'cellular' | 'ethernet' | 'none' | 'wifi' | 'wimax' | 'other' | 'unknown';
  effectiveType?: 'slow-2g' | '2g' | '3g' | '4g';
  saveData?: boolean;
}

export interface NetworkState {
  isOnline: boolean;
  connectionType: string;
  isCellular: boolean;
  isWifiReady: boolean;
  saveData: boolean;
}

function getConnection(): NetworkInformationLike | undefined {
  if (typeof navigator === 'undefined') return undefined;
  const nav = navigator as Navigator & {
    connection?: NetworkInformationLike;
    mozConnection?: NetworkInformationLike;
    webkitConnection?: NetworkInformationLike;
  };
  return nav.connection || nav.mozConnection || nav.webkitConnection;
}

export function readNetworkState(): NetworkState {
  const isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;
  const conn = getConnection();
  const rawType = conn?.type;
  const saveData = Boolean(conn?.saveData);

  // If browser explicitly reports cellular, block Wi-Fi-only sync.
  // Desktop browsers often omit `type`, reporting `effectiveType` instead; treat non-cellular + non-saveData as Wi-Fi/unmetered.
  const isCellular = rawType === 'cellular' || saveData;
  const isWifiReady = isOnline && !isCellular;

  let connectionType = 'Unknown';
  if (!isOnline) {
    connectionType = 'Offline';
  } else if (rawType === 'wifi') {
    connectionType = 'Wi-Fi';
  } else if (rawType === 'ethernet') {
    connectionType = 'Ethernet';
  } else if (rawType === 'cellular') {
    connectionType = 'Cellular';
  } else if (saveData) {
    connectionType = 'Metered (Data Saver)';
  } else {
    connectionType = 'Wi-Fi / Broadband';
  }

  return {
    isOnline,
    connectionType,
    isCellular,
    isWifiReady,
    saveData,
  };
}

export function useNetworkStatus(): NetworkState {
  const [state, setState] = useState<NetworkState>(() => readNetworkState());

  useEffect(() => {
    const update = () => setState(readNetworkState());
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    const conn = getConnection();
    conn?.addEventListener?.('change', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
      conn?.removeEventListener?.('change', update);
    };
  }, []);

  return state;
}
