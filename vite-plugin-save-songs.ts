/**
 * Vite plugin to save KIE.ai generated songs locally
 */
import type { Plugin } from 'vite';
import fs from 'fs';
import path from 'path';
import https from 'https';
import http from 'http';

const SONGS_DIR = path.resolve(__dirname, 'Songs');

// Ensure Songs directory exists
if (!fs.existsSync(SONGS_DIR)) {
  fs.mkdirSync(SONGS_DIR, { recursive: true });
}

function downloadFile(url: string, destPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http;
    const file = fs.createWriteStream(destPath);

    protocol.get(url, (response) => {
      // Handle redirects
      if (response.statusCode === 301 || response.statusCode === 302) {
        const redirectUrl = response.headers.location;
        if (redirectUrl) {
          file.close();
          fs.unlinkSync(destPath);
          downloadFile(redirectUrl, destPath).then(resolve).catch(reject);
          return;
        }
      }

      if (response.statusCode !== 200) {
        file.close();
        fs.unlinkSync(destPath);
        reject(new Error(`Failed to download: ${response.statusCode}`));
        return;
      }

      response.pipe(file);
      file.on('finish', () => {
        file.close();
        resolve();
      });
    }).on('error', (err) => {
      file.close();
      fs.unlinkSync(destPath);
      reject(err);
    });
  });
}

export function saveSongsPlugin(): Plugin {
  return {
    name: 'save-songs-plugin',
    configureServer(server) {
      // API endpoint to save a song
      server.middlewares.use('/api/save-song', async (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405;
          res.end('Method not allowed');
          return;
        }

        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', async () => {
          try {
            const { audio_url, image_url, songId } = JSON.parse(body);

            if (!audio_url || !songId) {
              res.statusCode = 400;
              res.end(JSON.stringify({ error: 'Missing audio_url or songId' }));
              return;
            }

            const timestamp = Date.now();
            const audioFileName = `song-${songId}-${timestamp}.mp3`;
            const imageFileName = `cover-${songId}-${timestamp}.jpg`;

            const audioPath = path.join(SONGS_DIR, audioFileName);
            const imagePath = path.join(SONGS_DIR, imageFileName);

            // Download audio file
            await downloadFile(audio_url, audioPath);

            // Download image file if provided
            if (image_url) {
              await downloadFile(image_url, imagePath);
            }

            res.statusCode = 200;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({
              success: true,
              audioPath: `/Songs/${audioFileName}`,
              imagePath: image_url ? `/Songs/${imageFileName}` : null,
              audioFileName,
              imageFileName: image_url ? imageFileName : null,
            }));
          } catch (error) {
            console.error('Error saving song:', error);
            res.statusCode = 500;
            res.end(JSON.stringify({ error: String(error) }));
          }
        });
      });

      // API endpoint to list saved songs
      server.middlewares.use('/api/list-songs', (req, res) => {
        if (req.method !== 'GET') {
          res.statusCode = 405;
          res.end('Method not allowed');
          return;
        }

        try {
          const files = fs.readdirSync(SONGS_DIR);
          const songs: Array<{ audioPath: string; imagePath: string | null; songId: string; timestamp: number }> = [];

          // Group files by songId and timestamp
          const audioFiles = files.filter(f => f.startsWith('song-') && f.endsWith('.mp3'));

          for (const audioFile of audioFiles) {
            // Parse: song-{songId}-{timestamp}.mp3
            const match = audioFile.match(/^song-(.+)-(\d+)\.mp3$/);
            if (match) {
              const songId = match[1];
              const timestamp = parseInt(match[2], 10);
              const imageFile = `cover-${songId}-${timestamp}.jpg`;
              const hasImage = files.includes(imageFile);

              songs.push({
                audioPath: `/Songs/${audioFile}`,
                imagePath: hasImage ? `/Songs/${imageFile}` : null,
                songId,
                timestamp,
              });
            }
          }

          // Sort by timestamp descending (newest first)
          songs.sort((a, b) => b.timestamp - a.timestamp);

          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ songs }));
        } catch (error) {
          console.error('Error listing songs:', error);
          res.statusCode = 500;
          res.end(JSON.stringify({ error: String(error) }));
        }
      });

      // API endpoint to delete a song
      server.middlewares.use('/api/delete-song', async (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405;
          res.end('Method not allowed');
          return;
        }

        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', () => {
          try {
            const { audioPath, imagePath } = JSON.parse(body);

            if (audioPath) {
              const fullAudioPath = path.join(__dirname, audioPath);
              if (fs.existsSync(fullAudioPath)) {
                fs.unlinkSync(fullAudioPath);
              }
            }

            if (imagePath) {
              const fullImagePath = path.join(__dirname, imagePath);
              if (fs.existsSync(fullImagePath)) {
                fs.unlinkSync(fullImagePath);
              }
            }

            res.statusCode = 200;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ success: true }));
          } catch (error) {
            console.error('Error deleting song:', error);
            res.statusCode = 500;
            res.end(JSON.stringify({ error: String(error) }));
          }
        });
      });
    },
  };
}
