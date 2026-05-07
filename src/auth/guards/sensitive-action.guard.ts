import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { Reflector } from '@nestjs/core';
import { AuthPasskeyService } from '../auth-passkey.service';
import {
  ACTION_PURPOSE_KEY,
} from '../decorators/action-purpose.decorator';

/**
 * Optional re-auth guard for sensitive endpoints.
 *
 * When the client sends an `X-Action-Token` header (a short-lived JWT issued
 * after a successful passkey / biometric challenge), this guard validates it.
 * If the header is absent the request passes through — the endpoint's own
 * re-auth mechanism (TOTP code, password, OTP) is still responsible for
 * verifying the user's identity.
 *
 * Pair with @ActionPurpose('purpose-string') on the route handler to scope
 * the token — a token issued for 'disable-totp' cannot be reused for
 * 'delete-account' and vice-versa.
 *
 * Apply this guard to any destructive action so that passkey-enabled users
 * can use biometric re-auth instead of typing a code.
 */
@Injectable()
export class SensitiveActionGuard implements CanActivate {
  constructor(
    private readonly passkeyService: AuthPasskeyService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context
      .switchToHttp()
      .getRequest<Request & { user?: { id: string } }>();

    const actionToken = req.headers['x-action-token'] as string | undefined;
    const userId = req.user?.id;

    if (actionToken) {
      if (!userId) throw new UnauthorizedException('Not authenticated');
      const expectedPurpose = this.reflector.get<string>(
        ACTION_PURPOSE_KEY,
        context.getHandler(),
      );
      await this.passkeyService.validateActionToken(
        userId,
        actionToken,
        expectedPurpose,
      );
    }

    return true;
  }
}
