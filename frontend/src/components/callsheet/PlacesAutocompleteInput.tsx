// Google Places Autocomplete for the location field.
//
// Required Google Cloud APIs (enable in Google Cloud Console):
//   1. Maps JavaScript API
//   2. Places API (Legacy)
//
// Add VITE_GOOGLE_MAPS_API_KEY to your Render environment variables
// (frontend service → Environment tab → add VITE_GOOGLE_MAPS_API_KEY).
//
// Without the key the component falls back to a plain text input with a warning.
// In that case the backend will attempt to geocode the text string you type.

import { useRef, useEffect, useState } from 'react';
import { MapPin, AlertTriangle } from 'lucide-react';

const API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined;

// Singleton script-load state — one script tag regardless of how many instances mount.
type LoadState = 'idle' | 'loading' | 'ready' | 'error';
let mapsState: LoadState = typeof window !== 'undefined' && (window as unknown as { google?: unknown }).google ? 'ready' : 'idle';
const onReady: Array<() => void> = [];
const onError: Array<(e: Error) => void> = [];

function loadGoogleMaps(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (mapsState === 'ready') { resolve(); return; }
    if (mapsState === 'error') { reject(new Error('Google Maps failed to load')); return; }
    onReady.push(resolve);
    onError.push(reject);
    if (mapsState === 'loading') return;
    mapsState = 'loading';
    const s = document.createElement('script');
    s.src = `https://maps.googleapis.com/maps/api/js?key=${API_KEY}&libraries=places`;
    s.async = true;
    s.onload = () => {
      mapsState = 'ready';
      onReady.forEach((fn) => fn());
      onReady.length = 0;
    };
    s.onerror = () => {
      mapsState = 'error';
      const err = new Error('Google Maps script failed — check your API key and enabled APIs');
      onError.forEach((fn) => fn(err));
      onError.length = 0;
    };
    document.head.appendChild(s);
  });
}

interface Props {
  value: string;
  onChange: (locationName: string, lat: number | null, lng: number | null) => void;
  placeholder?: string;
}

export default function PlacesAutocompleteInput({ value, onChange, placeholder = 'e.g. Cape Town, South Africa' }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error' | 'no-key'>(
    !API_KEY ? 'no-key' : mapsState === 'ready' ? 'ready' : 'loading'
  );

  // Sync external value changes into the uncontrolled input (e.g. after form data loads from DB)
  useEffect(() => {
    if (inputRef.current && document.activeElement !== inputRef.current) {
      inputRef.current.value = value;
    }
  }, [value]);

  // Load Google Maps script and initialise Autocomplete
  useEffect(() => {
    if (!API_KEY) return;

    loadGoogleMaps()
      .then(() => {
        setStatus('ready');
        if (!inputRef.current) return;

        const ac = new google.maps.places.Autocomplete(inputRef.current, {
          fields: ['formatted_address', 'geometry', 'name'],
        });

        ac.addListener('place_changed', () => {
          const place = ac.getPlace();
          const lat = place.geometry?.location?.lat() ?? null;
          const lng = place.geometry?.location?.lng() ?? null;
          const name = place.formatted_address || place.name || inputRef.current?.value || '';
          console.log('[PlacesAutocomplete] selected:', name, lat, lng);
          onChange(name, lat, lng);
        });
      })
      .catch((err: Error) => {
        console.error('[PlacesAutocomplete] load error:', err);
        setStatus('error');
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const inputClass =
    'w-full px-3 py-2 text-sm border rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 border-gray-300 dark:border-gray-600 focus:outline-none focus:ring-2 focus:ring-[#1A1A2E] min-h-[44px]';

  if (status === 'no-key' || status === 'error') {
    return (
      <div className="flex flex-col gap-1">
        <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Location</label>
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value, null, null)}
          placeholder={placeholder}
          className={inputClass}
        />
        {!value && (
          <p className="flex items-center gap-1 text-xs text-amber-600 mt-0.5">
            <AlertTriangle className="w-3 h-3 flex-shrink-0" />
            {status === 'no-key'
              ? 'Location autocomplete unavailable — set VITE_GOOGLE_MAPS_API_KEY to enable it'
              : 'Google Maps failed to load — type a location and auto-populate will geocode it'}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <label className="text-sm font-medium text-gray-700 dark:text-gray-300 flex items-center gap-1">
        Location <MapPin className="w-3.5 h-3.5 text-gray-400" />
      </label>
      <input
        ref={inputRef}
        type="text"
        defaultValue={value}
        placeholder={placeholder}
        onChange={(e) => {
          // User typed freely — clear lat/lng since the text is no longer a confirmed Places result
          onChange(e.target.value, null, null);
        }}
        className={inputClass}
      />
      {status === 'ready' && (
        <p className="text-xs text-gray-400 mt-0.5">Select from the dropdown for precise coordinates</p>
      )}
    </div>
  );
}
