import { useEffect, useState } from 'react';
import { StatusBar } from './components/statutbar';
import { CameraGrid } from './components/cameragrid';
import { TransitionControls } from './components/transitioncontroles';
  import {
  connectObs,
  registerCallbacks,
  setProgramScene,
  getSceneList,
  ObsStatus,
} from './services/obsService';
import { Settings } from 'lucide-react';

export default function App() {
  const [status, setStatus] = useState<ObsStatus>('disconnected');
  const [programChannel, setProgramChannel] = useState(-1);
  const [previewChannel, setPreviewChannel] = useState(-1);
  const [programScene, setProgramScene] = useState('');
  const [scenes, setScenes] = useState<string[]>([]);
  const [showSettings, setShowSettings] = useState(true);

  const [host, setHost] = useState('192.168.1.50');
  const [port, setPort] = useState('4455');
  const [password, setPassword] = useState('');

  useEffect(() => {
    registerCallbacks(
      (st, msg) => {
        setStatus(st);
        if (msg) console.log('OBS:', msg);
      },
      (sceneName) => {
        setProgramScene(sceneName);
        const match = sceneName.match(/Camera\s*(\d+)/i);
        if (match) {
          setProgramChannel(parseInt(match[1], 10));
        }
      }
    );
  }, []);

  const handleConnect = async () => {
    const ok = await connectObs({
      host,
      port: parseInt(port, 10),
      password,
    });
    if (ok) {
      const list = await getSceneList();
      setScenes(list);
      setShowSettings(false);
    }
  };

  const handleSelect = (channel: number) => {
    setPreviewChannel(channel);
  };

  const handleCut = async (channel?: number) => {
    const target = channel ?? previewChannel;
    if (target === -1) return;

    const sceneName = `Camera ${target}`;
    try {
      await setProgramScene(sceneName);
      setProgramChannel(target);
      setPreviewChannel(-1);
    } catch (err) {
      console.error(err);
    }
  };

  const handleAuto = async () => {
    await handleCut();
  };

  if (showSettings) {
    return (
      <div className="min-h-screen bg-slate-950 text-white p-6 flex flex-col justify-center">
        <div className="max-w-md mx-auto w-full">
          <h1 className="text-2xl font-bold mb-2 text-center">
            DSK R8 — OBS Switcher
          </h1>
          <p className="text-slate-400 text-sm text-center mb-8">
            Connexion au serveur OBS WebSocket
          </p>

          <div className="space-y-4">
            <div>
              <label className="block text-xs uppercase text-slate-500 mb-1">
                Adresse IP du PC
              </label>
              <input
                type="text"
                value={host}
                onChange={(e) => setHost(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs uppercase text-slate-500 mb-1">
                Port
              </label>
              <input
                type="text"
                value={port}
                onChange={(e) => setPort(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs uppercase text-slate-500 mb-1">
                Mot de passe OBS
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Laisser vide si non configuré"
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-blue-500"
              />
            </div>

            <button
              onClick={handleConnect}
              disabled={status === 'connecting'}
              className="w-full bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 py-4 rounded-lg font-bold transition-all active:scale-95 mt-4"
            >
              {status === 'connecting' ? 'Connexion...' : 'Se connecter'}
            </button>

            {status === 'error' && (
              <p className="text-red-400 text-sm text-center">
                Impossible de se connecter. Vérifiez l'IP, le port et le mot de passe.
              </p>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white flex flex-col">
      <StatusBar status={status} programScene={programScene} />

      <div className="flex-1 flex flex-col justify-center gap-4 py-4">
        <CameraGrid
          programChannel={programChannel}
          previewChannel={previewChannel}
          onSelect={handleSelect}
          onCut={handleCut}
        />

        <TransitionControls
          onCut={() => handleCut()}
          onAuto={handleAuto}
          disabled={previewChannel === -1}
        />
      </div>

      <div className="px-4 py-2 bg-slate-900 border-t border-slate-800 flex justify-between items-center">
        <button
          onClick={() => setShowSettings(true)}
          className="text-slate-400 hover:text-white flex items-center gap-1 text-xs"
        >
          <Settings size={14} /> Paramètres
        </button>
        <span className="text-xs text-slate-600">
          {scenes.length} scènes détectées
        </span>
      </div>
    </div>
  );
}
