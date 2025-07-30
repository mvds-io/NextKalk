import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

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
  
  // Verify the token with Supabase
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) {
    return NextResponse.json(
      { error: 'Invalid authentication token' },
      { status: 401 }
    );
  }
  const { searchParams } = new URL(request.url);
  const query = searchParams.get('q');

  if (!query || query.trim().length < 2) {
    return NextResponse.json(
      { error: 'Search query must be at least 2 characters long' },
      { status: 400 }
    );
  }

  try {
    const searchTerm = `%${query.trim()}%`;
    
    console.log('Searching for:', query, 'with term:', searchTerm);
    
    let vannResults: unknown[] = [];
    let lpResults: unknown[] = [];
    
    // Try to search in vass_vann table (name column)
    try {
      const { data, error } = await supabase
        .from('vass_vann')
        .select('*')
        .ilike('name', searchTerm)
        .limit(10);

      if (error) {
        console.error('Error searching vass_vann by name:', error);
        // Try alternative search if name column doesn't exist
        const { data: altData, error: altError } = await supabase
          .from('vass_vann')
          .select('*')
          .limit(5); // Get some sample data to see structure
        
        if (altError) {
          console.error('Error accessing vass_vann table:', altError);
        } else {
          console.log('vass_vann sample data:', altData?.[0]);
        }
      } else {
        vannResults = data || [];
        console.log('vass_vann results:', vannResults.length);
      }
    } catch (err) {
      console.error('Exception searching vass_vann:', err);
    }

    // Try to search in vass_lasteplass table (lp and kode columns)
    try {
      const { data, error } = await supabase
        .from('vass_lasteplass')
        .select('*')
        .or(`lp.ilike.${searchTerm},kode.ilike.${searchTerm}`)
        .limit(10);

      if (error) {
        console.error('Error searching vass_lasteplass by lp/kode:', error);
        // Try alternative search if lp/kode columns don't exist
        const { data: altData, error: altError } = await supabase
          .from('vass_lasteplass')
          .select('*')
          .limit(5); // Get some sample data to see structure
        
        if (altError) {
          console.error('Error accessing vass_lasteplass table:', altError);
        } else {
          console.log('vass_lasteplass sample data:', altData?.[0]);
        }
      } else {
        lpResults = data || [];
        console.log('vass_lasteplass results:', lpResults.length);
      }
    } catch (err) {
      console.error('Exception searching vass_lasteplass:', err);
    }

    // Format results with source indication
    const results = [
      ...(vannResults || []).map((item: any) => ({
        ...item,
        source: 'vass_vann',
        type: 'water',
        displayName: item.name,
        color: 'red'
      })),
      ...(lpResults || []).map((item: any) => ({
        ...item,
        source: 'vass_lasteplass', 
        type: 'landingsplass',
        displayName: item.lp || item.kode,
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