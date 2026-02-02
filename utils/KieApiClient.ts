/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * KIE.ai API Client for song generation from audio input.
 * Uses tmpfiles.org for temporary audio hosting.
 */

// API Endpoints
const KIE_GENERATE_URL = 'https://api.kie.ai/api/v1/generate/upload-cover';
const KIE_STATUS_URL = 'https://api.kie.ai/api/v1/generate/record-info';
const TMPFILES_URL = '/proxy/tmpfiles/api/v1/upload';

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
  // Local paths after saving
  localAudioPath?: string;
  localImagePath?: string;
}

export interface KieStatusResponse {
  status: 'SUCCESS' | 'PROCESSING' | 'FAILED' | 'PENDING';
  songs?: KieSongResult[];
  error?: string;
}

export type KieGenerationStatus = 'idle' | 'uploading' | 'generating' | 'polling' | 'complete' | 'error';

/**
 * Upload a Blob to tmpfiles.org for temporary hosting.
 * Files are stored for up to 1 hour.
 */
export async function uploadToFileIo(blob: Blob, filename: string = 'audio.wav'): Promise<string> {
  const formData = new FormData();
  formData.append('file', blob, filename);

  const response = await fetch(TMPFILES_URL, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    throw new Error(`tmpfiles.org upload failed: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();

  if (data.status !== 'success' || !data.data?.url) {
    throw new Error(`tmpfiles.org upload failed: ${data.message || 'Unknown error'}`);
  }

  // Convert to direct download URL: tmpfiles.org/123/file -> tmpfiles.org/dl/123/file
  const url = data.data.url.replace('tmpfiles.org/', 'tmpfiles.org/dl/');
  return url;
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
    callBackUrl: 'https://example.com/webhook',
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
  console.log('KIE.ai response:', JSON.stringify(data, null, 2));

  if (!data.data?.taskId) {
    throw new Error(`KIE.ai did not return a taskId. Response: ${JSON.stringify(data)}`);
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
  console.log('KIE.ai status response:', JSON.stringify(data, null, 2));

  const status = data.data?.status || 'PENDING';

  if (status === 'SUCCESS') {
    const sunoData = data.data?.response?.sunoData || [];
    console.log('KIE.ai sunoData:', JSON.stringify(sunoData, null, 2));
    return {
      status: 'SUCCESS',
      songs: sunoData.map((song: any) => ({
        audio_url: song.audioUrl,
        image_url: song.imageUrl,
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
/**
 * Save a song locally via the Vite dev server API.
 */
export async function saveSongLocally(song: KieSongResult, songId: string): Promise<KieSongResult> {
  try {
    const response = await fetch('/api/save-song', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        audio_url: song.audio_url,
        image_url: song.image_url,
        songId,
      }),
    });

    if (!response.ok) {
      console.warn('Failed to save song locally:', await response.text());
      return song;
    }

    const result = await response.json();
    return {
      ...song,
      localAudioPath: result.audioPath,
      localImagePath: result.imagePath,
    };
  } catch (error) {
    console.warn('Failed to save song locally:', error);
    return song;
  }
}

/**
 * Load locally saved songs from the Songs directory.
 */
export async function loadLocalSongs(): Promise<KieSongResult[]> {
  try {
    const response = await fetch('/api/list-songs');
    if (!response.ok) {
      console.warn('Failed to load local songs:', await response.text());
      return [];
    }

    const data = await response.json();
    return data.songs.map((song: any) => ({
      audio_url: song.audioPath,
      image_url: song.imagePath || '',
      duration: 0, // Duration not stored locally
      localAudioPath: song.audioPath,
      localImagePath: song.imagePath,
    }));
  } catch (error) {
    console.warn('Failed to load local songs:', error);
    return [];
  }
}

/**
 * Delete a locally saved song.
 */
export async function deleteLocalSong(song: KieSongResult): Promise<boolean> {
  try {
    const response = await fetch('/api/delete-song', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        audioPath: song.localAudioPath,
        imagePath: song.localImagePath,
      }),
    });

    return response.ok;
  } catch (error) {
    console.warn('Failed to delete song:', error);
    return false;
  }
}

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

    // Step 4: Save songs locally
    onStatusChange?.('polling', 'Songs werden gespeichert...');
    const savedSongs = await Promise.all(
      songs.map((song, index) => saveSongLocally(song, `${taskId}-${index}`))
    );

    console.log('Final songs to return:', JSON.stringify(savedSongs, null, 2));
    onStatusChange?.('complete', 'Fertig!');
    return savedSongs;

  } catch (error) {
    onStatusChange?.('error', error instanceof Error ? error.message : 'Unbekannter Fehler');
    throw error;
  }
}
