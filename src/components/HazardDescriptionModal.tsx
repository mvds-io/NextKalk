'use client';

import { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';

interface Props {
  open: boolean;
  mode: 'create' | 'edit';
  geometryKind?: 'circle' | 'polyline';
  initialDescription?: string;
  onSave: (description: string) => Promise<void> | void;
  onCancel: () => void;
}

export default function HazardDescriptionModal({
  open,
  mode,
  geometryKind,
  initialDescription = '',
  onSave,
  onCancel,
}: Props) {
  const [description, setDescription] = useState(initialDescription);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setDescription(initialDescription);
      setSaving(false);
    }
  }, [open, initialDescription]);

  const title =
    mode === 'create'
      ? geometryKind === 'polyline'
        ? 'Ny fare (linje)'
        : 'Ny fare (sirkel)'
      : 'Rediger fare';

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave(description.trim());
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o && !saving) onCancel();
      }}
    >
      <DialogContent className="sm:max-w-md" style={{ zIndex: 10001 }}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="space-y-2">
          <label htmlFor="hazard-desc" className="text-sm font-medium">
            Beskrivelse
          </label>
          <Textarea
            id="hazard-desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="F.eks. Høyspentledning 22 kV, kabel mellom mast 3 og 4"
            rows={4}
            autoFocus
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel} disabled={saving}>
            Avbryt
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? 'Lagrer…' : 'Lagre'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
