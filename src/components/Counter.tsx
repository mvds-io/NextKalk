'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import { CounterData, FilterState, User, Airport, Landingsplass } from '@/types';
import { supabase, completeLogout } from '@/lib/supabase';
import { exportCompletedLandingsplassToPDF } from '@/lib/pdfExport';
import UserLogsModal from './UserLogsModal';
import VektseddelModal from './VektseddelModal';
import { SkeletonCounter } from './SkeletonLoader';
import SearchModal from './SearchModal';
import SearchResultModal from './SearchResultModal';
import { useTableNames } from '@/contexts/TableNamesContext';
import { getAppConfig } from '@/lib/tableNames';

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
  const [showVektseddelModal, setShowVektseddelModal] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [loginError, setLoginError] = useState('');
  const [resetSent, setResetSent] = useState(false);
  const [isSendingReset, setIsSendingReset] = useState(false);
  const [userPermissions, setUserPermissions] = useState<Record<string, boolean>>({});
  const [isExportingPDF, setIsExportingPDF] = useState(false);
  const [showSearchModal, setShowSearchModal] = useState(false);
  const [showResultModal, setShowResultModal] = useState(false);
  const [selectedSearchResult, setSelectedSearchResult] = useState<Airport | Landingsplass | null>(null);
  const [activeDatabase, setActiveDatabase] = useState<{ year: string; prefix: string } | null>(null);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [userMenuPos, setUserMenuPos] = useState<{ top: number; right: number }>({ top: 0, right: 0 });
  const userMenuRef = useRef<HTMLDivElement | null>(null);
  const userMenuTriggerEl = useRef<HTMLButtonElement | null>(null);

  const [showCountyMenu, setShowCountyMenu] = useState(false);
  const [countyMenuPos, setCountyMenuPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const countyMenuRef = useRef<HTMLDivElement | null>(null);
  const countyMenuTriggerEl = useRef<HTMLButtonElement | null>(null);

  const toggleUserMenu = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (showUserMenu) {
      setShowUserMenu(false);
      return;
    }
    const trigger = e.currentTarget;
    userMenuTriggerEl.current = trigger;
    const rect = trigger.getBoundingClientRect();
    setUserMenuPos({ top: rect.bottom + 4, right: window.innerWidth - rect.right });
    setShowUserMenu(true);
  };

  useEffect(() => {
    if (!showUserMenu) return;
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        userMenuRef.current && !userMenuRef.current.contains(target) &&
        userMenuTriggerEl.current && !userMenuTriggerEl.current.contains(target)
      ) {
        setShowUserMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showUserMenu]);

  const toggleCountyMenu = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (showCountyMenu) {
      setShowCountyMenu(false);
      return;
    }
    const trigger = e.currentTarget;
    countyMenuTriggerEl.current = trigger;
    const rect = trigger.getBoundingClientRect();
    setCountyMenuPos({ top: rect.bottom + 4, left: rect.left });
    setShowCountyMenu(true);
  };

  useEffect(() => {
    if (!showCountyMenu) return;
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        countyMenuRef.current && !countyMenuRef.current.contains(target) &&
        countyMenuTriggerEl.current && !countyMenuTriggerEl.current.contains(target)
      ) {
        setShowCountyMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showCountyMenu]);

  const toggleCounty = (county: string) => {
    const next = filterState.county.includes(county)
      ? filterState.county.filter(c => c !== county)
      : [...filterState.county, county];
    onFilterChange({ ...filterState, county: next });
  };

  const selectAllCounties = () => {
    onFilterChange({ ...filterState, county: [...counties] });
  };

  const clearCounties = () => {
    onFilterChange({ ...filterState, county: [] });
  };

  const countyLabel =
    filterState.county.length === 0 ? 'Alle fylker'
      : filterState.county.length === 1 ? filterState.county[0]
      : filterState.county.length === counties.length ? 'Alle fylker'
      : `${filterState.county.length} fylker`;

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

  // Load active database configuration
  useEffect(() => {
    const loadActiveDatabase = async () => {
      const config = await getAppConfig();
      if (config) {
        setActiveDatabase({
          year: config.active_year,
          prefix: config.active_prefix
        });
      } else {
        // Default to 'current' if no config found
        setActiveDatabase({
          year: 'current',
          prefix: ''
        });
      }
    };
    loadActiveDatabase();
  }, []);

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

  const handleForgotPassword = async () => {
    setLoginError('');
    if (!email) {
      setLoginError('Skriv inn e-postadressen din først.');
      return;
    }
    setIsSendingReset(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth/reset-password`,
      });
      if (error) throw error;
      setResetSent(true);
    } catch (error: unknown) {
      setLoginError(error instanceof Error ? error.message : 'Kunne ikke sende e-post');
    } finally {
      setIsSendingReset(false);
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
        {/* Mobile layout: 2 compact rows + overflow menu */}
        <div className="d-block d-md-none">
          {/* Row 1: counter pills + Fylke + user/menu */}
          <div className="d-flex justify-content-between align-items-center mb-2 gap-2" style={{ flexWrap: 'nowrap' }}>
            <div className="d-flex align-items-center gap-1" style={{ flexWrap: 'nowrap', minWidth: 0 }}>
              <div className="d-flex align-items-center gap-1 px-2 py-1 rounded" style={{ background: '#f8f9fa', border: '1px solid #e9ecef', color: '#495057', fontSize: '0.7rem', fontWeight: 500, flexShrink: 0 }} title="Gjenstående">
                <i className="fas fa-list-check" style={{ fontSize: '0.6rem', color: '#6c757d' }}></i>
                <span className="badge bg-primary text-white" style={{ fontSize: '0.6rem', fontWeight: 500 }}>{counterData.remaining}</span>
              </div>
              <div className="d-flex align-items-center gap-1 px-2 py-1 rounded" style={{ background: '#f8f9fa', border: '1px solid #e9ecef', color: '#495057', fontSize: '0.7rem', fontWeight: 500, flexShrink: 0 }} title="Utført">
                <i className="fas fa-check-circle" style={{ fontSize: '0.6rem', color: '#6c757d' }}></i>
                <span className="badge bg-success text-white" style={{ fontSize: '0.6rem', fontWeight: 500 }}>{counterData.done}</span>
              </div>
              <button
                type="button"
                onClick={toggleCountyMenu}
                aria-expanded={showCountyMenu}
                className="d-flex align-items-center gap-1 px-2 py-1 rounded"
                style={{ background: '#f8f9fa', border: '1px solid #e9ecef', color: '#495057', fontSize: '0.7rem', fontWeight: 500, minWidth: 0, cursor: 'pointer' }}
              >
                <i className="fas fa-map-marker-alt" style={{ fontSize: '0.6rem', color: '#6c757d', flexShrink: 0 }}></i>
                <span className="text-truncate" style={{ maxWidth: '110px' }}>{countyLabel}</span>
                <i className="fas fa-caret-down" style={{ fontSize: '0.6rem', color: '#6c757d', flexShrink: 0 }}></i>
              </button>
            </div>

            {user ? (
              <div className="d-flex align-items-center gap-1" style={{ flexShrink: 0 }}>
                <div className="d-flex align-items-center gap-1 px-2 py-1 rounded" style={{ background: 'rgba(255,255,255,0.1)', color: '#6c757d', fontSize: '0.65rem', maxWidth: '90px' }}>
                  <i className="fas fa-user-circle" style={{ fontSize: '12px', flexShrink: 0 }}></i>
                  <span className="text-truncate">{userPermissions.userRecord?.display_name || user.email?.split('@')[0]}</span>
                  {userPermissions.role && (
                    <span className={`badge ${getRoleBadgeClass(userPermissions.role)}`} style={{ fontSize: '0.55rem', flexShrink: 0 }}>
                      {userPermissions.role.charAt(0).toUpperCase()}
                    </span>
                  )}
                </div>
                <button
                  className="btn btn-sm btn-outline-secondary"
                  style={{ fontSize: '0.7rem', padding: '0.2rem 0.5rem', borderColor: '#dee2e6', color: '#6c757d' }}
                  title="Mer"
                  onClick={toggleUserMenu}
                  aria-expanded={showUserMenu}
                >
                  <i className="fas fa-ellipsis-v"></i>
                </button>
              </div>
            ) : (
              <button
                className="btn btn-primary btn-sm"
                style={{ fontSize: '0.65rem', padding: '0.3rem 0.6rem', flexShrink: 0 }}
                onClick={() => setShowLoginModal(true)}
              >
                <i className="fas fa-sign-in-alt me-1"></i>Logg inn
              </button>
            )}
          </div>

          {/* Row 2: Tonnage progress + action buttons */}
          <div className="d-flex align-items-center gap-2" style={{ flexWrap: 'nowrap' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', padding: '4px 8px', background: '#f8f9fa', borderRadius: '6px', border: '1px solid #e9ecef', minWidth: 0, flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '6px' }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px', minWidth: 0 }}>
                  <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#212529' }}>
                    {counterData.totalTonn.toLocaleString('nb-NO', { maximumFractionDigits: 0 })}t
                  </span>
                  {counterData.totalTonn > 0 && (
                    <span style={{ fontSize: '0.6rem', color: '#2AAD27', fontWeight: 600 }}>
                      · {Math.round((counterData.doneTonn / counterData.totalTonn) * 100)}%
                    </span>
                  )}
                </div>
                <span style={{ fontSize: '0.6rem', color: '#6c757d', whiteSpace: 'nowrap' }}>
                  {counterData.doneTonn.toLocaleString('nb-NO', { maximumFractionDigits: 0 })}t fullført
                </span>
              </div>
              {counterData.totalTonn > 0 && (
                <div
                  role="progressbar"
                  aria-valuenow={Math.round((counterData.doneTonn / counterData.totalTonn) * 100)}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  style={{ height: 3, width: '100%', background: '#e9ecef', borderRadius: 999, overflow: 'hidden' }}
                >
                  <div
                    style={{
                      width: `${Math.min(100, (counterData.doneTonn / counterData.totalTonn) * 100)}%`,
                      height: '100%',
                      background: '#2AAD27',
                      borderRadius: 999,
                      transition: 'width 300ms ease',
                    }}
                  />
                </div>
              )}
            </div>

            <div className="d-flex gap-1" style={{ flexShrink: 0 }}>
              <button
                className="btn btn-outline-primary btn-sm"
                style={{ fontSize: '0.65rem', padding: '0.2rem 0.5rem', borderColor: '#007bff', color: '#007bff' }}
                onClick={() => setShowSearchModal(true)}
                title="Søk i database"
              >
                <i className="fas fa-search"></i>
              </button>
              <button
                className={`btn btn-outline-secondary btn-sm ${filterState.showConnections ? 'active' : ''}`}
                style={{
                  fontSize: '0.65rem',
                  padding: '0.2rem 0.5rem',
                  borderColor: '#dee2e6',
                  backgroundColor: filterState.showConnections ? '#007bff' : 'transparent',
                  color: filterState.showConnections ? 'white' : '#6c757d',
                  opacity: isLoadingConnections ? 0.7 : 1,
                  cursor: isLoadingConnections ? 'not-allowed' : 'pointer',
                }}
                onClick={handleConnectionsToggle}
                disabled={isLoadingConnections}
                title={filterState.showConnections ? 'Skjul forbindelser' : 'Vis forbindelser'}
              >
                {isLoadingConnections ? (
                  <span className="spinner-border spinner-border-sm" style={{ width: '0.6rem', height: '0.6rem' }}></span>
                ) : (
                  <i className="fas fa-project-diagram"></i>
                )}
              </button>
              {onHideAll && (
                <button
                  className="btn btn-outline-danger btn-sm"
                  style={{ fontSize: '0.65rem', padding: '0.2rem 0.5rem', borderColor: '#dc3545', color: '#dc3545' }}
                  onClick={onHideAll}
                  title="Skjul alt for fullskjerm kart"
                >
                  <i className="fas fa-expand-arrows-alt"></i>
                </button>
              )}
            </div>
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
              <button
                type="button"
                onClick={toggleCountyMenu}
                aria-expanded={showCountyMenu}
                className="d-flex align-items-center gap-2 px-2 py-1 rounded-2"
                style={{ background: '#f8f9fa', border: '1px solid #e9ecef', color: '#495057', fontSize: '0.75rem', fontWeight: 500, cursor: 'pointer' }}
              >
                <i className="fas fa-map-marker-alt" style={{ fontSize: '0.7rem', color: '#6c757d' }}></i>
                <span>Fylke:</span>
                <span className="text-truncate" style={{ maxWidth: '150px' }}>{countyLabel}</span>
                <i className="fas fa-caret-down" style={{ fontSize: '0.7rem', color: '#6c757d' }}></i>
              </button>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '24px', flex: 1, justifyContent: 'center' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', padding: '6px 16px', background: '#f8f9fa', borderRadius: '6px', border: '1px solid #e9ecef', minWidth: '240px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.15 }}>
                  <span style={{ fontSize: '0.7rem', color: '#6c757d', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 500 }}>Totalt i år</span>
                  <span style={{ fontSize: '1rem', fontWeight: 700, color: '#212529' }}>
                    {counterData.totalTonn.toLocaleString('nb-NO', { maximumFractionDigits: 0 })}
                    <span style={{ fontSize: '0.75rem', color: '#6c757d', fontWeight: 500, marginLeft: '3px' }}>t</span>
                  </span>
                </div>
                <div style={{ width: 1, height: 28, background: '#dee2e6' }} />
                <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.15 }}>
                  <span style={{ fontSize: '0.7rem', color: '#6c757d', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 500 }}>Fullført</span>
                  <span style={{ fontSize: '1rem', fontWeight: 700, color: '#2AAD27' }}>
                    {counterData.doneTonn.toLocaleString('nb-NO', { maximumFractionDigits: 0 })}
                    <span style={{ fontSize: '0.75rem', color: '#6c757d', fontWeight: 500, marginLeft: '3px' }}>t</span>
                    {counterData.totalTonn > 0 && (
                      <span style={{ fontSize: '0.75rem', color: '#6c757d', fontWeight: 500, marginLeft: '6px' }}>
                        · {Math.round((counterData.doneTonn / counterData.totalTonn) * 100)}%
                      </span>
                    )}
                  </span>
                </div>
              </div>
              {counterData.totalTonn > 0 && (
                <div
                  role="progressbar"
                  aria-valuenow={Math.round((counterData.doneTonn / counterData.totalTonn) * 100)}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  title={`${counterData.doneTonn.toLocaleString('nb-NO', { maximumFractionDigits: 0 })}t av ${counterData.totalTonn.toLocaleString('nb-NO', { maximumFractionDigits: 0 })}t fullført`}
                  style={{ height: 4, width: '100%', background: '#e9ecef', borderRadius: 999, overflow: 'hidden' }}
                >
                  <div
                    style={{
                      width: `${Math.min(100, (counterData.doneTonn / counterData.totalTonn) * 100)}%`,
                      height: '100%',
                      background: '#2AAD27',
                      borderRadius: 999,
                      transition: 'width 300ms ease',
                    }}
                  />
                </div>
              )}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
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
                className="btn btn-sm btn-outline-secondary"
                style={{ fontSize: '0.75rem', padding: '0.25rem 0.55rem', borderColor: '#dee2e6', color: '#6c757d' }}
                title="Mer"
                onClick={toggleUserMenu}
                aria-expanded={showUserMenu}
              >
                <i className="fas fa-ellipsis-v"></i>
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

        {/* Shared county multi-select dropdown (mobile + desktop) */}
        {showCountyMenu && (
          <div ref={countyMenuRef} style={{ position: 'fixed', top: countyMenuPos.top, left: countyMenuPos.left, background: 'white', border: '1px solid #dee2e6', borderRadius: '6px', boxShadow: '0 4px 12px rgba(0,0,0,0.15)', zIndex: 2000, minWidth: '180px', maxHeight: '60vh', overflowY: 'auto', padding: '4px 0' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 12px', borderBottom: '1px solid #f1f3f5', gap: '8px' }}>
              <button
                type="button"
                onClick={selectAllCounties}
                style={{ background: 'transparent', border: 'none', color: '#007bff', fontSize: '0.7rem', fontWeight: 500, padding: 0, cursor: 'pointer' }}
                disabled={filterState.county.length === counties.length}
              >
                Velg alle
              </button>
              <button
                type="button"
                onClick={clearCounties}
                style={{ background: 'transparent', border: 'none', color: '#6c757d', fontSize: '0.7rem', fontWeight: 500, padding: 0, cursor: 'pointer' }}
                disabled={filterState.county.length === 0}
              >
                Fjern alle
              </button>
            </div>
            {counties.map(county => {
              const checked = filterState.county.includes(county);
              return (
                <label
                  key={county}
                  style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 12px', fontSize: '0.75rem', color: '#212529', cursor: 'pointer', userSelect: 'none' }}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleCounty(county)}
                    style={{ cursor: 'pointer' }}
                  />
                  {county}
                </label>
              );
            })}
          </div>
        )}

        {/* Shared user menu dropdown (mobile + desktop) */}
        {showUserMenu && user && (
          <div ref={userMenuRef} style={{ position: 'fixed', top: userMenuPos.top, right: userMenuPos.right, background: 'white', border: '1px solid #dee2e6', borderRadius: '6px', boxShadow: '0 4px 12px rgba(0,0,0,0.15)', zIndex: 2000, minWidth: '180px', padding: '4px 0' }}>
            {activeDatabase && (
              <div style={{ padding: '6px 12px', fontSize: '0.65rem', color: '#6c757d', borderBottom: '1px solid #f1f3f5' }}>
                <i className="fas fa-database me-2"></i>
                {activeDatabase.year === 'current' ? 'Current' : `${activeDatabase.year}${activeDatabase.prefix ? `-${activeDatabase.prefix}` : ''}`}
              </div>
            )}
            <button
              onClick={() => { exportToPDF(); setShowUserMenu(false); }}
              disabled={isExportingPDF}
              style={{ display: 'flex', alignItems: 'center', width: '100%', padding: '8px 12px', fontSize: '0.75rem', background: 'transparent', border: 'none', textAlign: 'left', color: '#212529', cursor: isExportingPDF ? 'not-allowed' : 'pointer', opacity: isExportingPDF ? 0.6 : 1 }}
            >
              {isExportingPDF ? (
                <span className="spinner-border spinner-border-sm me-2" style={{ width: '0.7rem', height: '0.7rem' }}></span>
              ) : (
                <i className="fas fa-file-pdf me-2" style={{ color: '#28a745', width: '14px' }}></i>
              )}
              PDF eksport
            </button>
            {userPermissions.canEditMarkers && (
              <button
                onClick={() => { setShowVektseddelModal(true); setShowUserMenu(false); }}
                style={{ display: 'flex', alignItems: 'center', width: '100%', padding: '8px 12px', fontSize: '0.75rem', background: 'transparent', border: 'none', textAlign: 'left', color: '#212529', cursor: 'pointer' }}
              >
                <i className="fas fa-scale-balanced me-2" style={{ color: '#d48806', width: '14px' }}></i>
                Vektseddel
              </button>
            )}
            {userPermissions.canViewLogs && (
              <button
                onClick={() => { showUserLogs(); setShowUserMenu(false); }}
                style={{ display: 'flex', alignItems: 'center', width: '100%', padding: '8px 12px', fontSize: '0.75rem', background: 'transparent', border: 'none', textAlign: 'left', color: '#212529', cursor: 'pointer' }}
              >
                <i className="fas fa-history me-2" style={{ color: '#17a2b8', width: '14px' }}></i>
                Logger
              </button>
            )}
            {userPermissions.canEditMarkers && (
              <Link
                href="/admin"
                onClick={() => setShowUserMenu(false)}
                style={{ display: 'flex', alignItems: 'center', width: '100%', padding: '8px 12px', fontSize: '0.75rem', color: '#212529', textDecoration: 'none' }}
              >
                <i className="fas fa-cog me-2" style={{ color: '#007bff', width: '14px' }}></i>
                Admin
              </Link>
            )}
            <button
              onClick={() => { handleLogout(); setShowUserMenu(false); }}
              style={{ display: 'flex', alignItems: 'center', width: '100%', padding: '8px 12px', fontSize: '0.75rem', background: 'transparent', border: 'none', textAlign: 'left', color: '#212529', cursor: 'pointer', borderTop: '1px solid #f1f3f5' }}
            >
              <i className="fas fa-sign-out-alt me-2" style={{ color: '#6c757d', width: '14px' }}></i>
              Logg ut
            </button>
          </div>
        )}
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
                  onClick={() => { setShowLoginModal(false); setResetSent(false); setLoginError(''); }}
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
                      onClick={() => { setShowLoginModal(false); setResetSent(false); setLoginError(''); }}
                    >
                      Avbryt
                    </button>
                  </div>

                  <div className="text-center mt-3">
                    {resetSent ? (
                      <span className="text-success" style={{ fontSize: '0.75rem' }}>
                        E-post sendt. Sjekk innboksen din.
                      </span>
                    ) : (
                      <button
                        type="button"
                        className="btn btn-link btn-sm p-0"
                        style={{ fontSize: '0.75rem' }}
                        onClick={handleForgotPassword}
                        disabled={isSendingReset}
                      >
                        {isSendingReset ? 'Sender…' : 'Glemt passord?'}
                      </button>
                    )}
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

      {/* Vektseddelkontroll Modal */}
      <VektseddelModal
        isOpen={showVektseddelModal}
        onClose={() => setShowVektseddelModal(false)}
        user={user ?? null}
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