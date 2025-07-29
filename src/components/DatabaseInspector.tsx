'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabase';

export default function DatabaseInspector() {
  const [isOpen, setIsOpen] = useState(false);
  const [inspection, setInspection] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);

  const inspectDatabase = async () => {
    setIsLoading(true);
    const results: any = {};

    // Test each table
    const tables = ['vass_vann', 'vass_lasteplass', 'vass_info', 'vass_associations', 'users'];
    
    for (const table of tables) {
      try {
        // Try to get one record to see the structure
        const { data, error } = await supabase
          .from(table)
          .select('*')
          .limit(1);

        if (error) {
          results[table] = { error: error.message };
        } else {
          results[table] = {
            exists: true,
            recordCount: data?.length || 0,
            sampleRecord: data?.[0] || null,
            columns: data?.[0] ? Object.keys(data[0]) : []
          };
        }
      } catch (err: any) {
        results[table] = { error: err.message };
      }
    }

    setInspection(results);
    setIsLoading(false);
  };

  if (!isOpen) {
    return (
      <button 
        className="btn btn-sm btn-outline-info position-fixed" 
        style={{ bottom: '60px', left: '10px', zIndex: 1000 }}
        onClick={() => setIsOpen(true)}
      >
        <i className="fas fa-database me-1"></i>
        Debug DB
      </button>
    );
  }

  return (
    <div className="position-fixed" style={{ bottom: '10px', left: '10px', zIndex: 1000 }}>
      <div className="card" style={{ width: '400px', maxHeight: '400px' }}>
        <div className="card-header d-flex justify-content-between align-items-center">
          <h6 className="mb-0">Database Inspector</h6>
          <button 
            className="btn btn-sm btn-outline-secondary"
            onClick={() => setIsOpen(false)}
          >
            <i className="fas fa-times"></i>
          </button>
        </div>
        <div className="card-body" style={{ fontSize: '0.8rem', overflowY: 'auto' }}>
          <button 
            className="btn btn-primary btn-sm mb-3" 
            onClick={inspectDatabase}
            disabled={isLoading}
          >
            {isLoading ? (
              <>
                <span className="spinner-border spinner-border-sm me-2"></span>
                Inspecting...
              </>
            ) : (
              <>
                <i className="fas fa-search me-1"></i>
                Inspect Tables
              </>
            )}
          </button>

          {inspection && (
            <div>
              {Object.entries(inspection).map(([table, info]: [string, any]) => (
                <div key={table} className="mb-3">
                  <h6 className="text-primary">{table}</h6>
                  {info.error ? (
                    <div className="text-danger">
                      <i className="fas fa-exclamation-triangle me-1"></i>
                      {info.error}
                    </div>
                  ) : (
                    <div>
                      <div className="text-success">
                        <i className="fas fa-check me-1"></i>
                        Table exists ({info.recordCount} records)
                      </div>
                      <div className="mt-1">
                        <strong>Columns:</strong>
                        <div className="text-muted" style={{ fontSize: '0.7rem' }}>
                          {info.columns.join(', ')}
                        </div>
                      </div>
                      {info.sampleRecord && (
                        <details className="mt-1">
                          <summary style={{ fontSize: '0.7rem', cursor: 'pointer' }}>
                            Sample record
                          </summary>
                          <pre style={{ fontSize: '0.6rem', marginTop: '0.5rem' }}>
                            {JSON.stringify(info.sampleRecord, null, 2)}
                          </pre>
                        </details>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
} 