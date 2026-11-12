"use client";
import { useEffect, useState, useCallback } from "react";
import JsBarcode from "jsbarcode";

type Product = { _id: string; name: string; category: string; sellPrice: number; barcode?: string; };

export default function BarcodePrintPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [filterCat, setFilterCat] = useState<string>("all");
  const [search, setSearch] = useState("");

  const load = useCallback(async()=>{
    const res = await fetch(`/api/products?search=&page=1&limit=500`);
    const data = await res.json();
    const list = Array.isArray(data) ? data : data.products;
    setProducts(list);
  },[]);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(()=>{ void load(); },[load]);

  const filteredProducts = products.filter(p => {
    const matchSearch = p.name.toLowerCase().includes(search.toLowerCase()) || (p.barcode||"").toLowerCase().includes(search.toLowerCase());
    if (!matchSearch) return false;
    if (filterCat === "all") {
      return p.category === 'manyari' || p.category === 'mobile_accessories' || p.category === 'mobile' || !p.barcode;
    }
    return p.category === filterCat;
  });

  useEffect(()=>{
    if(selected.length===0) return;
    setTimeout(()=>{
      selected.forEach(id=>{
        const p = products.find(x=>x._id===id);
        if(!p) return;
        const code = p.barcode || `MNY${p._id.slice(-6).toUpperCase()}`;
        const canvas = document.getElementById(`bc-${id}`) as HTMLCanvasElement;
        if(canvas){
          const isMobile = window.innerWidth < 640;
          JsBarcode(canvas, code, { 
            format: "CODE128", 
            width: isMobile ? 1.2 : 1.6, 
            height: isMobile ? 38 : 45, 
            displayValue: true, 
            fontSize: isMobile ? 9 : 11, 
            margin: 2 
          });
        }
      });
    },150);
  },[selected, products]);

  const toggle = (id:string) => setSelected(prev=> prev.includes(id) ? prev.filter(x=>x!==id) : [...prev, id]);
  const toggleAll = () => {
    if(selected.length === filteredProducts.length) setSelected([]);
    else setSelected(filteredProducts.map(p=>p._id));
  };

  const handleSaveBarcode = async (p: Product) => {
    const newCode = p.barcode || `MNY${p._id.slice(-6).toUpperCase()}`;
    await fetch(`/api/products/${p._id}`, { method: "PUT", headers: { "Content-Type":"application/json" }, body: JSON.stringify({ barcode: newCode }) });
    alert(`Saved ${newCode} for ${p.name}`);
    void load();
  };

  return (
    <div className="p-2 sm:p-4 max-w-6xl mx-auto bg-gray-50 min-h-screen pb-24 sm:pb-4">
      <style>{`
        @media print {
          body * { visibility: hidden; }
          #print-area, #print-area * { visibility: visible; }
          #print-area { position: absolute; left:0; top:0; width: 100%; }
          @page { size: A4; margin: 10mm; }
        }
      `}</style>

      <div className="bg-white rounded-2xl p-3 sm:p-4 shadow-sm border mb-3">
        <h1 className="font-bold text-[16px] sm:text-[18px]">🏷️ Barcode Generator</h1>
        <p className="text-[10px] sm:text-[11px] text-gray-500 mt-1">Manyari + Mobile Accessories • Mobile Friendly • Gap ke saath katna asan</p>
      </div>
      
      <div className="bg-white rounded-2xl p-3 sm:p-4 shadow-sm border mb-3 print:hidden">
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="flex-1 relative">
            <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="🔍 Search name or barcode..." className="w-full border px-3 py-2.5 pr-8 rounded-xl text-[13px] bg-gray-50 focus:bg-white focus:ring-2 focus:ring-black outline-none" />
            {search && <button onClick={()=>setSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 w-6 h-6 bg-gray-200 rounded-full text-[10px]">✕</button>}
          </div>
          <select value={filterCat} onChange={e=>setFilterCat(e.target.value)} className="border px-3 py-2.5 rounded-xl text-[12px] bg-white w-full sm:w-auto">
            <option value="all">All (Manyari + Mobile)</option>
            <option value="manyari">Only Manyari</option>
            <option value="mobile_accessories">Only Mobile Acc.</option>
          </select>
        </div>
        <div className="flex justify-between items-center mt-3">
          <p className="text-[11px] text-gray-500">Showing {filteredProducts.length} • Selected {selected.length}</p>
          <div className="flex gap-2">
            <button onClick={toggleAll} className="text-[11px] bg-gray-100 px-3 py-1.5 rounded-full font-bold">{selected.length === filteredProducts.length ? "Clear All" : "Select All"}</button>
            {selected.length>0 && <button onClick={()=>setSelected([])} className="text-[11px] bg-red-50 text-red-600 px-3 py-1.5 rounded-full font-bold">Clear</button>}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-3 mb-6 print:hidden">
        {filteredProducts.map(p=>(
          <div key={p._id} className={`border rounded-2xl p-3 bg-white shadow-sm transition ${selected.includes(p._id)?"bg-yellow-50 border-black ring-1 ring-black":"border-gray-200"}`}>
            <p className="text-[13px] font-bold truncate">{p.name}</p>
            <p className="text-[11px] text-gray-600 mt-0.5 flex justify-between"><span>{p.category} • Rs.{p.sellPrice}</span><span className="text-[10px] bg-gray-100 px-1.5 py-0.5 rounded">{p.barcode ? `📷 ${p.barcode}` : "No barcode"}</span></p>
            <div className="flex gap-2 mt-3">
              <button onClick={()=>toggle(p._id)} className={`flex-1 py-2 rounded-xl text-[12px] font-bold ${selected.includes(p._id)?"bg-black text-white":"bg-gray-900 text-white"}`}>{selected.includes(p._id)?"✓ Selected":"Select"}</button>
              {!p.barcode && <button onClick={()=>handleSaveBarcode(p)} className="px-3 py-2 bg-green-600 text-white text-[11px] rounded-xl font-bold">Gen</button>}
            </div>
          </div>
        ))}
        {filteredProducts.length===0 && <p className="col-span-full text-center py-10 text-[12px] text-gray-400">No products found</p>}
      </div>

      {selected.length>0 && (
        <>
          {/* Mobile fixed print button */}
          <div className="sm:hidden fixed bottom-0 left-0 right-0 p-3 bg-white border-t shadow-[0_-4px_20px_rgba(0,0,0,0.1)] print:hidden z-10">
            <button onClick={()=>window.print()} className="w-full bg-black text-white py-3.5 rounded-2xl font-bold text-[14px]">🖨️ Print {selected.length} Stickers</button>
          </div>

          <button onClick={()=>window.print()} className="hidden sm:block w-full bg-black text-white py-3 rounded-2xl font-bold mb-4 print:hidden">🖨️ Print Stickers ({selected.length}) - A4</button>
          
          <div id="print-area" className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-6 border p-3 sm:p-6 print:p-4 print:border-none bg-white rounded-2xl print:rounded-none">
            {selected.map(id=>{
              const p = products.find(x=>x._id===id);
              if(!p) return null;
              const code = p.barcode || `MNY${id.slice(-6).toUpperCase()}`;
              return (
                <div key={id} className="border border-dashed border-gray-400 p-2 sm:p-3 py-4 sm:py-5 text-center rounded-xl bg-white flex flex-col items-center">
                  <p className="text-[9px] sm:text-[10px] font-bold truncate w-full mb-1">{p.name}</p>
                  <canvas id={`bc-${id}`} className="mx-auto max-w-full"></canvas>
                  <p className="text-[7px] sm:text-[8px] mt-2 font-medium break-all">Rs.{p.sellPrice} - {code}</p>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}