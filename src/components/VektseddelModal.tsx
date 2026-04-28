'use client';

import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useTableNames } from '@/contexts/TableNamesContext';
import { exportVektseddelToPDF } from '@/lib/pdfExport';
import type { User, VektseddelEntry, Landingsplass } from '@/types';

interface VektseddelModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: User | null;
}

type DraftEntry = {
  id?: number;
  lp_id: number | null;
  dato: string;
  prosjekt: string;
  lp_nr: string;
  lp_tonn: string;
  rest_lp: string;
  vektseddel_nr: string;
  tonn_inn: string;
  tonn_ut: string;
  merknader: string;
  sign_teamleder: string;
};

type VektseddelImageRow = {
  id: number;
  vektseddel_id: number | null;
  image_url: string;
  storage_path: string | null;
  created_at?: string;
};

const emptyDraft = (autoSign = ''): DraftEntry => ({
  lp_id: null,
  dato: new Date().toISOString().slice(0, 10),
  prosjekt: '',
  lp_nr: '',
  lp_tonn: '',
  rest_lp: '',
  vektseddel_nr: '',
  tonn_inn: '',
  tonn_ut: '',
  merknader: '',
  sign_teamleder: autoSign,
});

const deriveSign = (user: User | null): string => {
  if (!user) return '';
  if (user.display_name && user.display_name.trim()) return user.display_name.trim();
  const email = user.email || '';
  return email.includes('@') ? email.split('@')[0] : email;
};

const toNum = (s: string): number | null => {
  if (!s || s.trim() === '') return null;
  const n = parseFloat(s.replace(',', '.'));
  return isNaN(n) ? null : n;
};

const fmt = (n: number | null): string => {
  if (n === null || n === undefined) return '';
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
};

const extractLpNumber = (kode: string | null | undefined): string => {
  if (!kode) return '';
  const tail = kode.split('-').slice(1).join('-');
  return tail.match(/\d+/)?.[0] || '';
};

const formatImageTimestamp = (iso: string | null | undefined): string => {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleString('nb-NO', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
};

// Excel formulas:
// Tonn Akk (I) = LP tonn (D) − Rest LP (E) + Tonn ut (H)
// Rest LP after (J) = Tonn Akk (I) − LP tonn (D)
// Rest Vekts (K) = Tonn inn (G) − Tonn ut (H)
function computeDerived(d: DraftEntry) {
  const D = toNum(d.lp_tonn);
  const E = toNum(d.rest_lp);
  const G = toNum(d.tonn_inn);
  const H = toNum(d.tonn_ut);
  const tonn_akk = D !== null && E !== null && H !== null ? D - E + H : null;
  const rest_lp2 = tonn_akk !== null && D !== null ? tonn_akk - D : null;
  const rest_vekts = G !== null && H !== null ? G - H : null;
  return { tonn_akk, rest_lp2, rest_vekts };
}

function draftFromEntry(e: VektseddelEntry): DraftEntry {
  return {
    id: e.id,
    lp_id: e.lp_id ?? null,
    dato: e.dato ?? '',
    prosjekt: e.prosjekt ?? '',
    lp_nr: e.lp_nr ?? '',
    lp_tonn: e.lp_tonn !== null && e.lp_tonn !== undefined ? String(e.lp_tonn) : '',
    rest_lp: e.rest_lp !== null && e.rest_lp !== undefined ? String(e.rest_lp) : '',
    vektseddel_nr: e.vektseddel_nr ?? '',
    tonn_inn: e.tonn_inn !== null && e.tonn_inn !== undefined ? String(e.tonn_inn) : '',
    tonn_ut: e.tonn_ut !== null && e.tonn_ut !== undefined ? String(e.tonn_ut) : '',
    merknader: e.merknader ?? '',
    sign_teamleder: e.sign_teamleder ?? '',
  };
}

export default function VektseddelModal({ isOpen, onClose, user }: VektseddelModalProps) {
  const { tableNames } = useTableNames();
  const canEdit = !!user?.can_edit_markers;

  const [entries, setEntries] = useState<VektseddelEntry[]>([]);
  const [landingsplasser, setLandingsplasser] = useState<Landingsplass[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string>('');

  const currentYear = new Date().getFullYear();
  const [yearFilter, setYearFilter] = useState<string>(String(currentYear));

  const [draft, setDraft] = useState<DraftEntry>(emptyDraft(deriveSign(user)));
  const [editingId, setEditingId] = useState<number | null>(null);
  const [lpSearch, setLpSearch] = useState<string>('');
  const [lpSuggestOpen, setLpSuggestOpen] = useState<boolean>(false);

  const [galleryImages, setGalleryImages] = useState<VektseddelImageRow[]>([]);
  const [selectedImageIds, setSelectedImageIds] = useState<Set<number>>(new Set());
  const [uploadingImage, setUploadingImage] = useState(false);
  const [imageCounts, setImageCounts] = useState<Record<number, number>>({});
  const [previewImages, setPreviewImages] = useState<VektseddelImageRow[] | null>(null);
  const [galleryCollapsed, setGalleryCollapsed] = useState<boolean>(true);

  const lpInputRef = useRef<HTMLInputElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const loadEntries = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data, error } = await supabase
        .from('vektseddel')
        .select('*')
        .order('dato', { ascending: false, nullsFirst: false })
        .order('id', { ascending: false });
      if (error) throw error;
      setEntries((data as VektseddelEntry[]) || []);
    } catch (e) {
      console.error('Error loading vektseddel:', e);
      setError('Kunne ikke laste vektsedler');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadLandingsplasser = useCallback(async () => {
    if (!tableNames) return;
    try {
      const { data, error } = await supabase
        .from(tableNames.vass_lasteplass)
        .select('id, lp, kode, tonn_lp, latitude, longitude')
        .order('kode', { ascending: true });
      if (error) throw error;
      setLandingsplasser((data as Landingsplass[]) || []);
    } catch (e) {
      console.error('Error loading landingsplasser:', e);
    }
  }, [tableNames]);

  const loadImageCounts = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('vektseddel_images')
        .select('vektseddel_id');
      if (error) throw error;
      const counts: Record<number, number> = {};
      (data || []).forEach((r: { vektseddel_id: number }) => {
        counts[r.vektseddel_id] = (counts[r.vektseddel_id] || 0) + 1;
      });
      setImageCounts(counts);
    } catch (e) {
      console.error('Error loading image counts:', e);
    }
  }, []);

  // Gallery shows unattached images plus images attached to the row currently being edited.
  const loadGallery = useCallback(async (currentEditingId: number | null) => {
    try {
      let query = supabase.from('vektseddel_images').select('*');
      if (currentEditingId != null) {
        query = query.or(`vektseddel_id.is.null,vektseddel_id.eq.${currentEditingId}`);
      } else {
        query = query.is('vektseddel_id', null);
      }
      const { data, error } = await query.order('created_at', { ascending: false });
      if (error) throw error;
      const rows = (data as VektseddelImageRow[]) || [];
      setGalleryImages(rows);
      if (currentEditingId != null) {
        const attached = rows.filter((r) => r.vektseddel_id === currentEditingId);
        setSelectedImageIds(new Set(attached.map((r) => r.id)));
        if (attached.length > 0) setGalleryCollapsed(false);
      } else {
        setSelectedImageIds(new Set());
      }
    } catch (e) {
      console.error('Error loading gallery:', e);
      setGalleryImages([]);
      setSelectedImageIds(new Set());
    }
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    loadEntries();
    loadLandingsplasser();
    loadImageCounts();
  }, [isOpen, loadEntries, loadLandingsplasser, loadImageCounts]);

  useEffect(() => {
    if (!isOpen) return;
    loadGallery(editingId);
  }, [isOpen, editingId, loadGallery]);

  useEffect(() => {
    if (!isOpen) {
      setDraft(emptyDraft(deriveSign(user)));
      setEditingId(null);
      setLpSearch('');
      setLpSuggestOpen(false);
      setError('');
      setGalleryImages([]);
      setSelectedImageIds(new Set());
      setPreviewImages(null);
      setGalleryCollapsed(true);
    }
  }, [isOpen, user]);

  const lpSuggestions = useMemo(() => {
    const q = lpSearch.trim().toLowerCase();
    if (!q) return landingsplasser.slice(0, 10);
    return landingsplasser
      .filter((lp) => {
        const kode = (lp.kode || '').toLowerCase();
        const lpNr = (lp.lp || '').toLowerCase();
        return kode.includes(q) || lpNr.includes(q);
      })
      .slice(0, 10);
  }, [landingsplasser, lpSearch]);

  const filteredEntries = useMemo(() => {
    if (yearFilter === 'all') return entries;
    return entries.filter((e) => (e.dato ? e.dato.slice(0, 4) === yearFilter : false));
  }, [entries, yearFilter]);

  const availableYears = useMemo(() => {
    const ys = new Set<string>();
    entries.forEach((e) => {
      if (e.dato) ys.add(e.dato.slice(0, 4));
    });
    ys.add(String(currentYear));
    return Array.from(ys).sort((a, b) => b.localeCompare(a));
  }, [entries, currentYear]);

  const selectLp = (lp: Landingsplass) => {
    const prosjektPrefix = lp.kode ? lp.kode.split('-')[0].trim() : '';
    const kodeNumber = extractLpNumber(lp.kode);
    setDraft((d) => ({
      ...d,
      lp_id: lp.id,
      lp_nr: kodeNumber || lp.lp || '',
      lp_tonn: lp.tonn_lp !== null && lp.tonn_lp !== undefined ? String(lp.tonn_lp) : d.lp_tonn,
      prosjekt: prosjektPrefix || d.prosjekt,
    }));
    setLpSearch(lp.kode ? `${lp.kode} — LP ${lp.lp || ''}` : `LP ${lp.lp || ''}`);
    setLpSuggestOpen(false);
  };

  const beginEdit = (e: VektseddelEntry) => {
    setEditingId(e.id);
    const d = draftFromEntry(e);
    setDraft(d);
    const lp = landingsplasser.find((x) => x.id === e.lp_id);
    setLpSearch(lp ? (lp.kode ? `${lp.kode} — LP ${lp.lp || ''}` : `LP ${lp.lp || ''}`) : e.lp_nr || '');
    // gallery + selection are reloaded by the editingId effect
  };

  const cancelEdit = () => {
    setEditingId(null);
    setDraft(emptyDraft(deriveSign(user)));
    setLpSearch('');
    // gallery + selection are reloaded by the editingId effect
  };

  const uploadFileToGallery = async (file: File): Promise<VektseddelImageRow | null> => {
    const fileExt = (file.name.split('.').pop() || 'jpg').toLowerCase();
    const safeExt = fileExt.replace(/[^a-z0-9]/g, '') || 'jpg';
    const filePath = `gallery/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${safeExt}`;
    const { error: upErr } = await supabase.storage
      .from('vektseddel-images')
      .upload(filePath, file, { contentType: file.type || 'image/jpeg', upsert: false });
    if (upErr) throw upErr;
    const { data: pub } = supabase.storage.from('vektseddel-images').getPublicUrl(filePath);
    const { data: row, error: insErr } = await supabase
      .from('vektseddel_images')
      .insert({
        vektseddel_id: null,
        image_url: pub.publicUrl,
        storage_path: filePath,
        uploaded_by: user?.email || null,
      })
      .select()
      .single();
    if (insErr) throw insErr;
    return row as VektseddelImageRow;
  };

  const handlePickImages = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const fileArr = Array.from(files);
    void (async () => {
      setUploadingImage(true);
      try {
        const newRows: VektseddelImageRow[] = [];
        for (const file of fileArr) {
          const row = await uploadFileToGallery(file);
          if (row) newRows.push(row);
        }
        if (newRows.length > 0) {
          setGalleryImages((prev) => [...newRows, ...prev]);
          // Auto-select freshly uploaded images for the current draft
          setSelectedImageIds((prev) => {
            const s = new Set(prev);
            newRows.forEach((r) => s.add(r.id));
            return s;
          });
          setGalleryCollapsed(false);
        }
      } catch (err) {
        console.error('Error uploading image:', err);
        const msg = (err as { message?: string })?.message;
        setError(msg ? `Kunne ikke laste opp bilde: ${msg}` : 'Kunne ikke laste opp bilde');
      } finally {
        setUploadingImage(false);
      }
    })();
  };

  const removeGalleryImage = async (img: VektseddelImageRow) => {
    if (!canEdit) return;
    const warn = img.vektseddel_id != null
      ? 'Bildet er knyttet til en linje. Slette bildet permanent?'
      : 'Slette dette bildet?';
    if (!confirm(warn)) return;
    try {
      if (img.storage_path) {
        await supabase.storage.from('vektseddel-images').remove([img.storage_path]);
      }
      const { error } = await supabase.from('vektseddel_images').delete().eq('id', img.id);
      if (error) throw error;
      setGalleryImages((prev) => prev.filter((x) => x.id !== img.id));
      setSelectedImageIds((prev) => {
        const s = new Set(prev);
        s.delete(img.id);
        return s;
      });
      await loadImageCounts();
    } catch (err) {
      console.error('Error deleting image:', err);
      setError('Kunne ikke slette bilde');
    }
  };

  const toggleSelectImage = (img: VektseddelImageRow) => {
    if (img.vektseddel_id != null && img.vektseddel_id !== editingId) return;
    setSelectedImageIds((prev) => {
      const s = new Set(prev);
      if (s.has(img.id)) s.delete(img.id);
      else s.add(img.id);
      return s;
    });
  };

  const openPreviewForEntry = async (vektseddelId: number) => {
    try {
      const { data, error } = await supabase
        .from('vektseddel_images')
        .select('*')
        .eq('vektseddel_id', vektseddelId)
        .order('created_at', { ascending: true });
      if (error) throw error;
      setPreviewImages((data as VektseddelImageRow[]) || []);
    } catch (e) {
      console.error('Error loading images for preview:', e);
    }
  };

  const saveDraft = async () => {
    if (!canEdit || !user) return;
    if (!draft.lp_id) {
      setError('Velg en landingsplass');
      return;
    }
    if (!draft.dato) {
      setError('Dato er påkrevd');
      return;
    }
    setSaving(true);
    setError('');
    try {
      // tonn_akk, rest_lp2, rest_vekts are GENERATED columns in Postgres — must not be sent.
      const payload = {
        lp_id: draft.lp_id,
        dato: draft.dato || null,
        prosjekt: draft.prosjekt || null,
        lp_nr: draft.lp_nr || null,
        lp_tonn: toNum(draft.lp_tonn),
        rest_lp: toNum(draft.rest_lp),
        vektseddel_nr: draft.vektseddel_nr || null,
        tonn_inn: toNum(draft.tonn_inn),
        tonn_ut: toNum(draft.tonn_ut),
        merknader: draft.merknader || null,
        sign_teamleder: draft.sign_teamleder || null,
      };

      let savedId: number | null = null;
      if (editingId != null) {
        const { error } = await supabase.from('vektseddel').update(payload).eq('id', editingId);
        if (error) throw error;
        savedId = editingId;
        await supabase.from('user_action_logs').insert({
          user_email: user.email,
          action_type: 'edit_vektseddel',
          target_type: 'vektseddel',
          target_id: editingId,
          target_name: payload.vektseddel_nr || `LP ${payload.lp_nr || ''}`,
          action_details: payload,
        });
      } else {
        const { data, error } = await supabase.from('vektseddel').insert(payload).select().single();
        if (error) throw error;
        savedId = data?.id ?? null;
        await supabase.from('user_action_logs').insert({
          user_email: user.email,
          action_type: 'add_vektseddel',
          target_type: 'vektseddel',
          target_id: savedId ?? 0,
          target_name: payload.vektseddel_nr || `LP ${payload.lp_nr || ''}`,
          action_details: payload,
        });
      }

      // Reconcile image attachments for this entry
      if (savedId != null) {
        try {
          const attachIds = Array.from(selectedImageIds);
          const detachIds =
            editingId != null
              ? galleryImages
                  .filter((img) => img.vektseddel_id === editingId && !selectedImageIds.has(img.id))
                  .map((img) => img.id)
              : [];
          if (attachIds.length > 0) {
            const { error: attachErr } = await supabase
              .from('vektseddel_images')
              .update({ vektseddel_id: savedId })
              .in('id', attachIds);
            if (attachErr) throw attachErr;
          }
          if (detachIds.length > 0) {
            const { error: detachErr } = await supabase
              .from('vektseddel_images')
              .update({ vektseddel_id: null })
              .in('id', detachIds);
            if (detachErr) throw detachErr;
          }
        } catch (linkErr) {
          console.error('Error updating image links:', linkErr);
          setError('Lagret, men kunne ikke oppdatere bildekoblinger');
        }
      }

      setDraft(emptyDraft(deriveSign(user)));
      setEditingId(null);
      setLpSearch('');
      setSelectedImageIds(new Set());
      await loadEntries();
      await loadImageCounts();
      await loadGallery(null);
    } catch (e) {
      console.error('Error saving vektseddel:', e);
      const msg = (e as { message?: string })?.message;
      setError(msg ? `Kunne ikke lagre: ${msg}` : 'Kunne ikke lagre');
    } finally {
      setSaving(false);
    }
  };

  const deleteEntry = async (e: VektseddelEntry) => {
    if (!canEdit || !user) return;
    if (!confirm('Slette denne vektseddelen?')) return;
    try {
      const { error } = await supabase.from('vektseddel').delete().eq('id', e.id);
      if (error) throw error;
      await supabase.from('user_action_logs').insert({
        user_email: user.email,
        action_type: 'delete_vektseddel',
        target_type: 'vektseddel',
        target_id: e.id,
        target_name: e.vektseddel_nr || `LP ${e.lp_nr || ''}`,
        action_details: { ...e },
      });
      if (editingId === e.id) cancelEdit();
      await loadEntries();
    } catch (err) {
      console.error('Error deleting vektseddel:', err);
      setError('Kunne ikke slette');
    }
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const rows = filteredEntries;
      await exportVektseddelToPDF(rows, yearFilter);
    } catch (e) {
      console.error('Error exporting PDF:', e);
      setError('Kunne ikke eksportere PDF');
    } finally {
      setExporting(false);
    }
  };

  if (!isOpen) return null;

  const derived = computeDerived(draft);

  return (
    <div
      className="modal show"
      style={{ display: 'block', backgroundColor: 'rgba(0,0,0,0.5)' }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal-dialog modal-xl modal-dialog-scrollable" style={{ maxWidth: '95vw' }}>
        <div className="modal-content">
          <div className="modal-header" style={{ background: '#f8f9fa' }}>
            <div>
              <h5 className="modal-title mb-0" style={{ fontWeight: 600 }}>
                <i className="fas fa-scale-balanced me-2" style={{ color: '#f0ad4e' }}></i>
                Vektseddelkontroll
              </h5>
              <div className="text-muted" style={{ fontSize: '0.75rem' }}>Airlift AS</div>
            </div>
            <div className="d-flex align-items-center gap-2">
              <select
                className="form-select form-select-sm"
                value={yearFilter}
                onChange={(e) => setYearFilter(e.target.value)}
                style={{ width: 'auto', fontSize: '0.8rem' }}
              >
                <option value="all">Alle år</option>
                {availableYears.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
              <button
                className="btn btn-sm btn-outline-success"
                onClick={handleExport}
                disabled={exporting || filteredEntries.length === 0}
                title="Eksporter PDF"
                style={{ fontSize: '0.75rem' }}
              >
                {exporting ? (
                  <span className="spinner-border spinner-border-sm" style={{ width: '0.7rem', height: '0.7rem' }}></span>
                ) : (
                  <>
                    <i className="fas fa-file-pdf me-1"></i>PDF
                  </>
                )}
              </button>
              <button type="button" className="btn-close" onClick={onClose}></button>
            </div>
          </div>

          <div className="modal-body" style={{ padding: '1rem' }}>
            {error && (
              <div className="alert alert-danger py-2" style={{ fontSize: '0.8rem' }}>
                {error}
              </div>
            )}

            {canEdit && (
              <div
                className="mb-3 p-3 rounded"
                style={{ background: '#f8f9fa', border: '1px solid #e9ecef' }}
              >
                <div className="d-flex align-items-center gap-2 mb-2">
                  <i className={`fas ${editingId != null ? 'fa-pen' : 'fa-plus'}`} style={{ color: '#6c757d' }}></i>
                  <strong style={{ fontSize: '0.85rem' }}>
                    {editingId != null ? 'Rediger vektseddel' : 'Ny vektseddel'}
                  </strong>
                  {editingId != null && (
                    <button
                      className="btn btn-sm btn-link text-muted ms-auto p-0"
                      onClick={cancelEdit}
                      style={{ fontSize: '0.75rem' }}
                    >
                      Avbryt
                    </button>
                  )}
                </div>

                <div className="row g-2" style={{ fontSize: '0.8rem' }}>
                  <div className="col-6 col-md-2">
                    <label className="form-label mb-1" style={{ fontSize: '0.7rem', fontWeight: 600 }}>
                      Dato
                    </label>
                    <input
                      type="date"
                      className="form-control form-control-sm"
                      value={draft.dato}
                      onChange={(e) => setDraft({ ...draft, dato: e.target.value })}
                    />
                  </div>
                  <div className="col-12 col-md-4 position-relative">
                    <label className="form-label mb-1" style={{ fontSize: '0.7rem', fontWeight: 600 }}>
                      Landingsplass (søk)
                    </label>
                    <input
                      ref={lpInputRef}
                      type="text"
                      className="form-control form-control-sm"
                      value={lpSearch}
                      placeholder="Søk kode eller LP nr..."
                      onFocus={() => setLpSuggestOpen(true)}
                      onChange={(e) => {
                        setLpSearch(e.target.value);
                        setLpSuggestOpen(true);
                        setDraft((d) => ({ ...d, lp_id: null }));
                      }}
                      onBlur={() => setTimeout(() => setLpSuggestOpen(false), 150)}
                    />
                    {lpSuggestOpen && lpSuggestions.length > 0 && (
                      <div
                        className="position-absolute w-100 bg-white border rounded shadow-sm"
                        style={{ zIndex: 1060, maxHeight: '220px', overflowY: 'auto', top: '100%' }}
                      >
                        {lpSuggestions.map((lp) => (
                          <div
                            key={lp.id}
                            className="px-2 py-1 suggestion-row"
                            style={{ cursor: 'pointer', fontSize: '0.78rem', borderBottom: '1px solid #f1f3f5' }}
                            onMouseDown={() => selectLp(lp)}
                          >
                            <strong>{lp.kode || '—'}</strong>{' '}
                            <span className="text-muted">LP {lp.lp || '—'}</span>
                            {lp.tonn_lp ? (
                              <span className="text-muted ms-2" style={{ fontSize: '0.7rem' }}>
                                ({lp.tonn_lp} tonn)
                              </span>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="col-6 col-md-2">
                    <label className="form-label mb-1" style={{ fontSize: '0.7rem', fontWeight: 600 }}>
                      Prosjekt
                    </label>
                    <input
                      type="text"
                      className="form-control form-control-sm"
                      value={draft.prosjekt}
                      onChange={(e) => setDraft({ ...draft, prosjekt: e.target.value })}
                    />
                  </div>
                  <div className="col-6 col-md-2">
                    <label className="form-label mb-1" style={{ fontSize: '0.7rem', fontWeight: 600 }}>
                      LP nr
                    </label>
                    <input
                      type="text"
                      className="form-control form-control-sm"
                      value={draft.lp_nr}
                      onChange={(e) => setDraft({ ...draft, lp_nr: e.target.value })}
                    />
                  </div>
                  <div className="col-6 col-md-2">
                    <label className="form-label mb-1" style={{ fontSize: '0.7rem', fontWeight: 600 }}>
                      LP tonn
                    </label>
                    <input
                      type="text"
                      inputMode="decimal"
                      className="form-control form-control-sm"
                      value={draft.lp_tonn}
                      onChange={(e) => setDraft({ ...draft, lp_tonn: e.target.value })}
                    />
                  </div>
                  <div className="col-6 col-md-2">
                    <label className="form-label mb-1" style={{ fontSize: '0.7rem', fontWeight: 600 }}>
                      Rest LP
                    </label>
                    <input
                      type="text"
                      inputMode="decimal"
                      className="form-control form-control-sm"
                      value={draft.rest_lp}
                      onChange={(e) => setDraft({ ...draft, rest_lp: e.target.value })}
                    />
                  </div>
                  <div className="col-12 col-md-4">
                    <div
                      className="row g-2"
                      style={{
                        border: '1px solid #dee2e6',
                        borderRadius: 6,
                        padding: '6px 8px',
                        margin: 0,
                        background: '#fafbfc',
                      }}
                    >
                      <div className="col-6" style={{ paddingLeft: 4, paddingRight: 4 }}>
                        <label className="form-label mb-1" style={{ fontSize: '0.7rem', fontWeight: 600 }}>
                          Vektseddel nr
                        </label>
                        <input
                          type="text"
                          className="form-control form-control-sm"
                          value={draft.vektseddel_nr}
                          onChange={(e) => setDraft({ ...draft, vektseddel_nr: e.target.value })}
                        />
                      </div>
                      <div className="col-6" style={{ paddingLeft: 4, paddingRight: 4 }}>
                        <label className="form-label mb-1" style={{ fontSize: '0.7rem', fontWeight: 600 }}>
                          Tonn inn
                        </label>
                        <input
                          type="text"
                          inputMode="decimal"
                          className="form-control form-control-sm"
                          value={draft.tonn_inn}
                          onChange={(e) => setDraft({ ...draft, tonn_inn: e.target.value })}
                        />
                      </div>
                    </div>
                  </div>
                  <div className="col-6 col-md-2">
                    <label className="form-label mb-1" style={{ fontSize: '0.7rem', fontWeight: 600 }}>
                      Tonn spredt ut
                    </label>
                    <input
                      type="text"
                      inputMode="decimal"
                      className="form-control form-control-sm"
                      value={draft.tonn_ut}
                      onChange={(e) => setDraft({ ...draft, tonn_ut: e.target.value })}
                    />
                  </div>
                  <div className="col-6 col-md-2">
                    <label className="form-label mb-1" style={{ fontSize: '0.7rem', fontWeight: 600, color: '#6c757d' }}>
                      Tonn Akk (auto)
                    </label>
                    <input
                      type="text"
                      className="form-control form-control-sm bg-light"
                      value={fmt(derived.tonn_akk)}
                      readOnly
                    />
                  </div>
                  <div className="col-6 col-md-2">
                    <label className="form-label mb-1" style={{ fontSize: '0.7rem', fontWeight: 600, color: '#6c757d' }}>
                      Rest LP (auto)
                    </label>
                    <input
                      type="text"
                      className="form-control form-control-sm bg-light"
                      value={fmt(derived.rest_lp2)}
                      readOnly
                    />
                  </div>
                  <div className="col-6 col-md-2">
                    <label className="form-label mb-1" style={{ fontSize: '0.7rem', fontWeight: 600, color: '#6c757d' }}>
                      Rest Vekts. (auto)
                    </label>
                    <input
                      type="text"
                      className="form-control form-control-sm bg-light"
                      value={fmt(derived.rest_vekts)}
                      readOnly
                    />
                  </div>
                  <div className="col-12 col-md-6">
                    <label className="form-label mb-1" style={{ fontSize: '0.7rem', fontWeight: 600 }}>
                      Merknader
                    </label>
                    <input
                      type="text"
                      className="form-control form-control-sm"
                      value={draft.merknader}
                      onChange={(e) => setDraft({ ...draft, merknader: e.target.value })}
                    />
                  </div>
                  <div className="col-12 col-md-4">
                    <label className="form-label mb-1" style={{ fontSize: '0.7rem', fontWeight: 600 }}>
                      Sign Pilot
                    </label>
                    <input
                      type="text"
                      className="form-control form-control-sm"
                      value={draft.sign_teamleder}
                      onChange={(e) => setDraft({ ...draft, sign_teamleder: e.target.value })}
                      placeholder={deriveSign(user)}
                    />
                  </div>
                  <div className="col-12 col-md-2 d-flex align-items-end">
                    <button
                      className="btn btn-primary btn-sm w-100"
                      onClick={saveDraft}
                      disabled={saving}
                      style={{ fontSize: '0.8rem' }}
                    >
                      {saving ? (
                        <span className="spinner-border spinner-border-sm"></span>
                      ) : editingId != null ? (
                        'Lagre endringer'
                      ) : (
                        'Legg til'
                      )}
                    </button>
                  </div>

                  <div className="col-12">
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        flexWrap: 'wrap',
                        gap: 8,
                        paddingTop: 6,
                        borderTop: '1px dashed #dee2e6',
                        marginTop: 4,
                      }}
                    >
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        capture="environment"
                        multiple
                        style={{ display: 'none' }}
                        onChange={(ev) => {
                          handlePickImages(ev.target.files);
                          if (fileInputRef.current) fileInputRef.current.value = '';
                        }}
                      />
                      <button
                        type="button"
                        className="btn btn-outline-secondary btn-sm"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={uploadingImage}
                        style={{ fontSize: '0.78rem' }}
                        title="Ta bilde eller last opp fra galleri"
                      >
                        {uploadingImage ? (
                          <>
                            <span className="spinner-border spinner-border-sm me-1" style={{ width: '0.7rem', height: '0.7rem' }}></span>
                            Laster opp...
                          </>
                        ) : (
                          <>
                            <i className="fas fa-camera me-1"></i>
                            Ta / last opp bilde
                          </>
                        )}
                      </button>

                      {galleryImages.length > 0 && (
                        <button
                          type="button"
                          onClick={() => setGalleryCollapsed((v) => !v)}
                          className="btn btn-sm btn-link p-0 ms-auto"
                          style={{ fontSize: '0.72rem', textDecoration: 'none' }}
                          aria-expanded={!galleryCollapsed}
                        >
                          <i className={`fas fa-chevron-${galleryCollapsed ? 'down' : 'up'} me-1`} />
                          {galleryCollapsed
                            ? `Vis bilder (${galleryImages.length}${selectedImageIds.size ? `, ${selectedImageIds.size} valgt` : ''})`
                            : `Skjul bilder${selectedImageIds.size ? ` (${selectedImageIds.size} valgt)` : ''}`}
                        </button>
                      )}

                      {galleryImages.length === 0 && (
                        <span className="text-muted" style={{ fontSize: '0.7rem' }}>
                          Ingen tilgjengelige bilder. Last opp et bilde for å starte.
                        </span>
                      )}
                    </div>

                    {galleryImages.length > 0 && !galleryCollapsed && (
                      <div
                        style={{
                          display: 'flex',
                          flexWrap: 'wrap',
                          gap: 10,
                          marginTop: 8,
                          padding: 8,
                          borderRadius: 6,
                          background: '#fff',
                          border: '1px solid #e9ecef',
                          maxHeight: 220,
                          overflowY: 'auto',
                        }}
                      >
                        {galleryImages.map((img) => {
                          const isSelected = selectedImageIds.has(img.id);
                          const ts = formatImageTimestamp(img.created_at);
                          return (
                            <div
                              key={img.id}
                              style={{
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'center',
                                width: 72,
                              }}
                            >
                              <div style={{ position: 'relative', width: 64, height: 64 }}>
                                <button
                                  type="button"
                                  onClick={() => toggleSelectImage(img)}
                                  title={isSelected ? 'Fjern fra denne linjen' : 'Velg for denne linjen'}
                                  style={{
                                    width: 64,
                                    height: 64,
                                    padding: 0,
                                    borderRadius: 6,
                                    border: isSelected ? '2px solid #0d6efd' : '1px solid #ced4da',
                                    background: 'none',
                                    cursor: 'pointer',
                                    overflow: 'hidden',
                                    position: 'relative',
                                    outline: 'none',
                                  }}
                                >
                                  <img
                                    src={img.image_url}
                                    alt=""
                                    style={{
                                      width: '100%',
                                      height: '100%',
                                      objectFit: 'cover',
                                      display: 'block',
                                    }}
                                  />
                                  {isSelected && (
                                    <span
                                      style={{
                                        position: 'absolute',
                                        bottom: 2,
                                        left: 2,
                                        width: 18,
                                        height: 18,
                                        borderRadius: '50%',
                                        background: '#0d6efd',
                                        color: 'white',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        fontSize: '0.7rem',
                                      }}
                                    >
                                      <i className="fas fa-check"></i>
                                    </span>
                                  )}
                                </button>
                                {canEdit && (
                                  <button
                                    type="button"
                                    onClick={() => removeGalleryImage(img)}
                                    title="Slett bilde"
                                    style={{
                                      position: 'absolute',
                                      top: -6,
                                      right: -6,
                                      width: 18,
                                      height: 18,
                                      borderRadius: '50%',
                                      border: 'none',
                                      background: '#dc3545',
                                      color: 'white',
                                      fontSize: '0.65rem',
                                      lineHeight: 1,
                                      cursor: 'pointer',
                                      zIndex: 1,
                                    }}
                                  >
                                    ×
                                  </button>
                                )}
                              </div>
                              {ts && (
                                <div
                                  className="text-muted"
                                  style={{
                                    fontSize: '0.62rem',
                                    marginTop: 2,
                                    textAlign: 'center',
                                    lineHeight: 1.1,
                                    width: 72,
                                  }}
                                  title={ts}
                                >
                                  {ts}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            <div className="table-responsive" style={{ fontSize: '0.75rem' }}>
              <table className="table table-sm table-hover align-middle mb-0">
                <thead className="table-light">
                  <tr>
                    <th style={{ width: '14px', padding: 0 }}></th>
                    <th>Dato</th>
                    <th>Prosjekt</th>
                    <th>LP nr</th>
                    <th className="text-end">LP tonn</th>
                    <th className="text-end">Rest LP</th>
                    <th>Vektseddel nr</th>
                    <th className="text-end">Tonn inn</th>
                    <th className="text-end">Tonn spredt ut</th>
                    <th className="text-end">Tonn Akk</th>
                    <th className="text-end">Rest LP</th>
                    <th className="text-end">Rest Vekts.</th>
                    <th>Merknader</th>
                    <th>Sign Pilot</th>
                    {canEdit && <th style={{ width: '70px' }}></th>}
                  </tr>
                </thead>
                <tbody>
                  {loading && (
                    <tr>
                      <td colSpan={canEdit ? 15 : 14} className="text-center text-muted py-4">
                        <span className="spinner-border spinner-border-sm me-2"></span>Laster...
                      </td>
                    </tr>
                  )}
                  {!loading && filteredEntries.length === 0 && (
                    <tr>
                      <td colSpan={canEdit ? 15 : 14} className="text-center text-muted py-4">
                        Ingen vektsedler {yearFilter !== 'all' ? `for ${yearFilter}` : ''}
                      </td>
                    </tr>
                  )}
                  {!loading &&
                    filteredEntries.map((e, i) => {
                      const num = (e.vektseddel_nr || '').trim();
                      const prevNum = i > 0 ? (filteredEntries[i - 1].vektseddel_nr || '').trim() : '';
                      const nextNum =
                        i < filteredEntries.length - 1
                          ? (filteredEntries[i + 1].vektseddel_nr || '').trim()
                          : '';
                      const sameAsPrev = !!num && num === prevNum;
                      const sameAsNext = !!num && num === nextNum;
                      const grouped = sameAsPrev || sameAsNext;
                      const handleRowClick = () => {
                        if (editingId === e.id) return;
                        setDraft((d) => ({
                          ...d,
                          vektseddel_nr: e.vektseddel_nr || '',
                          tonn_inn:
                            e.rest_vekts !== null && e.rest_vekts !== undefined
                              ? String(e.rest_vekts)
                              : d.tonn_inn,
                        }));
                      };
                      return (
                      <tr
                        key={e.id}
                        className={editingId === e.id ? 'table-warning' : ''}
                        style={{ cursor: editingId === e.id ? 'default' : 'pointer' }}
                        onClick={handleRowClick}
                      >
                        <td style={{ width: '14px', padding: 0, position: 'relative' }}>
                          {grouped && (
                            <div
                              style={{
                                position: 'absolute',
                                left: '50%',
                                top: sameAsPrev ? 0 : '50%',
                                bottom: sameAsNext ? 0 : '50%',
                                borderLeft: '2px dotted #6c757d',
                              }}
                            />
                          )}
                        </td>
                        <td>{e.dato || '—'}</td>
                        <td>{e.prosjekt || '—'}</td>
                        <td>
                          {(() => {
                            const lp = landingsplasser.find((x) => x.id === e.lp_id);
                            const fromKode = extractLpNumber(lp?.kode);
                            const fromStored = extractLpNumber(e.lp_nr);
                            return fromKode || fromStored || e.lp_nr || '—';
                          })()}
                        </td>
                        <td className="text-end">{fmt(e.lp_tonn)}</td>
                        <td className="text-end">{fmt(e.rest_lp)}</td>
                        <td>{e.vektseddel_nr || '—'}</td>
                        <td className="text-end">{fmt(e.tonn_inn)}</td>
                        <td className="text-end">{fmt(e.tonn_ut)}</td>
                        <td className="text-end">
                          <strong>{fmt(e.tonn_akk)}</strong>
                        </td>
                        <td className="text-end" style={{ color: (e.rest_lp2 ?? 0) < 0 ? '#dc3545' : undefined }}>
                          {fmt(e.rest_lp2)}
                        </td>
                        <td className="text-end">{fmt(e.rest_vekts)}</td>
                        <td style={{ maxWidth: '180px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {e.merknader || ''}
                        </td>
                        <td>{e.sign_teamleder || ''}</td>
                        {canEdit && (
                          <td onClick={(ev) => ev.stopPropagation()}>
                            <div className="d-flex gap-1 align-items-center">
                              {imageCounts[e.id] ? (
                                <button
                                  className="btn btn-sm btn-outline-secondary"
                                  style={{ fontSize: '0.65rem', padding: '0.1rem 0.35rem' }}
                                  title={`${imageCounts[e.id]} bilde(r)`}
                                  onClick={() => openPreviewForEntry(e.id)}
                                >
                                  <i className="fas fa-image"></i>
                                  <span className="ms-1">{imageCounts[e.id]}</span>
                                </button>
                              ) : null}
                              <button
                                className="btn btn-sm btn-outline-primary"
                                style={{ fontSize: '0.65rem', padding: '0.1rem 0.35rem' }}
                                title="Rediger"
                                onClick={() => beginEdit(e)}
                              >
                                <i className="fas fa-pen"></i>
                              </button>
                              <button
                                className="btn btn-sm btn-outline-danger"
                                style={{ fontSize: '0.65rem', padding: '0.1rem 0.35rem' }}
                                title="Slett"
                                onClick={() => deleteEntry(e)}
                              >
                                <i className="fas fa-trash"></i>
                              </button>
                            </div>
                          </td>
                        )}
                      </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
      {previewImages !== null && (
        <div
          onClick={() => setPreviewImages(null)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.85)',
            zIndex: 2000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
            overflow: 'auto',
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 12,
              justifyContent: 'center',
              alignItems: 'center',
              maxWidth: '95vw',
            }}
          >
            {previewImages.length === 0 ? (
              <div style={{ color: 'white', fontSize: '0.9rem' }}>Ingen bilder</div>
            ) : (
              previewImages.map((img) => (
                <a key={img.id} href={img.image_url} target="_blank" rel="noreferrer">
                  <img
                    src={img.image_url}
                    alt=""
                    style={{
                      maxWidth: '90vw',
                      maxHeight: '80vh',
                      borderRadius: 8,
                      boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
                    }}
                  />
                </a>
              ))
            )}
          </div>
          <button
            onClick={() => setPreviewImages(null)}
            aria-label="Lukk"
            style={{
              position: 'absolute',
              top: 12,
              right: 16,
              width: 36,
              height: 36,
              borderRadius: '50%',
              border: 'none',
              background: 'rgba(255,255,255,0.15)',
              color: 'white',
              fontSize: '1.2rem',
              cursor: 'pointer',
            }}
          >
            ×
          </button>
        </div>
      )}

      <style jsx>{`
        .suggestion-row:hover {
          background: #f1f8ff;
        }
      `}</style>
    </div>
  );
}
