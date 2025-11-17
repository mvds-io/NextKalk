'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
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

export default function MarkerDetailPanel({
  markerType,
  markerId,
  airports,
  landingsplasser,
  user,
  onClose,
  onDataUpdate,
  completionUsers = {}
}: MarkerDetailPanelProps) {
  const { tableNames } = useTableNames();
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
  const [editingContactData, setEditingContactData] = useState<{forening: string; kontaktperson: string; phone: string} | null>(null);

  // Get the current marker data
  const markerData = markerType === 'airport'
    ? airports.find(a => a.id === markerId)
    : landingsplasser.find(l => l.id === markerId);

  const isDone = markerData ? (markerData.done || (markerData as any).is_done) : false;

  // Load associations
  useEffect(() => {
    const loadAssociations = async () => {
      if (!markerData || !tableNames) return;

      setIsLoadingAssociations(true);
      try {
        if (markerType === 'airport') {
          // For airports, get associated landingsplasser
          const { data, error } = await supabase
            .from(tableNames.vass_associations)
            .select(`
              landingsplass_id,
              ${tableNames.vass_lasteplass}:landingsplass_id (
                id, lp, kode, latitude, longitude, tonn_lp
              )
            `)
            .eq('airport_id', markerId);

          if (error) throw error;

          const associationList: Association[] = (data || [])
            .filter((assoc: any) => assoc[tableNames.vass_lasteplass])
            .map((assoc: any) => ({
              id: assoc[tableNames.vass_lasteplass].id,
              name: `LP ${assoc[tableNames.vass_lasteplass].lp}${assoc[tableNames.vass_lasteplass].kode ? ` - ${assoc[tableNames.vass_lasteplass].kode}` : ''}`,
              tonn: assoc[tableNames.vass_lasteplass].tonn_lp || 0,
              latitude: assoc[tableNames.vass_lasteplass].latitude,
              longitude: assoc[tableNames.vass_lasteplass].longitude
            }));

          setAssociations(associationList);
        } else {
          // For landingsplasser, get associated airports/waters
          const { data, error } = await supabase
            .from(tableNames.vass_associations)
            .select(`
              airport_id,
              ${tableNames.vass_vann}:airport_id (
                id, name, tonn, latitude, longitude
              )
            `)
            .eq('landingsplass_id', markerId);

          if (error) throw error;

          const associationList: Association[] = (data || [])
            .filter((assoc: any) => assoc[tableNames.vass_vann])
            .map((assoc: any) => ({
              id: assoc[tableNames.vass_vann].id,
              name: assoc[tableNames.vass_vann].name || 'Ukjent',
              tonn: assoc[tableNames.vass_vann].tonn || 0,
              latitude: assoc[tableNames.vass_vann].latitude,
              longitude: assoc[tableNames.vass_vann].longitude
            }));

          setAssociations(associationList);
        }
      } catch (error) {
        console.error('Error loading associations:', error);
        setAssociations([]);
      } finally {
        setIsLoadingAssociations(false);
      }
    };

    loadAssociations();
  }, [markerType, markerId, markerData, tableNames]);

  // Load contact persons (for landingsplasser only)
  useEffect(() => {
    const loadContactPersons = async () => {
      if (markerType !== 'landingsplass' || !markerData || !tableNames) return;

      setIsLoadingContactPersons(true);
      try {
        const { data: associations, error } = await supabase
          .from(tableNames.vass_associations)
          .select(`
            airport_id,
            ${tableNames.vass_vann}:airport_id (
              id, forening, kontaktperson, phone, tonn
            )
          `)
          .eq('landingsplass_id', markerId);

        if (error) throw error;

        // Extract and deduplicate contact persons, keeping track of the first wassId for each
        const contactPersonsMap = new Map();
        (associations || []).forEach((assoc: any) => {
          const water = assoc[tableNames.vass_vann];
          if (!water) return;

          const { id, forening, kontaktperson, phone, tonn } = water;
          if (kontaktperson || forening || phone) {
            const phoneStr = phone ? String(phone) : '';
            const key = `${kontaktperson || ''}-${phoneStr}`;
            if (!contactPersonsMap.has(key)) {
              contactPersonsMap.set(key, {
                wassId: id,
                forening,
                kontaktperson,
                phone: phoneStr,
                totalTonn: 0
              });
            }

            const contact = contactPersonsMap.get(key);
            if (tonn && tonn !== 'N/A' && !isNaN(parseFloat(tonn))) {
              contact.totalTonn += parseFloat(tonn);
            }
          }
        });

        const contactPersonsList = Array.from(contactPersonsMap.values()).sort((a, b) => {
          if (b.totalTonn !== a.totalTonn) return b.totalTonn - a.totalTonn;
          return (a.kontaktperson || '').localeCompare(b.kontaktperson || '');
        });

        setContactPersons(contactPersonsList);
      } catch (error) {
        console.error('Error loading contact persons:', error);
        setContactPersons([]);
      } finally {
        setIsLoadingContactPersons(false);
      }
    };

    loadContactPersons();
  }, [markerType, markerId, markerData, tableNames]);

  // Load images
  useEffect(() => {
    const loadImages = async () => {
      if (!markerData || !tableNames) return;

      setIsLoadingImages(true);
      try {
        const tableName = markerType === 'airport' ? tableNames.vass_vann_images : tableNames.vass_lasteplass_images;

        const { data, error } = await supabase
          .from(tableName)
          .select('id, image_url, created_at')
          .eq('marker_id', markerId)
          .order('created_at', { ascending: false });

        if (error) throw error;

        // Map to our interface format
        const mappedImages = (data || []).map(img => ({
          id: img.id,
          url: img.image_url,
          uploaded_at: img.created_at
        }));

        setImages(mappedImages);
      } catch (error) {
        console.error('Error loading images:', error);
        setImages([]);
      } finally {
        setIsLoadingImages(false);
      }
    };

    loadImages();
  }, [markerType, markerId, markerData, tableNames]);

  // Load documents
  useEffect(() => {
    const loadDocuments = async () => {
      if (!markerData || !tableNames) return;

      setIsLoadingDocuments(true);
      try {
        const tableName = markerType === 'airport' ? tableNames.vass_vann_documents : tableNames.vass_lasteplass_documents;

        const { data, error } = await supabase
          .from(tableName)
          .select('id, file_name, document_url, file_type, created_at')
          .eq('marker_id', markerId)
          .order('created_at', { ascending: false });

        if (error) throw error;

        const mappedDocuments = (data || []).map(doc => ({
          id: doc.id,
          file_name: doc.file_name,
          document_url: doc.document_url,
          file_type: doc.file_type,
          uploaded_at: doc.created_at
        }));

        setDocuments(mappedDocuments);
      } catch (error) {
        console.error('Error loading documents:', error);
        setDocuments([]);
      } finally {
        setIsLoadingDocuments(false);
      }
    };

    loadDocuments();
  }, [markerType, markerId, markerData, tableNames]);

  // Initialize comment text
  useEffect(() => {
    if (markerData) {
      setCommentText(markerData.comment || '');
    }
  }, [markerData]);

  const handleToggleDone = async () => {
    if (!user?.can_edit_markers || !markerData || !tableNames) return;

    try {
      const newDoneStatus = !isDone;
      const tableName = markerType === 'airport' ? tableNames.vass_vann : tableNames.vass_lasteplass;

      const updates: any = { is_done: newDoneStatus };
      if (newDoneStatus) {
        updates.completed_at = new Date().toISOString();
      } else {
        updates.completed_at = null;
      }

      const { error } = await supabase
        .from(tableName)
        .update(updates)
        .eq('id', markerId);

      if (error) throw error;

      // Log the action
      if (user) {
        await supabase
          .from('user_action_logs')
          .insert({
            user_email: user.email,
            action_type: 'toggle_done',
            target_type: markerType,
            target_id: markerId,
            target_name: markerData.name || (markerData as any).navn || (markerData as any).lp || 'Unknown',
            action_details: {
              new_status: newDoneStatus ? 'completed' : 'incomplete',
              completed_at: updates.completed_at
            }
          });
      }

      // Trigger data update and close the panel to allow fresh data to load
      await onDataUpdate();

      // Small delay to ensure data is refreshed, then close panel
      setTimeout(() => {
        onClose();
      }, 100);
    } catch (error) {
      console.error('Error toggling done status:', error);
      alert('Kunne ikke oppdatere status');
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

      // Log the action
      if (user) {
        await supabase
          .from('user_action_logs')
          .insert({
            user_email: user.email,
            action_type: 'change_color',
            target_type: 'airport',
            target_id: markerId,
            target_name: markerData.name || 'Unknown',
            action_details: { new_color: color }
          });
      }

      onDataUpdate();
    } catch (error) {
      console.error('Error changing color:', error);
      alert('Kunne ikke endre markørfarge');
    }
  };

  const handleSaveComment = async () => {
    if (!user?.can_edit_markers || !markerData || !tableNames) return;

    try {
      const tableName = markerType === 'airport' ? tableNames.vass_vann : tableNames.vass_lasteplass;

      const { error } = await supabase
        .from(tableName)
        .update({
          comment: commentText.trim(),
          comment_timestamp: new Date().toISOString()
        })
        .eq('id', markerId);

      if (error) throw error;

      // Log the action
      if (user) {
        await supabase
          .from('user_action_logs')
          .insert({
            user_email: user.email,
            action_type: 'add_comment',
            target_type: markerType,
            target_id: markerId,
            target_name: markerData.name || (markerData as any).navn || (markerData as any).lp || 'Unknown',
            action_details: { comment_length: commentText.trim().length }
          });
      }

      setIsEditingComment(false);
      onDataUpdate();
    } catch (error) {
      console.error('Error saving comment:', error);
      alert('Kunne ikke lagre kommentar');
    }
  };

  const handleSaveContact = async () => {
    if (!user?.can_edit_markers || !editingContactData || editingContactId === null || !tableNames) return;

    try {
      // Validate phone number length (max integer value is 2,147,483,647)
      const phoneValue = editingContactData.phone.trim();
      if (phoneValue && (!/^\d*$/.test(phoneValue) || parseInt(phoneValue) > 2147483647)) {
        alert('Telefonnummeret er for langt eller ugyldig. Bruk maksimalt 10 siffer.');
        return;
      }

      // First, get the original contact info to find all matching records
      const { data: originalContact } = await supabase
        .from(tableNames.vass_vann)
        .select('kontaktperson, phone')
        .eq('id', editingContactId)
        .single();

      if (!originalContact) {
        alert('Kunne ikke finne kontaktperson');
        return;
      }

      // Update ALL vass_vann records that have the same kontaktperson and phone
      const { error } = await supabase
        .from(tableNames.vass_vann)
        .update({
          forening: editingContactData.forening.trim(),
          kontaktperson: editingContactData.kontaktperson.trim(),
          phone: phoneValue || null
        })
        .eq('kontaktperson', originalContact.kontaktperson)
        .eq('phone', originalContact.phone);

      if (error) throw error;

      // Log the action
      if (user) {
        await supabase
          .from('user_action_logs')
          .insert({
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
              update_type: 'bulk_update_matching_contacts'
            }
          });
      }

      setEditingContactId(null);
      setEditingContactData(null);
      onDataUpdate();
    } catch (error) {
      console.error('Error saving contact:', error);
      alert('Kunne ikke lagre kontaktperson');
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    if (!event.target.files || event.target.files.length === 0 || !markerData || !tableNames) return;

    const file = event.target.files[0];
    setIsUploading(true);

    try {
      // Upload to Supabase storage
      const fileExt = file.name.split('.').pop();
      const fileName = `${markerId}_${Date.now()}.${fileExt}`;
      const folderPath = markerType === 'airport' ? 'airport_images' : 'landingsplass_images';
      const filePath = `${folderPath}/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('images')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from('images')
        .getPublicUrl(filePath);

      // Save reference in database
      const tableName = markerType === 'airport' ? tableNames.vass_vann_images : tableNames.vass_lasteplass_images;

      const { error: dbError } = await supabase
        .from(tableName)
        .insert({
          marker_id: markerId,
          image_url: publicUrl,
          created_at: new Date().toISOString()
        });

      if (dbError) throw dbError;

      // Reload images
      const { data: newImages } = await supabase
        .from(tableName)
        .select('id, image_url, created_at')
        .eq('marker_id', markerId)
        .order('created_at', { ascending: false });

      const mappedImages = (newImages || []).map(img => ({
        id: img.id,
        url: img.image_url,
        uploaded_at: img.created_at
      }));

      setImages(mappedImages);

      // Log the action
      if (user) {
        await supabase
          .from('user_action_logs')
          .insert({
            user_email: user.email,
            action_type: 'upload_image',
            target_type: markerType,
            target_id: markerId,
            target_name: markerData.name || (markerData as any).navn || (markerData as any).lp || 'Unknown',
            action_details: { file_name: fileName }
          });
      }
    } catch (error) {
      console.error('Error uploading file:', error);
      alert('Kunne ikke laste opp bilde');
    } finally {
      setIsUploading(false);
    }
  };

  const handleDeleteImage = async (imageId: number) => {
    if (!user?.can_edit_markers || !confirm('Er du sikker på at du vil slette dette bildet?') || !tableNames) return;

    try {
      const tableName = markerType === 'airport' ? tableNames.vass_vann_images : tableNames.vass_lasteplass_images;

      const { error } = await supabase
        .from(tableName)
        .delete()
        .eq('id', imageId);

      if (error) throw error;

      setImages(images.filter(img => img.id !== imageId));
    } catch (error) {
      console.error('Error deleting image:', error);
      alert('Kunne ikke slette bilde');
    }
  };

  const handleDocumentUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    if (!event.target.files || event.target.files.length === 0 || !markerData || !tableNames) return;

    const file = event.target.files[0];
    setIsUploadingDocument(true);

    try {
      // Upload to Supabase storage
      const fileExt = file.name.split('.').pop();
      const fileName = `${markerId}_${Date.now()}.${fileExt}`;
      const folderPath = markerType === 'airport' ? 'airport_documents' : 'landingsplass_documents';
      const filePath = `${folderPath}/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('documents')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from('documents')
        .getPublicUrl(filePath);

      // Save reference in database
      const tableName = markerType === 'airport' ? tableNames.vass_vann_documents : tableNames.vass_lasteplass_documents;

      const { error: dbError } = await supabase
        .from(tableName)
        .insert({
          marker_id: markerId,
          file_name: file.name,
          document_url: publicUrl,
          file_type: fileExt || 'unknown',
          created_at: new Date().toISOString()
        });

      if (dbError) throw dbError;

      // Reload documents
      const { data: newDocuments } = await supabase
        .from(tableName)
        .select('id, file_name, document_url, file_type, created_at')
        .eq('marker_id', markerId)
        .order('created_at', { ascending: false });

      const mappedDocuments = (newDocuments || []).map(doc => ({
        id: doc.id,
        file_name: doc.file_name,
        document_url: doc.document_url,
        file_type: doc.file_type,
        uploaded_at: doc.created_at
      }));

      setDocuments(mappedDocuments);

      // Log the action
      if (user) {
        await supabase
          .from('user_action_logs')
          .insert({
            user_email: user.email,
            action_type: 'upload_document',
            target_type: markerType,
            target_id: markerId,
            target_name: markerData.name || (markerData as any).navn || (markerData as any).lp || 'Unknown',
            action_details: { file_name: file.name }
          });
      }
    } catch (error) {
      console.error('Error uploading document:', error);
      alert('Kunne ikke laste opp dokument');
    } finally {
      setIsUploadingDocument(false);
    }
  };

  const handleDeleteDocument = async (documentId: number) => {
    if (!user?.can_edit_markers || !confirm('Er du sikker på at du vil slette dette dokumentet?') || !tableNames) return;

    try {
      const tableName = markerType === 'airport' ? tableNames.vass_vann_documents : tableNames.vass_lasteplass_documents;

      const { error } = await supabase
        .from(tableName)
        .delete()
        .eq('id', documentId);

      if (error) throw error;

      setDocuments(documents.filter(doc => doc.id !== documentId));
    } catch (error) {
      console.error('Error deleting document:', error);
      alert('Kunne ikke slette dokument');
    }
  };

  if (!markerData) {
    return (
      <div className="marker-detail-panel" style={{
        height: '100%',
        background: '#f8f9fa',
        padding: '1rem',
        overflowY: 'auto'
      }}>
        <div className="text-center py-4">
          <i className="fas fa-exclamation-triangle fa-2x text-warning mb-2"></i>
          <p>Kunne ikke finne markørdata</p>
        </div>
      </div>
    );
  }

  const completedDate = (markerData as any).completed_at ?
    new Date((markerData as any).completed_at).toLocaleString('nb-NO', {
      year: 'numeric', month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit'
    }) : '';

  const commentTimestamp = markerData.comment_timestamp ?
    new Date(markerData.comment_timestamp).toLocaleString('nb-NO', {
      year: 'numeric', month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit'
    }) : '';

  return (
    <motion.div
      className="marker-detail-panel"
      style={{
        height: '100%',
        background: '#f8f9fa',
        display: 'flex',
        flexDirection: 'column',
        position: 'relative'
      }}
      initial={{ x: '100%', opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: '100%', opacity: 0 }}
      transition={{ duration: 0.3, ease: 'easeInOut' }}
    >
      {/* Header */}
      <div className="card mb-2 mx-2 mt-2" style={{
        border: '1px solid #dee2e6',
        position: 'sticky',
        top: 0,
        zIndex: 10,
        background: 'white'
      }}>
        <div className="card-body p-2">
          <div className="d-flex justify-content-between align-items-start">
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="d-flex align-items-center mb-1">
                <div style={{
                  fontSize: '1.1rem',
                  color: isDone ? '#28a745' : (markerType === 'airport' ? '#CB2B3E' : '#667eea'),
                  marginRight: '0.5rem'
                }}>
                  <i className={`fas fa-${markerType === 'airport' ? 'water' : 'helicopter-symbol'}`}></i>
                </div>
                <h6 className="mb-0" style={{
                  fontWeight: 600,
                  fontSize: '0.95rem',
                  color: '#333',
                  wordBreak: 'break-word'
                }}>
                  {markerType === 'airport'
                    ? (markerData.name || (markerData as any).navn || 'Ukjent')
                    : `${(markerData as any).kode ? `${(markerData as any).kode} - ` : ''}LP ${(markerData as any).lp || 'N/A'}`
                  }
                </h6>
              </div>
              {isDone && (
                <span className="badge bg-success" style={{ fontSize: '0.65rem' }}>
                  UTFØRT
                </span>
              )}
            </div>
            <button
              className="btn btn-sm btn-outline-secondary"
              onClick={onClose}
              style={{ flexShrink: 0, marginLeft: '0.5rem', fontSize: '0.75rem', padding: '0.25rem 0.5rem' }}
            >
              <i className="fas fa-times"></i>
            </button>
          </div>
        </div>
      </div>

      {/* Scrollable Content */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        padding: '0.75rem'
      }}>
        {/* Action Buttons */}
        <div className="card mb-2">
          <div className="card-body p-2">
            <div className="d-flex gap-2">
              <button
                className="btn btn-outline-primary btn-sm flex-fill"
                style={{ fontSize: '0.8rem' }}
                onClick={() => {
                  if (markerData.latitude && markerData.longitude) {
                    // Generate GPX file with main marker and associations
                    let waypointsXml = `  <wpt lat="${markerData.latitude}" lon="${markerData.longitude}">
    <name>${markerType === 'airport' ? (markerData.name || (markerData as any).navn) : `LP ${(markerData as any).lp}`}</name>
    <desc>${markerType === 'airport' ? 'Vann' : 'Landingsplass'}</desc>
  </wpt>`;

                    // For landingsplasser, include all associated waters
                    if (markerType === 'landingsplass' && associations.length > 0) {
                      associations.forEach(assoc => {
                        if (assoc.latitude && assoc.longitude) {
                          waypointsXml += `
  <wpt lat="${assoc.latitude}" lon="${assoc.longitude}">
    <name>${assoc.name}</name>
    <desc>Vann (${assoc.tonn}t)</desc>
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
                    a.download = `${markerType === 'airport' ? (markerData.name || (markerData as any).navn) : `LP_${(markerData as any).lp}`}.gpx`;
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    URL.revokeObjectURL(url);
                  }
                }}
                title="Eksporter GPX"
              >
                <i className="fas fa-download me-1"></i>
                GPX
              </button>
              <button
                className="btn btn-outline-success btn-sm flex-fill"
                style={{ fontSize: '0.8rem' }}
                onClick={() => {
                  if (markerData.latitude && markerData.longitude) {
                    // Open Google Maps directions
                    window.open(
                      `https://www.google.com/maps/dir/?api=1&destination=${markerData.latitude},${markerData.longitude}`,
                      '_blank'
                    );
                  }
                }}
                title="Åpne rute i Google Maps"
              >
                <i className="fas fa-route me-1"></i>
                Rute
              </button>
            </div>
          </div>
        </div>

        {/* Basic Information */}
        <div className="card mb-2">
          <div className="card-body p-2">
            <h6 className="card-title mb-2" style={{ fontSize: '0.85rem', fontWeight: 600 }}>
              <i className="fas fa-info-circle me-1" style={{ fontSize: '0.75rem' }}></i>Grunnleggende info
            </h6>
            <div className="row g-2" style={{ fontSize: '0.8rem' }}>
              {markerType === 'airport' ? (
                <>
                  <div className="col-6">
                    <small className="text-muted d-block">P.Nr:</small>
                    <strong>{(markerData as any).pnr || 'N/A'}</strong>
                  </div>
                  <div className="col-6">
                    <small className="text-muted d-block">Tonn:</small>
                    <strong>{(markerData as any).tonn || (markerData as any).tonn_vann || 'N/A'}</strong>
                  </div>
                  <div className="col-12">
                    <small className="text-muted d-block">Forening:</small>
                    <strong>{(markerData as any).forening || 'N/A'}</strong>
                  </div>
                  <div className="col-12">
                    <small className="text-muted d-block">Kontaktperson:</small>
                    <strong>{(markerData as any).kontaktperson || 'N/A'}</strong>
                  </div>
                  {(markerData as any).phone && (
                    <div className="col-12">
                      <small className="text-muted d-block">Telefon:</small>
                      <strong>{(markerData as any).phone}</strong>
                    </div>
                  )}
                </>
              ) : (
                <>
                  <div className="col-6">
                    <small className="text-muted d-block">Tonn:</small>
                    <strong>{(markerData as any).calculated_tonn ? `${(markerData as any).calculated_tonn.toFixed(1)}t` : 'N/A'}</strong>
                  </div>
                  <div className="col-6">
                    <small className="text-muted d-block">Prioritet:</small>
                    <strong>{(markerData as any).priority || 'N/A'}</strong>
                  </div>
                </>
              )}
              <div className="col-12">
                <small className="text-muted d-block">Koordinater:</small>
                <strong style={{ fontSize: '0.85rem' }}>
                  {markerData.latitude?.toFixed(4)}, {markerData.longitude?.toFixed(4)}
                </strong>
              </div>
              <div className="col-6">
                <small className="text-muted d-block">Fylke:</small>
                <strong>{markerData.fylke || 'N/A'}</strong>
              </div>
              {(markerData as any).kommune && (
                <div className="col-6">
                  <small className="text-muted d-block">Kommune:</small>
                  <strong>{(markerData as any).kommune}</strong>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Completion Info */}
        {isDone && completedDate && (
          <div className="card mb-2" style={{ background: 'linear-gradient(135deg, #d4edda, #c3e6cb)' }}>
            <div className="card-body p-2">
              <h6 className="card-title mb-1" style={{ color: '#155724', fontSize: '0.85rem', fontWeight: 600 }}>
                <i className="fas fa-calendar-check me-1" style={{ fontSize: '0.75rem' }}></i>Fullført
              </h6>
              <p className="mb-0" style={{ fontSize: '0.75rem', color: '#155724' }}>
                {completedDate}
                {completionUsers[markerId] && (
                  <span className="ms-2" style={{ fontSize: '0.7rem' }}>
                    av {completionUsers[markerId]}
                  </span>
                )}
              </p>
            </div>
          </div>
        )}

        {/* Contact Persons (for landingsplasser) */}
        {markerType === 'landingsplass' && (
          <div className="card mb-2">
            <div className="card-body p-2">
              <h6 className="card-title mb-2" style={{ fontSize: '0.85rem', fontWeight: 600 }}>
                <i className="fas fa-address-book me-1" style={{ fontSize: '0.75rem' }}></i>
                Kontaktpersoner ({contactPersons.length})
              </h6>
              {isLoadingContactPersons ? (
                <div className="text-center py-2">
                  <div className="spinner-border spinner-border-sm" role="status">
                    <span className="visually-hidden">Laster...</span>
                  </div>
                </div>
              ) : contactPersons.length === 0 ? (
                <p className="text-muted mb-0" style={{ fontSize: '0.75rem' }}>
                  <em>Ingen kontaktpersoner</em>
                </p>
              ) : (
                <div style={{ maxHeight: '250px', overflowY: 'auto' }}>
                  {contactPersons.map((contact, index) => (
                    <div
                      key={`${contact.wassId}-${index}`}
                      className="mb-1 pb-1"
                      style={{ borderBottom: index < contactPersons.length - 1 ? '1px solid #e9ecef' : 'none' }}
                    >
                      {editingContactId === contact.wassId ? (
                        // Edit mode
                        <div>
                          <div className="mb-2">
                            <label style={{ fontSize: '0.7rem', color: '#6c757d', display: 'block', marginBottom: '0.25rem' }}>
                              Forening:
                            </label>
                            <input
                              type="text"
                              className="form-control form-control-sm"
                              style={{ fontSize: '0.75rem' }}
                              value={editingContactData?.forening || ''}
                              onChange={(e) => setEditingContactData({
                                ...editingContactData!,
                                forening: e.target.value
                              })}
                            />
                          </div>
                          <div className="mb-2">
                            <label style={{ fontSize: '0.7rem', color: '#6c757d', display: 'block', marginBottom: '0.25rem' }}>
                              Kontaktperson:
                            </label>
                            <input
                              type="text"
                              className="form-control form-control-sm"
                              style={{ fontSize: '0.75rem' }}
                              value={editingContactData?.kontaktperson || ''}
                              onChange={(e) => setEditingContactData({
                                ...editingContactData!,
                                kontaktperson: e.target.value
                              })}
                            />
                          </div>
                          <div className="mb-2">
                            <label style={{ fontSize: '0.7rem', color: '#6c757d', display: 'block', marginBottom: '0.25rem' }}>
                              Telefon:
                            </label>
                            <input
                              type="text"
                              className="form-control form-control-sm"
                              style={{ fontSize: '0.75rem' }}
                              value={editingContactData?.phone || ''}
                              onChange={(e) => setEditingContactData({
                                ...editingContactData!,
                                phone: e.target.value
                              })}
                            />
                          </div>
                          <div className="d-flex gap-2">
                            <button
                              className="btn btn-success btn-sm flex-fill"
                              style={{ fontSize: '0.75rem' }}
                              onClick={handleSaveContact}
                            >
                              <i className="fas fa-save me-1"></i>Lagre
                            </button>
                            <button
                              className="btn btn-outline-secondary btn-sm flex-fill"
                              style={{ fontSize: '0.75rem' }}
                              onClick={() => {
                                setEditingContactId(null);
                                setEditingContactData(null);
                              }}
                            >
                              <i className="fas fa-times me-1"></i>Avbryt
                            </button>
                          </div>
                        </div>
                      ) : (
                        // View mode
                        <div className="d-flex justify-content-between align-items-start">
                          <div style={{ flex: 1 }}>
                            <div style={{ fontWeight: 600, fontSize: '0.8rem' }}>
                              <i className="fas fa-user me-1 text-secondary" style={{ fontSize: '0.7rem' }}></i>
                              {contact.kontaktperson || 'Ukjent'}
                            </div>
                            {contact.forening && (
                              <div style={{ fontSize: '0.75rem', color: '#6c757d', marginLeft: '1rem' }}>
                                <i className="fas fa-users me-1" style={{ fontSize: '0.65rem' }}></i>
                                {contact.forening}
                              </div>
                            )}
                            {contact.phone && contact.phone.trim() && (
                              <div style={{ fontSize: '0.75rem', color: '#6c757d', marginLeft: '1rem' }}>
                                <i className="fas fa-phone me-1" style={{ fontSize: '0.65rem' }}></i>
                                {contact.phone}
                              </div>
                            )}
                          </div>
                          <div className="d-flex align-items-center gap-1">
                            {contact.totalTonn > 0 && (
                              <span className="badge bg-success" style={{ fontSize: '0.65rem' }}>
                                {contact.totalTonn.toFixed(1)}t
                              </span>
                            )}
                            {user?.can_edit_markers && (
                              <button
                                className="btn btn-outline-primary btn-sm"
                                style={{ fontSize: '0.65rem', padding: '0.15rem 0.35rem' }}
                                onClick={() => {
                                  setEditingContactId(contact.wassId);
                                  setEditingContactData({
                                    forening: contact.forening,
                                    kontaktperson: contact.kontaktperson,
                                    phone: contact.phone
                                  });
                                }}
                                title="Rediger kontaktperson"
                              >
                                <i className="fas fa-edit"></i>
                              </button>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Associations */}
        <div className="card mb-2">
          <div className="card-body p-2">
            <h6 className="card-title mb-2" style={{ fontSize: '0.85rem', fontWeight: 600 }}>
              <i className={`fas fa-${markerType === 'airport' ? 'helicopter-symbol' : 'water'} me-1`} style={{ fontSize: '0.75rem' }}></i>
              {markerType === 'airport' ? 'Tilhørende lasteplass' : 'Relaterte vann'} ({associations.length})
            </h6>
            {isLoadingAssociations ? (
              <div className="text-center py-1">
                <div className="spinner-border spinner-border-sm" role="status">
                  <span className="visually-hidden">Laster...</span>
                </div>
              </div>
            ) : associations.length === 0 ? (
              <p className="text-muted mb-0" style={{ fontSize: '0.75rem' }}>
                <em>Ingen assosiasjoner</em>
              </p>
            ) : (
              <div style={{ maxHeight: '150px', overflowY: 'auto' }}>
                {associations.map(assoc => (
                  <div
                    key={assoc.id}
                    className="d-flex justify-content-between align-items-center py-1"
                    style={{ borderBottom: '1px solid #e9ecef', fontSize: '0.8rem' }}
                  >
                    <span style={{ flex: 1, wordBreak: 'break-word' }}>
                      <i className={`fas fa-${markerType === 'airport' ? 'helicopter-symbol' : 'water'} me-1 text-secondary`} style={{ fontSize: '0.7rem' }}></i>
                      {assoc.name}
                    </span>
                    <span className="badge bg-primary" style={{ fontSize: '0.65rem', marginLeft: '0.5rem' }}>
                      {assoc.tonn ? `${assoc.tonn}t` : 'N/A'}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Color Picker (for airports only) */}
        {markerType === 'airport' && user?.can_edit_markers && !isDone && (
          <div className="card mb-2">
            <div className="card-body p-2">
              <h6 className="card-title mb-2" style={{ fontSize: '0.85rem', fontWeight: 600 }}>
                <i className="fas fa-palette me-1" style={{ fontSize: '0.75rem' }}></i>Marker farge
              </h6>
              <div className="d-flex flex-wrap gap-1">
                {['red', 'orange', 'blue', 'purple', 'darkgreen', 'cadetblue', 'darkred', 'darkpurple'].map(color => {
                  const colorMap: Record<string, string> = {
                    red: '#CB2B3E',
                    orange: '#FF7F00',
                    blue: '#2E8B57',
                    purple: '#663399',
                    darkgreen: '#006400',
                    cadetblue: '#5F9EA0',
                    darkred: '#8B0000',
                    darkpurple: '#4B0082'
                  };

                  const isActive = ((markerData as any).marker_color || 'red') === color;

                  return (
                    <button
                      key={color}
                      className="btn btn-sm"
                      style={{
                        width: '28px',
                        height: '28px',
                        border: `2px solid ${isActive ? '#333' : '#ccc'}`,
                        borderRadius: '6px',
                        background: colorMap[color],
                        cursor: 'pointer',
                        padding: 0
                      }}
                      onClick={() => handleColorChange(color)}
                      title={color}
                    />
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* Comment Section */}
        <div className="card mb-2">
          <div className="card-body p-2">
            <h6 className="card-title mb-2" style={{ fontSize: '0.85rem', fontWeight: 600 }}>
              <i className="fas fa-comment me-1" style={{ fontSize: '0.75rem' }}></i>Kommentarer
            </h6>
            {isEditingComment ? (
              <>
                <textarea
                  className="form-control mb-2"
                  rows={3}
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                  style={{ fontSize: '0.8rem', resize: 'vertical' }}
                />
                <div className="d-flex gap-2">
                  <button
                    className="btn btn-success btn-sm flex-fill"
                    style={{ fontSize: '0.8rem' }}
                    onClick={handleSaveComment}
                  >
                    <i className="fas fa-save me-1"></i>Lagre
                  </button>
                  <button
                    className="btn btn-outline-secondary btn-sm flex-fill"
                    style={{ fontSize: '0.8rem' }}
                    onClick={() => {
                      setIsEditingComment(false);
                      setCommentText(markerData.comment || '');
                    }}
                  >
                    <i className="fas fa-times me-1"></i>Avbryt
                  </button>
                </div>
              </>
            ) : (
              <>
                <div style={{
                  padding: '0.5rem',
                  background: '#f8f9fa',
                  borderRadius: '0.375rem',
                  marginBottom: '0.5rem',
                  minHeight: '40px'
                }}>
                  {markerData.comment ? (
                    <p className="mb-0" style={{ fontSize: '0.8rem', whiteSpace: 'pre-wrap' }}>
                      {markerData.comment}
                    </p>
                  ) : (
                    <p className="text-muted mb-0" style={{ fontSize: '0.75rem' }}>
                      <em>Ingen kommentarer lagt til</em>
                    </p>
                  )}
                </div>
                {commentTimestamp && (
                  <div className="text-muted mb-2" style={{ fontSize: '0.7rem' }}>
                    {commentTimestamp}
                  </div>
                )}
                {user?.can_edit_markers && !isDone && (
                  <button
                    className="btn btn-outline-primary btn-sm"
                    style={{ fontSize: '0.8rem' }}
                    onClick={() => setIsEditingComment(true)}
                  >
                    <i className="fas fa-edit me-1"></i>
                    {markerData.comment ? 'Rediger' : 'Legg til'}
                  </button>
                )}
              </>
            )}
          </div>
        </div>

        {/* Images Section */}
        <div className="card mb-2">
          <div className="card-body p-2">
            <h6 className="card-title mb-2" style={{ fontSize: '0.85rem', fontWeight: 600 }}>
              <i className="fas fa-images me-1" style={{ fontSize: '0.75rem' }}></i>Bilder ({images.length})
            </h6>
            {isLoadingImages ? (
              <div className="text-center py-2">
                <div className="spinner-border spinner-border-sm" role="status">
                  <span className="visually-hidden">Laster...</span>
                </div>
              </div>
            ) : (
              <>
                {images.length > 0 && (
                  <div className="row g-1 mb-2">
                    {images.map(image => (
                      <div key={image.id} className="col-6">
                        <div style={{ position: 'relative' }}>
                          <img
                            src={image.url}
                            alt="Marker image"
                            style={{
                              width: '100%',
                              height: '80px',
                              objectFit: 'cover',
                              borderRadius: '0.25rem',
                              cursor: 'pointer'
                            }}
                            onClick={() => window.open(image.url, '_blank')}
                          />
                          {user?.can_edit_markers && !isDone && (
                            <button
                              className="btn btn-danger btn-sm"
                              style={{
                                position: 'absolute',
                                top: '2px',
                                right: '2px',
                                padding: '0.15rem 0.35rem',
                                fontSize: '0.65rem'
                              }}
                              onClick={() => handleDeleteImage(image.id)}
                            >
                              <i className="fas fa-trash"></i>
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {!isDone && (
                  <>
                    <input
                      type="file"
                      accept="image/*"
                      style={{ display: 'none' }}
                      id="file-input"
                      onChange={handleFileUpload}
                      disabled={isUploading}
                    />
                    <button
                      className="btn btn-outline-primary btn-sm"
                      style={{ fontSize: '0.8rem' }}
                      onClick={() => document.getElementById('file-input')?.click()}
                      disabled={isUploading}
                    >
                      <i className={`fas fa-${isUploading ? 'spinner fa-spin' : 'upload'} me-1`}></i>
                      {isUploading ? 'Laster opp...' : 'Last opp bilde'}
                    </button>
                  </>
                )}
              </>
            )}
          </div>
        </div>

        {/* Documents Section */}
        <div className="card mb-2">
          <div className="card-body p-2">
            <h6 className="card-title mb-2" style={{ fontSize: '0.85rem', fontWeight: 600 }}>
              <i className="fas fa-file-alt me-1" style={{ fontSize: '0.75rem' }}></i>Dokumenter ({documents.length})
            </h6>
            {isLoadingDocuments ? (
              <div className="text-center py-2">
                <div className="spinner-border spinner-border-sm" role="status">
                  <span className="visually-hidden">Laster...</span>
                </div>
              </div>
            ) : (
              <>
                {documents.length > 0 && (
                  <div className="mb-2">
                    {documents.map(doc => (
                      <div
                        key={doc.id}
                        className="d-flex justify-content-between align-items-center p-1 mb-1"
                        style={{
                          background: '#f8f9fa',
                          borderRadius: '0.25rem',
                          border: '1px solid #e9ecef'
                        }}
                      >
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div
                            style={{
                              fontSize: '0.75rem',
                              fontWeight: 500,
                              color: '#333',
                              whiteSpace: 'nowrap',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              cursor: 'pointer'
                            }}
                            onClick={() => window.open(doc.document_url, '_blank')}
                            title={doc.file_name}
                          >
                            <i className={`fas fa-file-${doc.file_type === 'pdf' ? 'pdf' : doc.file_type.match(/^(doc|docx)$/) ? 'word' : doc.file_type.match(/^(xls|xlsx)$/) ? 'excel' : 'alt'} me-1`} style={{ fontSize: '0.7rem' }}></i>
                            {doc.file_name}
                          </div>
                          <div style={{ fontSize: '0.65rem', color: '#6c757d', marginTop: '0.15rem' }}>
                            {new Date(doc.uploaded_at).toLocaleString('nb-NO', {
                              year: 'numeric',
                              month: 'short',
                              day: 'numeric'
                            })}
                          </div>
                        </div>
                        <div className="d-flex gap-1 ms-1">
                          <button
                            className="btn btn-sm btn-outline-primary"
                            style={{ fontSize: '0.65rem', padding: '0.15rem 0.35rem' }}
                            onClick={() => window.open(doc.document_url, '_blank')}
                            title="Åpne dokument"
                          >
                            <i className="fas fa-external-link-alt"></i>
                          </button>
                          {user?.can_edit_markers && !isDone && (
                            <button
                              className="btn btn-sm btn-outline-danger"
                              style={{ fontSize: '0.65rem', padding: '0.15rem 0.35rem' }}
                              onClick={() => handleDeleteDocument(doc.id)}
                              title="Slett dokument"
                            >
                              <i className="fas fa-trash"></i>
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {!isDone && (
                  <>
                    <input
                      type="file"
                      accept=".pdf,.doc,.docx,.xls,.xlsx,.txt"
                      style={{ display: 'none' }}
                      id="document-input"
                      onChange={handleDocumentUpload}
                      disabled={isUploadingDocument}
                    />
                    <button
                      className="btn btn-outline-primary btn-sm"
                      style={{ fontSize: '0.8rem' }}
                      onClick={() => document.getElementById('document-input')?.click()}
                      disabled={isUploadingDocument}
                    >
                      <i className={`fas fa-${isUploadingDocument ? 'spinner fa-spin' : 'upload'} me-1`}></i>
                      {isUploadingDocument ? 'Laster opp...' : 'Last opp dokument'}
                    </button>
                  </>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {/* Footer Actions */}
      <div style={{
        padding: '0.5rem',
        borderTop: '2px solid #dee2e6',
        background: 'white',
        position: 'sticky',
        bottom: 0
      }}>
        {user?.can_edit_markers ? (
          <button
            className={`btn btn-sm ${isDone ? 'btn-warning' : 'btn-success'} w-100`}
            style={{ fontSize: '0.85rem', fontWeight: 600 }}
            onClick={handleToggleDone}
          >
            <i className={`fas fa-${isDone ? 'undo' : 'check'} me-1`}></i>
            {isDone ? 'Angre' : 'Marker som utført'}
          </button>
        ) : (
          <div className="text-center text-muted" style={{ fontSize: '0.75rem' }}>
            <i className="fas fa-lock me-1"></i>
            Du har ikke tilgang til å endre status
          </div>
        )}
      </div>
    </motion.div>
  );
}
