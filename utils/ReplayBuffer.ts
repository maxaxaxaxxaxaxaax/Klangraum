/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * A ring buffer that stores the last 60 seconds of audio for replay.
 * Audio is continuously recorded and older audio is overwritten.
 */
export class ReplayBuffer {
  private readonly sampleRate: number;
  private readonly numChannels: number;
  private readonly bufferDuration: number; // in seconds
  private readonly bufferSize: number; // total samples per channel
  
  // Separate buffers for each channel
  private leftChannel: Float32Array;
  private rightChannel: Float32Array;
  
  // Current write position in the ring buffer
  private writePosition: number = 0;
  
  // Total samples written (for tracking if buffer is full)
  private totalSamplesWritten: number = 0;
  
  // Flag to track if currently playing replay
  private isPlaying: boolean = false;
  private currentSource: AudioBufferSourceNode | null = null;

  constructor(
    sampleRate: number = 48000,
    numChannels: number = 2,
    bufferDuration: number = 60
  ) {
    this.sampleRate = sampleRate;
    this.numChannels = numChannels;
    this.bufferDuration = bufferDuration;
    this.bufferSize = sampleRate * bufferDuration;
    
    // Initialize buffers
    this.leftChannel = new Float32Array(this.bufferSize);
    this.rightChannel = new Float32Array(this.bufferSize);
  }

  /**
   * Write audio data to the ring buffer.
   * @param audioBuffer The AudioBuffer containing audio data to write
   */
  writeAudioBuffer(audioBuffer: AudioBuffer): void {
    const leftData = audioBuffer.getChannelData(0);
    const rightData = audioBuffer.numberOfChannels > 1 
      ? audioBuffer.getChannelData(1) 
      : leftData; // Mono fallback
    
    const samplesToWrite = leftData.length;
    
    for (let i = 0; i < samplesToWrite; i++) {
      this.leftChannel[this.writePosition] = leftData[i];
      this.rightChannel[this.writePosition] = rightData[i];
      
      this.writePosition = (this.writePosition + 1) % this.bufferSize;
      this.totalSamplesWritten++;
    }
  }

  /**
   * Write interleaved Float32 audio data to the ring buffer.
   * @param interleavedData Interleaved stereo audio data
   */
  writeInterleavedData(interleavedData: Float32Array): void {
    const samplesPerChannel = interleavedData.length / this.numChannels;
    
    for (let i = 0; i < samplesPerChannel; i++) {
      this.leftChannel[this.writePosition] = interleavedData[i * 2];
      this.rightChannel[this.writePosition] = interleavedData[i * 2 + 1];
      
      this.writePosition = (this.writePosition + 1) % this.bufferSize;
      this.totalSamplesWritten++;
    }
  }

  /**
   * Get the current buffer content as an AudioBuffer for playback.
   * @param audioContext The AudioContext to create the buffer with
   * @returns AudioBuffer containing the replay audio
   */
  getAudioBuffer(audioContext: AudioContext): AudioBuffer {
    // Calculate how many valid samples we have
    const validSamples = Math.min(this.totalSamplesWritten, this.bufferSize);
    
    if (validSamples === 0) {
      // Return empty buffer if nothing recorded
      return audioContext.createBuffer(this.numChannels, 1, this.sampleRate);
    }
    
    // Create the output buffer
    const outputBuffer = audioContext.createBuffer(
      this.numChannels,
      validSamples,
      this.sampleRate
    );
    
    const leftOut = outputBuffer.getChannelData(0);
    const rightOut = outputBuffer.getChannelData(1);
    
    if (this.totalSamplesWritten <= this.bufferSize) {
      // Buffer not yet wrapped - just copy from start
      leftOut.set(this.leftChannel.subarray(0, validSamples));
      rightOut.set(this.rightChannel.subarray(0, validSamples));
    } else {
      // Buffer has wrapped - need to reorder
      // Read from writePosition to end, then from 0 to writePosition
      const firstPartLength = this.bufferSize - this.writePosition;
      
      // Copy first part (from writePosition to end)
      leftOut.set(this.leftChannel.subarray(this.writePosition), 0);
      rightOut.set(this.rightChannel.subarray(this.writePosition), 0);
      
      // Copy second part (from 0 to writePosition)
      leftOut.set(this.leftChannel.subarray(0, this.writePosition), firstPartLength);
      rightOut.set(this.rightChannel.subarray(0, this.writePosition), firstPartLength);
    }
    
    return outputBuffer;
  }

  /**
   * Play the replay buffer through the given AudioContext.
   * @param audioContext The AudioContext to use for playback
   * @param destination The AudioNode to connect to (default: audioContext.destination)
   * @returns Promise that resolves when playback ends
   */
  async play(
    audioContext: AudioContext,
    destination: AudioNode = audioContext.destination
  ): Promise<void> {
    // Stop any existing playback
    this.stop();
    
    const buffer = this.getAudioBuffer(audioContext);
    
    if (buffer.length <= 1) {
      console.warn('ReplayBuffer: No audio to play');
      return;
    }
    
    return new Promise((resolve) => {
      this.currentSource = audioContext.createBufferSource();
      this.currentSource.buffer = buffer;
      this.currentSource.connect(destination);
      
      this.isPlaying = true;
      
      this.currentSource.onended = () => {
        this.isPlaying = false;
        this.currentSource = null;
        resolve();
      };
      
      this.currentSource.start();
    });
  }

  /**
   * Stop current replay playback.
   */
  stop(): void {
    if (this.currentSource) {
      try {
        this.currentSource.stop();
      } catch (e) {
        // Ignore errors if already stopped
      }
      this.currentSource = null;
    }
    this.isPlaying = false;
  }

  /**
   * Check if replay is currently playing.
   */
  getIsPlaying(): boolean {
    return this.isPlaying;
  }

  /**
   * Get the duration of recorded audio in seconds.
   */
  getRecordedDuration(): number {
    const validSamples = Math.min(this.totalSamplesWritten, this.bufferSize);
    return validSamples / this.sampleRate;
  }

  /**
   * Download the replay buffer as a WAV file.
   * @param filename The filename for the download (default: 'replay.wav')
   */
  downloadAsWav(filename: string = 'klanggraum-replay.wav'): void {
    const validSamples = Math.min(this.totalSamplesWritten, this.bufferSize);
    
    if (validSamples === 0) {
      console.warn('ReplayBuffer: No audio to download');
      return;
    }
    
    // Prepare ordered audio data
    const leftData = new Float32Array(validSamples);
    const rightData = new Float32Array(validSamples);
    
    if (this.totalSamplesWritten <= this.bufferSize) {
      leftData.set(this.leftChannel.subarray(0, validSamples));
      rightData.set(this.rightChannel.subarray(0, validSamples));
    } else {
      const firstPartLength = this.bufferSize - this.writePosition;
      leftData.set(this.leftChannel.subarray(this.writePosition), 0);
      rightData.set(this.rightChannel.subarray(this.writePosition), 0);
      leftData.set(this.leftChannel.subarray(0, this.writePosition), firstPartLength);
      rightData.set(this.rightChannel.subarray(0, this.writePosition), firstPartLength);
    }
    
    // Encode as WAV
    const wavBlob = this.encodeWav(leftData, rightData, this.sampleRate);
    
    // Create download link
    const url = URL.createObjectURL(wavBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  /**
   * Encode stereo audio data as a WAV file.
   */
  private encodeWav(
    leftChannel: Float32Array,
    rightChannel: Float32Array,
    sampleRate: number
  ): Blob {
    const numChannels = 2;
    const bitsPerSample = 16;
    const bytesPerSample = bitsPerSample / 8;
    const numSamples = leftChannel.length;
    const dataSize = numSamples * numChannels * bytesPerSample;
    const fileSize = 44 + dataSize;
    
    const buffer = new ArrayBuffer(fileSize);
    const view = new DataView(buffer);
    
    // RIFF header
    this.writeString(view, 0, 'RIFF');
    view.setUint32(4, fileSize - 8, true);
    this.writeString(view, 8, 'WAVE');
    
    // fmt chunk
    this.writeString(view, 12, 'fmt ');
    view.setUint32(16, 16, true); // chunk size
    view.setUint16(20, 1, true); // PCM format
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * numChannels * bytesPerSample, true); // byte rate
    view.setUint16(32, numChannels * bytesPerSample, true); // block align
    view.setUint16(34, bitsPerSample, true);
    
    // data chunk
    this.writeString(view, 36, 'data');
    view.setUint32(40, dataSize, true);
    
    // Write interleaved audio data
    let offset = 44;
    for (let i = 0; i < numSamples; i++) {
      // Clamp and convert to 16-bit
      const leftSample = Math.max(-1, Math.min(1, leftChannel[i]));
      const rightSample = Math.max(-1, Math.min(1, rightChannel[i]));
      
      view.setInt16(offset, leftSample < 0 ? leftSample * 0x8000 : leftSample * 0x7FFF, true);
      offset += 2;
      view.setInt16(offset, rightSample < 0 ? rightSample * 0x8000 : rightSample * 0x7FFF, true);
      offset += 2;
    }
    
    return new Blob([buffer], { type: 'audio/wav' });
  }

  /**
   * Write a string to a DataView.
   */
  private writeString(view: DataView, offset: number, string: string): void {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  }

  /**
   * Clear the buffer and reset state.
   */
  clear(): void {
    this.stop();
    this.leftChannel.fill(0);
    this.rightChannel.fill(0);
    this.writePosition = 0;
    this.totalSamplesWritten = 0;
  }
}
