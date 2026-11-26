export type AudioMeterReading = {
  /** RMS level in dBFS. -Infinity means digital silence. */
  rmsDb: number;
  /** Sample peak in dBFS. -Infinity means digital silence. */
  peakDb: number;
};

export type IsoTapPoint = 'pre-fader' | 'post-fader';

export type AudioChannelSnapshot = {
  id: number;
  name: string;
  gain: number;
  pan: number;
  muted: boolean;
  meter: AudioMeterReading;
};

export type AudioInputDevice = {
  deviceId: string;
  label: string;
  groupId: string;
};

export type AudioChannelOutput = {
  channelId: number;
  tapPoint: IsoTapPoint;
  stream: MediaStream;
};

export type AudioEngineOptions = {
  channelCount?: number;
  context?: AudioContext;
};

export const DEFAULT_AUDIO_CHANNEL_COUNT = 8;
export const MAX_AUDIO_CHANNEL_COUNT = 32;

/**
 * Web Audio based mixer core.
 *
 * This class deliberately does not own the UI or network transport. It exposes
 * real input streams, a stereo program stream, per-channel ISO tap points and
 * measured meters. Sending those streams to OBS is a separate transport layer.
 */
export class AudioEngine {
  private readonly context: AudioContext;
  private readonly ownsContext: boolean;
  private readonly channels = new Map<number, ChannelGraph>();
  private readonly mediaElementSources = new WeakMap<HTMLMediaElement, MediaElementAudioSourceNode>();
  // Keep analyser sample buffers between meter refreshes to avoid repeated allocations.
  private readonly meterBuffers = new WeakMap<AnalyserNode, Float32Array<ArrayBuffer>>();
  private readonly masterGain: GainNode;
  private readonly masterAnalyser: AnalyserNode;
  private readonly masterSplitter: ChannelSplitterNode;
  private readonly masterLeftAnalyser: AnalyserNode;
  private readonly masterRightAnalyser: AnalyserNode;
  private readonly programDestination: MediaStreamAudioDestinationNode;
  private readonly localMonitorGain: GainNode;
  private disposed = false;

  constructor(options: AudioEngineOptions = {}) {
    const channelCount = options.channelCount ?? DEFAULT_AUDIO_CHANNEL_COUNT;
    if (!Number.isInteger(channelCount) || channelCount < 1 || channelCount > MAX_AUDIO_CHANNEL_COUNT) {
      throw new RangeError(`channelCount must be an integer between 1 and ${MAX_AUDIO_CHANNEL_COUNT}`);
    }

    this.ownsContext = !options.context;
    this.context = options.context ?? new AudioContext({ latencyHint: 'interactive' });
    this.masterGain = this.context.createGain();
    this.masterAnalyser = this.context.createAnalyser();
    this.masterAnalyser.fftSize = 2048;
    this.masterSplitter = this.context.createChannelSplitter(2);
    this.masterLeftAnalyser = this.context.createAnalyser();
    this.masterRightAnalyser = this.context.createAnalyser();
    this.masterLeftAnalyser.fftSize = 2048;
    this.masterRightAnalyser.fftSize = 2048;
    this.programDestination = this.context.createMediaStreamDestination();
    this.localMonitorGain = this.context.createGain();
    this.localMonitorGain.gain.value = 0.8;

    this.masterGain.connect(this.masterAnalyser);
    this.masterAnalyser.connect(this.programDestination);
    // Local monitoring is independent from the PGM stream sent to streaming/recording.
    // Android routes context.destination to the active speaker or connected headset.
    this.masterGain.connect(this.localMonitorGain);
    this.localMonitorGain.connect(this.context.destination);
    this.masterGain.connect(this.masterSplitter);
    this.masterSplitter.connect(this.masterLeftAnalyser, 0);
    this.masterSplitter.connect(this.masterRightAnalyser, 1);

    for (let id = 1; id <= channelCount; id += 1) {
      this.createChannel(id, `CH ${id}`);
    }
  }

  get sampleRate(): number {
    return this.context.sampleRate;
  }

  get state(): AudioContextState {
    return this.context.state;
  }

  get channelCount(): number {
    return this.channels.size;
  }

  getConnectedChannelCount(): number {
    this.assertActive();
    return [...this.channels.values()].filter((channel) => channel.source !== null).length;
  }

  getProgramStream(): MediaStream {
    this.assertActive();
    return this.programDestination.stream;
  }

  getChannelOutput(channelId: number, tapPoint: IsoTapPoint): AudioChannelOutput {
    const channel = this.getChannel(channelId);
    const destination = tapPoint === 'pre-fader' ? channel.isoPreDestination : channel.isoPostDestination;
    return { channelId, tapPoint, stream: destination.stream };
  }

  async resume(): Promise<void> {
    this.assertActive();
    if (this.context.state === 'suspended') await this.context.resume();
  }

  async suspend(): Promise<void> {
    this.assertActive();
    if (this.context.state === 'running') await this.context.suspend();
  }

  async listInputDevices(): Promise<AudioInputDevice[]> {
    this.assertActive();
    if (!navigator.mediaDevices?.enumerateDevices) {
      throw new Error('Audio input enumeration is not available in this Android/WebView context.');
    }

    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices
      .filter((device) => device.kind === 'audioinput')
      .map((device, index) => ({
        deviceId: device.deviceId,
        label: device.label || `Audio input ${index + 1}`,
        groupId: device.groupId
      }));
  }

  async requestInputStream(deviceId?: string, requestedChannels = 2): Promise<MediaStream> {
    if (!Number.isInteger(requestedChannels) || requestedChannels < 1 || requestedChannels > MAX_AUDIO_CHANNEL_COUNT) {
      throw new RangeError(`requestedChannels must be between 1 and ${MAX_AUDIO_CHANNEL_COUNT}`);
    }
    this.assertActive();
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error('Audio capture is not available in this Android/WebView context.');
    }

    return navigator.mediaDevices.getUserMedia({
      audio: deviceId
        ? { deviceId: { exact: deviceId }, channelCount: { ideal: requestedChannels }, echoCancellation: false, noiseSuppression: false, autoGainControl: false }
        : { channelCount: { ideal: requestedChannels }, echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      video: false
    });
  }

  connectMediaElement(channelId: number, element: HTMLMediaElement): void {
    this.assertActive();
    const channel = this.getChannel(channelId);
    let source = this.mediaElementSources.get(element);
    if (!source) {
      source = this.context.createMediaElementSource(element);
      this.mediaElementSources.set(element, source);
    }
    this.disconnectInput(channelId);
    channel.source = { node: source, outputIndex: 0 };
    source.connect(channel.inputGain);
  }

  connectInput(channelId: number, stream: MediaStream): void {
    this.assertActive();
    const channel = this.getChannel(channelId);
    const audioTracks = stream.getAudioTracks();
    if (audioTracks.length === 0) {
      throw new Error(`The stream assigned to channel ${channelId} contains no audio track.`);
    }

    this.disconnectInput(channelId);
    const source = this.context.createMediaStreamSource(stream);
    channel.source = { node: source, outputIndex: 0 };
    source.connect(channel.inputGain);
  }

  /**
   * Splits one multichannel capture stream into independent mono mixer channels.
   * Returns the number of discrete channels actually exposed by the captured track.
   */
  connectMultichannelInput(startChannelId: number, stream: MediaStream, requestedChannels: number): number {
    this.assertActive();
    if (!Number.isInteger(requestedChannels) || requestedChannels < 1) {
      throw new RangeError('requestedChannels must be a positive integer.');
    }

    const firstChannel = this.getChannel(startChannelId);
    const availableChannels = this.channels.size - startChannelId + 1;
    if (requestedChannels > availableChannels) {
      throw new RangeError(`Only ${availableChannels} mixer channel(s) remain from CH ${startChannelId}.`);
    }

    const audioTrack = stream.getAudioTracks()[0];
    if (!audioTrack) throw new Error('The selected USB stream contains no audio track.');

    const reportedChannels = audioTrack.getSettings().channelCount;
    const actualChannels = Math.max(1, Math.min(
      requestedChannels,
      Number.isInteger(reportedChannels) && reportedChannels! > 0 ? reportedChannels! : requestedChannels
    ));

    if (actualChannels > availableChannels) {
      throw new RangeError('The captured interface exposes more channels than the available mixer inputs.');
    }

    const source = this.context.createMediaStreamSource(stream);
    const splitter = this.context.createChannelSplitter(actualChannels);
    source.connect(splitter);

    const connected: number[] = [];
    try {
      for (let offset = 0; offset < actualChannels; offset += 1) {
        const channelId = startChannelId + offset;
        const channel = this.getChannel(channelId);
        this.disconnectInput(channelId);
        splitter.connect(channel.inputGain, offset, 0);
        channel.source = { node: splitter, outputIndex: offset };
        connected.push(channelId);
      }
    } catch (error) {
      for (const channelId of connected) this.disconnectInput(channelId);
      source.disconnect();
      splitter.disconnect();
      throw error;
    }

    // Retain the source node through the splitter graph; the caller owns stream tracks.
    return connected.length;
  }

  disconnectInput(channelId: number): void {
    const channel = this.getChannel(channelId);
    if (!channel.source) return;
    try {
      channel.source.node.disconnect(channel.inputGain, channel.source.outputIndex, 0);
    } catch {
      // The route may already have been disconnected during stream replacement.
    }
    channel.source = null;
  }

  setChannelName(channelId: number, name: string): void {
    this.getChannel(channelId).name = name.trim() || `CH ${channelId}`;
  }

  setChannelGain(channelId: number, gain: number): void {
    if (!Number.isFinite(gain) || gain < 0 || gain > 2) {
      throw new RangeError('Channel gain must be between 0 and 2.');
    }
    const channel = this.getChannel(channelId);
    channel.gain = gain;
    this.applyChannelGain(channel);
  }

  setChannelMuted(channelId: number, muted: boolean): void {
    const channel = this.getChannel(channelId);
    channel.muted = muted;
    this.applyChannelGain(channel);
  }

  setChannelPan(channelId: number, pan: number): void {
    if (!Number.isFinite(pan) || pan < -1 || pan > 1) {
      throw new RangeError('Pan must be between -1 (left) and 1 (right).');
    }
    const channel = this.getChannel(channelId);
    channel.pan = pan;
    channel.panner.pan.setTargetAtTime(pan, this.context.currentTime, 0.015);
  }

  setMasterGain(gain: number): void {
    if (!Number.isFinite(gain) || gain < 0 || gain > 2) {
      throw new RangeError('Master gain must be between 0 and 2.');
    }
    this.masterGain.gain.setTargetAtTime(gain, this.context.currentTime, 0.015);
  }

  /** Independent local speaker/headphone monitor level; does not change the PGM stream. */
  setLocalMonitorGain(gain: number): void {
    if (!Number.isFinite(gain) || gain < 0 || gain > 2) {
      throw new RangeError('Local monitor gain must be between 0 and 2.');
    }
    this.localMonitorGain.gain.setTargetAtTime(gain, this.context.currentTime, 0.015);
  }

  /** Mutes only the phone/headphone monitor, never the PGM stream. */
  setLocalMonitorMuted(muted: boolean): void {
    this.localMonitorGain.gain.setTargetAtTime(muted ? 0 : 1, this.context.currentTime, 0.015);
  }

  getChannelSnapshot(channelId: number): AudioChannelSnapshot {
    const channel = this.getChannel(channelId);
    return {
      id: channel.id,
      name: channel.name,
      gain: channel.gain,
      pan: channel.pan,
      muted: channel.muted,
      meter: this.readMeter(channel.analyser)
    };
  }

  getMasterMeter(): AudioMeterReading {
    this.assertActive();
    return this.readMeter(this.masterAnalyser);
  }

  /** Independent post-master stereo meters for the left and right PGM channels. */
  getMasterStereoMeters(): { left: AudioMeterReading; right: AudioMeterReading } {
    this.assertActive();
    return {
      left: this.readMeter(this.masterLeftAnalyser),
      right: this.readMeter(this.masterRightAnalyser)
    };
  }

  getAllChannelSnapshots(): AudioChannelSnapshot[] {
    return [...this.channels.keys()].sort((a, b) => a - b).map((id) => this.getChannelSnapshot(id));
  }

  async dispose(): Promise<void> {
    if (this.disposed) return;
    this.disposed = true;

    for (const channel of this.channels.values()) {
      if (channel.source) {
        try {
          channel.source.node.disconnect(channel.inputGain, channel.source.outputIndex, 0);
        } catch {
          // Ignore routes already disconnected.
        }
      }
      channel.inputGain.disconnect();
      channel.preFaderAnalyser.disconnect();
      channel.channelGain.disconnect();
      channel.panner.disconnect();
      channel.analyser.disconnect();
      channel.isoPreDestination.disconnect();
      channel.isoPostDestination.disconnect();
    }

    this.masterGain.disconnect();
    this.masterAnalyser.disconnect();
    this.masterSplitter.disconnect();
    this.masterLeftAnalyser.disconnect();
    this.masterRightAnalyser.disconnect();
    this.programDestination.disconnect();
    this.localMonitorGain.disconnect();

    if (this.ownsContext && this.context.state !== 'closed') {
      await this.context.close();
    }
  }

  private createChannel(id: number, name: string): void {
    const inputGain = this.context.createGain();
    const preFaderAnalyser = this.context.createAnalyser();
    const channelGain = this.context.createGain();
    const panner = this.context.createStereoPanner();
    const analyser = this.context.createAnalyser();
    const isoPreDestination = this.context.createMediaStreamDestination();
    const isoPostDestination = this.context.createMediaStreamDestination();

    preFaderAnalyser.fftSize = 2048;
    analyser.fftSize = 2048;

    inputGain.connect(preFaderAnalyser);
    preFaderAnalyser.connect(isoPreDestination);
    preFaderAnalyser.connect(channelGain);
    channelGain.connect(panner);
    panner.connect(analyser);
    analyser.connect(this.masterGain);
    analyser.connect(isoPostDestination);

    this.channels.set(id, {
      id,
      name,
      inputGain,
      preFaderAnalyser,
      channelGain,
      panner,
      analyser,
      isoPreDestination,
      isoPostDestination,
      source: null,
      gain: 1,
      pan: 0,
      muted: false
    });
  }

  private applyChannelGain(channel: ChannelGraph): void {
    const targetGain = channel.muted ? 0 : channel.gain;
    channel.channelGain.gain.setTargetAtTime(targetGain, this.context.currentTime, 0.015);
  }

  private readMeter(analyser: AnalyserNode): AudioMeterReading {
    let samples = this.meterBuffers.get(analyser);
    if (!samples || samples.length !== analyser.fftSize) {
      samples = new Float32Array(analyser.fftSize);
      this.meterBuffers.set(analyser, samples);
    }
    analyser.getFloatTimeDomainData(samples);

    let sumSquares = 0;
    let peak = 0;
    for (const sample of samples) {
      const absolute = Math.abs(sample);
      sumSquares += sample * sample;
      if (absolute > peak) peak = absolute;
    }

    const rms = Math.sqrt(sumSquares / samples.length);
    const toDb = (value: number) => value <= 0 ? Number.NEGATIVE_INFINITY : 20 * Math.log10(value);
    return { rmsDb: toDb(rms), peakDb: toDb(peak) };
  }

  private getChannel(channelId: number): ChannelGraph {
    this.assertActive();
    const channel = this.channels.get(channelId);
    if (!channel) throw new RangeError(`Audio channel ${channelId} does not exist.`);
    return channel;
  }

  private assertActive(): void {
    if (this.disposed) throw new Error('AudioEngine has been disposed.');
  }
}

type ChannelGraph = {
  id: number;
  name: string;
  inputGain: GainNode;
  preFaderAnalyser: AnalyserNode;
  channelGain: GainNode;
  panner: StereoPannerNode;
  analyser: AnalyserNode;
  isoPreDestination: MediaStreamAudioDestinationNode;
  isoPostDestination: MediaStreamAudioDestinationNode;
  source: { node: AudioNode; outputIndex: number } | null;
  gain: number;
  pan: number;
  muted: boolean;
};
