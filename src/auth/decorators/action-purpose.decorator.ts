import { SetMetadata } from '@nestjs/common';

export const ACTION_PURPOSE_KEY = 'actionPurpose';

/**
 * Attaches an expected purpose string to a route handler.
 * Read by SensitiveActionGuard to scope passkey action tokens.
 *
 * Example: @ActionPurpose('disable-totp')
 */
export const ActionPurpose = (purpose: string) =>
  SetMetadata(ACTION_PURPOSE_KEY, purpose);
