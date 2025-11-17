import { supabase } from './supabase';

/**
 * Interface for active table configuration
 */
export interface TableNamesConfig {
  vass_associations: string;
  vass_info: string;
  vass_info_documents: string;
  vass_info_images: string;
  vass_lasteplass: string;
  vass_lasteplass_documents: string;
  vass_lasteplass_images: string;
  vass_vann: string;
  vass_vann_documents: string;
  vass_vann_images: string;
}

/**
 * Interface for app configuration from database
 */
export interface AppConfig {
  id: number;
  active_year: string;
  active_prefix: string;
  updated_at: string;
  updated_by: string | null;
}

// Base table names (without year/prefix)
const BASE_TABLE_NAMES = [
  'vass_associations',
  'vass_info',
  'vass_info_documents',
  'vass_info_images',
  'vass_lasteplass',
  'vass_lasteplass_documents',
  'vass_lasteplass_images',
  'vass_vann',
  'vass_vann_documents',
  'vass_vann_images',
] as const;

/**
 * Cache for table names to avoid repeated database queries
 */
let cachedTableNames: TableNamesConfig | null = null;
let cacheTimestamp: number = 0;
const CACHE_DURATION = 60000; // 1 minute cache

/**
 * Build table name based on year and prefix
 */
function buildTableName(baseName: string, year: string, prefix: string): string {
  if (year === 'current' || year === '') {
    return baseName;
  }

  if (prefix && prefix !== '') {
    return `${year}_${prefix}_${baseName}`;
  }

  return `${year}_${baseName}`;
}

/**
 * Get active table names from app configuration
 * Returns dynamically generated table names based on active year/prefix
 */
export async function getActiveTableNames(): Promise<TableNamesConfig> {
  // Check cache first
  const now = Date.now();
  if (cachedTableNames && (now - cacheTimestamp) < CACHE_DURATION) {
    return cachedTableNames;
  }

  try {
    // Fetch app configuration
    const { data, error } = await supabase
      .from('app_config')
      .select('*')
      .limit(1);

    // Handle the case where app_config table is empty or has errors
    if (error) {
      console.error('Error fetching app config:', error);
      // Return default table names on error
      return getDefaultTableNames();
    }

    // If no data found, return default
    if (!data || data.length === 0) {
      console.warn('No app_config found, using default table names');
      return getDefaultTableNames();
    }

    // Get the first row
    const configRow = data[0];

    const config = configRow as AppConfig;
    const tableNames: TableNamesConfig = {} as TableNamesConfig;

    // Build table names based on configuration
    for (const baseName of BASE_TABLE_NAMES) {
      tableNames[baseName] = buildTableName(
        baseName,
        config.active_year,
        config.active_prefix
      );
    }

    // Validate that the primary table exists before caching
    // This prevents using non-existent tables
    if (config.active_year !== 'current') {
      try {
        const testQuery = await supabase
          .from(tableNames.vass_vann)
          .select('id')
          .limit(1);

        if (testQuery.error && testQuery.error.message.includes('does not exist')) {
          console.warn(`⚠️ Configured table "${tableNames.vass_vann}" does not exist!`);
          console.warn('Falling back to default table names.');
          console.warn('Please update app_config or create the missing tables.');

          // Show user-friendly alert
          if (typeof window !== 'undefined') {
            setTimeout(() => {
              alert(
                `⚠️ Table Configuration Error\n\n` +
                `The configured tables for year "${config.active_year}"${config.active_prefix ? ` (${config.active_prefix})` : ''} do not exist.\n\n` +
                `Expected table: ${tableNames.vass_vann}\n\n` +
                `Using default tables instead. Please:\n` +
                `1. Go to Admin → Archive/Year Management\n` +
                `2. Either create the missing tables, or\n` +
                `3. Change active_year to "current" to use default tables`
              );
            }, 500);
          }

          return getDefaultTableNames();
        }
      } catch (validationError) {
        console.error('Error validating table existence:', validationError);
        return getDefaultTableNames();
      }
    }

    // Update cache
    cachedTableNames = tableNames;
    cacheTimestamp = now;

    return tableNames;
  } catch (error) {
    console.error('Error in getActiveTableNames:', error);
    return getDefaultTableNames();
  }
}

/**
 * Get default table names (current year tables)
 */
export function getDefaultTableNames(): TableNamesConfig {
  const tableNames: TableNamesConfig = {} as TableNamesConfig;

  for (const baseName of BASE_TABLE_NAMES) {
    tableNames[baseName] = baseName;
  }

  return tableNames;
}

/**
 * Clear the table names cache
 * Call this after updating app configuration
 */
export function clearTableNamesCache(): void {
  cachedTableNames = null;
  cacheTimestamp = 0;
}

/**
 * Get current app configuration
 */
export async function getAppConfig(): Promise<AppConfig | null> {
  try {
    const { data, error } = await supabase
      .from('app_config')
      .select('*')
      .limit(1);

    if (error) {
      console.error('Error fetching app config:', error);
      return null;
    }

    // If no data found, return null
    if (!data || data.length === 0) {
      console.warn('No app_config found');
      return null;
    }

    return data[0] as AppConfig;
  } catch (error) {
    console.error('Error in getAppConfig:', error);
    return null;
  }
}

/**
 * Update app configuration
 * @param year - The year to set as active
 * @param prefix - The prefix for table names
 * @param updatedBy - Email of user making the update
 */
export async function updateAppConfig(
  year: string,
  prefix: string,
  updatedBy: string
): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('app_config')
      .update({
        active_year: year,
        active_prefix: prefix,
        updated_at: new Date().toISOString(),
        updated_by: updatedBy,
      })
      .eq('id', 1); // Assuming single row with id=1

    if (error) {
      console.error('Error updating app config:', error);
      return false;
    }

    // Clear cache after update
    clearTableNamesCache();
    return true;
  } catch (error) {
    console.error('Error in updateAppConfig:', error);
    return false;
  }
}
