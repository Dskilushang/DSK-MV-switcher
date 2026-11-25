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
  onConnectedInputsChange?: (count: number) => void;
  onMediaAudioRouteReady?: (route: MediaAudioRoute | null) => void;
  cameraAudioStreams?: Record<number, MediaStream | null>;
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

type RotaryKnobProps = {
  label: string; value: number; min: number; max: number; step?: number;
  defaultValue: number; disabled?: boolean; colorClass?: string;
  formatValue: (value: number) => string; onChange: (value: number) => void;
};

/** Rotary control operated by touch, mouse drag, wheel and keyboard. */
function RotaryKnob({
  label, value, min, max, step = 0.01, defaultValue, disabled = false,
  colorClass = 'text-sky-400', formatValue, onChange
}: RotaryKnobProps) {
  const dragY = useRef<number | null>(null);
  const normalized = Math.max(0, Math.min(1, (value - min) / (max - min)));
  const angle = -135 + normalized * 270;
  const adjust = (next: number) => {
    const precision = Math.max(0, (String(step).split('.')[1] || '').length);
    const bounded = Math.max(min, Math.min(max, next));
    onChange(Number((Math.round((bounded - min) / step) * step + min).toFixed(precision)));
  };

  return (
    <div className="flex min-w-0 flex-col items-center gap-0.5 select-none">
      <span className="text-[9px] font-bold tracking-wide text-slate-300">{label}</span>
      <div
        role="slider" tabIndex={disabled ? -1 : 0} aria-label={label}
        aria-valuemin={min} aria-valuemax={max} aria-valuenow={value}
        aria-valuetext={formatValue(value)} aria-disabled={disabled}
        onPointerDown={(event) => {
          if (disabled) return;
          event.preventDefault();
          event.currentTarget.setPointerCapture(event.pointerId);
          dragY.current = event.clientY;
        }}
        onPointerMove={(event) => {
          if (disabled || dragY.current === null) return;
          const delta = dragY.current - event.clientY;
          dragY.current = event.clientY;
          if (delta !== 0) adjust(value + delta * ((max - min) / 180));
        }}
        onPointerUp={() => { dragY.current = null; }}
        onPointerCancel={() => { dragY.current = null; }}
        onWheel={(event) => {
          if (disabled) return;
          event.preventDefault();
          adjust(value + (event.deltaY < 0 ? step : -step) * 5);
        }}
        onKeyDown={(event) => {
          if (disabled) return;
          if (event.key === 'ArrowUp' || event.key === 'ArrowRight') { event.preventDefault(); adjust(value + step); }
          if (event.key === 'ArrowDown' || event.key === 'ArrowLeft') { event.preventDefault(); adjust(value - step); }
          if (event.key === 'Home') { event.preventDefault(); adjust(min); }
          if (event.key === 'End') { event.preventDefault(); adjust(max); }
        }}
        onDoubleClick={() => { if (!disabled) onChange(defaultValue); }}
        title="Glisser verticalement · molette · double-clic pour réinitialiser"
        className={`relative flex h-10 w-10 touch-none items-center justify-center rounded-full border-2 border-slate-600 bg-gradient-to-br from-slate-500 via-slate-800 to-black shadow-[inset_0_2px_5px_rgba(255,255,255,0.18),0_3px_6px_rgba(0,0,0,0.55)] outline-none focus-visible:ring-2 focus-visible:ring-amber-400 ${disabled ? 'cursor-not-allowed opacity-40' : 'cursor-ns-resize'}`}
      >
        <svg viewBox="0 0 48 48" className="h-full w-full" aria-hidden="true">
          <circle cx="24" cy="24" r="17.5" fill="#171d26" stroke="#64748b" strokeWidth="1.2" />
          <circle cx="24" cy="24" r="13.5" fill="#303946" stroke="#0b1018" strokeWidth="1" />
          <g transform={`rotate(${angle} 24 24)`}>
            <line x1="24" y1="24" x2="24" y2="8" stroke="currentColor" strokeWidth="3" strokeLinecap="round" className={colorClass} />
          </g>
          <circle cx="24" cy="24" r="3" fill="#94a3b8" />
        </svg>
      </div>
      <span className="text-[9px] font-semibold tabular-nums text-white">{formatValue(value)}</span>
    </div>
  );
}

export default function AudioMixerPanel({ open, onClose, onProgramStreamChange, onConnectedInputsChange, onMediaAudioRouteReady, cameraAudioStreams }: AudioMixerPanelProps) {
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
  const silentMeter: AudioMeterReading = { rmsDb: Number.NEGATIVE_INFINITY, peakDb: Number.NEGATIVE_INFINITY };
  const [masterStereoMeters, setMasterStereoMeters] = useState<{ left: AudioMeterReading; right: AudioMeterReading }>({ left: silentMeter, right: silentMeter });
  const [masterGain, setMasterGain] = useState(1);
  const [localMonitorGain, setLocalMonitorGain] = useState(0.8);
  const [localMonitorMuted, setLocalMonitorMuted] = useState(false);
  const [busyChannel, setBusyChannel] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('Moteur audio arrêté');

  const refreshMeters = useCallback(() => {
    const engine = engineRef.current;
    if (!engine) return;
    try {
      setChannels(engine.getAllChannelSnapshots());
      setMasterStereoMeters(engine.getMasterStereoMeters());
      onConnectedInputsChange?.(engine.getConnectedChannelCount());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Lecture des niveaux audio impossible.');
    }
  }, [onConnectedInputsChange]);

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
      onConnectedInputsChange?.(0);
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
      const cameraMatch = /^__camera_audio_(\d+)__$/.exec(deviceId);
      const cameraId = cameraMatch ? Number(cameraMatch[1]) : null;
      const cameraSource = cameraId === null ? null : cameraAudioStreams?.[cameraId];
      const stream = cameraId !== null
        ? new MediaStream((cameraSource?.getAudioTracks() || []).filter((track) => track.readyState === 'live').map((track) => track.clone()))
        : await engine.requestInputStream(deviceId);
      if (stream.getAudioTracks().length === 0) {
        stream.getTracks().forEach((track) => track.stop());
        throw new Error('Aucune piste microphone active. Réactivez CAM1 et autorisez le microphone Android.');
      }
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

  const updateLocalMonitorGain = (value: number) => {
    engineRef.current?.setLocalMonitorGain(value);
    setLocalMonitorGain(value);
  };

  const toggleLocalMonitorMute = () => {
    const nextMuted = !localMonitorMuted;
    engineRef.current?.setLocalMonitorMuted(nextMuted);
    if (!nextMuted) engineRef.current?.setLocalMonitorGain(localMonitorGain);
    setLocalMonitorMuted(nextMuted);
  };

  return (
    <div className={open ? 'fixed inset-0 z-[120] flex items-center justify-center bg-black/90 p-1 sm:p-2' : 'hidden'}>
      <section className="flex h-[calc(100dvh-0.5rem)] max-h-[calc(100dvh-0.5rem)] w-full max-w-[1500px] flex-col overflow-hidden rounded-xl border border-slate-700 bg-slate-900 shadow-2xl">
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

        <details className="shrink-0 border-b border-slate-700 bg-slate-800/70 px-3 py-2"><summary className="cursor-pointer list-none text-[10px] font-bold text-slate-200">ENTRÉE USB {multiChannelGroup ? "· CONNECTÉE" : "· CONFIGURATION"}</summary><div className="grid grid-cols-2 items-end gap-2 pt-2 sm:grid-cols-[1.4fr_0.7fr_0.7fr_auto]">
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

        <div className="min-h-0 flex-1 overflow-auto overscroll-contain p-2">
          <div className="flex h-full min-h-[260px] min-w-max items-stretch gap-1.5 pb-1">
          {Array.from({ length: CHANNEL_COUNT }, (_, index) => index + 1).map((channelId) => {
            const channel = channels.find((item) => item.id === channelId);
            const isMediaChannel = mediaChannelsRef.current.has(channelId);
            const connected = streamsRef.current.has(channelId) || isMediaChannel;
            const belongsToUsbGroup = multiChannelGroup?.channelIds.includes(channelId) ?? false;
            return (
              <article key={channelId} className="grid h-full w-[148px] shrink-0 grid-cols-[minmax(0,1fr)_10px] items-stretch gap-1.5 rounded-xl border border-slate-700 bg-gradient-to-b from-slate-800 to-slate-900 p-2 shadow-lg">
                <div className="flex min-w-0 flex-col gap-1.5">
                <div className="flex items-center justify-between gap-1">
                  <strong className="text-xs text-white">{channel?.name || `CH ${channelId}`}</strong>
                  <span className={`h-2 w-2 rounded-full ${connected ? 'bg-emerald-400' : 'bg-slate-600'}`} />
                </div>

                <select
                  aria-label={`Entrée audio du canal ${channelId}`}
                  value={selectedDevices[channelId] || ''}
                  onChange={(event) => setSelectedDevices((current) => ({ ...current, [channelId]: event.target.value }))}
                  disabled={!engineReady || connected}
                  className="h-8 w-full min-w-0 rounded-md border border-slate-600 bg-slate-950 px-1.5 text-[9px] text-white disabled:opacity-50"
                >
                  <option value="">Entrée audio…</option>
                  {Object.entries(cameraAudioStreams || {}).map(([id, stream]) => stream?.getAudioTracks().some((track) => track.readyState === 'live') ? <option key={`camera-audio-${id}`} value={`__camera_audio_${id}__`}>CAM {id} · MICRO</option> : null)}
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
                    <button onClick={() => disconnectChannel(channelId)} className="min-h-8 w-full whitespace-normal rounded-md bg-red-800 px-1.5 py-1.5 text-center text-[9px] font-bold leading-tight text-white">DÉCONNECTER</button>
                  )
                ) : (
                  <button
                    onClick={() => void connectChannel(channelId)}
                    disabled={!engineReady || busyChannel !== null}
                    className="min-h-8 w-full whitespace-normal rounded-md bg-emerald-800 px-1.5 py-1.5 text-center text-[9px] font-bold leading-tight text-white disabled:opacity-40"
                  >
                    {busyChannel === channelId ? 'CONNEXION…' : 'CONNECTER'}
                  </button>
                )}

                <div className="grid min-h-[92px] grid-cols-2 items-center gap-0.5 rounded-lg border border-slate-700/80 bg-slate-950/70 px-1.5 py-1.5">
                  <RotaryKnob
                    label="GAIN" value={channel?.gain ?? 1} min={0} max={2} step={0.01}
                    defaultValue={1} disabled={!engineReady} colorClass="text-rose-400"
                    formatValue={(value) => `${Math.round(value * 100)}%`}
                    onChange={(value) => updateGain(channelId, value)}
                  />
                  <RotaryKnob
                    label="PAN" value={channel?.pan ?? 0} min={-1} max={1} step={0.01}
                    defaultValue={0} disabled={!engineReady} colorClass="text-sky-400"
                    formatValue={(value) => value < -0.02 ? `L ${Math.round(Math.abs(value) * 100)}` : value > 0.02 ? `R ${Math.round(value * 100)}` : 'CENTRE'}
                    onChange={(value) => updatePan(channelId, value)}
                  />
                </div>



                <button
                  onClick={() => toggleMute(channelId, !(channel?.muted ?? false))}
                  disabled={!engineReady}
                  className={`rounded px-2 py-1.5 text-[9px] font-black disabled:opacity-40 ${channel?.muted ? 'bg-red-600 text-white' : 'bg-slate-700 text-slate-200'}`}
                >
                  {channel?.muted ? 'MUTED' : 'MUTE'}
                </button>
                </div>
                <VerticalMeter reading={channel?.meter || { rmsDb: Number.NEGATIVE_INFINITY, peakDb: Number.NEGATIVE_INFINITY }} />
              </article>
            );
          })}

            <aside className="flex h-full w-[148px] shrink-0 flex-col items-center gap-2 rounded-xl border border-amber-400/70 bg-gradient-to-b from-amber-950/40 to-slate-950 p-2 shadow-[0_0_18px_rgba(245,158,11,0.10)]">
              <div className="w-full text-center">
                <strong className="block text-xs font-black tracking-wide text-amber-300">PGM MASTER</strong>
                <span className="text-[10px] tabular-nums text-slate-400">L {formatDb(masterStereoMeters.left.rmsDb)} · R {formatDb(masterStereoMeters.right.rmsDb)}</span>
              </div>
              <div className="flex min-h-0 flex-1 items-center justify-center gap-3">
                <div className="flex h-full items-end gap-1.5">
                  {([
                    ['L', masterStereoMeters.left],
                    ['R', masterStereoMeters.right]
                  ] as const).map(([side, reading]) => (
                    <div key={side} className="flex h-full items-center gap-1">
                      <span className="text-[9px] font-bold text-slate-400">{side}</span>
                      <div className="flex h-full max-h-64 w-4 flex-col justify-end overflow-hidden rounded border border-slate-700 bg-black p-0.5" role="meter" aria-label={`Niveau PGM ${side} : RMS ${formatDb(reading.rmsDb)}, peak ${formatDb(reading.peakDb)}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={meterWidth(reading.rmsDb)}>
                        <div className="w-full rounded-sm bg-emerald-500 transition-[height] duration-100" style={{ height: `${meterWidth(reading.rmsDb)}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
                <label className="flex h-full flex-col items-center justify-center gap-2 text-[9px] font-bold text-slate-300">
                  <span className="text-amber-300">{Math.round(masterGain * 100)}%</span>
                  <input
                    aria-label="Fader vertical PGM master"
                    type="range"
                    min="0"
                    max="2"
                    step="0.01"
                    value={masterGain}
                    disabled={!engineReady}
                    onChange={(event) => updateMasterGain(Number(event.target.value))}
                    className="h-36 w-8 accent-amber-400"
                    style={{ writingMode: 'vertical-lr', direction: 'rtl' }}
                  />
                  <span>MASTER</span>
                </label>
              </div>
              <span className="text-[9px] text-slate-500">SORTIE PGM</span>
            </aside>

            <aside className="flex h-full w-[148px] shrink-0 flex-col items-center justify-between gap-2 rounded-xl border border-sky-500/60 bg-gradient-to-b from-sky-950/40 to-slate-950 p-2 shadow-lg">
              <div className="w-full text-center">
                <strong className="block text-xs font-black tracking-wide text-sky-300">MONITOR LOCAL</strong>
                <span className="text-[9px] text-slate-400">TÉLÉPHONE / CASQUE</span>
              </div>
              <label className="flex flex-1 flex-col items-center justify-center gap-2 text-[9px] font-bold text-slate-300">
                <span className="text-sky-300">{Math.round(localMonitorGain * 100)}%</span>
                <input aria-label="Volume écoute locale" type="range" min="0" max="2" step="0.01" value={localMonitorGain} disabled={!engineReady || localMonitorMuted} onChange={(event) => updateLocalMonitorGain(Number(event.target.value))} className="h-36 w-8 accent-sky-400" style={{ writingMode: 'vertical-lr', direction: 'rtl' }} />
                <span>VOLUME</span>
              </label>
              <button onClick={toggleLocalMonitorMute} disabled={!engineReady} className={`w-full rounded px-2 py-2 text-[9px] font-black disabled:opacity-40 ${localMonitorMuted ? 'bg-red-600 text-white' : 'bg-slate-700 text-slate-200'}`}>{localMonitorMuted ? 'ÉCOUTE MUTE' : 'MUTE ÉCOUTE'}</button>
              <span className="text-center text-[8px] text-slate-500">Le PGM reste indépendant</span>
            </aside>
          </div>
        </div>

      </section>
    </div>
  );
}
