'use client';

export type TravelInstrumentProps = {
  activeCount: number;
  upcomingCount: number;
  pulseMeta: string | null;
  attention: boolean;
  canCreate: boolean;
  onPlanTrip: () => void;
};

/** Travel orient region. Counts and pulse metadata come from buildTravelSurfaceModel. */
export default function TravelInstrument({
  activeCount, upcomingCount, pulseMeta, attention, canCreate, onPlanTrip,
}: TravelInstrumentProps) {
  const signal = activeCount > 0 ? `${activeCount} active` : upcomingCount > 0 ? `${upcomingCount} upcoming` : 'Clear';
  return (
    <section className="ins-travel-instrument" aria-label="Travel instrument" data-testid="travel-instrument" data-active-count={activeCount} data-upcoming-count={upcomingCount}>
      <div className="ins-travel-instrument__identity">
        <div>
          <p className="ins-travel-eyebrow">Place / Motion</p>
          <h1>Travel</h1>
        </div>
        <p className="ins-travel-instrument__pulse" aria-live="polite">
          <strong className="ins-travel-instrument__signal">{signal}</strong>
          {pulseMeta ? <span className="ins-travel-instrument__meta" data-attention={attention ? 'true' : 'false'}>{pulseMeta}</span> : null}
        </p>
      </div>
      {canCreate ? <div className="ins-travel-instrument__primary"><button type="button" onClick={onPlanTrip} data-testid="travel-plan-primary"><span aria-hidden="true">＋</span> Plan trip</button></div> : null}
    </section>
  );
}
