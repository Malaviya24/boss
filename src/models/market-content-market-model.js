import mongoose from 'mongoose';

const marketContentMarketSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 160,
    },
    slug: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      maxlength: 160,
    },
    type: {
      type: String,
      required: true,
      enum: ['jodi', 'panel'],
      index: true,
    },
    openTime: {
      type: String,
      trim: true,
      default: '',
    },
    closeTime: {
      type: String,
      trim: true,
      default: '',
    },
    status: {
      type: String,
      trim: true,
      default: 'active',
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
    importSource: {
      type: String,
      trim: true,
      default: 'generated',
    },
    importedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  },
);

marketContentMarketSchema.index({ slug: 1, type: 1 }, { unique: true });

export const MarketContentMarketModel =
  mongoose.models.MarketContentMarket ||
  mongoose.model('MarketContentMarket', marketContentMarketSchema);
