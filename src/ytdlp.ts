import { spawn } from 'child_process';
import { type Readable } from 'stream';

export async function getVideoInfo(url: string): Promise<{ title: string }> {
  return new Promise((resolve, reject) => {
    let output = '';
    const proc = spawn('yt-dlp', ['--dump-json', '--no-playlist', url]);
    proc.stdout.on('data', (chunk: Buffer) => { output += chunk.toString(); });
    proc.stderr.on('data', (chunk: Buffer) => { process.stderr.write(chunk); });
    proc.on('close', (code) => {
      if (code !== 0) return reject(new Error(`yt-dlp exited with code ${code}`));
      try {
        const info = JSON.parse(output) as { title: string };
        resolve({ title: info.title });
      } catch {
        reject(new Error('Failed to parse yt-dlp output'));
      }
    });
    proc.on('error', reject);
  });
}

// Pipes yt-dlp audio output to a stream — @discordjs/voice uses ffmpeg to transcode it
export function createYtDlpStream(url: string): Readable {
  const proc = spawn('yt-dlp', ['-f', 'bestaudio/best', '--no-playlist', '-o', '-', url]);
  proc.stderr.on('data', (chunk: Buffer) => { process.stderr.write(chunk); });
  proc.on('error', (err) => { console.error('yt-dlp spawn error:', err.message); });
  return proc.stdout;
}
