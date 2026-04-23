import mongoose from 'mongoose';

const headingBlockSchema = new mongoose.Schema(
  {
    tag: {
      type: String,
      trim: true,
      default: 'p',
    },
    className: {
      type: String,
      trim: true,
      default: '',
    },
    text: {
      type: String,
      trim: true,
      default: '',
    },
  },
  { _id: false },
);

const marketMetaSchema = new mongoose.Schema(
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
    title: {
      type: String,
      trim: true,
      default: '',
    },
    description: {
      type: String,
      trim: true,
      default: '',
    },
    seo: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    styleUrls: {
      type: [String],
      default: [],
    },
    styleBlocks: {
      type: [String],
      default: [],
    },
    jsonLdBlocks: {
      type: [String],
      default: [],
    },
    hero: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    result: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    controls: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    table: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    footer: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    headings: {
      type: [headingBlockSchema],
      default: [],
    },
  },
  {
    timestamps: true,
  },
);

marketMetaSchema.index({ marketId: 1, type: 1 }, { unique: true });

export const MarketMetaModel =
  mongoose.models.MarketMeta || mongoose.model('MarketMeta', marketMetaSchema);
