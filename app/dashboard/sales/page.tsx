"use client";
import { useEffect, useState, useCallback, useSyncExternalStore, useRef } from "react";
import { offlineDB } from "@/lib/offline-db";
import type { OfflineSale, OfflineProduct } from "@/lib/offline-db";
import { getOfflineUser } from "@/lib/offline-auth";

type BluetoothDevice = { name?: string; gatt?: { connect: () => Promise<void> } };
type BluetoothNavigator = { bluetooth?: { requestDevice: (options: Record<string, unknown>) => Promise<BluetoothDevice> } };
type Category = "mobile_accessories" | "manyari" | "cosmetics" | "other" | "general";
type Product = { _id: string; name: string; category: Category; buyPrice: number; buyPriceAvg: number; sellPrice: number; stock: number; stockMode: "limited"|"unlimited"; barcode?: string; };
type Sale = { _id: string; productId: string; productName: string; category: Category; quantity: number; sellPrice: number; total: number; profit: number; createdAt: string; customerName?: string; status?: string; paymentType?: string; };
type CartItem = { cartId: string; productId: string; name: string; qty: number; price: number; total: number; category: Category; buyPrice: number; buyPriceAvg: number };
type FilterType = "today"|"weekly"|"monthly"|"all";
type Pagination = { page: number; totalPages: number; hasMore: boolean; totalCount: number };
type SalesApiResponse = { sales: Sale[]; pagination: Pagination };
type ProductApiResponse = { products: Product[]; pagination?: Pagination } | Product[];
type OfflineUser = { _id?: string; id?: string } | null;
type SessionRes = { user?: { id?: string; _id?: string } };

function useIsOnline(){
  const sub = useCallback((cb:()=>void)=>{ window.addEventListener("online",cb); window.addEventListener("offline",cb); return ()=>{ window.removeEventListener("online",cb); window.removeEventListener("offline",cb);};},[]);
  const snap = useCallback(()=> navigator.onLine,[]);
  const ss = useCallback(()=> true,[]);
  return useSyncExternalStore(sub,snap,ss);
}
function rnd(n:number){return Math.round(n||0);}
function fmt(n:number){return rnd(n).toString();}
function toCat(c: string | undefined): Category {
  if(c==="mobile_accessories" || c==="manyari" || c==="cosmetics" || c==="other" || c==="general") return c;
  return "general";
}

export default function SalesPage(){
  const [sales, setSales] = useState<Sale[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [qtyMap, setQtyMap] = useState<Record<string, number | "">>({});
  const [customPrices, setCustomPrices] = useState<Record<string, string>>({});
  const [filter, setFilter] = useState<FilterType>("today");
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState<Pagination>({page:1,totalPages:1,hasMore:false,totalCount:0});
  const [productPage, setProductPage] = useState(1);
  const [productPagination, setProductPagination] = useState<Pagination>({page:1,totalPages:1,hasMore:false,totalCount:0});
  const [productSearch, setProductSearch] = useState("");
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [loadingMoreProducts, setLoadingMoreProducts] = useState(false);
  const [loadingSales, setLoadingSales] = useState(true);
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [customerName, setCustomerName] = useState("Walk-in");
  const [paymentType, setPaymentType] = useState<"cash"|"credit">("cash");
  const [pendingCount, setPendingCount] = useState(0);
  const [mounted, setMounted] = useState(false);
  const [customerError, setCustomerError] = useState(false);
  const [printerName, setPrinterName] = useState("");
  const [printerConnected, setPrinterConnected] = useState(false);
  const [allSalesTotal, setAllSalesTotal] = useState(0);
  const [allSalesProfit, setAllSalesProfit] = useState(0);
  const isOnlineHook = useIsOnline();
  const isOffline = mounted && !isOnlineHook;
  const searchRef = useRef<HTMLInputElement>(null);
  const customerInputRef = useRef<HTMLInputElement>(null);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(()=>{ setMounted(true); },[]);
  const refreshCounts = useCallback(async()=>{ try{ const c=await offlineDB.sales.where("synced").equals(0).count(); setPendingCount(c);}catch{} },[]);
  const syncPendingSales = useCallback(async()=>{
    try{
      if(!navigator.onLine) return;
      const pending = await offlineDB.sales.where("synced").equals(0).toArray();
      if(pending.length===0){ await refreshCounts(); return; }
      for(const s of pending){
        try{
          const res = await fetch("/api/sales",{ method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ productId:s.productId, productName:s.productName, quantity:s.quantity, sellPrice:s.sellPrice, buyPrice:s.buyPrice, buyPriceAvg:s.buyPriceAvg, customerName:s.customerName, paymentType:s.paymentType, category:s.category, userId:s.userId, localId:s.localId, }) });
          if(res.ok){ await offlineDB.sales.update(s.localId, {synced:1}); }
        }catch{}
      }
      await refreshCounts();
    }catch{}
  },[refreshCounts]);

  const cacheAllProductsOnce = useCallback(async()=>{
    try{
      const res = await fetch(`/api/products?search=&category=all&page=1&limit=500`);
      const data = await res.json() as ProductApiResponse;
      const list = Array.isArray(data) ? data : data.products;
      const offlineUser = getOfflineUser() as OfflineUser;
      const userId = offlineUser?._id || offlineUser?.id || "offline";
      const toCache: OfflineProduct[] = list.map((p)=>({
        _id: p._id, localId: p._id, name: p.name, category: toCat(p.category), company: "", buyPrice: p.buyPriceAvg||p.buyPrice, buyPriceAvg: p.buyPriceAvg||p.buyPrice, sellPrice: p.sellPrice, stock: p.stock, stockMode: p.stockMode, barcode: p.barcode, userId, synced: 1, createdAt: new Date().toISOString(),
      }));
      await offlineDB.products.bulkPut(toCache);
      alert(`Cached ${toCache.length} products for offline!`);
    }catch{ alert("Cache failed"); }
  },[]);

  const printBill = useCallback(async (cartItems: CartItem[], total: number, customer: string) => {
  const now = new Date();
  const dateStr = now.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' }).replace(/ /g, '-');
  const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
  const invNo = `INV-${Date.now().toString().slice(-6)}`;
  const itemCount = cartItems.length;
  const rows = cartItems.map(i => `<tr><td>${i.name}</td><td>${i.qty}</td><td>${i.price.toFixed(2)}</td><td>${i.total.toFixed(2)}</td></tr>`).join('');
  const billHtml = `<html><head><meta charset="utf-8"><style>@page { size: 80mm auto; margin: 0; } body { font-family: 'Courier New', monospace; margin:0; padding:2mm; width: 72mm; font-size: 10px; color: #000; } .center { text-align:center } .store-name { font-size:16px; font-weight:900; margin:0 } .address { font-size:9px; line-height:1.2 } .phones { font-size:9px; font-weight:bold } .divider { border-top:1px solid #000; margin:3px 0 } .info { font-size:9px; line-height:1.3 } table { width:100%; border-collapse:collapse; border: 1.5px solid #000; } th { border: 1px solid #000; padding:3px 2px; font-size:9px; text-align:center; background: #eee; } td { border: 1px solid #000; padding:3px 2px; font-size:9px; text-align:center; } td:first-child { text-align:left; padding-left:4px } .totals { border: 1.5px solid #000; border-top:none; } .totals td { border: 1px solid #000; padding:2px 3px; font-size:10px; text-align:left } .totals td:last-child { text-align:right; font-weight:bold } .footer { text-align:center; font-size:8px; margin-top:4px; border-top:1px solid #000; padding-top:3px }</style></head><body><div class="center"><div class="store-name">Imtiaz General Store</div><div class="address">Main Ghulam Kheel Chowk Parmoli Road<br>Sultan Market Shewa</div><div class="phones">0343-3518722, 0343-8989277, Junaid Khan</div></div><div class="divider"></div><div class="info">Inv no: ${invNo} ${dateStr} ${timeStr}<br><b>${customer.toUpperCase()}</b></div><table><thead><tr><th style="width:46%">Item Description</th><th style="width:12%">Qty</th><th style="width:18%">Rate</th><th style="width:24%">Amount</th></tr></thead><tbody>${rows}</tbody></table><table class="totals"><tr><td style="width:46%">No of Items: ${itemCount}</td><td style="width:30%">Amount:</td><td style="width:24%">${total.toFixed(2)}</td></tr><tr><td>Note</td><td>Discount:</td><td>0.00</td></tr><tr><td></td><td>Recieved:</td><td>${total.toFixed(2)}</td></tr><tr><td></td><td>Balance:</td><td>0.00</td></tr></table><div class="info" style="border:1.5px solid #000; border-top:none; padding:2px 3px">User: JUNAID KHAN</div><div class="footer">Thanks for Business with us<br>Please check your items before leaving counter</div></body></html>`;
  const old = document.getElementById('imtiaz-print-iframe'); if (old) old.remove();
  const iframe = document.createElement('iframe'); iframe.id = 'imtiaz-print-iframe'; iframe.style.position = 'fixed'; iframe.style.width = '0'; iframe.style.height = '0'; iframe.style.border = '0'; document.body.appendChild(iframe);
  const doc = iframe.contentWindow?.document; if (!doc) return; doc.open(); doc.write(billHtml); doc.close();
  setTimeout(()=>{ iframe.contentWindow?.print(); }, 400); setTimeout(()=>{ iframe.remove(); }, 8000);
}, []);

  const connectPrinter = useCallback(async () => {
    try {
      const nav = window.navigator as unknown as BluetoothNavigator;
      if (!nav.bluetooth) { alert("Bluetooth not supported. Use Chrome on Android."); return; }
      const device = await nav.bluetooth.requestDevice({ acceptAllDevices: true, optionalServices: ['battery_service', '000018f0-0000-1000-8000-00805f9b34fb', '49535343-fe7d-4ae5-8fa9-9fafd205e455', '0000ff00-0000-1000-8000-00805f9b34fb'] });
      await device.gatt?.connect(); setPrinterName(device.name || "Thermal Printer"); setPrinterConnected(true); alert(`✅ Connected: ${device.name || "Thermal Printer"}`);
    } catch (err: unknown) { const msg = err instanceof Error ? err.message : ""; if (msg.includes("User cancelled")) return; alert("Printer connect failed. Pair first in Bluetooth settings."); }
  }, []);

  useEffect(()=>{
    let cancelled=false;
    const load=async()=>{
      if(productPage===1) setLoadingProducts(true); else setLoadingMoreProducts(true);
      try{
        if(!navigator.onLine){
          const cached=await offlineDB.products.toArray();
          const filtered=cached.filter((c)=>{ const s=productSearch.toLowerCase(); return (!s||c.name.toLowerCase().includes(s)|| (c.barcode && c.barcode.includes(productSearch))) && (categoryFilter==="all"||c.category===categoryFilter); });
          const LIMIT = 20; const paged = filtered.slice(0, productPage * LIMIT);
          const mapped: Product[] = paged.map((c)=>({ _id:c._id||c.localId, name:c.name, category:toCat(c.category), buyPrice:c.buyPriceAvg||c.buyPrice, buyPriceAvg:c.buyPriceAvg||c.buyPrice, sellPrice:c.sellPrice, stock:c.stock, stockMode:c.stockMode||"limited", barcode: c.barcode }));
          if(!cancelled){ setProducts(mapped); setProductPagination({ page: productPage, totalPages: Math.ceil(filtered.length / LIMIT) || 1, hasMore: filtered.length > paged.length, totalCount: filtered.length }); }
        } else {
          const res=await fetch(`/api/products?search=${encodeURIComponent(productSearch)}&category=${categoryFilter}&page=${productPage}&limit=20`);
          const data=(await res.json()) as ProductApiResponse; let list: Product[] = []; let pag: Pagination | undefined;
          if(Array.isArray(data)){ list = data; } else { list = data.products; pag = data.pagination; }
          if(list.length>0){ const offlineUser = getOfflineUser() as OfflineUser; const userId = offlineUser?._id || offlineUser?.id || "offline"; const toCache: OfflineProduct[] = list.map((p)=>({ _id: p._id, localId: p._id, name: p.name, category: toCat(p.category), company: "", buyPrice: p.buyPriceAvg||p.buyPrice, buyPriceAvg: p.buyPriceAvg||p.buyPrice, sellPrice: p.sellPrice, stock: p.stock, stockMode: p.stockMode, barcode: p.barcode, userId, synced: 1, createdAt: new Date().toISOString(), })); await offlineDB.products.bulkPut(toCache).catch(()=>{}); }
          if(!cancelled){ const mappedList = list.map((p)=>({ _id:p._id, name:p.name, category:toCat(p.category), buyPrice:p.buyPriceAvg||p.buyPrice||0, buyPriceAvg:p.buyPriceAvg||p.buyPrice||0, sellPrice:p.sellPrice, stock:p.stock, stockMode:p.stockMode, barcode: p.barcode })); if(productPage===1) setProducts(mappedList); else setProducts((prev)=>[...prev, ...mappedList]); if(pag) setProductPagination(pag); }
        }
      }catch{} finally{ if(!cancelled){ setLoadingProducts(false); setLoadingMoreProducts(false); } }
    }; void load(); return()=>{ cancelled=true; };
  },[productSearch, categoryFilter, productPage]);

  const loadSales=useCallback(async(f:FilterType,p:number)=>{
    setLoadingSales(true);
    try{
      if(!navigator.onLine){
        const all=await offlineDB.sales.orderBy("createdAt").reverse().toArray();
        let filtered=all as OfflineSale[]; const now=new Date();
        if(f==="today") filtered=filtered.filter((s)=>new Date(s.createdAt).toDateString()===now.toDateString());
        if(f==="weekly"){ const w=new Date(); w.setDate(now.getDate()-7); filtered=filtered.filter((s)=>new Date(s.createdAt)>=w); }
        if(f==="monthly"){ const m=new Date(); m.setMonth(now.getMonth()-1); filtered=filtered.filter((s)=>new Date(s.createdAt)>=m); }
        setAllSalesTotal(filtered.reduce((a,b)=>a+(b.total||0),0));
        setAllSalesProfit(filtered.reduce((a,b)=>a+(b.profit||0),0));
        const mapped: Sale[]=filtered.slice((p-1)*20,p*20).map((o)=>({ _id:o.localId, productId:o.productId, productName:o.productName, category:toCat(o.category), quantity:o.quantity, sellPrice:o.sellPrice, total:o.total, profit:o.profit, createdAt:o.createdAt, customerName:o.customerName, status:o.status, paymentType:o.paymentType }));
        if(p===1) setSales(mapped); else setSales((prev)=>[...prev,...mapped]);
        setPagination({page:p,totalPages:Math.ceil(filtered.length/20),hasMore:filtered.length>p*20,totalCount:filtered.length});
      } else {
        try{
          const resTotal=await fetch(`/api/sales?filter=${f}&page=1&limit=1000`);
          if(resTotal.ok){ const dataTotal=await resTotal.json() as SalesApiResponse; const allList=dataTotal.sales||[]; setAllSalesTotal(allList.reduce((a,b)=>a+(b.total||0),0)); setAllSalesProfit(allList.reduce((a,b)=>a+(b.profit||0),0)); }
        }catch{}
        const res=await fetch(`/api/sales?filter=${f}&page=${p}&limit=20`);
        const data=(await res.json()) as SalesApiResponse; const list=data.sales||[];
        if(p===1) setSales(list); else setSales((prev)=>[...prev,...list]);
        setPagination(data.pagination||{page:p,totalPages:1,hasMore:false,totalCount:list.length});
      }
    }catch{} finally{ setLoadingSales(false); }
  },[]);
// eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(()=>{ void loadSales(filter,page); void refreshCounts(); void syncPendingSales(); },[filter,page,loadSales,refreshCounts,syncPendingSales]);

  const getFinalPrice = useCallback((p:Product) => {
    const custom = customPrices[p._id]; if (custom === undefined) return p.sellPrice; if (custom === "") return 0; const num = Number(custom); return isNaN(num) ? p.sellPrice : num;
  }, [customPrices]);

  const updateProductPrice = useCallback((id:string, val:string)=>{
    const cleaned = val.replace(/[^0-9]/g, ""); setCustomPrices(prev => ({ ...prev, [id]: cleaned }));
    if (cleaned !== "") { setProducts((prev)=>prev.map((pr)=>pr._id===id?{...pr, sellPrice:rnd(Number(cleaned))}:pr)); }
  }, []);

  const addToCart=useCallback((p:Product, qty=1)=>{
    const finalPrice = getFinalPrice(p); if (finalPrice <= 0) { alert("Enter Sell Price first!"); return; }
    if(p.stockMode==="limited" && p.stock<=0){ alert(`Out of stock: ${p.name}`); return; }
    if(paymentType==="credit"){ const name=customerName.trim(); if(name.length<2 || name.toLowerCase()==="walk-in"){ setCustomerError(true); alert("Customer name required for Udhar!"); customerInputRef.current?.focus(); return; } }
    const safeQty = Number.isNaN(qty) || qty<=0 ? 1 : rnd(qty);
    setCart((prev)=>{
      const totalQtyInCart = prev.filter((c)=>c.productId===p._id).reduce((s,c)=>s+c.qty,0);
      if(p.stockMode==="limited" && p.stock < totalQtyInCart + safeQty){ alert(`Only ${p.stock} left for ${p.name}`); return prev; }
      const newItem: CartItem = { cartId: `${p._id}_${Date.now()}_${Math.random().toString(36).slice(2,6)}`, productId: p._id, name: p.name, qty: safeQty, price: finalPrice, total: rnd(safeQty*finalPrice), category: p.category, buyPrice: p.buyPriceAvg, buyPriceAvg: p.buyPriceAvg, };
      return [...prev, newItem];
    });
  },[paymentType, customerName, getFinalPrice]);

  // ✅ Barcode scanner -> auto add to cart (mobile + desktop)
  useEffect(()=>{
    if(products.length===0) return;
    let buffer = "";
    let lastTime = 0;
    const tryAdd = (code:string)=>{
      const found = products.find(p=> p.barcode && p.barcode===code);
      if(found){
        addToCart(found,1);
        // feedback
        try{ const a = new Audio(); }catch{}
        searchRef.current?.blur();
      } else {
        // if not in current list, search
        setProductSearch(code);
        setProductPage(1);
      }
    };
    const onKey = (e:KeyboardEvent)=>{
      const t = e.target as HTMLElement;
      if(t && t.tagName==="INPUT" && t!==searchRef.current) return;
      const now = Date.now();
      if(now-lastTime>300) buffer="";
      lastTime=now;
      if(e.key==="Enter" && buffer.length>2){
        const code = buffer.trim();
        buffer="";
        tryAdd(code);
        e.preventDefault();
      } else if(e.key.length===1){
        buffer+=e.key;
      }
    };
    window.addEventListener("keypress", onKey);
    return ()=>window.removeEventListener("keypress", onKey);
  },[products, addToCart]);

  const removeFromCart=useCallback((cartId:string)=>setCart((prev)=>prev.filter((c)=>c.cartId!==cartId)), []);
  const cartTotal=cart.reduce((s,c)=>s+c.total,0);
  const cartProfit=cart.reduce((s,c)=>s+rnd((c.price-c.buyPriceAvg)*c.qty),0);

  const checkout=useCallback(async()=>{
    if(cart.length===0){ alert("Cart empty"); return; }
    if(paymentType==="credit"){ const name=customerName.trim(); if(name.length<2 || name.toLowerCase()==="walk-in"){ setCustomerError(true); alert("Customer name required for Udhar!"); customerInputRef.current?.focus(); return; } }
    const finalCustomer=customerName.trim()||"Walk-in"; const copy=[...cart]; const now=new Date().toISOString();
    let sessionUserId = ""; try { const res = await fetch("/api/auth/session"); if(res.ok){ const data = await res.json() as SessionRes; sessionUserId = data?.user?.id || data?.user?._id || ""; } } catch{}
    const offlineUser = getOfflineUser() as OfflineUser; const rawUserId = offlineUser?._id || offlineUser?.id || sessionUserId || "offline_user";
    const newSales: Sale[]=copy.map((c,i)=>({ _id:`local_${Date.now()}_${i}`, productId:c.productId, productName:c.name, category:c.category, quantity:c.qty, sellPrice:c.price, total:c.total, profit:rnd((c.price-c.buyPriceAvg)*c.qty), createdAt:now, customerName:finalCustomer, status:paymentType==="credit"?"pending":"paid", paymentType }));
    setSales((prev)=>[...newSales, ...prev]);
    setAllSalesTotal((prev)=>prev+cartTotal); setAllSalesProfit((prev)=>prev+cartProfit);
    await printBill(copy, cartTotal, finalCustomer); setCart([]); setCustomPrices({});
    for(let i=0;i<copy.length;i++){ const c=copy[i]; const saleToSave: OfflineSale = { localId: newSales[i]._id, productId: c.productId, productName: c.name, category: c.category, quantity: c.qty, sellPrice: c.price, buyPrice: c.buyPriceAvg, buyPriceAvg: c.buyPriceAvg, total: c.total, profit: newSales[i].profit, customerName: finalCustomer, paymentType: paymentType, status: paymentType==="credit"?"pending":"paid", userId: rawUserId, createdAt: now, synced: 0, }; try{ await offlineDB.sales.put(saleToSave); }catch{} }
    await refreshCounts();
    if(navigator.onLine){ for(let i=0;i<copy.length;i++){ const c=copy[i]; try{ const res = await fetch("/api/sales",{ method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ productId:c.productId, productName:c.name, quantity:c.qty, sellPrice:c.price, buyPrice:c.buyPriceAvg, buyPriceAvg:c.buyPriceAvg, customerName:finalCustomer, paymentType, category:c.category, userId: sessionUserId || rawUserId, localId: newSales[i]._id, }) }); if(res.ok){ try{ await offlineDB.sales.update(newSales[i]._id, {synced:1}); }catch{} } }catch{} } await refreshCounts(); }
    setProducts((prev)=>prev.map((prod)=>{ const totalQty = copy.filter((x)=>x.productId===prod._id).reduce((s,x)=>s+x.qty,0); return totalQty>0 && prod.stockMode==="limited" ? {...prod, stock:Math.max(0,prod.stock-totalQty)} : prod; }));
  },[cart, customerName, paymentType, refreshCounts, cartTotal, cartProfit, printBill]);

  return(
    <div className="min-h-screen bg-gray-50 p-2 sm:p-4 max-w-7xl mx-auto">
      <div className="flex flex-wrap justify-between gap-2 mb-3">
        <h1 className="font-bold text-[18px]">🛒 Imtiaz General Store - POS {isOffline?"📶 Offline":""} {printerConnected?`🖨️ ${printerName}`:""}</h1>
        <div className="flex gap-2">
          <button onClick={connectPrinter} className={`px-3 py-1 rounded-full text-[11px] font-bold ${printerConnected?"bg-green-600 text-white":"bg-blue-600 text-white"}`}>{printerConnected?`🖨️ ${printerName}`:"🖨️ Connect BT Printer"}</button>
          <span className="bg-green-600 text-white px-3 py-1 rounded-full text-[11px]">Sale Rs.{fmt(allSalesTotal)}</span>
          <span className="bg-blue-600 text-white px-3 py-1 rounded-full text-[11px]">Profit Rs.{fmt(allSalesProfit)}</span>
          {pendingCount>0 && <span className="bg-amber-500 text-white px-3 py-1 rounded-full text-[11px]">{pendingCount} pending</span>}
        </div>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <div className="lg:col-span-2">
          <div className="flex gap-2 mb-2">
            <div className="flex-1 relative">
            <input ref={searchRef} value={productSearch} onChange={(e)=>{setProductSearch(e.target.value); setProductPage(1);}} placeholder="🔍 Scan barcode or name..." className="w-full border p-2.5 pr-10 rounded-xl bg-white text-[13px] outline-none focus:ring-2 focus:ring-black" />
            {productSearch && (<button type="button" onClick={()=>{ setProductSearch(""); setProductPage(1); searchRef.current?.focus(); }} className="absolute right-2 top-1/2 -translate-y-1/2 bg-gray-200 hover:bg-black hover:text-white w-7 h-7 rounded-full flex items-center justify-center text-[12px] font-bold">✕</button>)}
          </div>
            <select value={categoryFilter} onChange={(e)=>{setCategoryFilter(e.target.value); setProductPage(1);}} className="border p-2.5 rounded-xl bg-white text-[12px]"><option value="all">All</option><option value="general">🛒 General</option><option value="mobile_accessories">📱 Mobile</option><option value="manyari">💍 Manyari</option><option value="cosmetics">💄 Cosmetics</option><option value="other">Other</option></select>
          </div>
          <p className="text-[10px] text-gray-500 mb-2">💡 Barcode scanner se scan karo — auto cart me add hoga (Mobile OTG + Desktop USB)</p>
          <div className="flex justify-between items-center mb-2">
            <p className="text-[10px] text-gray-500">Showing {products.length}/{productPagination.totalCount}</p>
            {!isOffline && <button onClick={()=>void cacheAllProductsOnce()} className="text-[10px] bg-black text-white px-2 py-1 rounded-lg">Cache All for Offline</button>}
          </div>
          {loadingProducts? <p className="text-center py-6 text-[12px]">Loading...</p> : (
            <>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {products.map((p)=>{
                const raw = qtyMap[p._id]; const qtyDisplay = raw ?? 1; const qtyNum = typeof raw === "number" ? raw : 1;
                const buy=p.buyPriceAvg||p.buyPrice; const isOutOfStock = p.stockMode==="limited" && p.stock<=0;
                const cartQty = cart.filter((c)=>c.productId===p._id).reduce((s,c)=>s+c.qty,0);
                const remaining = p.stockMode==="limited" ? Math.max(0, p.stock - cartQty) : 999; const finalPrice = getFinalPrice(p);
                return(
                  <div key={p._id} className={`bg-white border rounded-xl p-3 ${isOutOfStock ? "opacity-70 bg-red-50 border-red-200" : ""}`}>
                    <p className="font-bold text-[13px] truncate flex justify-between"><span>{p.name} {isOutOfStock && <span className="text-red-600 text-[10px] ml-1">● OUT</span>}</span><span className="text-[9px] bg-gray-100 px-1.5 rounded">{p.barcode ? `📷 ${p.barcode}` : p.category}</span></p>
                    <p className="text-[11px] text-gray-500">{p.category} • Stock {p.stockMode==="unlimited"?"∞":p.stock} {p.stockMode==="limited" && !isOutOfStock ? `(Left ${remaining})` : ""} • Buy {fmt(buy)}</p>
                    <div className="flex gap-2 mt-2 items-center">
                      <span className="text-[11px] whitespace-nowrap">Sell Rs.</span>
                      <input type="text" inputMode="numeric" value={customPrices[p._id] ?? String(p.sellPrice)} onChange={(e)=>updateProductPrice(p._id, e.target.value)} placeholder="0" className="w-20 border p-1.5 rounded-lg text-[12px] font-bold bg-yellow-50 focus:bg-white focus:ring-2 focus:ring-black outline-none" disabled={isOutOfStock} />
                      <span className="text-[10px] text-green-600 font-bold ml-auto">Profit {fmt(finalPrice-buy)}</span>
                    </div>
                    <div className="flex gap-2 mt-2">
                      <div className="flex border rounded-lg overflow-hidden h-8">
                        <button type="button" onClick={()=>{ const cur = typeof qtyDisplay === "number" ? qtyDisplay : 1; setQtyMap({...qtyMap,[p._id]:Math.max(1,cur-1)}); }} className="px-2 bg-gray-100 font-bold" disabled={isOutOfStock}>-</button>
                        <div className="relative w-14">
                          <input type="text" inputMode="numeric" pattern="[0-9]*" value={qtyDisplay} onChange={(e)=>{ const v=e.target.value.replace(/[^0-9]/g,""); if(v===""){ setQtyMap({...qtyMap,[p._id]:""}); return; } let num=parseInt(v,10); if(Number.isNaN(num)) return; if(num>999) num=999; if(p.stockMode==="limited" && num>p.stock){ window.alert(`Only ${p.stock} left for ${p.name}`); num=p.stock; } setQtyMap({...qtyMap,[p._id]:num}); }} className="w-full h-full text-center text-[12px] font-bold outline-none bg-white border-x pr-4 focus:bg-yellow-50" disabled={isOutOfStock} />
                          {qtyDisplay!=="" && qtyDisplay!==1 && (<button type="button" onClick={()=>setQtyMap({...qtyMap,[p._id]:""})} className="absolute right-0.5 top-1/2 -translate-y-1/2 w-4 h-4 bg-gray-200 hover:bg-black hover:text-white rounded-full flex items-center justify-center text-[8px] font-bold">✕</button>)}
                        </div>
                        <button type="button" onClick={()=>{ const cur = typeof qtyDisplay === "number" ? qtyDisplay : (qtyDisplay===""?0:1); if(p.stockMode==="limited" && cur>=p.stock){ window.alert(`Only ${p.stock} left`); return; } setQtyMap({...qtyMap,[p._id]:Math.min(999,cur+1)}); }} className="px-2 bg-gray-100 font-bold" disabled={isOutOfStock}>+</button>
                      </div>
                      <button type="button" onClick={()=>addToCart(p,qtyNum)} disabled={isOutOfStock || finalPrice===0} className={`flex-1 px-3 py-1 rounded-lg text-[11px] font-bold ${isOutOfStock || finalPrice===0 ? "bg-gray-300 text-gray-500" : "bg-green-600 text-white"}`}>{isOutOfStock ? "Out" : `Add Rs.${fmt(qtyNum*finalPrice)}`}</button>
                    </div>
                  </div>
                );
              })}
            </div>
            {productPagination.hasMore && (<button type="button" onClick={()=>setProductPage((pr)=>pr+1)} disabled={loadingMoreProducts} className="w-full mt-3 py-2.5 bg-white border rounded-xl text-[13px] font-bold">{loadingMoreProducts ? "Loading..." : `Load More (${productPagination.totalCount - products.length})`}</button>)}
            </>
          )}
        </div>
        <div className="space-y-3">
          <div className="bg-white border rounded-xl p-3 sticky top-2">
            <div className="flex justify-between items-center mb-2"><p className="font-bold text-[13px]">🛒 Cart ({cart.length}) - Rs.{fmt(cartTotal)}</p><div className="flex gap-1"><button onClick={connectPrinter} className="text-[10px] bg-blue-50 text-blue-700 border border-blue-200 px-2 py-1 rounded-lg font-bold">{printerConnected?"🖨️ Connected":"🖨️ BT"}</button><button onClick={()=>{ if(cart.length>0) void printBill(cart, cartTotal, customerName); }} className="text-[10px] bg-black text-white px-2 py-1 rounded-lg font-bold">Print</button></div></div>
            <div className="space-y-1 max-h-60 overflow-y-auto mb-3">{cart.length===0? <p className="text-[11px] text-gray-400 text-center py-4">Scan barcode to add - Fast billing</p> : cart.map((c)=>(<div key={c.cartId} className="flex justify-between text-[11px] border-b py-1.5"><span>{c.name} x{c.qty} @ {fmt(c.price)}</span><span className="flex gap-2"><b>Rs.{fmt(c.total)}</b><button type="button" onClick={()=>removeFromCart(c.cartId)} className="text-red-600">✕</button></span></div>))}</div>
            <input ref={customerInputRef} value={customerName} onChange={(e)=>{ setCustomerName(e.target.value); if(e.target.value.trim().length>=2) setCustomerError(false); }} placeholder="Customer name for Udhar" className={`w-full border p-2 rounded-lg text-[12px] mb-2 ${customerError ? "border-red-500 bg-red-50 ring-2 ring-red-300" : ""}`} />
            {customerError && <p className="text-[10px] text-red-600 mb-2 font-bold">* Customer name required for Udhar</p>}
            <div className="flex bg-gray-100 rounded-lg p-1 mb-3"><button type="button" onClick={()=>{ setPaymentType("cash"); setCustomerError(false); }} className={`flex-1 py-1.5 rounded-md text-[11px] font-bold ${paymentType==="cash"?"bg-green-600 text-white":"text-gray-600"}`}>Cash</button><button type="button" onClick={()=>{ const name=customerName.trim(); if(name.length<2 || name.toLowerCase()==="walk-in"){ setCustomerError(true); alert("Customer name required!"); customerInputRef.current?.focus(); return; } setCustomerError(false); setPaymentType("credit"); }} className={`flex-1 py-1.5 rounded-md text-[11px] font-bold ${paymentType==="credit"?"bg-red-600 text-white":"text-gray-600"}`}>Udhar</button></div>
            <button type="button" onClick={()=>{ void checkout(); }} disabled={cart.length===0} className="w-full bg-black text-white py-2.5 rounded-xl font-bold text-[13px] disabled:bg-gray-300">{paymentType==="credit"? `Udhar Rs.${fmt(cartTotal)} + Print` : `Sell Rs.${fmt(cartTotal)} • Profit ${fmt(cartProfit)} + Print`}</button>
            {pendingCount>0 && <button type="button" onClick={()=>void syncPendingSales()} className="w-full mt-2 bg-amber-500 text-white py-2 rounded-xl font-bold text-[11px]">Sync {pendingCount} Pending Now</button>}
          </div>
          <div className="bg-white border rounded-xl overflow-hidden">
            <div className="flex gap-1 p-2 border-b bg-gray-50 overflow-x-auto">{(["today","weekly","monthly","all"] as const).map((f)=><button type="button" key={f} onClick={()=>{setFilter(f); setPage(1);}} className={`px-3 py-1 rounded-full text-[10px] font-bold capitalize ${filter===f?"bg-green-600 text-white":"bg-white border"}`}>{f}</button>)}</div>
            {loadingSales ? <p className="p-4 text-center text-[11px]">Loading sales... {pagination.totalCount} total</p> : <div>{sales.map((s)=>(<div key={s._id} className={`p-2 border-b flex justify-between text-[11px] ${s.status==="pending"?"bg-red-50":""}`}><div><b>{s.productName}</b> x{s.quantity} @ Rs.{fmt(s.sellPrice)}{s.customerName && s.customerName!=="Walk-in"?` 👤${s.customerName}`:""}<div className="text-[9px] text-gray-500">{new Date(s.createdAt).toLocaleTimeString()} • Profit {fmt(s.profit)}</div></div><div className="text-right"><div className="font-bold">Rs.{fmt(s.total)}</div><div className={`text-[9px] ${s.status==="pending"?"text-red-600":"text-green-600"}`}>{s.status==="pending"?"UDHAR":"Paid"}</div></div></div>))}{pagination.hasMore && <button type="button" onClick={()=>setPage((p)=>p+1)} className="w-full py-2 text-[11px] bg-gray-50">Load More Sales - Page {pagination.page}/{pagination.totalPages}</button>}{sales.length===0 && !loadingSales && <p className="p-4 text-center text-[11px] text-gray-400">No sales for {filter}</p>}</div>}
          </div>
        </div>
      </div>
    </div>
  );
}