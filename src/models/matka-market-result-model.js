import mongoose from 'mongoose';

const matkaMarketResultSchema = new mongoose.Schema(
  {
    marketId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'MatkaMarket',
      required: true,
      index: true,
    },
    resultDate: {
      type: String,
      required: true,
      trim: true,
      match: /^\d{4}-\d{2}-\d{2}$/,
      index: true,
    },
    openPanel: {
      type: String,
      trim: true,
      match: /^\d{3}$/,
      default: '',
    },
    closePanel: {
      type: String,
      trim: true,
      match: /^\d{3}$/,
      default: '',
    },
    openSingle: {
      type: String,
      trim: true,
      maxlength: 1,
      default: '',
    },
    closeSingle: {
      type: String,
      trim: true,
      maxlength: 1,
      default: '',
    },
    jodiLeft: {
      type: String,
      trim: true,
      maxlength: 2,
      default: '',
    },
    jodiRight: {
      type: String,
      trim: true,
      maxlength: 2,
      default: '',
    },
    middleJodi: {
      type: String,
      trim: true,
      maxlength: 2,
      default: '',
    },
    displayResult: {
      type: String,
      trim: true,
      maxlength: 20,
      default: '',
    },
    openRevealAt: {
      type: Date,
      default: null,
    },
    closeRevealAt: {
      type: Date,
      default: null,
    },
    openUpdatedBy: {
      type: String,
      trim: true,
      maxlength: 120,
      default: '',
    },
    closeUpdatedBy: {
      type: String,
      trim: true,
      maxlength: 120,
      default: '',
    },
  },
  {
    timestamps: true,
  },
);

matkaMarketResultSchema.index({ marketId: 1, resultDate: 1 }, { unique: true });

export const MatkaMarketResultModel =
  mongoose.models.MatkaMarketResult ||
  mongoose.model('MatkaMarketResult', matkaMarketResultSchema);
