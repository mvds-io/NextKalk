'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { CounterData, FilterState, User, Airport, Landingsplass } from '@/types';
import { supabase, completeLogout } from '@/lib/supabase';
import { exportCompletedLandingsplassToPDF } from '@/lib/pdfExport';
import UserLogsModal from './UserLogsModal';
import { SkeletonCounter } from './SkeletonLoader';
import SearchModal from './SearchModal';
import SearchResultModal from './SearchResultModal';

interface CounterProps {
  counterData: CounterData;
  counties: string[];
  filterState: FilterState;
  onFilterChange: (newFilter: FilterState) => void;
  user?: User | null;
  onUserUpdate?: (user: User | null) => void;
  isLoading?: boolean;
  onHideAll?: () => void;
  onZoomToLocation?: ((lat: number, lng: number, zoom?: number) => void) | null;
}

export default function Counter({ 
  counterData, 
  counties, 
  filterState, 
  onFilterChange, 
  user, 
  onUserUpdate,
  isLoading = false,
  onHideAll,
  onZoomToLocation
}: CounterProps) {
  
  const [isLoadingConnections, setIsLoadingConnections] = useState(false);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [showUserLogsModal, setShowUserLogsModal] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [loginError, setLoginError] = useState('');
  const [userPermissions, setUserPermissions] = useState<Record<string, boolean>>({});
  const [isExportingPDF, setIsExportingPDF] = useState(false);
  const [showSearchModal, setShowSearchModal] = useState(false);
  const [showResultModal, setShowResultModal] = useState(false);
  const [selectedSearchResult, setSelectedSearchResult] = useState<Airport | Landingsplass | null>(null);

  const getUserPermissions = useCallback(async () => {
    if (!user) return {};
    
    try {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('email', user.email)
        .single();

      if (!error && data) {
        const permissions = {
          userRecord: data,
          role: data.role || 'user',
          canEditPriority: ['admin', 'manager'].includes(data.role),
          canDeleteMarkers: ['admin', 'manager'].includes(data.role),
          canViewLogs: data.can_edit_markers || false,
          canEditMarkers: data.can_edit_markers || false
        };
        setUserPermissions(permissions);
        return permissions;
      }
    } catch (error) {
      console.warn('Error loading user permissions:', error);
    }
    
    return {};
  }, [user]);

  // Load user permissions when user changes
  useEffect(() => {
    if (user) {
      getUserPermissions();
    }
  }, [user, getUserPermissions]);

  const handleCountyChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const county = e.target.value;
    onFilterChange({
      ...filterState,
      county
    });
  };

  const handleConnectionsToggle = async () => {
    if (isLoadingConnections) return; // Prevent multiple clicks while loading
    
    setIsLoadingConnections(true);
    
    try {
      // Toggle connections via global function
      if (typeof window !== 'undefined' && (window as Record<string, unknown>).toggleAllConnections) {
        await ((window as Record<string, unknown>).toggleAllConnections as () => Promise<void>)();
        onFilterChange({
          ...filterState,
          showConnections: !filterState.showConnections
        });
      }
    } catch (error) {
      console.error('Error toggling connections:', error);
    } finally {
      // Add a small delay to show the loading state
      setTimeout(() => {
        setIsLoadingConnections(false);
      }, 300);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoggingIn(true);
    setLoginError('');

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password
      });

      if (error) throw error;
      setShowLoginModal(false);
      setEmail('');
      setPassword('');
    } catch (error: unknown) {
      setLoginError(error instanceof Error ? error.message : 'An unknown error occurred');
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleLogout = async () => {
    if (onUserUpdate) {
      onUserUpdate(null);
    }
    await completeLogout();
  };

  const exportToPDF = async () => {
    if (isExportingPDF) return;
    
    setIsExportingPDF(true);
    
    try {
      const result = await exportCompletedLandingsplassToPDF();
      
      if (result.success) {
        // Show success message (you could add a toast here)
        console.log(`PDF rapport generert med ${result.itemsExported} utførte lasteplasser`);
      } else {
        // Show error message (you could add a toast here)
        console.error('PDF export failed:', result.error);
        alert(result.error || 'Kunne ikke generere PDF rapport');
      }
    } catch (error) {
      console.error('Error exporting PDF:', error);
      alert('Kunne ikke generere PDF rapport');
    } finally {
      setIsExportingPDF(false);
    }
  };

  const showUserLogs = async () => {
    // Check permissions first
    if (!userPermissions.canViewLogs) {
      alert('Du har ikke tilgang til å se logger');
      return;
    }
    
    setShowUserLogsModal(true);
  };

  const handleSearchResultSelect = (result: Airport | Landingsplass) => {
    setSelectedSearchResult(result);
    setShowSearchModal(false);
    setShowResultModal(true);
    
    // Zoom to the selected location if zoom function is available
    if (onZoomToLocation && result.latitude && result.longitude) {
      onZoomToLocation(result.latitude, result.longitude, 16);
    }
  };

  // Create legend icon element like the original
  const createLegendIcon = (color: string, iconClass: string) => (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: '16px',
        height: '16px',
        borderRadius: '50%',
        color: 'white',
        fontSize: '10px',
        lineHeight: '16px',
        textAlign: 'center',
        backgroundColor: 
          color === 'blue' ? '#2A81CB' :
          color === 'red' ? '#CB2B3E' :
          color === 'green' ? '#2AAD27' :
          color === 'orange' ? '#FFA500' : color
      }}
    >
      <i className={`fa ${iconClass}`}></i>
    </div>
  );

  const getRoleBadgeClass = (role: string) => {
    switch (role) {
      case 'admin': return 'bg-danger';
      case 'manager': return 'bg-warning';
      default: return 'bg-secondary';
    }
  };

  if (isLoading) {
    return <SkeletonCounter />;
  }

  return (
    <>
      <div className="counter" style={{ padding: '8px 12px', background: 'white', borderBottom: '1px solid #dee2e6', width: '100%', position: 'relative' }}>
        {/* Mobile layout: Stack everything vertically */}
        <div className="d-block d-md-none">
          {/* Row 1: Counters */}
          <div className="d-flex justify-content-center gap-2 mb-2" style={{ flexWrap: 'wrap' }}>
            <div className="counter-item">
              <div className="d-flex align-items-center gap-1 px-2 py-1 rounded" style={{ background: '#f8f9fa', border: '1px solid #e9ecef', color: '#495057', fontSize: '0.7rem', fontWeight: 500, minWidth: 0 }}>
                <i className="fas fa-list-check" style={{ fontSize: '0.6rem', color: '#6c757d', flexShrink: 0 }}></i>
                <span style={{ whiteSpace: 'nowrap' }}>Gjenstående:</span>
                <span className="badge bg-primary text-white" style={{ fontSize: '0.6rem', fontWeight: 500, flexShrink: 0 }}>
                  {counterData.remaining}
                </span>
              </div>
            </div>
            <div className="counter-item">
              <div className="d-flex align-items-center gap-1 px-2 py-1 rounded" style={{ background: '#f8f9fa', border: '1px solid #e9ecef', color: '#495057', fontSize: '0.7rem', fontWeight: 500, minWidth: 0 }}>
                <i className="fas fa-check-circle" style={{ fontSize: '0.6rem', color: '#6c757d', flexShrink: 0 }}></i>
                <span style={{ whiteSpace: 'nowrap' }}>Utført:</span>
                <span className="badge bg-success text-white" style={{ fontSize: '0.6rem', fontWeight: 500, flexShrink: 0 }}>
                  {counterData.done}
                </span>
              </div>
            </div>
          </div>

          {/* Row 2: Fylke filter */}
          <div className="d-flex justify-content-center mb-2">
            <div className="counter-item">
              <div className="d-flex align-items-center gap-2 px-2 py-1 rounded" style={{ background: '#f8f9fa', border: '1px solid #e9ecef', color: '#495057', fontSize: '0.7rem', fontWeight: 500 }}>
                <i className="fas fa-map-marker-alt" style={{ fontSize: '0.6rem', color: '#6c757d' }}></i>
                <span>Fylke:</span>
                <select 
                  value={filterState.county} 
                  onChange={handleCountyChange}
                  className="form-select form-select-sm" 
                  style={{ fontSize: '0.65rem', minWidth: '100px', maxWidth: '140px', border: '1px solid #dee2e6', padding: '0.2rem 0.4rem' }}
                >
                  <option value="">Alle fylker</option>
                  {counties.map(county => (
                    <option key={county} value={county}>{county}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Row 3: Legend items - All items on one line */}
          <div className="d-flex justify-content-center mb-2" style={{ flexWrap: 'wrap', gap: '4px' }}>
            <div className="legend-item" style={{ display: 'flex !important', alignItems: 'center', gap: '2px', fontSize: '0.5rem', whiteSpace: 'nowrap', flex: '0 0 auto' }}>
              <div className="legend-icon">
                {createLegendIcon('red', 'fa-water')}
              </div>
              <span>Vann</span>
            </div>
            <div className="legend-item" style={{ display: 'flex !important', alignItems: 'center', gap: '2px', fontSize: '0.5rem', whiteSpace: 'nowrap', flex: '0 0 auto' }}>
              <div className="legend-icon">
                {createLegendIcon('green', 'fa-check')}
              </div>
              <span>Utført</span>
            </div>
            <div className="legend-item" style={{ display: 'flex !important', alignItems: 'center', gap: '2px', fontSize: '0.5rem', whiteSpace: 'nowrap', flex: '0 0 auto' }}>
              <div className="legend-icon">
                {createLegendIcon('blue', 'fa-helicopter-symbol')}
              </div>
              <span>LP</span>
            </div>
            <div className="legend-item" style={{ display: 'flex !important', alignItems: 'center', gap: '2px', fontSize: '0.5rem', whiteSpace: 'nowrap', flex: '0 0 auto' }}>
              <div className="legend-icon">
                {createLegendIcon('orange', 'fa-comment')}
              </div>
              <span>Info</span>
            </div>
          </div>

          {/* Row 4: Search and Connections buttons and user info */}
          <div className="d-flex justify-content-between align-items-center">
            <div className="d-flex gap-1">
              <button 
                className="btn btn-outline-primary btn-sm"
                style={{ 
                  fontSize: '0.65rem', 
                  padding: '0.2rem 0.4rem', 
                  whiteSpace: 'nowrap',
                  borderColor: '#007bff',
                  color: '#007bff'
                }}
                onClick={() => setShowSearchModal(true)}
                title="Søk i database"
              >
                <i className="fas fa-search" style={{ fontSize: '0.6rem' }}></i>
              </button>
              <button 
                className={`btn btn-outline-secondary btn-sm ${filterState.showConnections ? 'active' : ''}`}
              style={{ 
                fontSize: '0.65rem', 
                padding: '0.2rem 0.4rem', 
                whiteSpace: 'nowrap', 
                borderColor: '#dee2e6',
                backgroundColor: filterState.showConnections ? '#007bff' : 'transparent',
                color: filterState.showConnections ? 'white' : '#6c757d',
                opacity: isLoadingConnections ? 0.7 : 1,
                cursor: isLoadingConnections ? 'not-allowed' : 'pointer',
                borderRadius: '4px'
              }}
              onClick={handleConnectionsToggle}
              disabled={isLoadingConnections}
            >
              {isLoadingConnections ? (
                <>
                  <span className="spinner-border spinner-border-sm me-1" style={{ width: '0.5rem', height: '0.5rem' }}></span>
                  Laster...
                </>
              ) : (
                <>
                  <i className="fas fa-project-diagram me-1" style={{ fontSize: '0.6rem' }}></i> 
                  {filterState.showConnections ? 'Skjul' : 'Vis'} forbindelser
                </>
              )}
            </button>
            {onHideAll && (
              <button 
                className="btn btn-outline-danger btn-sm"
                style={{ 
                  fontSize: '0.65rem', 
                  padding: '0.2rem 0.4rem', 
                  whiteSpace: 'nowrap',
                  borderColor: '#dc3545',
                  color: '#dc3545'
                }}
                onClick={onHideAll}
                title="Skjul alt for fullskjerm kart"
              >
                <i className="fas fa-expand-arrows-alt" style={{ fontSize: '0.6rem' }}></i>
              </button>
            )}
            </div>

            {/* User authentication UI - mobile */}
            {user ? (
              <div className="user-info-mobile d-flex align-items-center gap-1">
                <div className="user-details d-flex align-items-center gap-1 px-2 py-1 rounded" style={{ background: 'rgba(255,255,255,0.1)', color: '#6c757d', fontSize: '0.65rem' }}>
                  <i className="fas fa-user-circle" style={{ fontSize: '12px' }}></i>
                  <span>{userPermissions.userRecord?.display_name || user.email?.split('@')[0]}</span>
                  {userPermissions.role && (
                    <span className={`badge ${getRoleBadgeClass(userPermissions.role)}`} style={{ fontSize: '0.55rem', marginLeft: '0.2rem' }}>
                      {userPermissions.role.charAt(0).toUpperCase()}
                    </span>
                  )}
                </div>
                <button 
                  className="btn btn-sm btn-outline-success" 
                  style={{ 
                    fontSize: '0.6rem', 
                    padding: '0.2rem 0.4rem', 
                    borderColor: '#28a745', 
                    color: '#28a745',
                    opacity: isExportingPDF ? 0.7 : 1,
                    cursor: isExportingPDF ? 'not-allowed' : 'pointer'
                  }}
                  title="PDF"
                  onClick={exportToPDF}
                  disabled={isExportingPDF}
                >
                  {isExportingPDF ? (
                    <span className="spinner-border spinner-border-sm" style={{ width: '0.5rem', height: '0.5rem' }}></span>
                  ) : (
                    <i className="fas fa-file-pdf"></i>
                  )}
                </button>
                {userPermissions.canViewLogs && (
                  <button
                    className="btn btn-sm btn-outline-info"
                    style={{ fontSize: '0.6rem', padding: '0.2rem 0.4rem', borderColor: '#17a2b8', color: '#17a2b8' }}
                    title="Vis brukerlogger"
                    onClick={showUserLogs}
                  >
                    <i className="fas fa-history"></i>
                  </button>
                )}
                {userPermissions.canEditMarkers && (
                  <Link href="/admin" className="btn btn-sm btn-outline-primary"
                    style={{ fontSize: '0.6rem', padding: '0.2rem 0.4rem', borderColor: '#007bff', color: '#007bff', textDecoration: 'none' }}
                    title="Admin Panel"
                  >
                    <i className="fas fa-cog"></i>
                  </Link>
                )}
                <button
                  className="btn btn-sm btn-outline-secondary"
                  style={{ fontSize: '0.6rem', padding: '0.2rem 0.4rem', borderColor: '#dee2e6', color: '#6c757d' }}
                  title="Logg ut"
                  onClick={handleLogout}
                >
                  <i className="fas fa-sign-out-alt"></i>
                </button>
              </div>
            ) : (
              <div className="user-info-mobile">
                <button 
                  className="btn btn-primary btn-sm" 
                  style={{ fontSize: '0.65rem', padding: '0.3rem 0.6rem' }}
                  onClick={() => setShowLoginModal(true)}
                >
                  <i className="fas fa-sign-in-alt me-1"></i>Logg inn
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Desktop layout: Original horizontal layout */}
        <div className="d-none d-md-flex counter-container" style={{ alignItems: 'center', justifyContent: 'space-between', gap: '16px', width: '100%', flexWrap: 'wrap' }}>
          <div className="counters d-flex gap-3" style={{ flexShrink: 0 }}>
            <div className="counter-item">
              <div className="d-flex align-items-center gap-2 px-2 py-1 rounded-2" style={{ background: '#f8f9fa', border: '1px solid #e9ecef', color: '#495057', fontSize: '0.75rem', fontWeight: 500 }}>
                <i className="fas fa-list-check" style={{ fontSize: '0.7rem', color: '#6c757d' }}></i>
                <span>Gjenstående:</span>
                <span className="badge bg-primary text-white" style={{ fontSize: '0.65rem', fontWeight: 500 }}>
                  {counterData.remaining}
                </span>
              </div>
            </div>
            <div className="counter-item">
              <div className="d-flex align-items-center gap-2 px-2 py-1 rounded-2" style={{ background: '#f8f9fa', border: '1px solid #e9ecef', color: '#495057', fontSize: '0.75rem', fontWeight: 500 }}>
                <i className="fas fa-check-circle" style={{ fontSize: '0.7rem', color: '#6c757d' }}></i>
                <span>Utført:</span>
                <span className="badge bg-success text-white" style={{ fontSize: '0.65rem', fontWeight: 500 }}>
                  {counterData.done}
                </span>
              </div>
            </div>
            <div className="counter-item">
              <div className="d-flex align-items-center gap-2 px-2 py-1 rounded-2" style={{ background: '#f8f9fa', border: '1px solid #e9ecef', color: '#495057', fontSize: '0.75rem', fontWeight: 500 }}>
                <i className="fas fa-map-marker-alt" style={{ fontSize: '0.7rem', color: '#6c757d' }}></i>
                <span>Fylke:</span>
                <select 
                  value={filterState.county} 
                  onChange={handleCountyChange}
                  className="form-select form-select-sm" 
                  style={{ fontSize: '0.7rem', minWidth: '120px', maxWidth: '150px', border: '1px solid #dee2e6' }}
                >
                  <option value="">Alle fylker</option>
                  {counties.map(county => (
                    <option key={county} value={county}>{county}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>
          <div className="legend" style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap', flex: 1, justifyContent: 'center' }}>
            <div className="legend-item" style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem' }}>
              <div className="legend-icon">
                {createLegendIcon('red', 'fa-water')}
              </div>
              <span>Vann</span>
            </div>
            <div className="legend-item" style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem' }}>
              <div className="legend-icon">
                {createLegendIcon('green', 'fa-check')}
              </div>
              <span>Utført</span>
            </div>
            <div className="legend-item" style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem' }}>
              <div className="legend-icon">
                {createLegendIcon('blue', 'fa-helicopter-symbol')}
              </div>
              <span>LP</span>
            </div>
            <div className="legend-item" style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem' }}>
              <div className="legend-icon">
                {createLegendIcon('orange', 'fa-comment')}
              </div>
              <span>Kommentar</span>
            </div>
            <div className="legend-item" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <button 
                className="btn btn-outline-primary btn-sm"
                style={{ 
                  fontSize: '0.7rem', 
                  padding: '0.25rem 0.5rem', 
                  whiteSpace: 'nowrap',
                  borderColor: '#007bff',
                  color: '#007bff'
                }}
                onClick={() => setShowSearchModal(true)}
                title="Søk i database"
              >
                <i className="fas fa-search me-1" style={{ fontSize: '0.65rem' }}></i>
                Søk
              </button>
              <button 
                className={`btn btn-outline-secondary btn-sm ${filterState.showConnections ? 'active' : ''}`}
                style={{ 
                  fontSize: '0.7rem', 
                  padding: '0.25rem 0.5rem', 
                  whiteSpace: 'nowrap', 
                  borderColor: '#dee2e6',
                  backgroundColor: filterState.showConnections ? '#007bff' : 'transparent',
                  color: filterState.showConnections ? 'white' : '#6c757d',
                  opacity: isLoadingConnections ? 0.7 : 1,
                  cursor: isLoadingConnections ? 'not-allowed' : 'pointer',
                  borderRadius: '4px'
                }}
                onClick={handleConnectionsToggle}
                disabled={isLoadingConnections}
              >
                {isLoadingConnections ? (
                  <>
                    <span className="spinner-border spinner-border-sm me-1" style={{ width: '0.6rem', height: '0.6rem' }}></span>
                    Laster...
                  </>
                ) : (
                  <>
                    <i className="fas fa-project-diagram me-1" style={{ fontSize: '0.65rem' }}></i> 
                    {filterState.showConnections ? 'Skjul forbindelser' : 'Vis forbindelser'}
                  </>
                )}
              </button>
              {onHideAll && (
                <button 
                  className="btn btn-outline-danger btn-sm"
                  style={{ 
                    fontSize: '0.7rem', 
                    padding: '0.25rem 0.5rem', 
                    whiteSpace: 'nowrap',
                    borderColor: '#dc3545',
                    color: '#dc3545'
                  }}
                  onClick={onHideAll}
                  title="Skjul alt for fullskjerm kart"
                >
                  <i className="fas fa-expand-arrows-alt me-1" style={{ fontSize: '0.65rem' }}></i>
                  Fullskjerm
                </button>
              )}
            </div>
            <div className="legend-item" style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.7rem', color: '#6c757d' }}>
              <i className="fas fa-info-circle" style={{ fontSize: '0.65rem' }}></i>
              <span>Høyreklikk for å legge til markør</span>
            </div>
          </div>

          {/* User authentication UI - desktop */}
          {user ? (
            <div className="user-info-top d-flex align-items-center gap-2" style={{ flexShrink: 0 }}>
              <div className="user-details d-flex align-items-center gap-2 px-2 py-1 rounded-2" style={{ background: 'rgba(255,255,255,0.1)', color: '#6c757d', fontSize: '0.75rem' }}>
                <i className="fas fa-user-circle" style={{ fontSize: '16px' }}></i>
                <span>{userPermissions.userRecord?.display_name || user.email?.split('@')[0]}</span>
                {userPermissions.role && (
                  <span className={`badge ${getRoleBadgeClass(userPermissions.role)}`} style={{ fontSize: '0.6rem', marginLeft: '0.25rem' }}>
                    {userPermissions.role.toUpperCase()}
                  </span>
                )}
              </div>
              <button 
                className="btn btn-sm btn-outline-success pdf-export-btn" 
                style={{ 
                  fontSize: '0.7rem', 
                  padding: '0.2rem 0.5rem', 
                  borderColor: '#28a745', 
                  color: '#28a745',
                  opacity: isExportingPDF ? 0.7 : 1,
                  cursor: isExportingPDF ? 'not-allowed' : 'pointer'
                }}
                title="Eksporter utførte lasteplasser til PDF"
                onClick={exportToPDF}
                disabled={isExportingPDF}
              >
                {isExportingPDF ? (
                  <span className="spinner-border spinner-border-sm" style={{ width: '0.6rem', height: '0.6rem' }}></span>
                ) : (
                  <i className="fas fa-file-pdf"></i>
                )}
              </button>
              {userPermissions.canViewLogs && (
                <button
                  className="btn btn-sm btn-outline-info logs-btn"
                  style={{ fontSize: '0.7rem', padding: '0.2rem 0.5rem', borderColor: '#17a2b8', color: '#17a2b8' }}
                  title="Vis brukerlogger"
                  onClick={showUserLogs}
                >
                  <i className="fas fa-history"></i>
                </button>
              )}
              {userPermissions.canEditMarkers && (
                <Link href="/admin" className="btn btn-sm btn-outline-primary"
                  style={{ fontSize: '0.7rem', padding: '0.2rem 0.5rem', borderColor: '#007bff', color: '#007bff', textDecoration: 'none' }}
                  title="Admin Panel"
                >
                  <i className="fas fa-cog"></i>
                </Link>
              )}
              <button
                className="btn btn-sm btn-outline-secondary logout-btn"
                style={{ fontSize: '0.7rem', padding: '0.2rem 0.5rem', borderColor: '#dee2e6', color: '#6c757d' }}
                title="Logg ut"
                onClick={handleLogout}
              >
                <i className="fas fa-sign-out-alt"></i>
              </button>
            </div>
          ) : (
            <div className="user-info-top d-flex align-items-center gap-2" style={{ flexShrink: 0 }}>
              <button 
                className="btn btn-primary btn-sm" 
                style={{ fontSize: '0.75rem', padding: '0.4rem 0.8rem' }}
                onClick={() => setShowLoginModal(true)}
              >
                <i className="fas fa-sign-in-alt me-1"></i>Logg inn
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Login Modal */}
      {showLoginModal && (
        <div className="modal show" style={{ display: 'block', backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div className="modal-dialog modal-sm">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">Logg inn</h5>
                <button 
                  type="button" 
                  className="btn-close"
                  onClick={() => setShowLoginModal(false)}
                ></button>
              </div>
              <div className="modal-body">
                <form onSubmit={handleLogin}>
                  {loginError && (
                    <div className="alert alert-danger" style={{ fontSize: '0.8rem' }}>
                      {loginError}
                    </div>
                  )}
                  
                  <div className="mb-3">
                    <label htmlFor="email" className="form-label" style={{ fontSize: '0.8rem' }}>
                      E-post
                    </label>
                    <input
                      type="email"
                      className="form-control form-control-sm"
                      id="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                    />
                  </div>
                  
                  <div className="mb-3">
                    <label htmlFor="password" className="form-label" style={{ fontSize: '0.8rem' }}>
                      Passord
                    </label>
                    <input
                      type="password"
                      className="form-control form-control-sm"
                      id="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                    />
                  </div>
                  
                  <div className="d-grid gap-2">
                    <button 
                      type="submit" 
                      className="btn btn-primary btn-sm"
                      disabled={isLoggingIn}
                    >
                      {isLoggingIn ? (
                        <>
                          <span className="spinner-border spinner-border-sm me-2" role="status"></span>
                          Logger inn...
                        </>
                      ) : (
                        'Logg inn'
                      )}
                    </button>
                    
                    <button 
                      type="button" 
                      className="btn btn-outline-secondary btn-sm"
                      onClick={() => setShowLoginModal(false)}
                    >
                      Avbryt
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* User Logs Modal */}
      <UserLogsModal 
        isOpen={showUserLogsModal}
        onClose={() => setShowUserLogsModal(false)}
      />

      {/* Search Modal */}
      <SearchModal
        isOpen={showSearchModal}
        onClose={() => setShowSearchModal(false)}
        onResultSelect={handleSearchResultSelect}
      />

      {/* Search Result Details Modal */}
      <SearchResultModal
        isOpen={showResultModal}
        onClose={() => setShowResultModal(false)}
        result={selectedSearchResult}
      />
    </>
  );
} 