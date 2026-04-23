import mongoose from 'mongoose';

const marketChartCellSchema = new mongoose.Schema(
  {
    column: {
      type: String,
      trim: true,
      maxlength: 32,
      default: '',
    },
    text: {
      type: String,
      trim: true,
      maxlength: 32,
      default: '',
    },
    isHighlight: {
      type: Boolean,
      default: false,
    },
    className: {
      type: String,
      trim: true,
      maxlength: 80,
      default: '',
    },
    attrs: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  { _id: false },
);

const marketChartRowSchema = new mongoose.Schema(
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
    rowIndex: {
      type: Number,
      required: true,
      min: 0,
      index: true,
    },
    cells: {
      type: [marketChartCellSchema],
      default: [],
    },
  },
  {
    timestamps: true,
  },
);

marketChartRowSchema.index({ marketId: 1, type: 1, rowIndex: 1 }, { unique: true });

export const MarketChartRowModel =
  mongoose.models.MarketChartRow || mongoose.model('MarketChartRow', marketChartRowSchema);
