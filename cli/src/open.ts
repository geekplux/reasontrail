// Opens the written file with the system opener, detached so no process of ours is left waiting (C1).
import { spawn } from 'node:child_process';

/** The opener for this platform, or undefined when there is none (headless Linux, SSH). */
export function openerFor(platform: NodeJS.Platform, env: Readonly<Record<string, string | undefined>>, file: string): [string, string[]] | undefined {
  if (platform === 'darwin') return ['open', [file]];
  if (platform === 'win32') return ['cmd', ['/c', 'start', '""', file]];
  if (env.DISPLAY || env.WAYLAND_DISPLAY) return ['xdg-open', [file]];
  return undefined;
}

/** Launch the opener; true when one was started. */
export function openFile(file: string, platform = process.platform, env = process.env): boolean {
  const cmd = openerFor(platform, env, file);
  if (!cmd) return false;
  try {
    const child = spawn(cmd[0], cmd[1], { detached: true, stdio: 'ignore', windowsHide: true });
    child.on('error', () => {});
    child.unref();
    return true;
  } catch {
    return false;
  }
}
