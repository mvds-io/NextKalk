'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { User } from '@/types';
import { supabase } from '@/lib/supabase';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { MapboxCoordinatePicker } from '@/components/MapboxCoordinatePicker';
import { useTableNames } from '@/contexts/TableNamesContext';

interface Landingsplass {
  id: number;
  lp: string;
  kode: string | null;
  kontaktperson: string | null;
  forening: string | null;
  latitude: number | null;
  longitude: number | null;
  fylke: string | null;
  tonn_lp: number | null;
  priority: number | null;
  is_done: boolean;
  comment: string | null;
}

interface VassVann {
  id: number;
  name: string | null;
  vannavn: string | null;
  pnr: number | null;
  latitude: number | null;
  longitude: number | null;
  fylke: string | null;
  tonn: string | null;
  marker_color: string | null;
  kontaktperson: string | null;
  forening: string | null;
  phone: number | null;
  email: string | null;
  address: string | null;
  is_done: boolean | null;
  comment: string | null;
}

export default function AdminPage() {
  const router = useRouter();
  const { tableNames, isLoading: tableNamesLoading } = useTableNames();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // Landingsplass state
  const [landingsplasser, setLandingsplasser] = useState<Landingsplass[]>([]);
  const [lpDialogOpen, setLpDialogOpen] = useState(false);
  const [lpDeleteDialogOpen, setLpDeleteDialogOpen] = useState(false);
  const [currentLp, setCurrentLp] = useState<Partial<Landingsplass> | null>(null);
  const [lpToDelete, setLpToDelete] = useState<number | null>(null);
  const [lpSortField, setLpSortField] = useState<keyof Landingsplass>('id');
  const [lpSortDirection, setLpSortDirection] = useState<'asc' | 'desc'>('asc');

  // Vann state
  const [vannMarkers, setVannMarkers] = useState<VassVann[]>([]);
  const [vannDialogOpen, setVannDialogOpen] = useState(false);
  const [vannDeleteDialogOpen, setVannDeleteDialogOpen] = useState(false);
  const [currentVann, setCurrentVann] = useState<Partial<VassVann> | null>(null);
  const [vannToDelete, setVannToDelete] = useState<number | null>(null);
  const [selectedAssociation, setSelectedAssociation] = useState<number | null>(null);
  const [vannSortField, setVannSortField] = useState<keyof VassVann>('id');
  const [vannSortDirection, setVannSortDirection] = useState<'asc' | 'desc'>('asc');

  // Map picker state
  const [mapPickerOpen, setMapPickerOpen] = useState(false);
  const [mapPickerType, setMapPickerType] = useState<'lp' | 'vann'>('lp');

  // Archive state
  const [archiveYear, setArchiveYear] = useState('');
  const [archivePrefix, setArchivePrefix] = useState('');
  const [archiveLoading, setArchiveLoading] = useState(false);
  const [currentConfig, setCurrentConfig] = useState<{ active_year: string; active_prefix: string } | null>(null);
  const [availableArchives, setAvailableArchives] = useState<Array<{ year: string; prefix: string }>>([]);
  const [switchingArchive, setSwitchingArchive] = useState(false);

  // Check authentication and admin access
  useEffect(() => {
    async function checkAuth() {
      try {
        const { data: { session } } = await supabase.auth.getSession();

        if (!session) {
          router.push('/');
          return;
        }

        // Get user details
        const { data: userData, error } = await supabase
          .from('users')
          .select('*')
          .eq('email', session.user.email)
          .single();

        if (error || !userData || !userData.can_edit_markers) {
          alert('Access denied. Marker editing privileges required.');
          router.push('/');
          return;
        }

        setUser(userData);
      } catch (error) {
        console.error('Auth check error:', error);
        router.push('/');
      } finally {
        setLoading(false);
      }
    }

    checkAuth();
  }, [router]);

  // Load data
  useEffect(() => {
    if (user && tableNames && !tableNamesLoading) {
      loadLandingsplasser();
      loadVannMarkers();
      loadCurrentConfig();
      loadAvailableArchives();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, tableNames, tableNamesLoading]);

  const loadCurrentConfig = async () => {
    try {
      const { data, error } = await supabase
        .from('app_config')
        .select('active_year, active_prefix')
        .limit(1)
        .single();

      if (!error && data) {
        setCurrentConfig(data);
      }
    } catch (error) {
      console.error('Error loading config:', error);
    }
  };

  const loadLandingsplasser = async () => {
    if (!tableNames) return;

    // Verify session before loading
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      console.warn('No session, skipping data load');
      return;
    }

    const { data, error } = await supabase
      .from(tableNames.vass_lasteplass)
      .select('*')
      .order('id', { ascending: true });

    if (error) {
      console.error('Error loading landingsplasser:', error);
    } else {
      setLandingsplasser(data || []);
    }
  };

  const loadVannMarkers = async () => {
    if (!tableNames) return;

    // Verify session before loading
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      console.warn('No session, skipping data load');
      return;
    }

    const { data, error } = await supabase
      .from(tableNames.vass_vann)
      .select('*')
      .order('id', { ascending: true });

    if (error) {
      console.error('Error loading vann markers:', error);
    } else {
      setVannMarkers(data || []);
    }
  };

  // Landingsplass CRUD operations
  const handleLpAdd = () => {
    setCurrentLp({
      lp: '',
      kode: '',
      kontaktperson: '',
      forening: '',
      latitude: null,
      longitude: null,
      fylke: '',
      tonn_lp: null,
      priority: 10,
      is_done: false,
      comment: '',
    });
    setLpDialogOpen(true);
  };

  const handleLpEdit = (lp: Landingsplass) => {
    setCurrentLp(lp);
    setLpDialogOpen(true);
  };

  const handleLpSave = async () => {
    if (!currentLp || !tableNames) return;

    try {
      if (currentLp.id) {
        // Update
        const { error } = await supabase
          .from(tableNames.vass_lasteplass)
          .update({
            lp: currentLp.lp,
            kode: currentLp.kode,
            kontaktperson: currentLp.kontaktperson,
            forening: currentLp.forening,
            latitude: currentLp.latitude,
            longitude: currentLp.longitude,
            fylke: currentLp.fylke,
            tonn_lp: currentLp.tonn_lp,
            priority: currentLp.priority,
            is_done: currentLp.is_done,
            comment: currentLp.comment,
          })
          .eq('id', currentLp.id);

        if (error) throw error;
        alert('Landingsplass updated successfully!');
      } else {
        // Insert
        const { error } = await supabase
          .from(tableNames.vass_lasteplass)
          .insert({
            lp: currentLp.lp,
            kode: currentLp.kode,
            kontaktperson: currentLp.kontaktperson,
            forening: currentLp.forening,
            latitude: currentLp.latitude,
            longitude: currentLp.longitude,
            fylke: currentLp.fylke,
            tonn_lp: currentLp.tonn_lp,
            priority: currentLp.priority || 10,
            is_done: currentLp.is_done || false,
            comment: currentLp.comment,
          });

        if (error) throw error;
        alert('Landingsplass created successfully!');
      }

      setLpDialogOpen(false);
      setCurrentLp(null);
      loadLandingsplasser();
    } catch (error) {
      console.error('Error saving landingsplass:', error);
      alert('Error saving landingsplass');
    }
  };

  const handleLpDelete = async () => {
    if (!lpToDelete || !tableNames) return;

    try {
      const { error } = await supabase
        .from(tableNames.vass_lasteplass)
        .delete()
        .eq('id', lpToDelete);

      if (error) throw error;

      alert('Landingsplass deleted successfully!');
      setLpDeleteDialogOpen(false);
      setLpToDelete(null);
      loadLandingsplasser();
    } catch (error) {
      console.error('Error deleting landingsplass:', error);
      alert('Error deleting landingsplass');
    }
  };

  // Vann CRUD operations
  const handleVannAdd = () => {
    setCurrentVann({
      name: '',
      vannavn: '',
      pnr: null,
      latitude: null,
      longitude: null,
      fylke: '',
      tonn: '',
      marker_color: 'red',
      kontaktperson: '',
      forening: '',
      phone: null,
      email: '',
      address: '',
      is_done: false,
      comment: '',
    });
    setSelectedAssociation(null);
    setVannDialogOpen(true);
  };

  const handleVannEdit = async (vann: VassVann) => {
    if (!tableNames) return;

    setCurrentVann(vann);

    // Load existing association
    const { data: associations } = await supabase
      .from(tableNames.vass_associations)
      .select('landingsplass_id')
      .eq('airport_id', vann.id)
      .limit(1)
      .single();

    setSelectedAssociation(associations?.landingsplass_id || null);
    setVannDialogOpen(true);
  };

  // Helper function to calculate distance using Haversine formula
  const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
    const R = 6371; // Earth's radius in kilometers
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  };

  const handleVannSave = async () => {
    if (!currentVann || !tableNames) return;

    try {
      let vannId = currentVann.id;

      if (currentVann.id) {
        // Update
        const { error } = await supabase
          .from(tableNames.vass_vann)
          .update({
            name: currentVann.name,
            vannavn: currentVann.vannavn,
            pnr: currentVann.pnr,
            latitude: currentVann.latitude,
            longitude: currentVann.longitude,
            fylke: currentVann.fylke,
            tonn: currentVann.tonn,
            marker_color: currentVann.marker_color,
            kontaktperson: currentVann.kontaktperson,
            forening: currentVann.forening,
            phone: currentVann.phone,
            email: currentVann.email,
            address: currentVann.address,
            is_done: currentVann.is_done,
            comment: currentVann.comment,
          })
          .eq('id', currentVann.id);

        if (error) throw error;

        // Update association
        if (selectedAssociation) {
          // Get landingsplass coordinates to calculate distance
          const { data: lpData } = await supabase
            .from(tableNames.vass_lasteplass)
            .select('latitude, longitude')
            .eq('id', selectedAssociation)
            .single();

          // Calculate distance if coordinates are available
          let distance = null;
          if (lpData && currentVann.latitude && currentVann.longitude && lpData.latitude && lpData.longitude) {
            distance = calculateDistance(
              lpData.latitude,
              lpData.longitude,
              currentVann.latitude,
              currentVann.longitude
            );
          }

          // Delete existing associations for this vann
          await supabase
            .from(tableNames.vass_associations)
            .delete()
            .eq('airport_id', currentVann.id);

          // Insert new association with distance
          await supabase
            .from(tableNames.vass_associations)
            .insert({
              airport_id: currentVann.id,
              landingsplass_id: selectedAssociation,
              distance_km: distance,
            });
        } else {
          // Remove all associations
          await supabase
            .from(tableNames.vass_associations)
            .delete()
            .eq('airport_id', currentVann.id);
        }

        alert('Vann marker updated successfully!');
      } else {
        // Insert
        const { data, error } = await supabase
          .from(tableNames.vass_vann)
          .insert({
            name: currentVann.name,
            vannavn: currentVann.vannavn,
            pnr: currentVann.pnr,
            latitude: currentVann.latitude,
            longitude: currentVann.longitude,
            fylke: currentVann.fylke,
            tonn: currentVann.tonn,
            marker_color: currentVann.marker_color || 'red',
            kontaktperson: currentVann.kontaktperson,
            forening: currentVann.forening,
            phone: currentVann.phone,
            email: currentVann.email,
            address: currentVann.address,
            is_done: currentVann.is_done || false,
            comment: currentVann.comment,
          })
          .select()
          .single();

        if (error) throw error;
        vannId = data.id;

        // Add association if selected
        if (selectedAssociation && vannId) {
          // Get landingsplass coordinates to calculate distance
          const { data: lpData } = await supabase
            .from(tableNames.vass_lasteplass)
            .select('latitude, longitude')
            .eq('id', selectedAssociation)
            .single();

          // Calculate distance if coordinates are available
          let distance = null;
          if (lpData && currentVann.latitude && currentVann.longitude && lpData.latitude && lpData.longitude) {
            distance = calculateDistance(
              lpData.latitude,
              lpData.longitude,
              currentVann.latitude,
              currentVann.longitude
            );
          }

          await supabase
            .from(tableNames.vass_associations)
            .insert({
              airport_id: vannId,
              landingsplass_id: selectedAssociation,
              distance_km: distance,
            });
        }

        alert('Vann marker created successfully!');
      }

      setVannDialogOpen(false);
      setCurrentVann(null);
      setSelectedAssociation(null);
      loadVannMarkers();
    } catch (error) {
      console.error('Error saving vann marker:', error);
      alert('Error saving vann marker');
    }
  };

  const handleVannDelete = async () => {
    if (!vannToDelete || !tableNames) return;

    try {
      // Associations will be deleted automatically due to foreign key cascade
      const { error } = await supabase
        .from(tableNames.vass_vann)
        .delete()
        .eq('id', vannToDelete);

      if (error) throw error;

      alert('Vann marker deleted successfully!');
      setVannDeleteDialogOpen(false);
      setVannToDelete(null);
      loadVannMarkers();
    } catch (error) {
      console.error('Error deleting vann marker:', error);
      alert('Error deleting vann marker');
    }
  };

  // Archive handlers
  const handleArchiveSubmit = async () => {
    if (!archiveYear || archiveYear.trim() === '') {
      alert('Please enter a year');
      return;
    }

    const confirm = window.confirm(
      `Are you sure you want to create a new year archive?\n\n` +
      `Year: ${archiveYear}\n` +
      `Prefix: ${archivePrefix || '(none)'}\n\n` +
      `This will:\n` +
      `1. Create new empty tables for the year\n` +
      `2. Make current tables READ-ONLY\n` +
      `3. Switch the app to use the new tables\n\n` +
      `This action will require running a database migration.`
    );

    if (!confirm) return;

    setArchiveLoading(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();

      if (!session) {
        alert('Session expired. Please log in again.');
        return;
      }

      const tablesToArchive = [
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
      ];

      const response = await fetch('/api/archive-tables', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          year: archiveYear,
          prefix: archivePrefix,
          tablesToArchive,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to create archive');
      }

      // Show the SQL that needs to be run
      alert(
        `Archive SQL generated successfully!\n\n` +
        `Migration name: ${result.migrationName}\n\n` +
        `You need to run this SQL as a database migration:\n\n` +
        `The SQL has been logged to the console. Copy it and run it as a migration.`
      );

      console.log('='.repeat(80));
      console.log('ARCHIVE MIGRATION SQL:');
      console.log('='.repeat(80));
      console.log(result.sql);
      console.log('='.repeat(80));

      // Reload config after archive
      loadCurrentConfig();

      // Reset form
      setArchiveYear('');
      setArchivePrefix('');

    } catch (error) {
      console.error('Error creating archive:', error);
      alert(`Error creating archive: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setArchiveLoading(false);
    }
  };

  // Load available archives by discovering year-prefixed tables
  const loadAvailableArchives = useCallback(async () => {
    try {
      // Fetch all table names via API
      const response = await fetch('/api/list-archives');
      if (!response.ok) {
        throw new Error('Failed to fetch archives');
      }

      const { archives } = await response.json();
      setAvailableArchives(archives || []);
    } catch (error) {
      console.error('Error loading available archives:', error);
      // Fallback to just current
      setAvailableArchives([{ year: 'current', prefix: '' }]);
    }
  }, []);

  // Switch to a different archive
  const handleSwitchArchive = async (year: string, prefix: string) => {
    if (!user?.email) return;

    const confirm = window.confirm(
      `Switch to ${year === 'current' ? 'current (no archive)' : `year ${year}${prefix ? ` with prefix "${prefix}"` : ''}`}?\n\n` +
      `This will change which tables the app uses for all data.`
    );

    if (!confirm) return;

    setSwitchingArchive(true);

    try {
      const { error } = await supabase
        .from('app_config')
        .update({
          active_year: year,
          active_prefix: prefix,
          updated_at: new Date().toISOString(),
          updated_by: user.email,
        })
        .eq('id', 1);

      if (error) {
        throw error;
      }

      alert(`Successfully switched to ${year === 'current' ? 'current tables' : `year ${year}${prefix ? ` (${prefix})` : ''}`}!\n\nPlease refresh the page to see changes.`);

      // Reload config
      loadCurrentConfig();

      // Suggest page refresh
      if (window.confirm('Would you like to refresh the page now to apply changes?')) {
        window.location.reload();
      }

    } catch (error) {
      console.error('Error switching archive:', error);
      alert(`Error switching archive: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setSwitchingArchive(false);
    }
  };

  // Map picker handlers
  const handleOpenMapPicker = (type: 'lp' | 'vann') => {
    setMapPickerType(type);
    setMapPickerOpen(true);
  };

  const handleMapCoordinatesSelect = (lat: number, lng: number) => {
    if (mapPickerType === 'lp' && currentLp) {
      setCurrentLp({ ...currentLp, latitude: lat, longitude: lng });
    } else if (mapPickerType === 'vann' && currentVann) {
      setCurrentVann({ ...currentVann, latitude: lat, longitude: lng });
    }
  };

  // Sorting functions
  const handleLpSort = (field: keyof Landingsplass) => {
    if (lpSortField === field) {
      setLpSortDirection(lpSortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setLpSortField(field);
      setLpSortDirection('asc');
    }
  };

  const handleVannSort = (field: keyof VassVann) => {
    if (vannSortField === field) {
      setVannSortDirection(vannSortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setVannSortField(field);
      setVannSortDirection('asc');
    }
  };

  // Sorted data
  const sortedLandingsplasser = useMemo(() => {
    return [...landingsplasser].sort((a, b) => {
      const aVal = a[lpSortField];
      const bVal = b[lpSortField];

      if (aVal === null || aVal === undefined) return 1;
      if (bVal === null || bVal === undefined) return -1;

      if (typeof aVal === 'string' && typeof bVal === 'string') {
        return lpSortDirection === 'asc'
          ? aVal.localeCompare(bVal)
          : bVal.localeCompare(aVal);
      }

      if (aVal < bVal) return lpSortDirection === 'asc' ? -1 : 1;
      if (aVal > bVal) return lpSortDirection === 'asc' ? 1 : -1;
      return 0;
    });
  }, [landingsplasser, lpSortField, lpSortDirection]);

  const sortedVannMarkers = useMemo(() => {
    return [...vannMarkers].sort((a, b) => {
      const aVal = a[vannSortField];
      const bVal = b[vannSortField];

      if (aVal === null || aVal === undefined) return 1;
      if (bVal === null || bVal === undefined) return -1;

      if (typeof aVal === 'string' && typeof bVal === 'string') {
        return vannSortDirection === 'asc'
          ? aVal.localeCompare(bVal)
          : bVal.localeCompare(aVal);
      }

      if (aVal < bVal) return vannSortDirection === 'asc' ? -1 : 1;
      if (aVal > bVal) return vannSortDirection === 'asc' ? 1 : -1;
      return 0;
    });
  }, [vannMarkers, vannSortField, vannSortDirection]);

  // Memoize association options to prevent re-rendering on every keystroke
  const associationOptions = useMemo(() => {
    return landingsplasser.map((lp) => (
      <SelectItem key={lp.id} value={lp.id.toString()}>
        {lp.lp} - {lp.kode || 'No code'}
      </SelectItem>
    ));
  }, [landingsplasser]);

  // Memoize handlers to prevent re-creating functions on every render
  const handleVannFieldChange = useCallback((field: string, value: any) => {
    setCurrentVann(prev => ({ ...prev, [field]: value }));
  }, []);

  if (loading || tableNamesLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="spinner-border text-primary" role="status">
            <span className="sr-only">Loading...</span>
          </div>
          <p className="mt-2">Loading admin panel...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gray-50" style={{ minHeight: '100vh', backgroundColor: '#f9fafb', padding: '2rem 1rem' }}>
      <div className="container mx-auto py-8 px-4 max-w-7xl" style={{ maxWidth: '1280px', margin: '0 auto' }}>
        <div className="mb-6" style={{ marginBottom: '1.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem' }}>
            <Link href="/" style={{ textDecoration: 'none' }}>
              <Button
                variant="outline"
                style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
              >
                <i className="fas fa-arrow-left"></i>
                Back to Map
              </Button>
            </Link>
          </div>
          <h1 className="text-3xl font-bold" style={{ fontSize: '1.875rem', fontWeight: 'bold', marginBottom: '0.5rem' }}>Admin Panel</h1>
          <p className="text-muted-foreground" style={{ color: '#6b7280' }}>Manage landingsplasser and vann markers</p>
        </div>

      <Tabs defaultValue="landingsplass" className="w-full">
        <TabsList className="grid w-full grid-cols-3 max-w-2xl">
          <TabsTrigger value="landingsplass">Landingsplasser</TabsTrigger>
          <TabsTrigger value="vann">Vann Markers</TabsTrigger>
          <TabsTrigger value="archive">Archive / Year Management</TabsTrigger>
        </TabsList>

        {/* Landingsplass Tab */}
        <TabsContent value="landingsplass" className="space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-2xl font-semibold">Landingsplasser ({landingsplasser.length})</h2>
            <Button onClick={handleLpAdd}>Add New Landingsplass</Button>
          </div>

          <div className="border rounded-lg overflow-hidden" style={{ border: '1px solid #e5e7eb', borderRadius: '0.5rem', overflow: 'hidden', backgroundColor: 'white' }}>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead onClick={() => handleLpSort('id')} style={{ cursor: 'pointer', userSelect: 'none' }}>
                    ID {lpSortField === 'id' && (lpSortDirection === 'asc' ? '↑' : '↓')}
                  </TableHead>
                  <TableHead onClick={() => handleLpSort('lp')} style={{ cursor: 'pointer', userSelect: 'none' }}>
                    LP Code {lpSortField === 'lp' && (lpSortDirection === 'asc' ? '↑' : '↓')}
                  </TableHead>
                  <TableHead onClick={() => handleLpSort('kode')} style={{ cursor: 'pointer', userSelect: 'none' }}>
                    Kode {lpSortField === 'kode' && (lpSortDirection === 'asc' ? '↑' : '↓')}
                  </TableHead>
                  <TableHead onClick={() => handleLpSort('fylke')} style={{ cursor: 'pointer', userSelect: 'none' }}>
                    Fylke {lpSortField === 'fylke' && (lpSortDirection === 'asc' ? '↑' : '↓')}
                  </TableHead>
                  <TableHead>Coordinates</TableHead>
                  <TableHead onClick={() => handleLpSort('tonn_lp')} style={{ cursor: 'pointer', userSelect: 'none' }}>
                    Tonn {lpSortField === 'tonn_lp' && (lpSortDirection === 'asc' ? '↑' : '↓')}
                  </TableHead>
                  <TableHead onClick={() => handleLpSort('priority')} style={{ cursor: 'pointer', userSelect: 'none' }}>
                    Priority {lpSortField === 'priority' && (lpSortDirection === 'asc' ? '↑' : '↓')}
                  </TableHead>
                  <TableHead onClick={() => handleLpSort('is_done')} style={{ cursor: 'pointer', userSelect: 'none' }}>
                    Status {lpSortField === 'is_done' && (lpSortDirection === 'asc' ? '↑' : '↓')}
                  </TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedLandingsplasser.map((lp) => (
                  <TableRow key={lp.id}>
                    <TableCell>{lp.id}</TableCell>
                    <TableCell>{lp.lp}</TableCell>
                    <TableCell>{lp.kode || '-'}</TableCell>
                    <TableCell>{lp.fylke || '-'}</TableCell>
                    <TableCell className="text-xs">
                      {lp.latitude && lp.longitude ? `${lp.latitude.toFixed(4)}, ${lp.longitude.toFixed(4)}` : '-'}
                    </TableCell>
                    <TableCell>{lp.tonn_lp || '-'}</TableCell>
                    <TableCell>{lp.priority || '-'}</TableCell>
                    <TableCell>
                      <span className={`px-2 py-1 rounded text-xs ${lp.is_done ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}`}>
                        {lp.is_done ? 'Done' : 'Pending'}
                      </span>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <Button size="sm" onClick={() => handleLpEdit(lp)}>Edit</Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => {
                            setLpToDelete(lp.id);
                            setLpDeleteDialogOpen(true);
                          }}
                        >
                          Delete
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        {/* Vann Tab */}
        <TabsContent value="vann" className="space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-2xl font-semibold">Vann Markers ({vannMarkers.length})</h2>
            <Button onClick={handleVannAdd}>Add New Vann Marker</Button>
          </div>

          <div className="border rounded-lg overflow-hidden" style={{ border: '1px solid #e5e7eb', borderRadius: '0.5rem', overflow: 'hidden', backgroundColor: 'white' }}>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead onClick={() => handleVannSort('id')} style={{ cursor: 'pointer', userSelect: 'none' }}>
                    ID {vannSortField === 'id' && (vannSortDirection === 'asc' ? '↑' : '↓')}
                  </TableHead>
                  <TableHead onClick={() => handleVannSort('name')} style={{ cursor: 'pointer', userSelect: 'none' }}>
                    Name {vannSortField === 'name' && (vannSortDirection === 'asc' ? '↑' : '↓')}
                  </TableHead>
                  <TableHead onClick={() => handleVannSort('vannavn')} style={{ cursor: 'pointer', userSelect: 'none' }}>
                    Vannavn {vannSortField === 'vannavn' && (vannSortDirection === 'asc' ? '↑' : '↓')}
                  </TableHead>
                  <TableHead onClick={() => handleVannSort('fylke')} style={{ cursor: 'pointer', userSelect: 'none' }}>
                    Fylke {vannSortField === 'fylke' && (vannSortDirection === 'asc' ? '↑' : '↓')}
                  </TableHead>
                  <TableHead>Coordinates</TableHead>
                  <TableHead onClick={() => handleVannSort('tonn')} style={{ cursor: 'pointer', userSelect: 'none' }}>
                    Tonn {vannSortField === 'tonn' && (vannSortDirection === 'asc' ? '↑' : '↓')}
                  </TableHead>
                  <TableHead onClick={() => handleVannSort('marker_color')} style={{ cursor: 'pointer', userSelect: 'none' }}>
                    Color {vannSortField === 'marker_color' && (vannSortDirection === 'asc' ? '↑' : '↓')}
                  </TableHead>
                  <TableHead onClick={() => handleVannSort('is_done')} style={{ cursor: 'pointer', userSelect: 'none' }}>
                    Status {vannSortField === 'is_done' && (vannSortDirection === 'asc' ? '↑' : '↓')}
                  </TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedVannMarkers.map((vann) => (
                  <TableRow key={vann.id}>
                    <TableCell>{vann.id}</TableCell>
                    <TableCell>{vann.name || '-'}</TableCell>
                    <TableCell>{vann.vannavn || '-'}</TableCell>
                    <TableCell>{vann.fylke || '-'}</TableCell>
                    <TableCell className="text-xs">
                      {vann.latitude && vann.longitude ? `${vann.latitude.toFixed(4)}, ${vann.longitude.toFixed(4)}` : '-'}
                    </TableCell>
                    <TableCell>{vann.tonn || '-'}</TableCell>
                    <TableCell>
                      <span className={`px-2 py-1 rounded text-xs text-white`} style={{ backgroundColor: vann.marker_color || 'red' }}>
                        {vann.marker_color || 'red'}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className={`px-2 py-1 rounded text-xs ${vann.is_done ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}`}>
                        {vann.is_done ? 'Done' : 'Pending'}
                      </span>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <Button size="sm" onClick={() => handleVannEdit(vann)}>Edit</Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => {
                            setVannToDelete(vann.id);
                            setVannDeleteDialogOpen(true);
                          }}
                        >
                          Delete
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        {/* Archive Tab */}
        <TabsContent value="archive" className="space-y-6">
          {/* Current Configuration Section */}
          <div className="border rounded-lg p-6" style={{ border: '1px solid #e5e7eb', borderRadius: '0.5rem', padding: '1.5rem', backgroundColor: 'white' }}>
            <h2 className="text-2xl font-semibold mb-4">Current Active Year</h2>
            {currentConfig ? (
              <div className="space-y-2">
                <div className="flex items-center gap-4">
                  <div className="text-lg">
                    <span className="font-semibold">Year:</span>{' '}
                    <span className="px-3 py-1 bg-blue-100 text-blue-800 rounded">
                      {currentConfig.active_year === 'current' ? 'Current (No Archive)' : currentConfig.active_year}
                    </span>
                  </div>
                  {currentConfig.active_prefix && (
                    <div className="text-lg">
                      <span className="font-semibold">Prefix:</span>{' '}
                      <span className="px-3 py-1 bg-green-100 text-green-800 rounded">
                        {currentConfig.active_prefix}
                      </span>
                    </div>
                  )}
                </div>
                <p className="text-sm text-gray-600 mt-2">
                  The app is currently using tables with the above configuration. All data is being stored in{' '}
                  {currentConfig.active_year === 'current'
                    ? 'the default tables (no year prefix)'
                    : `year ${currentConfig.active_year} tables${currentConfig.active_prefix ? ` with prefix "${currentConfig.active_prefix}"` : ''}`
                  }.
                </p>
              </div>
            ) : (
              <p className="text-gray-600">Loading configuration...</p>
            )}
          </div>

          {/* Switch Archive Section */}
          <div className="border rounded-lg p-6" style={{ border: '1px solid #e5e7eb', borderRadius: '0.5rem', padding: '1.5rem', backgroundColor: 'white' }}>
            <h2 className="text-2xl font-semibold mb-4">Switch Between Archives</h2>
            <p className="text-gray-600 mb-4">
              Select a different archive/year to work with. This changes which database tables the app uses.
            </p>

            {availableArchives.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {availableArchives.map((archive) => {
                  const isActive =
                    currentConfig?.active_year === archive.year &&
                    (currentConfig?.active_prefix || '') === archive.prefix;

                  const displayName = archive.year === 'current'
                    ? 'Current (No Archive)'
                    : `${archive.year}${archive.prefix ? ` - ${archive.prefix}` : ''}`;

                  return (
                    <button
                      key={`${archive.year}-${archive.prefix}`}
                      onClick={() => handleSwitchArchive(archive.year, archive.prefix)}
                      disabled={isActive || switchingArchive}
                      className={`p-4 rounded-lg border-2 text-left transition-all ${
                        isActive
                          ? 'border-green-500 bg-green-50'
                          : 'border-gray-200 hover:border-blue-300 hover:bg-gray-50'
                      } ${switchingArchive ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                      style={isActive ? {
                        borderColor: '#10b981',
                        backgroundColor: '#f0fdf4',
                        borderWidth: '2px'
                      } : undefined}
                    >
                      <div className="flex items-center gap-2">
                        {isActive ? (
                          <i className="fas fa-check-circle text-green-600"></i>
                        ) : (
                          <i className="fas fa-circle text-gray-300"></i>
                        )}
                        <span className={`font-semibold ${isActive ? 'text-green-900' : 'text-gray-900'}`}>
                          {displayName}
                        </span>
                      </div>
                      {isActive && (
                        <div className="mt-2 text-xs text-green-600">
                          Currently Active
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            ) : (
              <p className="text-gray-500 italic">Loading available archives...</p>
            )}
          </div>

          {/* Create New Year Archive Section */}
          <div className="border rounded-lg p-6" style={{ border: '1px solid #e5e7eb', borderRadius: '0.5rem', padding: '1.5rem', backgroundColor: 'white' }}>
            <h2 className="text-2xl font-semibold mb-4">Create New Year Archive</h2>
            <p className="text-gray-600 mb-6">
              Create a new year-based archive to preserve current data and start fresh. This will:
            </p>
            <ul className="list-disc list-inside text-gray-600 mb-6 space-y-2">
              <li>Create new empty tables for the specified year</li>
              <li>Make current tables READ-ONLY (archived)</li>
              <li>Switch the app to use the new year tables</li>
              <li>Generate a migration SQL that you need to run</li>
            </ul>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="archive-year">Year * (e.g., 2025)</Label>
                  <Input
                    id="archive-year"
                    type="text"
                    value={archiveYear}
                    onChange={(e) => setArchiveYear(e.target.value)}
                    placeholder="2025"
                    disabled={archiveLoading}
                  />
                </div>
                <div>
                  <Label htmlFor="archive-prefix">Prefix (optional, e.g., project_name)</Label>
                  <Input
                    id="archive-prefix"
                    type="text"
                    value={archivePrefix}
                    onChange={(e) => setArchivePrefix(e.target.value)}
                    placeholder="project_alpha"
                    disabled={archiveLoading}
                  />
                </div>
              </div>

              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                <h3 className="font-semibold text-yellow-900 mb-2">Preview:</h3>
                <p className="text-sm text-yellow-800 mb-2">
                  {archiveYear && archiveYear.trim() !== '' ? (
                    <>
                      Tables will be named:{' '}
                      <code className="bg-yellow-100 px-2 py-1 rounded">
                        {archiveYear}{archivePrefix ? `_${archivePrefix}` : ''}_vass_vann
                      </code>
                      , etc.
                    </>
                  ) : (
                    'Enter a year to see table naming preview'
                  )}
                </p>
                <p className="text-sm text-yellow-800">
                  Affected tables: vass_associations, vass_info, vass_info_documents, vass_info_images,
                  vass_lasteplass, vass_lasteplass_documents, vass_lasteplass_images, vass_vann,
                  vass_vann_documents, vass_vann_images
                </p>
              </div>

              <div className="flex justify-between items-center pt-4">
                <p className="text-sm text-gray-600">
                  Note: This will generate SQL that you need to run as a migration
                </p>
                <Button
                  onClick={handleArchiveSubmit}
                  disabled={archiveLoading || !archiveYear || archiveYear.trim() === ''}
                  className="bg-blue-600 hover:bg-blue-700"
                >
                  {archiveLoading ? 'Generating...' : 'Generate Archive Migration'}
                </Button>
              </div>
            </div>
          </div>

          {/* Tables List Section */}
          <div className="border rounded-lg p-6" style={{ border: '1px solid #e5e7eb', borderRadius: '0.5rem', padding: '1.5rem', backgroundColor: 'white' }}>
            <h2 className="text-2xl font-semibold mb-4">Tables Managed by Archive System</h2>
            <div className="grid grid-cols-2 gap-3">
              {[
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
              ].map((tableName) => (
                <div key={tableName} className="flex items-center gap-2 p-2 bg-gray-50 rounded">
                  <i className="fas fa-table text-gray-600"></i>
                  <span className="font-mono text-sm">{tableName}</span>
                </div>
              ))}
            </div>
          </div>
        </TabsContent>
      </Tabs>

      {/* Landingsplass Dialog */}
      <Dialog open={lpDialogOpen} onOpenChange={setLpDialogOpen}>
        <DialogContent
          className="max-w-2xl max-h-[90vh] overflow-y-auto"
          style={{
            maxWidth: '42rem',
            maxHeight: '90vh',
            overflowY: 'auto',
            padding: '1.5rem',
            backgroundColor: 'white',
            borderRadius: '0.5rem',
            boxShadow: '0 10px 25px rgba(0, 0, 0, 0.1)'
          }}
        >
          <DialogHeader style={{ marginBottom: '1.5rem' }}>
            <DialogTitle style={{ fontSize: '1.5rem', fontWeight: '600', marginBottom: '0.5rem' }}>
              {currentLp?.id ? 'Edit Landingsplass' : 'Add New Landingsplass'}
            </DialogTitle>
            <DialogDescription className="sr-only">
              Form to {currentLp?.id ? 'edit' : 'add'} landingsplass marker details
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-2 gap-4" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div>
              <Label htmlFor="lp">LP Code *</Label>
              <Input
                id="lp"
                value={currentLp?.lp || ''}
                onChange={(e) => setCurrentLp({ ...currentLp, lp: e.target.value })}
              />
            </div>

            <div>
              <Label htmlFor="kode">Kode</Label>
              <Input
                id="kode"
                value={currentLp?.kode || ''}
                onChange={(e) => setCurrentLp({ ...currentLp, kode: e.target.value })}
              />
            </div>

            <div>
              <Label htmlFor="kontaktperson">Kontaktperson</Label>
              <Input
                id="kontaktperson"
                value={currentLp?.kontaktperson || ''}
                onChange={(e) => setCurrentLp({ ...currentLp, kontaktperson: e.target.value })}
              />
            </div>

            <div>
              <Label htmlFor="forening">Forening</Label>
              <Input
                id="forening"
                value={currentLp?.forening || ''}
                onChange={(e) => setCurrentLp({ ...currentLp, forening: e.target.value })}
              />
            </div>

            <div>
              <Label htmlFor="fylke">Fylke</Label>
              <Input
                id="fylke"
                value={currentLp?.fylke || ''}
                onChange={(e) => setCurrentLp({ ...currentLp, fylke: e.target.value })}
              />
            </div>

            <div>
              <Label htmlFor="tonn_lp">Tonn</Label>
              <Input
                id="tonn_lp"
                type="number"
                value={currentLp?.tonn_lp || ''}
                onChange={(e) => setCurrentLp({ ...currentLp, tonn_lp: parseFloat(e.target.value) || null })}
              />
            </div>

            <div>
              <Label htmlFor="priority">Priority</Label>
              <Input
                id="priority"
                type="number"
                value={currentLp?.priority || ''}
                onChange={(e) => setCurrentLp({ ...currentLp, priority: parseInt(e.target.value) || null })}
              />
            </div>

            <div className="flex items-center space-x-2">
              <Checkbox
                id="is_done_lp"
                checked={currentLp?.is_done || false}
                onCheckedChange={(checked) => setCurrentLp({ ...currentLp, is_done: checked as boolean })}
              />
              <Label htmlFor="is_done_lp">Is Done</Label>
            </div>

            <div className="col-span-2">
              <Label>Coordinates</Label>
              <div className="flex gap-2">
                <Input
                  placeholder="Latitude"
                  type="number"
                  step="0.000001"
                  value={currentLp?.latitude || ''}
                  onChange={(e) => setCurrentLp({ ...currentLp, latitude: parseFloat(e.target.value) || null })}
                />
                <Input
                  placeholder="Longitude"
                  type="number"
                  step="0.000001"
                  value={currentLp?.longitude || ''}
                  onChange={(e) => setCurrentLp({ ...currentLp, longitude: parseFloat(e.target.value) || null })}
                />
                <Button variant="outline" onClick={() => handleOpenMapPicker('lp')}>
                  <i className="fas fa-map-marker-alt mr-2"></i>
                  Select on Map
                </Button>
              </div>
            </div>

            <div className="col-span-2">
              <Label htmlFor="comment_lp">Comment</Label>
              <Textarea
                id="comment_lp"
                value={currentLp?.comment || ''}
                onChange={(e) => setCurrentLp({ ...currentLp, comment: e.target.value })}
                rows={3}
              />
            </div>
          </div>

          <DialogFooter style={{ marginTop: '1.5rem', display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
            <Button variant="outline" onClick={() => setLpDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleLpSave}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Vann Dialog */}
      <Dialog open={vannDialogOpen} onOpenChange={setVannDialogOpen}>
        <DialogContent
          className="max-w-2xl max-h-[90vh] overflow-y-auto"
          style={{
            maxWidth: '42rem',
            maxHeight: '90vh',
            overflowY: 'auto',
            padding: '1.5rem',
            backgroundColor: 'white',
            borderRadius: '0.5rem',
            boxShadow: '0 10px 25px rgba(0, 0, 0, 0.1)'
          }}
        >
          <DialogHeader style={{ marginBottom: '1.5rem' }}>
            <DialogTitle style={{ fontSize: '1.5rem', fontWeight: '600', marginBottom: '0.5rem' }}>
              {currentVann?.id ? 'Edit Vann Marker' : 'Add New Vann Marker'}
            </DialogTitle>
            <DialogDescription className="sr-only">
              Form to {currentVann?.id ? 'edit' : 'add'} vann marker details and associations
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-2 gap-4" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div>
              <Label htmlFor="name">Name *</Label>
              <Input
                id="name"
                value={currentVann?.name || ''}
                onChange={(e) => setCurrentVann({ ...currentVann, name: e.target.value })}
              />
            </div>

            <div>
              <Label htmlFor="vannavn">Vannavn</Label>
              <Input
                id="vannavn"
                value={currentVann?.vannavn || ''}
                onChange={(e) => setCurrentVann({ ...currentVann, vannavn: e.target.value })}
              />
            </div>

            <div>
              <Label htmlFor="pnr">PNR</Label>
              <Input
                id="pnr"
                type="number"
                value={currentVann?.pnr || ''}
                onChange={(e) => setCurrentVann({ ...currentVann, pnr: parseInt(e.target.value) || null })}
              />
            </div>

            <div>
              <Label htmlFor="fylke_vann">Fylke</Label>
              <Input
                id="fylke_vann"
                value={currentVann?.fylke || ''}
                onChange={(e) => setCurrentVann({ ...currentVann, fylke: e.target.value })}
              />
            </div>

            <div>
              <Label htmlFor="tonn">Tonn</Label>
              <Input
                id="tonn"
                value={currentVann?.tonn || ''}
                onChange={(e) => setCurrentVann({ ...currentVann, tonn: e.target.value })}
              />
            </div>

            <div>
              <Label htmlFor="marker_color">Marker Color</Label>
              <Select
                value={currentVann?.marker_color || 'red'}
                onValueChange={(value) => setCurrentVann({ ...currentVann, marker_color: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="red">Red</SelectItem>
                  <SelectItem value="green">Green</SelectItem>
                  <SelectItem value="blue">Blue</SelectItem>
                  <SelectItem value="orange">Orange</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="kontaktperson_vann">Kontaktperson</Label>
              <Input
                id="kontaktperson_vann"
                value={currentVann?.kontaktperson || ''}
                onChange={(e) => setCurrentVann({ ...currentVann, kontaktperson: e.target.value })}
              />
            </div>

            <div>
              <Label htmlFor="forening_vann">Forening</Label>
              <Input
                id="forening_vann"
                value={currentVann?.forening || ''}
                onChange={(e) => setCurrentVann({ ...currentVann, forening: e.target.value })}
              />
            </div>

            <div>
              <Label htmlFor="phone">Phone</Label>
              <Input
                id="phone"
                type="number"
                value={currentVann?.phone || ''}
                onChange={(e) => setCurrentVann({ ...currentVann, phone: parseInt(e.target.value) || null })}
              />
            </div>

            <div>
              <Label htmlFor="email_vann">Email</Label>
              <Input
                id="email_vann"
                type="email"
                value={currentVann?.email || ''}
                onChange={(e) => setCurrentVann({ ...currentVann, email: e.target.value })}
              />
            </div>

            <div className="col-span-2">
              <Label htmlFor="address">Address</Label>
              <Input
                id="address"
                value={currentVann?.address || ''}
                onChange={(e) => setCurrentVann({ ...currentVann, address: e.target.value })}
              />
            </div>

            <div className="col-span-2">
              <Label>Coordinates</Label>
              <div className="flex gap-2">
                <Input
                  placeholder="Latitude"
                  type="number"
                  step="0.000001"
                  value={currentVann?.latitude || ''}
                  onChange={(e) => setCurrentVann({ ...currentVann, latitude: parseFloat(e.target.value) || null })}
                />
                <Input
                  placeholder="Longitude"
                  type="number"
                  step="0.000001"
                  value={currentVann?.longitude || ''}
                  onChange={(e) => setCurrentVann({ ...currentVann, longitude: parseFloat(e.target.value) || null })}
                />
                <Button variant="outline" onClick={() => handleOpenMapPicker('vann')}>
                  <i className="fas fa-map-marker-alt mr-2"></i>
                  Select on Map
                </Button>
              </div>
            </div>

            <div className="col-span-2">
              <Label htmlFor="association">Associated Landingsplass</Label>
              <Select
                value={selectedAssociation?.toString() || 'none'}
                onValueChange={(value) => setSelectedAssociation(value === 'none' ? null : parseInt(value))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a landingsplass..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {associationOptions}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center space-x-2">
              <Checkbox
                id="is_done_vann"
                checked={currentVann?.is_done || false}
                onCheckedChange={(checked) => setCurrentVann({ ...currentVann, is_done: checked as boolean })}
              />
              <Label htmlFor="is_done_vann">Is Done</Label>
            </div>

            <div className="col-span-2">
              <Label htmlFor="comment_vann">Comment</Label>
              <Textarea
                id="comment_vann"
                value={currentVann?.comment || ''}
                onChange={(e) => setCurrentVann({ ...currentVann, comment: e.target.value })}
                rows={3}
              />
            </div>
          </div>

          <DialogFooter style={{ marginTop: '1.5rem', display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
            <Button variant="outline" onClick={() => setVannDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleVannSave}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Landingsplass Dialog */}
      <AlertDialog open={lpDeleteDialogOpen} onOpenChange={setLpDeleteDialogOpen}>
        <AlertDialogContent
          style={{
            maxWidth: '32rem',
            padding: '1.5rem',
            backgroundColor: 'white',
            borderRadius: '0.5rem',
            boxShadow: '0 10px 25px rgba(0, 0, 0, 0.1)'
          }}
        >
          <AlertDialogHeader style={{ marginBottom: '1rem' }}>
            <AlertDialogTitle style={{ fontSize: '1.25rem', fontWeight: '600', marginBottom: '0.5rem' }}>
              Are you sure?
            </AlertDialogTitle>
            <AlertDialogDescription style={{ fontSize: '0.875rem', color: '#6b7280' }}>
              This action cannot be undone. This will permanently delete the landingsplass and remove all associated data.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter style={{ marginTop: '1.5rem', display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleLpDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Vann Dialog */}
      <AlertDialog open={vannDeleteDialogOpen} onOpenChange={setVannDeleteDialogOpen}>
        <AlertDialogContent
          style={{
            maxWidth: '32rem',
            padding: '1.5rem',
            backgroundColor: 'white',
            borderRadius: '0.5rem',
            boxShadow: '0 10px 25px rgba(0, 0, 0, 0.1)'
          }}
        >
          <AlertDialogHeader style={{ marginBottom: '1rem' }}>
            <AlertDialogTitle style={{ fontSize: '1.25rem', fontWeight: '600', marginBottom: '0.5rem' }}>
              Are you sure?
            </AlertDialogTitle>
            <AlertDialogDescription style={{ fontSize: '0.875rem', color: '#6b7280' }}>
              This action cannot be undone. This will permanently delete the vann marker and remove all associations with landingsplasser.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter style={{ marginTop: '1.5rem', display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleVannDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Map Picker */}
      <MapboxCoordinatePicker
        open={mapPickerOpen}
        onOpenChange={setMapPickerOpen}
        onCoordinatesSelect={handleMapCoordinatesSelect}
        initialLat={mapPickerType === 'lp' ? currentLp?.latitude || undefined : currentVann?.latitude || undefined}
        initialLng={mapPickerType === 'lp' ? currentLp?.longitude || undefined : currentVann?.longitude || undefined}
      />
      </div>
    </div>
  );
}
