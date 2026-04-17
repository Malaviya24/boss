import mongoose from 'mongoose';

const matkaMarketSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
    },
    slug: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      maxlength: 140,
      index: true,
    },
    openTime: {
      type: String,
      required: true,
      trim: true,
      match: /^\d{2}:\d{2}$/,
    },
    closeTime: {
      type: String,
      required: true,
      trim: true,
      match: /^\d{2}:\d{2}$/,
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
    sortOrder: {
      type: Number,
      default: 0,
      index: true,
    },
  },
  {
    timestamps: true,
  },
);

matkaMarketSchema.index(
  { slug: 1, isActive: 1 },
  {
    unique: true,
    partialFilterExpression: { isActive: true },
  },
);

export const MatkaMarketModel =
  mongoose.models.MatkaMarket || mongoose.model('MatkaMarket', matkaMarketSchema);
