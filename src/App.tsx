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
import React, { useState, useEffect } from 'react';
import OBSWebSocket from 'obs-websocket-js';
import { Wifi, WifiOff, Volume2, Sliders, Type, Share2, Play, Monitor, Keyboard, Radio } from 'lucide-react';

const obs = new OBSWebSocket();

export default function App() {
  const [isConnected, setIsConnected] = useState(false);
  const [serverIP, setServerIP] = useState('192.168.1.50:4455');
  const [password, setPassword] = useState('');
  const [currentScene, setCurrentScene] = useState('');
  const [previewScene, setPreviewScene] = useState('');
  const [scenes, setScenes] = useState<string[]>([]);
  const [lastKeyPressed, setLastKeyPressed] = useState<string | null>(null);

  // Monitoring Audio & Transitions
  const [audioLevel, setAudioLevel] = useState(72);
  const [selectedTransition, setSelectedTransition] = useState('CUT');

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
      const loadedScenes = response.scenes.map((s: any) => s.sceneName);
      setScenes(loadedScenes);
      setCurrentScene(response.currentProgramSceneName);
      setPreviewScene(loadedScenes[1] || loadedScenes[0]);

      obs.on('CurrentProgramSceneChanged', (data) => {
        setCurrentScene(data.sceneName);
      });
    } catch (error) {
      console.error('Erreur de connexion OBS :', error);
      alert('Connexion échouée. Vérifie l\'adresse IP et le mot de passe.');
    }
  };

  const switchSceneByIndex = (index: number) => {
    if (scenes[index]) {
      obs.call('SetCurrentProgramScene', { sceneName: scenes[index] }).catch(console.error);
    }
  };

  // Clavier Bluetooth (HID)
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (['INPUT', 'TEXTAREA'].includes((event.target as HTMLElement).tagName)) return;
      const key = event.key;
      setLastKeyPressed(key);
      const keyNumber = parseInt(key, 10);
      if (!isNaN(keyNumber) && keyNumber >= 1 && keyNumber <= 8) {
        switchSceneByIndex(keyNumber - 1);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [scenes]);

  const toggleLowerThird = async () => {
    const newState = !isLowerThirdActive;
    setIsLowerThirdActive(newState);
    if (isConnected) {
      try {
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
          sceneItemId: 1,
          sceneItemEnabled: newState
        });
      } catch (err) {
        console.log('Mode démo / Source OBS non configurée');
      }
    }
  };

  return (
    <div className="flex flex-col h-screen bg-slate-950 text-slate-100 p-2 font-mono select-none overflow-hidden">
      
      {/* 1. BARRE DE DOCK & BANNER STUDIO */}
      <div className="flex items-center justify-between bg-slate-900 px-3 py-2 rounded-lg border border-slate-800 shadow-md mb-2">
        <div className="flex items-center space-x-3">
          <div className="flex items-center space-x-1.5 bg-slate-950 px-2.5 py-1 rounded border border-slate-800">
            <Radio className={`w-3.5 h-3.5 ${isConnected ? 'text-red-500 animate-pulse' : 'text-slate-600'}`} />
            <span className="text-xs font-bold tracking-wider text-slate-200">DSK-R8 SWITCHER</span>
          </div>
          
          {isConnected ? (
            <span className="flex items-center text-[10px] font-bold text-emerald-400 bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-800">
              <Wifi className="w-3 h-3 mr-1" /> ON-AIR (OBS CONNECTÉ)
            </span>
          ) : (
            <span className="flex items-center text-[10px] font-bold text-rose-400 bg-rose-950/60 px-2 py-0.5 rounded border border-rose-800">
              <WifiOff className="w-3 h-3 mr-1" /> HORS LIGNE
            </span>
          )}

          {lastKeyPressed && (
            <span className="hidden sm:flex items-center text-[10px] text-amber-400 bg-amber-950/40 px-2 py-0.5 rounded border border-amber-800">
              <Keyboard className="w-3 h-3 mr-1" /> BT KEY: {lastKeyPressed}
            </span>
          )}
        </div>

        {!isConnected && (
          <div className="flex space-x-1.5 text-xs">
            <input 
              type="text" 
              value={serverIP} 
              onChange={(e) => setServerIP(e.target.value)}
              placeholder="IP:Port"
              className="bg-slate-950 text-[11px] px-2 py-0.5 rounded border border-slate-700 text-slate-200 w-36 focus:outline-none focus:border-blue-500"
            />
            <input 
              type="password" 
              value={password} 
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Pass"
              className="bg-slate-950 text-[11px] px-2 py-0.5 rounded border border-slate-700 text-slate-200 w-24 focus:outline-none focus:border-blue-500"
            />
            <button 
              onClick={connectOBS}
              className="bg-blue-600 hover:bg-blue-500 text-white font-bold text-[10px] px-3 py-0.5 rounded uppercase tracking-wider transition-colors"
            >
              CONNECTER
            </button>
          </div>
        )}
      </div>

      {/* 2. CONSOLE PRINCIPALE DE RÉGIE */}
      <div className="grid grid-cols-12 gap-2 flex-1 overflow-hidden">
        
        {/* SECTION GAUCHE : PANNEAU DES 8 CANAUX VIDÉO */}
        <div className="col-span-8 bg-slate-900 p-2.5 rounded-lg border border-slate-800 flex flex-col justify-between shadow-inner">
          <div className="flex justify-between items-center mb-2 px-1">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center">
              <Monitor className="w-3 h-3 mr-1" /> BANC DE COMMUTATION PROGRAMME (PGM)
            </span>
            <span className="text-[9px] bg-slate-950 text-slate-400 px-2 py-0.5 rounded border border-slate-800">
              8 CANAUX DISPONIBLES
            </span>
          </div>

          <div className="grid grid-cols-4 gap-2 flex-1">
            {scenes.length > 0 ? (
              scenes.slice(0, 8).map((scene, index) => {
                const isPGM = currentScene === scene;
                return (
                  <button
                    key={scene}
                    onClick={() => switchSceneByIndex(index)}
                    className={`relative flex flex-col justify-between p-3 rounded border-2 transition-all active:scale-95 ${
                      isPGM 
                        ? 'bg-gradient-to-b from-red-600 to-red-800 border-red-400 text-white shadow-lg shadow-red-900/60' 
                        : 'bg-gradient-to-b from-slate-800 to-slate-900 border-slate-700 hover:border-slate-500 text-slate-300'
                    }`}
                  >
                    <div className="flex justify-between items-center w-full">
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${isPGM ? 'bg-red-950 text-red-200' : 'bg-slate-950 text-slate-400'}`}>
                        CH {index + 1}
                      </span>
                      <span className="text-[9px] text-slate-400 font-sans">KEY: {index + 1}</span>
                    </div>

                    <div className="my-2 text-left">
                      <span className="text-xs font-bold truncate block">{scene}</span>
                    </div>

                    <div className="flex justify-between items-center w-full text-[9px] uppercase font-bold tracking-wider">
                      <span className={`w-2 h-2 rounded-full ${isPGM ? 'bg-red-300 animate-ping' : 'bg-slate-700'}`} />
                      <span>{isPGM ? '● ON-AIR (PGM)' : 'PRÊT'}</span>
                    </div>
                  </button>
                );
              })
            ) : (
              <div className="col-span-4 flex flex-col items-center justify-center text-slate-500 border border-dashed border-slate-800 rounded-lg p-6 bg-slate-950/40">
                <Monitor className="w-8 h-8 mb-2 opacity-40" />
                <span className="text-xs">Connecte-toi à OBS pour charger les 8 canaux vidéo.</span>
              </div>
            )}
          </div>
        </div>

        {/* SECTION DROITE : TRANSITIONS, LOWER THIRDS & VUMÈTRE AUDIO */}
        <div className="col-span-4 flex flex-col space-y-2 overflow-y-auto">
          
          {/* SECTEUR TRANSITIONS */}
          <div className="bg-slate-900 p-2.5 rounded-lg border border-slate-800">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center mb-1.5">
              <Sliders className="w-3 h-3 mr-1" /> TRANSITIONS STUDIO
            </span>
            <div className="grid grid-cols-3 gap-1">
              {['CUT', 'FADE', 'STINGER'].map((t) => (
                <button
                  key={t}
                  onClick={() => setSelectedTransition(t)}
                  className={`text-[10px] py-1.5 rounded font-bold border transition-colors ${
                    selectedTransition === t 
                      ? 'bg-blue-600 border-blue-400 text-white shadow' 
                      : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          {/* SECTEUR LOWER THIRDS / HABILLAGE GRAPHIQUE */}
          <div className="bg-slate-900 p-2.5 rounded-lg border border-slate-800 flex-1 flex flex-col justify-between">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center mb-1.5">
              <Type className="w-3 h-3 mr-1" /> HABILLAGE & SYNCHRO
            </span>

            <div className="space-y-1.5 text-xs">
              <input 
                type="text" 
                value={speakerName}
                onChange={(e) => setSpeakerName(e.target.value)}
                placeholder="Nom Intervenant"
                className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1 text-slate-200 text-[11px] focus:outline-none focus:border-amber-500"
              />
              <input 
                type="text" 
                value={speakerTitle}
                onChange={(e) => setSpeakerTitle(e.target.value)}
                placeholder="Fonction / Titre"
                className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1 text-slate-200 text-[11px] focus:outline-none focus:border-amber-500"
              />
              <div className="flex items-center bg-slate-950 border border-slate-800 rounded px-2 py-1">
                <Share2 className="w-3 h-3 mr-1 text-slate-500" />
                <input 
                  type="text" 
                  value={socialHandle}
                  onChange={(e) => setSocialHandle(e.target.value)}
                  placeholder="@pseudo"
                  className="bg-transparent w-full text-slate-200 text-[11px] focus:outline-none"
                />
              </div>
            </div>

            <button
              onClick={toggleLowerThird}
              className={`w-full py-2 mt-2 rounded font-bold text-[10px] uppercase tracking-wider flex items-center justify-center transition-all ${
                isLowerThirdActive 
                  ? 'bg-amber-500 text-black shadow-lg shadow-amber-950' 
                  : 'bg-slate-950 hover:bg-slate-800 text-slate-300 border border-slate-800'
              }`}
            >
              <Play className="w-3 h-3 mr-1 fill-current" />
              {isLowerThirdActive ? 'MASQUER LE TITRE' : 'ENVOYER SUR PGM'}
            </button>
          </div>

          {/* SECTEUR VUMÈTRE AUDIO */}
          <div className="bg-slate-900 p-2.5 rounded-lg border border-slate-800">
            <div className="flex justify-between items-center text-[10px] mb-1">
              <span className="font-bold text-slate-400 uppercase tracking-widest flex items-center">
                <Volume2 className="w-3 h-3 mr-1" /> AUDIO MASTER
              </span>
              <span className="text-emerald-400 font-mono font-bold">{audioLevel} dB</span>
            </div>
            
            <div className="w-full bg-slate-950 h-3 rounded overflow-hidden p-0.5 border border-slate-800 flex items-center">
              <div 
                className="h-full bg-gradient-to-r from-emerald-500 via-yellow-500 to-rose-500 rounded-sm transition-all duration-300"
                style={{ width: `${audioLevel}%` }}
              />
            </div>
          </div>

        </div>

      </div>
    </div>
  );
}
