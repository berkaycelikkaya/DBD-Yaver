import React, { useState, useMemo, useRef } from 'react';
import { 
  Barcode, 
  Plus, 
  Trash2, 
  Edit2, 
  Search, 
  Camera, 
  AlertCircle, 
  CheckCircle2, 
  Database,
  RefreshCw,
  Sparkles,
  Layers,
  Upload,
  UserCheck,
  Percent,
  Check,
  Save,
  FileSpreadsheet
} from 'lucide-react';
import { cn } from '../lib/utils';

export interface UnifiedFabric {
  barcode: string;
  fabricName: string;
  berkayCode: string; // optional code from Berkay's pool
  dogukanCode: string; // optional code from Doğukan's pool
  stock: number; // in meters limit
  imageUrl?: string; // base64 string
}

export interface Order {
  id: string;
  orderId: string;
  customerName: string;
  fabricCode: string;
  lineDirection: string;
  extraInfo: string;
  dimensions: string;
  pool?: 'B' | 'D' | string | null;
}

export interface FabricDefinition {
  fabricCode: string;
  pool: 'B' | 'D';
  width: number;
  barcode: string;
  fabricName?: string;
}

interface UnifiedLibraryProps {
  orders: Order[];
  savedFabrics: FabricDefinition[];
  unifiedFabrics: UnifiedFabric[];
  setUnifiedFabrics: React.Dispatch<React.SetStateAction<UnifiedFabric[]>>;
  calculateSingleOrder: (order: Order, fWidth: number) => number;
}

// Compress and resize images to stay well within localStorage quota
export function resizeImage(base64Str: string, maxWidth = 300, maxHeight = 300): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.src = base64Str;
    img.onload = () => {
      const canvas = document.createElement('canvas');
      let width = img.width;
      let height = img.height;
      if (width > height) {
        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        }
      } else {
        if (height > maxHeight) {
          width = Math.round((width * maxHeight) / height);
          height = maxHeight;
        }
      }
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', 0.85)); // 85% compression quality
      } else {
        resolve(base64Str);
      }
    };
    img.onerror = () => resolve(base64Str);
  });
}

// 12-Digit EAN-like Barcode generator starting with 868 prefix (highly professional)
export function generateEşsizBarkod(existing: string[]): string {
  let attempts = 0;
  while (attempts < 100) {
    const rawDigits = Array.from({ length: 9 }, () => Math.floor(Math.random() * 10)).join('');
    const cand = `868${rawDigits}`;
    if (!existing.includes(cand)) {
      return cand;
    }
    attempts++;
  }
  return `868` + Date.now().toString().slice(-9);
}

export const UnifiedLibrary: React.FC<UnifiedLibraryProps> = ({
  orders,
  savedFabrics,
  unifiedFabrics,
  setUnifiedFabrics,
  calculateSingleOrder
}) => {
  const [dbSearchQuery, setDbSearchQuery] = useState('');
  const [formError, setFormError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Form State
  const [editMode, setEditMode] = useState<string | null>(null); // contains barcode if editing
  const [barcodeVal, setBarcodeVal] = useState('');
  const [nameVal, setNameVal] = useState('');
  const [berkayCodeVal, setBerkayCodeVal] = useState('');
  const [dogukanCodeVal, setDogukanCodeVal] = useState('');
  const [stockVal, setStockVal] = useState<number>(0);
  const [imagePreview, setImagePreview] = useState<string>('');
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragActive, setDragActive] = useState(false);

  // Helper: Find fabric widths
  const getWidthByCode = (code: string, pool: 'B' | 'D') => {
    const fab = savedFabrics.find(f => f.fabricCode.toUpperCase() === code.toUpperCase() && f.pool === pool);
    return fab ? fab.width : 140;
  };

  // Memoized: Calculate total required meters for each unified fabric
  const fabricRequirements = useMemo(() => {
    const reqs: { [barcode: string]: number } = {};

    unifiedFabrics.forEach(uf => {
      let total = 0;
      orders.forEach(order => {
        const orderCode = order.fabricCode.trim().toUpperCase();
        const orderPool = (order.pool && order.pool.toUpperCase() === 'D') ? 'D' : 'B';

        const isMatchByBerkay = uf.berkayCode && orderPool === 'B' && orderCode === uf.berkayCode.toUpperCase();
        const isMatchByDogukan = uf.dogukanCode && orderPool === 'D' && orderCode === uf.dogukanCode.toUpperCase();

        if (isMatchByBerkay) {
          const width = getWidthByCode(uf.berkayCode, 'B');
          total += calculateSingleOrder(order, width);
        } else if (isMatchByDogukan) {
          const width = getWidthByCode(uf.dogukanCode, 'D');
          total += calculateSingleOrder(order, width);
        }
      });
      reqs[uf.barcode] = total;
    });

    return reqs;
  }, [orders, savedFabrics, unifiedFabrics, calculateSingleOrder]);

  // Image upload processor
  const handleImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      const base64 = event.target?.result as string;
      if (base64) {
        const compressed = await resizeImage(base64);
        setImagePreview(compressed);
      }
    };
    reader.readAsDataURL(file);
  };

  // Drag over handler
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  // Drag and drop image file processor
  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = async (event) => {
        const base64 = event.target?.result as string;
        if (base64) {
          const compressed = await resizeImage(base64);
          setImagePreview(compressed);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  // Generate a random unique barcode
  const handleGenerateBarcodeInForm = () => {
    const existing = unifiedFabrics.map(f => f.barcode);
    const code = generateEşsizBarkod(existing);
    setBarcodeVal(code);
  };

  // Add / Save unified fabric definition
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    setSuccessMsg('');

    const cleanBarcode = barcodeVal.trim();
    const cleanName = nameVal.trim();

    if (!cleanBarcode) {
      setFormError('Lütfen eşsiz bir barkod girin veya otomatik üretin.');
      return;
    }
    if (!cleanName) {
      setFormError('Lütfen kumaş adını giriniz.');
      return;
    }

    if (editMode) {
      // Edit logic
      setUnifiedFabrics(prev => prev.map(uf => {
        if (uf.barcode === editMode) {
          return {
            barcode: cleanBarcode,
            fabricName: cleanName,
            berkayCode: berkayCodeVal.trim(),
            dogukanCode: dogukanCodeVal.trim(),
            stock: stockVal || 0,
            imageUrl: imagePreview || uf.imageUrl
          };
        }
        return uf;
      }));
      setSuccessMsg('Kumaş kartı başarıyla güncellendi.');
      resetForm();
    } else {
      // Add logic
      const exists = unifiedFabrics.some(f => f.barcode === cleanBarcode);
      if (exists) {
        setFormError('Bu barkod kodu daha önce sisteme kaydedilmiş.');
        return;
      }

      setUnifiedFabrics(prev => [...prev, {
        barcode: cleanBarcode,
        fabricName: cleanName,
        berkayCode: berkayCodeVal.trim(),
        dogukanCode: dogukanCodeVal.trim(),
        stock: stockVal || 0,
        imageUrl: imagePreview || undefined
      }]);

      setSuccessMsg('Yeni ana kumaş başarıyla kütüphaneye eklendi.');
      resetForm();
    }
  };

  const resetForm = () => {
    setEditMode(null);
    setBarcodeVal('');
    setNameVal('');
    setBerkayCodeVal('');
    setDogukanCodeVal('');
    setStockVal(0);
    setImagePreview('');
  };

  const handleEdit = (uf: UnifiedFabric) => {
    setEditMode(uf.barcode);
    setBarcodeVal(uf.barcode);
    setNameVal(uf.fabricName);
    setBerkayCodeVal(uf.berkayCode || '');
    setDogukanCodeVal(uf.dogukanCode || '');
    setStockVal(uf.stock);
    setImagePreview(uf.imageUrl || '');
  };

  const handleDelete = (barcode: string, name: string) => {
    if (window.confirm(`"${name}" (Barkod: ${barcode}) ana kumaşı kütüphaneden silmek istediğinize emin misiniz?`)) {
      setUnifiedFabrics(prev => prev.filter(f => f.barcode !== barcode));
      if (editMode === barcode) {
        resetForm();
      }
    }
  };

  // Filter listings
  const filteredFabrics = useMemo(() => {
    let list = unifiedFabrics;
    if (dbSearchQuery.trim()) {
      const q = dbSearchQuery.toLowerCase().trim();
      list = list.filter(f => 
        f.fabricName.toLowerCase().includes(q) ||
        f.barcode.includes(q) ||
        f.berkayCode.toLowerCase().includes(q) ||
        f.dogukanCode.toLowerCase().includes(q)
      );
    }
    return list.sort((a, b) => a.fabricName.localeCompare(b.fabricName));
  }, [unifiedFabrics, dbSearchQuery]);

  // Inline stock modifier updates immediately on blur/enter without reload
  const handleInlineStockUpdate = (barcode: string, val: number) => {
    setUnifiedFabrics(prev => prev.map(f => {
      if (f.barcode === barcode) {
        return { ...f, stock: Math.max(0, val) };
      }
      return f;
    }));
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
      
      {/* 1. Register & Edit Card (Left) */}
      <div className="bg-white rounded-[2rem] p-6 border border-black/5 shadow-sm space-y-4">
        <div className="flex items-center gap-2">
          <Layers className="w-5 h-5 text-black" />
          <h3 className="font-extrabold text-sm uppercase text-black leading-none">
            {editMode ? 'Kumaş Kaydını Düzenle' : 'Kütüphaneye Kumaş Ekle'}
          </h3>
        </div>
        <p className="text-xs text-black/40 leading-relaxed">
          Stok yönetimi ve iki havuzun ortak takibi için buraya kumaş tanımlayabilirsiniz.
        </p>

        {successMsg && (
          <div className="p-3 bg-emerald-50 text-emerald-800 text-xs font-semibold rounded-xl border border-emerald-200 flex items-center gap-1.5 animate-fadeIn">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{successMsg}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          
          {/* Draggable photo uploader */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-extrabold text-black/50 uppercase tracking-wider">KUMAŞ GÖRSELİ / DESEN FOTOĞRAFI</label>
            <div 
              onDragEnter={handleDrag}
              onDragOver={handleDrag}
              onDragLeave={handleDrag}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={cn(
                "border-2 border-dashed rounded-2xl h-40 flex flex-col items-center justify-center gap-2 cursor-pointer transition-all relative overflow-hidden bg-[#F5F5F0]/50 hover:bg-[#F5F5F0] hover:border-black/20",
                dragActive ? "border-black bg-[#F5F5F0]" : "border-black/5",
                imagePreview ? "border-solid bg-neutral-900" : ""
              )}
            >
              <input 
                type="file" 
                ref={fileInputRef}
                onChange={handleImageChange}
                accept="image/*"
                className="hidden" 
              />
              
              {imagePreview ? (
                <>
                  <img src={imagePreview} alt="Kumaş Önizleme" className="w-full h-full object-cover opacity-80" />
                  <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity">
                    <span className="text-white text-[11px] font-black uppercase flex items-center gap-1">
                      <Camera className="w-3.5 h-3.5" /> Değiştir
                    </span>
                  </div>
                </>
              ) : (
                <div className="text-center p-4">
                  <div className="w-10 h-10 bg-black/5 rounded-full flex items-center justify-center mx-auto mb-2">
                    <Upload className="w-5 h-5 text-black/50" />
                  </div>
                  <p className="text-xs font-black text-black leading-none">Fotoğraf Sürükle veya Seç</p>
                  <p className="text-[10px] text-black/40 mt-1">Telefon kamerası veya lokal görsel</p>
                </div>
              )}
            </div>
            {imagePreview && (
              <button 
                type="button" 
                onClick={() => setImagePreview('')}
                className="text-[10px] font-bold text-red-600 hover:underline flex items-center gap-0.5 cursor-pointer"
              >
                Görseli Kaldır
              </button>
            )}
          </div>

          {/* Unique Barcode Input */}
          <div className="space-y-1">
            <label className="text-[10px] font-extrabold text-black/50 uppercase tracking-wider">EŞSİZ BARKOD *</label>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Örn: 868000100011"
                value={barcodeVal}
                onChange={(e) => setBarcodeVal(e.target.value)}
                className="flex-1 h-10 bg-[#F5F5F0] border-none rounded-xl px-3.5 font-mono font-bold text-xs outline-none focus:ring-1 focus:ring-black/20 leading-none"
                required
              />
              <button
                type="button"
                onClick={handleGenerateBarcodeInForm}
                className="bg-black hover:bg-neutral-900 text-white font-extrabold text-xs px-3 rounded-xl flex items-center gap-1 cursor-pointer transition-all active:scale-95 whitespace-nowrap h-10 shadow-sm"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>Eşsiz Üret</span>
              </button>
            </div>
          </div>

          {/* Fabric Name */}
          <div className="space-y-1">
            <label className="text-[10px] font-extrabold text-black/50 uppercase tracking-wider">ANA KUMAŞ ADI *</label>
            <input
              type="text"
              placeholder="Örn: Gri Buldan Keten Premium"
              value={nameVal}
              onChange={(e) => setNameVal(e.target.value)}
              className="w-full h-10 bg-[#F5F5F0] border-none rounded-xl px-3.5 font-bold text-xs outline-none focus:ring-1 focus:ring-black/20 leading-none"
              required
            />
          </div>

          {/* Stock in meters */}
          <div className="space-y-1">
            <label className="text-[10px] font-extrabold text-black/50 uppercase tracking-wider">DEPO MEVCUT STOK (METRE)</label>
            <div className="relative">
              <input
                type="number"
                step="0.1"
                placeholder="0.0"
                value={stockVal || ''}
                onChange={(e) => setStockVal(parseFloat(e.target.value) || 0)}
                className="w-full h-10 bg-[#F5F5F0] border-none rounded-xl px-3.5 font-black text-xs outline-none focus:ring-1 focus:ring-black/20 leading-none"
              />
              <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[10px] font-black text-black/40">METRE</span>
            </div>
          </div>

          {/* Coding mapping boxes (without warnings, fully optional) */}
          <div className="grid grid-cols-2 gap-3 pt-1">
            <div className="space-y-1">
              <label className="text-[9px] font-black text-cyan-700 uppercase tracking-wider">BERKAY KATALOG KODU</label>
              <input
                type="text"
                placeholder="Boş bırakılabilir"
                value={berkayCodeVal}
                onChange={(e) => setBerkayCodeVal(e.target.value)}
                className="w-full h-10 bg-[#F5F5F0] border border-cyan-500/10 rounded-xl px-3 font-bold text-xs uppercase outline-none focus:border-cyan-500/30 text-cyan-950 leading-none"
              />
            </div>
            
            <div className="space-y-1">
              <label className="text-[9px] font-black text-violet-700 uppercase tracking-wider">DOĞUKAN KATALOG KODU</label>
              <input
                type="text"
                placeholder="Boş bırakılabilir"
                value={dogukanCodeVal}
                onChange={(e) => setDogukanCodeVal(e.target.value)}
                className="w-full h-10 bg-[#F5F5F0] border border-violet-500/10 rounded-xl px-3 font-bold text-xs uppercase outline-none focus:border-violet-500/30 text-violet-950 leading-none"
              />
            </div>
          </div>

          {formError && (
            <div className="p-3 bg-red-50 text-red-700 text-xs font-bold rounded-xl border border-red-200 flex items-center gap-1.5 animate-pulse">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{formError}</span>
            </div>
          )}

          <div className="flex gap-2 pt-2">
            <button
              type="submit"
              className="flex-1 h-11 bg-black hover:bg-neutral-900 text-white font-extrabold text-xs rounded-xl shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-95"
            >
              <Save className="w-4 h-4" />
              <span>{editMode ? 'Kartı Güncelle' : 'Kütüphaneye Kaydet'}</span>
            </button>
            {editMode && (
              <button
                type="button"
                onClick={resetForm}
                className="h-11 bg-[#F5F5F0] hover:bg-neutral-200 text-black font-extrabold text-xs px-4 rounded-xl cursor-pointer transition-all"
              >
                Vazgeç
              </button>
            )}
          </div>
        </form>
      </div>

      {/* 2. Registered unified list table (Right, taking up 2 cols) */}
      <div className="bg-white rounded-[2rem] p-6 border border-black/5 shadow-sm space-y-4 lg:col-span-2">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <Database className="w-5 h-5 text-black" />
            <h3 className="font-extrabold text-sm uppercase text-black leading-none">Ana Kumaş Kütüphanesi</h3>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-black leading-none bg-black/5 text-black/50">
              {unifiedFabrics.length} Kart
            </span>
          </div>
        </div>

        {/* Local Search */}
        <div className="relative h-11">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-black/35" />
          <input
            type="text"
            placeholder="Kumaş adı, barkod veya havuz kodlarına göre filtrele..."
            value={dbSearchQuery}
            onChange={(e) => setDbSearchQuery(e.target.value)}
            className="w-full h-full bg-[#F5F5F0] border-none rounded-2xl pl-11 pr-4 font-bold text-xs text-black outline-none placeholder:text-black/30 placeholder:font-medium focus:bg-[#EAEAE2]"
          />
        </div>

        {/* Main List Rendering */}
        <div className="border border-black/5 rounded-2xl overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs min-w-[850px]">
              <thead>
                <tr className="bg-[#F5F5F0] border-b border-black/5 text-black/50 font-extrabold text-[9px] uppercase tracking-widest">
                  <th className="py-3 px-4 w-14 text-center">GÖRSEL</th>
                  <th className="py-3 px-4 min-w-[180px]">KUMAŞ ADI & BARKOD</th>
                  <th className="py-3 px-4 min-w-[150px]">HAVUZ EŞLEŞMELERİ</th>
                  <th className="py-3 px-4 text-center min-w-[100px]">GEREKSİNİM</th>
                  <th className="py-3 px-4 text-center min-w-[180px] w-[200px]">STOK MEVCUT</th>
                  <th className="py-3 px-4 text-center min-w-[120px]">STOK DURUMU</th>
                  <th className="py-3 px-4 text-right min-w-[90px]">İŞLEMLER</th>
                </tr>
              </thead>
              <tbody className="font-bold divide-y divide-black/5">
                {filteredFabrics.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-black/35 font-medium italic">
                      Tanımlı ana kumaş kütüphanesi görünümü boş. Sol panelden yeni kayıt oluşturabilirsiniz.
                    </td>
                  </tr>
                ) : (
                  filteredFabrics.map((uf) => {
                    const reqMeters = fabricRequirements[uf.barcode] || 0;
                    const stockLevel = uf.stock || 0;
                    const diff = stockLevel - reqMeters;
                    const isSufficient = diff >= 0;

                    return (
                      <tr key={uf.barcode} className="hover:bg-neutral-50/50 transition-colors">
                        
                        {/* Thumbnail Image display */}
                        <td className="py-3 px-4 text-center">
                          <div className="w-10 h-10 rounded-xl bg-[#F5F5F0] border border-black/5 overflow-hidden flex items-center justify-center shadow-inner group relative">
                            {uf.imageUrl ? (
                              <img src={uf.imageUrl} alt={uf.fabricName} className="w-full h-full object-cover" />
                            ) : (
                              <Layers className="w-4 h-4 opacity-25" />
                            )}
                          </div>
                        </td>

                        {/* Name and Barcode */}
                        <td className="py-3 px-4">
                          <div className="flex flex-col">
                            <span className="text-black text-sm font-black tracking-tight leading-snug">{uf.fabricName}</span>
                            <span className="text-[10px] font-mono text-black/40 font-bold mt-0.5 tracking-tight flex items-center gap-1">
                              <Barcode className="w-3 h-3 opacity-40 shrink-0" />
                              {uf.barcode}
                            </span>
                          </div>
                        </td>

                        {/* Havuz Eşleşmeleri */}
                        <td className="py-3 px-4">
                          <div className="flex flex-col gap-1">
                            {uf.berkayCode ? (
                              <div className="flex items-center gap-1">
                                <span className="bg-cyan-50 text-cyan-800 text-[9px] font-black px-1.5 py-0.5 rounded leading-none">B</span>
                                <span className="text-[11px] font-bold text-cyan-950 uppercase">{uf.berkayCode}</span>
                              </div>
                            ) : null}
                            {uf.dogukanCode ? (
                              <div className="flex items-center gap-1">
                                <span className="bg-violet-50 text-violet-800 text-[9px] font-black px-1.5 py-0.5 rounded leading-none">D</span>
                                <span className="text-[11px] font-bold text-violet-950 uppercase">{uf.dogukanCode}</span>
                              </div>
                            ) : null}
                            {!uf.berkayCode && !uf.dogukanCode ? (
                              <span className="text-[10px] text-black/30 font-medium italic">Bağlantı Yok</span>
                            ) : null}
                          </div>
                        </td>

                        {/* Calculated Requirement */}
                        <td className="py-3 px-4 text-center">
                          <span className="text-xs bg-neutral-100 px-2.5 py-1.5 rounded-xl block text-center font-black text-black">
                            {reqMeters.toFixed(2)} m
                          </span>
                        </td>

                        {/* Live inline Stock adjustment input with stepper */}
                        <td className="py-3 px-4 text-center">
                          <div className="flex items-center justify-between border border-black/5 rounded-xl bg-[#F5F5F0] hover:bg-[#EAEAE2] transition-all h-10 px-1 w-full max-w-[160px] mx-auto shadow-sm">
                            <button
                              type="button"
                              onClick={() => handleInlineStockUpdate(uf.barcode, Number((Math.max(0, stockLevel - 1)).toFixed(1)))}
                              className="w-7 h-7 rounded-lg bg-white hover:bg-neutral-100 text-black font-extrabold flex items-center justify-center shrink-0 border border-black/5 transition-all text-xs active:scale-90 shadow-sm"
                              title="1 Metre Çıkar"
                            >
                              -
                            </button>
                            
                            <div className="flex-1 flex items-center justify-center min-w-0 px-1">
                              <input 
                                type="number" 
                                step="0.1"
                                value={stockLevel}
                                onFocus={(e) => e.target.select()}
                                onChange={(e) => handleInlineStockUpdate(uf.barcode, parseFloat(e.target.value) || 0)}
                                className="w-full bg-transparent border-none text-xs font-black text-center outline-none shrink select-all p-0"
                              />
                              <span className="text-[9px] font-black text-black/30 select-none ml-0.5 shrink-0">M</span>
                            </div>

                            <button
                              type="button"
                              onClick={() => handleInlineStockUpdate(uf.barcode, Number((stockLevel + 1).toFixed(1)))}
                              className="w-7 h-7 rounded-lg bg-white hover:bg-neutral-100 text-black font-extrabold flex items-center justify-center shrink-0 border border-black/5 transition-all text-xs active:scale-90 shadow-sm"
                              title="1 Metre Ekle"
                            >
                              +
                            </button>
                          </div>
                        </td>

                        {/* Status tag */}
                        <td className="py-3 px-4 text-center">
                          {isSufficient ? (
                            <div className="inline-flex flex-col items-center">
                              <span className="bg-emerald-50 text-emerald-800 text-[10px] font-black px-2.5 py-1 rounded-full border border-emerald-100">
                                Stok Yeterli
                              </span>
                              <span className="text-[9px] font-bold text-emerald-600/70 mt-1 leading-none">+{diff.toFixed(1)} m fazla</span>
                            </div>
                          ) : (
                            <div className="inline-flex flex-col items-center">
                              <span className="bg-red-50 text-red-800 text-[10px] font-black px-2.5 py-1 rounded-full border border-red-100 animate-pulse">
                                Yetmiyor
                              </span>
                              <span className="text-[9px] font-black text-red-600 mt-1 leading-none">-{Math.abs(diff).toFixed(1)} m eksik</span>
                            </div>
                          )}
                        </td>

                        {/* Actions */}
                        <td className="py-3 px-4 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              type="button"
                              onClick={() => handleEdit(uf)}
                              className="p-2 text-black/40 hover:text-black hover:bg-neutral-100 rounded-lg transition-colors inline-flex cursor-pointer"
                              title="Kartı Düzenle"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDelete(uf.barcode, uf.fabricName)}
                              className="p-2 text-black/40 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors inline-flex cursor-pointer"
                              title="Kaydı sil"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>

                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Sync helpful information card */}
        <div className="p-4 bg-black/5 rounded-[1.5rem] flex items-start gap-3 mt-4">
          <AlertCircle className="w-4.5 h-4.5 text-black/60 shrink-0 mt-0.5" />
          <p className="text-[11px] text-black/60 leading-relaxed font-semibold">
            Ana Kumaş Kütüphanesi barkod üzerinden çalışır. Metraj Analizi veya Kumaş Kütüphanesi sekmesinden bir kumaşın barkod numarasını buradaki bir ana kumaşın eşsiz barkodu ile aynı yaptığınızda, o kumaşın ihtiyaç metrajları otomatik olarak bu ana kumaşla tek satırda birleşecek ve stok takibi başlayacaktır.
          </p>
        </div>

      </div>

    </div>
  );
};
