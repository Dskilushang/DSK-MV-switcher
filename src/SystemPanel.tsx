import { useCallback, useEffect, useMemo, useState } from 'react';
import { clearDiagnosticLog, copyDiagnosticLog, subscribeDiagnostics, type DiagnosticEvent } from './utils/diagnostics';

type ObsStatus = 'connected' | 'connecting' | 'disconnected' | 'error' | string;

type SystemProfile = {
  id: string;
  name: string;
  obsHost: string;
  obsPort: string;
  cameraHost: string;
  cameraPort: string;
};

type DeviceItem = {
  kind: MediaDeviceKind;
  label: string;
  deviceId: string;
};

type CheckState = 'ok' | 'warning' | 'unavailable';

type CheckItem = {
  label: string;
  detail: string;
  state: CheckState;
};

type SystemPanelProps = {
  open: boolean;
  onClose: () => void;
  obsHost: string;
  obsPort: string;
  cameraHost: string;
  cameraPort: string;
  obsStatus: ObsStatus;
  connectedCameras: number;
  isRecording: boolean;
  isLive: boolean;
  onApplyProfile: (profile: Pick<SystemProfile, 'obsHost' | 'obsPort' | 'cameraHost' | 'cameraPort'>) => void;
};

const PROFILE_STORAGE_KEY = 'dsk-mv-system-profiles-v1';

function readProfiles(): SystemProfile[] {
  try {
    const raw = window.localStorage.getItem(PROFILE_STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is SystemProfile =>
      !!item &&
      typeof item.id === 'string' &&
      typeof item.name === 'string' &&
      typeof item.obsHost === 'string' &&
      typeof item.obsPort === 'string' &&
      typeof item.cameraHost === 'string' &&
      typeof item.cameraPort === 'string'
    );
  } catch {
    return [];
  }
}

function statusLabel(state: CheckState): string {
  if (state === 'ok') return 'DISPONIBLE';
  if (state === 'warning') return 'À VÉRIFIER';
  return 'INDISPONIBLE';
}

function CheckRow({ item }: { item: CheckItem }) {
  const color = item.state === 'ok'
    ? 'text-emerald-400'
    : item.state === 'warning'
      ? 'text-amber-300'
      : 'text-red-400';
  const dot = item.state === 'ok'
    ? 'bg-emerald-400'
    : item.state === 'warning'
      ? 'bg-amber-300'
      : 'bg-red-400';

  return (
    <div className="flex items-start justify-between gap-3 border-b border-slate-800 py-2 last:border-0">
      <div className="min-w-0">
        <p className="text-[11px] font-bold text-slate-200">{item.label}</p>
        <p className="mt-0.5 text-[10px] text-slate-500">{item.detail}</p>
      </div>
      <span className={`flex shrink-0 items-center gap-1 text-[9px] font-black ${color}`}>
        <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
        {statusLabel(item.state)}
      </span>
    </div>
  );
}

export default function SystemPanel(props: SystemPanelProps) {
  const {
    open, onClose, obsHost, obsPort, cameraHost, cameraPort,
    obsStatus, connectedCameras, isRecording, isLive, onApplyProfile
  } = props;
  const [profiles, setProfiles] = useState<SystemProfile[]>([]);
  const [profileName, setProfileName] = useState('');
  const [deviceItems, setDeviceItems] = useState<DeviceItem[]>([]);
  const [deviceMessage, setDeviceMessage] = useState('Actualisez la liste pour détecter les périphériques.');
  const [isRefreshingDevices, setIsRefreshingDevices] = useState(false);
  const [activeTab, setActiveTab] = useState<'overview' | 'profiles' | 'devices' | 'diagnostics'>('overview');
  const [diagnosticEvents, setDiagnosticEvents] = useState<DiagnosticEvent[]>([]);
  const [diagnosticCopyMessage, setDiagnosticCopyMessage] = useState('');
  const [online, setOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);
  const [orientation, setOrientation] = useState('Non détectée');

  useEffect(() => subscribeDiagnostics(setDiagnosticEvents), []);

  useEffect(() => {
    if (!open) return;
    setProfiles(readProfiles());
    setOnline(navigator.onLine);
    const updateOnline = () => setOnline(navigator.onLine);
    window.addEventListener('online', updateOnline);
    window.addEventListener('offline', updateOnline);
    const updateOrientation = () => {
      const orientationType = window.screen?.orientation?.type;
      setOrientation(orientationType || (window.innerWidth >= window.innerHeight ? 'Paysage détecté' : 'Portrait détecté'));
    };
    updateOrientation();
    window.addEventListener('resize', updateOrientation);
    return () => {
      window.removeEventListener('online', updateOnline);
      window.removeEventListener('offline', updateOnline);
      window.removeEventListener('resize', updateOrientation);
    };
  }, [open]);

  const checks = useMemo<CheckItem[]>(() => {
    const mediaDevices = !!navigator.mediaDevices;
    const audioContextAvailable = typeof window !== 'undefined' &&
      (!!window.AudioContext || !!(window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext);
    const canvasCapture = typeof HTMLCanvasElement !== 'undefined' &&
      typeof HTMLCanvasElement.prototype.captureStream === 'function';
    const mediaRecorder = typeof MediaRecorder !== 'undefined';
    const webRtc = typeof RTCPeerConnection !== 'undefined';
    const secureContext = typeof window !== 'undefined' && window.isSecureContext;
    return [
      { label: 'Réseau local', detail: online ? 'Connexion réseau active.' : 'Appareil hors ligne.', state: online ? 'ok' : 'warning' },
      { label: 'Contexte sécurisé', detail: secureContext ? 'Contexte sécurisé actif.' : 'Certaines fonctions caméra/micro peuvent exiger HTTPS ou une application native.', state: secureContext ? 'ok' : 'warning' },
      { label: 'Capture caméra / audio', detail: mediaDevices ? 'API MediaDevices détectée.' : 'API MediaDevices absente.', state: mediaDevices ? 'ok' : 'unavailable' },
      { label: 'Moteur audio Web', detail: audioContextAvailable ? 'Web Audio API détectée.' : 'Web Audio API absente.', state: audioContextAvailable ? 'ok' : 'unavailable' },
      { label: 'Transport WebRTC', detail: webRtc ? 'RTCPeerConnection détecté.' : 'WebRTC absent.', state: webRtc ? 'ok' : 'unavailable' },
      { label: 'Enregistrement local', detail: mediaRecorder ? 'MediaRecorder détecté.' : 'MediaRecorder absent.', state: mediaRecorder ? 'ok' : 'unavailable' },
      { label: 'Capture PGM', detail: canvasCapture ? 'Canvas captureStream détecté.' : 'Capture vidéo Canvas absente.', state: canvasCapture ? 'ok' : 'unavailable' },
      { label: 'Orientation', detail: orientation, state: orientation.toLowerCase().includes('paysage') || orientation.toLowerCase().includes('landscape') ? 'ok' : 'warning' }
    ];
  }, [online, orientation]);

  const refreshDevices = useCallback(async () => {
    if (!navigator.mediaDevices?.enumerateDevices) {
      setDeviceItems([]);
      setDeviceMessage('Énumération des périphériques non prise en charge par cet appareil.');
      return;
    }
    setIsRefreshingDevices(true);
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      setDeviceItems(devices.map((device) => ({
        kind: device.kind,
        label: device.label || 'Nom masqué (autorisation non accordée)',
        deviceId: device.deviceId ? `${device.deviceId.slice(0, 6)}…` : 'ID indisponible'
      })));
      setDeviceMessage(`${devices.length} périphérique(s) détecté(s). Cette opération ne demande aucune autorisation.`);
    } catch (error) {
      setDeviceMessage(error instanceof Error ? error.message : 'Impossible de lire la liste des périphériques.');
    } finally {
      setIsRefreshingDevices(false);
    }
  }, []);

  const saveProfile = () => {
    const name = profileName.trim();
    if (!name) return;
    const profile: SystemProfile = {
      id: typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}`,
      name,
      obsHost,
      obsPort,
      cameraHost,
      cameraPort
    };
    const next = [...profiles, profile];
    try {
      window.localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(next));
      setProfiles(next);
      setProfileName('');
    } catch {
      setDeviceMessage('Stockage local indisponible : impossible de sauvegarder ce profil.');
    }
  };

  const applyProfile = (profile: SystemProfile) => {
    onApplyProfile({
      obsHost: profile.obsHost,
      obsPort: profile.obsPort,
      cameraHost: profile.cameraHost,
      cameraPort: profile.cameraPort
    });
  };

  const deleteProfile = (id: string) => {
    const next = profiles.filter((profile) => profile.id !== id);
    setProfiles(next);
    try {
      window.localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(next));
    } catch {
      setDeviceMessage('Impossible de mettre à jour le stockage local.');
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[140] flex items-center justify-center bg-black/85 p-3">
      <section className="flex max-h-[92dvh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-slate-600 bg-slate-950 shadow-2xl">
        <header className="flex items-center justify-between border-b border-slate-800 bg-slate-900 px-4 py-3">
          <div>
            <h2 className="text-sm font-black tracking-widest text-sky-300">DSK SYSTEM</h2>
            <p className="text-[10px] text-slate-400">Paramètres · Profils · Périphériques · Stabilité</p>
          </div>
          <button onClick={onClose} className="min-h-10 min-w-10 rounded bg-slate-800 text-white">✕</button>
        </header>

        <nav className="grid grid-cols-4 gap-1 border-b border-slate-800 bg-slate-900 p-2">
          {([
            ['overview', 'ÉTAT SYSTÈME'],
            ['profiles', 'PROFILS'],
            ['devices', 'PÉRIPHÉRIQUES'],
            ['diagnostics', 'JOURNAL']
          ] as const).map(([tab, label]) => (
            <button key={tab} onClick={() => setActiveTab(tab)} className={`rounded px-2 py-3 text-[10px] font-black ${activeTab === tab ? 'bg-sky-700 text-white' : 'bg-slate-800 text-slate-400'}`}>
              {label}
            </button>
          ))}
        </nav>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
          {activeTab === 'overview' && (
            <>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <div className="rounded border border-slate-800 bg-slate-900 p-3">
                  <p className="text-[9px] text-slate-500">RÉSEAU</p>
                  <p className={`mt-1 text-xs font-black ${online ? 'text-emerald-400' : 'text-amber-300'}`}>{online ? 'EN LIGNE' : 'HORS LIGNE'}</p>
                </div>
                <div className="rounded border border-slate-800 bg-slate-900 p-3">
                  <p className="text-[9px] text-slate-500">OBS</p>
                  <p className={`mt-1 text-xs font-black ${obsStatus === 'connected' ? 'text-emerald-400' : 'text-slate-300'}`}>{obsStatus === 'connected' ? 'CONNECTÉ' : obsStatus === 'connecting' ? 'CONNEXION' : 'DÉCONNECTÉ'}</p>
                </div>
                <div className="rounded border border-slate-800 bg-slate-900 p-3">
                  <p className="text-[9px] text-slate-500">CAMÉRAS DISTANTES</p>
                  <p className="mt-1 text-xs font-black text-slate-100">{connectedCameras}/7</p>
                </div>
                <div className="rounded border border-slate-800 bg-slate-900 p-3">
                  <p className="text-[9px] text-slate-500">PRODUCTION</p>
                  <p className={`mt-1 text-xs font-black ${isLive ? 'text-red-400' : isRecording ? 'text-amber-300' : 'text-slate-300'}`}>{isLive ? 'LIVE' : isRecording ? 'REC' : 'VEILLE'}</p>
                </div>
              </div>
              <div className="rounded-lg border border-slate-800 bg-slate-900 p-3">
                <h3 className="mb-2 text-[10px] font-black tracking-widest text-slate-300">CONTRÔLES DE STABILITÉ</h3>
                {checks.map((item) => <CheckRow key={item.label} item={item} />)}
              </div>
              <p className="text-[10px] text-slate-500">Ces contrôles vérifient la présence des API du navigateur et l’état réseau. Ils ne remplacent pas les essais réels des caméras, interfaces audio ou sorties vidéo.</p>
            </>
          )}

          {activeTab === 'diagnostics' && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-800 bg-slate-900 p-3">
                <div>
                  <h3 className="text-[10px] font-black tracking-widest text-sky-300">JOURNAL DE DIAGNOSTIC</h3>
                  <p className="mt-1 text-[9px] text-slate-400">{diagnosticEvents.length} événement(s) en mémoire · tampon limité à 180</p>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => { void copyDiagnosticLog().then((copied) => setDiagnosticCopyMessage(copied ? 'Journal copié.' : 'Copie impossible sur cet appareil.')); }} className="rounded bg-sky-700 px-3 py-2 text-[9px] font-black text-white">COPIER</button>
                  <button onClick={() => { clearDiagnosticLog(); setDiagnosticCopyMessage(''); }} className="rounded bg-slate-700 px-3 py-2 text-[9px] font-black text-white">EFFACER</button>
                </div>
              </div>
              {diagnosticCopyMessage && <p role="status" className="text-[10px] text-emerald-300">{diagnosticCopyMessage}</p>}
              <p className="text-[9px] text-slate-500">Les événements sont conservés en mémoire tant que le processus reste actif. Copiez le journal avant de fermer l’application ou de reproduire un incident. Le journal ne modifie pas les flux audio/vidéo.</p>
              <div className="max-h-[48dvh] space-y-2 overflow-y-auto">
                {diagnosticEvents.length === 0 && <p className="rounded border border-slate-800 bg-slate-900 p-4 text-xs text-slate-500">Aucun événement enregistré.</p>}
                {[...diagnosticEvents].reverse().map((event) => (
                  <article key={event.id} className="rounded border border-slate-800 bg-slate-900 p-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className={`text-[9px] font-black uppercase ${event.category === 'error' ? 'text-red-300' : event.category === 'network' ? 'text-amber-300' : 'text-sky-300'}`}>{event.category}</span>
                      <time className="text-[8px] text-slate-500">{event.timestamp}</time>
                    </div>
                    <p className="mt-1 text-[10px] font-bold text-slate-200">{event.message}</p>
                    {event.details && <pre className="mt-1 whitespace-pre-wrap break-words text-[9px] text-slate-400">{JSON.stringify(event.details, null, 2)}</pre>}
                  </article>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'profiles' && (
            <>
              <div className="rounded-lg border border-slate-800 bg-slate-900 p-3">
                <h3 className="mb-2 text-[10px] font-black tracking-widest text-sky-300">ENREGISTRER LA CONFIGURATION ACTUELLE</h3>
                <input value={profileName} onChange={(event) => setProfileName(event.target.value)} placeholder="Nom du profil (ex. Studio principal)" maxLength={40} className="mb-2 w-full rounded border border-slate-700 bg-slate-800 px-3 py-3 text-xs text-white" />
                <button onClick={saveProfile} disabled={!profileName.trim()} className="w-full rounded bg-sky-700 py-3 text-xs font-black text-white disabled:opacity-40">ENREGISTRER LE PROFIL</button>
                <p className="mt-2 text-[9px] text-slate-500">Le profil mémorise uniquement les hôtes et ports OBS/DSK Receiver. Les mots de passe et codes d’association ne sont jamais enregistrés.</p>
              </div>
              <div className="space-y-2">
                <h3 className="text-[10px] font-black tracking-widest text-slate-300">PROFILS DISPONIBLES · {profiles.length}</h3>
                {profiles.length === 0 && <p className="rounded border border-slate-800 bg-slate-900 p-4 text-xs text-slate-500">Aucun profil enregistré.</p>}
                {profiles.map((profile) => (
                  <div key={profile.id} className="flex items-center gap-2 rounded border border-slate-800 bg-slate-900 p-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-black text-white">{profile.name}</p>
                      <p className="mt-1 text-[9px] text-slate-500">OBS {profile.obsHost}:{profile.obsPort} · DSK {profile.cameraHost || 'non défini'}:{profile.cameraPort}</p>
                    </div>
                    <button onClick={() => applyProfile(profile)} className="rounded bg-emerald-700 px-3 py-2 text-[9px] font-black text-white">CHARGER</button>
                    <button onClick={() => deleteProfile(profile.id)} aria-label={`Supprimer le profil ${profile.name}`} className="rounded bg-slate-800 px-3 py-2 text-[9px] font-bold text-red-300">SUPPR.</button>
                  </div>
                ))}
              </div>
            </>
          )}

          {activeTab === 'devices' && (
            <>
              <div className="flex items-center justify-between gap-2">
                <div>
                  <h3 className="text-[10px] font-black tracking-widest text-slate-200">PÉRIPHÉRIQUES DISPONIBLES</h3>
                  <p className="mt-1 text-[9px] text-slate-500">Caméras, microphones et sorties audio visibles par Android/WebView.</p>
                </div>
                <button onClick={() => void refreshDevices()} disabled={isRefreshingDevices} className="rounded bg-sky-700 px-3 py-3 text-[9px] font-black text-white disabled:opacity-40">{isRefreshingDevices ? 'LECTURE…' : 'ACTUALISER'}</button>
              </div>
              <p className="text-[10px] text-slate-400">{deviceMessage}</p>
              <div className="space-y-2">
                {deviceItems.map((device, index) => (
                  <div key={`${device.kind}-${device.deviceId}-${index}`} className="flex items-center gap-3 rounded border border-slate-800 bg-slate-900 p-3">
                    <span className="w-20 shrink-0 text-[9px] font-black text-sky-300">{device.kind === 'audioinput' ? 'ENTRÉE AUDIO' : device.kind === 'audiooutput' ? 'SORTIE AUDIO' : 'CAMÉRA'}</span>
                    <span className="min-w-0 flex-1 break-words text-[10px] text-slate-200">{device.label}</span>
                    <span className="text-[8px] text-slate-600">{device.deviceId}</span>
                  </div>
                ))}
                {deviceItems.length === 0 && <p className="rounded border border-slate-800 bg-slate-900 p-4 text-xs text-slate-500">Aucun périphérique listé. Actualisez la liste ou vérifiez les autorisations déjà accordées.</p>}
              </div>
            </>
          )}
        </div>
      </section>
    </div>
  );
}
