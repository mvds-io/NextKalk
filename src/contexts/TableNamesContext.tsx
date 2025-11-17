'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { getActiveTableNames, getDefaultTableNames, type TableNamesConfig } from '@/lib/tableNames';

interface TableNamesContextType {
  tableNames: TableNamesConfig | null;
  isLoading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}

const TableNamesContext = createContext<TableNamesContextType | undefined>(undefined);

export function TableNamesProvider({ children }: { children: React.ReactNode }) {
  const [tableNames, setTableNames] = useState<TableNamesConfig | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [showToast, setShowToast] = useState(false);

  const fetchTableNames = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const names = await getActiveTableNames();
      setTableNames(names);
      setShowToast(false);
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to load table configuration');
      setError(error);
      console.error('Failed to load table names:', err);

      // Fallback to default table names so the app can still load
      const defaultNames = getDefaultTableNames();
      setTableNames(defaultNames);
      setShowToast(true);

      // Show toast notification
      if (typeof window !== 'undefined') {
        setTimeout(() => {
          alert('⚠️ Database Configuration Error\n\nCould not load table configuration. Using default table names.\n\nPlease check:\n1. Database tables exist\n2. app_config table is accessible\n3. RLS policies allow access\n\nYou can access the Admin panel to update configuration.');
        }, 500);
      }
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchTableNames();
  }, []);

  return (
    <TableNamesContext.Provider
      value={{
        tableNames,
        isLoading,
        error,
        refetch: fetchTableNames
      }}
    >
      {children}
    </TableNamesContext.Provider>
  );
}

export function useTableNames() {
  const context = useContext(TableNamesContext);
  if (context === undefined) {
    throw new Error('useTableNames must be used within a TableNamesProvider');
  }
  return context;
}
