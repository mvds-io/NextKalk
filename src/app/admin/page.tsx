'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
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
    if (user) {
      loadLandingsplasser();
      loadVannMarkers();
    }
  }, [user]);

  const loadLandingsplasser = async () => {
    const { data, error } = await supabase
      .from('vass_lasteplass')
      .select('*')
      .order('id', { ascending: true });

    if (error) {
      console.error('Error loading landingsplasser:', error);
    } else {
      setLandingsplasser(data || []);
    }
  };

  const loadVannMarkers = async () => {
    const { data, error } = await supabase
      .from('vass_vann')
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
    if (!currentLp) return;

    try {
      if (currentLp.id) {
        // Update
        const { error } = await supabase
          .from('vass_lasteplass')
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
          .from('vass_lasteplass')
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
    if (!lpToDelete) return;

    try {
      const { error } = await supabase
        .from('vass_lasteplass')
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
    setCurrentVann(vann);

    // Load existing association
    const { data: associations } = await supabase
      .from('vass_associations')
      .select('landingsplass_id')
      .eq('airport_id', vann.id)
      .limit(1)
      .single();

    setSelectedAssociation(associations?.landingsplass_id || null);
    setVannDialogOpen(true);
  };

  const handleVannSave = async () => {
    if (!currentVann) return;

    try {
      let vannId = currentVann.id;

      if (currentVann.id) {
        // Update
        const { error } = await supabase
          .from('vass_vann')
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
          // Delete existing associations for this vann
          await supabase
            .from('vass_associations')
            .delete()
            .eq('airport_id', currentVann.id);

          // Insert new association
          await supabase
            .from('vass_associations')
            .insert({
              airport_id: currentVann.id,
              landingsplass_id: selectedAssociation,
            });
        } else {
          // Remove all associations
          await supabase
            .from('vass_associations')
            .delete()
            .eq('airport_id', currentVann.id);
        }

        alert('Vann marker updated successfully!');
      } else {
        // Insert
        const { data, error } = await supabase
          .from('vass_vann')
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
          await supabase
            .from('vass_associations')
            .insert({
              airport_id: vannId,
              landingsplass_id: selectedAssociation,
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
    if (!vannToDelete) return;

    try {
      // Associations will be deleted automatically due to foreign key cascade
      const { error } = await supabase
        .from('vass_vann')
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

  if (loading) {
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
            <Button
              variant="outline"
              onClick={() => router.push('/')}
              style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
            >
              <i className="fas fa-arrow-left"></i>
              Back to Map
            </Button>
          </div>
          <h1 className="text-3xl font-bold" style={{ fontSize: '1.875rem', fontWeight: 'bold', marginBottom: '0.5rem' }}>Admin Panel</h1>
          <p className="text-muted-foreground" style={{ color: '#6b7280' }}>Manage landingsplasser and vann markers</p>
        </div>

      <Tabs defaultValue="landingsplass" className="w-full">
        <TabsList className="grid w-full grid-cols-2 max-w-md">
          <TabsTrigger value="landingsplass">Landingsplasser</TabsTrigger>
          <TabsTrigger value="vann">Vann Markers</TabsTrigger>
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
