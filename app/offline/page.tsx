import Image from "next/image";
import Link from "next/link";

export default function OfflinePage() {
  return (
    <div className="min-h-dvh flex flex-col items-center justify-center bg-[#eff6ff] p-6 text-center">
      <Image src="/icon-circle-512.png" unoptimized alt="Imtiaz General Store" width={80} height={80} className="w-20 h-20 rounded-full border-2 border-[#0f4fb8] mb-4 bg-white" />
      <h1 className="text-xl font-bold">🛒 Imtiaz General Store</h1>
      <p className="text-[#0f4fb8] text-sm font-bold">امتیاز جنرل سٹور - Ismaila</p>
      <p className="text-gray-600 text-sm font-medium">Wholesale & Retail • Kiryana • General Items</p>
      <p className="text-gray-500 text-[12px] mt-3">You are offline. Your data is safe.</p>
      <p className="text-[11px] text-gray-400 mt-1">Sales, Stock & Khata work offline • Auto-sync when online</p>
      <p className="text-[11px] text-gray-400 mt-1">Fast Billing + Thermal Print 58mm ready offline</p>
      <div className="flex gap-2 mt-5">
        <Link href="/" className="bg-[#0f4fb8] text-white px-4 py-2 rounded-xl text-sm font-bold">Home</Link>
        <Link href="/dashboard" className="bg-white border px-4 py-2 rounded-xl text-sm">Dashboard</Link>
      </div>
      <p className="text-[10px] text-gray-500 mt-4 font-bold">📞 0343-3518722 | 0343-8989277</p>
      <p className="text-[10px] text-gray-400 mt-2">Imtiaz General Store • Offline V1 • امتیاز جنرل سٹور • Permanent PWA</p>
    </div>
  );
}