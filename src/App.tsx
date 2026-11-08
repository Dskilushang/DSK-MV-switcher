import { useState } from 'react';
import { Settings, Radio, MonitorPlay, Zap } from 'lucide-react';
import TBar from './TBar';

export default function App() {
  // États pour le mélangeur
  const [programChannel, setProgramChannel] = useState(1);
  const [previewChannel, setPreviewChannel] = useState(2);
  const [isLive, setIsLive] = useState(false);
const [isDskActive, setIsDskActive] = useState(false);
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

  // Fonction pour le bouton AUTO (transition fluide - simulée pour l'instant)
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
              <div className="absolute inset-0 opacity-20 flex items-center justify-center bg-[url('https://images.unsplash.com/photo-1574717024653-61fd2cf4d44d?q=80&w=300&auto=format&fit=crop')] bg-cover bg-center" />
              <div className="absolute top-1 left-1 bg-black/60 px-2 py-0.5 rounded text-xs font-bold">
                CAM {channel}
              </div>
              {isProgram && <div className="absolute bottom-1 right-1 bg-red-600 px-2 py-0.5 rounded text-[10px] font-bold">PROGRAM</div>}
              {isPreview && <div className="absolute bottom-1 right-1 bg-green-600 px-2 py-0.5 rounded text-[10px] font-bold">PREVIEW</div>}
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
          
          {/* LA VRAIE T-BAR ICI */}
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
