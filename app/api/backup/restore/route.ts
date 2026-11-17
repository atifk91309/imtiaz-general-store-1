import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import dbConnect from "@/lib/mongodb";
import Product from "@/models/Product";
import Sale from "@/models/Sale";
import Customer from "@/models/Customer";
import Easypaisa from "@/models/Easypaisa";

type BackupDoc = {
  _id?: string;
  barcode?: string;
  normalizedName?: string;
  totalUdhar?: number;
  totalBusiness?: number;
  paidAmount?: number;
  wusoolHistory?: unknown[];
  isPaid?: boolean;
  status?: string;
  productId?: string;
  stock?: number;
  name?: string;
};

type BackupPayload = {
  data?: {
    products?: BackupDoc[];
    sales?: BackupDoc[];
    customers?: BackupDoc[];
    easypaisa?: BackupDoc[];
  };
  products?: BackupDoc[];
  sales?: BackupDoc[];
  customers?: BackupDoc[];
  easypaisa?: BackupDoc[];
};

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await dbConnect();
    const userId = session.user.id;
    if (!userId) {
      return NextResponse.json({ error: "UserId missing" }, { status: 400 });
    }

    const body = (await req.json()) as BackupPayload;
    const data = body.data ?? body;

    const restored = { products: 0, sales: 0, customers: 0, easypaisa: 0 };
    const skipped = { products: 0, sales: 0, customers: 0, easypaisa: 0 };
    const updated = { products: 0, customers: 0 };

    // ✅ PRODUCTS - UPDATE STOCK, don't skip
    if (data.products) {
      for (const p of data.products) {
        try {
          const query = p.barcode
            ? { barcode: p.barcode, userId }
            : p._id
            ? { _id: p._id, userId }
            : null;

          if (!query) {
            skipped.products += 1;
            continue;
          }

          const exists = await Product.findOne(query);
          if (exists) {
            // ✅ FIX: Update to backup stock (13 after return)
            exists.set({ ...p, userId });
            // Force stock to backup value
            if (typeof p.stock === "number") {
              exists.stock = p.stock;
            }
            await exists.save();
            updated.products += 1;
          } else {
            const { _id, ...rest } = p;
            void _id;
            await Product.create({ ...rest, userId });
            restored.products += 1;
          }
        } catch {
          skipped.products += 1;
        }
      }
    }

    // ✅ SALES - Don't restore deleted/returned sales, don't duplicate
    if (data.sales) {
      for (const s of data.sales) {
        try {
          // Skip deleted sales (returned)
          if (s.status === "deleted") {
            skipped.sales += 1;
            continue;
          }
          if (s._id) {
            const exists = await Sale.findOne({ _id: s._id, userId });
            if (exists) {
              skipped.sales += 1;
              continue;
            }
          }
          const { _id, ...rest } = s;
          void _id;
          await Sale.create({ ...rest, userId });
          restored.sales += 1;
        } catch {
          skipped.sales += 1;
        }
      }
    }

    if (data.customers) {
      for (const c of data.customers) {
        try {
          if (!c.normalizedName) {
            skipped.customers += 1;
            continue;
          }
          const exists = await Customer.findOne({
            normalizedName: c.normalizedName,
            userId,
          });
          if (exists) {
            exists.set({
              totalUdhar: c.totalUdhar,
              totalBusiness: c.totalBusiness,
              paidAmount: c.paidAmount,
              wusoolHistory: c.wusoolHistory,
              isPaid: c.isPaid,
            });
            await exists.save();
            updated.customers += 1;
          } else {
            const { _id, ...rest } = c;
            void _id;
            await Customer.create({ ...rest, userId });
            restored.customers += 1;
          }
        } catch {
          skipped.customers += 1;
        }
      }
    }

    // ✅ FIX 2: Easypaisa - Skip duplicate like Sales
    if (data.easypaisa) {
      for (const e of data.easypaisa) {
        try {
          if (e._id) {
            const exists = await Easypaisa.findOne({ _id: e._id, userId });
            if (exists) {
              skipped.easypaisa += 1;
              continue;
            }
          }
          const { _id, ...rest } = e;
          void _id;
          await Easypaisa.create({ ...rest, userId });
          restored.easypaisa += 1;
        } catch {
          skipped.easypaisa += 1;
        }
      }
    }

    return NextResponse.json({
      success: true,
      // ✅ FIX 1: Imtiaz name
      message: "Imtiaz General Store Restore Done",
      restored,
      updated,
      skipped,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Restore failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}