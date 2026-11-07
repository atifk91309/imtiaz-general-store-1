import dbConnect from "@/lib/mongodb";
import Customer from "@/models/Customer";
import Sale from "@/models/Sale";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "../../auth/[...nextauth]/route";
import { Types } from "mongoose";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type WusoolBody = { 
  customerId?: string; 
  customerName?: string; 
  amount: number;
  note?: string;
};

function rnd(n: number) { return Math.round((n || 0) * 100) / 100; }

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    await dbConnect();
    const body = (await req.json()) as WusoolBody;
    const amount = rnd(Number(body.amount));

    if (!amount || amount <= 0) return NextResponse.json({ error: "Valid amount required" }, { status: 400 });
    if (!body.customerId && !body.customerName) return NextResponse.json({ error: "customerId or customerName required" }, { status: 400 });

    const userId = new Types.ObjectId(session.user.id);
    
    let customer = null;
    if (body.customerId && Types.ObjectId.isValid(body.customerId)) {
      // ✅ CHANGE: isPaid filter hata diya - pending hi milega but paid ko bhi handle kar sake
      customer = await Customer.findOne({ _id: body.customerId, userId });
    } else {
      const normalized = body.customerName!.trim().toLowerCase();
      // ✅ Last pending khata lo, paid wala nahi
      customer = await Customer.findOne({ normalizedName: normalized, userId, isPaid: false }).sort({ createdAt: -1 });
      // agar pending na mile to last wala paid bhi check karo (galat wusool rokne ke liye)
      if (!customer) {
        const lastCustomer = await Customer.findOne({ normalizedName: normalized, userId }).sort({ createdAt: -1 });
        if (lastCustomer && lastCustomer.isPaid) {
          return NextResponse.json({ error: "Khata already fully paid - Del option available" }, { status: 400 });
        }
      }
    }

    if (!customer) return NextResponse.json({ error: "Khata not found" }, { status: 404 });
    if (customer.isPaid) return NextResponse.json({ error: "Khata already paid - use Del to remove" }, { status: 400 });

    const historyEntry = {
      amount,
      date: new Date(),
      note: body.note?.trim() || "",
    };

    const newUdhar = rnd(customer.totalUdhar - amount);

    if (newUdhar <= 0.01) {
      // ✅ FULLY PAID - DELETE NAHI KARNA, SIRF PAID MARK KARNA
      customer.totalUdhar = 0;
      customer.isPaid = true; // ab paid list me jayega, hide nahi hoga
      customer.paidAmount = customer.totalBusiness;
      customer.paidAt = new Date();
      customer.lastWusoolDate = new Date();
      customer.wusoolHistory.push(historyEntry);
      await customer.save();

      if (customer.saleIds?.length) {
        await Sale.updateMany(
          { _id: { $in: customer.saleIds }, userId },
          { $set: { status: "paid", paymentType: "cash", isCredit: false } }
        );
      }

      return NextResponse.json({ 
        success: true, 
        fullyPaid: true, 
        extra: rnd(Math.abs(newUdhar)),
        customer,
        wusool: historyEntry,
        message: "All udhar received - Khata Paid, Del option now available"
      });
    } else {
      // Partial wusool
      customer.totalUdhar = newUdhar;
      customer.paidAmount = rnd((customer.paidAmount || 0) + amount);
      customer.lastWusoolDate = new Date();
      customer.wusoolHistory.push(historyEntry);
      await customer.save();

      return NextResponse.json({ 
        success: true, 
        fullyPaid: false, 
        remaining: newUdhar,
        customer,
        wusool: historyEntry 
      });
    }
  } catch (e) {
    console.error("POST /api/khata/wusool error:", e);
    return NextResponse.json({ error: "Failed to record wusool" }, { status: 500 });
  }
}