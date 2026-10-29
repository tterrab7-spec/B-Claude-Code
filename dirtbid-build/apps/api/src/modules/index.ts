import type { App } from '../app.js';
import { healthRoutes } from './health/routes.js';
import { catalogRoutes } from './catalog/routes.js';
import { authRoutes } from './auth/routes.js';
import { leadRoutes } from './leads/routes.js';
import { feasibilityRoutes } from './feasibility/routes.js';
import { parcelRoutes } from './parcels/routes.js';
import { orderRoutes } from './orders/routes.js';
import { projectCoreRoutes } from './projects/routes-core.js';
import { projectBudgetRoutes } from './projects/routes-budget.js';
import { projectFinanceRoutes } from './projects/routes-finance.js';
import { documentRoutes } from './documents/routes.js';
import { portfolioRoutes } from './portfolio/routes.js';
import { investorRoutes } from './investors/routes.js';
import { vendorRoutes } from './vendors/routes.js';
import { assistantRoutes } from './assistant/routes.js';
import { adminRoutes } from './admin/routes.js';

export async function registerRoutes(app: App): Promise<void> {
  await healthRoutes(app);
  await catalogRoutes(app);
  await authRoutes(app);
  await leadRoutes(app);
  await parcelRoutes(app);
  await feasibilityRoutes(app);
  await orderRoutes(app);
  await projectCoreRoutes(app);
  await projectBudgetRoutes(app);
  await projectFinanceRoutes(app);
  await documentRoutes(app);
  await portfolioRoutes(app);
  await investorRoutes(app);
  await vendorRoutes(app);
  await assistantRoutes(app);
  await adminRoutes(app);
}
