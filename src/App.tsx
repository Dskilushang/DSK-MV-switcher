import React, { useState, useEffect } from 'react';
import OBSWebSocket from 'obs-websocket-js';
import { Wifi, WifiOff, Tv, Volume2 } from 'lucide-react';

const obs = new OBSWebSocket();

export default function App() {
  const [isConnected, setIsConnected] = useState(false);
  const [serverIP, setServerIP] = useState('192.168.1.50:4455');
  const [password, setPassword] = useState('');
  const [currentScene, setCurrentScene] = useState('');
  const [scenes, setScenes] = useState<string[]>([]);

  // Fonction pour se connecter à OBS Studio
  const connectOBS = async () => {
    try {
      await obs.connect(`ws://${serverIP}`, password);
      setIsConnected(true);
      console.log('Connecté à OBS avec succès !');

      // Récupérer la liste des scènes au démarrage
      const response = await obs.call('GetSceneList');
      setScenes(response.scenes.map((s: any) => s.sceneName));
      setCurrentScene(response.currentProgramSceneName);

      // Écouter les changements de scène en direct depuis OBS
      obs.on('CurrentProgramSceneChanged', (data) => {
        setCurrentScene(data.sceneName);
      });

    } catch (error) {
      console.error('Erreur de connexion OBS :', error);
      alert('Impossible de se connecter à OBS. Vérifie l\'IP et le mot de passe.');
    }
  };

  // Fonction pour basculer de scène (Action PGM)
  const switchScene = async (sceneName: string) => {
    if (!isConnected) return;
    try {
      await obs.call('SetCurrentProgramScene', { sceneName });
    } catch (error) {
      console.error('Erreur lors du changement de scène :', error);
    }
  };

  return (
    <div className="flex flex-col h-screen bg-slate-950 text-white p-4">
      {/* Barre de statut et de connexion */}
      <div className="flex justify-between items-center bg-slate-900 p-3 rounded-xl border border-slate-800 mb-4">
        <div className="flex items-center space-x-2">
          {isConnected ? (
            <span className="flex items-center text-green-400 text-sm font-semibold">
              <Wifi className="w-5 h-5 mr-1" /> Connecté à OBS
            </span>
          ) : (
            <span className="flex items-center text-red-400 text-sm font-semibold">
              <WifiOff className="w-5 h-5 mr-1" /> Déconnecté
            </span>
          )}
        </div>

        {/* Champs de configuration rapide */}
        {!isConnected && (
          <div className="flex space-x-2">
            <input 
              type="text" 
              value={serverIP} 
              onChange={(e) => setServerIP(e.target.value)}
              placeholder="IP:Port (ex: 192.168.1.50:4455)"
              className="bg-slate-800 text-xs px-2 py-1 rounded border border-slate-700 text-white"
            />
            <input 
              type="password" 
              value={password} 
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Mot de passe OBS"
              className="bg-slate-800 text-xs px-2 py-1 rounded border border-slate-700 text-white"
            />
            <button 
              onClick={connectOBS}
              className="bg-blue-600 hover:bg-blue-500 text-xs px-3 py-1 rounded font-bold"
            >
              Connexion
            </button>
          </div>
        )}
      </div>

      {/* Grille des canaux / Scènes (Simulateur de mélangeur 8 canaux) */}
      <div className="grid grid-cols-4 gap-3 flex-1">
        {scenes.length > 0 ? (
          scenes.slice(0, 8).map((scene, index) => (
            <button
              key={scene}
              onClick={() => switchScene(scene)}
              className={`flex flex-col justify-between p-4 rounded-xl border-2 font-bold transition-all ${
                currentScene === scene 
                  ? 'bg-red-600 border-red-400 shadow-lg shadow-red-900/50' 
                  : 'bg-slate-900 border-slate-800 hover:bg-slate-800'
              }`}
            >
              <span className="text-xs text-slate-400">CH {index + 1}</span>
              <span className="text-lg truncate">{scene}</span>
              <span className="text-[10px] uppercase tracking-wider">{currentScene === scene ? 'PGM' : 'Prêt'}</span>
            </button>
          ))
        ) : (
          <div className="col-span-4 flex items-center justify-center text-slate-500 text-sm">
            {isConnected ? 'Chargement des scènes...' : 'Connecte-toi à OBS pour afficher les canaux.'}
          </div>
        )}
      </div>
    </div>
  );
    }
                
