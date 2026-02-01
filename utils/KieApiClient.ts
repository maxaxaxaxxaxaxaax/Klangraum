/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * KIE.ai API Client for song generation from audio input.
 * Uses file.io for temporary audio hosting.
 */

// API Endpoints
const KIE_GENERATE_URL = 'https://api.kie.ai/api/v1/generate/upload-cover';
const KIE_STATUS_URL = 'https://api.kie.ai/api/v1/generate/record-info';
const FILE_IO_URL = 'https://file.io';

// Types
export interface KieGenerateOptions {
  title?: string;
  style?: string;
  negativeTags?: string;
  audioWeight?: number;
  styleWeight?: number;
  prompt?: string;
  instrumental?: boolean;
}

export interface KieSongResult {
  audio_url: string;
  image_url: string;
  duration: number;
}

export interface KieStatusResponse {
  status: 'SUCCESS' | 'PROCESSING' | 'FAILED' | 'PENDING';
  songs?: KieSongResult[];
  error?: string;
}

export type KieGenerationStatus = 'idle' | 'uploading' | 'generating' | 'polling' | 'complete' | 'error';

/**
 * Upload a Blob to file.io for temporary hosting.
 * Files are automatically deleted after first download.
 */
export async function uploadToFileIo(blob: Blob, filename: string = 'audio.wav'): Promise<string> {
  const formData = new FormData();
  formData.append('file', blob, filename);
  
  const response = await fetch(FILE_IO_URL, {
    method: 'POST',
    body: formData,
  });
  
  if (!response.ok) {
    throw new Error(`file.io upload failed: ${response.status} ${response.statusText}`);
  }
  
  const data = await response.json();
  
  if (!data.success) {
    throw new Error(`file.io upload failed: ${data.message || 'Unknown error'}`);
  }
  
  return data.link;
}

/**
 * Start song generation with KIE.ai API.
 * Returns the taskId for status polling.
 */
export async function generateSong(
  apiKey: string,
  audioUrl: string,
  options: KieGenerateOptions = {}
): Promise<string> {
  const payload = {
    uploadUrl: audioUrl,
    customMode: !!(options.prompt || options.style),
    instrumental: options.instrumental ?? true,
    model: 'V5',
    title: options.title || '',
    style: options.style || '',
    negativeTags: options.negativeTags || '',
    audioWeight: options.audioWeight ?? 0.8,
    styleWeight: options.styleWeight ?? 0.5,
    prompt: options.prompt || '',
  };
  
  const response = await fetch(KIE_GENERATE_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`KIE.ai generation failed: ${response.status} - ${errorText}`);
  }
  
  const data = await response.json();
  
  if (!data.data?.taskId) {
    throw new Error('KIE.ai did not return a taskId');
  }
  
  return data.data.taskId;
}

/**
 * Check the status of a song generation task.
 */
export async function checkStatus(apiKey: string, taskId: string): Promise<KieStatusResponse> {
  const response = await fetch(`${KIE_STATUS_URL}?taskId=${taskId}`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`KIE.ai status check failed: ${response.status} - ${errorText}`);
  }
  
  const data = await response.json();
  
  const status = data.data?.status || 'PENDING';
  
  if (status === 'SUCCESS') {
    const sunoData = data.data?.response?.sunoData || [];
    return {
      status: 'SUCCESS',
      songs: sunoData.map((song: any) => ({
        audio_url: song.audio_url,
        image_url: song.image_url,
        duration: song.duration,
      })),
    };
  }
  
  if (status === 'FAILED') {
    return {
      status: 'FAILED',
      error: data.data?.error || 'Generation failed',
    };
  }
  
  return { status };
}

/**
 * Poll for task completion.
 * @param apiKey KIE.ai API key
 * @param taskId Task ID from generateSong
 * @param onStatusChange Callback for status updates
 * @param intervalMs Polling interval in milliseconds (default 5000)
 * @param maxAttempts Maximum polling attempts (default 60 = 5 minutes)
 */
export async function pollUntilComplete(
  apiKey: string,
  taskId: string,
  onStatusChange?: (status: KieStatusResponse) => void,
  intervalMs: number = 5000,
  maxAttempts: number = 60
): Promise<KieSongResult[]> {
  let attempts = 0;
  
  return new Promise((resolve, reject) => {
    const poll = async () => {
      attempts++;
      
      if (attempts > maxAttempts) {
        reject(new Error('Polling timeout: Song generation took too long'));
        return;
      }
      
      try {
        const status = await checkStatus(apiKey, taskId);
        
        if (onStatusChange) {
          onStatusChange(status);
        }
        
        if (status.status === 'SUCCESS' && status.songs) {
          resolve(status.songs);
          return;
        }
        
        if (status.status === 'FAILED') {
          reject(new Error(status.error || 'Song generation failed'));
          return;
        }
        
        // Continue polling
        setTimeout(poll, intervalMs);
      } catch (error) {
        reject(error);
      }
    };
    
    poll();
  });
}

/**
 * Complete workflow: Upload audio, generate song, poll for results.
 */
export async function generateSongFromBlob(
  apiKey: string,
  audioBlob: Blob,
  options: KieGenerateOptions = {},
  onStatusChange?: (status: KieGenerationStatus, message?: string) => void
): Promise<KieSongResult[]> {
  try {
    // Step 1: Upload to file.io
    onStatusChange?.('uploading', 'Audio wird hochgeladen...');
    const audioUrl = await uploadToFileIo(audioBlob, 'klanggraum-audio.wav');
    
    // Step 2: Start generation
    onStatusChange?.('generating', 'Song-Generierung gestartet...');
    const taskId = await generateSong(apiKey, audioUrl, options);
    
    // Step 3: Poll for completion
    onStatusChange?.('polling', 'Warte auf Ergebnis...');
    const songs = await pollUntilComplete(apiKey, taskId, (status) => {
      if (status.status === 'PROCESSING') {
        onStatusChange?.('polling', 'Song wird generiert...');
      }
    });
    
    onStatusChange?.('complete', 'Fertig!');
    return songs;
    
  } catch (error) {
    onStatusChange?.('error', error instanceof Error ? error.message : 'Unbekannter Fehler');
    throw error;
  }
}
