/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useState, useEffect, useRef, ReactNode } from 'react';
import { motion } from 'framer-motion';
import { Airport, Landingsplass, User } from '@/types';
import { supabase } from '@/lib/supabase';
import { useTableNames } from '@/contexts/TableNamesContext';

interface MarkerDetailPanelProps {
  markerType: 'airport' | 'landingsplass';
  markerId: number;
  airports: Airport[];
  landingsplasser: Landingsplass[];
  user: User | null;
  onClose: () => void;
  onDataUpdate: () => void;
  completionUsers?: Record<number, string>;
  onMarkerSelect?: (marker: { type: 'airport' | 'landingsplass'; id: number }) => void;
  onZoomToLocation?: ((lat: number, lng: number, zoom?: number) => void) | null;
}

interface Association {
  id: number;
  name: string;
  tonn: number;
  latitude?: number;
  longitude?: number;
}

interface ContactPerson {
  wassId: number;
  kontaktperson: string;
  forening: string;
  phone: string;
  totalTonn: number;
  matchCount: number;
}

interface ImageData {
  id: number;
  url: string;
  uploaded_at: string;
}

interface DocumentData {
  id: number;
  file_name: string;
  document_url: string;
  file_type: string;
  uploaded_at: string;
}

type TabKey = 'info' | 'files';

const COLORS = {
  airport: '#CB2B3E',
  landingsplass: '#667eea',
  done: '#28a745',
  border: '#e9ecef',
  muted: '#6c757d',
};

// ---------- Small primitives ----------

function Section({
  title,
  icon,
  count,
  action,
  children,
}: {
  title: string;
  icon?: string;
  count?: number;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section
      style={{
        background: 'white',
        border: `1px solid ${COLORS.border}`,
        borderRadius: 8,
        marginBottom: 8,
      }}
    >
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '8px 12px',
          borderBottom: `1px solid ${COLORS.border}`,
          background: '#fafbfc',
          borderTopLeftRadius: 8,
          borderTopRightRadius: 8,
        }}
      >
        <h6
          style={{
            margin: 0,
            fontSize: '0.8rem',
            fontWeight: 700,
            color: '#495057',
            letterSpacing: '0.2px',
            textTransform: 'uppercase',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}
        >
          {icon && <i className={`fas fa-${icon}`} style={{ fontSize: '0.75rem', color: COLORS.muted }} />}
          {title}
          {count != null && (
            <span
              style={{
                fontSize: '0.7rem',
                color: COLORS.muted,
                fontWeight: 600,
                marginLeft: 2,
              }}
            >
              {count}
            </span>
          )}
        </h6>
        {action}
      </header>
      <div style={{ padding: 12 }}>{children}</div>
    </section>
  );
}

function CopyableField({
  label,
  value,
  display,
  hrefPrefix,
}: {
  label: string;
  value: string;
  display?: string;
  hrefPrefix?: 'tel:' | 'mailto:';
}) {
  const [copied, setCopied] = useState(false);
  const handleCopy = (e: React.MouseEvent) => {
    e.preventDefault();
    navigator.clipboard.writeText(value).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    });
  };
  const displayText = display ?? value;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <span style={{ fontSize: '0.7rem', color: COLORS.muted }}>{label}</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        {hrefPrefix ? (
          <a
            href={`${hrefPrefix}${value}`}
            style={{ fontSize: '0.85rem', fontWeight: 600, color: '#2c3e50', textDecoration: 'none' }}
          >
            {displayText}
          </a>
        ) : (
          <strong style={{ fontSize: '0.85rem', color: '#2c3e50' }}>{displayText}</strong>
        )}
        <button
          type="button"
          onClick={handleCopy}
          title={copied ? 'Kopiert!' : 'Kopier'}
          style={{
            background: 'transparent',
            border: 'none',
            padding: '2px 4px',
            cursor: 'pointer',
            color: copied ? COLORS.done : COLORS.muted,
            fontSize: '0.7rem',
          }}
        >
          <i className={`fas fa-${copied ? 'check' : 'copy'}`} />
        </button>
      </div>
    </div>
  );
}

function InfoField({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <span style={{ fontSize: '0.7rem', color: COLORS.muted }}>{label}</span>
      <strong style={{ fontSize: '0.85rem', color: '#2c3e50' }}>{value ?? 'N/A'}</strong>
    </div>
  );
}

function TabButton({
  active,
  label,
  count,
  onClick,
}: {
  active: boolean;
  label: string;
  count?: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        flex: 1,
        background: 'transparent',
        border: 'none',
        borderBottom: active ? `2px solid ${COLORS.landingsplass}` : '2px solid transparent',
        padding: '10px 8px',
        cursor: 'pointer',
        fontSize: '0.85rem',
        fontWeight: active ? 700 : 500,
        color: active ? '#2c3e50' : COLORS.muted,
        transition: 'color 0.15s, border-color 0.15s',
      }}
    >
      {label}
      {count != null && count > 0 && (
        <span
          style={{
            marginLeft: 6,
            fontSize: '0.7rem',
            padding: '1px 6px',
            borderRadius: 10,
            background: active ? COLORS.landingsplass : '#dee2e6',
            color: active ? 'white' : COLORS.muted,
            fontWeight: 600,
          }}
        >
          {count}
        </span>
      )}
    </button>
  );
}

function Spinner() {
  return (
    <div className="text-center py-2">
      <div className="spinner-border spinner-border-sm" role="status">
        <span className="visually-hidden">Laster...</span>
      </div>
    </div>
  );
}

// ---------- Main component ----------

export default function MarkerDetailPanel({
  markerType,
  markerId,
  airports,
  landingsplasser,
  user,
  onClose,
  onDataUpdate,
  completionUsers = {},
  onMarkerSelect,
  onZoomToLocation,
}: MarkerDetailPanelProps) {
  const { tableNames } = useTableNames();
  const [activeTab, setActiveTab] = useState<TabKey>('info');
  const [associations, setAssociations] = useState<Association[]>([]);
  const [contactPersons, setContactPersons] = useState<ContactPerson[]>([]);
  const [images, setImages] = useState<ImageData[]>([]);
  const [documents, setDocuments] = useState<DocumentData[]>([]);
  const [isLoadingAssociations, setIsLoadingAssociations] = useState(true);
  const [isLoadingContactPersons, setIsLoadingContactPersons] = useState(true);
  const [isLoadingImages, setIsLoadingImages] = useState(true);
  const [isLoadingDocuments, setIsLoadingDocuments] = useState(true);
  const [isEditingComment, setIsEditingComment] = useState(false);
  const [commentText, setCommentText] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [isUploadingDocument, setIsUploadingDocument] = useState(false);
  const [editingContactId, setEditingContactId] = useState<number | null>(null);
  const [editingContactData, setEditingContactData] = useState<{
    forening: string;
    kontaktperson: string;
    phone: string;
  } | null>(null);

  const imageInputRef = useRef<HTMLInputElement>(null);
  const documentInputRef = useRef<HTMLInputElement>(null);

  const markerData =
    markerType === 'airport'
      ? airports.find((a) => a.id === markerId)
      : landingsplasser.find((l) => l.id === markerId);

  const isDone = markerData ? (markerData.done || (markerData as any).is_done) : false;
  const accentColor = isDone ? COLORS.done : markerType === 'airport' ? COLORS.airport : COLORS.landingsplass;

  // Load associations
  useEffect(() => {
    const load = async () => {
      if (!markerData || !tableNames) return;
      setIsLoadingAssociations(true);
      try {
        if (markerType === 'airport') {
          const { data, error } = await supabase
            .from(tableNames.vass_associations)
            .select(
              `landingsplass_id,
               ${tableNames.vass_lasteplass}:landingsplass_id (
                 id, lp, kode, latitude, longitude, tonn_lp
               )`
            )
            .eq('airport_id', markerId);
          if (error) throw error;
          const list: Association[] = (data || [])
            .filter((a: any) => a[tableNames.vass_lasteplass])
            .map((a: any) => ({
              id: a[tableNames.vass_lasteplass].id,
              name: `LP ${a[tableNames.vass_lasteplass].lp}${
                a[tableNames.vass_lasteplass].kode ? ` - ${a[tableNames.vass_lasteplass].kode}` : ''
              }`,
              tonn: a[tableNames.vass_lasteplass].tonn_lp || 0,
              latitude: a[tableNames.vass_lasteplass].latitude,
              longitude: a[tableNames.vass_lasteplass].longitude,
            }));
          setAssociations(list);
        } else {
          const { data, error } = await supabase
            .from(tableNames.vass_associations)
            .select(
              `airport_id,
               ${tableNames.vass_vann}:airport_id (
                 id, name, tonn, latitude, longitude
               )`
            )
            .eq('landingsplass_id', markerId);
          if (error) throw error;
          const list: Association[] = (data || [])
            .filter((a: any) => a[tableNames.vass_vann])
            .map((a: any) => ({
              id: a[tableNames.vass_vann].id,
              name: a[tableNames.vass_vann].name || 'Ukjent',
              tonn: a[tableNames.vass_vann].tonn || 0,
              latitude: a[tableNames.vass_vann].latitude,
              longitude: a[tableNames.vass_vann].longitude,
            }));
          setAssociations(list);
        }
      } catch (err) {
        console.error('Error loading associations:', err);
        setAssociations([]);
      } finally {
        setIsLoadingAssociations(false);
      }
    };
    load();
  }, [markerType, markerId, markerData, tableNames]);

  // Load contact persons (LP only) — also count matches for the bulk-update warning
  useEffect(() => {
    const load = async () => {
      if (markerType !== 'landingsplass' || !markerData || !tableNames) return;
      setIsLoadingContactPersons(true);
      try {
        const { data: assocs, error } = await supabase
          .from(tableNames.vass_associations)
          .select(
            `airport_id,
             ${tableNames.vass_vann}:airport_id (
               id, forening, kontaktperson, phone, tonn
             )`
          )
          .eq('landingsplass_id', markerId);
        if (error) throw error;
        const map = new Map<string, ContactPerson>();
        (assocs || []).forEach((assoc: any) => {
          const water = assoc[tableNames.vass_vann];
          if (!water) return;
          const { id, forening, kontaktperson, phone, tonn } = water;
          if (!kontaktperson && !forening && !phone) return;
          const phoneStr = phone ? String(phone) : '';
          const key = `${kontaktperson || ''}-${phoneStr}`;
          if (!map.has(key)) {
            map.set(key, {
              wassId: id,
              forening,
              kontaktperson,
              phone: phoneStr,
              totalTonn: 0,
              matchCount: 0,
            });
          }
          const c = map.get(key)!;
          c.matchCount += 1;
          if (tonn && tonn !== 'N/A' && !isNaN(parseFloat(tonn))) {
            c.totalTonn += parseFloat(tonn);
          }
        });
        const list = Array.from(map.values()).sort((a, b) => {
          if (b.totalTonn !== a.totalTonn) return b.totalTonn - a.totalTonn;
          return (a.kontaktperson || '').localeCompare(b.kontaktperson || '');
        });
        setContactPersons(list);
      } catch (err) {
        console.error('Error loading contact persons:', err);
        setContactPersons([]);
      } finally {
        setIsLoadingContactPersons(false);
      }
    };
    load();
  }, [markerType, markerId, markerData, tableNames]);

  // Load images
  useEffect(() => {
    const load = async () => {
      if (!markerData || !tableNames) return;
      setIsLoadingImages(true);
      try {
        const tableName =
          markerType === 'airport' ? tableNames.vass_vann_images : tableNames.vass_lasteplass_images;
        const { data, error } = await supabase
          .from(tableName)
          .select('id, image_url, created_at')
          .eq('marker_id', markerId)
          .order('created_at', { ascending: false });
        if (error) throw error;
        setImages(
          (data || []).map((img) => ({ id: img.id, url: img.image_url, uploaded_at: img.created_at }))
        );
      } catch (err) {
        console.error('Error loading images:', err);
        setImages([]);
      } finally {
        setIsLoadingImages(false);
      }
    };
    load();
  }, [markerType, markerId, markerData, tableNames]);

  // Load documents
  useEffect(() => {
    const load = async () => {
      if (!markerData || !tableNames) return;
      setIsLoadingDocuments(true);
      try {
        const tableName =
          markerType === 'airport' ? tableNames.vass_vann_documents : tableNames.vass_lasteplass_documents;
        const { data, error } = await supabase
          .from(tableName)
          .select('id, file_name, document_url, file_type, created_at')
          .eq('marker_id', markerId)
          .order('created_at', { ascending: false });
        if (error) throw error;
        setDocuments(
          (data || []).map((d) => ({
            id: d.id,
            file_name: d.file_name,
            document_url: d.document_url,
            file_type: d.file_type,
            uploaded_at: d.created_at,
          }))
        );
      } catch (err) {
        console.error('Error loading documents:', err);
        setDocuments([]);
      } finally {
        setIsLoadingDocuments(false);
      }
    };
    load();
  }, [markerType, markerId, markerData, tableNames]);

  // Init comment
  useEffect(() => {
    if (markerData) setCommentText(markerData.comment || '');
  }, [markerData]);

  // ---------- Handlers (unchanged behavior) ----------

  const handleToggleDone = async () => {
    if (!user?.can_edit_markers || !markerData || !tableNames) return;
    try {
      const newDoneStatus = !isDone;
      const tableName =
        markerType === 'airport' ? tableNames.vass_vann : tableNames.vass_lasteplass;
      const updates: any = { is_done: newDoneStatus };
      if (markerType === 'landingsplass') {
        updates.completed_at = newDoneStatus ? new Date().toISOString() : null;
      }
      const { error } = await supabase.from(tableName).update(updates).eq('id', markerId);
      if (error) throw error;

      // Cascade: when marking an LP, mirror the status onto all its associated waters
      if (markerType === 'landingsplass') {
        try {
          const { data: assocs, error: assocError } = await supabase
            .from(tableNames.vass_associations)
            .select('airport_id')
            .eq('landingsplass_id', markerId);
          if (!assocError && assocs && assocs.length > 0) {
            const airportIds = assocs.map((a: any) => a.airport_id);
            const { error: cascadeError } = await supabase
              .from(tableNames.vass_vann)
              .update({ is_done: newDoneStatus })
              .in('id', airportIds);
            if (cascadeError) console.warn('Could not cascade done to waters:', cascadeError);
          }
        } catch (cascadeErr) {
          console.warn('Error cascading done to waters:', cascadeErr);
        }
      }

      if (user) {
        await supabase.from('user_action_logs').insert({
          user_email: user.email,
          action_type: 'toggle_done',
          target_type: markerType,
          target_id: markerId,
          target_name:
            markerData.name || (markerData as any).navn || (markerData as any).lp || 'Unknown',
          action_details: {
            new_status: newDoneStatus ? 'completed' : 'incomplete',
            completed_at: updates.completed_at,
          },
        });
      }
      await onDataUpdate();
      setTimeout(() => onClose(), 100);
    } catch (err) {
      console.error('Error toggling done status:', err);
      alert('Kunne ikke oppdatere status');
    }
  };

  const handleToggleHazard = async () => {
    if (!user?.can_edit_markers || markerType !== 'airport' || !markerData || !tableNames) return;
    try {
      const newHazard = !((markerData as any).is_hazard ?? false);
      const { error } = await supabase
        .from(tableNames.vass_vann)
        .update({ is_hazard: newHazard })
        .eq('id', markerId);
      if (error) throw error;
      if (user) {
        await supabase.from('user_action_logs').insert({
          user_email: user.email,
          action_type: 'toggle_hazard',
          target_type: 'airport',
          target_id: markerId,
          target_name: markerData.name || (markerData as any).navn || 'Unknown',
          action_details: { is_hazard: newHazard },
        });
      }
      onDataUpdate();
    } catch (err) {
      console.error('Error toggling hazard:', err);
      alert('Kunne ikke oppdatere farevann-status');
    }
  };

  const handleColorChange = async (color: string) => {
    if (!user?.can_edit_markers || markerType !== 'airport' || !markerData || !tableNames) return;
    try {
      const { error } = await supabase
        .from(tableNames.vass_vann)
        .update({ marker_color: color })
        .eq('id', markerId);
      if (error) throw error;
      if (user) {
        await supabase.from('user_action_logs').insert({
          user_email: user.email,
          action_type: 'change_color',
          target_type: 'airport',
          target_id: markerId,
          target_name: markerData.name || 'Unknown',
          action_details: { new_color: color },
        });
      }
      onDataUpdate();
    } catch (err) {
      console.error('Error changing color:', err);
      alert('Kunne ikke endre markørfarge');
    }
  };

  const handleSaveComment = async () => {
    if (!user?.can_edit_markers || !markerData || !tableNames) return;
    try {
      const tableName =
        markerType === 'airport' ? tableNames.vass_vann : tableNames.vass_lasteplass;
      const { error } = await supabase
        .from(tableName)
        .update({
          comment: commentText.trim(),
          comment_timestamp: new Date().toISOString(),
        })
        .eq('id', markerId);
      if (error) throw error;
      if (user) {
        await supabase.from('user_action_logs').insert({
          user_email: user.email,
          action_type: 'add_comment',
          target_type: markerType,
          target_id: markerId,
          target_name:
            markerData.name || (markerData as any).navn || (markerData as any).lp || 'Unknown',
          action_details: { comment_length: commentText.trim().length },
        });
      }
      setIsEditingComment(false);
      onDataUpdate();
    } catch (err) {
      console.error('Error saving comment:', err);
      alert('Kunne ikke lagre kommentar');
    }
  };

  const handleSaveContact = async () => {
    if (!user?.can_edit_markers || !editingContactData || editingContactId === null || !tableNames) return;
    try {
      const phoneValue = editingContactData.phone.trim();
      if (phoneValue && (!/^\d*$/.test(phoneValue) || parseInt(phoneValue) > 2147483647)) {
        alert('Telefonnummeret er for langt eller ugyldig. Bruk maksimalt 10 siffer.');
        return;
      }
      const { data: originalContact } = await supabase
        .from(tableNames.vass_vann)
        .select('kontaktperson, phone')
        .eq('id', editingContactId)
        .single();
      if (!originalContact) {
        alert('Kunne ikke finne kontaktperson');
        return;
      }
      // Confirm bulk update (may touch many rows)
      const editing = contactPersons.find((c) => c.wassId === editingContactId);
      const affected = editing?.matchCount ?? 1;
      if (affected > 1) {
        const ok = confirm(
          `Denne endringen oppdaterer ${affected} vann som deler samme kontaktperson. Fortsett?`
        );
        if (!ok) return;
      }
      const { error } = await supabase
        .from(tableNames.vass_vann)
        .update({
          forening: editingContactData.forening.trim(),
          kontaktperson: editingContactData.kontaktperson.trim(),
          phone: phoneValue || null,
        })
        .eq('kontaktperson', originalContact.kontaktperson)
        .eq('phone', originalContact.phone);
      if (error) throw error;
      if (user) {
        await supabase.from('user_action_logs').insert({
          user_email: user.email,
          action_type: 'edit_contact',
          target_type: 'vass_vann',
          target_id: editingContactId,
          target_name: editingContactData.kontaktperson || 'Unknown',
          action_details: {
            original_kontaktperson: originalContact.kontaktperson,
            original_phone: originalContact.phone,
            new_forening: editingContactData.forening,
            new_kontaktperson: editingContactData.kontaktperson,
            new_phone: editingContactData.phone,
            update_type: 'bulk_update_matching_contacts',
            affected_count: affected,
          },
        });
      }
      setEditingContactId(null);
      setEditingContactData(null);
      onDataUpdate();
    } catch (err) {
      console.error('Error saving contact:', err);
      alert('Kunne ikke lagre kontaktperson');
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    if (!event.target.files || event.target.files.length === 0 || !markerData || !tableNames) return;
    const file = event.target.files[0];
    setIsUploading(true);
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${markerId}_${Date.now()}.${fileExt}`;
      const folderPath = markerType === 'airport' ? 'airport_images' : 'landingsplass_images';
      const filePath = `${folderPath}/${fileName}`;
      const { error: uploadError } = await supabase.storage.from('vass-images').upload(filePath, file);
      if (uploadError) throw uploadError;
      const {
        data: { publicUrl },
      } = supabase.storage.from('vass-images').getPublicUrl(filePath);
      const tableName =
        markerType === 'airport' ? tableNames.vass_vann_images : tableNames.vass_lasteplass_images;
      const { error: dbError } = await supabase.from(tableName).insert({
        marker_id: markerId,
        image_url: publicUrl,
        created_at: new Date().toISOString(),
      });
      if (dbError) throw dbError;
      const { data: newImages } = await supabase
        .from(tableName)
        .select('id, image_url, created_at')
        .eq('marker_id', markerId)
        .order('created_at', { ascending: false });
      setImages(
        (newImages || []).map((img) => ({ id: img.id, url: img.image_url, uploaded_at: img.created_at }))
      );
      if (user) {
        await supabase.from('user_action_logs').insert({
          user_email: user.email,
          action_type: 'upload_image',
          target_type: markerType,
          target_id: markerId,
          target_name:
            markerData.name || (markerData as any).navn || (markerData as any).lp || 'Unknown',
          action_details: { file_name: fileName },
        });
      }
    } catch (err) {
      console.error('Error uploading file:', err);
      alert('Kunne ikke laste opp bilde');
    } finally {
      setIsUploading(false);
      if (imageInputRef.current) imageInputRef.current.value = '';
    }
  };

  const handleDeleteImage = async (imageId: number) => {
    if (!user?.can_edit_markers || !tableNames) return;
    if (!confirm('Er du sikker på at du vil slette dette bildet?')) return;
    try {
      const tableName =
        markerType === 'airport' ? tableNames.vass_vann_images : tableNames.vass_lasteplass_images;
      const { error } = await supabase.from(tableName).delete().eq('id', imageId);
      if (error) throw error;
      setImages(images.filter((img) => img.id !== imageId));
    } catch (err) {
      console.error('Error deleting image:', err);
      alert('Kunne ikke slette bilde');
    }
  };

  const handleDocumentUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    if (!event.target.files || event.target.files.length === 0 || !markerData || !tableNames) return;
    const file = event.target.files[0];
    setIsUploadingDocument(true);
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${markerId}_${Date.now()}.${fileExt}`;
      const folderPath = markerType === 'airport' ? 'airport_documents' : 'landingsplass_documents';
      const filePath = `${folderPath}/${fileName}`;
      const { error: uploadError } = await supabase.storage.from('vass-images').upload(filePath, file);
      if (uploadError) throw uploadError;
      const {
        data: { publicUrl },
      } = supabase.storage.from('vass-images').getPublicUrl(filePath);
      const tableName =
        markerType === 'airport' ? tableNames.vass_vann_documents : tableNames.vass_lasteplass_documents;
      const { error: dbError } = await supabase.from(tableName).insert({
        marker_id: markerId,
        file_name: file.name,
        document_url: publicUrl,
        file_type: fileExt || 'unknown',
        created_at: new Date().toISOString(),
      });
      if (dbError) throw dbError;
      const { data: newDocuments } = await supabase
        .from(tableName)
        .select('id, file_name, document_url, file_type, created_at')
        .eq('marker_id', markerId)
        .order('created_at', { ascending: false });
      setDocuments(
        (newDocuments || []).map((d) => ({
          id: d.id,
          file_name: d.file_name,
          document_url: d.document_url,
          file_type: d.file_type,
          uploaded_at: d.created_at,
        }))
      );
      if (user) {
        await supabase.from('user_action_logs').insert({
          user_email: user.email,
          action_type: 'upload_document',
          target_type: markerType,
          target_id: markerId,
          target_name:
            markerData.name || (markerData as any).navn || (markerData as any).lp || 'Unknown',
          action_details: { file_name: file.name },
        });
      }
    } catch (err) {
      console.error('Error uploading document:', err);
      alert('Kunne ikke laste opp dokument');
    } finally {
      setIsUploadingDocument(false);
      if (documentInputRef.current) documentInputRef.current.value = '';
    }
  };

  const handleDeleteDocument = async (documentId: number) => {
    if (!user?.can_edit_markers || !tableNames) return;
    if (!confirm('Er du sikker på at du vil slette dette dokumentet?')) return;
    try {
      const tableName =
        markerType === 'airport' ? tableNames.vass_vann_documents : tableNames.vass_lasteplass_documents;
      const { error } = await supabase.from(tableName).delete().eq('id', documentId);
      if (error) throw error;
      setDocuments(documents.filter((doc) => doc.id !== documentId));
    } catch (err) {
      console.error('Error deleting document:', err);
      alert('Kunne ikke slette dokument');
    }
  };

  const handleExportGpx = () => {
    if (!markerData || !markerData.latitude || !markerData.longitude) return;
    let mainName: string;
    let mainSym: string;
    if (markerType === 'airport') {
      const waterName = markerData.name || (markerData as any).navn || 'Vann';
      const waterTonn = (markerData as any).tonn;
      const base = waterTonn ? `(${waterTonn}t) ${waterName}` : waterName;
      mainName = `💧 ${base}`;
      mainSym = 'Lake';
    } else {
      const lpCode = (markerData as any).kode || (markerData as any).lp;
      const lpTonn = (markerData as any).tonn_lp;
      const base = lpTonn ? `(${lpTonn}t) ${lpCode}` : lpCode;
      mainName = `🚁 ${base}`;
      mainSym = 'Heliport';
    }
    let waypointsXml = `  <wpt lat="${markerData.latitude}" lon="${markerData.longitude}">
    <name>${mainName}</name>
    <sym>${mainSym}</sym>
    <desc>${markerType === 'airport' ? 'Vann' : 'Landingsplass'}</desc>
  </wpt>`;
    if (markerType === 'landingsplass' && associations.length > 0) {
      associations.forEach((assoc) => {
        if (assoc.latitude && assoc.longitude) {
          const base = assoc.tonn ? `(${assoc.tonn}t) ${assoc.name}` : assoc.name;
          const wptName = `💧 ${base}`;
          waypointsXml += `
  <wpt lat="${assoc.latitude}" lon="${assoc.longitude}">
    <name>${wptName}</name>
    <sym>Lake</sym>
    <desc>Vann</desc>
  </wpt>`;
        }
      });
    }
    const gpxContent = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="NextKalk" xmlns="http://www.topografix.com/GPX/1/1">
${waypointsXml}
</gpx>`;
    const blob = new Blob([gpxContent], { type: 'application/gpx+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const rawFileBase = markerType === 'airport'
      ? (markerData.name || (markerData as any).navn || 'vann')
      : ((markerData as any).kode || (markerData as any).lp || 'lp');
    const fileBase = String(rawFileBase).replace(/[^a-z0-9]+/gi, '_').replace(/^_+|_+$/g, '').toLowerCase() || 'waypoint';
    a.download = `${fileBase}.gpx`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleOpenRoute = () => {
    if (!markerData || !markerData.latitude || !markerData.longitude) return;
    window.open(
      `https://www.google.com/maps/dir/?api=1&destination=${markerData.latitude},${markerData.longitude}`,
      '_blank'
    );
  };

  // ---------- Missing data ----------

  if (!markerData) {
    return (
      <div
        className="marker-detail-panel"
        style={{ height: '100%', background: '#f8f9fa', padding: 16, overflowY: 'auto' }}
      >
        <div className="text-center py-4">
          <i className="fas fa-exclamation-triangle fa-2x text-warning mb-2"></i>
          <p>Kunne ikke finne markørdata</p>
        </div>
      </div>
    );
  }

  const completedDate = (markerData as any).completed_at
    ? new Date((markerData as any).completed_at).toLocaleString('nb-NO', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '';

  const commentTimestamp = markerData.comment_timestamp
    ? new Date(markerData.comment_timestamp).toLocaleString('nb-NO', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '';

  const titleText =
    markerType === 'airport'
      ? markerData.name || (markerData as any).navn || 'Ukjent'
      : `${(markerData as any).kode ? `${(markerData as any).kode} - ` : ''}LP ${
          (markerData as any).lp || 'N/A'
        }`;

  const fileCount = images.length + documents.length;

  // ---------- Render ----------

  return (
    <motion.div
      className="marker-detail-panel"
      style={{
        height: '100%',
        minHeight: 0,
        background: '#f8f9fa',
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
      }}
      initial={{ x: '100%', opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: '100%', opacity: 0 }}
      transition={{ duration: 0.25, ease: 'easeOut' }}
    >
      {/* ---------- Header ---------- */}
      <header
        style={{
          background: 'white',
          borderBottom: `1px solid ${COLORS.border}`,
          borderLeft: `3px solid ${accentColor}`,
          padding: '10px 12px 8px',
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
          <div
            style={{
              fontSize: '1.1rem',
              color: accentColor,
              marginTop: 2,
              flexShrink: 0,
            }}
          >
            <i className={`fas fa-${markerType === 'airport' ? 'water' : 'helicopter-symbol'}`} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontSize: '1rem',
                fontWeight: 700,
                color: '#2c3e50',
                wordBreak: 'break-word',
                lineHeight: 1.3,
              }}
            >
              {titleText}
            </div>
            <div style={{ display: 'flex', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
              {isDone && (
                <span
                  className="badge"
                  style={{
                    fontSize: '0.65rem',
                    background: COLORS.done,
                    color: 'white',
                    fontWeight: 700,
                    padding: '3px 7px',
                  }}
                >
                  UTFØRT
                </span>
              )}
              {markerType === 'landingsplass' && (markerData as any).priority && (
                <span
                  style={{
                    fontSize: '0.65rem',
                    background: '#e9ecef',
                    color: '#495057',
                    fontWeight: 700,
                    padding: '3px 7px',
                    borderRadius: 4,
                  }}
                >
                  P{(markerData as any).priority}
                </span>
              )}
              {markerData.fylke && (
                <span style={{ fontSize: '0.7rem', color: COLORS.muted }}>{markerData.fylke}</span>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            title="Lukk"
            style={{
              background: 'transparent',
              border: 'none',
              fontSize: '1rem',
              color: COLORS.muted,
              cursor: 'pointer',
              padding: 4,
              lineHeight: 1,
              flexShrink: 0,
            }}
          >
            <i className="fas fa-times" />
          </button>
        </div>

        {/* Action row */}
        <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
          <button
            type="button"
            onClick={handleExportGpx}
            title="Eksporter GPX"
            style={{
              flex: 1,
              background: 'white',
              border: `1px solid ${COLORS.border}`,
              borderRadius: 6,
              padding: '6px 8px',
              fontSize: '0.78rem',
              color: '#495057',
              cursor: 'pointer',
              fontWeight: 500,
            }}
          >
            <i className="fas fa-download me-1" />
            GPX
          </button>
          <button
            type="button"
            onClick={handleOpenRoute}
            title="Åpne rute i Google Maps"
            style={{
              flex: 1,
              background: 'white',
              border: `1px solid ${COLORS.border}`,
              borderRadius: 6,
              padding: '6px 8px',
              fontSize: '0.78rem',
              color: '#495057',
              cursor: 'pointer',
              fontWeight: 500,
            }}
          >
            <i className="fas fa-route me-1" />
            Rute
          </button>
          {user?.can_edit_markers ? (
            <button
              type="button"
              onClick={handleToggleDone}
              style={{
                flex: 2,
                background: isDone ? '#fff3cd' : COLORS.done,
                border: `1px solid ${isDone ? '#ffc107' : COLORS.done}`,
                borderRadius: 6,
                padding: '6px 8px',
                fontSize: '0.8rem',
                color: isDone ? '#856404' : 'white',
                cursor: 'pointer',
                fontWeight: 700,
              }}
            >
              <i className={`fas fa-${isDone ? 'undo' : 'check'} me-1`} />
              {isDone ? 'Angre' : 'Marker som utført'}
            </button>
          ) : (
            <div
              style={{
                flex: 2,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '0.7rem',
                color: COLORS.muted,
                border: `1px dashed ${COLORS.border}`,
                borderRadius: 6,
                padding: '6px 8px',
              }}
              title="Ingen tilgang til å endre status"
            >
              <i className="fas fa-lock me-1" />
              Lås
            </div>
          )}
        </div>
      </header>

      {/* ---------- Tabs ---------- */}
      <div
        style={{
          display: 'flex',
          background: 'white',
          borderBottom: `1px solid ${COLORS.border}`,
          flexShrink: 0,
        }}
      >
        <TabButton
          active={activeTab === 'info'}
          label="Info"
          onClick={() => setActiveTab('info')}
        />
        <TabButton
          active={activeTab === 'files'}
          label="Filer"
          count={fileCount}
          onClick={() => setActiveTab('files')}
        />
      </div>

      {/* ---------- Scrollable content ---------- */}
      <div
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: 'auto',
          WebkitOverflowScrolling: 'touch',
          padding: 10,
          paddingBottom: 'calc(40px + env(safe-area-inset-bottom, 0px))',
          overscrollBehavior: 'contain',
        }}
      >
        {activeTab === 'info' && (
          <>
            {/* Completion banner */}
            {isDone && completedDate && (
              <div
                style={{
                  background: 'linear-gradient(135deg, #d4edda, #c3e6cb)',
                  border: '1px solid #b8dcc4',
                  borderRadius: 8,
                  padding: '8px 12px',
                  marginBottom: 8,
                  color: '#155724',
                  fontSize: '0.8rem',
                }}
              >
                <i className="fas fa-calendar-check me-1" />
                Fullført {completedDate}
                {completionUsers[markerId] && (
                  <span style={{ fontStyle: 'italic', marginLeft: 6 }}>
                    av {completionUsers[markerId]}
                  </span>
                )}
              </div>
            )}

            {/* Grunnleggende info */}
            <Section title="Grunnleggende info" icon="info-circle">
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(2, 1fr)',
                  gap: 10,
                }}
              >
                {markerType === 'airport' ? (
                  <>
                    <InfoField label="P.Nr" value={(markerData as any).pnr} />
                    <InfoField
                      label="Tonn"
                      value={(markerData as any).tonn || (markerData as any).tonn_vann}
                    />
                    <div style={{ gridColumn: '1 / -1' }}>
                      <InfoField label="Forening" value={(markerData as any).forening} />
                    </div>
                    <div style={{ gridColumn: '1 / -1' }}>
                      <InfoField label="Kontaktperson" value={(markerData as any).kontaktperson} />
                    </div>
                    {(markerData as any).phone && (
                      <div style={{ gridColumn: '1 / -1' }}>
                        <CopyableField
                          label="Telefon"
                          value={String((markerData as any).phone)}
                          hrefPrefix="tel:"
                        />
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    <InfoField
                      label="Tonn"
                      value={
                        (markerData as any).calculated_tonn
                          ? `${(markerData as any).calculated_tonn.toFixed(1)}t`
                          : 'N/A'
                      }
                    />
                    <InfoField label="Prioritet" value={(markerData as any).priority} />
                  </>
                )}
                <div style={{ gridColumn: '1 / -1' }}>
                  <CopyableField
                    label="Koordinater"
                    value={`${markerData.latitude}, ${markerData.longitude}`}
                    display={`${markerData.latitude?.toFixed(4)}, ${markerData.longitude?.toFixed(4)}`}
                  />
                </div>
                <InfoField label="Fylke" value={markerData.fylke} />
                {(markerData as any).kommune && (
                  <InfoField label="Kommune" value={(markerData as any).kommune} />
                )}
              </div>
            </Section>

            {/* Contact persons (LP only) */}
            {markerType === 'landingsplass' && (
              <Section
                title="Kontaktpersoner"
                icon="address-book"
                count={contactPersons.length}
              >
                {isLoadingContactPersons ? (
                  <Spinner />
                ) : contactPersons.length === 0 ? (
                  <p className="text-muted mb-0" style={{ fontSize: '0.8rem', fontStyle: 'italic' }}>
                    Ingen kontaktpersoner
                  </p>
                ) : (
                  <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                    {contactPersons.map((contact, index) => (
                      <li
                        key={`${contact.wassId}-${index}`}
                        style={{
                          padding: '8px 0',
                          borderBottom:
                            index < contactPersons.length - 1
                              ? `1px solid ${COLORS.border}`
                              : 'none',
                        }}
                      >
                        {editingContactId === contact.wassId ? (
                          <div>
                            <label
                              style={{
                                fontSize: '0.7rem',
                                color: COLORS.muted,
                                display: 'block',
                                marginBottom: 2,
                              }}
                            >
                              Forening
                            </label>
                            <input
                              type="text"
                              className="form-control form-control-sm mb-2"
                              style={{ fontSize: '0.82rem' }}
                              value={editingContactData?.forening || ''}
                              onChange={(e) =>
                                setEditingContactData({
                                  ...editingContactData!,
                                  forening: e.target.value,
                                })
                              }
                            />
                            <label
                              style={{
                                fontSize: '0.7rem',
                                color: COLORS.muted,
                                display: 'block',
                                marginBottom: 2,
                              }}
                            >
                              Kontaktperson
                            </label>
                            <input
                              type="text"
                              className="form-control form-control-sm mb-2"
                              style={{ fontSize: '0.82rem' }}
                              value={editingContactData?.kontaktperson || ''}
                              onChange={(e) =>
                                setEditingContactData({
                                  ...editingContactData!,
                                  kontaktperson: e.target.value,
                                })
                              }
                            />
                            <label
                              style={{
                                fontSize: '0.7rem',
                                color: COLORS.muted,
                                display: 'block',
                                marginBottom: 2,
                              }}
                            >
                              Telefon
                            </label>
                            <input
                              type="text"
                              className="form-control form-control-sm mb-2"
                              style={{ fontSize: '0.82rem' }}
                              value={editingContactData?.phone || ''}
                              onChange={(e) =>
                                setEditingContactData({
                                  ...editingContactData!,
                                  phone: e.target.value,
                                })
                              }
                            />
                            {contact.matchCount > 1 && (
                              <div
                                style={{
                                  fontSize: '0.7rem',
                                  color: '#856404',
                                  background: '#fff3cd',
                                  border: '1px solid #ffeaa7',
                                  borderRadius: 4,
                                  padding: '4px 8px',
                                  marginBottom: 8,
                                }}
                              >
                                <i className="fas fa-exclamation-triangle me-1" />
                                Endringen vil oppdatere {contact.matchCount} vann som deler samme kontakt.
                              </div>
                            )}
                            <div style={{ display: 'flex', gap: 6 }}>
                              <button
                                className="btn btn-success btn-sm flex-fill"
                                style={{ fontSize: '0.78rem' }}
                                onClick={handleSaveContact}
                              >
                                <i className="fas fa-save me-1" />
                                Lagre
                              </button>
                              <button
                                className="btn btn-outline-secondary btn-sm flex-fill"
                                style={{ fontSize: '0.78rem' }}
                                onClick={() => {
                                  setEditingContactId(null);
                                  setEditingContactData(null);
                                }}
                              >
                                Avbryt
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 6 }}>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontWeight: 600, fontSize: '0.85rem', color: '#2c3e50' }}>
                                <i className="fas fa-user me-1" style={{ color: COLORS.muted, fontSize: '0.7rem' }} />
                                {contact.kontaktperson || 'Ukjent'}
                              </div>
                              {contact.forening && (
                                <div style={{ fontSize: '0.75rem', color: COLORS.muted, marginTop: 2 }}>
                                  <i className="fas fa-users me-1" style={{ fontSize: '0.65rem' }} />
                                  {contact.forening}
                                </div>
                              )}
                              {contact.phone && contact.phone.trim() && (
                                <div style={{ marginTop: 4 }}>
                                  <a
                                    href={`tel:${contact.phone}`}
                                    style={{
                                      fontSize: '0.78rem',
                                      color: COLORS.landingsplass,
                                      textDecoration: 'none',
                                      fontWeight: 500,
                                    }}
                                  >
                                    <i className="fas fa-phone me-1" style={{ fontSize: '0.65rem' }} />
                                    {contact.phone}
                                  </a>
                                </div>
                              )}
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                              {contact.totalTonn > 0 && (
                                <span
                                  className="badge bg-success"
                                  style={{ fontSize: '0.65rem' }}
                                  title="Totale tonn"
                                >
                                  {contact.totalTonn.toFixed(1)}t
                                </span>
                              )}
                              {user?.can_edit_markers && (
                                <button
                                  className="btn btn-outline-primary btn-sm"
                                  style={{ fontSize: '0.65rem', padding: '2px 6px' }}
                                  onClick={() => {
                                    setEditingContactId(contact.wassId);
                                    setEditingContactData({
                                      forening: contact.forening,
                                      kontaktperson: contact.kontaktperson,
                                      phone: contact.phone,
                                    });
                                  }}
                                  title="Rediger"
                                >
                                  <i className="fas fa-edit" />
                                </button>
                              )}
                            </div>
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </Section>
            )}

            {/* Associations */}
            <Section
              title={markerType === 'airport' ? 'Tilhørende lasteplass' : 'Relaterte vann'}
              icon={markerType === 'airport' ? 'helicopter-symbol' : 'water'}
              count={associations.length}
            >
              {isLoadingAssociations ? (
                <Spinner />
              ) : associations.length === 0 ? (
                <p className="text-muted mb-0" style={{ fontSize: '0.8rem', fontStyle: 'italic' }}>
                  Ingen assosiasjoner
                </p>
              ) : (
                <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                  {associations.map((assoc, idx) => {
                    const targetType: 'airport' | 'landingsplass' =
                      markerType === 'airport' ? 'landingsplass' : 'airport';
                    const isClickable =
                      typeof assoc.latitude === 'number' &&
                      typeof assoc.longitude === 'number' &&
                      (!!onZoomToLocation || !!onMarkerSelect);
                    const handleClick = () => {
                      if (
                        typeof assoc.latitude === 'number' &&
                        typeof assoc.longitude === 'number'
                      ) {
                        onZoomToLocation?.(assoc.latitude, assoc.longitude, 15);
                      }
                      onMarkerSelect?.({ type: targetType, id: assoc.id });
                    };
                    return (
                      <li
                        key={assoc.id}
                        onClick={isClickable ? handleClick : undefined}
                        role={isClickable ? 'button' : undefined}
                        tabIndex={isClickable ? 0 : undefined}
                        onKeyDown={
                          isClickable
                            ? (e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                  e.preventDefault();
                                  handleClick();
                                }
                              }
                            : undefined
                        }
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          padding: '6px 8px',
                          margin: '0 -8px',
                          borderRadius: 4,
                          borderBottom:
                            idx < associations.length - 1 ? `1px solid ${COLORS.border}` : 'none',
                          fontSize: '0.82rem',
                          cursor: isClickable ? 'pointer' : 'default',
                          transition: 'background-color 0.15s ease',
                        }}
                        onMouseEnter={(e) => {
                          if (isClickable) e.currentTarget.style.backgroundColor = '#f1f3f5';
                        }}
                        onMouseLeave={(e) => {
                          if (isClickable) e.currentTarget.style.backgroundColor = 'transparent';
                        }}
                      >
                        <span style={{ flex: 1, minWidth: 0, wordBreak: 'break-word' }}>
                          <i
                            className={`fas fa-${
                              markerType === 'airport' ? 'helicopter-symbol' : 'water'
                            } me-1`}
                            style={{ color: COLORS.muted, fontSize: '0.7rem' }}
                          />
                          {assoc.name}
                        </span>
                        <span
                          className="badge bg-primary"
                          style={{ fontSize: '0.65rem', flexShrink: 0 }}
                        >
                          {assoc.tonn ? `${assoc.tonn}t` : 'N/A'}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Section>

            {/* Hazard toggle (airport only) */}
            {markerType === 'airport' && (
              <Section title="Farevann" icon="triangle-exclamation">
                {(() => {
                  const isHazard = !!(markerData as any).is_hazard;
                  const canEdit = !!user?.can_edit_markers;
                  return (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.85rem', color: '#495057' }}>
                        <i
                          className="fas fa-triangle-exclamation"
                          style={{ color: isHazard ? '#dc3545' : COLORS.muted, fontSize: '1rem' }}
                        />
                        <span>{isHazard ? 'Markert som farevann' : 'Ikke markert som farevann'}</span>
                      </div>
                      <button
                        type="button"
                        disabled={!canEdit}
                        onClick={handleToggleHazard}
                        style={{
                          background: isHazard ? '#dc3545' : 'white',
                          color: isHazard ? 'white' : '#495057',
                          border: `1px solid ${isHazard ? '#dc3545' : COLORS.border}`,
                          borderRadius: 6,
                          padding: '4px 10px',
                          fontSize: '0.78rem',
                          fontWeight: 600,
                          cursor: canEdit ? 'pointer' : 'not-allowed',
                          opacity: canEdit ? 1 : 0.6,
                        }}
                      >
                        {isHazard ? 'Fjern' : 'Marker'}
                      </button>
                    </div>
                  );
                })()}
              </Section>
            )}

            {/* Color picker (airport only) */}
            {markerType === 'airport' && user?.can_edit_markers && !isDone && (
              <Section title="Markør farge" icon="palette">
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {[
                    { key: 'blue', hex: '#3b82f6', label: 'Blå' },
                    { key: 'red', hex: '#CB2B3E', label: 'Rød' },
                    { key: 'orange', hex: '#FF7F00', label: 'Oransje' },
                    { key: 'purple', hex: '#663399', label: 'Lilla' },
                    { key: 'darkgreen', hex: '#006400', label: 'Mørkegrønn' },
                    { key: 'cadetblue', hex: '#5F9EA0', label: 'Cadetblå' },
                    { key: 'darkred', hex: '#8B0000', label: 'Mørkerød' },
                    { key: 'darkpurple', hex: '#4B0082', label: 'Mørkelilla' },
                  ].map(({ key, hex, label }) => {
                    const isActive = ((markerData as any).marker_color || 'blue') === key;
                    return (
                      <button
                        key={key}
                        type="button"
                        title={label}
                        onClick={() => handleColorChange(key)}
                        style={{
                          width: 30,
                          height: 30,
                          border: `2px solid ${isActive ? '#333' : '#ddd'}`,
                          borderRadius: 6,
                          background: hex,
                          cursor: 'pointer',
                          padding: 0,
                          position: 'relative',
                        }}
                      >
                        {isActive && (
                          <i
                            className="fas fa-check"
                            style={{
                              position: 'absolute',
                              top: '50%',
                              left: '50%',
                              transform: 'translate(-50%, -50%)',
                              color: 'white',
                              fontSize: '0.7rem',
                              textShadow: '0 0 2px rgba(0,0,0,0.6)',
                            }}
                          />
                        )}
                      </button>
                    );
                  })}
                </div>
              </Section>
            )}

            {/* Comment */}
            <Section
              title="Kommentarer"
              icon="comment"
              action={
                !isEditingComment &&
                user?.can_edit_markers &&
                !isDone && (
                  <button
                    className="btn btn-sm btn-outline-primary"
                    style={{ fontSize: '0.7rem', padding: '2px 8px' }}
                    onClick={() => setIsEditingComment(true)}
                  >
                    <i className="fas fa-edit me-1" />
                    {markerData.comment ? 'Rediger' : 'Legg til'}
                  </button>
                )
              }
            >
              {isEditingComment ? (
                <>
                  <textarea
                    className="form-control mb-2"
                    rows={4}
                    value={commentText}
                    onChange={(e) => setCommentText(e.target.value)}
                    style={{ fontSize: '0.85rem', resize: 'vertical' }}
                    autoFocus
                  />
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button
                      className="btn btn-success btn-sm flex-fill"
                      style={{ fontSize: '0.8rem' }}
                      onClick={handleSaveComment}
                    >
                      <i className="fas fa-save me-1" />
                      Lagre
                    </button>
                    <button
                      className="btn btn-outline-secondary btn-sm flex-fill"
                      style={{ fontSize: '0.8rem' }}
                      onClick={() => {
                        setIsEditingComment(false);
                        setCommentText(markerData.comment || '');
                      }}
                    >
                      Avbryt
                    </button>
                  </div>
                </>
              ) : markerData.comment ? (
                <>
                  <p
                    style={{
                      margin: 0,
                      fontSize: '0.85rem',
                      whiteSpace: 'pre-wrap',
                      color: '#2c3e50',
                    }}
                  >
                    {markerData.comment}
                  </p>
                  {commentTimestamp && (
                    <div style={{ fontSize: '0.7rem', color: COLORS.muted, marginTop: 6 }}>
                      {commentTimestamp}
                    </div>
                  )}
                </>
              ) : (
                <p
                  className="text-muted mb-0"
                  style={{ fontSize: '0.8rem', fontStyle: 'italic' }}
                >
                  Ingen kommentarer lagt til
                </p>
              )}
            </Section>
          </>
        )}

        {activeTab === 'files' && (
          <>
            {/* Images */}
            <Section title="Bilder" icon="images" count={images.length}>
              {isLoadingImages ? (
                <Spinner />
              ) : (
                <>
                  {images.length > 0 ? (
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(3, 1fr)',
                        gap: 6,
                        marginBottom: !isDone && user?.can_edit_markers ? 10 : 0,
                      }}
                    >
                      {images.map((image) => (
                        <div
                          key={image.id}
                          style={{
                            position: 'relative',
                            aspectRatio: '1 / 1',
                            borderRadius: 6,
                            overflow: 'hidden',
                            border: `1px solid ${COLORS.border}`,
                          }}
                        >
                          <img
                            src={image.url}
                            alt={`${titleText} — ${new Date(image.uploaded_at).toLocaleDateString('nb-NO')}`}
                            style={{
                              width: '100%',
                              height: '100%',
                              objectFit: 'cover',
                              cursor: 'pointer',
                              display: 'block',
                            }}
                            onClick={() => window.open(image.url, '_blank')}
                          />
                          {user?.can_edit_markers && !isDone && (
                            <button
                              type="button"
                              onClick={() => handleDeleteImage(image.id)}
                              title="Slett bilde"
                              style={{
                                position: 'absolute',
                                top: 4,
                                right: 4,
                                background: 'rgba(220,53,69,0.9)',
                                color: 'white',
                                border: 'none',
                                borderRadius: 4,
                                width: 24,
                                height: 24,
                                fontSize: '0.7rem',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                              }}
                            >
                              <i className="fas fa-trash" />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p
                      className="text-muted mb-0"
                      style={{ fontSize: '0.8rem', fontStyle: 'italic' }}
                    >
                      Ingen bilder lastet opp
                    </p>
                  )}
                  {!isDone && user?.can_edit_markers && (
                    <>
                      <input
                        type="file"
                        accept="image/*"
                        style={{ display: 'none' }}
                        ref={imageInputRef}
                        onChange={handleFileUpload}
                        disabled={isUploading}
                      />
                      <button
                        className="btn btn-outline-primary btn-sm w-100"
                        style={{ fontSize: '0.8rem', marginTop: images.length > 0 ? 4 : 8 }}
                        onClick={() => imageInputRef.current?.click()}
                        disabled={isUploading}
                      >
                        <i
                          className={`fas fa-${isUploading ? 'spinner fa-spin' : 'upload'} me-1`}
                        />
                        {isUploading ? 'Laster opp...' : 'Last opp bilde'}
                      </button>
                    </>
                  )}
                </>
              )}
            </Section>

            {/* Documents */}
            <Section title="Dokumenter" icon="file-alt" count={documents.length}>
              {isLoadingDocuments ? (
                <Spinner />
              ) : (
                <>
                  {documents.length > 0 ? (
                    <ul style={{ listStyle: 'none', margin: '0 0 8px', padding: 0 }}>
                      {documents.map((doc) => {
                        const iconName =
                          doc.file_type === 'pdf'
                            ? 'pdf'
                            : doc.file_type.match(/^(doc|docx)$/)
                            ? 'word'
                            : doc.file_type.match(/^(xls|xlsx)$/)
                            ? 'excel'
                            : 'alt';
                        return (
                          <li
                            key={doc.id}
                            style={{
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                              gap: 6,
                              padding: '6px 8px',
                              background: '#fafbfc',
                              border: `1px solid ${COLORS.border}`,
                              borderRadius: 6,
                              marginBottom: 4,
                            }}
                          >
                            <button
                              type="button"
                              onClick={() => window.open(doc.document_url, '_blank')}
                              title={doc.file_name}
                              style={{
                                flex: 1,
                                minWidth: 0,
                                background: 'transparent',
                                border: 'none',
                                padding: 0,
                                textAlign: 'left',
                                cursor: 'pointer',
                              }}
                            >
                              <div
                                style={{
                                  fontSize: '0.8rem',
                                  fontWeight: 500,
                                  color: '#2c3e50',
                                  whiteSpace: 'nowrap',
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                }}
                              >
                                <i className={`fas fa-file-${iconName} me-1`} />
                                {doc.file_name}
                              </div>
                              <div style={{ fontSize: '0.7rem', color: COLORS.muted, marginTop: 1 }}>
                                {new Date(doc.uploaded_at).toLocaleString('nb-NO', {
                                  year: 'numeric',
                                  month: 'short',
                                  day: 'numeric',
                                })}
                              </div>
                            </button>
                            <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                              <button
                                type="button"
                                onClick={() => window.open(doc.document_url, '_blank')}
                                title="Åpne dokument"
                                style={{
                                  background: 'transparent',
                                  border: 'none',
                                  padding: '4px 6px',
                                  color: COLORS.landingsplass,
                                  cursor: 'pointer',
                                  fontSize: '0.8rem',
                                }}
                              >
                                <i className="fas fa-external-link-alt" />
                              </button>
                              {user?.can_edit_markers && !isDone && (
                                <button
                                  type="button"
                                  onClick={() => handleDeleteDocument(doc.id)}
                                  title="Slett dokument"
                                  style={{
                                    background: 'transparent',
                                    border: 'none',
                                    padding: '4px 6px',
                                    color: '#dc3545',
                                    cursor: 'pointer',
                                    fontSize: '0.8rem',
                                  }}
                                >
                                  <i className="fas fa-trash" />
                                </button>
                              )}
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  ) : (
                    <p
                      className="text-muted mb-0"
                      style={{ fontSize: '0.8rem', fontStyle: 'italic' }}
                    >
                      Ingen dokumenter lastet opp
                    </p>
                  )}
                  {!isDone && user?.can_edit_markers && (
                    <>
                      <input
                        type="file"
                        accept=".pdf,.doc,.docx,.xls,.xlsx,.txt"
                        style={{ display: 'none' }}
                        ref={documentInputRef}
                        onChange={handleDocumentUpload}
                        disabled={isUploadingDocument}
                      />
                      <button
                        className="btn btn-outline-primary btn-sm w-100"
                        style={{ fontSize: '0.8rem', marginTop: documents.length > 0 ? 4 : 8 }}
                        onClick={() => documentInputRef.current?.click()}
                        disabled={isUploadingDocument}
                      >
                        <i
                          className={`fas fa-${
                            isUploadingDocument ? 'spinner fa-spin' : 'upload'
                          } me-1`}
                        />
                        {isUploadingDocument ? 'Laster opp...' : 'Last opp dokument'}
                      </button>
                    </>
                  )}
                </>
              )}
            </Section>
          </>
        )}
      </div>
    </motion.div>
  );
}
