"use client";
import { useEffect, useState, useCallback, useSyncExternalStore } from "react";
import Link from "next/link";
import { offlineDB } from "@/lib/offline-db";
import type { OfflineSale } from "@/lib/offline-db";

type Category = "mobile_accessories" | "manyari" | "cosmetics" | "other" | "general";
type Sale = {
  _id: string;
  productName: string;
  category: Category;
  quantity: number;
  sellPrice: number;
  total: number;
  profit: number;
  createdAt: string;
  customerName?: string;
  status?: string;
  paymentType?: string;
  barcode?: string;
};
type FilterType = "today" | "weekly" | "monthly" | "all";
type Pagination = { page: number; totalPages: number; hasMore: boolean; totalCount: number };
type SalesApiResponse = { sales: Sale[]; total: number; profit: number; pagination: Pagination };
type CustomerRow = { totalUdhar?: number };

const FILTERS: FilterType[] = ["today","weekly","monthly","all"];

function useIsOnline(){
  const subscribe = useCallback((cb:()=>void)=>{ window.addEventListener("online",cb); window.addEventListener("offline",cb); return ()=>{ window.removeEventListener("online",cb); window.removeEventListener("offline",cb);};},[]);
  const getSnapshot = useCallback(()=> navigator.onLine,[]);
  const getServerSnapshot = useCallback(()=> true,[]);
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
function rnd(n:number){ return Math.round(n||0); }
function toCat(c: string | undefined): Category {
  if(c==="mobile_accessories" || c==="manyari" || c==="cosmetics" || c==="other" || c==="general") return c;
  return "general";
}

const PKT_OFFSET_MS = 5 * 60 * 60 * 1000;
function isInFilter(dateStr: string, filter: string): boolean {
  if (filter === "all") return true;
  const d = new Date(dateStr);
  const now = new Date();
  const nowPKT = new Date(now.getTime() + PKT_OFFSET_MS);
  const y = nowPKT.getUTCFullYear(), m = nowPKT.getUTCMonth(), day = nowPKT.getUTCDate();
  const startToday = new Date(Date.UTC(y, m, day, 0, 0, 0, 0) - PKT_OFFSET_MS);
  const endToday = new Date(Date.UTC(y, m, day + 1, 0, 0, 0, 0) - PKT_OFFSET_MS);
  if (filter === "today") return d >= startToday && d < endToday;
  if (filter === "weekly") return d >= new Date(startToday.getTime() - 7*24*60*60*1000) && d < endToday;
  if (filter === "monthly") return d >= new Date(Date.UTC(y, m, 1, 0, 0, 0, 0) - PKT_OFFSET_MS) && d < endToday;
  if (filter === "yearly") return d >= new Date(Date.UTC(y, 0, 1, 0, 0, 0, 0) - PKT_OFFSET_MS) && d < endToday;
  return true;
}

export default function SalesHistoryPage() {
  const isOnline = useIsOnline();
  const isOffline = !isOnline;
  const [sales, setSales] = useState<Sale[]>([]);
  const [total, setTotal] = useState(0);
  const [profit, setProfit] = useState(0);
  const [pendingTotal, setPendingTotal] = useState(0);
  const [filter, setFilter] = useState<FilterType>("today");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all"|"paid"|"pending">("all");
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState<Pagination>({ page:1, totalPages:1, hasMore:false, totalCount:0 });
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async (f: FilterType, s: string, p: number, status: string) => {
    if(p===1) setLoading(true);
    try{
      if(typeof window!=="undefined" && !window.navigator.onLine){
        const all = await offlineDB.sales.orderBy("createdAt").reverse().toArray();
        const filtered = all.filter((o: OfflineSale)=>{
          const inDate = isInFilter(o.createdAt, f);
          const matchSearch = !s || o.productName.toLowerCase().includes(s.toLowerCase()) || (o.customerName||"").toLowerCase().includes(s.toLowerCase());
          const isUdhar = o.paymentType === "credit" || o.status === "pending";
          const matchStatus = status==="all" ? true : status==="pending" ? isUdhar : !isUdhar;
          return inDate && matchSearch && matchStatus;
        });
        const paged = filtered.slice((p-1)*100, p*100);
        const mappedOff = paged.map((o: OfflineSale)=>({
          _id:o.localId, productName:o.productName, category:toCat(o.category),
          quantity:o.quantity, sellPrice:o.sellPrice, total:o.total, profit:o.profit,
          createdAt:o.createdAt, customerName:o.customerName, status:o.status, paymentType:o.paymentType
        }));
        if(p===1) setSales(mappedOff);
        else setSales((prev)=>{
          const seen = new Set(prev.map((x)=>x._id));
          return [...prev, ...mappedOff.filter((x)=>!seen.has(x._id))];
        });
        const t = filtered.reduce((a,b)=>a+b.total,0);
        const pr = filtered.reduce((a,b)=>a+b.profit,0);
        setTotal(rnd(t)); setProfit(rnd(pr));
        setPagination({ page:p, totalPages: Math.ceil(filtered.length/100), hasMore: filtered.length > p*100, totalCount: filtered.length });
        const pendingOffline = all.filter(o=> (o.paymentType==="credit"||o.status==="pending") && isInFilter(o.createdAt, f)).reduce((a,b)=>a+b.total,0);
        setPendingTotal(rnd(pendingOffline));
        return;
      }
      const statusQ = status==="pending" ? "&paymentType=credit" : status==="paid" ? "&paymentType=cash" : "";
      const res = await fetch(`/api/sales?filter=${f}&search=${encodeURIComponent(s)}&page=${p}&limit=100${statusQ}`);
      const data = (await res.json()) as SalesApiResponse;
      const mappedOn = data.sales.map(s=> ({ ...s, category: toCat(s.category) }));
      if(p===1) setSales(mappedOn);
      else setSales((prev)=>{
        const seen = new Set(prev.map((x)=>x._id));
        return [...prev, ...mappedOn.filter((x)=>!seen.has(x._id))];
      });
      setTotal(rnd(data.total)); setProfit(rnd(data.profit)); setPagination(data.pagination);
      try{
        const pendingRes = await fetch(`/api/customers?status=pending&filter=${f}`);
        if(pendingRes.ok){
          const cData = (await pendingRes.json()) as { customers?: CustomerRow[]; totalUdhar?: number };
          if(typeof cData.totalUdhar === "number"){
            setPendingTotal(rnd(cData.totalUdhar));
          } else {
            const pending = (cData.customers||[]).reduce((a,b)=>a+(b.totalUdhar||0),0);
            setPendingTotal(rnd(pending));
          }
        }
      }catch{}
    }catch{ /* ignore */ } finally{ setLoading(false); }
  },[]);

  const printBill = useCallback(async (items: Sale[], total: number, customer: string) => {
    const now = new Date();
    const dateStr = now.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' }).replace(/ /g, '-');
    const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
    const invNo = `INV-${Date.now().toString().slice(-6)}`;
    const itemCount = items.reduce((s, i) => s + i.quantity, 0);
    const rows = items.map(i => `<tr><td>${i.productName}</td><td>${i.quantity}</td><td>${Math.round(i.sellPrice)}</td><td>${Math.round(i.total)}</td></tr>`).join('');
    const billHtml = `<html><head><meta charset="utf-8"><style>@page { size: 80mm auto; margin: 0; } * { margin:0; padding:0; box-sizing:border-box; color:#000 !important; } body { font-family: Arial, sans-serif; margin:0 auto; padding:0; width: 72mm; font-size: 12px; background:#fff; } .center { text-align:center } .store-name { font-size:16px; line-height:1.1; font-weight:900; } .address { font-size:11px; line-height:1.2; font-weight:900; } .phones { font-size:11px; font-weight:900; } .divider { border-top:1px solid #000; margin:3px 0 } .info { font-size:11px; line-height:1.3; word-wrap:break-word; font-weight:700; } table { width:100%; border-collapse:collapse; border: 1px solid #000; table-layout:fixed; } th { border: 1px solid #000; padding:2px 1px; font-size:11px; text-align:center; font-weight:900; } td { border: 1px solid #000; padding:2px 1px; font-size:11px; text-align:center; font-family:'Courier New', monospace; font-weight:700; } td:first-child { text-align:left; padding-left:2px; font-family:Arial, sans-serif; white-space:normal; word-break:break-word; } .footer { text-align:center; font-size:11px; margin-top:4px; border-top:1px solid #000; padding-top:3px; font-weight:900; }</style></head><body><div class="center"><div class="store-name">Imtiaz General Store</div><div class="address">Main Ghulam Kheel Chowk Parmoli Road<br>Sultan Market Shewa</div><div class="phones">0343-3518722, 0343-8989277, Junaid Khan</div></div><div class="divider"></div><div class="info">Inv no: ${invNo} ${dateStr} ${timeStr}<br><b>${customer.toUpperCase()}</b></div><table><thead><tr><th style="width:38%">Item Description</th><th style="width:12%">Qty</th><th style="width:22%">Rate</th><th style="width:28%">Amount</th></tr></thead><tbody>${rows}</tbody></table><table><tr><td style="width:38%">Items: ${itemCount}</td><td style="width:34%">Amount:</td><td style="width:28%">${Math.round(total)}</td></tr></table><div class="info" style="border:1px solid #000; border-top:none; padding:2px 3px">User: JUNAID KHAN</div><div class="footer">Thanks for Business with us<br>Please check your items before leaving counter</div></body></html>`;
    const old = document.getElementById('imtiaz-print-iframe'); if (old) old.remove();
    const iframe = document.createElement('iframe'); iframe.id = 'imtiaz-print-iframe'; iframe.style.position = 'fixed'; iframe.style.width = '0'; iframe.style.height = '0'; iframe.style.border = '0'; document.body.appendChild(iframe);
    const doc = iframe.contentWindow?.document; if (!doc) return; doc.open(); doc.write(billHtml); doc.close();
    setTimeout(()=>{ iframe.contentWindow?.print(); }, 400); setTimeout(()=>{ iframe.remove(); }, 8000);
  }, []);

  useEffect(()=>{
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadData(filter, search, page, statusFilter);
  },[filter,search,page,statusFilter,loadData]);

  // ✅ POS wala hi Bill grouping — 15 sec + Customer + paymentType
  const groupedBills = (() => {
    const sorted = [...sales].sort((a,b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    const groups: Sale[][] = [];
    for (const s of sorted) {
      const last = groups[groups.length - 1];
      const lastSale = last?.[last.length - 1];
      const diff = lastSale ? Math.abs(new Date(s.createdAt).getTime() - new Date(lastSale.createdAt).getTime()) : 999999;
      if (last && diff < 15000 && (lastSale.customerName || "Cash") === (s.customerName || "Cash") && lastSale.paymentType === s.paymentType) {
        last.push(s);
      } else {
        groups.push([s]);
      }
    }
    return groups.map((items, idx) => ({
      id: items[0].createdAt + "_" + idx,
      time: items[0].createdAt,
      items,
      total: items.reduce((a, b) => a + b.total, 0),
      profit: items.reduce((a, b) => a + b.profit, 0),
      customer: items[0]?.customerName || "Cash",
      status: items[0]?.status || "paid",
      paymentType: items[0]?.paymentType || "cash",
      billNo: Number(new Date(items[0].createdAt).getTime().toString().slice(-4)),
    }));
  })();

  const billsByDate: Record<string, typeof groupedBills> = {};
  groupedBills.forEach((b)=>{
    const d = new Date(b.time);
    const pkt = new Date(d.getTime() + PKT_OFFSET_MS);
    const key = pkt.toISOString().slice(0,10);
    if(!billsByDate[key]) billsByDate[key] = [];
    billsByDate[key].push(b);
  });

  return (
    <div className="p-3 sm:p-6 max-w-6xl mx-auto min-h-screen bg-gray-50">
      {isOffline && <div className="mb-3 bg-amber-50 border text-amber-800 text-[12px] p-2.5 rounded-xl text-center">📶 Offline • Showing offline sales</div>}
      {pendingTotal>0 && <div className="mb-3 bg-red-50 border border-red-200 text-red-800 text-[12px] p-2.5 rounded-xl flex justify-between"><span>📒 Udhar Pending ({filter}): Rs.{pendingTotal}</span><Link href="/dashboard/customers" className="bg-red-600 text-white px-3 py-1 rounded-lg text-[10px]">Khata</Link></div>}

      <div className="flex justify-between mb-4">
        <div><Link href="/dashboard/sales" className="text-[11px] text-gray-500">← POS</Link><h1 className="text-[17px] font-bold">📜 Imtiaz Sales History</h1><p className="text-[11px] text-gray-500">{filter.toUpperCase()} • {pagination.totalCount} sales • Rs.{total} • Profit Rs.{profit}</p></div>
        <Link href="/dashboard/sales" className="bg-black text-white px-4 py-2 rounded-xl text-[12px] h-fit">+ New Sale</Link>
      </div>

      <div className="bg-white p-3 rounded-xl border mb-4 flex flex-col gap-2">
        <div className="flex gap-1.5 overflow-x-auto">{FILTERS.map(f=><button key={f} onClick={()=>{setFilter(f); setPage(1);}} className={`px-3 py-1.5 rounded-full text-[11px] capitalize ${filter===f?"bg-black text-white":"bg-gray-100"}`}>{f}</button>)}</div>
        <div className="flex gap-1.5"><button onClick={()=>{setStatusFilter("all"); setPage(1);}} className={`px-3 py-1.5 rounded-full text-[11px] ${statusFilter==="all"?"bg-black text-white":"bg-gray-100"}`}>All</button><button onClick={()=>{setStatusFilter("paid"); setPage(1);}} className={`px-3 py-1.5 rounded-full text-[11px] ${statusFilter==="paid"?"bg-green-600 text-white":"bg-gray-100"}`}>Cash</button><button onClick={()=>{setStatusFilter("pending"); setPage(1);}} className={`px-3 py-1.5 rounded-full text-[11px] ${statusFilter==="pending"?"bg-red-600 text-white":"bg-gray-100"}`}>Udhar</button></div>
        <input placeholder="🔍 Search product / customer / barcode..." value={search} onChange={e=>{setSearch(e.target.value); setPage(1);}} className="border p-2.5 rounded-lg w-full text-[12px]" />
      </div>

      {loading && page===1 ? <p className="text-center py-10 text-[12px]">Loading...</p> : (
        <div className="space-y-3">
          {Object.keys(billsByDate).length===0 ? <p className="text-center py-10 bg-white rounded-xl border text-[12px]">No sales — {filter} {statusFilter!=="all"? `• ${statusFilter}`:""}</p> :
          Object.entries(billsByDate).sort((a,b)=> b[0].localeCompare(a[0])).map(([date, dayBills])=>{
            const dt = dayBills.reduce((a,b)=>a+b.total,0); const dp = dayBills.reduce((a,b)=>a+b.profit,0);
            return(
              <div key={date} className="bg-white rounded-xl border overflow-hidden">
                <div className="bg-gray-50 px-3 py-2 flex justify-between text-[11px] font-bold border-b"><span>{date} • {dayBills.length} bills</span><span className="text-green-700">Rs.{rnd(dt)} <span className="text-blue-600">Profit +{rnd(dp)}</span></span></div>
                {dayBills.map((bill)=>(
                  <div key={bill.id} className={`px-3 py-2.5 border-b last:border-0 ${bill.status==="pending"?"bg-red-50/50":""}`}>
                    <div className="flex justify-between items-start gap-2">
                      <div className="flex-1">
                        <p className="font-bold text-[13px]">Bill #{bill.billNo} • {new Date(bill.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} {bill.customer!=="Cash" && bill.customer!=="Walk-in" ? <span className="bg-yellow-100 px-2 rounded-full text-[10px]">👤 {bill.customer}</span> : null} {bill.status==="pending" ? <span className="bg-red-600 text-white px-2 rounded-full text-[9px]">UDHAR</span> : null}</p>
                        <p className="text-[10px] text-gray-400">Profit Rs.{bill.profit} • {bill.items.length} Items</p>
                        {bill.items.map((s)=>(
                          <p key={s._id} className="text-[12px] mt-0.5">• {s.productName} <span className="text-blue-600">x{s.quantity}</span> — Rs.{s.total}</p>
                        ))}
                      </div>
                      <div className="text-right shrink-0">
                        <p className="font-bold">Rs.{bill.total}</p>
                        <button onClick={()=>void printBill(bill.items, bill.total, bill.customer)} className="mt-1 bg-slate-900 text-white px-3 py-1.5 rounded-lg text-[11px] font-bold">🖨️ Print</button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )
          })}
          {pagination.hasMore && <button onClick={()=>setPage(p=>p+1)} className="w-full py-2.5 bg-white border rounded-xl text-[12px]">Load More ({pagination.totalCount - sales.length})</button>}
        </div>
      )}
      <div className="mt-4 bg-black text-white p-4 rounded-xl flex justify-between"><div><p className="text-[12px] opacity-70">Total {filter} • {pagination.totalCount} bills</p><p className="text-[11px] opacity-60">Profit Rs.{profit} • Pending Rs.{pendingTotal}</p></div><span className="text-[20px] font-bold">Rs.{total}</span></div>
    </div>
  );
}