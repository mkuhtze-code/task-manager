/** Cross-chrome request to open the capture sheet (desktop sidebar → Today). */

type Listener = () => void;

let listener: Listener | null = null;

export function registerCaptureOpen(fn: Listener): () => void {
  listener = fn;
  return () => {
    if (listener === fn) listener = null;
  };
}

export function requestCaptureOpen(): void {
  listener?.();
}
