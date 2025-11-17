'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Reorder, motion } from 'framer-motion';
import { Landingsplass, User } from '@/types';
import { supabase } from '@/lib/supabase';
import { useTableNames } from '@/contexts/TableNamesContext';

interface ProgressPlanProps {
  landingsplasser: Landingsplass[];
  filterState: { county: string; showConnections: boolean };
  user: User | null;
  onDataUpdate?: () => void;
  onMarkerSelect?: (marker: { type: 'airport' | 'landingsplass'; id: number }) => void;
  onZoomToLocation?: ((lat: number, lng: number, zoom?: number) => void) | null;
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
  onMarkerSelect,
  onZoomToLocation,
  isLoading = false,
  isMobile = false,
  onMobileToggle,
  isMinimized = false,
  onToggleMinimized
}: ProgressPlanProps) {
  const { tableNames } = useTableNames();

  const [associations, setAssociations] = useState<Record<number, Association[]>>({});
  const [expandedComments, setExpandedComments] = useState<Set<number>>(new Set());
  const [associationsAvailable, setAssociationsAvailable] = useState<boolean | null>(null);
  const [internalIsMobile, setInternalIsMobile] = useState(false);
  const [contactPersons, setContactPersons] = useState<Record<number, ContactPerson[]>>({});
  const [isContactPersonsLoading, setIsContactPersonsLoading] = useState<Record<number, boolean>>({});
  const [completionUsers, setCompletionUsers] = useState<Record<number, string>>({});
  const [reorderedLandingsplasser, setReorderedLandingsplasser] = useState<Landingsplass[]>([]);

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

  // Handle reorder with Framer Motion
  const handleReorder = async (newOrder: Landingsplass[]) => {
    if (!user?.can_edit_priority || !tableNames) return;

    // Update local state immediately for smooth UX
    setReorderedLandingsplasser(newOrder);

    try {
      // Calculate new priorities based on new order
      const updatedPriorities: { id: number; priority: number }[] = [];
      newOrder.forEach((item, index) => {
        const newPriority = index + 1;
        if (item.priority !== newPriority) {
          updatedPriorities.push({ id: item.id, priority: newPriority });
        }
      });

      // Update database with new priorities
      for (const update of updatedPriorities) {
        const { error } = await supabase
          .from(tableNames.vass_lasteplass)
          .update({ priority: update.priority })
          .eq('id', update.id);

        if (error) {
          console.error('Error updating priority:', error);
          throw error;
        }
      }

      // Refresh data to show updated order
      if (_onDataUpdate) {
        _onDataUpdate();
      }
    } catch (error) {
      console.error('Error reordering priorities:', error);
      alert('Kunne ikke oppdatere prioritetsrekkefølge');
      // Reset on error
      setReorderedLandingsplasser([]);
    }
  };

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

  // Use reordered list if available, otherwise use sorted list
  const displayedLandingsplasser = reorderedLandingsplasser.length > 0
    ? reorderedLandingsplasser
    : sortedLandingsplasser;

  // Update reordered list when sorted list changes
  useEffect(() => {
    if (reorderedLandingsplasser.length === 0) {
      setReorderedLandingsplasser(sortedLandingsplasser);
    }
  }, [sortedLandingsplasser.length]);

  // Load associations for all landingsplasser
  useEffect(() => {
    const loadAssociations = async () => {
      if (!tableNames || sortedLandingsplasser.length === 0) {
        setAssociations({});
        setAssociationsAvailable(true);
        return;
      }

      const landingsplassIds = sortedLandingsplasser.map(lp => lp.id);

      try {
        // First try a simple query without joins to test basic access
        const { error: testError } = await supabase
          .from(tableNames.vass_associations)
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
          .from(tableNames.vass_associations)
          .select(`
            landingsplass_id,
            airport_id,
            ${tableNames.vass_vann}:airport_id (
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
          const water = assoc[tableNames.vass_vann];
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
  }, [sortedLandingsplasser.length, tableNames]); // Only depend on the length, not the entire array

  // Load completion users from action logs
  // Use ref to prevent infinite loop
  const lastCompletedIdsRef = useRef<string>('');

  const loadCompletionUsers = useCallback(async () => {
    try {
      // Get all completed landingsplasser IDs
      const completedLandingsplasser = sortedLandingsplasser.filter(lp => lp.done);
      const completedIds = completedLandingsplasser.map(lp => lp.id);

      // Create stable key from IDs
      const idsKey = completedIds.sort().join(',');

      // Only reload if IDs have actually changed
      if (idsKey === lastCompletedIdsRef.current) {
        return;
      }

      lastCompletedIdsRef.current = idsKey;

      if (completedIds.length === 0) {
        setCompletionUsers({});
        return;
      }

      // Query action logs for completion events
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

      // Process logs to get the most recent completion event for each landingsplass
      const userMap: Record<number, string> = {};

      completionLogs?.forEach(log => {
        const targetId = log.target_id;
        const actionDetails = log.action_details as any;

        // Skip if we already have a user for this landingsplass (most recent wins)
        if (userMap[targetId]) return;

        // Handle both old and new log formats
        const isCompleted =
          actionDetails?.new_status === 'completed' ||  // New format
          actionDetails?.new_status === true;           // Old format

        if (isCompleted) {
          // Extract just the name part from email (before @)
          const userName = log.user_email?.split('@')[0] || log.user_email || '';
          userMap[targetId] = userName;
        }
      });

      setCompletionUsers(userMap);
    } catch (error) {
      console.error('Error loading completion users:', error);
    }
  }, [sortedLandingsplasser]);

  // Load contact persons for a specific landingsplass
  const loadContactPersonsForLandingsplass = useCallback(async (landingsplassId: number) => {
    if (!tableNames) return;

    setIsContactPersonsLoading(prev => ({ ...prev, [landingsplassId]: true }));

    try {
      const { data: associations, error } = await supabase
        .from(tableNames.vass_associations)
        .select(`
          airport_id,
          ${tableNames.vass_vann}:airport_id (
            forening, kontaktperson, phone, tonn
          )
        `)
        .eq('landingsplass_id', landingsplassId);

      if (error) throw error;

      // Extract and deduplicate contact persons, summing tonnage
      const contactPersonsMap = new Map();
      (associations || []).forEach((assoc: any) => {
        const water = assoc[tableNames.vass_vann];
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
  }, [tableNames]);

  // Load contact persons for all visible landingsplasser
  // Load completion users when data changes
  useEffect(() => {
    loadCompletionUsers();
  }, [loadCompletionUsers]);

  // REMOVED: This useEffect was causing an N+1 query problem, loading contact persons
  // for ALL landingsplasser (100+) on every render. Contact persons are now only loaded
  // when a landingsplass row is actually clicked/expanded by the user.
  // useEffect(() => {
  //   sortedLandingsplasser.forEach(lp => {
  //     if (!contactPersons[lp.id] && !isContactPersonsLoading[lp.id]) {
  //       loadContactPersonsForLandingsplass(lp.id);
  //     }
  //   });
  // }, [sortedLandingsplasser.length, loadContactPersonsForLandingsplass]);

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


  const handleLandingsplassClick = (lp: Landingsplass) => {
    // Select the marker to show details
    onMarkerSelect?.({ type: 'landingsplass', id: lp.id });

    // Zoom to the location on the map
    if (onZoomToLocation && lp.latitude && lp.longitude) {
      onZoomToLocation(lp.latitude, lp.longitude, 13);
    }
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
        borderBottom: '1px solid #dee2e6',
        background: '#f8f9fa',
        marginTop: '0',
        marginRight: '0',
        marginLeft: '0',
        marginBottom: '8px',
        position: 'sticky',
        top: 0,
        zIndex: 10,
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
        }}>Landingsplasser</h4>
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
      <Reorder.Group
        axis="y"
        values={displayedLandingsplasser}
        onReorder={handleReorder}
        style={{ padding: '0 0.5rem', listStyle: 'none', margin: 0 }}
        className="fremdriftsplan-list"
      >
        {displayedLandingsplasser.map((lp) => {
          const isDone = lp.done;

          return (
            <Reorder.Item
              key={lp.id}
              value={lp}
              data-landingsplass-id={lp.id}
              className={`landingsplass-list-item ${isDone ? 'opacity-75' : ''}`}
              dragListener={user?.can_edit_priority}
              onClick={() => handleLandingsplassClick(lp)}
              style={{
                display: 'flex',
                alignItems: 'center',
                padding: '0.75rem',
                marginBottom: '0.5rem',
                background: 'white',
                borderRadius: '8px',
                border: '1px solid #e9ecef',
                cursor: user?.can_edit_priority ? 'grab' : 'pointer',
                listStyle: 'none'
              }}
              whileDrag={{
                scale: 1.05,
                boxShadow: '0 8px 16px rgba(0,0,0,0.15)',
                zIndex: 1
              }}
            >
              {user?.can_edit_priority && (
                <div className="drag-handle me-2" title="Dra for å endre prioritet" style={{ color: '#6c757d', cursor: 'grab' }}>
                  <i className="fas fa-grip-vertical"></i>
                </div>
              )}

              {/* Completion Status Icon */}
              <div
                className="me-2"
                style={{
                  fontSize: '1rem',
                  color: isDone ? '#28a745' : '#6c757d',
                  width: '24px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                <i className={`fas ${isDone ? 'fa-check-circle' : 'fa-circle'}`}></i>
              </div>

              {/* Landingsplass Name */}
              <div className="flex-grow-1">
                <span style={{
                  fontSize: '0.9rem',
                  fontWeight: 500,
                  color: isDone ? '#6c757d' : '#2c3e50',
                  textDecoration: isDone ? 'line-through' : 'none'
                }}>
                  {lp.kode ? `${lp.kode} - ` : ''}LP {lp.lp || 'N/A'}
                </span>
                {lp.calculated_tonn && (
                  <span style={{
                    fontSize: '0.75rem',
                    color: '#6c757d',
                    marginLeft: '0.5rem'
                  }}>
                    ({lp.calculated_tonn.toFixed(1)}t)
                  </span>
                )}
              </div>

              {/* Priority Badge */}
              {lp.priority && lp.priority <= 3 && !isDone && (
                <span className={`badge ${getPriorityBadgeClass(lp.priority)} me-2`} style={{ fontSize: '0.7rem' }}>
                  P{lp.priority}
                </span>
              )}
            </Reorder.Item>
          );
        })}
      </Reorder.Group>

      {user?.can_edit_priority && (
        <div className="info-footer" style={{
          textAlign: 'center',
          marginTop: '1rem',
          padding: '0.75rem',
          background: 'white',
          borderRadius: '8px',
          border: '1px solid #e9ecef',
          margin: '1rem 0.5rem 0.5rem 0.5rem'
        }}>
          <div className="text-muted" style={{ fontSize: '0.75rem' }}>
            <i className="fas fa-info-circle me-1" style={{ color: '#667eea' }}></i>
            Klikk for detaljer • Dra for å endre prioritet
          </div>
        </div>
      )}
    </div>
  );
} 