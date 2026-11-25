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
type StreamCallback = (active: boolean) => void;

let onStatusChange: StatusCallback | null = null;
let onSceneChange: SceneCallback | null = null;
let onStreamStateChange: StreamCallback | null = null;
let callbacksRegistered = false;

export function registerCallbacks(
  statusCb: StatusCallback,
  sceneCb: SceneCallback,
  streamCb?: StreamCallback
) {
  onStatusChange = statusCb;
  onSceneChange = sceneCb;
  onStreamStateChange = streamCb || null;

  // Enregistrer les écouteurs une seule fois pour éviter les doublons.
  if (callbacksRegistered) return;
  callbacksRegistered = true;

  obs.on('ConnectionClosed', () => {
    onStatusChange?.('disconnected', 'Connexion fermée');
  });

  obs.on('CurrentProgramSceneChanged', (data) => {
    onSceneChange?.(data.sceneName);
  });

  obs.on('StreamStateChanged', (data) => {
    onStreamStateChange?.(data.outputActive);
  });
}

export async function connectObs(config: ObsConfig): Promise<boolean> {
  onStatusChange?.('connecting');
  try {
    const host = config.host.trim().replace(/^wss?:\/\//i, '').replace(/\/+$/, '');
    const port = Number(config.port);
    if (!host) throw new Error('Adresse IP ou nom d’hôte OBS requis.');
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      throw new Error('Le port OBS doit être compris entre 1 et 65535.');
    }

    const url = `ws://${host}:${port}`;
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

export async function getObsStreamActive(): Promise<boolean> {
  const status = await obs.call('GetStreamStatus');
  return Boolean(status.outputActive);
}

export async function startObsStream(): Promise<void> {
  await obs.call('StartStream');
}

export async function stopObsStream(): Promise<void> {
  await obs.call('StopStream');
}
