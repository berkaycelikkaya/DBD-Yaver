import React, { useState, useMemo } from 'react';
import { 
  Truck, 
  Search, 
  Check, 
  CheckCircle2, 
  Printer, 
  Download, 
  Layers, 
  Info,
  Calendar,
  AlertCircle,
  Clock,
  ChevronRight,
  RefreshCw,
  SlidersHorizontal,
  FileText,
  Menu
} from 'lucide-react';
import { cn } from '../lib/utils';
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
  status?: 'Bekleme' | 'Kuyrukta' | 'Üretimde' | 'Paketlendi' | 'Üretilemiyor' | 'Acil';
  createdAt?: string;
  pool?: 'B' | 'D' | string | null;
  supplySpongeTaken?: boolean;
  supplyCoverTaken?: boolean;
}

interface SupplyPanelProps {
  orders: Order[];
  setOrders: React.Dispatch<React.SetStateAction<Order[]>>;
  triggerToast: (message: string, type?: 'success' | 'info' | 'error') => void;
  onOpenMenu?: () => void;
}

export function SupplyPanel({ orders, setOrders, triggerToast, onOpenMenu }: SupplyPanelProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [poolFilter, setPoolFilter] = useState<'ALL' | 'B' | 'D'>('ALL');
  const [spongeFilter, setSpongeFilter] = useState<'ALL' | 'SPONGE_ONLY' | 'BUTTON_ONLY' | 'OTHER'>('ALL');
  
  // Tab within Supply Panel: 'checklist' (Sevkiyat ve Teslim Alım), 'sponges' (Sünger Sipariş Kontrolü)
  const [activeSubTab, setActiveSubTab] = useState<'checklist' | 'sponges'>('checklist');

  // Interactive guide visibility persisted in localStorage
  const [showGuide, setShowGuide] = useState(() => {
    return localStorage.getItem('yaver_supply_guide_visible') !== 'false';
  });

  const toggleGuide = () => {
    const nextValue = !showGuide;
    setShowGuide(nextValue);
    localStorage.setItem('yaver_supply_guide_visible', String(nextValue));
  };

  // Filter orders that are in production ('Üretimde') stage
  const productionOrders = useMemo(() => {
    return orders.filter(o => o.status === 'Üretimde');
  }, [orders]);

  // Helper function to check if an order requires a sponge
  const isOrderSpongeNeeded = (order: Order) => {
    const extraLower = (order.extraInfo || '').trim().toLowerCase();
    return (extraLower.includes('süngerli') || extraLower.includes('sünger')) && !extraLower.includes('süngersiz');
  };

  // Helper function to check if an order requires buttons (düğmeli)
  const isOrderButtonNeeded = (order: Order) => {
    const extraLower = (order.extraInfo || '').trim().toLowerCase();
    const fabricLower = (order.fabricCode || '').trim().toLowerCase();
    return (
      extraLower.includes('düğme') || 
      extraLower.includes('düğmeli') || 
      extraLower.includes('dumeli') || 
      extraLower.includes('dugmeli') ||
      fabricLower.includes('düğme') ||
      fabricLower.includes('düğmeli') ||
      fabricLower.includes('dumeli') ||
      fabricLower.includes('dugmeli')
    );
  };

  // Process and filter orders according to search & UI filters
  const filteredOrders = useMemo(() => {
    return productionOrders.filter(order => {
      // 1. Search term match
      const query = searchTerm.toLowerCase();
      const matchesSearch = 
        order.customerName.toLowerCase().includes(query) ||
        order.orderId.toLowerCase().includes(query) ||
        order.fabricCode.toLowerCase().includes(query) ||
        order.dimensions.toLowerCase().includes(query);

      if (!matchesSearch) return false;

      // 2. Pool filter
      if (poolFilter !== 'ALL' && order.pool !== poolFilter) return false;

      // 3. Category filter
      const hasSponge = isOrderSpongeNeeded(order);
      const hasButtons = isOrderButtonNeeded(order);

      if (spongeFilter === 'SPONGE_ONLY' && !hasSponge) return false;
      if (spongeFilter === 'BUTTON_ONLY' && !hasButtons) return false;
      if (spongeFilter === 'OTHER' && (hasSponge || hasButtons)) return false;

      return true;
    });
  }, [productionOrders, searchTerm, poolFilter, spongeFilter]);

  // Parse order dimensions into en, boy, thickness
  const parseDimensions = (dimStr: string) => {
    const cleaned = dimStr.replace(/,/g, '.');
    const parts = cleaned.split(/[xX*\/]/).map(p => parseFloat(p.trim()));
    return {
      width: parts[0] || 0,
      height: parts[1] || 0,
      thickness: parts[2] || 0
    };
  };

  // Toggle checklist values for a specific order
  const handleToggleCheck = (orderId: string, field: 'supplySpongeTaken' | 'supplyCoverTaken') => {
    setOrders(prev => {
      const updated = prev.map(o => {
        if (o.id === orderId) {
          const updatedOrder = { ...o, [field]: !o[field] };
          
          // Automatically transition to 'Paketlendi' (Packaged) if both are complete
          // If the order doesn't require sponge, cover alone is enough!
          const needsSponge = isOrderSpongeNeeded(updatedOrder);
          const spongeOk = !needsSponge || updatedOrder.supplySpongeTaken;
          const coverOk = updatedOrder.supplyCoverTaken;

          if (spongeOk && coverOk) {
            updatedOrder.status = 'Paketlendi';
            // We'll notify using triggerToast outside
          }
          return updatedOrder;
        }
        return o;
      });
      
      // Save updated active orders back to local storage
      localStorage.setItem('yaver_active_orders', JSON.stringify(updated));
      return updated;
    });
  };

  // Fast direct delivery action
  const handleDeliverProduct = (orderId: string) => {
    setOrders(prev => {
      const updated = prev.map(o => {
        if (o.id === orderId) {
          const updatedOrder = { 
            ...o, 
            supplyCoverTaken: true, 
            supplySpongeTaken: isOrderSpongeNeeded(o) ? true : o.supplySpongeTaken,
            status: 'Paketlendi' as const
          };
          return updatedOrder;
        }
        return o;
      });
      localStorage.setItem('yaver_active_orders', JSON.stringify(updated));
      return updated;
    });
    triggerToast('Ürün başarıyla teslim alındı ve Paketlendi aşamasına gönderildi.', 'success');
  };

  // Bulk delivery action for all currently filtered items
  const handleBulkDeliverAll = () => {
    if (filteredOrders.length === 0) return;
    
    setOrders(prev => {
      const updated = prev.map(o => {
        const isCurrentlyFiltered = filteredOrders.some(fo => fo.id === o.id);
        if (isCurrentlyFiltered) {
          const updatedOrder = { 
            ...o, 
            supplyCoverTaken: true, 
            supplySpongeTaken: isOrderSpongeNeeded(o) ? true : o.supplySpongeTaken,
            status: 'Paketlendi' as const
          };
          return updatedOrder;
        }
        return o;
      });
      localStorage.setItem('yaver_active_orders', JSON.stringify(updated));
      return updated;
    });
    triggerToast(`${filteredOrders.length} sipariş toplu teslim alındı ve paketlendi.`, 'success');
  };

  // Generate a beautiful collection/shipment check PDF list
  const generateCollectionPDF = () => {
    if (filteredOrders.length === 0) {
      triggerToast('Yazdırılacak uygun sipariş bulunamadı.', 'error');
      return;
    }

    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4'
    });

    // Main Styling Colors
    const primaryColor = [17, 24, 39]; // Gray 900
    const accentColor = [79, 70, 229]; // Indigo 600

    // Header Title
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(18);
    doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
    doc.text('YAVER TEDARIKCI SEVKIYAT VE TESLIM ALIM FORMU', 15, 20);

    // Subtitle
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(100, 100, 100);
    const dateStr = new Date().toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    doc.text(`Tarih: ${dateStr} | Toplam Sipariş: ${filteredOrders.length} adet`, 15, 26);

    // Separator Line
    doc.setDrawColor(220, 220, 220);
    doc.setLineWidth(0.5);
    doc.line(15, 30, 195, 30);

    // AutoTable rows
    const tableRows = filteredOrders.map((order, idx) => {
      const needsSponge = isOrderSpongeNeeded(order);
      const { width, height, thickness } = parseDimensions(order.dimensions);
      
      const spongeDetails = needsSponge 
        ? `${thickness} cm (${width}x${height})` 
        : 'Süngersiz';

      return [
        (idx + 1).toString(),
        order.orderId,
        order.customerName,
        order.fabricCode,
        order.pool || '-',
        spongeDetails,
        order.supplySpongeTaken ? '[ X ] ALINDI' : needsSponge ? '[   ] Bekliyor' : 'Yok',
        order.supplyCoverTaken ? '[ X ] ALINDI' : '[   ] Bekliyor'
      ];
    });

    autoTable(doc, {
      startY: 35,
      head: [['No', 'Sipariş No', 'Müşteri Adı', 'Kumaş Kodu', 'Havuz', 'Sünger Bilgisi', 'Sünger Teslim', 'Kılıf Teslim']],
      body: tableRows,
      theme: 'grid',
      headStyles: {
        fillColor: [31, 41, 55],
        textColor: [255, 255, 255],
        fontSize: 9,
        fontStyle: 'bold',
        halign: 'center'
      },
      bodyStyles: {
        fontSize: 8.5,
        textColor: [50, 50, 50]
      },
      columnStyles: {
        0: { cellWidth: 10, halign: 'center' },
        1: { cellWidth: 20, halign: 'center', fontStyle: 'bold' },
        2: { cellWidth: 35 },
        3: { cellWidth: 25, halign: 'center' },
        4: { cellWidth: 12, halign: 'center' },
        5: { cellWidth: 35, halign: 'center' },
        6: { cellWidth: 25, halign: 'center' },
        7: { cellWidth: 25, halign: 'center' }
      },
      margin: { left: 15, right: 15 }
    });

    // Add signature box at the bottom
    const finalY = (doc as any).lastAutoTable.finalY + 20;
    if (finalY < 250) {
      doc.setFontSize(9);
      doc.setFont('helvetica', 'bold');
      doc.text('Teslim Eden (Atölye / Üretici)', 25, finalY);
      doc.text('Teslim Alan (Tedarikçi)', 130, finalY);
      
      doc.setDrawColor(200, 200, 200);
      doc.line(25, finalY + 15, 75, finalY + 15);
      doc.line(130, finalY + 15, 180, finalY + 15);
    }

    doc.save(`Tedarik_Teslimat_Checklist_${new Date().toISOString().split('T')[0]}.pdf`);
    triggerToast('Tedarik kontrol formu PDF olarak indirildi.', 'success');
  };

  // Generate a dedicated Sponge layout PDF list specifically for 'Üretimde' orders
  const generateSpongePDF = () => {
    const spongeOrders = filteredOrders.filter(o => isOrderSpongeNeeded(o));
    
    if (spongeOrders.length === 0) {
      triggerToast('Tedarik edilecek süngerli sipariş bulunamadı.', 'error');
      return;
    }

    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4'
    });

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(18);
    doc.setTextColor(31, 41, 55);
    doc.text('YAVER TEDARIKCI SUNGER KESIM VE SIPARIS LISTESI', 15, 20);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(120, 120, 120);
    const dateStr = new Date().toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' });
    doc.text(`Tarih: ${dateStr} | Toplam Süngerli Ürün: ${spongeOrders.length} adet`, 15, 26);

    doc.setDrawColor(220, 220, 220);
    doc.setLineWidth(0.5);
    doc.line(15, 30, 195, 30);

    // Rows
    const tableRows = spongeOrders.map((order, idx) => {
      const { width, height, thickness } = parseDimensions(order.dimensions);
      return [
        (idx + 1).toString(),
        order.orderId,
        order.customerName,
        order.fabricCode,
        `${thickness} cm`,
        `${width} x ${height} cm`,
        order.supplySpongeTaken ? '[ X ] ALINDI' : '[   ] Bekliyor',
        order.extraInfo || '-'
      ];
    });

    autoTable(doc, {
      startY: 35,
      head: [['No', 'Sipariş No', 'Müşteri Adı', 'Kumaş', 'Kalınlık', 'Sünger Ebatı', 'Teslim Durumu', 'Not']],
      body: tableRows,
      theme: 'grid',
      headStyles: {
        fillColor: [5, 150, 105], // Green color
        textColor: [255, 255, 255],
        fontSize: 9,
        fontStyle: 'bold',
        halign: 'center'
      },
      bodyStyles: {
        fontSize: 8.5,
        textColor: [50, 50, 50]
      },
      columnStyles: {
        0: { cellWidth: 10, halign: 'center' },
        1: { cellWidth: 22, halign: 'center', fontStyle: 'bold' },
        2: { cellWidth: 35 },
        3: { cellWidth: 20, halign: 'center' },
        4: { cellWidth: 18, halign: 'center' },
        5: { cellWidth: 30, halign: 'center' },
        6: { cellWidth: 25, halign: 'center' },
        7: { cellWidth: 30 }
      },
      margin: { left: 15, right: 15 }
    });

    doc.save(`Tedarik_Sunger_Kesim_Formu_${new Date().toISOString().split('T')[0]}.pdf`);
    triggerToast('Tedarik sünger kesim/talep listesi PDF olarak indirildi.', 'success');
  };

  return (
    <div className="flex flex-col flex-1 h-full bg-[#F5F5F0] overflow-hidden">
      
      {/* Top Banner / Header of supply panel */}
      <header className="bg-white border-b border-black/5 shrink-0">
        <div className="px-4 py-4 sm:px-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            {onOpenMenu && (
              <button
                onClick={onOpenMenu}
                className="p-2 hover:bg-[#F5F5F0] rounded-xl text-black/60 hover:text-black transition-colors shrink-0 cursor-pointer"
                title="Menüyü Aç"
              >
                <Menu className="w-5 h-5" />
              </button>
            )}
            <div className="w-10 h-10 bg-amber-500 rounded-xl flex items-center justify-center text-white shadow-sm shrink-0">
              <Truck className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-extrabold text-base text-black tracking-tight leading-none">
                Tedarikçi Sevkiyat Kontrol Paneli
              </h2>
              <p className="text-[10px] text-amber-600 font-extrabold tracking-wider mt-1 uppercase">
                DBD Textile
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={generateCollectionPDF}
              className="bg-white hover:bg-neutral-50 border border-black/10 text-black font-extrabold text-[10px] uppercase tracking-widest h-9 px-3 sm:px-4 rounded-xl flex items-center gap-2 transition-all cursor-pointer active:scale-95 shadow-2xs"
            >
              <Printer className="w-3.5 h-3.5 text-black/40" />
              <span>Teslimat Formu PDF</span>
            </button>
            <button
              onClick={generateSpongePDF}
              className="bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-[10px] uppercase tracking-widest h-9 px-3 sm:px-4 rounded-xl flex items-center gap-2 transition-all cursor-pointer active:scale-95 shadow-sm"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Sünger Çıktısı PDF</span>
            </button>
          </div>
        </div>

        {/* Top Segment Controller for Sub-tabs */}
        <div className="px-4 sm:px-6 border-t border-black/5 bg-neutral-50/50 py-1 flex justify-center">
          <div className="flex bg-[#F5F5F0] p-1 rounded-xl w-full max-w-md shrink-0 border border-black/5">
            <button
              onClick={() => setActiveSubTab('checklist')}
              className={cn(
                "flex-1 py-1.5 px-3 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer text-center flex items-center justify-center gap-1.5",
                activeSubTab === 'checklist' ? "bg-white text-black shadow-xs" : "text-black/55 hover:text-black"
              )}
            >
              <CheckCircle2 className="w-3.5 h-3.5 text-black/60" />
              <span>Sipariş & Kılıf Teslim Alımı</span>
            </button>
            <button
              onClick={() => setActiveSubTab('sponges')}
              className={cn(
                "flex-1 py-1.5 px-3 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer text-center flex items-center justify-center gap-1.5",
                activeSubTab === 'sponges' ? "bg-white text-black shadow-xs" : "text-black/55 hover:text-black"
              )}
            >
              <Layers className="w-3.5 h-3.5 text-black/60" />
              <span>Sünger Siparişi & Takibi</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main interactive area */}
      <main className="flex-1 overflow-hidden flex flex-col p-4 md:p-6 space-y-4">
        
        {/* Statistics Widgets */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="bg-white p-3.5 rounded-2xl border border-black/5 shadow-2xs flex flex-col justify-between">
            <span className="text-[10px] font-black text-black/40 uppercase tracking-wider">Aktif Üretimde</span>
            <div className="flex items-baseline gap-1 mt-1">
              <span className="text-xl font-black text-black">{productionOrders.length}</span>
              <span className="text-[10px] font-bold text-black/40">sipariş</span>
            </div>
            <div className="text-[9px] text-amber-600 font-bold mt-1.5 flex items-center gap-1">
              <Clock className="w-3 h-3 shrink-0" /> Atölyede toplanmayı bekliyor
            </div>
          </div>

          <div className="bg-white p-3.5 rounded-2xl border border-black/5 shadow-2xs flex flex-col justify-between">
            <span className="text-[10px] font-black text-black/40 uppercase tracking-wider">Bekleyen Kılıflar</span>
            <div className="flex items-baseline gap-1 mt-1">
              <span className="text-xl font-black text-blue-700">
                {productionOrders.filter(o => !o.supplyCoverTaken).length}
              </span>
              <span className="text-[10px] font-bold text-black/40">kılıf</span>
            </div>
            <div className="text-[9px] text-blue-600 font-bold mt-1.5">
              Hazırlanıp üreticiden alınacaklar
            </div>
          </div>

          <div className="bg-white p-3.5 rounded-2xl border border-black/5 shadow-2xs flex flex-col justify-between">
            <span className="text-[10px] font-black text-black/40 uppercase tracking-wider">Bekleyen Süngerler</span>
            <div className="flex items-baseline gap-1 mt-1">
              <span className="text-xl font-black text-emerald-700">
                {productionOrders.filter(o => isOrderSpongeNeeded(o) && !o.supplySpongeTaken).length}
              </span>
              <span className="text-[10px] font-bold text-black/40">adet</span>
            </div>
            <div className="text-[9px] text-emerald-600 font-bold mt-1.5">
              Sünger kesiminden teslim alınacak
            </div>
          </div>

          <div className="bg-white p-3.5 rounded-2xl border border-black/5 shadow-2xs flex flex-col justify-between col-span-2 lg:col-span-1">
            <span className="text-[10px] font-black text-black/40 uppercase tracking-wider">Arama Eşleşmesi</span>
            <div className="flex items-baseline gap-1 mt-1">
              <span className="text-xl font-black text-purple-700">{filteredOrders.length}</span>
              <span className="text-[10px] font-bold text-black/40">liste elemanı</span>
            </div>
            <div className="text-[9px] text-purple-600 font-bold mt-1.5">
              Filtrelere ve aramalara uyanlar
            </div>
          </div>
        </div>

        {/* Filter and search controllers */}
        <div className="bg-white p-4 rounded-2xl border border-black/5 shadow-2xs flex flex-col lg:flex-row items-stretch lg:items-center gap-3 shrink-0">
          
          {/* Search box */}
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-black/30" />
            <input
              type="text"
              placeholder="Sipariş No, Müşteri Adı veya Kumaş Kodu Ara..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-[#F5F5F0] border-none rounded-xl pl-10 pr-4 py-2 text-xs font-bold text-black focus:ring-2 focus:ring-black/5 focus:bg-[#EAEAE3] outline-none transition-colors h-10"
            />
          </div>

          {/* Havuz (Pool) Filter buttons */}
          <div className="flex flex-nowrap bg-[#F5F5F0] p-1 rounded-xl border border-black/5 h-10 shrink-0 overflow-x-auto whitespace-nowrap scrollbar-none max-w-full">
            <button
              onClick={() => setPoolFilter('ALL')}
              className={cn(
                "px-3 py-1 rounded-lg text-[10px] font-black uppercase cursor-pointer transition-all shrink-0",
                poolFilter === 'ALL' ? "bg-white text-black shadow-xs" : "text-black/50 hover:text-black"
              )}
            >
              Tüm Havuzlar
            </button>
            <button
              onClick={() => setPoolFilter('B')}
              className={cn(
                "px-3 py-1 rounded-lg text-[10px] font-black uppercase cursor-pointer transition-all shrink-0",
                poolFilter === 'B' ? "bg-cyan-600 text-white shadow-xs" : "text-black/50 hover:text-black"
              )}
            >
              B Havuzu
            </button>
            <button
              onClick={() => setPoolFilter('D')}
              className={cn(
                "px-3 py-1 rounded-lg text-[10px] font-black uppercase cursor-pointer transition-all shrink-0",
                poolFilter === 'D' ? "bg-violet-600 text-white shadow-xs" : "text-black/50 hover:text-black"
              )}
            >
              D Havuzu
            </button>
          </div>

          {/* Sponge/Button/Other filter selector */}
          <div className="flex flex-nowrap bg-[#F5F5F0] p-1 rounded-xl border border-black/5 h-10 shrink-0 overflow-x-auto whitespace-nowrap scrollbar-none max-w-full">
            <button
              onClick={() => setSpongeFilter('ALL')}
              className={cn(
                "px-3 py-1 rounded-lg text-[10px] font-black uppercase cursor-pointer transition-all shrink-0",
                spongeFilter === 'ALL' ? "bg-white text-black shadow-xs" : "text-black/50 hover:text-black"
              )}
            >
              Tümü
            </button>
            <button
              onClick={() => setSpongeFilter('SPONGE_ONLY')}
              className={cn(
                "px-3 py-1 rounded-lg text-[10px] font-black uppercase cursor-pointer transition-all shrink-0",
                spongeFilter === 'SPONGE_ONLY' ? "bg-emerald-600 text-white shadow-xs" : "text-black/50 hover:text-black"
              )}
            >
              Sadece Süngerliler
            </button>
            <button
              onClick={() => setSpongeFilter('BUTTON_ONLY')}
              className={cn(
                "px-3 py-1 rounded-lg text-[10px] font-black uppercase cursor-pointer transition-all shrink-0",
                spongeFilter === 'BUTTON_ONLY' ? "bg-amber-600 text-white shadow-xs" : "text-black/50 hover:text-black"
              )}
            >
              Sadece Düğmeliler
            </button>
            <button
              onClick={() => setSpongeFilter('OTHER')}
              className={cn(
                "px-3 py-1 rounded-lg text-[10px] font-black uppercase cursor-pointer transition-all shrink-0",
                spongeFilter === 'OTHER' ? "bg-blue-600 text-white shadow-xs" : "text-black/50 hover:text-black"
              )}
            >
              Diğer (Düz/Kılıf)
            </button>
          </div>

          {/* Bulk delivery button */}
          {filteredOrders.length > 0 && (
            <button
              onClick={handleBulkDeliverAll}
              className="bg-black hover:bg-neutral-900 text-white h-10 px-4 rounded-xl font-extrabold text-[10px] uppercase tracking-wider flex items-center justify-center gap-1.5 cursor-pointer shadow-sm transition-all active:scale-[0.98]"
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Süzülenleri Toplu Teslim Al ({filteredOrders.length})</span>
            </button>
          )}

        </div>

        {/* Content Tabs render */}
        <div className="flex-1 bg-white rounded-2xl border border-black/5 shadow-2xs overflow-hidden flex flex-col min-h-0">
          
          {filteredOrders.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center space-y-3">
              <div className="w-12 h-12 bg-neutral-100 rounded-2xl flex items-center justify-center text-black/30">
                <SlidersHorizontal className="w-6 h-6" />
              </div>
              <div>
                <h4 className="font-extrabold text-sm text-black uppercase tracking-wider">Seçilen Kriterlere Göre Ürün Bulunamadı</h4>
                <p className="text-xs text-black/40 max-w-sm mx-auto mt-1">
                  Atölyede 'Üretimde' aşamasında olan sipariş yok veya aramalarınıza uygun bir kayıt bulunmuyor.
                </p>
              </div>
            </div>
          ) : activeSubTab === 'checklist' ? (
            
            /* TAB 1: SEVKİYAT VE TESLİM ALIM CHECKLIST */
            <div className="flex-1 overflow-y-auto min-h-0 divide-y divide-black/5">
              
              {/* Header row for tables */}
              <div className="hidden md:grid md:grid-cols-12 gap-4 px-6 py-3 bg-[#F5F5F0]/50 text-[10px] font-black uppercase text-black/40 tracking-wider">
                <div className="col-span-2">Sipariş No & Müşteri</div>
                <div className="col-span-2 text-center">Havuz & Kumaş</div>
                <div className="col-span-2">Ölçüler / Sünger Bilgisi</div>
                <div className="col-span-2 text-center">Sünger Kontrolü</div>
                <div className="col-span-2 text-center">Kılıf Kontrolü</div>
                <div className="col-span-2 text-right">Aksiyonlar</div>
              </div>

              {/* Order Checklist List */}
              {filteredOrders.map(order => {
                const hasSponge = isOrderSpongeNeeded(order);
                const { width, height, thickness } = parseDimensions(order.dimensions);
                
                return (
                  <div 
                    key={order.id} 
                    className={cn(
                      "grid grid-cols-1 md:grid-cols-12 gap-3 md:gap-4 px-4 py-4 md:px-6 md:py-4 items-center hover:bg-neutral-50/50 transition-colors",
                      order.supplyCoverTaken && (order.supplySpongeTaken || !hasSponge) ? "bg-emerald-50/20" : ""
                    )}
                  >
                    
                    {/* Display ID and Customer Name */}
                    <div className="col-span-2 flex flex-col min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="font-extrabold text-sm text-black tracking-tight font-mono">
                          #{order.orderId}
                        </span>
                        {order.status === 'Acil' && (
                          <span className="bg-red-100 text-red-800 text-[8px] px-1 py-0.5 rounded font-black uppercase tracking-wider">ACİL</span>
                        )}
                      </div>
                      <span className="text-xs font-bold text-black/60 truncate mt-0.5">{order.customerName}</span>
                    </div>

                    {/* Havuz & Kumaş Kodu */}
                    <div className="col-span-2 flex flex-row md:flex-col items-center justify-between md:justify-center md:text-center gap-2">
                      <span className="md:hidden text-[9px] font-black uppercase text-black/30">Havuz / Kumaş</span>
                      <div className="flex items-center gap-2">
                        {order.pool === 'B' ? (
                          <span className="bg-cyan-100 text-cyan-800 text-[9px] font-black px-1.5 py-0.5 rounded">B</span>
                        ) : order.pool === 'D' ? (
                          <span className="bg-violet-100 text-violet-800 text-[9px] font-black px-1.5 py-0.5 rounded">D</span>
                        ) : (
                          <span className="bg-neutral-100 text-neutral-600 text-[9px] font-black px-1.5 py-0.5 rounded">-</span>
                        )}
                        <span className="font-mono text-xs font-extrabold text-black/80">{order.fabricCode}</span>
                      </div>
                    </div>

                    {/* Dimensions / Sponge Information */}
                    <div className="col-span-2 flex flex-row md:flex-col items-center justify-between md:items-start gap-2">
                      <span className="md:hidden text-[9px] font-black uppercase text-black/30">Ebat / Sünger</span>
                      <div className="flex flex-col md:items-start items-end">
                        <span className="font-mono text-xs font-bold text-black">{order.dimensions}</span>
                        {hasSponge ? (
                          <span className="text-[10px] font-bold text-emerald-600 flex items-center gap-1 mt-0.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block animate-pulse" />
                            {thickness} cm Kalınlık
                          </span>
                        ) : (
                          <span className="text-[10px] font-semibold text-black/30 mt-0.5">Süngersiz</span>
                        )}
                      </div>
                    </div>

                    {/* Sponge Checkbox (Interactions) */}
                    <div className="col-span-2 flex flex-row md:flex-col items-center justify-between md:justify-center gap-2">
                      <span className="md:hidden text-[9px] font-black uppercase text-black/30">Sünger Alımı</span>
                      {hasSponge ? (
                        <button
                          onClick={() => handleToggleCheck(order.id, 'supplySpongeTaken')}
                          className={cn(
                            "flex items-center gap-2 px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all border cursor-pointer",
                            order.supplySpongeTaken 
                              ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-700"
                              : "bg-[#F5F5F0] border-black/5 text-black/40 hover:text-black/60"
                          )}
                        >
                          <div className={cn(
                            "w-4 h-4 rounded-md border flex items-center justify-center transition-colors shrink-0",
                            order.supplySpongeTaken 
                              ? "bg-emerald-600 border-emerald-600 text-white"
                              : "bg-white border-black/10 text-transparent"
                          )}>
                            <Check className="w-3 h-3" />
                          </div>
                          <span>{order.supplySpongeTaken ? 'ALINDI' : 'EKSİK'}</span>
                        </button>
                      ) : (
                        <span className="text-xs font-bold text-black/30 md:text-center w-full">-</span>
                      )}
                    </div>

                    {/* Cover Checkbox (Interactions) */}
                    <div className="col-span-2 flex flex-row md:flex-col items-center justify-between md:justify-center gap-2">
                      <span className="md:hidden text-[9px] font-black uppercase text-black/30">Kılıf Alımı</span>
                      <button
                        onClick={() => handleToggleCheck(order.id, 'supplyCoverTaken')}
                        className={cn(
                          "flex items-center gap-2 px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all border cursor-pointer",
                          order.supplyCoverTaken 
                            ? "bg-blue-500/10 border-blue-500/20 text-blue-700"
                            : "bg-[#F5F5F0] border-black/5 text-black/40 hover:text-black/60"
                        )}
                      >
                        <div className={cn(
                          "w-4 h-4 rounded-md border flex items-center justify-center transition-colors shrink-0",
                          order.supplyCoverTaken 
                            ? "bg-blue-600 border-blue-600 text-white"
                            : "bg-white border-black/10 text-transparent"
                        )}>
                          <Check className="w-3 h-3" />
                        </div>
                        <span>{order.supplyCoverTaken ? 'ALINDI' : 'EKSİK'}</span>
                      </button>
                    </div>

                    {/* Single Row actions (Deliver directly) */}
                    <div className="col-span-2 flex justify-end">
                      <button
                        onClick={() => handleDeliverProduct(order.id)}
                        className="w-full md:w-auto bg-black hover:bg-neutral-900 text-white font-extrabold text-[10px] uppercase tracking-wider px-3.5 py-2 rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5 hover:shadow-xs active:scale-[0.98]"
                      >
                        <Truck className="w-3.5 h-3.5 text-amber-500" />
                        <span>Teslim Alındı</span>
                      </button>
                    </div>

                  </div>
                );
              })}
            </div>
          ) : (
            
            /* TAB 2: SÜNGER SİPARİŞİ VE EBAT TAKİBİ */
            <div className="flex-1 overflow-y-auto min-h-0 divide-y divide-black/5">
              
              {/* Filter only orders needing a sponge */}
              {filteredOrders.filter(o => isOrderSpongeNeeded(o)).length === 0 ? (
                <div className="p-12 text-center space-y-3">
                  <div className="w-12 h-12 bg-neutral-100 rounded-2xl flex items-center justify-center text-black/30 mx-auto">
                    <Layers className="w-6 h-6" />
                  </div>
                  <div>
                    <h4 className="font-extrabold text-sm text-black uppercase tracking-wider">Üretimde Süngerli Ürün Bulunmuyor</h4>
                    <p className="text-xs text-black/40 max-w-sm mx-auto mt-1">
                      Şu an 'Üretimde' aşamasında olan siparişlerden sünger kesimi gerektiren bir kayıt bulunmamaktadır.
                    </p>
                  </div>
                </div>
              ) : (
                <>
                  {/* Table headers */}
                  <div className="hidden md:grid md:grid-cols-12 gap-4 px-6 py-3 bg-[#F5F5F0]/50 text-[10px] font-black uppercase text-black/40 tracking-wider">
                    <div className="col-span-2">Sipariş No & Müşteri</div>
                    <div className="col-span-2 text-center">Kalınlık</div>
                    <div className="col-span-3 text-center">Sünger Ebatı (En x Boy)</div>
                    <div className="col-span-3">Teslim Alma Durumu</div>
                    <div className="col-span-2 text-right font-black">Notlar</div>
                  </div>

                  {/* Sponge items render */}
                  {filteredOrders.filter(o => isOrderSpongeNeeded(o)).map(order => {
                    const { width, height, thickness } = parseDimensions(order.dimensions);
                    return (
                      <div key={order.id} className="grid grid-cols-1 md:grid-cols-12 gap-3 md:gap-4 px-4 py-4 md:px-6 md:py-4 items-center hover:bg-neutral-50/50 transition-colors">
                        
                        {/* ID and customer */}
                        <div className="col-span-2">
                          <span className="font-extrabold text-xs text-black tracking-tight font-mono">#{order.orderId}</span>
                          <span className="block text-xs font-bold text-black/50 truncate mt-0.5">{order.customerName}</span>
                        </div>

                        {/* Thickness */}
                        <div className="col-span-2 flex flex-row md:flex-col items-center justify-between md:justify-center md:text-center gap-2">
                          <span className="md:hidden text-[9px] font-black uppercase text-black/30">Kalınlık</span>
                          <span className="bg-emerald-100 text-emerald-800 text-[10px] font-black px-2 py-0.5 rounded-lg">
                            {thickness} cm
                          </span>
                        </div>

                        {/* Sponge dimensions */}
                        <div className="col-span-3 flex flex-row md:flex-col items-center justify-between md:justify-center md:text-center gap-2">
                          <span className="md:hidden text-[9px] font-black uppercase text-black/30">Ebat</span>
                          <span className="font-mono text-xs font-extrabold text-black bg-[#F5F5F0] px-2.5 py-1 rounded-lg">
                            {width} x {height} cm
                          </span>
                        </div>

                        {/* Status tracker */}
                        <div className="col-span-3 flex flex-row md:flex-col items-center justify-between md:items-start gap-2">
                          <span className="md:hidden text-[9px] font-black uppercase text-black/30">Sünger Durumu</span>
                          <button
                            onClick={() => handleToggleCheck(order.id, 'supplySpongeTaken')}
                            className={cn(
                              "flex items-center gap-2 px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all border cursor-pointer",
                              order.supplySpongeTaken 
                                ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-700"
                                : "bg-[#F5F5F0] border-black/5 text-black/40 hover:text-black/60"
                            )}
                          >
                            <div className={cn(
                              "w-3.5 h-3.5 rounded-md border flex items-center justify-center shrink-0",
                              order.supplySpongeTaken 
                                ? "bg-emerald-600 border-emerald-600 text-white"
                                : "bg-white border-black/10 text-transparent"
                            )}>
                              <Check className="w-2.5 h-2.5" />
                            </div>
                            <span>{order.supplySpongeTaken ? 'SÜNGER ALINDI' : 'SÜNGER BEKLİYOR'}</span>
                          </button>
                        </div>

                        {/* Extra notes */}
                        <div className="col-span-2 flex flex-row md:flex-col items-center justify-between md:items-end gap-2 text-right">
                          <span className="md:hidden text-[9px] font-black uppercase text-black/30">Not</span>
                          <span className="text-xs text-black/50 italic font-semibold truncate max-w-[150px]">
                            {order.extraInfo || '-'}
                          </span>
                        </div>

                      </div>
                    );
                  })}
                </>
              )}
            </div>
          )}

        </div>

        {/* Informative Guidance Banner */}
        {showGuide ? (
          <div className="bg-amber-50 rounded-2xl p-4 border border-amber-200/50 flex gap-3 shadow-2xs shrink-0 relative">
            <Info className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div className="space-y-1 pr-16">
              <h4 className="font-extrabold text-xs uppercase text-amber-900 tracking-wider">İş Akışı ve Otomasyon Rehberi</h4>
              <p className="text-xs text-amber-800 leading-relaxed font-semibold">
                Kılıf ve sünger parçalarını teslim aldıkça ilgili satırdaki kontrol kutularını işaretleyebilirsiniz. 
                Gerekli tüm parçaları teslim alınan siparişler otomatik olarak <strong className="font-black text-black">Paketlendi</strong> aşamasına aktarılır. 
                Dilerseniz sağ taraftaki <strong className="font-black">Teslim Alındı</strong> butonunu kullanarak tüm parçaları tek tıklamayla teslim alabilir ve doğrudan paketlemeye sevk edebilirsiniz.
              </p>
            </div>
            <button
              onClick={toggleGuide}
              className="absolute top-3 right-3 text-[10px] font-black uppercase text-amber-700 hover:text-amber-900 bg-amber-100 hover:bg-amber-200/60 px-2.5 py-1 rounded-lg transition-colors cursor-pointer"
              title="Rehberi Kapat"
            >
              Kapat
            </button>
          </div>
        ) : (
          <div className="flex justify-end shrink-0">
            <button
              onClick={toggleGuide}
              className="text-[10px] font-black uppercase tracking-wider text-amber-800 hover:text-amber-600 flex items-center gap-1.5 px-3 py-1.5 bg-amber-50 hover:bg-amber-100 border border-amber-200/40 rounded-xl transition-all cursor-pointer active:scale-95"
            >
              <Info className="w-3.5 h-3.5 text-amber-600" />
              <span>İş Akışı Rehberini Göster</span>
            </button>
          </div>
        )}

      </main>

    </div>
  );
}
