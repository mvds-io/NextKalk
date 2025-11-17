import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { appConfig } from '@/lib/config';
import { supabase } from '@/lib/supabase';

/**
 * Archive API Route
 * This endpoint creates new year-based tables and updates the app configuration
 * The actual table creation happens via database migrations
 */
export async function POST(request: NextRequest) {
  try {
    // Check authentication
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    const token = authHeader.replace('Bearer ', '');

    // Create a Supabase client with the user's token
    const authenticatedClient = createClient(
      appConfig.supabaseUrl,
      appConfig.supabaseKey,
      {
        global: {
          headers: {
            Authorization: `Bearer ${token}`
          }
        }
      }
    );

    // Verify the token and get user
    const { data: { user }, error: authError } = await authenticatedClient.auth.getUser(token);
    if (authError || !user) {
      return NextResponse.json(
        { error: 'Invalid authentication token' },
        { status: 401 }
      );
    }

    // Check if user has can_edit_markers permission
    const { data: userData, error: userError } = await authenticatedClient
      .from('users')
      .select('can_edit_markers, email')
      .eq('email', user.email)
      .single();

    if (userError || !userData || !userData.can_edit_markers) {
      return NextResponse.json(
        { error: 'Insufficient permissions. Marker editing privileges required.' },
        { status: 403 }
      );
    }

    // Parse request body
    const body = await request.json();
    const { year, prefix, tablesToArchive } = body;

    if (!year || typeof year !== 'string' || year.trim() === '') {
      return NextResponse.json(
        { error: 'Year is required' },
        { status: 400 }
      );
    }

    if (!tablesToArchive || !Array.isArray(tablesToArchive) || tablesToArchive.length === 0) {
      return NextResponse.json(
        { error: 'tablesToArchive array is required' },
        { status: 400 }
      );
    }

    const sanitizedYear = year.trim();
    const sanitizedPrefix = (prefix || '').trim();

    // Generate migration name
    const timestamp = new Date().getTime();
    const migrationName = `archive_tables_${sanitizedYear}_${sanitizedPrefix || 'noprefix'}_${timestamp}`;

    // Build the complete SQL for all tables
    const sqlStatements: string[] = [];

    for (const tableName of tablesToArchive) {
      const newTableName = sanitizedPrefix
        ? `${sanitizedYear}_${sanitizedPrefix}_${tableName}`
        : `${sanitizedYear}_${tableName}`;

      // Create new table with same structure (empty)
      // Note: LIKE INCLUDING ALL copies indexes, constraints, defaults, but NOT foreign keys or IDENTITY
      sqlStatements.push(`
-- Create new table for ${tableName}
CREATE TABLE IF NOT EXISTS "${newTableName}" (LIKE "${tableName}" INCLUDING DEFAULTS INCLUDING CONSTRAINTS INCLUDING INDEXES INCLUDING IDENTITY);
      `);

      // Copy all data from old table to new table
      sqlStatements.push(`
-- Copy all existing data to new table
INSERT INTO "${newTableName}"
SELECT * FROM "${tableName}";
      `);

      // Enable RLS on new table
      sqlStatements.push(`
-- Enable RLS on new table
ALTER TABLE "${newTableName}" ENABLE ROW LEVEL SECURITY;
      `);

      // Copy RLS policies from old table to new table
      sqlStatements.push(`
-- Copy RLS policies from old table to new table
DO $policy_copy$
DECLARE
  policy_record RECORD;
  new_policy_name TEXT;
  cmd_type TEXT;
  role_names TEXT;
  sql_stmt TEXT;
BEGIN
  FOR policy_record IN
    SELECT
      polname,
      polcmd,
      polpermissive,
      polroles,
      pg_get_expr(polqual, polrelid) AS qual,
      pg_get_expr(polwithcheck, polrelid) AS with_check
    FROM pg_policy
    WHERE polrelid = '${tableName}'::regclass
  LOOP
    new_policy_name := policy_record.polname;

    -- Convert polcmd char to full command name
    cmd_type := CASE policy_record.polcmd
      WHEN 'r' THEN 'SELECT'
      WHEN 'a' THEN 'INSERT'
      WHEN 'w' THEN 'UPDATE'
      WHEN 'd' THEN 'DELETE'
      WHEN '*' THEN 'ALL'
      ELSE 'ALL'
    END;

    -- Get role names (default to PUBLIC if no roles specified)
    role_names := array_to_string(
      ARRAY(
        SELECT rolname FROM pg_roles WHERE oid = ANY(policy_record.polroles)
      ),
      ', '
    );
    IF role_names = '' THEN
      role_names := 'PUBLIC';
    END IF;

    -- Build SQL based on command type
    IF cmd_type = 'SELECT' OR cmd_type = 'DELETE' THEN
      -- SELECT/DELETE only use USING clause
      sql_stmt := format(
        'CREATE POLICY %I ON %I AS %s FOR %s TO %s USING (%s)',
        new_policy_name,
        '${newTableName}',
        CASE WHEN policy_record.polpermissive THEN 'PERMISSIVE' ELSE 'RESTRICTIVE' END,
        cmd_type,
        role_names,
        COALESCE(policy_record.qual, 'true')
      );
    ELSIF cmd_type = 'INSERT' THEN
      -- INSERT only uses WITH CHECK clause
      sql_stmt := format(
        'CREATE POLICY %I ON %I AS %s FOR %s TO %s WITH CHECK (%s)',
        new_policy_name,
        '${newTableName}',
        CASE WHEN policy_record.polpermissive THEN 'PERMISSIVE' ELSE 'RESTRICTIVE' END,
        cmd_type,
        role_names,
        COALESCE(policy_record.with_check, 'true')
      );
    ELSE
      -- UPDATE/ALL use both USING and WITH CHECK
      sql_stmt := format(
        'CREATE POLICY %I ON %I AS %s FOR %s TO %s USING (%s) WITH CHECK (%s)',
        new_policy_name,
        '${newTableName}',
        CASE WHEN policy_record.polpermissive THEN 'PERMISSIVE' ELSE 'RESTRICTIVE' END,
        cmd_type,
        role_names,
        COALESCE(policy_record.qual, 'true'),
        COALESCE(policy_record.with_check, 'true')
      );
    END IF;

    EXECUTE sql_stmt;
  END LOOP;
END $policy_copy$;
      `);

      // Make old table read-only by revoking insert, update, delete
      sqlStatements.push(`
-- Make old table read-only
REVOKE INSERT, UPDATE, DELETE ON "${tableName}" FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON "${tableName}" FROM anon;
      `);
    }

    // After all tables are created, recreate foreign key constraints
    // This must happen after all tables exist
    sqlStatements.push(`
-- Recreate foreign key constraints for archived tables
-- These reference the new archived tables instead of the original ones
DO $fk_recreation$
DECLARE
  fk_record RECORD;
  source_table TEXT;
  target_table TEXT;
  constraint_name TEXT;
  fk_sql TEXT;
BEGIN
  -- Loop through all foreign keys in the original tables being archived
  FOR fk_record IN
    SELECT
      tc.table_name,
      tc.constraint_name,
      kcu.column_name,
      ccu.table_name AS foreign_table_name,
      ccu.column_name AS foreign_column_name,
      rc.update_rule,
      rc.delete_rule
    FROM information_schema.table_constraints AS tc
    JOIN information_schema.key_column_usage AS kcu
      ON tc.constraint_name = kcu.constraint_name
      AND tc.table_schema = kcu.table_schema
    JOIN information_schema.constraint_column_usage AS ccu
      ON ccu.constraint_name = tc.constraint_name
      AND ccu.table_schema = tc.table_schema
    JOIN information_schema.referential_constraints AS rc
      ON rc.constraint_name = tc.constraint_name
      AND rc.constraint_schema = tc.table_schema
    WHERE tc.constraint_type = 'FOREIGN KEY'
      AND tc.table_schema = 'public'
      AND tc.table_name IN (${tablesToArchive.map(t => `'${t}'`).join(', ')})
  LOOP
    -- Build new table names
    source_table := '${sanitizedPrefix ? `${sanitizedYear}_${sanitizedPrefix}_` : `${sanitizedYear}_`}' || fk_record.table_name;

    -- Check if foreign table is also being archived
    IF fk_record.foreign_table_name = ANY(ARRAY[${tablesToArchive.map(t => `'${t}'`).join(', ')}]) THEN
      target_table := '${sanitizedPrefix ? `${sanitizedYear}_${sanitizedPrefix}_` : `${sanitizedYear}_`}' || fk_record.foreign_table_name;
    ELSE
      -- Foreign table is not being archived, keep original reference
      target_table := fk_record.foreign_table_name;
    END IF;

    -- Create constraint name for new table
    constraint_name := fk_record.constraint_name;

    -- Build and execute ALTER TABLE command
    fk_sql := format(
      'ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES %I(%I) ON UPDATE %s ON DELETE %s',
      source_table,
      constraint_name,
      fk_record.column_name,
      target_table,
      fk_record.foreign_column_name,
      fk_record.update_rule,
      fk_record.delete_rule
    );

    BEGIN
      EXECUTE fk_sql;
      RAISE NOTICE 'Created FK: %.% -> %.%', source_table, fk_record.column_name, target_table, fk_record.foreign_column_name;
    EXCEPTION WHEN duplicate_object THEN
      RAISE NOTICE 'FK already exists: %', constraint_name;
    END;
  END LOOP;
END $fk_recreation$;
    `);

    // Update app_config to use new tables
    sqlStatements.push(`
-- Update app configuration
UPDATE app_config
SET
  active_year = '${sanitizedYear}',
  active_prefix = '${sanitizedPrefix}',
  updated_at = now(),
  updated_by = '${userData.email}'
WHERE id = 1;
    `);

    const completeSQLsql = sqlStatements.join('\n');

    // Return the SQL for now - in production, this would execute via migration
    // The user will need to run this as a migration
    return NextResponse.json({
      message: 'Archive SQL generated successfully',
      year: sanitizedYear,
      prefix: sanitizedPrefix,
      migrationName,
      sql: completeSQLsql,
      tablesToArchive,
      note: 'Execute this migration to complete the archive process'
    });

  } catch (error) {
    console.error('Archive API error:', error);
    return NextResponse.json(
      {
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

/**
 * GET endpoint to retrieve current archive configuration
 */
export async function GET(request: NextRequest) {
  try {
    const { data, error } = await supabase
      .from('app_config')
      .select('*')
      .limit(1)
      .single();

    if (error) {
      return NextResponse.json(
        { error: 'Failed to fetch app configuration' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      config: data
    });

  } catch (error) {
    console.error('Get config error:', error);
    return NextResponse.json(
      {
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
