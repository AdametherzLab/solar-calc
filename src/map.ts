import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet-control-geocoder/dist/Control.Geocoder.css';
import 'leaflet-control-geocoder';
import type { Location } from './types.js';

// Fix for default icon issues with Webpack/Rollup
// @ts-ignore
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

/**
 * Options for the location picker map.
 */
export interface LocationPickerOptions {
  /** The HTML element ID where the map will be rendered. */
  mapContainerId: string;
  /** Initial latitude for the map view. Defaults to 0. */
  initialLatitude?: number;
  /** Initial longitude for the map view. Defaults to 0. */
  initialLongitude?: number;
  /** Initial zoom level for the map. Defaults to 2. */
  initialZoom?: number;
  /** Callback function to be called when a location is selected. */
  onLocationSelect: (location: Location) => void;
  /** Optional: Initial location to display on the map. */
  initialLocation?: Location;
}

/**
 * Creates an interactive Leaflet map for visual location selection.
 *
 * Users can click on the map to select a location, or use the search bar.
 * The selected latitude and longitude are returned via the `onLocationSelect` callback.
 *
 * @param options - Configuration options for the map.
 * @returns An object containing the Leaflet map instance and a function to set the marker.
 *
 * @example
 * 
 * import { createLocationPicker } from 'solar-calc';
 *
 * // Assume there's a div with id 'map'
 * const { map, setMarker } = createLocationPicker({
 *   mapContainerId: 'map',
 *   initialLatitude: 34.0522,
 *   initialLongitude: -118.2437,
 *   initialZoom: 10,
 *   onLocationSelect: (location) => {
 *     console.log('Selected Location:', location);
 *     // Update your form or state with the new location
 *   },
 *   initialLocation: { latitude: 34.0522, longitude: -118.2437, elevation: 0 }
 * });
 *
 * // You can programmatically set the marker later if needed
 * // setMarker({ latitude: 40.7128, longitude: -74.0060 });
 * 
 */
export function createLocationPicker(options: LocationPickerOptions) {
  const { mapContainerId, initialLatitude = 0, initialLongitude = 0, initialZoom = 2, onLocationSelect, initialLocation } = options;

  const map = L.map(mapContainerId).setView([initialLatitude, initialLongitude], initialZoom);

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
  }).addTo(map);

  let marker: L.Marker | undefined;

  const setMarker = (location: Location) => {
    if (marker) {
      map.removeLayer(marker);
    }
    marker = L.marker([location.latitude, location.longitude]).addTo(map);
    map.setView([location.latitude, location.longitude], map.getZoom() || initialZoom);
  };

  // Set initial marker if provided
  if (initialLocation) {
    setMarker(initialLocation);
  }

  map.on('click', (e: L.LeafletMouseEvent) => {
    const newLocation: Location = { latitude: e.latlng.lat, longitude: e.latlng.lng };
    setMarker(newLocation);
    onLocationSelect(newLocation);
  });

  // Add geocoder control for searching locations
  // @ts-ignore - Leaflet Control Geocoder might not have perfect TS definitions
  L.Control.geocoder({
    defaultMarkGeocode: false
  })
    .on('geocode:result', (e: any) => {
      const latlng = e.geocode.center;
      const newLocation: Location = { latitude: latlng.lat, longitude: latlng.lng };
      setMarker(newLocation);
      onLocationSelect(newLocation);
    })
    .addTo(map);

  return { map, setMarker };
}
