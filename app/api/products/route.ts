import dbConnect from "@/lib/mongodb";
import Product from "@/models/Product";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "../auth/[...nextauth]/route";
import { Types } from "mongoose";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type ProductCategory = "mobile_accessories" | "manyari" | "cosmetics" | "other" | "general";

type ProductBody = {
  name: string;
  category?: ProductCategory;
  company?: string;
  buyPrice?: number;
  buyPriceAvg?: number;
  sellPrice: number;
  stock?: number;
  stockMode?: "limited" | "unlimited";
  barcode?: string;
  localId?: string;
};

function rnd(n: number): number {
  return Math.round(Number(n) || 0);
}

type ProductQuery = {
  userId: Types.ObjectId;
  category?: string;
  name?: { $regex: string; $options: string };
  stock?: { $gt?: number; $lte?: number };
  $or?: Array<{ name?: { $regex: string; $options: string }; barcode?: string; company?: { $regex: string; $options: string } }>;
};

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await dbConnect();
    const sp = req.nextUrl.searchParams;
    const search = sp.get("search")?.trim() || "";
    const category = sp.get("category")?.trim() || "";
    const stockFilter = sp.get("stock") || "";
    const page = Math.max(1, parseInt(sp.get("page") || "1", 10));
    const limit = Math.min(100, Math.max(1, parseInt(sp.get("limit") || "20", 10)));
    const skip = (page - 1) * limit;
    const userId = new Types.ObjectId(session.user.id);

    const baseQuery: ProductQuery = { userId };

    if (category && category !== "all") baseQuery.category = category;
    if (stockFilter === "low") baseQuery.stock = { $gt: 0, $lte: 2 };
    if (stockFilter === "out") baseQuery.stock = { $lte: 0 };

    // ✅ Scanner + name + barcode search (mobile + desktop)
    if (search) {
      baseQuery.$or = [
        { name: { $regex: search, $options: "i" } },
        { barcode: search },
        { company: { $regex: search, $options: "i" } },
      ];
    }

    const [products, totalCount] = await Promise.all([
      Product.find(baseQuery).sort({ createdAt: -1 }).skip(skip).limit(limit).lean({ virtuals: true }),
      Product.countDocuments(baseQuery),
    ]);

    return NextResponse.json({
      products,
      pagination: {
        page,
        limit,
        totalCount,
        totalPages: Math.ceil(totalCount / limit),
        hasMore: skip + products.length < totalCount,
      },
    });
  } catch {
    return NextResponse.json({ error: "Failed to fetch products" }, { status: 500 });
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await dbConnect();
    const body = (await req.json()) as ProductBody;

    if (!body.name?.trim()) return NextResponse.json({ error: "name required" }, { status: 400 });
    if (!body.sellPrice) return NextResponse.json({ error: "sellPrice required" }, { status: 400 });

    const userId = new Types.ObjectId(session.user.id);
    const buy = rnd(body.buyPriceAvg ?? body.buyPrice ?? 0);
    const barcode = body.barcode?.trim() ? body.barcode.trim() : undefined;

    if (body.localId) {
      const existing = await Product.findOne({ localId: body.localId, userId }).lean();
      if (existing) return NextResponse.json(existing, { status: 200 });
    }

    // ✅ Check duplicate by barcode first (scanner best)
    if (barcode) {
      const byBarcode = await Product.findOne({ barcode, userId });
      if (byBarcode) {
        byBarcode.stock = rnd((byBarcode.stock || 0) + rnd(body.stock || 0));
        byBarcode.sellPrice = rnd(body.sellPrice);
        byBarcode.buyPriceAvg = buy;
        byBarcode.name = body.name.trim();
        if (body.category) byBarcode.category = body.category;
        await byBarcode.save();
        return NextResponse.json(byBarcode, { status: 200 });
      }
    }

    const dup = await Product.findOne({ name: body.name.trim(), userId });
    if (dup) {
      dup.stock = rnd((dup.stock || 0) + rnd(body.stock || 0));
      dup.sellPrice = rnd(body.sellPrice);
      dup.buyPriceAvg = buy;
      if (barcode) dup.barcode = barcode;
      await dup.save();
      return NextResponse.json(dup, { status: 200 });
    }

    const product = await Product.create({
      name: body.name.trim(),
      category: body.category || "general",
      company: body.company?.trim() || "",
      buyPriceAvg: buy,
      sellPrice: rnd(body.sellPrice),
      stock: rnd(body.stock || 0),
      stockMode: body.stockMode || "limited",
      barcode,
      userId,
      localId: body.localId,
      synced: true,
    });

    return NextResponse.json(product, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Failed to create product" }, { status: 500 });
  }
}