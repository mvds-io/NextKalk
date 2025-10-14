'use client';

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { authenticatedFetch } from '@/lib/auth';

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

interface SearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onResultSelect: (result: SearchResult) => void;
}

export default function SearchModal({ isOpen, onClose, onResultSelect }: SearchModalProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);

  // Focus input when modal opens
  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  // Search function with debouncing
  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([]);
      return;
    }

    const timeoutId = setTimeout(async () => {
      setIsLoading(true);
      try {
        const response = await authenticatedFetch(`/api/search?q=${encodeURIComponent(query)}`);
        
        if (response.ok) {
          const data = await response.json();
          setResults(data.results || []);
        } else {
          setResults([]);
        }
      } catch (error) {
        console.error('Search error:', error);
        setResults([]);
      } finally {
        setIsLoading(false);
      }
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [query]);

  // Handle keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(prev => Math.min(prev + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(prev => Math.max(prev - 1, -1));
    } else if (e.key === 'Enter' && selectedIndex >= 0) {
      e.preventDefault();
      onResultSelect(results[selectedIndex]);
      onClose();
    }
  };

  // Reset selected index when results change
  useEffect(() => {
    setSelectedIndex(-1);
  }, [results]);

  const handleResultClick = (result: SearchResult) => {
    onResultSelect(result);
    onClose();
  };

  const getColorIndicator = (color: string) => {
    const bgColor = color === 'red' ? '#CB2B3E' : '#2A81CB';
    return (
      <div
        className="color-indicator"
        style={{
          width: '8px',
          height: '8px',
          borderRadius: '50%',
          backgroundColor: bgColor,
          flexShrink: 0
        }}
      />
    );
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="modal show d-block"
          style={{ backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 1050 }}
          onClick={(e) => e.target === e.currentTarget && onClose()}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          <motion.div
            className="modal-dialog modal-dialog-centered"
            style={{ maxWidth: '500px' }}
            initial={{ scale: 0.9, opacity: 0, y: -20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0, y: -20 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
          >
            <div className="modal-content">
          <div className="modal-header border-0 pb-0">
            <div className="w-100">
              <div className="d-flex align-items-center gap-2 mb-2">
                <i className="fas fa-search text-muted"></i>
                <h5 className="modal-title mb-0">Søk i database</h5>
                <button 
                  type="button" 
                  className="btn-close ms-auto"
                  onClick={onClose}
                ></button>
              </div>
              <input
                ref={inputRef}
                type="text"
                className="form-control"
                placeholder="Søk etter navn, lasteplass eller kode..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={handleKeyDown}
                style={{ fontSize: '0.9rem' }}
              />
            </div>
          </div>
          <div className="modal-body pt-2" style={{ maxHeight: '400px', overflowY: 'auto' }}>
            {isLoading && (
              <div className="text-center py-3">
                <div className="spinner-border spinner-border-sm me-2"></div>
                <span className="text-muted">Søker...</span>
              </div>
            )}
            
            {!isLoading && query.length >= 2 && results.length === 0 && (
              <div className="text-center py-3 text-muted">
                <i className="fas fa-search-minus fa-2x mb-2"></i>
                <div>Ingen resultater funnet</div>
              </div>
            )}

            {!isLoading && results.length > 0 && (
              <motion.div ref={resultsRef}>
                {results.map((result, index) => (
                  <motion.div
                    key={`${result.source}-${result.id}`}
                    className={`search-result d-flex align-items-center gap-3 p-3 border-bottom cursor-pointer ${
                      index === selectedIndex ? 'bg-light' : ''
                    }`}
                    style={{
                      cursor: 'pointer'
                    }}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{
                      duration: 0.2,
                      delay: index * 0.05,
                      ease: "easeOut"
                    }}
                    whileHover={{ backgroundColor: '#f8f9fa' }}
                    onClick={() => handleResultClick(result)}
                    onMouseEnter={() => setSelectedIndex(index)}
                  >
                    {getColorIndicator(result.color)}
                    <div className="flex-grow-1">
                      <div className="d-flex align-items-center gap-2 mb-1">
                        <strong style={{ fontSize: '0.9rem' }}>
                          {result.displayName}
                        </strong>
                        <span className={`badge ${result.color === 'red' ? 'bg-danger' : 'bg-primary'}`} style={{ fontSize: '0.6rem' }}>
                          {result.source === 'vass_vann' ? 'Vann' : 'LP'}
                        </span>
                        {result.is_done && (
                          <span className="badge bg-success" style={{ fontSize: '0.6rem' }}>
                            <i className="fas fa-check me-1"></i>Utført
                          </span>
                        )}
                      </div>
                      <div className="text-muted" style={{ fontSize: '0.75rem' }}>
                        {result.fylke && (
                          <span className="me-3">
                            <i className="fas fa-map-marker-alt me-1"></i>
                            {result.fylke}
                          </span>
                        )}
                        {result.source === 'vass_lasteplass' && result.kode && (
                          <span className="me-3">
                            <i className="fas fa-tag me-1"></i>
                            {result.kode}
                          </span>
                        )}
                        {result.priority !== undefined && (
                          <span>
                            <i className="fas fa-flag me-1"></i>
                            Prioritet: {result.priority}
                          </span>
                        )}
                      </div>
                      {result.kommentar && (
                        <div className="text-muted mt-1" style={{ fontSize: '0.7rem' }}>
                          <i className="fas fa-comment me-1"></i>
                          {result.kommentar.length > 100 
                            ? `${result.kommentar.substring(0, 100)}...` 
                            : result.kommentar
                          }
                        </div>
                      )}
                    </div>
                  </motion.div>
                ))}
              </motion.div>
            )}

            {query.length > 0 && query.length < 2 && (
              <div className="text-center py-3 text-muted">
                Skriv minst 2 tegn for å søke
              </div>
            )}
          </div>
          {results.length > 0 && (
            <div className="modal-footer border-0 pt-0">
              <small className="text-muted">
                Bruk ↑↓ for å navigere, Enter for å velge, Esc for å lukke
              </small>
            </div>
          )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}