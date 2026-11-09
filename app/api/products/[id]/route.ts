import dbConnect from "@/lib/mongodb";
import Product from "@/models/Product";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "../../auth/[...nextauth]/route";
import { Types } from "mongoose";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

type ProductCategory = "mobile_accessories" | "manyari" | "cosmetics" | "other" | "general";

type ProductUpdateBody = {
  name?: string;
  category?: ProductCategory;
  company?: string;
  buyPrice?: number;
  buyPriceAvg?: number;
  sellPrice?: number;
  stock?: number;
  stockMode?: "limited" | "unlimited";
  barcode?: string;
};

type ProductUpdateData = {
  lastSyncedAt: Date;
  synced: boolean;
  name?: string;
  category?: string;
  company?: string;
  buyPriceAvg?: number;
  sellPrice?: number;
  stock?: number;
  stockMode?: string;
  barcode?: string | null;
};

function isValidObjectId(id: string): boolean {
  return Types.ObjectId.isValid(id);
}
function rnd(n: number): number {
  return Math.round(Number(n) || 0);
}

export async function GET(_req: NextRequest, { params }: Params): Promise<NextResponse> {
  const { id } = await params;
  if (!isValidObjectId(id)) return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    await dbConnect();
    const userId = new Types.ObjectId(session.user.id);
    const product = await Product.findOne({ _id: id, userId }).lean({ virtuals: true });
    if (!product) return NextResponse.json({ error: "Product not found" }, { status: 404 });
    return NextResponse.json(product);
  } catch {
    return NextResponse.json({ error: "Failed to fetch" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest, { params }: Params): Promise<NextResponse> {
  const { id } = await params;
  if (!isValidObjectId(id)) return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    await dbConnect();
    const userId = new Types.ObjectId(session.user.id);
    const body = (await req.json()) as ProductUpdateBody;

    const updateData: ProductUpdateData = { lastSyncedAt: new Date(), synced: true };
    if (body.name?.trim()) updateData.name = body.name.trim();
    if (body.category) updateData.category = body.category;
    if (body.company !== undefined) updateData.company = body.company.trim();
    if (body.buyPrice !== undefined || body.buyPriceAvg !== undefined) {
      updateData.buyPriceAvg = rnd(body.buyPriceAvg ?? body.buyPrice ?? 0);
    }
    if (body.sellPrice !== undefined) updateData.sellPrice = rnd(body.sellPrice);
    if (body.stock !== undefined) updateData.stock = rnd(body.stock);
    if (body.stockMode) updateData.stockMode = body.stockMode;
    
    // ✅ Barcode update — empty string = remove barcode
    if (body.barcode !== undefined) {
      const trimmed = body.barcode.trim();
      if (trimmed === "") {
        updateData.barcode = null;
      } else {
        updateData.barcode = trimmed;
      }
    }

    const updated = await Product.findOneAndUpdate(
      { _id: id, userId },
      { $set: updateData, $unset: updateData.barcode === null ? { barcode: "" } : {} },
      { new: true, runValidators: true }
    ).lean({ virtuals: true });

    if (!updated) return NextResponse.json({ error: "Product not found" }, { status: 404 });
    return NextResponse.json(updated);
  } catch {
    return NextResponse.json({ error: "Failed to update" }, { status: 400 });
  }
}

export async function DELETE(_req: NextRequest, { params }: Params): Promise<NextResponse> {
  const { id } = await params;
  if (!isValidObjectId(id)) return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    await dbConnect();
    const userId = new Types.ObjectId(session.user.id);
    const deleted = await Product.findOneAndDelete({ _id: id, userId });
    if (!deleted) return NextResponse.json({ error: "Product not found" }, { status: 404 });
    return NextResponse.json({ message: "Product deleted", deletedId: id });
  } catch {
    return NextResponse.json({ error: "Failed to delete" }, { status: 500 });
  }
}