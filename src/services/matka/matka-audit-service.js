import { MatkaAdminAuditLogModel } from '../../models/matka-admin-audit-log-model.js';

export function createMatkaAuditService({ enabled }) {
  async function log({
    adminUser,
    action,
    entityType,
    entityId,
    before = null,
    after = null,
    ip = '',
    userAgent = '',
  }) {
    if (!enabled) {
      return null;
    }

    return MatkaAdminAuditLogModel.create({
      adminUser,
      action,
      entityType,
      entityId,
      before,
      after,
      ip,
      userAgent,
    });
  }

  async function list({ limit = 100 } = {}) {
    if (!enabled) {
      return [];
    }

    return MatkaAdminAuditLogModel.find({})
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();
  }

  return {
    log,
    list,
  };
}
