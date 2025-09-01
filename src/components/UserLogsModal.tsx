'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';

interface UserLog {
  id: number;
  timestamp: string;
  user_email: string;
  action_type: string;
  target_type: string;
  target_id: number;
  target_name: string;
  action_details: any;
}

interface UserLogsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function UserLogsModal({ isOpen, onClose }: UserLogsModalProps) {
  const [logs, setLogs] = useState<UserLog[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [currentOffset, setCurrentOffset] = useState(0);
  const [filters, setFilters] = useState({
    actionType: '',
    targetType: '',
    userEmail: '',
    dateFrom: ''
  });
  const [hasMore, setHasMore] = useState(true);

  const fetchUserLogs = useCallback(async (limit = 50, offset = 0, filterParams = filters) => {
    let query = supabase
      .from('user_action_logs')
      .select('*')
      .order('timestamp', { ascending: false })
      .range(offset, offset + limit - 1);

    // Apply filters
    if (filterParams.actionType) {
      query = query.eq('action_type', filterParams.actionType);
    }
    if (filterParams.targetType) {
      query = query.eq('target_type', filterParams.targetType);
    }
    if (filterParams.userEmail) {
      query = query.ilike('user_email', `%${filterParams.userEmail}%`);
    }
    if (filterParams.dateFrom) {
      query = query.gte('timestamp', new Date(filterParams.dateFrom).toISOString());
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching user logs:', error);
      throw error;
    }

    return data || [];
  }, [filters]);

  const loadUserLogs = useCallback(async (reset = true) => {
    setIsLoading(true);
    
    try {
      const offset = reset ? 0 : currentOffset;
      const newLogs = await fetchUserLogs(50, offset, filters);
      
      if (reset) {
        setLogs(newLogs);
        setCurrentOffset(newLogs.length);
      } else {
        setLogs(prev => [...prev, ...newLogs]);
        setCurrentOffset(prev => prev + newLogs.length);
      }
      
      setHasMore(newLogs.length === 50);
    } catch (error) {
      console.error('Error loading logs:', error);
    } finally {
      setIsLoading(false);
    }
  }, [currentOffset, filters, fetchUserLogs]);

  useEffect(() => {
    if (isOpen) {
      loadUserLogs(true);
    }
  }, [isOpen, loadUserLogs]);

  const handleFilterChange = (field: string, value: string) => {
    setFilters(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const applyFilters = () => {
    loadUserLogs(true);
  };

  const clearFilters = () => {
    setFilters({
      actionType: '',
      targetType: '',
      userEmail: '',
      dateFrom: ''
    });
    setTimeout(() => loadUserLogs(true), 0);
  };

  const loadMore = () => {
    if (!isLoading && hasMore) {
      loadUserLogs(false);
    }
  };

  const getActionBadgeClass = (actionType: string) => {
    switch (actionType) {
      case 'toggle_done': return 'bg-success';
      case 'add_comment': return 'bg-info';
      case 'upload_image': return 'bg-primary';
      case 'upload_document': return 'bg-secondary';
      case 'create_association': return 'bg-warning';
      case 'remove_association': return 'bg-danger';
      case 'create_marker': return 'bg-primary';
      case 'delete_marker': return 'bg-danger';
      case 'update_priority': return 'bg-info';
      case 'export_pdf': return 'bg-success';
      default: return 'bg-secondary';
    }
  };

  const getActionText = (actionType: string) => {
    switch (actionType) {
      case 'toggle_done': return 'Markér utført/angre';
      case 'add_comment': return 'Legg til kommentar';
      case 'upload_image': return 'Last opp bilde';
      case 'upload_document': return 'Last opp dokument';
      case 'create_association': return 'Opprett tilknytning';
      case 'remove_association': return 'Fjern tilknytning';
      case 'create_marker': return 'Opprett markør';
      case 'delete_marker': return 'Slett markør';
      case 'update_priority': return 'Oppdater prioritet';
      case 'export_pdf': return 'Eksporter PDF';
      default: return actionType;
    }
  };

  const getTargetBadgeClass = (targetType: string) => {
    switch (targetType) {
      case 'airport': return 'bg-primary';
      case 'landingsplass': return 'bg-info';
      case 'kalkinfo': return 'bg-warning';
      case 'report': return 'bg-success';
      default: return 'bg-secondary';
    }
  };

  const getTargetText = (targetType: string) => {
    switch (targetType) {
      case 'airport': return 'Vann';
      case 'landingsplass': return 'Lasteplass';
      case 'kalkinfo': return 'Kalkinfo';
      case 'report': return 'Rapport';
      default: return targetType;
    }
  };

  const formatTimestamp = (timestamp: string) => {
    return new Date(timestamp).toLocaleString('nb-NO', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  };

  const formatDetails = (details: any) => {
    if (!details) return '-';
    
    if (typeof details === 'string') return details;
    
    try {
      // Convert object to readable format
      const entries = Object.entries(details);
      if (entries.length === 0) return '-';
      
      return entries
        .map(([key, value]) => `${key}: ${value}`)
        .join(', ');
    } catch {
      return JSON.stringify(details);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal show" style={{ display: 'block', backgroundColor: 'rgba(0,0,0,0.5)' }}>
      <div className="modal-dialog modal-xl">
        <div className="modal-content">
          <div className="modal-header">
            <h5 className="modal-title">
              <i className="fas fa-history me-2"></i>Brukerlogger
            </h5>
            <button 
              type="button" 
              className="btn-close"
              onClick={onClose}
            ></button>
          </div>
          <div className="modal-body">
            {/* Filters */}
            <div className="row mb-3">
              <div className="col-md-3">
                <label htmlFor="logFilterAction" className="form-label">Handling</label>
                <select 
                  className="form-select" 
                  value={filters.actionType}
                  onChange={(e) => handleFilterChange('actionType', e.target.value)}
                >
                  <option value="">Alle handlinger</option>
                  <option value="toggle_done">Markér utført/angre</option>
                  <option value="add_comment">Legg til kommentar</option>
                  <option value="upload_image">Last opp bilde</option>
                  <option value="upload_document">Last opp dokument</option>
                  <option value="create_association">Opprett tilknytning</option>
                  <option value="remove_association">Fjern tilknytning</option>
                  <option value="create_marker">Opprett markør</option>
                  <option value="delete_marker">Slett markør</option>
                  <option value="update_priority">Oppdater prioritet</option>
                  <option value="export_pdf">Eksporter PDF</option>
                </select>
              </div>
              <div className="col-md-3">
                <label htmlFor="logFilterTarget" className="form-label">Type</label>
                <select 
                  className="form-select"
                  value={filters.targetType}
                  onChange={(e) => handleFilterChange('targetType', e.target.value)}
                >
                  <option value="">Alle typer</option>
                  <option value="airport">Vann</option>
                  <option value="landingsplass">Lasteplass</option>
                  <option value="kalkinfo">Kalkinfo</option>
                  <option value="report">Rapport</option>
                </select>
              </div>
              <div className="col-md-3">
                <label htmlFor="logFilterUser" className="form-label">Bruker</label>
                <input 
                  type="email" 
                  className="form-control" 
                  placeholder="bruker@example.com"
                  value={filters.userEmail}
                  onChange={(e) => handleFilterChange('userEmail', e.target.value)}
                />
              </div>
              <div className="col-md-3">
                <label htmlFor="logFilterDate" className="form-label">Fra dato</label>
                <input 
                  type="date" 
                  className="form-control"
                  value={filters.dateFrom}
                  onChange={(e) => handleFilterChange('dateFrom', e.target.value)}
                />
              </div>
            </div>
            <div className="d-flex justify-content-between align-items-center mb-3">
              <button className="btn btn-primary" onClick={applyFilters}>
                <i className="fas fa-filter me-1"></i>Filtrer
              </button>
              <button className="btn btn-outline-secondary" onClick={clearFilters}>
                <i className="fas fa-times me-1"></i>Nullstill
              </button>
            </div>
            
            {/* Loading indicator */}
            {isLoading && logs.length === 0 && (
              <div className="text-center py-4">
                <div className="spinner-border" role="status">
                  <span className="visually-hidden">Laster...</span>
                </div>
              </div>
            )}
            
            {/* Logs table */}
            {logs.length > 0 && (
              <div className="table-responsive">
                <table className="table table-striped table-hover">
                  <thead className="table-dark">
                    <tr>
                      <th>Tidspunkt</th>
                      <th>Bruker</th>
                      <th>Handling</th>
                      <th>Type</th>
                      <th>Navn</th>
                      <th>Detaljer</th>
                    </tr>
                  </thead>
                  <tbody>
                    {logs.map((log) => (
                      <tr key={log.id}>
                        <td style={{ fontSize: '0.8rem', whiteSpace: 'nowrap' }}>
                          {formatTimestamp(log.timestamp)}
                        </td>
                        <td style={{ fontSize: '0.8rem', maxWidth: '150px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {log.user_email}
                        </td>
                        <td>
                          <span className={`badge ${getActionBadgeClass(log.action_type)}`} style={{ fontSize: '0.7rem' }}>
                            {getActionText(log.action_type)}
                          </span>
                        </td>
                        <td>
                          <span className={`badge ${getTargetBadgeClass(log.target_type)}`} style={{ fontSize: '0.7rem' }}>
                            {getTargetText(log.target_type)}
                          </span>
                        </td>
                        <td style={{ fontSize: '0.8rem', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {log.target_name || '-'}
                        </td>
                        <td style={{ fontSize: '0.7rem', maxWidth: '250px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {formatDetails(log.action_details)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            
            {logs.length === 0 && !isLoading && (
              <div className="text-center py-4 text-muted">
                Ingen logger funnet
              </div>
            )}
            
            {/* Pagination */}
            {logs.length > 0 && (
              <div className="d-flex justify-content-between align-items-center mt-3">
                <div>
                  <small className="text-muted">Viser {logs.length} resultater</small>
                </div>
                <div>
                  {hasMore && (
                    <button 
                      className="btn btn-outline-primary btn-sm" 
                      onClick={loadMore}
                      disabled={isLoading}
                    >
                      {isLoading ? (
                        <>
                          <span className="spinner-border spinner-border-sm me-1" role="status"></span>
                          Laster...
                        </>
                      ) : (
                        <>
                          <i className="fas fa-plus me-1"></i>Last flere
                        </>
                      )}
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Lukk</button>
          </div>
        </div>
      </div>
    </div>
  );
} 