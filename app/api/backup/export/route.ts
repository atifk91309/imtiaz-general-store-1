import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import dbConnect from "@/lib/mongodb";
import Product from "@/models/Product";
import Sale from "@/models/Sale";
import Customer from "@/models/Customer";
import Easypaisa from "@/models/Easypaisa";

export async function GET() {
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

    const [products, sales, customers, easypaisa] = await Promise.all([
      Product.find({ userId }).lean(),
      // ✅ FIX 2: Don't export returned / deleted sales - stops x4 duplicate
      Sale.find({ userId, status: { $ne: "deleted" } }).lean(),
      Customer.find({ userId }).lean(),
      Easypaisa.find({ userId }).lean(),
    ]);

    const totalBusiness = sales.reduce((sum: number, s: { total?: number }) => {
      return sum + (typeof s.total === "number" ? s.total : 0);
    }, 0);

    const totalUdhar = customers.reduce((sum: number, c: { totalUdhar?: number }) => {
      return sum + (typeof c.totalUdhar === "number" ? c.totalUdhar : 0);
    }, 0);

    return NextResponse.json({
      // ✅ FIX 1: Imtiaz name
      app: "Imtiaz General Store",
      version: "2.0",
      store: {
        name: "IMTIAZ GENERAL STORE",
        address: "Imtiaz General Store - Main Bazar",
        phones: "0311-6146946 - 0345-9500176",
      },
      exportedAt: new Date().toISOString(),
      userId,
      data: { products, sales, customers, easypaisa },
      stats: {
        totalProducts: products.length,
        totalSales: sales.length,
        totalCustomers: customers.length,
        totalEasypaisa: easypaisa.length,
        totalBusiness,
        totalUdhar,
      },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Export failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}