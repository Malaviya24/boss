import mongoose from 'mongoose';

const matkaAdminAuditLogSchema = new mongoose.Schema(
  {
    adminUser: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
      index: true,
    },
    action: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
      index: true,
    },
    entityType: {
      type: String,
      required: true,
      trim: true,
      maxlength: 80,
      index: true,
    },
    entityId: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
      index: true,
    },
    before: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    after: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    ip: {
      type: String,
      trim: true,
      maxlength: 120,
      default: '',
    },
    userAgent: {
      type: String,
      trim: true,
      maxlength: 500,
      default: '',
    },
  },
  {
    timestamps: true,
  },
);

matkaAdminAuditLogSchema.index({ createdAt: -1 });

export const MatkaAdminAuditLogModel =
  mongoose.models.MatkaAdminAuditLog ||
  mongoose.model('MatkaAdminAuditLog', matkaAdminAuditLogSchema);
