'use client';

import React, { useState, useMemo, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/lib/supabase';
import {
  type LandingsplassWithCoords,
  type VannWithCoords,
  type Association,
} from '@/lib/optimizationUtils';
import { ArrowRightLeft, Plus, Minus, FileDown, Loader2, MapPin, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';

// --- Types ---

interface ChangelogTabProps {
  availableYears: Array<{ year: string; prefix: string; label: string }>;
  currentYear: string;
}

interface ReassignedVann {
  vannId: number;
  vannName: string;
  oldLpId: number;
  oldLpKode: string;
  newLpId: number;
  newLpKode: string;
  oldDistance: number | null;
  newDistance: number | null;
}

interface NewOrRemovedVann {
  vannId: number;
  vannName: string;
  lpId: number;
  lpKode: string;
  distance: number | null;
}

interface RemovedOrDeactivatedLp {
  lpId: number;
  kode: string;
  vannCount: number;
  status: 'slettet' | 'deaktivert';
}

interface NewOrRemovedLp {
  lpId: number;
  kode: string;
  vannCount: number;
}

interface Changelog {
  reassigned: ReassignedVann[];
  newVann: NewOrRemovedVann[];
  removedVann: NewOrRemovedVann[];
  newLp: NewOrRemovedLp[];
  removedOrDeactivatedLp: RemovedOrDeactivatedLp[];
}

type SortDir = 'asc' | 'desc' | null;
type SortState = { key: string; dir: SortDir };

// --- Helpers ---

function formatLpKode(lp: LandingsplassWithCoords): string {
  const kode = (lp as any).kode || lp.lp || '?';
  const name = (lp as any).lp || '';
  if (kode && name && kode !== name) {
    return `${kode} - ${name}`;
  }
  return kode;
}

function formatDistance(d: number | null | undefined): string {
  if (d == null) return '-';
  return `${d.toFixed(1)} km`;
}

function toggleSort(current: SortState, key: string): SortState {
  if (current.key !== key) return { key, dir: 'asc' };
  if (current.dir === 'asc') return { key, dir: 'desc' };
  return { key: '', dir: null };
}

function sortIcon(sort: SortState, key: string) {
  if (sort.key !== key) return <ArrowUpDown className="w-3 h-3 ml-1 opacity-40" />;
  if (sort.dir === 'asc') return <ArrowUp className="w-3 h-3 ml-1" />;
  return <ArrowDown className="w-3 h-3 ml-1" />;
}

function compareValues(a: any, b: any, dir: 'asc' | 'desc'): number {
  if (a == null && b == null) return 0;
  if (a == null) return dir === 'asc' ? 1 : -1;
  if (b == null) return dir === 'asc' ? -1 : 1;
  if (typeof a === 'string') {
    const cmp = a.localeCompare(b, 'nb');
    return dir === 'asc' ? cmp : -cmp;
  }
  return dir === 'asc' ? a - b : b - a;
}

// --- Sortable Table Head ---

function SortableHead({ label, sortKey, sort, onSort, className }: {
  label: string;
  sortKey: string;
  sort: SortState;
  onSort: (key: string) => void;
  className?: string;
}) {
  return (
    <TableHead
      className={`cursor-pointer select-none hover:bg-muted/50 ${className || ''}`}
      onClick={() => onSort(sortKey)}
    >
      <span className="inline-flex items-center">
        {label}
        {sortIcon(sort, sortKey)}
      </span>
    </TableHead>
  );
}

// --- Data Loading (same pattern as YearComparisonTab) ---

async function loadYearData(
  year: string,
  availableYears: ChangelogTabProps['availableYears']
) {
  const selectedYear = availableYears.find(y => y.year === year);

  let lpTable: string;
  let vannTable: string;
  let assocTable: string;

  if (year === 'current' || !selectedYear) {
    lpTable = 'vass_lasteplass';
    vannTable = 'vass_vann';
    assocTable = 'vass_associations';
  } else {
    const prefix = selectedYear.prefix;
    const suffix = prefix ? `${year}_${prefix}_` : `${year}_`;
    lpTable = `${suffix}vass_lasteplass`;
    vannTable = `${suffix}vass_vann`;
    assocTable = `${suffix}vass_associations`;
  }

  const [lpResult, vannResult, assocResult] = await Promise.all([
    supabase.from(lpTable).select('*').order('id'),
    supabase.from(vannTable).select('*').order('id'),
    supabase.from(assocTable).select('*'),
  ]);

  if (lpResult.error) throw lpResult.error;
  if (vannResult.error) throw vannResult.error;
  if (assocResult.error) throw assocResult.error;

  return {
    landingsplasser: lpResult.data as LandingsplassWithCoords[],
    vann: vannResult.data as VannWithCoords[],
    associations: assocResult.data as Association[],
  };
}

// --- Changelog Builder ---

function buildChangelog(
  sourceData: { landingsplasser: LandingsplassWithCoords[]; vann: VannWithCoords[]; associations: Association[] },
  targetData: { landingsplasser: LandingsplassWithCoords[]; vann: VannWithCoords[]; associations: Association[] }
): Changelog {
  const sourceLpMap = new Map(sourceData.landingsplasser.map(lp => [lp.id, lp]));
  const targetLpMap = new Map(targetData.landingsplasser.map(lp => [lp.id, lp]));
  const sourceVannMap = new Map(sourceData.vann.map(v => [v.id, v]));
  const targetVannMap = new Map(targetData.vann.map(v => [v.id, v]));

  const sourceAssocByVann = new Map<number, Association>();
  for (const a of sourceData.associations) {
    sourceAssocByVann.set(a.airport_id, a);
  }
  const targetAssocByVann = new Map<number, Association>();
  for (const a of targetData.associations) {
    targetAssocByVann.set(a.airport_id, a);
  }

  const sourceLpVannCount = new Map<number, number>();
  for (const a of sourceData.associations) {
    sourceLpVannCount.set(a.landingsplass_id, (sourceLpVannCount.get(a.landingsplass_id) || 0) + 1);
  }
  const targetLpVannCount = new Map<number, number>();
  for (const a of targetData.associations) {
    targetLpVannCount.set(a.landingsplass_id, (targetLpVannCount.get(a.landingsplass_id) || 0) + 1);
  }

  const reassigned: ReassignedVann[] = [];
  const newVann: NewOrRemovedVann[] = [];
  const removedVann: NewOrRemovedVann[] = [];

  const allVannIds = new Set([...sourceAssocByVann.keys(), ...targetAssocByVann.keys()]);

  for (const vannId of allVannIds) {
    const sourceAssoc = sourceAssocByVann.get(vannId);
    const targetAssoc = targetAssocByVann.get(vannId);
    const vann = targetVannMap.get(vannId) || sourceVannMap.get(vannId);
    const vannName = vann?.name || `Vann #${vannId}`;

    if (sourceAssoc && targetAssoc) {
      if (sourceAssoc.landingsplass_id !== targetAssoc.landingsplass_id) {
        const oldLp = sourceLpMap.get(sourceAssoc.landingsplass_id);
        const newLp = targetLpMap.get(targetAssoc.landingsplass_id);
        reassigned.push({
          vannId,
          vannName,
          oldLpId: sourceAssoc.landingsplass_id,
          oldLpKode: oldLp ? formatLpKode(oldLp) : `LP #${sourceAssoc.landingsplass_id}`,
          newLpId: targetAssoc.landingsplass_id,
          newLpKode: newLp ? formatLpKode(newLp) : `LP #${targetAssoc.landingsplass_id}`,
          oldDistance: sourceAssoc.distance_km ?? null,
          newDistance: targetAssoc.distance_km ?? null,
        });
      }
    } else if (targetAssoc && !sourceAssoc) {
      const lp = targetLpMap.get(targetAssoc.landingsplass_id);
      newVann.push({
        vannId,
        vannName,
        lpId: targetAssoc.landingsplass_id,
        lpKode: lp ? formatLpKode(lp) : `LP #${targetAssoc.landingsplass_id}`,
        distance: targetAssoc.distance_km ?? null,
      });
    } else if (sourceAssoc && !targetAssoc) {
      const lp = sourceLpMap.get(sourceAssoc.landingsplass_id);
      removedVann.push({
        vannId,
        vannName,
        lpId: sourceAssoc.landingsplass_id,
        lpKode: lp ? formatLpKode(lp) : `LP #${sourceAssoc.landingsplass_id}`,
        distance: sourceAssoc.distance_km ?? null,
      });
    }
  }

  // New LPs
  const newLp: NewOrRemovedLp[] = [];
  for (const [lpId, lp] of targetLpMap) {
    if (!sourceLpMap.has(lpId)) {
      newLp.push({
        lpId,
        kode: formatLpKode(lp),
        vannCount: targetLpVannCount.get(lpId) || 0,
      });
    }
  }

  // Removed or deactivated LPs
  const removedOrDeactivatedLp: RemovedOrDeactivatedLp[] = [];
  for (const [lpId, lp] of sourceLpMap) {
    const targetLp = targetLpMap.get(lpId);
    if (!targetLp) {
      // Completely removed (not in target year at all)
      removedOrDeactivatedLp.push({
        lpId,
        kode: formatLpKode(lp),
        vannCount: sourceLpVannCount.get(lpId) || 0,
        status: 'slettet',
      });
    } else if (lp.is_active !== false && targetLp.is_active === false) {
      // Was active in source, deactivated in target
      removedOrDeactivatedLp.push({
        lpId,
        kode: formatLpKode(targetLp),
        vannCount: sourceLpVannCount.get(lpId) || 0,
        status: 'deaktivert',
      });
    }
  }

  reassigned.sort((a, b) => a.vannName.localeCompare(b.vannName, 'nb'));
  newVann.sort((a, b) => a.vannName.localeCompare(b.vannName, 'nb'));
  removedVann.sort((a, b) => a.vannName.localeCompare(b.vannName, 'nb'));

  return { reassigned, newVann, removedVann, newLp, removedOrDeactivatedLp };
}

// --- PDF Export ---

async function loadJsPDF(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof window !== 'undefined' && window.jspdf) {
      resolve();
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load jsPDF library'));
    document.head.appendChild(script);
  });
}

declare global {
  interface Window {
    jspdf: {
      jsPDF: new (options?: Record<string, unknown>) => any;
    };
  }
}

interface SortedChangelog {
  reassigned: ReassignedVann[];
  newVann: NewOrRemovedVann[];
  removedVann: NewOrRemovedVann[];
  newLp: NewOrRemovedLp[];
  removedOrDeactivatedLp: RemovedOrDeactivatedLp[];
}

async function exportChangelogToPDF(
  changelog: Changelog,
  sorted: SortedChangelog,
  sourceLabel: string,
  targetLabel: string,
) {
  if (!window.jspdf) {
    await loadJsPDF();
  }

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  const pageWidth = 210;
  const margin = 18;
  const rightMargin = 18;
  const contentWidth = pageWidth - margin - rightMargin;
  const rowHeight = 6;         // spacing between data rows
  const headerRowGap = 8;      // gap after table header line before first row
  const footerY = 285;
  const maxY = 265;            // trigger new page before this y
  let y = 22;
  let pageNum = 1;

  function drawFooter() {
    doc.setFontSize(8);
    doc.setTextColor(160);
    doc.text(`Side ${pageNum}`, pageWidth / 2, footerY, { align: 'center' });
  }

  function checkNewPage(needed: number = 12) {
    if (y + needed > maxY) {
      drawFooter();
      doc.addPage();
      pageNum++;
      y = 22;
      return true;
    }
    return false;
  }

  function drawSectionHeader(title: string) {
    // Ensure space for header + at least one row
    checkNewPage(25);
    y += 4; // extra breathing room before section
    doc.setFontSize(12);
    doc.setFont(undefined, 'bold');
    doc.setTextColor(30, 30, 30);
    doc.text(title, margin, y);
    y += 5; // gap between text baseline and line
    doc.setDrawColor(180);
    doc.setLineWidth(0.4);
    doc.line(margin, y, margin + contentWidth, y);
    y += 6; // gap after line before table header
  }

  function drawTableHeader(cols: { label: string; x: number }[]) {
    // Light background for header row
    doc.setFillColor(245, 245, 245);
    doc.rect(margin, y - 4, contentWidth, 7, 'F');

    doc.setFontSize(8.5);
    doc.setFont(undefined, 'bold');
    doc.setTextColor(90, 90, 90);
    for (const col of cols) {
      doc.text(col.label, col.x, y);
    }
    y += 4; // below text baseline
    doc.setDrawColor(200);
    doc.setLineWidth(0.3);
    doc.line(margin, y, margin + contentWidth, y);
    y += 4; // gap before first data row
  }

  function drawTableRow(cols: { text: string; x: number; maxWidth?: number }[], isAlternate: boolean) {
    checkNewPage(rowHeight + 2);

    // Alternating row background
    if (isAlternate) {
      doc.setFillColor(250, 250, 252);
      doc.rect(margin, y - 3.5, contentWidth, rowHeight, 'F');
    }

    doc.setFontSize(8.5);
    doc.setFont(undefined, 'normal');
    doc.setTextColor(50, 50, 50);
    for (const col of cols) {
      const maxW = col.maxWidth || 50;
      const truncated = doc.splitTextToSize(col.text, maxW)[0] || col.text;
      doc.text(truncated, col.x, y);
    }
    y += rowHeight;
  }

  // ===== Title =====
  doc.setFontSize(20);
  doc.setFont(undefined, 'bold');
  doc.setTextColor(25, 25, 25);
  doc.text('Endringslogg', margin, y);
  y += 9;

  // Thin accent line under title
  doc.setDrawColor(60, 120, 200);
  doc.setLineWidth(0.8);
  doc.line(margin, y, margin + 40, y);
  y += 8;

  // ===== Date + year info =====
  const dateString = new Date().toLocaleDateString('nb-NO', {
    year: 'numeric', month: 'long', day: 'numeric',
  });
  doc.setFontSize(9.5);
  doc.setFont(undefined, 'normal');
  doc.setTextColor(110);
  doc.text(`Generert: ${dateString}`, margin, y);
  y += 5;
  doc.text(`Sammenligning: ${sourceLabel}  \u2192  ${targetLabel}`, margin, y);
  y += 10;

  // ===== Summary box =====
  const deletedCount = changelog.removedOrDeactivatedLp.filter(lp => lp.status === 'slettet').length;
  const deactivatedCount = changelog.removedOrDeactivatedLp.filter(lp => lp.status === 'deaktivert').length;

  // Draw rounded summary box
  const summaryBoxH = 38;
  doc.setDrawColor(210);
  doc.setFillColor(248, 249, 252);
  doc.setLineWidth(0.3);
  doc.roundedRect(margin, y - 4, contentWidth, summaryBoxH, 2, 2, 'FD');

  doc.setFontSize(10);
  doc.setFont(undefined, 'bold');
  doc.setTextColor(40);
  doc.text('Sammendrag', margin + 5, y + 1);
  y += 7;

  doc.setFontSize(9);
  doc.setFont(undefined, 'normal');
  doc.setTextColor(70);
  const summaryItems = [
    { label: 'Flyttede vann (ny LP):', value: String(changelog.reassigned.length) },
    { label: 'Nye vann:', value: String(changelog.newVann.length) },
    { label: 'Fjernede vann:', value: String(changelog.removedVann.length) },
    { label: 'Nye landingsplasser:', value: String(changelog.newLp.length) },
    { label: 'Fjernede/deaktiverte LP:', value: `${changelog.removedOrDeactivatedLp.length} (${deletedCount} slettet, ${deactivatedCount} deaktivert)` },
  ];
  // Layout summary in two columns
  const col1X = margin + 5;
  const col2X = margin + 95;
  for (let i = 0; i < summaryItems.length; i++) {
    const item = summaryItems[i];
    const xPos = i < 3 ? col1X : col2X;
    const yOffset = i < 3 ? i * 5 : (i - 3) * 5;
    doc.setFont(undefined, 'normal');
    doc.setTextColor(90);
    doc.text(item.label, xPos, y + yOffset);
    doc.setFont(undefined, 'bold');
    doc.setTextColor(40);
    doc.text(item.value, xPos + doc.getTextWidth(item.label) + 2, y + yOffset);
  }
  y += summaryBoxH - 10;

  // ===== Reassigned vann =====
  if (changelog.reassigned.length > 0) {
    drawSectionHeader(`Flyttede vann (${changelog.reassigned.length})`);
    drawTableHeader([
      { label: 'Vann', x: margin },
      { label: 'Fra LP', x: margin + 45 },
      { label: 'Til LP', x: margin + 95 },
      { label: 'Avst.endring', x: margin + 142 },
    ]);
    sorted.reassigned.forEach((r, i) => {
      const distChange = (r.newDistance != null && r.oldDistance != null)
        ? `${(r.newDistance - r.oldDistance) > 0 ? '+' : ''}${(r.newDistance - r.oldDistance).toFixed(1)} km`
        : '-';
      drawTableRow([
        { text: r.vannName, x: margin, maxWidth: 44 },
        { text: r.oldLpKode, x: margin + 45, maxWidth: 48 },
        { text: r.newLpKode, x: margin + 95, maxWidth: 45 },
        { text: distChange, x: margin + 142, maxWidth: 30 },
      ], i % 2 === 1);
    });
  }

  // ===== New vann =====
  if (sorted.newVann.length > 0) {
    drawSectionHeader(`Nye vann (${sorted.newVann.length})`);
    drawTableHeader([
      { label: 'Vann', x: margin },
      { label: 'Tilordnet LP', x: margin + 65 },
      { label: 'Avstand', x: margin + 140 },
    ]);
    sorted.newVann.forEach((v, i) => {
      drawTableRow([
        { text: v.vannName, x: margin, maxWidth: 60 },
        { text: v.lpKode, x: margin + 65, maxWidth: 70 },
        { text: formatDistance(v.distance), x: margin + 140, maxWidth: 30 },
      ], i % 2 === 1);
    });
  }

  // ===== Removed vann =====
  if (sorted.removedVann.length > 0) {
    drawSectionHeader(`Fjernede vann (${sorted.removedVann.length})`);
    drawTableHeader([
      { label: 'Vann', x: margin },
      { label: 'Var tilordnet LP', x: margin + 65 },
      { label: 'Avstand', x: margin + 140 },
    ]);
    sorted.removedVann.forEach((v, i) => {
      drawTableRow([
        { text: v.vannName, x: margin, maxWidth: 60 },
        { text: v.lpKode, x: margin + 65, maxWidth: 70 },
        { text: formatDistance(v.distance), x: margin + 140, maxWidth: 30 },
      ], i % 2 === 1);
    });
  }

  // ===== New LPs =====
  if (sorted.newLp.length > 0) {
    drawSectionHeader(`Nye landingsplasser (${sorted.newLp.length})`);
    drawTableHeader([
      { label: 'Kode', x: margin },
      { label: 'Antall vann', x: margin + 100 },
    ]);
    sorted.newLp.forEach((lp, i) => {
      drawTableRow([
        { text: lp.kode, x: margin, maxWidth: 90 },
        { text: String(lp.vannCount), x: margin + 100, maxWidth: 30 },
      ], i % 2 === 1);
    });
  }

  // ===== Removed/deactivated LPs =====
  if (sorted.removedOrDeactivatedLp.length > 0) {
    drawSectionHeader(`Fjernede/deaktiverte landingsplasser (${sorted.removedOrDeactivatedLp.length})`);
    drawTableHeader([
      { label: 'Kode', x: margin },
      { label: 'Status', x: margin + 75 },
      { label: 'Hadde antall vann', x: margin + 120 },
    ]);
    sorted.removedOrDeactivatedLp.forEach((lp, i) => {
      drawTableRow([
        { text: lp.kode, x: margin, maxWidth: 70 },
        { text: lp.status === 'slettet' ? 'Slettet' : 'Deaktivert', x: margin + 75, maxWidth: 40 },
        { text: String(lp.vannCount), x: margin + 120, maxWidth: 30 },
      ], i % 2 === 1);
    });
  }

  // ===== Footer on last page =====
  drawFooter();

  const fileName = `Endringslogg_${sourceLabel}_til_${targetLabel}_${new Date().toISOString().slice(0, 10)}.pdf`;
  doc.save(fileName);

  // Log export
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user?.email) {
      await supabase.from('user_action_logs').insert({
        user_email: session.user.email,
        action_type: 'export_pdf',
        target_type: 'changelog',
        target_id: 0,
        action_details: {
          source: sourceLabel,
          target: targetLabel,
          reassigned: changelog.reassigned.length,
          newVann: changelog.newVann.length,
          removedVann: changelog.removedVann.length,
          newLp: changelog.newLp.length,
          removedOrDeactivatedLp: changelog.removedOrDeactivatedLp.length,
        },
      });
    }
  } catch (e) {
    console.warn('Failed to log PDF export:', e);
  }

  return fileName;
}

// --- Component ---

function useSortedData<T>(data: T[], sort: SortState, getField: (item: T, key: string) => any): T[] {
  return useMemo(() => {
    if (!sort.key || !sort.dir) return data;
    return [...data].sort((a, b) => compareValues(getField(a, sort.key), getField(b, sort.key), sort.dir!));
  }, [data, sort.key, sort.dir, getField]);
}

export function ChangelogTab({ availableYears, currentYear }: ChangelogTabProps) {
  const [sourceYear, setSourceYear] = useState('');
  const [targetYear, setTargetYear] = useState(currentYear);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [changelog, setChangelog] = useState<Changelog | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sourceLabel, setSourceLabel] = useState('');
  const [targetLabel, setTargetLabel] = useState('');

  // Sort states per section
  const [reassignedSort, setReassignedSort] = useState<SortState>({ key: '', dir: null });
  const [newVannSort, setNewVannSort] = useState<SortState>({ key: '', dir: null });
  const [removedVannSort, setRemovedVannSort] = useState<SortState>({ key: '', dir: null });
  const [newLpSort, setNewLpSort] = useState<SortState>({ key: '', dir: null });
  const [removedLpSort, setRemovedLpSort] = useState<SortState>({ key: '', dir: null });

  const getReassignedField = useCallback((item: ReassignedVann, key: string) => {
    switch (key) {
      case 'vannName': return item.vannName;
      case 'oldLpKode': return item.oldLpKode;
      case 'newLpKode': return item.newLpKode;
      case 'distChange': return (item.newDistance != null && item.oldDistance != null) ? item.newDistance - item.oldDistance : null;
      default: return null;
    }
  }, []);

  const getNewRemovedVannField = useCallback((item: NewOrRemovedVann, key: string) => {
    switch (key) {
      case 'vannName': return item.vannName;
      case 'lpKode': return item.lpKode;
      case 'distance': return item.distance;
      default: return null;
    }
  }, []);

  const getNewLpField = useCallback((item: NewOrRemovedLp, key: string) => {
    switch (key) {
      case 'kode': return item.kode;
      case 'vannCount': return item.vannCount;
      default: return null;
    }
  }, []);

  const getRemovedLpField = useCallback((item: RemovedOrDeactivatedLp, key: string) => {
    switch (key) {
      case 'kode': return item.kode;
      case 'status': return item.status;
      case 'vannCount': return item.vannCount;
      default: return null;
    }
  }, []);

  const sortedReassigned = useSortedData(changelog?.reassigned || [], reassignedSort, getReassignedField);
  const sortedNewVann = useSortedData(changelog?.newVann || [], newVannSort, getNewRemovedVannField);
  const sortedRemovedVann = useSortedData(changelog?.removedVann || [], removedVannSort, getNewRemovedVannField);
  const sortedNewLp = useSortedData(changelog?.newLp || [], newLpSort, getNewLpField);
  const sortedRemovedLp = useSortedData(changelog?.removedOrDeactivatedLp || [], removedLpSort, getRemovedLpField);

  const getYearLabel = (year: string) => {
    const found = availableYears.find(y => y.year === year);
    return found?.label || year;
  };

  const generateChangelog = async () => {
    if (!sourceYear || !targetYear) {
      setError('Velg begge år for å generere endringslogg');
      return;
    }
    if (sourceYear === targetYear) {
      setError('Velg to forskjellige år');
      return;
    }

    setLoading(true);
    setError(null);
    setChangelog(null);
    // Reset sorts
    setReassignedSort({ key: '', dir: null });
    setNewVannSort({ key: '', dir: null });
    setRemovedVannSort({ key: '', dir: null });
    setNewLpSort({ key: '', dir: null });
    setRemovedLpSort({ key: '', dir: null });

    try {
      const [srcData, tgtData] = await Promise.all([
        loadYearData(sourceYear, availableYears),
        loadYearData(targetYear, availableYears),
      ]);

      const result = buildChangelog(srcData, tgtData);
      setChangelog(result);
      setSourceLabel(getYearLabel(sourceYear));
      setTargetLabel(getYearLabel(targetYear));
    } catch (e: any) {
      console.error('Error generating changelog:', e);
      setError(e.message || 'Kunne ikke generere endringslogg');
    } finally {
      setLoading(false);
    }
  };

  const handleExportPDF = async () => {
    if (!changelog) return;
    setExporting(true);
    try {
      await exportChangelogToPDF(
        changelog,
        {
          reassigned: sortedReassigned,
          newVann: sortedNewVann,
          removedVann: sortedRemovedVann,
          newLp: sortedNewLp,
          removedOrDeactivatedLp: sortedRemovedLp,
        },
        sourceLabel,
        targetLabel,
      );
    } catch (e: any) {
      console.error('PDF export error:', e);
      setError('Kunne ikke eksportere PDF: ' + (e.message || ''));
    } finally {
      setExporting(false);
    }
  };

  const totalChanges = changelog
    ? changelog.reassigned.length + changelog.newVann.length + changelog.removedVann.length + changelog.newLp.length + changelog.removedOrDeactivatedLp.length
    : 0;

  const deletedLpCount = changelog?.removedOrDeactivatedLp.filter(lp => lp.status === 'slettet').length || 0;
  const deactivatedLpCount = changelog?.removedOrDeactivatedLp.filter(lp => lp.status === 'deaktivert').length || 0;

  return (
    <div className="space-y-6">
      {/* Year selector */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ArrowRightLeft className="w-5 h-5" />
            Endringslogg mellom år
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-end gap-4">
            <div className="space-y-2">
              <Label>Fra (kilde)</Label>
              <Select value={sourceYear} onValueChange={setSourceYear}>
                <SelectTrigger className="w-[200px]">
                  <SelectValue placeholder="Velg kilde-år" />
                </SelectTrigger>
                <SelectContent>
                  {availableYears.map(y => (
                    <SelectItem key={y.year} value={y.year}>{y.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="text-xl text-muted-foreground pb-1">&rarr;</div>

            <div className="space-y-2">
              <Label>Til (mål)</Label>
              <Select value={targetYear} onValueChange={setTargetYear}>
                <SelectTrigger className="w-[200px]">
                  <SelectValue placeholder="Velg mål-år" />
                </SelectTrigger>
                <SelectContent>
                  {availableYears.map(y => (
                    <SelectItem key={y.year} value={y.year}>{y.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Button onClick={generateChangelog} disabled={loading || !sourceYear || !targetYear}>
              {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Generer endringslogg
            </Button>

            {changelog && (
              <Button variant="outline" onClick={handleExportPDF} disabled={exporting}>
                {exporting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <FileDown className="w-4 h-4 mr-2" />}
                Eksporter PDF
              </Button>
            )}
          </div>

          {error && (
            <p className="text-destructive text-sm mt-3">{error}</p>
          )}
        </CardContent>
      </Card>

      {/* Results */}
      {changelog && (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <Card className={changelog.reassigned.length > 0 ? 'border-blue-200 bg-blue-50/50' : ''}>
              <CardContent className="pt-4 pb-3 px-4">
                <div className="text-2xl font-bold text-blue-700">{changelog.reassigned.length}</div>
                <div className="text-xs text-muted-foreground">Flyttede vann</div>
              </CardContent>
            </Card>
            <Card className={changelog.newVann.length > 0 ? 'border-green-200 bg-green-50/50' : ''}>
              <CardContent className="pt-4 pb-3 px-4">
                <div className="text-2xl font-bold text-green-700">{changelog.newVann.length}</div>
                <div className="text-xs text-muted-foreground">Nye vann</div>
              </CardContent>
            </Card>
            <Card className={changelog.removedVann.length > 0 ? 'border-red-200 bg-red-50/50' : ''}>
              <CardContent className="pt-4 pb-3 px-4">
                <div className="text-2xl font-bold text-red-700">{changelog.removedVann.length}</div>
                <div className="text-xs text-muted-foreground">Fjernede vann</div>
              </CardContent>
            </Card>
            <Card className={changelog.newLp.length > 0 ? 'border-emerald-200 bg-emerald-50/50' : ''}>
              <CardContent className="pt-4 pb-3 px-4">
                <div className="text-2xl font-bold text-emerald-700">{changelog.newLp.length}</div>
                <div className="text-xs text-muted-foreground">Nye LP</div>
              </CardContent>
            </Card>
            <Card className={changelog.removedOrDeactivatedLp.length > 0 ? 'border-orange-200 bg-orange-50/50' : ''}>
              <CardContent className="pt-4 pb-3 px-4">
                <div className="text-2xl font-bold text-orange-700">{changelog.removedOrDeactivatedLp.length}</div>
                <div className="text-xs text-muted-foreground">Fjernede/deaktiverte LP</div>
              </CardContent>
            </Card>
          </div>

          {totalChanges === 0 && (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                Ingen endringer funnet mellom {sourceLabel} og {targetLabel}.
              </CardContent>
            </Card>
          )}

          {/* Reassigned vann */}
          {changelog.reassigned.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-blue-700">
                  <ArrowRightLeft className="w-4 h-4" />
                  Flyttede vann ({changelog.reassigned.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <SortableHead label="Vann" sortKey="vannName" sort={reassignedSort} onSort={k => setReassignedSort(s => toggleSort(s, k))} />
                      <SortableHead label="Fra LP" sortKey="oldLpKode" sort={reassignedSort} onSort={k => setReassignedSort(s => toggleSort(s, k))} />
                      <SortableHead label="Til LP" sortKey="newLpKode" sort={reassignedSort} onSort={k => setReassignedSort(s => toggleSort(s, k))} />
                      <SortableHead label="Avstandsendring" sortKey="distChange" sort={reassignedSort} onSort={k => setReassignedSort(s => toggleSort(s, k))} className="text-right" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sortedReassigned.map(r => {
                      const distChange = (r.newDistance != null && r.oldDistance != null)
                        ? r.newDistance - r.oldDistance
                        : null;
                      return (
                        <TableRow key={r.vannId}>
                          <TableCell className="font-medium">{r.vannName}</TableCell>
                          <TableCell>{r.oldLpKode}</TableCell>
                          <TableCell>{r.newLpKode}</TableCell>
                          <TableCell className={`text-right ${distChange != null ? (distChange < 0 ? 'text-green-600' : distChange > 0 ? 'text-red-600' : '') : ''}`}>
                            {distChange != null ? `${distChange > 0 ? '+' : ''}${distChange.toFixed(1)} km` : '-'}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}

          {/* New vann */}
          {changelog.newVann.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-green-700">
                  <Plus className="w-4 h-4" />
                  Nye vann ({changelog.newVann.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <SortableHead label="Vann" sortKey="vannName" sort={newVannSort} onSort={k => setNewVannSort(s => toggleSort(s, k))} />
                      <SortableHead label="Tilordnet LP" sortKey="lpKode" sort={newVannSort} onSort={k => setNewVannSort(s => toggleSort(s, k))} />
                      <SortableHead label="Avstand" sortKey="distance" sort={newVannSort} onSort={k => setNewVannSort(s => toggleSort(s, k))} className="text-right" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sortedNewVann.map(v => (
                      <TableRow key={v.vannId}>
                        <TableCell className="font-medium">{v.vannName}</TableCell>
                        <TableCell>{v.lpKode}</TableCell>
                        <TableCell className="text-right">{formatDistance(v.distance)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}

          {/* Removed vann */}
          {changelog.removedVann.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-red-700">
                  <Minus className="w-4 h-4" />
                  Fjernede vann ({changelog.removedVann.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <SortableHead label="Vann" sortKey="vannName" sort={removedVannSort} onSort={k => setRemovedVannSort(s => toggleSort(s, k))} />
                      <SortableHead label="Var tilordnet LP" sortKey="lpKode" sort={removedVannSort} onSort={k => setRemovedVannSort(s => toggleSort(s, k))} />
                      <SortableHead label="Avstand" sortKey="distance" sort={removedVannSort} onSort={k => setRemovedVannSort(s => toggleSort(s, k))} className="text-right" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sortedRemovedVann.map(v => (
                      <TableRow key={v.vannId}>
                        <TableCell className="font-medium">{v.vannName}</TableCell>
                        <TableCell>{v.lpKode}</TableCell>
                        <TableCell className="text-right">{formatDistance(v.distance)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}

          {/* New LPs */}
          {changelog.newLp.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-emerald-700">
                  <MapPin className="w-4 h-4" />
                  Nye landingsplasser ({changelog.newLp.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <SortableHead label="Kode" sortKey="kode" sort={newLpSort} onSort={k => setNewLpSort(s => toggleSort(s, k))} />
                      <SortableHead label="Antall vann" sortKey="vannCount" sort={newLpSort} onSort={k => setNewLpSort(s => toggleSort(s, k))} className="text-right" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sortedNewLp.map(lp => (
                      <TableRow key={lp.lpId}>
                        <TableCell className="font-medium">{lp.kode}</TableCell>
                        <TableCell className="text-right">{lp.vannCount}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}

          {/* Removed / Deactivated LPs */}
          {changelog.removedOrDeactivatedLp.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-orange-700">
                  <MapPin className="w-4 h-4" />
                  Fjernede/deaktiverte landingsplasser ({changelog.removedOrDeactivatedLp.length})
                  {deletedLpCount > 0 && deactivatedLpCount > 0 && (
                    <span className="text-sm font-normal text-muted-foreground ml-2">
                      ({deletedLpCount} slettet, {deactivatedLpCount} deaktivert)
                    </span>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <SortableHead label="Kode" sortKey="kode" sort={removedLpSort} onSort={k => setRemovedLpSort(s => toggleSort(s, k))} />
                      <SortableHead label="Status" sortKey="status" sort={removedLpSort} onSort={k => setRemovedLpSort(s => toggleSort(s, k))} />
                      <SortableHead label="Hadde antall vann" sortKey="vannCount" sort={removedLpSort} onSort={k => setRemovedLpSort(s => toggleSort(s, k))} className="text-right" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sortedRemovedLp.map(lp => (
                      <TableRow key={lp.lpId}>
                        <TableCell className="font-medium">{lp.kode}</TableCell>
                        <TableCell>
                          <Badge variant={lp.status === 'slettet' ? 'destructive' : 'secondary'}>
                            {lp.status === 'slettet' ? 'Slettet' : 'Deaktivert'}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">{lp.vannCount}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
