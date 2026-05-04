'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import HazardDescriptionModal from '@/components/HazardDescriptionModal';
import { loadHazards, updateHazard, deleteHazard } from '@/lib/hazards';
import type { Hazard, User } from '@/types';
import { MapPin, Pencil, Trash2, Loader2 } from 'lucide-react';

interface Props {
  user: User | null;
}

export default function HazardsTab({ user }: Props) {
  const router = useRouter();
  const [hazards, setHazards] = useState<Hazard[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Hazard | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  const refresh = async () => {
    setLoading(true);
    try {
      const data = await loadHazards();
      setHazards(data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  const handleViewOnMap = (id: number) => {
    router.push(`/?hazard=${id}`);
  };

  const handleDelete = async (h: Hazard) => {
    if (!window.confirm(`Slett fare #${h.id}? Dette kan ikke angres.`)) return;
    setBusyId(h.id);
    try {
      await deleteHazard(h, user);
      await refresh();
    } catch (err) {
      console.error('Failed to delete hazard:', err);
      alert('Kunne ikke slette fare.');
    } finally {
      setBusyId(null);
    }
  };

  const handleSaveEdit = async (description: string) => {
    if (!editing) return;
    try {
      await updateHazard(editing.id, { description }, editing, user);
      setEditing(null);
      await refresh();
    } catch (err) {
      console.error('Failed to update hazard:', err);
      alert('Kunne ikke oppdatere fare.');
    }
  };

  const formatCenter = (h: Hazard) => {
    if (h.center_lat == null || h.center_lng == null) return '—';
    return `${h.center_lat.toFixed(5)}, ${h.center_lng.toFixed(5)}`;
  };

  const formatSize = (h: Hazard) => {
    if (h.geometry_type === 'circle') {
      const r = h.geometry?.radius_m;
      return r != null ? `${Math.round(r)} m radius` : '—';
    }
    return `${h.geometry?.points?.length ?? 0} punkter`;
  };

  const formatDate = (iso?: string) => {
    if (!iso) return '—';
    try {
      return new Date(iso).toLocaleString('nb-NO', { dateStyle: 'short', timeStyle: 'short' });
    } catch {
      return iso;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-semibold text-gray-800">Farer ({hazards.length})</h2>
        <span className="text-sm text-gray-500">
          Tegn nye farer fra kartet (høyreklikk eller hold inne).
        </span>
      </div>

      <Card className="overflow-hidden border-gray-200 shadow-sm">
        {loading ? (
          <div className="p-12 text-center text-gray-500">
            <Loader2 className="w-6 h-6 animate-spin inline-block mr-2" />
            Laster farer…
          </div>
        ) : hazards.length === 0 ? (
          <div className="p-12 text-center text-gray-500">
            Ingen farer registrert ennå.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-16">ID</TableHead>
                  <TableHead className="w-24">Type</TableHead>
                  <TableHead>Beskrivelse</TableHead>
                  <TableHead className="w-48">Senter</TableHead>
                  <TableHead className="w-40">Størrelse</TableHead>
                  <TableHead className="w-48">Opprettet av</TableHead>
                  <TableHead className="w-40">Opprettet</TableHead>
                  <TableHead className="w-56 text-right">Handlinger</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {hazards.map((h) => (
                  <TableRow key={h.id}>
                    <TableCell className="font-mono text-xs">{h.id}</TableCell>
                    <TableCell>
                      <Badge variant={h.geometry_type === 'circle' ? 'default' : 'secondary'}>
                        {h.geometry_type === 'circle' ? 'Sirkel' : 'Linje'}
                      </Badge>
                    </TableCell>
                    <TableCell className="max-w-md">
                      <span className="text-sm text-gray-700">
                        {h.description
                          ? h.description.length > 80
                            ? `${h.description.slice(0, 80)}…`
                            : h.description
                          : <em className="text-gray-400">Ingen beskrivelse</em>}
                      </span>
                    </TableCell>
                    <TableCell className="font-mono text-xs">{formatCenter(h)}</TableCell>
                    <TableCell className="text-sm">{formatSize(h)}</TableCell>
                    <TableCell className="text-sm text-gray-600">{h.created_by ?? '—'}</TableCell>
                    <TableCell className="text-sm text-gray-600">{formatDate(h.created_at)}</TableCell>
                    <TableCell className="text-right">
                      <div className="inline-flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleViewOnMap(h.id)}
                          title="Vis på kart"
                        >
                          <MapPin className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setEditing(h)}
                          title="Rediger beskrivelse"
                        >
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleDelete(h)}
                          disabled={busyId === h.id}
                          title="Slett"
                          className="text-red-600 hover:text-red-700 hover:bg-red-50"
                        >
                          {busyId === h.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>

      <HazardDescriptionModal
        open={!!editing}
        mode="edit"
        geometryKind={editing?.geometry_type}
        initialDescription={editing?.description ?? ''}
        onSave={handleSaveEdit}
        onCancel={() => setEditing(null)}
      />
    </div>
  );
}
