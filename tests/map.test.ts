import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { createLocationPicker } from "../src/map.js";
import type { Location } from "../src/types.js";
import L from 'leaflet';

// Mock Leaflet for testing purposes
const mockMap = { 
  setView: () => {}, 
  on: () => {}, 
  removeLayer: () => {}, 
  addLayer: () => {}, 
  getZoom: () => 10,
  remove: () => {}
};
const mockMarker = { addTo: () => mockMap };
const mockTileLayer = { addTo: () => mockMap };
const mockGeocoder = { on: () => mockMap, addTo: () => mockMap, remove: () => {} };

describe("createLocationPicker", () => {
  let mapContainer: HTMLDivElement;

  beforeEach(() => {
    mapContainer = document.createElement("div");
    mapContainer.id = "map-test-container";
    mapContainer.style.width = "500px";
    mapContainer.style.height = "500px";
    document.body.appendChild(mapContainer);

    // Mock Leaflet functions
    // @ts-ignore
    L.map = () => mockMap;
    // @ts-ignore
    L.tileLayer = () => mockTileLayer;
    // @ts-ignore
    L.marker = () => mockMarker;
    // @ts-ignore
    L.Control = { geocoder: () => mockGeocoder };
  });

  afterEach(() => {
    document.body.removeChild(mapContainer);
  });

  it("should throw error when container element doesn't exist", () => {
    expect(() => {
      createLocationPicker({
        mapContainerId: "nonexistent-container",
        onLocationSelect: () => {}
      });
    }).toThrow("Map container with ID 'nonexistent-container' not found");
  });

  it("should initialize a Leaflet map in the specified container", () => {
    const onLocationSelect = (loc: Location) => {};
    const { map } = createLocationPicker({
      mapContainerId: "map-test-container",
      onLocationSelect,
    });

    expect(map).toBeDefined();
  });

  it("should call onLocationSelect when a location is clicked", () => {
    let selectedLocation: Location | undefined;
    const onLocationSelect = (loc: Location) => {
      selectedLocation = loc;
    };

    const { map } = createLocationPicker({
      mapContainerId: "map-test-container",
      onLocationSelect,
    });

    // Simulate a map click event
    const clickEvent = { latlng: { lat: 34.05, lng: -118.25 } } as L.LeafletMouseEvent;
    // @ts-ignore - Directly call the mocked 'on' handler
    map.on.mock.calls[0][1](clickEvent);

    expect(selectedLocation).toBeDefined();
    expect(selectedLocation?.latitude).toBe(34.05);
    expect(selectedLocation?.longitude).toBe(-118.25);
  });

  it("should set an initial marker if initialLocation is provided", () => {
    const initialLocation: Location = { latitude: 40.71, longitude: -74.01 };
    
    // @ts-ignore
    const markerSpy = jest.spyOn(L, 'marker');

    createLocationPicker({
      mapContainerId: "map-test-container",
      onLocationSelect: () => {},
      initialLocation,
    });

    expect(markerSpy).toHaveBeenCalledWith([initialLocation.latitude, initialLocation.longitude]);
  });

  it("should update the marker when setMarker is called", () => {
    let selectedLocation: Location | undefined;
    const onLocationSelect = (loc: Location) => {
      selectedLocation = loc;
    };

    const { setMarker } = createLocationPicker({
      mapContainerId: "map-test-container",
      onLocationSelect,
    });

    const newLocation: Location = { latitude: 51.5, longitude: -0.1 };
    setMarker(newLocation);

    // @ts-ignore
    const clickEvent = { latlng: { lat: newLocation.latitude, lng: newLocation.longitude } } as L.LeafletMouseEvent;
    // @ts-ignore
    mockMap.on.mock.calls[0][1](clickEvent);

    expect(selectedLocation?.latitude).toBe(newLocation.latitude);
    expect(selectedLocation?.longitude).toBe(newLocation.longitude);
  });

  it("should integrate with geocoder and call onLocationSelect on result", () => {
    let selectedLocation: Location | undefined;
    const onLocationSelect = (loc: Location) => {
      selectedLocation = loc;
    };

    createLocationPicker({
      mapContainerId: "map-test-container",
      onLocationSelect,
    });

    const geocoderResult = {
      geocode: { center: { lat: 48.85, lng: 2.35 } }, // Paris
    };

    // @ts-ignore
    mockGeocoder.on.mock.calls[0][1](geocoderResult);

    expect(selectedLocation).toBeDefined();
    expect(selectedLocation?.latitude).toBe(48.85);
    expect(selectedLocation?.longitude).toBe(2.35);
  });

  it("should clean up resources when destroy is called", () => {
    const { destroy } = createLocationPicker({
      mapContainerId: "map-test-container",
      onLocationSelect: () => {},
    });

    // @ts-ignore
    const removeSpy = jest.spyOn(mockMap, 'remove');
    destroy();
    expect(removeSpy).toHaveBeenCalled();
  });
});
