import type { Plugin } from '@capacitor/core';

export interface BackgroundStreamOptions {
  title?: string;
  text?: string;
}

export interface DskStreamingPlugin extends Plugin {
  startBackgroundService(options?: BackgroundStreamOptions): Promise<{ started: boolean }>;
  stopBackgroundService(): Promise<{ stopped: boolean }>;
  getBackgroundServiceStatus(): Promise<{ running: boolean }>;
}

export declare const DskStreaming: DskStreamingPlugin;
