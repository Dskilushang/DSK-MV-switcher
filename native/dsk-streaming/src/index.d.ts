import type { Plugin } from '@capacitor/core';

export interface BackgroundStreamOptions {
  title?: string;
  text?: string;
}

export interface H264EncoderProbeOptions {
  /** Requested encoder width. Defaults to 1280. */
  width?: number;
  /** Requested encoder height. Defaults to 720. */
  height?: number;
  /** Requested frame rate. Defaults to 30. */
  frameRate?: number;
  /** Requested video bitrate in bits per second. Defaults to 4,000,000. */
  bitRate?: number;
}

export interface H264EncoderProbeResult {
  /** True when an H.264 encoder was configured and its input Surface created. */
  supported: boolean;
  codecName: string | null;
  hardwareAccelerated: boolean;
  width: number;
  height: number;
  frameRate: number;
  inputSurfaceCreated: boolean;
  /** Explains the probe result. This probe does not encode or transmit video. */
  detail: string | null;
}

export interface DskStreamingPlugin extends Plugin {
  startBackgroundService(options?: BackgroundStreamOptions): Promise<{ started: boolean }>;
  stopBackgroundService(): Promise<{ stopped: boolean }>;
  getBackgroundServiceStatus(): Promise<{ running: boolean }>;
  probeH264SurfaceEncoder(options?: H264EncoderProbeOptions): Promise<H264EncoderProbeResult>;
}

export declare const DskStreaming: DskStreamingPlugin;
