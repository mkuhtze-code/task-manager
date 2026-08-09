'use client';

import React, { useEffect, useRef, useState, useMemo } from 'react';

type MapActivity = {
  id: string;
  text: string;
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
  // Real state, not just a ref — this is what lets the overlay effect
  // below correctly re-fire the moment the map instance actually exists.
  // A ref alone (mapRef.current becoming non-null) does NOT trigger a
  // re-render or re-run any effect's dependency check, which was the
  // root cause of routes/pins never appearing on first open.
  const [mapReady, setMapReady] = useState(false);

  const fingerprint = useMemo(() => {
    const basePart = base ? `${base.lat ?? ''},${base.lng ?? ''},${base.route_polyline ?? ''}` : '';
    const actsPart = activities
      .map((a) => `${a.id}|${a.lat ?? ''},${a.lng ?? ''},${a.route_polyline ?? ''}`)
      .join(';');
    return basePart + '||' + actsPart;
  }, [base, activities]);

  // Load script and initialize the map instance once per mount.
  useEffect(() => {
    let cancelled = false;
    loadGoogleMapsScript()
      .then(() => {
        if (cancelled || !mapDivRef.current) return;
        const g = (window as any).google;
        if (!mapRef.current) {
          mapRef.current = new g.maps.Map(mapDivRef.current, {
            zoom: 11,
            center: { lat: 0, lng: 0 },
            disableDefaultUI: false,
            streetViewControl: false,
          });
        }
        setLoading(false);
        setMapReady(true);
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
  }, [fingerprint, mapReady]);

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
          ref={mapDivRef}
          style={{
            flex: 1,
            minHeight: 0,
            borderRadius: 'var(--radius-md)',
            overflow: 'hidden',
            display: loading || error ? 'none' : 'block',
          }}
        />
      </div>
    </div>
  );
}

export default React.memo(MapView);
