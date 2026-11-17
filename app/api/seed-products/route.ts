import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/mongodb";
import Product from "@/models/Product";

const NAMES: Record<string, string[]> = {
  general: ["Surf Excel", "Tea Patti", "Sugar", "Salt", "Cooking Oil", "Ghee", "Biscuit", "Toffee", "Chips", "Cold Drink", "Mineral Water", "Milk Powder", "Noodles", "Pasta", "Jam", "Honey", "Soap Box", "Washing Powder", "Dettol", "Phenyl", "Candle", "Match Box", "Battery Cell", "Torch", "Lock", "Umbrella", "Tape", "Glue", "Notebook", "Pen Pack"],
  cosmetics: ["Face Wash", "Fair Cream", "Lipstick", "Nail Polish", "Perfume", "Hair Oil", "Shampoo", "Conditioner", "Face Powder", "Kajal", "Mascara", "Hair Color", "Body Lotion", "Hand Wash", "Rose Water", "Tibet Soap", "Lux Soap", "Ponds Cream", "Vaseline", "Hair Gel"],
  mobile_accessories: ["Data Cable", "Charger", "Earphone", "Handsfree", "Mobile Cover", "Screen Protector", "Memory Card", "Power Bank", "Bluetooth Speaker", "Selfie Stick", "Mobile Holder", "OTG Cable", "SIM Ejector", "Card Reader", "LED Light", "Mobile Stand", "AirPods Cover", "Charging Adapter", "USB Hub", "Phone Ring"],
  manyari: ["Bangles Set", "Earrings", "Necklace", "Ring", "Hair Clip", "Hair Band", "Bindi Pack", "Mehndi Cone", "Choti Clips", "Nose Pin", "Payal", "Bracelet", "Brooch", "Tikah", "Jhumka", "Kangan", "Matha Patti", "Choker", "Locket", "Anklet"],
  other: ["Key Chain", "Wallet", "Belt", "Cap", "Socks", "Handkerchief", "Comb", "Mirror", "Scissors", "Nail Cutter", "Razor", "Shaving Cream", "Toothpaste", "Toothbrush", "Towel", "Slippers", "School Bag", "Lunch Box", "Water Bottle", "Piggy Bank"],
};

const CATS = Object.keys(NAMES);
const rand = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;
const pick = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];

export async function POST(req: NextRequest) {
  try {
    await connectDB();
    const body = await req.json().catch(() => ({}));
    const count = Math.min(Number(body.count) || 200, 500);
    const userId = body.userId as string | undefined;

    // userId nahi diya to pehle wale product se le lo
    let finalUserId = userId;
    if (!finalUserId) {
      const existing: { userId?: string } | null = await Product.findOne({}).lean();
      finalUserId = existing?.userId || "offline_user";
    }

    // Purane SEED- wale delete karo taake double na hon
    const deleted = await Product.deleteMany({ name: { $regex: "^SEED-" }, userId: finalUserId });

    const docs = [];
    const used = new Set<string>();
    for (let i = 0; i < count; i++) {
      const cat = pick(CATS);
      const base = pick(NAMES[cat]);
      const buy = rand(20, 450);
      const sell = buy + rand(10, 120);
      let barcode = "";
      do { barcode = "89" + String(rand(1000000000, 9999999999)); } while (used.has(barcode));
      used.add(barcode);

      docs.push({
        name: `SEED-${base} ${rand(1, 500)}g`,
        category: cat,
        company: "Seed",
        buyPrice: buy,
        buyPriceAvg: buy,
        sellPrice: sell,
        stock: rand(5, 60),
        stockMode: Math.random() > 0.85 ? "unlimited" : "limited",
        barcode,
        userId: finalUserId,
      });
    }

    await Product.insertMany(docs);
    const total = await Product.countDocuments({ userId: finalUserId });

    return NextResponse.json({ success: true, message: `Seeded ${count} products`, deletedOld: deleted.deletedCount, total, userId: finalUserId });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Seed failed";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

// SEED wale delete karne ke liye - Postman se DELETE
export async function DELETE(req: NextRequest) {
  try {
    await connectDB();
    const body = await req.json().catch(() => ({}));
    const userId = body.userId as string | undefined;
    const filter: Record<string, unknown> = { name: { $regex: "^SEED-" } };
    if (userId) filter.userId = userId;
    const res = await Product.deleteMany(filter);
    return NextResponse.json({ success: true, deleted: res.deletedCount });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Delete failed";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}