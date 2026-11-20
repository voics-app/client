import { execFile } from 'node:child_process';

export function containsObs(output: string): boolean | null {
  if (!output.trim()) return null;
  const names = output.split(/\r?\n/).map((line) => line.trim().split('/').pop());
  return names.some((name) => /^(obs|obs64|obs32)(\.exe)?$/i.test(name ?? ''));
}

export function windowsObsResult(output: string): boolean | null {
  const result = output.trim();
  return result === '1' ? true : result === '0' ? false : null;
}

/** Only process names are inspected; command-line arguments and window titles are not read. */
export function obsRunning(): Promise<boolean | null> {
  const windows = process.platform === 'win32';
  // tasklist may take over ten seconds on Windows. Get-Process uses the local process API and
  // returns only a boolean to this process, avoiding command lines and window titles entirely.
  const executable = windows ? 'powershell.exe' : 'ps';
  const script = "try { $names = @(Get-Process -ErrorAction Stop | Select-Object -ExpandProperty ProcessName); if ($names -match '^(obs|obs64|obs32)$') { '1' } else { '0' } } catch { exit 1 }";
  const args = windows ? ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', script] : ['-A', '-o', 'comm='];
  return new Promise((resolve) => {
    execFile(executable, args, { timeout: windows ? 15_000 : 5000, maxBuffer: 1024 * 1024, windowsHide: true }, (error, stdout) => {
      if (error) return resolve(null);
      resolve(windows ? windowsObsResult(stdout) : containsObs(stdout));
    });
  });
}
