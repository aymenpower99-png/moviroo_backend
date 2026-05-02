import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class RouteCooldownService {
  private readonly logger = new Logger(RouteCooldownService.name);

  // Re-routing cooldown tracker (rideId → last re-route timestamp)
  private reRouteCooldown = new Map<string, number>();
  private readonly COOLDOWN_DURATION_MS = 15000; // 15 seconds cooldown

  /**
   * Check if re-routing is allowed (not in cooldown period)
   * Returns true if re-routing is allowed, false if still in cooldown
   */
  canReRoute(rideId: string): boolean {
    const lastReRouteTime = this.reRouteCooldown.get(rideId);
    if (!lastReRouteTime) {
      return true; // Never re-routed, allow it
    }

    const now = Date.now();
    const timeSinceLastReRoute = now - lastReRouteTime;

    if (timeSinceLastReRoute < this.COOLDOWN_DURATION_MS) {
      this.logger.log(
        `[ROUTE_COOLDOWN] Re-routing blocked for ${rideId} - cooldown remaining: ${((this.COOLDOWN_DURATION_MS - timeSinceLastReRoute) / 1000).toFixed(1)}s`,
      );
      return false;
    }

    return true;
  }

  /**
   * Mark that a re-route just happened (start cooldown)
   */
  markReRoute(rideId: string): void {
    this.reRouteCooldown.set(rideId, Date.now());
    this.logger.log(`[ROUTE_COOLDOWN] Re-routing cooldown started for ${rideId}`);
  }

  /**
   * Clear re-routing cooldown for a specific ride
   * Called when trip ends
   */
  clearReRouteCooldown(rideId: string): void {
    this.reRouteCooldown.delete(rideId);
    this.logger.log(`[ROUTE_COOLDOWN] Re-routing cooldown cleared for ${rideId}`);
  }

  /**
   * Clear all re-routing cooldowns
   */
  clearAllReRouteCooldowns(): void {
    const count = this.reRouteCooldown.size;
    this.reRouteCooldown.clear();
    this.logger.log(`[ROUTE_COOLDOWN] Cleared ${count} re-routing cooldowns`);
  }
}
