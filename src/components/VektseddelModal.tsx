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

  const lpInputRef = useRef<HTMLInputElement | null>(null);

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

  useEffect(() => {
    if (!isOpen) return;
    loadEntries();
    loadLandingsplasser();
  }, [isOpen, loadEntries, loadLandingsplasser]);

  useEffect(() => {
    if (!isOpen) {
      setDraft(emptyDraft(deriveSign(user)));
      setEditingId(null);
      setLpSearch('');
      setLpSuggestOpen(false);
      setError('');
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
    setDraft((d) => ({
      ...d,
      lp_id: lp.id,
      lp_nr: lp.lp || '',
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
  };

  const cancelEdit = () => {
    setEditingId(null);
    setDraft(emptyDraft(deriveSign(user)));
    setLpSearch('');
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

      if (editingId != null) {
        const { error } = await supabase.from('vektseddel').update(payload).eq('id', editingId);
        if (error) throw error;
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
        await supabase.from('user_action_logs').insert({
          user_email: user.email,
          action_type: 'add_vektseddel',
          target_type: 'vektseddel',
          target_id: data?.id ?? 0,
          target_name: payload.vektseddel_nr || `LP ${payload.lp_nr || ''}`,
          action_details: payload,
        });
      }

      setDraft(emptyDraft(deriveSign(user)));
      setEditingId(null);
      setLpSearch('');
      await loadEntries();
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
                        <td>{e.lp_nr || '—'}</td>
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
                            <div className="d-flex gap-1">
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
      <style jsx>{`
        .suggestion-row:hover {
          background: #f1f8ff;
        }
      `}</style>
    </div>
  );
}
