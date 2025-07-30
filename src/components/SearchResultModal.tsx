'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

interface SearchResult {
  id: number;
  source: 'vass_vann' | 'vass_lasteplass';
  type: 'water' | 'landingsplass';
  displayName: string;
  color: 'red' | 'blue';
  latitude: number;
  longitude: number;
  fylke?: string;
  kommentar?: string;
  priority?: number;
  is_done?: boolean;
  name?: string;
  lp?: string;
  kode?: string;
  completed_at?: string;
}

interface DetailedResult extends SearchResult {
  [key: string]: any;
}

interface SearchResultModalProps {
  isOpen: boolean;
  onClose: () => void;
  result: SearchResult | null;
}

export default function SearchResultModal({ isOpen, onClose, result }: SearchResultModalProps) {
  const [detailedData, setDetailedData] = useState<DetailedResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && result) {
      fetchDetailedData();
    }
  }, [isOpen, result]);

  const fetchDetailedData = async () => {
    if (!result) return;

    setIsLoading(true);
    setError(null);

    try {
      const { data, error } = await supabase
        .from(result.source)
        .select('*')
        .eq('id', result.id)
        .single();

      if (error) {
        throw error;
      }

      setDetailedData({ ...result, ...data });
    } catch (err: any) {
      console.error('Error fetching detailed data:', err);
      setError('Kunne ikke laste detaljert informasjon');
    } finally {
      setIsLoading(false);
    }
  };

  const formatDate = (dateString: string | null | undefined) => {
    if (!dateString) return 'Ikke satt';
    try {
      return new Date(dateString).toLocaleString('no-NO');
    } catch {
      return dateString;
    }
  };

  const formatCoordinate = (coord: number) => {
    return coord?.toFixed(6) || 'Ikke satt';
  };

  const getStatusBadge = (isDone: boolean, completedAt?: string) => {
    if (isDone) {
      return (
        <span className="badge bg-success">
          <i className="fas fa-check me-1"></i>
          Utført {completedAt ? `(${formatDate(completedAt)})` : ''}
        </span>
      );
    }
    return (
      <span className="badge bg-warning text-dark">
        <i className="fas fa-clock me-1"></i>
        Ikke utført
      </span>
    );
  };

  const getSourceBadge = (source: string) => {
    const isWater = source === 'vass_vann';
    return (
      <span className={`badge ${isWater ? 'bg-danger' : 'bg-primary'}`}>
        <i className={`fas ${isWater ? 'fa-water' : 'fa-helicopter-symbol'} me-1`}></i>
        {isWater ? 'Vannkilde' : 'Lasteplass'}
      </span>
    );
  };

  if (!isOpen || !result) return null;

  return (
    <div 
      className="modal show d-block" 
      style={{ backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 1055 }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="modal-dialog modal-lg modal-dialog-centered modal-dialog-scrollable">
        <div className="modal-content">
          <div className="modal-header">
            <div className="d-flex align-items-center gap-3">
              <div
                style={{
                  width: '12px',
                  height: '12px',
                  borderRadius: '50%',
                  backgroundColor: result.color === 'red' ? '#CB2B3E' : '#2A81CB'
                }}
              />
              <h5 className="modal-title mb-0">{result.displayName}</h5>
            </div>
            <button 
              type="button" 
              className="btn-close"
              onClick={onClose}
            ></button>
          </div>
          
          <div className="modal-body">
            {isLoading && (
              <div className="text-center py-4">
                <div className="spinner-border"></div>
                <div className="mt-2">Laster detaljert informasjon...</div>
              </div>
            )}

            {error && (
              <div className="alert alert-danger">
                <i className="fas fa-exclamation-triangle me-2"></i>
                {error}
              </div>
            )}

            {!isLoading && !error && detailedData && (
              <div>
                {/* Header badges */}
                <div className="mb-3">
                  {getSourceBadge(detailedData.source)}
                  <span className="ms-2">
                    {getStatusBadge(detailedData.is_done || false, detailedData.completed_at)}
                  </span>
                  {detailedData.priority !== undefined && (
                    <span className="badge bg-secondary ms-2">
                      <i className="fas fa-flag me-1"></i>
                      Prioritet: {detailedData.priority}
                    </span>
                  )}
                </div>

                {/* Basic Information */}
                <div className="row">
                  <div className="col-md-6">
                    <h6><i className="fas fa-info-circle me-2"></i>Grunnleggende informasjon</h6>
                    <table className="table table-sm">
                      <tbody>
                        <tr>
                          <td><strong>ID:</strong></td>
                          <td>{detailedData.id}</td>
                        </tr>
                        {detailedData.source === 'vass_vann' && (
                          <tr>
                            <td><strong>Navn:</strong></td>
                            <td>{detailedData.name || 'Ikke oppgitt'}</td>
                          </tr>
                        )}
                        {detailedData.source === 'vass_lasteplass' && (
                          <>
                            <tr>
                              <td><strong>Lasteplass:</strong></td>
                              <td>{detailedData.lp || 'Ikke oppgitt'}</td>
                            </tr>
                            <tr>
                              <td><strong>Kode:</strong></td>
                              <td>{detailedData.kode || 'Ikke oppgitt'}</td>
                            </tr>
                          </>
                        )}
                        <tr>
                          <td><strong>Fylke:</strong></td>
                          <td>{detailedData.fylke || 'Ikke oppgitt'}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>

                  <div className="col-md-6">
                    <h6><i className="fas fa-map-marker-alt me-2"></i>Lokasjon</h6>
                    <table className="table table-sm">
                      <tbody>
                        <tr>
                          <td><strong>Breddegrad:</strong></td>
                          <td>{formatCoordinate(detailedData.latitude)}</td>
                        </tr>
                        <tr>
                          <td><strong>Lengdegrad:</strong></td>
                          <td>{formatCoordinate(detailedData.longitude)}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Comments */}
                {detailedData.kommentar && (
                  <div className="mt-3">
                    <h6><i className="fas fa-comment me-2"></i>Kommentar</h6>
                    <div className="card">
                      <div className="card-body">
                        <p className="card-text" style={{ whiteSpace: 'pre-wrap' }}>
                          {detailedData.kommentar}
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Additional Fields */}
                <div className="mt-3">
                  <h6><i className="fas fa-list me-2"></i>Alle felt</h6>
                  <div className="accordion" id="allFieldsAccordion">
                    <div className="accordion-item">
                      <h2 className="accordion-header">
                        <button 
                          className="accordion-button collapsed" 
                          type="button" 
                          data-bs-toggle="collapse" 
                          data-bs-target="#allFields"
                        >
                          <small>Vis alle databasefelt</small>
                        </button>
                      </h2>
                      <div id="allFields" className="accordion-collapse collapse">
                        <div className="accordion-body">
                          <div className="table-responsive">
                            <table className="table table-sm">
                              <tbody>
                                {Object.entries(detailedData)
                                  .filter(([key]) => !['source', 'type', 'displayName', 'color'].includes(key))
                                  .map(([key, value]) => (
                                    <tr key={key}>
                                      <td><strong>{key}:</strong></td>
                                      <td>
                                        {typeof value === 'boolean' 
                                          ? (value ? 'Ja' : 'Nei')
                                          : key.includes('_at') || key.includes('created') || key.includes('updated')
                                            ? formatDate(value as string)
                                            : value?.toString() || 'Ikke satt'
                                        }
                                      </td>
                                    </tr>
                                  ))
                                }
                              </tbody>
                            </table>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="modal-footer">
            <button 
              type="button" 
              className="btn btn-secondary" 
              onClick={onClose}
            >
              Lukk
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}