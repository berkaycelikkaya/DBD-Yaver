import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

interface Order {
  id: string;
  orderId: string;
  customerName: string;
  fabricCode: string;
  lineDirection: string;
  extraInfo: string;
  dimensions: string;
  status?: string;
}

/**
 * Normalizes Turkish letters to basic Latin alphabet for 100% reliable PDF generation
 * with standard fonts (Helvetica) avoiding any rendering or encoding crashes.
 */
function sanitizeText(text: string): string {
  if (!text) return '';
  return text
    .replace(/ğ/g, 'g')
    .replace(/Ğ/g, 'G')
    .replace(/ş/g, 's')
    .replace(/Ş/g, 'S')
    .replace(/ı/g, 'i')
    .replace(/İ/g, 'I')
    .replace(/ç/g, 'c')
    .replace(/Ç/g, 'C')
    .replace(/ö/g, 'o')
    .replace(/Ö/g, 'O')
    .replace(/ü/g, 'u')
    .replace(/Ü/g, 'U');
}

export function generateOrdersPdf(orders: Order[], dateStr: string, filename: string, mode: 'production' | 'warehouse' = 'production', producerName?: string) {
  // Create instance of jsPDF (A4 Portrait, millimeters)
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4'
  });

  // Calculate printable width
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 15;
  const contentWidth = pageWidth - (margin * 2);

  // Styling options
  doc.setFont('helvetica', 'normal');

  // --- Draw Banner Header ---
  // Large Title
  doc.setFontSize(22);
  doc.setFont('helvetica', 'bold');
  doc.text('YAVER', margin, 22);

  // Tagline/Subtitle
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(120, 120, 120);

  const subtitle = mode === 'production' 
    ? 'Uretim Takip ve Onay Cetveli (Isimsiz)' 
    : 'Depo Ambalaj ve Sevk Plan Raporu';

  doc.text(sanitizeText(subtitle), margin, 27);

  // Divider Line
  doc.setDrawColor(200, 200, 200);
  doc.setLineWidth(0.5);
  doc.line(margin, 31, pageWidth - margin, 31);

  // --- Meta Info Box ---
  doc.setFontSize(10);
  doc.setTextColor(40, 40, 40);
  doc.setFont('helvetica', 'bold');
  doc.text('Tarih / Saat:', margin, 39);
  doc.setFont('helvetica', 'normal');
  doc.text(sanitizeText(dateStr), margin + 25, 39);

  doc.setFont('helvetica', 'bold');
  doc.text('Rapor Tipi:', margin, 45);
  doc.setFont('helvetica', 'normal');

  const reportTypeLabel = mode === 'production' 
    ? 'URETIM RAPORU (Sunger ve Urun Onayli)' 
    : 'DEPO RAPORU (Paket Onayli)';
  doc.text(sanitizeText(reportTypeLabel), margin + 25, 45);

  let startY = 50;
  if (producerName && mode === 'production') {
    doc.setFont('helvetica', 'bold');
    doc.text('Uretici:', margin, 50);
    doc.setFont('helvetica', 'normal');
    doc.text(sanitizeText(producerName), margin + 25, 50);
    startY = 55;
  }

  // Right aligned summary card in header
  const countText = `Toplam: ${orders.length} Adet Siparis`;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(0, 0, 0);
  doc.setFillColor(245, 245, 240);
  doc.rect(pageWidth - margin - 60, 35, 60, 12, 'F');
  doc.text(sanitizeText(countText), pageWidth - margin - 55, 42);

  // Reset colors
  doc.setTextColor(0, 0, 0);

  // --- Build Table Data ---
  const headers = mode === 'production'
    ? [['Sira', 'Siparis No', 'Kumas Kodu', 'Kumas Yonu', 'Ek Bilgi', 'Olculer', 'Asama', 'Sunger', 'Urun']]
    : [['Sira', 'Siparis No', 'Musteri Adi', 'Kumas Kodu', 'Kumas Yonu', 'Ek Bilgi', 'Olculer', 'Asama', 'Paket']];
  
  const body = orders.map((order, index) => {
    if (mode === 'production') {
      return [
        (index + 1).toString(),
        sanitizeText(order.orderId),
        sanitizeText(order.fabricCode),
        sanitizeText(order.lineDirection),
        sanitizeText(order.extraInfo),
        sanitizeText(order.dimensions),
        sanitizeText(order.status || 'Kuyrukta'),
        '[   ]',  // Empty box for sponge tick
        '[   ]'   // Empty box for product tick
      ];
    } else {
      return [
        (index + 1).toString(),
        sanitizeText(order.orderId),
        sanitizeText(order.customerName),
        sanitizeText(order.fabricCode),
        sanitizeText(order.lineDirection),
        sanitizeText(order.extraInfo),
        sanitizeText(order.dimensions),
        sanitizeText(order.status || 'Kuyrukta'),
        '[   ]'   // Empty box for package tick
      ];
    }
  });

  // --- Render Table using jspdf-autotable ---
  autoTable(doc, {
    startY: startY,
    head: headers,
    body: body,
    theme: 'grid',
    styles: {
      font: 'helvetica',
      fontSize: 8.5,
      cellPadding: 2, // Margins compacted slightly to provide more horizontal width
      valign: 'middle'
    },
    headStyles: {
      fillColor: mode === 'production' ? [15, 65, 125] : [20, 20, 20], // Slate blue for production, dark grey for warehouse
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      lineWidth: 0.2,
      lineColor: [40, 40, 40]
    },
    columnStyles: mode === 'production' ? {
      0: { cellWidth: 10, halign: 'center' }, // Sira
      1: { cellWidth: 18, fontStyle: 'bold' }, // Order ID
      2: { cellWidth: 22 },                   // Fabric Code
      3: { cellWidth: 20 },                   // Direction
      4: { cellWidth: 22 },                   // Extra Info
      5: { cellWidth: 'auto', fontStyle: 'bold' }, // Dimensions
      6: { cellWidth: 18, halign: 'center' }, // Asama
      7: { cellWidth: 15, halign: 'center', fontStyle: 'bold' }, // Sunger tick
      8: { cellWidth: 13, halign: 'center', fontStyle: 'bold' }  // Urun tick
    } : {
      0: { cellWidth: 10, halign: 'center' }, // Sira
      1: { cellWidth: 18, fontStyle: 'bold' }, // Order ID
      2: { cellWidth: 28, fontStyle: 'bold' }, // Customer Name
      3: { cellWidth: 20 },                   // Fabric Code
      4: { cellWidth: 18 },                   // Direction
      5: { cellWidth: 18 },                   // Extra Info
      6: { cellWidth: 'auto', fontStyle: 'bold' }, // Dimensions
      7: { cellWidth: 18, halign: 'center' }, // Asama
      8: { cellWidth: 15, halign: 'center', fontStyle: 'bold' }  // Paket tick
    },
    alternateRowStyles: {
      fillColor: [252, 252, 250]
    },
    margin: { left: margin, right: margin, bottom: 20 },
    didDrawPage: (data) => {
      // Draw Page Footer on all pages
      const str = `Sayfa ${data.pageNumber}`;
      doc.setFontSize(8);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(150, 150, 150);
      doc.text(sanitizeText(str), pageWidth - margin - 15, pageHeight - 10);
      const footerLabel = mode === 'production'
        ? 'Yaver Uretim Onay Takip Cetveli'
        : 'Yaver Depo Ambalaj ve Sevk Raporu';
      doc.text(sanitizeText(footerLabel), margin, pageHeight - 10);
    }
  });

  // Save the document with custom filename
  doc.save(filename);
}
