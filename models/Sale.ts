import mongoose, { Schema, Document, Types } from "mongoose";

export type SaleCategory = "mobile_accessories" | "manyari" | "cosmetics" | "other" | "general";
export type PaymentType = "cash" | "credit";
export type SaleStatus = "paid" | "pending";

export interface ISale extends Document {
  productId: Types.ObjectId;
  productName: string;
  category: SaleCategory;
  quantity: number;
  sellPrice: number;
  buyPrice: number;
  buyPriceAvg: number;
  total: number;
  profit: number;
  customerName: string;
  paymentType: PaymentType;
  status: SaleStatus;
  userId: Types.ObjectId;
  localId?: string;
  synced?: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const SaleSchema = new Schema<ISale>(
  {
    productId: { type: Schema.Types.ObjectId, ref: "Product", required: true, index: true },
    productName: { type: String, required: true, trim: true, index: true },
    category: {
      type: String,
      enum: ["mobile_accessories", "manyari", "cosmetics", "other", "general"],
      default: "general",
      index: true,
    },
    quantity: { type: Number, required: true, min: 1 },
    sellPrice: { type: Number, required: true, min: 0 },
    buyPrice: { type: Number, default: 0, min: 0 },
    buyPriceAvg: { type: Number, default: 0, min: 0 },
    total: { type: Number, required: true, min: 0 },
    profit: { type: Number, required: true },
    customerName: { type: String, default: "Walk-in", trim: true, index: true },
    paymentType: { type: String, enum: ["cash", "credit"], default: "cash", index: true },
    status: { type: String, enum: ["paid", "pending"], default: "paid", index: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    localId: { type: String, sparse: true, index: true },
    synced: { type: Boolean, default: true },
  },
  { timestamps: true }
);

// Auto-calc whole rupees — Imtiaz POS fixed
SaleSchema.pre("validate", function () {
  const qty = Math.round(Number(this.quantity) || 0);
  const sell = Math.round(Number(this.sellPrice) || 0);
  const buy = Math.round(Number(this.buyPriceAvg || this.buyPrice) || 0);

  this.buyPrice = buy;
  this.buyPriceAvg = buy;

  if (!this.total || this.isModified("quantity") || this.isModified("sellPrice")) {
    this.total = Math.round(qty * sell);
  }
  if (this.profit === undefined || this.profit === null || this.isModified("quantity") || this.isModified("sellPrice") || this.isModified("buyPriceAvg") || this.isModified("buyPrice")) {
    this.profit = Math.round(qty * (sell - buy));
  }

  this.status = this.paymentType === "credit" ? "pending" : "paid";
});

// ONLY 5 indexes — optimized, no duplicates
SaleSchema.index({ userId: 1, createdAt: -1 });
SaleSchema.index({ userId: 1, category: 1, createdAt: -1 });
SaleSchema.index({ userId: 1, status: 1 });
SaleSchema.index({ userId: 1, localId: 1 }, { sparse: true, unique: true });
SaleSchema.index({ localId: 1 }, { sparse: true });

export default mongoose.models.Sale || mongoose.model<ISale>("Sale", SaleSchema);