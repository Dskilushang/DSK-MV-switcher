import { useEffect, useRef, useState } from 'react';
import { AudioEngine } from './audio/AudioEngine';
import {
  AudioLanTransport,
  createAudioTransportStreams,
  type AudioTransportStatus
} from './audio/AudioLanTransport';

type Props = {
  engine: AudioEngine | null;
  enabled: boolean;
};

const STREAM_LABELS = [
  ['pgm', 'PGM stéréo L/R'],
  ...Array.from({ length: 8 }, (_, index) => [`iso-${index + 1}`, `ISO ${index + 1}`])
] as const;

export default function AudioNetworkPanel({ engine, enabled }: Props) {
  const transportRef = useRef<AudioLanTransport | null>(null);
  const [host, setHost] = useState('');
  const [port, setPort] = useState('8765');
  const [token, setToken] = useState('');
  const [statuses, setStatuses] = useState<Record<string, AudioTransportStatus['state']>>({});
  const [messages, setMessages] = useState<string[]>([]);
  const [tapPoint, setTapPoint] = useState<'pre-fader' | 'post-fader'>('post-fader');
  const [connecting, setConnecting] = useState(false);

  useEffect(() => {
    return () => {
      void transportRef.current?.disconnect();
      transportRef.current = null;
    };
  }, []);

  const connect = async () => {
    if (!engine) {
      setMessages(['Activez d’abord le moteur audio.']);
      return;
    }
    setConnecting(true);
    setMessages([]);
    setStatuses({});

    const transport = new AudioLanTransport((status) => {
      setStatuses((current) => ({ ...current, [status.streamId]: status.state }));
      if (status.state === 'error' && 'message' in status) {
        setMessages((current) => [...current, `${status.streamId.toUpperCase()} : ${status.message}`]);
      }
    });
    transportRef.current = transport;

    try {
      const parsedPort = Number(port);
      const streams = createAudioTransportStreams(
        engine.getProgramStream(),
        (channelId, point) => engine.getChannelOutput(channelId, point).stream,
        tapPoint
      );
      await transport.connect(host, parsedPort, token, streams);
      setMessages(['Négociation WebRTC lancée pour le PGM et les 8 pistes ISO.']);
    } catch (error) {
      await transport.disconnect();
      transportRef.current = null;
      setMessages([error instanceof Error ? error.message : 'Connexion audio impossible.']);
    } finally {
      setConnecting(false);
    }
  };

  const disconnect = async () => {
    await transportRef.current?.disconnect();
    transportRef.current = null;
    setStatuses({});
    setMessages(['Transport audio arrêté.']);
  };

  const activeCount = Object.values(statuses).filter((status) => status === 'connected').length;
  const isConnected = activeCount > 0 || Object.keys(statuses).length > 0;

  return (
    <details className="shrink-0 border-b border-slate-700 bg-slate-900/90 px-3 py-2"><summary className="cursor-pointer list-none text-[10px] font-bold text-sky-300">LIAISON PC / OBS · {activeCount}/9 flux</summary><div className="max-h-[32vh] space-y-2 overflow-y-auto overscroll-contain pt-3">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-[1fr_1fr_90px_auto]">
        <label className="min-w-0 space-y-1 text-[9px] text-slate-400">
          <span>IP DU PC DSK AUDIO RECEIVER</span>
          <input value={host} onChange={(event) => setHost(event.target.value)} disabled={isConnected || connecting} placeholder="192.168.1.100" className="h-9 w-full rounded border border-slate-600 bg-slate-950 px-2 text-xs text-white" />
        </label>
        <label className="space-y-1 text-[9px] text-slate-400">
          <span>PORT</span>
          <input value={port} onChange={(event) => setPort(event.target.value)} disabled={isConnected || connecting} inputMode="numeric" className="h-9 w-full rounded border border-slate-600 bg-slate-950 px-2 text-xs text-white" />
        </label>
        <label className="min-w-0 space-y-1 text-[9px] text-slate-400">
          <span>CODE D’ASSOCIATION</span>
          <input type="password" autoComplete="off" value={token} onChange={(event) => setToken(event.target.value)} disabled={isConnected || connecting} placeholder="Code affiché sur le PC" className="h-9 w-full rounded border border-slate-600 bg-slate-950 px-2 text-xs text-white" />
        </label>

        {isConnected ? (
          <button onClick={() => void disconnect()} className="self-end rounded bg-red-800 px-3 py-2 text-[9px] font-bold text-white">ARRÊTER</button>
        ) : (
          <button onClick={() => void connect()} disabled={!enabled || connecting || !host.trim() || token.trim().length < 16} className="self-end rounded bg-sky-700 px-3 py-2 text-[9px] font-bold text-white disabled:opacity-40">{connecting ? 'LANCEMENT…' : 'CONNECTER'}</button>
        )}
      </div>

      <div className="flex items-center gap-3 text-[9px] text-slate-400">
        <span>ISO :</span>
        <label className="flex items-center gap-1">
          <input type="radio" checked={tapPoint === 'post-fader'} onChange={() => setTapPoint('post-fader')} disabled={isConnected} />
          Post-fader
        </label>
        <label className="flex items-center gap-1">
          <input type="radio" checked={tapPoint === 'pre-fader'} onChange={() => setTapPoint('pre-fader')} disabled={isConnected} />
          Pré-fader
        </label>
      </div>

      <div className="grid grid-cols-3 gap-1 sm:grid-cols-5">
        {STREAM_LABELS.map(([id, label]) => {
          const status = statuses[id];
          return (
            <div key={id} className="flex items-center gap-1 rounded bg-slate-800 px-2 py-1.5 text-[9px]">
              <span className={`h-2 w-2 shrink-0 rounded-full ${status === 'connected' ? 'bg-emerald-400' : status === 'error' ? 'bg-red-400' : 'bg-slate-600'}`} />
              <span className="truncate text-slate-200">{label}</span>
            </div>
          );
        })}
      </div>

      {messages.map((message, index) => <p key={index} role="status" className="text-[9px] text-amber-200">{message}</p>)}
      <details className="text-[9px] text-slate-500"><summary className="cursor-pointer">Aide à la connexion</summary><p className="pt-2">Le PC doit exécuter DSK Audio Receiver. Récupérez son code d’association sur sa page locale. Chaque destination OBS reçoit un flux audio distinct.</p></details>
    </div></details>
  );
}
