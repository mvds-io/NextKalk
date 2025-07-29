declare module 'leaflet-routing-machine' {
  import * as L from 'leaflet';
  const leafletRouting: any;
  export = leafletRouting;
}

declare module 'leaflet.awesome-markers' {
  import * as L from 'leaflet';
  const awesomeMarkers: any;
  export = awesomeMarkers;
}

declare module 'leaflet' {
  interface MarkerOptions {
    isMarker?: boolean;
  }
} 