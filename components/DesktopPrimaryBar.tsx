'use client';

import { useSyncExternalStore } from 'react';
import { PlusIcon } from '@/components/icons';
import {
  getDesktopPrimaryAction,
  subscribeDesktopPrimaryAction,
} from '@/lib/captureOpen';

/**
 * Sticky top-right primary action for desktop.
 * Label + handler come from the active page via registerDesktopPrimaryAction.
 */
export default function DesktopPrimaryBar() {
  const primary = useSyncExternalStore(
    subscribeDesktopPrimaryAction,
    getDesktopPrimaryAction,
    () => null
  );

  if (!primary) return null;

  return (
    <div className="desk-primary-bar">
      <button
        type="button"
        className="btn btn-steel desk-primary-btn"
        onClick={() => primary.run()}
      >
        <PlusIcon size={16} />
        {primary.label}
      </button>
    </div>
  );
}
