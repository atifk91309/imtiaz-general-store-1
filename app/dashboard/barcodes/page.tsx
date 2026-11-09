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
    const matchSearch = p.name.toLowerCase().includes(search.toLowerCase());
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
          JsBarcode(canvas, code, { format: "CODE128", width: 1.6, height: 45, displayValue: true, fontSize: 11, margin: 2 });
        }
      });
    },100);
  },[selected, products]);

  const toggle = (id:string) => setSelected(prev=> prev.includes(id) ? prev.filter(x=>x!==id) : [...prev, id]);

  const handleSaveBarcode = async (p: Product) => {
    const newCode = p.barcode || `MNY${p._id.slice(-6).toUpperCase()}`;
    await fetch(`/api/products/${p._id}`, { method: "PUT", headers: { "Content-Type":"application/json" }, body: JSON.stringify({ barcode: newCode }) });
    alert(`Saved ${newCode} for ${p.name}`);
    void load();
  };

  return (
    <div className="p-4 max-w-6xl mx-auto bg-white min-h-screen">
      <style>{`
        @media print {
          body * { visibility: hidden; }
          #print-area, #print-area * { visibility: visible; }
          #print-area { position: absolute; left:0; top:0; width: 100%; }
          @page { size: A4; margin: 10mm; }
        }
      `}</style>

      <h1 className="font-bold text-[18px] mb-3">🏷️ Barcode Generator - Imtiaz Store</h1>
      <p className="text-[11px] text-gray-500 mb-3">Manyari + Mobile Accessories | Gap ke saath - katna asan</p>
      
      <div className="flex gap-2 mb-4 print:hidden">
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search product..." className="border px-3 py-2 rounded-xl text-[12px] flex-1" />
        <select value={filterCat} onChange={e=>setFilterCat(e.target.value)} className="border px-2 py-2 rounded-xl text-[12px]">
          <option value="all">All (Manyari + Mobile Acc.)</option>
          <option value="manyari">Only Manyari</option>
          <option value="mobile_accessories">Only Mobile Accessories</option>
        </select>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-6 print:hidden">
        {filteredProducts.map(p=>(
          <div key={p._id} className={`border p-2 rounded-xl ${selected.includes(p._id)?"bg-yellow-50 border-black":""}`}>
            <p className="text-[12px] font-bold truncate">{p.name} - Rs.{p.sellPrice}</p>
            <p className="text-[10px] text-gray-600">{p.category} | {p.barcode ? `📷 ${p.barcode}` : "No barcode"}</p>
            <div className="flex gap-1 mt-2">
              <button onClick={()=>toggle(p._id)} className="flex-1 bg-black text-white text-[10px] py-1 rounded-lg">{selected.includes(p._id)?"Remove":"Select"}</button>
              {!p.barcode && <button onClick={()=>handleSaveBarcode(p)} className="flex-1 bg-green-600 text-white text-[10px] py-1 rounded-lg">Gen & Save</button>}
            </div>
          </div>
        ))}
      </div>

      {selected.length>0 && (
        <>
          <button onClick={()=>window.print()} className="w-full bg-black text-white py-3 rounded-xl font-bold mb-4 print:hidden">🖨️ Print Stickers ({selected.length}) - A4</button>
          
          {/* GAP FIXED HERE */}
          <div id="print-area" className="grid grid-cols-3 gap-6 print:gap-8 border p-6 print:p-4 print:border-none bg-white">
            {selected.map(id=>{
              const p = products.find(x=>x._id===id);
              if(!p) return null;
              const code = p.barcode || `MNY${id.slice(-6).toUpperCase()}`;
              return (
                <div key={id} className="border border-dashed border-gray-400 p-3 py-5 text-center rounded-lg m-1.5 bg-white">
                  <p className="text-[10px] font-bold truncate mb-1.5">{p.name}</p>
                  <canvas id={`bc-${id}`} className="mx-auto"></canvas>
                  <p className="text-[8px] mt-2 font-medium">Rs.{p.sellPrice} - {code}</p>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}