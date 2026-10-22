'use client';

type TravelToolsStripProps = {
  onFindPlace: () => void;
  onOpenVault: () => void;
  onOpenMap: () => void;
  onOpenStay: () => void;
  onEditDates: () => void;
  datesOpen: boolean;
  sortLabel: string;
  onCycleSort: () => void;
  onOpenLibrary: () => void;
};

/** Quiet, single secondary-tools region for the selected trip day. */
export default function TravelToolsStrip({
  onFindPlace, onOpenVault, onOpenMap, onOpenStay, onEditDates, datesOpen, sortLabel, onCycleSort, onOpenLibrary,
}: TravelToolsStripProps) {
  return (
    <nav className="ins-travel-tools" aria-label="Trip tools" data-testid="travel-tools-strip">
      <button type="button" onClick={onFindPlace}>Find place</button>
      <button type="button" onClick={onOpenVault}>Vault</button>
      <button type="button" onClick={onOpenMap}>Map</button>
      <button type="button" onClick={onOpenStay}>Stay</button>
      <button type="button" onClick={onEditDates} aria-expanded={datesOpen}>{datesOpen ? 'Close dates' : 'Dates'}</button>
      <button type="button" onClick={onCycleSort} aria-label={`Change sort mode, current ${sortLabel}`}>Sort · {sortLabel}</button>
      <button type="button" onClick={onOpenLibrary}>Library</button>
    </nav>
  );
}
