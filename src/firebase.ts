import { initializeApp } from 'firebase/app';
import { 
  getFirestore, 
  collection, 
  doc, 
  setDoc, 
  deleteDoc, 
  onSnapshot,
  writeBatch,
  getDocs
} from 'firebase/firestore';

// Configuration from firebase-applet-config.json
const firebaseConfig = {
  apiKey: "AIzaSyARbx837veIxQIbpMRBxOYnZEtrTwoNHSE",
  authDomain: "teak-facet-464211-v8.firebaseapp.com",
  projectId: "teak-facet-464211-v8",
  storageBucket: "teak-facet-464211-v8.firebasestorage.app",
  messagingSenderId: "1009054143343",
  appId: "1:1009054143343:web:99e94c097a3309276d8e9a"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, "ai-studio-yaver-8a5550b3-268f-4da3-9873-b962708d8b2f");

// Helper types matching App.tsx
export interface Order {
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

export interface SavedLog {
  id: string;
  timestamp: number;
  dateStr: string;
  orderCount: number;
  orders: Order[];
  filename: string;
  producerName?: string;
}

export interface User {
  id: string;
  username: string;
  password?: string;
  role: string;
}

// Default system users to seed if Firebase is empty
const defaultUsers = [
  { id: '1', username: 'berkay', password: '159951', role: 'Admin' },
  { id: '2', username: 'muhasebe', password: '123', role: 'Muhasebe' },
  { id: '3', username: 'depo', password: '123', role: 'Depo' },
  { id: '4', username: 'tedarik', password: '123', role: 'Tedarik' }
];

// --- Realtime Subscriptions ---

// Subscribe to Users
export function subscribeUsers(callback: (users: User[]) => void) {
  const usersCol = collection(db, 'users');
  return onSnapshot(usersCol, (snapshot) => {
    const list: User[] = [];
    snapshot.forEach(doc => {
      list.push({ id: doc.id, ...doc.data() } as User);
    });
    
    // Seed default users if Firestore is completely empty
    if (list.length === 0) {
      seedDefaultUsers();
    } else {
      callback(list);
    }
  }, (err) => {
    console.error("Firestore users subscription error: ", err);
  });
}

async function seedDefaultUsers() {
  const batch = writeBatch(db);
  defaultUsers.forEach(u => {
    const dRef = doc(db, 'users', u.id);
    batch.set(dRef, u);
  });
  await batch.commit().catch(e => console.error("Error seeding users: ", e));
}

// Subscribe to Active Orders
export function subscribeOrders(callback: (orders: Order[]) => void) {
  const ordersCol = collection(db, 'orders');
  return onSnapshot(ordersCol, (snapshot) => {
    const list: Order[] = [];
    snapshot.forEach(doc => {
      list.push({ id: doc.id, ...doc.data() } as Order);
    });
    callback(list);
  }, (err) => {
    console.error("Firestore orders subscription error: ", err);
  });
}

// Subscribe to Saved Logs
export function subscribeLogs(callback: (logs: SavedLog[]) => void) {
  const logsCol = collection(db, 'logs');
  return onSnapshot(logsCol, (snapshot) => {
    const list: SavedLog[] = [];
    snapshot.forEach(doc => {
      list.push({ id: doc.id, ...doc.data() } as SavedLog);
    });
    // Sort logs descending by timestamp
    list.sort((a, b) => b.timestamp - a.timestamp);
    callback(list);
  }, (err) => {
    console.error("Firestore logs subscription error: ", err);
  });
}

// Subscribe to Settings Docs
export function subscribeSettings(docId: string, callback: (data: any) => void) {
  const docRef = doc(db, 'settings', docId);
  return onSnapshot(docRef, (snapshot) => {
    if (snapshot.exists()) {
      callback(snapshot.data());
    } else {
      callback(null);
    }
  }, (err) => {
    console.error(`Firestore settings sub error [${docId}]: `, err);
  });
}

// --- Write Operations ---

// Save / Update User
export async function saveUserInFirestore(user: User) {
  if (!user.id) return;
  const docRef = doc(db, 'users', user.id);
  await setDoc(docRef, user, { merge: true });
}

// Save entire set of users in batch
export async function saveUsersInBatch(usersList: User[]) {
  const existingDocs = await getDocs(collection(db, 'users'));
  const deleteBatch = writeBatch(db);
  existingDocs.forEach(d => {
    deleteBatch.delete(d.ref);
  });
  await deleteBatch.commit().catch(e => console.error("Error deleting old users: ", e));

  const batch = writeBatch(db);
  usersList.forEach(user => {
    const docRef = doc(db, 'users', user.id);
    batch.set(docRef, user);
  });
  await batch.commit().catch(e => console.error("Error committing users: ", e));
}

// Delete User
export async function deleteUserFromFirestore(userId: string) {
  const docRef = doc(db, 'users', userId);
  await deleteDoc(docRef);
}

// Save / Update Single Order
export async function saveOrderInFirestore(order: Order) {
  if (!order.id) return;
  const docRef = doc(db, 'orders', order.id);
  await setDoc(docRef, order);
}

// Save/overwrite entire set of orders (e.g., on import, or batch update)
export async function saveOrdersInBatch(ordersList: Order[]) {
  // To avoid hitting 500 writes limit in single batch, delete existing and write new or use chunked batches
  const existingDocs = await getDocs(collection(db, 'orders'));
  const deleteBatch = writeBatch(db);
  existingDocs.forEach(d => {
    deleteBatch.delete(d.ref);
  });
  await deleteBatch.commit().catch(e => console.error("Error deleting old orders: ", e));

  // Write new orders in chunks of 400
  const chunks: Order[][] = [];
  for (let i = 0; i < ordersList.length; i += 400) {
    chunks.push(ordersList.slice(i, i + 400));
  }

  for (const chunk of chunks) {
    const batch = writeBatch(db);
    chunk.forEach(order => {
      const docRef = doc(db, 'orders', order.id);
      batch.set(docRef, order);
    });
    await batch.commit().catch(e => console.error("Error committing chunk: ", e));
  }
}

// Delete Single Order
export async function deleteOrderFromFirestore(orderId: string) {
  const docRef = doc(db, 'orders', orderId);
  await deleteDoc(docRef);
}

// Save Single Log
export async function saveLogInFirestore(log: SavedLog) {
  if (!log.id) return;
  const docRef = doc(db, 'logs', log.id);
  await setDoc(docRef, log);
}

// Overwrite all logs in batch
export async function saveLogsInBatch(logsList: SavedLog[]) {
  const existingDocs = await getDocs(collection(db, 'logs'));
  const deleteBatch = writeBatch(db);
  existingDocs.forEach(d => {
    deleteBatch.delete(d.ref);
  });
  await deleteBatch.commit().catch(e => console.error("Error deleting old logs: ", e));

  const chunks: SavedLog[][] = [];
  for (let i = 0; i < logsList.length; i += 400) {
    chunks.push(logsList.slice(i, i + 400));
  }

  for (const chunk of chunks) {
    const batch = writeBatch(db);
    chunk.forEach(log => {
      const docRef = doc(db, 'logs', log.id);
      batch.set(docRef, log);
    });
    await batch.commit().catch(e => console.error("Error committing log chunk: ", e));
  }
}

// Delete Single Log
export async function deleteLogFromFirestore(logId: string) {
  const docRef = doc(db, 'logs', logId);
  await deleteDoc(docRef);
}

// Save Printer Settings
export async function savePrintSettingsInFirestore(settings: any) {
  const docRef = doc(db, 'settings', 'printer');
  await setDoc(docRef, settings);
}

// Save Producer Prices
export async function saveProducerPricesInFirestore(prices: any) {
  const docRef = doc(db, 'settings', 'prices');
  await setDoc(docRef, { values: prices });
}

// Save Fabrics Settings (savedFabrics and unifiedFabrics)
export async function saveFabricsInFirestore(savedFabrics: any[], unifiedFabrics: any[]) {
  const docRef = doc(db, 'settings', 'fabrics');
  await setDoc(docRef, { savedFabrics, unifiedFabrics });
}

// Save Sponge Sheet Sizes
export async function saveSpongeSizesInFirestore(sheetSizes: any[]) {
  const docRef = doc(db, 'settings', 'sponge');
  await setDoc(docRef, { sheetSizes });
}

// One-time initial seed function to push localStorage data to Firestore if Firebase has no orders
export async function checkAndSeedLocalStorageToFirestore() {
  try {
    const ordersSnap = await getDocs(collection(db, 'orders'));
    if (ordersSnap.empty) {
      const storedOrders = localStorage.getItem('yaver_active_orders');
      if (storedOrders) {
        const parsed = JSON.parse(storedOrders);
        if (Array.isArray(parsed) && parsed.length > 0) {
          console.log("Seeding orders from localStorage to Firestore...");
          await saveOrdersInBatch(parsed);
        }
      }
    }

    const logsSnap = await getDocs(collection(db, 'logs'));
    if (logsSnap.empty) {
      const storedLogs = localStorage.getItem('yaver_order_history');
      if (storedLogs) {
        const parsed = JSON.parse(storedLogs);
        if (Array.isArray(parsed) && parsed.length > 0) {
          console.log("Seeding logs from localStorage to Firestore...");
          await saveLogsInBatch(parsed);
        }
      }
    }

    const usersSnap = await getDocs(collection(db, 'users'));
    if (usersSnap.empty) {
      const storedUsers = localStorage.getItem('yaver_users');
      if (storedUsers) {
        const parsed = JSON.parse(storedUsers);
        if (Array.isArray(parsed) && parsed.length > 0) {
          console.log("Seeding users from localStorage to Firestore...");
          const batch = writeBatch(db);
          parsed.forEach((u: any) => {
            if (u && u.id) {
              batch.set(doc(db, 'users', u.id), u);
            }
          });
          await batch.commit();
        }
      }
    }
  } catch (e) {
    console.error("Error during initial Firestore hydration: ", e);
  }
}
