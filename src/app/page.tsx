'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import LoadingScreen from '@/components/LoadingScreen';
import Counter from '@/components/Counter';
import MapContainer from '@/components/MapContainer';
import ProgressPlan from '@/components/ProgressPlan';
import MarkerDetailPanel from '@/components/MarkerDetailPanel';
import AuthGuard from '@/components/AuthGuard';
import SkeletonMap from '@/components/SkeletonMap';
import SkeletonTopBar from '@/components/SkeletonTopBar';
import SkeletonSidePanel from '@/components/SkeletonSidePanel';
import { supabase, queryWithRetry } from '@/lib/supabase';
import { Airport, Landingsplass, KalkInfo, User, CounterData, FilterState } from '@/types';
import { useTableNames } from '@/contexts/TableNamesContext';

// Utility function to parse European decimal numbers (handles both "1.0" and "1,0" formats)
function parseEuropeanDecimal(value: string | number): number {
  if (typeof value === 'number') {
    return isNaN(value) ? 0 : value;
  }
  
  if (typeof value === 'string') {
    // Replace comma with dot for European decimal format
    const normalizedValue = value.replace(',', '.');
    const parsed = parseFloat(normalizedValue);
    return isNaN(parsed) ? 0 : parsed;
  }
  
  return 0;
}

interface AuthenticatedAppProps {
  user: User;
  onLogout: () => void;
}

function AuthenticatedApp({ user, onLogout }: AuthenticatedAppProps) {
  // Get dynamic table names from context
  const { tableNames, isLoading: isLoadingTableNames } = useTableNames();

  const [isLoading, setIsLoading] = useState(true);
  const [airports, setAirports] = useState<Airport[]>([]);
  const [landingsplasser, setLandingsplasser] = useState<Landingsplass[]>([]);
  const [kalkMarkers, setKalkMarkers] = useState<KalkInfo[]>([]);
  const [counterData, setCounterData] = useState<CounterData>({ remaining: 0, done: 0 });
  const [filterState, setFilterState] = useState<FilterState>({ county: '', showConnections: false });
  const [counties, setCounties] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [appConfig, setAppConfig] = useState<{ active_year: string; active_prefix: string } | null>(null);
  const [loadingStates, setLoadingStates] = useState({
    airports: true,
    landingsplasser: true,
    kalkMarkers: true,
    initialLoad: true
  });

  // Progress tracking state
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [currentLoadingStep, setCurrentLoadingStep] = useState('Starter...');
  const [stepStartTime, setStepStartTime] = useState(Date.now());

  // Mobile UI state
  const [isMobileUIMinimized, setIsMobileUIMinimized] = useState(false);
  const [isMobileTopBarHidden, setIsMobileTopBarHidden] = useState(false);
  const [isMobile, setIsMobile] = useState(false); // Default to desktop layout
  
  // Desktop panel toggle state
  const [isProgressPlanMinimized, setIsProgressPlanMinimized] = useState(false);
  const [isFullScreen, setIsFullScreen] = useState(false);

  // Selected marker state for detail panel
  const [selectedMarker, setSelectedMarker] = useState<{ type: 'airport' | 'landingsplass'; id: number } | null>(null);


  // Completion users for landingsplasser
  const [completionUsers, setCompletionUsers] = useState<Record<number, string>>({});

  // Map zoom function for search results
  const [mapZoomFunction, setMapZoomFunction] = useState<((lat: number, lng: number, zoom?: number) => void) | null>(null);

  // Load completion users from action logs
  // Use a ref to track the last loaded landingsplasser IDs to prevent infinite loop
  const lastLoadedIdsRef = useRef<string>('');

  useEffect(() => {
    const loadCompletionUsers = async () => {
      try {
        const completedLandingsplasser = landingsplasser.filter(lp => lp.done || lp.is_done);
        const completedIds = completedLandingsplasser.map(lp => lp.id);

        // Create a stable key from the IDs
        const idsKey = completedIds.sort().join(',');

        // Only reload if the IDs have actually changed
        if (idsKey === lastLoadedIdsRef.current) {
          return;
        }

        lastLoadedIdsRef.current = idsKey;

        if (completedIds.length === 0) {
          setCompletionUsers({});
          return;
        }

        const { data: completionLogs, error } = await supabase
          .from('user_action_logs')
          .select('user_email, target_id, action_details, timestamp')
          .eq('action_type', 'toggle_done')
          .eq('target_type', 'landingsplass')
          .in('target_id', completedIds)
          .order('timestamp', { ascending: false });

        if (error) {
          console.error('Error loading completion users:', error);
          return;
        }

        const userMap: Record<number, string> = {};
        completionLogs?.forEach(log => {
          const targetId = log.target_id;
          const actionDetails = log.action_details as any;

          if (userMap[targetId]) return;

          const isCompleted =
            actionDetails?.new_status === 'completed' ||
            actionDetails?.new_status === true;

          if (isCompleted) {
            const userName = log.user_email?.split('@')[0] || log.user_email || '';
            userMap[targetId] = userName;
          }
        });

        setCompletionUsers(userMap);
      } catch (error) {
        console.error('Error loading completion users:', error);
      }
    };

    if (landingsplasser.length > 0) {
      loadCompletionUsers();
    }
  }, [landingsplasser]);

  const initializeApp = useCallback(async () => {
    if (!tableNames) return; // Guard: wait for table names to load

    try {
      setError(null);
      setLoadingProgress(0);
      setCurrentLoadingStep('Starter...');
      setStepStartTime(Date.now());

      setLoadingProgress(10);

      // Load data sequentially to track progress accurately
      setCurrentLoadingStep('Laster vann-data...');
      setStepStartTime(Date.now());
      await loadAirports();
      setLoadingProgress(35);

      setCurrentLoadingStep('Laster landingsplass-data...');
      setStepStartTime(Date.now());
      await loadLandingsplasser();
      setLoadingProgress(65);

      setCurrentLoadingStep('Laster kommentar-data...');
      setStepStartTime(Date.now());
      await loadKalkMarkers();
      setLoadingProgress(85);

      setCurrentLoadingStep('Laster fylker...');
      setStepStartTime(Date.now());
      await loadCounties();
      setLoadingProgress(95);

      setCurrentLoadingStep('Ferdiggjør...');
      setStepStartTime(Date.now());
      setLoadingProgress(100);

      setLoadingStates(prev => ({ ...prev, initialLoad: false }));
      setIsLoading(false);
    } catch (error) {
      console.error('Error initializing app:', error);

      // Check if it's a session-related error
      const errorMessage = error instanceof Error ? error.message : '';
      if (errorMessage.includes('expired') || errorMessage.includes('log in again')) {
        setError('Session expired. Please refresh the page to log in again.');
      } else if (errorMessage.includes('relation') && errorMessage.includes('does not exist')) {
        setError('Database tables not found. Please go to Admin panel to configure the correct database tables.');
      } else {
        setError('Failed to initialize application. Please check your connection or database configuration.');
      }

      setLoadingStates(prev => ({ ...prev, initialLoad: false }));
      setIsLoading(false);
    }
  }, [tableNames]);

  useEffect(() => {
    initializeApp();
    loadAppConfig();

    // DISABLED: Periodic session validation was causing performance issues
    // Supabase autoRefreshToken handles session refresh automatically
    // Session expiry is caught by error handlers in queries

    return () => {
      // Cleanup if needed
    };
  }, [initializeApp]);

  const loadAppConfig = async () => {
    try {
      const { data, error } = await supabase
        .from('app_config')
        .select('active_year, active_prefix')
        .limit(1)
        .single();

      if (!error && data) {
        setAppConfig(data);
      }
    } catch (error) {
      console.error('Error loading app config:', error);
    }
  };

  const loadAirports = async () => {
    if (!tableNames) return; // Guard: wait for table names to load

    try {
      setLoadingStates(prev => ({ ...prev, airports: true }));

      // Get the total count with retry logic
      const countResult = await queryWithRetry(
        () => supabase
          .from(tableNames.vass_vann)
          .select('*', { count: 'exact', head: true }),
        'get airports count'
      );
      const count = countResult.count;

      // Implement proper pagination to get ALL records with retry logic
      const allAirports = [];
      const pageSize = 1000; // Supabase's limit
      let currentOffset = 0;
      let hasMore = true;

      while (hasMore) {
        const { data: pageData } = await queryWithRetry(
          () => supabase
            .from(tableNames.vass_vann)
            .select('*')
            .order('id', { ascending: true })
            .range(currentOffset, currentOffset + pageSize - 1),
          `load airports page ${Math.floor(currentOffset / pageSize) + 1}`
        );

        if (!pageData || pageData.length === 0) {
          hasMore = false;
          break;
        }

        allAirports.push(...pageData);

        // Check if we got fewer records than requested (end of data)
        if (pageData.length < pageSize) {
          hasMore = false;
        } else {
          currentOffset += pageSize;
        }

        // Safety check to prevent infinite loops
        if (allAirports.length >= (count || 0) + 100) {
          console.warn('⚠️ Safety break: fetched more records than expected');
          hasMore = false;
        }
      }

      // Validate data structure and add default values
      const validAirports = allAirports.filter((airport: Record<string, unknown>) => 
        airport && 
        typeof airport.latitude === 'number' && 
        typeof airport.longitude === 'number' &&
        !isNaN(airport.latitude) &&
        !isNaN(airport.longitude)
      ).map((airport: Record<string, unknown>) => ({
        ...airport,
        // Use correct field names from original
        done: airport.is_done || false, // Map is_done to done for React compatibility
        priority: airport.priority || 999,
        marker_color: airport.marker_color || 'red'
      }));

      setAirports(validAirports);
    } catch (error) {
      console.error('Error loading airports:', error);
      setAirports([]);
    } finally {
      setLoadingStates(prev => ({ ...prev, airports: false }));
    }
  };

  const loadLandingsplasser = async () => {
    if (!tableNames) return; // Guard: wait for table names to load

    try {
      setLoadingStates(prev => ({ ...prev, landingsplasser: true }));

      // First get all landingsplasser with retry logic
      const { data: landingsplassData } = await queryWithRetry(
        () => supabase
          .from(tableNames.vass_lasteplass)
          .select('*')
          .order('lp', { ascending: true }),
        'load landingsplasser'
      );

      if (!landingsplassData || landingsplassData.length === 0) {
        console.warn('No landingsplasser found');
        setLandingsplasser([]);
        return;
      }

      // Get landingsplass IDs for batch queries
      const landingsplassIds = landingsplassData.map(lp => lp.id);

      // Batch load all associations in one query (eliminates N+1 problem)
      const { data: allAssociations } = await queryWithRetry(
        () => supabase
          .from(tableNames.vass_associations)
          .select('landingsplass_id, airport_id')
          .in('landingsplass_id', landingsplassIds),
        'load associations'
      );

      // Get unique airport IDs from associations
      const airportIds = [...new Set((allAssociations || []).map(assoc => assoc.airport_id))];

      // Batch load all tonnage data in one query (eliminates second N query)
      const { data: watersData } = await queryWithRetry(
        () => supabase
          .from(tableNames.vass_vann)
          .select('id, tonn')
          .in('id', airportIds),
        'load waters tonnage'
      );

      // Create lookup maps for efficient processing
      const associationsMap = new Map<number, number[]>();
      (allAssociations || []).forEach(assoc => {
        if (!associationsMap.has(assoc.landingsplass_id)) {
          associationsMap.set(assoc.landingsplass_id, []);
        }
        associationsMap.get(assoc.landingsplass_id)!.push(assoc.airport_id);
      });

      const tonnageMap = new Map<number, number>();
      (watersData || []).forEach(water => {
        const tonnageValue = water.tonn || 0;
        const validTonnage = parseEuropeanDecimal(tonnageValue);
        tonnageMap.set(water.id, validTonnage);
      });

      // Calculate tonnage for each landingsplass efficiently
      const landingsplasserWithCalculatedTonnage = landingsplassData.map((lp: Record<string, unknown>) => {
        const associatedAirportIds = associationsMap.get(lp.id as number) || [];
        const totalTonnage = associatedAirportIds.reduce((sum, airportId) => {
          return sum + (tonnageMap.get(airportId) || 0);
        }, 0);

        return {
          ...lp,
          calculated_tonn: totalTonnage
        };
      });

      // Validate data structure
      const validLandingsplasser = landingsplasserWithCalculatedTonnage.filter((lp: Record<string, unknown>) => 
        lp && 
        typeof lp.latitude === 'number' && 
        typeof lp.longitude === 'number' &&
        !isNaN(lp.latitude) &&
        !isNaN(lp.longitude)
      ).map((lp: Record<string, unknown>) => ({
        ...lp,
        priority: lp.priority || 999,
        done: lp.is_done || false // Map is_done to done
      }));

      setLandingsplasser(validLandingsplasser);
    } catch (error) {
      console.error('Error loading landingsplasser:', error);
      setLandingsplasser([]);
    } finally {
      setLoadingStates(prev => ({ ...prev, landingsplasser: false }));
    }
  };

  const loadKalkMarkers = async () => {
    if (!tableNames) return; // Guard: wait for table names to load

    try {
      setLoadingStates(prev => ({ ...prev, kalkMarkers: true }));
      const { data } = await queryWithRetry(
        () => supabase
          .from(tableNames.vass_info)
          .select('*'),
        'load kalk markers'
      );

      // Validate data structure
      const validKalkMarkers = (data || []).filter((kalk: Record<string, unknown>) => 
        kalk && 
        typeof kalk.latitude === 'number' && 
        typeof kalk.longitude === 'number' &&
        !isNaN(kalk.latitude) &&
        !isNaN(kalk.longitude)
      );

      setKalkMarkers(validKalkMarkers);
    } catch (error) {
      console.error('Error loading kalk markers:', error);
      setKalkMarkers([]);
    } finally {
      setLoadingStates(prev => ({ ...prev, kalkMarkers: false }));
    }
  };

  const loadCounties = async () => {
    if (!tableNames) return; // Guard: wait for table names to load

    try {
      // Fetch unique fylke values from both tables with retry logic
      const [airportsResponse, landingsplassResponse] = await Promise.all([
        queryWithRetry(
          () => supabase
            .from(tableNames.vass_vann)
            .select('fylke')
            .not('fylke', 'is', null)
            .not('fylke', 'eq', ''),
          'load airport counties'
        ),
        queryWithRetry(
          () => supabase
            .from(tableNames.vass_lasteplass)
            .select('fylke')
            .not('fylke', 'is', null)
            .not('fylke', 'eq', ''),
          'load landingsplass counties'
        )
      ]);

      // Combine and get unique values
      const allCounties = [
        ...(airportsResponse.data || []).map(item => item.fylke),
        ...(landingsplassResponse.data || []).map(item => item.fylke)
      ];

      const uniqueCounties = [...new Set(allCounties)]
        .filter(county => county && county.trim() !== '')
        .sort();

      setCounties(uniqueCounties);
    } catch (error) {
      console.error('Error loading counties:', error);
      setCounties([]);
    }
  };

  const updateCounterData = useCallback(() => {
    // Counter should reflect filtered data, not all data
    let visibleAirports = airports;
    
    // Apply county filter like original
    if (filterState.county) {
      visibleAirports = airports.filter(airport => airport.fylke === filterState.county);
    }
    
    const remaining = visibleAirports.filter(a => !a.done).length;
    const done = visibleAirports.filter(a => a.done).length;
    
    setCounterData({ remaining, done });
  }, [airports, filterState.county]);

  useEffect(() => {
    updateCounterData();
  }, [updateCounterData]);

  // Detect mobile device and handle resize
  useEffect(() => {
    const checkIfMobile = () => {
      // Mobile detection based on screen size
      const isSmallScreen = window.innerWidth <= 900;
      setIsMobile(isSmallScreen);
      
      // Reset mobile UI state when switching between mobile/desktop
      if (!isSmallScreen) {
        setIsMobileUIMinimized(false);
        setIsMobileTopBarHidden(false);
      }
    };

    checkIfMobile();
    window.addEventListener('resize', checkIfMobile);
    return () => window.removeEventListener('resize', checkIfMobile);
  }, []);

  const toggleMobileUI = () => {
    // Toggle between showing everything and hiding everything
    if (!isMobileUIMinimized && !isMobileTopBarHidden) {
      // Hide both panels immediately (full map)
      setIsMobileUIMinimized(true);
      setIsMobileTopBarHidden(true);
    } else {
      // Show everything again
      setIsMobileUIMinimized(false);
      setIsMobileTopBarHidden(false);
    }
    
    // Trigger a custom event to notify the map to resize
    setTimeout(() => {
      window.dispatchEvent(new CustomEvent('mobileUIToggle'));
    }, 150); // Small delay to ensure CSS transitions complete
  };

  const toggleProgressPlan = () => {
    setIsProgressPlanMinimized(!isProgressPlanMinimized);
    
    // Trigger map resize immediately
    setTimeout(() => {
      window.dispatchEvent(new CustomEvent('progressPlanToggle'));
    }, 10);
  };

  const toggleFullScreen = () => {
    setIsFullScreen(!isFullScreen);
    
    // Trigger map resize after layout changes
    setTimeout(() => {
      window.dispatchEvent(new CustomEvent('fullscreenToggle'));
    }, 150);
  };

  if (isLoading) {
    return (
      <>
        {/* Show skeleton UI for app structure */}
        <div style={{ position: 'relative', height: '100vh', display: 'flex', flexDirection: 'column' }}>
          {/* Top bar skeleton */}
          <SkeletonTopBar />

          {/* Main content area */}
          <div style={{ display: 'flex', flex: 1, position: 'relative', overflow: 'hidden' }}>
            {/* Map skeleton */}
            <div style={{ flex: 1, position: 'relative' }}>
              <SkeletonMap />
            </div>

            {/* Side panel skeleton (desktop only) */}
            {!isMobile && (
              <div style={{ width: '400px', borderLeft: '1px solid #dee2e6' }}>
                <SkeletonSidePanel />
              </div>
            )}
          </div>
        </div>

        {/* Loading screen overlay with real progress */}
        <LoadingScreen
          progress={loadingProgress}
          currentStep={currentLoadingStep}
          stepStartTime={stepStartTime}
        />
      </>
    );
  }

  if (error) {
    return (
      <div className="d-flex align-items-center justify-content-center" style={{ height: '100vh' }}>
        <div className="text-center">
          <i className="fas fa-exclamation-triangle fa-3x text-warning mb-3"></i>
          <h5>Kunne ikke laste applikasjon</h5>
          <p className="text-muted">{error}</p>
          <button 
            className="btn btn-primary" 
            onClick={() => {
              setIsLoading(true);
              initializeApp();
            }}
          >
            <i className="fas fa-redo me-2"></i>
            Prøv igjen
          </button>
        </div>
      </div>
    );
  }

  // Show error message with link to admin if data failed to load
  if (error && !isLoading) {
    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        padding: '20px',
        textAlign: 'center',
        backgroundColor: '#f8f9fa'
      }}>
        <div style={{
          maxWidth: '600px',
          backgroundColor: 'white',
          padding: '40px',
          borderRadius: '8px',
          boxShadow: '0 2px 10px rgba(0,0,0,0.1)'
        }}>
          <i className="fas fa-exclamation-triangle" style={{ fontSize: '48px', color: '#dc3545', marginBottom: '20px' }}></i>
          <h2 style={{ color: '#dc3545', marginBottom: '20px' }}>Database Configuration Error</h2>
          <p style={{ marginBottom: '20px', color: '#6c757d' }}>{error}</p>
          <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', flexWrap: 'wrap' }}>
            <button
              onClick={() => window.location.href = '/admin'}
              style={{
                padding: '12px 24px',
                backgroundColor: '#007bff',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '16px',
                fontWeight: '500'
              }}
            >
              <i className="fas fa-cog" style={{ marginRight: '8px' }}></i>
              Go to Admin Panel
            </button>
            <button
              onClick={() => window.location.reload()}
              style={{
                padding: '12px 24px',
                backgroundColor: '#6c757d',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '16px',
                fontWeight: '500'
              }}
            >
              <i className="fas fa-redo" style={{ marginRight: '8px' }}></i>
              Retry
            </button>
            <button
              onClick={onLogout}
              style={{
                padding: '12px 24px',
                backgroundColor: '#dc3545',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '16px',
                fontWeight: '500'
              }}
            >
              <i className="fas fa-sign-out-alt" style={{ marginRight: '8px' }}></i>
              Logout
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Show counter unless hidden on mobile or in fullscreen */}
      {(!isMobile || !isMobileTopBarHidden) && !isFullScreen && (
        <div className={`${isMobile && isMobileTopBarHidden ? 'mobile-hidden' : ''}`}>
          <Counter
            counterData={counterData}
            counties={counties}
            filterState={filterState}
            onFilterChange={setFilterState}
            user={user}
            onUserUpdate={() => onLogout()}
            isLoading={loadingStates.initialLoad}
            onHideAll={toggleFullScreen}
            onZoomToLocation={mapZoomFunction}
          />
        </div>
      )}

      <div className={`main-split-container ${isMobile && isMobileUIMinimized ? 'panel-minimized' : ''} ${!isMobile && isProgressPlanMinimized ? 'progress-plan-minimized' : ''} ${isFullScreen ? 'fullscreen' : ''}`} style={{ 
        display: 'flex', 
        flexDirection: isMobile ? 'column' : 'row', 
        height: isFullScreen ? '100vh' : (isMobile ? (isMobileTopBarHidden ? '100vh' : 'calc(100vh - 60px)') : 'calc(100vh - 70px)') 
      }}>
        <div className="left-panel" style={{ 
          flex: isFullScreen ? '1' : (!isMobile && isProgressPlanMinimized ? '1' : '0 0 70%'), 
          height: '100%',
          minWidth: 0
        }}>
          <MapContainer
            airports={airports}
            landingsplasser={landingsplasser}
            kalkMarkers={kalkMarkers}
            filterState={filterState}
            user={user}
            onMarkerSelect={setSelectedMarker}
            onDataUpdate={async () => {
              // Reload data (session validation removed to prevent rate limiting)
              loadAirports();
              loadLandingsplasser();
              loadKalkMarkers();
            }}
            onMapReady={(zoomFn) => setMapZoomFunction(() => zoomFn)}
          />
        </div>
        {!isFullScreen && (
          <div className={`right-panel ${isMobile && isMobileUIMinimized ? 'panel-minimized' : ''} ${!isMobile && isProgressPlanMinimized ? 'panel-minimized' : ''}`} style={{
            flex: !isMobile && isProgressPlanMinimized ? '0 0 40px' : '0 0 30%',
            height: '100%',
            borderLeft: '1px solid #dee2e6',
            background: '#f8f9fa',
            overflow: 'hidden',
            position: 'relative',
            scrollbarWidth: 'none',
            msOverflowStyle: 'none'
          }}>
          {selectedMarker ? (
            <MarkerDetailPanel
              markerType={selectedMarker.type}
              markerId={selectedMarker.id}
              airports={airports}
              landingsplasser={landingsplasser}
              user={user}
              completionUsers={completionUsers}
              onClose={() => setSelectedMarker(null)}
              onDataUpdate={async () => {
                // Reload data (session validation removed to prevent rate limiting)
                loadAirports();
                loadLandingsplasser();
                loadKalkMarkers();
              }}
            />
          ) : (
            <ProgressPlan
              landingsplasser={landingsplasser}
              filterState={filterState}
              user={user}
              isLoading={loadingStates.landingsplasser}
              isMobile={isMobile}
              onMobileToggle={toggleMobileUI}
              isMinimized={isProgressPlanMinimized}
              onToggleMinimized={toggleProgressPlan}
              onMarkerSelect={setSelectedMarker}
              onZoomToLocation={mapZoomFunction}
              onDataUpdate={async () => {
                // Reload data (session validation removed to prevent rate limiting)
                loadAirports();
                loadLandingsplasser();
                loadKalkMarkers();
              }}
            />
          )}
          {/* Show button when panel is minimized - positioned at same height as hide button */}
          {!isMobile && isProgressPlanMinimized && (
            <div style={{ position: 'absolute', top: '8px', right: '12px', width: '40px', height: '40px', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: '8px' }}>
              <span
                style={{ 
                  display: 'inline-block',
                  width: '16px',
                  height: '16px',
                  lineHeight: '14px',
                  textAlign: 'center',
                  fontSize: '10px',
                  color: '#6c757d',
                  backgroundColor: 'white',
                  border: '1px solid #dee2e6',
                  borderRadius: '2px',
                  cursor: 'pointer',
                  userSelect: 'none',
                  WebkitUserSelect: 'none',
                  MozUserSelect: 'none',
                  boxSizing: 'border-box',
                  verticalAlign: 'middle',
                  margin: '0',
                  padding: '0'
                }}
                onClick={toggleProgressPlan}
                title="Show Fremdriftsplan"
              >
                ◀
              </span>
            </div>
          )}
          </div>
        )}
      </div>

      {/* Floating show button when everything is hidden on mobile */}
      {isMobile && isMobileUIMinimized && isMobileTopBarHidden && (
        <button
          className="btn btn-primary"
          style={{
            position: 'fixed',
            bottom: '20px',
            right: '20px',
            zIndex: 1000,
            borderRadius: '50%',
            width: '50px',
            height: '50px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 4px 8px rgba(0,0,0,0.3)'
          }}
          onClick={toggleMobileUI}
          title="Vis paneler"
        >
          <i className="fas fa-eye" style={{ fontSize: '18px' }}></i>
        </button>
      )}

      {/* Floating restore button when in fullscreen mode */}
      {isFullScreen && (
        <button
          className="btn btn-danger"
          style={{
            position: 'fixed',
            top: '20px',
            right: '20px',
            zIndex: 1000,
            borderRadius: '8px',
            padding: '8px 12px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 4px 8px rgba(0,0,0,0.3)',
            fontSize: '0.9rem'
          }}
          onClick={toggleFullScreen}
          title="Vis topbar og Fremdriftsplan"
        >
          <i className="fas fa-compress-arrows-alt me-2" style={{ fontSize: '16px' }}></i>
          Vis paneler
        </button>
      )}
    </>
  );
}

export default function Home() {
  return (
    <AuthGuard>
      {(user: User, onLogout: () => void) => (
        <AuthenticatedApp user={user} onLogout={onLogout} />
      )}
    </AuthGuard>
  );
}
