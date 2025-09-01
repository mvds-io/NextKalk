declare module 'leaflet-routing-machine' {
  const leafletRouting: Record<string, unknown>;
  export = leafletRouting;
}

declare module 'leaflet.awesome-markers' {
  const awesomeMarkers: Record<string, unknown>;
  export = awesomeMarkers;
}

declare module 'leaflet' {
  interface MarkerOptions {
    isMarker?: boolean;
  }
} 