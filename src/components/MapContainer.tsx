'use client';

import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { Airport, Landingsplass, KalkInfo, User, FilterState } from '@/types';
import { supabase } from '@/lib/supabase';

interface MapContainerProps {
  airports: Airport[];
  landingsplasser: Landingsplass[];
  kalkMarkers: KalkInfo[];
  filterState: FilterState;
  user: User | null;
  onDataUpdate: () => void;
}

export default function MapContainer({ 
  airports, 
  landingsplasser, 
  kalkMarkers, 
  filterState, 
  user, 
  onDataUpdate 
}: MapContainerProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const leafletMapRef = useRef<any>(null);
  const markersLayerRef = useRef<any>(null);
  const clusterGroupRef = useRef<any>(null);
  const _connectionsLayerRef = useRef<any>(null);
  const [isMapReady, setIsMapReady] = useState(false);
  const [userPermissions, setUserPermissions] = useState<any>({});
  const [isSatelliteView, setIsSatelliteView] = useState(false);
  const tileLayerRef = useRef<any>(null);
  const userLocationMarkerRef = useRef<any>(null);

  // Connection state
  const [allConnectionsVisible, setAllConnectionsVisible] = useState(false);
  const allConnectionLinesRef = useRef<any[]>([]);
  const individualConnectionLinesRef = useRef<any[]>([]);

  // Add loading state management
  const currentLoadingIdRef = useRef<string | null>(null);
  const loadingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Enhanced mobile/tablet detection - available throughout component
  const isMobileOrTablet = useCallback(() => {
    // Check for touch support
    const hasTouchScreen = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    // Check user agent for mobile/tablet devices
    const isMobileUA = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    // Check for iPad specifically (including newer iPads that might not show up in user agent)
    const isIPad = /iPad/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    // Width check for smaller screens
    const isSmallScreen = window.innerWidth <= 1024;
    
    console.log('Mobile detection:', { hasTouchScreen, isMobileUA, isIPad, isSmallScreen, userAgent: navigator.userAgent });
    
    return hasTouchScreen || isMobileUA || isIPad || isSmallScreen;
  }, []);

  // Get user permissions
  useEffect(() => {
    const getUserPermissions = async () => {
      if (!user) return {};
      
      try {
        const permissions = {
          canEditMarkers: ['admin', 'manager', 'user'].includes(user.role || 'user'),
          canEditPriority: ['admin', 'manager'].includes(user.role || 'user'),
          canDeleteMarkers: ['admin', 'manager'].includes(user.role || 'user'),
          canViewLogs: ['admin', 'manager'].includes(user.role || 'user'),
          role: user.role || 'user',
          userRecord: user
        };
        setUserPermissions(permissions);
        return permissions;
      } catch (error) {
        console.warn('Error loading user permissions:', error);
        return {};
      }
    };

    getUserPermissions();
  }, [user]);

  // Connection functions
  const showAllConnections = async () => {
    if (!leafletMapRef.current || !markersLayerRef.current) return;
    
    console.log('🔗 Showing all connections...');
    
    // Update button state
    const connectionsButton = document.getElementById('toggle-all-connections');
    if (connectionsButton) {
      connectionsButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Laster forbindelser...';
      (connectionsButton as HTMLButtonElement).disabled = true;
    }

    try {
      // Clear existing connections
      hideAllConnections();

             // Filter landingsplasser based on current filter
       let filteredLandingsplasser = landingsplasser;
       if (filterState.county && filterState.county !== 'all') {
         filteredLandingsplasser = landingsplasser.filter(lp => lp.fylke === filterState.county);
       }

      const totalMarkers = filteredLandingsplasser.length;
      let processedCount = 0;

      for (const landingsplass of filteredLandingsplasser) {
        processedCount++;
        const progressPercent = Math.round((processedCount / totalMarkers) * 100);
        
        if (connectionsButton) {
          connectionsButton.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Laster ${progressPercent}%`;
        }

        try {
          // Fetch associated airports
          const { data: associations, error } = await supabase
            .from('vass_associations')
            .select(`
              airport_id,
              vass_vann:airport_id (
                id, name, latitude, longitude
              )
            `)
            .eq('landingsplass_id', landingsplass.id);

          if (error) throw error;

          if (!associations || associations.length === 0) continue;

          // Create connection lines
          associations.forEach((assoc: any) => {
            const airport = assoc.vass_vann;
            if (!airport) return;

            const landingsplassPos = [landingsplass.latitude, landingsplass.longitude];
            const airportPos = [airport.latitude, airport.longitude];

                         const L = (window as any).L;
             const line = L.polyline([landingsplassPos, airportPos], {
              color: '#007bff',
              weight: 2,
              opacity: 0.6,
              dashArray: '4,4',
              className: 'all-connection-line'
            }).addTo(leafletMapRef.current);

            allConnectionLinesRef.current.push(line);
          });

          // Small delay to prevent UI blocking
          if (processedCount % 5 === 0) {
            await new Promise(resolve => setTimeout(resolve, 10));
          }

        } catch (error) {
          console.error(`Error fetching associations for landingsplass ${landingsplass.id}:`, error);
          continue;
        }
      }

      setAllConnectionsVisible(true);
      
      if (connectionsButton) {
        connectionsButton.innerHTML = '<i class="fas fa-eye-slash"></i> Skjul forbindelser';
        (connectionsButton as HTMLButtonElement).disabled = false;
      }

      console.log(`✅ Showing ${allConnectionLinesRef.current.length} connections from ${processedCount} landingsplasser`);

    } catch (error) {
      console.error('Error showing all connections:', error);
      
      if (connectionsButton) {
        connectionsButton.innerHTML = '<i class="fas fa-project-diagram"></i> Vis forbindelser';
        (connectionsButton as HTMLButtonElement).disabled = false;
      }
    }
  };

  const hideAllConnections = () => {
    // Remove all connection lines from map
    allConnectionLinesRef.current.forEach(line => {
      if (leafletMapRef.current && line) {
        leafletMapRef.current.removeLayer(line);
      }
    });
    allConnectionLinesRef.current = [];
    setAllConnectionsVisible(false);

    const connectionsButton = document.getElementById('toggle-all-connections');
    if (connectionsButton) {
      connectionsButton.innerHTML = '<i class="fas fa-project-diagram"></i> Vis forbindelser';
      (connectionsButton as HTMLButtonElement).disabled = false;
    }
  };

  const toggleAllConnections = async () => {
    if (allConnectionsVisible) {
      hideAllConnections();
    } else {
      await showAllConnections();
    }
  };

  // Individual landingsplass connection functions
  const showIndividualConnections = async (landingsplassId: number) => {
    if (!leafletMapRef.current) return;
    
    console.log('🔗 Showing individual connections for landingsplass:', landingsplassId);
    
    // Don't show individual connections if all connections are already visible
    if (allConnectionsVisible) {
      console.log('All connections already visible, skipping individual connection');
      return;
    }

    // Clear any existing individual connections
    hideIndividualConnections();

    try {
      // Find the landingsplass data
      const landingsplass = landingsplasser.find(lp => lp.id === landingsplassId);
      if (!landingsplass) return;

      // Fetch associated airports
      const { data: associations, error } = await supabase
        .from('vass_associations')
        .select(`
          airport_id,
          vass_vann:airport_id (
            id, name, latitude, longitude
          )
        `)
        .eq('landingsplass_id', landingsplassId);

      if (error) throw error;

      if (!associations || associations.length === 0) {
        console.log('No associations found for landingsplass', landingsplassId);
        return;
      }

      // Create connection lines
      associations.forEach((assoc: any) => {
        const airport = assoc.vass_vann;
        if (!airport) return;

        const landingsplassPos = [landingsplass.latitude, landingsplass.longitude];
        const airportPos = [airport.latitude, airport.longitude];

        const L = (window as any).L;
        const line = L.polyline([landingsplassPos, airportPos], {
          color: '#ff0000', // Red for individual connections
          weight: 3,
          opacity: 0.8,
          className: 'individual-connection-line'
        }).addTo(leafletMapRef.current);

        individualConnectionLinesRef.current.push(line);
      });

      console.log(`✅ Showing ${individualConnectionLinesRef.current.length} individual connections for landingsplass ${landingsplassId}`);

    } catch (error) {
      console.error('Error showing individual connections:', error);
    }
  };

  const hideIndividualConnections = () => {
    // Remove all individual connection lines from map
    individualConnectionLinesRef.current.forEach(line => {
      if (leafletMapRef.current && line) {
        leafletMapRef.current.removeLayer(line);
      }
    });
    individualConnectionLinesRef.current = [];
  };

  // Load Leaflet and initialize map
  useEffect(() => {
    const loadLeaflet = async () => {
      if (typeof window === 'undefined') return;

      try {
        // Dynamically import Leaflet
        const L = (await import('leaflet')).default;
        
        // Import required Leaflet plugins
        await import('leaflet-routing-machine');
        await import('leaflet.awesome-markers');
        await import('leaflet.markercluster');

        // Set default icon options
        delete ((L as any).Icon.Default.prototype)._getIconUrl;
        (L as any).Icon.Default.mergeOptions({
          iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
          iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
          shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
        });

        if (mapRef.current && !leafletMapRef.current) {
          // Initialize map with default center (will be updated with user location)
          const map = (L as any).map(mapRef.current).setView([61.5, 8.0], 6);

          // Add default tile layer (OpenStreetMap)
          const osmLayer = (L as any).tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap contributors',
            maxZoom: 19
          });

          // Add satellite tile layer (Esri World Imagery)
          const satelliteLayer = (L as any).tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
            attribution: 'Tiles © Esri — Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community',
            maxZoom: 19
          });

          // Start with OSM layer
          osmLayer.addTo(map);
          tileLayerRef.current = { osm: osmLayer, satellite: satelliteLayer };

          // Create clustering groups for better performance
          const clusterGroup = (L as any).markerClusterGroup({
            chunkedLoading: true,
            chunkProgress: (_processed: number, _total: number) => {
              // Optional: Add loading progress feedback
            },
            maxClusterRadius: 35, // Reduced from 50 to make smaller clusters
            disableClusteringAtZoom: 8, // Disable clustering at zoom level 8 and higher (was 12)
            showCoverageOnHover: false,
            zoomToBoundsOnClick: true,
            spiderfyOnMaxZoom: true,
            removeOutsideVisibleBounds: false, // Keep markers in DOM to preserve popups
            animate: true,
            animateAddingMarkers: false, // Better performance
            iconCreateFunction: function(cluster: any) {
              const count = cluster.getChildCount();
              let size = 'small';
              let width = 40;
              let height = 40;
              
              if (count >= 100) {
                size = 'large';
                width = 60;
                height = 60;
              } else if (count >= 10) {
                size = 'medium';
                width = 50;
                height = 50;
              }
              
              return (L as any).divIcon({
                html: `<div style="
                  background: rgba(108, 117, 125, 0.7);
                  border: 2px solid rgba(90, 90, 90, 0.8);
                  border-radius: 50%;
                  color: white;
                  font-weight: 600;
                  font-size: ${size === 'large' ? '16px' : size === 'medium' ? '14px' : '12px'};
                  text-align: center;
                  line-height: ${width - 4}px;
                  width: ${width - 4}px;
                  height: ${height - 4}px;
                  margin: 2px;
                  box-shadow: 0 2px 6px rgba(0,0,0,0.2);
                  text-shadow: 0 1px 2px rgba(0,0,0,0.6);
                  transition: none;
                ">${count}</div>`,
                className: 'custom-cluster-grey',
                iconSize: [width, height],
                iconAnchor: [width/2, height/2]
              });
            }
          });
          
          // Create regular layer for non-clustered items (connections, etc.)
          const markersLayer = (L as any).layerGroup().addTo(map);
          
          // Add cluster group to map
          map.addLayer(clusterGroup);

          leafletMapRef.current = map;
          markersLayerRef.current = markersLayer;
          clusterGroupRef.current = clusterGroup;
          setIsMapReady(true);

          // Make map instance available globally for zoom functionality
          (window as any).leafletMapInstance = map;

          // Make global functions available for popup buttons
          setupGlobalFunctions(L, map);


          // Force mobile behavior on tablets/iPads
          if (isMobileOrTablet()) {
            // Add mobile-specific classes to body for CSS targeting
            document.body.classList.add('mobile-device');
            if (/iPad/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)) {
              document.body.classList.add('ipad-device');
            }
            
            // Ensure proper viewport meta tag for tablets
            let viewport = document.querySelector('meta[name=viewport]') as HTMLMetaElement;
            if (!viewport) {
              viewport = document.createElement('meta');
              viewport.name = 'viewport';
              document.head.appendChild(viewport);
            }
            viewport.content = 'width=device-width, initial-scale=1.0, user-scalable=no';
          }

          // Override popup behavior to prevent auto-closing on mobile/tablet
          const originalCheckDynamicEvents = map._checkDynamicEvents;
          map._checkDynamicEvents = function() {
            // Prevent popup from closing when map is panned or zoomed on mobile/tablet
            const popups = document.querySelectorAll('.mobile-friendly-popup');
            const shouldPreventClose = popups.length > 0 && isMobileOrTablet();
            
            if (!shouldPreventClose) {
              return originalCheckDynamicEvents.call(this);
            }
            // For mobile, we still want to allow the event processing, just not close the popup
            return true;
          };

          // Override Leaflet's closePopup function for mobile-friendly popups
          const originalClosePopup = map.closePopup;
          map.closePopup = function(popup?: any) {
            if (isMobileOrTablet()) {
              // Check if this is a mobile-friendly popup
              const openPopup = popup || map._popup;
              if (openPopup && openPopup.options && openPopup.options.className === 'mobile-friendly-popup') {
                // Don't close mobile-friendly popups unless explicitly requested via close button
                const popupElement = document.querySelector('.mobile-friendly-popup');
                if (popupElement && !popupElement.hasAttribute('data-force-close')) {
                  console.log('Preventing automatic popup close on mobile - only close button should close it');
                  return map; // Return map instance without closing
                }
              }
            }
            return originalClosePopup.call(this, popup);
          };

          // Override the popup's close method as well
          const originalPopupClose = L.Popup.prototype.close;
          L.Popup.prototype.close = function() {
            if (window.innerWidth <= 1024 && this.options.className === 'mobile-friendly-popup') {
              const popupElement = document.querySelector('.mobile-friendly-popup');
              if (popupElement && !popupElement.hasAttribute('data-force-close')) {
                return this; // Don't close
              }
            }
            return originalPopupClose.call(this);
          };

          // Override Leaflet's internal popup removal methods
          const originalRemove = L.Popup.prototype.remove;
          L.Popup.prototype.remove = function() {
            if (window.innerWidth <= 1024 && this.options.className === 'mobile-friendly-popup') {
              const popupElement = document.querySelector('.mobile-friendly-popup');
              if (popupElement && !popupElement.hasAttribute('data-force-close')) {
                return this; // Don't remove
              }
            }
            return originalRemove.call(this);
          };

          // Override map's removeLayer method for popups
          const originalRemoveLayer = map.removeLayer;
          map.removeLayer = function(layer: any) {
            if (window.innerWidth <= 1024 && layer instanceof L.Popup && layer.options.className === 'mobile-friendly-popup') {
              const popupElement = document.querySelector('.mobile-friendly-popup');
              if (popupElement && !popupElement.hasAttribute('data-force-close')) {
                return map; // Don't remove mobile-friendly popups
              }
            }
            return originalRemoveLayer.call(this, layer);
          };

          // Add event listeners to prevent popup closing during map interactions on mobile
          map.on('movestart', function(e: any) {
            if (isMobileOrTablet()) {
              const openPopup = map._popup;
              if (openPopup && openPopup.options.className === 'mobile-friendly-popup') {
                e.preventDefault && e.preventDefault();
                return false;
              }
            }
          });

          map.on('zoomstart', function(e: any) {
            if (isMobileOrTablet()) {
              const openPopup = map._popup;
              if (openPopup && openPopup.options.className === 'mobile-friendly-popup') {
                e.preventDefault && e.preventDefault();
                return false;
              }
            }
          });

          // Add more comprehensive event listeners to prevent popup closing
          map.on('moveend', function(_e: any) {
            if (isMobileOrTablet()) {
              const popups = document.querySelectorAll('.mobile-friendly-popup');
              if (popups.length > 0) {
                // Ensure popup stays visible after move
                popups.forEach((popup) => {
                  const leafletPopup = popup.closest('.leaflet-popup') as HTMLElement;
                  if (leafletPopup) {
                    leafletPopup.style.visibility = 'visible !important';
                    leafletPopup.style.opacity = '1 !important';
                    leafletPopup.style.display = 'block !important';
                  }
                });
              }
            }
          });

          map.on('zoomend', function(_e: any) {
            if (isMobileOrTablet()) {
              const popups = document.querySelectorAll('.mobile-friendly-popup');
              if (popups.length > 0) {
                // Ensure popup stays visible after zoom
                popups.forEach((popup) => {
                  const leafletPopup = popup.closest('.leaflet-popup') as HTMLElement;
                  if (leafletPopup) {
                    leafletPopup.style.visibility = 'visible !important';
                    leafletPopup.style.opacity = '1 !important';
                    leafletPopup.style.display = 'block !important';
                  }
                });
              }
            }
          });

          // Mobile popup styling - apply mobile-specific styles without interfering with positioning
          const applyMobilePopupStyling = () => {
            try {
              if (isMobileOrTablet()) {
                const popups = document.querySelectorAll('.leaflet-popup');
                
                popups.forEach((popup) => {
                  const leafletPopup = popup as HTMLElement;
                  
                  if (leafletPopup) {
                    // Apply only styling adjustments, let Leaflet handle positioning
                    setTimeout(() => {
                      leafletPopup.style.setProperty('z-index', '10000', 'important');
                      leafletPopup.style.setProperty('visibility', 'visible', 'important');
                      leafletPopup.style.setProperty('opacity', '1', 'important');
                      leafletPopup.style.setProperty('display', 'block', 'important');
                      leafletPopup.style.setProperty('pointer-events', 'auto', 'important');
                      
                      // Set size constraints
                      if (window.innerWidth <= 767) {
                        leafletPopup.style.setProperty('max-width', '95vw', 'important');
                        leafletPopup.style.setProperty('max-height', '70vh', 'important');
                      } else {
                        leafletPopup.style.setProperty('max-width', '400px', 'important');
                        leafletPopup.style.setProperty('max-height', '75vh', 'important');
                      }
                      
                      // Ensure popup content is scrollable
                      const content = leafletPopup.querySelector('.leaflet-popup-content') as HTMLElement;
                      if (content) {
                        content.style.maxHeight = window.innerWidth <= 767 ? '60vh' : '65vh';
                        content.style.overflowY = 'auto';
                        content.style.WebkitOverflowScrolling = 'touch';
                      }
                    }, 100);
                  }
                });
              }
            } catch (error) {
              console.error('Error applying mobile popup styling:', error);
            }
          };
          
          // Apply mobile styling when popup opens
          map.on('popupopen', function() {
            if (isMobileOrTablet()) {
              applyMobilePopupStyling();
            }
          });
          

          // Add event delegation for close button clicks
          document.addEventListener('click', function(e: any) {
            if (e.target && e.target.closest && e.target.closest('.leaflet-popup-close-button')) {
              if (isMobileOrTablet()) {
                // Mark mobile-friendly popup for force closing
                const popupElement = document.querySelector('.mobile-friendly-popup');
                if (popupElement) {
                  popupElement.setAttribute('data-force-close', 'true');
                  // Close the popup
                  const popup = map._popup;
                  if (popup) {
                    map.closePopup(popup);
                  }
                  // Clean up the attribute after closing
                  setTimeout(() => {
                    popupElement.removeAttribute('data-force-close');
                  }, 100);
                }
              }
            }
          });

          // Try to get user's location and center map after everything is initialized
          const getUserLocation = () => {
            if (!navigator.geolocation) {
              console.log('📍 Geolocation is not supported by this browser');
              return;
            }

            
            // Use different options for mobile vs desktop
            const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
            const geolocationOptions = {
              enableHighAccuracy: true,
              timeout: isMobile ? 20000 : 10000, // Longer timeout for mobile
              maximumAge: isMobile ? 60000 : 300000 // Shorter cache for mobile for more accurate results
            };


            navigator.geolocation.getCurrentPosition(
              (position) => {
                const { latitude, longitude, accuracy } = position.coords;
                
                // Center map on user location with appropriate zoom based on accuracy
                const zoomLevel = accuracy > 1000 ? 8 : accuracy > 100 ? 10 : 12;
                map.setView([latitude, longitude], zoomLevel);
                
                // Remove existing user location marker if any
                if (userLocationMarkerRef.current) {
                  map.removeLayer(userLocationMarkerRef.current);
                }
                
                // Add persistent marker to show user location
                const userLocationMarker = (L as any).marker([latitude, longitude], {
                  icon: (L as any).divIcon({
                    html: `
                      <div style="
                        background: #007bff; 
                        width: 18px; 
                        height: 18px; 
                        border-radius: 50%; 
                        border: 3px solid white; 
                        box-shadow: 0 2px 10px rgba(0,0,0,0.3);
                        position: relative;
                        z-index: 1000;
                      ">
                        <div style="
                          position: absolute;
                          top: -4px;
                          left: -4px;
                          width: 22px;
                          height: 22px;
                          border-radius: 50%;
                          background: rgba(0, 123, 255, 0.3);
                          animation: pulse 2s infinite;
                          z-index: 999;
                        "></div>
                      </div>
                    `,
                    className: 'user-location-marker persistent-marker',
                    iconSize: [24, 24],
                    iconAnchor: [12, 12]
                  })
                }).addTo(map);
                
                // Store reference to marker so it persists
                userLocationMarkerRef.current = userLocationMarker;
                
                // Bind tooltip (shows on hover) instead of popup
                userLocationMarker.bindTooltip('Your location', {
                  permanent: false,
                  direction: 'top',
                  offset: [0, -10],
                  className: 'user-location-tooltip'
                });
              },
              (error) => {
                
                // Provide specific error messages
                switch(error.code) {
                  case error.PERMISSION_DENIED:
                    break;
                  case error.POSITION_UNAVAILABLE:
                    break;
                  case error.TIMEOUT:
                    break;
                  default:
                    break;
                }
              },
              geolocationOptions
            );
          };

          // Call the function to get user location
          getUserLocation();
        }
      } catch (error) {
        console.error('Error loading Leaflet:', error);
      }
    };

    loadLeaflet();

    return () => {
      if (leafletMapRef.current) {
        // Clean up user location marker
        if (userLocationMarkerRef.current) {
          leafletMapRef.current.removeLayer(userLocationMarkerRef.current);
          userLocationMarkerRef.current = null;
        }
        
        leafletMapRef.current.remove();
        leafletMapRef.current = null;
        markersLayerRef.current = null;
        clusterGroupRef.current = null;
        tileLayerRef.current = null;
        setIsMapReady(false);
        
        // Clean up global map instance
        (window as any).leafletMapInstance = null;
      }
      
      // Clean up loading state
      currentLoadingIdRef.current = null;
      if (loadingTimeoutRef.current) {
        clearTimeout(loadingTimeoutRef.current);
        loadingTimeoutRef.current = null;
      }
    };
  }, []);

  // Handle map resize when container size changes (for mobile UI toggle)
  useEffect(() => {
    const handleResize = () => {
      if (leafletMapRef.current) {
        // Small delay to ensure CSS changes have been applied
        setTimeout(() => {
          leafletMapRef.current.invalidateSize();
        }, 100);
      }
    };

    // Listen for window resize and orientation changes
    window.addEventListener('resize', handleResize);
    window.addEventListener('orientationchange', handleResize);
    
    // Listen for mobile UI toggle events
    window.addEventListener('mobileUIToggle', handleResize);
    window.addEventListener('progressPlanToggle', handleResize);
    window.addEventListener('fullscreenToggle', handleResize);
    
    // Also check for changes in container size using ResizeObserver if available
    let resizeObserver: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined' && leafletMapRef.current) {
      const mapContainer = leafletMapRef.current.getContainer().parentElement;
      if (mapContainer) {
        resizeObserver = new ResizeObserver(() => {
          handleResize();
        });
        resizeObserver.observe(mapContainer);
      }
    }

    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('orientationchange', handleResize);
      window.removeEventListener('mobileUIToggle', handleResize);
      window.removeEventListener('progressPlanToggle', handleResize);
      window.removeEventListener('fullscreenToggle', handleResize);
      if (resizeObserver) {
        resizeObserver.disconnect();
      }
    };
  }, [isMapReady]);

  // Setup global functions for popup interactions
  const setupGlobalFunctions = (L: any, map: any) => {
    if (typeof window === 'undefined') return;

    // Toggle done status
    (window as any).handleToggleDone = async (id: number, type: string) => {
      try {
        const tableName = type === 'airport' ? 'vass_vann' : 'vass_lasteplass';
        
        // Get current status directly from database to ensure we have the latest state
        const { data: currentData, error: fetchError } = await supabase
          .from(tableName)
          .select('is_done')
          .eq('id', id)
          .single();

        if (fetchError) throw fetchError;
        if (!currentData) return;

        const currentDoneStatus = currentData.is_done || false;
        const newDoneStatus = !currentDoneStatus;
        
        console.log(`🔄 Toggling ${type} ${id}: ${currentDoneStatus} → ${newDoneStatus}`);
        
        const updates: any = { 
          is_done: newDoneStatus 
        };

        // Only add completed_at for landingsplasser, not airports
        if (type === 'landingsplass') {
          if (newDoneStatus) {
            updates.completed_at = new Date().toISOString();
          } else {
            updates.completed_at = null;
          }
        }

        const { error } = await supabase
          .from(tableName)
          .update(updates)
          .eq('id', id);

        if (error) throw error;

        // If this is a landingsplass, cascade the status change to all associated airports
        if (type === 'landingsplass') {
          const action = newDoneStatus ? 'done' : 'undone';
          console.log(`🔗 Marking associated airports as ${action} for landingsplass ${id}...`);
          
          try {
            // Get all associated airports for this landingsplass
            const { data: associations, error: assocError } = await supabase
              .from('vass_associations')
              .select('airport_id')
              .eq('landingsplass_id', id);

            if (assocError) {
              console.warn('Could not fetch associations:', assocError);
            } else if (associations && associations.length > 0) {
              const airportIds = associations.map(assoc => assoc.airport_id);
              console.log(`📍 Found ${airportIds.length} associated airports:`, airportIds);
              
              // Update all associated airports to match the landingsplass status
              const { error: updateError } = await supabase
                .from('vass_vann')
                .update({ is_done: newDoneStatus })
                .in('id', airportIds);

              if (updateError) {
                console.warn('Could not update associated airports:', updateError);
              } else {
                console.log(`✅ Successfully marked ${airportIds.length} associated airports as ${action}`);
              }
            }
          } catch (cascadeError) {
            console.warn('Error in cascade update:', cascadeError);
            // Don't fail the main operation if cascade fails
          }
        }

        // Log the action
        const currentItem = type === 'airport' 
          ? airports.find(a => a.id === id)
          : landingsplasser.find(l => l.id === id);
          
        if (user && currentItem) {
          await supabase
            .from('user_action_logs')
            .insert({
              user_email: user.email,
              action_type: 'toggle_done',
              target_type: type,
              target_id: id,
              target_name: currentItem.name || (currentItem as any).navn || (currentItem as any).lp || 'Unknown',
              action_details: { 
                new_status: newDoneStatus ? 'completed' : 'incomplete',
                completed_at: updates.completed_at
              }
            });
        }

        // Refresh data and close popup to force re-render
        onDataUpdate();
        
        // Close the popup to force it to refresh when reopened
        setTimeout(() => {
          const popups = document.querySelectorAll('.leaflet-popup-close-button');
          if (popups.length > 0) {
            (popups[0] as HTMLElement).click();
          }
        }, 100);
        
      } catch (error) {
        console.error('Error toggling done status:', error);
        alert('Could not update status');
      }
    };

    // Handle route
    (window as any).handleRoute = async (id: number, type: string) => {
      try {
        const item = type === 'airport' 
          ? airports.find(a => a.id === id)
          : landingsplasser.find(l => l.id === id);

        if (!item || !item.latitude || !item.longitude) {
          alert('Coordinates not available for routing');
          return;
        }

        // Get user's current location
        if (!navigator.geolocation) {
          alert('Geolocation is not supported by this browser');
          return;
        }

        navigator.geolocation.getCurrentPosition(
          (position) => {
            const userLat = position.coords.latitude;
            const userLng = position.coords.longitude;

            // Create routing control
            const routingControl = (L as any).Routing.control({
              waypoints: [
                L.latLng(userLat, userLng),
                L.latLng(item.latitude, item.longitude)
              ],
              routeWhileDragging: true,
              addWaypoints: false,
              createMarker: () => null // Don't create additional markers
            }).addTo(map);

            // Store reference to remove later
            (window as any).currentRoute = routingControl;
          },
          (error) => {
            console.error('Error getting location:', error);
            alert('Could not get your location for routing');
          }
        );
      } catch (error) {
        console.error('Error creating route:', error);
        alert('Could not create route');
      }
    };

    // Handle GPX export
    (window as any).handleGPXExport = async (id: number, type: string) => {
      try {
        const item = type === 'airport' 
          ? airports.find(a => a.id === id)
          : landingsplasser.find(l => l.id === id);

        if (!item || !item.latitude || !item.longitude) {
          alert('Coordinates not available for GPX export');
          return;
        }

        const name = item.name || (item as any).navn || (item as any).lp || 'Waypoint';

        // For landingsplass, include associated waters
        if (type === 'landingsplass') {
          try {
            // Fetch associated waters for this landingsplass
            const { data: associations, error } = await supabase
              .from('vass_associations')
              .select(`
                vass_vann:airport_id (
                  id, name, latitude, longitude, tonn
                )
              `)
              .eq('landingsplass_id', id);

            if (error) {
              console.warn('Error fetching associations, exporting only landingsplass:', error);
              // Use landingsplass code (lp field) for the name
              const lpCode = (item as any).lp || (item as any).kode || name;
              exportToGPX(item.latitude, item.longitude, lpCode);
              return;
            }

            // Use landingsplass code (lp field) for the name
            const lpCode = (item as any).lp || (item as any).kode || name;
            
            const waypoints: Waypoint[] = [
              {
                lat: item.latitude,
                lng: item.longitude,
                name: lpCode,
                desc: 'Landingsplass - Exported from Kalk Planner 2025'
              }
            ];

            // Add associated waters
            if (associations && associations.length > 0) {
              associations.forEach((assoc: any) => {
                if (assoc.vass_vann && assoc.vass_vann.latitude && assoc.vass_vann.longitude) {
                  const waterName = assoc.vass_vann.name || 'Unknown Water';
                  const tonnage = assoc.vass_vann.tonn;
                  const formattedName = tonnage ? `(${tonnage}) ${waterName}` : waterName;
                  
                  waypoints.push({
                    lat: assoc.vass_vann.latitude,
                    lng: assoc.vass_vann.longitude,
                    name: formattedName,
                    desc: 'Associated Water - Exported from Kalk Planner 2025'
                  });
                }
              });
            }

            // Export multiple waypoints or single if no associations
            if (waypoints.length > 1) {
              exportMultipleToGPX(waypoints, `${lpCode}_with_waters`);
            } else {
              exportToGPX(item.latitude, item.longitude, lpCode);
            }

            // Log the GPX export action
            if (user) {
              await supabase
                .from('user_action_logs')
                .insert({
                  user_email: user.email,
                  action_type: 'export_gpx',
                  target_type: 'landingsplass',
                  target_id: id,
                  target_name: lpCode,
                  action_details: { 
                    waypoints_count: waypoints.length,
                    includes_waters: waypoints.length > 1
                  }
                });
            }

          } catch (fetchError) {
            console.warn('Error fetching waters, exporting only landingsplass:', fetchError);
            const lpCode = (item as any).lp || (item as any).kode || name;
            exportToGPX(item.latitude, item.longitude, lpCode);
          }
        } else {
          // For airports, export single waypoint as before
          exportToGPX(item.latitude, item.longitude, name);
          
          // Log the GPX export action
          if (user) {
            await supabase
              .from('user_action_logs')
              .insert({
                user_email: user.email,
                action_type: 'export_gpx',
                target_type: 'airport',
                target_id: id,
                target_name: name,
                action_details: { waypoints_count: 1 }
              });
          }
        }
      } catch (error) {
        console.error('Error exporting GPX:', error);
        alert('Could not export GPX');
      }
    };

    // Handle color change
    (window as any).handleColorChange = async (id: number, color: string) => {
      try {
        const { error } = await supabase
          .from('vass_vann')
          .update({ marker_color: color })
          .eq('id', id);

        if (error) throw error;

        // Log the action
        if (user) {
          await supabase
            .from('user_action_logs')
            .insert({
              user_email: user.email,
              action_type: 'change_color',
              target_type: 'airport',
              target_id: id,
              target_name: airports.find(a => a.id === id)?.name || 'Unknown',
              action_details: { new_color: color }
            });
        }

        onDataUpdate();
      } catch (error) {
        console.error('Error changing color:', error);
        alert('Could not change marker color');
      }
    };

    // Handle comment editing
    (window as any).showCommentEditor = (id: number, type: string) => {
      const editor = document.getElementById(`editor-${id}`);
      const button = document.getElementById(`comment-btn-${id}`);
      if (editor && button) {
        editor.style.display = 'block';
        button.style.display = 'none';
      }
    };

    (window as any).hideCommentEditor = (id: number, type: string) => {
      const editor = document.getElementById(`editor-${id}`);
      const button = document.getElementById(`comment-btn-${id}`);
      if (editor && button) {
        editor.style.display = 'none';
        button.style.display = 'block';
      }
    };

    (window as any).saveComment = async (id: number, type: string) => {
      try {
        const textarea = document.getElementById(`comment-${id}`) as HTMLTextAreaElement;
        if (!textarea) return;

        const comment = textarea.value.trim();
        const tableName = type === 'airport' ? 'vass_vann' : 'vass_lasteplass';
        
        const { error } = await supabase
          .from(tableName)
          .update({ 
            comment: comment,
            comment_timestamp: new Date().toISOString()
          })
          .eq('id', id);

        if (error) throw error;

        // Log the action
        if (user) {
                      await supabase
            .from('user_action_logs')
            .insert({
              user_email: user.email,
              action_type: 'add_comment',
              target_type: type,
              target_id: id,
              target_name: airports.find(a => a.id === id)?.name || (landingsplasser.find(l => l.id === id) as any)?.lp || 'Unknown',
              action_details: { comment_length: comment.length }
            });
        }

        onDataUpdate();
        (window as any).hideCommentEditor(id, type);
      } catch (error) {
        console.error('Error saving comment:', error);
        alert('Could not save comment');
      }
    };

        // Handle image upload
    (window as any).handleImageUpload = async (id: number, type: string, file: File) => {
      try {
        const tableName = type === 'airport' ? 'vass_vann' : 'vass_lasteplass';
        const folderName = type === 'airport' ? 'airport_images' : 'landingsplass_images';
        
        // Upload to Supabase Storage
        const fileExt = file.name.split('.').pop();
        const fileName = `${id}_${Date.now()}.${fileExt}`;
        const filePath = `${folderName}/${fileName}`;

        const { error: uploadError } = await supabase.storage
          .from('images')
          .upload(filePath, file);

        if (uploadError) throw uploadError;

        // Get public URL
        const { data: { publicUrl } } = supabase.storage
          .from('images')
          .getPublicUrl(filePath);

        // Save reference to database - use correct table based on type
        const imageTable = type === 'airport' ? 'vass_vann_images' : 'vass_lasteplass_images';
        const insertData = {
          marker_id: id,
          image_url: publicUrl,
          file_name: file.name,
          file_type: file.type,
          file_size: file.size,
          uploaded_by: user?.email || 'unknown'
        };
        
        const { error: dbError } = await supabase
          .from(imageTable)
          .insert(insertData);

        if (dbError) throw dbError;

        // Log the action
        if (user) {
          await supabase
            .from('user_action_logs')
            .insert({
              user_email: user.email,
              action_type: 'upload_image',
              target_type: type,
              target_id: id,
              target_name: airports.find(a => a.id === id)?.name || (landingsplasser.find(l => l.id === id) as any)?.lp || 'Unknown',
              action_details: { 
                file_name: file.name,
                file_size: file.size,
                file_type: file.type
              }
            });
        }

        // Refresh images display
        loadAndDisplayImages(id, type);
      } catch (error) {
        console.error('Error uploading image:', error);
        alert('Could not upload image');
      }
    };

    // Handle document upload
    (window as any).handleDocumentUpload = async (id: number, type: string, file: File) => {
      try {
        const folderName = type === 'airport' ? 'vass_vann-documents' : 'vass_lasteplass-documents';
        
        // Sanitize filename to handle Norwegian characters and special characters
        const sanitizedFileName = file.name
          .replace(/[æÆ]/g, 'ae')
          .replace(/[øØ]/g, 'oe') 
          .replace(/[åÅ]/g, 'aa')
          .replace(/[^a-zA-Z0-9.-]/g, '_');
        
        const fileName = `${type}-documents-${id}-${Date.now()}-${sanitizedFileName}`;
        const filePath = `${folderName}/${fileName}`;
        
        // Upload to Supabase Storage
        const { error: uploadError } = await supabase.storage
          .from('images') // Using same bucket as images
          .upload(filePath, file);

        if (uploadError) throw uploadError;

        // Get public URL
        const { data: { publicUrl } } = supabase.storage
          .from('images')
          .getPublicUrl(filePath);

        // Save reference to database
        const documentTable = type === 'airport' ? 'vass_vann_documents' : 'vass_lasteplass_documents';
        const { error: dbError } = await supabase
          .from(documentTable)
          .insert({
            marker_id: id,
            document_url: publicUrl,
            file_name: file.name,
            file_type: file.name.split('.').pop()?.toLowerCase() || 'unknown',
            file_size: file.size
          });

        if (dbError) throw dbError;

        // Log the action
        if (user) {
          await supabase
            .from('user_action_logs')
            .insert({
              user_email: user.email,
              action_type: 'upload_document',
              target_type: type,
              target_id: id,
              target_name: airports.find(a => a.id === id)?.name || (landingsplasser.find(l => l.id === id) as any)?.lp || 'Unknown',
              action_details: { 
                file_name: file.name,
                file_size: file.size,
                file_type: file.type
              }
            });
        }

        // Refresh documents display
        loadAndDisplayDocuments(id, type);
      } catch (error) {
        console.error('Error uploading document:', error);
        alert('Could not upload document');
      }
    };
  };

  // Export to GPX function (single waypoint)
  const exportToGPX = (lat: number, lng: number, name: string) => {
    const gpxContent = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Kalk Planner 2025" xmlns="http://www.topografix.com/GPX/1/1">
  <wpt lat="${lat}" lon="${lng}">
    <name>${name}</name>
    <desc>Exported from Kalk Planner 2025</desc>
  </wpt>
</gpx>`;

    const blob = new Blob([gpxContent], { type: 'application/gpx+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${name.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.gpx`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Export multiple waypoints to GPX function
  interface Waypoint {
    lat: number;
    lng: number;
    name: string;
    desc: string;
  }

  const exportMultipleToGPX = (waypoints: Waypoint[], fileName: string) => {
    const waypointElements = waypoints.map(waypoint => 
      `  <wpt lat="${waypoint.lat}" lon="${waypoint.lng}">
    <name>${waypoint.name}</name>
    <desc>${waypoint.desc}</desc>
  </wpt>`
    ).join('\n');

    const gpxContent = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Kalk Planner 2025" xmlns="http://www.topografix.com/GPX/1/1">
${waypointElements}
</gpx>`;

    const blob = new Blob([gpxContent], { type: 'application/gpx+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${fileName.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.gpx`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Load and display images
  const loadAndDisplayImages = async (id: number, type: string) => {
    try {
      const loadingId = `${type}-${id}`;
      
      // Check if this is still the current loading operation
      if (currentLoadingIdRef.current !== loadingId) {
        return; // Another popup has taken priority, abandon this operation
      }

      const displayElement = document.getElementById(`images-display-${id}`);
      if (!displayElement) return;

      // Use the correct table based on marker type
      const imageTable = type === 'airport' ? 'vass_vann_images' : 'vass_lasteplass_images';
      
      const { data: images, error } = await supabase
        .from(imageTable)
        .select('*')
        .eq('marker_id', id)
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Check again after async operation
      if (currentLoadingIdRef.current !== loadingId) {
        return; // Another popup has taken priority during the async operation
      }

      if (!images || images.length === 0) {
        displayElement.innerHTML = '<em class="text-muted">Ingen bilder lastet opp</em>';
        return;
      }

      const imageListHTML = images.map((img: any, index: number) => `
        <div class="image-item mb-2" style="border: 1px solid #dee2e6; border-radius: 0.375rem; padding: 0.5rem;">
          <div class="d-flex justify-content-between align-items-center mb-1">
            <span style="font-size: 0.7rem; font-weight: 500;">${img.file_name}</span>
            <small class="text-muted">${new Date(img.created_at).toLocaleDateString('nb-NO')}</small>
          </div>
          <img src="${img.image_url}" alt="${img.file_name}" style="width: 100%; max-height: 150px; object-fit: cover; border-radius: 0.25rem; cursor: pointer;" onclick="window.open('${img.image_url}', '_blank')">
        </div>
      `).join('');

      displayElement.innerHTML = imageListHTML;
    } catch (error) {
      console.error('Error loading images:', error);
      const displayElement = document.getElementById(`images-display-${id}`);
      if (displayElement) {
        displayElement.innerHTML = '<em class="text-muted">Kunne ikke laste bilder</em>';
      }
    }
  };

  // Load and display documents
  const loadAndDisplayDocuments = async (id: number, type: string) => {
    try {
      const loadingId = `${type}-${id}`;
      
      // Check if this is still the current loading operation
      if (currentLoadingIdRef.current !== loadingId) {
        return; // Another popup has taken priority, abandon this operation
      }

      const containerId = type === 'landingsplass' ? `documents-display-landingsplass-${id}` : `documents-display-${id}`;
      const displayElement = document.getElementById(containerId);
      if (!displayElement) return;

      const documentTable = type === 'airport' ? 'vass_vann_documents' : 'vass_lasteplass_documents';
      const { data: documents, error } = await supabase
        .from(documentTable)
        .select('*')
        .eq('marker_id', id)
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Check again after async operation
      if (currentLoadingIdRef.current !== loadingId) {
        return; // Another popup has taken priority during the async operation
      }

      if (!documents || documents.length === 0) {
        displayElement.innerHTML = '<em class="text-muted">Ingen dokumenter lastet opp</em>';
        return;
      }

      const documentListHTML = documents.map((doc: any, index: number) => {
        const fileType = doc.file_type || 'unknown';
        let iconClass = 'fa-file';
        if (fileType === 'pdf') iconClass = 'fa-file-pdf';
        else if (['xlsx', 'xls'].includes(fileType)) iconClass = 'fa-file-excel';
        else if (['doc', 'docx'].includes(fileType)) iconClass = 'fa-file-word';

        const uploadDate = new Date(doc.created_at).toLocaleDateString('nb-NO', {
          year: 'numeric',
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        });

        return `
          <div class="document-item mb-2" style="border: 1px solid #dee2e6; border-radius: 0.375rem; padding: 0.5rem;">
            <div class="d-flex justify-content-between align-items-center">
              <a href="${doc.document_url}" target="_blank" style="font-size: 0.75rem; text-decoration: none; color: #007bff;">
                <i class="fas ${iconClass} me-1"></i>${doc.file_name}
              </a>
              <small class="text-muted" style="font-size: 0.65rem;">${uploadDate}</small>
            </div>
          </div>
        `;
      }).join('');

      displayElement.innerHTML = documentListHTML;
    } catch (error) {
      console.error('Error loading documents:', error);
      const containerId = type === 'landingsplass' ? `documents-display-landingsplass-${id}` : `documents-display-${id}`;
      const displayElement = document.getElementById(containerId);
      if (displayElement) {
        displayElement.innerHTML = '<em class="text-muted">Kunne ikke laste dokumenter</em>';
      }
    }
  };

  // Load associations
  const loadCurrentAssociations = async (airportId: number) => {
    try {
      const loadingId = `airport-${airportId}`;
      
      // Check if this is still the current loading operation
      if (currentLoadingIdRef.current !== loadingId) {
        return; // Another popup has taken priority, abandon this operation
      }

      const { data: associations, error } = await supabase
        .from('vass_associations')
        .select(`
          id,
          landingsplass:vass_lasteplass(id, lp, latitude, longitude)
        `)
        .eq('airport_id', airportId);

      if (error) throw error;

      // Check again after async operation
      if (currentLoadingIdRef.current !== loadingId) {
        return; // Another popup has taken priority during the async operation
      }

      const associationsElement = document.getElementById(`current-associations-${airportId}`);
      if (!associationsElement) return;

      if (!associations || associations.length === 0) {
        associationsElement.innerHTML = '<em class="text-muted">Ingen tilkoblede lasteplasser</em>';
        return;
      }

      const associationsHTML = associations.map((assoc: any) => `
        <div class="association-item mb-1" style="display: flex; justify-content: between; align-items: center; padding: 0.25rem; background: white; border-radius: 0.25rem;">
          <span style="flex: 1;">${assoc.landingsplass?.lp || 'Ukjent lasteplass'}</span>
          ${userPermissions.canEditMarkers ? `
          <button class="btn btn-outline-danger btn-sm ms-2" style="font-size: 0.6rem; padding: 0.1rem 0.3rem;" onclick="removeAssociation(${airportId}, ${assoc.landingsplass?.id})">
            <i class="fas fa-times"></i>
          </button>` : ''}
        </div>
      `).join('');

      associationsElement.innerHTML = associationsHTML;
    } catch (error) {
      console.error('Error loading associations:', error);
    }
  };

  // Load related waters for landingsplasser
  const loadRelatedWaters = async (landingsplassId: number) => {
    try {
      const loadingId = `landingsplass-${landingsplassId}`;
      
      // Check if this is still the current loading operation
      if (currentLoadingIdRef.current !== loadingId) {
        return; // Another popup has taken priority, abandon this operation
      }

      const { data: associations, error } = await supabase
        .from('vass_associations')
        .select(`
          airport_id,
          vass_vann:airport_id (
            id, name, tonn
          )
        `)
        .eq('landingsplass_id', landingsplassId);

      if (error) throw error;

      // Check again after async operation
      if (currentLoadingIdRef.current !== loadingId) {
        return; // Another popup has taken priority during the async operation
      }

      const relatedWatersElement = document.getElementById(`related-waters-landingsplass-${landingsplassId}`);
      if (!relatedWatersElement) return;

      if (!associations || associations.length === 0) {
        relatedWatersElement.innerHTML = '<em class="text-muted">Ingen relaterte vann</em>';
        return;
      }

      const watersHTML = associations.map((assoc: any) => {
        const water = assoc.vass_vann;
        if (!water) return '';
        
        const truncatedName = water.name.length > 25 ? water.name.substring(0, 25) + '...' : water.name;
        
        return `
          <div class="water-item d-flex justify-content-between align-items-center py-1" style="font-size: 0.7rem; border-bottom: 1px solid #e9ecef;">
            <span class="water-name" style="color: #495057;">
              <i class="fa fa-water me-1" style="color: #667eea;"></i>
              ${truncatedName}
            </span>
            <span class="badge" style="background: #667eea; color: white; font-size: 0.65rem; border-radius: 8px;">
              ${water.tonn || 'N/A'}t
            </span>
          </div>
        `;
      }).filter(html => html).join('');

      if (watersHTML) {
        relatedWatersElement.innerHTML = `<div style="max-height: 80px; overflow-y: auto;" class="airports-list">${watersHTML}</div>`;
      } else {
        relatedWatersElement.innerHTML = '<em class="text-muted">Ingen relaterte vann</em>';
      }
    } catch (error) {
      console.error('Error loading related waters:', error);
      const relatedWatersElement = document.getElementById(`related-waters-landingsplass-${landingsplassId}`);
      if (relatedWatersElement) {
        relatedWatersElement.innerHTML = '<em class="text-muted text-danger">Feil ved lasting av relaterte vann</em>';
      }
    }
  };

  // Load contact persons for landingsplasser
  const loadContactPersons = async (landingsplassId: number) => {
    try {
      const loadingId = `landingsplass-${landingsplassId}`;
      
      // Check if this is still the current loading operation
      if (currentLoadingIdRef.current !== loadingId) {
        return; // Another popup has taken priority, abandon this operation
      }

      const { data: associations, error } = await supabase
        .from('vass_associations')
        .select(`
          airport_id,
          vass_vann:airport_id (
            forening, kontaktperson, phone, tonn
          )
        `)
        .eq('landingsplass_id', landingsplassId);

      if (error) throw error;

      // Check again after async operation
      if (currentLoadingIdRef.current !== loadingId) {
        return; // Another popup has taken priority during the async operation
      }

      const contactPersonsElement = document.getElementById(`contact-persons-landingsplass-${landingsplassId}`);
      if (!contactPersonsElement) return;

      if (!associations || associations.length === 0) {
        contactPersonsElement.innerHTML = '<em class="text-muted">Ingen kontaktpersoner</em>';
        return;
      }

      // Extract and deduplicate contact persons, summing tonnage
      const contactPersonsMap = new Map();
      associations.forEach((assoc: any) => {
        const water = assoc.vass_vann;
        if (!water) return;
        
        const { forening, kontaktperson, phone, tonn } = water;
        if (kontaktperson || forening || phone) {
          const phoneStr = phone ? String(phone) : '';
          const key = `${kontaktperson || ''}-${phoneStr}`;
          if (!contactPersonsMap.has(key)) {
            contactPersonsMap.set(key, { 
              forening, 
              kontaktperson, 
              phone: phoneStr, 
              totalTonn: 0,
              tonnCount: 0 
            });
          }
          
          // Add tonnage to the contact person
          const contact = contactPersonsMap.get(key);
          if (tonn && tonn !== 'N/A' && !isNaN(parseFloat(tonn))) {
            contact.totalTonn += parseFloat(tonn);
            contact.tonnCount++;
          }
        }
      });

      if (contactPersonsMap.size === 0) {
        contactPersonsElement.innerHTML = '<em class="text-muted">Ingen kontaktpersoner</em>';
        return;
      }

      const contactPersonsList = Array.from(contactPersonsMap.values());
      const contactPersonsHTML = contactPersonsList.map((contact: any, index: number) => {
        const displayName = contact.kontaktperson || 'Ukjent';
        const displayPhone = contact.phone && contact.phone.trim() ? contact.phone.toString() : '';
        const displayForening = contact.forening || '';
        const displayTonn = contact.totalTonn > 0 ? contact.totalTonn.toFixed(1) + 't' : '';
        const isLastItem = index === contactPersonsList.length - 1;
        
        return `
          <div class="contact-item" style="font-size: 0.7rem; padding: 6px 0; margin: 0; ${index === 0 ? '' : 'border-top: 1px solid rgba(0,0,0,0.1);'}">
            <div class="d-flex justify-content-between align-items-start">
              <div style="color: #495057; flex: 1;">
                <i class="fas fa-user me-1" style="color: #6c757d;"></i>
                <span class="fw-semibold">${displayName}</span>
              </div>
              ${displayTonn ? `<span class="badge" style="background: #28a745; color: white; font-size: 0.65rem; border-radius: 8px; flex-shrink: 0;">
                ${displayTonn}
              </span>` : ''}
            </div>
            ${displayForening ? `<div style="color: #6c757d; font-size: 0.65rem; margin-left: 1rem;">
              <i class="fas fa-users me-1"></i>${displayForening}
            </div>` : ''}
            ${displayPhone ? `<div style="color: #6c757d; font-size: 0.65rem; margin-left: 1rem;">
              <i class="fas fa-phone me-1"></i>${displayPhone}
            </div>` : ''}
          </div>
        `;
      }).join('');

      contactPersonsElement.innerHTML = `<div style="max-height: 120px; overflow-y: auto;" class="contact-persons-scroll">${contactPersonsHTML}</div>`;
    } catch (error) {
      console.error('Error loading contact persons:', error);
      const contactPersonsElement = document.getElementById(`contact-persons-landingsplass-${landingsplassId}`);
      if (contactPersonsElement) {
        contactPersonsElement.innerHTML = '<em class="text-muted text-danger">Feil ved lasting av kontaktpersoner</em>';
      }
    }
  };

  // Memoize filtered data to prevent unnecessary recalculations
  const filteredAirports = useMemo(() => {
    if (filterState.county) {
      return airports.filter(airport => airport.fylke === filterState.county);
    }
    return airports;
  }, [airports, filterState.county]);

  const filteredLandingsplasser = useMemo(() => {
    if (filterState.county) {
      return landingsplasser.filter(lp => lp.fylke === filterState.county);
    }
    return landingsplasser;
  }, [landingsplasser, filterState.county]);

  // Memoize marker event handlers
  const handleMarkerPopupOpen = useCallback((id: number, type: 'airport' | 'landingsplass') => {
    // Cancel any existing loading timeout
    if (loadingTimeoutRef.current) {
      clearTimeout(loadingTimeoutRef.current);
    }
    
    // Set the current loading ID to prevent race conditions
    const loadingId = `${type}-${id}`;
    currentLoadingIdRef.current = loadingId;
    
    loadingTimeoutRef.current = setTimeout(() => {
      // Double-check that this is still the current operation
      if (currentLoadingIdRef.current !== loadingId) {
        return;
      }
      
      if (type === 'airport') {
        loadCurrentAssociations(id);
        loadAndDisplayImages(id, 'airport');
      } else {
        loadAndDisplayDocuments(id, 'landingsplass');
        loadAndDisplayImages(id, 'landingsplass');
        showIndividualConnections(id);
        loadRelatedWaters(id);
        loadContactPersons(id);
      }
    }, 100);
  }, []);

  const handleLandingsplassPopupClose = useCallback(() => {
    hideIndividualConnections();
    // Clear loading state when popup closes
    currentLoadingIdRef.current = null;
    if (loadingTimeoutRef.current) {
      clearTimeout(loadingTimeoutRef.current);
      loadingTimeoutRef.current = null;
    }
  }, []);

  // Filter and display markers
  useEffect(() => {
    if (!isMapReady || !markersLayerRef.current || !clusterGroupRef.current) return;

    const L = (window as any).L;
    if (!L) return;

    // Clear existing markers from both regular layer and cluster group
    markersLayerRef.current.clearLayers();
    clusterGroupRef.current.clearLayers();

    // Add airport markers
    filteredAirports.forEach(airport => {
      if (!airport.latitude || !airport.longitude) return;

      const markerColor = airport.marker_color || 'red';
      const iconColor = airport.is_done ? 'green' : markerColor;
      const iconName = airport.is_done ? 'check' : 'water';
      
      try {
        const marker = L.marker([airport.latitude, airport.longitude], {
          icon: L.AwesomeMarkers.icon({
            icon: iconName,
            markerColor: iconColor,
            prefix: 'fa'
          })
        });

        const popupContent = createAirportPopupContent(airport);
        marker.bindPopup(popupContent, { 
          maxWidth: isMobileOrTablet() ? 350 : 400,
          closeOnEscapeKey: false,
          autoClose: false,
          closeOnClick: false,
          autoPan: false,
          keepInView: false,
          closeButton: true,
          offset: [0, -10],
          // @ts-ignore - Override Leaflet's internal close behavior
          _close: function() { /* Do nothing - prevent internal closing */ },
          className: 'mobile-friendly-popup'
        });
        
        // Add hover tooltip showing the name
        const airportName = airport.name || airport.navn || 'Ukjent navn';
        marker.bindTooltip(airportName, {
          direction: 'top',
          offset: [0, -20]
        });
        
        // Load associations and images when popup opens
        marker.on('popupopen', () => handleMarkerPopupOpen(airport.id, 'airport'));
        
        // Clean up loading state when popup closes
        marker.on('popupclose', () => {
          currentLoadingIdRef.current = null;
          if (loadingTimeoutRef.current) {
            clearTimeout(loadingTimeoutRef.current);
            loadingTimeoutRef.current = null;
          }
        });

        clusterGroupRef.current.addLayer(marker);
      } catch (error) {
        console.error('Error creating airport marker:', error);
      }
    });

    // Add landingsplass markers
    filteredLandingsplasser.forEach(landingsplass => {
      if (!landingsplass.latitude || !landingsplass.longitude) return;

      const iconColor = 'blue'; // Always blue for landingsplass
      
      try {
        const marker = L.marker([landingsplass.latitude, landingsplass.longitude], {
          icon: L.AwesomeMarkers.icon({
            icon: 'helicopter-symbol',
            markerColor: iconColor,
            prefix: 'fa'
          })
        });

        const popupContent = createLandingsplassPopupContent(landingsplass);
        marker.bindPopup(popupContent, { 
          maxWidth: isMobileOrTablet() ? 350 : 400,
          closeOnEscapeKey: false,
          autoClose: false,
          closeOnClick: false,
          autoPan: false,
          keepInView: false,
          closeButton: true,
          offset: [0, -10],
          // @ts-ignore - Override Leaflet's internal close behavior
          _close: function() { /* Do nothing - prevent internal closing */ },
          className: 'mobile-friendly-popup'
        });
        
        // Add permanent label below marker showing the kode
        const landingsplassKode = landingsplass.kode || landingsplass.lp || 'N/A';
        marker.bindTooltip(landingsplassKode, {
          permanent: true,
          direction: 'bottom',
          offset: [0, 0],
          className: 'landingsplass-label'
        });
        
        // Load associations, images and documents when popup opens
        marker.on('popupopen', () => handleMarkerPopupOpen(landingsplass.id, 'landingsplass'));

        // Hide individual connections when popup closes
        marker.on('popupclose', handleLandingsplassPopupClose);

        clusterGroupRef.current.addLayer(marker);
      } catch (error) {
        console.error('Error creating landingsplass marker:', error);
      }
    });

    // Add kalk markers
    kalkMarkers.forEach(kalk => {
      if (!kalk.latitude || !kalk.longitude) return;

      try {
        const marker = L.marker([kalk.latitude, kalk.longitude], {
          icon: L.AwesomeMarkers.icon({
            icon: 'comment',
            markerColor: 'orange',
            prefix: 'fa'
          })
        });

        const popupContent = createKalkPopupContent(kalk);
        marker.bindPopup(popupContent, { 
          maxWidth: isMobileOrTablet() ? 350 : 400,
          closeOnEscapeKey: false,
          autoClose: false,
          closeOnClick: false,
          autoPan: false,
          keepInView: false,
          closeButton: true,
          offset: [0, -10],
          // @ts-ignore - Override Leaflet's internal close behavior
          _close: function() { /* Do nothing - prevent internal closing */ },
          className: 'mobile-friendly-popup'
        });

        markersLayerRef.current.addLayer(marker);
      } catch (error) {
        console.error('Error creating kalk marker:', error);
      }
    });
  }, [isMapReady, filteredAirports, filteredLandingsplasser, kalkMarkers, userPermissions, handleMarkerPopupOpen, handleLandingsplassPopupClose, isMobileOrTablet]);

  // Toggle satellite view function
  const toggleSatelliteView = () => {
    if (!leafletMapRef.current || !tileLayerRef.current) return;

    const map = leafletMapRef.current;
    const { osm, satellite } = tileLayerRef.current;

    if (isSatelliteView) {
      // Switch to OSM view
      map.removeLayer(satellite);
      map.addLayer(osm);
      setIsSatelliteView(false);
    } else {
      // Switch to Satellite view
      map.removeLayer(osm);
      map.addLayer(satellite);
      setIsSatelliteView(true);
    }
  };

  const createAirportPopupContent = (airport: Airport): string => {
    const isDone = airport.is_done || airport.done;
    const completedClass = isDone ? 'completed' : '';
    
    const timestamp = airport.comment_timestamp ? 
      new Date(airport.comment_timestamp).toLocaleString('nb-NO', { 
        year: 'numeric', month: 'short', day: 'numeric', 
        hour: '2-digit', minute: '2-digit' 
      }) : '';
    
    return `
      <div class="marker-card ${completedClass}" style="min-width: 300px; max-width: 380px; font-size: 0.85rem; box-sizing: border-box; padding: 0;">
        <div class="mobile-drag-handle d-md-none" style="width: 100%; height: 30px; background: linear-gradient(90deg, ${isDone ? '#28a745' : '#CB2B3E'} 0%, ${isDone ? '#32cd32' : '#dc3545'} 100%); cursor: grab; display: flex; align-items: center; justify-content: center; border-radius: 0.375rem 0.375rem 0 0; margin-bottom: 0;">
          <div style="width: 40px; height: 4px; background: rgba(255,255,255,0.8); border-radius: 2px;"></div>
        </div>
        <div style="padding: 0.75rem;">
        <div class="popup-header d-flex justify-content-between align-items-start mb-2" style="border-bottom: 2px solid ${isDone ? '#28a745' : '#CB2B3E'}; padding-bottom: 0.5rem;">
          <div class="d-flex align-items-center" style="flex: 1; min-width: 0; overflow: hidden; margin-right: 0.5rem;">
            <div class="me-2" style="font-size: 1.1rem; color: ${isDone ? '#28a745' : '#CB2B3E'}; flex-shrink: 0;"><i class="fas fa-water"></i></div>
            <h6 class="mb-0" style="font-weight: 600; color: #333; word-wrap: break-word; overflow-wrap: break-word; line-height: 1.2; flex: 1; min-width: 0;">${airport.name || airport.navn || 'Ukjent navn'}</h6>
          </div>
          ${isDone ? '<div style="flex-shrink: 0;"><span class="badge bg-success" style="font-size: 0.65rem; white-space: nowrap;">UTFØRT</span></div>' : ''}
        </div>
        
        <div class="row g-2 mb-2" style="font-size: 0.75rem; margin: 0;">
          <div class="col-6">
            <div class="info-item-compact">
              <span class="text-muted" style="font-size: 0.7rem;"><i class="fas fa-hashtag me-1"></i>P.Nr:</span>
              <div class="fw-semibold" style="word-wrap: break-word; overflow-wrap: break-word;">${airport.pnr || 'N/A'}</div>
            </div>
          </div>
          <div class="col-6">
            <div class="info-item-compact">
              <span class="text-muted" style="font-size: 0.7rem;"><i class="fas fa-weight-hanging me-1"></i>Tonn:</span>
              <div class="fw-semibold" style="word-wrap: break-word; overflow-wrap: break-word;">${airport.tonn || airport.tonn_vann || 'N/A'}</div>
            </div>
          </div>
        </div>
        
        <div class="info-item mb-2">
          <span class="text-muted mb-1 d-block" style="font-size: 0.7rem;"><i class="fas fa-users me-1"></i>Forening:</span>
          <div class="fw-semibold" style="word-wrap: break-word; overflow-wrap: break-word; font-size: 0.75rem;">${airport.forening || 'N/A'}</div>
        </div>
        
        <div class="info-item mb-2">
          <span class="text-muted mb-1 d-block" style="font-size: 0.7rem;"><i class="fas fa-user me-1"></i>Kontakt:</span>
          <div class="fw-semibold" style="word-wrap: break-word; overflow-wrap: break-word; font-size: 0.75rem;">${airport.kontaktperson || 'N/A'}</div>
        </div>
        
        ${airport.phone ? `
        <div class="info-item mb-2">
          <span class="text-muted mb-1 d-block" style="font-size: 0.7rem;"><i class="fas fa-phone me-1"></i>Telefon:</span>
          <div class="fw-semibold" style="word-wrap: break-word; overflow-wrap: break-word; font-size: 0.75rem;">${airport.phone}</div>
        </div>` : ''}
        
        <div class="association-section mb-2" style="background: #f8f9fa; padding: 0.5rem; border-radius: 0.375rem;">
          <div style="font-size: 0.75rem; font-weight: 600; color: #495057; margin-bottom: 0.5rem;">
            <i class="fas fa-helicopter-symbol me-1"></i>Tilhørende lasteplass:
          </div>
          <div id="current-associations-${airport.id}" class="association-list" style="font-size: 0.7rem; word-wrap: break-word; overflow-wrap: break-word;">
            <em class="text-muted">Laster...</em>
          </div>
        </div>
        
        <div class="d-flex gap-1 mb-2">
          <button class="btn btn-outline-primary flex-fill${isDone ? ' disabled' : ''}" ${isDone ? 'disabled' : ''} style="font-size: 0.7rem; padding: 0.25rem 0.5rem; white-space: nowrap;" onclick="window.handleRoute && window.handleRoute(${airport.id}, 'airport')">
            <i class="fas fa-route"></i> Rute
          </button>
          <button class="btn btn-outline-secondary flex-fill" style="font-size: 0.7rem; padding: 0.25rem 0.5rem; white-space: nowrap;" onclick="window.handleGPXExport && window.handleGPXExport(${airport.id}, 'airport')">
            <i class="fas fa-download"></i> GPX
          </button>
          ${airport.pdf_url ? `
          <button class="btn btn-outline-success flex-fill${isDone ? ' disabled' : ''}" ${isDone ? 'disabled' : ''} style="font-size: 0.7rem; padding: 0.25rem 0.5rem; white-space: nowrap;" onclick="window.open('${airport.pdf_url}', '_blank')">
            <i class="fas fa-file-pdf"></i> Kontrakt
          </button>` : ''}
        </div>
        
        ${userPermissions.canEditPriority ? `
        <div class="color-picker-section mb-2" style="background: #f8f9fa; padding: 0.5rem; border-radius: 0.375rem;">
          <div style="font-size: 0.75rem; font-weight: 600; color: #495057; margin-bottom: 0.5rem;">
            <i class="fas fa-palette me-1"></i>Marker farge:
          </div>
          <div class="d-flex flex-wrap gap-1" style="margin-bottom: 0.5rem;">
            <button class="color-option ${(airport.marker_color || 'red') === 'red' ? 'active' : ''}" style="width: 24px; height: 24px; border: 2px solid ${(airport.marker_color || 'red') === 'red' ? '#333' : '#ccc'}; border-radius: 4px; background: #CB2B3E; cursor: pointer;" onclick="window.handleColorChange && window.handleColorChange(${airport.id}, 'red')"></button>
            <button class="color-option ${(airport.marker_color || 'red') === 'orange' ? 'active' : ''}" style="width: 24px; height: 24px; border: 2px solid ${(airport.marker_color || 'red') === 'orange' ? '#333' : '#ccc'}; border-radius: 4px; background: #FF7F00; cursor: pointer;" onclick="window.handleColorChange && window.handleColorChange(${airport.id}, 'orange')"></button>
            <button class="color-option ${(airport.marker_color || 'red') === 'blue' ? 'active' : ''}" style="width: 24px; height: 24px; border: 2px solid ${(airport.marker_color || 'red') === 'blue' ? '#333' : '#ccc'}; border-radius: 4px; background: #2E8B57; cursor: pointer;" onclick="window.handleColorChange && window.handleColorChange(${airport.id}, 'blue')"></button>
            <button class="color-option ${(airport.marker_color || 'red') === 'purple' ? 'active' : ''}" style="width: 24px; height: 24px; border: 2px solid ${(airport.marker_color || 'red') === 'purple' ? '#333' : '#ccc'}; border-radius: 4px; background: #663399; cursor: pointer;" onclick="window.handleColorChange && window.handleColorChange(${airport.id}, 'purple')"></button>
            <button class="color-option ${(airport.marker_color || 'red') === 'darkgreen' ? 'active' : ''}" style="width: 24px; height: 24px; border: 2px solid ${(airport.marker_color || 'red') === 'darkgreen' ? '#333' : '#ccc'}; border-radius: 4px; background: #006400; cursor: pointer;" onclick="window.handleColorChange && window.handleColorChange(${airport.id}, 'darkgreen')"></button>
            <button class="color-option ${(airport.marker_color || 'red') === 'cadetblue' ? 'active' : ''}" style="width: 24px; height: 24px; border: 2px solid ${(airport.marker_color || 'red') === 'cadetblue' ? '#333' : '#ccc'}; border-radius: 4px; background: #5F9EA0; cursor: pointer;" onclick="window.handleColorChange && window.handleColorChange(${airport.id}, 'cadetblue')"></button>
            <button class="color-option ${(airport.marker_color || 'red') === 'darkred' ? 'active' : ''}" style="width: 24px; height: 24px; border: 2px solid ${(airport.marker_color || 'red') === 'darkred' ? '#333' : '#ccc'}; border-radius: 4px; background: #8B0000; cursor: pointer;" onclick="window.handleColorChange && window.handleColorChange(${airport.id}, 'darkred')"></button>
            <button class="color-option ${(airport.marker_color || 'red') === 'darkpurple' ? 'active' : ''}" style="width: 24px; height: 24px; border: 2px solid ${(airport.marker_color || 'red') === 'darkpurple' ? '#333' : '#ccc'}; border-radius: 4px; background: #4B0082; cursor: pointer;" onclick="window.handleColorChange && window.handleColorChange(${airport.id}, 'darkpurple')"></button>
          </div>
          <div class="text-muted" style="font-size: 0.65rem;">
            <i class="fas fa-info-circle me-1"></i>Klikk på en farge for å endre markørens farge
          </div>
        </div>
        ` : ''}
        
        <div class="comment-section mb-2" style="background: #f8f9fa; padding: 0.5rem; border-radius: 0.375rem;">
          <div style="font-size: 0.75rem; font-weight: 600; color: #495057; margin-bottom: 0.5rem;">
            <i class="fas fa-comment me-1"></i>Kommentarer:
          </div>
          <div class="comment-display-box">
            ${airport.comment || '<em class="text-muted">Ingen kommentarer lagt til</em>'}
          </div>
          ${timestamp ? `<div class="comment-timestamp text-muted mt-1" style="font-size: 0.65rem;">${timestamp}</div>` : ''}
          ${userPermissions.canEditMarkers && !isDone ? `
          <button class="btn btn-outline-primary" id="comment-btn-${airport.id}" style="font-size: 0.7rem; padding: 0.2rem 0.4rem; margin-top: 0.5rem; white-space: nowrap;" onclick="window.showCommentEditor && window.showCommentEditor(${airport.id}, 'airport')">
            <i class="fas fa-edit"></i> ${airport.comment ? 'Rediger' : 'Legg til'}
          </button>
          <div class="comment-editor mt-2" id="editor-${airport.id}" style="display: none;">
            <textarea class="form-control mb-2" id="comment-${airport.id}" rows="3" style="font-size: 0.75rem; resize: vertical;">${airport.comment || ''}</textarea>
            <div class="d-flex gap-1">
              <button class="btn btn-success flex-fill" style="font-size: 0.7rem; padding: 0.25rem 0.5rem; white-space: nowrap;" onclick="window.saveComment && window.saveComment(${airport.id}, 'airport')">
                <i class="fas fa-save"></i> Lagre
              </button>
              <button class="btn btn-outline-secondary flex-fill" style="font-size: 0.7rem; padding: 0.25rem 0.5rem; white-space: nowrap;" onclick="window.hideCommentEditor && window.hideCommentEditor(${airport.id}, 'airport')">
                <i class="fas fa-times"></i> Avbryt
              </button>
            </div>
          </div>
          ` : ''}
        </div>
        
        <div class="image-section mb-2" style="background: #f8f9fa; padding: 0.5rem; border-radius: 0.375rem;">
          <div style="font-size: 0.75rem; font-weight: 600; color: #495057; margin-bottom: 0.5rem;">
            <i class="fas fa-images me-1"></i>Bilder:
          </div>
          <div id="images-display-${airport.id}" class="image-display mb-2" style="font-size: 0.7rem; word-wrap: break-word; overflow-wrap: break-word;">
            <em class="text-muted">Laster...</em>
          </div>
          ${!isDone ? `
          <input type="file" id="file-input-${airport.id}" accept="image/*" style="display: none;" onchange="handleFileUpload(event, ${airport.id}, 'airport')">
          <button class="btn btn-outline-primary" style="font-size: 0.7rem; padding: 0.25rem 0.5rem; white-space: nowrap;" onclick="document.getElementById('file-input-${airport.id}').click()">
            <i class="fas fa-upload"></i> Last opp
          </button>
          ` : ''}
        </div>
        
        <div class="popup-footer d-flex justify-content-end" style="border-top: 1px solid #dee2e6; padding-top: 0.5rem;">
          ${userPermissions.canEditMarkers ? `
          <button class="btn ${isDone ? 'btn-warning' : 'btn-success'}" style="font-size: 0.8rem; padding: 0.4rem 0.8rem; white-space: nowrap;" onclick="window.handleToggleDone && window.handleToggleDone(${airport.id}, 'airport')">
            <i class="fas fa-${isDone ? 'undo' : 'check'}"></i> ${isDone ? 'Angre' : 'Utført'}
          </button>
          ` : `
          <div class="text-muted" style="font-size: 0.75rem; padding: 0.4rem 0.8rem;">
            <i class="fas fa-lock me-1"></i>Du har ikke tilgang til å endre status
          </div>
          `}
        </div>
        </div>
      </div>
    `;
  };

  const createLandingsplassPopupContent = (landingsplass: Landingsplass): string => {
    const isDone = landingsplass.is_done || landingsplass.done;
    const completedClass = isDone ? 'completed' : '';
    
    const timestamp = (landingsplass as any).comment_timestamp ? 
      new Date((landingsplass as any).comment_timestamp).toLocaleString('nb-NO', { 
        year: 'numeric', month: 'short', day: 'numeric', 
        hour: '2-digit', minute: '2-digit' 
      }) : '';
    
    const priorityBadge = landingsplass.priority ? 
      `<span class="badge ${landingsplass.priority <= 3 ? 'bg-danger' : landingsplass.priority <= 6 ? 'bg-warning' : 'bg-secondary'}" style="font-size: 0.65rem; white-space: nowrap;">P${landingsplass.priority}</span>` : '';
    
    const completedDate = (landingsplass as any).completed_at ? 
      new Date((landingsplass as any).completed_at).toLocaleString('nb-NO', { 
        year: 'numeric', month: 'short', day: 'numeric', 
        hour: '2-digit', minute: '2-digit' 
      }) : '';
    
    return `
      <div class="marker-card ${completedClass}" style="min-width: 300px; max-width: 380px; font-size: 0.85rem; box-sizing: border-box; padding: 0;">
        <div class="mobile-drag-handle d-md-none" style="width: 100%; height: 30px; background: linear-gradient(90deg, ${isDone ? '#28a745' : '#17a2b8'} 0%, ${isDone ? '#32cd32' : '#20c997'} 100%); cursor: grab; display: flex; align-items: center; justify-content: center; border-radius: 0.375rem 0.375rem 0 0; margin-bottom: 0;">
          <div style="width: 40px; height: 4px; background: rgba(255,255,255,0.8); border-radius: 2px;"></div>
        </div>
        <div style="padding: 0.75rem;">
        <div class="popup-header d-flex justify-content-between align-items-start mb-2" style="border-bottom: 2px solid ${isDone ? '#28a745' : '#17a2b8'}; padding-bottom: 0.5rem;">
          <div class="d-flex align-items-center" style="flex: 1; min-width: 0; overflow: hidden; margin-right: 0.5rem;">
            <div class="me-2" style="font-size: 1.1rem; color: ${isDone ? '#28a745' : '#17a2b8'}; flex-shrink: 0;"><i class="fas fa-helicopter-symbol"></i></div>
            <h6 class="mb-0" style="font-weight: 600; color: #333; word-wrap: break-word; overflow-wrap: break-word; line-height: 1.2; flex: 1; min-width: 0;">${landingsplass.kode || ''} - ${landingsplass.lp || 'N/A'}</h6>
          </div>
          <div class="d-flex flex-column align-items-end gap-1" style="flex-shrink: 0;">
            ${priorityBadge}
            ${isDone ? '<span class="badge bg-success" style="font-size: 0.65rem; white-space: nowrap;">UTFØRT</span>' : ''}
          </div>
        </div>
        
        ${isDone && completedDate ? `
        <div class="completion-info mb-2" style="background: #d4edda; padding: 0.375rem; border-radius: 0.25rem; border: 1px solid #c3e6cb;">
          <div style="font-size: 0.7rem; color: #155724;">
            <i class="fas fa-calendar-check me-1"></i>Utført: ${completedDate}
          </div>
        </div>` : ''}
        
        <div class="row g-2 mb-2" style="font-size: 0.75rem; margin: 0;">
          <div class="col-6">
            <div class="info-item-compact">
              <span class="text-muted" style="font-size: 0.7rem;"><i class="fas fa-weight-hanging me-1"></i>Totalt tonn:</span>
              <div class="fw-semibold" style="word-wrap: break-word; overflow-wrap: break-word;">${landingsplass.calculated_tonn !== undefined ? landingsplass.calculated_tonn : (landingsplass.tonn_lp || 'N/A')}</div>
            </div>
          </div>
          <div class="col-6">
            <div class="info-item-compact">
              <span class="text-muted" style="font-size: 0.7rem;"><i class="fas fa-map-pin me-1"></i>Koordinat:</span>
              <div class="fw-semibold" style="word-wrap: break-word; overflow-wrap: break-word; font-size: 0.65rem; line-height: 1.2;">${landingsplass.latitude ? landingsplass.latitude.toFixed(4) : 'N/A'}, ${landingsplass.longitude ? landingsplass.longitude.toFixed(4) : 'N/A'}</div>
            </div>
          </div>
        </div>
        
        <div class="d-flex gap-1 mb-2">
          <button class="btn btn-outline-primary flex-fill${isDone ? ' disabled' : ''}" ${isDone ? 'disabled' : ''} style="font-size: 0.7rem; padding: 0.25rem 0.5rem; white-space: nowrap;" onclick="window.handleRoute && window.handleRoute(${landingsplass.id}, 'landingsplass')">
            <i class="fas fa-route"></i> Rute
          </button>
          <button class="btn btn-outline-secondary flex-fill" style="font-size: 0.7rem; padding: 0.25rem 0.5rem; white-space: nowrap;" onclick="window.handleGPXExport && window.handleGPXExport(${landingsplass.id}, 'landingsplass')">
            <i class="fas fa-download"></i> GPX
          </button>
        </div>
        
        <div class="comment-section mb-2" style="background: #f8f9fa; padding: 0.5rem; border-radius: 0.375rem;">
          <div style="font-size: 0.75rem; font-weight: 600; color: #495057; margin-bottom: 0.5rem;">
            <i class="fas fa-comment me-1"></i>Kommentarer:
          </div>
          <div class="comment-display-box">
            ${landingsplass.comment || '<em class="text-muted">Ingen kommentarer lagt til</em>'}
          </div>
          ${timestamp ? `<div class="comment-timestamp text-muted mt-1" style="font-size: 0.65rem;">${timestamp}</div>` : ''}
          ${userPermissions.canEditMarkers && !isDone ? `
          <button class="btn btn-outline-primary" id="comment-btn-${landingsplass.id}" style="font-size: 0.7rem; padding: 0.2rem 0.4rem; margin-top: 0.5rem; white-space: nowrap;" onclick="window.showCommentEditor && window.showCommentEditor(${landingsplass.id}, 'landingsplass')">
            <i class="fas fa-edit"></i> ${landingsplass.comment ? 'Rediger' : 'Legg til'}
          </button>
          <div class="comment-editor mt-2" id="editor-${landingsplass.id}" style="display: none;">
            <textarea class="form-control mb-2" id="comment-${landingsplass.id}" rows="3" style="font-size: 0.75rem; resize: vertical;">${landingsplass.comment || ''}</textarea>
            <div class="d-flex gap-1">
              <button class="btn btn-success flex-fill" style="font-size: 0.7rem; padding: 0.25rem 0.5rem; white-space: nowrap;" onclick="window.saveComment && window.saveComment(${landingsplass.id}, 'landingsplass')">
                <i class="fas fa-save"></i> Lagre
              </button>
              <button class="btn btn-outline-secondary flex-fill" style="font-size: 0.7rem; padding: 0.25rem 0.5rem; white-space: nowrap;" onclick="window.hideCommentEditor && window.hideCommentEditor(${landingsplass.id}, 'landingsplass')">
                <i class="fas fa-times"></i> Avbryt
              </button>
            </div>
          </div>
          ` : ''}
        </div>
        
        <div class="contact-persons-section mb-2" style="background: #f0f8ff; padding: 0.5rem; border-radius: 0.375rem;">
          <div style="font-size: 0.75rem; font-weight: 600; color: #495057; margin-bottom: 8px;">
            <i class="fas fa-address-book me-1" style="color: #4a90e2;"></i>Kontaktpersoner:
          </div>
          <div id="contact-persons-landingsplass-${landingsplass.id}" class="contact-persons-display" style="font-size: 0.7rem;">
            <em class="text-muted">Laster...</em>
          </div>
        </div>
        
        <div class="related-waters-section mb-2" style="background: #f1f3f4; padding: 0.5rem; border-radius: 0.375rem;">
          <div style="font-size: 0.75rem; font-weight: 600; color: #495057; margin-bottom: 0.5rem;">
            <i class="fas fa-water me-1" style="color: #667eea;"></i>Relaterte vann:
          </div>
          <div id="related-waters-landingsplass-${landingsplass.id}" class="related-waters-display" style="font-size: 0.7rem;">
            <em class="text-muted">Laster...</em>
          </div>
        </div>
        
        <div class="images-section mb-2" style="background: #fff8f0; padding: 0.5rem; border-radius: 0.375rem;">
          <div style="font-size: 0.75rem; font-weight: 600; color: #495057; margin-bottom: 0.5rem;">
            <i class="fas fa-images me-1"></i>Bilder:
          </div>
          <div id="images-display-${landingsplass.id}" class="images-display mb-2" style="font-size: 0.7rem;">
            <em class="text-muted">Laster...</em>
          </div>
          ${!isDone ? `
          <input type="file" id="file-input-landingsplass-${landingsplass.id}" accept="image/*" style="display: none;" onchange="handleFileUpload(event, ${landingsplass.id}, 'landingsplass')">
          <button class="btn btn-outline-primary" style="font-size: 0.7rem; padding: 0.25rem 0.5rem; white-space: nowrap;" onclick="document.getElementById('file-input-landingsplass-${landingsplass.id}').click()">
            <i class="fas fa-image"></i> Last opp bilde
          </button>
          ` : ''}
        </div>
        
        <div class="documents-section mb-2" style="background: #f1f8ff; padding: 0.5rem; border-radius: 0.375rem;">
          <div style="font-size: 0.75rem; font-weight: 600; color: #495057; margin-bottom: 0.5rem;">
            <i class="fas fa-file-alt me-1"></i>Dokumenter:
          </div>
          <div id="documents-display-landingsplass-${landingsplass.id}" class="documents-display mb-2" style="font-size: 0.7rem; word-wrap: break-word; overflow-wrap: break-word;">
            <em class="text-muted">Laster...</em>
          </div>
          ${!isDone ? `
          <input type="file" id="document-input-landingsplass-${landingsplass.id}" accept=".pdf,.xlsx,.xls,.doc,.docx" style="display: none;" onchange="handleDocumentFileUpload(event, ${landingsplass.id}, 'landingsplass')">
          <button class="btn btn-outline-primary" style="font-size: 0.7rem; padding: 0.25rem 0.5rem; white-space: nowrap;" onclick="document.getElementById('document-input-landingsplass-${landingsplass.id}').click()">
            <i class="fas fa-file-upload"></i> Last opp dokument
          </button>
          ` : ''}
        </div>
        
        <div class="popup-footer d-flex justify-content-end" style="border-top: 1px solid #dee2e6; padding-top: 0.5rem;">
          ${userPermissions.canEditMarkers ? `
          <button class="btn ${isDone ? 'btn-warning' : 'btn-success'}" style="font-size: 0.8rem; padding: 0.4rem 0.8rem; white-space: nowrap;" onclick="window.handleToggleDone && window.handleToggleDone(${landingsplass.id}, 'landingsplass')">
            <i class="fas fa-${isDone ? 'undo' : 'check'}"></i> ${isDone ? 'Angre' : 'Utført'}
          </button>
          ` : `
          <div class="text-muted" style="font-size: 0.75rem; padding: 0.4rem 0.8rem;">
            <i class="fas fa-lock me-1"></i>Du har ikke tilgang til å endre status
          </div>
          `}
        </div>
        </div>
      </div>
    `;
  };

  const createKalkPopupContent = (kalk: KalkInfo) => {
    return `
      <div class="marker-card" style="min-width: 250px; max-width: 300px; font-size: 0.85rem; box-sizing: border-box; padding: 0.75rem;">
        <div class="popup-header d-flex justify-content-between align-items-start mb-2" style="border-bottom: 2px solid #FFA500; padding-bottom: 0.5rem;">
          <div class="d-flex align-items-center" style="flex: 1; min-width: 0; overflow: hidden; margin-right: 0.5rem;">
            <div class="me-2" style="font-size: 1.1rem; color: #FFA500; flex-shrink: 0;"><i class="fas fa-comment"></i></div>
            <h6 class="mb-0" style="font-weight: 600; color: #333; word-wrap: break-word; overflow-wrap: break-word; line-height: 1.2; flex: 1; min-width: 0;">Kalkinfo</h6>
          </div>
        </div>
        
        <div class="info-item mb-2">
          <span class="text-muted mb-1 d-block" style="font-size: 0.7rem;"><i class="fas fa-info-circle me-1"></i>Informasjon:</span>
          <div class="fw-semibold" style="word-wrap: break-word; overflow-wrap: break-word; font-size: 0.75rem;">${kalk.navn || 'N/A'}</div>
        </div>
        
        <div class="info-item mb-2">
          <span class="text-muted mb-1 d-block" style="font-size: 0.7rem;"><i class="fas fa-map-marker-alt me-1"></i>Lokasjon:</span>
          <div class="fw-semibold" style="word-wrap: break-word; overflow-wrap: break-word; font-size: 0.75rem;">${kalk.fylke || 'Ukjent'}, ${kalk.kommune || 'Ukjent'}</div>
        </div>
        
        <div class="d-flex gap-1">
          <button class="btn btn-outline-secondary flex-fill" style="font-size: 0.7rem; padding: 0.25rem 0.5rem; white-space: nowrap;" onclick="window.handleGPXExport && window.handleGPXExport(${kalk.id}, 'kalk')">
            <i class="fas fa-download"></i> GPX
          </button>
        </div>
      </div>
    `;
  };

  // Mobile popup drag functionality - disabled auto-close, only X button closes popups
  useEffect(() => {
    if (typeof window !== 'undefined') {
      let isDragging = false;
      let startY = 0;
      let currentY = 0;
      let dragElement: HTMLElement | null = null;

      const handleDragStart = (e: TouchEvent | MouseEvent) => {
        isDragging = true;
        startY = 'touches' in e ? e.touches[0].clientY : e.clientY;
        dragElement = (e.target as HTMLElement).closest('.leaflet-popup');
        
        if (dragElement) {
          dragElement.style.transition = 'none';
          // Prevent map panning while dragging popup
          const mapContainer = document.getElementById('map');
          if (mapContainer) {
            mapContainer.style.pointerEvents = 'none';
          }
        }
        
        e.preventDefault();
        e.stopPropagation();
      };

      const handleDragMove = (e: TouchEvent | MouseEvent) => {
        if (!isDragging || !dragElement) return;
        
        currentY = 'touches' in e ? e.touches[0].clientY : e.clientY;
        const deltaY = currentY - startY;
        
        // Allow limited downward dragging for visual feedback but prevent closing
        if (deltaY > 0) {
          // Limit drag distance to prevent accidental closing
          const limitedDelta = Math.min(deltaY, 50);
          const opacity = Math.max(0.8, 1 - limitedDelta / 200);
          
          dragElement.style.transform = `translateY(${limitedDelta}px)`;
          dragElement.style.opacity = opacity.toString();
        }
        
        e.preventDefault();
        e.stopPropagation();
      };

      const handleDragEnd = (e: TouchEvent | MouseEvent) => {
        if (!isDragging || !dragElement) return;
        
        // Re-enable map interactions
        const mapContainer = document.getElementById('map');
        if (mapContainer) {
          mapContainer.style.pointerEvents = 'auto';
        }
        
        dragElement.style.transition = 'all 0.3s ease';
        
        // Always snap back to original position - no auto-close
        dragElement.style.transform = '';
        dragElement.style.opacity = '';
        
        isDragging = false;
        dragElement = null;
        startY = 0;
        currentY = 0;
        
        e.preventDefault();
        e.stopPropagation();
      };

      // Global event listeners for drag handles
      document.addEventListener('touchstart', (e) => {
        const target = e.target as HTMLElement;
        if (target.closest('.mobile-drag-handle')) {
          handleDragStart(e);
        }
      }, { passive: false });

      document.addEventListener('touchmove', handleDragMove, { passive: false });
      document.addEventListener('touchend', handleDragEnd, { passive: false });
      
      document.addEventListener('mousedown', (e) => {
        const target = e.target as HTMLElement;
        if (target.closest('.mobile-drag-handle')) {
          handleDragStart(e);
        }
      });

      document.addEventListener('mousemove', handleDragMove);
      document.addEventListener('mouseup', handleDragEnd);

      return () => {
        document.removeEventListener('touchstart', handleDragStart);
        document.removeEventListener('touchmove', handleDragMove);
        document.removeEventListener('touchend', handleDragEnd);
        document.removeEventListener('mousedown', handleDragStart);
        document.removeEventListener('mousemove', handleDragMove);
        document.removeEventListener('mouseup', handleDragEnd);
      };
    }
  }, []);

  // Handle file upload functions
  if (typeof window !== 'undefined') {
    (window as any).handleFileUpload = (event: Event, id: number, type: string) => {
      const input = event.target as HTMLInputElement;
      const file = input.files?.[0];
      if (file && (window as any).handleImageUpload) {
        (window as any).handleImageUpload(id, type, file);
      }
    };

    (window as any).handleDocumentFileUpload = (event: Event, id: number, type: string) => {
      const input = event.target as HTMLInputElement;
      const file = input.files?.[0];
      if (file && (window as any).handleDocumentUpload) {
        (window as any).handleDocumentUpload(id, type, file);
      }
    };

    // Connection functions
    (window as any).showAllConnections = showAllConnections;
    (window as any).hideAllConnections = hideAllConnections;
    (window as any).toggleAllConnections = toggleAllConnections;
    (window as any).showIndividualConnections = showIndividualConnections;
    (window as any).hideIndividualConnections = hideIndividualConnections;
  }

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', minHeight: '400px' }}>
      {!isMapReady && (
        <div style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: 'rgba(248, 249, 250, 0.9)',
          zIndex: 1000
        }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{
              width: '40px',
              height: '40px',
              border: '4px solid #f3f3f3',
              borderTop: '4px solid #007bff',
              borderRadius: '50%',
              animation: 'spin 1s linear infinite',
              margin: '0 auto 10px'
            }}></div>
            <div style={{ color: '#6c757d', fontSize: '14px' }}>Loading map...</div>
          </div>
        </div>
      )}

      {/* Satellite View Toggle Button */}
      {isMapReady && (
        <button
          onClick={toggleSatelliteView}
          style={{
            position: 'absolute',
            top: '10px',
            right: '10px',
            zIndex: 1000,
            background: 'white',
            border: '2px solid rgba(0,0,0,0.2)',
            borderRadius: '4px',
            padding: '8px',
            cursor: 'pointer',
            boxShadow: '0 1px 5px rgba(0,0,0,0.65)',
            fontSize: '14px',
            fontWeight: 'bold',
            color: isSatelliteView ? '#28a745' : '#6c757d',
            transition: 'all 0.2s ease'
          }}
          title={isSatelliteView ? 'Switch to Street View' : 'Switch to Satellite View'}
        >
          <i className={`fas ${isSatelliteView ? 'fa-map' : 'fa-satellite'}`}></i>
        </button>
      )}

      <div 
        id="map"
        ref={mapRef} 
        style={{ 
          width: '100%', 
          height: '100%', 
          minHeight: '400px' 
        }} 
      />
    </div>
  );
} 