import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { AxiosResponse } from 'axios';

export interface GooglePlaceResult {
  place_id: string;
  description: string;
  structured_formatting: {
    main_text: string;
    secondary_text: string;
  };
  terms: Array<{
    offset: number;
    value: string;
  }>;
  types: string[];
}

export interface GooglePlaceDetails {
  place_id: string;
  name: string;
  formatted_address: string;
  geometry: {
    location: {
      lat: number;
      lng: number;
    };
  };
  types: string[];
}

/**
 * Google Places Autocomplete Service
 * Limited to Tunisia only
 */
@Injectable()
export class GeocodingGoogleService {
  private readonly logger = new Logger(GeocodingGoogleService.name);
  private readonly apiKey = 'AIzaSyCUephPaam6p7j6LQDQyvOWuuBcwoBbG5k';
  private readonly baseUrl = 'https://maps.googleapis.com/maps/api/place';

  // Tunisia bounds for filtering
  private readonly tunisiaBounds = {
    northeast: { lat: 37.5, lng: 11.5 },
    southwest: { lat: 32.0, lng: 7.5 },
  };

  constructor(private readonly httpService: HttpService) {}

  /**
   * Autocomplete search using Google Places API
   * Limited to Tunisia
   */
  async autocomplete(
    query: string,
    options?: { lang?: string },
  ): Promise<GooglePlaceResult[]> {
    if (!query || query.trim().length < 2) {
      this.logger.warn(`[GOOGLE] Query too short: "${query}"`);
      return [];
    }

    try {
      const params: any = {
        input: query,
        key: this.apiKey,
        components: 'country:tn', // Restrict to Tunisia
        fields: 'place_id,description,structured_formatting,terms,types',
      };

      if (options?.lang) {
        params.language = options.lang;
      }

      const url = `${this.baseUrl}/autocomplete/json`;
      const response: AxiosResponse<any> = await firstValueFrom(
        this.httpService.get(url, { params }),
      );

      if (response.data.status === 'OK' && response.data.predictions) {
        this.logger.log(
          `[GOOGLE] Autocomplete success for "${query}": ${response.data.predictions.length} results`,
        );
        return response.data.predictions;
      } else {
        this.logger.warn(
          `[GOOGLE] Autocomplete failed for "${query}": ${response.data.status}`,
        );
        return [];
      }
    } catch (error) {
      this.logger.error(
        `[GOOGLE] Autocomplete error for "${query}": ${error.message}`,
      );
      return [];
    }
  }

  /**
   * Get place details by place_id
   */
  async getPlaceDetails(
    placeId: string,
  ): Promise<GooglePlaceDetails | undefined> {
    if (!placeId) {
      this.logger.warn('[GOOGLE] No place_id provided');
      return undefined;
    }

    try {
      const params = {
        place_id: placeId,
        key: this.apiKey,
        fields: 'place_id,name,formatted_address,geometry,types',
      };

      const url = `${this.baseUrl}/details/json`;
      const response: AxiosResponse<any> = await firstValueFrom(
        this.httpService.get(url, { params }),
      );

      if (response.data.status === 'OK' && response.data.result) {
        this.logger.log(`[GOOGLE] Place details success for ${placeId}`);
        return response.data.result;
      } else {
        this.logger.warn(
          `[GOOGLE] Place details failed for ${placeId}: ${response.data.status}`,
        );
        return undefined;
      }
    } catch (error) {
      this.logger.error(
        `[GOOGLE] Place details error for ${placeId}: ${error.message}`,
      );
      return undefined;
    }
  }

  /**
   * Convert Google Place result to GeocodingResult format (compatible with existing frontend)
   */
  convertToGeocodingResult(
    googleResult: GooglePlaceResult,
    details?: GooglePlaceDetails,
  ) {
    const lat = details?.geometry?.location?.lat || 0;
    const lon = details?.geometry?.location?.lng || 0;

    return {
      lat,
      lon,
      display_name: googleResult.description,
      address:
        googleResult.structured_formatting?.main_text ||
        googleResult.description,
      city: this.extractCity(googleResult),
      country: 'Tunisia',
      place_type: this.mapGoogleTypesToPlaceType(googleResult.types),
      place_id: googleResult.place_id,
      source: 'google',
    };
  }

  /**
   * Extract city from Google Place terms
   */
  private extractCity(googleResult: GooglePlaceResult): string {
    // Try to find city in terms (usually the second-to-last term)
    if (googleResult.terms && googleResult.terms.length >= 2) {
      const cityTerm = googleResult.terms[googleResult.terms.length - 2];
      return cityTerm.value;
    }
    return 'Unknown';
  }

  /**
   * Map Google types to our place_type format
   */
  private mapGoogleTypesToPlaceType(googleTypes: string[]): string {
    if (!googleTypes || googleTypes.length === 0) return 'place';

    const typeMap: Record<string, string> = {
      establishment: 'poi',
      point_of_interest: 'poi',
      restaurant: 'poi',
      hotel: 'poi',
      airport: 'poi',
      transit_station: 'poi',
      street_address: 'address',
      route: 'address',
      locality: 'locality',
      neighborhood: 'neighborhood',
      sublocality: 'neighborhood',
      administrative_area_level_1: 'place',
      administrative_area_level_2: 'place',
      country: 'place',
    };

    // Find the first matching type
    for (const googleType of googleTypes) {
      if (typeMap[googleType]) {
        return typeMap[googleType];
      }
    }

    return 'place';
  }
}
