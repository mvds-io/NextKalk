'use client';

import React, { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface MapboxCoordinatePickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCoordinatesSelect: (lat: number, lng: number) => void;
  initialLat?: number;
  initialLng?: number;
}

export function MapboxCoordinatePicker({
  open,
  onOpenChange,
  onCoordinatesSelect,
  initialLat,
  initialLng,
}: MapboxCoordinatePickerProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const marker = useRef<mapboxgl.Marker | null>(null);

  // Default to southern Norway (approximately Kristiansand area)
  const [lat, setLat] = useState<number>(initialLat || 58.5);
  const [lng, setLng] = useState<number>(initialLng || 8.0);
  const [mapStyle, setMapStyle] = useState<'outdoors' | 'satellite'>('outdoors');

  // Update lat/lng when initialLat/initialLng change (e.g., when editing different markers)
  useEffect(() => {
    if (open) {
      setLat(initialLat || 58.5);
      setLng(initialLng || 8.0);
    }
  }, [open, initialLat, initialLng]);

  useEffect(() => {
    if (!open) {
      // Clean up when dialog closes
      if (marker.current) {
        marker.current.remove();
        marker.current = null;
      }
      if (map.current) {
        map.current.remove();
        map.current = null;
      }
      return;
    }

    // Set Mapbox access token
    const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
    if (!token) {
      console.error('Mapbox token not found. Please add NEXT_PUBLIC_MAPBOX_TOKEN to your .env.local file');
      return;
    }

    mapboxgl.accessToken = token;

    // Wait for container to be fully mounted with proper dimensions
    const timer = setTimeout(() => {
      if (!mapContainer.current) {
        console.error('Map container not found');
        return;
      }

      const width = mapContainer.current.clientWidth;
      const height = mapContainer.current.clientHeight;

      // Ensure container has dimensions before initializing
      if (width === 0 || height === 0) {
        console.error('Map container has no dimensions', { width, height });
        return;
      }

      // Initialize map only if not already initialized
      if (!map.current) {
        try {
          const initialZoom = initialLat && initialLng ? 12 : 7; // Wider view for southern Norway, closer for specific location

          map.current = new mapboxgl.Map({
            container: mapContainer.current,
            style: mapStyle === 'satellite'
              ? 'mapbox://styles/mapbox/satellite-streets-v12'
              : 'mapbox://styles/mapbox/outdoors-v12',
            center: [lng, lat],
            zoom: initialZoom,
          });

          // Wait for map to load
          map.current.on('load', () => {
            map.current?.resize();
          });

          // Add navigation controls
          map.current.addControl(new mapboxgl.NavigationControl(), 'top-right');

          // Add click handler to map
          map.current.on('click', (e) => {
            const { lng, lat } = e.lngLat;
            setLat(Number(lat.toFixed(6)));
            setLng(Number(lng.toFixed(6)));

            // Update or create marker
            if (marker.current) {
              marker.current.setLngLat([lng, lat]);
            } else {
              marker.current = new mapboxgl.Marker({
                draggable: true,
                color: '#3b82f6',
              })
                .setLngLat([lng, lat])
                .addTo(map.current!);

              marker.current.on('dragend', () => {
                const lngLat = marker.current!.getLngLat();
                setLat(Number(lngLat.lat.toFixed(6)));
                setLng(Number(lngLat.lng.toFixed(6)));
              });
            }
          });

          // If initialLat and initialLng are provided, add a marker
          if (initialLat !== undefined && initialLng !== undefined) {
            marker.current = new mapboxgl.Marker({
              draggable: true,
              color: '#3b82f6',
            })
              .setLngLat([initialLng, initialLat])
              .addTo(map.current);

            marker.current.on('dragend', () => {
              const lngLat = marker.current!.getLngLat();
              setLat(Number(lngLat.lat.toFixed(6)));
              setLng(Number(lngLat.lng.toFixed(6)));
            });

            map.current.flyTo({ center: [initialLng, initialLat], zoom: 12 });
          }
        } catch (error) {
          console.error('Error initializing Mapbox map:', error);
        }
      } else {
        map.current.resize();
      }
    }, 500); // Increased delay to 500ms to ensure dialog is fully rendered

    return () => {
      clearTimeout(timer);
    };
  }, [open, initialLat, initialLng]);

  const handleConfirm = () => {
    onCoordinatesSelect(lat, lng);
    onOpenChange(false);
  };

  const handleManualUpdate = () => {
    if (map.current && marker.current) {
      marker.current.setLngLat([lng, lat]);
      map.current.flyTo({ center: [lng, lat], zoom: 12 });
    } else if (map.current) {
      marker.current = new mapboxgl.Marker({
        draggable: true,
        color: '#3b82f6',
      })
        .setLngLat([lng, lat])
        .addTo(map.current);

      marker.current.on('dragend', () => {
        const lngLat = marker.current!.getLngLat();
        setLat(Number(lngLat.lat.toFixed(6)));
        setLng(Number(lngLat.lng.toFixed(6)));
      });

      map.current.flyTo({ center: [lng, lat], zoom: 12 });
    }
  };

  const toggleMapStyle = () => {
    const newStyle = mapStyle === 'outdoors' ? 'satellite' : 'outdoors';
    setMapStyle(newStyle);

    if (map.current) {
      const styleUrl = newStyle === 'satellite'
        ? 'mapbox://styles/mapbox/satellite-streets-v12'
        : 'mapbox://styles/mapbox/outdoors-v12';

      map.current.setStyle(styleUrl);

      // Re-add marker after style change
      map.current.once('styledata', () => {
        if (marker.current && map.current) {
          // Marker persists through style changes, but we may need to ensure it's still visible
          map.current.resize();
        }
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle>Select Coordinates on Map</DialogTitle>
          <DialogDescription>
            Click on the map to select a location, or enter coordinates manually. You can also drag the marker.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="lat">Latitude</Label>
              <Input
                id="lat"
                type="number"
                step="0.000001"
                value={lat}
                onChange={(e) => setLat(Number(e.target.value))}
                onBlur={handleManualUpdate}
              />
            </div>
            <div>
              <Label htmlFor="lng">Longitude</Label>
              <Input
                id="lng"
                type="number"
                step="0.000001"
                value={lng}
                onChange={(e) => setLng(Number(e.target.value))}
                onBlur={handleManualUpdate}
              />
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
            <Button
              variant="outline"
              size="sm"
              onClick={toggleMapStyle}
              style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
            >
              <i className={mapStyle === 'satellite' ? 'fas fa-map' : 'fas fa-satellite'}></i>
              {mapStyle === 'satellite' ? 'Street View' : 'Satellite View'}
            </Button>
          </div>

          <div
            ref={mapContainer}
            className="w-full h-[500px] rounded-md border"
            style={{
              width: '100%',
              height: '500px',
              minHeight: '500px',
              position: 'relative',
              border: '1px solid #e5e7eb',
              borderRadius: '0.375rem'
            }}
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleConfirm}>
            Confirm Selection
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
