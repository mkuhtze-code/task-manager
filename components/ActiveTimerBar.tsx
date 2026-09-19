'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { StopIcon } from '@/components/icons';
import { useActiveTask } from '@/hooks/useActiveTask';

function fmtMins(mins: number): string {
  const m = Math.max(0, Math.round(mins));
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r === 0 ? `${h}h` : `${h}h ${r}m`;
}

/**
 * Top-of-app banner for the running task.
 * Renders in document flow so page content is pushed down (not overlaid).
 */
export default function ActiveTimerBar() {
  const pathname = usePathname();
  const { task, elapsedMins, overEstimate, progress, stopping, stop } =
    useActiveTask();

  if (
    pathname?.startsWith('/admin') ||
    pathname === '/welcome' ||
    pathname === '/reset-password'
  ) {
    return null;
  }

  if (!task) return null;

  const remaining =
    task.estimate_mins > 0
      ? Math.max(0, task.estimate_mins - elapsedMins)
      : null;

  return (
    <div
      className={
        overEstimate ? 'dokkit-player dokkit-player--over' : 'dokkit-player'
      }
      role="status"
      aria-live="polite"
      aria-label={`Timer running: ${task.text}`}
    >
      <div className="dokkit-player-inner">
        <Link href="/" className="dokkit-player-main">
          <span className="dokkit-player-dot" />
          <span className="dokkit-player-copy">
            <span className="dokkit-player-title">{task.text}</span>
            <span className="dokkit-player-meta mono">
              {fmtMins(elapsedMins)}
              {task.estimate_mins > 0 && (
                <>
                  <span className="dokkit-player-sep">·</span>
                  {overEstimate ? (
                    <span>
                      over by {fmtMins(elapsedMins - task.estimate_mins)}
                    </span>
                  ) : remaining != null ? (
                    <span>{fmtMins(remaining)} left</span>
                  ) : null}
                </>
              )}
            </span>
          </span>
        </Link>

        <button
          type="button"
          className="dokkit-player-stop"
          onClick={() => void stop()}
          disabled={stopping}
          aria-label="Stop timer"
        >
          <StopIcon />
        </button>
      </div>

      {progress != null && (
        <div className="dokkit-player-track" aria-hidden>
          <div
            className="dokkit-player-track-fill"
            style={{ width: `${Math.round(progress * 100)}%` }}
          />
        </div>
      )}
    </div>
  );
}
