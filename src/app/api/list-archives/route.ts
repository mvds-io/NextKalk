import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { appConfig } from '@/lib/config';

/**
 * List Archives API Route
 * Returns all available year/prefix combinations by discovering tables
 */
export async function GET() {
  try {
    // Create service role client to query system tables
    const supabase = createClient(
      appConfig.supabaseUrl,
      appConfig.supabaseServiceKey || appConfig.supabaseKey
    );

    // Query information_schema directly
    const { data: tables, error } = await supabase
      .from('information_schema.tables' as any)
      .select('table_name')
      .eq('table_schema', 'public')
      .or('table_name.eq.vass_vann,table_name.like.%_vass_vann');

    // If that doesn't work, try a simpler approach: just check which tables exist
    // by attempting to query them
    const archives: Array<{ year: string; prefix: string }> = [];

    // Add current (default) option
    archives.push({ year: 'current', prefix: '' });

    // Common year/prefix patterns to check
    const currentYear = new Date().getFullYear();
    const yearsToCheck = [currentYear - 1, currentYear, currentYear + 1, currentYear + 2];
    const prefixesToCheck = ['', 'test', 'backup', 'old'];

    for (const year of yearsToCheck) {
      for (const prefix of prefixesToCheck) {
        const tableName = prefix
          ? `${year}_${prefix}_vass_vann`
          : `${year}_vass_vann`;

        // Try to query the table to see if it exists
        const { error: queryError } = await supabase
          .from(tableName as any)
          .select('id')
          .limit(1);

        // If no error about missing table, it exists
        if (!queryError || !queryError.message?.includes('does not exist')) {
          archives.push({ year: year.toString(), prefix });
        }
      }
    }

    return NextResponse.json({ archives });

  } catch (error) {
    console.error('List archives error:', error);
    return NextResponse.json(
      {
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
