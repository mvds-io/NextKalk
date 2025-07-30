'use client';

import { useState, useEffect } from 'react';
import LoadingScreen from '@/components/LoadingScreen';
import Counter from '@/components/Counter';
import MapContainer from '@/components/MapContainer';
import ProgressPlan from '@/components/ProgressPlan';
import DatabaseInspector from '@/components/DatabaseInspector';
import { supabase } from '@/lib/supabase';
import { Airport, Landingsplass, KalkInfo, User, CounterData, FilterState } from '@/types';

export default function Home() {
  const [isLoading, setIsLoading] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [airports, setAirports] = useState<Airport[]>([]);
  const [landingsplasser, setLandingsplasser] = useState<Landingsplass[]>([]);
  const [kalkMarkers, setKalkMarkers] = useState<KalkInfo[]>([]);
  const [counterData, setCounterData] = useState<CounterData>({ remaining: 0, done: 0 });
  const [filterState, setFilterState] = useState<FilterState>({ county: '', showConnections: false });
  const [counties, setCounties] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loadingStates, setLoadingStates] = useState({
    airports: true,
    landingsplasser: true,
    kalkMarkers: true,
    initialLoad: true
  });

  // Mobile UI state
  const [isMobileUIMinimized, setIsMobileUIMinimized] = useState(false);
  const [isMobileTopBarHidden, setIsMobileTopBarHidden] = useState(false);
  const [isMobile, setIsMobile] = useState(false); // Default to desktop layout

  useEffect(() => {
    initializeApp();
    
    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_IN' && session?.user) {
        // Fetch user data from users table
        try {
          const { data: userData } = await supabase
            .from('users')
            .select('*')
            .eq('email', session.user.email)
            .single();

          if (userData) {
            setUser(userData);
          }
        } catch (error) {
          console.warn('Could not load user data after login');
        }
      } else if (event === 'SIGNED_OUT') {
        setUser(null);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const initializeApp = async () => {
    try {
      setError(null);
      
      // Check authentication
      const { data: { session } } = await supabase.auth.getSession();
      
      if (session?.user) {
        // Fetch user permissions
        try {
          const { data: userData } = await supabase
            .from('users')
            .select('*')
            .eq('email', session.user.email)
            .single();

          if (userData) {
            setUser(userData);
          }
        } catch (userError) {
          console.warn('Could not load user data - continuing without authentication');
        }
      }

      // Load data in parallel
      await Promise.all([
        loadAirports(),
        loadLandingsplasser(),
        loadKalkMarkers(),
        loadCounties()
      ]);

      setLoadingStates(prev => ({ ...prev, initialLoad: false }));
      setIsLoading(false);
    } catch (error) {
      console.error('Error initializing app:', error);
      setError('Failed to initialize application. Please check your connection.');
      setLoadingStates(prev => ({ ...prev, initialLoad: false }));
      setIsLoading(false);
    }
  };

  const loadAirports = async () => {
    try {
      setLoadingStates(prev => ({ ...prev, airports: true }));
      console.log('Fetching airports from table: vass_vann');
      
      // First, get the total count
      const { count, error: countError } = await supabase
        .from('vass_vann')
        .select('*', { count: 'exact', head: true });

      if (countError) {
        console.error('Error getting count:', countError);
      } else {
        console.log(`📊 Total airports in database: ${count}`);
      }

      // Implement proper pagination to get ALL records
      console.log(`🔄 Implementing pagination to fetch all ${count} records...`);
      let allAirports = [];
      const pageSize = 1000; // Supabase's limit
      let currentOffset = 0;
      let hasMore = true;
      
      while (hasMore) {
        console.log(`📄 Fetching page ${Math.floor(currentOffset / pageSize) + 1} (records ${currentOffset + 1}-${Math.min(currentOffset + pageSize, count || 0)})...`);
        
        const { data: pageData, error: pageError } = await supabase
          .from('vass_vann')
          .select('*')
          .order('id', { ascending: true })
          .range(currentOffset, currentOffset + pageSize - 1);
          
        if (pageError) {
          console.error(`Error fetching page at offset ${currentOffset}:`, pageError);
          break;
        }
        
        if (!pageData || pageData.length === 0) {
          hasMore = false;
          break;
        }
        
        allAirports.push(...pageData);
        console.log(`✅ Page fetched: ${pageData.length} records (total so far: ${allAirports.length})`);
        
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
      const validAirports = allAirports.filter((airport: any) => 
        airport && 
        typeof airport.latitude === 'number' && 
        typeof airport.longitude === 'number' &&
        !isNaN(airport.latitude) &&
        !isNaN(airport.longitude)
      ).map((airport: any) => ({
        ...airport,
        // Use correct field names from original
        done: airport.is_done || false, // Map is_done to done for React compatibility
        priority: airport.priority || 999,
        marker_color: airport.marker_color || 'red'
      }));

      console.log(`✅ Valid airports loaded: ${validAirports.length} records`);
      setAirports(validAirports);
    } catch (error) {
      console.warn('Error loading airports:', error);
      setAirports([]);
    } finally {
      setLoadingStates(prev => ({ ...prev, airports: false }));
    }
  };

  const loadLandingsplasser = async () => {
    try {
      setLoadingStates(prev => ({ ...prev, landingsplasser: true }));
      console.log('Fetching landingsplass markers from table: vass_lasteplass');
      const { data, error } = await supabase
        .from('vass_lasteplass')
        .select('*')
        .order('lp', { ascending: true }); // Order by lp field like original

      if (error) {
        console.warn('Could not load landingsplasser:', error.message);
        setLandingsplasser([]);
        return;
      }

      // Validate data structure
      const validLandingsplasser = (data || []).filter((lp: any) => 
        lp && 
        typeof lp.latitude === 'number' && 
        typeof lp.longitude === 'number' &&
        !isNaN(lp.latitude) &&
        !isNaN(lp.longitude)
      ).map((lp: any) => ({
        ...lp,
        priority: lp.priority || 999,
        done: lp.is_done || false // Map is_done to done
      }));

      console.log(`✅ Landingsplasser loaded: ${validLandingsplasser.length} records`);
      setLandingsplasser(validLandingsplasser);
    } catch (error) {
      console.warn('Error loading landingsplasser:', error);
      setLandingsplasser([]);
    } finally {
      setLoadingStates(prev => ({ ...prev, landingsplasser: false }));
    }
  };

  const loadKalkMarkers = async () => {
    try {
      setLoadingStates(prev => ({ ...prev, kalkMarkers: true }));
      const { data, error } = await supabase
        .from('vass_info')
        .select('*');

      if (error) {
        console.warn('Could not load kalk markers:', error.message);
        setKalkMarkers([]);
        return;
      }

      // Validate data structure
      const validKalkMarkers = (data || []).filter((kalk: any) => 
        kalk && 
        typeof kalk.latitude === 'number' && 
        typeof kalk.longitude === 'number' &&
        !isNaN(kalk.latitude) &&
        !isNaN(kalk.longitude)
      );

      setKalkMarkers(validKalkMarkers);
    } catch (error) {
      console.warn('Error loading kalk markers:', error);
      setKalkMarkers([]);
    } finally {
      setLoadingStates(prev => ({ ...prev, kalkMarkers: false }));
    }
  };

  const loadCounties = async () => {
    try {
      console.log('Fetching unique counties from both tables...');
      
      // Fetch unique fylke values from both tables like original
      const [airportsResponse, landingsplassResponse] = await Promise.all([
        supabase
          .from('vass_vann')
          .select('fylke')
          .not('fylke', 'is', null)
          .not('fylke', 'eq', ''),
        supabase
          .from('vass_lasteplass')
          .select('fylke')
          .not('fylke', 'is', null)
          .not('fylke', 'eq', '')
      ]);

      if (airportsResponse.error) throw airportsResponse.error;
      if (landingsplassResponse.error) throw landingsplassResponse.error;

      // Combine and get unique values
      const allCounties = [
        ...(airportsResponse.data || []).map(item => item.fylke),
        ...(landingsplassResponse.data || []).map(item => item.fylke)
      ];

      const uniqueCounties = [...new Set(allCounties)]
        .filter(county => county && county.trim() !== '')
        .sort();

      console.log('✅ Unique counties found:', uniqueCounties);
      setCounties(uniqueCounties);
    } catch (error) {
      console.warn('Error loading counties:', error);
      setCounties([]);
    }
  };

  const updateCounterData = () => {
    // Counter should reflect filtered data, not all data
    let visibleAirports = airports;
    
    // Apply county filter like original
    if (filterState.county) {
      visibleAirports = airports.filter(airport => airport.fylke === filterState.county);
    }
    
    const remaining = visibleAirports.filter(a => !a.done).length;
    const done = visibleAirports.filter(a => a.done).length;
    
    setCounterData({ remaining, done });
  };

  useEffect(() => {
    updateCounterData();
  }, [airports, filterState.county]);

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

  if (isLoading) {
    return <LoadingScreen />;
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

  return (
    <>
      {/* Show counter unless hidden on mobile */}
      {(!isMobile || !isMobileTopBarHidden) && (
        <div className={`${isMobile && isMobileTopBarHidden ? 'mobile-hidden' : ''}`}>
          <Counter 
            counterData={counterData}
            counties={counties}
            filterState={filterState}
            onFilterChange={setFilterState}
            user={user}
            onUserUpdate={setUser}
            isLoading={loadingStates.initialLoad}
          />
        </div>
      )}
      
      
      <div className={`main-split-container ${isMobile && isMobileUIMinimized ? 'panel-minimized' : ''}`} style={{ 
        display: 'flex', 
        flexDirection: isMobile ? 'column' : 'row', 
        height: isMobile ? (isMobileTopBarHidden ? '100vh' : 'calc(100vh - 60px)') : 'calc(100vh - 70px)' 
      }}>
        <div className="left-panel" style={{ flex: '0 0 70%', height: '100%' }}>
          <MapContainer 
            airports={airports}
            landingsplasser={landingsplasser}
            kalkMarkers={kalkMarkers}
            filterState={filterState}
            user={user}
            onDataUpdate={() => {
              loadAirports();
              loadLandingsplasser();
              loadKalkMarkers();
            }}
          />
        </div>
        <div className={`right-panel ${isMobile && isMobileUIMinimized ? 'panel-minimized' : ''}`} style={{ flex: '0 0 30%', height: '100%', borderLeft: '1px solid #dee2e6', background: '#f8f9fa' }}>
          <ProgressPlan 
            landingsplasser={landingsplasser}
            filterState={filterState}
            user={user}
            isLoading={loadingStates.landingsplasser}
            isMobile={isMobile}
            onMobileToggle={toggleMobileUI}
            onDataUpdate={() => {
              loadAirports();
              loadLandingsplasser();
              loadKalkMarkers();
            }}
          />
        </div>
      </div>

      <DatabaseInspector />

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
    </>
  );
}
