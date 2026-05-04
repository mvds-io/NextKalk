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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { MapboxCoordinatePicker } from '@/components/MapboxCoordinatePicker';
import { useTableNames } from '@/contexts/TableNamesContext';
import { PlanningTab } from '@/components/admin/PlanningTab';
import { YearComparisonTab } from '@/components/admin/YearComparisonTab';
import { ChangelogTab } from '@/components/admin/ChangelogTab';
import HazardsTab from '@/components/admin/HazardsTab';
import { ArrowLeft, Plus, MapPin, Trash2, Edit, CheckCircle, XCircle, Database, RefreshCw, AlertTriangle, Info } from 'lucide-react';

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
  is_active: boolean;
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
  is_active: boolean;
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
  const [lpSortField, setLpSortField] = useState<keyof Landingsplass | 'calculated_tonn'>('id');
  const [lpSortDirection, setLpSortDirection] = useState<'asc' | 'desc'>('asc');
  const [associatedVannMarkers, setAssociatedVannMarkers] = useState<VassVann[]>([]);
  const [lpTonnMap, setLpTonnMap] = useState<Record<number, number>>({});
  const [lpVannCountMap, setLpVannCountMap] = useState<Record<number, number>>({});

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
  const [currentConfig, setCurrentConfig] = useState<{ active_year: string; active_prefix: string; updated_at?: string } | null>(null);
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
      loadLpTonnMap();
      loadCurrentConfig();
      loadAvailableArchives();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, tableNames, tableNamesLoading]);

  const loadCurrentConfig = async () => {
    try {
      const { data, error } = await supabase
        .from('app_config')
        .select('active_year, active_prefix, updated_at')
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

  const loadLpTonnMap = async () => {
    if (!tableNames) return;

    const { data: associations, error: assocError } = await supabase
      .from(tableNames.vass_associations)
      .select('landingsplass_id, airport_id');

    if (assocError || !associations) return;

    const airportIds = [...new Set(associations.map(a => a.airport_id))];
    if (airportIds.length === 0) {
      setLpTonnMap({});
      setLpVannCountMap({});
      return;
    }

    // Fetch tonn for all associated vann markers
    const { data: vannData, error: vannError } = await supabase
      .from(tableNames.vass_vann)
      .select('id, tonn')
      .in('id', airportIds);

    if (vannError || !vannData) return;

    const vannTonnById: Record<number, number> = {};
    vannData.forEach(v => {
      const parsed = v.tonn ? parseFloat(v.tonn) : 0;
      if (!isNaN(parsed)) vannTonnById[v.id] = parsed;
    });

    const tonnMap: Record<number, number> = {};
    const countMap: Record<number, number> = {};
    associations.forEach(a => {
      const tonn = vannTonnById[a.airport_id] || 0;
      tonnMap[a.landingsplass_id] = (tonnMap[a.landingsplass_id] || 0) + tonn;
      countMap[a.landingsplass_id] = (countMap[a.landingsplass_id] || 0) + 1;
    });

    setLpTonnMap(tonnMap);
    setLpVannCountMap(countMap);
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
      is_active: true,
      comment: '',
    });
    setLpDialogOpen(true);
  };

  const handleLpEdit = async (lp: Landingsplass) => {
    if (!tableNames) return;

    setCurrentLp(lp);

    // Load associated vann markers for this landingsplass
    const { data: associations } = await supabase
      .from(tableNames.vass_associations)
      .select('airport_id')
      .eq('landingsplass_id', lp.id);

    if (associations && associations.length > 0) {
      const airportIds = associations.map(a => a.airport_id);

      const { data: vannData } = await supabase
        .from(tableNames.vass_vann)
        .select('*')
        .in('id', airportIds);

      setAssociatedVannMarkers(vannData || []);
    } else {
      setAssociatedVannMarkers([]);
    }

    setLpDialogOpen(true);
  };

  const handleReassociateVann = async (vannId: number, newLpId: number) => {
    if (!tableNames || !currentLp?.id) return;
    try {
      // Get vann coordinates
      const vann = associatedVannMarkers.find(v => v.id === vannId);
      // Get new LP coordinates for distance calculation
      const newLp = landingsplasser.find(lp => lp.id === newLpId);

      let distance: number | null = null;
      if (vann && newLp && vann.latitude && vann.longitude && newLp.latitude && newLp.longitude) {
        distance = calculateDistance(newLp.latitude, newLp.longitude, vann.latitude, vann.longitude);
      }

      // Delete old association
      await supabase
        .from(tableNames.vass_associations)
        .delete()
        .eq('airport_id', vannId)
        .eq('landingsplass_id', currentLp.id);

      // Insert new association
      await supabase
        .from(tableNames.vass_associations)
        .insert({
          airport_id: vannId,
          landingsplass_id: newLpId,
          distance_km: distance,
        });

      // Remove from displayed list since it's no longer associated with this LP
      setAssociatedVannMarkers(prev => prev.filter(v => v.id !== vannId));
      loadLpTonnMap();
    } catch (err) {
      console.error('Failed to reassociate vann:', err);
      alert('Failed to change association. Please try again.');
    }
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
            is_active: currentLp.is_active,
            comment: currentLp.comment,
          })
          .eq('id', currentLp.id);

        if (error) throw error;

        // Cascade done status to associated waters so tonnage totals stay consistent
        try {
          const { data: assocs } = await supabase
            .from(tableNames.vass_associations)
            .select('airport_id')
            .eq('landingsplass_id', currentLp.id);
          if (assocs && assocs.length > 0) {
            await supabase
              .from(tableNames.vass_vann)
              .update({ is_done: !!currentLp.is_done })
              .in('id', assocs.map((a: any) => a.airport_id));
          }
        } catch (cascadeErr) {
          console.warn('Could not cascade done to waters:', cascadeErr);
        }

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
            is_active: currentLp.is_active !== undefined ? currentLp.is_active : true,
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

  const handleLpToggleActive = async (lp: Landingsplass) => {
    if (!tableNames) return;

    const newActiveState = !lp.is_active;
    const action = newActiveState ? 'activate' : 'deactivate';

    const confirm = window.confirm(
      `Are you sure you want to ${action} ${lp.lp}?\n\n` +
      (newActiveState
        ? 'This will make it visible on the map and include it in calculations.'
        : 'This will remove it from the map and exclude it from calculations. You can reactivate it later.')
    );

    if (!confirm) return;

    try {
      const { error } = await supabase
        .from(tableNames.vass_lasteplass)
        .update({ is_active: newActiveState })
        .eq('id', lp.id);

      if (error) throw error;

      // alert(`Landingsplass ${action}d successfully!`);
      loadLandingsplasser();
    } catch (error) {
      console.error(`Error ${action}ing landingsplass:`, error);
      alert(`Error ${action}ing landingsplass`);
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
      is_active: true,
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
            is_active: currentVann.is_active,
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
            is_active: currentVann.is_active !== undefined ? currentVann.is_active : true,
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
      loadLpTonnMap();
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
      loadLpTonnMap();
    } catch (error) {
      console.error('Error deleting vann marker:', error);
      alert('Error deleting vann marker');
    }
  };

  const handleVannToggleActive = async (vann: VassVann) => {
    if (!tableNames) return;

    const newActiveState = !vann.is_active;
    const action = newActiveState ? 'activate' : 'deactivate';

    const confirm = window.confirm(
      `Are you sure you want to ${action} ${vann.name || vann.vannavn || 'this vann marker'}?\n\n` +
      (newActiveState
        ? 'This will make it visible on the map and include it in calculations.'
        : 'This will remove it from the map and exclude it from calculations. You can reactivate it later.')
    );

    if (!confirm) return;

    try {
      const { error } = await supabase
        .from(tableNames.vass_vann)
        .update({ is_active: newActiveState })
        .eq('id', vann.id);

      if (error) throw error;

      // alert(`Vann marker ${action}d successfully!`);
      loadVannMarkers();
    } catch (error) {
      console.error(`Error ${action}ing vann marker:`, error);
      alert(`Error ${action}ing vann marker`);
    }
  };

  const handleVannToggleActiveFromLpModal = async (vann: VassVann) => {
    if (!tableNames || !currentLp) return;

    const newActiveState = !vann.is_active;
    const action = newActiveState ? 'activate' : 'deactivate';

    const confirm = window.confirm(
      `Are you sure you want to ${action} ${vann.name || vann.vannavn || 'this vann marker'}?\n\n` +
      (newActiveState
        ? 'This will make it visible on the map and include it in calculations.'
        : 'This will remove it from the map and exclude it from calculations. You can reactivate it later.')
    );

    if (!confirm) return;

    try {
      const { error } = await supabase
        .from(tableNames.vass_vann)
        .update({ is_active: newActiveState })
        .eq('id', vann.id);

      if (error) throw error;

      // Update the local state
      setAssociatedVannMarkers(prev =>
        prev.map(v => v.id === vann.id ? { ...v, is_active: newActiveState } : v)
      );

      // alert(`Vann marker ${action}d successfully!`);

      // Also reload all vann markers
      loadVannMarkers();
    } catch (error) {
      console.error(`Error ${action}ing vann marker:`, error);
      alert(`Error ${action}ing vann marker`);
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
  const handleLpSort = (field: keyof Landingsplass | 'calculated_tonn') => {
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
      let aVal: any, bVal: any;
      if (lpSortField === 'calculated_tonn') {
        aVal = lpTonnMap[a.id] || 0;
        bVal = lpTonnMap[b.id] || 0;
      } else if (lpSortField === 'priority') {
        aVal = lpVannCountMap[a.id] || 0;
        bVal = lpVannCountMap[b.id] || 0;
      } else if (lpSortField === 'tonn_lp') {
        aVal = a.tonn_lp ?? 0;
        bVal = b.tonn_lp ?? 0;
      } else {
        aVal = a[lpSortField];
        bVal = b[lpSortField];
      }

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
  }, [landingsplasser, lpSortField, lpSortDirection, lpTonnMap, lpVannCountMap]);

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

  if (loading || tableNamesLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="text-center p-8 bg-white rounded-xl shadow-lg">
          <RefreshCw className="w-10 h-10 animate-spin text-primary mx-auto mb-4" />
          <p className="text-lg font-medium text-gray-700">Loading admin panel...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <div className="container mx-auto py-8 px-4 max-w-7xl">
      <div className="mb-8">
        <div className="flex items-center gap-4 mb-4">
          <Link href="/" passHref>
            <Button variant="outline" size="sm" className="gap-2">
              <ArrowLeft className="w-4 h-4" />
              Back to Map
            </Button>
          </Link>
        </div>
        <div className="flex flex-col gap-2">
          <h1 className="text-4xl font-bold tracking-tight text-gray-900">Admin Panel</h1>
          <p className="text-muted-foreground text-lg">Manage landingsplasser, vann markers, and configurations.</p>
        </div>
      </div>

      {/* Active Database Indicator */}
      {currentConfig && (
        <Card className={`mb-8 border-2 shadow-sm ${currentConfig.active_year === 'current' ? 'border-blue-200 bg-blue-50/50' : 'border-yellow-200 bg-yellow-50/50'}`}>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between p-6 gap-4">
            <div className="flex items-start gap-4">
              <div className={`mt-1 w-3 h-3 rounded-full ${currentConfig.active_year === 'current' ? 'bg-blue-500' : 'bg-yellow-500'} animate-pulse`} />
              <div>
                <h3 className="font-semibold text-lg text-gray-900 flex items-center gap-2">
                  <Database className="w-5 h-5" />
                  {currentConfig.active_year === 'current'
                    ? '2025 (Current Database)'
                    : `${currentConfig.active_year} Database${currentConfig.active_prefix ? ` (${currentConfig.active_prefix})` : ''}`
                  }
                </h3>
                <p className="text-sm text-muted-foreground mt-1">
                  All edits will be saved to this database
                  {currentConfig.updated_at && (
                    <> • Last updated {new Date(currentConfig.updated_at).toLocaleString()}</>
                  )}
                </p>
              </div>
            </div>
            <div className="text-sm text-muted-foreground font-medium flex items-center gap-1 bg-white/50 px-3 py-1 rounded-full border border-black/5">
              <AlertTriangle className="w-4 h-4" />
              Change database in Archive tab
            </div>
          </div>
        </Card>
      )}

      <Tabs defaultValue="landingsplass" className="w-full">
        <TabsList className="w-full grid grid-cols-4 lg:grid-cols-7 mb-8 bg-gray-100/80 p-1">
          <TabsTrigger value="landingsplass" className="data-[state=active]:bg-white data-[state=active]:shadow-sm">Landingsplasser</TabsTrigger>
          <TabsTrigger value="vann" className="data-[state=active]:bg-white data-[state=active]:shadow-sm">Vann Markers</TabsTrigger>
          <TabsTrigger value="hazards" className="data-[state=active]:bg-white data-[state=active]:shadow-sm">Farer</TabsTrigger>
          <TabsTrigger value="planning" className="data-[state=active]:bg-white data-[state=active]:shadow-sm">Planning & Optimization</TabsTrigger>
          <TabsTrigger value="comparison" className="data-[state=active]:bg-white data-[state=active]:shadow-sm">Year Comparison</TabsTrigger>
          <TabsTrigger value="changelog" className="data-[state=active]:bg-white data-[state=active]:shadow-sm">Endringslogg</TabsTrigger>
          <TabsTrigger value="archive" className="data-[state=active]:bg-white data-[state=active]:shadow-sm">Archive</TabsTrigger>
        </TabsList>

        {/* Landingsplass Tab */}
        <TabsContent value="landingsplass" className="space-y-6">
          <div className="flex justify-between items-center">
            <h2 className="text-2xl font-semibold text-gray-800">Landingsplasser ({landingsplasser.length})</h2>
            <Button onClick={handleLpAdd} className="gap-2 shadow-sm">
              <Plus className="w-4 h-4" /> Add New Landingsplass
            </Button>
          </div>

          <Card className="overflow-hidden border-gray-200 shadow-sm">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-gray-50/50 hover:bg-gray-50/50">
                    <TableHead onClick={() => handleLpSort('id')} className="cursor-pointer w-[80px] font-semibold">
                      ID {lpSortField === 'id' && (lpSortDirection === 'asc' ? '↑' : '↓')}
                    </TableHead>
                    <TableHead onClick={() => handleLpSort('lp')} className="cursor-pointer font-semibold">
                      LP Code {lpSortField === 'lp' && (lpSortDirection === 'asc' ? '↑' : '↓')}
                    </TableHead>
                    <TableHead onClick={() => handleLpSort('kode')} className="cursor-pointer font-semibold">
                      Kode {lpSortField === 'kode' && (lpSortDirection === 'asc' ? '↑' : '↓')}
                    </TableHead>
                    <TableHead onClick={() => handleLpSort('fylke')} className="cursor-pointer font-semibold">
                      Fylke {lpSortField === 'fylke' && (lpSortDirection === 'asc' ? '↑' : '↓')}
                    </TableHead>
                    <TableHead className="font-semibold">Coordinates</TableHead>
                    <TableHead onClick={() => handleLpSort('tonn_lp')} className="cursor-pointer font-semibold">
                      <span className="inline-flex items-center gap-1">
                        Tonn (dok)
                        <Info
                          className="w-3.5 h-3.5 text-gray-400"
                          onClick={(e) => e.stopPropagation()}
                          aria-label="Forklaring"
                          title={
                            'Tonn (dok): manuelt registrert fra dokumentene for denne landingsplassen (feltet tonn_lp).\n' +
                            'Tonn (beregnet): sum av tonn fra alle tilknyttede vann.\n\n' +
                            'Disse bør stemme overens. Avvik (markert med ⚠) betyr at vannenes tonn-verdier ikke summerer til det som står i dokumentene — oppdater vannene eller tonn (dok) for å korrigere.'
                          }
                        />
                      </span>
                      {lpSortField === 'tonn_lp' && (lpSortDirection === 'asc' ? ' ↑' : ' ↓')}
                    </TableHead>
                    <TableHead onClick={() => handleLpSort('calculated_tonn')} className="cursor-pointer font-semibold">
                      Tonn (beregnet) {lpSortField === 'calculated_tonn' && (lpSortDirection === 'asc' ? '↑' : '↓')}
                    </TableHead>
                    <TableHead onClick={() => handleLpSort('priority')} className="cursor-pointer font-semibold">
                      Vann {lpSortField === 'priority' && (lpSortDirection === 'asc' ? '↑' : '↓')}
                    </TableHead>
                    <TableHead onClick={() => handleLpSort('is_done')} className="cursor-pointer font-semibold">
                      Status {lpSortField === 'is_done' && (lpSortDirection === 'asc' ? '↑' : '↓')}
                    </TableHead>
                    <TableHead onClick={() => handleLpSort('is_active')} className="cursor-pointer font-semibold">
                      Active {lpSortField === 'is_active' && (lpSortDirection === 'asc' ? '↑' : '↓')}
                    </TableHead>
                    <TableHead className="text-right font-semibold">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedLandingsplasser.map((lp) => (
                    <TableRow key={lp.id} className={!lp.is_active ? 'opacity-60 bg-gray-50' : ''}>
                      <TableCell className="font-medium text-gray-500">{lp.id}</TableCell>
                      <TableCell className="font-medium">{lp.lp}</TableCell>
                      <TableCell>{lp.kode || '-'}</TableCell>
                      <TableCell>{lp.fylke || '-'}</TableCell>
                      <TableCell className="text-xs text-muted-foreground font-mono">
                        {lp.latitude && lp.longitude ? `${lp.latitude.toFixed(4)}, ${lp.longitude.toFixed(4)}` : '-'}
                      </TableCell>
                      <TableCell>{lp.tonn_lp != null ? lp.tonn_lp.toFixed(1) : '-'}</TableCell>
                      <TableCell>
                        {(() => {
                          const calc = lpTonnMap[lp.id];
                          if (!calc) return '-';
                          const doc = lp.tonn_lp;
                          const diff = doc != null ? calc - doc : 0;
                          const mismatch = doc != null && Math.abs(diff) > 0.1;
                          const diffColor =
                            diff > 0 ? 'text-red-600' : 'text-green-600';
                          return (
                            <span
                              className="inline-flex items-center gap-1"
                              title={
                                mismatch
                                  ? `Avvik: dokumentert ${doc!.toFixed(1)}t vs. beregnet ${calc.toFixed(1)}t (diff ${diff > 0 ? '+' : ''}${diff.toFixed(1)}t)`
                                  : undefined
                              }
                            >
                              {calc.toFixed(1)}
                              {mismatch && (
                                <>
                                  <span className={`${diffColor} font-medium`}>
                                    ({diff > 0 ? '+' : ''}{diff.toFixed(1)})
                                  </span>
                                  <AlertTriangle className={`w-3.5 h-3.5 ${diffColor}`} />
                                </>
                              )}
                            </span>
                          );
                        })()}
                      </TableCell>
                      <TableCell>{lpVannCountMap[lp.id] || 0}</TableCell>
                      <TableCell>
                        <Badge variant={lp.is_done ? 'default' : 'secondary'} className={lp.is_done ? 'bg-green-100 text-green-800 hover:bg-green-100' : 'bg-gray-100 text-gray-800 hover:bg-gray-100'}>
                          {lp.is_done ? 'Done' : 'Pending'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={lp.is_active ? 'default' : 'outline'} className={lp.is_active ? 'bg-blue-100 text-blue-800 hover:bg-blue-100' : 'text-gray-500 border-gray-300'}>
                          {lp.is_active ? 'Active' : 'Deactivated'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button size="sm" variant="ghost" onClick={() => handleLpEdit(lp)}>
                            <Edit className="w-4 h-4 text-gray-600" />
                            <span className="sr-only">Edit</span>
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleLpToggleActive(lp)}
                            title={lp.is_active ? 'Deactivate' : 'Activate'}
                          >
                            {lp.is_active ? (
                              <XCircle className="w-4 h-4 text-orange-500" />
                            ) : (
                              <CheckCircle className="w-4 h-4 text-green-500" />
                            )}
                            <span className="sr-only">{lp.is_active ? 'Deactivate' : 'Activate'}</span>
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-red-500 hover:text-red-600 hover:bg-red-50"
                            onClick={() => {
                              setLpToDelete(lp.id);
                              setLpDeleteDialogOpen(true);
                            }}
                          >
                            <Trash2 className="w-4 h-4" />
                            <span className="sr-only">Delete</span>
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </Card>
        </TabsContent>

        {/* Vann Tab */}
        <TabsContent value="vann" className="space-y-6">
          <div className="flex justify-between items-center">
            <h2 className="text-2xl font-semibold text-gray-800">Vann Markers ({vannMarkers.length})</h2>
            <Button onClick={handleVannAdd} className="gap-2 shadow-sm">
              <Plus className="w-4 h-4" /> Add New Vann Marker
            </Button>
          </div>

          <Card className="overflow-hidden border-gray-200 shadow-sm">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-gray-50/50 hover:bg-gray-50/50">
                    <TableHead onClick={() => handleVannSort('id')} className="cursor-pointer w-[80px] font-semibold">
                      ID {vannSortField === 'id' && (vannSortDirection === 'asc' ? '↑' : '↓')}
                    </TableHead>
                    <TableHead onClick={() => handleVannSort('name')} className="cursor-pointer font-semibold">
                      Name {vannSortField === 'name' && (vannSortDirection === 'asc' ? '↑' : '↓')}
                    </TableHead>
                    <TableHead onClick={() => handleVannSort('vannavn')} className="cursor-pointer font-semibold">
                      Vannavn {vannSortField === 'vannavn' && (vannSortDirection === 'asc' ? '↑' : '↓')}
                    </TableHead>
                    <TableHead onClick={() => handleVannSort('fylke')} className="cursor-pointer font-semibold">
                      Fylke {vannSortField === 'fylke' && (vannSortDirection === 'asc' ? '↑' : '↓')}
                    </TableHead>
                    <TableHead className="font-semibold">Coordinates</TableHead>
                    <TableHead onClick={() => handleVannSort('tonn')} className="cursor-pointer font-semibold">
                      Tonn {vannSortField === 'tonn' && (vannSortDirection === 'asc' ? '↑' : '↓')}
                    </TableHead>
                    <TableHead onClick={() => handleVannSort('marker_color')} className="cursor-pointer font-semibold">
                      Color {vannSortField === 'marker_color' && (vannSortDirection === 'asc' ? '↑' : '↓')}
                    </TableHead>
                    <TableHead onClick={() => handleVannSort('is_done')} className="cursor-pointer font-semibold">
                      Status {vannSortField === 'is_done' && (vannSortDirection === 'asc' ? '↑' : '↓')}
                    </TableHead>
                    <TableHead onClick={() => handleVannSort('is_active')} className="cursor-pointer font-semibold">
                      Active {vannSortField === 'is_active' && (vannSortDirection === 'asc' ? '↑' : '↓')}
                    </TableHead>
                    <TableHead className="text-right font-semibold">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedVannMarkers.map((vann) => (
                    <TableRow key={vann.id} className={!vann.is_active ? 'opacity-60 bg-gray-50' : ''}>
                      <TableCell className="font-medium text-gray-500">{vann.id}</TableCell>
                      <TableCell className="font-medium">{vann.name || '-'}</TableCell>
                      <TableCell>{vann.vannavn || '-'}</TableCell>
                      <TableCell>{vann.fylke || '-'}</TableCell>
                      <TableCell className="text-xs text-muted-foreground font-mono">
                        {vann.latitude && vann.longitude ? `${vann.latitude.toFixed(4)}, ${vann.longitude.toFixed(4)}` : '-'}
                      </TableCell>
                      <TableCell>{vann.tonn || '-'}</TableCell>
                      <TableCell>
                        <div
                          className="w-4 h-4 rounded-full border border-gray-200 shadow-sm"
                          style={{ backgroundColor: vann.marker_color || 'red' }}
                          title={vann.marker_color || 'red'}
                        />
                      </TableCell>
                      <TableCell>
                        <Badge variant={vann.is_done ? 'default' : 'secondary'} className={vann.is_done ? 'bg-green-100 text-green-800 hover:bg-green-100' : 'bg-gray-100 text-gray-800 hover:bg-gray-100'}>
                          {vann.is_done ? 'Done' : 'Pending'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={vann.is_active ? 'default' : 'outline'} className={vann.is_active ? 'bg-blue-100 text-blue-800 hover:bg-blue-100' : 'text-gray-500 border-gray-300'}>
                          {vann.is_active ? 'Active' : 'Deactivated'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button size="sm" variant="ghost" onClick={() => handleVannEdit(vann)}>
                            <Edit className="w-4 h-4 text-gray-600" />
                            <span className="sr-only">Edit</span>
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleVannToggleActive(vann)}
                            title={vann.is_active ? 'Deactivate' : 'Activate'}
                          >
                            {vann.is_active ? (
                              <XCircle className="w-4 h-4 text-orange-500" />
                            ) : (
                              <CheckCircle className="w-4 h-4 text-green-500" />
                            )}
                            <span className="sr-only">{vann.is_active ? 'Deactivate' : 'Activate'}</span>
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-red-500 hover:text-red-600 hover:bg-red-50"
                            onClick={() => {
                              setVannToDelete(vann.id);
                              setVannDeleteDialogOpen(true);
                            }}
                          >
                            <Trash2 className="w-4 h-4" />
                            <span className="sr-only">Delete</span>
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </Card>
        </TabsContent>

        {/* Hazards Tab */}
        <TabsContent value="hazards" className="space-y-6">
          <HazardsTab user={user} />
        </TabsContent>

        {/* Archive Tab */}
        <TabsContent value="archive" className="space-y-6">
          {/* Current Configuration Section */}
          <Card>
            <CardHeader>
              <CardTitle>Current Active Year</CardTitle>
              <CardDescription>The database configuration currently in use by the application.</CardDescription>
            </CardHeader>
            <CardContent>
              {currentConfig ? (
                <div className="flex items-center gap-4">
                  <div className="flex flex-col">
                    <span className="text-sm font-medium text-gray-500">Year</span>
                    <Badge variant="outline" className="text-base py-1 px-3 border-blue-200 bg-blue-50 text-blue-800">
                      {currentConfig.active_year === 'current' ? 'Current (No Archive)' : currentConfig.active_year}
                    </Badge>
                  </div>
                  {currentConfig.active_prefix && (
                    <>
                      <div className="h-8 w-px bg-gray-200" />
                      <div className="flex flex-col">
                        <span className="text-sm font-medium text-gray-500">Prefix</span>
                        <Badge variant="outline" className="text-base py-1 px-3 border-green-200 bg-green-50 text-green-800">
                          {currentConfig.active_prefix}
                        </Badge>
                      </div>
                    </>
                  )}
                </div>
              ) : (
                <p className="text-gray-600">Loading configuration...</p>
              )}
            </CardContent>
          </Card>

          {/* Switch Archive Section */}
          <Card>
            <CardHeader>
              <CardTitle>Switch Between Archives</CardTitle>
              <CardDescription>Select a different archive/year to work with. This changes which database tables the app uses.</CardDescription>
            </CardHeader>
            <CardContent>
              {availableArchives.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
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
                        className={`
                          relative flex items-center p-4 rounded-xl border-2 transition-all duration-200
                          ${isActive
                            ? 'border-green-500 bg-green-50/50 ring-1 ring-green-500/20'
                            : 'border-gray-200 hover:border-blue-300 hover:bg-blue-50/30 hover:shadow-sm'
                          }
                          ${switchingArchive ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
                        `}
                      >
                        <div className="flex-1 text-left">
                          <div className="flex items-center gap-3">
                            {isActive ? (
                              <div className="flex items-center justify-center w-6 h-6 rounded-full bg-green-100 text-green-600">
                                <CheckCircle className="w-4 h-4" />
                              </div>
                            ) : (
                              <div className="w-6 h-6 rounded-full border-2 border-gray-200" />
                            )}
                            <span className={`font-semibold ${isActive ? 'text-green-900' : 'text-gray-900'}`}>
                              {displayName}
                            </span>
                          </div>
                          {isActive && (
                            <div className="mt-2 ml-9 text-xs font-medium text-green-600">
                              Currently Active
                            </div>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="flex items-center justify-center p-8 text-muted-foreground">
                  <RefreshCw className="w-5 h-5 animate-spin mr-2" />
                  Loading available archives...
                </div>
              )}
            </CardContent>
          </Card>

          {/* Create New Year Archive Section */}
          <Card>
            <CardHeader>
              <CardTitle>Create New Year Archive</CardTitle>
              <CardDescription>Create a new year-based archive to preserve current data and start fresh.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="bg-yellow-50 border border-yellow-100 rounded-lg p-4 text-sm text-yellow-800">
                <h4 className="font-semibold mb-2 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4" />
                  This action will:
                </h4>
                <ul className="list-disc list-inside space-y-1 ml-1">
                  <li>Create new empty tables for the specified year</li>
                  <li>Make current tables READ-ONLY (archived)</li>
                  <li>Switch the app to use the new year tables</li>
                  <li>Generate a migration SQL that you need to run</li>
                </ul>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
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
                <div className="space-y-2">
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

              <div className="bg-gray-50 rounded-lg p-4 border border-gray-100">
                <h3 className="text-sm font-medium text-gray-900 mb-2">Table Name Preview:</h3>
                <code className="text-sm bg-white px-2 py-1 rounded border border-gray-200 block w-fit text-blue-600 font-mono">
                  {archiveYear && archiveYear.trim() !== '' ? (
                    `${archiveYear}${archivePrefix ? `_${archivePrefix}` : ''}_vass_vann`
                  ) : (
                    'Enter a year to see preview'
                  )}
                </code>
              </div>

              <div className="flex justify-end">
                <Button
                  onClick={handleArchiveSubmit}
                  disabled={archiveLoading || !archiveYear || archiveYear.trim() === ''}
                  className="bg-blue-600 hover:bg-blue-700 text-white"
                >
                  {archiveLoading ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin mr-2" />
                      Generating...
                    </>
                  ) : (
                    'Generate Archive Migration'
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Tables List Section */}
          <Card>
            <CardHeader>
              <CardTitle>Tables Managed by Archive System</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
                  <div key={tableName} className="flex items-center gap-2 p-2.5 bg-gray-50 rounded-md border border-gray-100">
                    <Database className="w-4 h-4 text-gray-400" />
                    <span className="font-mono text-sm text-gray-600">{tableName}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Planning Tab */}
        <TabsContent value="planning" className="space-y-6">
          {tableNames && user?.email && (
            <PlanningTab tableNames={tableNames} userEmail={user.email} />
          )}
        </TabsContent>

        {/* Year Comparison Tab */}
        <TabsContent value="comparison" className="space-y-6">
          {availableArchives && currentConfig && (
            <YearComparisonTab
              availableYears={availableArchives.map(a => ({
                year: a.year,
                prefix: a.prefix,
                label: a.year === 'current'
                  ? '2025 (Original Data)'
                  : `${a.year}${a.prefix ? ` (${a.prefix})` : ''}`,
              }))}
              currentYear={currentConfig?.active_year || 'current'}
            />
          )}
        </TabsContent>

        {/* Changelog Tab */}
        <TabsContent value="changelog" className="space-y-6">
          {availableArchives && currentConfig && (
            <ChangelogTab
              availableYears={availableArchives.map(a => ({
                year: a.year,
                prefix: a.prefix,
                label: a.year === 'current'
                  ? '2025 (Original Data)'
                  : `${a.year}${a.prefix ? ` (${a.prefix})` : ''}`,
              }))}
              currentYear={currentConfig?.active_year || 'current'}
            />
          )}
        </TabsContent>
      </Tabs>

      {/* Landingsplass Dialog */}
      <Dialog open={lpDialogOpen} onOpenChange={setLpDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {currentLp?.id ? 'Edit Landingsplass' : 'Add New Landingsplass'}
            </DialogTitle>
            <DialogDescription>
              {currentLp?.id ? 'Update the details of the landingsplass.' : 'Enter the details for the new landingsplass.'}
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-2 gap-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="lp">LP Code *</Label>
              <Input
                id="lp"
                value={currentLp?.lp || ''}
                onChange={(e) => setCurrentLp({ ...currentLp, lp: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="kode">Kode</Label>
              <Input
                id="kode"
                value={currentLp?.kode || ''}
                onChange={(e) => setCurrentLp({ ...currentLp, kode: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="kontaktperson">Kontaktperson</Label>
              <Input
                id="kontaktperson"
                value={currentLp?.kontaktperson || ''}
                onChange={(e) => setCurrentLp({ ...currentLp, kontaktperson: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="forening">Forening</Label>
              <Input
                id="forening"
                value={currentLp?.forening || ''}
                onChange={(e) => setCurrentLp({ ...currentLp, forening: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="fylke">Fylke</Label>
              <Input
                id="fylke"
                value={currentLp?.fylke || ''}
                onChange={(e) => setCurrentLp({ ...currentLp, fylke: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="tonn_lp">Tonn</Label>
              <Input
                id="tonn_lp"
                type="number"
                value={currentLp?.tonn_lp || ''}
                onChange={(e) => setCurrentLp({ ...currentLp, tonn_lp: parseFloat(e.target.value) || null })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="priority">Priority</Label>
              <Input
                id="priority"
                type="number"
                value={currentLp?.priority || ''}
                onChange={(e) => setCurrentLp({ ...currentLp, priority: parseInt(e.target.value) || null })}
              />
            </div>

            <div className="flex items-end pb-2">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="is_done_lp"
                  checked={currentLp?.is_done || false}
                  onCheckedChange={(checked) => setCurrentLp({ ...currentLp, is_done: checked as boolean })}
                />
                <Label htmlFor="is_done_lp" className="cursor-pointer">Is Done</Label>
              </div>
            </div>

            <div className="col-span-2 space-y-2">
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
                  <MapPin className="w-4 h-4 mr-2" />
                  Select on Map
                </Button>
              </div>
            </div>

            <div className="col-span-2 space-y-2">
              <Label htmlFor="comment_lp">Comment</Label>
              <Textarea
                id="comment_lp"
                value={currentLp?.comment || ''}
                onChange={(e) => setCurrentLp({ ...currentLp, comment: e.target.value })}
                rows={3}
              />
            </div>

            {/* Associated Vann Markers Section */}
            {currentLp?.id && (
              <div className="col-span-2 mt-4 border-t pt-4">
                <Label className="text-base font-semibold mb-3 block">
                  Associated Vann Markers ({associatedVannMarkers.length})
                </Label>

                {associatedVannMarkers.length > 0 ? (
                  <div className="space-y-2 max-h-60 overflow-y-auto pr-2">
                    {associatedVannMarkers.map((vann) => (
                      <div
                        key={vann.id}
                        className={`p-3 rounded-lg border ${vann.is_active ? 'bg-gray-50 border-gray-200' : 'bg-gray-100 border-gray-200 opacity-70'}`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex-1">
                            <div className="font-medium text-sm">
                              {vann.name || vann.vannavn || 'Unnamed'}
                            </div>
                            <div className="text-xs text-muted-foreground mt-0.5">
                              ID: {vann.id} • Fylke: {vann.fylke || 'N/A'}
                              {vann.tonn && ` • Tonn: ${vann.tonn}`}
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            <Badge variant={vann.is_active ? 'default' : 'outline'} className={vann.is_active ? 'bg-blue-100 text-blue-800 hover:bg-blue-100' : 'text-gray-500 border-gray-300'}>
                              {vann.is_active ? 'Active' : 'Deactivated'}
                            </Badge>

                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleVannToggleActiveFromLpModal(vann)}
                              title={vann.is_active ? 'Deactivate' : 'Activate'}
                            >
                              {vann.is_active ? (
                                <XCircle className="w-4 h-4 text-orange-500" />
                              ) : (
                                <CheckCircle className="w-4 h-4 text-green-500" />
                              )}
                            </Button>
                          </div>
                        </div>

                        <div className="mt-2">
                          <Select
                            value={currentLp?.id?.toString() || ''}
                            onValueChange={(value) => {
                              const newLpId = parseInt(value);
                              if (newLpId !== currentLp?.id) {
                                handleReassociateVann(vann.id, newLpId);
                              }
                            }}
                          >
                            <SelectTrigger className="h-8 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="max-h-[300px]">
                              {landingsplasser.map((lp) => (
                                <SelectItem key={lp.id} value={lp.id.toString()}>
                                  {lp.kode || 'No code'} - {lp.lp}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground italic">
                    No vann markers associated with this landingsplass
                  </p>
                )}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setLpDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleLpSave}>Save Changes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Vann Dialog */}
      <Dialog open={vannDialogOpen} onOpenChange={setVannDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {currentVann?.id ? 'Edit Vann Marker' : 'Add New Vann Marker'}
            </DialogTitle>
            <DialogDescription>
              {currentVann?.id ? 'Update the details of the vann marker.' : 'Enter the details for the new vann marker.'}
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-2 gap-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">Name *</Label>
              <Input
                id="name"
                value={currentVann?.name || ''}
                onChange={(e) => setCurrentVann({ ...currentVann, name: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="vannavn">Vannavn</Label>
              <Input
                id="vannavn"
                value={currentVann?.vannavn || ''}
                onChange={(e) => setCurrentVann({ ...currentVann, vannavn: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="pnr">PNR</Label>
              <Input
                id="pnr"
                type="number"
                value={currentVann?.pnr || ''}
                onChange={(e) => setCurrentVann({ ...currentVann, pnr: parseInt(e.target.value) || null })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="fylke_vann">Fylke</Label>
              <Input
                id="fylke_vann"
                value={currentVann?.fylke || ''}
                onChange={(e) => setCurrentVann({ ...currentVann, fylke: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="tonn">Tonn</Label>
              <Input
                id="tonn"
                value={currentVann?.tonn || ''}
                onChange={(e) => setCurrentVann({ ...currentVann, tonn: e.target.value })}
              />
            </div>

            <div className="space-y-2">
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

            <div className="space-y-2">
              <Label htmlFor="kontaktperson_vann">Kontaktperson</Label>
              <Input
                id="kontaktperson_vann"
                value={currentVann?.kontaktperson || ''}
                onChange={(e) => setCurrentVann({ ...currentVann, kontaktperson: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="forening_vann">Forening</Label>
              <Input
                id="forening_vann"
                value={currentVann?.forening || ''}
                onChange={(e) => setCurrentVann({ ...currentVann, forening: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="phone">Phone</Label>
              <Input
                id="phone"
                type="number"
                value={currentVann?.phone || ''}
                onChange={(e) => setCurrentVann({ ...currentVann, phone: parseInt(e.target.value) || null })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="email_vann">Email</Label>
              <Input
                id="email_vann"
                type="email"
                value={currentVann?.email || ''}
                onChange={(e) => setCurrentVann({ ...currentVann, email: e.target.value })}
              />
            </div>

            <div className="col-span-2 space-y-2">
              <Label htmlFor="address">Address</Label>
              <Input
                id="address"
                value={currentVann?.address || ''}
                onChange={(e) => setCurrentVann({ ...currentVann, address: e.target.value })}
              />
            </div>

            <div className="col-span-2 space-y-2">
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
                  <MapPin className="w-4 h-4 mr-2" />
                  Select on Map
                </Button>
              </div>
            </div>

            <div className="col-span-2 space-y-2">
              <Label htmlFor="association">Associated Landingsplass</Label>
              <Select
                value={selectedAssociation?.toString() || 'none'}
                onValueChange={(value) => setSelectedAssociation(value === 'none' ? null : parseInt(value))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a landingsplass..." />
                </SelectTrigger>
                <SelectContent className="max-h-[300px]">
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
              <Label htmlFor="is_done_vann" className="cursor-pointer">Is Done</Label>
            </div>

            <div className="col-span-2 space-y-2">
              <Label htmlFor="comment_vann">Comment</Label>
              <Textarea
                id="comment_vann"
                value={currentVann?.comment || ''}
                onChange={(e) => setCurrentVann({ ...currentVann, comment: e.target.value })}
                rows={3}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setVannDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleVannSave}>Save Changes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Landingsplass Dialog */}
      <AlertDialog open={lpDeleteDialogOpen} onOpenChange={setLpDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the landingsplass and remove all associated data from our servers.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleLpDelete} className="bg-red-600 hover:bg-red-700">
              Delete Landingsplass
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Vann Dialog */}
      <AlertDialog open={vannDeleteDialogOpen} onOpenChange={setVannDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the vann marker and remove all associations with landingsplasser.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleVannDelete} className="bg-red-600 hover:bg-red-700">
              Delete Vann Marker
            </AlertDialogAction>
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
  );
}
