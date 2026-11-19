import { execFile } from 'node:child_process';

export function containsObs(output: string, windows: boolean): boolean | null {
  if (!output.trim()) return null;
  const names = output.split(/\r?\n/).map((line) => windows ? line.split(',')[0]?.replace(/^"|"$/g, '') : line.trim().split('/').pop());
  return names.some((name) => /^(obs|obs64|obs32)(\.exe)?$/i.test(name ?? ''));
}

/** Only process names are inspected; command-line arguments and window titles are not read. */
export function obsRunning(): Promise<boolean | null> {
  const windows = process.platform === 'win32';
  const executable = windows ? 'tasklist.exe' : 'ps';
  const args = windows ? ['/FO', 'CSV', '/NH'] : ['-A', '-o', 'comm='];
  return new Promise((resolve) => {
    execFile(executable, args, { timeout: 5000, maxBuffer: 1024 * 1024 }, (error, stdout) => {
      if (error) return resolve(null);
      resolve(containsObs(stdout, windows));
    });
  });
}
