/** Desktop primary action (Dock it / Add …) shared across chrome and pages. */

export type DesktopPrimaryAction = {
  label: string;
  run: () => void;
};

let action: DesktopPrimaryAction | null = null;
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((l) => l());
}

export function registerDesktopPrimaryAction(
  label: string,
  run: () => void
): () => void {
  action = { label, run };
  notify();
  return () => {
    if (action?.run === run) {
      action = null;
      notify();
    }
  };
}

export function getDesktopPrimaryAction(): DesktopPrimaryAction | null {
  return action;
}

export function subscribeDesktopPrimaryAction(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

/** Back-compat: Today page registers capture as primary "Dock it". */
export function registerCaptureOpen(fn: () => void): () => void {
  return registerDesktopPrimaryAction('Dock it', fn);
}

export function requestCaptureOpen(): void {
  action?.run();
}
