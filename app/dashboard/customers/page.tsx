"use client";
import { useEffect, useState, useMemo, useCallback } from "react";
import { offlineDB } from "@/lib/offline-db";

type WusoolEntry = { amount: number; date: string; note?: string; };
type Bill = { 
  _id: string; productName: string; quantity: number; 
  total: number; createdAt?: string; 
  category?: string; sellPrice?: number;
};
type Customer = { 
  _id: string; saleIds?: string[]; saleId?: string; name: string; 
  normalizedName?: string; phone: string; village: string; 
  totalUdhar: number; totalBusiness: number; lastUdharDate?: string; 
  createdAt?: string; isPaid?: boolean; paidAmount?: number; 
  paidAt?: string; lastWusoolDate?: string; updatedAt?: string; 
  billsCount?: number; wusoolHistory?: WusoolEntry[]; 
};
type CustomerApi = Customer & { totalUdhar: number };
type CustomerDetailResponse = { customer: Customer; bills: Bill[] };

function rnd(n: number) { return Math.round(n || 0); }
function fmt(n: number) { return rnd(n).toLocaleString(); }

export default function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [search, setSearch] = useState("");
  const [wusoolId, setWusoolId] = useState<string | null>(null);
  const [wusoolName, setWusoolName] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const [wusoolLoading, setWusoolLoading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [billsMap, setBillsMap] = useState<Record<string, Bill[]>>({});
  const [billsLoading, setBillsLoading] = useState<string | null>(null);

  // ✅ 58mm + 80mm Wusool Print
  const printWusoolBill = useCallback(async (customer: string, paidNow: number, totalBill: number, totalPaid: number, remaining: number, size: "58mm" | "80mm" = "58mm") => {
    const now = new Date();
    const dateStr = now.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' }).replace(/ /g, '-');
    const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
    const is58 = size === "58mm";
    const paperWidth = is58 ? "52mm" : "72mm";
    const billHtml = `<html><head><meta charset="utf-8"><style>
      @page { size: ${size} auto; margin: 0; }
      body { font-family: 'Courier New', monospace; margin:0; padding:${is58 ? "1mm" : "2mm"}; width: ${paperWidth}; font-size: ${is58 ? "9px" : "10px"}; color: #000; }
      .center { text-align:center } .store-name { font-size:${is58 ? "13px" : "16px"}; font-weight:900; margin:0 }
      .divider { border-top:1px solid #000; margin:2px 0; padding:2px 0; text-align:center }
      .info { font-size:${is58 ? "9px" : "11px"}; line-height:1.3 }
      .box { border:1.5px solid #000; padding:3px; margin-top:4px }
      .row { display:flex; justify-content:space-between; font-size:${is58 ? "9px" : "11px"}; padding:1.5px 0; border-bottom:1px dashed #aaa }
      .total-row { font-weight:900; font-size:${is58 ? "11px" : "13px"}; border-top:1.5px solid #000; border-bottom:1.5px solid #000; padding:3px 0; margin-top:2px }
      .footer { text-align:center; font-size:7px; margin-top:4px; border-top:1px solid #000; padding-top:2px }
    </style></head><body>
      <div class="center">
        <div class="store-name">Imtiaz General Store</div>
        <div style="font-size:${is58 ? "7px" : "9px"}">Ghulam Kheel Chowk, Shewa<br>0343-3518722</div>
      </div>
      <div class="divider"><b style="font-size:${is58 ? "11px" : "14px"}">WUSOOL RECEIPT</b></div>
      <div class="info">${dateStr} ${timeStr}<br>Cust: <b>${customer.toUpperCase().slice(0, is58 ? 18 : 30)}</b></div>
      <div class="box">
        <div class="row"><span>Total Bill:</span><b>Rs ${rnd(totalBill).toFixed(0)}</b></div>
        <div class="row"><span>Prev Paid:</span><b>Rs ${rnd(totalPaid - paidNow).toFixed(0)}</b></div>
        <div class="row" style="background:#000; color:#fff; padding:2px"><span>Wusool Now:</span><b>Rs ${rnd(paidNow).toFixed(0)}</b></div>
        <div class="row"><span>Total Paid:</span><b>Rs ${rnd(totalPaid).toFixed(0)}</b></div>
        <div class="row total-row"><span>BaQi / Remain:</span><b>Rs ${rnd(remaining).toFixed(0)}</b></div>
      </div>
      <div class="footer">JUNAID KHAN - Thanks<br>Wusool received</div>
    </body></html>`;
    const old = document.getElementById('imtiaz-print-iframe'); if (old) old.remove();
    const iframe = document.createElement('iframe'); iframe.id = 'imtiaz-print-iframe'; iframe.style.position = 'fixed'; iframe.style.width = '0'; iframe.style.height = '0'; iframe.style.border = '0'; document.body.appendChild(iframe);
    const doc = iframe.contentWindow?.document; if (!doc) return; doc.open(); doc.write(billHtml); doc.close();
    setTimeout(()=>{ iframe.contentWindow?.print(); }, 400); 
    setTimeout(()=>{ iframe.remove(); }, 8000);
  }, []);

  const fetchAndSet = useCallback(async (searchTerm: string) => {
    try {
      const res = await fetch(`/api/customers?search=${encodeURIComponent(searchTerm)}&status=all`);
      const data = (await res.json()) as { customers?: CustomerApi[] };
      const list: Customer[] = (data.customers?? []).map((c) => ({
        ...c,
        totalUdhar: rnd(c.totalUdhar || 0),
        totalBusiness: rnd(c.totalBusiness || 0),
        paidAmount: rnd(c.paidAmount || 0),
        billsCount: c.billsCount || c.saleIds?.length || (c.saleId? 1 : 0),
        wusoolHistory: (c.wusoolHistory || []).map((w: WusoolEntry) => ({...w, amount: rnd(w.amount)})),
      }));
      const sorted = list.sort((a, b) => {
        if (a.isPaid!== b.isPaid) return a.isPaid? 1 : -1;
        return new Date(b.lastUdharDate || b.createdAt || 0).getTime() - new Date(a.lastUdharDate || a.createdAt || 0).getTime();
      });
      setCustomers(sorted);
    } catch {
      try {
        const cached = await offlineDB.sales.toArray();
        const map = new Map<string, Customer>();
        cached.forEach((s) => {
          const customerName = s.customerName;
          const status = s.status;
          const total = s.total;
          const localId = s.localId;
          if (!customerName || customerName === "Walk-in") return;
          const key = customerName.trim().toLowerCase();
          if (!map.has(key)) {
            map.set(key, { _id: key, name: customerName, phone: "", village: "", totalUdhar: 0, totalBusiness: 0, isPaid: false, saleIds: [] });
          }
          const c = map.get(key);
          if (c) {
            if (status === "pending") c.totalUdhar = rnd(c.totalUdhar + total);
            c.totalBusiness = rnd(c.totalBusiness + total);
            c.saleIds?.push(localId);
          }
        });
        setCustomers(Array.from(map.values()));
      } catch {}
    }
  }, []);
// eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void fetchAndSet(search); }, [search, fetchAndSet]);

  useEffect(() => {
    if (!expandedId) return;
    if (billsMap[expandedId]) return;
    let cancelled = false;
    const fetchBills = async () => {
      setBillsLoading(expandedId);
      try {
        const res = await fetch(`/api/customers/${expandedId}`);
        if (!res.ok) throw new Error("Failed");
        const data = (await res.json()) as CustomerDetailResponse;
        if (!cancelled) setBillsMap((prev) => ({...prev, [expandedId]: data.bills || [] }));
      } catch {
        try {
          const allSales = await offlineDB.sales.toArray();
          const custName = customers.find((c) => c._id === expandedId)?.name.trim().toLowerCase();
          const related = allSales.filter((s) => s.customerName?.trim().toLowerCase() === custName);
          const mapped: Bill[] = related.map((s) => {
            return { 
              _id: s.localId, 
              productName: s.productName, 
              quantity: s.quantity, 
              total: rnd(s.total), 
              createdAt: s.createdAt,
              category: s.category,
              sellPrice: s.sellPrice,
            };
          });
          if (!cancelled) setBillsMap((prev) => ({...prev, [expandedId]: mapped }));
        } catch {}
      } finally { if (!cancelled) setBillsLoading(null); }
    };
    void fetchBills();
    return () => { cancelled = true; };
  }, [expandedId, billsMap, customers]);

  const reload = useCallback(async () => { await fetchAndSet(search); }, [fetchAndSet, search]);

  const handleWusool = async () => {
    if (!wusoolId ||!amount || wusoolLoading) return;
    setWusoolLoading(true);
    const paidAmt = rnd(Number(amount));
    // Find customer before wusool for print data
    const cust = customers.find(c=> c._id === wusoolId);
    const totalBillBefore = cust?.totalBusiness || 0;
    const totalPaidBefore = cust?.paidAmount || 0;

    try {
      const res = await fetch("/api/khata/wusool", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customerId: wusoolId, amount: paidAmt }),
      });
      const data = await res.json().catch(()=>({}));
      if (!res.ok) throw new Error(data.error || "Wusool failed");
      
      // ✅ PRINT 58mm Wusool Receipt
      const newTotalPaid = totalPaidBefore + paidAmt;
      const remaining = totalBillBefore - newTotalPaid;
      const finalRemaining = cust?.totalUdhar ? cust.totalUdhar - paidAmt : remaining;
      await printWusoolBill(cust?.name || wusoolName || "Customer", paidAmt, totalBillBefore, newTotalPaid, finalRemaining < 0 ? 0 : finalRemaining, "58mm");

      setWusoolId(null); setWusoolName(null); setAmount(""); 
      await reload();
    } catch (err: unknown) {
      const msg = err instanceof Error? err.message : "Wusool failed"; alert(msg);
    } finally { setWusoolLoading(false); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Imtiaz Store: Delete this Khata permanently? History will be removed.")) return;
    setDeletingId(id);
    try {
      const res = await fetch(`/api/customers/${id}`, { method: "DELETE" });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error || "Delete failed");
      setCustomers((prev) => prev.filter((c) => c._id!== id)); await reload();
    } catch (err: unknown) {
      const msg = err instanceof Error? err.message : "Delete failed"; alert(msg);
    } finally { setDeletingId(null); }
  };

  const { totalUdhar, pendingCount, paidCount } = useMemo(() => {
    const pending = customers.filter((c) =>!c.isPaid);
    return { totalUdhar: rnd(pending.reduce((s, c) => s + c.totalUdhar, 0)), pendingCount: pending.length, paidCount: customers.filter((c) => c.isPaid).length };
  }, [customers]);

  return (
    <div className="p-2 sm:p-3 md:p-4 max-w-2xl mx-auto min-h-screen bg-gray-50">
      <div className="bg-white rounded-xl p-3 mb-2 flex justify-between items-center shadow-sm border">
        <div className="min-w-0">
          <h1 className="font-bold text-[14px] leading-tight truncate">📒 Imtiaz General Store - Khata</h1>
          <p className="text-[10px] text-gray-500">{pendingCount} pending • {paidCount} paid (Del available) • Total {customers.length}</p>
        </div>
        <span className="font-bold text-red-600 text-[13px] whitespace-nowrap ml-2">Rs {fmt(totalUdhar)}</span>
      </div>
      <input placeholder="🔍 Search customer name / village / phone..." value={search} onChange={(e) => setSearch(e.target.value)} className="w-full p-2.5 rounded-xl border mb-2 bg-white outline-none text-[13px] focus:ring-2 focus:ring-black"/>
      <div className="grid gap-2">
        {customers.length === 0? <p className="text-center text-gray-400 py-6 text-[12px] bg-white rounded-xl border">No customers — no Udhar</p> :
          customers.map((c) => {
            const udharDate = c.lastUdharDate || c.createdAt; 
            const wusoolDate = c.paidAt || c.lastWusoolDate || c.updatedAt;
            const isDeleting = deletingId === c._id; 
            const billsCount = c.billsCount || 1; 
            const isExpanded = expandedId === c._id;
            const currentBills = billsMap[c._id] || [];
            return (
              <div key={c._id} className={`bg-white p-2.5 rounded-xl border shadow-sm ${c.isPaid? "bg-green-50/60 border-green-200" : ""}`}>
                <div className="flex justify-between items-start">
                  <div className="flex-1 min-w-0 pr-2 cursor-pointer" onClick={() => setExpandedId(isExpanded? null : c._id)}>
                    <p className="font-bold text-[12px] leading-tight flex items-center gap-1 flex-wrap">
                      <span>{c.name}</span>
                      <span className="text-[9px] text-gray-400 font-normal">#{c._id.slice(-5)}</span>
                      {billsCount > 1 && <span className="bg-blue-100 text-blue-700 text-[8px] px-2 py-0.5 rounded-full">{billsCount} bills</span>}
                      {c.isPaid && <span className="bg-green-600 text-white text-[8px] px-2 py-0.5 rounded-full">PAID ✓</span>}
                    </p>
                    <div className="text-[10px] text-gray-500 leading-3 mt-1 truncate">
                      {c.isPaid? <><div>Last Udhar: {udharDate? new Date(udharDate).toLocaleDateString() : "-"} {udharDate? new Date(udharDate).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : ""}</div><div className="text-green-700 font-medium">Paid: {wusoolDate? new Date(wusoolDate).toLocaleString() : "-"}</div></> : <div>{udharDate? new Date(udharDate).toLocaleString() : ""} {c.village? `| ${c.village}` : ""} {c.phone? `| ${c.phone}` : ""}</div>}
                    </div>
                    {c.isPaid? <p className="text-[11px] mt-1"><span className="text-green-700 font-bold">Rs {fmt(c.paidAmount||0)} Paid</span> <span className="text-[10px] text-gray-500">- Del available</span></p> :
                      <p className="text-[11px] mt-1"><span className="text-red-600 font-bold">Rs {fmt(c.totalUdhar)}</span> <span className="text-gray-300">|</span> <span className="text-[10px]">Bill Rs {fmt(c.totalBusiness)}</span>{c.paidAmount? <span className="text-[10px] text-green-600 ml-1">Paid Rs {fmt(c.paidAmount)}</span> : null}</p>}
                  </div>
                  <div className="flex shrink-0 gap-1">
                    {c.isPaid? <button onClick={() => handleDelete(c._id)} disabled={isDeleting} className={`px-3 py-1.5 rounded-lg text-[11px] font-bold ${isDeleting? "bg-gray-100 text-gray-400" : "bg-red-600 text-white"}`}>{isDeleting? "..." : "Del"}</button> :
                      <button onClick={() => { setWusoolId(c._id); setWusoolName(c.name); setAmount(String(rnd(c.totalUdhar))); }} className="bg-black text-white px-3.5 py-1.5 rounded-lg text-[11px] font-bold">Wusool</button>}
                  </div>
                </div>
                {isExpanded && (
                  <div className="mt-3 border-t pt-2">
                    <p className="text-[11px] font-bold mb-2">🛒 Items Bought ({billsCount})</p>
                    {billsLoading === c._id? <p className="text-[10px] text-gray-400">Loading...</p> : currentBills.length > 0? (
                      <div className="space-y-1.5 mb-3">{currentBills.map((b) => (
                          <div key={b._id} className="flex justify-between bg-gray-50 border rounded-lg px-2.5 py-2 text-[11px]">
                            <div className="flex-1 min-w-0"><p className="font-bold leading-tight truncate">{b.productName}</p><p className="text-[10px] text-gray-600 leading-tight">Qty {b.quantity} • Rs {fmt(b.sellPrice||0)}/pcs • {b.category}</p><p className="text-[9px] text-gray-400">{b.createdAt? new Date(b.createdAt).toLocaleString() : ""}</p></div><span className="font-bold ml-2">Rs {fmt(b.total)}</span></div>))}</div>
                    ) : <p className="text-[10px] text-gray-400 mb-2">No bill detail - Total Rs {fmt(c.totalBusiness)}</p>}
                    <p className="text-[11px] font-bold mb-1 border-t pt-2">Wusool History - {c.name}</p>
                    {c.wusoolHistory && c.wusoolHistory.length > 0? (
                      <div className="space-y-1">{c.wusoolHistory.slice().reverse().map((w, idx) => (
                          <div key={`${w.date}-${idx}`} className="flex justify-between bg-gray-50 rounded-lg px-2 py-1.5 text-[11px]">
                            <span className="font-bold text-green-700">Rs {fmt(w.amount)}</span>
                            <span className="flex gap-2 items-center">
                              <span className="text-[10px] text-gray-500">{new Date(w.date).toLocaleString()}</span>
                              <button onClick={()=> printWusoolBill(c.name, w.amount, c.totalBusiness, c.paidAmount||0, c.totalUdhar, "58mm")} className="bg-black text-white px-2 py-0.5 rounded text-[8px]">Print</button>
                            </span>
                          </div>))}
                        <div className="flex justify-between font-bold text-[11px] pt-1 border-t"><span>Total Paid: Rs {fmt(c.paidAmount||0)}</span><span className={c.isPaid? "text-green-600" : "text-red-600"}>{c.isPaid? "All Clear - Rs 0" : `Remaining: Rs ${fmt(c.totalUdhar)}`}</span></div></div>
                    ) : <p className="text-[10px] text-gray-400">No wusool yet. Total: Rs {fmt(c.totalBusiness)}</p>}
                  </div>
                )}
              </div>
            );
          })}
      </div>
      {wusoolId && (
        <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center p-2 z-50">
          <div className="bg-white rounded-t-2xl sm:rounded-2xl p-4 w-full max-w-sm">
            <h2 className="font-bold text-[13px] mb-2">Wusool from {wusoolName} - Imtiaz Store</h2>
            <p className="text-[10px] text-gray-500 mb-2">#{wusoolId.slice(-6)} • {new Date().toLocaleString()}</p>
            <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Amount" className="w-full p-2.5 border rounded-xl mb-3 outline-none text-[13px] focus:ring-2 focus:ring-black"/>
            <div className="flex gap-2"><button onClick={() => { setWusoolId(null); setWusoolName(null); }} disabled={wusoolLoading} className="flex-1 p-2.5 bg-gray-100 rounded-xl text-[13px]">Cancel</button><button onClick={handleWusool} disabled={wusoolLoading} className="flex-1 p-2.5 bg-black text-white rounded-xl font-bold text-[13px]">{wusoolLoading? "..." : "Receive + Print 58mm"}</button></div>
          </div>
        </div>
      )}
    </div>
  );
}