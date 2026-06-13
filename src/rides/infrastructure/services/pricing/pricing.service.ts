import { Injectable, Logger, Inject } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';
import {
  PricingMlService,
  PricingRequest,
  PricingResult,
  BatchPricingRequest,
  BatchPricingResult,
  BatchPricingItem,
} from './pricing-ml.service';
import { PricingFallbackService } from './pricing-fallback.service';
import { ClassesService } from '../../../../classes/classes.service';

// Re-export types for backward compatibility
export type {
  PricingRequest,
  PricingResult,
  BatchPricingRequest,
  BatchPricingResult,
  BatchPricingItem,
};

/**
 * Main Pricing Service Facade
 * This service aggregates all pricing-related services for backward compatibility
 */
@Injectable()
export class PricingService {
  private readonly logger = new Logger(PricingService.name);

  constructor(
    private readonly pricingMl: PricingMlService,
    private readonly pricingFallback: PricingFallbackService,
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
    private readonly classesService: ClassesService,
  ) {}

  /**
   * Call ML API; fall back to business rules if unavailable - CACHED
   */
  async estimate(req: PricingRequest): Promise<PricingResult> {
    const startTime = Date.now();
    this.logger.log(
      `[PRICING] Estimate request: ${req.carType} from (${req.pickupLat}, ${req.pickupLon}) to (${req.dropoffLat}, ${req.dropoffLon})`,
    );

    // Validate coordinates BEFORE any caching or ML call
    this.validateCoordinates(
      req.pickupLat,
      req.pickupLon,
      req.dropoffLat,
      req.dropoffLon,
    );

    // Check cache first (shorter TTL for pricing since it can change)
    const cacheKey = `pricing:${req.pickupLat.toFixed(6)}:${req.pickupLon.toFixed(6)}:${req.dropoffLat.toFixed(6)}:${req.dropoffLon.toFixed(6)}:${req.carType}:${req.bookingDt ?? 'now'}`;
    const cached = await this.cacheManager.get<PricingResult>(cacheKey);
    if (cached) {
      const duration = Date.now() - startTime;
      this.logger.log(
        `[PRICING] Cache HIT for pricing: ${req.carType} - ${duration}ms - ${cached.finalPrice} TND`,
      );
      return cached;
    }

    try {
      const apiStart = Date.now();
      const result = await this.pricingMl.callMlApi(req);
      const apiDuration = Date.now() - apiStart;
      const totalDuration = Date.now() - startTime;

      await this.cacheManager.set(cacheKey, result, 180); // 3 minutes
      this.logger.log(
        `[PRICING] ML API success: ${req.carType} - ${totalDuration}ms (API: ${apiDuration}ms) - ${result.finalPrice} TND (surge: ${result.surgeMultiplier})`,
      );
      return result;
    } catch (err) {
      const fallbackStart = Date.now();
      this.logger.warn(
        `[PRICING] ML API unavailable, using fallback pricing: ${err}`,
      );
      const fallbackResult = await this.pricingFallback.fallback(req);
      const fallbackDuration = Date.now() - fallbackStart;
      const totalDuration = Date.now() - startTime;

      await this.cacheManager.set(cacheKey, fallbackResult, 60); // 1 minute for fallback
      this.logger.log(
        `[PRICING] Fallback used: ${req.carType} - ${totalDuration}ms (Fallback: ${fallbackDuration}ms) - ${fallbackResult.finalPrice} TND`,
      );
      return fallbackResult;
    }
  }

  /**
   * Batch pricing: ONE HTTP call to ML API /price/batch for all car types.
   * Used by the passenger flow to fetch prices of every vehicle class at once.
   * Falls back to business rules per car type if ML API is unavailable.
   * CACHED
   */
  async batchEstimate(req: BatchPricingRequest): Promise<BatchPricingResult> {
    const startTime = Date.now();
    this.logger.log(
      `[PRICING] Batch estimate request: ${req.carTypes.join(', ')} from (${req.pickupLat}, ${req.pickupLon}) to (${req.dropoffLat}, ${req.dropoffLon})`,
    );

    // Validate coordinates BEFORE any caching or ML call
    this.validateCoordinates(
      req.pickupLat,
      req.pickupLon,
      req.dropoffLat,
      req.dropoffLon,
    );

    // Check cache first
    const carTypesKey = req.carTypes.sort().join(',');
    const cacheKey = `batch_pricing:${req.pickupLat.toFixed(6)}:${req.pickupLon.toFixed(6)}:${req.dropoffLat.toFixed(6)}:${req.dropoffLon.toFixed(6)}:${carTypesKey}:${req.bookingDt ?? 'now'}`;
    const cached = await this.cacheManager.get<BatchPricingResult>(cacheKey);
    if (cached) {
      const duration = Date.now() - startTime;
      this.logger.log(
        `[PRICING] Cache HIT for batch pricing: ${req.carTypes.join(', ')} - ${duration}ms - ${cached.items.length} results`,
      );
      return cached;
    }

    try {
      const apiStart = Date.now();
      const result = await this.pricingMl.callMlApiBatch(req);
      const apiDuration = Date.now() - apiStart;
      const totalDuration = Date.now() - startTime;

      await this.cacheManager.set(cacheKey, result, 180); // 3 minutes
      this.logger.log(
        `[PRICING] ML API batch success: ${req.carTypes.join(', ')} - ${totalDuration}ms (API: ${apiDuration}ms) - ${result.distanceKm.toFixed(1)}km, ${result.durationMin}min`,
      );
      return result;
    } catch (err) {
      const fallbackStart = Date.now();
      // ── FALLBACK TRIGGERED ──────────────────────────────────────────────
      this.logger.warn(
        `[PRICING] *** FALLBACK TRIGGERED *** ML error type=${(err as any)?.constructor?.name} msg="${(err as any)?.message}" — switching to rule-based fallback`,
      );
      let fallbackResult: BatchPricingResult;
      try {
        fallbackResult = await this.pricingFallback.batchFallback(req);
      } catch (fallbackErr) {
        this.logger.error(
          `[PRICING] batchFallback itself threw: ${fallbackErr}`,
        );
        throw fallbackErr;
      }
      const fallbackDuration = Date.now() - fallbackStart;
      const totalDuration = Date.now() - startTime;

      await this.cacheManager.set(cacheKey, fallbackResult, 60);
      this.logger.log(
        `[PRICING] Fallback complete: ${req.carTypes.join(', ')} - ${totalDuration}ms total (Fallback: ${fallbackDuration}ms) - ${fallbackResult.items.length} items`,
      );
      return fallbackResult;
    }
  }

  /**
   * Get pricing for ALL active car classes from database.
   * Fetches car classes dynamically from DB and calls batch pricing.
   * Used by passenger flow to show all available options.
   */
  async estimateAllActiveClasses(
    pickupLat: number,
    pickupLon: number,
    dropoffLat: number,
    dropoffLon: number,
    bookingDt?: string,
  ): Promise<BatchPricingResult> {
    this.logger.log(
      `[PRICING] Estimate all active classes from (${pickupLat}, ${pickupLon}) to (${dropoffLat}, ${dropoffLon})`,
    );

    // Fetch all active car classes with multipliers from database
    const classes = await this.classesService.getActiveClassesWithMultipliers();

    if (classes.length === 0) {
      this.logger.warn('[PRICING] No active car classes found in database');
      throw new Error('No active car classes available');
    }

    const carTypes = classes.map((c) => normalizeCarType(c.name));
    const carMultipliers: Record<string, number> = {};
    for (const cls of classes) {
      carMultipliers[normalizeCarType(cls.name)] = cls.multiplier;
    }
    this.logger.log(
      `[PRICING] Found ${classes.length} active classes: ${carTypes.join(', ')}`,
    );

    // Call batch pricing with all active car types + their DB multipliers
    return await this.batchEstimate({
      pickupLat,
      pickupLon,
      dropoffLat,
      dropoffLon,
      carTypes,
      carMultipliers,
      bookingDt,
    });
  }

  /**
   * Validate that coordinates are valid before sending to ML / OSRM.
   * Throws BadRequestException with explicit message if invalid.
   * Rules:
   *   - Must be defined and finite
   *   - Cannot be (0,0) — typical fallback for missing data
   *   - Must be in geographic bounds (-90..90, -180..180)
   *   - Pickup and dropoff cannot be identical (zero-distance trip)
   */
  private validateCoordinates(
    pickupLat: number,
    pickupLon: number,
    dropoffLat: number,
    dropoffLon: number,
  ): void {
    const isInvalid = (lat: number, lon: number) =>
      lat === undefined ||
      lat === null ||
      lon === undefined ||
      lon === null ||
      !Number.isFinite(lat) ||
      !Number.isFinite(lon) ||
      (lat === 0 && lon === 0) ||
      lat < -90 ||
      lat > 90 ||
      lon < -180 ||
      lon > 180;

    if (isInvalid(pickupLat, pickupLon)) {
      this.logger.error(
        `[PRICING] Invalid pickup coordinates: (${pickupLat}, ${pickupLon})`,
      );
      throw new Error(
        `Invalid pickup coordinates (${pickupLat}, ${pickupLon}). Must be valid lat/lon, not (0,0).`,
      );
    }

    if (isInvalid(dropoffLat, dropoffLon)) {
      this.logger.error(
        `[PRICING] Invalid dropoff coordinates: (${dropoffLat}, ${dropoffLon})`,
      );
      throw new Error(
        `Invalid dropoff coordinates (${dropoffLat}, ${dropoffLon}). Must be valid lat/lon, not (0,0).`,
      );
    }

    if (pickupLat === dropoffLat && pickupLon === dropoffLon) {
      this.logger.error(
        `[PRICING] Pickup and dropoff are identical: (${pickupLat}, ${pickupLon})`,
      );
      throw new Error('Pickup and dropoff coordinates cannot be identical.');
    }
  }
}

/** Normalize a DB class name ("First Class", "Economy") to ML API key. */
function normalizeCarType(raw: string): string {
  const s = String(raw)
    .toLowerCase()
    .trim()
    .replace(/[\s-]+/g, '_');
  const aliases: Record<string, string> = {
    firstclass: 'first_class',
    first: 'first_class',
    premium: 'first_class',
    minibus: 'mini_bus',
  };
  return aliases[s] ?? s;
}
