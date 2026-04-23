import { Injectable, Logger } from '@nestjs/common';
import { PricingService, PricingRequest, PricingResult } from '../../infrastructure/services/pricing.service';
import { ClassesService } from '../../../classes/classes.service';
import { GetVehiclePricesDto, GetVehiclePricesResponse, VehicleClassPrice } from '../dtos/get-vehicle-prices.dto';

@Injectable()
export class GetVehiclePricesUseCase {
  private readonly logger = new Logger(GetVehiclePricesUseCase.name);

  constructor(
    private readonly pricingService: PricingService,
    private readonly classesService: ClassesService,
  ) {}

  async execute(dto: GetVehiclePricesDto): Promise<GetVehiclePricesResponse> {
    // Get all active vehicle classes from database
    const vehicleClasses = await this.classesService.findAll();

    this.logger.log(
      `Calculating prices for ${vehicleClasses.length} vehicle classes`,
    );

    // Create pricing requests for all vehicle classes
    const pricingPromises = vehicleClasses.map(async (vehicleClass) => {
      try {
        const request: PricingRequest = {
          pickupLat: dto.pickupLat,
          pickupLon: dto.pickupLon,
          dropoffLat: dto.dropoffLat,
          dropoffLon: dto.dropoffLon,
          carType: vehicleClass.name,
          bookingDt: dto.bookingDt,
        };

        const pricingResult = await this.pricingService.estimate(request);

        // Map to response format
        const vehicleClassPrice: VehicleClassPrice = {
          id: vehicleClass.id,
          name: vehicleClass.name,
          imageUrl: vehicleClass.imageUrl,
          seats: vehicleClass.seats,
          bags: vehicleClass.bags,
          priceTnd: pricingResult.finalPrice,
          exactPrice: pricingResult.exactPrice,
          distanceKm: pricingResult.distanceKm,
          durationMin: pricingResult.durationMin,
          surgeMultiplier: pricingResult.surgeMultiplier,
          loyaltyPoints: pricingResult.loyaltyPoints,
        };

        return vehicleClassPrice;
      } catch (error) {
        // Log error but don't fail the entire request
        this.logger.error(
          `Failed to calculate price for vehicle class ${vehicleClass.name}: ${error.message}`,
        );

        // Return a fallback price using business rules
        const fallbackPrice = this.getFallbackPrice(
          dto.pickupLat,
          dto.pickupLon,
          dto.dropoffLat,
          dto.dropoffLon,
        );

        const vehicleClassPrice: VehicleClassPrice = {
          id: vehicleClass.id,
          name: vehicleClass.name,
          imageUrl: vehicleClass.imageUrl,
          seats: vehicleClass.seats,
          bags: vehicleClass.bags,
          priceTnd: fallbackPrice.finalPrice,
          exactPrice: fallbackPrice.exactPrice,
          distanceKm: fallbackPrice.distanceKm,
          durationMin: fallbackPrice.durationMin,
          surgeMultiplier: fallbackPrice.surgeMultiplier,
          loyaltyPoints: fallbackPrice.loyaltyPoints,
        };

        return vehicleClassPrice;
      }
    });

    // Execute all pricing calls in parallel
    const vehicleClassesWithPrices = await Promise.all(pricingPromises);

    this.logger.log(
      `Successfully calculated prices for ${vehicleClassesWithPrices.length} vehicle classes`,
    );

    return {
      vehicleClasses: vehicleClassesWithPrices,
      pickupLat: dto.pickupLat,
      pickupLon: dto.pickupLon,
      dropoffLat: dto.dropoffLat,
      dropoffLon: dto.dropoffLon,
    };
  }

  /**
   * Fallback to business rules if ML API fails
   * This duplicates the logic from PricingService.fallback() for error recovery
   */
  private getFallbackPrice(
    pickupLat: number,
    pickupLon: number,
    dropoffLat: number,
    dropoffLon: number,
  ): PricingResult {
    const BASE_FARE = 3.5;
    const RATE_PER_KM = 0.65;
    const RATE_PER_MIN = 0.3;
    const MIN_FARE = 4.0;
    const AVG_SPEED_KMH = 40;

    // Calculate distance and duration using Haversine formula
    const toRad = (deg: number) => (deg * Math.PI) / 180;
    const EARTH_RADIUS_KM = 6371;

    const dLat = toRad(dropoffLat - pickupLat);
    const dLon = toRad(dropoffLon - pickupLon);
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(pickupLat)) *
        Math.cos(toRad(dropoffLat)) *
        Math.sin(dLon / 2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    const distanceKm = +(EARTH_RADIUS_KM * c).toFixed(2);
    const durationMin = +((distanceKm / AVG_SPEED_KMH) * 60).toFixed(1);

    const raw =
      BASE_FARE + distanceKm * RATE_PER_KM + durationMin * RATE_PER_MIN;

    const exactPrice = Math.max(MIN_FARE, +raw.toFixed(2));
    const finalPrice = Math.ceil(exactPrice / 5) * 5;
    const loyaltyPoints = Math.ceil((finalPrice * 0.5) / 5) * 5;

    return {
      finalPrice,
      exactPrice,
      loyaltyPoints,
      surgeMultiplier: 1.0,
      distanceKm,
      durationMin: Math.ceil(durationMin),
      fullResponse: {
        fallback: true,
        base_fare: BASE_FARE,
        distance_cost: +(distanceKm * RATE_PER_KM).toFixed(2),
        duration_cost: +(durationMin * RATE_PER_MIN).toFixed(2),
      },
    };
  }
}
