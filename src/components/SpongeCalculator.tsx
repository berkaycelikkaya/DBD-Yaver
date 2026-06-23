import React, { useState, useMemo, useEffect } from 'react';
import { 
  Layers, 
  Info, 
  Settings, 
  AlertTriangle, 
  Check,
  Package,
  Scissors,
  Sparkles,
  HelpCircle,
  Download,
  Printer
} from 'lucide-react';
import { cn } from '../lib/utils';
import { jsPDF } from 'jspdf';

interface Order {
  id: string;
  orderId: string;
  customerName: string;
  fabricCode: string;
  lineDirection: string;
  extraInfo: string;
  dimensions: string;
}

interface SpongeCalculatorProps {
  orders: Order[];
}

interface PlacedRect {
  id: string;
  orderId: string;
  customerName: string;
  x: number;
  y: number;
  w: number;
  h: number;
  originalW: number;
  originalH: number;
  rotated: boolean;
  splitIndex?: number;
  totalSplits?: number;
  isNativelySplit?: boolean;
}

interface PackingBin {
  id: number;
  placed: PlacedRect[];
  usedArea: number;
  wasteArea: number;
  efficiency: number;
}

interface PackableItem {
  id: string;
  orderId: string;
  customerName: string;
  w: number;
  h: number;
  thickness: number;
  originalString: string;
  splitIndex?: number;
  totalSplits?: number;
  isNativelySplit?: boolean;
}

interface SheetSize {
  width: number;
  height: number;
}

// Utility to find original database ID before split suffix
const getBaseId = (id: string) => id.split('-')[0];

const getPartLabel = (orderId: string, splitIndex?: number, totalSplits?: number) => {
  if (totalSplits && totalSplits > 1 && splitIndex !== undefined) {
    return `${orderId} ${splitIndex + 1}/${totalSplits}`;
  }
  return orderId;
};

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

export const SpongeCalculator: React.FC<SpongeCalculatorProps> = ({ orders }) => {
  // Group tab states: 5 cm, 8 cm, 10 cm, Other
  const [activeThickness, setActiveThickness] = useState<string>('10');

  // Hover item ID state to link SVG visual with list card
  const [hoveredItemId, setHoveredItemId] = useState<string | null>(null);

  // Custom tabaka sizes stored in localStorage for persistence
  const [sheetSizes, setSheetSizes] = useState<{ [key: string]: SheetSize }>(() => {
    const stored = localStorage.getItem('yaver_sponge_sheet_sizes_v2');
    try {
      return stored ? JSON.parse(stored) : {
        '5': { width: 140, height: 240 },
        '8': { width: 140, height: 240 },
        '10': { width: 140, height: 240 },
        'other': { width: 140, height: 240 }
      };
    } catch {
      return {
        '5': { width: 140, height: 240 },
        '8': { width: 140, height: 240 },
        '10': { width: 140, height: 240 },
        'other': { width: 140, height: 240 }
      };
    }
  });

  // Sync sheet sizes to local storage
  useEffect(() => {
    localStorage.setItem('yaver_sponge_sheet_sizes_v2', JSON.stringify(sheetSizes));
  }, [sheetSizes]);

  // Predefined quick size options to swap quickly
  const PRESET_SIZES = [
    { name: '140 x 240 cm (Standart)', width: 140, height: 240 },
    { name: '190 x 240 cm (Geniş)', width: 190, height: 240 },
    { name: '140 x 200 cm (Kısa)', width: 140, height: 200 },
    { name: '120 x 240 cm (Dar)', width: 120, height: 240 }
  ];

  // Parse order dimensions into structured sponge components
  const parsedItems = useMemo<PackableItem[]>(() => {
    return orders
      .filter(order => {
        const extraLower = (order.extraInfo || '').trim().toLowerCase();
        // Check if the extra info mentions "süngerli" or "sünger", but not "süngersiz"
        const isSungerli = (extraLower.includes('sünger') || extraLower.includes('sunger')) &&
                           !extraLower.includes('süngersiz') &&
                           !extraLower.includes('sungersiz');
        return isSungerli;
      })
      .map(order => {
        // Split by 'x', 'X', '*', or '/'
        const cleaned = order.dimensions.replace(/,/g, '.');
        const parts = cleaned.split(/[xX*\/]/).map(p => parseFloat(p.trim()));
        
        let w = parts[0] || 0;
        let h = parts[1] || 0;
        let t = parts[2] || 0;

        return {
          id: order.id,
          orderId: order.orderId,
          customerName: order.customerName,
          w: Math.min(w, h) > 0 ? w : 0,
          h: Math.max(w, h) > 0 ? h : 0,
          thickness: t,
          originalString: order.dimensions
        };
      })
      .filter(i => i.w > 0 && i.h > 0);
  }, [orders]);

  // Group items by thickness category ('5', '8', '10', 'other')
  const groupedItems = useMemo(() => {
    const groups: { [key: string]: PackableItem[] } = {
      '5': [],
      '8': [],
      '10': [],
      'other': []
    };

    parsedItems.forEach(item => {
      const t = item.thickness;
      if (t === 5) {
        groups['5'].push(item);
      } else if (t === 8) {
        groups['8'].push(item);
      } else if (t === 10) {
        groups['10'].push(item);
      } else {
        groups['other'].push(item);
      }
    });

    return groups;
  }, [parsedItems]);

  // Active sheet size configuration
  const activeSheetSize = sheetSizes[activeThickness] || { width: 140, height: 240 };

  // Backtracking / greedy trial alignment helper
  function tryPlaceRect(
    bin: PackingBin,
    item: PackableItem,
    binW: number,
    binH: number
  ): boolean {
    // Collect all corners of already placed items as potential anchor coordinates
    const candidates: { x: number; y: number }[] = [{ x: 0, y: 0 }];
    
    for (const p of bin.placed) {
      candidates.push({ x: p.x + p.w, y: p.y });
      candidates.push({ x: p.x, y: p.y + p.h });
    }

    // Sort candidate anchors: bottom-most (y-ascending), then left-most (x-ascending)
    candidates.sort((a, b) => {
      if (a.y !== b.y) return a.y - b.y;
      return a.x - b.x;
    });

    // Try placing at each candidate anchor point
    for (const c of candidates) {
      const orientations = [
        { w: item.w, h: item.h, rotated: false },
        { w: item.h, h: item.w, rotated: true }
      ];

      for (const o of orientations) {
        // 1. Check bin boundary
        if (c.x + o.w <= binW && c.y + o.h <= binH) {
          // 2. Check overlap with any item already in this bin
          let hasOverlap = false;
          for (const p of bin.placed) {
            if (c.x < p.x + p.w && c.x + o.w > p.x && c.y < p.y + p.h && c.y + o.h > p.y) {
              hasOverlap = true;
              break;
            }
          }

          if (!hasOverlap) {
            // Valid place found! Lock in
            bin.placed.push({
              id: item.id,
              orderId: item.orderId,
              customerName: item.customerName,
              x: c.x,
              y: c.y,
              w: o.w,
              h: o.h,
              originalW: item.w,
              originalH: item.h,
              rotated: o.rotated,
              splitIndex: item.splitIndex,
              totalSplits: item.totalSplits,
              isNativelySplit: item.isNativelySplit
            });
            return true;
          }
        }
      }
    }

    return false;
  }

  // Smart splitting algorithm to divide a totalLength into parts
  // such that each part is <= maxAllowed, and ideally all parts are >= minAllowed (10 cm)
  const calculateSplitPieces = (totalLength: number, maxAllowed: number, minAllowed: number = 10): number[] => {
    if (totalLength <= maxAllowed) {
      return [totalLength];
    }

    // Try to find the smallest number of pieces k such that
    // k * minAllowed <= totalLength <= k * maxAllowed
    const minK = Math.ceil(totalLength / maxAllowed);
    let foundK = -1;
    
    // Check up to 5 more splits to see if a valid size distribution exists
    for (let k = minK; k <= minK + 5; k++) {
      if (k * minAllowed <= totalLength && totalLength <= k * maxAllowed) {
        foundK = k;
        break;
      }
    }

    if (foundK !== -1) {
      const equalSize = totalLength / foundK;
      if (equalSize >= minAllowed && equalSize <= maxAllowed) {
        return Array(foundK).fill(equalSize);
      }

      // If unequal distribution is needed to respect boundaries exactly
      const pieces = Array(foundK).fill(minAllowed);
      let surplus = totalLength - (foundK * minAllowed);
      for (let i = 0; i < foundK; i++) {
        const add = Math.min(surplus, maxAllowed - minAllowed);
        pieces[i] += add;
        surplus -= add;
      }
      return pieces;
    }

    // Fallback if no matching k satisfies the minAllowed limit
    // Just partition equally with the minimum parts count
    const fallbackSize = totalLength / minK;
    return Array(minK).fill(fallbackSize);
  };

  // Pre-split items that naturally exceed standard sheet dimensions or transport vehicle constraints
  // Ensures any item exceeding 190 cm or sheet maximums is safely and optimally split
  const preSplitItem = (item: PackableItem, binW: number, binH: number): PackableItem[] => {
    const maxDim = Math.max(binW, binH);
    const minDim = Math.min(binW, binH);
    
    const origW = Math.min(item.w, item.h);
    const origH = Math.max(item.w, item.h);
    
    if (origW > maxDim) {
      // Physically impossible to fit in either dimension of the sheet
      return [];
    }

    // Vehicle limit constraint: 190 cm. Standard sheet size constraint: sheetLimit.
    const TRANSPORT_LIMIT = 190;
    const sheetLimit = origW <= minDim ? maxDim : minDim;
    const maxPieceLength = Math.min(TRANSPORT_LIMIT, sheetLimit);
    
    // Fits normal without splitting?
    if (origH <= maxPieceLength) {
      return [item];
    }
    
    // Splitting is required
    const splitSizes = calculateSplitPieces(origH, maxPieceLength, 10);
    
    return splitSizes.map((pieceSize, idx) => ({
      ...item,
      id: `${item.id}-natural-${idx}`,
      w: origW,
      h: pieceSize,
      splitIndex: idx,
      totalSplits: splitSizes.length,
      isNativelySplit: true,
      customerName: `${item.customerName} [D${idx + 1}/${splitSizes.length}]`
    }));
  };

  // 2D Nesting packing logic incorporating natural bounds splitting AND dynamic split strategy to secure 90%+ efficiency
  const packItemsForThickness = (thickness: string) => {
    const rawItems = groupedItems[thickness] || [];
    const size = sheetSizes[thickness] || { width: 140, height: 240 };
    const binW = size.width;
    const binH = size.height;

    if (rawItems.length === 0 || binW <= 0 || binH <= 0) {
      return { bins: [], unpacked: [] };
    }

    // Phase 1: Natural split checking (e.g. 100 x 350)
    const packablePool: PackableItem[] = [];
    const physicallyUnfit: PackableItem[] = [];

    for (const item of rawItems) {
      const splits = preSplitItem(item, binW, binH);
      if (splits.length === 0) {
        physicallyUnfit.push(item);
      } else {
        packablePool.push(...splits);
      }
    }

    // Sort items by size descending to achieve best spatial layout first
    const sortedItems = [...packablePool].sort((a, b) => {
      const areaA = a.w * a.h;
      const areaB = b.w * b.h;
      if (areaA !== areaB) {
        return areaB - areaA;
      }
      return Math.max(b.w, b.h) - Math.max(a.w, a.h);
    });

    const bins: PackingBin[] = [];
    let unpackedPool = [...sortedItems];

    // Phase 2: Bin-by-bin packing loops
    while (unpackedPool.length > 0) {
      const bin: PackingBin = {
        id: bins.length + 1,
        placed: [],
        usedArea: 0,
        wasteArea: 0,
        efficiency: 0
      };

      // Step 2a: Try packing all items as WHOLE (no split) as preferred first choice
      let i = 0;
      while (i < unpackedPool.length) {
        const item = unpackedPool[i];
        if (tryPlaceRect(bin, item, binW, binH)) {
          unpackedPool.splice(i, 1); // Placed, remove from pool
        } else {
          i++; // Skip to try next piece
        }
      }

      // Calculate efficiency after placing whole pieces
      const totalBinArea = binW * binH;
      let currentUsedArea = bin.placed.reduce((sum, p) => sum + (p.w * p.h), 0);
      let efficiency = (currentUsedArea / totalBinArea) * 100;

      // Step 2b: If efficiency is below 90%, try splitting remaining items to fill gaps
      if (efficiency < 90 && unpackedPool.length > 0) {
        let pIdx = 0;
        while (pIdx < unpackedPool.length && efficiency < 90) {
          const candidate = unpackedPool[pIdx];

          // We can only split regular items (items that haven't premium natural cuts already)
          const canSplit = !candidate.isNativelySplit;

          if (canSplit) {
            let splitSuccess = false;

            // Try splitting into 2, 3, or up to 4 portions
            for (const splitCount of [2, 3, 4]) {
              const maxSide = Math.max(candidate.w, candidate.h);
              const minSide = Math.min(candidate.w, candidate.h);

              const subW = minSide;
              const subH = maxSide / splitCount;

              // Ensure neither of the split piece dimensions is below 10 cm!
              if (subW < 10 || subH < 10) {
                continue;
              }

              // Setup a simulator environment to see if ALL target pieces fit
              const trialBin: PackingBin = {
                id: bin.id,
                placed: [...bin.placed],
                usedArea: currentUsedArea,
                wasteArea: bin.wasteArea,
                efficiency: efficiency
              };

              let allPiecesPlaced = true;

              for (let sIdx = 0; sIdx < splitCount; sIdx++) {
                const subPiece: PackableItem = {
                  ...candidate,
                  id: `${candidate.id}-split-${splitCount}-${sIdx}`,
                  w: subW,
                  h: subH,
                  splitIndex: sIdx,
                  totalSplits: splitCount,
                  customerName: `${candidate.customerName} [K${sIdx + 1}/${splitCount}]`
                };

                if (!tryPlaceRect(trialBin, subPiece, binW, binH)) {
                  allPiecesPlaced = false;
                  break;
                }
              }

              if (allPiecesPlaced) {
                // Perfect density fit! Swap states and confirm placement
                bin.placed = trialBin.placed;
                unpackedPool.splice(pIdx, 1); // Remove parent from waiting list

                currentUsedArea = bin.placed.reduce((sum, p) => sum + (p.w * p.h), 0);
                efficiency = (currentUsedArea / totalBinArea) * 100;
                splitSuccess = true;
                break; // Stop looking for other split ratios
              }
            }

            if (splitSuccess) {
              continue; // Re-evaluate loop with updated lists
            }
          }

          pIdx++;
        }
      }

      // Finish metrics for this bin
      bin.usedArea = currentUsedArea;
      bin.wasteArea = totalBinArea - currentUsedArea;
      bin.efficiency = Math.round(efficiency);

      bins.push(bin);
    }

    return {
      bins,
      unpacked: [...physicallyUnfit, ...unpackedPool]
    };
  };

  const packingResult = useMemo(() => {
    return packItemsForThickness(activeThickness);
  }, [groupedItems, activeThickness, activeSheetSize]);

  // Update sheet dimensions
  const updateSheetSize = (dimension: 'width' | 'height', value: number) => {
    setSheetSizes(prev => ({
      ...prev,
      [activeThickness]: {
        ...prev[activeThickness],
        [dimension]: Math.max(1, value)
      }
    }));
  };

  // Swap to presets quickly
  const applyPreset = (w: number, h: number) => {
    setSheetSizes(prev => ({
      ...prev,
      [activeThickness]: { width: w, height: h }
    }));
  };

  // Modern crisp vector-based PDF generator for Sponge Layouts
  const exportToPdf = () => {
    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4'
    });

    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 15;

    packingResult.bins.forEach((bin, bIdx) => {
      if (bIdx > 0) {
        doc.addPage();
      }

      // Main header
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(18);
      doc.setTextColor(0, 0, 0);
      doc.text(`YAVER SUNGER KESIM PLANI`, margin, 20);

      // Subheading
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      doc.setTextColor(100, 100, 100);
      doc.text(`Kalinlik: ${activeThickness === 'other' ? 'Diger' : `${activeThickness} cm`} | Tabaka No: ${bin.id} / ${packingResult.bins.length}`, margin, 26);

      // Metainfo boxes
      doc.setFillColor(245, 245, 240);
      doc.rect(margin, 31, pageWidth - (margin * 2), 16, 'F');
      
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(50, 50, 50);
      doc.text(`Tabaka Olculeri:`, margin + 5, 37);
      doc.setFont('helvetica', 'normal');
      doc.text(`${activeSheetSize.width} x ${activeSheetSize.height} cm`, margin + 35, 37);

      doc.setFont('helvetica', 'bold');
      doc.text(`Kullanim Orani:`, margin + 5, 43);
      doc.setFont('helvetica', 'normal');
      doc.text(`%${bin.efficiency} Verimlilik`, margin + 35, 43);

      doc.setFont('helvetica', 'bold');
      doc.text(`Tarih:`, pageWidth - margin - 70, 37);
      doc.setFont('helvetica', 'normal');
      doc.text(new Date().toLocaleDateString('tr-TR'), pageWidth - margin - 55, 37);

      doc.setFont('helvetica', 'bold');
      doc.text(`Toplam Parca:`, pageWidth - margin - 70, 43);
      doc.setFont('helvetica', 'normal');
      doc.text(`${bin.placed.length} Adet`, pageWidth - margin - 55, 43);

      // Draw the Vector diagram
      const binW = activeSheetSize.width;
      const binH = activeSheetSize.height;

      // Fit layout inside high resolution bounding box
      const maxDrawW = 140;
      const maxDrawH = 110;
      const scale = Math.min(maxDrawW / binW, maxDrawH / binH);

      const drawW = binW * scale;
      const drawH = binH * scale;

      // Center diagram horizontally
      const startX = (pageWidth - drawW) / 2;
      const startY = 53;

      // Backdrop sheet border representing the layout boundary
      doc.setDrawColor(180, 180, 180);
      doc.setLineWidth(0.4);
      doc.setFillColor(252, 252, 250);
      doc.rect(startX, startY, drawW, drawH, 'FD');

      // Grid helpers for easy scale alignment
      doc.setDrawColor(240, 240, 240);
      doc.setLineWidth(0.15);
      for (let gridX = 20; gridX < binW; gridX += 20) {
        doc.line(startX + (gridX * scale), startY, startX + (gridX * scale), startY + drawH);
      }
      for (let gridY = 20; gridY < binH; gridY += 20) {
        doc.line(startX, startY + (gridY * scale), startX + drawW, startY + (gridY * scale));
      }

      // Draw each placed chunk
      bin.placed.forEach((item) => {
        const rx = startX + (item.x * scale);
        const ry = startY + (item.y * scale);
        const rw = item.w * scale;
        const rh = item.h * scale;

        doc.setDrawColor(0, 0, 0);
        doc.setLineWidth(0.35);
        doc.setFillColor(235, 242, 250);
        doc.rect(rx, ry, rw, rh, 'FD');

        // Draw helper divider for splits
        if (item.totalSplits && item.totalSplits > 1) {
          doc.setDrawColor(140, 140, 140);
          doc.setLineWidth(0.1);
          doc.line(rx, ry, rx + rw, ry + rh);
        }

        const partLabel = getPartLabel(item.orderId, item.splitIndex, item.totalSplits);
        
        let titleSize = Math.max(5, Math.min(8.5, rw * 0.35));
        let subtitleSize = titleSize * 0.75;

        // Draw crisp labels & measurements on matching locations
        doc.setTextColor(0, 0, 0);
        if (rw >= 12 && rh >= 12) {
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(titleSize);
          doc.text(sanitizeText(partLabel), rx + (rw / 2), ry + (rh / 2) - 1, { align: 'center' });

          doc.setFont('helvetica', 'normal');
          doc.setFontSize(subtitleSize);
          doc.text(`${Math.round(item.w)}x${Math.round(item.h)} cm`, rx + (rw / 2), ry + (rh / 2) + subtitleSize, { align: 'center' });
        } else if (rw >= 6 && rh >= 6) {
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(4.5);
          doc.text(sanitizeText(partLabel), rx + (rw / 2), ry + (rh / 2) + 1, { align: 'center' });
        }
      });

      // Bounding box labels
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6.5);
      doc.setTextColor(120, 120, 120);
      doc.text(`(0,0)`, startX - 2, startY - 2);
      doc.text(`${binW} cm`, startX + drawW - 8, startY - 2);
      doc.text(`${binH} cm`, startX - 8, startY + drawH + 3);

      // Detail guide list below visual canvas
      const tableStartY = startY + drawH + 10;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.setTextColor(0, 0, 0);
      doc.text(`TABAKA #${bin.id} DETAYLI KESIM VE CETVEL HATLARI KILAVUZU`, margin, tableStartY);

      const tableHeaders = [['No', 'Siparis', 'Boyut (cm)', 'Baslangic (X, Y)', 'Sol Hat', 'Ust Hat', 'Yon']];
      const tableRows = bin.placed.map((item, idx) => {
        const partLabel = getPartLabel(item.orderId, item.splitIndex, item.totalSplits);
        const startXCm = Math.round(item.x);
        const endXCm = Math.round(item.x + item.w);
        const startYCm = Math.round(item.y);
        const endYCm = Math.round(item.y + item.h);

        return [
          (idx + 1).toString(),
          sanitizeText(partLabel),
          `${Math.round(item.w)} x ${Math.round(item.h)} cm`,
          `S:${startXCm}, U:${startYCm}`,
          `${startXCm} -> ${endXCm} cm`,
          `${startYCm} -> ${endYCm} cm`,
          item.rotated ? 'Donduruldu (90 deg)' : 'Duz'
        ];
      });

      // Quick fallback table for perfect styling integration
      let currentY = tableStartY + 4;
      doc.setFontSize(7.5);
      
      // Draw a neat table grid manually or with safe formatting to be 100% compliant and robust
      doc.setFillColor(30, 30, 30);
      doc.rect(margin, currentY, pageWidth - (margin * 2), 6, 'F');
      
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(255, 255, 255);
      const colWidths = [10, 25, 30, 25, 33, 33, 24];
      const colPlacements = [margin + 2];
      for (let k = 0; k < colWidths.length - 1; k++) {
        colPlacements.push(colPlacements[k] + colWidths[k]);
      }

      const headers = ['Sira', 'Siparis', 'Boyut', 'Konum', 'Sol Cetvel', 'Ust Cetvel', 'Yon'];
      headers.forEach((h, hIdx) => {
        doc.text(sanitizeText(h), colPlacements[hIdx], currentY + 4.5);
      });

      currentY += 6;
      doc.setTextColor(0, 0, 0);
      
      tableRows.forEach((row, rIdx) => {
        doc.setFont('helvetica', rIdx % 2 === 0 ? 'normal' : 'bold');
        if (rIdx % 2 === 0) {
          doc.setFillColor(248, 248, 246);
        } else {
          doc.setFillColor(255, 255, 255);
        }
        doc.rect(margin, currentY, pageWidth - (margin * 2), 5, 'F');

        // Draw row vertical line borders or border outline
        row.forEach((cell, cIdx) => {
          doc.text(sanitizeText(cell), colPlacements[cIdx], currentY + 3.8);
        });
        currentY += 5;
      });

      // Page numbering footer
      const str = `Sayfa ${bIdx + 1} / ${packingResult.bins.length}`;
      doc.setFontSize(8);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(150, 150, 150);
      doc.text(sanitizeText(str), pageWidth - margin - 20, pageHeight - 8);
      doc.text('Yaver Sunger Optimizasyon Sistemi - Isaretleme ve Cetvel Plankarti', margin, pageHeight - 8);
    });

    const fName = `yaver_sunger_kesim_plani_${activeThickness}cm_${new Date().toISOString().split('T')[0]}.pdf`;
    doc.save(fName);
  };

  // Modern crisp vector-based PDF generator for ALL Sponge thickness layouts packed sequentially
  const exportAllToPdf = () => {
    // Generate active groupings and layouts (excluding 'other' per user requested constraint)
    const activeGroups = ['5', '8', '10'].map(t => {
      const res = packItemsForThickness(t);
      const size = sheetSizes[t] || { width: 140, height: 240 };
      return {
        thickness: t,
        size,
        bins: res.bins
      };
    }).filter(g => g.bins.length > 0);

    const totalPages = activeGroups.reduce((sum, g) => sum + g.bins.length, 0);
    if (totalPages === 0) return;

    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4'
    });

    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 15;

    let globalPageIdx = 0;

    activeGroups.forEach((group) => {
      const labelThickness = group.thickness === 'other' ? 'Diger' : `${group.thickness} cm`;
      const binW = group.size.width;
      const binH = group.size.height;

      group.bins.forEach((bin, bIdx) => {
        if (globalPageIdx > 0) {
          doc.addPage();
        }
        globalPageIdx++;

        // Main header
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(18);
        doc.setTextColor(0, 0, 0);
        doc.text(`YAVER SUNGER KESIM PLANI (TOPLU)`, margin, 20);

        // Subheading
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(10);
        doc.setTextColor(100, 100, 100);
        doc.text(`Kalinlik: ${labelThickness} | Tabaka No: ${bin.id} / ${group.bins.length}`, margin, 26);

        // Metainfo boxes
        doc.setFillColor(245, 245, 240);
        doc.rect(margin, 31, pageWidth - (margin * 2), 16, 'F');
        
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9);
        doc.setTextColor(50, 50, 50);
        doc.text(`Tabaka Olculeri:`, margin + 5, 37);
        doc.setFont('helvetica', 'normal');
        doc.text(`${binW} x ${binH} cm`, margin + 35, 37);

        doc.setFont('helvetica', 'bold');
        doc.text(`Kullanim Orani:`, margin + 5, 43);
        doc.setFont('helvetica', 'normal');
        doc.text(`%${bin.efficiency} Verimlilik`, margin + 35, 43);

        doc.setFont('helvetica', 'bold');
        doc.text(`Tarih:`, pageWidth - margin - 70, 37);
        doc.setFont('helvetica', 'normal');
        doc.text(new Date().toLocaleDateString('tr-TR'), pageWidth - margin - 55, 37);

        doc.setFont('helvetica', 'bold');
        doc.text(`Toplam Parca:`, pageWidth - margin - 70, 43);
        doc.setFont('helvetica', 'normal');
        doc.text(`${bin.placed.length} Adet`, pageWidth - margin - 55, 43);

        // Fit layout inside high resolution bounding box
        const maxDrawW = 140;
        const maxDrawH = 110;
        const scale = Math.min(maxDrawW / binW, maxDrawH / binH);

        const drawW = binW * scale;
        const drawH = binH * scale;

        // Center diagram horizontally
        const startX = (pageWidth - drawW) / 2;
        const startY = 53;

        // Backdrop sheet border representing the layout boundary
        doc.setDrawColor(180, 180, 180);
        doc.setLineWidth(0.4);
        doc.setFillColor(252, 252, 250);
        doc.rect(startX, startY, drawW, drawH, 'FD');

        // Grid helpers for easy scale alignment
        doc.setDrawColor(240, 240, 240);
        doc.setLineWidth(0.15);
        for (let gridX = 20; gridX < binW; gridX += 20) {
          doc.line(startX + (gridX * scale), startY, startX + (gridX * scale), startY + drawH);
        }
        for (let gridY = 20; gridY < binH; gridY += 20) {
          doc.line(startX, startY + (gridY * scale), startX + drawW, startY + (gridY * scale));
        }

        // Draw each placed chunk
        bin.placed.forEach((item) => {
          const rx = startX + (item.x * scale);
          const ry = startY + (item.y * scale);
          const rw = item.w * scale;
          const rh = item.h * scale;

          doc.setDrawColor(0, 0, 0);
          doc.setLineWidth(0.35);
          doc.setFillColor(235, 242, 250);
          doc.rect(rx, ry, rw, rh, 'FD');

          // Draw helper divider for splits
          if (item.totalSplits && item.totalSplits > 1) {
            doc.setDrawColor(140, 140, 140);
            doc.setLineWidth(0.1);
            doc.line(rx, ry, rx + rw, ry + rh);
          }

          const partLabel = getPartLabel(item.orderId, item.splitIndex, item.totalSplits);
          
          let titleSize = Math.max(5, Math.min(8.5, rw * 0.35));
          let subtitleSize = titleSize * 0.75;

          // Draw crisp labels & measurements on matching locations
          doc.setTextColor(0, 0, 0);
          if (rw >= 12 && rh >= 12) {
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(titleSize);
            doc.text(sanitizeText(partLabel), rx + (rw / 2), ry + (rh / 2) - 1, { align: 'center' });

            doc.setFont('helvetica', 'normal');
            doc.setFontSize(subtitleSize);
            doc.text(`${Math.round(item.w)}x${Math.round(item.h)} cm`, rx + (rw / 2), ry + (rh / 2) + subtitleSize, { align: 'center' });
          } else if (rw >= 6 && rh >= 6) {
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(4.5);
            doc.text(sanitizeText(partLabel), rx + (rw / 2), ry + (rh / 2) + 1, { align: 'center' });
          }
        });

        // Bounding box labels
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(6.5);
        doc.setTextColor(120, 120, 120);
        doc.text(`(0,0)`, startX - 2, startY - 2);
        doc.text(`${binW} cm`, startX + drawW - 8, startY - 2);
        doc.text(`${binH} cm`, startX - 8, startY + drawH + 3);

        // Detail guide list below visual canvas
        const tableStartY = startY + drawH + 10;
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10);
        doc.setTextColor(0, 0, 0);
        doc.text(`TABAKA #${bin.id} DETAYLI KESIM VE CETVEL HATLARI KILAVUZU`, margin, tableStartY);

        const tableRows = bin.placed.map((item, idx) => {
          const partLabel = getPartLabel(item.orderId, item.splitIndex, item.totalSplits);
          const startXCm = Math.round(item.x);
          const endXCm = Math.round(item.x + item.w);
          const startYCm = Math.round(item.y);
          const endYCm = Math.round(item.y + item.h);

          return [
            (idx + 1).toString(),
            sanitizeText(partLabel),
            `${Math.round(item.w)} x ${Math.round(item.h)} cm`,
            `S:${startXCm}, U:${startYCm}`,
            `${startXCm} -> ${endXCm} cm`,
            `${startYCm} -> ${endYCm} cm`,
            item.rotated ? 'Donduruldu (90 deg)' : 'Duz'
          ];
        });

        // Quick fallback table for perfect styling integration
        let currentY = tableStartY + 4;
        doc.setFontSize(7.5);
        
        // Draw a neat table grid manually or with safe formatting to be 100% compliant and robust
        doc.setFillColor(30, 30, 30);
        doc.rect(margin, currentY, pageWidth - (margin * 2), 6, 'F');
        
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(255, 255, 255);
        const colWidths = [10, 25, 30, 25, 33, 33, 24];
        const colPlacements = [margin + 2];
        for (let k = 0; k < colWidths.length - 1; k++) {
          colPlacements.push(colPlacements[k] + colWidths[k]);
        }

        const headers = ['Sira', 'Siparis', 'Boyut', 'Konum', 'Sol Cetvel', 'Ust Cetvel', 'Yon'];
        headers.forEach((h, hIdx) => {
          doc.text(sanitizeText(h), colPlacements[hIdx], currentY + 4.5);
        });

        currentY += 6;
        doc.setTextColor(0, 0, 0);
        
        tableRows.forEach((row, rIdx) => {
          doc.setFont('helvetica', rIdx % 2 === 0 ? 'normal' : 'bold');
          if (rIdx % 2 === 0) {
            doc.setFillColor(248, 248, 246);
          } else {
            doc.setFillColor(255, 255, 255);
          }
          doc.rect(margin, currentY, pageWidth - (margin * 2), 5, 'F');

          // Draw row vertical line borders or border outline
          row.forEach((cell, cIdx) => {
            doc.text(sanitizeText(cell), colPlacements[cIdx], currentY + 3.8);
          });
          currentY += 5;
        });

        // Page numbering footer
        const str = `Sayfa ${globalPageIdx} / ${totalPages}`;
        doc.setFontSize(8);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(150, 150, 150);
        doc.text(sanitizeText(str), pageWidth - margin - 20, pageHeight - 8);
        doc.text('Yaver Sunger Optimizasyon Sistemi - Isaretleme ve Cetvel Plankarti', margin, pageHeight - 8);
      });
    });

    const fName = `yaver_toplu_sunger_kesim_plani_${new Date().toISOString().split('T')[0]}.pdf`;
    doc.save(fName);
  };

  // Helper to generate distinct vibrant pastel colors based on order index
  const getColorForRect = (orderId: string, isHovered: boolean) => {
    const hash = orderId.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    const hue = (hash * 137.5) % 360;
    
    if (isHovered) {
      return {
        fill: `hsla(${hue}, 85%, 80%, 0.95)`,
        stroke: `hsla(${hue}, 85%, 35%, 0.9)`,
        text: `hsla(${hash % 360}, 100%, 15%, 1)`
      };
    }
    return {
      fill: `hsla(${hue}, 70%, 93%, 0.85)`,
      stroke: `hsla(${hue}, 70%, 45%, 0.5)`,
      text: `hsla(${hash % 360}, 80%, 25%, 0.8)`
    };
  };

  const currentGroupItems = groupedItems[activeThickness] || [];
  const totalItemsCount = 
    (groupedItems['5'] || []).length + 
    (groupedItems['8'] || []).length + 
    (groupedItems['10'] || []).length + 
    (groupedItems['other'] || []).length;

  const totalStandardItemsCount = 
    (groupedItems['5'] || []).length + 
    (groupedItems['8'] || []).length + 
    (groupedItems['10'] || []).length;

  return (
    <div className="flex-1 bg-[#F5F5F0] flex flex-col h-full min-h-0 overflow-hidden">
      {/* Upper Module Bar */}
      <header className="h-16 bg-white border-b border-black/5 px-8 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-6">
          {/* Title Badge / Context */}
          <div className="flex flex-col">
            <span className="text-[10px] font-black uppercase text-black/30 tracking-widest leading-none">YAVER MODÜL</span>
            <span className="text-sm font-extrabold text-black mt-0.5">Sünger Yerleşim Planlayıcı</span>
          </div>

          <div className="flex items-center gap-2 bg-emerald-50 px-3.5 py-1.5 rounded-xl border border-emerald-100 text-emerald-800">
            <Sparkles className="w-3.5 h-3.5 text-emerald-600 fill-emerald-600" />
            <span className="text-xs font-bold">%90+ Hedef Verimlilik</span>
          </div>
        </div>
        
        {/* Thickness choices tab header and action buttons */}
        <div className="flex items-center gap-4">
          <div className="flex bg-[#F5F5F0] p-1 rounded-xl h-9">
            {['5', '8', '10', 'other'].map((thickness) => {
              const count = (groupedItems[thickness] || []).length;
              const label = thickness === 'other' ? 'Diğer' : `${thickness} cm`;
              return (
                <button
                  key={thickness}
                  onClick={() => {
                    setActiveThickness(thickness);
                    setHoveredItemId(null);
                  }}
                  className={cn(
                    "px-3.5 py-1 rounded-lg text-xs font-extrabold transition-all cursor-pointer flex items-center gap-1.5",
                    activeThickness === thickness
                      ? "bg-white text-black shadow-sm"
                      : "text-black/40 hover:text-black/60"
                  )}
                >
                  <span>{label}</span>
                  {count > 0 && (
                    <span className={cn(
                      "px-1.5 py-0.5 rounded-full text-[9px] font-black leading-none",
                      activeThickness === thickness ? "bg-black text-white" : "bg-black/10 text-black/40"
                    )}>
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Action buttons aligned to h-9 header size with vertical separator */}
          <div className="flex items-center gap-2 pl-4 border-l border-neutral-200">
            {totalStandardItemsCount > 0 && (
              <button
                onClick={exportAllToPdf}
                className="bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-xs h-9 px-4 rounded-xl shadow-sm transition-all flex items-center gap-2 cursor-pointer active:scale-95"
                title="Standart kalınlıkların (5, 8 ve 10 cm) yerleşim planlarını tek bir PDF dosyasında toplu olarak indirir (Diğer kalınlıklar dâhil edilmez)"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Toplu PDF</span>
              </button>
            )}

            {currentGroupItems.length > 0 && (
              <button
                onClick={exportToPdf}
                className="bg-black hover:bg-neutral-900 text-white font-extrabold text-xs h-9 px-4 rounded-xl shadow-sm transition-all flex items-center gap-2 cursor-pointer active:scale-95"
                title="Aktif kalınlığın yerleşim ve kesim çizimlerini PDF olarak indir"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Aktif Planı İndir</span>
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Main Split Screen container */}
      <div className="flex-1 flex overflow-hidden min-h-0">
        
        {/* Left column configuration */}
        <div className="w-80 bg-white border-r border-black/5 flex flex-col overflow-y-auto shrink-0 p-6 space-y-6">
          
          {/* Active Thickness Statistics */}
          <div className="bg-black text-white rounded-2xl p-5 shadow-sm space-y-4">
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 opacity-60" />
              <span className="text-xs font-bold uppercase tracking-wider text-white/50">Planlanan Kalınlık</span>
            </div>
            <div>
              <p className="text-3xl font-black">{activeThickness === 'other' ? 'Diğer' : `${activeThickness} cm`}</p>
              <p className="text-xs text-white/60 mt-1">Toplam {currentGroupItems.length} sipariş yönetiliyor.</p>
            </div>
            
            {/* Efficiency notification */}
            <div className="pt-3 border-t border-white/10 flex flex-col gap-2">
              <div className="flex items-center justify-between text-xs font-bold">
                <span className="text-white/50">Gerekli Tabaka:</span>
                <span className="bg-white/10 px-2 py-0.5 rounded text-white text-sm">{packingResult.bins.length} Adet</span>
              </div>
              <div className="bg-emerald-500/10 text-emerald-400 p-2 rounded-lg text-[10px] font-bold flex items-center gap-1.5 leading-relaxed">
                <Check className="w-3.5 h-3.5 shrink-0" />
                <span>En yüksek verimlilik (%90+) için akıllı dinamik bölme aktif!</span>
              </div>
            </div>
          </div>

          {/* Tabaka Boyutunu Güncelleme Formu */}
          <div className="space-y-4">
            <h3 className="font-bold text-xs uppercase tracking-wider text-black/50 flex items-center gap-1.5">
              <Settings className="w-3.5 h-3.5" />
              Tabaka Boyutu Ayarları
            </h3>
            
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-[10px] font-bold uppercase tracking-wider opacity-40">Genişlik (cm)</label>
                <input
                  type="number"
                  min="1"
                  value={activeSheetSize.width}
                  onChange={(e) => updateSheetSize('width', parseInt(e.target.value) || 140)}
                  className="w-full bg-[#F5F5F0] border-none rounded-xl py-2 px-3 font-mono font-bold text-sm focus:ring-2 focus:ring-black/5 focus:bg-[#EAEAE3] outline-none transition-colors"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-bold uppercase tracking-wider opacity-40">Uzunluk (cm)</label>
                <input
                  type="number"
                  min="1"
                  value={activeSheetSize.height}
                  onChange={(e) => updateSheetSize('height', parseInt(e.target.value) || 240)}
                  className="w-full bg-[#F5F5F0] border-none rounded-xl py-2 px-3 font-mono font-bold text-sm focus:ring-2 focus:ring-black/5 focus:bg-[#EAEAE3] outline-none transition-colors"
                />
              </div>
            </div>

            {/* Presets Grid */}
            <div className="space-y-1.5">
              <p className="text-[10px] font-bold uppercase tracking-wider opacity-40">Hızlı Şablonlar</p>
              <div className="grid grid-cols-1 gap-1.5">
                {PRESET_SIZES.map(preset => {
                  const isMatch = activeSheetSize.width === preset.width && activeSheetSize.height === preset.height;
                  return (
                    <button
                      key={preset.name}
                      onClick={() => applyPreset(preset.width, preset.height)}
                      className={cn(
                        "w-full text-left px-3 py-2 rounded-xl text-xs font-medium border transition-all cursor-pointer flex items-center justify-between",
                        isMatch 
                          ? "bg-black text-white border-black" 
                          : "bg-[#F5F5F0] border-transparent hover:bg-black/5 text-black"
                      )}
                    >
                      <span>{preset.name}</span>
                      {isMatch && <Check className="w-3.5 h-3.5 shrink-0" />}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="h-[1px] bg-black/5" />

          {/* List of items of active thickness */}
          <div className="space-y-3 flex-1 flex flex-col min-h-0">
            <h3 className="font-bold text-xs uppercase tracking-wider text-black/50 flex items-center justify-between shrink-0">
              <span>KESİLECEK PARÇALAR</span>
              <span className="bg-[#F5F5F0] px-2 py-0.5 rounded text-[10px] text-black">
                {currentGroupItems.length} Adet
              </span>
            </h3>

            {currentGroupItems.length === 0 ? (
              <div className="text-center py-6 text-black/30 text-xs">
                Bu kalınlıkta planlanmış sipariş bulunmuyor.
              </div>
            ) : (
              <div className="space-y-1.5 overflow-y-auto flex-1 pr-1">
                {currentGroupItems.map((item) => {
                  // Check if item is unpacked
                  const isUnpacked = packingResult.unpacked.some(u => getBaseId(u.id) === item.id);
                  
                  // Check if this item is split into parts in any of the bins
                  const placedParts = packingResult.bins.flatMap(b => b.placed).filter(p => getBaseId(p.id) === item.id);
                  const isSplit = placedParts.length > 1;
                  const isNativelyCut = placedParts.some(p => p.isNativelySplit);

                  const isHovered = hoveredItemId === item.id || (hoveredItemId && getBaseId(hoveredItemId) === item.id);

                  return (
                    <div
                      key={item.id}
                      onMouseEnter={() => setHoveredItemId(item.id)}
                      onMouseLeave={() => setHoveredItemId(null)}
                      className={cn(
                        "p-3 rounded-xl border text-xs transition-all flex flex-col gap-2",
                        isHovered ? "bg-black text-white border-black scale-[1.02] shadow-sm" : "bg-[#F5F5F0]/50 border-black/5",
                        isUnpacked && "border-red-200 bg-red-50 text-red-900"
                      )}
                    >
                      <div className="flex justify-between items-start">
                        <div className="min-w-0 pr-1">
                          <p className={cn("font-bold truncate", isHovered ? "text-white" : "text-black")}>{item.customerName}</p>
                          <p className="text-[10px] font-mono opacity-50 mt-0.5">Sip No: {item.orderId}</p>
                        </div>
                        <div className="shrink-0 text-right">
                          <p className={cn("font-black font-mono", isUnpacked ? "text-red-600" : (isHovered ? "text-white" : "text-black"))}>
                            {item.w} x {item.h}
                          </p>
                        </div>
                      </div>

                      {/* Display Split Suffix Indicators */}
                      {(isSplit || isNativelyCut) && !isUnpacked && (
                        <div className="flex items-center gap-1.5 mt-0.5 shrink-0">
                          <span className={cn(
                            "px-1.5 py-0.5 rounded text-[9px] font-bold flex items-center gap-1 uppercase tracking-tight",
                            isHovered ? "bg-white/20 text-white" : "bg-amber-100 text-amber-800"
                          )}>
                            <Scissors className="w-2.5 h-2.5" />
                            {isNativelyCut ? `Doğal Bölme (${placedParts.length} Parça)` : `Akıllı Bölme (${placedParts.length} Kırpım)`}
                          </span>
                        </div>
                      )}

                      {isUnpacked && (
                        <span className="text-[9px] font-bold text-red-500 uppercase tracking-tight flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3 shrink-0" />
                          Sığmıyor! Tabaka Çok Küçük
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Right column rendering sheets */}
        <div className="flex-1 bg-[#E4E3E0] p-8 overflow-y-auto h-full min-h-0">
          <div className="max-w-4xl mx-auto space-y-8">
            
            {/* Show unpacked warning if any item exceeds board limits */}
            {packingResult.unpacked.length > 0 && (
              <div className="bg-red-50 border border-red-200 text-red-900 rounded-2xl p-5 flex items-start gap-3 shadow-sm">
                <AlertTriangle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
                <div>
                  <h4 className="font-bold text-sm">Genişlik/Yükseklik Aşımı veya Aşırı Yoğunluk Saptandı</h4>
                  <p className="text-xs text-red-700/80 leading-relaxed mt-1">
                    Toplam {packingResult.unpacked.length} adet parça belirlenen {activeSheetSize.width}x{activeSheetSize.height} cm tabaka sınırlarına (maksimum 4 bölünme limiti dahilinde) sığamadı. Lütfen sol taraftan daha büyük bir tabaka ölçüsü (örneğin 190x240) seçin.
                  </p>
                </div>
              </div>
            )}

            {/* Empty stats cover */}
            {currentGroupItems.length === 0 ? (
              <div className="bg-white rounded-[2.5rem] p-12 text-center border border-black/5 shadow-sm max-w-lg mx-auto mt-12">
                <div className="w-20 h-20 bg-[#F5F5F0] rounded-full flex items-center justify-center mx-auto mb-6">
                  <Package className="w-10 h-10 opacity-30 text-black" />
                </div>
                <h3 className="text-lg font-bold">Planlama Verisi Yok</h3>
                <p className="text-xs text-black/50 mt-2 leading-relaxed font-sans">
                  Şu an {activeThickness === 'other' ? 'diğer kalınlıklarda' : `${activeThickness} cm kalınlığında`} sünger kullanan siparişiniz bulunmuyor. Farklı kalınlık modellerini test etmek için üst sekmeleri kullanabilirsiniz.
                </p>
              </div>
            ) : (
              <div className="space-y-8 animate-fade-in">
                {/* Visual rendering of each sheet bin */}
                {packingResult.bins.map((bin) => (
                  <div 
                    key={bin.id}
                    className="bg-white rounded-3xl border border-black/5 shadow-md overflow-hidden flex flex-col md:flex-row min-h-[380px]"
                  >
                    
                    {/* SVG canvas workspace visualizer */}
                    <div className="flex-1 bg-[#F9F9F7] p-6 flex flex-col items-center justify-center border-b md:border-b-0 md:border-r border-black/5 relative">
                      <div className="absolute top-4 left-4 z-10 flex gap-2">
                        <span className="bg-black/80 backdrop-blur-sm text-white px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider">
                          Tabaka #{bin.id}
                        </span>
                        <span className={cn(
                          "px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider",
                          bin.efficiency >= 90 ? "bg-emerald-500 text-white animate-pulse" : "bg-black/5 text-black/60"
                        )}>
                          Efficiency: {bin.efficiency}%
                        </span>
                      </div>

                      {/* Actual SVG viewport representation based on real sizes with dynamic aspect ratio */}
                      <div className="w-full max-w-xl h-[480px] flex items-center justify-center p-2 relative">
                        <svg
                          viewBox={`0 0 ${activeSheetSize.width} ${activeSheetSize.height}`}
                          style={{ aspectRatio: `${activeSheetSize.width} / ${activeSheetSize.height}` }}
                          className="max-w-full max-h-full border-2 border-dashed border-black/25 bg-[#EDEDE9] shadow-inner rounded relative overflow-visible mt-4"
                        >
                          {/* Standard Grid pattern inside sheet */}
                          <defs>
                            <pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse">
                              <path d="M 20 0 L 0 0 0 20" fill="none" stroke="rgba(0,0,0,0.03)" strokeWidth="1" />
                            </pattern>
                          </defs>
                          <rect width="100%" height="100%" fill="url(#grid)" />

                          {/* Placed sponge items inside board */}
                          {bin.placed.map((item) => {
                            const originalId = getBaseId(item.id);
                            const isHovered = hoveredItemId === item.id || (hoveredItemId && getBaseId(hoveredItemId) === originalId);
                            const colors = getColorForRect(item.orderId, isHovered);
                            
                            return (
                              <g 
                                key={item.id}
                                onMouseEnter={() => setHoveredItemId(item.id)}
                                onMouseLeave={() => setHoveredItemId(null)}
                                className="transition-all cursor-pointer"
                              >
                                {/* Sponge rectangle outline */}
                                <rect
                                  x={item.x}
                                  y={item.y}
                                  width={item.w}
                                  height={item.h}
                                  fill={colors.fill}
                                  stroke={colors.stroke}
                                  strokeWidth="1.5"
                                  className="transition-all duration-150"
                                  rx="2.5"
                                />

                                {/* Subtitle indicator if piece is part of a split */}
                                {item.totalSplits && item.totalSplits > 1 && (
                                  <line
                                    x1={item.x}
                                    y1={item.y}
                                    x2={item.x + item.w}
                                    y2={item.y + item.h}
                                    stroke="rgba(0,0,0,0.15)"
                                    strokeWidth="0.5"
                                    strokeDasharray="2,2"
                                  />
                                )}

                                {/* Dynamic, highly helpful sizing and marking overlays */}
                                {item.w >= 14 && item.h >= 14 ? (
                                  <g className="pointer-events-none select-none">
                                    {/* Part identifier */}
                                    <text
                                      x={item.x + item.w / 2}
                                      y={item.y + item.h / 2 - 4.5}
                                      textAnchor="middle"
                                      dominantBaseline="middle"
                                      fill={colors.text}
                                      fontSize={item.w < 20 ? "4" : "5.5"}
                                      fontWeight="black"
                                      className="uppercase font-sans"
                                    >
                                      {getPartLabel(item.orderId, item.splitIndex, item.totalSplits)}
                                    </text>
                                    {/* Dimensions */}
                                    <text
                                      x={item.x + item.w / 2}
                                      y={item.y + item.h / 2 + 1}
                                      textAnchor="middle"
                                      dominantBaseline="middle"
                                      fill={colors.text}
                                      fontSize={item.w < 20 ? "3.2" : "4.2"}
                                      fontWeight="bold"
                                      className="font-sans"
                                    >
                                      {Math.round(item.w)}x{Math.round(item.h)} cm
                                    </text>
                                    {/* Ruler mapping coordinates */}
                                    <text
                                      x={item.x + item.w / 2}
                                      y={item.y + item.h / 2 + 6}
                                      textAnchor="middle"
                                      dominantBaseline="middle"
                                      fill={colors.text}
                                      fontSize={item.w < 20 ? "2.3" : "3.1"}
                                      fontWeight="medium"
                                      opacity="0.85"
                                      className="font-mono text-center"
                                    >
                                      X:{Math.round(item.x)}→{Math.round(item.x + item.w)} | Y:{Math.round(item.y)}→{Math.round(item.y + item.h)}
                                    </text>
                                  </g>
                                ) : item.w >= 7 && item.h >= 7 ? (
                                  <g className="pointer-events-none select-none">
                                    <text
                                      x={item.x + item.w / 2}
                                      y={item.y + item.h / 2 - 1.5}
                                      textAnchor="middle"
                                      dominantBaseline="middle"
                                      fill={colors.text}
                                      fontSize="3.2"
                                      fontWeight="bold"
                                      className="font-sans"
                                    >
                                      {getPartLabel(item.orderId, item.splitIndex, item.totalSplits)}
                                    </text>
                                    <text
                                      x={item.x + item.w / 2}
                                      y={item.y + item.h / 2 + 2}
                                      textAnchor="middle"
                                      dominantBaseline="middle"
                                      fill={colors.text}
                                      fontSize="2.5"
                                      fontWeight="medium"
                                      className="font-sans"
                                    >
                                      {Math.round(item.w)}x{Math.round(item.h)}
                                    </text>
                                  </g>
                                ) : (
                                  <g className="pointer-events-none select-none">
                                    <text
                                      x={item.x + item.w / 2}
                                      y={item.y + item.h / 2}
                                      textAnchor="middle"
                                      dominantBaseline="middle"
                                      fill={colors.text}
                                      fontSize="2.2"
                                      fontWeight="bold"
                                      className="font-sans"
                                    >
                                      {item.orderId}
                                    </text>
                                  </g>
                                )}
                              </g>
                            );
                          })}
                        </svg>
                      </div>
                    </div>

                    {/* Stats for this board and item list on this board */}
                    <div className="w-full md:w-80 p-6 flex flex-col justify-between shrink-0 space-y-6">
                      <div className="space-y-4">
                        <div className="flex justify-between items-baseline">
                          <h4 className="font-black text-xl text-black">Tabaka #{bin.id} Analizi</h4>
                          <span className={cn(
                            "text-xs font-mono font-bold",
                            bin.efficiency >= 90 ? "text-emerald-600" : "text-black/40"
                          )}>
                            {bin.efficiency >= 90 ? "★ OPTİMAL %90+" : `Kullanım: %${bin.efficiency}`}
                          </span>
                        </div>

                        {/* Progress Bar for Effiency */}
                        <div className="w-full bg-[#F5F5F0] h-2.5 rounded-full overflow-hidden">
                          <div 
                            className={cn(
                              "h-full rounded-full transition-all duration-300",
                              bin.efficiency >= 90 ? "bg-emerald-500" : bin.efficiency > 70 ? "bg-amber-500" : "bg-red-500"
                            )}
                            style={{ width: `${bin.efficiency}%` }}
                          />
                        </div>

                        {/* Board area specifications metrics */}
                        <div className="grid grid-cols-2 gap-3.5 pt-1">
                          <div className="bg-[#F5F5F0] rounded-xl p-3">
                            <span className="text-[9px] font-bold uppercase tracking-wider opacity-40">Kullanılan Alan</span>
                            <p className="text-base font-black text-black mt-0.5">
                              {((bin.usedArea) / 10000).toFixed(2)} m²
                            </p>
                          </div>
                          <div className="bg-[#F5F5F0] rounded-xl p-3">
                            <span className="text-[9px] font-bold uppercase tracking-wider opacity-40">Fire / Atıl Alan</span>
                            <p className="text-base font-black text-red-500 mt-0.5">
                              {((bin.wasteArea) / 10000).toFixed(2)} m²
                            </p>
                          </div>
                        </div>
                      </div>

                      {/* List of orders nested on this explicit board */}
                      <div className="space-y-2 flex-1 pt-2">
                        <span className="text-[9px] font-bold uppercase tracking-wider opacity-40">CETVEL KESİM VE PAFTALAMA REHBERİ</span>
                        <div className="space-y-1.5 max-h-[170px] overflow-y-auto pr-1">
                          {bin.placed.map((item, idx) => {
                            const isHovered = hoveredItemId === item.id || (hoveredItemId && getBaseId(hoveredItemId) === getBaseId(item.id));
                            const partLabel = getPartLabel(item.orderId, item.splitIndex, item.totalSplits);
                            return (
                              <div
                                key={item.id}
                                onMouseEnter={() => setHoveredItemId(item.id)}
                                onMouseLeave={() => setHoveredItemId(null)}
                                className={cn(
                                  "py-2 px-2.5 rounded-xl text-[11px] flex flex-col gap-1 transition-all border",
                                  isHovered 
                                    ? "bg-black text-white border-black scale-[1.01]" 
                                    : "bg-black/[0.02] border-black/5 hover:bg-black/[0.04]"
                                )}
                              >
                                <div className="flex justify-between items-center text-xs font-bold leading-none">
                                  <div className="min-w-0 pr-1 flex items-center gap-1.5">
                                    <span className="opacity-40 text-[9px]">#{idx + 1}</span>
                                    <span className="font-extrabold uppercase truncate">Sipariş {partLabel}</span>
                                  </div>
                                  <div className="shrink-0 font-mono font-bold flex items-center gap-1">
                                    <span>{Math.round(item.w)} x {Math.round(item.h)} cm</span>
                                    {item.rotated && (
                                      <span className="text-[10px] font-black text-amber-500 shrink-0 uppercase tracking-tighter" title="Yerleşime sığdırmak için 90° döndürüldü">
                                        ↻
                                      </span>
                                    )}
                                  </div>
                                </div>
                                <div className="text-[9px] font-mono leading-none opacity-60 flex flex-col gap-0.5 mt-0.5">
                                  <div>Sol Cetvel: {Math.round(item.x)} → {Math.round(item.x + item.w)} cm</div>
                                  <div>Üst Cetvel: {Math.round(item.y)} → {Math.round(item.y + item.h)} cm</div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      <div className="text-[10px] text-black/40 italic flex items-center gap-1 leading-relaxed">
                        <Info className="w-3.5 h-3.5 shrink-0 text-black/50" />
                        <span>Siparişe ait tüm parçaları ve layout eşleşmelerini görmek için üstlerine gelin.</span>
                      </div>
                    </div>

                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
};
