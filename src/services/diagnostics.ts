export type DiagnosticLevel = 'debug' | 'info' | 'warning' | 'error' | 'fatal';

export type DiagnosticEntry = {
  id: number;
  timestamp: string;
  level: DiagnosticLevel;
  category: string;
  message: string;
  details?: Record<string, unknown>;
};

const STORAGE_KEY = 'dsk-mv-diagnostics-v1';
const MAX_ENTRIES = 500;
const MAX_STORAGE_CHARS = 450_000;
const listeners = new Set<() => void>();
let entries: DiagnosticEntry[] = loadEntries();
let nextId = entries.reduce((max, entry) => Math.max(max, entry.id), 0) + 1;
let installed = false;
let cleanupListeners: (() => void) | null = null;

function loadEntries(): DiagnosticEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.slice(-MAX_ENTRIES) as DiagnosticEntry[] : [];
  } catch {
    return [];
  }
}

function persist(): void {
  try {
    let serialized = JSON.stringify(entries.slice(-MAX_ENTRIES));
    while (serialized.length > MAX_STORAGE_CHARS && entries.length > 20) {
      entries = entries.slice(Math.ceil(entries.length * 0.1));
      serialized = JSON.stringify(entries);
    }
    localStorage.setItem(STORAGE_KEY, serialized);
  } catch {
    // Diagnostics must never crash or block the production UI.
  }
}

function notify(): void {
  listeners.forEach((listener) => {
    try { listener(); } catch { /* A diagnostics subscriber must not affect production. */ }
  });
}

function safeDetails(value: unknown): Record<string, unknown> | undefined {
  if (value === undefined || value === null) return undefined;
  try {
    if (value instanceof Error) {
      return { name: value.name, message: value.message, stack: value.stack };
    }
    if (typeof value === 'object') return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
    return { value: String(value) };
  } catch {
    return { value: String(value) };
  }
}

export function recordDiagnostic(
  level: DiagnosticLevel,
  category: string,
  message: string,
  details?: unknown
): void {
  const entry: DiagnosticEntry = {
    id: nextId++,
    timestamp: new Date().toISOString(),
    level,
    category: category.slice(0, 48),
    message: message.slice(0, 500),
    ...(safeDetails(details) ? { details: safeDetails(details) } : {})
  };
  entries = [...entries.slice(-(MAX_ENTRIES - 1)), entry];
  persist();
  notify();
}

export function getDiagnosticEntries(): DiagnosticEntry[] {
  return [...entries];
}

export function subscribeDiagnostics(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function clearDiagnostics(): void {
  entries = [];
  persist();
  recordDiagnostic('info', 'diagnostics', 'Journal effacé par l’utilisateur');
}

export function exportDiagnostics(): string {
  return JSON.stringify({
    product: 'DSK-MV',
    exportedAt: new Date().toISOString(),
    sessionStartedAt: sessionStartedAt,
    environment: {
      userAgent: navigator.userAgent,
      platform: navigator.platform,
      language: navigator.language,
      online: navigator.onLine,
      secureContext: window.isSecureContext,
      viewport: { width: window.innerWidth, height: window.innerHeight, pixelRatio: window.devicePixelRatio },
      memory: getMemorySnapshot()
    },
    entries
  }, null, 2);
}

const sessionStartedAt = new Date().toISOString();

function getMemorySnapshot(): Record<string, unknown> {
  const performanceWithMemory = performance as Performance & {
    memory?: { usedJSHeapSize: number; totalJSHeapSize: number; jsHeapSizeLimit: number };
  };
  const memory = performanceWithMemory.memory;
  return memory ? {
    usedJSHeapSize: memory.usedJSHeapSize,
    totalJSHeapSize: memory.totalJSHeapSize,
    jsHeapSizeLimit: memory.jsHeapSizeLimit
  } : { available: false };
}

/** Installs app-wide fault and lifecycle capture once per WebView session. */
export function installDiagnosticListeners(): () => void {
  if (installed) return () => undefined;
  installed = true;

  const onError = (event: ErrorEvent) => {
    recordDiagnostic('fatal', 'javascript', event.message || 'Erreur JavaScript non interceptée', {
      filename: event.filename, line: event.lineno, column: event.colno,
      error: safeDetails(event.error)
    });
  };
  const onUnhandledRejection = (event: PromiseRejectionEvent) => {
    recordDiagnostic('fatal', 'promise', 'Promesse rejetée sans gestionnaire', safeDetails(event.reason));
  };
  const onVisibility = () => recordDiagnostic('info', 'lifecycle',
    document.visibilityState === 'hidden' ? 'Application passée en arrière-plan' : 'Application revenue au premier plan',
    { visibilityState: document.visibilityState, audioContextStates: getAudioContextStates() });
  const onPageHide = () => recordDiagnostic('warning', 'lifecycle', 'WebView pagehide', { persisted: true });
  const onPageShow = (event: PageTransitionEvent) => recordDiagnostic('info', 'lifecycle', 'WebView pageshow', { restoredFromCache: event.persisted });
  const onOnline = () => recordDiagnostic('info', 'network', 'Connexion réseau rétablie');
  const onOffline = () => recordDiagnostic('warning', 'network', 'Connexion réseau perdue');
  const onRejectionHandled = () => recordDiagnostic('debug', 'promise', 'Promesse rejetée ensuite prise en charge');

  window.addEventListener('error', onError);
  window.addEventListener('unhandledrejection', onUnhandledRejection);
  window.addEventListener('rejectionhandled', onRejectionHandled);
  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('pagehide', onPageHide);
  window.addEventListener('pageshow', onPageShow);
  window.addEventListener('online', onOnline);
  window.addEventListener('offline', onOffline);

  recordDiagnostic('info', 'session', 'Session DSK-MV démarrée', {
    sessionStartedAt, userAgent: navigator.userAgent, platform: navigator.platform,
    viewport: { width: window.innerWidth, height: window.innerHeight, pixelRatio: window.devicePixelRatio },
    online: navigator.onLine, secureContext: window.isSecureContext,
    previousSessionEntries: entries.length
  });

  const memoryTimer = window.setInterval(() => {
    const memory = getMemorySnapshot();
    if (memory.available === false) return;
    const used = Number(memory.usedJSHeapSize);
    const limit = Number(memory.jsHeapSizeLimit);
    if (limit > 0 && used / limit > 0.85) {
      recordDiagnostic('warning', 'memory', 'Utilisation mémoire JavaScript supérieure à 85 %', memory);
    }
  }, 30_000);

  cleanupListeners = () => {
    window.removeEventListener('error', onError);
    window.removeEventListener('unhandledrejection', onUnhandledRejection);
    window.removeEventListener('rejectionhandled', onRejectionHandled);
    document.removeEventListener('visibilitychange', onVisibility);
    window.removeEventListener('pagehide', onPageHide);
    window.removeEventListener('pageshow', onPageShow);
    window.removeEventListener('online', onOnline);
    window.removeEventListener('offline', onOffline);
    window.clearInterval(memoryTimer);
    installed = false;
    cleanupListeners = null;
  };
  return () => cleanupListeners?.();
}

function getAudioContextStates(): string[] {
  return Array.from(document.querySelectorAll('audio,video')).map((element) => {
    const media = element as HTMLMediaElement;
    return `${media.tagName.toLowerCase()}:paused=${media.paused},muted=${media.muted},readyState=${media.readyState}`;
  });
}
