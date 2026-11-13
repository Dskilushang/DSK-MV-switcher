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
  
  // Hauteur de la course réduite pour s'adapter parfaitement à l'écran
  const TRACK_HEIGHT = 80; 

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (disabled) return;
    isDragging.current = true;
    startY.current = e.clientY;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging.current || disabled) return;

    const deltaY = startY.current - e.clientY;
    let newPos = currentPos.current + (deltaY / TRACK_HEIGHT);

    // On bloque entre 0 et 1
    newPos = Math.max(0, Math.min(1, newPos));
    
    if (thumbRef.current) {
      thumbRef.current.style.transform = `translateY(-${newPos * TRACK_HEIGHT}px)`;
    }
  };

  const handlePointerUp = () => {
    if (!isDragging.current || disabled) return;
    isDragging.current = false;

    const transform = thumbRef.current?.style.transform || 'translateY(0px)';
    const match = transform.match(/translateY\(-(\d+(\.\d+)?)px\)/);
    
    if (match) {
      const pixelsMoved = parseFloat(match[1]);
      const percent = pixelsMoved / TRACK_HEIGHT;

      if (percent > 0.5) {
        onTransition();
      }
    }

    // On remet le curseur en bas
    currentPos.current = 0;
    if (thumbRef.current) {
      thumbRef.current.style.transition = 'transform 0.2s ease-out';
      thumbRef.current.style.transform = `translateY(0px)`;
      
      setTimeout(() => {
        if (thumbRef.current) thumbRef.current.style.transition = 'none';
      }, 200);
    }
  };

  return (
    <div className="flex flex-col items-center justify-end h-full py-1 select-none">
      {/* Conteneur de la piste (Ajusté pour ne plus déborder) */}
      <div 
        className="relative bg-gray-800 rounded-full w-8 border border-gray-600 flex items-end justify-center"
        style={{ height: `${TRACK_HEIGHT + 30}px` }}
      >
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
          className={`absolute bottom-0 w-12 h-8 bg-gray-700 rounded-md border-2 shadow-lg cursor-grab active:cursor-grabbing flex items-center justify-center mb-2 ${
            disabled ? 'border-gray-500 opacity-50' : 'border-red-500'
          }`}
          style={{ touchAction: 'none' }}
        >
          <div className="w-8 h-0.5 bg-white rounded-full"></div>
        </div>
      </div>
      <span className="text-[10px] text-gray-400 mt-1 font-mono">T-BAR</span>
    </div>
  );
};

export default TBar;
