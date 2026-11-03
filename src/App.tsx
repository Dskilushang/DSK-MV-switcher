import React, { useState, useEffect } from 'react';
import OBSWebSocket from 'obs-websocket-js';
import { Wifi, WifiOff, Volume2, Sliders, Type, Share2, Play } from 'lucide-react';

const obs = new OBSWebSocket();

export default function App() {
  const [isConnected, setIsConnected] = useState(false);
  const [serverIP, setServerIP] = useState('192.168.1.50:4455');
  const [password, setPassword] = useState('');
  const [currentScene, setCurrentScene] = useState('');
  const [scenes, setScenes] = useState<string[]>([]);
  
  // Monitoring Audio & Transitions
  const [audioLevel, setAudioLevel] = useState(65); // Niveau Vumètre simulé/lu
  const [selectedTransition, setSelectedTransition] = useState('Cut');

  // Lower Thirds / Titrage
  const [speakerName, setSpeakerName] = useState('MC Dany');
  const [speakerTitle, setSpeakerTitle] = useState('Artiste & Producteur');
  const [socialHandle, setSocialHandle] = useState('@DSKILUSHANG');
  const [isLowerThirdActive, setIsLowerThirdActive] = useState(false);

  // Connexion OBS
  const connectOBS = async () => {
    try {
      await obs.connect(`ws://${serverIP}`, password);
      setIsConnected(true);

      const response = await obs.call('GetSceneList');
      setScenes(response.scenes.map((s: any) => s.sceneName));
      setCurrentScene(response.currentProgramSceneName);

      obs.on('CurrentProgramSceneChanged', (data) => {
        setCurrentScene(data.sceneName);
      });
    } catch (error) {
      console.error('Erreur de connexion OBS :', error);
      alert('Impossible de se connecter à OBS. Vérifie l\'IP et le mot de passe.');
    }
  };

  // Basculer de scène
  const switchSceneByIndex = (index: number) => {
    if (scenes[index]) {
      obs.call('SetCurrentProgramScene', { sceneName: scenes[index] }).catch(console.error);
    }
  };

  // Déclencher le Lower Third (Titre/Réseaux)
  const toggleLowerThird = async () => {
    const newState = !isLowerThirdActive;
    setIsLowerThirdActive(newState);
    
    if (isConnected) {
      try {
        // Envoi des textes et bascule de la source texte sur OBS
        await obs.call('SetInputSettings', {
          inputName: 'LowerThird_Text',
          inputSettings: { text: `${speakerName}\n${speakerTitle}` }
        });
        await obs.call('SetInputSettings', {
          inputName: 'Social_Text',
          inputSettings: { text: socialHandle }
        });
        await obs.call('SetSceneItemEnabled', {
          sceneName: currentScene,
          sceneItemId: 1, // ID du calque Lower Third
          sceneItemEnabled: newState
        });
      } catch (err) {
        console.log('Mode démo / Source OBS non configurée');
      }
    }
  };

  return (
    <div className="flex flex-col h-screen bg-slate-950 text-white p-3 space-y-3 select-none">
      
      {/* 1. BARRE DE STATUT & CONNEXION */}
      <div className="flex justify-between items-center bg-slate-900 p-2.5 rounded-xl border border-slate-800">
        <div className="flex items-center space-x-3">
          {isConnected ? (
            <span className="flex items-center text-green-400 text-xs font-bold">
              <Wifi className="w-4 h-4 mr-1" /> EN DIRECT (OBS)
            </span>
          ) : (
            <span className="flex items-center text-red-400 text-xs font-bold">
              <WifiOff className="w-4 h-4 mr-1" /> HORS LIGNE
            </span>
          )}
        </div>

        {!isConnected && (
          <div className="flex space-x-2">
            <input 
              type="text" 
              value={serverIP} 
              onChange={(e) => setServerIP(e.target.value)}
              placeholder="IP:Port"
              className="bg-slate-800 text-xs px-2 py-1 rounded border border-slate-700 text-white w-32"
            />
            <input 
              type="password" 
              value={password} 
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Pass"
              className="bg-slate-800 text-xs px-2 py-1 rounded border border-slate-700 text-white w-24"
            />
            <button 
              onClick={connectOBS}
              className="bg-blue-600 hover:bg-blue-500 text-xs px-3 py-1 rounded font-bold"
            >
              Connecter
            </button>
          </div>
        )}
      </div>

      {/* 2. ZONE PRINCIPALE (GRILLE ET PANNEAUX) */}
      <div className="grid grid-cols-12 gap-3 flex-1 overflow-hidden">
        
        {/* GRILLE DES 8 CANAUX VIDÉO (8 colonnes) */}
        <div className="col-span-8 grid grid-cols-4 gap-2">
          {scenes.length > 0 ? (
            scenes.slice(0, 8).map((scene, index) => {
              const isPGM = currentScene === scene;
              return (
                <button
                  key={scene}
                  onClick={() => switchSceneByIndex(index)}
                  className={`flex flex-col justify-between p-3 rounded-xl border-2 font-bold transition-all ${
                    isPGM 
                      ? 'bg-red-600 border-red-400 shadow-lg shadow-red-900/50 scale-[0.98]' 
                      : 'bg-slate-900 border-slate-800 hover:bg-slate-800'
                  }`}
                >
                  <span className="text-[10px] text-slate-400">CH {index + 1}</span>
                  <span className="text-sm truncate my-1">{scene}</span>
                  <span className="text-[9px] uppercase tracking-wider">{isPGM ? '● PGM' : 'Prêt'}</span>
                </button>
              );
            })
          ) : (
            <div className="col-span-4 flex items-center justify-center text-slate-500 text-xs border border-dashed border-slate-800 rounded-xl">
              Connecte-toi à OBS pour charger les 8 canaux
            </div>
          )}
        </div>

        {/* PANNEAU LATÉRAL : TRANSITIONS, TITRAGE & AUDIO (4 colonnes) */}
        <div className="col-span-4 flex flex-col space-y-3">
          
          {/* SECTEUR TRANSITIONS */}
          <div className="bg-slate-900 p-3 rounded-xl border border-slate-800 space-y-2">
            <span className="text-xs font-bold text-slate-400 flex items-center">
              <Sliders className="w-3.5 h-3.5 mr-1" /> Transition
            </span>
            <div className="grid grid-cols-3 gap-1">
              {['Cut', 'Fade', 'Stinger'].map((t) => (
                <button
                  key={t}
                  onClick={() => setSelectedTransition(t)}
                  className={`text-xs py-1 rounded font-semibold border ${
                    selectedTransition === t 
                      ? 'bg-blue-600 border-blue-400 text-white' 
                      : 'bg-slate-800 border-slate-700 text-slate-300'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          {/* SECTEUR LOWER THIRDS / TITRAGE */}
          <div className="bg-slate-900 p-3 rounded-xl border border-slate-800 space-y-2 flex-1 flex flex-col justify-between">
            <span className="text-xs font-bold text-slate-400 flex items-center">
              <Type className="w-3.5 h-3.5 mr-1" /> Titrage & Réseaux
            </span>
            
            <div className="space-y-1.5 text-xs">
              <input 
                type="text" 
                value={speakerName}
                onChange={(e) => setSpeakerName(e.target.value)}
                placeholder="Nom de l'intervenant"
                className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1 text-white"
              />
              <input 
                type="text" 
                value={speakerTitle}
                onChange={(e) => setSpeakerTitle(e.target.value)}
                placeholder="Fonction / Titre"
                className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1 text-white"
              />
              <div className="flex items-center bg-slate-800 border border-slate-700 rounded px-2 py-1">
                <Share2 className="w-3 h-3 mr-1.5 text-slate-400" />
                <input 
                  type="text" 
                  value={socialHandle}
                  onChange={(e) => setSocialHandle(e.target.value)}
                  placeholder="@pseudo_reseaux"
                  className="bg-transparent w-full text-white focus:outline-none"
                />
              </div>
            </div>

            <button
              onClick={toggleLowerThird}
              className={`w-full py-2 rounded-lg font-bold text-xs flex items-center justify-center transition-all ${
                isLowerThirdActive 
                  ? 'bg-amber-500 text-black shadow-lg shadow-amber-900/40' 
                  : 'bg-slate-800 hover:bg-slate-700 text-white border border-slate-700'
              }`}
            >
              <Play className="w-3.5 h-3.5 mr-1 fill-current" />
              {isLowerThirdActive ? 'MASQUER LE TITRE' : 'AFFICHER LE TITRE'}
            </button>
          </div>

          {/* SECTEUR MONITORING AUDIO (TABLE DE MIXAGE) */}
          <div className="bg-slate-900 p-3 rounded-xl border border-slate-800 space-y-1.5">
            <div className="flex justify-between items-center text-xs">
              <span className="font-bold text-slate-400 flex items-center">
                <Volume2 className="w-3.5 h-3.5 mr-1" /> Audio Master
              </span>
              <span className="text-[10px] text-green-400 font-mono">{audioLevel} dB</span>
            </div>
            
            {/* Barre Vumètre audio */}
            <div className="w-full bg-slate-800 h-3 rounded-full overflow-hidden p-0.5 border border-slate-700 flex items-center">
              <div 
                className="h-full bg-gradient-to-r from-green-500 via-yellow-500 to-red-500 rounded-full transition-all duration-300"
                style={{ width: `${audioLevel}%` }}
              />
            </div>
          </div>

        </div>

      </div>
    </div>
  );
}
