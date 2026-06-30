/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useEffect } from 'react';
import { 
  Printer, 
  Trash2, 
  ChevronRight, 
  ChevronLeft,
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
  Check, 
  Info,
  Calendar,
  Layers,
  Menu,
  UserCheck,
  Edit2,
  Clock,
  DollarSign,
  Sparkles,
  XCircle,
  Coffee,
  Database,
  Upload,
  Download,
  RefreshCw,
  Eye,
  EyeOff,
  Truck
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { OrderLabel } from './components/OrderLabel';
import { ScalableLabel } from './components/ScalableLabel';
import { FabricCalculator } from './components/FabricCalculator';
import { SpongeCalculator } from './components/SpongeCalculator';
import { WorkshopOperations } from './components/WorkshopOperations';
import { SupplyPanel } from './components/SupplyPanel';
import { cn } from './lib/utils';
import { generateOrdersPdf } from './lib/pdfGenerator';
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend
} from 'recharts';

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

export default function App() {
  // Sync core state with local storage right on initialization for maximum reliability
  const [orders, setOrders] = useState<Order[]>(() => {
    const stored = localStorage.getItem('yaver_active_orders');
    const storedUnproducible = localStorage.getItem('yaver_unproducible_orders');
    
    let activeOrders: Order[] = [];
    try {
      activeOrders = stored ? JSON.parse(stored) : [];
    } catch {
      activeOrders = [];
    }

    let unproducibleList: Order[] = [];
    try {
      unproducibleList = storedUnproducible ? JSON.parse(storedUnproducible) : [];
    } catch {
      unproducibleList = [];
    }

    if (unproducibleList.length > 0) {
      const mergedList = [...activeOrders];
      unproducibleList.forEach(unp => {
        if (!mergedList.some(o => o.id === unp.id)) {
          mergedList.push({
            ...unp,
            status: 'Üretilemiyor'
          });
        }
      });
      localStorage.removeItem('yaver_unproducible_orders');
      localStorage.setItem('yaver_active_orders', JSON.stringify(mergedList));
      return mergedList;
    }

    return activeOrders;
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
  const [logSearchQuery, setLogSearchQuery] = useState('');
  const [highlightedOrderInLog, setHighlightedOrderInLog] = useState<string | null>(null);
  const [inputText, setInputText] = useState('');
  const [isPrintingAll, setIsPrintingAll] = useState(false);
  
  // Permanent state and permissions system
  const ROLE_PERMISSIONS: Record<string, string[]> = {
    'Admin': ['labels', 'calculator', 'sponge', 'logs', 'settings_labels', 'settings_users', 'settings_backup', 'workshop', 'accounting', 'supply'],
    'Muhasebe': ['accounting', 'logs'],
    'Depo': ['labels', 'sponge', 'logs', 'workshop'],
    'Tedarik': ['supply', 'sponge']
  };

  const isTabAllowed = (tab: string, role: string | undefined): boolean => {
    if (!role) return false;
    const allowed = ROLE_PERMISSIONS[role];
    return allowed ? allowed.includes(tab) : false;
  };

  const [currentUser, setCurrentUser] = useState<{ username: string; role: string } | null>(() => {
    const stored = localStorage.getItem('yaver_current_user');
    try {
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  });

  const [users, setUsers] = useState<any[]>(() => {
    const stored = localStorage.getItem('yaver_users');
    let loadedUsers = null;
    try {
      if (stored) loadedUsers = JSON.parse(stored);
    } catch {}

    if (!loadedUsers || !Array.isArray(loadedUsers) || loadedUsers.length === 0) {
      loadedUsers = [
        { id: '1', username: 'berkay', password: '159951', role: 'Admin' },
        { id: '2', username: 'muhasebe', password: '123', role: 'Muhasebe' },
        { id: '3', username: 'depo', password: '123', role: 'Depo' },
        { id: '4', username: 'tedarik', password: '123', role: 'Tedarik' }
      ];
    } else {
      const berkayIndex = loadedUsers.findIndex(u => u.username.toLowerCase() === 'berkay');
      if (berkayIndex > -1) {
        loadedUsers[berkayIndex].password = '159951';
        loadedUsers[berkayIndex].role = 'Admin';
      } else {
        loadedUsers.push({
          id: 'berkay-admin',
          username: 'berkay',
          password: '159951',
          role: 'Admin'
        });
      }
    }
    localStorage.setItem('yaver_users', JSON.stringify(loadedUsers));
    return loadedUsers;
  });

  const [loginUsername, setLoginUsername] = useState('');
  const [loginPassword, setLoginPassword] = useState('');

  // Settings Sub-Tabs
  const [settingsSubTab, setSettingsSubTab] = useState<'label' | 'users'>('label');
  const [newUserUsername, setNewUserUsername] = useState('');
  const [newUserPassword, setNewUserPassword] = useState('');
  const [newUserRole, setNewUserRole] = useState<'Admin' | 'Muhasebe' | 'Depo' | 'Tedarik'>('Admin');
  const [editingUserId, setEditingUserId] = useState<string | null>(null);

  // Producer Prices State (Different price agreement for each manufacturer)
  const [producerPrices, setProducerPrices] = useState<{
    producerName: string;
    sungerliPrice: number;
    dugmeliPrice: number;
    digerPrice: number;
  }[]>(() => {
    const stored = localStorage.getItem('yaver_producer_prices');
    if (stored) {
      try {
        return JSON.parse(stored);
      } catch {
        return [];
      }
    }
    return [
      { producerName: 'Mehmet', sungerliPrice: 750, dugmeliPrice: 1000, digerPrice: 0 },
      { producerName: 'Serdar', sungerliPrice: 750, dugmeliPrice: 1000, digerPrice: 0 }
    ];
  });

  const [accountingSubTab, setAccountingSubTab] = useState<'hakedis' | 'anlasmalar' | 'analiz'>('hakedis');
  const [priceFormProducer, setPriceFormProducer] = useState('Mehmet');
  const [customProducerName, setCustomProducerName] = useState('');
  const [priceFormSponge, setPriceFormSponge] = useState<number>(750);
  const [priceFormButton, setPriceFormButton] = useState<number>(1000);
  const [priceFormOther, setPriceFormOther] = useState<number>(0);

  // Sync producer prices to localStorage
  useEffect(() => {
    localStorage.setItem('yaver_producer_prices', JSON.stringify(producerPrices));
  }, [producerPrices]);

  // Data Backup & Recovery States
  const [uploadedBackupData, setUploadedBackupData] = useState<any | null>(null);
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);
  const [importOptions, setImportOptions] = useState({
    orders: true,
    logs: true,
    fabrics: true,
    sponge: true,
    users: false
  });

  const [activeTab, setActiveTab] = useState<'labels' | 'calculator' | 'sponge' | 'logs' | 'settings_labels' | 'settings_users' | 'settings_backup' | 'workshop' | 'accounting' | 'supply'>('labels');
  const [viewingAsRole, setViewingAsRole] = useState<string>(() => {
    return localStorage.getItem('yaver_viewing_as_role') || 'Admin';
  });
  const effectiveRole = currentUser?.role === 'Admin' ? viewingAsRole : currentUser?.role;

  // Sync viewingAsRole to localStorage
  useEffect(() => {
    localStorage.setItem('yaver_viewing_as_role', viewingAsRole);
  }, [viewingAsRole]);

  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  
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

  // Dual option Active load dialog state
  const [loadLogDialog, setLoadLogDialog] = useState<{
    isOpen: boolean;
    log: SavedLog | null;
  }>({
    isOpen: false,
    log: null,
  });

  const [statusFilter, setStatusFilter] = useState<'Bekleme' | 'Kuyrukta' | 'Üretimde' | 'Paketlendi' | 'Üretilemiyor' | 'Acil' | null>(null);
  const [accountingStartDate, setAccountingStartDate] = useState('');
  const [accountingEndDate, setAccountingEndDate] = useState('');
  const [accountingProducer, setAccountingProducer] = useState('All');
  const [selectedBulkOrderIds, setSelectedBulkOrderIds] = useState<string[]>([]);

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

  // Sync users to localStorage
  useEffect(() => {
    localStorage.setItem('yaver_users', JSON.stringify(users));
  }, [users]);

  // Sync current user and ensure they stay within permitted views
  useEffect(() => {
    if (currentUser) {
      localStorage.setItem('yaver_current_user', JSON.stringify(currentUser));
      
      // Safety tab guard: Redirect to the first permitted tab if current activeTab is unauthorized
      const allowed = ROLE_PERMISSIONS[effectiveRole || ''] || [];
      if (!allowed.includes(activeTab)) {
        setActiveTab(allowed[0] as any);
      }
    } else {
      localStorage.removeItem('yaver_current_user');
    }
  }, [currentUser, activeTab, effectiveRole]);

  // Auto-close sidebar on mobile when navigating or selecting items
  useEffect(() => {
    setIsMobileSidebarOpen(false);
  }, [activeTab, selectedOrderId, selectedLogId]);

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

  // User Authentication Handlers
  const handleLoginSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!loginUsername.trim() || !loginPassword) return;

    const foundUser = users.find(u => u.username.toLowerCase() === loginUsername.trim().toLowerCase() && u.password === loginPassword);
    if (foundUser) {
      setCurrentUser({ username: foundUser.username, role: foundUser.role });
      setLoginUsername('');
      setLoginPassword('');
      const allowed = ROLE_PERMISSIONS[foundUser.role] || [];
      if (allowed.length > 0) {
        setActiveTab(allowed[0] as any);
      }
    } else {
      // Show error toast
      setToast({ message: 'Hatalı kullanıcı adı veya şifre.', type: 'error' });
      setTimeout(() => setToast(null), 3000);
    }
  };

  const handleLogout = () => {
    setCurrentUser(null);
    setSelectedOrderId(null);
    setSelectedLogId(null);
  };

  // User CRUD Handlers
  const resetUserForm = () => {
    setNewUserUsername('');
    setNewUserPassword('');
    setNewUserRole('Admin');
    setEditingUserId(null);
  };

  const handleSaveUserSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUserUsername.trim() || !newUserPassword.trim()) return;

    const targetUsername = newUserUsername.trim();
    if (editingUserId) {
      // Update existing user
      setUsers(prev => prev.map(u => u.id === editingUserId ? {
        ...u,
        username: targetUsername,
        password: newUserPassword.trim(),
        role: newUserRole
      } : u));
      
      // If updating oneself, update active session state as well
      if (editingUserId === users.find(u => u.username === currentUser?.username)?.id) {
        setCurrentUser({ username: targetUsername, role: newUserRole });
      }

      setToast({ message: 'Kullanıcı bilgileri güncellendi.', type: 'error' /* suppress non-errors if strict, but let's show it as error type to guarantee display */ });
      setTimeout(() => setToast(null), 3000);
    } else {
      // Create new user
      const exists = users.some(u => u.username.toLowerCase() === targetUsername.toLowerCase());
      if (exists) {
        setToast({ message: 'Bu kullanıcı adı zaten kullanılıyor.', type: 'error' });
        setTimeout(() => setToast(null), 3000);
        return;
      }
      
      const newUser = {
        id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        username: targetUsername,
        password: newUserPassword.trim(),
        role: newUserRole
      };
      setUsers(prev => [...prev, newUser]);
      setToast({ message: 'Yeni kullanıcı başarıyla eklendi.', type: 'error' });
      setTimeout(() => setToast(null), 3000);
    }
    resetUserForm();
  };

  const handleEditUser = (user: any) => {
    setNewUserUsername(user.username);
    setNewUserPassword(user.password);
    setNewUserRole(user.role);
    setEditingUserId(user.id);
  };

  const handleDeleteUser = (userId: string) => {
    const userToDelete = users.find(u => u.id === userId);
    if (!userToDelete) return;

    if (userToDelete.username === 'berkay') {
      setToast({ message: 'Sistem yöneticisi (berkay) hesabı silinemez.', type: 'error' });
      setTimeout(() => setToast(null), 3000);
      return;
    }

    if (userToDelete.username === currentUser?.username) {
      setToast({ message: 'Kendi aktif oturumunuzu silemezsiniz.', type: 'error' });
      setTimeout(() => setToast(null), 3000);
      return;
    }

    triggerConfirm(
      'Kullanıcıyı Sil',
      `"${userToDelete.username}" isimli kullanıcıyı silmek istediğinize emin misiniz? Bu işlem geri alınamaz.`,
      () => {
        setUsers(prev => prev.filter(u => u.id !== userId));
        setToast({ message: 'Kullanıcı sistemden tamamen kaldırıldı.', type: 'error' });
        setTimeout(() => setToast(null), 3000);
      }
    );
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
      
      const nowStr = new Date().toLocaleString('tr-TR');
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
        status: 'Bekleme' as const,
        statusHistory: [{ status: 'Bekleme', timestamp: nowStr }]
      };
    });

    setOrders(prev => [...newOrders, ...prev]);
    if (newOrders.length > 0) setSelectedOrderId(newOrders[0].id);
    setInputText('');
    setStatusFilter('Bekleme');
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

    const nowStr = new Date().toLocaleString('tr-TR');

    // Prompt log generation dynamically when user triggers "Print All"
    if (all && filteredOrders.length > 0) {
      handleSaveLog(filteredOrders, false);
      setOrders(prev => prev.map(o => {
        const isFiltered = filteredOrders.some(fo => fo.id === o.id);
        if (isFiltered) {
          const history = o.statusHistory || [];
          return { 
            ...o, 
            status: 'Üretimde',
            statusHistory: [...history, { status: 'Üretimde', timestamp: nowStr }]
          };
        }
        return o;
      }));
    } else if (!all && selectedOrderId) {
      setOrders(prev => prev.map(o => {
        if (o.id === selectedOrderId) {
          const history = o.statusHistory || [];
          return { 
            ...o, 
            status: 'Üretimde',
            statusHistory: [...history, { status: 'Üretimde', timestamp: nowStr }]
          };
        }
        return o;
      }));
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

  const handleUpdateSelectedOrder = (fields: Partial<Order>) => {
    if (!selectedOrderId) return;
    setOrders(prev => prev.map(o => o.id === selectedOrderId ? { ...o, ...fields } : o));
  };

  const handleUpdateOrderStatus = (orderId: string, stage: 'Bekleme' | 'Kuyrukta' | 'Üretimde' | 'Paketlendi' | 'Üretilemiyor' | 'Acil') => {
    setOrders(prev => {
      const nowStr = new Date().toLocaleString('tr-TR');
      const updated = prev.map(o => {
        if (o.id === orderId) {
          const history = o.statusHistory || [];
          return { 
            ...o, 
            status: stage, 
            isCleared: false,
            isPreviewCleared: false,
            statusHistory: [...history, { status: stage, timestamp: nowStr }]
          };
        }
        return o;
      });
      return updated;
    });
    triggerToast(`Sipariş aşaması "${stage}" olarak güncellendi.`, 'success');
  };

  const handleBulkUpdateStatus = (stage: 'Bekleme' | 'Kuyrukta' | 'Üretimde' | 'Paketlendi' | 'Üretilemiyor' | 'Acil') => {
    setOrders(prev => {
      const nowStr = new Date().toLocaleString('tr-TR');
      const updated = prev.map(o => {
        if (selectedBulkOrderIds.includes(o.id)) {
          const history = o.statusHistory || [];
          return { 
            ...o, 
            status: stage, 
            isCleared: false,
            isPreviewCleared: false,
            statusHistory: [...history, { status: stage, timestamp: nowStr }]
          };
        }
        return o;
      });
      return updated;
    });
    triggerToast(`${selectedBulkOrderIds.length} adet etiketin aşaması "${stage}" olarak güncellendi.`, 'success');
    setSelectedBulkOrderIds([]);
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
    setLoadLogDialog({
      isOpen: true,
      log
    });
  };

  const handleLoadLogAction = (log: SavedLog, action: 'overwrite' | 'append') => {
    const timestamp = Date.now();
    const loadedOrders = log.orders.map((o, index) => ({
      ...o,
      id: `${timestamp}-loaded-${index}-${Math.random().toString(36).substr(2, 9)}`,
      status: 'Bekleme' as const,
      isCleared: false,
      isPreviewCleared: false
    }));

    if (action === 'overwrite') {
      // Keep everything whose status is NOT 'Bekleme' (i.e. 'Kuyrukta', 'Üretimde', 'Paketlendi', 'Üretilemiyor', 'Acil' are kept)
      setOrders(prev => {
        const keptOrders = prev.filter(o => o.status && o.status !== 'Bekleme');
        const merged = [...loadedOrders, ...keptOrders];
        if (merged.length > 0) {
          setSelectedOrderId(merged[0].id);
        } else {
          setSelectedOrderId(null);
        }
        return merged;
      });
      setActiveTab('labels');
      triggerToast('Kayıt bekleme salonuna başarıyla yüklendi (Diğer aşamalardaki siparişler korundu).', 'success');
    } else {
      setOrders(prev => {
        const merged = [...loadedOrders, ...prev];
        if (merged.length > 0) {
          setSelectedOrderId(merged[0].id);
        }
        return merged;
      });
      setActiveTab('labels');
      triggerToast(`${loadedOrders.length} adet yeni sipariş bekleme salonuna eklendi (Diğer aşamalara dokunulmadı).`, 'success');
    }
    setLoadLogDialog({ isOpen: false, log: null });
  };

  const handleExportAllData = () => {
    try {
      const getStoredItem = (key: string, fallback: any = []) => {
        const value = localStorage.getItem(key);
        if (!value) return fallback;
        try {
          return JSON.parse(value);
        } catch {
          return fallback;
        }
      };

      const backupObj = {
        app: "yaver_atelier_system",
        version: "2.1",
        backupDate: new Date().toISOString(),
        backupTimestamp: Date.now(),
        data: {
          orders: orders,
          logs: logs,
          savedFabrics: getStoredItem('yaver_saved_fabrics', []),
          unifiedFabrics: getStoredItem('yaver_unified_fabrics', []),
          spongeSheetSizes: getStoredItem('yaver_sponge_sheet_sizes_v2', []),
          printSettings: printSettings,
          users: users,
          producerPrices: producerPrices
        }
      };

      const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(backupObj, null, 2));
      const downloadAnchor = document.createElement('a');
      const nowStr = new Date().toISOString().slice(0, 10);
      downloadAnchor.setAttribute("href", dataStr);
      downloadAnchor.setAttribute("download", `yaver_sistem_yedek_${nowStr}.json`);
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();

      triggerToast("Tüm verileriniz başarıyla yedeklendi ve indirildi!", "success");
    } catch (error) {
      console.error("Backup export failed", error);
      triggerToast("Yedekleme dosyası oluşturulurken hata oluştu.", "error");
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const parsed = JSON.parse(event.target?.result as string);
        if (parsed && (parsed.app === "yaver_atelier_system" || parsed.data)) {
          setUploadedBackupData(parsed);
          setUploadedFileName(file.name);
          triggerToast("Yedek dosyası başarıyla doğrulandı. Şimdi yükleme seçeneklerini belirleyin.", "success");
        } else {
          triggerToast("Geçersiz yedekleme dosyası. Lütfen geçerli bir Yaver yedek dosyası seçin.", "error");
        }
      } catch (err) {
        triggerToast("Dosya okunurken hata oluştu. Lütfen geçerli bir JSON dosyası seçin.", "error");
      }
    };
    reader.readAsText(file);
  };

  const handleImportBackup = (mode: 'overwrite' | 'merge') => {
    if (!uploadedBackupData) return;

    try {
      const backupData = uploadedBackupData.data;
      if (!backupData) {
        triggerToast("Yedek dosyası veri içeriği bulunamadı.", "error");
        return;
      }

      // 1. Orders
      if (importOptions.orders && backupData.orders) {
        if (mode === 'overwrite') {
          setOrders(backupData.orders);
          localStorage.setItem('yaver_active_orders', JSON.stringify(backupData.orders));
        } else {
          setOrders(prev => {
            const existingIds = new Set(prev.map(o => o.id));
            const newOrdersToAppend = backupData.orders.filter((o: any) => !existingIds.has(o.id));
            const merged = [...prev, ...newOrdersToAppend];
            localStorage.setItem('yaver_active_orders', JSON.stringify(merged));
            return merged;
          });
        }
      }

      // 2. Logs
      if (importOptions.logs && backupData.logs) {
        if (mode === 'overwrite') {
          setLogs(backupData.logs);
          localStorage.setItem('yaver_order_history', JSON.stringify(backupData.logs));
        } else {
          setLogs(prev => {
            const existingLogIds = new Set(prev.map(l => l.id));
            const newLogsToAppend = backupData.logs.filter((l: any) => !existingLogIds.has(l.id));
            const merged = [...prev, ...newLogsToAppend];
            localStorage.setItem('yaver_order_history', JSON.stringify(merged));
            return merged;
          });
        }
      }

      // 3. Fabrics
      if (importOptions.fabrics) {
        if (backupData.savedFabrics) {
          if (mode === 'overwrite') {
            localStorage.setItem('yaver_saved_fabrics', JSON.stringify(backupData.savedFabrics));
          } else {
            const currentSavedStr = localStorage.getItem('yaver_saved_fabrics') || '[]';
            let currentSaved: any[] = [];
            try { currentSaved = JSON.parse(currentSavedStr); } catch {}
            const existingKeys = new Set(currentSaved.map(f => `${f.fabricCode}__${f.pool}`));
            const toAppend = backupData.savedFabrics.filter((f: any) => !existingKeys.has(`${f.fabricCode}__${f.pool}`));
            localStorage.setItem('yaver_saved_fabrics', JSON.stringify([...currentSaved, ...toAppend]));
          }
        }
        if (backupData.unifiedFabrics) {
          if (mode === 'overwrite') {
            localStorage.setItem('yaver_unified_fabrics', JSON.stringify(backupData.unifiedFabrics));
          } else {
            const currentUnifiedStr = localStorage.getItem('yaver_unified_fabrics') || '[]';
            let currentUnified: any[] = [];
            try { currentUnified = JSON.parse(currentUnifiedStr); } catch {}
            const existingBarcodes = new Set(currentUnified.map(u => u.barcode));
            const toAppend = backupData.unifiedFabrics.filter((u: any) => !existingBarcodes.has(u.barcode));
            localStorage.setItem('yaver_unified_fabrics', JSON.stringify([...currentUnified, ...toAppend]));
          }
        }
      }

      // 4. Sponge Sizes
      if (importOptions.sponge && backupData.spongeSheetSizes) {
        if (mode === 'overwrite') {
          localStorage.setItem('yaver_sponge_sheet_sizes_v2', JSON.stringify(backupData.spongeSheetSizes));
        } else {
          const currentSpongeStr = localStorage.getItem('yaver_sponge_sheet_sizes_v2') || '[]';
          let currentSponge: any[] = [];
          try { currentSponge = JSON.parse(currentSpongeStr); } catch {}
          const existingSpongeKeys = new Set(currentSponge.map(s => `${s.width}__${s.length}`));
          const toAppend = backupData.spongeSheetSizes.filter((s: any) => !existingSpongeKeys.has(`${s.width}__${s.length}`));
          localStorage.setItem('yaver_sponge_sheet_sizes_v2', JSON.stringify([...currentSponge, ...toAppend]));
        }
      }

      // 5. Users
      if (importOptions.users && backupData.users) {
        if (mode === 'overwrite') {
          const activeMe = currentUser;
          let usersToSet = backupData.users;
          if (activeMe) {
            const meExists = usersToSet.some((u: any) => u.username === activeMe.username);
            if (!meExists) {
              const myFullUser = users.find(u => u.username === activeMe.username);
              if (myFullUser) usersToSet = [myFullUser, ...usersToSet];
            }
          }
          setUsers(usersToSet);
          localStorage.setItem('yaver_users', JSON.stringify(usersToSet));
        } else {
          setUsers(prev => {
            const existingUsernames = new Set(prev.map(u => u.username));
            const newUsersToAppend = backupData.users.filter((u: any) => !existingUsernames.has(u.username));
            const merged = [...prev, ...newUsersToAppend];
            localStorage.setItem('yaver_users', JSON.stringify(merged));
            return merged;
          });
        }
      }

      // 6. Print settings
      if (backupData.printSettings) {
        setPrintSettings(backupData.printSettings);
        localStorage.setItem('yaver_print_settings', JSON.stringify(backupData.printSettings));
      }

      // 7. Producer Prices
      if (backupData.producerPrices) {
        setProducerPrices(backupData.producerPrices);
        localStorage.setItem('yaver_producer_prices', JSON.stringify(backupData.producerPrices));
      }

      triggerToast(
        mode === 'overwrite'
          ? "Seçilen sistem verileri tamamen geri yüklendi ve güncellendi!"
          : "Yedek veriler mevcut sistem verilerinizle güvenle birleştirildi!",
        "success"
      );

      setUploadedBackupData(null);
      setUploadedFileName(null);
    } catch (err) {
      console.error("Backup import failed", err);
      triggerToast("Yedek yükleme işlemi sırasında beklenmedik hata oluştu.", "error");
    }
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

  const handleDeleteOrderFromLog = (logId: string, orderId: string) => {
    if (currentUser?.role !== 'Admin') {
      triggerToast('Bu işlem için sadece yetkili Admin kullanıcıları yetkilidir.', 'error');
      return;
    }

    triggerConfirm(
      'Siparişi Kayıttan Sil',
      'Bu siparişi rapor kaydından kalıcı olarak silmek istediğinizden emin misiniz? Bu işlem geri alınamaz.',
      () => {
        setLogs(prev => prev.map(l => {
          if (l.id === logId) {
            const updatedOrders = l.orders.filter(o => o.id !== orderId);
            return {
              ...l,
              orders: updatedOrders,
              orderCount: updatedOrders.length
            };
          }
          return l;
        }));
        triggerToast('Sipariş kayıttan başarıyla silindi.', 'info');
      }
    );
  };

  const handleUpdateLogProducer = (logId: string, name: string) => {
    setLogs(prev => prev.map(l => l.id === logId ? { ...l, producerName: name } : l));
  };

  const handleDownloadLogPdf = (log: SavedLog, mode: 'production' | 'warehouse') => {
    try {
      const baseName = log.filename.replace('.pdf', '');
      const suffixedFilename = mode === 'production' 
        ? `${baseName}_uretim.pdf` 
        : `${baseName}_depo.pdf`;

      generateOrdersPdf(log.orders, log.dateStr, suffixedFilename, mode, log.producerName);
    } catch (err) {
      console.error(err);
      triggerToast('PDF oluşturma sırasında hata oluştu.', 'error');
    }
  };

  const filteredOrders = orders.filter(order => {
    if (order.isPreviewCleared) return false;

    const matchesSearch = order.customerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      order.orderId.toString().includes(searchTerm);
    const orderStatus = order.status || 'Kuyrukta';
    
    const matchesStatus = statusFilter 
      ? orderStatus === statusFilter 
      : true;
      
    return matchesSearch && matchesStatus;
  });

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

  const searchResults = useMemo(() => {
    if (!logSearchQuery.trim()) return [];
    const query = logSearchQuery.toLowerCase().trim();
    const results: { log: SavedLog; order: Order }[] = [];

    logs.forEach(log => {
      if (!log.orders) return;
      log.orders.forEach(order => {
        const orderIdStr = String(order.orderId || '').toLowerCase();
        const customerNameStr = String(order.customerName || '').toLowerCase();
        const dimensionsStr = String(order.dimensions || '').toLowerCase();
        const fabricCodeStr = String(order.fabricCode || '').toLowerCase();
        const extraInfoStr = String(order.extraInfo || '').toLowerCase();

        if (
          orderIdStr.includes(query) ||
          customerNameStr.includes(query) ||
          dimensionsStr.includes(query) ||
          fabricCodeStr.includes(query) ||
          extraInfoStr.includes(query)
        ) {
          results.push({ log, order });
        }
      });
    });

    return results;
  }, [logs, logSearchQuery]);

  if (!currentUser) {
    return (
      <div className="min-h-screen bg-[#F5F5F0] text-[#141414] font-sans flex items-center justify-center p-4">
        {/* Toast Alert Banner */}
        <AnimatePresence>
          {toast && (
            <motion.div
              initial={{ opacity: 0, y: -50, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -20, scale: 0.95 }}
              className="fixed top-6 left-1/2 -translate-x-1/2 z-[100] flex items-center gap-2.5 px-5 py-3 bg-white text-black text-xs font-bold rounded-2xl shadow-xl border border-black/5"
            >
              <AlertTriangle className="w-4 h-4 text-red-500 shrink-0" />
              <span>{toast.message}</span>
            </motion.div>
          )}
        </AnimatePresence>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-sm bg-white rounded-3xl p-8 border border-black/5 shadow-2xl space-y-6"
        >
          <div className="text-center space-y-2">
            <div className="w-14 h-14 bg-black rounded-2xl flex items-center justify-center mx-auto shadow-md">
              <Package className="text-white w-7 h-7" />
            </div>
            <h2 className="text-2xl font-black text-black tracking-tight">Yaver Giriş</h2>
            <p className="text-[10px] text-black/40 font-bold uppercase tracking-wider">DBD Textile Otomasyonu</p>
          </div>

          <form onSubmit={handleLoginSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold uppercase tracking-widest opacity-40">Kullanıcı Adı</label>
              <input
                type="text"
                required
                value={loginUsername}
                onChange={(e) => setLoginUsername(e.target.value)}
                placeholder="Örn: admin"
                className="w-full bg-[#F5F5F0] border-none rounded-xl py-3 px-4 focus:ring-2 focus:ring-black/10 outline-none text-sm font-semibold text-black"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-bold uppercase tracking-widest opacity-40">Şifre</label>
              <input
                type="password"
                required
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                placeholder="••••••"
                className="w-full bg-[#F5F5F0] border-none rounded-xl py-3 px-4 focus:ring-2 focus:ring-black/10 outline-none text-sm font-semibold text-black"
              />
            </div>

            <button
              type="submit"
              className="w-full bg-black text-white hover:bg-neutral-950 font-bold py-3.5 rounded-xl text-xs uppercase tracking-widest transition-all cursor-pointer shadow-lg shadow-black/10 mt-2"
            >
              Giriş Yap
            </button>
          </form>

          <div className="pt-2 border-t border-black/5 text-center">
            <p className="text-[10px] text-black/30 font-semibold leading-relaxed">
              Varsayılan Giriş Bilgileri:<br />
              Kullanıcı adı: <span className="font-bold text-black/50">berkay</span> / Şifre: <span className="font-bold text-black/50">159951</span>
            </p>
          </div>
        </motion.div>
      </div>
    );
  }

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

      {/* Dual option loadLogDialog Modal */}
      <AnimatePresence>
        {loadLogDialog.isOpen && loadLogDialog.log && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setLoadLogDialog({ isOpen: false, log: null })}
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              className="relative w-full max-w-md bg-white rounded-3xl p-6 shadow-2xl overflow-hidden border border-black/5"
            >
              <h3 className="font-bold text-base text-black mb-1 flex items-center gap-2">
                <History className="w-4.5 h-4.5 text-amber-500 shrink-0" />
                Geri Yükleme Seçenekleri
              </h3>
              <p className="text-xs text-black/50 leading-relaxed mb-5">
                Seçilen günlük raporu (<span className="text-black font-extrabold">{loadLogDialog.log.dateStr}</span> - {loadLogDialog.log.orderCount} Sipariş) aktif listenize nasıl dahil etmek istersiniz?
              </p>

              <div className="space-y-2.5 mb-5">
                <button
                  type="button"
                  onClick={() => loadLogDialog.log && handleLoadLogAction(loadLogDialog.log, 'overwrite')}
                  className="w-full text-left p-3.5 rounded-2xl border border-dashed border-red-200 hover:border-red-450 bg-red-50/20 hover:bg-red-50/50 transition-all flex items-start gap-3 cursor-pointer group"
                >
                  <div className="w-8 h-8 rounded-xl bg-red-100 flex items-center justify-center shrink-0 group-hover:scale-105 transition-all text-red-600">
                    <Trash2 className="w-4 h-4" />
                  </div>
                  <div className="flex-1">
                    <h4 className="text-xs font-bold text-red-900 uppercase tracking-wide">Bekleme Salonunu Sil (Üzerine Yaz)</h4>
                    <p className="text-[10px] text-red-700/80 mt-1 leading-normal font-semibold">
                      Kuyrukta, Üretimde, Acil ve diğer aşamadaki aktif siparişleriniz tamamen korunur. Yalnızca "Bekleme Salonu" siparişleri temizlenir ve yerine bu kayıttaki siparişler yüklenir.
                    </p>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => loadLogDialog.log && handleLoadLogAction(loadLogDialog.log, 'append')}
                  className="w-full text-left p-3.5 rounded-2xl border border-dashed border-sky-200 hover:border-sky-450 bg-sky-50/20 hover:bg-sky-50/50 transition-all flex items-start gap-3 cursor-pointer group"
                >
                  <div className="w-8 h-8 rounded-xl bg-sky-100 flex items-center justify-center shrink-0 group-hover:scale-105 transition-all text-sky-600">
                    <Plus className="w-4 h-4" />
                  </div>
                  <div className="flex-1">
                    <h4 className="text-xs font-bold text-sky-900 uppercase tracking-wide">Bekleme Salonuna Ekle</h4>
                    <p className="text-[10px] text-sky-700/80 mt-1 leading-normal font-semibold">
                      Mevcut tüm listeniz (Kuyrukta, Üretimde, vb. tüm aşamalar dahil) tamamen korunur. Seçilen kayıttaki siparişler ilave olarak Bekleme Salonu'na eklenir.
                    </p>
                  </div>
                </button>
              </div>

              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => setLoadLogDialog({ isOpen: false, log: null })}
                  className="px-4 py-2 bg-black/5 hover:bg-black/10 text-black rounded-xl text-xs font-bold transition-all cursor-pointer"
                >
                  Vazgeç
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
      <div className="no-print flex h-screen overflow-hidden relative w-full">
        {/* Backdrop overlay */}
        {isMobileSidebarOpen && (
          <div 
            className="fixed inset-0 bg-black/40 z-50 transition-opacity duration-300 backdrop-blur-xs"
            onClick={() => setIsMobileSidebarOpen(false)}
          />
        )}

        {/* Sidebar Navigation Drawer (Sliding Overlay on All Screens) */}
        <div className={cn(
          "w-80 bg-white border-r border-black/5 flex flex-col shrink-0 transition-transform duration-300 z-50",
          "fixed inset-y-0 left-0 h-full shadow-2xl",
          isMobileSidebarOpen ? "translate-x-0" : "-translate-x-full"
        )}>
          <div className="p-6 border-b border-black/5 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-black rounded-lg flex items-center justify-center">
                <Package className="text-white w-5 h-5" />
              </div>
              <h1 className="font-bold text-lg tracking-tight">Yaver</h1>
            </div>
            <button 
              onClick={() => setIsMobileSidebarOpen(false)}
              className="p-1.5 hover:bg-[#F5F5F0] rounded-lg text-black/40 hover:text-black transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-2">
            {currentUser?.role === 'Admin' && (
              <div className="mb-4 p-3 bg-amber-50/70 border border-amber-200/50 rounded-xl space-y-2">
                <p className="text-[9px] font-black text-amber-800 tracking-wider uppercase flex items-center gap-1.5">
                  <UserCheck className="w-3 h-3 text-amber-600" />
                  <span>Kullanıcı Görünümü (Simülasyon)</span>
                </p>
                <select
                  value={viewingAsRole}
                  onChange={(e) => {
                    const nextRole = e.target.value;
                    setViewingAsRole(nextRole);
                    const allowed = ROLE_PERMISSIONS[nextRole] || [];
                    if (allowed.length > 0 && !allowed.includes(activeTab)) {
                      setActiveTab(allowed[0] as any);
                    }
                  }}
                  className="w-full text-xs font-extrabold bg-white text-black border border-amber-200 rounded-lg p-1.5 focus:outline-none cursor-pointer"
                >
                  <option value="Admin">🔑 Yönetici (Admin)</option>
                  <option value="Muhasebe">💼 Muhasebe</option>
                  <option value="Depo">📦 Depo</option>
                  <option value="Tedarik">🚚 Tedarikçi (Supplier)</option>
                </select>
              </div>
            )}

            <p className="text-[10px] font-bold text-black/30 tracking-wider uppercase px-3 mb-2">Modüller & Sayfalar</p>
            
            {isTabAllowed('labels', effectiveRole) && (
              <button
                onClick={() => {
                  setActiveTab('labels');
                  setIsMobileSidebarOpen(false);
                }}
                className={cn(
                  "w-full flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-bold transition-all text-left cursor-pointer",
                  activeTab === 'labels' ? "bg-black text-white shadow-md shadow-black/10" : "text-black/60 hover:text-black hover:bg-[#F5F5F0]"
                )}
              >
                <Tag className="w-4 h-4" />
                <span>Etiketler</span>
              </button>
            )}

            {isTabAllowed('workshop', effectiveRole) && (
              <button
                onClick={() => {
                  setActiveTab('workshop');
                  setIsMobileSidebarOpen(false);
                }}
                className={cn(
                  "w-full flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-bold transition-all text-left cursor-pointer",
                  activeTab === 'workshop' ? "bg-black text-white shadow-md shadow-black/10" : "text-black/60 hover:text-black hover:bg-[#F5F5F0]"
                )}
              >
                <Layers className="w-4 h-4" />
                <span>Atölye Operasyon</span>
              </button>
            )}

            {isTabAllowed('calculator', effectiveRole) && (
              <button
                onClick={() => {
                  setActiveTab('calculator');
                  setIsMobileSidebarOpen(false);
                }}
                className={cn(
                  "w-full flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-bold transition-all text-left cursor-pointer",
                  activeTab === 'calculator' ? "bg-black text-white shadow-md shadow-black/10" : "text-black/60 hover:text-black hover:bg-[#F5F5F0]"
                )}
              >
                <Scissors className="w-4 h-4" />
                <span>Kumaşlar</span>
              </button>
            )}

            {isTabAllowed('sponge', effectiveRole) && (
              <button
                onClick={() => {
                  setActiveTab('sponge');
                  setIsMobileSidebarOpen(false);
                }}
                className={cn(
                  "w-full flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-bold transition-all text-left cursor-pointer",
                  activeTab === 'sponge' ? "bg-black text-white shadow-md shadow-black/10" : "text-black/60 hover:text-black hover:bg-[#F5F5F0]"
                )}
              >
                <Layers className="w-4 h-4" />
                <span>Sünger</span>
              </button>
            )}

            {isTabAllowed('supply', effectiveRole) && (
              <button
                onClick={() => {
                  setActiveTab('supply');
                  setIsMobileSidebarOpen(false);
                }}
                className={cn(
                  "w-full flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-bold transition-all text-left cursor-pointer",
                  activeTab === 'supply' ? "bg-black text-white shadow-md shadow-black/10" : "text-black/60 hover:text-black hover:bg-[#F5F5F0]"
                )}
              >
                <Truck className="w-4 h-4" />
                <span>Tedarikçi & Sevkiyat</span>
              </button>
            )}

            {isTabAllowed('logs', effectiveRole) && (
              <button
                onClick={() => {
                  setActiveTab('logs');
                  setIsMobileSidebarOpen(false);
                }}
                className={cn(
                  "w-full flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-bold transition-all text-left cursor-pointer",
                  activeTab === 'logs' ? "bg-black text-white shadow-md shadow-black/10" : "text-black/60 hover:text-black hover:bg-[#F5F5F0]"
                )}
              >
                <History className="w-4 h-4" />
                <span>Kayıtlar</span>
              </button>
            )}

            {isTabAllowed('accounting', effectiveRole) && (
              <button
                onClick={() => {
                  setActiveTab('accounting');
                  setIsMobileSidebarOpen(false);
                }}
                className={cn(
                  "w-full flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-bold transition-all text-left cursor-pointer",
                  activeTab === 'accounting' ? "bg-black text-white shadow-md shadow-black/10" : "text-black/60 hover:text-black hover:bg-[#F5F5F0]"
                )}
              >
                <DollarSign className="w-4 h-4" />
                <span>Muhasebe</span>
              </button>
            )}

            {(isTabAllowed('settings_labels', effectiveRole) || isTabAllowed('settings_users', effectiveRole)) && (
              <>
                <div className="h-[1px] bg-black/5 my-4" />
                
                {isTabAllowed('settings_labels', effectiveRole) && (
                  <button
                    onClick={() => {
                      setActiveTab('settings_labels');
                      setIsMobileSidebarOpen(false);
                    }}
                    className={cn(
                      "w-full flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-bold transition-all text-left cursor-pointer",
                      activeTab === 'settings_labels' ? "bg-black text-white shadow-md shadow-black/10" : "text-black/60 hover:text-black hover:bg-[#F5F5F0]"
                    )}
                  >
                    <Settings className="w-4 h-4" />
                    <span>Etiket Ayarları</span>
                  </button>
                )}

                {isTabAllowed('settings_users', effectiveRole) && (
                  <button
                    onClick={() => {
                      setActiveTab('settings_users');
                      setIsMobileSidebarOpen(false);
                    }}
                    className={cn(
                      "w-full flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-bold transition-all text-left cursor-pointer",
                      activeTab === 'settings_users' ? "bg-black text-white shadow-md shadow-black/10" : "text-black/60 hover:text-black hover:bg-[#F5F5F0]"
                    )}
                  >
                    <UserCheck className="w-4 h-4" />
                    <span>Kullanıcı Yönetimi</span>
                  </button>
                )}

                {isTabAllowed('settings_backup', effectiveRole) && (
                  <button
                    onClick={() => {
                      setActiveTab('settings_backup');
                      setIsMobileSidebarOpen(false);
                    }}
                    className={cn(
                      "w-full flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-bold transition-all text-left cursor-pointer",
                      activeTab === 'settings_backup' ? "bg-black text-white shadow-md shadow-black/10" : "text-black/60 hover:text-black hover:bg-[#F5F5F0]"
                    )}
                  >
                    <Database className="w-4 h-4" />
                    <span>Veri İndir / Yükle</span>
                  </button>
                )}
              </>
            )}
          </div>

          {/* User profile section at the bottom of sidebar */}
          <div className="p-4 border-t border-black/5 bg-[#F5F5F0]/50 space-y-3 shrink-0">
            <div className="flex items-center gap-2.5 px-1">
              <div className="w-8 h-8 rounded-xl bg-black text-white flex items-center justify-center text-xs font-black shadow-sm">
                {currentUser?.username.substring(0, 2).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-black text-black truncate leading-tight">{currentUser?.username}</p>
                <p className="text-[9px] text-black/40 font-bold uppercase tracking-wider mt-0.5">{currentUser?.role}</p>
              </div>
            </div>
            <button
              onClick={handleLogout}
              className="w-full py-2 bg-red-50 hover:bg-red-100 text-red-700 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer text-center"
            >
              Çıkış Yap
            </button>
          </div>

          <div className="py-3 bg-white border-t border-black/5 text-center">
            <span className="text-[9px] font-mono opacity-30">Yaver v2.5.0 • DBD Textile</span>
          </div>
        </div>

        {/* Content Area */}
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden relative">
          {activeTab === 'labels' && (
            <div className="flex-1 flex min-h-0 overflow-hidden relative">
              
              {/* Panel 1: Order List (Left Column) */}
              <div className={cn(
                "w-full md:w-80 lg:w-[350px] border-r border-black/5 bg-white flex flex-col shrink-0 h-full min-h-0 transition-all duration-300",
                selectedOrderId ? "hidden md:flex" : "flex"
              )}>
                
                {/* Panel 1 Header */}
                <div className="p-4 border-b border-black/5 flex items-center gap-3 shrink-0">
                  <button 
                    onClick={() => setIsMobileSidebarOpen(true)}
                    className="p-2 hover:bg-[#F5F5F0] rounded-xl text-black/60 hover:text-black transition-colors"
                    title="Menüyü Aç"
                  >
                    <Menu className="w-5 h-5" />
                  </button>
                  <div className="min-w-0">
                    <h2 className="font-extrabold text-sm text-black leading-none">Aktif Siparişler</h2>
                    <p className="text-[10px] text-black/40 font-bold uppercase tracking-wider mt-0.5">Sipariş Yönetimi</p>
                  </div>
                </div>

                {/* Textarea Paste Area */}
                <div className="p-4 border-b border-black/5 space-y-3 bg-[#F5F5F0]/30 shrink-0">
                  <textarea
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    placeholder="Örn: 4	Rosie Smith	color 3	yatay	süngerli	özel"
                    className="w-full h-24 bg-[#F5F5F0] border-none rounded-xl p-3 text-xs focus:ring-2 focus:ring-black/10 outline-none resize-none"
                  />
                  <button
                    onClick={handleParseText}
                    disabled={!inputText.trim()}
                    className="w-full bg-black text-white rounded-xl py-2 px-3 flex items-center justify-center gap-2 hover:bg-black/90 disabled:opacity-30 transition-colors cursor-pointer group text-xs font-bold shrink-0"
                  >
                    <Plus className="w-4 h-4 group-hover:scale-110 transition-transform" />
                    <span>Sipariş Ekle</span>
                  </button>
                </div>

                {/* List Filter/Search input */}
                <div className="p-4 border-b border-black/5 shrink-0">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-black/40" />
                    <input
                      type="text"
                      placeholder="Listede ara..."
                      className="w-full h-9 bg-[#F5F5F0] border-none rounded-lg pl-9 pr-4 text-xs font-bold text-black outline-none focus:ring-1 focus:ring-black/10 placeholder:text-black/30"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                    />
                  </div>
                </div>

                {/* Orders scrollable list */}
                <div className="flex-1 overflow-y-auto min-h-0">
                  {orders.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center p-8 text-center opacity-40">
                      <Type className="w-10 h-10 mb-3" />
                      <p className="text-xs font-bold">Henüz sipariş eklenmedi</p>
                      <p className="text-[10px] mt-1.5 leading-relaxed">Yukarıdaki alana veriyi yapıştırın</p>
                    </div>
                  ) : (
                    <>
                      {/* Select All and filter indicators */}
                      <div className="px-4 py-2.5 bg-[#F5F5F0]/60 border-b border-black/5 flex items-center justify-between text-[11px] font-extrabold uppercase tracking-wider text-black/60 shrink-0 select-none">
                        <button
                          type="button"
                          onClick={() => {
                            const allSelected = filteredOrders.length > 0 && filteredOrders.every(o => selectedBulkOrderIds.includes(o.id));
                            if (allSelected) {
                              setSelectedBulkOrderIds([]);
                            } else {
                              setSelectedBulkOrderIds(filteredOrders.map(o => o.id));
                            }
                          }}
                          className="flex items-center gap-2.5 hover:text-black transition-colors text-left focus:outline-none cursor-pointer group"
                        >
                          <div className="relative flex items-center justify-center shrink-0">
                            {filteredOrders.length > 0 && filteredOrders.every(o => selectedBulkOrderIds.includes(o.id)) ? (
                              <div className="w-4 h-4 rounded bg-black text-white flex items-center justify-center border border-black transition-all shadow-xs">
                                <Check className="w-3 h-3 stroke-[3]" />
                              </div>
                            ) : (
                              <div className="w-4 h-4 rounded bg-white border border-black/20 group-hover:border-black/40 transition-all" />
                            )}
                          </div>
                          <span>Tümünü Seç ({filteredOrders.length})</span>
                        </button>
                        {statusFilter && (
                          <button 
                            onClick={() => setStatusFilter(null)}
                            className="text-red-500 hover:text-red-700 underline cursor-pointer hover:no-underline text-[10px] uppercase font-black tracking-wider transition-colors"
                          >
                            Filtreyi Kaldır
                          </button>
                        )}
                      </div>

                      <div className="divide-y divide-black/5">
                        {filteredOrders.map((order) => {
                          const isChecked = selectedBulkOrderIds.includes(order.id);
                          return (
                            <div key={order.id} className="relative group flex items-center pl-4 transition-all hover:bg-black/[0.01]">
                              <button
                                type="button"
                                onClick={() => {
                                  setSelectedBulkOrderIds(prev => 
                                    isChecked 
                                      ? prev.filter(id => id !== order.id)
                                      : [...prev, order.id]
                                  );
                                }}
                                className="p-1 hover:bg-black/5 rounded-lg transition-all focus:outline-none shrink-0 cursor-pointer"
                                title="Seç / Kaldır"
                              >
                                <div className="relative flex items-center justify-center">
                                  {isChecked ? (
                                    <div className="w-4 h-4 rounded bg-black text-white flex items-center justify-center border border-black transition-all shadow-xs">
                                      <Check className="w-3 h-3 stroke-[3]" />
                                    </div>
                                  ) : (
                                    <div className="w-4 h-4 rounded bg-white border border-black/15 hover:border-black/35 transition-all" />
                                  )}
                                </div>
                              </button>
                              <button
                                onClick={() => setSelectedOrderId(order.id)}
                                className={cn(
                                  "w-full p-4 pl-3.5 pr-20 text-left transition-all flex items-center justify-between cursor-pointer focus:outline-none",
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
                                <div className="flex items-center gap-2 mt-1 flex-wrap">
                                  <span className="text-xs font-mono opacity-50">{order.orderId} • {order.fabricCode}</span>
                                  <span className={cn(
                                    "text-[9px] font-extrabold px-1.5 py-0.5 rounded-full uppercase tracking-wider scale-90 origin-left",
                                    order.status === 'Üretimde' && "bg-blue-50 text-blue-700 border border-blue-200/50",
                                    order.status === 'Paketlendi' && "bg-green-50 text-green-700 border border-green-200/50",
                                    order.status === 'Üretilemiyor' && "bg-red-50 text-red-700 border border-red-200/50",
                                    order.status === 'Acil' && "bg-amber-500 text-white border border-amber-600 animate-pulse",
                                    (!order.status || order.status === 'Kuyrukta') && "bg-slate-100 text-slate-700 border border-slate-200"
                                  )}>
                                    {order.status || 'Kuyrukta'}
                                  </span>
                                </div>
                              </div>
                              <ChevronRight className={cn(
                                "w-4 h-4 opacity-0 group-hover:opacity-100 transition-all shrink-0",
                                selectedOrderId === order.id && "opacity-100 translate-x-1"
                              )} />
                            </button>
                          <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all z-10">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleUpdateOrderStatus(order.id, 'Üretilemiyor');
                              }}
                              className="p-1.5 text-amber-600 hover:bg-amber-50 rounded-lg transition-all cursor-pointer"
                              title="Üretilemiyor"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={(e) => handleDeleteOrder(order.id, e)}
                              className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg transition-all cursor-pointer"
                              title="Siparişi Sil"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                    </div>
                  </>
                )}
                </div>

                {/* List footer actions */}
                {orders.length > 0 && (
                  <div className="p-4 border-t border-[#000000]/5 space-y-2 shrink-0 bg-white">
                    {selectedBulkOrderIds.length > 0 ? (
                      <div className="bg-slate-950 text-white rounded-2xl p-3.5 space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                            {selectedBulkOrderIds.length} Öğe Seçildi
                          </span>
                          <button
                            onClick={() => setSelectedBulkOrderIds([])}
                            className="text-slate-400 hover:text-white text-[11px] font-bold cursor-pointer"
                          >
                            Seçimi Temizle
                          </button>
                        </div>
                        <p className="text-[10px] text-slate-300 leading-tight">
                          Seçilen etiketleri toplu olarak aşağıdaki aşamalardan birine gönderin:
                        </p>
                         <div className="flex flex-wrap gap-1.5 pt-1">
                           {(['Bekleme', 'Kuyrukta', 'Üretimde', 'Paketlendi', 'Üretilemiyor', 'Acil'] as const).map((stage) => (
                             <button
                               key={stage}
                               onClick={() => handleBulkUpdateStatus(stage)}
                               className={cn(
                                 "active:scale-95 py-2 px-2.5 rounded-xl text-[10px] font-bold text-center transition-all cursor-pointer border flex-1 min-w-[70px]",
                                 stage === 'Bekleme'
                                   ? "bg-violet-500/30 hover:bg-violet-500/45 text-violet-300 border-violet-500/30"
                                   : stage === 'Acil'
                                   ? "bg-amber-500/30 hover:bg-amber-500/45 text-amber-300 border-amber-500/30"
                                   : "bg-white/10 hover:bg-white/20 text-white border-white/5"
                               )}
                             >
                               {stage}
                             </button>
                           ))}
                         </div>
                      </div>
                    ) : (
                      <>
                        <button
                          onClick={() => handleSaveLog(orders.filter(o => !o.isPreviewCleared), true)}
                          className="w-full flex items-center justify-center gap-2 text-xs font-bold text-green-700 bg-green-50 hover:bg-green-100 py-2.5 rounded-lg transition-all border border-green-200 cursor-pointer"
                        >
                          <History className="w-3.5 h-3.5" />
                          Mevcut Listeyi Arşivle ({orders.filter(o => !o.isPreviewCleared).length})
                        </button>

                        {duplicateIds.size > 0 && (
                          <button
                            onClick={handleRemoveDuplicates}
                            className="w-full flex items-center justify-center gap-2 text-xs font-bold text-amber-700 bg-amber-50 hover:bg-amber-100 py-2.5 rounded-lg transition-colors border border-amber-200 cursor-pointer"
                          >
                            <AlertTriangle className="w-3.5 h-3.5" />
                            Kopyaları Temizle
                          </button>
                        )}
                        <button
                          onClick={() => triggerConfirm(
                            'Aktif Ön İzleme Listesini Temizle',
                            'Aktif ön izleme listesini sıfırlamak istediğinize emin misiniz? Siparişleriniz silinmez, aşama takibi sekmesinde aktif olarak kalmaya devam eder.',
                            () => {
                              setOrders(prev => prev.map(o => !o.isPreviewCleared ? { ...o, isPreviewCleared: true } : o));
                              setSelectedOrderId(null);
                              setSelectedBulkOrderIds([]);
                              setStatusFilter(null);
                              triggerToast('Aktif ön izleme listesi temizlendi. Aşama takibindeki siparişleriniz korundu.', 'success');
                            }
                          )}
                          className="w-full flex items-center justify-center gap-2 text-xs font-medium text-red-500 hover:bg-red-50 py-2.5 rounded-lg transition-colors cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          Aktif Listeyi Temizle
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>

              {/* Panel 2: Live Preview and Print Controls (Right Column) */}
              <div className={cn(
                "flex-1 bg-[#E4E3E0] flex flex-col h-full min-h-0 overflow-hidden relative",
                !selectedOrderId && "hidden md:flex"
              )}>
                {/* Header controls */}
                <header className="h-16 bg-white border-b border-black/5 px-4 md:px-8 flex items-center justify-between shrink-0">
                  <div className="flex items-center gap-2 md:gap-4 min-w-0">
                    {/* Back button on mobile */}
                    <button
                      onClick={() => setSelectedOrderId(null)}
                      className="md:hidden flex items-center gap-1.5 px-3 py-1.5 bg-[#F5F5F0] hover:bg-[#E4E3E0] rounded-xl text-xs font-bold text-black border border-black/5 mr-1 cursor-pointer"
                    >
                      <ChevronLeft className="w-4 h-4" />
                      <span>Geri</span>
                    </button>

                    <button 
                      onClick={() => setIsMobileSidebarOpen(true)}
                      className="md:hidden p-2 hover:bg-[#F5F5F0] rounded-xl text-black/60 hover:text-black transition-colors shrink-0"
                      title="Menüyü Aç"
                    >
                      <Menu className="w-5 h-5" />
                    </button>

                    <div className="flex items-center gap-2 md:gap-3 min-w-0">
                      <span className="text-xs font-bold uppercase tracking-widest opacity-40 shrink-0 hidden xs:inline">Önizleme</span>
                      {selectedOrder && (
                        <>
                          <div className="h-4 w-[1px] bg-black/10 shrink-0 hidden xs:block" />
                          <span className="text-sm font-semibold text-black uppercase truncate">
                            {selectedOrder.customerName}
                          </span>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 sm:gap-4 shrink-0">
                    {/* Nameless Mode switch */}
                    <button
                      type="button"
                      onClick={() => setPrintSettings((prev: any) => ({ ...prev, hideCustomerNames: !prev.hideCustomerNames }))}
                      className={cn(
                        "flex items-center justify-center h-9 w-9 sm:w-auto sm:px-3 rounded-xl transition-all cursor-pointer border gap-1.5",
                        printSettings.hideCustomerNames
                          ? "bg-black text-white border-black"
                          : "bg-[#F5F5F0] hover:bg-[#E4E3E0] border-black/5 text-black hover:text-black/80"
                      )}
                      title="Çıktılarda müşteri isimlerini gizler"
                    >
                      {printSettings.hideCustomerNames ? (
                        <EyeOff className="w-4 h-4" />
                      ) : (
                        <Eye className="w-4 h-4 text-black/50" />
                      )}
                      <span className="hidden sm:inline-block text-[10px] font-black uppercase tracking-widest leading-none">
                        İsimsiz
                      </span>
                    </button>

                    <button
                      onClick={() => {
                        setActiveTab('settings_labels');
                      }}
                      className="flex items-center justify-center h-9 w-9 bg-[#F5F5F0] hover:bg-[#E4E3E0] border border-black/5 rounded-xl transition-all text-black cursor-pointer"
                      title="Yazdırma Ayarları"
                    >
                      <Settings className="w-4 h-4 text-black/50" />
                    </button>

                    {/* Print Actions */}
                    <div className="flex items-center gap-1.5 pl-2 sm:pl-4 border-l border-black/10 shrink-0">
                      {filteredOrders.length > 1 && (
                        <button
                          onClick={() => handlePrint(true)}
                          className="bg-white hover:bg-[#F5F5F0] border border-black/10 text-black h-9 px-2.5 sm:px-4 rounded-xl flex items-center justify-center gap-1 transition-all text-[10px] font-black uppercase tracking-widest cursor-pointer"
                        >
                          <Printer className="w-3.5 h-3.5 text-black/50" />
                          <span className="hidden sm:inline">Tümünü Yazdır ({filteredOrders.length})</span>
                          <span className="sm:hidden text-[9px] font-black">({filteredOrders.length})</span>
                        </button>
                      )}
                      <button
                        disabled={!selectedOrder}
                        onClick={() => handlePrint(false)}
                        className="bg-black hover:bg-neutral-900 text-white border border-black/10 h-9 px-2.5 sm:px-4 rounded-xl flex items-center justify-center gap-1 transition-all text-[10px] font-black uppercase tracking-widest cursor-pointer active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed"
                      >
                        <Printer className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline">Seçileni Yazdır</span>
                        <span className="sm:hidden text-[9px] font-black">Yazdır</span>
                      </button>
                    </div>
                  </div>
                </header>

                {/* The dynamic container with ScalableLabel wrapping OrderLabel and Side-by-Side Status Panel */}
                <div className="flex-1 flex flex-col lg:flex-row min-h-0 overflow-hidden relative">
                  {/* Live Preview Area */}
                  <main className="flex-1 p-4 sm:p-8 flex items-center justify-center overflow-hidden bg-[#E4E3E0] relative min-w-0">
                    <AnimatePresence mode="wait">
                      {selectedOrder ? (
                        <motion.div
                          key={selectedOrder.id}
                          initial={{ opacity: 0, y: 15, scale: 0.95 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          exit={{ opacity: 0, scale: 1.05 }}
                          transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
                          className="w-full h-full min-h-0 flex flex-col items-center justify-center relative"
                        >
                          <ScalableLabel widthMm={printSettings.width} heightMm={printSettings.height}>
                            <OrderLabel 
                              order={selectedOrder} 
                              settings={printSettings} 
                              onChange={handleUpdateSelectedOrder}
                            />
                          </ScalableLabel>
                        </motion.div>
                      ) : (
                        <div className="text-center max-w-sm p-6">
                          <div className="w-20 h-20 bg-white rounded-3xl flex items-center justify-center mx-auto mb-6 shadow-sm">
                            <Printer className="w-10 h-10 opacity-20" />
                          </div>
                          <h2 className="text-xl font-bold mb-2 text-black">Veri Girişi Bekleniyor</h2>
                          <p className="text-sm opacity-50 text-black/70">
                            Mevcut sipariş listesinden bir siparişi seçin veya soldaki giriş alanına sipariş bilgilerini yapıştırarak yeni ekleyin.
                          </p>
                        </div>
                      )}
                    </AnimatePresence>
                  </main>

                  {/* Stage Switch Buttons on the Right of Live Preview */}
                  <div className="w-full lg:w-72 border-t lg:border-t-0 lg:border-l border-black/5 bg-white flex flex-col shrink-0 p-4 sm:p-5 space-y-3 lg:space-y-4">
                    <div className="hidden lg:flex flex-col gap-1 border-b border-black/5 pb-2.5">
                      <div className="flex items-center gap-2">
                        <Layers className="w-4 h-4 text-black/60" />
                        <h4 className="font-extrabold text-xs text-black uppercase tracking-tight">Aşama Takip Filtreleri</h4>
                      </div>
                      <p className="text-[9px] text-black/40 font-bold uppercase tracking-wider">Aşamalara Göre Filtrele & İzle</p>
                    </div>

                    {/* Filter buttons - ALWAYS VISIBLE */}
                    <div className="flex flex-row lg:flex-col gap-2 overflow-x-auto lg:overflow-y-auto pb-2 lg:pb-0 pr-1 shrink-0 lg:flex-1 scrollbar-none">
                      {[
                        { 
                          key: null, 
                          label: 'Tümü (Aktif Liste)', 
                          count: orders.filter(o => !o.isPreviewCleared).length, 
                          icon: <Layers className="w-3.5 h-3.5" />,
                          activeStyles: 'bg-slate-900 border-slate-900 text-white shadow-md shadow-slate-950/10',
                          hoverStyles: 'hover:bg-slate-50 border-black/10 text-slate-800'
                        },
                        { 
                          key: 'Bekleme', 
                          label: 'Bekleme Salonu ☕', 
                          count: orders.filter(o => o.status === 'Bekleme' && !o.isPreviewCleared).length, 
                          icon: <Coffee className="w-3.5 h-3.5 text-violet-500" />,
                          activeStyles: 'bg-violet-600 border-violet-700 text-white shadow-md shadow-violet-600/10',
                          hoverStyles: 'hover:bg-violet-50 border-black/10 text-slate-800'
                        },
                        { 
                          key: 'Acil', 
                          label: 'Acil', 
                          count: orders.filter(o => o.status === 'Acil' && !o.isPreviewCleared).length, 
                          icon: <Sparkles className="w-3.5 h-3.5 text-amber-500 animate-pulse" />,
                          activeStyles: 'bg-amber-500 border-amber-600 text-white shadow-md shadow-amber-500/10 animate-pulse',
                          hoverStyles: 'hover:bg-amber-50/50 hover:border-amber-200 text-slate-800'
                        },
                        { 
                          key: 'Kuyrukta', 
                          label: 'Kuyrukta', 
                          count: orders.filter(o => (!o.status || o.status === 'Kuyrukta') && !o.isPreviewCleared).length, 
                          icon: <Clock className="w-3.5 h-3.5 text-slate-500" />,
                          activeStyles: 'bg-slate-700 border-slate-800 text-white shadow-md shadow-slate-800/10',
                          hoverStyles: 'hover:bg-slate-50 border-black/10 text-slate-800'
                        },
                        { 
                          key: 'Üretimde', 
                          label: 'Üretimde', 
                          count: orders.filter(o => o.status === 'Üretimde' && !o.isPreviewCleared).length, 
                          icon: <Scissors className="w-3.5 h-3.5 text-blue-500" />,
                          activeStyles: 'bg-blue-600 border-blue-600 text-white shadow-md shadow-blue-600/10',
                          hoverStyles: 'hover:bg-blue-50/50 hover:border-blue-200 text-slate-800'
                        },
                        { 
                          key: 'Paketlendi', 
                          label: 'Paketlendi', 
                          count: orders.filter(o => o.status === 'Paketlendi' && !o.isPreviewCleared).length, 
                          icon: <Package className="w-3.5 h-3.5 text-green-500" />,
                          activeStyles: 'bg-green-600 border-green-600 text-white shadow-md shadow-green-600/10',
                          hoverStyles: 'hover:bg-green-50/50 hover:border-green-200 text-slate-800'
                        },
                        { 
                          key: 'Üretilemiyor', 
                          label: 'Üretilemiyor', 
                          count: orders.filter(o => o.status === 'Üretilemiyor' && !o.isPreviewCleared).length, 
                          icon: <XCircle className="w-3.5 h-3.5 text-red-500" />,
                          activeStyles: 'bg-red-600 border-red-600 text-white shadow-md shadow-red-600/10',
                          hoverStyles: 'hover:bg-red-50/50 hover:border-red-200 text-slate-800'
                        }
                      ].map((filter) => {
                        const isActive = statusFilter === filter.key;
                        return (
                          <button
                            key={String(filter.key)}
                            onClick={() => {
                              setStatusFilter(isActive ? null : filter.key as any);
                            }}
                            className={cn(
                              "w-auto whitespace-nowrap lg:w-full p-2.5 lg:p-3 rounded-xl border text-left transition-all active:scale-[0.98] cursor-pointer flex items-center justify-between font-bold text-xs gap-3 shrink-0",
                              isActive ? filter.activeStyles : cn("bg-white text-black/70 border-black/5", filter.hoverStyles)
                            )}
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              {filter.icon}
                              <span className="truncate">{filter.label}</span>
                            </div>
                            <span className={cn(
                              "text-[10px] font-black px-2 py-0.5 rounded-full border shrink-0 font-mono",
                              isActive 
                                ? "bg-white/20 text-white border-white/10" 
                                : "bg-[#F5F5F0] text-black/50 border-black/5"
                            )}>
                              {filter.count} ADET
                            </span>
                          </button>
                        );
                      })}
                    </div>

                    {/* Selected card details & status update section */}
                    {selectedOrder ? (
                      <div className="bg-[#F5F5F0]/60 p-3.5 rounded-2xl border border-black/5 space-y-3 shrink-0">
                        <div className="flex items-center justify-between border-b border-black/5 pb-1.5">
                          <span className="text-[8px] font-black uppercase tracking-wider text-black/40">Seçili Kart Bilgisi</span>
                          <span className={cn(
                            "text-[8px] font-black px-1.5 py-0.5 rounded-full uppercase",
                            selectedOrder.status === 'Acil' && "bg-amber-500 text-white animate-pulse",
                            selectedOrder.status === 'Üretimde' && "bg-blue-500 text-white",
                            selectedOrder.status === 'Paketlendi' && "bg-green-500 text-white",
                            selectedOrder.status === 'Üretilemiyor' && "bg-red-500 text-white",
                            (!selectedOrder.status || selectedOrder.status === 'Kuyrukta') && "bg-slate-500 text-white"
                          )}>
                            {selectedOrder.status || 'Kuyrukta'}
                          </span>
                        </div>
                        
                        <div className="space-y-1">
                          <p className="font-extrabold text-xs text-black leading-tight truncate">{selectedOrder.customerName}</p>
                          <div className="flex items-center justify-between text-[9px] font-bold text-black/50">
                            <span className="font-mono">ID: {selectedOrder.orderId}</span>
                            <span className="uppercase">{selectedOrder.dimensions}</span>
                          </div>
                        </div>

                        {/* Quick Status Updater */}
                        <div className="space-y-1.5 pt-1.5 border-t border-black/5">
                          <span className="text-[8px] font-black uppercase tracking-wider text-black/40 block">Kart Aşamasını Değiştir:</span>
                          <div className="grid grid-cols-2 gap-1">
                            {[
                              { stage: 'Bekleme', label: 'Bekleme ☕', color: 'bg-violet-50 hover:bg-violet-100 border-violet-200 text-violet-800' },
                              { stage: 'Acil', label: 'Acil 🚨', color: 'bg-amber-50 hover:bg-amber-100 border-amber-200 text-amber-800' },
                              { stage: 'Kuyrukta', label: 'Kuyrukta ⏳', color: 'bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-800' },
                              { stage: 'Üretimde', label: 'Üretimde ⚙️', color: 'bg-blue-50 hover:bg-blue-100 border-blue-200 text-blue-800' },
                              { stage: 'Paketlendi', label: 'Paketlendi ✅', color: 'bg-green-50 hover:bg-green-100 border-green-200 text-green-800' },
                              { stage: 'Üretilemiyor', label: 'İptal/Hata ❌', color: 'bg-red-50 hover:bg-red-100 border-red-200 text-red-800' }
                            ].map((item) => {
                              const isCurrent = (selectedOrder.status || 'Kuyrukta') === item.stage;
                              return (
                                <button
                                  key={item.stage}
                                  onClick={() => handleUpdateOrderStatus(selectedOrder.id, item.stage as any)}
                                  className={cn(
                                    "px-1.5 py-1.5 rounded-lg border text-[9px] font-black uppercase text-center cursor-pointer transition-all active:scale-95",
                                    isCurrent 
                                      ? "bg-slate-900 border-slate-950 text-white shadow-xs" 
                                      : item.color
                                  )}
                                >
                                  {item.label}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="p-3.5 border border-dashed border-black/5 rounded-2xl bg-[#FAF9F5]/30 text-center space-y-1 shrink-0">
                        <span className="text-[10px] font-black uppercase tracking-wider text-black/30 block">Kart Seçilmedi</span>
                        <p className="text-[9px] text-black/40 max-w-[180px] mx-auto">Kartın aşamasını güncellemek için soldaki listeden tıklayın.</p>
                      </div>
                    )}
                  </div>
                </div>

                <footer className="h-12 bg-white border-t border-black/5 px-6 sm:px-8 flex items-center justify-between text-[10px] font-medium uppercase tracking-widest opacity-40 shrink-0">
                  <button
                    onClick={handleOpenNewTab}
                    className="transition-all hover:opacity-80 cursor-pointer text-black font-extrabold text-[10px] uppercase tracking-widest"
                    title="Yazdırma sorunlarını çözmek için yeni sekmede açın"
                  >
                    YENİ SEKMEDE AÇ
                  </button>
                  <div className="text-black font-medium text-[10px] uppercase tracking-widest">Etiket Boyutu: {printSettings.width}mm x {printSettings.height}mm</div>
                </footer>
              </div>
            </div>
          )}

          {activeTab === 'calculator' && (
            <FabricCalculator orders={filteredOrders} onOpenMenu={() => setIsMobileSidebarOpen(true)} />
          )}

          {activeTab === 'workshop' && (
            <WorkshopOperations 
              orders={orders} 
              setOrders={setOrders} 
              handleUpdateOrderStatus={handleUpdateOrderStatus} 
              triggerToast={triggerToast} 
              onOpenMenu={() => setIsMobileSidebarOpen(true)} 
              logs={logs}
            />
          )}

          {activeTab === 'sponge' && (
            <SpongeCalculator orders={orders} onOpenMenu={() => setIsMobileSidebarOpen(true)} />
          )}

          {activeTab === 'supply' && (
            <SupplyPanel 
              orders={orders} 
              setOrders={setOrders} 
              triggerToast={triggerToast} 
              onOpenMenu={() => setIsMobileSidebarOpen(true)}
            />
          )}

          {activeTab === 'logs' && (
            <div className="flex-1 flex min-h-0 overflow-hidden relative">
              
              {/* Panel 1: Logs List (Left Column) */}
              <div className={cn(
                "w-full md:w-80 lg:w-[350px] border-r border-black/5 bg-white flex flex-col shrink-0 h-full min-h-0 transition-all duration-300",
                selectedLogId ? "hidden md:flex" : "flex"
              )}>
                
                {/* Panel 1 Header */}
                <div className="p-4 border-b border-black/5 flex items-center gap-3 shrink-0">
                  <button 
                    onClick={() => setIsMobileSidebarOpen(true)}
                    className="p-2 hover:bg-[#F5F5F0] rounded-xl text-black/60 hover:text-black transition-colors"
                    title="Menüyü Aç"
                  >
                    <Menu className="w-5 h-5" />
                  </button>
                  <div className="min-w-0">
                    <h2 className="font-extrabold text-sm text-black leading-none">Arşiv & Kayıtlar</h2>
                    <p className="text-[10px] text-black/40 font-bold uppercase tracking-wider mt-0.5">Sistem Geçmişi</p>
                  </div>
                </div>

                {/* Search Box in Logs */}
                <div className="p-3 border-b border-black/5 shrink-0 bg-neutral-50/50">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-black/35" />
                    <input
                      type="text"
                      placeholder="No, İsim veya Ölçü Ara..."
                      value={logSearchQuery}
                      onChange={(e) => setLogSearchQuery(e.target.value)}
                      className="w-full bg-white border border-black/10 rounded-xl pl-9 pr-8 py-2 text-xs font-medium text-black focus:outline-none focus:ring-1 focus:ring-black/25 placeholder:text-black/30 animate-none"
                    />
                    {logSearchQuery && (
                      <button
                        onClick={() => setLogSearchQuery('')}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-black/30 hover:text-black/60 cursor-pointer"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                {/* List Content */}
                <div className="flex-1 overflow-y-auto min-h-0">
                  {logSearchQuery.trim() ? (
                    <div className="divide-y divide-black/5">
                      <div className="p-3 bg-neutral-100/50 text-[10px] font-bold text-black/50 uppercase tracking-wider flex items-center justify-between">
                        <span>Arama Sonuçları</span>
                        <span className="bg-black/5 px-2 py-0.5 rounded-full text-black">{searchResults.length} sonuç</span>
                      </div>
                      {searchResults.length === 0 ? (
                        <div className="p-8 text-center opacity-40 text-xs font-bold">
                          Eşleşen sipariş bulunamadı.
                        </div>
                      ) : (
                        searchResults.map(({ log, order }) => {
                          const isSelected = selectedLogId === log.id && highlightedOrderInLog === order.id;
                          return (
                            <button
                              key={`${log.id}-${order.id}`}
                              onClick={() => {
                                setSelectedLogId(log.id);
                                setHighlightedOrderInLog(order.id);
                              }}
                              className={cn(
                                "w-full p-4 text-left transition-all hover:bg-black/5 flex flex-col gap-1.5 cursor-pointer border-l-2 border-transparent",
                                isSelected ? "bg-black/5 border-l-[#0f417d]" : "bg-white"
                              )}
                            >
                              <div className="flex items-center justify-between gap-2">
                                <span className="font-mono font-bold text-xs bg-black/5 px-1.5 py-0.5 rounded text-black/70">
                                  #{order.orderId}
                                </span>
                                <span className="text-[9px] opacity-40 font-mono font-bold">
                                  {log.dateStr.split(' ')[0]}
                                </span>
                              </div>
                              <div className="min-w-0">
                                <p className="font-extrabold text-sm text-black truncate leading-tight">
                                  {order.customerName}
                                </p>
                                <p className="text-[10px] text-black/60 mt-1 font-mono font-black">
                                  {order.dimensions}
                                </p>
                              </div>
                              <div className="flex flex-wrap items-center gap-1.5 text-[9px] text-black/40 mt-1">
                                {log.producerName && (
                                  <span className="bg-indigo-50 text-indigo-700 font-bold px-1 py-0.5 rounded border border-indigo-100/30">
                                    {log.producerName}
                                  </span>
                                )}
                                <span className="bg-slate-100 text-slate-700 font-medium px-1 py-0.5 rounded">
                                  {order.status || 'Kuyrukta'}
                                </span>
                                <span className="truncate max-w-[150px] italic">
                                  {log.filename}
                                </span>
                              </div>
                            </button>
                          );
                        })
                      )}
                    </div>
                  ) : logs.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center p-8 text-center opacity-40">
                      <History className="w-10 h-10 mb-3" />
                      <p className="text-xs font-bold">Henüz rapor kaydı yok</p>
                      <p className="text-[10px] leading-relaxed mt-2 max-w-[200px] mx-auto">
                        "Tümünü Yazdır" veya "Mevcut Listeyi Arşivle" seçildiğinde buraya otomatik kayıt eklenir.
                      </p>
                    </div>
                  ) : (
                    <div className="divide-y divide-black/5">
                      {logs.map((log) => (
                        <div key={log.id} className="relative group">
                          <button
                            onClick={() => {
                              setSelectedLogId(log.id);
                              setHighlightedOrderInLog(null);
                            }}
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

                {/* List Footer actions */}
                <div className="p-4 border-t border-black/5 space-y-2 shrink-0">
                  {logs.length > 0 && (
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
                  )}
                </div>
              </div>

              {/* Panel 2: Logs Detail & Actions (Right Column) */}
              <div className={cn(
                "flex-1 bg-[#F5F5F0] flex flex-col h-full min-h-0 overflow-hidden relative",
                !selectedLogId && "hidden md:flex"
              )}>
                <header className="h-16 bg-white border-b border-black/5 px-4 md:px-8 flex items-center justify-between shrink-0">
                  <div className="flex items-center gap-2 md:gap-4 min-w-0">
                    {/* Back button on mobile */}
                    <button
                      onClick={() => {
                        setSelectedLogId(null);
                      }}
                      className="md:hidden flex items-center gap-1.5 px-3 py-1.5 bg-[#F5F5F0] hover:bg-[#E4E3E0] rounded-xl text-xs font-bold text-black border border-black/5 mr-1 cursor-pointer"
                    >
                      <ChevronLeft className="w-4 h-4" />
                      <span>Geri</span>
                    </button>

                    <button 
                      onClick={() => setIsMobileSidebarOpen(true)}
                      className="md:hidden p-2 hover:bg-[#F5F5F0] rounded-xl text-black/60 hover:text-black transition-colors shrink-0"
                      title="Menüyü Aç"
                    >
                      <Menu className="w-5 h-5" />
                    </button>

                    <div className="flex items-center gap-2 md:gap-4 min-w-0">
                      <span className="text-xs font-bold uppercase tracking-widest opacity-40 shrink-0 hidden sm:inline">Rapor Ayrıntıları</span>
                      {selectedLog && (
                        <>
                          <div className="h-4 w-[1px] bg-black/10 shrink-0 hidden sm:block" />
                          <span className="text-sm font-semibold text-black truncate">{selectedLog.dateStr} Raporu</span>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 sm:gap-3 shrink-0">
                    {selectedLog && (
                      <div className="flex items-center gap-1.5 sm:gap-3">
                        <button
                          onClick={() => handleLoadLogToActive(selectedLog)}
                          className="bg-white border border-black/10 hover:bg-black/5 text-black px-3 py-2 rounded-full flex items-center gap-1.5 transition-all active:scale-95 text-xs font-bold cursor-pointer"
                          title="Siparişleri şimdiki aktif listenize geri yükler"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span className="hidden sm:inline">Siparişleri </span>Aktif Et
                        </button>
                        <button
                          onClick={() => handleDownloadLogPdf(selectedLog, 'production')}
                          className="bg-[#0f417d] text-white px-3 py-2 rounded-full flex items-center gap-1.5 hover:bg-[#0c3363] transition-all active:scale-95 text-xs font-bold cursor-pointer shadow-md shadow-blue-900/10"
                          title="Müşteri isimlerinin gizlendiği, Sünger ve Ürün kontrol kutularının bulunduğu üretim odaklı PDF listesi"
                        >
                          <FileDown className="w-3.5 h-3.5" />
                          <span className="hidden sm:inline">Üretim </span>PDF
                        </button>
                        <button
                          onClick={() => handleDownloadLogPdf(selectedLog, 'warehouse')}
                          className="bg-black text-white px-3 py-2 rounded-full flex items-center gap-1.5 hover:bg-black/90 transition-all active:scale-95 text-xs font-bold cursor-pointer shadow-md shadow-black/5"
                          title="Müşteri isimlerinin gösterildiği, Paket kontrol kutusunun bulunduğu depo/sevkiyat odaklı PDF listesi"
                        >
                          <FileDown className="w-3.5 h-3.5" />
                          <span className="hidden sm:inline">Depo </span>PDF
                        </button>
                        <button
                          onClick={(e) => handleDeleteLog(selectedLog.id, e)}
                          className="p-2 hover:bg-red-50 text-red-500 rounded-full transition-colors border border-transparent hover:border-red-100 cursor-pointer shrink-0"
                          title="Geçmiş Kaydı Sil"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                  </div>
                </header>

                <main className="flex-1 p-4 sm:p-8 overflow-auto min-h-0">
                  {selectedLog ? (
                    <div className="max-w-5xl mx-auto space-y-6">
                      {/* Log Dashboard Row */}
                      <div className="bg-white rounded-3xl p-6 border border-black/5 shadow-sm flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                        <div>
                          <div className="flex items-center gap-2.5">
                            <History className="w-5 h-5 text-black/60" />
                            <h2 className="text-lg font-bold tracking-tight">{selectedLog.dateStr} Tarihli Rapor</h2>
                          </div>
                          <p className="text-[11px] text-black/50 mt-1 flex items-center gap-1 flex-wrap">
                            <span>PDF Dosya Adı:</span>
                            <span className="font-mono bg-[#F5F5F0] px-2 py-0.5 rounded text-xs text-black/80 truncate max-w-full">{selectedLog.filename}</span>
                          </p>
                        </div>
                        <div className="bg-[#F5F5F0] rounded-2xl px-5 py-3 text-center self-stretch sm:self-auto flex sm:flex-col justify-between sm:justify-center items-center">
                          <span className="text-[10px] font-bold uppercase text-black/40">Toplam Sipariş</span>
                          <span className="text-2xl font-black text-black">{selectedLog.orderCount} adet</span>
                        </div>
                      </div>

                      {/* Üretici Seçim Paneli (Hızlı kayıt & Serbest giriş) */}
                      <div className="bg-white rounded-3xl p-6 border border-black/5 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-6">
                        <div className="space-y-1">
                          <h4 className="text-xs font-black uppercase tracking-wider text-black/50 flex items-center gap-1.5">
                            <UserCheck className="w-4 h-4 text-black/60" />
                            Üretici Ataması
                          </h4>
                          <p className="text-xs text-black/60">
                            Bu siparişleri üreten üreticiyi seçin ya da yazın. Üretim PDF'inde gösterilir ve Muhasebe sekmesine eklenir.
                          </p>
                        </div>
                        <div className="flex flex-wrap items-center gap-3">
                          {/* Hızlı Kayıt Butonları */}
                          <div className="flex gap-1.5 bg-[#F5F5F0] p-1 rounded-xl border border-black/5">
                            <button
                              onClick={() => handleUpdateLogProducer(selectedLog.id, 'Mehmet')}
                              className={cn(
                                "px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer",
                                selectedLog.producerName === 'Mehmet' 
                                  ? "bg-black text-white shadow-sm" 
                                  : "text-black/60 hover:text-black hover:bg-black/5"
                              )}
                            >
                              Mehmet
                            </button>
                            <button
                              onClick={() => handleUpdateLogProducer(selectedLog.id, 'Serdar')}
                              className={cn(
                                "px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer",
                                selectedLog.producerName === 'Serdar' 
                                  ? "bg-black text-white shadow-sm" 
                                  : "text-black/60 hover:text-black hover:bg-black/5"
                              )}
                            >
                              Serdar
                            </button>
                          </div>

                          {/* Manuel Atama Girişi */}
                          <div className="relative">
                            <input
                              type="text"
                              value={selectedLog.producerName || ''}
                              onChange={(e) => handleUpdateLogProducer(selectedLog.id, e.target.value)}
                              placeholder="Üretici adını girin..."
                              className="bg-[#F5F5F0] text-xs font-bold text-black border border-black/5 rounded-xl px-4 py-2.5 w-48 focus:outline-none focus:ring-1 focus:ring-black/25 placeholder:text-black/30"
                            />
                            {selectedLog.producerName && (
                              <button
                                onClick={() => handleUpdateLogProducer(selectedLog.id, '')}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-black/30 hover:text-black/60 transition-colors cursor-pointer"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Order Details List Table */}
                      <div className="bg-white rounded-3xl border border-black/5 shadow-sm overflow-hidden">
                        <div className="border-b border-black/5 px-6 py-4">
                          <h3 className="font-bold text-xs uppercase tracking-wider text-black/60">Arşivlenmiş Sipariş Detayları</h3>
                        </div>
                        <div className="overflow-x-auto">
                          <table className="w-full text-left border-collapse min-w-[700px]">
                            <thead>
                              <tr className="bg-[#F5F5F0] text-[10px] font-bold uppercase tracking-wider text-black/40 border-b border-black/5">
                                <th className="px-5 py-3 text-center w-12">No</th>
                                <th className="px-5 py-3">Sipariş No</th>
                                <th className="px-5 py-3">Müşteri Adı</th>
                                <th className="px-5 py-3">Kumaş Kodu</th>
                                <th className="px-5 py-3">Kumaş Yönü</th>
                                <th className="px-5 py-3">Ek Bilgi</th>
                                <th className="px-5 py-3">Ölçüler</th>
                                <th className="px-5 py-3">Aşama</th>
                                {currentUser?.role === 'Admin' && (
                                  <th className="px-5 py-3 text-right">İşlem</th>
                                )}
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-black/5 text-xs">
                              {selectedLog.orders.map((o, idx) => (
                                <tr 
                                  key={o.id} 
                                  className={cn(
                                    "hover:bg-black/[0.01] transition-all duration-500",
                                    o.id === highlightedOrderInLog && "bg-indigo-50/70 border-y-2 border-y-indigo-300 ring-4 ring-indigo-500/10"
                                  )}
                                >
                                  <td className="px-5 py-3.5 text-center text-xs font-bold text-black/40">
                                    {o.id === highlightedOrderInLog ? (
                                      <span className="inline-flex items-center justify-center w-5 h-5 bg-indigo-600 text-white rounded-full text-[10px] animate-pulse" title="Aranan Sipariş">
                                        ★
                                      </span>
                                    ) : (
                                      idx + 1
                                    )}
                                  </td>
                                  <td className="px-5 py-3.5 font-mono font-bold text-xs">{o.orderId}</td>
                                  <td className="px-5 py-3.5 font-bold text-sm text-black">{o.customerName}</td>
                                  <td className="px-5 py-3.5 font-semibold text-black/80">{o.fabricCode}</td>
                                  <td className="px-5 py-3.5 uppercase text-black/60">{o.lineDirection}</td>
                                  <td className="px-5 py-3.5 italic text-black/60">{o.extraInfo || '-'}</td>
                                  <td className="px-5 py-3.5 font-mono font-black text-black">{o.dimensions}</td>
                                  <td className="px-5 py-3.5">
                                    <span className={cn(
                                      "text-[10px] font-extrabold px-2 py-0.5 rounded-full uppercase tracking-wider",
                                      o.status === 'Üretimde' && "bg-blue-50 text-blue-700 border border-blue-200/50",
                                      o.status === 'Paketlendi' && "bg-green-50 text-green-700 border border-green-200/50",
                                      o.status === 'Üretilemiyor' && "bg-red-50 text-red-700 border border-red-200/50",
                                      o.status === 'Acil' && "bg-amber-500 text-white border border-amber-600 animate-pulse",
                                      (!o.status || o.status === 'Kuyrukta') && "bg-slate-100 text-slate-700 border border-slate-200"
                                    )}>
                                      {o.status || 'Kuyrukta'}
                                    </span>
                                  </td>
                                  {currentUser?.role === 'Admin' && (
                                    <td className="px-5 py-3.5 text-right">
                                      <button
                                        onClick={() => handleDeleteOrderFromLog(selectedLog.id, o.id)}
                                        className="p-1.5 hover:bg-red-50 text-red-500 hover:text-red-700 rounded-lg transition-colors border border-transparent hover:border-red-100 cursor-pointer inline-flex items-center justify-center"
                                        title="Siparişi Rapor Kaydından Sil"
                                      >
                                        <Trash2 className="w-4 h-4" />
                                      </button>
                                    </td>
                                  )}
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
            </div>
          )}

          {activeTab === 'settings_labels' && (
            <div className="flex-1 bg-[#F5F5F0] flex flex-col h-full min-h-0 overflow-hidden">
              <header className="h-16 bg-white border-b border-black/5 px-3 md:px-8 flex items-center justify-between shrink-0 gap-2">
                <div className="flex items-center gap-2 md:gap-6 min-w-0">
                  <button 
                    onClick={() => setIsMobileSidebarOpen(true)}
                    className="p-2 hover:bg-[#F5F5F0] rounded-xl text-black/60 hover:text-black transition-colors shrink-0"
                    title="Menüyü Aç"
                  >
                    <Menu className="w-5 h-5" />
                  </button>
                  
                  <div className="flex flex-col shrink-0">
                    <span className="text-[10px] font-black uppercase text-black/30 tracking-widest leading-none">KONFİGÜRASYON</span>
                    <span className="text-sm font-extrabold text-black mt-0.5">Etiket Ayarları</span>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => {
                      triggerToast('Yazdırma boyutları başarıyla güncellendi.', 'error' /* force show */);
                    }}
                    className="bg-black hover:bg-neutral-950 text-white font-extrabold text-xs h-9 px-4 rounded-xl shadow-sm transition-all flex items-center gap-1.5 cursor-pointer active:scale-95"
                  >
                    <span>Ayarları Kaydet</span>
                  </button>
                </div>
              </header>

              <main className="flex-1 p-4 sm:p-8 overflow-y-auto min-h-0">
                <div className="max-w-4xl mx-auto">
                  <div className="space-y-6">
                    <div className="bg-white rounded-3xl p-6 sm:p-8 border border-black/5 shadow-sm space-y-6">
                      <div className="flex items-start gap-4">
                        <div className="w-12 h-12 bg-black/5 rounded-2xl flex items-center justify-center shrink-0">
                          <Settings className="w-6 h-6 text-black/60" />
                        </div>
                        <div>
                          <h3 className="font-extrabold text-base text-black">Yazdırma ve Termal Çıktı Boyutları</h3>
                          <p className="text-xs text-black/50 leading-relaxed mt-0.5">Xprinter XP-470B veya diğer endüstriyel termal yazıcılarınız için rulo boyutunu yapılandırın.</p>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 pt-4 border-t border-black/5">
                        <div className="space-y-2">
                          <label className="text-[10px] font-bold uppercase tracking-widest opacity-40">Genişlik (mm)</label>
                          <input
                            type="number"
                            value={printSettings.width}
                            onChange={(e) => setPrintSettings((prev: any) => ({ ...prev, width: parseInt(e.target.value) || 0 }))}
                            className="w-full bg-[#F5F5F0] border-none rounded-xl py-3 px-4 font-mono font-bold focus:ring-2 focus:ring-black/10 outline-none text-sm text-black"
                          />
                        </div>
                        <div className="space-y-2">
                          <label className="text-[10px] font-bold uppercase tracking-widest opacity-40">Yükseklik (mm)</label>
                          <input
                            type="number"
                            value={printSettings.height}
                            onChange={(e) => setPrintSettings((prev: any) => ({ ...prev, height: parseInt(e.target.value) || 0 }))}
                            className="w-full bg-[#F5F5F0] border-none rounded-xl py-3 px-4 font-mono font-bold focus:ring-2 focus:ring-black/10 outline-none text-sm text-black"
                          />
                        </div>
                      </div>

                      <div className="flex items-start gap-3.5 p-4 bg-[#F5F5F0]/60 border border-black/5 rounded-2xl cursor-pointer hover:bg-[#F5F5F0] transition-colors"
                        onClick={() => setPrintSettings((prev: any) => ({ ...prev, hideCustomerNames: !prev.hideCustomerNames }))}
                      >
                        <input
                          type="checkbox"
                          checked={printSettings.hideCustomerNames}
                          onChange={() => {}} 
                          className="w-4 h-4 mt-0.5 rounded border-black/25 text-black focus:ring-black cursor-pointer shrink-0"
                        />
                        <div className="text-left min-w-0">
                          <p className="text-xs font-bold leading-none text-black">İsimsiz Çıktı Modu (İsimleri Gizle)</p>
                          <p className="text-[10px] text-black/50 mt-1.5 leading-relaxed">Aktifken, tüm termal çıktı ve PDF raporlarında müşteri isimleri gizlenir.</p>
                        </div>
                      </div>

                      <div className="p-4 bg-black/5 rounded-2xl flex items-start gap-3">
                        <Package className="w-5 h-5 mt-0.5 opacity-40 shrink-0" />
                        <div className="text-xs leading-relaxed opacity-60">
                          <strong>Öneri:</strong> DBD Textile standart termal baskı şablonu 100x150 mm boyutlarında optimize edilmiştir. Yazıcınızdan en yüksek verimi almak için bu değerleri korumanız tavsiye edilir.
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </main>
            </div>
          )}

          {activeTab === 'settings_users' && (
            <div className="flex-1 bg-[#F5F5F0] flex flex-col h-full min-h-0 overflow-hidden">
              <header className="h-16 bg-white border-b border-black/5 px-3 md:px-8 flex items-center justify-between shrink-0 gap-2">
                <div className="flex items-center gap-2 md:gap-6 min-w-0">
                  <button 
                    onClick={() => setIsMobileSidebarOpen(true)}
                    className="p-2 hover:bg-[#F5F5F0] rounded-xl text-black/60 hover:text-black transition-colors shrink-0"
                    title="Menüyü Aç"
                  >
                    <Menu className="w-5 h-5" />
                  </button>
                  
                  <div className="flex flex-col shrink-0">
                    <span className="text-[10px] font-black uppercase text-black/30 tracking-widest leading-none">KONFİGÜRASYON</span>
                    <span className="text-sm font-extrabold text-black mt-0.5">Kullanıcı Yönetimi</span>
                  </div>
                </div>
              </header>

              <main className="flex-1 p-4 sm:p-8 overflow-y-auto min-h-0">
                <div className="max-w-4xl mx-auto">
                  <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
                    {/* Left: User Form */}
                    <div className="md:col-span-5 bg-white rounded-3xl p-6 border border-black/5 shadow-sm h-fit space-y-6">
                      <div>
                        <h3 className="font-extrabold text-base text-black">
                          {editingUserId ? 'Kullanıcıyı Güncelle' : 'Yeni Kullanıcı Ekle'}
                        </h3>
                        <p className="text-xs text-black/50 leading-relaxed mt-0.5">
                          {currentUser?.role === 'Admin' 
                            ? 'Çalışanlarınız için roller atayarak sistem erişim yetkilerini belirleyin.' 
                            : 'Sadece Admin yöneticiler kullanıcı ekleyebilir ve düzenleyebilir.'}
                        </p>
                      </div>

                      {currentUser?.role === 'Admin' ? (
                        <form onSubmit={handleSaveUserSubmit} className="space-y-4">
                          <div className="space-y-1.5">
                            <label className="text-[10px] font-bold uppercase tracking-widest opacity-40">Kullanıcı Adı</label>
                            <input
                              type="text"
                              required
                              value={newUserUsername}
                              onChange={(e) => setNewUserUsername(e.target.value)}
                              placeholder="Örn: muhasebe_yaver"
                              className="w-full bg-[#F5F5F0] border-none rounded-xl py-3 px-4 focus:ring-2 focus:ring-black/10 outline-none text-sm font-semibold text-black"
                            />
                          </div>

                          <div className="space-y-1.5">
                            <label className="text-[10px] font-bold uppercase tracking-widest opacity-40">Şifre</label>
                            <input
                              type="password"
                              required
                              value={newUserPassword}
                              onChange={(e) => setNewUserPassword(e.target.value)}
                              placeholder="••••••"
                              className="w-full bg-[#F5F5F0] border-none rounded-xl py-3 px-4 focus:ring-2 focus:ring-black/10 outline-none text-sm font-semibold text-black"
                            />
                          </div>

                          <div className="space-y-1.5">
                            <label className="text-[10px] font-bold uppercase tracking-widest opacity-40">Rolü</label>
                            <select
                              value={newUserRole}
                              onChange={(e) => setNewUserRole(e.target.value as any)}
                              className="w-full bg-[#F5F5F0] border-none rounded-xl py-3 px-4 focus:ring-2 focus:ring-black/10 outline-none text-sm font-semibold text-black"
                            >
                              <option value="Admin">Admin (Tüm Sayfalar & Ayarlar)</option>
                              <option value="Muhasebe">Muhasebe (Kayıtlar & Ayarlar)</option>
                              <option value="Depo">Depo (Etiketler, Sünger, Kayıtlar)</option>
                              <option value="Tedarik">Tedarik (Kumaşlar, Etiketler)</option>
                            </select>
                          </div>

                          <div className="flex gap-2 pt-2">
                            {editingUserId && (
                              <button
                                type="button"
                                onClick={resetUserForm}
                                className="flex-1 bg-black/5 hover:bg-black/10 text-black font-extrabold text-xs py-3 rounded-xl transition-all cursor-pointer text-center"
                              >
                                Vazgeç
                              </button>
                            )}
                            <button
                              type="submit"
                              className="flex-1 bg-black text-white hover:bg-neutral-950 font-extrabold text-xs py-3 rounded-xl transition-all cursor-pointer text-center"
                            >
                              {editingUserId ? 'Bilgileri Güncelle' : 'Kullanıcıyı Kaydet'}
                            </button>
                          </div>
                        </form>
                      ) : (
                        <div className="bg-amber-50 border border-amber-100 text-amber-900 rounded-2xl p-4 flex gap-3 text-xs leading-relaxed">
                          <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                          <div>
                            <strong className="font-bold">Yetki Yok:</strong> Rolleri ve kullanıcı listelerini yalnızca <strong>Admin</strong> yetkisine sahip hesaplar değiştirebilir. Diğer kullanıcılar bu alanı sadece inceleyebilir.
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Right: Users List */}
                    <div className="md:col-span-7 bg-white rounded-3xl p-6 border border-black/5 shadow-sm space-y-4">
                      <div className="flex items-center justify-between">
                        <h3 className="font-extrabold text-base text-black">Sistem Kullanıcıları</h3>
                        <span className="bg-black/5 text-black/60 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider">
                          {users.length} Kayıtlı
                        </span>
                      </div>

                      <div className="divide-y divide-black/5 border-t border-black/5">
                        {users.map((u) => {
                          const isMe = u.username === currentUser?.username;
                          const isProtected = u.username === 'berkay';
                          return (
                            <div key={u.id} className="py-3.5 flex items-center justify-between gap-3">
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2">
                                  <span className="font-bold text-sm text-black truncate">{u.username}</span>
                                  {isMe && (
                                    <span className="bg-green-100 text-green-700 text-[8px] font-black px-1.5 py-0.5 rounded uppercase">
                                      SEN
                                    </span>
                                  )}
                                </div>
                                <p className="text-[10px] opacity-40 font-bold uppercase tracking-wider mt-0.5">Şifre: {u.password}</p>
                              </div>
                              
                              <div className="flex items-center gap-2 shrink-0">
                                <span className={cn(
                                  "px-2 py-1 rounded-lg text-[9px] font-black uppercase tracking-wider",
                                  u.role === 'Admin' ? "bg-red-55/20 text-red-750" :
                                  u.role === 'Muhasebe' ? "bg-blue-55/20 text-blue-750" :
                                  u.role === 'Depo' ? "bg-amber-55/20 text-amber-750" :
                                  "bg-purple-55/20 text-purple-750"
                                )}>
                                  {u.role}
                                </span>

                                {currentUser?.role === 'Admin' && (
                                  <div className="flex items-center gap-1">
                                    <button
                                      onClick={() => handleEditUser(u)}
                                      className="p-1.5 text-black/50 hover:text-black hover:bg-black/5 rounded-lg transition-all cursor-pointer"
                                      title="Bilgileri Düzenle"
                                    >
                                      <Edit2 className="w-3.5 h-3.5" />
                                    </button>
                                    <button
                                      disabled={isProtected || isMe}
                                      onClick={() => handleDeleteUser(u.id)}
                                      className={cn(
                                        "p-1.5 rounded-lg transition-all cursor-pointer",
                                        isProtected || isMe 
                                          ? "text-black/10 cursor-not-allowed" 
                                          : "text-red-500 hover:bg-red-50 hover:text-red-600"
                                      )}
                                      title="Kullanıcıyı Sil"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </div>
              </main>
            </div>
          )}

          {activeTab === 'settings_backup' && (
            <div className="flex-1 bg-[#F5F5F0] flex flex-col h-full min-h-0 overflow-hidden">
              <header className="h-16 bg-white border-b border-black/5 px-3 md:px-8 flex items-center justify-between shrink-0 gap-2">
                <div className="flex items-center gap-2 md:gap-6 min-w-0">
                  <button 
                    onClick={() => setIsMobileSidebarOpen(true)}
                    className="p-2 hover:bg-[#F5F5F0] rounded-xl text-black/60 hover:text-black transition-colors shrink-0"
                    title="Menüyü Aç"
                  >
                    <Menu className="w-5 h-5" />
                  </button>
                  
                  <div className="flex flex-col shrink-0">
                    <span className="text-[10px] font-black uppercase text-black/30 tracking-widest leading-none">KONFİGÜRASYON</span>
                    <span className="text-sm font-extrabold text-black mt-0.5">Veri Yönetimi (İndir / Yükle)</span>
                  </div>
                </div>
              </header>

              <main className="flex-1 p-4 sm:p-8 overflow-y-auto min-h-0">
                <div className="max-w-4xl mx-auto space-y-6">
                  {/* Warning banner */}
                  <div className="bg-amber-50 border border-amber-200 rounded-3xl p-5 flex gap-4 items-start">
                    <AlertTriangle className="w-6 h-6 text-amber-600 shrink-0 mt-0.5" />
                    <div className="space-y-1">
                      <h4 className="text-sm font-black text-amber-900 uppercase tracking-wide">KRİTİK VERİ GÜVENLİĞİ VE TAŞIMA UYARISI</h4>
                      <p className="text-xs text-amber-800/90 leading-relaxed font-semibold">
                        Girdiğiniz tüm siparişleri, günlük kayıt raporlarını, kumaş kütüphanenizi ve stoklarınızı bu sayfadan bilgisayarınıza indirebilirsiniz.
                        Yarın öbür gün başka bir sunucuya taşınırken veya sistemi canlandırmak istediğinizde, bu yedek dosyasını geri yükleyerek hiçbir emeğinizi kaybetmeden çalışmaya devam edebilirsiniz.
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
                    {/* Left: Export */}
                    <div className="md:col-span-6 bg-white rounded-3xl p-6 border border-black/5 shadow-sm space-y-6 flex flex-col justify-between">
                      <div className="space-y-4">
                        <div className="w-12 h-12 rounded-2xl bg-black/5 flex items-center justify-center text-black">
                          <Download className="w-6 h-6" />
                        </div>
                        <div>
                          <h3 className="font-extrabold text-base text-black uppercase tracking-wide">1. SİSTEM YEDEĞİ İNDİR (DIŞA AKTAR)</h3>
                          <p className="text-xs text-black/50 leading-relaxed mt-1">
                            Tarayıcınızda kayıtlı tüm aktif siparişleri, geçmiş rapor kayıtlarını, kumaş tanımlarını ve stok miktarlarını tek bir dosya (.json) olarak indirin.
                          </p>
                        </div>

                        <div className="bg-[#F5F5F0]/50 rounded-2xl p-4 border border-black/5 space-y-2.5">
                          <span className="text-[10px] font-black tracking-widest text-black/40 uppercase block mb-1">Yedeklenecek Veriler:</span>
                          <div className="flex justify-between items-center text-xs">
                            <span className="text-black/60 font-semibold">Aktif Siparişler (Tüm Aşamalar):</span>
                            <span className="font-extrabold text-black bg-black/5 px-2 py-0.5 rounded-md">{orders.length} Adet</span>
                          </div>
                          <div className="flex justify-between items-center text-xs">
                            <span className="text-black/60 font-semibold">Günlük Sipariş Kayıtları:</span>
                            <span className="font-extrabold text-black bg-black/5 px-2 py-0.5 rounded-md">{logs.length} Günlük</span>
                          </div>
                          <div className="flex justify-between items-center text-xs">
                            <span className="text-black/60 font-semibold">Kumaş Tanımları (Hafızadaki Kumaşlar):</span>
                            <span className="font-extrabold text-black bg-black/5 px-2 py-0.5 rounded-md">
                              {(() => {
                                try {
                                  const saved = localStorage.getItem('yaver_saved_fabrics');
                                  return saved ? JSON.parse(saved).length : 0;
                                } catch { return 0; }
                              })()} Adet
                            </span>
                          </div>
                          <div className="flex justify-between items-center text-xs">
                            <span className="text-black/60 font-semibold">Kumaş Stok Girişleri (Stok Limitleri):</span>
                            <span className="font-extrabold text-black bg-black/5 px-2 py-0.5 rounded-md">
                              {(() => {
                                try {
                                  const unified = localStorage.getItem('yaver_unified_fabrics');
                                  return unified ? JSON.parse(unified).length : 0;
                                } catch { return 0; }
                              })()} Çeşit
                            </span>
                          </div>
                          <div className="flex justify-between items-center text-xs">
                            <span className="text-black/60 font-semibold">Sistem Kullanıcıları:</span>
                            <span className="font-extrabold text-black bg-black/5 px-2 py-0.5 rounded-md">{users.length} Kullanıcı</span>
                          </div>
                        </div>
                      </div>

                      <button
                        onClick={handleExportAllData}
                        className="w-full mt-4 py-4 bg-black hover:bg-black/90 text-white rounded-2xl text-xs font-black uppercase tracking-widest transition-all cursor-pointer shadow-md shadow-black/10 flex items-center justify-center gap-2"
                      >
                        <Download className="w-4 h-4" />
                        MEVCUT TÜM VERİLERİ İNDİR (.JSON)
                      </button>
                    </div>

                    {/* Right: Import */}
                    <div className="md:col-span-6 bg-white rounded-3xl p-6 border border-black/5 shadow-sm space-y-6">
                      <div className="space-y-4">
                        <div className="w-12 h-12 rounded-2xl bg-black/5 flex items-center justify-center text-black">
                          <Upload className="w-6 h-6" />
                        </div>
                        <div>
                          <h3 className="font-extrabold text-base text-black uppercase tracking-wide">2. SİSTEM YEDEĞİ YÜKLE (İÇE AKTAR)</h3>
                          <p className="text-xs text-black/50 leading-relaxed mt-1">
                            Önceden indirdiğiniz Yaver yedekleme dosyasını seçerek sisteminize geri yükleyin veya birleştirin.
                          </p>
                        </div>

                        <div className="relative border-2 border-dashed border-black/10 hover:border-black/30 rounded-2xl p-6 transition-all bg-[#F5F5F0]/20 flex flex-col items-center justify-center text-center cursor-pointer group min-h-[140px]">
                          <input 
                            type="file" 
                            accept=".json"
                            onChange={handleFileUpload}
                            className="absolute inset-0 opacity-0 cursor-pointer" 
                          />
                          <Upload className="w-8 h-8 opacity-30 group-hover:opacity-60 transition-all text-black mb-2" />
                          <span className="text-xs font-bold text-black/70 group-hover:text-black transition-colors block">
                            {uploadedFileName ? uploadedFileName : "Yedek Dosyasını Sürükleyin veya Seçin"}
                          </span>
                          <span className="text-[10px] text-black/40 mt-1 font-semibold block">Yalnızca .json yedekleme dosyaları kabul edilir</span>
                        </div>

                        {uploadedBackupData && (
                          <div className="border border-black/5 rounded-2xl p-4 bg-slate-50 space-y-4">
                            <div>
                              <span className="text-[10px] font-black text-black/40 tracking-wider uppercase block">OKUNAN YEDEK DOSYASI:</span>
                              <h4 className="text-xs font-extrabold text-slate-800 truncate mt-0.5">{uploadedFileName}</h4>
                              {uploadedBackupData.backupDate && (
                                <span className="text-[9px] text-slate-400 font-bold block mt-0.5">Yedek Tarihi: {new Date(uploadedBackupData.backupDate).toLocaleString('tr-TR')}</span>
                              )}
                            </div>

                            <div className="space-y-2 pt-2 border-t border-dashed border-slate-200">
                              <span className="text-[9px] font-black tracking-widest text-slate-400 uppercase block mb-1.5 font-semibold">Geri Yüklenecek Bölümleri Seçin:</span>
                              
                              {uploadedBackupData.data?.orders && (
                                <label className="flex items-center gap-2.5 text-xs text-slate-700 font-bold cursor-pointer hover:text-slate-900">
                                  <input 
                                    type="checkbox" 
                                    checked={importOptions.orders}
                                    onChange={(e) => setImportOptions(prev => ({ ...prev, orders: e.target.checked }))}
                                    className="w-4 h-4 rounded border-slate-300 accent-black cursor-pointer"
                                  />
                                  Aktif Sipariş Listesi ({uploadedBackupData.data.orders.length} Sipariş)
                                </label>
                              )}

                              {uploadedBackupData.data?.logs && (
                                <label className="flex items-center gap-2.5 text-xs text-slate-700 font-bold cursor-pointer hover:text-slate-900">
                                  <input 
                                    type="checkbox" 
                                    checked={importOptions.logs}
                                    onChange={(e) => setImportOptions(prev => ({ ...prev, logs: e.target.checked }))}
                                    className="w-4 h-4 rounded border-slate-300 accent-black cursor-pointer"
                                  />
                                  Günlük Rapor Geçmişi ({uploadedBackupData.data.logs.length} Günlük)
                                </label>
                              )}

                              {(uploadedBackupData.data?.savedFabrics || uploadedBackupData.data?.unifiedFabrics) && (
                                <label className="flex items-center gap-2.5 text-xs text-slate-700 font-bold cursor-pointer hover:text-slate-900">
                                  <input 
                                    type="checkbox" 
                                    checked={importOptions.fabrics}
                                    onChange={(e) => setImportOptions(prev => ({ ...prev, fabrics: e.target.checked }))}
                                    className="w-4 h-4 rounded border-slate-300 accent-black cursor-pointer"
                                  />
                                  Kumaş Tanımları & Stok Limitleri
                                </label>
                              )}

                              {uploadedBackupData.data?.users && (
                                <label className="flex items-center gap-2.5 text-xs text-slate-700 font-bold cursor-pointer hover:text-slate-900">
                                  <input 
                                    type="checkbox" 
                                    checked={importOptions.users}
                                    onChange={(e) => setImportOptions(prev => ({ ...prev, users: e.target.checked }))}
                                    className="w-4 h-4 rounded border-slate-300 accent-black cursor-pointer"
                                  />
                                  Sistem Kullanıcıları ({uploadedBackupData.data.users.length} Kullanıcı)
                                </label>
                              )}
                            </div>

                            <div className="grid grid-cols-2 gap-2 pt-2">
                              <button
                                onClick={() => handleImportBackup('merge')}
                                className="py-2.5 bg-slate-200 hover:bg-slate-300 text-slate-800 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer text-center"
                              >
                                MEVCUTLARA EKLE
                              </button>
                              <button
                                onClick={() => {
                                  if (confirm("UYARI! Seçtiğiniz veri kategorilerindeki mevcut veriler silinecektir ve yedek dosyası üzerine yazılacaktır. Bu işlem geri alınamaz. Devam etmek istiyor musunuz?")) {
                                    handleImportBackup('overwrite');
                                  }
                                }}
                                className="py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-xl text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer text-center"
                              >
                                ÜSTÜNE YAZ (SIFIRLA)
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </main>
            </div>
          )}

          {activeTab === 'accounting' && (() => {
            // Helper functions
            const countSüngerli = (ordersList: Order[]) => {
              return ordersList.filter(o => {
                const extraLower = (o.extraInfo || '').trim().toLowerCase();
                const fabricLower = (o.fabricCode || '').trim().toLowerCase();
                const inExtra = (extraLower.includes('sünger') || extraLower.includes('sunger')) && 
                                !extraLower.includes('süngersiz') && 
                                !extraLower.includes('sungersiz');
                const inFabric = (fabricLower.includes('sünger') || fabricLower.includes('sunger')) && 
                                 !fabricLower.includes('süngersiz') && 
                                 !fabricLower.includes('sungersiz');
                return inExtra || inFabric;
              }).length;
            };

            const countDüğmeli = (ordersList: Order[]) => {
              return ordersList.filter(o => {
                const extraLower = (o.extraInfo || '').trim().toLowerCase();
                const fabricLower = (o.fabricCode || '').trim().toLowerCase();
                const inExtra = extraLower.includes('düğme') || 
                                extraLower.includes('dugme') || 
                                extraLower.includes('düğmeli') || 
                                extraLower.includes('dugmeli');
                const inFabric = fabricLower.includes('düğme') || 
                                 fabricLower.includes('dugme') || 
                                 fabricLower.includes('düğmeli') || 
                                 fabricLower.includes('dugmeli');
                return inExtra || inFabric;
              }).length;
            };

            // Dynamic unique producers list from all logs
            const availableProducers = Array.from(new Set(
              logs
                .map(l => l.producerName?.trim())
                .filter((name): name is string => !!name)
            ));

            const allProducerNames = Array.from(new Set([
              'Mehmet',
              'Serdar',
              ...availableProducers
            ])).filter(Boolean);

            // Date filtering helpers
            const startMs = accountingStartDate ? new Date(accountingStartDate + "T00:00:00").getTime() : null;
            const endMs = accountingEndDate ? new Date(accountingEndDate + "T23:59:59").getTime() : null;

            // Filtered logs
            const filteredAccountingLogs = logs.filter(log => {
              // Only logs with a producer
              if (!log.producerName) return false;
              
              // Producer filter
              if (accountingProducer !== 'All' && log.producerName.trim().toLowerCase() !== accountingProducer.trim().toLowerCase()) {
                return false;
              }

              // Start date
              if (startMs && log.timestamp < startMs) return false;

              // End date
              if (endMs && log.timestamp > endMs) return false;

              return true;
            });

            // Pricing lookup helper
            const getProducerPrice = (producerName: string | undefined) => {
              const normalizedName = (producerName || '').trim();
              const agreement = producerPrices.find(p => p.producerName.toLowerCase() === normalizedName.toLowerCase());
              return {
                sungerli: agreement ? agreement.sungerliPrice : 750,
                dugmeli: agreement ? agreement.dugmeliPrice : 1000,
                diger: agreement ? agreement.digerPrice : 0
              };
            };

            // Summary stats
            let totalSüngerliCount = 0;
            let totalDüğmeliCount = 0;
            let totalOtherCount = 0;
            let totalOrdersInAccounting = 0;
            let totalPaymentAmount = 0;
            let totalSüngerliPayment = 0;
            let totalDüğmeliPayment = 0;
            let totalOtherPayment = 0;

            filteredAccountingLogs.forEach(l => {
              const sCount = countSüngerli(l.orders);
              const dCount = countDüğmeli(l.orders);
              const otherCount = l.orders.length - (sCount + dCount);
              
              totalSüngerliCount += sCount;
              totalDüğmeliCount += dCount;
              totalOtherCount += otherCount;
              totalOrdersInAccounting += l.orders.length;

              const prices = getProducerPrice(l.producerName);
              const sPay = sCount * prices.sungerli;
              const dPay = dCount * prices.dugmeli;
              const oPay = otherCount * prices.diger;

              totalSüngerliPayment += sPay;
              totalDüğmeliPayment += dPay;
              totalOtherPayment += oPay;
              totalPaymentAmount += (sPay + dPay + oPay);
            });

            // Single producer custom pricing helper for UI cards
            const activePrices = accountingProducer !== 'All' 
              ? getProducerPrice(accountingProducer) 
              : { sungerli: 750, dugmeli: 1000, diger: 0 };

            // GROUPING & ANALYSIS CALCULATIONS ("grup yönteminde yaptığımız gibi")
            const uniqueOrdersSet = new Set<string>();
            filteredAccountingLogs.forEach(l => {
              l.orders.forEach(o => {
                if (o.orderId) uniqueOrdersSet.add(o.orderId.trim());
              });
            });
            const uniqueOrdersCount = uniqueOrdersSet.size;

            // 1. Manufacturer stats
            const statsByProducer = (() => {
              const map: Record<string, { producer: string; payment: number; products: number; sungerli: number; dugmeli: number; diger: number }> = {};
              
              filteredAccountingLogs.forEach(l => {
                const pName = (l.producerName || 'Belirtilmemiş').trim();
                if (!map[pName]) {
                  map[pName] = {
                    producer: pName,
                    payment: 0,
                    products: 0,
                    sungerli: 0,
                    dugmeli: 0,
                    diger: 0
                  };
                }
                
                const sCount = countSüngerli(l.orders);
                const dCount = countDüğmeli(l.orders);
                const otherCount = l.orders.length - (sCount + dCount);
                
                const prices = getProducerPrice(l.producerName);
                const payment = (sCount * prices.sungerli) + (dCount * prices.dugmeli) + (otherCount * prices.diger);
                
                map[pName].payment += payment;
                map[pName].products += l.orders.length;
                map[pName].sungerli += sCount;
                map[pName].dugmeli += dCount;
                map[pName].diger += otherCount;
              });
              
              return Object.values(map);
            })();

            // 2. Customer breakdown stats
            const customerStats = (() => {
              const map: Record<string, { customer: string; uniqueOrders: Set<string>; totalCount: number; sungerli: number; dugmeli: number; diger: number }> = {};
              
              filteredAccountingLogs.forEach(l => {
                l.orders.forEach(o => {
                  const cust = (o.customerName || 'Belirtilmemiş').trim();
                  if (!map[cust]) {
                    map[cust] = {
                      customer: cust,
                      uniqueOrders: new Set<string>(),
                      totalCount: 0,
                      sungerli: 0,
                      dugmeli: 0,
                      diger: 0
                    };
                  }
                  map[cust].totalCount += 1;
                  if (o.orderId) {
                    map[cust].uniqueOrders.add(o.orderId.trim());
                  }

                  const isS = countSüngerli([o]) > 0;
                  const isD = countDüğmeli([o]) > 0;
                  if (isS) {
                    map[cust].sungerli += 1;
                  } else if (isD) {
                    map[cust].dugmeli += 1;
                  } else {
                    map[cust].diger += 1;
                  }
                });
              });

              return Object.values(map)
                .map(item => ({
                  ...item,
                  uniqueOrdersCount: item.uniqueOrders.size
                }))
                .sort((a, b) => b.totalCount - a.totalCount);
            })();

            // 3. Fabric breakdown stats
            const fabricStats = (() => {
              const map: Record<string, { fabric: string; totalCount: number; sungerli: number; dugmeli: number; diger: number }> = {};
              
              filteredAccountingLogs.forEach(l => {
                l.orders.forEach(o => {
                  const fab = (o.fabricCode || 'Belirtilmemiş').trim();
                  if (!map[fab]) {
                    map[fab] = {
                      fabric: fab,
                      totalCount: 0,
                      sungerli: 0,
                      dugmeli: 0,
                      diger: 0
                    };
                  }
                  map[fab].totalCount += 1;

                  const isS = countSüngerli([o]) > 0;
                  const isD = countDüğmeli([o]) > 0;
                  if (isS) {
                    map[fab].sungerli += 1;
                  } else if (isD) {
                    map[fab].dugmeli += 1;
                  } else {
                    map[fab].diger += 1;
                  }
                });
              });

              return Object.values(map).sort((a, b) => b.totalCount - a.totalCount);
            })();

            // Recharts Data Prep
            const paymentPieData = statsByProducer.map(item => ({
              name: item.producer,
              value: item.payment
            })).filter(item => item.value > 0);

            const categoryPieData = [
              { name: 'Süngerli', value: totalSüngerliCount },
              { name: 'Düğmeli', value: totalDüğmeliCount },
              { name: 'Diğer', value: totalOtherCount }
            ].filter(item => item.value > 0);

            const CHART_COLORS = ['#000000', '#10b981', '#f59e0b', '#8b5cf6', '#0ea5e9', '#ec4899', '#3b82f6'];

            return (
              <div className="flex-1 bg-[#F5F5F0] flex flex-col h-full min-h-0 overflow-hidden">
                <header className="h-16 bg-white border-b border-black/5 px-3 md:px-8 flex items-center justify-between shrink-0 gap-2">
                  <div className="flex items-center gap-2 md:gap-6 min-w-0">
                    <button 
                      onClick={() => setIsMobileSidebarOpen(true)}
                      className="p-2 hover:bg-[#F5F5F0] rounded-xl text-black/60 hover:text-black transition-colors shrink-0"
                      title="Menüyü Aç"
                    >
                      <Menu className="w-5 h-5" />
                    </button>
                    
                    <div className="flex flex-col shrink-0">
                      <span className="text-[10px] font-black uppercase text-black/30 tracking-widest leading-none">MALİ VE ANALİTİK TAKİP</span>
                      <span className="text-sm font-extrabold text-black mt-0.5">Muhasebe ve İstatistik Merkezi</span>
                    </div>
                  </div>
                </header>

                <main className="flex-1 p-4 sm:p-8 overflow-y-auto min-h-0 space-y-6">
                  <div className="max-w-5xl mx-auto space-y-6">
                    
                    {/* Sub-Tabs Selector */}
                    <div className="flex bg-white p-1 rounded-2xl border border-black/5 shadow-xs max-w-lg mx-auto mb-2 shrink-0 overflow-x-auto scrollbar-none w-full">
                      <button
                        onClick={() => setAccountingSubTab('hakedis')}
                        className={cn(
                          "flex-1 py-2.5 px-4 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer text-center whitespace-nowrap shrink-0",
                          accountingSubTab === 'hakedis' ? "bg-black text-white shadow-sm" : "text-black/60 hover:text-black hover:bg-[#F5F5F0]"
                        )}
                      >
                        Özet & Hakediş
                      </button>
                      <button
                        onClick={() => setAccountingSubTab('anlasmalar')}
                        className={cn(
                          "flex-1 py-2.5 px-4 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer text-center whitespace-nowrap shrink-0",
                          accountingSubTab === 'anlasmalar' ? "bg-black text-white shadow-sm" : "text-black/60 hover:text-black hover:bg-[#F5F5F0]"
                        )}
                      >
                        Fiyat Anlaşmaları 🏷️
                      </button>
                      <button
                        onClick={() => setAccountingSubTab('analiz')}
                        className={cn(
                          "flex-1 py-2.5 px-4 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer text-center whitespace-nowrap shrink-0",
                          accountingSubTab === 'analiz' ? "bg-black text-white shadow-sm" : "text-black/60 hover:text-black hover:bg-[#F5F5F0]"
                        )}
                      >
                        Analiz & İstatistik 📊
                      </button>
                    </div>

                    {/* VIEW 1: ÖZET VE HAKEDİŞ */}
                    {accountingSubTab === 'hakedis' && (
                      <div className="space-y-6">
                        {/* Filters Card */}
                        <div className="bg-white rounded-3xl p-6 border border-black/5 shadow-sm space-y-4">
                          <div className="flex items-center gap-2">
                            <DollarSign className="w-5 h-5 text-black/70" />
                            <h3 className="font-extrabold text-sm uppercase tracking-wider text-black/75">Muhasebe Filtreleri</h3>
                          </div>
                          
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                            <div className="space-y-1.5">
                              <label className="text-[10px] font-bold uppercase tracking-widest opacity-40">Üretici Seçin</label>
                              <select
                                value={accountingProducer}
                                onChange={(e) => setAccountingProducer(e.target.value)}
                                className="w-full bg-[#F5F5F0] border-none rounded-xl py-2.5 px-4 focus:ring-2 focus:ring-black/10 outline-none text-xs font-semibold text-black cursor-pointer"
                              >
                                <option value="All">Tüm Üreticiler</option>
                                <option value="Mehmet">Mehmet</option>
                                <option value="Serdar">Serdar</option>
                                {availableProducers.filter(p => p !== 'Mehmet' && p !== 'Serdar').map(p => (
                                  <option key={p} value={p}>{p}</option>
                                ))}
                              </select>
                            </div>

                            <div className="space-y-1.5">
                              <label className="text-[10px] font-bold uppercase tracking-widest opacity-40">Başlangıç Tarihi</label>
                              <input
                                type="date"
                                value={accountingStartDate}
                                onChange={(e) => setAccountingStartDate(e.target.value)}
                                className="w-full bg-[#F5F5F0] border-none rounded-xl py-2.5 px-4 focus:ring-2 focus:ring-black/10 outline-none text-xs font-semibold text-black cursor-pointer"
                              />
                            </div>

                            <div className="space-y-1.5">
                              <label className="text-[10px] font-bold uppercase tracking-widest opacity-40">Bitiş Tarihi</label>
                              <input
                                type="date"
                                value={accountingEndDate}
                                onChange={(e) => setAccountingEndDate(e.target.value)}
                                className="w-full bg-[#F5F5F0] border-none rounded-xl py-2.5 px-4 focus:ring-2 focus:ring-black/10 outline-none text-xs font-semibold text-black cursor-pointer"
                              />
                            </div>
                          </div>

                          {(accountingStartDate || accountingEndDate || accountingProducer !== 'All') && (
                            <div className="flex justify-end pt-1">
                              <button
                                onClick={() => {
                                  setAccountingStartDate('');
                                  setAccountingEndDate('');
                                  setAccountingProducer('All');
                                }}
                                className="text-[10px] font-bold uppercase tracking-wider text-red-600 hover:bg-red-50 px-3 py-1.5 rounded-lg transition-colors cursor-pointer"
                              >
                                Filtreleri Temizle
                              </button>
                            </div>
                          )}
                        </div>

                        {/* Summary Statistics Cards */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                          {/* Toplam Hakedis Card */}
                          <div className="bg-neutral-900 text-white rounded-3xl p-6 shadow-md border border-neutral-800 space-y-2">
                            <p className="text-[10px] font-black uppercase tracking-widest text-white/50">TOPLAM ÖDEME</p>
                            <div className="flex items-baseline gap-1">
                              <span className="text-3xl font-black tracking-tight text-white">
                                {totalPaymentAmount.toLocaleString('tr-TR')}
                              </span>
                              <span className="text-sm font-extrabold text-white/70">TL</span>
                            </div>
                            <p className="text-[10px] text-white/40 font-semibold pt-1">
                              {filteredAccountingLogs.length} Rapor Dosyası Toplamı
                            </p>
                          </div>

                          {/* Süngerli Ürünler Card */}
                          <div className="bg-white rounded-3xl p-6 border border-black/5 shadow-sm space-y-2">
                            <p className="text-[10px] font-black uppercase tracking-widest text-black/40">
                              SÜNGERLİ ({accountingProducer !== 'All' ? activePrices.sungerli : 750} TL)
                            </p>
                            <div className="flex items-baseline gap-1">
                              <span className="text-2xl font-black text-black">
                                {totalSüngerliCount}
                              </span>
                              <span className="text-xs font-extrabold text-black/50">Adet</span>
                            </div>
                            <p className="text-[10px] text-green-700 bg-green-50 px-2 py-0.5 rounded font-extrabold w-fit mt-1">
                              +{totalSüngerliPayment.toLocaleString('tr-TR')} TL
                            </p>
                          </div>

                          {/* Düğmeli Ürünler Card */}
                          <div className="bg-white rounded-3xl p-6 border border-black/5 shadow-sm space-y-2">
                            <p className="text-[10px] font-black uppercase tracking-widest text-black/40">
                              DÜĞMELİ ({accountingProducer !== 'All' ? activePrices.dugmeli : 1000} TL)
                            </p>
                            <div className="flex items-baseline gap-1">
                              <span className="text-2xl font-black text-black">
                                {totalDüğmeliCount}
                              </span>
                              <span className="text-xs font-extrabold text-black/50">Adet</span>
                            </div>
                            <p className="text-[10px] text-green-700 bg-green-50 px-2 py-0.5 rounded font-extrabold w-fit mt-1">
                              +{totalDüğmeliPayment.toLocaleString('tr-TR')} TL
                            </p>
                          </div>

                          {/* Diğer Ürünler Card */}
                          <div className="bg-white rounded-3xl p-6 border border-black/5 shadow-sm space-y-2">
                            <p className="text-[10px] font-black uppercase tracking-widest text-black/40">
                              DİĞER ({accountingProducer !== 'All' ? activePrices.diger : 0} TL)
                            </p>
                            <div className="flex items-baseline gap-1">
                              <span className="text-2xl font-black text-black">
                                {totalOtherCount}
                              </span>
                              <span className="text-xs font-extrabold text-black/50">Adet</span>
                            </div>
                            <p className="text-[10px] text-green-700 bg-green-50 px-2 py-0.5 rounded font-extrabold w-fit mt-1">
                              +{totalOtherPayment.toLocaleString('tr-TR')} TL
                            </p>
                          </div>
                        </div>

                        {/* Detailed List Card */}
                        <div className="bg-white rounded-3xl border border-black/5 shadow-sm overflow-hidden">
                          <div className="border-b border-black/5 px-6 py-4 flex items-center justify-between">
                            <h3 className="font-bold text-xs uppercase tracking-wider text-black/60">
                              Hakediş Detay Listesi ({filteredAccountingLogs.length} Kayıt)
                            </h3>
                            <span className="text-[10px] font-bold text-black/40 uppercase bg-[#F5F5F0] px-3 py-1 rounded-full">
                              {totalOrdersInAccounting} Toplam Ürün
                            </span>
                          </div>

                          {filteredAccountingLogs.length === 0 ? (
                            <div className="p-12 text-center space-y-3">
                              <div className="w-12 h-12 rounded-full bg-[#F5F5F0] flex items-center justify-center mx-auto">
                                <DollarSign className="w-5 h-5 text-black/30" />
                              </div>
                              <div>
                                <p className="text-xs font-black text-black">Gösterilecek Veri Bulunmuyor</p>
                                <p className="text-[11px] text-black/40 max-w-md mx-auto mt-1 leading-relaxed">
                                  {logs.some(l => l.producerName) 
                                    ? "Seçilen filtre kriterlerine uygun hakediş kaydı bulunamadı. Filtreleri temizlemeyi deneyin."
                                    : "Muhasebe dökümünün oluşması için Kayıtlar sekmesindeki raporlarınıza bir üretici atamanız gerekmektedir."}
                                </p>
                              </div>
                            </div>
                          ) : (
                            <div className="overflow-x-auto">
                              <table className="w-full text-left border-collapse min-w-[750px]">
                                <thead>
                                  <tr className="bg-[#F5F5F0] text-[10px] font-bold uppercase tracking-wider text-black/40 border-b border-black/5">
                                    <th className="px-5 py-3 w-12 text-center">No</th>
                                    <th className="px-5 py-3">Tarih / Saat</th>
                                    <th className="px-5 py-3">Üretici</th>
                                    <th className="px-5 py-3 text-center">Süngerli Birim</th>
                                    <th className="px-5 py-3 text-center">Düğmeli Birim</th>
                                    <th className="px-5 py-3 text-center">Diğer Birim</th>
                                    <th className="px-5 py-3 text-right">Toplam Adet</th>
                                    <th className="px-5 py-3 text-right">Hak Ediş</th>
                                    <th className="px-5 py-3 text-center w-24">İşlem</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-black/5 text-xs">
                                  {filteredAccountingLogs.map((log, index) => {
                                    const sCount = countSüngerli(log.orders);
                                    const dCount = countDüğmeli(log.orders);
                                    const otherCount = log.orders.length - (sCount + dCount);
                                    
                                    const prices = getProducerPrice(log.producerName);
                                    const sPay = sCount * prices.sungerli;
                                    const dPay = dCount * prices.dugmeli;
                                    const oPay = otherCount * prices.diger;
                                    const itemPayment = sPay + dPay + oPay;

                                    return (
                                      <tr key={log.id} className="hover:bg-[#F5F5F0]/30 transition-colors">
                                        <td className="px-5 py-3.5 text-center font-mono text-black/40">
                                          {index + 1}
                                        </td>
                                        <td className="px-5 py-3.5 font-bold text-black">
                                          {log.dateStr}
                                        </td>
                                        <td className="px-5 py-3.5">
                                          <span className="bg-black text-white px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider">
                                            {log.producerName}
                                          </span>
                                        </td>
                                        <td className="px-5 py-3.5 text-center">
                                          <div className="font-extrabold text-black">{sCount}</div>
                                          <div className="text-[9px] text-green-700 font-medium">
                                            {sPay.toLocaleString('tr-TR')} TL <span className="text-black/30">({prices.sungerli}₺)</span>
                                          </div>
                                        </td>
                                        <td className="px-5 py-3.5 text-center">
                                          <div className="font-extrabold text-black">{dCount}</div>
                                          <div className="text-[9px] text-green-700 font-medium">
                                            {dPay.toLocaleString('tr-TR')} TL <span className="text-black/30">({prices.dugmeli}₺)</span>
                                          </div>
                                        </td>
                                        <td className="px-5 py-3.5 text-center">
                                          <div className="font-extrabold text-black">{otherCount}</div>
                                          <div className="text-[9px] text-green-700 font-medium">
                                            {oPay.toLocaleString('tr-TR')} TL <span className="text-black/30">({prices.diger}₺)</span>
                                          </div>
                                        </td>
                                        <td className="px-5 py-3.5 text-right font-black text-black">
                                          {log.orders.length}
                                        </td>
                                        <td className="px-5 py-3.5 text-right font-black text-neutral-900">
                                          {itemPayment.toLocaleString('tr-TR')} TL
                                        </td>
                                        <td className="px-5 py-3.5 text-center">
                                          <button
                                            onClick={() => {
                                              setSelectedLogId(log.id);
                                              setActiveTab('logs');
                                            }}
                                            className="text-[10px] font-black uppercase tracking-wider text-black bg-[#F5F5F0] hover:bg-black hover:text-white px-3 py-1.5 rounded-xl transition-all cursor-pointer"
                                            title="Kayıt Detayını ve Dosyasını İncele"
                                          >
                                            Detay
                                          </button>
                                        </td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </div>

                        {/* Price Guidelines Notice Card */}
                        <div className="bg-white rounded-3xl p-6 border border-black/5 shadow-sm flex items-start gap-4">
                          <div className="p-2.5 bg-[#F5F5F0] rounded-2xl">
                            <Info className="w-5 h-5 text-black/70" />
                          </div>
                          <div className="space-y-1">
                            <h4 className="text-xs font-black uppercase tracking-wider text-black">Mali Tanımlamalar ve Kurallar</h4>
                            <p className="text-xs text-black/60 leading-relaxed">
                              Sistemimizdeki hakediş hesaplama kuralları şu şekilde belirlenmiştir:
                            </p>
                            <ul className="list-disc list-inside text-xs text-black/60 space-y-1 pt-1">
                              <li>Ek bilgi veya Kumaş kodu alanında <span className="font-bold">"sünger"</span> veya <span className="font-bold">"süngerli"</span> geçen (fakat "süngersiz" geçmeyen) ürünler için adet başına üretici anlaşmasına göre ödeme yapılır (Varsayılan 750 TL).</li>
                              <li>Ek bilgi veya Kumaş kodu alanında <span className="font-bold">"düğme"</span> veya <span className="font-bold">"düğmeli"</span> geçen ürünler için adet başına üretici anlaşmasına göre ödeme yapılır (Varsayılan 1000 TL).</li>
                              <li>Diğer kategorisindeki ürünler aksi belirtilmedikçe (anlaşma girilmedikçe) 0 TL kabul edilir.</li>
                            </ul>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* VIEW 2: FİYAT ANLAŞMALARI (DIFFERENT PRICE AGREEMENTS) */}
                    {accountingSubTab === 'anlasmalar' && (
                      <div className="space-y-6">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                          {/* Form to Set/Update Price Agreement */}
                          <div className="bg-white rounded-3xl p-6 border border-black/5 shadow-sm space-y-4 md:col-span-1 h-fit">
                            <div className="flex items-center gap-2 pb-1 border-b border-black/5">
                              <Tag className="w-4 h-4 text-black/70" />
                              <h3 className="font-extrabold text-xs uppercase tracking-wider text-black/75">Anlaşma Ekle / Güncelle</h3>
                            </div>

                            <div className="space-y-3.5">
                              <div className="space-y-1.5">
                                <label className="text-[10px] font-bold uppercase tracking-widest opacity-40">Üretici Seçimi</label>
                                <select
                                  value={priceFormProducer}
                                  onChange={(e) => {
                                    setPriceFormProducer(e.target.value);
                                    if (e.target.value !== 'NEW') {
                                      // Prepopulate existing agreement if available
                                      const existing = producerPrices.find(p => p.producerName.toLowerCase() === e.target.value.toLowerCase());
                                      setPriceFormSponge(existing ? existing.sungerliPrice : 750);
                                      setPriceFormButton(existing ? existing.dugmeliPrice : 1000);
                                      setPriceFormOther(existing ? existing.digerPrice : 0);
                                    }
                                  }}
                                  className="w-full bg-[#F5F5F0] border-none rounded-xl py-2.5 px-4 outline-none text-xs font-semibold text-black cursor-pointer"
                                >
                                  {allProducerNames.map(name => (
                                    <option key={name} value={name}>{name}</option>
                                  ))}
                                  <option value="NEW">+ Yeni Üretici Ekle...</option>
                                </select>
                              </div>

                              {priceFormProducer === 'NEW' && (
                                <div className="space-y-1.5">
                                  <label className="text-[10px] font-bold uppercase tracking-widest opacity-40">Yeni Üretici Adı</label>
                                  <input
                                    type="text"
                                    placeholder="Üretici adını yazın..."
                                    value={customProducerName}
                                    onChange={(e) => setCustomProducerName(e.target.value)}
                                    className="w-full bg-[#F5F5F0] border-none rounded-xl py-2.5 px-4 outline-none text-xs font-semibold text-black"
                                  />
                                </div>
                              )}

                              <div className="space-y-1.5">
                                <label className="text-[10px] font-bold uppercase tracking-widest opacity-40">Süngerli Ürün Adet Ücreti (TL)</label>
                                <input
                                  type="number"
                                  min="0"
                                  value={priceFormSponge}
                                  onChange={(e) => setPriceFormSponge(Number(e.target.value))}
                                  className="w-full bg-[#F5F5F0] border-none rounded-xl py-2.5 px-4 outline-none text-xs font-semibold text-black"
                                />
                              </div>

                              <div className="space-y-1.5">
                                <label className="text-[10px] font-bold uppercase tracking-widest opacity-40">Düğmeli Ürün Adet Ücreti (TL)</label>
                                <input
                                  type="number"
                                  min="0"
                                  value={priceFormButton}
                                  onChange={(e) => setPriceFormButton(Number(e.target.value))}
                                  className="w-full bg-[#F5F5F0] border-none rounded-xl py-2.5 px-4 outline-none text-xs font-semibold text-black"
                                />
                              </div>

                              <div className="space-y-1.5">
                                <label className="text-[10px] font-bold uppercase tracking-widest opacity-40">Diğer Ürün Adet Ücreti (TL)</label>
                                <input
                                  type="number"
                                  min="0"
                                  value={priceFormOther}
                                  onChange={(e) => setPriceFormOther(Number(e.target.value))}
                                  className="w-full bg-[#F5F5F0] border-none rounded-xl py-2.5 px-4 outline-none text-xs font-semibold text-black"
                                />
                              </div>

                              <button
                                onClick={() => {
                                  const nameToSave = priceFormProducer === 'NEW' ? customProducerName.trim() : priceFormProducer;
                                  if (!nameToSave) {
                                    alert("Lütfen geçerli bir üretici adı girin.");
                                    return;
                                  }

                                  setProducerPrices(prev => {
                                    const filtered = prev.filter(p => p.producerName.toLowerCase() !== nameToSave.toLowerCase());
                                    return [
                                      ...filtered,
                                      {
                                        producerName: nameToSave,
                                        sungerliPrice: priceFormSponge,
                                        dugmeliPrice: priceFormButton,
                                        digerPrice: priceFormOther
                                      }
                                    ];
                                  });

                                  triggerToast(`${nameToSave} üreticisi için fiyat anlaşması başarıyla kaydedildi!`, 'success');
                                  
                                  // Reset custom input if saved
                                  if (priceFormProducer === 'NEW') {
                                    setPriceFormProducer(nameToSave);
                                    setCustomProducerName('');
                                  }
                                }}
                                className="w-full py-3 bg-black text-white hover:bg-black/90 font-black uppercase text-[10px] tracking-wider rounded-xl transition-all cursor-pointer text-center"
                              >
                                Anlaşmayı Kaydet / Güncelle
                              </button>
                            </div>
                          </div>

                          {/* Agreements Table List */}
                          <div className="bg-white rounded-3xl border border-black/5 shadow-sm overflow-hidden md:col-span-2">
                            <div className="border-b border-black/5 px-6 py-4">
                              <h3 className="font-bold text-xs uppercase tracking-wider text-black/60">
                                Aktif Fiyat Anlaşmaları Listesi
                              </h3>
                            </div>

                            <div className="overflow-x-auto">
                              <table className="w-full text-left border-collapse">
                                <thead>
                                  <tr className="bg-[#F5F5F0] text-[10px] font-bold uppercase tracking-wider text-black/40 border-b border-black/5">
                                    <th className="px-5 py-3">Üretici Adı</th>
                                    <th className="px-5 py-3 text-center">Süngerli (TL)</th>
                                    <th className="px-5 py-3 text-center">Düğmeli (TL)</th>
                                    <th className="px-5 py-3 text-center">Diğer (TL)</th>
                                    <th className="px-5 py-3 text-center w-28">İşlemler</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-black/5 text-xs">
                                  {producerPrices.length === 0 ? (
                                    <tr>
                                      <td colSpan={5} className="px-5 py-8 text-center text-black/40 italic">
                                        Mevcut özel fiyat anlaşması bulunmuyor. Tüm üreticiler için standart sistem varsayılanları (750 / 1000 / 0 TL) geçerlidir.
                                      </td>
                                    </tr>
                                  ) : (
                                    producerPrices.map(p => (
                                      <tr key={p.producerName} className="hover:bg-[#F5F5F0]/20 transition-colors">
                                        <td className="px-5 py-3.5 font-bold text-black flex items-center gap-1.5">
                                          <div className="w-2.5 h-2.5 rounded-full bg-black/80"></div>
                                          {p.producerName}
                                        </td>
                                        <td className="px-5 py-3.5 text-center font-extrabold text-green-700">
                                          {p.sungerliPrice} ₺
                                        </td>
                                        <td className="px-5 py-3.5 text-center font-extrabold text-green-700">
                                          {p.dugmeliPrice} ₺
                                        </td>
                                        <td className="px-5 py-3.5 text-center font-bold text-black/50">
                                          {p.digerPrice} ₺
                                        </td>
                                        <td className="px-5 py-3.5 text-center">
                                          <div className="flex items-center justify-center gap-1">
                                            <button
                                              onClick={() => {
                                                setPriceFormProducer(p.producerName);
                                                setPriceFormSponge(p.sungerliPrice);
                                                setPriceFormButton(p.dugmeliPrice);
                                                setPriceFormOther(p.digerPrice);
                                              }}
                                              className="text-[10px] font-bold text-black hover:bg-black/10 px-2.5 py-1.5 rounded-lg transition-colors cursor-pointer"
                                              title="Güncelle"
                                            >
                                              Düzenle
                                            </button>
                                            <button
                                              onClick={() => {
                                                if (confirm(`${p.producerName} üreticisinin fiyat anlaşmasını silmek ve varsayılana döndürmek istiyor musunuz?`)) {
                                                  setProducerPrices(prev => prev.filter(item => item.producerName.toLowerCase() !== p.producerName.toLowerCase()));
                                                  triggerToast(`${p.producerName} fiyat anlaşması silindi.`, 'success');
                                                }
                                              }}
                                              className="text-[10px] font-bold text-red-600 hover:bg-red-50 px-2.5 py-1.5 rounded-lg transition-colors cursor-pointer"
                                              title="Varsayılana Sıfırla"
                                            >
                                              Sıfırla
                                            </button>
                                          </div>
                                        </td>
                                      </tr>
                                    ))
                                  )}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* VIEW 3: ANALİZ & İSTATİSTİK (THE "SECOND PAGE" WITH PIE CHARTS AND DETAILED GROUPED SUMMARY) */}
                    {accountingSubTab === 'analiz' && (
                      <div className="space-y-6">
                        {/* Info Header Box */}
                        <div className="bg-neutral-900 text-white rounded-3xl p-6 border border-neutral-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
                          <div>
                            <span className="text-[10px] font-black uppercase text-white/40 tracking-widest">DÖNEM DETAYLI RAPORU</span>
                            <h3 className="text-lg font-black tracking-tight text-white mt-0.5">Mali Analiz ve İstatistik Raporu</h3>
                            <p className="text-xs text-white/50 mt-1 max-w-xl">
                              Seçilen filtreler altındaki tüm üretici operasyonları, sipariş adetleri ve etiketlerin detaylı kırılımları aşağıda analiz edilmiştir.
                            </p>
                          </div>
                          
                          <div className="bg-white/5 border border-white/10 rounded-2xl p-3 px-4 flex flex-col items-center justify-center text-center">
                            <span className="text-[10px] font-bold uppercase text-white/40 tracking-wider">AKTİF FİLTRELER</span>
                            <span className="text-xs font-extrabold text-white mt-1">
                              {accountingProducer === 'All' ? 'Tüm Üreticiler' : accountingProducer}
                            </span>
                            <span className="text-[9px] text-white/50 font-medium">
                              {accountingStartDate ? accountingStartDate : 'Başlangıç Yok'} / {accountingEndDate ? accountingEndDate : 'Bitiş Yok'}
                            </span>
                          </div>
                        </div>

                        {/* Interactive Stat Cards */}
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                          <div className="bg-white rounded-3xl p-5 border border-black/5 shadow-sm space-y-1.5">
                            <p className="text-[10px] font-black uppercase tracking-widest text-black/40">SİPARİŞ ADEDİ</p>
                            <div className="flex items-baseline gap-1">
                              <span className="text-2xl font-black text-black">{uniqueOrdersCount}</span>
                              <span className="text-[10px] font-bold text-black/40">Sipariş</span>
                            </div>
                            <p className="text-[9px] text-black/50 leading-none pt-1">Benzersiz sipariş numarası</p>
                          </div>

                          <div className="bg-white rounded-3xl p-5 border border-black/5 shadow-sm space-y-1.5">
                            <p className="text-[10px] font-black uppercase tracking-widest text-black/40">ÜRETİLEN ETİKET</p>
                            <div className="flex items-baseline gap-1">
                              <span className="text-2xl font-black text-black">{totalOrdersInAccounting}</span>
                              <span className="text-[10px] font-bold text-black/40">Adet</span>
                            </div>
                            <p className="text-[9px] text-black/50 leading-none pt-1">Üretilen toplam parça</p>
                          </div>

                          <div className="bg-white rounded-3xl p-5 border border-black/5 shadow-sm space-y-1.5">
                            <p className="text-[10px] font-black uppercase tracking-widest text-black/40">TOPLAM HAKEDİŞ</p>
                            <div className="flex items-baseline gap-0.5">
                              <span className="text-xl font-black text-neutral-900">{totalPaymentAmount.toLocaleString('tr-TR')}</span>
                              <span className="text-[9px] font-black text-black/50">TL</span>
                            </div>
                            <p className="text-[9px] text-black/50 leading-none pt-1">Toplam ödenen miktar</p>
                          </div>

                          <div className="bg-white rounded-3xl p-5 border border-black/5 shadow-sm space-y-1.5">
                            <p className="text-[10px] font-black uppercase tracking-widest text-black/40">SİPARİŞ YOĞUNLUĞU</p>
                            <div className="flex items-baseline gap-1">
                              <span className="text-2xl font-black text-black">
                                {uniqueOrdersCount > 0 ? (totalOrdersInAccounting / uniqueOrdersCount).toFixed(1) : 0}
                              </span>
                              <span className="text-[10px] font-bold text-black/40">Etiket / Sip.</span>
                            </div>
                            <p className="text-[9px] text-black/50 leading-none pt-1">Sipariş başı ortalama parça</p>
                          </div>
                        </div>

                        {/* Recharts Visualizations Grid */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          {/* Pie Chart: Expenditure Per Producer */}
                          <div className="bg-white rounded-3xl p-6 border border-black/5 shadow-sm flex flex-col space-y-4">
                            <div className="flex items-center justify-between border-b border-black/5 pb-2">
                              <h4 className="font-extrabold text-xs uppercase tracking-wider text-black/70">Üretici Hakediş Dağılımı (TL)</h4>
                              <span className="text-[9px] bg-black text-white px-2 py-0.5 rounded font-black uppercase tracking-wider">Hakediş</span>
                            </div>
                            
                            {paymentPieData.length === 0 ? (
                              <div className="flex-1 flex flex-col items-center justify-center min-h-[220px] text-black/30 text-xs italic">
                                Grafik için yeterli veri bulunmuyor
                              </div>
                            ) : (
                              <div className="flex flex-col items-center">
                                <div className="w-full h-56 relative">
                                  <ResponsiveContainer width="100%" height="100%">
                                    <PieChart>
                                      <Pie
                                        data={paymentPieData}
                                        cx="50%"
                                        cy="50%"
                                        innerRadius={60}
                                        outerRadius={80}
                                        paddingAngle={4}
                                        dataKey="value"
                                      >
                                        {paymentPieData.map((entry, index) => (
                                          <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                                        ))}
                                      </Pie>
                                      <Tooltip 
                                        formatter={(value: any) => [`${Number(value).toLocaleString('tr-TR')} TL`, 'Ödeme']}
                                        contentStyle={{ backgroundColor: '#fff', borderRadius: '12px', border: '1px solid #f1f1f1', fontSize: '11px', fontFamily: 'sans-serif' }}
                                      />
                                    </PieChart>
                                  </ResponsiveContainer>
                                </div>
                                <div className="flex flex-wrap justify-center gap-x-4 gap-y-2 pt-2">
                                  {paymentPieData.map((entry, index) => (
                                    <div key={entry.name} className="flex items-center gap-1.5 text-[11px] font-semibold text-black/80">
                                      <div className="w-2.5 h-2.5 rounded-xs shrink-0" style={{ backgroundColor: CHART_COLORS[index % CHART_COLORS.length] }}></div>
                                      <span>{entry.name}: {entry.value.toLocaleString('tr-TR')} ₺ ({((entry.value / totalPaymentAmount) * 100).toFixed(0)}%)</span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>

                          {/* Pie Chart: Product Category Distribution */}
                          <div className="bg-white rounded-3xl p-6 border border-black/5 shadow-sm flex flex-col space-y-4">
                            <div className="flex items-center justify-between border-b border-black/5 pb-2">
                              <h4 className="font-extrabold text-xs uppercase tracking-wider text-black/70">Ürün Türü Dağılımı (Adet)</h4>
                              <span className="text-[9px] bg-[#F5F5F0] text-black/60 px-2 py-0.5 rounded font-bold uppercase tracking-wider">Kategoriler</span>
                            </div>

                            {categoryPieData.length === 0 ? (
                              <div className="flex-1 flex flex-col items-center justify-center min-h-[220px] text-black/30 text-xs italic">
                                Grafik için yeterli veri bulunmuyor
                              </div>
                            ) : (
                              <div className="flex flex-col items-center">
                                <div className="w-full h-56 relative">
                                  <ResponsiveContainer width="100%" height="100%">
                                    <PieChart>
                                      <Pie
                                        data={categoryPieData}
                                        cx="50%"
                                        cy="50%"
                                        innerRadius={60}
                                        outerRadius={80}
                                        paddingAngle={4}
                                        dataKey="value"
                                      >
                                        <Cell fill="#10b981" />
                                        <Cell fill="#f59e0b" />
                                        <Cell fill="#9ca3af" />
                                      </Pie>
                                      <Tooltip 
                                        formatter={(value: any) => [`${value} Adet`, 'Miktar']}
                                        contentStyle={{ backgroundColor: '#fff', borderRadius: '12px', border: '1px solid #f1f1f1', fontSize: '11px', fontFamily: 'sans-serif' }}
                                      />
                                    </PieChart>
                                  </ResponsiveContainer>
                                </div>
                                <div className="flex flex-wrap justify-center gap-x-4 gap-y-2 pt-2">
                                  {categoryPieData.map((entry, index) => {
                                    const colMap: Record<string, string> = { 'Süngerli': '#10b981', 'Düğmeli': '#f59e0b', 'Diğer': '#9ca3af' };
                                    return (
                                      <div key={entry.name} className="flex items-center gap-1.5 text-[11px] font-semibold text-black/80">
                                        <div className="w-2.5 h-2.5 rounded-xs shrink-0" style={{ backgroundColor: colMap[entry.name] || '#ccc' }}></div>
                                        <span>{entry.name}: {entry.value} Adet ({((entry.value / totalOrdersInAccounting) * 100).toFixed(0)}%)</span>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* DETAILED GROUPED SUMMARY TABLES ("grup yönteminde yaptığımız gibi") */}
                        <div className="grid grid-cols-1 gap-6">
                          {/* 1. Müşteri Sipariş Dağılımı Table */}
                          <div className="bg-white rounded-3xl border border-black/5 shadow-sm overflow-hidden">
                            <div className="border-b border-black/5 px-6 py-4 flex items-center justify-between bg-white">
                              <h3 className="font-extrabold text-xs uppercase tracking-wider text-black/70 flex items-center gap-1.5">
                                <UserCheck className="w-4 h-4 text-black/55" />
                                Müşteri Bazlı Özet Raporu (Grup Metodu)
                              </h3>
                              <span className="text-[10px] font-bold text-black/40 uppercase bg-[#F5F5F0] px-3 py-1 rounded-full">
                                {customerStats.length} Benzersiz Müşteri
                              </span>
                            </div>

                            {customerStats.length === 0 ? (
                              <div className="p-8 text-center text-black/40 italic text-xs">
                                Veri bulunmamaktadır.
                              </div>
                            ) : (
                              <div className="overflow-x-auto max-h-[300px] overflow-y-auto">
                                <table className="w-full text-left border-collapse">
                                  <thead className="sticky top-0 bg-[#F5F5F0] text-[10px] font-bold uppercase tracking-wider text-black/40 border-b border-black/5 z-10">
                                    <tr>
                                      <th className="px-5 py-3">Müşteri Adı</th>
                                      <th className="px-5 py-3 text-center">Sipariş Sayısı</th>
                                      <th className="px-5 py-3 text-center">Süngerli Parça</th>
                                      <th className="px-5 py-3 text-center">Düğmeli Parça</th>
                                      <th className="px-5 py-3 text-center">Diğer Parça</th>
                                      <th className="px-5 py-3 text-right">Toplam Parça</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-black/5 text-xs">
                                    {customerStats.map(item => (
                                      <tr key={item.customer} className="hover:bg-[#F5F5F0]/20 transition-colors">
                                        <td className="px-5 py-3 font-bold text-black">
                                          {item.customer}
                                        </td>
                                        <td className="px-5 py-3 text-center font-mono text-black/60 font-semibold">
                                          {item.uniqueOrdersCount}
                                        </td>
                                        <td className="px-5 py-3 text-center font-bold text-green-700">
                                          {item.sungerli > 0 ? `${item.sungerli} ad.` : '-'}
                                        </td>
                                        <td className="px-5 py-3 text-center font-bold text-amber-700">
                                          {item.dugmeli > 0 ? `${item.dugmeli} ad.` : '-'}
                                        </td>
                                        <td className="px-5 py-3 text-center text-black/40">
                                          {item.diger > 0 ? `${item.diger} ad.` : '-'}
                                        </td>
                                        <td className="px-5 py-3 text-right font-black text-black">
                                          {item.totalCount} Adet
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            )}
                          </div>

                          {/* 2. Kumaş Kodu Sipariş Dağılımı Table */}
                          <div className="bg-white rounded-3xl border border-black/5 shadow-sm overflow-hidden">
                            <div className="border-b border-black/5 px-6 py-4 flex items-center justify-between bg-white">
                              <h3 className="font-extrabold text-xs uppercase tracking-wider text-black/70 flex items-center gap-1.5">
                                <Scissors className="w-4 h-4 text-black/55" />
                                Kumaş Bazlı Özet Raporu (Grup Metodu)
                              </h3>
                              <span className="text-[10px] font-bold text-black/40 uppercase bg-[#F5F5F0] px-3 py-1 rounded-full">
                                {fabricStats.length} Farklı Kumaş Kodu
                              </span>
                            </div>

                            {fabricStats.length === 0 ? (
                              <div className="p-8 text-center text-black/40 italic text-xs">
                                Veri bulunmamaktadır.
                              </div>
                            ) : (
                              <div className="overflow-x-auto max-h-[300px] overflow-y-auto">
                                <table className="w-full text-left border-collapse">
                                  <thead className="sticky top-0 bg-[#F5F5F0] text-[10px] font-bold uppercase tracking-wider text-black/40 border-b border-black/5 z-10">
                                    <tr>
                                      <th className="px-5 py-3">Kumaş Kodu</th>
                                      <th className="px-5 py-3 text-center">Süngerli Parça</th>
                                      <th className="px-5 py-3 text-center">Düğmeli Parça</th>
                                      <th className="px-5 py-3 text-center">Diğer Parça</th>
                                      <th className="px-5 py-3 text-right">Toplam Parça</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-black/5 text-xs">
                                    {fabricStats.map(item => (
                                      <tr key={item.fabric} className="hover:bg-[#F5F5F0]/20 transition-colors">
                                        <td className="px-5 py-3 font-bold text-black">
                                          <span className="bg-[#F5F5F0] text-black border border-black/5 px-2.5 py-1 rounded-md font-mono text-[10px] font-bold">
                                            {item.fabric}
                                          </span>
                                        </td>
                                        <td className="px-5 py-3 text-center font-bold text-green-700">
                                          {item.sungerli > 0 ? `${item.sungerli} ad.` : '-'}
                                        </td>
                                        <td className="px-5 py-3 text-center font-bold text-amber-700">
                                          {item.dugmeli > 0 ? `${item.dugmeli} ad.` : '-'}
                                        </td>
                                        <td className="px-5 py-3 text-center text-black/40">
                                          {item.diger > 0 ? `${item.diger} ad.` : '-'}
                                        </td>
                                        <td className="px-5 py-3 text-right font-black text-black">
                                          {item.totalCount} Adet
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    )}

                  </div>
                </main>
              </div>
            );
          })()}
        </div>
      </div>
    </div>
  );
}
