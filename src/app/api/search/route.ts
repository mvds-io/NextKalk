import { NextRequest, NextResponse } from 'next/server';
import { supabase, queryWithRetry } from '@/lib/supabase';
import { createClient } from '@supabase/supabase-js';
import { appConfig } from '@/lib/config';
import { getActiveTableNames } from '@/lib/tableNames';

export async function GET(request: NextRequest) {
  // Check authentication
  const authHeader = request.headers.get('authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return NextResponse.json(
      { error: 'Authentication required' },
      { status: 401 }
    );
  }

  const token = authHeader.replace('Bearer ', '');
  
  // Create a Supabase client with the user's token for RLS
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
  
  // Verify the token works
  const { data: { user }, error: authError } = await authenticatedClient.auth.getUser(token);
  if (authError || !user) {
    console.error('Authentication failed:', authError);
    return NextResponse.json(
      { error: 'Invalid authentication token' },
      { status: 401 }
    );
  }
  
  console.log('Authenticated user:', user.email);
  const { searchParams } = new URL(request.url);
  const query = searchParams.get('q');

  if (!query || query.trim().length < 2) {
    return NextResponse.json(
      { error: 'Search query must be at least 2 characters long' },
      { status: 400 }
    );
  }

  try {
    // Get dynamic table names
    const tableNames = await getActiveTableNames();

    const searchTerm = `%${query.trim()}%`;

    console.log('Searching for:', query, 'with term:', searchTerm);

    let vannResults: unknown[] = [];
    let lpResults: unknown[] = [];

    // Try to search in vass_vann table - use simple search first
    try {
      console.log('Searching vass_vann for:', query);

      // Search by name using authenticated client
      const nameQuery = await authenticatedClient
        .from(tableNames.vass_vann)
        .select('*')
        .ilike('name', searchTerm)
        .limit(10);

      console.log('vass_vann name query result:', JSON.stringify(nameQuery, null, 2));
      vannResults = nameQuery.data || [];
      console.log('vass_vann results:', vannResults.length);
      console.log('First result:', vannResults[0]);
    } catch (err) {
      console.error('Exception searching vass_vann:', err);
      // Try fallback search for schema inspection
      try {
        const { data: altData } = await queryWithRetry(
          () => supabase
            .from(tableNames.vass_vann)
            .select('*')
            .limit(5),
          'vass_vann fallback search'
        );
        console.log('vass_vann sample data:', altData?.[0]);
      } catch (altErr) {
        console.error('Error accessing vass_vann table:', altErr);
      }
    }

    // Try to search in vass_lasteplass table - use multiple queries for better compatibility
    try {
      console.log('Searching vass_lasteplass for:', query);

      // Search by kode (most likely to match codes like "AK-01")
      console.log('Searching kode with term:', searchTerm);

      // Search by kode using authenticated client for RLS
      console.log('Searching with authenticated client...');
      const kodeQuery = await authenticatedClient
        .from(tableNames.vass_lasteplass)
        .select('*')
        .ilike('kode', searchTerm)
        .limit(5);

      console.log('Authenticated client - Kode query result:', JSON.stringify(kodeQuery, null, 2));
      const kodeResults = kodeQuery.data;

      // Search by lp (landingsplass name)
      console.log('Searching lp with term:', searchTerm);
      const lpQuery = await authenticatedClient
        .from(tableNames.vass_lasteplass)
        .select('*')
        .ilike('lp', searchTerm)
        .limit(5);

      console.log('LP query result:', lpQuery);
      const lpNameResults = lpQuery.data;

      // Combine and deduplicate results
      const allLpResults = [...(kodeResults || []), ...(lpNameResults || [])];
      const uniqueLpResults = allLpResults.filter((item, index, self) =>
        index === self.findIndex(t => t.id === item.id)
      );

      lpResults = uniqueLpResults;
      console.log('vass_lasteplass results:', lpResults.length);
      console.log('First result:', lpResults[0]);
    } catch (err) {
      console.error('Exception searching vass_lasteplass:', err);
      // Try fallback search for schema inspection
      try {
        const { data: altData } = await queryWithRetry(
          () => supabase
            .from(tableNames.vass_lasteplass)
            .select('*')
            .limit(5),
          'vass_lasteplass fallback search'
        );
        console.log('vass_lasteplass sample data:', altData?.[0]);
      } catch (altErr) {
        console.error('Error accessing vass_lasteplass table:', altErr);
      }
    }

    // Format results with source indication
    const results = [
      ...(vannResults || []).map((item: Record<string, unknown>) => ({
        ...item,
        source: 'vass_vann',
        type: 'water',
        displayName: item.name || item.vannavn,
        color: 'red'
      })),
      ...(lpResults || []).map((item: Record<string, unknown>) => ({
        ...item,
        source: 'vass_lasteplass', 
        type: 'landingsplass',
        displayName: item.kode || item.lp,
        color: 'blue'
      }))
    ];

    // Sort by relevance (exact matches first, then alphabetical)
    results.sort((a, b) => {
      const aExact = a.displayName?.toLowerCase() === query.toLowerCase();
      const bExact = b.displayName?.toLowerCase() === query.toLowerCase();
      
      if (aExact && !bExact) return -1;
      if (!aExact && bExact) return 1;
      
      return (a.displayName || '').localeCompare(b.displayName || '');
    });

    console.log('Final results count:', results.length);
    
    return NextResponse.json({
      results: results.slice(0, 15), // Limit total results
      total: results.length
    });

  } catch (error) {
    console.error('Search API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}