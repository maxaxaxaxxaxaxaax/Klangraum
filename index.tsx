/**
 * @fileoverview Control real time music with a MIDI controller
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { PlaybackState, Prompt } from './types';
import { GoogleGenAI, LiveMusicFilteredPrompt } from '@google/genai';
import { PromptDjMidi } from './components/PromptDjMidi';
import { ToastMessage } from './components/ToastMessage';
import { LiveMusicHelper } from './utils/LiveMusicHelper';
import { AudioAnalyser } from './utils/AudioAnalyser';
import { GeminiAgent } from './utils/GeminiAgent';
import { generateSongFromBlob } from './utils/KieApiClient';
import mainGenresData from './main-genres.json';

// KIE.ai API Key
const kieApiKey = import.meta.env.VITE_KIE_API_KEY || '';

const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
if (!apiKey || apiKey.trim() === '') {
  throw new Error('VITE_GEMINI_API_KEY is not set. Please create a .env.local file with VITE_GEMINI_API_KEY=your_api_key (get one at https://aistudio.google.com/apikey)');
}

const ai = new GoogleGenAI({ apiKey, apiVersion: 'v1alpha' });
const model = 'lyria-realtime-exp';

// Initialize Gemini AI Agent with the same API key
// Genre data is automatically included in the system instruction
export const geminiAgent = new GeminiAgent(apiKey, {
  model: 'gemini-2.5-flash', // Use gemini-2.5-flash
  temperature: 0.7,
  includeGenreData: true, // Include main-genres.json and sub-genres.json in context
});

function main() {
  const initialPrompts = buildInitialPrompts();

  const pdjMidi = new PromptDjMidi(initialPrompts);
  document.body.appendChild(pdjMidi);

  const toastMessage = new ToastMessage();
  document.body.appendChild(toastMessage);

  const liveMusicHelper = new LiveMusicHelper(ai, model);
  liveMusicHelper.setWeightedPrompts(initialPrompts);

  const audioAnalyser = new AudioAnalyser(liveMusicHelper.audioContext);
  liveMusicHelper.extraDestination = audioAnalyser.node;

  pdjMidi.addEventListener('prompts-changed', ((e: Event) => {
    const customEvent = e as CustomEvent<Map<string, Prompt>>;
    const prompts = customEvent.detail;
    liveMusicHelper.setWeightedPrompts(prompts);
  }));

  pdjMidi.addEventListener('play-pause', () => {
    liveMusicHelper.playPause();
  });

  pdjMidi.addEventListener('volume-changed', ((e: Event) => {
    const customEvent = e as CustomEvent<number>;
    const volume = customEvent.detail;
    liveMusicHelper.setVolume(volume);
  }));

  pdjMidi.addEventListener('reseed', () => {
    liveMusicHelper.reseed();
  });

  // Replay buffer modal events
  pdjMidi.addEventListener('replay-get-duration', () => {
    const duration = liveMusicHelper.getReplayDuration();
    pdjMidi.setReplayDuration(duration);
  });

  pdjMidi.addEventListener('replay-play', async () => {
    const duration = liveMusicHelper.getReplayDuration();
    if (duration < 1) {
      toastMessage.show('Keine Aufnahme vorhanden.');
      return;
    }
    
    // Play the replay buffer
    await liveMusicHelper.playReplay();
    
    // Notify UI that playback ended
    pdjMidi.onReplayEnded();
  });

  pdjMidi.addEventListener('replay-stop', () => {
    liveMusicHelper.stopReplay();
  });

  pdjMidi.addEventListener('replay-download', () => {
    const duration = liveMusicHelper.getReplayDuration();
    if (duration < 1) {
      toastMessage.show('Keine Aufnahme zum Herunterladen.');
      return;
    }
    liveMusicHelper.downloadReplay();
    toastMessage.show('Download gestartet!');
  });

  // Audio preview playback state
  let previewSource: AudioBufferSourceNode | null = null;

  // Audio preview play (cropped section)
  pdjMidi.addEventListener('replay-preview-play', async (e: Event) => {
    const customEvent = e as CustomEvent<{ startTime: number; endTime: number }>;
    const { startTime, endTime } = customEvent.detail;

    // Stop any existing preview
    if (previewSource) {
      try { previewSource.stop(); } catch (e) { /* ignore */ }
      previewSource = null;
    }

    const replayBuffer = liveMusicHelper.getReplayBuffer();
    const fullBuffer = replayBuffer.getAudioBuffer(liveMusicHelper.audioContext);
    
    if (fullBuffer.length <= 1) {
      pdjMidi.onPreviewEnded();
      return;
    }

    // Calculate sample positions for cropping
    const sampleRate = fullBuffer.sampleRate;
    const startSample = Math.floor(startTime * sampleRate);
    const endSample = Math.floor(endTime * sampleRate);
    const croppedLength = Math.max(1, endSample - startSample);

    // Create cropped buffer
    const croppedBuffer = liveMusicHelper.audioContext.createBuffer(
      fullBuffer.numberOfChannels,
      croppedLength,
      sampleRate
    );

    // Copy cropped data
    for (let channel = 0; channel < fullBuffer.numberOfChannels; channel++) {
      const fullData = fullBuffer.getChannelData(channel);
      const croppedData = croppedBuffer.getChannelData(channel);
      for (let i = 0; i < croppedLength; i++) {
        croppedData[i] = fullData[startSample + i] || 0;
      }
    }

    // Play cropped buffer
    previewSource = liveMusicHelper.audioContext.createBufferSource();
    previewSource.buffer = croppedBuffer;
    previewSource.connect(liveMusicHelper.audioContext.destination);
    
    previewSource.onended = () => {
      previewSource = null;
      pdjMidi.onPreviewEnded();
    };

    await liveMusicHelper.audioContext.resume();
    previewSource.start();
  });

  // Audio preview stop
  pdjMidi.addEventListener('replay-preview-stop', () => {
    if (previewSource) {
      try { previewSource.stop(); } catch (e) { /* ignore */ }
      previewSource = null;
    }
  });

  // Waveform data generation
  pdjMidi.addEventListener('replay-get-waveform', () => {
    const replayBuffer = liveMusicHelper.getReplayBuffer();
    const audioBuffer = replayBuffer.getAudioBuffer(liveMusicHelper.audioContext);
    
    if (audioBuffer.length <= 1) {
      pdjMidi.setWaveformData([]);
      return;
    }
    
    // Generate waveform data by downsampling
    const channelData = audioBuffer.getChannelData(0);
    const numBars = 200; // Number of bars to display
    const samplesPerBar = Math.floor(channelData.length / numBars);
    const waveformData: number[] = [];
    
    for (let i = 0; i < numBars; i++) {
      const startSample = i * samplesPerBar;
      const endSample = Math.min(startSample + samplesPerBar, channelData.length);
      
      // Calculate average absolute amplitude for this segment
      let sum = 0;
      for (let j = startSample; j < endSample; j++) {
        sum += Math.abs(channelData[j]);
      }
      const avg = sum / (endSample - startSample);
      waveformData.push(avg);
    }
    
    // Normalize to 0-1 range
    const maxValue = Math.max(...waveformData, 0.001);
    const normalizedData = waveformData.map(v => v / maxValue);
    
    pdjMidi.setWaveformData(normalizedData);
  });

  // KIE.ai song generation
  pdjMidi.addEventListener('kie-generate-song', async (e: Event) => {
    const customEvent = e as CustomEvent<{ style: string; lyrics: string; cropStart: number; cropEnd: number }>;
    const { style, lyrics, cropStart, cropEnd } = customEvent.detail || { style: '', lyrics: '', cropStart: 0, cropEnd: 60 };

    if (!kieApiKey) {
      toastMessage.show('KIE.ai API-Key nicht konfiguriert. Bitte VITE_KIE_API_KEY in .env.local setzen.');
      pdjMidi.setKieStatus('error', 'API-Key nicht konfiguriert');
      return;
    }

    const duration = liveMusicHelper.getReplayDuration();
    if (duration < 1) {
      toastMessage.show('Keine Aufnahme vorhanden.');
      pdjMidi.setKieStatus('error', 'Keine Aufnahme vorhanden');
      return;
    }

    try {
      // Get audio buffer from replay buffer
      const replayBuffer = liveMusicHelper.getReplayBuffer();
      const fullBuffer = replayBuffer.getAudioBuffer(liveMusicHelper.audioContext);
      
      // Crop the audio buffer
      const sampleRate = fullBuffer.sampleRate;
      const startSample = Math.floor(cropStart * sampleRate);
      const endSample = Math.floor(cropEnd * sampleRate);
      const croppedLength = Math.max(1, endSample - startSample);

      const croppedBuffer = liveMusicHelper.audioContext.createBuffer(
        fullBuffer.numberOfChannels,
        croppedLength,
        sampleRate
      );

      for (let channel = 0; channel < fullBuffer.numberOfChannels; channel++) {
        const fullData = fullBuffer.getChannelData(channel);
        const croppedData = croppedBuffer.getChannelData(channel);
        for (let i = 0; i < croppedLength; i++) {
          croppedData[i] = fullData[startSample + i] || 0;
        }
      }

      // Convert cropped AudioBuffer to WAV Blob
      const wavBlob = audioBufferToWavBlob(croppedBuffer);

      // Determine if instrumental (no lyrics provided)
      const isInstrumental = !lyrics || lyrics.trim().length === 0;

      // Generate song using KIE.ai
      const songs = await generateSongFromBlob(
        kieApiKey,
        wavBlob,
        { 
          instrumental: isInstrumental,
          style: style || undefined,
          prompt: lyrics || undefined,
        },
        (status, message) => {
          pdjMidi.setKieStatus(status, message);
        }
      );

      // Set the generated songs
      pdjMidi.setKieGeneratedSongs(songs);
      toastMessage.show('Songs erfolgreich generiert!');

    } catch (error) {
      console.error('KIE.ai generation error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unbekannter Fehler';
      pdjMidi.setKieStatus('error', errorMessage);
      toastMessage.show(`Fehler: ${errorMessage}`);
    }
  });

  liveMusicHelper.addEventListener('playback-state-changed', ((e: Event) => {
    const customEvent = e as CustomEvent<PlaybackState>;
    const playbackState = customEvent.detail;
    pdjMidi.playbackState = playbackState;
    playbackState === 'playing' ? audioAnalyser.start() : audioAnalyser.stop();
  }));

  liveMusicHelper.addEventListener('filtered-prompt', ((e: Event) => {
    const customEvent = e as CustomEvent<LiveMusicFilteredPrompt>;
    const filteredPrompt = customEvent.detail;
    toastMessage.show(filteredPrompt.filteredReason!)
    pdjMidi.addFilteredPrompt(filteredPrompt.text!);
  }));

  const errorToast = ((e: Event) => {
    const customEvent = e as CustomEvent<string>;
    const error = customEvent.detail;
    toastMessage.show(error);
  });

  liveMusicHelper.addEventListener('error', errorToast);
  pdjMidi.addEventListener('error', errorToast);

  audioAnalyser.addEventListener('audio-level-changed', ((e: Event) => {
    const customEvent = e as CustomEvent<number>;
    const level = customEvent.detail;
    pdjMidi.audioLevel = level;
  }));

}

function hslToHex(h: number, s: number, l: number): string {
  l /= 100;
  const a = s * Math.min(l, 1 - l) / 100;
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * color).toString(16).padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

/**
 * Convert an AudioBuffer to a WAV Blob
 */
function audioBufferToWavBlob(audioBuffer: AudioBuffer): Blob {
  const numChannels = audioBuffer.numberOfChannels;
  const sampleRate = audioBuffer.sampleRate;
  const bitsPerSample = 16;
  const bytesPerSample = bitsPerSample / 8;
  const numSamples = audioBuffer.length;
  const dataSize = numSamples * numChannels * bytesPerSample;
  const fileSize = 44 + dataSize;

  const buffer = new ArrayBuffer(fileSize);
  const view = new DataView(buffer);

  // Helper to write string
  const writeString = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  // RIFF header
  writeString(0, 'RIFF');
  view.setUint32(4, fileSize - 8, true);
  writeString(8, 'WAVE');

  // fmt chunk
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * numChannels * bytesPerSample, true);
  view.setUint16(32, numChannels * bytesPerSample, true);
  view.setUint16(34, bitsPerSample, true);

  // data chunk
  writeString(36, 'data');
  view.setUint32(40, dataSize, true);

  // Get channel data
  const leftChannel = audioBuffer.getChannelData(0);
  const rightChannel = numChannels > 1 ? audioBuffer.getChannelData(1) : leftChannel;

  // Write interleaved audio data
  let offset = 44;
  for (let i = 0; i < numSamples; i++) {
    const leftSample = Math.max(-1, Math.min(1, leftChannel[i]));
    const rightSample = Math.max(-1, Math.min(1, rightChannel[i]));

    view.setInt16(offset, leftSample < 0 ? leftSample * 0x8000 : leftSample * 0x7FFF, true);
    offset += 2;
    if (numChannels > 1) {
      view.setInt16(offset, rightSample < 0 ? rightSample * 0x8000 : rightSample * 0x7FFF, true);
      offset += 2;
    }
  }

  return new Blob([buffer], { type: 'audio/wav' });
}

function buildInitialPrompts(): Map<string, Prompt> {
  const mainGenres = mainGenresData as any[];
  
  if (mainGenres.length === 0) {
    console.warn('No genres loaded, using empty prompts');
    return new Map();
  }

  // Pick 3 random genres to start at weight = 1
  const startOn = [...mainGenres]
    .sort(() => Math.random() - 0.5)
    .slice(0, 3);

  const prompts = new Map<string, Prompt>();

  for (let i = 0; i < mainGenres.length; i++) {
    const genre = mainGenres[i];
    const promptId = `prompt-${genre.id}`;
    // Convert colorHue to HSL color (using high saturation and medium lightness for vibrant colors)
    const color = hslToHex(genre.colorHue, 100, 50);
    
    prompts.set(promptId, {
      promptId,
      text: genre.prompt, // Use the prompt text from JSON, not just the name
      weight: startOn.includes(genre) ? 1 : 0,
      cc: i,
      color,
    });
  }

  return prompts;
}

main();
