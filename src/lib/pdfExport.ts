import { supabase, getSessionDirectly } from './supabase';

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

    // Get all completed landingsplass from database
    const { data: completedLandingsplass, error } = await supabase
      .from('vass_lasteplass')
      .select('*')
      .eq('is_done', true)
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