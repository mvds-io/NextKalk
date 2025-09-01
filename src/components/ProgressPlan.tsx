'use client';

import { useState, useEffect, useCallback } from 'react';
import { Landingsplass, User } from '@/types';
import { supabase } from '@/lib/supabase';

interface ProgressPlanProps {
  landingsplasser: Landingsplass[];
  filterState: { county: string; showConnections: boolean };
  user: User | null;
  onDataUpdate?: () => void;
  isLoading?: boolean;
  isMobile?: boolean;
  onMobileToggle?: () => void;
  isMinimized?: boolean;
  onToggleMinimized?: () => void;
}

interface Association {
  id: number;
  name: string;
  tonn: number;
}

interface ContactPerson {
  kontaktperson: string;
  forening: string;
  phone: string;
  totalTonn: number;
}

export default function ProgressPlan({ 
  landingsplasser, 
  filterState,
  user, 
  onDataUpdate: _onDataUpdate,
  isLoading = false,
  isMobile = false,
  onMobileToggle,
  isMinimized = false,
  onToggleMinimized
}: ProgressPlanProps) {
  
  const [associations, setAssociations] = useState<Record<number, Association[]>>({});
  const [expandedComments, setExpandedComments] = useState<Set<number>>(new Set());
  const [associationsAvailable, setAssociationsAvailable] = useState<boolean | null>(null);
  const [internalIsMobile, setInternalIsMobile] = useState(false);
  const [contactPersons, setContactPersons] = useState<Record<number, ContactPerson[]>>({});
  const [isContactPersonsLoading, setIsContactPersonsLoading] = useState<Record<number, boolean>>({});

  // Internal mobile detection as fallback
  useEffect(() => {
    const checkMobile = () => {
      if (typeof window !== 'undefined') {
        const isMobileScreen = window.innerWidth <= 900;
        setInternalIsMobile(isMobileScreen);
      }
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, [isMobile, onToggleMinimized]);

  // Filter landingsplasser by county like original
  let filteredLandingsplasser = landingsplasser;
  if (filterState.county) {
    filteredLandingsplasser = landingsplasser.filter(lp => lp.fylke === filterState.county);
  }

  // Sort by priority first (lower number = higher priority), then by lp as secondary sort
  const sortedLandingsplasser = [...filteredLandingsplasser].sort((a, b) => {
    // Primary sort: priority (ascending - lower numbers first)
    const aPriority = a.priority || 999; // Default high priority number if null
    const bPriority = b.priority || 999;
    if (aPriority !== bPriority) {
      return aPriority - bPriority;
    }
    
    // Secondary sort: lp (try numeric, fallback to string)
    const aNum = parseFloat(a.lp || '0');
    const bNum = parseFloat(b.lp || '0');
    if (!isNaN(aNum) && !isNaN(bNum)) return aNum - bNum;
    return String(a.lp || '').localeCompare(String(b.lp || ''));
  });

  // Load associations for all landingsplasser
  useEffect(() => {
    const loadAssociations = async () => {
      if (sortedLandingsplasser.length === 0) {
        setAssociations({});
        setAssociationsAvailable(true);
        return;
      }

      const landingsplassIds = sortedLandingsplasser.map(lp => lp.id);
      
      try {
        // First try a simple query without joins to test basic access
        const { error: testError } = await supabase
          .from('vass_associations')
          .select('landingsplass_id, airport_id')
          .limit(1);

        if (testError) {
          console.warn('❌ Basic table access failed:', testError.message);
          console.warn('This suggests Row Level Security (RLS) policies are blocking access');
          console.warn('Solution: Check RLS policies in Supabase for vass_associations table');
          console.warn('Continuing without associations to prevent infinite loop...');
          setAssociations({});
          setAssociationsAvailable(false);
          return;
        }


        // Use the same foreign key join approach as the map popup
        const { data: associations, error: associationsError } = await supabase
          .from('vass_associations')
          .select(`
            landingsplass_id,
            airport_id,
            vass_vann:airport_id (
              id, name, tonn
            )
          `)
          .in('landingsplass_id', landingsplassIds);

        if (associationsError) {
          console.warn('❌ Associations query failed:', associationsError.message);
          setAssociations({});
          setAssociationsAvailable(false);
          return;
        }

        // Process the data with foreign key relationship
        const associationsMap: Record<number, Association[]> = {};
        
        (associations || []).forEach((assoc: any) => {
          const water = assoc.vass_vann;
          if (water) {
            if (!associationsMap[assoc.landingsplass_id]) {
              associationsMap[assoc.landingsplass_id] = [];
            }
            associationsMap[assoc.landingsplass_id].push({
              id: water.id,
              name: water.name,
              tonn: water.tonn
            });
          }
        });

        setAssociations(associationsMap);
        setAssociationsAvailable(true);

      } catch (error: any) {
        console.error('❌ Unexpected error loading associations:', error);
        console.error('Error details:', {
          message: error.message,
          code: error.code,
          details: error.details,
          hint: error.hint
        });
        setAssociations({});
        setAssociationsAvailable(false);
      }
    };

    // Only run this once when component mounts, or when landingsplasser count changes significantly
    if (sortedLandingsplasser.length > 0) {
      loadAssociations();
    }
  }, [sortedLandingsplasser.length]); // Only depend on the length, not the entire array

  // Load contact persons for a specific landingsplass
  const loadContactPersonsForLandingsplass = useCallback(async (landingsplassId: number) => {
    setIsContactPersonsLoading(prev => ({ ...prev, [landingsplassId]: true }));
    
    try {
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

      // Extract and deduplicate contact persons, summing tonnage
      const contactPersonsMap = new Map();
      (associations || []).forEach((assoc: any) => {
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
              totalTonn: 0
            });
          }
          
          // Add tonnage to the contact person
          const contact = contactPersonsMap.get(key);
          if (tonn && tonn !== 'N/A' && !isNaN(parseFloat(tonn))) {
            contact.totalTonn += parseFloat(tonn);
          }
        }
      });

      const contactPersonsList = Array.from(contactPersonsMap.values()).sort((a, b) => {
        // Sort by totalTonn descending, then by name
        if (b.totalTonn !== a.totalTonn) return b.totalTonn - a.totalTonn;
        return (a.kontaktperson || '').localeCompare(b.kontaktperson || '');
      });

      setContactPersons(prev => ({ ...prev, [landingsplassId]: contactPersonsList }));
    } catch (error) {
      console.error('Error loading contact persons for landingsplass:', landingsplassId, error);
      setContactPersons(prev => ({ ...prev, [landingsplassId]: [] }));
    } finally {
      setIsContactPersonsLoading(prev => ({ ...prev, [landingsplassId]: false }));
    }
  }, []);

  // Load contact persons for all visible landingsplasser
  useEffect(() => {
    sortedLandingsplasser.forEach(lp => {
      if (!contactPersons[lp.id] && !isContactPersonsLoading[lp.id]) {
        loadContactPersonsForLandingsplass(lp.id);
      }
    });
  }, [sortedLandingsplasser.length, loadContactPersonsForLandingsplass]);

  // Auto-scroll to first incomplete landingsplass after all data is loaded
  useEffect(() => {
    if (sortedLandingsplasser.length === 0 || isMinimized) return;

    // Check if all data loading is complete
    const allAssociationsLoaded = associationsAvailable !== null;
    const contactPersonsLoadingCount = Object.values(isContactPersonsLoading).filter(Boolean).length;
    const allContactPersonsLoaded = contactPersonsLoadingCount === 0;
    
    // Only proceed if all data is loaded
    if (!allAssociationsLoaded || !allContactPersonsLoaded) {
      return;
    }

    // Wait a bit for the DOM to settle after data loading
    const scrollTimeout = setTimeout(() => {
      // Find the first incomplete landingsplass
      const firstIncomplete = sortedLandingsplasser.find(lp => !lp.done);
      
      if (firstIncomplete) {
        // Find the card element by looking for a unique identifier
        const cardElement = document.querySelector(`[data-landingsplass-id="${firstIncomplete.id}"]`);
        
        if (cardElement) {
          // Find the ProgressPlan content container (which is now scrollable)
          const scrollContainer = cardElement.closest('.fremdriftsplan-content') as HTMLElement;
          
          if (scrollContainer) {
            // Calculate scroll position to show the card at the very top
            const cardOffsetTop = (cardElement as HTMLElement).offsetTop;
            
            // Get the actual header height
            const headerElement = scrollContainer.querySelector('.fremdriftsplan-header') as HTMLElement;
            const headerHeight = headerElement ? headerElement.offsetHeight : 50;
            
            // Add a small padding (8px) to ensure the card is fully visible
            const padding = 8;
            const targetScrollTop = cardOffsetTop - headerHeight - padding;
            
            scrollContainer.scrollTo({
              top: Math.max(0, targetScrollTop),
              behavior: 'smooth'
            });
          }
        }
      }
    }, 500); // Reduced wait time since data is already loaded

    return () => clearTimeout(scrollTimeout);
  }, [
    sortedLandingsplasser, 
    filterState.county, 
    isMinimized, 
    associationsAvailable, 
    isContactPersonsLoading // This will trigger when contact persons finish loading
  ]);


  const handleZoomToLandingsplass = (landingsplassId: number) => {
    // Find the landingsplass in the data
    const landingsplass = sortedLandingsplasser.find(lp => lp.id === landingsplassId);
    
    if (!landingsplass || !landingsplass.latitude || !landingsplass.longitude) {
      console.error('❌ No landingsplass found or missing coordinates for ID:', landingsplassId);
      return;
    }

    // Get the global map instance
    const mapElement = document.querySelector('#map');
    if (!mapElement) {
      console.error('❌ Map element not found');
      return;
    }

    // Access the Leaflet map through the global window object
    const L = (window as any).L;
    if (!L) {
      console.error('❌ Leaflet not loaded');
      return;
    }

    // Try to find the map instance - it should be available globally
    let map = null;
    
    // Check if the map is available in the MapContainer component
    if ((window as Record<string, unknown>).leafletMapInstance) {
      map = (window as Record<string, unknown>).leafletMapInstance as Record<string, unknown>;
    }
    
    if (map) {
      console.log('✅ Zooming to landingsplass:', landingsplass.kode, 'at', [landingsplass.latitude, landingsplass.longitude]);
      (map as Record<string, unknown>).setView([landingsplass.latitude, landingsplass.longitude], 12);
      
      // Try to find and open the popup for this marker
      (map as Record<string, unknown>).eachLayer((layer: Record<string, unknown>) => {
        if (layer.getLatLng && layer.bindPopup) {
          const latlng = (layer.getLatLng as () => Record<string, number>)();
          if (Math.abs(latlng.lat - landingsplass.latitude) < 0.0001 && 
              Math.abs(latlng.lng - landingsplass.longitude) < 0.0001) {
            (layer.openPopup as () => void)();
          }
        }
      });
    } else {
      console.error('❌ Map instance not found. Make sure the map is initialized.');
    }
  };

  const handleVektseddel = (landingsplassId: number) => {
    // Placeholder for vektseddel functionality
    console.log('Show vektseddel for landingsplass:', landingsplassId);
  };

  const toggleComment = (landingsplassId: number) => {
    setExpandedComments(prev => {
      const newSet = new Set(prev);
      if (newSet.has(landingsplassId)) {
        newSet.delete(landingsplassId);
      } else {
        newSet.add(landingsplassId);
      }
      return newSet;
    });
  };

  const getPriorityBadgeClass = (priority?: number) => {
    if (!priority) return '';
    if (priority <= 1) return 'bg-danger';
    if (priority <= 2) return 'bg-warning';
    return 'bg-secondary';
  };

  const getPriorityColor = (priority?: number, isDone: boolean = false) => {
    if (isDone) return '#28a745';
    if (!priority) return '#667eea';
    if (priority <= 1) return '#dc3545';
    if (priority <= 2) return '#ffc107';
    return '#667eea';
  };

  if (isLoading) {
    return (
      <div className="fremdriftsplan-content" style={{ position: 'relative', zIndex: 0 }}>
        {/* Header integrated into content */}
        <div className="fremdriftsplan-header d-flex justify-content-between align-items-center" style={{ 
          padding: (isMobile || internalIsMobile) ? '0.05rem 0.5rem' : '8px 16px 4px 16px',
          borderBottom: (isMobile || internalIsMobile) ? '1px solid #dee2e6' : 'none', 
 
          background: '#f8f9fa',
          marginTop: '0',
          marginRight: '0',
          marginLeft: '0',
          marginBottom: '8px',
          position: 'relative',
          zIndex: 1,
          minHeight: (isMobile || internalIsMobile) ? '28px' : 'auto',
          maxHeight: (isMobile || internalIsMobile) ? '28px' : 'none',
          height: (isMobile || internalIsMobile) ? '28px' : 'auto'
        }}>
          <h4 className="mb-0" style={{ 
            fontSize: (isMobile || internalIsMobile) ? '0.85rem' : '1.1rem', 
            lineHeight: (isMobile || internalIsMobile) ? '1' : '1.2',
            marginTop: '0',
          marginRight: '0',
          marginLeft: '0',
          marginBottom: '8px',
          position: 'relative',
          zIndex: 1,
            padding: '0'
          }}>Fremdriftsplan</h4>
          <div className="d-flex gap-1">
            {onMobileToggle && (
              <button 
                className="btn btn-sm btn-outline-secondary d-lg-none"
                style={{ 
                  fontSize: '0.55rem', 
                  padding: '0.05rem 0.2rem',
                  borderColor: '#dee2e6',
                  color: '#6c757d',
                  lineHeight: '1',
                  height: '20px',
                  width: '24px'
                }}
                onClick={onMobileToggle}
                title="Skjul/vis paneler"
              >
                <i className="fas fa-eye-slash"></i>
              </button>
            )}
          </div>
        </div>
        <div className="loading-overlay" style={{ position: 'relative', minHeight: '200px', backgroundColor: 'transparent' }}>
          <div style={{ textAlign: 'center' }}>
            <div className="loading-spinner"></div>
            <div className="loading-text">Loading landingsplasser...</div>
          </div>
        </div>
      </div>
    );
  }

  if (sortedLandingsplasser.length === 0) {
    return (
      <div className="fremdriftsplan-content" style={{ position: 'relative', zIndex: 0 }}>
        {/* Header integrated into content */}
        <div className="fremdriftsplan-header d-flex justify-content-between align-items-center" style={{ 
          padding: (isMobile || internalIsMobile) ? '0.05rem 0.5rem' : '8px 16px 4px 16px',
          borderBottom: (isMobile || internalIsMobile) ? '1px solid #dee2e6' : 'none', 
 
          background: '#f8f9fa',
          marginTop: '0',
          marginRight: '0',
          marginLeft: '0',
          marginBottom: '8px',
          position: 'relative',
          zIndex: 1,
          minHeight: (isMobile || internalIsMobile) ? '28px' : 'auto',
          maxHeight: (isMobile || internalIsMobile) ? '28px' : 'none',
          height: (isMobile || internalIsMobile) ? '28px' : 'auto'
        }}>
          <h4 className="mb-0" style={{ 
            fontSize: (isMobile || internalIsMobile) ? '0.85rem' : '1.1rem', 
            lineHeight: (isMobile || internalIsMobile) ? '1' : '1.2',
            marginTop: '0',
          marginRight: '0',
          marginLeft: '0',
          marginBottom: '8px',
          position: 'relative',
          zIndex: 1,
            padding: '0'
          }}>Fremdriftsplan</h4>
          <div className="d-flex gap-1">
            {onMobileToggle && (
              <button 
                className="btn btn-sm btn-outline-secondary d-lg-none"
                style={{ 
                  fontSize: '0.55rem', 
                  padding: '0.05rem 0.2rem',
                  borderColor: '#dee2e6',
                  color: '#6c757d',
                  lineHeight: '1',
                  height: '20px',
                  width: '24px'
                }}
                onClick={onMobileToggle}
                title="Skjul/vis paneler"
              >
                <i className="fas fa-eye-slash"></i>
              </button>
            )}
          </div>
        </div>
        <div className="text-center py-4 text-muted">
          <i className="fas fa-helicopter-symbol fa-2x mb-2"></i>
          <p>Ingen landingsplasser funnet</p>
          {filterState.county && (
            <small>Prøv å endre fylkesfilter</small>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={`fremdriftsplan-content ${isMinimized && !isMobile ? 'content-minimized' : ''}`} style={{ 
      position: 'relative', 
      zIndex: 0,
      width: '100%',
      height: '100%',
      overflowY: 'auto',
      overflowX: 'hidden'
    }}>
      {/* Header integrated into content */}
      <div className="fremdriftsplan-header d-flex justify-content-between align-items-center" style={{ 
        padding: (isMobile || internalIsMobile) ? '0.05rem 0.5rem' : '8px 16px 4px 16px', 
        borderBottom: (isMobile || internalIsMobile) ? '1px solid #dee2e6' : 'none', 
        background: '#f8f9fa',
        marginTop: '0',
        marginRight: '0',
        marginLeft: '0',
        marginBottom: '8px',
        position: 'relative',
        zIndex: 1,
        minHeight: (isMobile || internalIsMobile) ? '28px' : 'auto',
        maxHeight: (isMobile || internalIsMobile) ? '28px' : 'none',
        height: (isMobile || internalIsMobile) ? '28px' : 'auto'
      }}>
        <h4 className="mb-0" style={{ 
          fontSize: (isMobile || internalIsMobile) ? '0.85rem' : '1.1rem', 
          lineHeight: (isMobile || internalIsMobile) ? '1' : '1.2',
          marginTop: '0',
          marginRight: '0',
          marginLeft: '0',
          padding: '0'
        }}>Fremdriftsplan</h4>
        <div className="d-flex gap-1">
          {onMobileToggle && (
            <button 
              className="btn btn-sm btn-outline-secondary d-lg-none"
              style={{ 
                fontSize: '0.55rem', 
                padding: '0.05rem 0.2rem',
                borderColor: '#dee2e6',
                color: '#6c757d',
                lineHeight: '1',
                height: '20px',
                width: '24px'
              }}
              onClick={onMobileToggle}
              title="Skjul/vis paneler"
            >
              <i className="fas fa-eye-slash"></i>
            </button>
          )}
        </div>
      </div>
      <div className="fremdriftsplan-list">
        {sortedLandingsplasser.map((lp) => {
          const isDone = lp.done;
          const priorityBadge = getPriorityBadgeClass(lp.priority);
          const associatedAirports = associations[lp.id] || [];
          const isCommentExpanded = expandedComments.has(lp.id);
          const hasLongComment = (lp.comment?.length || 0) > 60;
          
          const completedDate = lp.completed_at ? 
            new Date(lp.completed_at).toLocaleString('nb-NO', { 
              year: 'numeric', month: 'short', day: 'numeric', 
              hour: '2-digit', minute: '2-digit' 
            }) : '';

          return (
            <div 
              key={lp.id}
              data-landingsplass-id={lp.id}
              className={`card mb-3 shadow-sm border-0 draggable-card ${isDone ? 'opacity-75' : ''}`}
              style={{
                borderRadius: '12px',
                overflow: 'hidden',
                background: 'white',
                transition: 'all 0.2s ease',
                borderLeft: `4px solid ${getPriorityColor(lp.priority, isDone)} !important`,
                boxShadow: '0 2px 8px rgba(0,0,0,0.08) !important'
              }}
            >
              <div className="card-body p-3" style={{ fontSize: '0.85rem' }}>
                <div className="d-flex align-items-center mb-2">
                  {user?.can_edit_priority && (
                    <div className="drag-handle me-2" title="Dra for å endre prioritet" style={{ color: '#6c757d', cursor: 'grab', padding: '0.25rem' }}>
                      <i className="fas fa-grip-vertical"></i>
                    </div>
                  )}
                  <div 
                    className="me-2" 
                    style={{
                      fontSize: '1.1rem',
                      color: getPriorityColor(lp.priority, isDone),
                      background: `${getPriorityColor(lp.priority, isDone)}1a`,
                      width: '32px',
                      height: '32px',
                      borderRadius: '50%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}
                  >
                    <i className="fa fa-helicopter-symbol"></i>
                  </div>
                  <div className="flex-grow-1">
                    <h6 className="card-title mb-0" style={{ fontSize: '0.95rem', fontWeight: 600, color: '#2c3e50' }}>
                      {lp.kode ? `${lp.kode} - ` : ''}LP {lp.lp || 'N/A'}
                    </h6>
                  </div>
                  <div className="d-flex align-items-center gap-2">
                    {priorityBadge && (
                      <span className={`badge ${priorityBadge}`} style={{ fontSize: '0.65rem' }}>
                        {lp.priority}
                      </span>
                    )}
                    {isDone && (
                      <span className="badge bg-success" style={{ fontSize: '0.65rem', borderRadius: '8px' }}>
                        UTFØRT
                      </span>
                    )}
                    <div className="d-flex gap-1">
                      <button 
                        className="btn btn-outline-secondary"
                        style={{ fontSize: '0.7rem', padding: '0.2rem 0.4rem', borderRadius: '6px', borderColor: '#dee2e6' }}
                        title="Vektseddelkontroll"
                        onClick={() => handleVektseddel(lp.id)}
                      >
                        <i className="fa fa-scale-balanced"></i>
                      </button>
                      <button 
                        className="btn btn-outline-primary"
                        style={{ fontSize: '0.7rem', padding: '0.2rem 0.4rem', borderRadius: '6px' }}
                        title="Zoom til lokasjon"
                        onClick={() => handleZoomToLandingsplass(lp.id)}
                      >
                        <i className="fa fa-search-plus"></i>
                      </button>
                    </div>
                  </div>
                </div>
                
                <div className="info-grid mb-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', fontSize: '0.75rem' }}>
                  <div className="info-item" style={{ background: '#f8f9fa', padding: '0.5rem', borderRadius: '6px' }}>
                    <div className="text-muted mb-1">
                      <i className="fas fa-weight-hanging me-1"></i>Tonn:
                    </div>
                    <div className="fw-semibold text-dark">
                      {lp.calculated_tonn ? `${lp.calculated_tonn.toFixed(1)}t` : 'N/A'}
                    </div>
                  </div>
                  <div className="info-item" style={{ background: '#f8f9fa', padding: '0.5rem', borderRadius: '6px' }}>
                    <div className="text-muted mb-1">
                      <i className="fas fa-map-pin me-1"></i>Koordinat:
                    </div>
                    <div className="fw-semibold text-dark" style={{ fontSize: '0.7rem', lineHeight: '1.2' }}>
                      {lp.latitude ? lp.latitude.toFixed(4) : 'N/A'}, {lp.longitude ? lp.longitude.toFixed(4) : 'N/A'}
                    </div>
                  </div>
                </div>
                
                {lp.comment && (
                  <div className="comment-section mb-2" style={{ background: '#fff3cd', border: '1px solid #ffeaa7', borderRadius: '6px', padding: '0.5rem' }}>
                    <div className="text-muted mb-1" style={{ fontSize: '0.7rem' }}>
                      <i className="fas fa-comment me-1"></i>Kommentar:
                    </div>
                    <div className="comment-text" style={{ fontSize: '0.75rem', color: '#856404' }}>
                      {isCommentExpanded || !hasLongComment 
                        ? lp.comment 
                        : `${lp.comment.substring(0, 60)}...`
                      }
                    </div>
                    {hasLongComment && (
                      <button 
                        className="btn btn-link p-0 mt-1"
                        style={{ fontSize: '0.65rem', color: '#856404', textDecoration: 'none' }}
                        title={isCommentExpanded ? "Skjul kommentar" : "Vis hele kommentaren"}
                        onClick={() => toggleComment(lp.id)}
                      >
                        <i className={`fas fa-chevron-${isCommentExpanded ? 'up' : 'down'} me-1`}></i>
                        {isCommentExpanded ? 'Vis mindre' : 'Vis mer'}
                      </button>
                    )}
                  </div>
                )}
                
                {isDone && completedDate && (
                  <div className="completion-info mb-2" style={{ background: 'linear-gradient(135deg, #d4edda, #c3e6cb)', borderRadius: '6px', padding: '0.5rem', border: '1px solid #b8dacc' }}>
                    <div style={{ fontSize: '0.7rem', color: '#155724' }}>
                      <i className="fas fa-calendar-check me-1"></i>Utført: {completedDate}
                    </div>
                  </div>
                )}
                
                {/* Contact Persons Section */}
                <div className="contact-persons-section mb-2" style={{ background: '#f0f8ff', borderRadius: '6px', padding: '0.5rem' }}>
                  <div className="text-muted" style={{ fontSize: '0.7rem', fontWeight: 600, marginBottom: '8px' }}>
                    <i className="fas fa-address-book me-1" style={{ color: '#4a90e2' }}></i>
                    Kontaktpersoner ({(contactPersons[lp.id] || []).length}):
                  </div>
                  {isContactPersonsLoading[lp.id] ? (
                    <div className="text-center py-1">
                      <div className="spinner-border spinner-border-sm" role="status" style={{ width: '0.8rem', height: '0.8rem' }}>
                        <span className="visually-hidden">Loading...</span>
                      </div>
                    </div>
                  ) : !contactPersons[lp.id] || contactPersons[lp.id].length === 0 ? (
                    <div className="text-muted" style={{ fontSize: '0.7rem', fontStyle: 'italic' }}>
                      Ingen kontaktpersoner
                    </div>
                  ) : (
                    <div className="contact-persons-list contact-persons-scroll" style={{ 
                      maxHeight: '100px', 
                      overflowY: 'auto',
                      position: 'relative',
                      zIndex: 1
                    }}>
                      {contactPersons[lp.id].map((contact, index) => (
                        <div 
                          key={`${contact.kontaktperson}-${contact.phone}-${index}`}
                          className="contact-item" 
                          style={{ 
                            fontSize: '0.7rem',
                            padding: '6px 0',
                            margin: '0'
                          }}
                        >
                          <div className="d-flex justify-content-between align-items-start">
                            <div style={{ flex: 1 }}>
                              <div style={{ color: '#495057', fontWeight: 600 }}>
                                <i className="fas fa-user me-1" style={{ color: '#6c757d' }}></i>
                                {contact.kontaktperson || 'Ukjent'}
                              </div>
                              {contact.forening && (
                                <div style={{ color: '#6c757d', fontSize: '0.65rem', marginLeft: '1rem', marginTop: '0.25rem' }}>
                                  <i className="fas fa-users me-1"></i>
                                  {contact.forening}
                                </div>
                              )}
                              {contact.phone && contact.phone.trim() && (
                                <div style={{ color: '#6c757d', fontSize: '0.65rem', marginLeft: '1rem', marginTop: '0.25rem' }}>
                                  <i className="fas fa-phone me-1"></i>
                                  {contact.phone}
                                </div>
                              )}
                            </div>
                            {contact.totalTonn > 0 && (
                              <span className="badge bg-success" style={{ fontSize: '0.65rem', flexShrink: 0, borderRadius: '8px' }}>
                                {contact.totalTonn.toFixed(1)}t
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                
                <div className="airports-section" style={{ background: '#f1f3f4', borderRadius: '6px', padding: '0.5rem' }}>
                  <div className="text-muted mb-1" style={{ fontSize: '0.7rem', fontWeight: 600 }}>
                    <i className="fas fa-water me-1" style={{ color: '#667eea' }}></i>
                    Relaterte vann ({associatedAirports.length}):
                  </div>
                  {associationsAvailable === false ? (
                    <div className="text-muted" style={{ fontSize: '0.7rem', fontStyle: 'italic' }}>
                      <i className="fas fa-info-circle me-1"></i>
                      Assosiasjoner ikke tilgjengelig
                    </div>
                  ) : associatedAirports.length === 0 ? (
                    <div className="text-muted" style={{ fontSize: '0.7rem', fontStyle: 'italic' }}>
                      Ingen relaterte vann
                    </div>
                  ) : (
                    <div className="airports-list" style={{ maxHeight: '80px', overflowY: 'auto' }}>
                      {associatedAirports.map(airport => (
                        <div 
                          key={airport.id}
                          className="airport-item d-flex justify-content-between align-items-center py-1" 
                          style={{ fontSize: '0.7rem', borderBottom: '1px solid #e9ecef' }}
                        >
                          <span className="airport-name" style={{ color: '#495057' }}>
                            <i className='fa fa-water me-1' style={{ color: '#667eea' }}></i>
                            {airport.name.length > 25 ? airport.name.substring(0, 25) + '...' : airport.name}
                          </span>
                          <span 
                            className='badge' 
                            style={{ background: '#667eea', color: 'white', fontSize: '0.65rem', borderRadius: '8px' }}
                          >
                            {airport.tonn || 'N/A'}t
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
      
      {user?.can_edit_priority ? (
        <div className="info-footer" style={{ 
          textAlign: 'center', 
          marginTop: '1rem', 
          padding: '0.75rem', 
          background: 'white', 
          borderRadius: '8px', 
          border: '1px solid #e9ecef'
        }}>
          <div className="text-muted" style={{ fontSize: '0.75rem' }}>
            <i className="fas fa-info-circle me-1" style={{ color: '#667eea' }}></i>
            Dra kort opp/ned for å endre prioritet
          </div>
        </div>
      ) : user ? (
        <div className="info-footer" style={{ 
          textAlign: 'center', 
          marginTop: '1rem', 
          padding: '0.75rem', 
          background: 'white', 
          borderRadius: '8px', 
          border: '1px solid #e9ecef'
        }}>
          <div className="text-muted" style={{ fontSize: '0.75rem' }}>
            <i className="fas fa-lock me-1" style={{ color: '#ffc107' }}></i>
            Du har kun lesetilgang til listen
          </div>
        </div>
      ) : null}
    </div>
  );
} 