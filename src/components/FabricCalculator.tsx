import React, { useState, useMemo, useEffect } from 'react';
import { 
  Ruler, 
  Scissors, 
  Info, 
  Calculator, 
  ArrowRight, 
  Download, 
  Plus, 
  Trash2, 
  Edit2, 
  Search, 
  Check, 
  AlertCircle, 
  Barcode, 
  Database, 
  FileText, 
  Layers, 
  User, 
  Filter,
  Save,
  CheckCircle2,
  UserCheck
} from 'lucide-react';
import { cn } from '../lib/utils';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { UnifiedLibrary, UnifiedFabric, generateEşsizBarkod } from './UnifiedLibrary';

interface Order {
  id: string;
  orderId: string;
  customerName: string;
  fabricCode: string;
  lineDirection: string;
  extraInfo: string;
  dimensions: string;
  pool?: 'B' | 'D' | string | null;
}

interface FabricDefinition {
  fabricCode: string;
  pool: 'B' | 'D';
  width: number;
  barcode: string;
  fabricName?: string;
}

interface FabricCalculatorProps {
  orders: Order[];
}

/**
 * Normalizes Turkish letters to basic Latin alphabet for 100% reliable PDF generation with default fonts
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

export const FabricCalculator: React.FC<FabricCalculatorProps> = ({ orders }) => {
  // Navigation: Requirements summary analysis vs fabric database catalog
  const [activeSubTab, setActiveSubTab] = useState<'analysis' | 'database' | 'unified'>(() => {
    return orders && orders.length > 0 ? 'analysis' : 'unified';
  });

  // Auto-switch sub-tab or handle default navigation based on active orders
  useEffect(() => {
    if (!orders || orders.length === 0) {
      setActiveSubTab('unified');
    } else {
      setActiveSubTab('analysis');
    }
  }, [orders?.length]);

  // Filter for Pool Choice: ALL, B (Berkay), D (Doğukan)
  const [activePoolFilter, setActivePoolFilter] = useState<'ALL' | 'B' | 'D'>('ALL');
  const [dbPoolFilter, setDbPoolFilter] = useState<'ALL' | 'B' | 'D'>('ALL');

  // Search filter strings
  const [searchQuery, setSearchQuery] = useState('');
  const [dbSearchQuery, setDbSearchQuery] = useState('');

  // Local storage backed fabric database
  const [savedFabrics, setSavedFabrics] = useState<FabricDefinition[]>(() => {
    const stored = localStorage.getItem('yaver_saved_fabrics');
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        // Map old structure if any (missing pool field) to default pool 'B'
        if (Array.isArray(parsed)) {
          return parsed.map((f: any) => ({
            fabricCode: f.fabricCode,
            pool: f.pool || 'B',
            width: f.width ?? 140,
            barcode: f.barcode ?? '',
            fabricName: f.fabricName ?? ''
          }));
        }
      } catch (e) {
        console.error("Failed to parse saved fabrics", e);
      }
    }
    // Beautiful default boilerplate dataset mapped exactly with the user's example
    return [
      { fabricCode: 'COLOR 1', pool: 'B', width: 140, barcode: '868000100011', fabricName: 'Gri Buldan Keten' },
      { fabricCode: 'COLOR 1', pool: 'D', width: 140, barcode: '868000100012', fabricName: 'Kırmızı Buldan Keten' },
      { fabricCode: 'COLOR 10', pool: 'B', width: 140, barcode: '868000100021', fabricName: 'Gri Keten (Berkay)' },
      { fabricCode: 'COLOR 10', pool: 'D', width: 140, barcode: '868000100022', fabricName: 'Kırmızı Keten (Doğukan)' },
    ];
  });

  // Local storage backed unified fabric catalog (Ana Kumaş Kütüphanesi)
  const [unifiedFabrics, setUnifiedFabrics] = useState<UnifiedFabric[]>(() => {
    const stored = localStorage.getItem('yaver_unified_fabrics');
    if (stored) {
      try {
        return JSON.parse(stored);
      } catch (e) {
        console.error("Failed to parse unified fabrics", e);
      }
    }
    // Beautiful default unified dataset to match the default boilerplate nicely
    return [
      {
        barcode: '868000100011',
        fabricName: 'Gri Buldan Keten',
        berkayCode: 'COLOR 1',
        dogukanCode: '',
        stock: 45.5
      },
      {
        barcode: '868000100012',
        fabricName: 'Kırmızı Buldan Keten',
        berkayCode: '',
        dogukanCode: 'COLOR 1',
        stock: 12.0
      }
    ];
  });

  // Fabric addition form state
  const [newFabricCode, setNewFabricCode] = useState('');
  const [newFabricPool, setNewFabricPool] = useState<'B' | 'D'>('B');
  const [newFabricWidth, setNewFabricWidth] = useState(140);
  const [newFabricBarcode, setNewFabricBarcode] = useState('');
  const [newFabricName, setNewFabricName] = useState('');
  const [formError, setFormError] = useState('');

  // Inlined editing helper states to easily edit name or barcode inside rows
  const [editingKey, setEditingKey] = useState<string | null>(null); // "fabricCode__pool"
  const [editBarcodeVal, setEditBarcodeVal] = useState('');
  const [editNameVal, setEditNameVal] = useState('');

  // Dynamic quick-inputs dictionary for KAYITSIZ items
  const [quickInputs, setQuickInputs] = useState<{ 
    [key: string]: { barcode: string; name: string } 
  }>({});

  // Sync savedFabrics to localStorage on modification
  useEffect(() => {
    localStorage.setItem('yaver_saved_fabrics', JSON.stringify(savedFabrics));
  }, [savedFabrics]);

  // Sync unifiedFabrics to localStorage on modification
  useEffect(() => {
    localStorage.setItem('yaver_unified_fabrics', JSON.stringify(unifiedFabrics));
  }, [unifiedFabrics]);

  // Synchronize savedFabrics and unifiedFabrics so mapping is always consistent and automatic
  // 1) When savedFabrics changes, copy any new/updated fabrics to unifiedFabrics
  useEffect(() => {
    let updated = false;
    const newUnified = [...unifiedFabrics];

    savedFabrics.forEach(sf => {
      const barcode = sf.barcode ? sf.barcode.trim() : '';
      if (!barcode) return;

      const idx = newUnified.findIndex(u => u.barcode === barcode);
      if (idx !== -1) {
        // Exists, let's keep its codes updated!
        const uf = newUnified[idx];
        if (sf.pool === 'B' && uf.berkayCode !== sf.fabricCode) {
          uf.berkayCode = sf.fabricCode;
          updated = true;
        } else if (sf.pool === 'D' && uf.dogukanCode !== sf.fabricCode) {
          uf.dogukanCode = sf.fabricCode;
          updated = true;
        }
        if (sf.fabricName && uf.fabricName !== sf.fabricName) {
          uf.fabricName = sf.fabricName;
          updated = true;
        }
      } else {
        // Doesn't exist, let's automatically create a default record in the main library!
        newUnified.push({
          barcode,
          fabricName: sf.fabricName || `${sf.fabricCode} (${sf.pool === 'B' ? "Berkay" : "Doğukan"} Havuzu)`,
          berkayCode: sf.pool === 'B' ? sf.fabricCode : '',
          dogukanCode: sf.pool === 'D' ? sf.fabricCode : '',
          stock: 0
        });
        updated = true;
      }
    });

    if (updated) {
      setUnifiedFabrics(newUnified);
    }
  }, [savedFabrics]);

  // 2) When unifiedFabrics changes, automatically create and populate respective pool codes in savedFabrics
  // This fulfills the user's requirement: "Ana kumaş kütüphanesinde gördüğüm kumaşları berkay ve doğukan'ında kumaş kütüphanesinde görmek istiyorum"
  useEffect(() => {
    let updated = false;
    const newSaved = [...savedFabrics];

    unifiedFabrics.forEach(uf => {
      const barcode = uf.barcode ? uf.barcode.trim() : '';
      if (!barcode) return;

      // Sync Berkay Pool ('B')
      if (uf.berkayCode && uf.berkayCode.trim()) {
        const bCode = uf.berkayCode.trim();
        const idx = newSaved.findIndex(sf => sf.pool === 'B' && sf.fabricCode.toUpperCase() === bCode.toUpperCase());
        if (idx !== -1) {
          const sf = newSaved[idx];
          if (sf.barcode !== barcode || sf.fabricName !== uf.fabricName) {
            newSaved[idx] = {
              ...sf,
              barcode,
              fabricName: uf.fabricName
            };
            updated = true;
          }
        } else {
          // Add brand new fabric matching Berkay's code to pool 'B'
          newSaved.push({
            fabricCode: bCode,
            pool: 'B',
            width: 140, // default width
            barcode,
            fabricName: uf.fabricName
          });
          updated = true;
        }
      }

      // Sync Doğukan Pool ('D')
      if (uf.dogukanCode && uf.dogukanCode.trim()) {
        const dCode = uf.dogukanCode.trim();
        const idx = newSaved.findIndex(sf => sf.pool === 'D' && sf.fabricCode.toUpperCase() === dCode.toUpperCase());
        if (idx !== -1) {
          const sf = newSaved[idx];
          if (sf.barcode !== barcode || sf.fabricName !== uf.fabricName) {
            newSaved[idx] = {
              ...sf,
              barcode,
              fabricName: uf.fabricName
            };
            updated = true;
          }
        } else {
          // Add brand new fabric matching Doğukan's code to pool 'D'
          newSaved.push({
            fabricCode: dCode,
            pool: 'D',
            width: 140, // default width
            barcode,
            fabricName: uf.fabricName
          });
          updated = true;
        }
      }
    });

    if (updated) {
      setSavedFabrics(newSaved);
    }
  }, [unifiedFabrics]);

  // Sync backward helper
  const handleSetUnifiedFabricsWithBackwardSync = (value: React.SetStateAction<UnifiedFabric[]>) => {
    setUnifiedFabrics(prev => {
      const nextUf = typeof value === 'function' ? value(prev) : value;
      
      // Update savedFabrics barcodes
      setSavedFabrics(currentSf => {
        let dirty = false;
        const nextSf = currentSf.map(sf => {
          // If sf matches a berkayCode or dogukanCode of a unifiedFabric, sync the barcode!
          const match = nextUf.find(u => 
            (sf.pool === 'B' && u.berkayCode && sf.fabricCode.toUpperCase() === u.berkayCode.toUpperCase()) ||
            (sf.pool === 'D' && u.dogukanCode && sf.fabricCode.toUpperCase() === u.dogukanCode.toUpperCase())
          );
          if (match && sf.barcode !== match.barcode) {
            dirty = true;
            return { ...sf, barcode: match.barcode };
          }
          return sf;
        });
        return dirty ? nextSf : currentSf;
      });
      
      return nextUf;
    });
  };

  const getNewUniqueBarcode = () => {
    const existing = [
      ...savedFabrics.map(f => f.barcode),
      ...unifiedFabrics.map(f => f.barcode)
    ].filter(Boolean);
    return generateEşsizBarkod(existing);
  };

  // Lookup helpers
  const getFabricByCodeAndPool = (code: string, pool: 'B' | 'D' | string | null) => {
    const cleanedCode = code.trim().toUpperCase();
    const targetPool = (pool && (pool.toUpperCase() === 'B' || pool.toUpperCase() === 'D')) 
      ? (pool.toUpperCase() as 'B' | 'D') 
      : 'B'; // Default to Berkay (B) as fallback

    return savedFabrics.find(f => 
      f.fabricCode.trim().toUpperCase() === cleanedCode && 
      f.pool === targetPool
    );
  };

  const getFabricWidth = (code: string, pool: 'B' | 'D' | string | null) => {
    const fab = getFabricByCodeAndPool(code, pool);
    return fab ? fab.width : 140; // Defaults to 140 if not registered
  };

  // Safe measurement calculation based on existing formula
  const calculateSingleOrder = (order: Order, fWidth: number) => {
    const parts = order.dimensions.split('x').map(p => parseInt(p.trim()) || 0);
    const width = parts[0] || 0;
    const length = parts[1] || 0;
    const height = parts[2] || 0;

    if (width === 0 || length === 0) return 0;

    // Check if the extra info mentions button/tufted cushioning ("dümeli", "düğmeli", "dumeli", "dugmeli")
    const extraLower = (order.extraInfo || '').trim().toLowerCase();
    const isDumeli = extraLower.includes('dümeli') || 
                      extraLower.includes('düğmeli') || 
                      extraLower.includes('dumeli') || 
                      extraLower.includes('dugmeli');

    // Seam allowances: normal is 2 cm, dümeli (buttoned/tufted) is 12 cm
    const allowance = isDumeli ? 12 : 2;
    const pW = width + allowance;
    const pL = length + allowance;
    const sW = height + allowance;
    const pipingW = 4;
    const perimeter = 2 * (width + length);

    // 1. Panels (Top & Bottom)
    const colsA = Math.floor(fWidth / pW);
    const lengthA = colsA >= 1 ? Math.ceil(2 / colsA) * pL : Infinity;

    const colsB = Math.floor(fWidth / pL);
    const lengthB = colsB >= 1 ? Math.ceil(2 / colsB) * pW : Infinity;

    const panelsLength = Math.min(lengthA, lengthB);
    const usedOrientation = lengthA <= lengthB ? 'A' : 'B';
    
    const usedWidth = usedOrientation === 'A' ? pW * Math.min(2, colsA) : pL * Math.min(2, colsB);
    const remainingWidth = fWidth - usedWidth;

    const stripsInRemaining = Math.floor(remainingWidth / sW);
    const totalSideStripsNeeded = Math.ceil((perimeter + 4) / panelsLength);
    
    let extraSidesLength = 0;
    if (totalSideStripsNeeded > stripsInRemaining) {
      const remainingStrips = totalSideStripsNeeded - stripsInRemaining;
      const stripsInFullWidth = Math.floor(fWidth / sW);
      extraSidesLength = Math.ceil(remainingStrips / stripsInFullWidth) * sW;
    }

    const totalPipingLength = 2 * perimeter + 20;
    const extraPipingLength = Math.ceil(totalPipingLength / fWidth) * pipingW;

    const totalNeeded = panelsLength + extraSidesLength + extraPipingLength + 5;
    return Math.ceil(totalNeeded / 5) * 5 / 100;
  };

  // Summarize current fabric needs split by Fabric Code AND Pool (Berkay B vs Doğukan D)
  const rawSummary = useMemo(() => {
    const groups: { [key: string]: { fabricCode: string; pool: 'B' | 'D'; totalMeters: number; count: number; orders: Order[] } } = {};

    orders.forEach(order => {
      const code = order.fabricCode.trim().toUpperCase() || 'BELİRTİLMEMİŞ';
      // Suffix is B or D, default to B if null
      const p = (order.pool && (order.pool.toUpperCase() === 'B' || order.pool.toUpperCase() === 'D'))
        ? (order.pool.toUpperCase() as 'B' | 'D')
        : 'B';

      const key = `${code}__${p}`;
      if (!groups[key]) {
        groups[key] = { fabricCode: code, pool: p, totalMeters: 0, count: 0, orders: [] };
      }
      const width = getFabricWidth(code, p);
      const meters = calculateSingleOrder(order, width);
      groups[key].totalMeters += meters;
      groups[key].count += 1;
      groups[key].orders.push(order);
    });

    return Object.values(groups).sort((a, b) => b.totalMeters - a.totalMeters);
  }, [orders, savedFabrics]);

  // Filter requirements summary by selected Pool AND Search query
  const filteredSummary = useMemo(() => {
    let list = rawSummary;

    // Filter by active pool
    if (activePoolFilter !== 'ALL') {
      list = list.filter(item => item.pool === activePoolFilter);
    }

    // Filter by search query (Code, Barcode, or Custom fabric description)
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim();
      list = list.filter(item => {
        const fab = getFabricByCodeAndPool(item.fabricCode, item.pool);
        const barcode = fab ? fab.barcode.toLowerCase() : '';
        const name = fab && fab.fabricName ? fab.fabricName.toLowerCase() : '';
        return (
          item.fabricCode.toLowerCase().includes(query) || 
          barcode.includes(query) || 
          name.includes(query)
        );
      });
    }

    return list;
  }, [rawSummary, activePoolFilter, searchQuery, savedFabrics]);

  // Total calculated meters of currently visible filtered summary
  const totalAllMeters = useMemo(() => {
    return filteredSummary.reduce((acc, item) => acc + item.totalMeters, 0);
  }, [filteredSummary]);

  // Handle live modification of fabric width inline inside the requirements listing
  const handleInlineWidthChange = (code: string, pool: 'B' | 'D', width: number) => {
    const cleanedCode = code.trim().toUpperCase();
    setSavedFabrics(prev => {
      const exists = prev.some(f => f.fabricCode.toUpperCase() === cleanedCode && f.pool === pool);
      if (exists) {
        return prev.map(f => (f.fabricCode.toUpperCase() === cleanedCode && f.pool === pool) ? { ...f, width } : f);
      } else {
        // Automatically save to database as standard entry if width adjusted for an unregistered fabric
        return [...prev, { fabricCode: code, pool, width, barcode: '', fabricName: '' }];
      }
    });
  };

  // Quick-register a previously un-remembered fabric straight from the overview card
  const handleQuickRegister = (code: string, pool: 'B' | 'D', barcode: string, fabricName: string) => {
    const cleanedCode = code.trim().toUpperCase();
    if (!cleanedCode) return;

    setSavedFabrics(prev => {
      const exists = prev.some(f => f.fabricCode.toUpperCase() === cleanedCode && f.pool === pool);
      if (exists) {
        return prev.map(f => (f.fabricCode.toUpperCase() === cleanedCode && f.pool === pool) 
          ? { ...f, barcode, fabricName } 
          : f
        );
      } else {
        return [...prev, { fabricCode: code, pool, width: 140, barcode, fabricName }];
      }
    });

    // Clear local input fields
    setQuickInputs(prev => {
      const next = { ...prev };
      delete next[`${code}__${pool}`];
      return next;
    });
  };

  // Add formal fabric definition to library via formal Database Form
  const handleAddFabric = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    const cleanedCode = newFabricCode.trim().toUpperCase();
    if (!cleanedCode) {
      setFormError('Lütfen kumaş kodunu giriniz.');
      return;
    }

    // Duplicate check takes code AND pool into consideration
    const isDuplicate = savedFabrics.some(f => 
      f.fabricCode.trim().toUpperCase() === cleanedCode && 
      f.pool === newFabricPool
    );

    if (isDuplicate) {
      setFormError(`Bu kumaş kodu zaten ${newFabricPool === 'B' ? 'Berkay' : 'Doğukan'} havuzunda kayıtlı.`);
      return;
    }

    setSavedFabrics(prev => [...prev, {
      fabricCode: newFabricCode.trim(),
      pool: newFabricPool,
      width: newFabricWidth || 140,
      barcode: newFabricBarcode.trim(),
      fabricName: newFabricName.trim()
    }]);

    // Reset fields
    setNewFabricCode('');
    setNewFabricWidth(140);
    setNewFabricBarcode('');
    setNewFabricName('');
  };

  // Quick edit mode helper
  const startEditing = (code: string, pool: 'B' | 'D', barcode: string, name: string) => {
    setEditingKey(`${code}__${pool}`);
    setEditBarcodeVal(barcode);
    setEditNameVal(name);
  };

  const saveEditing = (code: string, pool: 'B' | 'D') => {
    setSavedFabrics(prev => prev.map(item => {
      if (item.fabricCode.toUpperCase() === code.toUpperCase() && item.pool === pool) {
        return { ...item, barcode: editBarcodeVal.trim(), fabricName: editNameVal.trim() };
      }
      return item;
    }));
    setEditingKey(null);
  };

  // Delete fabric definition from the registry
  const handleDeleteFabric = (code: string, pool: 'B' | 'D') => {
    const poolText = pool === 'B' ? "Berkay'in Havuzu" : "Dogukan'in Havuzu";
    if (window.confirm(`${code} (${poolText}) kumaş kaydını silmek istediğinize emin misiniz?`)) {
      setSavedFabrics(prev => prev.filter(f => 
        !(f.fabricCode.trim().toUpperCase() === code.trim().toUpperCase() && f.pool === pool)
      ));
    }
  };

  // PDF Requirements Report Download sorted neatly by pool (Subtitle & Sub-totals!)
  const exportSummaryToPdf = () => {
    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4'
    });

    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 12;

    // Report Header
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.text('YAVER ANA KUMAS GEREKSINIM VE STOK RAPORU', margin, 18);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(60, 60, 60);
    doc.text(`DBD Textile - Rapor Tarihi: ${new Date().toLocaleString('tr-TR')}`, margin, 23);

    // Solid horizontal separator
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.5);
    doc.line(margin, 26, pageWidth - margin, 26);

    // Dynamic requirements calculations
    // Group needs by unique barcode
    const mappedGroups: { [barcode: string]: { uf: UnifiedFabric; totalMeters: number; count: number; codes: Set<string> } } = {};
    const unmappedItems: any[] = [];

    // Helper: Find unified fabric by individual code & pool
    const findUnifiedFabricByCodeAndPool = (fabricCode: string, pool: 'B' | 'D') => {
      const saved = savedFabrics.find(sf => sf.fabricCode.toUpperCase() === fabricCode.toUpperCase() && sf.pool === pool);
      const barcode = saved?.barcode;
      if (barcode) {
        const uf = unifiedFabrics.find(u => u.barcode === barcode);
        if (uf) return uf;
      }
      return unifiedFabrics.find(u => 
        (pool === 'B' && u.berkayCode && u.berkayCode.toUpperCase() === fabricCode.toUpperCase()) ||
        (pool === 'D' && u.dogukanCode && u.dogukanCode.toUpperCase() === fabricCode.toUpperCase())
      );
    };

    rawSummary.forEach(item => {
      const uf = findUnifiedFabricByCodeAndPool(item.fabricCode, item.pool);
      if (uf) {
        if (!mappedGroups[uf.barcode]) {
          mappedGroups[uf.barcode] = {
            uf,
            totalMeters: 0,
            count: 0,
            codes: new Set<string>()
          };
        }
        mappedGroups[uf.barcode].totalMeters += item.totalMeters;
        mappedGroups[uf.barcode].count += item.count;
        const poolLabel = item.pool === 'B' ? 'Berkay (B)' : 'Dogukan (D)';
        mappedGroups[uf.barcode].codes.add(`${item.fabricCode} (${poolLabel})`);
      } else {
        unmappedItems.push(item);
      }
    });

    const totalRequiredAll = rawSummary.reduce((acc, i) => acc + i.totalMeters, 0);
    const totalMappedMeters = Object.values(mappedGroups).reduce((acc, g) => acc + g.totalMeters, 0);
    const totalUnmappedMeters = unmappedItems.reduce((acc, i) => acc + i.totalMeters, 0);
    const totalStockAvailable = Object.values(mappedGroups).reduce((acc, g) => acc + g.uf.stock, 0);

    // Sum total shortfalls
    let totalShortage = 0;
    Object.values(mappedGroups).forEach(g => {
      const diff = g.uf.stock - g.totalMeters;
      if (diff < 0) {
        totalShortage += Math.abs(diff);
      }
    });

    // General overall summary callout card (black border, minimalist style)
    doc.setFillColor(250, 250, 246);
    doc.rect(margin, 29, pageWidth - (margin * 2), 24, 'F');
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.3);
    doc.rect(margin, 29, pageWidth - (margin * 2), 24, 'S');
    
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(0, 0, 0);
    doc.text('RAPOR OZETI:', margin + 4, 34);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.text(`Kutuphaneli Kumas Gereksinimi: ${totalMappedMeters.toFixed(2)} Metre`, margin + 4, 39);
    doc.text(`Diger Standart Kumas Gereksinimi: ${totalUnmappedMeters.toFixed(2)} Metre`, margin + 4, 44);
    doc.text(`Toplam Depo Stok Miktarı: ${totalStockAvailable.toFixed(1)} Metre`, margin + 4, 49);

    doc.setFont('helvetica', 'bold');
    doc.text(`GENEL TOPLAM IHTIYAC: ${totalRequiredAll.toFixed(2)} Metre`, margin + 105, 39);
    if (totalShortage > 0) {
      doc.setTextColor(200, 0, 0);
      doc.text(`ACIL SIPARIS GEREKEN: ${totalShortage.toFixed(1)} Metre`, margin + 105, 45);
    } else {
      doc.setTextColor(0, 120, 0);
      doc.text(`DEPO STOK SEVIYESI YETERLI`, margin + 105, 45);
    }
    doc.setTextColor(0, 0, 0); // Restore color

    // Table rows builder
    const tableHeaders = [['No', 'Görsel', 'Ana Kumaş Adı / Eşsiz Barkod', 'Katalog Havuz Kodları', 'İhtiyaç', 'Mevcut Stok', 'Stok Kalan / Açık Miktarı']];
    
    // Create combined data source for parallel image and cell rendering
    const pdfDataRows: any[] = [];
    
    // Add mapped groups
    Object.values(mappedGroups).forEach((g) => {
      pdfDataRows.push({
        name: g.uf.fabricName,
        barcode: g.uf.barcode,
        imageUrl: g.uf.imageUrl || '',
        codesDisplay: Array.from(g.codes).join('\n'),
        required: g.totalMeters,
        stock: g.uf.stock,
        isMapped: true
      });
    });

    // Add unmapped items
    unmappedItems.forEach((item) => {
      pdfDataRows.push({
        name: 'Kayıtsız Standart Kumaş',
        barcode: 'Barkod Belirtilmemiş',
        imageUrl: '',
        codesDisplay: `${item.fabricCode} (${item.pool === 'B' ? 'Berkay' : 'Doğukan'} Havuzu)`,
        required: item.totalMeters,
        stock: 0,
        isMapped: false
      });
    });

    const tableRows = pdfDataRows.map((item, index) => {
      const diff = item.stock - item.required;
      let statusStr = '';
      if (!item.isMapped) {
        statusStr = 'Kütüphanede Yok';
      } else if (diff >= 0) {
        statusStr = `YETERLIPLUS (+${diff.toFixed(1)}m)`;
      } else {
        statusStr = `EKSİK (-${Math.abs(diff).toFixed(1)}m) !!!`;
      }

      return [
        (index + 1).toString(),
        '', // Visual Image column left blank for custom drawing
        `${sanitizeText(item.name)}\nBarkod: ${item.barcode}`,
        sanitizeText(item.codesDisplay),
        `${item.required.toFixed(2)} m`,
        item.isMapped ? `${item.stock.toFixed(1)} m` : 'Bilinmiyor',
        statusStr
      ];
    });

    autoTable(doc, {
      startY: 57,
      head: tableHeaders,
      body: tableRows,
      theme: 'grid',
      styles: {
        font: 'helvetica',
        fontSize: 8,
        cellPadding: 3,
        valign: 'middle'
      },
      headStyles: {
        fillColor: [0, 0, 0],
        textColor: [255, 255, 255],
        fontStyle: 'bold'
      },
      columnStyles: {
        0: { cellWidth: 10, halign: 'center' },
        1: { cellWidth: 20, halign: 'center' },
        2: { cellWidth: 50 },
        3: { cellWidth: 35 },
        4: { cellWidth: 20, halign: 'right' },
        5: { cellWidth: 20, halign: 'right' },
        6: { cellWidth: 30, halign: 'center' }
      },
      didDrawCell: (data) => {
        // Render thumbnail in column index 1 of body rows
        if (data.column.index === 1 && data.cell.section === 'body') {
          const rowData = pdfDataRows[data.row.index];
          if (rowData && rowData.imageUrl) {
            try {
              // Standard size 11mm square centered inside the cell
              const size = 12;
              const x = data.cell.x + (data.cell.width - size) / 2;
              const y = data.cell.y + (data.cell.height - size) / 2;
              doc.addImage(rowData.imageUrl, 'JPEG', x, y, size, size);
            } catch (e) {
              console.error("PDF image add failed in cell", e);
            }
          } else {
            doc.setFontSize(7);
            doc.setTextColor(150, 150, 150);
            doc.text('(BOS)', data.cell.x + 6, data.cell.y + (data.cell.height / 2) + 2);
          }
        }
      },
      didDrawPage: (data) => {
        const str = `Sayfa ${data.pageNumber}`;
        doc.setFontSize(8);
        doc.setTextColor(100, 100, 100);
        doc.text(sanitizeText(str), pageWidth - margin - 15, pageHeight - 8);
        doc.text('Yaver Ayrilmis Kumas Havuzlari, Stok Kontrol ve Resimli Barkod Entegrasyonu', margin, pageHeight - 8);
      }
    });

    const fileDate = new Date().toLocaleDateString('tr-TR').replace(/\./g, '_');
    doc.save(`Yaver_Kumas_Gereksinimi_Raporu_${fileDate}.pdf`);
  };

  // Filter Database Registry for the Database list subview
  const filteredDatabase = useMemo(() => {
    let list = savedFabrics;

    if (dbPoolFilter !== 'ALL') {
      list = list.filter(f => f.pool === dbPoolFilter);
    }

    if (dbSearchQuery.trim()) {
      const query = dbSearchQuery.toLowerCase().trim();
      list = list.filter(f => 
        f.fabricCode.toLowerCase().includes(query) || 
        f.barcode.toLowerCase().includes(query) || 
        (f.fabricName && f.fabricName.toLowerCase().includes(query))
      );
    }

    // Sort alphabetically by code
    return [...list].sort((a, b) => a.fabricCode.localeCompare(b.fabricCode));
  }, [savedFabrics, dbPoolFilter, dbSearchQuery]);

  return (
    <div className="flex-1 bg-[#F5F5F0] flex flex-col h-full min-h-0 overflow-hidden">
      
      {/* Sub-navigation Header */}
      <header className="h-16 bg-white border-b border-black/5 px-8 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-6">
          <div className="flex flex-col">
            <span className="text-[10px] font-black uppercase text-black/30 tracking-widest leading-none">ÇİFT HAVUZLU SİSTEM</span>
            <span className="text-sm font-extrabold text-black mt-0.5">Kumaş & Barkod Entegrasyonu</span>
          </div>

          {/* Sub Navigation Tabs */}
          <div className="flex bg-[#F5F5F0] p-1 rounded-xl h-10 ml-2">
            <button
              onClick={() => setActiveSubTab('analysis')}
              className={cn(
                "px-4 py-1.5 rounded-lg text-xs font-extrabold transition-all cursor-pointer flex items-center gap-1.5",
                activeSubTab === 'analysis' ? "bg-white text-black shadow-sm" : "text-black/40 hover:text-black/60"
              )}
            >
              <Calculator className="w-3.5 h-3.5" />
              <span>Metraj Analizi</span>
            </button>
            <button
              onClick={() => setActiveSubTab('database')}
              className={cn(
                "px-4 py-1.5 rounded-lg text-xs font-extrabold transition-all cursor-pointer flex items-center gap-1.5",
                activeSubTab === 'database' ? "bg-white text-black shadow-sm" : "text-black/40 hover:text-black/60"
              )}
            >
              <Database className="w-3.5 h-3.5" />
              <span>Kumaş Kütüphanesi</span>
              <span className="px-1.5 py-0.5 rounded-full text-[9px] font-black leading-none bg-black/5 text-black/40">
                {savedFabrics.length}
              </span>
            </button>
            <button
              onClick={() => setActiveSubTab('unified')}
              className={cn(
                "px-4 py-1.5 rounded-lg text-xs font-extrabold transition-all cursor-pointer flex items-center gap-1.5",
                activeSubTab === 'unified' ? "bg-white text-black shadow-sm" : "text-black/40 hover:text-black/60"
              )}
            >
              <Layers className="w-3.5 h-3.5 text-black" />
              <span>Ana Kumaş Kütüphanesi</span>
              <span className="px-1.5 py-0.5 rounded-full text-[9px] font-black leading-none bg-black/5 text-black/40">
                {unifiedFabrics.length}
              </span>
            </button>
          </div>
        </div>

        {/* Action button */}
        <div className="flex items-center gap-2">
          {activeSubTab !== 'database' && (
            <button
              onClick={exportSummaryToPdf}
              className="bg-black hover:bg-neutral-950 text-white font-extrabold text-xs h-9 px-4 rounded-xl shadow-sm transition-all flex items-center gap-2 cursor-pointer active:scale-95"
              title="Kumaş ihtiyaç özetini barkodları ile birlikte resimli PDF döküm olarak indirir"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Kumaş Gereksinimi PDF</span>
            </button>
          )}
        </div>
      </header>

      {/* Main Container Area */}
      <div className="flex-1 overflow-y-auto p-8">
        <div className="max-w-5xl mx-auto space-y-6">
          
          {activeSubTab === 'analysis' ? (
            orders.length === 0 ? (
              <div className="bg-white rounded-[2rem] p-12 text-center border border-black/5 shadow-sm max-w-xl mx-auto flex flex-col items-center">
                <div className="w-16 h-16 bg-black/5 rounded-2xl flex items-center justify-center mb-4 shrink-0">
                  <Scissors className="w-8 h-8 opacity-30 text-black" />
                </div>
                <h3 className="text-base font-black mb-1.5 text-black">Metraj Analizi İçin Sipariş Ekleyin</h3>
                <p className="text-xs text-black/50 max-w-sm leading-relaxed mb-6 font-medium">
                  Havuzlardaki kumaş gereksinimlerini otomatik hesaplayabilmek için sol taraftaki panelden ya da <strong>Etiketler</strong> sekmesinden sipariş listenizi yapıştırın.
                </p>
                <div className="flex gap-2.5 flex-wrap justify-center">
                  <button
                    type="button"
                    onClick={() => setActiveSubTab('unified')}
                    className="h-10 px-4 bg-black hover:bg-neutral-900 text-white font-extrabold text-xs rounded-xl flex items-center gap-1.5 transition-all cursor-pointer shadow-sm active:scale-95"
                  >
                    <Layers className="w-3.5 h-3.5 opacity-70" />
                    <span>Ana Kumaş Kütüphanesi'ni Aç</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveSubTab('database')}
                    className="h-10 px-4 bg-[#EAEAE2] hover:bg-[#DDDDCF] text-black font-extrabold text-xs rounded-xl flex items-center gap-1.5 transition-all cursor-pointer shadow-sm"
                  >
                    <Database className="w-3.5 h-3.5 opacity-70" />
                    <span>Özel Kumaş Kütüphanesi'ni Aç</span>
                  </button>
                </div>
              </div>
            ) : (
              <>
                {/* Dynamic Stats split by Pools */}
              <div className="bg-black rounded-[2rem] p-8 text-white shadow-xl relative overflow-hidden">
                <div className="absolute top-0 right-0 w-96 h-96 bg-white/5 rounded-full -mr-48 -mt-48 blur-3xl" />
                <div className="relative z-10 flex flex-col md:flex-row md:items-center md:justify-between gap-6">
                  <div>
                    <p className="text-[10px] font-extrabold uppercase tracking-[0.2em] opacity-40 mb-2">Seçili Gereksinim Toplamı</p>
                    <div className="flex items-baseline gap-2">
                      <span className="text-6xl font-black tracking-tight leading-none">
                        {totalAllMeters.toFixed(2)}
                      </span>
                      <span className="text-xl font-bold opacity-40 uppercase tracking-widest">Metre</span>
                    </div>
                  </div>

                  {/* Summary grid splitting pools */}
                  <div className="grid grid-cols-2 gap-8 border-t md:border-t-0 md:border-l border-white/10 pt-4 md:pt-0 md:pl-8">
                    <div>
                      <div className="flex items-center gap-1.5 opacity-50 mb-1">
                        <span className="w-2.5 h-2.5 rounded-full bg-cyan-400" />
                        <span className="text-[10px] font-bold uppercase tracking-wider">BERKAY HAVUZU (B)</span>
                      </div>
                      <p className="text-2xl font-black">
                        {rawSummary.filter(i => i.pool === 'B').reduce((acc, i) => acc + i.totalMeters, 0).toFixed(1)} m
                      </p>
                      <p className="text-[10px] leading-none opacity-45 mt-0.5">
                        {rawSummary.filter(i => i.pool === 'B').length} farklı kumaş
                      </p>
                    </div>

                    <div>
                      <div className="flex items-center gap-1.5 opacity-50 mb-1">
                        <span className="w-2.5 h-2.5 rounded-full bg-violet-400" />
                        <span className="text-[10px] font-bold uppercase tracking-wider">DOĞUKAN HAVUZU (D)</span>
                      </div>
                      <p className="text-2xl font-black">
                        {rawSummary.filter(i => i.pool === 'D').reduce((acc, i) => acc + i.totalMeters, 0).toFixed(1)} m
                      </p>
                      <p className="text-[10px] leading-none opacity-45 mt-0.5">
                        {rawSummary.filter(i => i.pool === 'D').length} farklı kumaş
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Filtering Controls Row */}
              <div className="flex flex-col md:flex-row items-stretch md:items-center gap-3">
                {/* Search query input */}
                <div className="relative flex-1">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-black/35" />
                  <input
                    type="text"
                    placeholder="Kumaş kodu, barkod veya özel tanıma göre filtrele..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full h-12 bg-white border border-black/5 rounded-2xl pl-11 pr-4 font-bold text-xs text-black shadow-sm outline-none placeholder:text-black/30 focus:border-black/20"
                  />
                </div>

                {/* Pool Picker Segmented Controls */}
                <div className="flex bg-white/70 p-1 rounded-2xl border border-black/5 shadow-sm h-12 shrink-0">
                  <button
                    onClick={() => setActivePoolFilter('ALL')}
                    className={cn(
                      "px-4 rounded-xl text-xs font-extrabold transition-all cursor-pointer flex items-center gap-1.5 whitespace-nowrap",
                      activePoolFilter === 'ALL' ? "bg-black text-white" : "text-black/55 hover:text-black/80"
                    )}
                  >
                    <span>Tüm Havuzlar</span>
                  </button>
                  <button
                    onClick={() => setActivePoolFilter('B')}
                    className={cn(
                      "px-4 rounded-xl text-xs font-extrabold transition-all cursor-pointer flex items-center gap-1.5 whitespace-nowrap",
                      activePoolFilter === 'B' ? "bg-cyan-600 text-white" : "text-black/55 hover:text-black/80"
                    )}
                  >
                    <span className="w-1.5 h-1.5 bg-cyan-400 rounded-full" />
                    <span>Berkay'ın Kumaşları (B)</span>
                  </button>
                  <button
                    onClick={() => setActivePoolFilter('D')}
                    className={cn(
                      "px-4 rounded-xl text-xs font-extrabold transition-all cursor-pointer flex items-center gap-1.5 whitespace-nowrap",
                      activePoolFilter === 'D' ? "bg-violet-600 text-white" : "text-black/55 hover:text-black/80"
                    )}
                  >
                    <span className="w-1.5 h-1.5 bg-violet-400 rounded-full" />
                    <span>Doğukan'ın Kumaşları (D)</span>
                  </button>
                </div>
              </div>

              {/* Fabric List Analysis split by color coded pools */}
              <div className="space-y-4">
                <div className="grid grid-cols-12 px-6 text-[10px] font-extrabold uppercase tracking-widest opacity-45">
                  <div className="col-span-1">HAVUZ</div>
                  <div className="col-span-4">KUMAŞ KODU / ÖZEL TANIM / BARKOD</div>
                  <div className="col-span-2 text-center">MİKTAR</div>
                  <div className="col-span-2 text-center font-black">EN GENİŞLİĞİ (BAĞLI CM)</div>
                  <div className="col-span-3 text-right">TOPLAM GEREKLİ</div>
                </div>

                <div className="space-y-3">
                  {filteredSummary.length === 0 ? (
                    <div className="bg-white rounded-[2rem] p-12 text-center border border-black/5 shadow-sm">
                      <p className="text-sm opacity-50 font-bold uppercase">Seçilen kriterlere uygun hiçbir kumaş gereksinimi bulunmuyor.</p>
                    </div>
                  ) : (
                    filteredSummary.map((item) => {
                      const registeredFabric = getFabricByCodeAndPool(item.fabricCode, item.pool);
                      const isRegistered = !!registeredFabric;
                      const hasBarcodeValue = registeredFabric && registeredFabric.barcode;
                      const hasNameValue = registeredFabric && registeredFabric.fabricName;
                      
                      const inlineKey = `${item.fabricCode}__${item.pool}`;
                      const isCurrentlyEditing = editingKey === inlineKey;

                      // Decide color themes dynamically based on pool suffix (Teal for Berkay B, Indigo/Violet for Doğukan D)
                      const isBerkay = item.pool === 'B';

                      return (
                        <div 
                          key={inlineKey}
                          className={cn(
                            "bg-white rounded-[2rem] p-6 border shadow-sm grid grid-cols-12 items-center hover:shadow-md transition-all",
                            isBerkay ? "border-l-[5px] border-l-cyan-500 border-black/5" : "border-l-[5px] border-l-violet-500 border-black/5"
                          )}
                        >
                          {/* Col 0: Pool Badge Indicator */}
                          <div className="col-span-1 select-none">
                            <span className={cn(
                              "text-xs font-black px-3 py-1.5 rounded-xl block text-center w-9 leading-none shadow-sm",
                              isBerkay ? "bg-cyan-100 text-cyan-800" : "bg-violet-100 text-violet-800"
                            )} title={isBerkay ? "Berkay'ın Kumaş Havuzu" : "Doğukan'ın Kumaş Havuzu"}>
                              {item.pool}
                            </span>
                          </div>

                          {/* Col 1: Fabric Code, Editable Barcode, and Custom Fabric Name */}
                          <div className="col-span-4 space-y-1.5 pr-3">
                            <div className="flex items-center gap-2 flex-wrap">
                              <h4 className="text-base font-black tracking-tight uppercase text-black leading-none">{item.fabricCode}</h4>
                              <span className={cn(
                                "text-[9px] font-black uppercase px-2 py-0.5 rounded-full leading-none tracking-widest",
                                isRegistered 
                                  ? "bg-emerald-50 text-emerald-700 border border-emerald-200" 
                                  : "bg-red-50 text-red-700 border border-red-200"
                              )}>
                                {isRegistered ? 'HAFIZADA' : 'HAFIZASIZ'}
                              </span>
                              {(() => {
                                const dumeliCount = item.orders.filter(o => {
                                  const extraLower = (o.extraInfo || '').trim().toLowerCase();
                                  return extraLower.includes('dümeli') || 
                                         extraLower.includes('düğmeli') || 
                                         extraLower.includes('dumeli') || 
                                         extraLower.includes('dugmeli');
                                }).length;
                                if (dumeliCount > 0) {
                                  return (
                                    <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded-full leading-none tracking-widest bg-amber-100 text-amber-800 border border-amber-300">
                                      {dumeliCount} Düğmeli (+12cm Pay)
                                    </span>
                                  );
                                }
                                return null;
                              })()}
                            </div>

                            {/* Live quick editors or displays */}
                            {isRegistered ? (
                              <div className="space-y-1">
                                {isCurrentlyEditing ? (
                                  <div className="space-y-2 bg-neutral-50 p-3 rounded-xl border border-neutral-200 shadow-inner mt-2">
                                    <div className="space-y-1">
                                      <span className="text-[9px] font-black uppercase text-black/50">Açıklama / Kumaş İsmi</span>
                                      <input
                                        type="text"
                                        value={editNameVal}
                                        onChange={(e) => setEditNameVal(e.target.value)}
                                        placeholder="Örn: Gri Buldan Keten"
                                        className="w-full h-8 bg-white border border-neutral-300 rounded px-2.5 text-xs font-bold font-sans outline-none leading-none"
                                      />
                                    </div>
                                    <div className="space-y-1">
                                      <span className="text-[9px] font-black uppercase text-black/50">Barkod Numarası</span>
                                      <div className="flex gap-2">
                                        <input
                                          type="text"
                                          value={editBarcodeVal}
                                          onChange={(e) => setEditBarcodeVal(e.target.value)}
                                          placeholder="Barkod"
                                          className="flex-1 h-8 bg-white border border-neutral-300 rounded px-2.5 text-xs font-bold font-mono outline-none leading-none"
                                        />
                                        <button
                                          type="button"
                                          onClick={() => setEditBarcodeVal(getNewUniqueBarcode())}
                                          className="h-8 px-2.5 bg-neutral-100 hover:bg-neutral-200 text-black border border-neutral-300 rounded text-[10px] font-black flex items-center justify-center gap-0.5 cursor-pointer whitespace-nowrap leading-none"
                                          title="Benzersiz Barkod Üret"
                                        >
                                          <Barcode className="w-3 h-3" />
                                          <span>Üret</span>
                                        </button>
                                      </div>
                                    </div>
                                    <div className="flex gap-2 justify-end pt-1">
                                      <button
                                        type="button"
                                        onClick={() => setEditingKey(null)}
                                        className="text-[10px] font-bold text-neutral-500 hover:text-neutral-700 hover:underline cursor-pointer"
                                      >
                                        Vazgeç
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => saveEditing(item.fabricCode, item.pool)}
                                        className="bg-black hover:bg-neutral-800 text-white text-[10px] font-bold px-2 py-0.5 rounded shadow-sm flex items-center gap-1 cursor-pointer"
                                      >
                                        <Save className="w-3 h-3" /> Eşle
                                      </button>
                                    </div>
                                  </div>
                                ) : (
                                  <div className="flex flex-col pt-0.5">
                                    <div className="flex items-center gap-1.5 text-neutral-800 font-extrabold text-xs">
                                      <span>{hasNameValue ? registeredFabric.fabricName : 'Standart Kumaş (Tıla/Rulo)'}</span>
                                      <button 
                                        type="button"
                                        onClick={() => startEditing(item.fabricCode, item.pool, registeredFabric.barcode, registeredFabric.fabricName || '')}
                                        className="p-1 hover:bg-black/5 rounded text-neutral-400 hover:text-black transition-all cursor-pointer"
                                        title="Kumaş açısını veya ismini değiştir"
                                      >
                                        <Edit2 className="w-3 h-3" />
                                      </button>
                                    </div>
                                    <div className="flex items-center gap-1 text-black/40">
                                      <Barcode className="w-3.5 h-3.5 opacity-50" />
                                      <span className="text-xs font-mono font-bold tracking-tight">
                                        {hasBarcodeValue ? registeredFabric.barcode : 'BARKOD BELİRTİLMEMİŞ'}
                                      </span>
                                    </div>
                                  </div>
                                )}
                              </div>
                            ) : (
                              <div className="space-y-2 pt-1 font-sans">
                                <div className="flex items-center gap-1">
                                  <div className="flex flex-col gap-1 w-full max-w-[200px]">
                                    <input
                                      type="text"
                                      placeholder="Kumaş ismi (Örn: Sarı Keten)..."
                                      value={quickInputs[inlineKey]?.name || ''}
                                      onChange={(e) => setQuickInputs(prev => ({
                                        ...prev,
                                        [inlineKey]: {
                                          barcode: prev[inlineKey]?.barcode || '',
                                          name: e.target.value
                                        }
                                      }))}
                                      className="w-full h-8 bg-[#F5F5F0] hover:bg-neutral-200/50 text-[11px] font-semibold text-black rounded-lg px-2.5 outline-none focus:bg-white border-none leading-none"
                                    />
                                    <div className="flex gap-2">
                                      <input
                                        type="text"
                                        placeholder="Barkod numarası yaz..."
                                        value={quickInputs[inlineKey]?.barcode || ''}
                                        onChange={(e) => setQuickInputs(prev => ({
                                          ...prev,
                                          [inlineKey]: {
                                            barcode: e.target.value,
                                            name: prev[inlineKey]?.name || ''
                                          }
                                        }))}
                                        className="flex-1 h-8 bg-[#F5F5F0] hover:bg-neutral-200/50 text-[11px] font-mono font-semibold text-black rounded-lg px-2.5 outline-none focus:bg-white border-none leading-none"
                                      />
                                      <button
                                        type="button"
                                        onClick={() => setQuickInputs(prev => ({
                                          ...prev,
                                          [inlineKey]: {
                                            barcode: getNewUniqueBarcode(),
                                            name: prev[inlineKey]?.name || ''
                                          }
                                        }))}
                                        className="h-8 px-2 bg-neutral-200 hover:bg-neutral-300 text-black rounded-lg text-[10.5px] font-black flex items-center justify-center gap-0.5 cursor-pointer whitespace-nowrap leading-none"
                                        title="Benzersiz Barkod Üret"
                                      >
                                        <Barcode className="w-3.5 h-3.5" />
                                        <span>Üret</span>
                                      </button>
                                    </div>
                                  </div>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => handleQuickRegister(
                                    item.fabricCode,
                                    item.pool,
                                    quickInputs[inlineKey]?.barcode || '',
                                    quickInputs[inlineKey]?.name || ''
                                  )}
                                  className="bg-black hover:bg-neutral-900 text-white text-[10px] font-black py-1 px-3 rounded-lg active:scale-95 transition-all flex items-center justify-center gap-1 w-28 cursor-pointer"
                                >
                                  <Plus className="w-3 h-3" />
                                  <span>Hafızaya Kaydet</span>
                                </button>
                              </div>
                            )}
                          </div>

                          {/* Col 2: Siparis Count */}
                          <div className="col-span-2 text-center">
                            <span className="px-3 py-1.5 bg-black/5 rounded-xl text-xs font-black text-black/60">
                              {item.count} Sipariş
                            </span>
                          </div>

                          {/* Col 3: Width adjustment (updates database instantly without forcing navigation) */}
                          <div className="col-span-2 flex items-center justify-center gap-2">
                            <div className="flex items-center border border-black/5 rounded-xl bg-[#F5F5F0] hover:bg-neutral-200/50 transition-all px-1.5 h-10">
                              <input 
                                type="number" 
                                value={getFabricWidth(item.fabricCode, item.pool)}
                                onChange={(e) => handleInlineWidthChange(item.fabricCode, item.pool, parseInt(e.target.value) || 0)}
                                className="w-12 bg-transparent border-none text-xs font-black text-center outline-none"
                              />
                            </div>
                            <span className="text-[10px] font-black text-black/40 uppercase">CM</span>
                          </div>

                          {/* Col 4: Meters needed */}
                          <div className="col-span-3 text-right flex items-baseline justify-end gap-1">
                            <span className="text-4xl font-black tracking-tighter text-black leading-none">
                              {item.totalMeters.toFixed(2)}
                            </span>
                            <span className="text-[10px] font-black text-black/40 uppercase">METRE</span>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              {/* Informative Help Card detailing Double-Pool workflows */}
              <div className="p-6 bg-cyan-700/5 rounded-[2rem] border border-cyan-500/10 flex items-start gap-4">
                <Info className="w-5 h-5 text-cyan-600 mt-0.5 shrink-0" />
                <div className="space-y-1">
                  <p className="text-xs text-cyan-900 font-extrabold uppercase tracking-widest">Çift Havuzlu Akıllı Barkod ve En Akışı</p>
                  <p className="text-[11px] text-cyan-800 leading-relaxed">
                    Yaver artık iki farklı kumaş havuzunu (<strong>Berkay'ın Havuzu B</strong> ve <strong>Doğukan'ın Havuzu D</strong>) tam entegre takip eder. Sipariş listenizin sonuna eklediğiniz <strong>B</strong> veya <strong>D</strong> harfiyle sistem kumaşı doğru sahibine paylaştırır. Her havuzun kendine özel <strong>Kumaş Eni</strong>, <strong>Barkod Numarası</strong> ve <strong>Kumaş İsmi (Açıklaması)</strong> bulunur. Genişlikleri veya barkodları değiştirdiğinizde, bu tercih o havuza kalıcı olarak sürekli kaydedilir.
                  </p>
                </div>
              </div>
            </>
          )
          ) : activeSubTab === 'database' ? (
            <>
              {/* Database Tab Content with dual view filters */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-start">
                
                {/* Save/Register Form Card */}
                <div className="bg-white rounded-[2rem] p-6 border border-black/5 shadow-sm space-y-4">
                  <div className="flex items-center gap-2">
                    <Database className="w-4 h-4 text-black" />
                    <h3 className="font-extrabold text-sm uppercase text-black leading-none">Yeni Kumaş Tanımla</h3>
                  </div>
                  <p className="text-xs text-black/40 leading-relaxed">
                    Sıklıkla havuzlarda kullanacağınız dökme kumaşların kütüphanesini önceden tasarlayın.
                  </p>

                  <form onSubmit={handleAddFabric} className="space-y-4 pt-2">
                    
                    {/* Pool selection toggle */}
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-extrabold text-black/50 uppercase tracking-wider">HEDEF KUMAŞ HAVUZU *</label>
                      <div className="grid grid-cols-2 gap-2 bg-[#F5F5F0] p-1 rounded-xl">
                        <button
                          type="button"
                          onClick={() => setNewFabricPool('B')}
                          className={cn(
                            "py-2 rounded-lg text-[11px] font-black uppercase transition-all cursor-pointer",
                            newFabricPool === 'B' ? "bg-cyan-600 text-white shadow-sm" : "text-black/50 hover:text-black/80"
                          )}
                        >
                          Berkay Havuzu (B)
                        </button>
                        <button
                          type="button"
                          onClick={() => setNewFabricPool('D')}
                          className={cn(
                            "py-2 rounded-lg text-[11px] font-black uppercase transition-all cursor-pointer",
                            newFabricPool === 'D' ? "bg-violet-600 text-white shadow-sm" : "text-black/50 hover:text-black/80"
                          )}
                        >
                          Doğukan Havuzu (D)
                        </button>
                      </div>
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] font-extrabold text-black/50 uppercase tracking-wider">KUMAŞ KODU *</label>
                      <input
                        type="text"
                        placeholder="Örn: COLOR 1, COLOR 10"
                        value={newFabricCode}
                        onChange={(e) => setNewFabricCode(e.target.value)}
                        className="w-full h-10 bg-[#F5F5F0] border-none rounded-xl px-3.5 font-bold text-xs uppercase outline-none focus:ring-1 focus:ring-black/20"
                        required
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] font-extrabold text-black/50 uppercase tracking-wider">KUMAŞ İSMİ / ÖZEL AÇIKLAMA</label>
                      <input
                        type="text"
                        placeholder="Örn: Gri Buldan Keten"
                        value={newFabricName}
                        onChange={(e) => setNewFabricName(e.target.value)}
                        className="w-full h-10 bg-[#F5F5F0] border-none rounded-xl px-3.5 font-bold text-xs outline-none focus:ring-1 focus:ring-black/20"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <label className="text-[10px] font-extrabold text-black/50 uppercase tracking-wider">EN GENİŞLİĞİ (CM)</label>
                        <input
                          type="number"
                          placeholder="140"
                          value={newFabricWidth || ''}
                          onChange={(e) => setNewFabricWidth(parseInt(e.target.value) || 0)}
                          className="w-full h-10 bg-[#F5F5F0] border-none rounded-xl px-3.5 font-bold text-xs outline-none focus:ring-1 focus:ring-black/20"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-extrabold text-black/50 uppercase tracking-wider">BARKOD NO</label>
                        <div className="flex gap-2">
                          <input
                            type="text"
                            placeholder="Depo Barkod Kodu"
                            value={newFabricBarcode}
                            onChange={(e) => setNewFabricBarcode(e.target.value)}
                            className="flex-1 h-10 bg-[#F5F5F0] border-none rounded-xl px-3.5 font-mono font-bold text-xs outline-none focus:ring-1 focus:ring-black/20"
                          />
                          <button
                            type="button"
                            onClick={() => setNewFabricBarcode(getNewUniqueBarcode())}
                            className="h-10 px-3 bg-[#EAEAE2] hover:bg-[#DDDDCF] text-black font-extrabold text-[11px] rounded-xl flex items-center justify-center gap-1 cursor-pointer whitespace-nowrap"
                          >
                            <Barcode className="w-3.5 h-3.5" />
                            <span>Eşsiz Üret</span>
                          </button>
                        </div>
                      </div>
                    </div>

                    {formError && (
                      <div className="p-3 bg-red-100 text-red-700 text-xs font-bold rounded-xl border border-red-200 flex items-center gap-1.5 animate-pulse">
                        <AlertCircle className="w-4 h-4 shrink-0" />
                        <span>{formError}</span>
                      </div>
                    )}

                    <button
                      type="submit"
                      className="w-full h-10 bg-black hover:bg-neutral-900 text-white font-extrabold text-xs rounded-xl shadow-sm transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-95"
                    >
                      <Plus className="w-4 h-4" />
                      <span>Kumaşı Kütüphaneye Kaydet</span>
                    </button>
                  </form>
                </div>

                {/* Database List / Manage Table Card */}
                <div className="bg-white rounded-[2rem] p-6 border border-black/5 shadow-sm space-y-4 md:col-span-2">
                  <div className="flex items-center justify-between gap-4 flex-wrap">
                    <div className="flex items-center gap-2">
                      <Barcode className="w-4 h-4 text-black" />
                      <h3 className="font-extrabold text-sm uppercase text-black leading-none">Tanımlı Kumaş Listesi</h3>
                    </div>
                    
                    {/* Database tab local pool filters */}
                    <div className="flex bg-[#F5F5F0] p-0.5 rounded-lg border border-black/5">
                      <button
                        onClick={() => setDbPoolFilter('ALL')}
                        className={cn(
                          "px-2.5 py-1 rounded text-[10px] font-black uppercase cursor-pointer",
                          dbPoolFilter === 'ALL' ? "bg-white text-black shadow-sm" : "text-black/40 hover:text-black/60"
                        )}
                      >
                        Tümü
                      </button>
                      <button
                        onClick={() => setDbPoolFilter('B')}
                        className={cn(
                          "px-2.5 py-1 rounded text-[10px] font-black uppercase cursor-pointer",
                          dbPoolFilter === 'B' ? "bg-cyan-600 text-white shadow-sm" : "text-black/40 hover:text-black/60"
                        )}
                      >
                        Berkay (B)
                      </button>
                      <button
                        onClick={() => setDbPoolFilter('D')}
                        className={cn(
                          "px-2.5 py-1 rounded text-[10px] font-black uppercase cursor-pointer",
                          dbPoolFilter === 'D' ? "bg-violet-600 text-white shadow-sm" : "text-black/40 hover:text-black/60"
                        )}
                      >
                        Doğukan (D)
                      </button>
                    </div>
                  </div>

                  {/* Search bar inside DB tab */}
                  <div className="relative h-10">
                    <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-black/35" />
                    <input
                      type="text"
                      placeholder="Kumaş kodu, barkod veya özel tanım ara..."
                      value={dbSearchQuery}
                      onChange={(e) => setDbSearchQuery(e.target.value)}
                      className="w-full h-full bg-[#F5F5F0] border-none rounded-xl pl-10 pr-4 font-bold text-[11px] text-black outline-none placeholder:text-black/30"
                    />
                  </div>

                  {/* DB Listing Table */}
                  <div className="border border-black/5 rounded-2xl overflow-hidden shadow-sm">
                    <table className="w-full text-left text-xs">
                      <thead>
                        <tr className="bg-[#F5F5F0] border-b border-black/5 text-black/50 font-extrabold text-[9px] uppercase tracking-widest">
                          <th className="py-3.5 px-4 w-20 text-center">HAVUZ</th>
                          <th className="py-3.5 px-4">KUMAŞ KODU</th>
                          <th className="py-3.5 px-4 font-black">ÖZEL TANIM / AÇIKLAMA</th>
                          <th className="py-3.5 px-4 w-28 text-center">EN GENİŞLİĞİ</th>
                          <th className="py-3.5 px-4">BARKOD</th>
                          <th className="py-3.5 px-4 text-right">İŞLEM</th>
                        </tr>
                      </thead>
                      <tbody className="font-bold divide-y divide-black/5">
                        {filteredDatabase.length === 0 ? (
                          <tr>
                            <td colSpan={6} className="py-12 text-center text-black/35 font-medium italic">
                              Henüz tanımlı kumaş verisi yok.
                            </td>
                          </tr>
                        ) : (
                          filteredDatabase.map((fab) => {
                            const isB = fab.pool === 'B';
                            return (
                              <tr key={`${fab.fabricCode}__${fab.pool}`} className="hover:bg-neutral-50/50">
                                <td className="py-3.5 px-4 text-center">
                                  <span className={cn(
                                    "px-2 py-0.5 rounded text-[10px] font-black leading-none",
                                    isB ? "bg-cyan-100 text-cyan-800" : "bg-violet-100 text-violet-800"
                                  )}>
                                    H-{fab.pool}
                                  </span>
                                </td>
                                <td className="py-3.5 px-4 uppercase font-black text-black">{fab.fabricCode}</td>
                                <td className="py-3.5 px-4 text-neutral-800 font-extrabold text-xs">
                                  {fab.fabricName || <span className="opacity-30 font-medium italic">Standart Kumaş</span>}
                                </td>
                                <td className="py-3.5 px-4 text-center">
                                  <span className="font-mono text-xs bg-neutral-100 px-2 py-1 rounded text-black font-black">
                                    {fab.width} cm
                                  </span>
                                </td>
                                <td className="py-3.5 px-4 font-mono text-black/60">
                                  {fab.barcode || <span className="text-red-500 italic text-[11px] font-sans">Eksik</span>}
                                </td>
                                <td className="py-3.5 px-4 text-right">
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteFabric(fab.fabricCode, fab.pool)}
                                    className="p-1 px-2 text-black/40 hover:text-red-600 rounded-lg hover:bg-red-50 transition-colors inline-flex cursor-pointer"
                                    title="Kaydı sil"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

              </div>
            </>
          ) : (
            <UnifiedLibrary
              orders={orders}
              savedFabrics={savedFabrics}
              unifiedFabrics={unifiedFabrics}
              setUnifiedFabrics={handleSetUnifiedFabricsWithBackwardSync}
              calculateSingleOrder={calculateSingleOrder}
            />
          )}

        </div>
      </div>

    </div>
  );
};
