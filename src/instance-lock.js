import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const LOCK_PATH = path.join(__dirname, '..', 'data', '.bot.lock');

function pidAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return e.code === 'EPERM';
  }
}

export function acquireLock({ lockPath = LOCK_PATH } = {}) {
  if (fs.existsSync(lockPath)) {
    try {
      const prev = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
      if (prev.pid && prev.pid !== process.pid && pidAlive(prev.pid)) {
        return {
          acquired: false,
          reason: `Another instance is already running (PID ${prev.pid}, started ${prev.startedAt}). ` +
                  `Stop it first, or confirm and delete ${lockPath} to retry.`
        };
      }
      console.log(`⚠️ Stale lock found (PID ${prev.pid || '?'} no longer exists) — taking over`);
    } catch {
      console.log('⚠️ Corrupt lock file — rebuilding');
    }
  }
  fs.writeFileSync(lockPath, JSON.stringify({
    pid: process.pid,
    startedAt: new Date().toISOString()
  }, null, 2));
  return { acquired: true };
}

export function releaseLock(lockPath = LOCK_PATH) {
  try {
    const cur = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
    if (cur.pid === process.pid) fs.rmSync(lockPath, { force: true });
  } catch {}
}
