import { useState } from 'react';

export type DskLayer = {
  id: 1 | 2 | 3 | 4;
  name: string;
  type: 'text' | 'image';
  content: string;
  enabled: boolean;
  x: number;
  y: number;
  opacity: number;
  fontSize: number;
};

type DskPanelProps = {
  layers: DskLayer[];
  onChange: (layers: DskLayer[]) => void;
  onClose: () => void;
};

const updateLayer = (layers: DskLayer[], id: DskLayer['id'], patch: Partial<DskLayer>) =>
  layers.map((layer) => layer.id === id ? { ...layer, ...patch } : layer);

export default function DskPanel({ layers, onChange, onClose }: DskPanelProps) {
  const [selectedId, setSelectedId] = useState<DskLayer['id']>(1);
  const [fileError, setFileError] = useState('');
  const selected = layers.find((layer) => layer.id === selectedId) ?? layers[0];

  const handleImage = (file?: File) => {
    setFileError('');
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setFileError('Choisissez un fichier image.');
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      setFileError('Image trop volumineuse (maximum 8 Mo).');
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => setFileError('Impossible de lire ce fichier image.');
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        onChange(updateLayer(layers, selectedId, { type: 'image', content: reader.result }));
      }
    };
    reader.readAsDataURL(file);
  };

  const patch = (value: Partial<DskLayer>) => onChange(updateLayer(layers, selectedId, value));

  return (
    <div className="fixed inset-0 z-[120] bg-black/80 flex items-center justify-center p-3" onClick={onClose}>
      <section
        role="dialog"
        aria-modal="true"
        aria-label="Panneau DSK"
        className="w-full max-w-xl max-h-[92dvh] overflow-y-auto rounded-xl border border-amber-600 bg-slate-900 p-4 text-white shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="flex items-center justify-between gap-3 mb-4">
          <div>
            <h2 className="text-base font-black tracking-wider">DSK · DOWNSTREAM KEYER</h2>
            <p className="text-[10px] text-slate-400">4 couches graphiques indépendantes</p>
          </div>
          <button onClick={onClose} className="rounded bg-slate-700 px-3 py-2 text-sm font-bold">FERMER</button>
        </header>

        <div className="grid grid-cols-4 gap-2 mb-4">
          {layers.map((layer) => (
            <button
              key={layer.id}
              onClick={() => { setSelectedId(layer.id); setFileError(''); }}
              className={`rounded-lg border px-2 py-3 text-left ${selectedId === layer.id ? 'border-amber-400 bg-amber-700' : 'border-slate-700 bg-slate-800'}`}
            >
              <span className="block text-xs font-black">DSK {layer.id}</span>
              <span className="block truncate text-[9px] text-slate-200">{layer.name}</span>
              <span className={`mt-1 block text-[9px] font-bold ${layer.enabled ? 'text-green-300' : 'text-slate-400'}`}>{layer.enabled ? 'ON AIR' : 'OFF'}</span>
            </button>
          ))}
        </div>

        <div className="rounded-lg border border-slate-700 bg-slate-800 p-3 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <label className="text-xs font-bold">DSK {selected.id} · {selected.name}</label>
            <button
              onClick={() => patch({ enabled: !selected.enabled })}
              className={`rounded px-4 py-2 text-xs font-black ${selected.enabled ? 'bg-red-700' : 'bg-green-700'}`}
            >{selected.enabled ? 'DÉSACTIVER' : 'ACTIVER'}</button>
          </div>

          <label className="block text-[10px] text-slate-400">Nom du canal</label>
          <input
            value={selected.name}
            maxLength={24}
            onChange={(event) => patch({ name: event.target.value })}
            className="w-full rounded border border-slate-600 bg-slate-950 px-3 py-2 text-sm"
          />

          <label className="block text-[10px] text-slate-400">Type de couche</label>
          <select
            value={selected.type}
            onChange={(event) => patch({ type: event.target.value as DskLayer['type'] })}
            className="w-full rounded border border-slate-600 bg-slate-950 px-3 py-2 text-sm"
          >
            <option value="text">Texte</option>
            <option value="image">Image / logo / graphique</option>
          </select>

          {selected.type === 'text' ? (
            <>
              <label className="block text-[10px] text-slate-400">Texte à afficher</label>
              <textarea
                value={selected.content}
                maxLength={120}
                rows={2}
                onChange={(event) => patch({ content: event.target.value })}
                placeholder="Saisir le texte du bandeau…"
                className="w-full rounded border border-slate-600 bg-slate-950 px-3 py-2 text-sm"
              />
              <label className="block text-[10px] text-slate-400">Taille du texte : {selected.fontSize}px</label>
              <input type="range" min="14" max="64" value={selected.fontSize} onChange={(event) => patch({ fontSize: Number(event.target.value) })} className="w-full" />
            </>
          ) : (
            <>
              <label className="block text-[10px] text-slate-400">Importer une image (PNG/JPG/WebP, 8 Mo maximum)</label>
              <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={(event) => handleImage(event.target.files?.[0])} className="w-full text-xs text-slate-300" />
              {selected.content && <p className="text-[10px] text-green-300">Image chargée dans ce canal.</p>}
            </>
          )}
          {fileError && <p role="alert" className="text-xs text-red-300">{fileError}</p>}

          <div className="grid grid-cols-2 gap-3">
            <label className="text-[10px] text-slate-400">Position horizontale : {selected.x}%
              <input type="range" min="0" max="100" value={selected.x} onChange={(event) => patch({ x: Number(event.target.value) })} className="block w-full" />
            </label>
            <label className="text-[10px] text-slate-400">Position verticale : {selected.y}%
              <input type="range" min="0" max="100" value={selected.y} onChange={(event) => patch({ y: Number(event.target.value) })} className="block w-full" />
            </label>
          </div>
          <label className="block text-[10px] text-slate-400">Opacité : {Math.round(selected.opacity * 100)}%
            <input type="range" min="10" max="100" value={Math.round(selected.opacity * 100)} onChange={(event) => patch({ opacity: Number(event.target.value) / 100 })} className="block w-full" />
          </label>
          <button
            onClick={() => patch({ enabled: false, content: '' })}
            className="w-full rounded border border-red-800 bg-red-950/60 px-3 py-2 text-xs font-bold text-red-200"
          >EFFACER LE CONTENU ET COUPER CE CANAL</button>
        </div>
        <p className="mt-3 text-[10px] leading-relaxed text-slate-400">
          Les canaux sont superposés au PGM dans l'ordre DSK 1 à DSK 4. Les modifications sont conservées pendant la session ; la sauvegarde permanente des profils sera ajoutée dans un module ultérieur.
        </p>
      </section>
    </div>
  );
}
