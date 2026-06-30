import React, { useState, useMemo } from 'react';
import { 
  Clock, 
  Activity, 
  CheckCircle, 
  AlertTriangle, 
  Search, 
  ArrowLeft, 
  RefreshCw, 
  Check, 
  Menu,
  FileSpreadsheet,
  FileText,
  Layers,
  Sparkles,
  ChevronDown,
  ChevronUp,
  History,
  Users,
  Truck,
  Calendar,
  List,
  AlertCircle,
  Archive,
  ArchiveRestore,
  Coffee
} from 'lucide-react';
import { cn } from '../lib/utils';

interface Order {
  id: string;
  orderId: string;
  customerName: string;
  fabricCode: string;
  lineDirection: string;
  extraInfo: string;
  dimensions: string;
  createdAt?: string;
  pool?: 'B' | 'D' | string | null;
  status?: 'Bekleme' | 'Kuyrukta' | 'Üretimde' | 'Paketlendi' | 'Üretilemiyor' | 'Acil';
  isCleared?: boolean;
  isPreviewCleared?: boolean;
  statusHistory?: { status: string; timestamp: string }[];
}

interface SavedLog {
  id: string;
  timestamp: number;
  dateStr: string;
  orderCount: number;
  orders: Order[];
  filename: string;
  producerName?: string;
}

interface WorkshopOperationsProps {
  orders: Order[];
  setOrders: React.Dispatch<React.SetStateAction<Order[]>>;
  handleUpdateOrderStatus: (orderId: string, stage: 'Bekleme' | 'Kuyrukta' | 'Üretimde' | 'Paketlendi' | 'Üretilemiyor' | 'Acil') => void;
  triggerToast: (msg: string, type: 'success' | 'error' | 'info') => void;
  onOpenMenu: () => void;
  logs?: SavedLog[];
}

interface CustomerGroup {
  customerName: string;
  orders: Order[];
  totalCount: number;
  statusSummary: Record<string, number>;
  shippingStatus: 'ready' | 'pending' | 'blocked';
  shippingMessage: string;
}

export function WorkshopOperations({
  orders,
  setOrders,
  handleUpdateOrderStatus,
  triggerToast,
  onOpenMenu,
  logs = []
}: WorkshopOperationsProps) {
  // Navigation tabs: 'list' (Main List), 'groups' (Customer Groups), 'kanban' (Kanban Board)
  const [activeSubTab, setActiveSubTab] = useState<'list' | 'groups' | 'kanban'>('list');
  
  // Tab 1: List Filters & States
  const [listStageFilter, setListStageFilter] = useState<'Tümü' | 'Bekleme' | 'Acil' | 'Kuyrukta' | 'Üretimde' | 'Paketlendi' | 'Üretilemiyor' | 'Arşivlenmiş'>('Tümü');
  const [listSearchTerm, setListSearchTerm] = useState('');
  const [expandedOrderIds, setExpandedOrderIds] = useState<Record<string, boolean>>({});
  
  // Tab 2: Group Filters & States
  const [groupFilter, setGroupFilter] = useState<'all' | 'ready' | 'pending' | 'blocked'>('all');
  const [groupSearchTerm, setGroupSearchTerm] = useState('');
  const [expandedCustomers, setExpandedCustomers] = useState<Record<string, boolean>>({});

  // Kanban view states (We preserve the reports but place them in sub-tab)
  const [boardSearchTerm, setBoardSearchTerm] = useState('');
  const [selectedStageReport, setSelectedStageReport] = useState<'Bekleme' | 'Kuyrukta' | 'Üretimde' | 'Paketlendi' | 'Üretilemiyor' | 'Acil' | null>(null);
  const [reportSearchTerm, setReportSearchTerm] = useState('');
  const [selectedReportOrderIds, setSelectedReportOrderIds] = useState<string[]>([]);
  const [draggedOverStage, setDraggedOverStage] = useState<'Bekleme' | 'Kuyrukta' | 'Üretimde' | 'Paketlendi' | 'Üretilemiyor' | 'Acil' | null>(null);
  const [draggedOrderId, setDraggedOrderId] = useState<string | null>(null);

  const STAGES = ['Bekleme', 'Acil', 'Kuyrukta', 'Üretimde', 'Paketlendi', 'Üretilemiyor'] as const;

  const allOrders = useMemo(() => {
    const list: Order[] = [];
    const activeSignatures = new Set<string>();

    // 1. Add all active orders as they are (no deduplication among active orders)
    orders.forEach(o => {
      list.push(o);
      const sig = `${o.orderId}|${o.customerName}|${o.fabricCode}|${o.dimensions}`.trim().toUpperCase();
      activeSignatures.add(sig);
    });

    // 2. Add orders from logs if their signature does not already exist in the active orders
    if (logs) {
      const archivedMap = new Map<string, Order>();
      logs.forEach(log => {
        log.orders.forEach(o => {
          const sig = `${o.orderId}|${o.customerName}|${o.fabricCode}|${o.dimensions}`.trim().toUpperCase();
          if (!activeSignatures.has(sig) && !archivedMap.has(sig)) {
            archivedMap.set(sig, {
              ...o,
              // If not in active orders, mark as cleared (archived)
              isCleared: o.isCleared !== undefined ? o.isCleared : true
            });
          }
        });
      });
      list.push(...archivedMap.values());
    }

    return list;
  }, [orders, logs]);

  const getDuplicateLists = (o: Order) => {
    if (!logs || logs.length === 0) return [];
    const oIdClean = o.orderId.trim().toLowerCase();
    return logs.filter(log => 
      log.orders.some(lo => lo.orderId.trim().toLowerCase() === oIdClean)
    );
  };

  const localUpdateOrderStatus = (orderId: string, stage: 'Bekleme' | 'Kuyrukta' | 'Üretimde' | 'Paketlendi' | 'Üretilemiyor' | 'Acil') => {
    // Check if the order is already in the active orders list
    const exists = orders.some(o => o.id === orderId);
    if (!exists) {
      // Find the order in logs to get its full data
      let orderToAdd: Order | undefined;
      if (logs) {
        for (const log of logs) {
          const found = log.orders.find(o => o.id === orderId);
          if (found) {
            orderToAdd = found;
            break;
          }
        }
      }
      
      if (orderToAdd) {
        // Add to active orders with the new status
        const nowStr = new Date().toLocaleString('tr-TR');
        const history = orderToAdd.statusHistory || [];
        const newOrder: Order = {
          ...orderToAdd,
          status: stage,
          isCleared: false,
          statusHistory: [...history, { status: stage, timestamp: nowStr }]
        };
        setOrders(prev => [newOrder, ...prev]);
        triggerToast(`Sipariş aşaması "${stage}" olarak güncellendi ve aktif listeye eklendi.`, 'success');
        return;
      }
    }
    
    // Otherwise, call the standard handler
    handleUpdateOrderStatus(orderId, stage);
  };

  const handleToggleArchive = (orderId: string, currentlyArchived?: boolean) => {
    // Check if the order is in active orders
    const exists = orders.some(o => o.id === orderId);
    if (!exists) {
      // Find the order in logs to get its full data
      let orderToAdd: Order | undefined;
      if (logs) {
        for (const log of logs) {
          const found = log.orders.find(o => o.id === orderId);
          if (found) {
            orderToAdd = found;
            break;
          }
        }
      }
      
      if (orderToAdd) {
        // Add to active orders with isCleared: false
        const newOrder: Order = {
          ...orderToAdd,
          isCleared: false
        };
        setOrders(prev => [newOrder, ...prev]);
        triggerToast('Sipariş arşivden çıkarıldı ve aktif listeye eklendi.', 'success');
        return;
      }
    } else {
      // Toggle isCleared in active orders
      setOrders(prev => prev.map(o => o.id === orderId ? { ...o, isCleared: !currentlyArchived } : o));
      triggerToast(currentlyArchived ? 'Sipariş aktif listeye geri alındı.' : 'Sipariş arşivlendi.', 'success');
    }
  };

  // Icons and colors for stages
  const STAGE_CONFIG = {
    'Bekleme': {
      title: 'Bekleme Salonu',
      description: 'Yeni Yüklenen Siparişler',
      color: 'bg-violet-50 border-violet-100 text-violet-700',
      badge: 'bg-violet-100 text-violet-700 border-violet-200/50',
      icon: Coffee,
      hoverColor: 'hover:bg-violet-50/80',
      textClass: 'text-violet-700 bg-violet-50 border-violet-100'
    },
    'Acil': {
      title: 'Acil',
      description: 'Öncelikli Takip Kodlular',
      color: 'bg-amber-50 border-amber-200 text-amber-700',
      badge: 'bg-amber-500 text-white border-amber-600 animate-pulse',
      icon: Sparkles,
      hoverColor: 'hover:bg-amber-50/80',
      textClass: 'text-amber-700 bg-amber-50 border-amber-200'
    },
    'Kuyrukta': {
      title: 'Kuyrukta',
      description: 'Sıradaki Siparişler',
      color: 'bg-slate-50 border-slate-200 text-slate-700',
      badge: 'bg-slate-100 text-slate-700 border-slate-200',
      icon: Clock,
      hoverColor: 'hover:bg-slate-50/80',
      textClass: 'text-slate-700 bg-slate-50 border-slate-200'
    },
    'Üretimde': {
      title: 'Üretimde',
      description: 'Aktif İşlenenler',
      color: 'bg-blue-50 border-blue-100 text-blue-700',
      badge: 'bg-blue-100 text-blue-700 border-blue-200/50',
      icon: Activity,
      hoverColor: 'hover:bg-blue-50/80',
      textClass: 'text-blue-700 bg-blue-50 border-blue-100'
    },
    'Paketlendi': {
      title: 'Paketlendi',
      description: 'Hazır ve Sarılmış',
      color: 'bg-green-50 border-green-100 text-green-700',
      badge: 'bg-green-100 text-green-700 border-green-200/50',
      icon: CheckCircle,
      hoverColor: 'hover:bg-green-50/80',
      textClass: 'text-green-700 bg-green-50 border-green-150'
    },
    'Üretilemiyor': {
      title: 'Üretilemiyor',
      description: 'Sorunlu/Eksik Bilgi',
      color: 'bg-red-50 border-red-100 text-red-700',
      badge: 'bg-red-100 text-red-700 border-red-200/50',
      icon: AlertTriangle,
      hoverColor: 'hover:bg-red-50/80',
      textClass: 'text-red-700 bg-red-50 border-red-100'
    }
  };

  // --- DRAG AND DROP ---
  const handleDragStart = (e: React.DragEvent, orderId: string) => {
    setDraggedOrderId(orderId);
    e.dataTransfer.setData('text/plain', orderId);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragEnd = () => {
    setDraggedOrderId(null);
    setDraggedOverStage(null);
  };

  const handleDragOver = (e: React.DragEvent, stage: 'Bekleme' | 'Kuyrukta' | 'Üretimde' | 'Paketlendi' | 'Üretilemiyor' | 'Acil') => {
    e.preventDefault();
    if (draggedOverStage !== stage) {
      setDraggedOverStage(stage);
    }
  };

  const handleDrop = (e: React.DragEvent, stage: 'Bekleme' | 'Kuyrukta' | 'Üretimde' | 'Paketlendi' | 'Üretilemiyor' | 'Acil') => {
    e.preventDefault();
    const orderId = e.dataTransfer.getData('text/plain') || draggedOrderId;
    if (orderId) {
      localUpdateOrderStatus(orderId, stage);
    }
    setDraggedOverStage(null);
    setDraggedOrderId(null);
  };

  // --- STATS & COUNTS ---
  const totalCounts = useMemo(() => {
    const counts = {
      'Bekleme': 0,
      'Acil': 0,
      'Kuyrukta': 0,
      'Üretimde': 0,
      'Paketlendi': 0,
      'Üretilemiyor': 0,
      'Toplam': 0,
      'Arşivlenmiş': 0
    };
    allOrders.forEach(order => {
      if (order.isCleared) {
        counts.Arşivlenmiş++;
        return;
      }
      counts.Toplam++;
      const status = order.status || 'Kuyrukta';
      if (status in counts) {
        counts[status as keyof typeof counts]++;
      }
    });
    return counts;
  }, [allOrders]);

  // --- CUSTOMER GROUPING LOGIC (sequential order analysis) ---
  const customerGroups = useMemo(() => {
    const groups: Record<string, Order[]> = {};
    allOrders.forEach(order => {
      if (order.isCleared) return; // Skip archived for active groupings
      const key = order.customerName.trim().replace(/\s+/g, ' ').toUpperCase();
      if (!groups[key]) {
        groups[key] = [];
      }
      groups[key].push(order);
    });

    const list: CustomerGroup[] = Object.entries(groups).map(([key, groupOrders]) => {
      // Sort orders by orderId so sequential digits are sorted numerically
      const sortedOrders = [...groupOrders].sort((a, b) => {
        const aNum = parseInt(a.orderId.replace(/\D/g, ''), 10);
        const bNum = parseInt(b.orderId.replace(/\D/g, ''), 10);
        if (!isNaN(aNum) && !isNaN(bNum)) {
          return aNum - bNum;
        }
        return a.orderId.localeCompare(b.orderId);
      });

      const counts = {
        'Acil': 0,
        'Kuyrukta': 0,
        'Üretimde': 0,
        'Paketlendi': 0,
        'Üretilemiyor': 0
      };

      sortedOrders.forEach(o => {
        const status = o.status || 'Kuyrukta';
        if (status in counts) {
          counts[status as keyof typeof counts]++;
        }
      });

      // Analyze shipping safety
      let shippingStatus: 'ready' | 'pending' | 'blocked' = 'pending';
      let shippingMessage = '';

      if (counts['Üretilemiyor'] > 0) {
        shippingStatus = 'blocked';
        shippingMessage = '❌ Sevk Edilemez: Üretilemeyen sorunlu parça var!';
      } else if (counts['Paketlendi'] === sortedOrders.length) {
        shippingStatus = 'ready';
        shippingMessage = '✅ Sevk Edilebilir: Tüm siparişler paketlendi.';
      } else {
        const ready = counts['Paketlendi'];
        const total = sortedOrders.length;
        shippingStatus = 'pending';
        shippingMessage = `⏳ Beklemede: Hazırlanan parça var (${ready}/${total} bitti). Sevk etmeyin!`;
      }

      return {
        customerName: sortedOrders[0].customerName, // Original casing display
        orders: sortedOrders,
        totalCount: sortedOrders.length,
        statusSummary: counts,
        shippingStatus,
        shippingMessage
      };
    });

    // Sort by count descending, then alphabetical customer name
    return list.sort((a, b) => b.totalCount - a.totalCount || a.customerName.localeCompare(b.customerName));
  }, [allOrders]);

  // --- BULK CUSTOMER GROUPS (Only multiple active orders and not fully completed/shipped) ---
  const bulkCustomerGroups = useMemo(() => {
    return customerGroups.filter(g => {
      // 1. Must have more than 1 active order
      if (g.totalCount <= 1) return false;
      
      // 2. Must not have all orders in 'Paketlendi' state
      const statusPaketlendiCount = g.statusSummary['Paketlendi'] || 0;
      if (statusPaketlendiCount === g.totalCount) return false;
      
      return true;
    });
  }, [customerGroups]);

  // Filtered bulk customer groups based on tab filter & search
  const filteredCustomerGroups = useMemo(() => {
    return bulkCustomerGroups.filter(g => {
      // 1. Stage classification filter
      if (groupFilter === 'ready' && g.shippingStatus !== 'ready') return false;
      if (groupFilter === 'blocked' && g.shippingStatus !== 'blocked') return false;
      if (groupFilter === 'pending' && g.shippingStatus !== 'pending') return false;

      // 2. Search term
      const term = groupSearchTerm.toLowerCase();
      if (!term) return true;
      return (
        g.customerName.toLowerCase().includes(term) ||
        g.orders.some(o => o.orderId.toLowerCase().includes(term) || o.fabricCode.toLowerCase().includes(term))
      );
    });
  }, [bulkCustomerGroups, groupFilter, groupSearchTerm]);

  // --- MAIN TAB 1: LIST FILTERS & RENDER ---
  const filteredListOrders = useMemo(() => {
    return allOrders.filter(o => {
      // Filter by stage
      if (listStageFilter === 'Arşivlenmiş') {
        if (!o.isCleared) return false;
      } else {
        if (o.isCleared) return false;
        if (listStageFilter !== 'Tümü') {
          const s = o.status || 'Kuyrukta';
          if (s !== listStageFilter) return false;
        }
      }

      // Filter by search term
      const term = listSearchTerm.toLowerCase();
      if (!term) return true;
      return (
        o.customerName.toLowerCase().includes(term) ||
        o.orderId.toString().includes(term) ||
        o.fabricCode.toLowerCase().includes(term) ||
        o.dimensions.toLowerCase().includes(term) ||
        (o.extraInfo && o.extraInfo.toLowerCase().includes(term))
      );
    });
  }, [allOrders, listStageFilter, listSearchTerm]);

  // Group matching filtered orders by customer name
  const groupedListOrders = useMemo(() => {
    const groups: Record<string, Order[]> = {};
    filteredListOrders.forEach(order => {
      const key = order.customerName.trim().replace(/\s+/g, ' ').toUpperCase();
      if (!groups[key]) {
        groups[key] = [];
      }
      groups[key].push(order);
    });

    const list = Object.entries(groups).map(([key, groupOrders]) => {
      // Sort orders by orderId numerically if possible
      const sorted = [...groupOrders].sort((a, b) => {
        const aNum = parseInt(a.orderId.replace(/\D/g, ''), 10);
        const bNum = parseInt(b.orderId.replace(/\D/g, ''), 10);
        if (!isNaN(aNum) && !isNaN(bNum)) {
          return aNum - bNum;
        }
        return a.orderId.localeCompare(b.orderId);
      });

      return {
        customerName: sorted[0].customerName, // Original casing display
        orders: sorted,
        isGroup: sorted.length > 1
      };
    });

    // Sort by customer name alphabetically
    return list.sort((a, b) => a.customerName.localeCompare(b.customerName));
  }, [filteredListOrders]);

  // --- KANBAN VIEW LOGIC (REPORT NESTED) ---
  const boardFilteredOrders = useMemo(() => {
    return allOrders.filter(order => {
      if (order.isCleared) return false;
      const status = order.status || 'Kuyrukta';
      const term = boardSearchTerm.toLowerCase();
      if (!term) return true;
      return (
        order.customerName.toLowerCase().includes(term) ||
        order.orderId.toString().includes(term) ||
        order.fabricCode.toLowerCase().includes(term) ||
        order.dimensions.toLowerCase().includes(term)
      );
    });
  }, [allOrders, boardSearchTerm]);

  const stageGroups = useMemo(() => {
    const groups: Record<'Bekleme' | 'Kuyrukta' | 'Üretimde' | 'Paketlendi' | 'Üretilemiyor' | 'Acil', Order[]> = {
      'Bekleme': [],
      'Acil': [],
      'Kuyrukta': [],
      'Üretimde': [],
      'Paketlendi': [],
      'Üretilemiyor': []
    };
    
    boardFilteredOrders.forEach(order => {
      const status = order.status || 'Kuyrukta';
      if (groups[status as keyof typeof groups]) {
        groups[status as keyof typeof groups].push(order);
      }
    });
    
    return groups;
  }, [boardFilteredOrders]);

  const reportOrders = useMemo(() => {
    if (!selectedStageReport) return [];
    return allOrders.filter(o => (o.status || 'Kuyrukta') === selectedStageReport && !o.isCleared);
  }, [allOrders, selectedStageReport]);

  const filteredReportOrders = useMemo(() => {
    const term = reportSearchTerm.toLowerCase();
    if (!term) return reportOrders;
    return reportOrders.filter(o => 
      o.customerName.toLowerCase().includes(term) ||
      o.orderId.toString().includes(term) ||
      o.fabricCode.toLowerCase().includes(term) ||
      o.dimensions.toLowerCase().includes(term) ||
      (o.extraInfo && o.extraInfo.toLowerCase().includes(term))
    );
  }, [reportOrders, reportSearchTerm]);

  const handleBulkReactivate = (targetStage: 'Kuyrukta' | 'Üretimde' | 'Paketlendi' | 'Üretilemiyor' | 'Acil' = 'Kuyrukta') => {
    const idsToUpdate = selectedReportOrderIds.length > 0 
      ? selectedReportOrderIds 
      : filteredReportOrders.map(o => o.id);

    if (idsToUpdate.length === 0) {
      triggerToast('Reaktif edilecek sipariş bulunamadı.', 'error');
      return;
    }

    setOrders(prev => {
      const nowStr = new Date().toLocaleString('tr-TR');
      return prev.map(o => {
        if (idsToUpdate.includes(o.id)) {
          const history = o.statusHistory || [];
          return { 
            ...o, 
            status: targetStage, 
            isCleared: false,
            statusHistory: [...history, { status: targetStage, timestamp: nowStr }]
          };
        }
        return o;
      });
    });
    triggerToast(`${idsToUpdate.length} adet sipariş "${targetStage}" durumuna geri alındı.`, 'success');
    setSelectedReportOrderIds([]);
  };

  const toggleSelectAllReport = (checked: boolean) => {
    if (checked) {
      setSelectedReportOrderIds(filteredReportOrders.map(o => o.id));
    } else {
      setSelectedReportOrderIds([]);
    }
  };

  const handleRowCheckboxChange = (orderId: string, checked: boolean) => {
    setSelectedReportOrderIds(prev => 
      checked ? [...prev, orderId] : prev.filter(id => id !== orderId)
    );
  };

  const toggleExpandOrder = (id: string) => {
    setExpandedOrderIds(prev => ({
      ...prev,
      [id]: !prev[id]
    }));
  };

  const toggleExpandCustomer = (name: string) => {
    setExpandedCustomers(prev => ({
      ...prev,
      [name]: !prev[name]
    }));
  };

  return (
    <div id="workshop-operations-main" className="flex-1 flex flex-col h-full min-h-0 bg-[#F5F5F0]">
      
      {/* 1. Header Area */}
      <header className="h-16 bg-white border-b border-black/5 px-4 md:px-8 flex items-center justify-between shrink-0 z-10">
        <div className="flex items-center gap-3">
          <button 
            onClick={onOpenMenu}
            className="p-2 hover:bg-[#F5F5F0] rounded-xl text-black/60 hover:text-black transition-colors"
          >
            <Menu className="w-5 h-5" />
          </button>
          
          <div className="flex items-center gap-2">
            <Layers className="w-5 h-5 text-black" />
            <h1 className="text-base font-extrabold tracking-tight text-black">Atölye Operasyon</h1>
          </div>
          
          {selectedStageReport && (
            <>
              <div className="h-4 w-[1px] bg-black/10 shrink-0" />
              <button 
                onClick={() => {
                  setSelectedStageReport(null);
                  setReportSearchTerm('');
                  setSelectedReportOrderIds([]);
                }}
                className="flex items-center gap-1 px-2.5 py-1 text-[11px] font-bold text-black/60 hover:text-black bg-black/5 hover:bg-black/10 rounded-lg transition-all"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Panoya Dön</span>
              </button>
            </>
          )}
        </div>

        {/* Global Summary Stats */}
        <div className="hidden lg:flex items-center gap-3 text-[10px] font-black uppercase tracking-wider text-black/60">
          <div className="bg-amber-50 px-2.5 py-1.5 rounded-xl border border-amber-100 flex items-center gap-1.5 text-amber-700 font-extrabold">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
            <span>Acil: {totalCounts['Acil']}</span>
          </div>
          <div className="bg-slate-50 px-2.5 py-1.5 rounded-xl border border-slate-200 flex items-center gap-1.5 text-slate-700">
            <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
            <span>Kuyrukta: {totalCounts['Kuyrukta']}</span>
          </div>
          <div className="bg-blue-50 px-2.5 py-1.5 rounded-xl border border-blue-100 flex items-center gap-1.5 text-blue-700">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
            <span>Üretimde: {totalCounts['Üretimde']}</span>
          </div>
          <div className="bg-green-50 px-2.5 py-1.5 rounded-xl border border-green-100 flex items-center gap-1.5 text-green-700">
            <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
            <span>Paketlendi: {totalCounts['Paketlendi']}</span>
          </div>
          <div className="bg-red-50 px-2.5 py-1.5 rounded-xl border border-red-150 flex items-center gap-1.5 text-red-700">
            <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
            <span>Sorunlu: {totalCounts['Üretilemiyor']}</span>
          </div>
        </div>
      </header>

      {/* 2. TAB CONTROL BAR */}
      {!selectedStageReport && (
        <div className="bg-white border-b border-black/5 px-4 md:px-8 py-2.5 flex flex-col sm:flex-row items-stretch sm:items-center justify-between shrink-0 gap-3 z-10">
          <div className="flex bg-[#F5F5F0] p-1 rounded-xl border border-black/5 self-start shadow-xs overflow-x-auto max-w-full shrink-0 scrollbar-none">
            <button
              onClick={() => setActiveSubTab('list')}
              className={cn(
                "px-4 py-1.5 rounded-lg text-xs font-black uppercase tracking-wider transition-all cursor-pointer flex items-center gap-1.5 whitespace-nowrap shrink-0",
                activeSubTab === 'list' ? "bg-white text-black shadow-xs" : "text-black/60 hover:text-black"
              )}
            >
              <List className="w-3.5 h-3.5" />
              <span>Sipariş Listesi</span>
            </button>
            <button
              onClick={() => setActiveSubTab('groups')}
              className={cn(
                "px-4 py-1.5 rounded-lg text-xs font-black uppercase tracking-wider transition-all cursor-pointer flex items-center gap-1.5 whitespace-nowrap shrink-0",
                activeSubTab === 'groups' ? "bg-white text-black shadow-xs" : "text-black/60 hover:text-black"
              )}
            >
              <Users className="w-3.5 h-3.5" />
              <span>Toplu Sipariş ({bulkCustomerGroups.length})</span>
            </button>
            <button
              onClick={() => setActiveSubTab('kanban')}
              className={cn(
                "px-4 py-1.5 rounded-lg text-xs font-black uppercase tracking-wider transition-all cursor-pointer flex items-center gap-1.5 whitespace-nowrap shrink-0",
                activeSubTab === 'kanban' ? "bg-white text-black shadow-xs" : "text-black/60 hover:text-black"
              )}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>Kanban Panosu</span>
            </button>
          </div>

          <div className="flex items-center gap-2 text-[11px] text-black/50 font-black uppercase tracking-wider">
            {activeSubTab === 'list' && <span>Aşama ve Tarihçe Odaklı Liste</span>}
            {activeSubTab === 'groups' && <span>Toplu Sipariş Sevkiyat Kontrolü</span>}
            {activeSubTab === 'kanban' && <span>Sürükle & Bırak Akışı</span>}
          </div>
        </div>
      )}

      {/* 3. MAIN TAB VIEWS */}
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
        
        {selectedStageReport ? (
          /* NESTED DETAILED STAGE REPORT VIEW */
          <div className="flex-1 flex flex-col min-h-0 overflow-hidden bg-white">
            <div className="p-4 md:p-6 border-b border-black/5 bg-[#F5F5F0]/30 flex flex-col md:flex-row gap-4 md:items-center justify-between shrink-0">
              <div>
                <div className="flex items-center gap-2">
                  <span className={cn(
                    "p-1.5 rounded-lg text-white", 
                    selectedStageReport === 'Kuyrukta' && "bg-slate-700",
                    selectedStageReport === 'Üretimde' && "bg-blue-600",
                    selectedStageReport === 'Paketlendi' && "bg-green-600",
                    selectedStageReport === 'Üretilemiyor' && "bg-red-600",
                    selectedStageReport === 'Acil' && "bg-amber-500"
                  )}>
                    {React.createElement(STAGE_CONFIG[selectedStageReport].icon, { className: "w-4 h-4" })}
                  </span>
                  <h2 className="text-base font-extrabold text-black">
                    {selectedStageReport} Aşaması Detaylı Raporu
                  </h2>
                </div>
                <p className="text-xs text-black/50 mt-1">
                  Şu anda bu aşamada toplam <span className="font-extrabold text-black">{reportOrders.length} adet</span> aktif etiket bulunuyor.
                </p>
              </div>

              <div className="relative w-full md:w-80">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-black/40" />
                <input
                  type="text"
                  placeholder={`Bu listede ara...`}
                  value={reportSearchTerm}
                  onChange={(e) => {
                    setReportSearchTerm(e.target.value);
                    setSelectedReportOrderIds([]);
                  }}
                  className="w-full bg-white border border-black/10 rounded-xl py-2 pl-9 pr-4 text-xs font-bold text-black placeholder:text-black/30 focus:outline-none focus:ring-1 focus:ring-black"
                />
              </div>
            </div>

            {/* Bulk Action Panel for Checked Rows */}
            <div className="px-4 py-3 border-b border-black/5 bg-slate-950 text-white flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0">
              <div className="flex items-center gap-2.5">
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Toplu İşlemler</span>
                <div className="h-4 w-[1px] bg-white/20" />
                <p className="text-[11px] text-slate-300">
                  {selectedReportOrderIds.length > 0 ? (
                    <>Seçilen <span className="font-extrabold text-white">{selectedReportOrderIds.length} adet</span> etiket üzerinde işlem yapılıyor:</>
                  ) : (
                    <>Filtreye eşleşen <span className="font-extrabold text-white">{filteredReportOrders.length} adet</span> etiket üzerinde işlem yapılıyor:</>
                  )}
                </p>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <button
                  onClick={() => handleBulkReactivate('Kuyrukta')}
                  className="bg-green-600 hover:bg-green-700 active:scale-95 text-white py-1.5 px-3.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all flex items-center gap-1.5 cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5 animate-spin-hover" />
                  <span>{selectedReportOrderIds.length > 0 ? 'Seçilenleri Kuyruğa Gönder' : 'Tüm Listeyi Kuyruğa Gönder'}</span>
                </button>

                {selectedStageReport !== 'Üretimde' && (
                  <button
                    onClick={() => handleBulkReactivate('Üretimde')}
                    className="bg-blue-600 hover:bg-blue-700 active:scale-95 text-white py-1.5 px-3.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all flex items-center gap-1.5 cursor-pointer"
                  >
                    <Activity className="w-3.5 h-3.5" />
                    <span>{selectedReportOrderIds.length > 0 ? 'Seçilenleri Üretime Al' : 'Tümünü Üretime Al'}</span>
                  </button>
                )}

                {selectedStageReport !== 'Acil' && (
                  <button
                    onClick={() => handleBulkReactivate('Acil')}
                    className="bg-amber-500 hover:bg-amber-600 active:scale-95 text-white py-1.5 px-3.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all flex items-center gap-1.5 cursor-pointer"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>{selectedReportOrderIds.length > 0 ? 'Seçilenleri Acil\'e Al' : 'Tümünü Acil\'e Al'}</span>
                  </button>
                )}
                
                {selectedReportOrderIds.length > 0 && (
                  <button 
                    onClick={() => setSelectedReportOrderIds([])}
                    className="text-slate-400 hover:text-white text-[10px] font-black uppercase tracking-wider px-2 py-1.5 cursor-pointer"
                  >
                    Seçimi Temizle
                  </button>
                )}
              </div>
            </div>

            {/* Table Container */}
            <div className="flex-1 overflow-auto">
              {filteredReportOrders.length === 0 ? (
                <div className="h-64 flex flex-col items-center justify-center text-center p-6">
                  <AlertTriangle className="w-10 h-10 text-black/20 mb-3" />
                  <h4 className="font-extrabold text-sm text-black">Uyumlu Sipariş Bulunamadı</h4>
                  <p className="text-xs text-black/50 mt-1 max-w-sm">
                    Arama terimine ait bu aşamada kayıt bulunamadı. Lütfen filtreyi kontrol edin.
                  </p>
                </div>
              ) : (
                <table className="w-full text-left border-collapse min-w-[800px]">
                  <thead>
                    <tr className="bg-[#F5F5F0] text-[10px] font-black uppercase tracking-wider text-black/40 border-b border-black/5 sticky top-0 z-10">
                      <th className="px-5 py-3.5 text-center w-12 select-none">
                        <button
                          type="button"
                          onClick={() => {
                            const allSelected = filteredReportOrders.length > 0 && filteredReportOrders.every(o => selectedReportOrderIds.includes(o.id));
                            toggleSelectAllReport(!allSelected);
                          }}
                          className="inline-flex items-center justify-center p-1 hover:bg-black/5 rounded transition-all focus:outline-none cursor-pointer"
                        >
                          {filteredReportOrders.length > 0 && filteredReportOrders.every(o => selectedReportOrderIds.includes(o.id)) ? (
                            <div className="w-4 h-4 rounded bg-black text-white flex items-center justify-center border border-black shadow-xs">
                              <Check className="w-3 h-3 stroke-[3]" />
                            </div>
                          ) : (
                            <div className="w-4 h-4 rounded bg-white border border-black/20 hover:border-black/40" />
                          )}
                        </button>
                      </th>
                      <th className="px-5 py-3.5 text-center w-12">Sıra</th>
                      <th className="px-5 py-3.5">Sipariş No</th>
                      <th className="px-5 py-3.5">Müşteri Adı</th>
                      <th className="px-5 py-3.5">Kumaş Kodu</th>
                      <th className="px-5 py-3.5">Kumaş Yönü</th>
                      <th className="px-5 py-3.5">Ek Bilgi</th>
                      <th className="px-5 py-3.5">Ölçüler</th>
                      <th className="px-5 py-3.5 text-right">Eylem</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-black/5 text-xs">
                    {filteredReportOrders.map((order, index) => {
                      const isChecked = selectedReportOrderIds.includes(order.id);
                      return (
                        <tr 
                          key={order.id} 
                          className={cn(
                            "hover:bg-[#F5F5F0]/30 transition-all",
                            isChecked && "bg-slate-50 hover:bg-slate-100/50"
                          )}
                        >
                          <td className="px-5 py-3 text-center">
                            <button
                              type="button"
                              onClick={() => handleRowCheckboxChange(order.id, !isChecked)}
                              className="inline-flex items-center justify-center p-1 hover:bg-black/5 rounded transition-all focus:outline-none cursor-pointer"
                            >
                              {isChecked ? (
                                <div className="w-4 h-4 rounded bg-black text-white flex items-center justify-center border border-black shadow-xs">
                                  <Check className="w-3 h-3 stroke-[3]" />
                                </div>
                              ) : (
                                <div className="w-4 h-4 rounded bg-white border border-black/15 hover:border-black/35" />
                              )}
                            </button>
                          </td>
                          <td className="px-5 py-3 text-center text-black/40 font-mono font-bold">{index + 1}</td>
                          <td className="px-5 py-3 font-mono font-bold text-black">{order.orderId}</td>
                          <td className="px-5 py-3 font-extrabold text-black uppercase">
                            <div>{order.customerName}</div>
                            {getDuplicateLists(order).length > 1 && (
                              <div className="mt-1 flex flex-col gap-0.5 text-[8px] text-red-600 bg-red-50 border border-red-100 rounded p-1 font-bold normal-case max-w-[150px] leading-tight">
                                <span className="flex items-center gap-0.5 font-extrabold">
                                  <AlertTriangle className="w-2.5 h-2.5 text-red-500 shrink-0" />
                                  <span>Mükerrer!</span>
                                </span>
                                <span className="opacity-80 font-medium whitespace-nowrap overflow-hidden text-ellipsis" title={getDuplicateLists(order).map(l => l.dateStr).join(', ')}>
                                  {getDuplicateLists(order).map(l => l.dateStr).join(', ')}
                                </span>
                              </div>
                            )}
                          </td>
                          <td className="px-5 py-3 font-mono text-black">{order.fabricCode}</td>
                          <td className="px-5 py-3 uppercase text-black/60">{order.lineDirection}</td>
                          <td className="px-5 py-3 italic text-black/60">{order.extraInfo || '-'}</td>
                          <td className="px-5 py-3 font-mono font-black text-black">{order.dimensions}</td>
                          <td className="px-5 py-3 text-right">
                            <select
                              value={selectedStageReport}
                              onChange={(e) => localUpdateOrderStatus(order.id, e.target.value as any)}
                              className="text-[10px] font-black border border-black/10 rounded px-2.5 py-1 bg-white hover:bg-black/5 focus:outline-none cursor-pointer"
                            >
                              {STAGES.map(s => (
                                <option key={s} value={s}>{s}</option>
                              ))}
                            </select>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        ) : activeSubTab === 'list' ? (
          /* TAB 1: ALL ORDERS & HISTORY LIST TABLE */
          <div className="flex-1 flex flex-col min-h-0 overflow-hidden bg-white">
            
            {/* Filter controls and Search */}
            <div className="p-4 md:p-6 border-b border-black/5 bg-[#F5F5F0]/30 flex flex-col gap-4 shrink-0">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                
                {/* Stage Filters (Horizontal Scroll on Mobile) */}
                <div className="flex items-center gap-1.5 overflow-x-auto pb-2 md:pb-0 scrollbar-none shrink-0">
                  <span className="text-[10px] font-black uppercase text-black/40 mr-2 shrink-0 hidden sm:inline">Aşama Filtresi:</span>
                  {(['Tümü', 'Bekleme', 'Acil', 'Kuyrukta', 'Üretimde', 'Paketlendi', 'Üretilemiyor', 'Arşivlenmiş'] as const).map((filter) => {
                    const count = filter === 'Tümü' 
                      ? totalCounts['Toplam']
                      : filter === 'Arşivlenmiş'
                        ? totalCounts['Arşivlenmiş']
                        : totalCounts[filter as keyof typeof totalCounts] || 0;
                        
                    return (
                      <button
                        key={filter}
                        onClick={() => {
                          setListStageFilter(filter);
                          setExpandedOrderIds({});
                        }}
                        className={cn(
                          "px-3 py-1.5 text-xs font-bold rounded-lg border transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5",
                          listStageFilter === filter
                            ? "bg-slate-900 border-slate-900 text-white shadow-xs"
                            : "bg-white border-black/10 text-black/60 hover:text-black hover:bg-black/5"
                        )}
                      >
                        <span>{filter}</span>
                        <span className={cn(
                          "text-[9px] font-mono px-1.5 py-0.5 rounded-full",
                          listStageFilter === filter ? "bg-white/20 text-white" : "bg-black/5 text-black/40"
                        )}>
                          {count}
                        </span>
                      </button>
                    );
                  })}
                </div>

                {/* Instant Search input */}
                <div className="relative w-full md:w-80">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-black/40" />
                  <input
                    type="text"
                    placeholder="Müşteri, Sipariş No, Kumaş ara..."
                    value={listSearchTerm}
                    onChange={(e) => setListSearchTerm(e.target.value)}
                    className="w-full bg-white border border-black/10 rounded-xl py-2.5 pl-9 pr-4 text-xs font-bold text-black placeholder:text-black/30 focus:outline-none focus:ring-1 focus:ring-black"
                  />
                  {listSearchTerm && (
                    <button 
                      onClick={() => setListSearchTerm('')}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-red-500 hover:text-red-700"
                    >
                      Temizle
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* List Table View */}
            <div className="flex-1 overflow-auto">
              {filteredListOrders.length === 0 ? (
                <div className="h-64 flex flex-col items-center justify-center text-center p-6 bg-white">
                  <AlertCircle className="w-10 h-10 text-black/20 mb-3" />
                  <h4 className="font-extrabold text-sm text-black">Arama Kriterine Uyan Sipariş Bulunamadı</h4>
                  <p className="text-xs text-black/50 mt-1 max-w-sm">
                    Bu aşamada veya girdiğiniz arama terimiyle eşleşen sipariş bulunmuyor.
                  </p>
                </div>
              ) : (
                <table className="w-full text-left border-collapse min-w-[850px]">
                  <thead>
                    <tr className="bg-[#F5F5F0] text-[10px] font-black uppercase tracking-wider text-black/40 border-b border-black/5 sticky top-0 z-10">
                      <th className="px-5 py-3 w-10"></th>
                      <th className="px-5 py-3 w-12 text-center">Sıra</th>
                      <th className="px-5 py-3 w-28">Sipariş No</th>
                      <th className="px-5 py-3">Müşteri Adı</th>
                      <th className="px-5 py-3">Kumaş ve Yön</th>
                      <th className="px-5 py-3">Ölçüler</th>
                      <th className="px-5 py-3 w-28">Ek Havuz</th>
                      <th className="px-5 py-3 w-36">Güncel Aşama</th>
                      <th className="px-5 py-3 text-right">Eylem / Tarihçe</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-black/5 text-xs">
                    {groupedListOrders.map((group, index) => {
                      const isExpanded = !!expandedCustomers[group.customerName];
                      
                      if (!group.isGroup) {
                        // Customer has exactly 1 order in the filtered list
                        const order = group.orders[0];
                        const status = order.status || 'Kuyrukta';
                        
                        return (
                          <React.Fragment key={order.id}>
                            <tr className={cn(
                              "hover:bg-[#F5F5F0]/20 transition-all cursor-pointer",
                              order.isCleared && "bg-neutral-100/40 text-black/40",
                              isExpanded && "bg-slate-50/50"
                            )}
                            onClick={() => {
                              setExpandedCustomers(prev => ({
                                ...prev,
                                [group.customerName]: !prev[group.customerName]
                              }));
                            }}
                            >
                              <td className="px-5 py-4 text-center">
                                {isExpanded ? <ChevronUp className="w-4 h-4 text-black/40" /> : <ChevronDown className="w-4 h-4 text-black/40" />}
                              </td>
                              <td className="px-5 py-4 text-center text-black/40 font-mono font-bold" onClick={(e) => e.stopPropagation()}>{index + 1}</td>
                              <td className="px-5 py-4 font-mono font-black text-black">
                                {order.orderId}
                              </td>
                              <td className="px-5 py-4 font-extrabold text-black uppercase">
                                <div>{order.customerName}</div>
                                {getDuplicateLists(order).length > 1 && (
                                  <div className="mt-1.5 flex flex-col gap-0.5 text-[9px] text-red-600 bg-red-50 border border-red-100 rounded-lg p-1.5 font-bold max-w-xs normal-case">
                                    <span className="flex items-center gap-1 font-extrabold">
                                      <AlertTriangle className="w-3 h-3 text-red-500 shrink-0" />
                                      <span>Mükerrer Sipariş ({getDuplicateLists(order).length} farklı listede var):</span>
                                    </span>
                                    <span className="opacity-80 font-medium pl-4">{getDuplicateLists(order).map(l => l.dateStr).join(', ')}</span>
                                  </div>
                                )}
                              </td>
                              <td className="px-5 py-4">
                                <span className="font-mono font-extrabold text-black block">{order.fabricCode}</span>
                                <span className="text-[10px] text-black/40 font-medium block mt-0.5 uppercase">Yön: {order.lineDirection || '-'}</span>
                              </td>
                              <td className="px-5 py-4 font-mono font-black text-black text-sm">
                                {order.dimensions}
                              </td>
                              <td className="px-5 py-4">
                                {order.pool ? (
                                  <span className={cn(
                                    "text-[9px] font-black px-2 py-0.5 rounded text-white inline-block",
                                    order.pool === 'B' ? "bg-black" : "bg-neutral-500"
                                  )}>
                                    HAVUZ {order.pool}
                                  </span>
                                ) : (
                                  <span className="text-black/30 font-medium">-</span>
                                )}
                              </td>
                              <td className="px-5 py-4" onClick={(e) => e.stopPropagation()}>
                                {order.isCleared ? (
                                  <span className="text-[10px] font-bold uppercase text-neutral-500 bg-neutral-200/50 border border-neutral-300 px-2 py-1 rounded-md">Arşivde</span>
                                ) : (
                                  <span className={cn(
                                    "text-[10px] font-black uppercase border px-2.5 py-1 rounded-lg inline-flex items-center gap-1 shadow-2xs",
                                    STAGE_CONFIG[status as keyof typeof STAGE_CONFIG]?.textClass
                                  )}>
                                    {React.createElement(STAGE_CONFIG[status as keyof typeof STAGE_CONFIG]?.icon || Clock, { className: "w-3 h-3" })}
                                    <span>{status}</span>
                                  </span>
                                )}
                              </td>
                              <td className="px-5 py-4 text-right" onClick={(e) => e.stopPropagation()}>
                                <div className="flex items-center justify-end gap-2">
                                  <button
                                    onClick={() => handleToggleArchive(order.id, order.isCleared)}
                                    className={cn(
                                      "p-1.5 rounded-lg transition-colors border shadow-2xs cursor-pointer",
                                      order.isCleared 
                                        ? "bg-amber-50 hover:bg-amber-100 text-amber-700 border-amber-250" 
                                        : "bg-white hover:bg-[#F5F5F0] text-black/60 hover:text-black border-black/10"
                                    )}
                                    title={order.isCleared ? "Siparişi Aktif Listeye Al" : "Siparişi Arşivle"}
                                  >
                                    {order.isCleared ? <ArchiveRestore className="w-3.5 h-3.5" /> : <Archive className="w-3.5 h-3.5" />}
                                  </button>
                                  <select
                                    value={status}
                                    onChange={(e) => localUpdateOrderStatus(order.id, e.target.value as any)}
                                    className="text-[10px] font-black border border-black/10 rounded px-2.5 py-1.5 bg-white hover:bg-black/5 focus:outline-none cursor-pointer shadow-2xs"
                                  >
                                    {STAGES.map(s => (
                                      <option key={s} value={s}>{s}</option>
                                    ))}
                                  </select>
                                  <button
                                    onClick={() => {
                                      setExpandedCustomers(prev => ({
                                        ...prev,
                                        [group.customerName]: !prev[group.customerName]
                                      }));
                                    }}
                                    className="p-1.5 hover:bg-[#F5F5F0] text-black/50 hover:text-black rounded-lg transition-colors border border-black/5 bg-[#FAF9F5]/50 shadow-2xs"
                                    title="Aşama Tarihçesi"
                                  >
                                    <History className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </td>
                            </tr>

                            {/* Single Order timeline history area when expanded */}
                            {isExpanded && (
                              <tr className="bg-slate-50/50">
                                <td colSpan={9} className="px-12 py-4 border-l-4 border-l-slate-900 bg-[#FAF9F5]/30">
                                  <div className="max-w-2xl">
                                    <div className="flex items-center gap-2 mb-3">
                                      <History className="w-4 h-4 text-black/60" />
                                      <h4 className="font-extrabold text-xs text-black uppercase tracking-wider">Aşama Geçiş Günlüğü (Tarihçe)</h4>
                                    </div>

                                    {order.statusHistory && order.statusHistory.length > 0 ? (
                                      <div className="relative border-l border-black/10 ml-3.5 pl-5 py-1.5 space-y-4">
                                        {order.statusHistory.map((hist, histIdx) => {
                                          const hConfig = STAGE_CONFIG[hist.status as keyof typeof STAGE_CONFIG] || { icon: Clock, textClass: 'text-slate-700 bg-slate-100' };
                                          const HistIcon = hConfig.icon;
                                          return (
                                            <div key={histIdx} className="relative">
                                              {/* Timeline dot */}
                                              <span className={cn(
                                                "absolute -left-[27px] top-0.5 p-1 rounded-full border bg-white shadow-xs z-10",
                                                hist.status === status ? "ring-2 ring-black" : "opacity-75"
                                              )}>
                                                <HistIcon className="w-3 h-3 text-black" />
                                              </span>
                                              
                                              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5">
                                                <div>
                                                  <span className={cn(
                                                    "text-[10px] font-extrabold uppercase px-2 py-0.5 rounded border mr-2 shadow-3xs",
                                                    hConfig.textClass
                                                  )}>
                                                    {hist.status}
                                                  </span>
                                                  <span className="text-[10px] text-black/50 font-bold font-sans">Aşamasına Geçiş Yapıldı</span>
                                                </div>
                                                <div className="text-[10px] font-mono font-black text-black bg-[#FAF9F5] border border-black/5 px-2 py-0.5 rounded">
                                                  {hist.timestamp}
                                                </div>
                                              </div>
                                            </div>
                                          );
                                        })}
                                      </div>
                                    ) : (
                                      <div className="p-4 bg-white rounded-xl border border-black/5 shadow-xs flex items-center gap-3">
                                        <Calendar className="w-5 h-5 text-black/30" />
                                        <div>
                                          <p className="text-xs font-bold text-black">Tarihçe Kaydı Yok</p>
                                          <p className="text-[10px] text-black/50 mt-0.5">
                                            Bu sipariş sistem güncellemesinden önce oluşturulmuştur. Kayıt Tarihi: {order.createdAt || 'Bilinmiyor'} ({status})
                                          </p>
                                        </div>
                                      </div>
                                    )}

                                    {getDuplicateLists(order).length > 0 && (
                                      <div className="mt-4 p-3 bg-indigo-50/40 border border-indigo-100 rounded-xl">
                                        <div className="flex items-center gap-1.5 mb-2">
                                          <FileText className="w-3.5 h-3.5 text-indigo-600" />
                                          <span className="font-extrabold text-[10px] text-indigo-950 uppercase tracking-wider">Bulunduğu Kayıtlı Raporlar ({getDuplicateLists(order).length})</span>
                                        </div>
                                        <div className="space-y-1.5">
                                          {getDuplicateLists(order).map((log) => (
                                            <div key={log.id} className="flex items-center justify-between bg-white border border-indigo-100/50 rounded-lg p-2 text-[10px]">
                                              <div className="flex items-center gap-1.5">
                                                <Calendar className="w-3 h-3 text-indigo-500/85" />
                                                <span className="font-bold text-slate-700">{log.dateStr}</span>
                                              </div>
                                              <div className="flex items-center gap-1.5 bg-indigo-50/80 px-2 py-0.5 rounded border border-indigo-100/40">
                                                <span className="text-[9px] text-indigo-500 font-bold uppercase">Üretici:</span>
                                                <span className="font-extrabold text-indigo-950">{log.producerName || 'Belirtilmemiş'}</span>
                                              </div>
                                            </div>
                                          ))}
                                        </div>
                                      </div>
                                    )}

                                    {order.extraInfo && order.extraInfo !== '-' && (
                                      <div className="mt-4 p-3 bg-amber-50 text-amber-900 rounded-xl border border-amber-100 text-[11px] font-bold">
                                        <span className="font-extrabold uppercase tracking-wide block mb-1">Müşteri / Üretim Notu:</span>
                                        {order.extraInfo}
                                      </div>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        );
                      } else {
                        // Customer has MULTIPLE orders (isGroup = true)
                        // We display a grouped header row labeled "Toplu Sipariş"
                        const activePools = Array.from(new Set(group.orders.map(o => o.pool).filter(Boolean))) as string[];
                        
                        return (
                          <React.Fragment key={`group-${group.customerName}`}>
                            <tr className={cn(
                              "hover:bg-indigo-50/30 transition-all cursor-pointer bg-indigo-50/15",
                              isExpanded && "bg-indigo-50/30"
                            )}
                            onClick={() => {
                              setExpandedCustomers(prev => ({
                                ...prev,
                                [group.customerName]: !prev[group.customerName]
                              }));
                            }}
                            >
                              <td className="px-5 py-4 text-center">
                                {isExpanded ? <ChevronUp className="w-4 h-4 text-indigo-500" /> : <ChevronDown className="w-4 h-4 text-indigo-400" />}
                              </td>
                              <td className="px-5 py-4 text-center text-indigo-400/80 font-mono font-bold" onClick={(e) => e.stopPropagation()}>{index + 1}</td>
                              <td className="px-5 py-4 font-mono font-black text-indigo-700">
                                {group.orders.length} Adet Sipariş
                              </td>
                              <td className="px-5 py-4 font-extrabold text-black uppercase">
                                <div className="flex items-center gap-2">
                                  <span>{group.customerName}</span>
                                  <span className="text-[10px] bg-indigo-600 text-white font-extrabold px-2 py-0.5 rounded-md shadow-3xs whitespace-nowrap">
                                    Toplu Sipariş
                                  </span>
                                </div>
                              </td>
                              <td className="px-5 py-4 text-black/50 italic max-w-xs truncate font-bold">
                                {group.orders.map(o => o.fabricCode).filter((v, i, a) => a.indexOf(v) === i).join(', ')}
                              </td>
                              <td className="px-5 py-4 text-black/40 font-mono font-bold">
                                {group.orders.length} Ölçü Grubu
                              </td>
                              <td className="px-5 py-4">
                                {activePools.length > 0 ? (
                                  <div className="flex gap-1">
                                    {activePools.map(p => (
                                      <span key={p} className={cn(
                                        "text-[9px] font-black px-1.5 py-0.5 rounded text-white inline-block",
                                        p === 'B' ? "bg-black" : "bg-neutral-500"
                                      )}>
                                        {p}
                                      </span>
                                    ))}
                                  </div>
                                ) : (
                                  <span className="text-black/30 font-medium">-</span>
                                )}
                              </td>
                              <td className="px-5 py-4">
                                <span className="text-[10px] text-indigo-700 font-bold bg-indigo-50 border border-indigo-150 px-2.5 py-1 rounded-lg">
                                  Çoklu Aşama
                                </span>
                              </td>
                              <td className="px-5 py-4 text-right" onClick={(e) => e.stopPropagation()}>
                                <button
                                  onClick={() => {
                                    setExpandedCustomers(prev => ({
                                      ...prev,
                                      [group.customerName]: !prev[group.customerName]
                                    }));
                                  }}
                                  className="p-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-600 rounded-lg transition-colors border border-indigo-100 shadow-3xs font-extrabold text-[10px]"
                                  title="Siparişleri Göster"
                                >
                                  Detayları Aç ({group.orders.length})
                                </button>
                              </td>
                            </tr>

                            {/* Expandable Group Order breakdown list */}
                            {isExpanded && (
                              <tr className="bg-indigo-50/5">
                                <td colSpan={9} className="px-8 py-5 border-l-4 border-l-indigo-600 bg-indigo-50/10">
                                  <div className="bg-white rounded-2xl border border-indigo-100 shadow-sm overflow-hidden p-4 md:p-6">
                                    <h4 className="font-extrabold text-xs text-indigo-950 uppercase tracking-wider mb-4 flex items-center gap-2">
                                      <Users className="w-4 h-4 text-indigo-600" />
                                      <span>{group.customerName} - Toplu Sipariş Detayları</span>
                                    </h4>
                                    
                                    <div className="overflow-x-auto">
                                      <table className="w-full text-left border-collapse min-w-[700px]">
                                        <thead>
                                          <tr className="border-b border-indigo-100 text-[9px] font-black uppercase tracking-wider text-indigo-900/40">
                                            <th className="pb-2.5 pl-2">Sipariş No</th>
                                            <th className="pb-2.5">Kumaş Kodu</th>
                                            <th className="pb-2.5">Yönü</th>
                                            <th className="pb-2.5">Ölçüler</th>
                                            <th className="pb-2.5">Havuz</th>
                                            <th className="pb-2.5">Notlar / Bilgi</th>
                                            <th className="pb-2.5">Durumu</th>
                                            <th className="pb-2.5 text-right pr-2">Eylemler / Tarihçe</th>
                                          </tr>
                                        </thead>
                                        <tbody className="divide-y divide-indigo-50 text-xs text-indigo-950">
                                          {group.orders.map((o) => {
                                            const oStatus = o.status || 'Kuyrukta';
                                            const isTimelineOpen = !!expandedOrderIds[o.id];
                                            
                                            return (
                                              <React.Fragment key={o.id}>
                                                <tr className="hover:bg-indigo-50/30 transition-colors">
                                                  <td className="py-3 pl-2 font-mono">
                                                    <div className="font-black text-indigo-900">{o.orderId}</div>
                                                    {getDuplicateLists(o).length > 1 && (
                                                      <div className="mt-1 flex flex-col gap-0.5 text-[8px] text-red-600 bg-red-50 border border-red-100 rounded p-1 font-bold normal-case max-w-[120px] leading-tight">
                                                        <span className="flex items-center gap-0.5 font-extrabold">
                                                          <AlertTriangle className="w-2.5 h-2.5 text-red-500 shrink-0" />
                                                          <span>Mükerrer!</span>
                                                        </span>
                                                        <span className="opacity-80 font-medium whitespace-nowrap overflow-hidden text-ellipsis" title={getDuplicateLists(o).map(l => l.dateStr).join(', ')}>
                                                          {getDuplicateLists(o).map(l => l.dateStr).join(', ')}
                                                        </span>
                                                      </div>
                                                    )}
                                                  </td>
                                                  <td className="py-3 font-mono font-bold text-black">{o.fabricCode}</td>
                                                  <td className="py-3 uppercase text-black/60">{o.lineDirection || '-'}</td>
                                                  <td className="py-3 font-mono font-black text-black">{o.dimensions}</td>
                                                  <td className="py-3">
                                                    {o.pool ? (
                                                      <span className={cn(
                                                        "text-[9px] font-black px-1.5 py-0.5 rounded text-white",
                                                        o.pool === 'B' ? "bg-black" : "bg-neutral-500"
                                                      )}>
                                                        {o.pool}
                                                      </span>
                                                    ) : (
                                                      <span className="text-black/30">-</span>
                                                    )}
                                                  </td>
                                                  <td className="py-3 italic text-black/60 max-w-[150px] truncate" title={o.extraInfo}>{o.extraInfo || '-'}</td>
                                                  <td className="py-3">
                                                    <span className={cn(
                                                      "text-[9px] font-black uppercase px-2 py-0.5 rounded border shadow-3xs inline-flex items-center gap-1",
                                                      STAGE_CONFIG[oStatus as keyof typeof STAGE_CONFIG]?.textClass
                                                    )}>
                                                      {React.createElement(STAGE_CONFIG[oStatus as keyof typeof STAGE_CONFIG]?.icon || Clock, { className: "w-2.5 h-2.5" })}
                                                      <span>{oStatus}</span>
                                                    </span>
                                                  </td>
                                                  <td className="py-3 text-right pr-2">
                                                    <div className="flex items-center justify-end gap-1.5">
                                                      <button
                                                        onClick={() => handleToggleArchive(o.id, o.isCleared)}
                                                        className={cn(
                                                          "p-1 rounded transition-colors border cursor-pointer",
                                                          o.isCleared 
                                                            ? "bg-amber-50 hover:bg-amber-100 text-amber-700 border-amber-250" 
                                                            : "bg-white border-black/15 text-black/50 hover:text-black hover:bg-[#F5F5F0]"
                                                        )}
                                                        title={o.isCleared ? "Siparişi Aktif Listeye Al" : "Siparişi Arşivle"}
                                                      >
                                                        {o.isCleared ? <ArchiveRestore className="w-3.5 h-3.5" /> : <Archive className="w-3.5 h-3.5" />}
                                                      </button>
                                                      <select
                                                        value={oStatus}
                                                        onChange={(e) => localUpdateOrderStatus(o.id, e.target.value as any)}
                                                        className="text-[10px] font-black border border-black/10 rounded px-2 py-1 bg-white hover:bg-black/5 focus:outline-none cursor-pointer"
                                                      >
                                                        {STAGES.map(s => (
                                                          <option key={s} value={s}>{s}</option>
                                                        ))}
                                                      </select>
                                                      
                                                      <button
                                                        onClick={() => {
                                                          setExpandedOrderIds(prev => ({
                                                            ...prev,
                                                            [o.id]: !prev[o.id]
                                                          }));
                                                        }}
                                                        className={cn(
                                                          "p-1 rounded transition-colors border",
                                                          isTimelineOpen ? "bg-indigo-600 border-indigo-600 text-white" : "bg-white border-black/15 text-black/50 hover:text-black"
                                                        )}
                                                        title="Tarihçe Göster"
                                                      >
                                                        <History className="w-3.5 h-3.5" />
                                                      </button>
                                                    </div>
                                                  </td>
                                                </tr>
                                                
                                                {/* Inline History Timeline for the sub-order */}
                                                {isTimelineOpen && (
                                                  <tr className="bg-slate-50/40">
                                                    <td colSpan={8} className="p-4 border-l-2 border-l-indigo-500">
                                                      <div className="max-w-xl pl-2">
                                                        <h5 className="font-extrabold text-[11px] text-slate-800 uppercase mb-2">Aşama Geçiş Tarihçesi:</h5>
                                                        
                                                        {o.statusHistory && o.statusHistory.length > 0 ? (
                                                          <div className="relative border-l border-black/10 ml-2 pl-4 py-1 space-y-3">
                                                            {o.statusHistory.map((hist, histIdx) => {
                                                              const hConfig = STAGE_CONFIG[hist.status as keyof typeof STAGE_CONFIG] || { icon: Clock, textClass: 'text-slate-700 bg-slate-100' };
                                                              return (
                                                                <div key={histIdx} className="text-[10px] flex items-center justify-between gap-2">
                                                                  <div>
                                                                    <span className={cn("font-bold px-1.5 py-0.5 rounded border mr-2", hConfig.textClass)}>
                                                                      {hist.status}
                                                                    </span>
                                                                    <span className="text-black/50 font-bold font-sans">geçişi yapıldı</span>
                                                                  </div>
                                                                  <span className="font-mono text-black/40 bg-[#FAF9F5] px-1.5 py-0.5 border rounded">
                                                                    {hist.timestamp}
                                                                  </span>
                                                                </div>
                                                              );
                                                            })}
                                                          </div>
                                                        ) : (
                                                          <p className="text-[10px] text-black/40 italic">Bu sipariş için tarihçe kaydı bulunmuyor.</p>
                                                        )}

                                                        {getDuplicateLists(o).length > 0 && (
                                                          <div className="mt-3 p-2.5 bg-indigo-50/40 border border-indigo-100 rounded-lg">
                                                            <div className="flex items-center gap-1.5 mb-1.5">
                                                              <FileText className="w-3.5 h-3.5 text-indigo-600" />
                                                              <span className="font-extrabold text-[9px] text-indigo-950 uppercase tracking-wider">Bulunduğu Kayıtlı Raporlar ({getDuplicateLists(o).length})</span>
                                                            </div>
                                                            <div className="space-y-1">
                                                              {getDuplicateLists(o).map((log) => (
                                                                <div key={log.id} className="flex items-center justify-between bg-white border border-indigo-100/40 rounded p-1.5 text-[9px]">
                                                                  <div className="flex items-center gap-1">
                                                                    <Calendar className="w-2.5 h-2.5 text-indigo-500/80" />
                                                                    <span className="font-bold text-slate-700">{log.dateStr}</span>
                                                                  </div>
                                                                  <div className="flex items-center gap-1 bg-indigo-50/70 px-1.5 py-0.5 rounded border border-indigo-100/30">
                                                                    <span className="text-[8px] text-indigo-500 font-bold uppercase">Üretici:</span>
                                                                    <span className="font-black text-indigo-950">{log.producerName || 'Belirtilmemiş'}</span>
                                                                  </div>
                                                                </div>
                                                              ))}
                                                            </div>
                                                          </div>
                                                        )}
                                                      </div>
                                                    </td>
                                                  </tr>
                                                )}
                                              </React.Fragment>
                                            );
                                          })}
                                        </tbody>
                                      </table>
                                    </div>
                                  </div>
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        );
                      }
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        ) : activeSubTab === 'groups' ? (
          /* TAB 2: CUSTOMER GROUPS & SHIPPING READINESS TAKIP */
          <div className="flex-1 flex flex-col min-h-0 overflow-hidden bg-white">
            
            {/* Filter controls and Search for Groups */}
            <div className="p-4 md:p-6 border-b border-black/5 bg-[#F5F5F0]/30 flex flex-col gap-4 shrink-0">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                
                {/* Shipping Readiness Buttons */}
                <div className="flex items-center gap-1.5 overflow-x-auto pb-2 md:pb-0 scrollbar-none shrink-0">
                  <span className="text-[10px] font-black uppercase text-black/40 mr-2 shrink-0 hidden sm:inline">Gönderim Durumu:</span>
                  <button
                    onClick={() => setGroupFilter('all')}
                    className={cn(
                      "px-3 py-1.5 text-xs font-bold rounded-lg border transition-all cursor-pointer whitespace-nowrap",
                      groupFilter === 'all'
                        ? "bg-slate-900 border-slate-900 text-white shadow-xs"
                        : "bg-white border-black/10 text-black/60 hover:text-black hover:bg-black/5"
                    )}
                  >
                    Tümü ({bulkCustomerGroups.length})
                  </button>
                  <button
                    onClick={() => setGroupFilter('ready')}
                    className={cn(
                      "px-3 py-1.5 text-xs font-bold rounded-lg border transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5",
                      groupFilter === 'ready'
                        ? "bg-green-600 border-green-600 text-white shadow-xs"
                        : "bg-white border-green-200 text-green-700 hover:bg-green-50"
                    )}
                  >
                    <CheckCircle className="w-3.5 h-3.5" />
                    <span>Sevk Edilebilir ({bulkCustomerGroups.filter(g => g.shippingStatus === 'ready').length})</span>
                  </button>
                  <button
                    onClick={() => setGroupFilter('pending')}
                    className={cn(
                      "px-3 py-1.5 text-xs font-bold rounded-lg border transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5",
                      groupFilter === 'pending'
                        ? "bg-amber-500 border-amber-500 text-white shadow-xs"
                        : "bg-white border-amber-200 text-amber-700 hover:bg-amber-50"
                    )}
                  >
                    <Clock className="w-3.5 h-3.5" />
                    <span>Üretimi Sürüyor ({bulkCustomerGroups.filter(g => g.shippingStatus === 'pending').length})</span>
                  </button>
                  <button
                    onClick={() => setGroupFilter('blocked')}
                    className={cn(
                      "px-3 py-1.5 text-xs font-bold rounded-lg border transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5",
                      groupFilter === 'blocked'
                        ? "bg-red-600 border-red-600 text-white shadow-xs"
                        : "bg-white border-red-200 text-red-700 hover:bg-red-50"
                    )}
                  >
                    <AlertTriangle className="w-3.5 h-3.5" />
                    <span>Sorunlu/Eksik ({bulkCustomerGroups.filter(g => g.shippingStatus === 'blocked').length})</span>
                  </button>
                </div>

                {/* Instant Search input for Groups */}
                <div className="relative w-full md:w-80">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-black/40" />
                  <input
                    type="text"
                    placeholder="Müşteri adı veya sipariş no ara..."
                    value={groupSearchTerm}
                    onChange={(e) => setGroupSearchTerm(e.target.value)}
                    className="w-full bg-white border border-black/10 rounded-xl py-2.5 pl-9 pr-4 text-xs font-bold text-black placeholder:text-black/30 focus:outline-none focus:ring-1 focus:ring-black"
                  />
                </div>
              </div>
            </div>

            {/* Groups Grid / Cards List */}
            <div className="flex-1 p-4 md:p-6 overflow-y-auto space-y-4 bg-[#FAF9F5]/30">
              {filteredCustomerGroups.length === 0 ? (
                <div className="h-64 flex flex-col items-center justify-center text-center p-6 bg-white rounded-2xl border border-black/5 shadow-sm max-w-xl mx-auto">
                  <Users className="w-10 h-10 text-black/20 mb-3" />
                  <h4 className="font-extrabold text-sm text-black">Arama Kriterine Uyan Toplu Sipariş Bulunamadı</h4>
                  <p className="text-xs text-black/50 mt-1">
                    Listede kayıtlı aktif toplu sipariş bulunamadı. Lütfen filtreyi değiştirerek tekrar deneyin.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-4 max-w-5xl mx-auto">
                  {filteredCustomerGroups.map((group) => {
                    const isExpanded = !!expandedCustomers[group.customerName];
                    
                    return (
                      <div 
                        key={group.customerName}
                        className={cn(
                          "bg-white border rounded-[1.5rem] transition-all shadow-sm overflow-hidden",
                          group.shippingStatus === 'ready' && "border-green-300 ring-2 ring-green-500/5",
                          group.shippingStatus === 'blocked' && "border-red-300 ring-2 ring-red-500/5",
                          group.shippingStatus === 'pending' && "border-black/5"
                        )}
                      >
                        {/* Group Card Header */}
                        <div 
                          onClick={() => toggleExpandCustomer(group.customerName)}
                          className={cn(
                            "p-4 md:p-5 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4 cursor-pointer hover:bg-neutral-50/50 select-none",
                            isExpanded && "border-b border-black/5 bg-slate-50/20"
                          )}
                        >
                          <div className="flex items-start gap-3">
                            <div className={cn(
                              "p-2.5 rounded-xl border shrink-0 mt-0.5",
                              group.shippingStatus === 'ready' && "bg-green-50 border-green-200 text-green-700",
                              group.shippingStatus === 'blocked' && "bg-red-50 border-red-200 text-red-700",
                              group.shippingStatus === 'pending' && "bg-amber-50 border-amber-200 text-amber-700"
                            )}>
                              <Truck className="w-5 h-5" />
                            </div>
                            
                            <div>
                              <h3 className="font-extrabold text-sm text-black uppercase tracking-tight flex items-center gap-2">
                                <span>{group.customerName}</span>
                                <span className="text-[10px] bg-slate-100 text-slate-800 font-extrabold px-2 py-0.5 rounded-full border border-black/5">
                                  {group.totalCount} Adet Sipariş
                                </span>
                              </h3>
                              
                              <p className={cn(
                                "text-xs font-extrabold mt-1",
                                group.shippingStatus === 'ready' && "text-green-700",
                                group.shippingStatus === 'blocked' && "text-red-700",
                                group.shippingStatus === 'pending' && "text-amber-700"
                              )}>
                                {group.shippingMessage}
                              </p>
                            </div>
                          </div>

                          {/* Status Indicators breakdown & Toggle button */}
                          <div className="flex items-center justify-between md:justify-end gap-4 shrink-0 border-t md:border-t-0 pt-3 md:pt-0 border-black/5">
                            <div className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-wide">
                              {group.statusSummary['Acil'] > 0 && <span className="bg-amber-500 text-white px-2 py-0.5 rounded">Acil ({group.statusSummary['Acil']})</span>}
                              {group.statusSummary['Kuyrukta'] > 0 && <span className="bg-slate-500 text-white px-2 py-0.5 rounded">Kuyruk ({group.statusSummary['Kuyrukta']})</span>}
                              {group.statusSummary['Üretimde'] > 0 && <span className="bg-blue-600 text-white px-2 py-0.5 rounded">Üretim ({group.statusSummary['Üretimde']})</span>}
                              {group.statusSummary['Paketlendi'] > 0 && <span className="bg-green-600 text-white px-2 py-0.5 rounded">Paket ({group.statusSummary['Paketlendi']})</span>}
                              {group.statusSummary['Üretilemiyor'] > 0 && <span className="bg-red-600 text-white px-2 py-0.5 rounded animate-pulse">Hata ({group.statusSummary['Üretilemiyor']})</span>}
                            </div>

                            <button className="p-1.5 hover:bg-black/5 rounded-lg text-black/60">
                              {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                            </button>
                          </div>
                        </div>

                        {/* Expandable Order List breakdown */}
                        {isExpanded && (
                          <div className="bg-neutral-50/30 border-t border-black/5">
                            <div className="p-4 md:p-6 overflow-x-auto">
                              <table className="w-full text-left border-collapse min-w-[700px]">
                                <thead>
                                  <tr className="border-b border-black/5 text-[9px] font-black uppercase tracking-wider text-black/40">
                                    <th className="pb-2.5 pl-2">Sipariş No</th>
                                    <th className="pb-2.5">Kumaş Kodu</th>
                                    <th className="pb-2.5">Yönü</th>
                                    <th className="pb-2.5">Ölçüler</th>
                                    <th className="pb-2.5">Havuz</th>
                                    <th className="pb-2.5">Notlar / Bilgi</th>
                                    <th className="pb-2.5">Durumu</th>
                                    <th className="pb-2.5 text-right pr-2">Aşama Güncelle</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-black/5 text-xs">
                                  {group.orders.map((o) => {
                                    const oStatus = o.status || 'Kuyrukta';
                                    return (
                                      <tr key={o.id} className="hover:bg-black/2 transition-colors">
                                        <td className="py-3 pl-2 font-mono">
                                          <div className="font-black text-black">{o.orderId}</div>
                                          {getDuplicateLists(o).length > 1 && (
                                            <div className="mt-1 flex flex-col gap-0.5 text-[8px] text-red-600 bg-red-50 border border-red-100 rounded p-1 font-bold normal-case max-w-[120px] leading-tight">
                                              <span className="flex items-center gap-0.5 font-extrabold">
                                                <AlertTriangle className="w-2.5 h-2.5 text-red-500 shrink-0" />
                                                <span>Mükerrer!</span>
                                              </span>
                                              <span className="opacity-80 font-medium whitespace-nowrap overflow-hidden text-ellipsis" title={getDuplicateLists(o).map(l => l.dateStr).join(', ')}>
                                                {getDuplicateLists(o).map(l => l.dateStr).join(', ')}
                                              </span>
                                            </div>
                                          )}
                                        </td>
                                        <td className="py-3 font-mono font-bold text-black">{o.fabricCode}</td>
                                        <td className="py-3 uppercase text-black/60">{o.lineDirection || '-'}</td>
                                        <td className="py-3 font-mono font-black text-black">{o.dimensions}</td>
                                        <td className="py-3">
                                          {o.pool ? (
                                            <span className={cn(
                                              "text-[9px] font-black px-1.5 py-0.5 rounded text-white",
                                              o.pool === 'B' ? "bg-black" : "bg-neutral-500"
                                            )}>
                                              {o.pool}
                                            </span>
                                          ) : (
                                            <span className="text-black/30">-</span>
                                          )}
                                        </td>
                                        <td className="py-3 italic text-black/60 max-w-[150px] truncate" title={o.extraInfo}>{o.extraInfo || '-'}</td>
                                        <td className="py-3">
                                          <span className={cn(
                                            "text-[9px] font-black uppercase px-2 py-0.5 rounded border shadow-3xs inline-flex items-center gap-1",
                                            STAGE_CONFIG[oStatus as keyof typeof STAGE_CONFIG]?.textClass
                                          )}>
                                            {React.createElement(STAGE_CONFIG[oStatus as keyof typeof STAGE_CONFIG]?.icon || Clock, { className: "w-2.5 h-2.5" })}
                                            <span>{oStatus}</span>
                                          </span>
                                        </td>
                                        <td className="py-3 text-right pr-2">
                                          <select
                                            value={oStatus}
                                            onChange={(e) => localUpdateOrderStatus(o.id, e.target.value as any)}
                                            className="text-[10px] font-black border border-black/10 rounded px-2 py-1 bg-white hover:bg-black/5 focus:outline-none cursor-pointer"
                                          >
                                            {STAGES.map(s => (
                                              <option key={s} value={s}>{s}</option>
                                            ))}
                                          </select>
                                        </td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                              
                              <div className="mt-4 pt-4 border-t border-black/5 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
                                <div className="text-black/60">
                                  <span>Bu grup için sevk kararı: </span>
                                  <span className={cn(
                                    "font-black uppercase",
                                    group.shippingStatus === 'ready' && "text-green-700",
                                    group.shippingStatus === 'blocked' && "text-red-700",
                                    group.shippingStatus === 'pending' && "text-amber-700"
                                  )}>
                                    {group.shippingStatus === 'ready' ? 'BAŞLAYABİLİR - Kargo Yapılabilir' : 'DURDURUN - Eksik/Süreçte Olan Ürün Var!'}
                                  </span>
                                </div>
                                <div className="text-[10px] text-black/40 font-bold uppercase tracking-wider">
                                  Ardışık siparişlerin tüm parçaları tek seferde sevk edilmelidir.
                                </div>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        ) : (
          /* TAB 3: VISUAL KANBAN BOARD VIEW */
          <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
            {/* Board Actions / Search */}
            <div className="p-4 border-b border-black/5 bg-white flex flex-col sm:flex-row gap-3 sm:items-center justify-between shrink-0 z-5">
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-black/40" />
                <input
                  type="text"
                  placeholder="Operasyon panosunda ara (Müşteri, Sipariş No, Kumaş...)"
                  value={boardSearchTerm}
                  onChange={(e) => setBoardSearchTerm(e.target.value)}
                  className="w-full bg-[#F5F5F0] border-0 rounded-xl py-2 pl-9 pr-4 text-xs font-bold text-black placeholder:text-black/30 focus:outline-none focus:ring-1 focus:ring-black"
                />
                {boardSearchTerm && (
                  <button 
                    onClick={() => setBoardSearchTerm('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-red-500 hover:text-red-700"
                  >
                    Temizle
                  </button>
                )}
              </div>
              <p className="text-[10px] text-black/50 font-black uppercase tracking-widest text-right">
                Sipariş kartlarını sürükleyip başka bir kolona bırakarak aşamasını güncelleyebilirsiniz.
              </p>
            </div>

            {/* Kanban Columns */}
            <div className="flex-1 p-4 md:p-6 overflow-x-auto overflow-y-hidden flex gap-4 items-start min-h-0">
              {STAGES.map((stage) => {
                const config = STAGE_CONFIG[stage];
                const stageOrdersList = stageGroups[stage] || [];
                const actualStageCount = totalCounts[stage];
                const StageIcon = config.icon;
                const isOver = draggedOverStage === stage;

                return (
                  <div 
                    key={stage}
                    onDragOver={(e) => handleDragOver(e, stage)}
                    onDrop={(e) => handleDrop(e, stage)}
                    onDragLeave={() => setDraggedOverStage(null)}
                    className={cn(
                      "w-80 h-full flex flex-col bg-white border rounded-[1.5rem] shrink-0 overflow-hidden transition-all duration-200 shadow-sm",
                      isOver ? "border-black bg-[#F5F5F0] scale-[1.01] shadow-md ring-2 ring-black/10" : "border-black/5"
                    )}
                  >
                    {/* Column Header */}
                    <div className="p-4 border-b border-black/5 flex flex-col gap-2 shrink-0 bg-slate-50/50">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className={cn("p-1.5 rounded-lg", config.color)}>
                            <StageIcon className="w-4 h-4" />
                          </div>
                          <span className="font-extrabold text-sm text-black">{config.title}</span>
                        </div>
                        
                        <span className={cn("text-[10px] font-black px-2.5 py-0.5 rounded-full border tracking-wide uppercase shadow-3xs", config.badge)}>
                          {actualStageCount} ADET
                        </span>
                      </div>
                      
                      <div className="flex items-center justify-between text-[11px] mt-1.5">
                        <span className="text-black/40 font-bold">{config.description}</span>
                        <button 
                          onClick={() => setSelectedStageReport(stage)}
                          className="text-black font-extrabold hover:underline flex items-center gap-0.5 text-[10px] cursor-pointer"
                        >
                          <FileSpreadsheet className="w-3.5 h-3.5 text-black/50" />
                          <span>Raporu Gör</span>
                        </button>
                      </div>
                    </div>

                    {/* Cards Area */}
                    <div className="flex-1 p-3 overflow-y-auto space-y-2.5 bg-[#FAF9F5]/30">
                      {stageOrdersList.length === 0 ? (
                        <div className="h-28 border border-dashed border-black/5 rounded-xl flex flex-col items-center justify-center p-4 text-center">
                          <p className="text-[11px] font-black uppercase text-black/30">BU AŞAMA BOŞ</p>
                          <p className="text-[10px] text-black/40 mt-1 max-w-[150px]">Siparişleri buraya sürükleyip bırakın</p>
                        </div>
                      ) : (
                        stageOrdersList.map((order) => {
                          const isBeingDragged = draggedOrderId === order.id;
                          return (
                            <div
                              key={order.id}
                              draggable
                              onDragStart={(e) => handleDragStart(e, order.id)}
                              onDragEnd={handleDragEnd}
                              className={cn(
                                "p-3.5 bg-white border border-black/5 rounded-xl transition-all cursor-grab active:cursor-grabbing hover:shadow-md hover:border-black/10 flex flex-col gap-2 relative group",
                                isBeingDragged && "opacity-40 border-dashed border-black/20"
                              )}
                            >
                              <div className="flex items-start justify-between gap-1.5">
                                <div>
                                  <h5 className="font-extrabold text-xs text-black group-hover:text-black leading-tight truncate max-w-[180px]">
                                    {order.customerName}
                                  </h5>
                                  {getDuplicateLists(order).length > 1 && (
                                    <div className="mt-1 flex items-center gap-0.5 text-[8px] font-extrabold text-red-600 bg-red-50 px-1 py-0.5 rounded border border-red-100">
                                      <AlertTriangle className="w-2.5 h-2.5 text-red-500 shrink-0" />
                                      <span>Mükerrer ({getDuplicateLists(order).length})</span>
                                    </div>
                                  )}
                                  <span className="text-[9px] font-mono text-black/40 font-bold block mt-0.5">
                                    {order.orderId}
                                  </span>
                                </div>
                                {order.pool && (
                                  <span className={cn(
                                    "text-[9px] font-black px-1.5 py-0.5 rounded text-white shrink-0 scale-90",
                                    order.pool === 'B' ? "bg-black" : "bg-neutral-500"
                                  )}>
                                    {order.pool}
                                  </span>
                                )}
                              </div>

                              <div className="grid grid-cols-2 gap-1.5 pt-1 text-[10px] border-t border-black/5 mt-0.5">
                                <div>
                                  <span className="text-[8px] opacity-40 font-black uppercase tracking-wider block">KUMAŞ</span>
                                  <span className="font-bold text-black truncate block">{order.fabricCode}</span>
                                </div>
                                <div>
                                  <span className="text-[8px] opacity-40 font-black uppercase tracking-wider block">YÖN</span>
                                  <span className="font-bold text-black truncate block uppercase">{order.lineDirection || '-'}</span>
                                </div>
                              </div>

                              <div className="flex items-center justify-between text-[10px] pt-1.5 border-t border-black/5 mt-0.5">
                                <span className="font-mono font-black text-black">{order.dimensions}</span>
                                
                                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all">
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleToggleArchive(order.id, order.isCleared);
                                    }}
                                    className="p-1 rounded bg-white hover:bg-neutral-50 border border-black/10 text-neutral-600 transition-all cursor-pointer shadow-3xs"
                                    title={order.isCleared ? "Siparişi Aktif Listeye Al" : "Siparişi Arşivle"}
                                  >
                                    {order.isCleared ? <ArchiveRestore className="w-2.5 h-2.5" /> : <Archive className="w-2.5 h-2.5" />}
                                  </button>
                                  <select
                                    value={stage}
                                    onChange={(e) => localUpdateOrderStatus(order.id, e.target.value as any)}
                                    className="text-[9px] font-black border border-black/10 rounded px-1 py-0.5 bg-slate-50 focus:outline-none cursor-pointer"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    {STAGES.map(s => (
                                      <option key={s} value={s}>{s}</option>
                                    ))}
                                  </select>
                                </div>
                              </div>

                              {order.extraInfo && order.extraInfo !== '-' && (
                                <p className="text-[9px] italic text-amber-700 bg-amber-50/50 px-2 py-1 rounded border border-amber-100/30 truncate">
                                  {order.extraInfo}
                                </p>
                              )}
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
