import { supabase, getSessionDirectly } from './supabase';
import { getActiveTableNames } from './tableNames';
import type { VektseddelEntry } from '@/types';

declare global {
  interface Window {
    jspdf: {
      jsPDF: new (options?: Record<string, unknown>) => Record<string, unknown>;
    };
  }
}

interface PDFExportResult {
  success: boolean;
  error?: string;
  fileName?: string;
  itemsExported?: number;
}

// Utility function to parse European decimal numbers (handles both "1.0" and "1,0" formats)
function parseEuropeanDecimal(value: string | number): number {
  if (typeof value === 'number') {
    return isNaN(value) ? 0 : value;
  }
  
  if (typeof value === 'string') {
    // Replace comma with dot for European decimal format
    const normalizedValue = value.replace(',', '.');
    const parsed = parseFloat(normalizedValue);
    return isNaN(parsed) ? 0 : parsed;
  }
  
  return 0;
}

export async function exportCompletedLandingsplassToPDF(): Promise<PDFExportResult> {
  try {
    // Load jsPDF dynamically if not already loaded
    if (typeof window === 'undefined' || !window.jspdf) {
      await loadJsPDF();
    }

    // Get dynamic table names
    const tableNames = await getActiveTableNames();

    // Get all completed and active landingsplass from database
    const { data: completedLandingsplass, error } = await supabase
      .from(tableNames.vass_lasteplass)
      .select('*')
      .eq('is_done', true)
      .eq('is_active', true)
      .order('completed_at', { ascending: false });

    if (error) {
      throw new Error(`Database error: ${error.message}`);
    }

    if (!completedLandingsplass || completedLandingsplass.length === 0) {
      return {
        success: false,
        error: 'Ingen utførte lasteplasser å eksportere'
      };
    }

    // Create PDF using jsPDF
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    
    // Set document properties
    doc.setProperties({
      title: 'Kalkrapport',
      subject: 'Fremdriftsrapport for utførte lasteplasser',
      author: 'Airlift AS',
      creator: 'Airlift AS'
    });

    // Try to load and add logo
    try {
      await addLogoToPDF(doc);
    } catch {
      console.warn('Could not load logo, continuing without it');
    }

    // Title (positioned below logo)
    doc.setFontSize(18);
    doc.setFont(undefined, 'bold');
    doc.text('KALKRAPPORT 2025', 20, 25);
    
    // Generate date
    const now = new Date();
    const dateString = now.toLocaleDateString('nb-NO', { 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });
    doc.setFontSize(10);
    doc.setFont(undefined, 'normal');
    doc.text(`Generert: ${dateString}`, 20, 35);
    
    // Summary
    doc.setFontSize(12);
    doc.setFont(undefined, 'bold');
    doc.text(`Antall utførte lasteplasser: ${completedLandingsplass.length}`, 20, 50);
    
    // Table headers
    let yPosition = 70;
    doc.setFontSize(10);
    doc.setFont(undefined, 'bold');
    
    // Table header
    doc.text('Nr.', 20, yPosition);
    doc.text('Kode', 35, yPosition);
    doc.text('Lasteplass', 60, yPosition);
    doc.text('Tonn', 100, yPosition);
    doc.text('Utført dato', 125, yPosition);
    doc.text('Koordinater', 170, yPosition);
    
    // Draw header line
    doc.line(20, yPosition + 2, 200, yPosition + 2);
    
    yPosition += 10;
    doc.setFont(undefined, 'normal');
    
    // Calculate total tonnage
    let totalTonnage = 0;
    
    // Add data rows
    completedLandingsplass.forEach((lp, index) => {
      // Check if we need a new page (leave more space for summary)
      if (yPosition > 250) {
        doc.addPage();
        yPosition = 30;
        
        // Repeat headers on new page
        doc.setFont(undefined, 'bold');
        doc.text('Nr.', 20, yPosition);
        doc.text('Kode', 35, yPosition);
        doc.text('Lasteplass', 60, yPosition);
        doc.text('Tonn', 100, yPosition);
        doc.text('Utført dato', 125, yPosition);
        doc.text('Koordinater', 170, yPosition);
        doc.line(20, yPosition + 2, 200, yPosition + 2);
        yPosition += 10;
        doc.setFont(undefined, 'normal');
      }
      
      const completedDate = lp.completed_at ? 
        new Date(lp.completed_at).toLocaleString('nb-NO', {
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit'
        }) : 'Ikke angitt';
      
      const coordinates = lp.latitude && lp.longitude ? 
        `${lp.latitude.toFixed(4)}, ${lp.longitude.toFixed(4)}` : 'N/A';
      
      // Truncate long text to fit
      const kode = (lp.kode || '').substring(0, 15);
      const lpName = (lp.lp || 'N/A').substring(0, 25);
      const tonn = lp.tonn_lp || 0;
      
      // Parse tonnage using European decimal format helper
      const parsedTonnage = parseEuropeanDecimal(tonn);
      totalTonnage += parsedTonnage;
      
      doc.text(`${index + 1}`, 20, yPosition);
      doc.text(kode, 35, yPosition);
      doc.text(lpName, 60, yPosition);
      doc.text(tonn === 0 ? 'N/A' : String(tonn), 100, yPosition);
      doc.text(completedDate, 125, yPosition);
      doc.text(coordinates, 170, yPosition);
      
      yPosition += 7;
    });
    
    // Add summary section
    yPosition += 10;
    
    // Check if we need space for summary, if not add new page
    if (yPosition > 260) {
      doc.addPage();
      yPosition = 30;
    }
    
    // Draw separator line
    doc.line(20, yPosition, 200, yPosition);
    yPosition += 10;
    
    // Add total tonnage summary
    doc.setFontSize(12);
    doc.setFont(undefined, 'bold');
    doc.text('SAMMENDRAG', 20, yPosition);
    yPosition += 10;
    
    doc.setFontSize(10);
    doc.setFont(undefined, 'normal');
    doc.text(`Totalt antall utførte lasteplasser: ${completedLandingsplass.length}`, 20, yPosition);
    yPosition += 7;
    
    doc.setFont(undefined, 'bold');
    doc.text(`Total tonnasje: ${totalTonnage.toFixed(2)} tonn`, 20, yPosition);
   
    // Footer
    const totalPages = doc.internal.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.setFont(undefined, 'normal');
      doc.text(`Side ${i} av ${totalPages}`, 170, 290);
      doc.text('Airlift AS', 20, 290);
    }
    
    // Save the PDF
    const fileName = `Utforte_Lasteplasser_${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}-${now.getDate().toString().padStart(2, '0')}.pdf`;
    doc.save(fileName);
    
    // Log the action if user is authenticated
    try {
      const { session } = getSessionDirectly();
      if (session?.user) {
        await supabase
          .from('user_action_logs')
          .insert({
            user_email: session.user.email,
            action_type: 'export_pdf',
            target_type: 'report',
            target_id: 0,
            target_name: 'Completed Landingsplass Report',
            action_details: { 
              items_exported: completedLandingsplass.length,
              report_type: 'completed_landingsplass',
              file_name: fileName
            }
          });
      }
    } catch (logError) {
      console.warn('Could not log PDF export action:', logError);
    }
    
    return {
      success: true,
      fileName,
      itemsExported: completedLandingsplass.length
    };
    
  } catch (error) {
    console.error('Error exporting PDF:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Kunne ikke generere PDF rapport'
    };
  }
}

export async function exportVektseddelToPDF(
  entries: VektseddelEntry[],
  yearLabel: string
): Promise<PDFExportResult> {
  try {
    if (typeof window === 'undefined' || !window.jspdf) {
      await loadJsPDF();
    }
    if (!entries || entries.length === 0) {
      return { success: false, error: 'Ingen vektsedler å eksportere' };
    }

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });

    doc.setProperties({
      title: 'Vektseddelkontroll',
      subject: 'Vektseddelkontroll - Airlift AS',
      author: 'Airlift AS',
      creator: 'Airlift AS',
    });

    try {
      await addLogoToPDF(doc);
    } catch {
      console.warn('Could not load logo');
    }

    doc.setFontSize(16);
    doc.setFont(undefined, 'bold');
    const titleLabel = yearLabel === 'all' ? 'Alle år' : yearLabel;
    doc.text(`Vektseddelkontroll — ${titleLabel}`, 20, 22);

    const now = new Date();
    const dateString = now.toLocaleDateString('nb-NO', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
    doc.setFontSize(9);
    doc.setFont(undefined, 'normal');
    doc.text(`Generert: ${dateString}  |  Antall rader: ${entries.length}`, 20, 28);

    // Landscape A4: 297mm wide. Usable ~275mm (20..295).
    // 13 columns — widths sum to 275mm
    const cols: Array<{ key: keyof VektseddelEntry | 'row' | '_bracket'; label: string; w: number; align?: 'left' | 'right' }> = [
      { key: '_bracket', label: '', w: 6 },
      { key: 'dato', label: 'Dato', w: 20 },
      { key: 'prosjekt', label: 'Prosjekt', w: 20 },
      { key: 'lp_nr', label: 'LP nr', w: 14 },
      { key: 'lp_tonn', label: 'LP tonn', w: 16, align: 'right' },
      { key: 'rest_lp', label: 'Rest LP', w: 16, align: 'right' },
      { key: 'vektseddel_nr', label: 'Vektseddel nr', w: 26 },
      { key: 'tonn_inn', label: 'Tonn inn', w: 16, align: 'right' },
      { key: 'tonn_ut', label: 'Tonn spredt ut', w: 16, align: 'right' },
      { key: 'tonn_akk', label: 'Tonn Akk', w: 18, align: 'right' },
      { key: 'rest_lp2', label: 'Rest LP', w: 16, align: 'right' },
      { key: 'rest_vekts', label: 'Rest Vekts.', w: 20, align: 'right' },
      { key: 'merknader', label: 'Merknader', w: 55 },
      { key: 'sign_teamleder', label: 'Sign Pilot', w: 14 },
    ];

    const startX = 14;
    let y = 38;
    const rowH = 6;

    const drawHeader = () => {
      doc.setFont(undefined, 'bold');
      doc.setFontSize(8);
      let x = startX;
      for (const c of cols) {
        doc.text(c.label, c.align === 'right' ? x + c.w - 1 : x + 1, y, {
          align: c.align === 'right' ? 'right' : 'left',
        });
        x += c.w;
      }
      doc.line(startX, y + 1.5, startX + cols.reduce((s, c) => s + c.w, 0), y + 1.5);
      y += rowH;
      doc.setFont(undefined, 'normal');
    };

    drawHeader();

    let totalInn = 0;
    let totalUt = 0;

    for (let i = 0; i < entries.length; i++) {
      const e = entries[i];
      if (y > 195) {
        doc.addPage();
        y = 20;
        drawHeader();
      }
      let x = startX;
      for (const c of cols) {
        if (c.key === '_bracket') {
          x += c.w;
          continue;
        }
        const raw = (e as Record<string, unknown>)[c.key as string];
        let text = '';
        if (raw !== null && raw !== undefined) {
          if (typeof raw === 'number') {
            text = Number.isInteger(raw) ? String(raw) : raw.toFixed(2);
          } else {
            text = String(raw);
          }
        }
        const maxChars = Math.max(1, Math.floor(c.w / 1.6));
        if (text.length > maxChars) text = text.slice(0, maxChars - 1) + '…';
        doc.text(text, c.align === 'right' ? x + c.w - 1 : x + 1, y, {
          align: c.align === 'right' ? 'right' : 'left',
        });
        x += c.w;
      }

      // Dotted bracket for rows sharing the same Vektseddel nr with a neighbor
      const num = (e.vektseddel_nr || '').trim();
      const prevNum = i > 0 ? (entries[i - 1].vektseddel_nr || '').trim() : '';
      const nextNum = i < entries.length - 1 ? (entries[i + 1].vektseddel_nr || '').trim() : '';
      const sameAsPrev = !!num && num === prevNum;
      const sameAsNext = !!num && num === nextNum;
      if (sameAsPrev || sameAsNext) {
        const cx = startX + 3; // center of 6mm bracket column
        const rowTop = y - 4;
        const rowBottom = y + 2;
        const rowMid = (rowTop + rowBottom) / 2;
        const yFrom = sameAsPrev ? rowTop : rowMid;
        const yTo = sameAsNext ? rowBottom : rowMid;
        doc.setLineDashPattern([0.7, 0.7], 0);
        doc.setDrawColor(108, 117, 125);
        doc.setLineWidth(0.35);
        doc.line(cx, yFrom, cx, yTo);
        doc.setLineDashPattern([], 0);
        doc.setDrawColor(0, 0, 0);
      }

      totalInn += parseEuropeanDecimal(e.tonn_inn ?? 0);
      totalUt += parseEuropeanDecimal(e.tonn_ut ?? 0);
      y += rowH;
    }

    if (y > 190) {
      doc.addPage();
      y = 20;
    }
    y += 4;
    doc.line(startX, y, startX + cols.reduce((s, c) => s + c.w, 0), y);
    y += 6;
    doc.setFont(undefined, 'bold');
    doc.text(`Sum Tonn inn: ${totalInn.toFixed(2)}`, startX, y);
    doc.text(`Sum Tonn spredt ut: ${totalUt.toFixed(2)}`, startX + 60, y);

    const totalPages = doc.internal.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
      doc.setPage(i);
      doc.setFontSize(7);
      doc.setFont(undefined, 'normal');
      doc.text(`Side ${i} av ${totalPages}`, 260, 205);
      doc.text('Airlift AS', 20, 205);
    }

    const fileName = `Vektseddelkontroll_${titleLabel}_${now.getFullYear()}-${(now.getMonth() + 1)
      .toString()
      .padStart(2, '0')}-${now.getDate().toString().padStart(2, '0')}.pdf`;
    doc.save(fileName);

    try {
      const { session } = getSessionDirectly();
      if (session?.user) {
        await supabase.from('user_action_logs').insert({
          user_email: session.user.email,
          action_type: 'export_pdf',
          target_type: 'report',
          target_id: 0,
          target_name: 'Vektseddelkontroll',
          action_details: {
            items_exported: entries.length,
            report_type: 'vektseddel',
            year: yearLabel,
            file_name: fileName,
          },
        });
      }
    } catch (logError) {
      console.warn('Could not log PDF export:', logError);
    }

    return { success: true, fileName, itemsExported: entries.length };
  } catch (error) {
    console.error('Error exporting vektseddel PDF:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Kunne ikke generere PDF',
    };
  }
}

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

async function addLogoToPDF(doc: Record<string, unknown>): Promise<void> {
  return new Promise((resolve, reject) => {
    const logoImg = new Image();
    logoImg.crossOrigin = 'anonymous';
    
    logoImg.onload = () => {
      try {
        // Add logo to PDF (positioned at top-left)
        // Original dimensions: 2116x358 (aspect ratio ≈ 5.9:1)
        // Scale to reasonable header size: width 35, height 6 (35 / 5.9 ≈ 6)
        doc.addImage(logoImg, 'PNG', 20, 10, 35, 6);
        resolve();
      } catch (error) {
        reject(error);
      }
    };
    
    logoImg.onerror = () => {
      reject(new Error('Could not load logo image'));
    };
    
    // Try to load from public directory
    logoImg.src = '/airlift.png';
  });
}

// Make it available globally for backward compatibility
if (typeof window !== 'undefined') {
  (window as Record<string, unknown>).exportCompletedLandingsplassToPDF = exportCompletedLandingsplassToPDF;
} 