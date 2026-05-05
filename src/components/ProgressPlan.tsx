'use client';

import { useState, useEffect, useMemo } from 'react';
import { Reorder } from 'framer-motion';
import { Landingsplass, Airport, User } from '@/types';
import { supabase } from '@/lib/supabase';
import { useTableNames } from '@/contexts/TableNamesContext';
import { parseEuropeanDecimal } from '@/lib/utils';

interface ProgressPlanProps {
  landingsplasser: Landingsplass[];
  airports?: Airport[];
  filterState: { county: string[]; showConnections: boolean };
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

const COLORS = {
  p1: '#dc3545',
  p2: '#fd7e14',
  p3: '#ffc107',
  none: '#ced4da',
  done: '#28a745',
  accent: '#667eea',
};

function getRowAccent(lp: Landingsplass): string {
  if (lp.done) return COLORS.done;
  if (lp.priority === 1) return COLORS.p1;
  if (lp.priority === 2) return COLORS.p2;
  if (lp.priority === 3) return COLORS.p3;
  return COLORS.none;
}

function PanelHeader({
  title,
  isMobile,
  onMobileToggle,
}: {
  title: string;
  isMobile: boolean;
  onMobileToggle?: () => void;
}) {
  return (
    <div
      className="fremdriftsplan-header d-flex justify-content-between align-items-center"
      style={{
        padding: isMobile ? '0.05rem 0.5rem' : '10px 16px',
        borderBottom: '1px solid #dee2e6',
        background: '#f8f9fa',
        position: 'sticky',
        top: 0,
        zIndex: 10,
        minHeight: isMobile ? 28 : 'auto',
        height: isMobile ? 28 : 'auto',
        margin: 0,
      }}
    >
      <h4
        className="mb-0"
        style={{
          fontSize: isMobile ? '0.85rem' : '1rem',
          fontWeight: 600,
          lineHeight: 1.2,
          margin: 0,
          padding: 0,
        }}
      >
        {title}
      </h4>
      {onMobileToggle && (
        <button
          className="btn btn-sm btn-outline-secondary d-lg-none"
          style={{
            fontSize: '0.55rem',
            padding: '0.05rem 0.2rem',
            borderColor: '#dee2e6',
            color: '#6c757d',
            lineHeight: 1,
            height: 20,
            width: 24,
          }}
          onClick={onMobileToggle}
          title="Skjul/vis paneler"
        >
          <i className="fas fa-eye-slash"></i>
        </button>
      )}
    </div>
  );
}

function SectionLabel({ label }: { label: string }) {
  return (
    <div
      style={{
        fontSize: '0.7rem',
        color: '#868e96',
        fontWeight: 700,
        textTransform: 'uppercase',
        letterSpacing: '0.6px',
        padding: '10px 4px 4px',
      }}
    >
      {label}
    </div>
  );
}

function RowContent({
  lp,
  assocCount,
  canDrag,
  completedBy,
}: {
  lp: Landingsplass;
  assocCount: number;
  canDrag: boolean;
  completedBy?: string;
}) {
  const isDone = lp.done;
  return (
    <>
      {canDrag && (
        <div
          className="drag-handle me-2"
          title="Dra for å endre prioritet"
          style={{ color: '#adb5bd', fontSize: '0.85rem' }}
        >
          <i className="fas fa-grip-vertical"></i>
        </div>
      )}
      <div
        style={{
          width: 20,
          fontSize: '0.95rem',
          color: isDone ? COLORS.done : '#ced4da',
          display: 'flex',
          justifyContent: 'center',
          marginRight: 8,
          flexShrink: 0,
        }}
      >
        <i className={`fas ${isDone ? 'fa-check-circle' : 'fa-circle'}`}></i>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: '0.9rem',
            fontWeight: 500,
            color: isDone ? '#6c757d' : '#2c3e50',
            textDecoration: isDone ? 'line-through' : 'none',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {lp.kode ? `${lp.kode} · ` : ''}LP {lp.lp || 'N/A'}
        </div>
        <div
          style={{
            fontSize: '0.72rem',
            color: '#868e96',
            marginTop: 2,
            display: 'flex',
            gap: 10,
            alignItems: 'center',
            flexWrap: 'wrap',
          }}
        >
          {lp.calculated_tonn != null && lp.calculated_tonn > 0 && (
            <span title="Tonn kalk">
              <i className="fas fa-weight-hanging" style={{ marginRight: 3 }}></i>
              {lp.calculated_tonn.toFixed(1)}t
            </span>
          )}
          {assocCount > 0 && (
            <span title="Tilknyttede vann">
              <i className="fas fa-water" style={{ marginRight: 3 }}></i>
              {assocCount}
            </span>
          )}
          {lp.comment && (
            <span title={lp.comment} style={{ color: COLORS.accent }}>
              <i className="fas fa-comment"></i>
            </span>
          )}
          {completedBy && (
            <span style={{ marginLeft: 'auto', fontStyle: 'italic' }}>av {completedBy}</span>
          )}
        </div>
      </div>
      {!isDone && lp.priority && lp.priority <= 3 && (
        <span
          style={{
            fontSize: '0.65rem',
            fontWeight: 700,
            padding: '2px 6px',
            borderRadius: 4,
            color: 'white',
            marginLeft: 6,
            background: getRowAccent(lp),
            flexShrink: 0,
          }}
        >
          P{lp.priority}
        </span>
      )}
    </>
  );
}

export default function ProgressPlan({
  landingsplasser,
  airports,
  filterState,
  user,
  onDataUpdate,
  onMarkerSelect,
  onZoomToLocation,
  isLoading = false,
  isMobile = false,
  onMobileToggle,
  isMinimized = false,
  onToggleMinimized,
}: ProgressPlanProps) {
  const { tableNames } = useTableNames();
  const [associationsCount, setAssociationsCount] = useState<Record<number, number>>({});
  const [completionUsers, setCompletionUsers] = useState<Record<number, string>>({});
  const [showDone, setShowDone] = useState(false);
  const [internalIsMobile, setInternalIsMobile] = useState(false);

  useEffect(() => {
    const check = () => {
      if (typeof window !== 'undefined') {
        setInternalIsMobile(window.innerWidth <= 900);
      }
    };
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  const effectiveIsMobile = isMobile || internalIsMobile;

  const sorted = useMemo(() => {
    let list = landingsplasser;
    if (filterState.county.length > 0) {
      list = list.filter((lp) => filterState.county.includes(lp.fylke));
    }
    return [...list].sort((a, b) => {
      const ap = a.priority || 999;
      const bp = b.priority || 999;
      if (ap !== bp) return ap - bp;
      const an = parseFloat(a.lp || '0');
      const bn = parseFloat(b.lp || '0');
      if (!isNaN(an) && !isNaN(bn)) return an - bn;
      return String(a.lp || '').localeCompare(String(b.lp || ''));
    });
  }, [landingsplasser, filterState.county]);

  const pending = useMemo(() => sorted.filter((l) => !l.done), [sorted]);
  const done = useMemo(() => sorted.filter((l) => l.done), [sorted]);

  // Sum unique waters (each counted once) filtered by the same county as the LP list.
  // Matches the "Totalt i år" counter so the two numbers agree.
  const { totalTonn, doneTonn } = useMemo(() => {
    const list = (airports || []).filter(
      (a) => filterState.county.length === 0 || filterState.county.includes(a.fylke)
    );
    let total = 0;
    let doneSum = 0;
    for (const a of list) {
      const t = parseEuropeanDecimal(a.tonn as unknown as string | number);
      total += t;
      if (a.done) doneSum += t;
    }
    return { totalTonn: total, doneTonn: doneSum };
  }, [airports, filterState.county]);
  const pendingTonn = Math.max(0, totalTonn - doneTonn);
  const progressPct = sorted.length ? Math.round((done.length / sorted.length) * 100) : 0;

  const pendingKey = pending.map((l) => l.id).join(',');
  const doneKey = done.map((l) => l.id).join(',');

  // Local optimistic order for drag
  const [localPending, setLocalPending] = useState<Landingsplass[]>(() => pending);
  useEffect(() => {
    setLocalPending(pending);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingKey]);

  // Association counts (one query, not N+1)
  useEffect(() => {
    const load = async () => {
      if (!tableNames || sorted.length === 0) {
        setAssociationsCount({});
        return;
      }
      const ids = sorted.map((l) => l.id);
      const { data, error } = await supabase
        .from(tableNames.vass_associations)
        .select('landingsplass_id')
        .in('landingsplass_id', ids);
      if (error) {
        setAssociationsCount({});
        return;
      }
      const counts: Record<number, number> = {};
      (data || []).forEach((row: { landingsplass_id: number }) => {
        counts[row.landingsplass_id] = (counts[row.landingsplass_id] || 0) + 1;
      });
      setAssociationsCount(counts);
    };
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingKey, doneKey, tableNames]);

  // Completion users for the Fullført section
  useEffect(() => {
    const load = async () => {
      if (done.length === 0) {
        setCompletionUsers({});
        return;
      }
      const ids = done.map((l) => l.id);
      const { data, error } = await supabase
        .from('user_action_logs')
        .select('user_email, target_id, action_details, timestamp')
        .eq('action_type', 'toggle_done')
        .eq('target_type', 'landingsplass')
        .in('target_id', ids)
        .order('timestamp', { ascending: false });
      if (error) return;
      const userMap: Record<number, string> = {};
      (data || []).forEach(
        (log: { user_email?: string; target_id: number; action_details: unknown }) => {
          if (userMap[log.target_id]) return;
          const details = log.action_details as { new_status?: unknown } | null;
          const isCompleted =
            details?.new_status === 'completed' || details?.new_status === true;
          if (isCompleted) {
            userMap[log.target_id] = log.user_email?.split('@')[0] || log.user_email || '';
          }
        }
      );
      setCompletionUsers(userMap);
    };
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doneKey]);

  const handleReorder = async (newOrder: Landingsplass[]) => {
    if (!user?.can_edit_priority || !tableNames) return;
    setLocalPending(newOrder);
    try {
      const updates = newOrder
        .map((item, idx) => ({
          id: item.id,
          newPriority: idx + 1,
          oldPriority: item.priority,
        }))
        .filter((u) => u.newPriority !== u.oldPriority);
      for (const u of updates) {
        const { error } = await supabase
          .from(tableNames.vass_lasteplass)
          .update({ priority: u.newPriority })
          .eq('id', u.id);
        if (error) throw error;
      }
      onDataUpdate?.();
    } catch (err) {
      console.error('Error reordering:', err);
      alert('Kunne ikke oppdatere prioritetsrekkefølge');
      setLocalPending(pending);
    }
  };

  const handleClick = (lp: Landingsplass) => {
    onMarkerSelect?.({ type: 'landingsplass', id: lp.id });
    if (onZoomToLocation && lp.latitude && lp.longitude) {
      onZoomToLocation(lp.latitude, lp.longitude, 13);
    }
  };

  // Minimized vertical strip (desktop only)
  if (isMinimized && !effectiveIsMobile) {
    return (
      <div
        className="fremdriftsplan-content content-minimized"
        onClick={onToggleMinimized}
        title="Vis fremdriftsplan"
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          padding: '10px 0',
          cursor: 'pointer',
          overflow: 'hidden',
          background: '#f8f9fa',
          userSelect: 'none',
        }}
      >
        <div style={{ fontSize: 10, color: '#6c757d', marginBottom: 10 }}>◀</div>
        <div
          style={{
            writingMode: 'vertical-rl',
            transform: 'rotate(180deg)',
            fontSize: '0.78rem',
            color: '#495057',
            fontWeight: 600,
            whiteSpace: 'nowrap',
            letterSpacing: '0.3px',
          }}
        >
          {pending.length} igjen · {pendingTonn.toFixed(0)}t · {progressPct}%
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div
        className="fremdriftsplan-content"
        style={{ width: '100%', height: '100%', overflowY: 'auto' }}
      >
        <PanelHeader
          title="Fremdriftsplan"
          isMobile={effectiveIsMobile}
          onMobileToggle={onMobileToggle}
        />
        <div
          className="loading-overlay"
          style={{ position: 'relative', minHeight: 200, background: 'transparent' }}
        >
          <div style={{ textAlign: 'center' }}>
            <div className="loading-spinner"></div>
            <div className="loading-text">Loading landingsplasser...</div>
          </div>
        </div>
      </div>
    );
  }

  if (sorted.length === 0) {
    return (
      <div
        className="fremdriftsplan-content"
        style={{ width: '100%', height: '100%', overflowY: 'auto' }}
      >
        <PanelHeader
          title="Fremdriftsplan"
          isMobile={effectiveIsMobile}
          onMobileToggle={onMobileToggle}
        />
        <div className="text-center py-4 text-muted">
          <i className="fas fa-helicopter-symbol fa-2x mb-2"></i>
          <p>Ingen landingsplasser funnet</p>
          {filterState.county.length > 0 && <small>Prøv å endre fylkesfilter</small>}
        </div>
      </div>
    );
  }

  return (
    <div
      className="fremdriftsplan-content"
      style={{
        position: 'relative',
        zIndex: 0,
        width: '100%',
        height: '100%',
        overflowY: 'auto',
        overflowX: 'hidden',
      }}
    >
      <PanelHeader
        title="Fremdriftsplan"
        isMobile={effectiveIsMobile}
        onMobileToggle={onMobileToggle}
      />

      {/* Progress summary card */}
      {!effectiveIsMobile && (
        <div
          style={{
            margin: '10px 12px 4px',
            padding: '10px 12px',
            background: 'white',
            borderRadius: 8,
            border: '1px solid #e9ecef',
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'baseline',
              marginBottom: 6,
            }}
          >
            <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#2c3e50' }}>
              {done.length} / {sorted.length} fullført
            </span>
            <span style={{ fontSize: '0.75rem', color: '#6c757d' }}>
              {pendingTonn.toFixed(0)}t gjenstår
            </span>
          </div>
          <div
            style={{
              height: 6,
              background: '#e9ecef',
              borderRadius: 3,
              overflow: 'hidden',
            }}
            title={`${progressPct}% fullført`}
          >
            <div
              style={{
                height: '100%',
                width: `${progressPct}%`,
                background: COLORS.done,
                transition: 'width 0.3s ease',
              }}
            />
          </div>
        </div>
      )}

      {/* Pågående (draggable) */}
      <div style={{ padding: effectiveIsMobile ? '0 0.35rem' : '0 10px' }}>
        <SectionLabel label={`Pågående (${pending.length})`} />
        {pending.length === 0 ? (
          <div
            style={{
              padding: '16px',
              textAlign: 'center',
              color: '#6c757d',
              fontSize: '0.85rem',
              background: 'white',
              borderRadius: 8,
              border: '1px dashed #dee2e6',
            }}
          >
            <i className="fas fa-check-circle me-2" style={{ color: COLORS.done }}></i>
            Alt fullført!
          </div>
        ) : (
          <Reorder.Group
            axis="y"
            values={localPending}
            onReorder={handleReorder}
            style={{ listStyle: 'none', margin: 0, padding: 0 }}
            className="fremdriftsplan-list"
          >
            {localPending.map((lp) => (
              <Reorder.Item
                key={lp.id}
                value={lp}
                data-landingsplass-id={lp.id}
                className="landingsplass-list-item"
                dragListener={user?.can_edit_priority}
                onClick={() => handleClick(lp)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  padding: '0.55rem 0.7rem',
                  marginBottom: '0.35rem',
                  background: 'white',
                  borderRadius: 8,
                  border: '1px solid #e9ecef',
                  borderLeft: `3px solid ${getRowAccent(lp)}`,
                  cursor: user?.can_edit_priority ? 'grab' : 'pointer',
                  listStyle: 'none',
                }}
                whileDrag={{
                  scale: 1.03,
                  boxShadow: '0 8px 16px rgba(0,0,0,0.15)',
                  zIndex: 1,
                }}
              >
                <RowContent
                  lp={lp}
                  assocCount={associationsCount[lp.id] || 0}
                  canDrag={!!user?.can_edit_priority}
                />
              </Reorder.Item>
            ))}
          </Reorder.Group>
        )}
      </div>

      {/* Fullført (collapsible) */}
      {done.length > 0 && (
        <div style={{ padding: effectiveIsMobile ? '0 0.35rem' : '0 10px', marginTop: 4 }}>
          <button
            type="button"
            onClick={() => setShowDone((v) => !v)}
            style={{
              display: 'flex',
              alignItems: 'center',
              width: '100%',
              background: 'transparent',
              border: 'none',
              padding: '10px 4px 4px',
              cursor: 'pointer',
              color: '#868e96',
              fontSize: '0.7rem',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.6px',
            }}
          >
            <i
              className={`fas fa-chevron-${showDone ? 'down' : 'right'}`}
              style={{ fontSize: '0.65rem', marginRight: 6, width: 10 }}
            />
            Fullført ({done.length})
          </button>
          {showDone && (
            <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
              {done.map((lp) => (
                <li
                  key={lp.id}
                  data-landingsplass-id={lp.id}
                  className="landingsplass-list-item"
                  onClick={() => handleClick(lp)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    padding: '0.5rem 0.7rem',
                    marginBottom: '0.3rem',
                    background: '#fafbfc',
                    borderRadius: 8,
                    border: '1px solid #e9ecef',
                    borderLeft: `3px solid ${COLORS.done}`,
                    cursor: 'pointer',
                    opacity: 0.85,
                  }}
                >
                  <RowContent
                    lp={lp}
                    assocCount={associationsCount[lp.id] || 0}
                    canDrag={false}
                    completedBy={completionUsers[lp.id]}
                  />
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {user?.can_edit_priority && pending.length > 0 && (
        <div
          className="info-footer"
          style={{
            textAlign: 'center',
            margin: '12px 10px 10px',
            padding: '0.55rem',
            background: 'white',
            borderRadius: 8,
            border: '1px solid #e9ecef',
            fontSize: '0.73rem',
            color: '#6c757d',
          }}
        >
          <i className="fas fa-info-circle me-1" style={{ color: COLORS.accent }}></i>
          Klikk for detaljer · Dra for å endre prioritet
        </div>
      )}
    </div>
  );
}
