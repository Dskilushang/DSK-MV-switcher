import React, { useRef } from 'react';

interface TBarProps {
  onTransition: () => void; // Fonction appelée quand la transition est terminée
  disabled?: boolean;
}

const TBar: React.FC<TBarProps> = ({ onTransition, disabled = false }) => {
  const isDragging = useRef(false);
  const startY = useRef(0);
  const currentPos = useRef(0); // 0 = en bas, 1 = en haut
  const thumbRef = useRef<HTMLDivElement>(null);
  
  // Hauteur de la course de la T-Bar en pixels (ajustable)
  const TRACK_HEIGHT = 200; 

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (disabled) return;
    isDragging.current = true;
    startY.current = e.clientY;
    // On capture le pointeur pour continuer à suivre même si on sort du div
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging.current || disabled) return;

    const deltaY = startY.current - e.clientY; // Positif si on monte
    let newPos = currentPos.current + (deltaY / TRACK_HEIGHT);

    // On bloque entre 0 et 1
    newPos = Math.max(0, Math.min(1, newPos));
    
    // Mise à jour visuelle
    if (thumbRef.current) {
      thumbRef.current.style.transform = `translateY(-${newPos * TRACK_HEIGHT}px)`;
    }
  };

  const handlePointerUp = () => {
    if (!isDragging.current || disabled) return;
    isDragging.current = false;

    // On lit la position actuelle dans le style
    const transform = thumbRef.current?.style.transform || 'translateY(0px)';
    const match = transform.match(/translateY\(-(\d+(\.\d+)?)px\)/);
    
    if (match) {
      const pixelsMoved = parseFloat(match[1]);
      const percent = pixelsMoved / TRACK_HEIGHT;

      if (percent > 0.5) {
        // Transition validée (on a dépassé la moitié)
        onTransition();
      }
    }

    // Dans tous les cas, on remet le curseur en bas (comme un vrai switcher)
    currentPos.current = 0;
    if (thumbRef.current) {
      thumbRef.current.style.transition = 'transform 0.2s ease-out';
      thumbRef.current.style.transform = `translateY(0px)`;
      
      // On retire la transition après pour que le prochain glissement soit fluide
      setTimeout(() => {
        if (thumbRef.current) thumbRef.current.style.transition = 'none';
      }, 200);
    }
  };

  return (
    <div className="flex flex-col items-center justify-end h-full py-4 select-none">
      {/* Conteneur de la piste */}
      <div 
        className="relative bg-gray-800 rounded-full w-8 border border-gray-600 flex items-end justify-center"
        style={{ height: `${TRACK_HEIGHT + 40}px` }}
      >
        {/* La piste de fond */}
        <div 
          className="absolute bottom-4 w-2 bg-gray-900 rounded-full"
          style={{ height: `${TRACK_HEIGHT}px` }}
        />
        
        {/* Le curseur (Thumb) */}
        <div
          ref={thumbRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          className={`absolute bottom-0 w-12 h-8 bg-gray-700 rounded-md border-2 shadow-lg cursor-grab active:cursor-grabbing flex items-center justify-center mb-4 ${
            disabled ? 'border-gray-500 opacity-50' : 'border-red-500'
          }`}
          style={{ touchAction: 'none' }} // Important pour mobile : empêche le scroll de la page
        >
          {/* Ligne blanche sur le curseur */}
          <div className="w-8 h-0.5 bg-white rounded-full"></div>
        </div>
      </div>
      <span className="text-xs text-gray-400 mt-2 font-mono">T-BAR</span>
    </div>
  );
};

export default TBar;
