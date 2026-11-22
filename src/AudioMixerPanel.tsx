import { useCallback, useEffect, useRef, useState } from 'react';
import { AudioEngine, type AudioChannelSnapshot, type AudioInputDevice, type AudioMeterReading } from './audio/AudioEngine';

type AudioMixerPanelProps = {
  open: boolean;
  onClose: () => void;
};

const CHANNEL_COUNT = 8;

function formatDb(value: number): string {
  return Number.isFinite(value) ? `${value.toFixed(1)} dB` : '-∞ dB';
}

function meterWidth(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, ((value + 60) / 60) * 100));
}

function Meter({ reading }: { reading: AudioMeterReading }) {
  return (
    <div className="space-y-1">
      <div className="h-2 overflow-hidden rounded bg-slate-950 border border-slate-700">
        <div
          className="h-full bg-emerald-500 transition-[width] duration-100"
          style={{ width: `${meterWidth(reading.rmsDb)}%` }}
        />
      </div>
      <div className="flex justify-between text-[9px] tabular-nums text-slate-400">
        <span>{formatDb(reading.rmsDb)}</span>
        <span>PK {formatDb(reading.peakDb)}</span>
      </div>
    </div>
  );
}

export default function AudioMixerPanel({ open, onClose }: AudioMixerPanelProps) {
  const engineRef = useRef<AudioEngine | null>(null);
  const streamsRef = useRef<Map<number, MediaStream>>(new Map());
  const [engineReady, setEngineReady] = useState(false);
  const [devices, setDevices] = useState<AudioInputDevice[]>([]);
  const [selectedDevices, setSelectedDevices] = useState<Record<number, string>>({});
  const [channels, setChannels] = useState<AudioChannelSnapshot[]>([]);
  const [masterMeter, setMasterMeter] = useState<AudioMeterReading>({ rmsDb: Number.NEGATIVE_INFINITY, peakDb: Number.NEGATIVE_INFINITY });
  const [busyChannel, setBusyChannel] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('Moteur audio arrêté');

  const refreshMeters = useCallback(() => {
    const engine = engineRef.current;
    if (!engine) return;
    try {
      setChannels(engine.getAllChannelSnapshots());
      setMasterMeter(engine.getMasterMeter());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Lecture des niveaux audio impossible.');
    }
  }, []);

  useEffect(() => {
    if (!engineReady) return;
    const timer = window.setInterval(refreshMeters, 120);
    refreshMeters();
    return () => window.clearInterval(timer);
  }, [engineReady, refreshMeters]);

  useEffect(() => {
    return () => {
      for (const stream of streamsRef.current.values()) {
        stream.getTracks().forEach((track) => track.stop());
      }
      streamsRef.current.clear();
      const engine = engineRef.current;
      engineRef.current = null;
      if (engine) void engine.dispose();
    };
  }, []);

  const activateEngine = async () => {
    if (engineRef.current) return;
    setError('');
    setStatus('Initialisation du moteur audio…');
    let engine: AudioEngine | null = null;
    try {
      engine = new AudioEngine({ channelCount: CHANNEL_COUNT });
      await engine.resume();
      engineRef.current = engine;
      setChannels(engine.getAllChannelSnapshots());

      // A short permission request unlocks device labels on browsers that hide them
      // until microphone permission has been granted. The temporary stream is stopped.
      try {
        const permissionStream = await engine.requestInputStream();
        permissionStream.getTracks().forEach((track) => track.stop());
      } catch (permissionError) {
        setError(permissionError instanceof Error ? permissionError.message : 'Autorisation du microphone non accordée.');
      }

      const inputDevices = await engine.listInputDevices();
      setDevices(inputDevices);
      setEngineReady(true);
      setStatus('Moteur actif · 8 canaux');
    } catch (cause) {
      if (engine) await engine.dispose();
      engineRef.current = null;
      setEngineReady(false);
      setStatus('Moteur audio indisponible');
      setError(cause instanceof Error ? cause.message : 'Impossible de démarrer le moteur audio.');
    }
  };

  const connectChannel = async (channelId: number) => {
    const engine = engineRef.current;
    const deviceId = selectedDevices[channelId];
    if (!engine) {
      setError('Démarrez d’abord le moteur audio.');
      return;
    }
    if (!deviceId) {
      setError(`Sélectionnez une entrée audio pour CH ${channelId}.`);
      return;
    }

    setBusyChannel(channelId);
    setError('');
    try {
      const stream = await engine.requestInputStream(deviceId);
      const previous = streamsRef.current.get(channelId);
      engine.connectInput(channelId, stream);
      streamsRef.current.set(channelId, stream);
      previous?.getTracks().forEach((track) => track.stop());
      refreshMeters();
      setStatus(`CH ${channelId} connecté`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : `Connexion de CH ${channelId} impossible.`);
    } finally {
      setBusyChannel(null);
    }
  };

  const disconnectChannel = (channelId: number) => {
    const engine = engineRef.current;
    if (!engine) return;
    try {
      engine.disconnectInput(channelId);
      streamsRef.current.get(channelId)?.getTracks().forEach((track) => track.stop());
      streamsRef.current.delete(channelId);
      refreshMeters();
      setStatus(`CH ${channelId} déconnecté`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Déconnexion audio impossible.');
    }
  };

  const updateGain = (channelId: number, value: number) => {
    engineRef.current?.setChannelGain(channelId, value);
    refreshMeters();
  };

  const updatePan = (channelId: number, value: number) => {
    engineRef.current?.setChannelPan(channelId, value);
    refreshMeters();
  };

  const toggleMute = (channelId: number, muted: boolean) => {
    engineRef.current?.setChannelMuted(channelId, muted);
    refreshMeters();
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/90 p-2">
      <section className="flex max-h-full w-full max-w-[1500px] flex-col overflow-hidden rounded-xl border border-slate-700 bg-slate-900 shadow-2xl">
        <header className="flex items-center justify-between border-b border-slate-700 bg-slate-950 px-3 py-2">
          <div>
            <h2 className="text-sm font-black tracking-wider text-amber-400">DSK AUDIO · MIXER</h2>
            <p className="text-[10px] text-slate-400">{status}</p>
          </div>
          <div className="flex items-center gap-2">
            {!engineReady && (
              <button onClick={() => void activateEngine()} className="rounded bg-emerald-700 px-3 py-2 text-[10px] font-bold text-white">
                ACTIVER LE MOTEUR
              </button>
            )}
            <button onClick={onClose} className="min-h-10 min-w-10 rounded bg-slate-800 px-3 text-lg text-white" aria-label="Fermer le mixeur">×</button>
          </div>
        </header>

        {error && <div role="alert" className="border-b border-red-900 bg-red-950/70 px-3 py-2 text-[10px] text-red-200">{error}</div>}

        <div className="grid min-h-0 flex-1 grid-cols-8 gap-1 overflow-x-auto overflow-y-auto p-2">
          {Array.from({ length: CHANNEL_COUNT }, (_, index) => index + 1).map((channelId) => {
            const channel = channels.find((item) => item.id === channelId);
            const connected = streamsRef.current.has(channelId);
            return (
              <article key={channelId} className="flex min-w-0 flex-col gap-2 rounded-lg border border-slate-700 bg-slate-800/80 p-2">
                <div className="flex items-center justify-between gap-1">
                  <strong className="text-xs text-white">CH {channelId}</strong>
                  <span className={`h-2 w-2 rounded-full ${connected ? 'bg-emerald-400' : 'bg-slate-600'}`} />
                </div>

                <select
                  aria-label={`Entrée audio du canal ${channelId}`}
                  value={selectedDevices[channelId] || ''}
                  onChange={(event) => setSelectedDevices((current) => ({ ...current, [channelId]: event.target.value }))}
                  disabled={!engineReady || connected}
                  className="h-9 w-full min-w-0 rounded border border-slate-600 bg-slate-950 px-1 text-[9px] text-white disabled:opacity-50"
                >
                  <option value="">Entrée audio…</option>
                  {devices.map((device) => (
                    <option key={device.deviceId} value={device.deviceId}>{device.label}</option>
                  ))}
                </select>

                {connected ? (
                  <button onClick={() => disconnectChannel(channelId)} className="rounded bg-red-800 px-1 py-2 text-[9px] font-bold text-white">DÉCONNECTER</button>
                ) : (
                  <button
                    onClick={() => void connectChannel(channelId)}
                    disabled={!engineReady || busyChannel !== null}
                    className="rounded bg-emerald-800 px-1 py-2 text-[9px] font-bold text-white disabled:opacity-40"
                  >
                    {busyChannel === channelId ? 'CONNEXION…' : 'CONNECTER'}
                  </button>
                )}

                <Meter reading={channel?.meter || { rmsDb: Number.NEGATIVE_INFINITY, peakDb: Number.NEGATIVE_INFINITY }} />

                <label className="space-y-1 text-[9px] text-slate-400">
                  <span className="flex justify-between"><span>GAIN</span><span>{Math.round((channel?.gain ?? 1) * 100)}%</span></span>
                  <input
                    aria-label={`Gain canal ${channelId}`}
                    type="range"
                    min="0"
                    max="2"
                    step="0.01"
                    value={channel?.gain ?? 1}
                    disabled={!engineReady}
                    onChange={(event) => updateGain(channelId, Number(event.target.value))}
                    className="w-full accent-amber-400"
                  />
                </label>

                <label className="space-y-1 text-[9px] text-slate-400">
                  <span className="flex justify-between"><span>PAN</span><span>{(channel?.pan ?? 0) < -0.02 ? 'L' : (channel?.pan ?? 0) > 0.02 ? 'R' : 'C'}</span></span>
                  <input
                    aria-label={`Panoramique canal ${channelId}`}
                    type="range"
                    min="-1"
                    max="1"
                    step="0.01"
                    value={channel?.pan ?? 0}
                    disabled={!engineReady}
                    onChange={(event) => updatePan(channelId, Number(event.target.value))}
                    className="w-full accent-sky-400"
                  />
                </label>

                <button
                  onClick={() => toggleMute(channelId, !(channel?.muted ?? false))}
                  disabled={!engineReady}
                  className={`rounded px-2 py-2 text-[10px] font-black disabled:opacity-40 ${channel?.muted ? 'bg-red-600 text-white' : 'bg-slate-700 text-slate-200'}`}
                >
                  {channel?.muted ? 'MUTED' : 'MUTE'}
                </button>
              </article>
            );
          })}
        </div>

        <footer className="grid grid-cols-[1fr_auto] items-center gap-3 border-t border-slate-700 bg-slate-950 px-3 py-2">
          <div className="min-w-0">
            <div className="mb-1 flex items-center justify-between text-[10px]">
              <strong className="text-amber-300">PGM · STÉRÉO L/R</strong>
              <span className="text-slate-400">MASTER · {formatDb(masterMeter.rmsDb)}</span>
            </div>
            <Meter reading={masterMeter} />
            <p className="mt-1 text-[9px] text-slate-500">Sortie PGM locale et sorties ISO pré/post-fader disponibles dans le moteur. Transport réseau vers OBS non intégré à cette étape.</p>
          </div>
          <div className="text-right text-[9px] text-slate-500">
            <div>Fréquence native du moteur</div>
            <div>8 canaux · extensible à 32</div>
          </div>
        </footer>
      </section>
    </div>
  );
}
