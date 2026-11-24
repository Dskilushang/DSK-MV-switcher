import { useCallback, useEffect, useRef, useState } from 'react';
import { AudioEngine, type AudioChannelSnapshot, type AudioInputDevice, type AudioMeterReading } from './audio/AudioEngine';
import AudioNetworkPanel from './AudioNetworkPanel';

export type MediaAudioRoute = {
  connect: (channelId: number, element: HTMLMediaElement) => void;
  disconnect: (channelId: number) => void;
};

type AudioMixerPanelProps = {
  open: boolean;
  onClose: () => void;
  onProgramStreamChange?: (stream: MediaStream | null) => void;
  onMediaAudioRouteReady?: (route: MediaAudioRoute | null) => void;
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
      <div className="h-1.5 overflow-hidden rounded bg-slate-950 border border-slate-700">
        <div
          className="h-full bg-emerald-500 transition-[width] duration-100"
          style={{ width: `${meterWidth(reading.rmsDb)}%` }}
        />
      </div>
      <div className="flex justify-between text-[8px] tabular-nums text-slate-400">
        <span>{formatDb(reading.rmsDb)}</span>
        <span>PK {formatDb(reading.peakDb)}</span>
      </div>
    </div>
  );
}

function VerticalMeter({ reading }: { reading: AudioMeterReading }) {
  return (
    <div
      className="flex min-h-0 w-3 flex-col items-center justify-end overflow-hidden rounded border border-slate-700 bg-slate-950"
      role="meter"
      aria-label={`Niveau audio : RMS ${formatDb(reading.rmsDb)}, peak ${formatDb(reading.peakDb)}`}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={meterWidth(reading.rmsDb)}
      title={`RMS ${formatDb(reading.rmsDb)} · Peak ${formatDb(reading.peakDb)}`}
    >
      <div
        className="mt-auto w-full bg-emerald-500 transition-[height] duration-100"
        style={{ height: `${meterWidth(reading.rmsDb)}%` }}
      />
    </div>
  );
}

export default function AudioMixerPanel({ open, onClose, onProgramStreamChange, onMediaAudioRouteReady }: AudioMixerPanelProps) {
  const engineRef = useRef<AudioEngine | null>(null);
  const streamsRef = useRef<Map<number, MediaStream>>(new Map());
  const mediaChannelsRef = useRef<Set<number>>(new Set());
  const [engineReady, setEngineReady] = useState(false);
  const [devices, setDevices] = useState<AudioInputDevice[]>([]);
  const [selectedDevices, setSelectedDevices] = useState<Record<number, string>>({});
  const [multiChannelDevice, setMultiChannelDevice] = useState('');
  const [multiChannelStart, setMultiChannelStart] = useState(1);
  const [multiChannelCount, setMultiChannelCount] = useState(1);
  const [multiChannelGroup, setMultiChannelGroup] = useState<{ stream: MediaStream; channelIds: number[] } | null>(null);
  const [channels, setChannels] = useState<AudioChannelSnapshot[]>([]);
  const [masterMeter, setMasterMeter] = useState<AudioMeterReading>({ rmsDb: Number.NEGATIVE_INFINITY, peakDb: Number.NEGATIVE_INFINITY });
  const [masterGain, setMasterGain] = useState(1);
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
    if (!engineReady || !engineRef.current) {
      onMediaAudioRouteReady?.(null);
      return;
    }
    const engine = engineRef.current;
    const route: MediaAudioRoute = {
      connect: (channelId, element) => {
        if (streamsRef.current.has(channelId) && !mediaChannelsRef.current.has(channelId)) {
          throw new Error(`CH ${channelId} est déjà occupé par une entrée audio. Choisissez une tranche libre.`);
        }
        engine.connectMediaElement(channelId, element);
        mediaChannelsRef.current.add(channelId);
        engine.setChannelName(channelId, 'MEDIA');
        refreshMeters();
      },
      disconnect: (channelId) => {
        if (!mediaChannelsRef.current.has(channelId)) return;
        engine.disconnectInput(channelId);
        mediaChannelsRef.current.delete(channelId);
        engine.setChannelName(channelId, `CH ${channelId}`);
        refreshMeters();
      }
    };
    onMediaAudioRouteReady?.(route);
    return () => onMediaAudioRouteReady?.(null);
  }, [engineReady, onMediaAudioRouteReady, refreshMeters]);

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
      onProgramStreamChange?.(null);
      if (engine) void engine.dispose();
    };
  }, []);

  const refreshInputDevices = async () => {
    const engine = engineRef.current;
    if (!engine) return;
    setError('');
    let permissionError: unknown = null;
    try {
      const permissionStream = await engine.requestInputStream();
      permissionStream.getTracks().forEach((track) => track.stop());
    } catch (cause) {
      permissionError = cause;
    }

    try {
      const inputDevices = await engine.listInputDevices();
      setDevices(inputDevices);
      setStatus(`Moteur actif · ${inputDevices.length} entrée(s)`);
      if (permissionError) {
        setError(permissionError instanceof Error ? permissionError.message : 'Autorisation du microphone non accordée.');
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Impossible de récupérer les entrées audio.');
    }
  };

  const activateEngine = async () => {
    if (engineRef.current) return;
    setError('');
    setStatus('Initialisation du moteur audio…');
    let engine: AudioEngine | null = null;
    try {
      engine = new AudioEngine({ channelCount: CHANNEL_COUNT });
      await engine.resume();
      engineRef.current = engine;
      onProgramStreamChange?.(engine.getProgramStream());
      setChannels(engine.getAllChannelSnapshots());
      setEngineReady(true);
      await refreshInputDevices();
    } catch (cause) {
      if (engine) await engine.dispose();
      engineRef.current = null;
      onProgramStreamChange?.(null);
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
    if (mediaChannelsRef.current.has(channelId)) {
      setError(`CH ${channelId} est réservé à MEDIA. Déconnectez MEDIA avant d’utiliser cette tranche.`);
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

  const connectMultichannelDevice = async () => {
    const engine = engineRef.current;
    if (!engine) {
      setError('Démarrez d’abord le moteur audio.');
      return;
    }
    if (!multiChannelDevice) {
      setError('Sélectionnez une interface USB multicanale.');
      return;
    }

    const channelIds = Array.from({ length: multiChannelCount }, (_, index) => multiChannelStart + index);
    if (channelIds.some((channelId) => streamsRef.current.has(channelId) || mediaChannelsRef.current.has(channelId))) {
      setError('Une ou plusieurs tranches choisies sont déjà occupées. Libérez-les avant le raccordement USB.');
      return;
    }

    setBusyChannel(multiChannelStart);
    setError('');
    let stream: MediaStream | null = null;
    try {
      stream = await engine.requestInputStream(multiChannelDevice, multiChannelCount);
      const actualCount = engine.connectMultichannelInput(multiChannelStart, stream, multiChannelCount);
      const connectedIds = channelIds.slice(0, actualCount);
      connectedIds.forEach((channelId) => streamsRef.current.set(channelId, stream!));
      setMultiChannelGroup({ stream, channelIds: connectedIds });
      refreshMeters();
      setStatus(`USB multicanal connecté · CH ${multiChannelStart} à CH ${multiChannelStart + actualCount - 1} · ${actualCount} canal(aux)`);
      if (actualCount < multiChannelCount) {
        // Many phone microphones and default Android routes expose one mono channel.
        // Keep the successfully connected input and reflect the real device capability.
        setMultiChannelCount(actualCount);
        setStatus(`USB connecté · ${actualCount} canal(aux) réellement disponible(s) (sur ${multiChannelCount} demandé(s))`);
      }
    } catch (cause) {
      stream?.getTracks().forEach((track) => track.stop());
      setError(cause instanceof Error ? cause.message : 'Connexion USB multicanale impossible.');
    } finally {
      setBusyChannel(null);
    }
  };

  const disconnectMultichannelDevice = () => {
    const engine = engineRef.current;
    if (!engine || !multiChannelGroup) return;
    multiChannelGroup.channelIds.forEach((channelId) => {
      engine.disconnectInput(channelId);
      streamsRef.current.delete(channelId);
    });
    multiChannelGroup.stream.getTracks().forEach((track) => track.stop());
    setMultiChannelGroup(null);
    refreshMeters();
    setStatus('Interface USB multicanale déconnectée');
  };

  const disconnectChannel = (channelId: number) => {
    const engine = engineRef.current;
    if (!engine) return;
    if (mediaChannelsRef.current.has(channelId)) {
      setError('Cette tranche est utilisée par MEDIA. Déconnectez-la depuis le panneau MEDIA.');
      return;
    }
    if (multiChannelGroup?.channelIds.includes(channelId)) {
      setError('Cette tranche appartient au groupe USB. Utilisez le bouton de déconnexion du groupe.');
      return;
    }
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

  const updateMasterGain = (value: number) => {
    engineRef.current?.setMasterGain(value);
    setMasterGain(value);
    refreshMeters();
  };

  return (
    <div className={open ? 'fixed inset-0 z-[120] flex items-center justify-center bg-black/90 p-2' : 'hidden'}>
      <section className="flex h-full max-h-full w-full max-w-[1500px] flex-col overflow-hidden rounded-xl border border-slate-700 bg-slate-900 shadow-2xl">
        <header className="flex shrink-0 items-center justify-between border-b border-slate-700 bg-slate-950 px-3 py-2">
          <div>
            <h2 className="text-sm font-black tracking-wider text-amber-400">MIXEUR AUDIO</h2>
            <p className="text-[10px] text-slate-400">{status}</p>
          </div>
          <div className="flex items-center gap-2">
            {!engineReady ? (
              <button onClick={() => void activateEngine()} className="rounded bg-emerald-700 px-3 py-2 text-[10px] font-bold text-white">
                ACTIVER LE MOTEUR
              </button>
            ) : (
              <button onClick={() => void refreshInputDevices()} className="rounded bg-slate-700 px-3 py-2 text-[10px] font-bold text-white">
                ACTUALISER ENTRÉES
              </button>
            )}
            <button onClick={onClose} className="min-h-10 min-w-10 rounded bg-slate-800 px-3 text-lg text-white" aria-label="Fermer le mixeur">×</button>
          </div>
        </header>

        {error && <div role="alert" className="border-b border-red-900 bg-red-950/70 px-3 py-2 text-[10px] text-red-200">{error}</div>}

        <AudioNetworkPanel engine={engineRef.current} enabled={engineReady} />

        <details className="shrink-0 border-b border-slate-700 bg-slate-800/70 px-3 py-2"><summary className="cursor-pointer list-none text-[10px] font-bold text-slate-200">ENTRÉE USB {multiChannelGroup ? "· CONNECTÉE" : "· CONFIGURATION"}</summary><div className="grid grid-cols-[1.4fr_0.7fr_0.7fr_auto] items-end gap-2 pt-2">
          <label className="min-w-0 space-y-1 text-[9px] text-slate-400">
            <span>INTERFACE USB MULTICANALE</span>
            <select
              aria-label="Interface USB multicanale"
              value={multiChannelDevice}
              onChange={(event) => setMultiChannelDevice(event.target.value)}
              disabled={!engineReady || !!multiChannelGroup}
              className="h-9 w-full min-w-0 rounded border border-slate-600 bg-slate-950 px-2 text-[10px] text-white"
            >
              <option value="">Choisir une interface…</option>
              {devices.map((device) => <option key={device.deviceId} value={device.deviceId}>{device.label}</option>)}
            </select>
          </label>
          <label className="space-y-1 text-[9px] text-slate-400">
            <span>PREMIÈRE TRANCHE</span>
            <select
              value={multiChannelStart}
              onChange={(event) => {
                const nextStart = Number(event.target.value);
                setMultiChannelStart(nextStart);
                setMultiChannelCount((current) => Math.min(current, CHANNEL_COUNT - nextStart + 1));
              }}
              disabled={!engineReady || !!multiChannelGroup}
              className="h-9 w-full rounded border border-slate-600 bg-slate-950 px-2 text-[10px] text-white"
            >
              {Array.from({ length: CHANNEL_COUNT }, (_, index) => index + 1).map((value) => <option key={value} value={value}>CH {value}</option>)}
            </select>
          </label>
          <label className="space-y-1 text-[9px] text-slate-400">
            <span>NOMBRE DE CANAUX</span>
            <select
              value={multiChannelCount}
              onChange={(event) => setMultiChannelCount(Number(event.target.value))}
              disabled={!engineReady || !!multiChannelGroup}
              className="h-9 w-full rounded border border-slate-600 bg-slate-950 px-2 text-[10px] text-white"
            >
              {Array.from({ length: CHANNEL_COUNT - multiChannelStart + 1 }, (_, index) => index + 1).map((value) => <option key={value} value={value}>{value} {value === 1 ? 'canal' : 'canaux'}</option>)}
            </select>
          </label>
          {multiChannelGroup ? (
            <button onClick={disconnectMultichannelDevice} className="h-9 rounded bg-red-800 px-3 text-[9px] font-bold text-white">DÉCONNECTER USB</button>
          ) : (
            <button
              onClick={() => void connectMultichannelDevice()}
              disabled={!engineReady || !multiChannelDevice || busyChannel !== null}
              className="h-9 rounded bg-amber-700 px-3 text-[9px] font-bold text-white disabled:opacity-40"
            >
              {busyChannel === multiChannelStart ? 'CONNEXION…' : 'CONNECTER USB'}
            </button>
          )}
        </div></details>

        <div className="grid min-h-0 flex-1 grid-cols-8 gap-1 overflow-x-auto overflow-y-auto p-2">
          {Array.from({ length: CHANNEL_COUNT }, (_, index) => index + 1).map((channelId) => {
            const channel = channels.find((item) => item.id === channelId);
            const isMediaChannel = mediaChannelsRef.current.has(channelId);
            const connected = streamsRef.current.has(channelId) || isMediaChannel;
            const belongsToUsbGroup = multiChannelGroup?.channelIds.includes(channelId) ?? false;
            return (
              <article key={channelId} className="grid min-w-0 grid-cols-[minmax(0,1fr)_12px] items-stretch gap-1 rounded-lg border border-slate-700 bg-slate-800/80 p-2">
                <div className="flex min-w-0 flex-col gap-2">
                <div className="flex items-center justify-between gap-1">
                  <strong className="text-xs text-white">{channel?.name || `CH ${channelId}`}</strong>
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
                  isMediaChannel ? (
                    <div className="rounded bg-sky-900/70 px-1 py-2 text-center text-[9px] font-bold text-sky-200">MEDIA · PLAYER</div>
                  ) : belongsToUsbGroup ? (
                    <div className="rounded bg-amber-900/70 px-1 py-2 text-center text-[9px] font-bold text-amber-200">USB · CH {multiChannelGroup?.channelIds.indexOf(channelId)! + 1}</div>
                  ) : (
                    <button onClick={() => disconnectChannel(channelId)} className="rounded bg-red-800 px-1 py-2 text-[9px] font-bold text-white">DÉCONNECTER</button>
                  )
                ) : (
                  <button
                    onClick={() => void connectChannel(channelId)}
                    disabled={!engineReady || busyChannel !== null}
                    className="rounded bg-emerald-800 px-1 py-2 text-[9px] font-bold text-white disabled:opacity-40"
                  >
                    {busyChannel === channelId ? 'CONNEXION…' : 'CONNECTER'}
                  </button>
                )}

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
                </div>
                <VerticalMeter reading={channel?.meter || { rmsDb: Number.NEGATIVE_INFINITY, peakDb: Number.NEGATIVE_INFINITY }} />
              </article>
            );
          })}
        </div>

        <footer className="grid shrink-0 grid-cols-[1fr_auto] items-center gap-3 border-t border-slate-700 bg-slate-950 px-3 py-2">
          <div className="min-w-0">
            <div className="mb-1 flex items-center justify-between text-[10px]">
              <strong className="text-amber-300">PGM · STÉRÉO L/R</strong>
              <span className="text-slate-400">MASTER · {formatDb(masterMeter.rmsDb)}</span>
            </div>
            <Meter reading={masterMeter} />
            <label className="mt-2 flex max-w-sm items-center gap-2 text-[9px] text-slate-400">
              <span className="shrink-0">MASTER {Math.round(masterGain * 100)}%</span>
              <input
                aria-label="Gain master PGM"
                type="range"
                min="0"
                max="2"
                step="0.01"
                value={masterGain}
                disabled={!engineReady}
                onChange={(event) => updateMasterGain(Number(event.target.value))}
                className="w-full accent-amber-400"
              />
            </label>
          </div>

        </footer>
      </section>
    </div>
  );
}
