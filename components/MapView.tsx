'use client';

import { useEffect, useRef, useState } from 'react';

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
  if (typeof window !== 'undefined' && (window as any).google?.maps) {
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

export default function MapView(props: {
  base: MapBase | null;
  activities: MapActivity[]; // must be in order_index order — polylines are per fromId leg
  onClose: () => void;
}) {
  const { base, activities, onClose } = props;
  const mapDivRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any | null>(null);
  const markersRef = useRef<any[]>([]);
  const polylinesRef = useRef<any[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    loadGoogleMapsScript()
      .then(() => {
        if (cancelled || !mapDivRef.current) return;
        const g = (window as any).google;

        // Initialize map once
        if (!mapRef.current) {
          mapRef.current = new g.maps.Map(mapDivRef.current, {
            zoom: 11,
            center: { lat: 0, lng: 0 },
            disableDefaultUI: false,
            streetViewControl: false,
          });
        }

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

          setError('Nothing with a location to show yet.');
          setLoading(false);
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
            // console.warn('Invalid polyline', e);
          }
        });

        if (points.length > 1) {
          mapRef.current.fitBounds(bounds, 48);
        } else {
          mapRef.current.setCenter(points[0]);
          mapRef.current.setZoom(11);
        }

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
  }, [base, activities]);

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
