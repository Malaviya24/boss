import { z } from 'zod';
import { createAutoDeclarationService } from '../services/matka/auto-declaration-service.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('auto-declaration-controller');

const getAutoResultsSchema = z.object({
  marketId: z.string().regex(/^[0-9a-fA-F]{24}$/),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
});

const overrideAutoResultSchema = z.object({
  marketId: z.string().regex(/^[0-9a-fA-F]{24}$/),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  session: z.enum(['open', 'close']),
  panel: z.string().regex(/^\d{3}$/)
});

export function createAutoDeclarationController() {
  const autoDeclarationService = createAutoDeclarationService();

  // Get auto-declared results for preview
  async function getAutoResults(request, response) {
    try {
      const { marketId, date } = getAutoResultsSchema.parse(request.query);
      
      const results = await autoDeclarationService.getAutoDeclaredResults(marketId, date);
      
      response.json({
        success: true,
        data: results
      });
    } catch (error) {
      logger.error('Error getting auto results:', error);
      response.status(400).json({
        success: false,
        message: error.message || 'Failed to get auto results'
      });
    }
  }

  // Override auto-declared result with admin input
  async function overrideAutoResult(request, response) {
    try {
      const { marketId, date, session, panel } = overrideAutoResultSchema.parse(request.body);
      const admin = request.user;
      
      const result = await autoDeclarationService.overrideAutoResult(
        marketId, 
        date, 
        session, 
        panel,
        admin.id,
        admin.username
      );
      
      response.json({
        success: true,
        data: result,
        message: `${session} result overridden successfully`
      });
    } catch (error) {
      logger.error('Error overriding auto result:', error);
      response.status(400).json({
        success: false,
        message: error.message || 'Failed to override auto result'
      });
    }
  }

  // Manually trigger auto-declaration check
  async function triggerAutoCheck(request, response) {
    try {
      await autoDeclarationService.checkAndAutoDeclare();
      
      response.json({
        success: true,
        message: 'Auto-declaration check completed'
      });
    } catch (error) {
      logger.error('Error triggering auto check:', error);
      response.status(500).json({
        success: false,
        message: 'Failed to trigger auto-declaration check'
      });
    }
  }

  // Generate random panel (for testing)
  async function generateRandomPanel(request, response) {
    try {
      const panel = autoDeclarationService.generateRandomPanel();
      
      response.json({
        success: true,
        data: { panel }
      });
    } catch (error) {
      logger.error('Error generating random panel:', error);
      response.status(500).json({
        success: false,
        message: 'Failed to generate random panel'
      });
    }
  }

  return {
    getAutoResults,
    overrideAutoResult,
    triggerAutoCheck,
    generateRandomPanel
  };
}