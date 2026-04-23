import mongoose from 'mongoose';

const marketResultLiveSchema = new mongoose.Schema(
  {
    marketId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'MarketContentMarket',
      required: true,
      index: true,
    },
    type: {
      type: String,
      required: true,
      enum: ['jodi', 'panel'],
      index: true,
    },
    openPanel: {
      type: String,
      trim: true,
      default: '',
    },
    closePanel: {
      type: String,
      trim: true,
      default: '',
    },
    openSingle: {
      type: String,
      trim: true,
      default: '',
    },
    closeSingle: {
      type: String,
      trim: true,
      default: '',
    },
    displayResult: {
      type: String,
      trim: true,
      default: '',
    },
    updatedAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
  },
  {
    timestamps: true,
  },
);

marketResultLiveSchema.index({ marketId: 1, type: 1 }, { unique: true });

export const MarketResultLiveModel =
  mongoose.models.MarketResultLive || mongoose.model('MarketResultLive', marketResultLiveSchema);
