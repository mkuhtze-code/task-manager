'use client';

import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react';

type MapActivity = {
  id: string;
  text: string;
  location_text: string | null;
  lat: number | null;
  lng: number | null;
  route_polyline: string | null;
};

type MapBase = {
  location_text: string | null;
  lat: number | null;
  lng: number | null;
  route_polyline: string | null;
};

function mapsUrlFor(query: string): string {
  return `https://maps.google.com/?q=${encodeURIComponent(query)}&api=1`;
}

let scriptLoadPromise: Promise<void> | null = null;

function loadGoogleMapsScript(): Promise<void> {
  if (typeof window !== 'undefined' && (window as any).google?.maps?.geometry) {
    return Promise.resolve();
  }
  if (scriptLoadPromise) return scriptLoadPromise;

  scriptLoadPromise = new Promise((resolve, reject) => {
    const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY;
    if (!key) {
      reject(new Error('Map key not configured'));
      return;
    }
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${key}&libraries=geometry`;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Could not load Google Maps'));
    document.head.appendChild(script);
  });
  return scriptLoadPromise;
}

function MapView(props: {
  base: MapBase | null;
  activities: MapActivity[]; // must be in order_index order — polylines are per fromId leg
  onClose: () => void;
}) {
  const { base, activities, onClose } = props;

  const mapDivRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any | null>(null);
  const markersRef = useRef<any[]>([]);
  const polylinesRef = useRef<any[]>([]);
  const lastBoundsRef = useRef<string | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [pendingOpen, setPendingOpen] = useState<{ label: string; url: string } | null>(null);
  // Real state, not just a ref — this is what lets the overlay effect
  // below correctly re-fire the moment the map instance actually exists.
  // A ref alone (mapRef.current becoming non-null) does NOT trigger a
  // re-render or re-run any effect's dependency check, which was the
  // root cause of routes/pins never appearing on first open.
  const [mapReady, setMapReady] = useState(false);
  const [hitPoints, setHitPoints] = useState<{ key: string; x: number; y: number; text: string; url: string }[]>([]);

  const fingerprint = useMemo(() => {
    const basePart = base ? `${base.lat ?? ''},${base.lng ?? ''},${base.route_polyline ?? ''}` : '';
    const actsPart = activities
      .map((a) => `${a.id}|${a.lat ?? ''},${a.lng ?? ''},${a.route_polyline ?? ''}`)
      .join(';');
    return basePart + '||' + actsPart;
  }, [base, activities]);

  // Positions our own clickable hit-targets over each marker using the
  // map's projection. Marker 'click' events proved unreliable in some
  // webviews, so the pins stay visual-only and these overlay buttons do
  // the tapping.
  const syncHits = useCallback(() => {
    if (!mapReady || !mapRef.current) return;
    try {
      const g = (window as any).google;
      const proj = mapRef.current.getProjection();
      if (!proj) return;

      const items: { id: string; lat: number; lng: number; text: string; url: string }[] = [];
      if (base?.lat != null && base?.lng != null) {
        const query = base.location_text ?? `${base.lat},${base.lng}`;
        items.push({
          id: 'base',
          lat: base.lat,
          lng: base.lng,
          text: base.location_text || 'Base',
          url: mapsUrlFor(query),
        });
      }
      activities.forEach((a) => {
        if (a.lat == null || a.lng == null) return;
        const query = a.location_text ?? `${a.lat},${a.lng}`;
        items.push({ id: a.id, lat: a.lat, lng: a.lng, text: a.location_text || a.text, url: mapsUrlFor(query) });
      });

      const next = items
        .map((it) => {
          // The projection is only safe to use once the map has finished
          // laying out — calling this while it's mid-initialization throws,
          // which would crash the whole sheet. The idle/projection_changed
          // listeners retry until the map settles.
          const p = proj.fromLatLngToContainerPixel({ lat: it.lat, lng: it.lng });
          if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) return null;
          return { key: it.id, x: p.x, y: p.y, text: it.text, url: it.url };
        })
        .filter((h): h is { key: string; x: number; y: number; text: string; url: string } => h != null);
      setHitPoints((prev) => {
        if (prev.length === next.length && prev.every((hp, i) => hp.x === next[i].x && hp.y === next[i].y && hp.key === next[i].key)) {
          return prev;
        }
        return next;
      });
    } catch {
      // Projection isn't ready yet — the idle/projection_changed listener
      // will re-run this the moment the map finishes initializing.
    }
  }, [base, activities, mapReady]);

  // Load the Maps script once per mount. We only flip the container to
  // visible here — the map instance itself is created in the effect below,
  // once the container actually has size. Creating a map inside a
  // display:none / zero-size div leaves its projection in a half-baked
  // state where getProjection() returns a non-null but unusable value, and
  // fromLatLngToContainerPixel throws instead of returning pixel coords.
  useEffect(() => {
    let cancelled = false;
    loadGoogleMapsScript()
      .then(() => {
        if (cancelled) return;
        setLoading(false);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err.message || 'Could not load the map');
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Create the map instance now that the container is visible and has size.
  useEffect(() => {
    if (loading || error || mapRef.current) return;
    const g = (window as any).google;
    try {
      mapRef.current = new g.maps.Map(mapDivRef.current, {
        zoom: 11,
        center: { lat: 0, lng: 0 },
        disableDefaultUI: false,
        streetViewControl: false,
      });
      setMapReady(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not initialize the map');
    }
  }, [loading, error]);

  // Draws markers + route polylines. Now re-runs both when the data
  // changes (fingerprint) AND when the map first becomes ready
  // (mapReady) — previously only depended on fingerprint, so the very
  // first paint always ran before the map existed and nothing after
  // that ever told it to try again.
  useEffect(() => {
    if (!mapReady || !mapRef.current) return;
    const g = (window as any).google;

    const points: { lat: number; lng: number }[] = [];
    if (base?.lat != null && base?.lng != null) points.push({ lat: base.lat, lng: base.lng });
    activities.forEach((a) => {
      if (a.lat != null && a.lng != null) points.push({ lat: a.lat, lng: a.lng });
    });

    markersRef.current.forEach((m) => m.setMap(null));
    markersRef.current = [];
    polylinesRef.current.forEach((p) => p.setMap(null));
    polylinesRef.current = [];

    if (points.length === 0) {
      setError('Nothing with a location to show yet.');
      setHitPoints([]);
      return;
    }
    setError('');

    const bounds = new g.maps.LatLngBounds();

    if (base?.lat != null && base?.lng != null) {
      const m = new g.maps.Marker({
        position: { lat: base.lat, lng: base.lng },
        map: mapRef.current,
        label: 'B',
        title: base.location_text || 'Base',
      });
      markersRef.current.push(m);
      bounds.extend({ lat: base.lat, lng: base.lng });
      m.addListener('click', () => {
        const query = base.location_text ?? (base.lat != null && base.lng != null ? `${base.lat},${base.lng}` : null);
        if (query) setPendingOpen({ label: base.location_text || 'Base', url: mapsUrlFor(query) });
      });
    }

    activities.forEach((a, idx) => {
      if (a.lat == null || a.lng == null) return;
      const m = new g.maps.Marker({
        position: { lat: a.lat, lng: a.lng },
        map: mapRef.current,
        label: String(idx + 1),
        title: a.text,
      });
      markersRef.current.push(m);
      bounds.extend({ lat: a.lat, lng: a.lng });
      m.addListener('click', () => {
        const query = a.location_text ?? (a.lat != null && a.lng != null ? `${a.lat},${a.lng}` : null);
        if (query) setPendingOpen({ label: a.location_text || a.text, url: mapsUrlFor(query) });
      });
    });

    const allPolylines: string[] = [];
    if (base?.route_polyline) allPolylines.push(base.route_polyline);
    activities.forEach((a) => {
      if (a.route_polyline) allPolylines.push(a.route_polyline);
    });

    if (allPolylines.length === 0 && activities.some((a) => a.lat != null)) {
      setError('Pins are set, but no route has been calculated yet — try "Recalculate drive times" first.');
    }

    allPolylines.forEach((encoded) => {
      if (!g.maps.geometry?.encoding) return;
      try {
        const path = g.maps.geometry.encoding.decodePath(encoded);
        const poly = new g.maps.Polyline({
          path,
          strokeColor: '#2451d4',
          strokeOpacity: 0.85,
          strokeWeight: 4,
        });
        poly.setMap(mapRef.current);
        polylinesRef.current.push(poly);
      } catch {
        // A single malformed polyline shouldn't block the rest of the
        // map from rendering — skip it silently.
      }
    });

    try {
      const newBoundsStr = bounds.toString();
      if (points.length > 1) {
        if (lastBoundsRef.current !== newBoundsStr) {
          mapRef.current.fitBounds(bounds, 48);
          lastBoundsRef.current = newBoundsStr;
        }
      } else {
        mapRef.current.setCenter(points[0]);
        mapRef.current.setZoom(11);
      }
    } catch {
      mapRef.current.setCenter(points[0]);
    }

    syncHits();
    const idleListener = g.maps.event.addListener(mapRef.current, 'idle', syncHits);
    const projectionChanged = g.maps.event.addListener(mapRef.current, 'projection_changed', syncHits);
    return () => {
      g.maps.event.removeListener(idleListener);
      g.maps.event.removeListener(projectionChanged);
    };
  }, [fingerprint, mapReady, syncHits]);

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div
        className="capture-sheet"
        onClick={(e) => e.stopPropagation()}
        style={{ height: '80vh', display: 'flex', flexDirection: 'column', padding: 'var(--space-3)' }}
      >
        <div className="task-detail-header" style={{ marginBottom: 'var(--space-2)' }}>
          <div className="settings-panel-title">Map</div>
          <button className="btn-text" onClick={onClose}>Close</button>
        </div>

        {loading && <p style={{ color: 'var(--ink-soft)', fontSize: 13 }}>Loading map…</p>}
        {error && <p style={{ color: 'var(--danger-text, var(--danger))', fontSize: 13 }}>{error}</p>}

        <div
          style={{
            flex: 1,
            minHeight: 0,
            position: 'relative',
            display: loading || error ? 'none' : 'block',
          }}
        >
          <div
            ref={mapDivRef}
            style={{
              position: 'absolute',
              inset: 0,
              borderRadius: 'var(--radius-md)',
              overflow: 'hidden',
            }}
          />
          <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
            {hitPoints.map((hp) => (
              <button
                key={hp.key}
                type="button"
                title={hp.text}
                aria-label={hp.text}
                onClick={() => setPendingOpen({ label: hp.text, url: hp.url })}
                style={{
                  position: 'absolute',
                  left: hp.x - 20,
                  top: hp.y - 48,
                  width: 40,
                  height: 52,
                  background: 'transparent',
                  border: 'none',
                  padding: 0,
                  cursor: 'pointer',
                  pointerEvents: 'auto',
                }}
              />
            ))}
          </div>
        </div>

        {pendingOpen && (
          <div
            onClick={() => setPendingOpen(null)}
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 40,
              background: 'rgba(var(--shadow-rgb), 0.32)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 'var(--space-4)',
            }}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                background: 'var(--paper)',
                borderRadius: 'var(--radius-lg)',
                padding: 'var(--space-4)',
                maxWidth: 340,
                width: '100%',
                boxShadow: '0 6px 24px rgba(var(--shadow-rgb), 0.25)',
              }}
            >
              <div className="settings-panel-title" style={{ marginBottom: 'var(--space-2)' }}>
                Open in Google Maps?
              </div>
              <p
                style={{
                  fontSize: 'var(--text-sm)',
                  color: 'var(--ink-soft)',
                  marginBottom: 'var(--space-3)',
                  wordBreak: 'break-word',
                }}
              >
                {pendingOpen.label}
              </p>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-1)' }}>
                <button className="btn-text" onClick={() => setPendingOpen(null)}>Cancel</button>
                <a className="btn-text" href={pendingOpen.url} target="_blank" rel="noreferrer" style={{ textDecoration: 'none' }}>
                  Open
                </a>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default React.memo(MapView);
