/**
 * @file lib/email/index.ts
 * @description Central export index for Omni-Channel Email Notification Suite & Order Event Bus.
 */

export * from './types';
export * from './mailer';
export * from './order-event-bus';
export * from './templates/order-created-buyer';
export * from './templates/payment-confirmed-buyer';
export * from './templates/payment-confirmed-seller';
export * from './templates/flagged-manual-seller';
export * from './templates/broadcast-release';
export * from './broadcast-service';

