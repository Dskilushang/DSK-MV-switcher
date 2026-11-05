import OBSWebSocket from 'obs-websocket-js';

// Instance unique partagée dans toute l'app
const obs = new OBSWebSocket();

export type ObsStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

export interface ObsConfig {
  host: string;
  port: number;
  password: string;
}

// Callbacks pour informer l'UI
type StatusCallback = (status: ObsStatus, message?: string) => void;
type SceneCallback = (sceneName: string) => void;

let onStatusChange: StatusCallback | null = null;
let onSceneChange: SceneCallback | null = null;

export function registerCallbacks(
  statusCb: StatusCallback,
  sceneCb: SceneCallback
) {
  onStatusChange = statusCb;
  onSceneChange = sceneCb;

  // Écoute des événements OBS
  obs.on('ConnectionClosed', () => {
    onStatusChange?.('disconnected', 'Connexion fermée');
  });

  obs.on('ConnectionError', (err) => {
    onStatusChange?.('error', err.message);
  });

  obs.on('CurrentProgramSceneChanged', (data) => {
    onSceneChange?.(data.sceneName);
  });
}

export async function connectObs(config: ObsConfig): Promise<boolean> {
  onStatusChange?.('connecting');
  try {
    const url = `ws://${config.host}:${config.port}`;
    await obs.connect(url, config.password || undefined);

    // Récupérer la scène actuelle au démarrage
    const { currentProgramSceneName } = await obs.call(
      'GetCurrentProgramScene'
    );
    onSceneChange?.(currentProgramSceneName);

    onStatusChange?.('connected', 'Connecté à OBS');
    return true;
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Erreur inconnue';
    onStatusChange?.('error', msg);
    return false;
  }
}

export async function disconnectObs(): Promise<void> {
  try {
    await obs.disconnect();
  } catch {
    // ignore
  }
  onStatusChange?.('disconnected');
}

export async function setProgramScene(sceneName: string): Promise<void> {
  try {
    await obs.call('SetCurrentProgramScene', { sceneName });
  } catch (error) {
    console.error('Erreur changement de scène', error);
    throw error;
  }
}

// Récupérer la liste des scènes disponibles (utile pour le mapping caméras <-> scènes)
export async function getSceneList(): Promise<string[]> {
  const { scenes } = await obs.call('GetSceneList');
  return scenes.map((s) => String(s.sceneName));
  }
