import { offlineDB, calcProfit, calcTotal, savePendingReturn, savePendingProductDelete } from "./offline-db";
import type { OfflineSale, OfflineEasypaisa, EasyType, SaleCategory, SyncQueueItem, WusoolSyncPayload, PendingReturn, DeleteCustomerPayload, PendingProductDelete } from "./offline-db";

export interface SaleInput {
  productId: string;
  productName: string;
  category: SaleCategory;
  quantity: number;
  buyPrice: number;
  buyPriceAvg: number;
  sellPrice: number;
  userId: string;
  customerName?: string;
  phone?: string;
  village?: string;
  paymentType?: "cash" | "credit";
  localId?: string;
}

export interface EasypaisaInput {
  customerName: string;
  phone?: string;
  type: EasyType;
  amount: number;
  commission: number;
  userId: string;
  localId?: string;
}

function genLocalId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}
function rnd(n: number): number {
  return Math.round(n || 0);
}

type SyncableRegistration = ServiceWorkerRegistration & {
  sync?: { register: (tag: string) => Promise<void> };
};

function isWusoolPayload(payload: unknown): payload is WusoolSyncPayload {
  if (!payload || typeof payload !== "object") return false;
  const p = payload as Record<string, unknown>;
  if ("retQty" in p) return false;
  if ("productName" in p) return false;
  if ("action" in p) return false;
  if ("type" in p && typeof p.type === "string" && ["send","receive","bill","easyload","jazzcash","deposit","withdraw"].includes(p.type as string)) return false;
  return "amount" in p && "date" in p && "customerLocalId" in p;
}

function isDeletePayload(payload: unknown): payload is DeleteCustomerPayload {
  if (!payload || typeof payload !== "object") return false;
  const p = payload as Record<string, unknown>;
  return p.action === "delete" && typeof p.customerId === "string";
}

export async function saveSaleOffline(data: SaleInput): Promise<string> {
  const buy = rnd(data.buyPriceAvg || data.buyPrice || 0);
  const sell = rnd(data.sellPrice || 0);
  const qty = rnd(data.quantity || 1);
  const total = calcTotal(sell, qty);
  const profit = calcProfit(sell, buy, qty);
  const isCredit = data.paymentType === "credit";
  const status = isCredit ? "pending" : "paid";
  const nowISO = new Date().toISOString();
  const localId = data.localId || genLocalId("sale");

  const sale: OfflineSale = {
    localId, productId: data.productId, productName: data.productName,
    category: data.category, quantity: qty, sellPrice: sell,
    buyPrice: buy, buyPriceAvg: buy, total, profit,
    customerName: data.customerName || "Walk-in",
    paymentType: data.paymentType || "cash", status, userId: data.userId,
    createdAt: nowISO, synced: 0,
  };

  try {
    await offlineDB.transaction("rw", offlineDB.products, offlineDB.sales, offlineDB.customers, offlineDB.syncQueue, async () => {
      try {
        const product =
          (await offlineDB.products.get(data.productId)) ||
          (await offlineDB.products.where("localId").equals(data.productId).first()) ||
          (await offlineDB.products.where("_id").equals(data.productId).first());
        if (product && product.stockMode === "limited") {
          const newStock = rnd(product.stock - qty);
          await offlineDB.products.update(product.localId, { stock: newStock < 0 ? 0 : newStock, synced: 0 });
        }
      } catch { /* ignore */ }
      await offlineDB.sales.put(sale);
      await offlineDB.syncQueue.put({ type: "sale", localId, payload: sale, createdAt: new Date(), attempts: 0 });
      if (isCredit && data.customerName && data.customerName.toLowerCase() !== "walk-in") {
        const normalized = data.customerName.trim().toLowerCase();
        const existing = await offlineDB.customers.where("normalizedName").equals(normalized).first();
        if (existing && !existing.isPaid) {
          await offlineDB.customers.update(existing.localId, {
            totalUdhar: rnd(existing.totalUdhar + total), totalBusiness: rnd(existing.totalBusiness + total),
            saleIds: [...(existing.saleIds || []), localId], billsCount: rnd((existing.billsCount || 0) + 1),
            lastUdharDate: nowISO, synced: 0,
          });
          await offlineDB.sales.update(localId, { customerId: existing.localId });
        } else {
          const custLocalId = genLocalId("cust");
          await offlineDB.customers.add({
            localId: custLocalId, saleIds: [localId], name: data.customerName.trim(),
            normalizedName: normalized, phone: data.phone || "", village: data.village || "",
            totalUdhar: total, totalBusiness: total, lastUdharDate: nowISO, synced: 0,
            createdAt: nowISO, billsCount: 1, isPaid: false, paidAmount: 0, wusoolHistory: [], userId: data.userId,
          });
          await offlineDB.sales.update(localId, { customerId: custLocalId });
        }
      }
    });
  } catch (e) {
    console.warn("saveSaleOffline fallback", e);
    await offlineDB.sales.put(sale);
    await offlineDB.syncQueue.put({ type: "sale", localId, payload: sale, createdAt: new Date(), attempts: 0 });
  }

  if (typeof window !== "undefined" && "serviceWorker" in navigator) {
    try {
      const reg = (await navigator.serviceWorker.ready) as SyncableRegistration;
      if (reg.sync) await reg.sync.register("sync-sales");
    } catch { /* ignore */ }
  }
  return localId;
}

export async function saveEasypaisaOffline(data: EasypaisaInput): Promise<string> {
  const localId = data.localId || genLocalId("easy");
  const entry: OfflineEasypaisa = {
    localId,
    customerName: data.customerName || "Walk-in",
    phone: data.phone || "",
    type: data.type,
    amount: rnd(data.amount),
    commission: rnd(data.commission),
    totalAmount: rnd(data.amount + data.commission),
    userId: data.userId,
    createdAt: new Date().toISOString(),
    synced: 0,
  };
  await offlineDB.easypaisa.put(entry);
  await offlineDB.syncQueue.put({
    type: "easypaisa",
    localId,
    payload: entry,
    createdAt: new Date(),
    attempts: 0,
  } as SyncQueueItem);
  return localId;
}

export async function syncOfflineSales(): Promise<{ synced: number }> {
  const sales = await offlineDB.sales.where("synced").equals(0).toArray();
  const toSync = sales.filter(s => s.status !== "deleted");
  let synced = 0;
  for (const s of toSync) {
    try {
      const res = await fetch("/api/sales", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productId: s.productId, productName: s.productName, quantity: s.quantity,
          sellPrice: s.sellPrice, buyPriceAvg: s.buyPriceAvg, buyPrice: s.buyPrice,
          customerName: s.customerName, paymentType: s.paymentType, category: s.category,
          localId: s.localId, userId: s.userId,
        }),
      });
      if (res.ok) {
        await offlineDB.sales.update(s.localId, { synced: 1 });
        await offlineDB.syncQueue.where("localId").equals(s.localId).delete();
        synced++;
      }
    } catch { /* ignore */ }
  }
  return { synced };
}

export async function syncPendingReturns(): Promise<{ synced: number }> {
  if (typeof window === "undefined" || !navigator.onLine) return { synced: 0 };
  const pending = await offlineDB.pendingReturns.where("synced").equals(0).toArray() as PendingReturn[];
  let synced = 0;
  for (const r of pending) {
    try {
      let res: Response;
      if (r.newQty === 0) {
        res = await fetch(`/api/sales/${r.saleId}`, { method: "DELETE" });
      } else {
        res = await fetch(`/api/sales/${r.saleId}`, { 
          method: "PUT", 
          headers: { "Content-Type": "application/json" }, 
          body: JSON.stringify({ quantity: r.newQty }) 
        });
      }
      if (res.ok) {
        if (r.id) await offlineDB.pendingReturns.delete(r.id);
        else await offlineDB.pendingReturns.where("saleId").equals(r.saleId).delete();
        synced++;
      }
    } catch { /* ignore */ }
  }
  try{ localStorage.removeItem("pendingReturns"); }catch{ /* ignore */ }
  return { synced };
}

// ✅ NEW - Product Delete Sync
export async function syncPendingProductDeletes(): Promise<{ synced: number }> {
  if (typeof window === "undefined" || !navigator.onLine) return { synced: 0 };
  const pending = await offlineDB.pendingProductDeletes.where("synced").equals(0).toArray() as PendingProductDelete[];
  let synced = 0;
  for (const r of pending) {
    try {
      const res = await fetch(`/api/products/${r.productId}`, { method: "DELETE" });
      if (res.ok || res.status === 404) {
        // double cleanup offline cache
        try{
          await offlineDB.products.where('_id').equals(r.productId).delete();
          await offlineDB.products.where('localId').equals(r.productId).delete();
          await offlineDB.products.where('localId').equals(r.localId).delete();
        }catch{}
        if (r.id) await offlineDB.pendingProductDeletes.delete(r.id);
        else await offlineDB.pendingProductDeletes.where("productId").equals(r.productId).delete();
        synced++;
      }
    } catch { /* ignore */ }
  }
  return { synced };
}

export async function syncAllOffline(): Promise<{ sales: number; easypaisa: number; wusool: number; returns: number; deletes: number; productDeletes: number }> {
  if (typeof window === "undefined" || !navigator.onLine) return { sales: 0, easypaisa: 0, wusool: 0, returns: 0, deletes: 0, productDeletes: 0 };
  
  const salesResult = await syncOfflineSales();
  const returnsResult = await syncPendingReturns();
  const productDeletesResult = await syncPendingProductDeletes();
  
  let easySynced = 0;
  const easy = await offlineDB.easypaisa.where("synced").equals(0).toArray();
  for (const e of easy) {
    try {
      const res = await fetch("/api/easypaisa", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: e.type, amount: e.amount, commission: e.commission,
          customerName: e.customerName, phone: e.phone || "",
          localId: e.localId, userId: e.userId, createdAt: e.createdAt,
        }),
      });
      if (res.ok) {
        await offlineDB.easypaisa.update(e.localId, { synced: 1 });
        await offlineDB.syncQueue.where("localId").equals(e.localId).delete();
        easySynced++;
      }
    } catch { /* ignore */ }
  }

  let wusoolSynced = 0;
  const wusoolQueue = await offlineDB.syncQueue.where("type").equals("wusool").toArray();
  for (const q of wusoolQueue) {
    try {
      if (!isWusoolPayload(q.payload)) continue;
      const cust = await offlineDB.customers.get(q.payload.customerLocalId);
      const customerName = cust?.name || q.payload.customerName || "";
      if (!customerName) continue;
      const res = await fetch("/api/khata/wusool", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerName,
          customerId: q.payload.customerLocalId,
          localId: q.payload.customerLocalId,
          amount: q.payload.amount,
          note: q.payload.note || "",
          date: q.payload.date,
        }),
      });
      if (res.ok) {
        if (q.id !== undefined) {
          await offlineDB.syncQueue.delete(q.id);
        } else {
          await offlineDB.syncQueue.where("localId").equals(q.localId).delete();
        }
        wusoolSynced++;
      }
    } catch { /* ignore */ }
  }

  let deleteSynced = 0;
  try{
    const delQueue = await offlineDB.syncQueue.where("type").equals("delete_customer").toArray();
    for(const q of delQueue){
      if(!isDeletePayload(q.payload)) continue;
      try{
        const res = await fetch(`/api/customers/${q.payload.customerId}`, { method: "DELETE" });
        if(res.ok || res.status === 404){
          if(q.id !== undefined) await offlineDB.syncQueue.delete(q.id);
          else await offlineDB.syncQueue.where("localId").equals(q.localId).delete();
          deleteSynced++;
        }
      }catch{/* ignore */}
    }
  }catch{/* ignore */}

  return { sales: salesResult.synced, easypaisa: easySynced, wusool: wusoolSynced, returns: returnsResult.synced, deletes: deleteSynced, productDeletes: productDeletesResult.synced };
}

export async function saveOfflineReturn(saleId: string, newQty: number, retQty: number, productId: string): Promise<void> {
  await savePendingReturn(saleId, newQty, retQty, productId);
}

export async function saveOfflineProductDelete(productId: string, localId: string): Promise<void> {
  await savePendingProductDelete(productId, localId);
}

if (typeof window !== "undefined") {
  window.addEventListener("online", () => { void syncAllOffline(); });
}