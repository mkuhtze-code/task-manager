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
  // Google Maps' own gesture layer can swallow the synthesized `click` after
  // `touchend` on touch devices, so taps are handled directly on touchend.
  // touchStartRef tracks where the finger went down to tell a tap from a
  // map-pan drag; touchTapHandledRef lets the follow-up click (which fires
  // right after a touchend on mobile) be ignored so the action runs once.
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const touchTapHandledRef = useRef(0);
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
      const map = mapRef.current;
      const proj = map.getProjection();
      if (!proj) return;

      // map.getProjection() no longer exposes fromLatLngToContainerPixel /
      // fromLatLngToDivPixel in current Google Maps releases, so project
      // manually: the projection still gives the zoom-0 "world" point, and
      // the map's current center/zoom turn that into container pixels via a
      // plain scale + translate.
      const centerWorld = proj.fromLatLngToPoint(map.getCenter());
      const scale = Math.pow(2, map.getZoom());
      const div = map.getDiv();
      const divWidth = div.clientWidth;
      const divHeight = div.clientHeight;
      const toContainerPixel = (lat: number, lng: number) => {
        const p = proj.fromLatLngToPoint({ lat, lng });
        if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) return null;
        let dx = p.x - centerWorld.x;
        dx = ((dx + 128) % 256 + 256) % 256 - 128; // nearest wrap across the antimeridian
        const dy = p.y - centerWorld.y;
        return { x: dx * scale + divWidth / 2, y: dy * scale + divHeight / 2 };
      };

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
          // which would crash the whole sheet. The idle/bounds_changed
          // listeners retry until the map settles.
          const p = toContainerPixel(it.lat, it.lng);
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
      // Projection isn't ready yet — the idle/bounds_changed listener
      // will re-run this the moment the map finishes initializing.
    }
  }, [base, activities, mapReady]);

  // Keeps a live reference to the latest syncHits closure so the map's
  // event listeners (attached once, when the map is created) always call
  // the current version rather than a stale one captured at creation time.
  const syncHitsRef = useRef(syncHits);
  useEffect(() => {
    syncHitsRef.current = syncHits;
  }, [syncHits]);

  // Mobile browsers (Android Chrome especially) resize the viewport as
  // the URL bar shows/hides or the device rotates, without always firing
  // an event Google Maps notices on its own. If Maps doesn't recompute
  // its internal projection after that, our hit-target buttons (computed
  // from that same projection) drift away from where the visible pins
  // actually are — the map looks fine, but taps land on nothing. This
  // nudges Maps to re-layout and re-syncs hit points whenever the
  // viewport changes size or orientation.
  useEffect(() => {
    function handleViewportChange() {
      if (!mapRef.current) return;
      const g = (window as any).google;
      g?.maps?.event.trigger(mapRef.current, 'resize');
      syncHitsRef.current();
    }
    window.addEventListener('resize', handleViewportChange);
    window.addEventListener('orientationchange', handleViewportChange);
    return () => {
      window.removeEventListener('resize', handleViewportChange);
      window.removeEventListener('orientationchange', handleViewportChange);
    };
  }, []);

  // Load the Maps script once per mount. We only flip loading off here —
  // the map instance itself is created in the next effect, once the
  // container has actually been laid out with real dimensions.
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

  // Actually create the map. This was missing entirely before — mapRef
  // .current never got assigned anywhere, so the marker/polyline effect
  // below always bailed out on its `if (!mapRef.current) return;` guard,
  // and nothing ever appeared in the div.
  //
  // Runs once loading finishes and the container div exists. Creating a
  // map inside a display:none / zero-size div leaves its projection in a
  // half-baked state where getProjection() returns a non-null but unusable
  // value and fromLatLngToContainerPixel throws instead of returning pixel
  // coordinates — so this waits one frame after the container becomes
  // visible (`display: block`) to let layout actually settle first.
  useEffect(() => {
    if (loading || error) return;
    if (mapRef.current) return; // already created
    if (!mapDivRef.current) return;

    let cancelled = false;
    const frame = requestAnimationFrame(() => {
      if (cancelled || !mapDivRef.current) return;
      const g = (window as any).google;
      if (!g?.maps) return;

      const map = new g.maps.Map(mapDivRef.current, {
        zoom: 11,
        center: { lat: 0, lng: 0 },
        disableDefaultUI: false,
        streetViewControl: false,
      });
      mapRef.current = map;

      g.maps.event.addListenerOnce(map, 'idle', () => {
        if (!cancelled) setMapReady(true);
      });
      map.addListener('bounds_changed', () => syncHitsRef.current());
      map.addListener('zoom_changed', () => syncHitsRef.current());
    });

    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
    };
  }, [loading, error]);

  // Update markers & polylines once the map exists and whenever the data
  // changes. Gated on mapReady (not just fingerprint) so this correctly
  // re-runs the first time the map finishes initializing, rather than only
  // on future data changes.
  useEffect(() => {
    if (!mapRef.current) return;
    const g = (window as any).google;

    // Build points list from base + activities
    const points: { lat: number; lng: number }[] = [];
    if (base?.lat != null && base?.lng != null) points.push({ lat: base.lat, lng: base.lng });
    activities.forEach((a) => {
      if (a.lat != null && a.lng != null) points.push({ lat: a.lat, lng: a.lng });
    });

    if (points.length === 0) {
      // Clear any existing overlays
      markersRef.current.forEach((m) => m.setMap(null));
      markersRef.current = [];
      polylinesRef.current.forEach((p) => p.setMap(null));
      polylinesRef.current = [];
      setHitPoints([]);

      setError('Nothing with a location to show yet.');
      return;
    }

    setError('');

    // Clear old markers & polylines (but keep the map instance)
    markersRef.current.forEach((m) => m.setMap(null));
    markersRef.current = [];
    polylinesRef.current.forEach((p) => p.setMap(null));
    polylinesRef.current = [];

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
    });

    // Draw polylines
    const allPolylines: string[] = [];
    if (base?.route_polyline) allPolylines.push(base.route_polyline);
    activities.forEach((a) => {
      if (a.route_polyline) allPolylines.push(a.route_polyline);
    });

    allPolylines.forEach((encoded) => {
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
      } catch (e) {
        // ignore decode errors for now
      }
    });

    // Only fit bounds if they changed to avoid visual jumps
    try {
      const newBoundsStr = bounds.toString();
      if (points.length > 1) {
        if (lastBoundsRef.current !== newBoundsStr) {
          mapRef.current.fitBounds(bounds, 48);
          lastBoundsRef.current = newBoundsStr;
        }
      } else {
        // Single point: only recenter if center actually changed
        const currentCenter = mapRef.current.getCenter?.();
        const lat = points[0].lat;
        const lng = points[0].lng;
        if (!currentCenter || currentCenter.lat() !== lat || currentCenter.lng() !== lng) {
          mapRef.current.setCenter(points[0]);
          mapRef.current.setZoom(11);
        }
      }
    } catch (e) {
      // ignore any bounds errors
      mapRef.current.setCenter(points[0]);
    }

    // fitBounds/setCenter above trigger bounds_changed asynchronously,
    // which will re-sync hit points on its own — but run it once here
    // too so pins land correctly even if that event is slow to fire.
    syncHitsRef.current();
  }, [fingerprint, mapReady]);

  // Re-sync hit-target positions whenever the underlying data or map
  // readiness changes (covers the initial paint once mapReady flips true).
  useEffect(() => {
    syncHits();
  }, [syncHits]);

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
            position: 'relative',
            flex: 1,
            minHeight: 0,
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
          {hitPoints.map((hp) => (
            <button
              key={hp.key}
              onTouchStart={(e) => {
                const t = e.changedTouches[0];
                if (t) touchStartRef.current = { x: t.clientX, y: t.clientY };
              }}
              onTouchEnd={(e) => {
                const start = touchStartRef.current;
                touchStartRef.current = null;
                if (!start) return;
                const t = e.changedTouches[0];
                if (!t || Math.hypot(t.clientX - start.x, t.clientY - start.y) > 10) return;
                touchTapHandledRef.current = Date.now();
                setPendingOpen({ label: hp.text, url: hp.url });
              }}
              onClick={() => {
                if (Date.now() - touchTapHandledRef.current < 500) return;
                setPendingOpen({ label: hp.text, url: hp.url });
              }}
              title={hp.text}
              aria-label={`Open ${hp.text} in Google Maps`}
              style={{
                position: 'absolute',
                left: hp.x,
                top: hp.y,
                transform: 'translate(-50%, -100%)',
                width: 44,
                height: 44,
                borderRadius: '50%',
                border: 'none',
                background: 'transparent',
                cursor: 'pointer',
                padding: 0,
                zIndex: 5,
                touchAction: 'manipulation',
                WebkitTapHighlightColor: 'rgba(0,0,0,0.12)',
              }}
            />
          ))}
        </div>

        {pendingOpen && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--space-2)',
              marginTop: 'var(--space-2)',
            }}
          >
            <span style={{ flex: 1, fontSize: 13, color: 'var(--ink-soft)', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              Open "{pendingOpen.label}" in Google Maps?
            </span>
            <button className="btn-text" onClick={() => setPendingOpen(null)}>Cancel</button>
            <button
              className="btn btn-ghost"
              style={{ padding: '4px 12px', minHeight: 32, fontSize: 12 }}
              onClick={() => {
                window.open(pendingOpen.url, '_blank', 'noopener,noreferrer');
                setPendingOpen(null);
              }}
            >
              Open
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default React.memo(MapView);
