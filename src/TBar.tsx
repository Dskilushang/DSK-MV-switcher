import React, { useRef } from 'react';

interface TBarProps {
  onTransition: () => void;
  onProgress?: (progress: number) => void;
  disabled?: boolean;
}

const TRACK_HEIGHT = 80;
const TRANSITION_THRESHOLD = 0.8;

const TBar: React.FC<TBarProps> = ({
  onTransition,
  onProgress,
  disabled = false
}) => {
  const isDragging = useRef(false);
  const startY = useRef(0);
  const startProgress = useRef(0);
  const currentProgress = useRef(0);
  const thumbRef = useRef<HTMLDivElement>(null);

  const updateThumb = (progress: number, animate = false) => {
    const thumb = thumbRef.current;
    if (!thumb) return;

    thumb.style.transition = animate ? 'transform 0.2s ease-out' : 'none';
    thumb.style.transform = `translateY(-${progress * TRACK_HEIGHT}px)`;
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (disabled || isDragging.current) return;

    isDragging.current = true;
    startY.current = event.clientY;
    startProgress.current = currentProgress.current;

    // Capture le pointeur sur le curseur lui-même : le drag continue
    // même si le doigt sort de sa surface.
    event.currentTarget.setPointerCapture(event.pointerId);
    updateThumb(currentProgress.current);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging.current || disabled) return;

    const delta = (startY.current - event.clientY) / TRACK_HEIGHT;
    const nextProgress = Math.max(0, Math.min(1, startProgress.current + delta));

    currentProgress.current = nextProgress;
    updateThumb(nextProgress);
    onProgress?.(nextProgress);
  };

  const finishDrag = (commitTransition: boolean) => {
    if (!isDragging.current) return;

    isDragging.current = false;
    const completed = currentProgress.current >= TRANSITION_THRESHOLD;

    // Réinitialise d'abord l'état visuel et le fondu.
    currentProgress.current = 0;
    startProgress.current = 0;
    onProgress?.(0);
    updateThumb(0, true);

    if (commitTransition && completed && !disabled) {
      onTransition();
    }
  };

  const handlePointerUp = () => finishDrag(true);
  const handlePointerCancel = () => finishDrag(false);

  return (
    <div className="flex flex-col items-center justify-end h-full py-1 select-none">
      <div
        className="relative bg-gray-800 rounded-full w-8 border border-gray-600 flex items-end justify-center"
        style={{ height: `${TRACK_HEIGHT + 30}px` }}
      >
        <div
          className="absolute bottom-4 w-2 bg-gray-900 rounded-full"
          style={{ height: `${TRACK_HEIGHT}px` }}
        />
        <div
          ref={thumbRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerCancel}
          onLostPointerCapture={handlePointerCancel}
          className={`absolute bottom-0 w-12 h-8 bg-gray-700 rounded-md border-2 shadow-lg cursor-grab active:cursor-grabbing flex items-center justify-center mb-2 ${
            disabled ? 'border-gray-500 opacity-50' : 'border-red-500'
          }`}
          style={{ touchAction: 'none' }}
          role="slider"
          aria-label="T-Bar de transition"
          aria-orientation="vertical"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(currentProgress.current * 100)}
          aria-disabled={disabled}
        >
          <div className="w-8 h-0.5 bg-white rounded-full pointer-events-none" />
        </div>
      </div>
      <span className="text-[10px] text-gray-400 mt-1 font-mono">T-BAR</span>
    </div>
  );
};

export default TBar;
