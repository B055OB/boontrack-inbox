/**
 * lib/tools/index.ts
 * Central Entrypoint for the Business Action Layer & Tool Gateway.
 *
 * Automatically registers all standard Read and Action tools into the singleton toolRegistry.
 */

import { toolRegistry } from './registry';
import { getOrderStatusTool } from './read/get-order-status';
import { trackShipmentTool } from './read/track-shipment';
import { requestOrderCancellationTool } from './action/request-order-cancellation';

// Register standard tools
toolRegistry.register(getOrderStatusTool);
toolRegistry.register(trackShipmentTool);
toolRegistry.register(requestOrderCancellationTool);

export {
  toolRegistry,
  getOrderStatusTool,
  trackShipmentTool,
  requestOrderCancellationTool,
};

export * from './types';
export * from './registry';
export * from './audit';
export * from './read/get-order-status';
export * from './read/track-shipment';
export * from './action/request-order-cancellation';
