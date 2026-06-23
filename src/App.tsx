/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useEffect } from 'react';
import { 
  Printer, 
  Trash2, 
  ChevronRight, 
  Package, 
  Search, 
  Type, 
  Plus, 
  Settings, 
  X, 
  ExternalLink, 
  Scissors, 
  Tag, 
  AlertTriangle, 
  History, 
  FileDown, 
  CheckCircle, 
  Info,
  Calendar,
  Layers
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { OrderLabel } from './components/OrderLabel';
import { FabricCalculator } from './components/FabricCalculator';
import { SpongeCalculator } from './components/SpongeCalculator';
import { cn } from './lib/utils';
import { generateOrdersPdf } from './lib/pdfGenerator';

interface Order {
  id: string; // Unique internal ID
  orderId: string; // Display ID (can be duplicate)
  customerName: string;
  fabricCode: string;
  lineDirection: string;
  extraInfo: string;
  dimensions: string;
  createdAt?: string; // e.g. "18/06/26"
  pool?: 'B' | 'D' | string | null;
}

interface SavedLog {
  id: string;
  timestamp: number;
  dateStr: string;
  orderCount: number;
  orders: Order[];
  filename: string;
}

export default function App() {
  // Sync core state with local storage right on initialization for maximum reliability
  const [orders, setOrders] = useState<Order[]>(() => {
    const stored = localStorage.getItem('yaver_active_orders');
    try {
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });

  const [logs, setLogs] = useState<SavedLog[]>(() => {
    const stored = localStorage.getItem('yaver_order_history');
    try {
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });

  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(() => {
    const stored = localStorage.getItem('yaver_active_orders');
    try {
      if (stored) {
        const parsed = JSON.parse(stored) as Order[];
        return parsed.length > 0 ? parsed[0].id : null;
      }
    } catch {}
    return null;
  });

  const [selectedLogId, setSelectedLogId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [inputText, setInputText] = useState('');
  const [isPrintingAll, setIsPrintingAll] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [activeTab, setActiveTab] = useState<'labels' | 'calculator' | 'sponge' | 'logs'>('labels');
  
  const [printSettings, setPrintSettings] = useState(() => {
    const stored = localStorage.getItem('yaver_print_settings');
    try {
      if (stored) {
        const parsed = JSON.parse(stored);
        return {
          width: parsed.width ?? 100,
          // If height is 100 (old default) or missing, automatically upgrade to 150mm standard
          height: (parsed.height && parsed.height !== 100) ? parsed.height : 150,
          hideCustomerNames: parsed.hideCustomerNames !== undefined ? parsed.hideCustomerNames : true
        };
      }
      return { width: 100, height: 150, hideCustomerNames: true };
    } catch {
      return { width: 100, height: 150, hideCustomerNames: true };
    }
  });

  // Safe Non-blocking Custom Notification Toast State
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'info' | 'error' } | null>(null);

  // Safe Non-blocking Custom Confirmation Dialog State
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
  }>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {}
  });

  // Keep localStorage perfectly synchronized whenever states undergo modification
  useEffect(() => {
    localStorage.setItem('yaver_active_orders', JSON.stringify(orders));
  }, [orders]);

  useEffect(() => {
    localStorage.setItem('yaver_order_history', JSON.stringify(logs));
  }, [logs]);

  useEffect(() => {
    localStorage.setItem('yaver_print_settings', JSON.stringify(printSettings));
  }, [printSettings]);

  // Helper function to trigger non-blocking system feedback toasts
  const triggerToast = (message: string, type: 'success' | 'info' | 'error' = 'success') => {
    // Only show error warnings; suppress success and info feedback messages per user request
    if (type === 'error') {
      setToast({ message, type });
      setTimeout(() => setToast(null), 3000);
    }
  };

  // Helper function to trigger elegant non-blocking inside-app confirmations
  const triggerConfirm = (title: string, message: string, onConfirm: () => void) => {
    setConfirmDialog({
      isOpen: true,
      title,
      message,
      onConfirm: () => {
        onConfirm();
        setConfirmDialog(prev => ({ ...prev, isOpen: false }));
      }
    });
  };

  const handleOpenNewTab = () => {
    window.open(window.location.href, '_blank');
  };

  const handleParseText = () => {
    if (!inputText.trim()) return;

    const lines = inputText.split('\n').filter(line => line.trim());
    const newOrders: Order[] = lines.map((line, index) => {
      const cleanLine = line.trim();
      
      let parts = cleanLine.split(/\t|\s{2,}/).map(p => p.trim()).filter(p => p);
      
      if (parts.length < 2) {
        parts = cleanLine.split(/\s+/).map(p => p.trim()).filter(p => p);
      }
      
      // Extract pool suffix (B/D) if present at the end
      let pool: 'B' | 'D' | null = null;
      if (parts.length > 0) {
        const lastPart = parts[parts.length - 1].trim().toUpperCase();
        if (lastPart === 'B' || lastPart === 'D') {
          pool = lastPart as 'B' | 'D';
          parts.pop(); // Remove it from parts to avoid shifting indexes of dimensions/extraInfo
        }
      }

      let orderId = `ORD-${Date.now()}-${index}`;
      let customerName = 'Bilinmiyor';
      let fabricCode = '-';
      let lineDirection = '-';
      let extraInfo = '-';
      let dimensions = '-';

      // Order structure: 1.ID 2.Name 3.Code 4.Direction 5.Info 6.Dimensions
      if (parts.length >= 6) {
        orderId = parts[0];
        customerName = parts[1];
        fabricCode = parts[2];
        lineDirection = parts[3];
        extraInfo = parts[4];
        dimensions = parts[5];
      } else if (parts.length === 5) {
        orderId = parts[0];
        customerName = parts[1];
        fabricCode = parts[2];
        lineDirection = parts[3];
        extraInfo = parts[4];
      } else if (parts.length === 4) {
        orderId = parts[0];
        customerName = parts[1];
        fabricCode = parts[2];
        lineDirection = parts[3];
      } else if (parts.length === 3) {
        orderId = parts[0];
        customerName = parts[1];
        fabricCode = parts[2];
      } else if (parts.length === 2) {
        orderId = parts[0];
        customerName = parts[1];
      }

      const timestamp = Date.now();
      const d = new Date();
      const gg = String(d.getDate()).padStart(2, '0');
      const aa = String(d.getMonth() + 1).padStart(2, '0');
      const yy = String(d.getFullYear()).slice(-2);
      const createdAt = `${gg}/${aa}/${yy}`;
      
      return {
        id: `${timestamp}-${index}-${Math.random().toString(36).substr(2, 9)}`,
        orderId,
        customerName,
        fabricCode,
        lineDirection,
        extraInfo,
        dimensions,
        createdAt,
        pool,
      };
    });

    setOrders(prev => [...newOrders, ...prev]);
    if (newOrders.length > 0) setSelectedOrderId(newOrders[0].id);
    setInputText('');
    triggerToast(`${newOrders.length} adet yeni sipariş eklendi!`, 'success');
  };

  const handleSaveLog = (ordersToSave: Order[], showFeedback: boolean = false) => {
    if (ordersToSave.length === 0) return;

    const now = new Date();
    const day = String(now.getDate()).padStart(2, '0');
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const year = now.getFullYear();
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    
    const dateStr = `${day}.${month}.${year} ${hours}:${minutes}`;
    const filename = `${day}.${month}.${year}_${ordersToSave.length}_adet.pdf`;

    const newLog: SavedLog = {
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: Date.now(),
      dateStr,
      orderCount: ordersToSave.length,
      orders: ordersToSave,
      filename
    };

    setLogs(prev => [newLog, ...prev]);
    setSelectedLogId(newLog.id);

    if (showFeedback) {
      triggerToast('Siparişler başarıyla geriye dönük kayıtlara arşivlendi!', 'success');
    }
  };

  // Triggers browser print, automatically appending records if it's "Yazdır All"
  const handlePrint = (all: boolean = false) => {
    setIsPrintingAll(all);

    // Prompt log generation dynamically when user triggers "Print All"
    if (all && filteredOrders.length > 0) {
      handleSaveLog(filteredOrders, false);
    }

    setTimeout(() => {
      window.print();
      setIsPrintingAll(false);
    }, 150);
  };

  const handleDeleteOrder = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setOrders(prev => {
      const newOrders = prev.filter(o => o.id !== id);
      if (selectedOrderId === id) {
        setSelectedOrderId(newOrders.length > 0 ? newOrders[0].id : null);
      }
      return newOrders;
    });
    triggerToast('Sipariş çıkarıldı.', 'info');
  };

  const handleRemoveDuplicates = () => {
    const seen = new Set<string>();
    const uniqueOrders: Order[] = [];
    
    orders.forEach(o => {
      const key = `${o.customerName.trim().toLowerCase()}|${o.fabricCode.trim().toLowerCase()}|${o.dimensions.trim().toLowerCase()}`;
      if (!seen.has(key)) {
        seen.add(key);
        uniqueOrders.push(o);
      }
    });
    
    const removedCount = orders.length - uniqueOrders.length;
    setOrders(uniqueOrders);
    if (selectedOrderId && !uniqueOrders.find(o => o.id === selectedOrderId)) {
      setSelectedOrderId(uniqueOrders.length > 0 ? uniqueOrders[0].id : null);
    }
    triggerToast(`${removedCount} kopya sipariş listeden temizlendi.`, 'success');
  };

  const handleLoadLogToActive = (log: SavedLog) => {
    triggerConfirm(
      'Kayıt Geri Yükleme',
      `Bu kaydı (${log.dateStr}) aktif listenize yüklemek istiyor musunuz? Mevcut aktif listenizin üzerine yazılacaktır.`,
      () => {
        setOrders(log.orders);
        if (log.orders.length > 0) {
          setSelectedOrderId(log.orders[0].id);
        } else {
          setSelectedOrderId(null);
        }
        setActiveTab('labels');
        triggerToast('Sipariş kaydı başarıyla aktif listeye geri yüklendi.', 'success');
      }
    );
  };

  const handleDeleteLog = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const log = logs.find(l => l.id === id);
    if (!log) return;
    
    triggerConfirm(
      'Kayıt Silme',
      'Bu günlük sipariş kaydını tamamen silmek istediğinizden emin misiniz? Bu işlem geri alınamaz.',
      () => {
        setLogs(prev => prev.filter(l => l.id !== id));
        if (selectedLogId === id) {
          setSelectedLogId(null);
        }
        triggerToast('Kayıt silindi.', 'info');
      }
    );
  };

  const handleDownloadLogPdf = (log: SavedLog, mode: 'production' | 'warehouse') => {
    try {
      const baseName = log.filename.replace('.pdf', '');
      const suffixedFilename = mode === 'production' 
        ? `${baseName}_uretim.pdf` 
        : `${baseName}_depo.pdf`;

      generateOrdersPdf(log.orders, log.dateStr, suffixedFilename, mode);
    } catch (err) {
      console.error(err);
      triggerToast('PDF oluşturma sırasında hata oluştu.', 'error');
    }
  };

  const filteredOrders = orders.filter(order => 
    order.customerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    order.orderId.toString().includes(searchTerm)
  );

  const duplicateIds = useMemo(() => {
    const counts = new Map<string, string[]>();
    orders.forEach(o => {
      const key = `${o.customerName.trim().toLowerCase()}|${o.fabricCode.trim().toLowerCase()}|${o.dimensions.trim().toLowerCase()}`;
      if (!counts.has(key)) counts.set(key, []);
      counts.get(key)!.push(o.id);
    });
    
    const duplicates = new Set<string>();
    counts.forEach(ids => {
      if (ids.length > 1) {
        ids.forEach(id => duplicates.add(id));
      }
    });
    return duplicates;
  }, [orders]);

  const selectedOrder = orders.find(o => o.id === selectedOrderId);
  const selectedLog = logs.find(l => l.id === selectedLogId);

  return (
    <div className="min-h-screen bg-[#F5F5F0] text-[#141414] font-sans">
      <style>
        {`
          @media print {
            @page {
              size: ${printSettings.width}mm ${printSettings.height}mm;
              margin: 0;
            }
          }
        `}
      </style>
      
      {/* Toast Alert Banner */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: -50, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.95 }}
            className="fixed top-6 left-1/2 -translate-x-1/2 z-[100] flex items-center gap-2.5 px-5 py-3 bg-white text-black text-xs font-bold rounded-2xl shadow-xl border border-black/5"
          >
            {toast.type === 'success' && <CheckCircle className="w-4 h-4 text-green-500" />}
            {toast.type === 'info' && <Info className="w-4 h-4 text-blue-500" />}
            {toast.type === 'error' && <AlertTriangle className="w-4 h-4 text-red-500" />}
            <span>{toast.message}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Confirmation Dialog Modal */}
      <AnimatePresence>
        {confirmDialog.isOpen && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setConfirmDialog(prev => ({ ...prev, isOpen: false }))}
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              className="relative w-full max-w-sm bg-white rounded-3xl p-6 shadow-2xl overflow-hidden border border-black/5"
            >
              <h3 className="font-bold text-base text-black mb-2 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
                {confirmDialog.title}
              </h3>
              <p className="text-xs text-black/60 leading-relaxed mb-6">
                {confirmDialog.message}
              </p>
              <div className="flex gap-2.5 justify-end">
                <button
                  onClick={() => setConfirmDialog(prev => ({ ...prev, isOpen: false }))}
                  className="px-4 py-2 bg-black/5 hover:bg-black/10 text-black rounded-xl text-xs font-bold transition-all"
                >
                  Vazgeç
                </button>
                <button
                  onClick={confirmDialog.onConfirm}
                  className="px-4 py-2 bg-black text-white hover:bg-black/90 rounded-xl text-xs font-bold transition-all shadow-md shadow-black/5"
                >
                  Onayla
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Print Only Section */}
      <div className="print-only">
        {isPrintingAll ? (
          filteredOrders.map((order, idx) => (
            <div key={order.id} className={cn(idx < filteredOrders.length - 1 && "page-break")}>
              <OrderLabel order={order} settings={printSettings} />
            </div>
          ))
        ) : (
          selectedOrder && <OrderLabel order={selectedOrder} settings={printSettings} />
        )}
      </div>

      {/* Main UI */}
      <div className="no-print flex h-screen overflow-hidden">
        {/* Sidebar */}
        <div className="w-80 bg-white border-r border-black/5 flex flex-col">
          <div className="p-6 border-b border-black/5">
            <div className="flex items-center gap-2 mb-6">
              <div className="w-8 h-8 bg-black rounded-lg flex items-center justify-center">
                <Package className="text-white w-5 h-5" />
              </div>
              <h1 className="font-bold text-lg tracking-tight">Yaver</h1>
            </div>

            <nav className="flex gap-1 bg-[#F5F5F0] p-1 rounded-xl mb-6">
              <button
                onClick={() => setActiveTab('labels')}
                className={cn(
                  "flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer",
                  activeTab === 'labels' ? "bg-white shadow-sm text-black" : "text-black/40 hover:text-black/60"
                )}
              >
                <Tag className="w-3 h-3" />
                Etiketler
              </button>
              <button
                onClick={() => setActiveTab('calculator')}
                className={cn(
                  "flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer",
                  activeTab === 'calculator' ? "bg-white shadow-sm text-black" : "text-black/40 hover:text-black/60"
                )}
              >
                <Scissors className="w-3 h-3" />
                Kumaş
              </button>
              <button
                onClick={() => setActiveTab('sponge')}
                className={cn(
                  "flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer",
                  activeTab === 'sponge' ? "bg-white shadow-sm text-black" : "text-black/40 hover:text-black/60"
                )}
              >
                <Layers className="w-3 h-3" />
                Sünger
              </button>
            </nav>

            {activeTab === 'labels' && (
              <div className="space-y-3">
                <textarea
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  placeholder="Örn: 4	Rosie Smith	color 3	yatay	süngerli	özel"
                  className="w-full h-32 bg-[#F5F5F0] border-none rounded-xl p-3 text-xs focus:ring-2 focus:ring-black/10 outline-none resize-none"
                />
                <button
                  onClick={handleParseText}
                  disabled={!inputText.trim()}
                  className="w-full bg-black text-white rounded-xl py-3 px-4 flex items-center justify-center gap-2 hover:bg-black/90 disabled:opacity-30 transition-colors cursor-pointer group"
                >
                  <Plus className="w-4 h-4 group-hover:scale-110 transition-transform" />
                  <span className="font-medium">Sipariş Ekle</span>
                </button>
              </div>
            )}
          </div>

          {/* Tab 1: Labels */}
          {activeTab === 'labels' && (
            <>
              <div className="p-4 border-b border-black/5">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-black/40" />
                  <input
                    type="text"
                    placeholder="Ara..."
                    className="w-full h-10 bg-[#F5F5F0] border-none rounded-lg pl-10 pr-4 text-xs font-bold text-black outline-none focus:ring-1 focus:ring-black/10 placeholder:text-black/30"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                </div>
              </div>

              <div className="flex-1 overflow-y-auto">
                {orders.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center p-8 text-center opacity-40">
                    <Type className="w-12 h-12 mb-4" />
                    <p className="text-sm">Henüz sipariş eklenmedi</p>
                    <p className="text-[10px] mt-2">Yukarıdaki alana veriyi yapıştırın</p>
                  </div>
                ) : (
                  <div className="divide-y divide-black/5">
                    {filteredOrders.map((order) => (
                      <div key={order.id} className="relative group">
                        <button
                          onClick={() => setSelectedOrderId(order.id)}
                          className={cn(
                            "w-full p-4 pr-14 text-left transition-all hover:bg-black/5 flex items-center justify-between cursor-pointer",
                            selectedOrderId === order.id && "bg-black/5"
                          )}
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="font-bold text-sm truncate max-w-[130px]">{order.customerName}</p>
                              {duplicateIds.has(order.id) && (
                                <span className="flex items-center gap-1 px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded text-[9px] font-black uppercase tracking-tighter shrink-0">
                                  <AlertTriangle className="w-2.5 h-2.5" />
                                  KOPYA
                                </span>
                              )}
                            </div>
                            <p className="text-xs font-mono opacity-50">{order.orderId} • {order.fabricCode}</p>
                          </div>
                          <ChevronRight className={cn(
                            "w-4 h-4 opacity-0 group-hover:opacity-100 transition-all shrink-0",
                            selectedOrderId === order.id && "opacity-100 translate-x-1"
                          )} />
                        </button>
                        <button
                          onClick={(e) => handleDeleteOrder(order.id, e)}
                          className="absolute right-4 top-1/2 -translate-y-1/2 p-2 text-red-500 opacity-0 group-hover:opacity-100 hover:bg-red-50 rounded-lg transition-all z-10 cursor-pointer"
                          title="Siparişi Sil"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {orders.length > 0 && (
                <div className="p-4 border-t border-black/5 space-y-2">
                  <button
                    onClick={() => handleSaveLog(orders, true)}
                    className="w-full flex items-center justify-center gap-2 text-xs font-bold text-green-700 bg-green-50 hover:bg-green-100 py-2.5 rounded-lg transition-all border border-green-200 cursor-pointer"
                  >
                    <History className="w-3.5 h-3.5" />
                    Mevcut Listeyi Arşivle ({orders.length})
                  </button>

                  {duplicateIds.size > 0 && (
                    <button
                      onClick={handleRemoveDuplicates}
                      className="w-full flex items-center justify-center gap-2 text-xs font-bold text-amber-700 bg-amber-50 hover:bg-amber-100 py-2 rounded-lg transition-colors border border-amber-200 cursor-pointer"
                    >
                      <AlertTriangle className="w-3.5 h-3.5" />
                      Kopyaları Temizle
                    </button>
                  )}
                  <button
                    onClick={() => triggerConfirm(
                      'Aktif Listeyi Temizle',
                      'Mevcut ekranda listelenen siparişlerin tümünü silmek istediğinize emin misiniz? Arşive kaydedilmemiş siparişleriniz kaybolabilir.',
                      () => {
                        setOrders([]);
                        setSelectedOrderId(null);
                        triggerToast('Aktif sipariş listesi boşaltıldı.', 'info');
                      }
                    )}
                    className="w-full flex items-center justify-center gap-2 text-xs font-medium text-red-500 hover:bg-red-50 py-2 rounded-lg transition-colors cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Aktif Listeyi Temizle
                  </button>
                </div>
              )}
            </>
          )}

          {/* Tab 2: Calculator */}
          {activeTab === 'calculator' && (
            <div className="flex-1 p-6 flex flex-col items-center justify-center text-center space-y-4 opacity-40">
              <Scissors className="w-12 h-12" />
              <p className="text-xs font-bold uppercase tracking-widest leading-relaxed">
                Kumaş özet modülü aktif.<br/>Siparişlerinizi buradan takip edin.
              </p>
            </div>
          )}

          {/* Tab 4: Sponge */}
          {activeTab === 'sponge' && (
            <div className="flex-1 p-6 flex flex-col items-center justify-center text-center space-y-4 opacity-40">
              <Layers className="w-12 h-12" />
              <p className="text-xs font-bold uppercase tracking-widest leading-relaxed">
                Sünger Planlama Modülü Aktif.<br/>Ayrıntılar yan ekranda.
              </p>
            </div>
          )}

          {/* Tab 3: History Logs */}
          {activeTab === 'logs' && (
            <>
              <div className="p-4 border-b border-black/5 flex items-center justify-between">
                <span className="text-xs font-bold text-black/50">Geriye Dönük Raporlar</span>
                <span className="bg-black/5 text-black px-2 py-0.5 rounded text-[10px] font-bold">
                  {logs.length} Rapor
                </span>
              </div>
              <div className="flex-1 overflow-y-auto">
                {logs.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center p-8 text-center opacity-40">
                    <History className="w-12 h-12 mb-4" />
                    <p className="text-xs font-bold uppercase tracking-wide">Henüz rapor kaydı yok</p>
                    <p className="text-[10px] leading-relaxed mt-2.5 max-w-[200px] mx-auto">
                      "Tümünü Yazdır" seçeneğine tıkladığınızda veya listeyi manuel arşivlediğinizde buraya otomatik kayıt oluşturulur.
                    </p>
                  </div>
                ) : (
                  <div className="divide-y divide-black/5">
                    {logs.map((log) => (
                      <div key={log.id} className="relative group">
                        <button
                          onClick={() => setSelectedLogId(log.id)}
                          className={cn(
                            "w-full p-4 pr-12 text-left transition-all hover:bg-black/5 flex items-center justify-between cursor-pointer",
                            selectedLogId === log.id && "bg-black/5"
                          )}
                        >
                          <div className="min-w-0 flex-1">
                            <p className="font-bold text-sm tracking-tight">{log.dateStr}</p>
                            <p className="text-[10px] opacity-50 mt-0.5 flex items-center gap-1">
                              <Calendar className="w-2.5 h-2.5 shrink-0" />
                              {log.orderCount} adet etiket kayıtlı
                            </p>
                          </div>
                          <ChevronRight className={cn(
                            "w-4 h-4 opacity-0 group-hover:opacity-100 transition-all shrink-0",
                            selectedLogId === log.id && "opacity-100 translate-x-1"
                          )} />
                        </button>
                        <button
                          onClick={(e) => handleDeleteLog(log.id, e)}
                          className="absolute right-4 top-1/2 -translate-y-1/2 p-2 text-red-400 opacity-0 group-hover:opacity-100 hover:bg-red-50 hover:text-red-600 rounded-lg transition-all z-10 cursor-pointer"
                          title="Rapor Kaydını Sil"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              
              {logs.length > 0 && (
                <div className="p-4 border-t border-black/5">
                  <button
                    onClick={() => triggerConfirm(
                      'Tüm Arşivi Sil',
                      'Geçmiş kayıtlardaki tüm günlük raporları kalıcı olarak silmek istediğinizden emin misiniz? Bu işlem geri alınamaz.',
                      () => {
                        setLogs([]);
                        setSelectedLogId(null);
                        triggerToast('Tüm günlük rapor arşivi temizlendi.', 'info');
                      }
                    )}
                    className="w-full flex items-center justify-center gap-2 text-xs font-medium text-red-500 hover:bg-red-50 py-2.5 rounded-lg transition-colors cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Tüm Geçmişi Temizle
                  </button>
                </div>
              )}
            </>
          )}
        </div>

        {/* Content Area */}
        <div className="flex-1 flex flex-col">
          {activeTab === 'labels' && (
            <>
              <header className="h-16 bg-white border-b border-black/5 px-8 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-6">
                  {/* Preview Title & Divider & Selected Order Name */}
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-bold uppercase tracking-widest opacity-40">Önizleme</span>
                    {selectedOrder && (
                      <>
                        <div className="h-4 w-[1px] bg-black/10" />
                        <span className="text-sm font-semibold text-black uppercase">
                          {selectedOrder.customerName}
                        </span>
                      </>
                    )}
                  </div>
                </div>
                
                <div className="flex items-center gap-4">
                  {/* Kayıtlar (Logs) Button */}
                  <button
                    onClick={() => setActiveTab('logs')}
                    className="flex items-center justify-center gap-1.5 h-9 px-4.5 bg-[#F5F5F0] hover:bg-[#E4E3E0] border border-black/5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all cursor-pointer text-black"
                    title="Arşivlenmiş geçmiş kayıtları ve raporları görüntüleyin"
                  >
                    <History className="w-3.5 h-3.5 text-black/50" />
                    <span>Kayıtlar</span>
                  </button>

                  {/* Nameless Output Mode Toggle Switch */}
                  <button
                    type="button"
                    onClick={() => setPrintSettings((prev: any) => ({ ...prev, hideCustomerNames: !prev.hideCustomerNames }))}
                    className={cn(
                      "flex items-center justify-center gap-1.5 h-9 px-4.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all cursor-pointer border",
                      printSettings.hideCustomerNames
                        ? "bg-black text-white border-black"
                        : "bg-[#F5F5F0] hover:bg-[#E4E3E0] border-black/5 text-black"
                    )}
                    title="Çıktılarda müşteri isimlerini gizler"
                  >
                    <span>İsimsiz Çıktı</span>
                    <span className={cn(
                      "px-1.5 py-0.5 rounded-md text-[9px] font-black leading-none",
                      printSettings.hideCustomerNames ? "bg-white text-black" : "bg-black/5 text-black/40"
                    )}>
                      {printSettings.hideCustomerNames ? 'AKTİF' : 'KAPALI'}
                    </span>
                  </button>

                  <button
                    onClick={() => setShowSettings(true)}
                    className="flex items-center justify-center h-9 w-9 bg-[#F5F5F0] hover:bg-[#E4E3E0] border border-black/5 rounded-xl transition-all text-black cursor-pointer"
                    title="Yazdırma Ayarları"
                  >
                    <Settings className="w-4 h-4 text-black/50" />
                  </button>

                  {/* Print Actions */}
                  <div className="flex items-center gap-2 pl-4 border-l border-black/10">
                    {filteredOrders.length > 1 && (
                      <button
                        onClick={() => handlePrint(true)}
                        className="bg-white hover:bg-[#F5F5F0] border border-black/10 text-black h-9 px-4.5 rounded-xl flex items-center justify-center gap-1.5 transition-all text-[10px] font-black uppercase tracking-widest cursor-pointer"
                      >
                        <Printer className="w-3.5 h-3.5 text-black/50" />
                        <span>Tümünü Yazdır ({filteredOrders.length})</span>
                      </button>
                    )}
                    <button
                      disabled={!selectedOrder}
                      onClick={() => handlePrint(false)}
                      className="bg-black hover:bg-neutral-900 text-white border border-black/10 h-9 px-4.5 rounded-xl flex items-center justify-center gap-1.5 transition-all text-[10px] font-black uppercase tracking-widest cursor-pointer active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      <Printer className="w-3.5 h-3.5" />
                      <span>Seçileni Yazdır</span>
                    </button>
                  </div>
                </div>
              </header>

              <main className="flex-1 p-12 flex items-center justify-center overflow-auto bg-[#E4E3E0]">
                <AnimatePresence mode="wait">
                  {selectedOrder ? (
                    <motion.div
                      key={selectedOrder.id}
                      initial={{ opacity: 0, y: 20, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, scale: 1.05 }}
                      transition={{ duration: 0.3, ease: [0.23, 1, 0.32, 1] }}
                      className="shadow-2xl shadow-black/20"
                    >
                      <OrderLabel order={selectedOrder} settings={printSettings} />
                    </motion.div>
                  ) : (
                    <div className="text-center max-w-sm">
                      <div className="w-20 h-20 bg-white rounded-3xl flex items-center justify-center mx-auto mb-6 shadow-sm">
                        <Printer className="w-10 h-10 opacity-20" />
                      </div>
                      <h2 className="text-xl font-bold mb-2">Veri Girişi Bekleniyor</h2>
                      <p className="text-sm opacity-50">
                        Sol taraftaki alana sipariş bilgilerini yapıştırın. Birden fazla satır ekleyerek toplu işlem yapabilirsiniz.
                      </p>
                    </div>
                  )}
                </AnimatePresence>
              </main>

              <footer className="h-12 bg-white border-t border-black/5 px-8 flex items-center justify-between text-[10px] font-medium uppercase tracking-widest opacity-40 shrink-0">
                <button
                  onClick={handleOpenNewTab}
                  className="transition-all hover:opacity-80 cursor-pointer text-black font-extrabold text-[10px] uppercase tracking-widest"
                  title="Yazdırma sorunlarını çözmek için yeni sekmede açın"
                >
                  YENİ SEKMEDE AÇ
                </button>
                <div className="text-black font-medium text-[10px] uppercase tracking-widest">Etiket Boyutu: {printSettings.width}mm x {printSettings.height}mm</div>
              </footer>
            </>
          )}

          {activeTab === 'calculator' && (
            <FabricCalculator orders={orders} />
          )}

          {activeTab === 'sponge' && (
            <SpongeCalculator orders={orders} />
          )}

          {activeTab === 'logs' && (
            <div className="flex-1 flex flex-col min-h-0 bg-[#F5F5F0]">
              <header className="h-16 bg-white border-b border-black/5 px-8 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-4">
                  <span className="text-xs font-bold uppercase tracking-widest opacity-40">Rapor Rapor Ayrıntıları</span>
                  {selectedLog && (
                    <>
                      <div className="h-4 w-[1px] bg-black/10" />
                      <span className="text-sm font-semibold text-black">{selectedLog.dateStr} Raporu</span>
                    </>
                  )}
                </div>

                {selectedLog && (
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => handleLoadLogToActive(selectedLog)}
                      className="bg-white border border-black/10 hover:bg-black/5 text-black px-5 py-2 rounded-full flex items-center gap-2 transition-all active:scale-95 text-xs font-bold cursor-pointer"
                      title="Siparişleri şimdiki aktif listenize geri yükler"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Siparişleri Aktif Et
                    </button>
                    <button
                      onClick={() => handleDownloadLogPdf(selectedLog, 'production')}
                      className="bg-[#0f417d] text-white px-5 py-2 rounded-full flex items-center gap-2 hover:bg-[#0c3363] transition-all active:scale-95 text-xs font-bold cursor-pointer shadow-md shadow-blue-900/10"
                      title="Müşteri isimlerinin gizlendiği, Sünger ve Ürün kontrol kutularının bulunduğu üretim odaklı PDF listesi"
                    >
                      <FileDown className="w-3.5 h-3.5" />
                      Üretim PDF İndir (İsimsiz)
                    </button>
                    <button
                      onClick={() => handleDownloadLogPdf(selectedLog, 'warehouse')}
                      className="bg-black text-white px-5 py-2 rounded-full flex items-center gap-2 hover:bg-black/90 transition-all active:scale-95 text-xs font-bold cursor-pointer shadow-md shadow-black/5"
                      title="Müşteri isimlerinin gösterildiği, Paket kontrol kutusunun bulunduğu depo/sevkiyat odaklı PDF listesi"
                    >
                      <FileDown className="w-3.5 h-3.5" />
                      Depo PDF İndir (İsimli)
                    </button>
                    <button
                      onClick={(e) => handleDeleteLog(selectedLog.id, e)}
                      className="p-2 hover:bg-red-50 text-red-500 rounded-full transition-colors border border-transparent hover:border-red-100 cursor-pointer"
                      title="Geçmiş Kaydı Sil"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </header>

              <main className="flex-1 p-8 overflow-auto min-h-0">
                {selectedLog ? (
                  <div className="max-w-5xl mx-auto space-y-6">
                    {/* Log Dashboard Row */}
                    <div className="bg-white rounded-3xl p-6 border border-black/5 shadow-sm flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                      <div>
                        <div className="flex items-center gap-2.5">
                          <History className="w-5 h-5 text-black/60" />
                          <h2 className="text-lg font-bold tracking-tight">{selectedLog.dateStr} Tarihli Rapor</h2>
                        </div>
                        <p className="text-[11px] text-black/50 mt-1 flex items-center gap-1">
                          <span>PDF Dosya Adı:</span>
                          <span className="font-mono bg-[#F5F5F0] px-2 py-0.5 rounded text-xs text-black/80">{selectedLog.filename}</span>
                        </p>
                      </div>
                      <div className="bg-[#F5F5F0] rounded-2xl px-5 py-3 text-center self-stretch sm:self-auto flex sm:flex-col justify-between sm:justify-center items-center">
                        <span className="text-[10px] font-bold uppercase text-black/40">Toplam Sipariş</span>
                        <span className="text-2xl font-black text-black">{selectedLog.orderCount} adet</span>
                      </div>
                    </div>

                    {/* Order Details List Table */}
                    <div className="bg-white rounded-3xl border border-black/5 shadow-sm overflow-hidden">
                      <div className="border-b border-black/5 px-6 py-4">
                        <h3 className="font-bold text-xs uppercase tracking-wider text-black/60">Arşivlenmiş Sipariş Detayları</h3>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                          <thead>
                            <tr className="bg-[#F5F5F0] text-[10px] font-bold uppercase tracking-wider text-black/40 border-b border-black/5">
                              <th className="px-5 py-3 text-center w-12">No</th>
                              <th className="px-5 py-3">Sipariş No</th>
                              <th className="px-5 py-3">Müşteri Adı</th>
                              <th className="px-5 py-3">Kumaş Kodu</th>
                              <th className="px-5 py-3">Kumaş Yönü</th>
                              <th className="px-5 py-3">Ek Bilgi</th>
                              <th className="px-5 py-3">Ölçüler</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-black/5 text-xs">
                            {selectedLog.orders.map((o, idx) => (
                              <tr key={o.id} className="hover:bg-black/[0.01]">
                                <td className="px-5 py-3.5 text-center text-xs font-bold text-black/40">{idx + 1}</td>
                                <td className="px-5 py-3.5 font-mono font-bold text-xs">{o.orderId}</td>
                                <td className="px-5 py-3.5 font-bold text-sm text-black">{o.customerName}</td>
                                <td className="px-5 py-3.5 font-semibold text-black/80">{o.fabricCode}</td>
                                <td className="px-5 py-3.5 uppercase text-black/60">{o.lineDirection}</td>
                                <td className="px-5 py-3.5 italic text-black/60">{o.extraInfo || '-'}</td>
                                <td className="px-5 py-3.5 font-mono font-black text-black">{o.dimensions}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="h-full flex flex-col items-center justify-center text-center max-w-sm mx-auto opacity-70">
                    <div className="w-20 h-20 bg-white rounded-3xl flex items-center justify-center mb-5 shadow-sm border border-black/5">
                      <History className="w-9 h-9 opacity-40 text-black" />
                    </div>
                    <h2 className="text-base font-bold text-black mb-1.5">Bir Günlük Rapor Seçin</h2>
                    <p className="text-xs text-black/50 leading-relaxed">
                      Sistemde yapılmış olan tüm yazım işlemlerinin geriye dönük arşivi soldaki listede gösterilir. Ayrıntıları görüntülemek için seçim yapın.
                    </p>
                  </div>
                )}
              </main>
            </div>
          )}
        </div>
      </div>

      {/* Settings Modal */}
      <AnimatePresence>
        {showSettings && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowSettings(false)}
              className="absolute inset-0 bg-black/20 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-md bg-white rounded-3xl shadow-2xl overflow-hidden border border-black/5"
            >
              <div className="p-6 border-b border-black/5 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-black rounded-xl flex items-center justify-center shrink-0">
                    <Settings className="text-white w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-bold text-lg">Yazdırma Ayarları</h3>
                    <p className="text-xs opacity-50">Xprinter XP-470B Yapılandırması</p>
                  </div>
                </div>
                <button
                  onClick={() => setShowSettings(false)}
                  className="p-2 hover:bg-black/5 rounded-full transition-colors cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-8 space-y-6">
                <div className="grid grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold uppercase tracking-widest opacity-40">Genişlik (mm)</label>
                    <input
                      type="number"
                      value={printSettings.width}
                      onChange={(e) => setPrintSettings((prev: any) => ({ ...prev, width: parseInt(e.target.value) || 0 }))}
                      className="w-full bg-[#F5F5F0] border-none rounded-xl py-3 px-4 font-mono font-bold focus:ring-2 focus:ring-black/5 outline-none text-sm"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold uppercase tracking-widest opacity-40">Yükseklik (mm)</label>
                    <input
                      type="number"
                      value={printSettings.height}
                      onChange={(e) => setPrintSettings((prev: any) => ({ ...prev, height: parseInt(e.target.value) || 0 }))}
                      className="w-full bg-[#F5F5F0] border-none rounded-xl py-3 px-4 font-mono font-bold focus:ring-2 focus:ring-black/5 outline-none text-sm"
                    />
                  </div>
                </div>

                <div className="flex items-center gap-3 p-4 bg-[#F5F5F0]/60 border border-black/5 rounded-2xl cursor-pointer hover:bg-[#F5F5F0]"
                  onClick={() => setPrintSettings((prev: any) => ({ ...prev, hideCustomerNames: !prev.hideCustomerNames }))}
                >
                  <input
                    type="checkbox"
                    checked={printSettings.hideCustomerNames}
                    onChange={() => {}} // Handled by parent wrapper div onClick click-through
                    className="w-4 h-4 rounded border-black/25 text-black focus:ring-black cursor-pointer"
                  />
                  <div className="text-left">
                    <p className="text-xs font-bold leading-none text-black">İsimsiz Çıktı Modu (İsimleri Gizle)</p>
                    <p className="text-[10px] text-black/50 mt-1">Aktifken, tüm termal çıktı ve PDF raporlarında müşteri isimleri gizlenir.</p>
                  </div>
                </div>

                <div className="p-4 bg-black/5 rounded-2xl flex items-start gap-3">
                  <Package className="w-5 h-5 mt-0.5 opacity-40" />
                  <div className="text-xs leading-relaxed opacity-60">
                    <strong>İpucu:</strong> Xprinter XP-470B için standart etiket boyutu 100x100mm'dir. Farklı bir rulo kullanıyorsanız yukarıdaki değerleri güncelleyin.
                  </div>
                </div>
              </div>

              <div className="p-6 bg-[#F5F5F0] flex justify-end">
                <button
                  onClick={() => {
                    setShowSettings(false);
                    triggerToast('Yazdırma boyutları başarıyla güncellendi.', 'success');
                  }}
                  className="bg-black text-white px-8 py-3 rounded-full font-bold text-sm hover:bg-black/90 transition-all active:scale-95 cursor-pointer shadow-md shadow-black/10"
                >
                  Ayarları Kaydet
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
