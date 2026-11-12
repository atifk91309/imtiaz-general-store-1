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
  localId?: string;
};

function rnd(n: number) { return Math.round(n || 0); }

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    await dbConnect();
    const body = (await req.json()) as WusoolBody;
    const amount = rnd(Number(body.amount));

    if (!amount || amount <= 0) return NextResponse.json({ error: "Valid amount required" }, { status: 400 });
    if (!body.customerId && !body.customerName && !body.localId) {
      return NextResponse.json({ error: "customerId or customerName required" }, { status: 400 });
    }

    const userId = new Types.ObjectId(session.user.id);
    
    let customer = null;

    // ✅ 1. _id se dhoondo (online wala)
    if (body.customerId && Types.ObjectId.isValid(body.customerId)) {
      customer = await Customer.findOne({ _id: body.customerId, userId });
    }

    // ✅ 2. localId se dhoondo (offline wala)
    if (!customer && (body.localId || body.customerId)) {
      const local = body.localId || body.customerId;
      customer = await Customer.findOne({ localId: local, userId });
    }

    // ✅ 3. name se dhoondo (offline sync wala)
    if (!customer && body.customerName) {
      const normalized = body.customerName.trim().toLowerCase();
      customer = await Customer.findOne({ normalizedName: normalized, userId, isPaid: false }).sort({ createdAt: -1 });
      
      // Agar pending na mile aur last wala paid hai to already paid bolo
      if (!customer) {
        const lastCustomer = await Customer.findOne({ normalizedName: normalized, userId }).sort({ createdAt: -1 });
        if (lastCustomer?.isPaid) {
          // Offline sync ke liye success return karo taake queue clear ho jaye
          return NextResponse.json({ 
            success: true, 
            alreadyPaid: true,
            message: "Khata already paid" 
          });
        }
      }
    }

    if (!customer) return NextResponse.json({ error: "Khata not found" }, { status: 404 });

    // ✅ Agar already paid hai to success return karo (offline queue clear karne ke liye)
    if (customer.isPaid && customer.totalUdhar <= 0) {
      return NextResponse.json({ 
        success: true, 
        alreadyPaid: true,
        message: "Already fully paid" 
      });
    }

    const historyEntry = {
      amount,
      date: new Date(),
      note: body.note?.trim() || "",
    };

    const newUdhar = rnd(customer.totalUdhar - amount);

    if (newUdhar <= 0) {
      customer.totalUdhar = 0;
      customer.isPaid = true;
      customer.paidAmount = customer.totalBusiness;
      customer.paidAt = new Date();
      customer.lastWusoolDate = new Date();
      customer.wusoolHistory.push(historyEntry);
      await customer.save();

      if (customer.saleIds?.length) {
        await Sale.updateMany(
          { _id: { $in: customer.saleIds }, userId },
          { $set: { status: "paid", paymentType: "cash" } }
        );
      }

      return NextResponse.json({ 
        success: true, 
        fullyPaid: true, 
        extra: rnd(Math.abs(newUdhar)),
        customer,
        wusool: historyEntry,
        message: "All udhar received - Khata Paid"
      });
    } else {
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