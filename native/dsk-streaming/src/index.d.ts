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
  /** Number of encoded H.264 samples recovered from generated test frames. */
  encodedFrameCount: number;
  /** Total encoded output bytes recovered from the codec. */
  encodedBytes: number;
  /** Actual output MIME type reported by MediaCodec. */
  outputMimeType: string | null;
  /** Explains the probe result. Generated GPU frames are used; no camera or stream is started. */
  detail: string | null;
}

export interface DskStreamingPlugin extends Plugin {
  startBackgroundService(options?: BackgroundStreamOptions): Promise<{ started: boolean }>;
  stopBackgroundService(): Promise<{ stopped: boolean }>;
  getBackgroundServiceStatus(): Promise<{ running: boolean }>;
  probeH264SurfaceEncoder(options?: H264EncoderProbeOptions): Promise<H264EncoderProbeResult>;
  /** Save a complete JSON diagnostics report to the public Downloads/DSK-MV folder on Android 10+. */
  saveDiagnosticsReport(options: { filename: string; content: string }): Promise<{ saved: boolean; uri: string; filename: string }>;
  /** Read uncaught native Android exceptions persisted by the previous process session. */
  getNativeCrashLog(): Promise<{ content: string }>;
  /** Clear the persisted native Android exception log after it has been exported. */
  clearNativeCrashLog(): Promise<{ cleared: boolean }>;
}

export declare const DskStreaming: DskStreamingPlugin;
