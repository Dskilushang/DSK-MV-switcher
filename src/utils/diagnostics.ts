export type DiagnosticSnapshot = {
  camera: string;
  mediaLoaded: boolean;
  mediaPlaying: boolean;
  mixerOpen: boolean;
  connectedAudioInputs: number;
  live: boolean;
  recording: boolean;
};

export type DiagnosticEvent = {
  id: number;
  timestamp: string;
  category: 'lifecycle' | 'network' | 'error' | 'state' | 'system';
  message: string;
  details?: Record<string, unknown>;
};

const MAX_EVENTS = 180;
const STORAGE_KEY = 'dsk-mv-diagnostic-log-v1';

function readStoredEvents(): DiagnosticEvent[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is DiagnosticEvent =>
      !!item &&
      typeof item.id === 'number' &&
      typeof item.timestamp === 'string' &&
      typeof item.category === 'string' &&
      typeof item.message === 'string'
    ).slice(-MAX_EVENTS);
  } catch {
    return [];
  }
}

let events: DiagnosticEvent[] = typeof window !== 'undefined' ? readStoredEvents() : [];
let nextId = events.reduce((highest, event) => Math.max(highest, event.id), 0) + 1;
const subscribers = new Set<(items: DiagnosticEvent[]) => void>();

function notify(): void {
  const snapshot = [...events];
  subscribers.forEach((subscriber) => {
    try {
      subscriber(snapshot);
    } catch {
      // A diagnostics UI subscriber must never interrupt the production app.
    }
  });
}

export function recordDiagnostic(
  category: DiagnosticEvent['category'],
  message: string,
  details?: Record<string, unknown>
): void {
  const event: DiagnosticEvent = {
    id: nextId++,
    timestamp: new Date().toISOString(),
    category,
    message,
    ...(details ? { details } : {})
  };
  events = [...events, event].slice(-MAX_EVENTS);
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(events));
  } catch {
    // Keep the in-memory buffer usable when storage is unavailable or full.
  }
  notify();
}

export function getDiagnosticEvents(): DiagnosticEvent[] {
  return [...events];
}

export function subscribeDiagnostics(
  subscriber: (items: DiagnosticEvent[]) => void
): () => void {
  subscribers.add(subscriber);
  subscriber(getDiagnosticEvents());
  return () => subscribers.delete(subscriber);
}

function getNetworkDetails(): Record<string, unknown> {
  const connection = (navigator as Navigator & {
    connection?: { type?: string; effectiveType?: string; downlink?: number; rtt?: number; saveData?: boolean };
    mozConnection?: { type?: string; effectiveType?: string };
    webkitConnection?: { type?: string; effectiveType?: string };
  }).connection;
  const fallback = (navigator as Navigator & {
    mozConnection?: { type?: string; effectiveType?: string };
    webkitConnection?: { type?: string; effectiveType?: string };
  });
  return {
    online: navigator.onLine,
    connectionType: connection?.type ?? fallback.mozConnection?.type ?? fallback.webkitConnection?.type ?? 'non exposé',
    effectiveType: connection?.effectiveType ?? fallback.mozConnection?.effectiveType ?? fallback.webkitConnection?.effectiveType ?? 'non exposé',
    downlinkMbps: connection?.downlink ?? null,
    rttMs: connection?.rtt ?? null,
    saveData: connection?.saveData ?? null
  };
}

function safeSnapshot(getSnapshot: () => DiagnosticSnapshot): Record<string, unknown> {
  try {
    return { ...getSnapshot() };
  } catch (error) {
    return { snapshotError: error instanceof Error ? error.message : String(error) };
  }
}

export function installDiagnostics(
  getSnapshot: () => DiagnosticSnapshot
): () => void {
  const log = (
    category: DiagnosticEvent['category'],
    message: string,
    details?: Record<string, unknown>
  ) => {
    try {
      recordDiagnostic(category, message, details);
    } catch {
      // Diagnostics must remain best-effort and must not destabilize DSK-MV.
    }
  };

  const onError = (event: ErrorEvent) => {
    log('error', 'window.onerror', {
      message: event.message || 'Erreur JavaScript globale',
      filename: event.filename || null,
      line: event.lineno || null,
      column: event.colno || null,
      stack: event.error instanceof Error ? event.error.stack : null,
      state: safeSnapshot(getSnapshot)
    });
  };

  const onUnhandledRejection = (event: PromiseRejectionEvent) => {
    const reason = event.reason;
    log('error', 'unhandledrejection', {
      reason: reason instanceof Error ? reason.message : String(reason),
      stack: reason instanceof Error ? reason.stack : null,
      state: safeSnapshot(getSnapshot)
    });
  };

  const onOnline = () => {
    try {
      log('network', 'Événement online', {
        ...getNetworkDetails(),
        state: safeSnapshot(getSnapshot)
      });
    } catch (error) {
      log('error', 'Erreur pendant le traitement du diagnostic online', {
        error: error instanceof Error ? error.message : String(error)
      });
    }
  };

  const onOffline = () => {
    try {
      log('network', 'Événement offline', {
        ...getNetworkDetails(),
        state: safeSnapshot(getSnapshot)
      });
    } catch (error) {
      log('error', 'Erreur pendant le traitement du diagnostic offline', {
        error: error instanceof Error ? error.message : String(error)
      });
    }
  };

  const onVisibilityChange = () => {
    log('lifecycle', 'Changement de visibilité', {
      visibility: document.visibilityState,
      state: safeSnapshot(getSnapshot)
    });
  };

  const onPageHide = () => log('lifecycle', 'pagehide', { state: safeSnapshot(getSnapshot) });
  const onPageShow = () => log('lifecycle', 'pageshow', { state: safeSnapshot(getSnapshot) });
  const onFocus = () => log('lifecycle', 'window focus', { state: safeSnapshot(getSnapshot) });
  const onBlur = () => log('lifecycle', 'window blur', { state: safeSnapshot(getSnapshot) });

  window.addEventListener('error', onError);
  window.addEventListener('unhandledrejection', onUnhandledRejection);
  window.addEventListener('online', onOnline);
  window.addEventListener('offline', onOffline);
  window.addEventListener('pagehide', onPageHide);
  window.addEventListener('pageshow', onPageShow);
  window.addEventListener('focus', onFocus);
  window.addEventListener('blur', onBlur);
  document.addEventListener('visibilitychange', onVisibilityChange);

  log('system', 'Diagnostic démarré', {
    userAgent: navigator.userAgent,
    ...getNetworkDetails(),
    state: safeSnapshot(getSnapshot)
  });

  return () => {
    window.removeEventListener('error', onError);
    window.removeEventListener('unhandledrejection', onUnhandledRejection);
    window.removeEventListener('online', onOnline);
    window.removeEventListener('offline', onOffline);
    window.removeEventListener('pagehide', onPageHide);
    window.removeEventListener('pageshow', onPageShow);
    window.removeEventListener('focus', onFocus);
    window.removeEventListener('blur', onBlur);
    document.removeEventListener('visibilitychange', onVisibilityChange);
  };
}

export async function copyDiagnosticLog(): Promise<boolean> {
  const output = events.map((event) => JSON.stringify(event)).join(String.fromCharCode(10));
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(output);
      return true;
    }
  } catch {
    // Fall through to the WebView-compatible copy fallback.
  }

  try {
    const textarea = document.createElement('textarea');
    textarea.value = output;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    const copied = document.execCommand('copy');
    document.body.removeChild(textarea);
    return copied;
  } catch {
    return false;
  }
}

export function clearDiagnosticLog(): void {
  events = [];
  recordDiagnostic('system', 'Journal effacé');
}
