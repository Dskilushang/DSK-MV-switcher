import { useState, useRef, useEffect } from 'react';
import { Settings, Radio, MonitorPlay, Zap } from 'lucide-react';
import TBar from './TBar';

export default function App() {
  // --- ÉTATS DU MÉLANGEUR ---
  const [programChannel, setProgramChannel] = useState(1);
  const [previewChannel, setPreviewChannel] = useState(2);
  const [isLive, setIsLive] = useState(false);
  const [isDskActive, setIsDskActive] = useState(false);
  const [isChromaActive, setIsChromaActive] = useState(false);
  const [isPipActive, setIsPipActive] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  
  // --- GESTION DU LOGO ---
  const [customLogo, setCustomLogo] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // --- GESTION DE LA CAMÉRA LOCALE ---
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const localVideoRef = useRef<HTMLVideoElement>(null);

  // --- SIMULATION AUDIO ---
  const [audioLevels, setAudioLevels] = useState([40, 20, 60, 10, 80, 30, 50, 15]);

  // Demande d'accès à la caméra locale (pour la CAM 1)
  useEffect(() => {
    const startCamera = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ 
          video: { facingMode: 'environment' },
          audio: false 
        });
        setCameraStream(stream);
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
        }
      } catch (err) {
        console.error("Impossible d'accéder à la caméra :", err);
      }
    };

    startCamera();

    return () => {
      if (cameraStream) {
        cameraStream.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  // Animation automatique des niveaux audio
  useEffect(() => {
    const interval = setInterval(() => {
      setAudioLevels(prevLevels => 
        prevLevels.map(level => {
          const change = Math.floor(Math.random() * 30) - 15;
          let newLevel = level + change;
          if (newLevel > 95) newLevel = 95;
          if (newLevel < 5) newLevel = 5;
          return newLevel;
        })
      );
    }, 500);

    return () => clearInterval(interval);
  }, []);

  // Fonction pour inverser les caméras (transition manuelle via la T-Bar)
  const handleTransition = () => {
    const temp = programChannel;
    setProgramChannel(previewChannel);
    setPreviewChannel(temp);
  };

  // Fonction pour le bouton CUT
  const handleCut = () => {
    const temp = programChannel;
    setProgramChannel(previewChannel);
    setPreviewChannel(temp);
  };

  // Fonction pour le bouton AUTO
  const handleAuto = () => {
    handleCut();
  };

  return (
    <div className="min-h-screen bg-slate-950 text-white flex flex-col font-sans select-none overflow-hidden">
      
      {/* --- EN-TÊTE --- */}
      <header className="flex items-center justify-between px-4 py-3 bg-slate-900 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <div className="bg-red-600 p-1.5 rounded-md">
            <MonitorPlay size={18} className="text-white" />
          </div>
          <div>
            <h1 className="text-lg font-black tracking-widest uppercase leading-none">DSK - MV</h1>
            <p className="text-[10px] text-slate-400 uppercase tracking-wider">Mélangeur Vidéo</p>
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          {isLive ? (
            <span className="flex items-center gap-1 text-xs font-bold text-red-500 animate-pulse">
              <Radio size={14} /> LIVE
            </span>
          ) : (
            <span className="text-xs font-bold text-slate-500">OFFLINE</span>
          )}
          <button className="p-2 text-slate-400 hover:text-white transition-colors">
            <Settings size={20} />
          </button>
        </div>
      </header>

      {/* --- MULTIVIEW (8 CAMÉRAS) --- */}
      <main className="flex-1 p-2 grid grid-cols-2 gap-2 content-start">
        {[1, 2, 3, 4, 5, 6, 7, 8].map((channel) => {
          const isProgram = programChannel === channel;
          const isPreview = previewChannel === channel;
          
          const borderColor = isProgram 
            ? 'border-red-500 shadow-[0_0_10px_rgba(239,68,68,0.5)]' 
            : isPreview 
              ? 'border-green-500 shadow-[0_0_10px_rgba(34,197,94,0.5)]' 
              : 'border-slate-800';

          return (
            <div 
              key={channel}
              onClick={() => setPreviewChannel(channel)}
              className={`relative aspect-video bg-slate-900 rounded-lg border-2 ${borderColor} overflow-hidden transition-all duration-200 cursor-pointer`}
            >
              {/* Affichage de la vraie caméra pour la CAM 1 */}
              {channel === 1 ? (
                <video 
                  ref={localVideoRef} 
                  autoPlay 
                  playsInline 
                  muted 
                  className="absolute inset-0 w-full h-full object-cover opacity-80"
                />
              ) : (
                <div className="absolute inset-0 opacity-20 flex items-center justify-center bg-[url('https://images.unsplash.com/photo-1574717024653-61fd2cf4d44d?q=80&w=300&auto=format&fit=crop')] bg-cover bg-center" />
              )}
              
              <div className="absolute top-1 left-1 bg-black/60 px-2 py-0.5 rounded text-xs font-bold">
                CAM {channel}
              </div>
              
              {/* Badge PROGRAM */}
              {isProgram && <div className="absolute bottom-1 right-1 bg-red-600 px-2 py-0.5 rounded text-[10px] font-bold">PROGRAM</div>}
              
              {/* Fenêtre Picture-in-Picture */}
              {isProgram && isPipActive && (
                <div className="absolute bottom-4 left-4 w-1/3 aspect-video bg-slate-800 border-2 border-orange-500 rounded-md overflow-hidden shadow-2xl z-10 flex items-center justify-center">
                  <div className="absolute inset-0 opacity-20 bg-[url('https://images.unsplash.com/photo-1574717024653-61fd2cf4d44d?q=80&w=300&auto=format&fit=crop')] bg-cover bg-center" />
                  <span className="relative z-10 text-2xl font-black text-white/50">
                    CAM {previewChannel}
                  </span>
                  <div className="absolute bottom-1 right-1 bg-orange-600 px-1.5 py-0.5 rounded text-[8px] font-bold z-10">PIP</div>
                </div>
              )}

              {/* Indicateur Chroma Key */}
              {isProgram && isChromaActive && (
                <div className="absolute inset-0 border-4 border-emerald-500 rounded-lg pointer-events-none animate-pulse">
                  <div className="absolute top-2 left-2 bg-emerald-600 text-white px-2 py-1 rounded text-xs font-black shadow-lg">
                    FOND VERT
                  </div>
                </div>
              )}

              {/* Logo DSK */}
              {isProgram && isDskActive && (
                <img 
                  src={customLogo || "https://upload.wikimedia.org/wikipedia/commons/thumb/6/6b/Direct8_logo.svg/200px-Direct8_logo.svg.png"} 
                  alt="Logo" 
                  className="absolute top-2 right-2 w-16 h-auto drop-shadow-md"
                />
              )}

              {/* Badge PREVIEW */}
              {isPreview && <div className="absolute bottom-1 right-1 bg-green-600 px-2 py-0.5 rounded text-[10px] font-bold">PREVIEW</div>}

              {/* Barre de niveau audio (VU-mètre) */}
              <div className="absolute bottom-0 left-0 right-0 h-1.5 flex gap-0.5 px-1 opacity-80">
                {[1, 2, 3, 4, 5].map((bar) => (
                  <div 
                    key={bar}
                    className={`flex-1 rounded-sm transition-all duration-300 ${
                      bar <= (audioLevels[channel - 1] / 20) 
                        ? (bar >= 4 ? 'bg-red-500' : bar >= 3 ? 'bg-yellow-500' : 'bg-green-500') 
                        : 'bg-slate-700'
                    }`}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </main>

      {/* --- CONTRÔLES DU BAS --- */}
      <footer className="bg-slate-900 border-t border-slate-800 pb-4">
        
        {/* Zone avec la T-Bar */}
        <div className="px-4 py-2 flex items-center justify-between gap-4">
          <div className="flex flex-col text-center">
            <span className="text-xs font-bold text-red-500 mb-1">PROG</span>
            <span className="text-xs font-bold text-slate-500">CAM {programChannel}</span>
          </div>
          
          <div className="flex-1 h-32 flex justify-center items-center">
            <TBar onTransition={handleTransition} />
          </div>

          <div className="flex flex-col text-center">
            <span className="text-xs font-bold text-green-500 mb-1">PREV</span>
            <span className="text-xs font-bold text-slate-500">CAM {previewChannel}</span>
          </div>
        </div>

        {/* Boutons 1 à 8 */}
        <div className="grid grid-cols-4 gap-2 px-4 mb-4">
          {[1, 2, 3, 4, 5, 6, 7, 8].map((ch) => {
            const isProgram = programChannel === ch;
            const isPreview = previewChannel === ch;
            return (
              <button
                key={ch}
                onClick={() => setPreviewChannel(ch)}
                className={`py-3 rounded-md font-bold text-lg border-b-4 transition-all active:border-b-0 active:translate-y-1 ${
                  isProgram ? 'bg-red-600 border-red-800 text-white' :
                  isPreview ? 'bg-green-600 border-green-800 text-white' :
                  'bg-slate-800 border-slate-950 text-slate-300'
                }`}
              >
                {ch}
              </button>
            );
          })}
        </div>

        {/* Input caché pour choisir le logo */}
        <input 
          type="file" 
          accept="image/*" 
          ref={fileInputRef} 
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) {
              setCustomLogo(URL.createObjectURL(file));
            }
          }}
          className="hidden" 
        />

        {/* Bouton pour changer le logo */}
        <div className="flex gap-4 px-4 mb-4">
          <button 
            onClick={() => fileInputRef.current?.click()}
            className="w-full bg-slate-800 hover:bg-slate-700 text-slate-300 py-2 rounded-md font-bold text-sm border-b-2 border-slate-950 transition-all"
          >
            Choisir un Logo
          </button>
        </div>

        {/* Boutons d'effets (Chroma, PIP, DSK) sur une seule ligne */}
        <div className="grid grid-cols-3 gap-2 px-4 mb-4">
          <button 
            onClick={() => setIsChromaActive(!isChromaActive)}
            className={`py-2 rounded-md font-bold text-xs border-b-2 transition-all active:border-b-0 active:translate-y-0.5 ${
              isChromaActive 
                ? 'bg-emerald-600 border-emerald-800 text-white shadow-[0_0_10px_rgba(16,185,129,0.5)]' 
                : 'bg-slate-800 border-slate-950 text-slate-400'
            }`}
          >
            {isChromaActive ? 'CHROMA ON' : 'CHROMA OFF'}
          </button>

          <button 
            onClick={() => setIsPipActive(!isPipActive)}
            className={`py-2 rounded-md font-bold text-xs border-b-2 transition-all active:border-b-0 active:translate-y-0.5 ${
              isPipActive 
                ? 'bg-orange-600 border-orange-800 text-white shadow-[0_0_10px_rgba(249,115,22,0.5)]' 
                : 'bg-slate-800 border-slate-950 text-slate-400'
            }`}
          >
            {isPipActive ? 'PIP ON' : 'PIP OFF'}
          </button>

          <button 
            onClick={() => setIsDskActive(!isDskActive)}
            className={`py-2 rounded-md font-bold text-xs border-b-2 transition-all active:border-b-0 active:translate-y-0.5 ${
              isDskActive 
                ? 'bg-purple-600 border-purple-800 text-white shadow-[0_0_10px_rgba(168,85,247,0.5)]' 
                : 'bg-slate-800 border-slate-950 text-slate-400'
            }`}
          >
            {isDskActive ? 'DSK ON' : 'DSK OFF'}
          </button>
        </div>

        {/* Boutons CUT et AUTO */}
        <div className="flex gap-4 px-4">
          <button 
            onClick={handleCut}
            className="flex-1 bg-slate-700 hover:bg-slate-600 text-white py-4 rounded-lg font-black text-xl tracking-wider border-b-4 border-slate-900 active:border-b-0 active:translate-y-1 transition-all"
          >
            CUT
          </button>
          <button 
            onClick={handleAuto}
            className="flex-1 bg-blue-600 hover:bg-blue-500 text-white py-4 rounded-lg font-black text-xl tracking-wider border-b-4 border-blue-800 active:border-b-0 active:translate-y-1 transition-all flex items-center justify-center gap-2"
          >
            <Zap size={20} /> AUTO
          </button>
        </div>
      </footer>
    </div>
  );
    }
