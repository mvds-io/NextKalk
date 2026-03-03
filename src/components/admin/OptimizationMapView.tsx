'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { LandingsplassWithCoords, VannWithCoords, ClusterResult } from '@/lib/optimizationUtils';
import { Map as MapIcon, Circle, Star, XCircle, CheckCircle } from 'lucide-react';

interface OptimizationMapViewProps {
  vann: VannWithCoords[];
  currentLandingsplasser: LandingsplassWithCoords[];
  optimizedClusters?: ClusterResult[];
  deactivatedLpIds?: Set<number>;
  showMode?: 'current' | 'optimized' | 'comparison';
}

export function OptimizationMapView({
  vann,
  currentLandingsplasser,
  optimizedClusters,
  deactivatedLpIds = new Set(),
  showMode = 'current',
}: OptimizationMapViewProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const [mapLoaded, setMapLoaded] = useState(false);

  // Initialize map
  useEffect(() => {
    if (typeof window === 'undefined' || !mapContainerRef.current) return;

    // Check if Leaflet is available
    const L = (window as any).L;
    if (!L) {
      console.error('Leaflet not loaded');
      return;
    }

    // Don't reinitialize if map already exists
    if (mapRef.current) return;

    // Create map centered on Norway
    const map = L.map(mapContainerRef.current).setView([65.0, 13.0], 5);

    // Add OpenStreetMap tiles (CartoDB Voyager for a cleaner look)
    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
      subdomains: 'abcd',
      maxZoom: 19
    }).addTo(map);

    mapRef.current = map;
    setMapLoaded(true);

    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  // Update map markers when data changes
  useEffect(() => {
    if (!mapLoaded || !mapRef.current) return;

    const L = (window as any).L;
    const map = mapRef.current;

    // Clear existing layers except base tile layer
    map.eachLayer((layer: any) => {
      if (layer instanceof L.TileLayer) return;
      map.removeLayer(layer);
    });

    // Show current configuration
    if (showMode === 'current' || showMode === 'comparison') {
      // Draw vann markers (blue dots)
      vann.forEach((v) => {
        if (!v.latitude || !v.longitude) return;

        L.circleMarker([v.latitude, v.longitude], {
          radius: 4,
          fillColor: '#3b82f6',
          color: '#2563eb',
          weight: 1,
          opacity: 0.8,
          fillOpacity: 0.6,
        })
          .bindPopup(`<b>${v.name || 'Vann'}</b><br>${v.fylke || 'Unknown fylke'}`)
          .addTo(map);
      });

      // Draw current landingsplasser
      currentLandingsplasser.forEach((lp) => {
        if (!lp.latitude || !lp.longitude) return;

        const isDeactivated = deactivatedLpIds.has(lp.id);
        const color = isDeactivated ? '#ef4444' : '#10b981';
        const icon = isDeactivated ? 'times' : 'helicopter';

        const marker = L.marker([lp.latitude, lp.longitude], {
          icon: L.divIcon({
            html: `<div style="background: ${color}; border-radius: 50%; width: 24px; height: 24px; display: flex; align-items: center; justify-content: center; color: white; font-size: 12px; border: 2px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.2);">
              <i class="fas fa-${icon}"></i>
            </div>`,
            className: 'custom-lp-marker',
            iconSize: [24, 24],
            iconAnchor: [12, 12],
          }),
        })
          .bindPopup(
            `<b>LP: ${lp.lp}</b><br>` +
            `${lp.fylke || 'Unknown fylke'}<br>` +
            `${isDeactivated ? '<span style="color: red;">Deactivated in planning</span>' : 'Active'}`
          )
          .addTo(map);
      });
    }

    // Show optimized configuration
    if (showMode === 'optimized' || showMode === 'comparison') {
      if (optimizedClusters && optimizedClusters.length > 0) {
        // Generate colors for different clusters
        const colors = [
          '#ef4444', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6',
          '#ec4899', '#14b8a6', '#f97316', '#06b6d4', '#6366f1',
        ];

        optimizedClusters.forEach((cluster, idx) => {
          const color = colors[idx % colors.length];

          // Draw cluster members with color
          if (showMode === 'optimized') {
            cluster.members.forEach((member) => {
              L.circleMarker([member.latitude, member.longitude], {
                radius: 4,
                fillColor: color,
                color: color,
                weight: 1,
                opacity: 0.8,
                fillOpacity: 0.5,
              })
                .bindPopup(`<b>${member.name || 'Vann'}</b><br>Cluster ${idx + 1}`)
                .addTo(map);

              // Draw line to centroid
              L.polyline(
                [
                  [member.latitude, member.longitude],
                  [cluster.centroid.latitude, cluster.centroid.longitude],
                ],
                {
                  color: color,
                  weight: 1,
                  opacity: 0.4,
                  dashArray: '4,4',
                }
              ).addTo(map);
            });
          }

          // Draw optimized LP position (star marker)
          const starMarker = L.marker([cluster.centroid.latitude, cluster.centroid.longitude], {
            icon: L.divIcon({
              html: `<div style="background: ${color}; border-radius: 50%; width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; color: white; font-size: 16px; border: 3px solid white; box-shadow: 0 4px 8px rgba(0,0,0,0.3); position: relative;">
                <i class="fas fa-star"></i>
                ${showMode === 'comparison' ? '<div style="position: absolute; top: -4px; right: -4px; background: #fbbf24; border-radius: 50%; width: 14px; height: 14px; display: flex; align-items: center; justify-content: center; font-size: 8px; font-weight: bold; border: 1px solid white;">!</div>' : ''}
              </div>`,
              className: 'custom-optimized-marker',
              iconSize: [32, 32],
              iconAnchor: [16, 16],
            }),
          })
            .bindPopup(
              `<b>Optimized LP ${idx + 1}</b><br>` +
              `Members: ${cluster.members.length}<br>` +
              `Avg Distance: ${cluster.averageDistance.toFixed(2)} km<br>` +
              `Total Tonnage: ${cluster.totalTonnage.toFixed(1)} t<br>` +
              `<small>Position: ${cluster.centroid.latitude.toFixed(4)}, ${cluster.centroid.longitude.toFixed(4)}</small>`
            )
            .addTo(map);
        });
      }
    }

    // Fit bounds to show all markers
    const allMarkers: [number, number][] = [];
    vann.forEach((v) => {
      if (v.latitude && v.longitude) {
        allMarkers.push([v.latitude, v.longitude]);
      }
    });
    currentLandingsplasser.forEach((lp) => {
      if (lp.latitude && lp.longitude) {
        allMarkers.push([lp.latitude, lp.longitude]);
      }
    });
    if (optimizedClusters) {
      optimizedClusters.forEach((cluster) => {
        allMarkers.push([cluster.centroid.latitude, cluster.centroid.longitude]);
      });
    }

    if (allMarkers.length > 0) {
      const bounds = L.latLngBounds(allMarkers);
      map.fitBounds(bounds, { padding: [50, 50] });
    }
  }, [mapLoaded, vann, currentLandingsplasser, optimizedClusters, deactivatedLpIds, showMode]);

  return (
    <Card className="overflow-hidden border-0 shadow-md">
      <div className="relative h-[600px] w-full bg-gray-100">
        <div
          ref={mapContainerRef}
          className="w-full h-full z-0"
        />
        
        {/* Map Legend Overlay */}
        <div className="absolute bottom-4 left-4 z-[1000] bg-white/90 backdrop-blur-sm p-3 rounded-lg shadow-lg border border-gray-200 text-xs max-w-xs">
          <div className="font-semibold mb-2 text-gray-900">Map Legend</div>
          <div className="grid grid-cols-1 gap-1.5">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-blue-500 border border-blue-600"></div>
              <span className="text-gray-700">Vann marker</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-green-500 border border-green-600"></div>
              <span className="text-gray-700">Active landingsplass</span>
            </div>
            {deactivatedLpIds.size > 0 && (
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-red-500 border border-red-600"></div>
                <span className="text-gray-700">Deactivated in planning</span>
              </div>
            )}
            {optimizedClusters && optimizedClusters.length > 0 && (
              <>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-yellow-500 border border-yellow-600 flex items-center justify-center">
                    <div className="w-1 h-1 bg-white rounded-full"></div>
                  </div>
                  <span className="text-gray-700">Optimized LP position</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-0.5 bg-gray-400 border-t border-dashed border-gray-600"></div>
                  <span className="text-gray-500">Cluster membership</span>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Mode Badge */}
        <div className="absolute top-4 right-4 z-[1000]">
          <Badge variant="secondary" className="bg-white/90 backdrop-blur shadow-sm text-gray-800 hover:bg-white/100">
            <MapIcon className="w-3 h-3 mr-1" />
            {showMode === 'current' && 'Current View'}
            {showMode === 'optimized' && 'Optimized View'}
            {showMode === 'comparison' && 'Comparison View'}
          </Badge>
        </div>
      </div>
    </Card>
  );
}
