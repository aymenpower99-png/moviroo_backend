import { Injectable, Logger } from '@nestjs/common';
import { withRetry } from '../../../../common/utils/retry.util';

export interface GeocodingResult {
  lat: number;
  lon: number;
  display_name: string;
  address?: string;
  city: string;
  country: string;
  place_type?: string;
  category?: string;
  source?: string;
}

@Injectable()
export class GeocodingNominatimService {
  private readonly logger = new Logger(GeocodingNominatimService.name);

  /**
   * Detects the primary script of a text segment.
   * Returns 'arabic', 'latin', or 'mixed'.
   */
  private detectScript(text: string): 'arabic' | 'latin' | 'mixed' | 'unknown' {
    if (!text || text.trim().length === 0) return 'unknown';
    const hasArabic = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/.test(text);
    const hasLatin = /[a-zA-Z\u00C0-\u024F]/.test(text);
    if (hasArabic && hasLatin) return 'mixed';
    if (hasArabic) return 'arabic';
    if (hasLatin) return 'latin';
    return 'unknown';
  }

  /**
   * Checks if a text segment matches the target locale script.
   */
  private matchesLocale(text: string, locale?: string): boolean {
    if (!locale) return true;
    const script = this.detectScript(text);
    if (script === 'mixed') return false;
    if (script === 'unknown') return true;
    const targetLocale = locale.toLowerCase();
    if (targetLocale === 'ar') return script === 'arabic';
    return script === 'latin';
  }

  /**
   * Clean Arabic/French administrative labels from address segments.
   */
  private cleanAdminLabel(text: string): string {
    const adminPatterns = [
      /^ولاية\s+/i,
      /^معتمدية\s+/i,
      /^Gouvernorat\s+/i,
      /^Delegation\s+/i,
      /^Délégation\s+/i,
    ];
    let result = text;
    for (const pattern of adminPatterns) {
      result = result.replace(pattern, '');
    }
    return result.trim();
  }

  /**
   * Build a clean localized display_name from structured Nominatim address components.
   *
   * Two-phase strategy:
   * 1. Try to build an address using only segments matching the target locale script.
   * 2. If that produces an empty result, fall back to the best available segments
   *    (regardless of script) with admin-label cleanup only.
   * 3. Never return empty.
   */
  private buildLocalizedDisplayName(address: Record<string, string>, locale?: string): string {
    const allValues: string[] = [];

    // Collect all non-empty address fields (most specific → least specific)
    const keys = [
      'road',
      'house_number',
      'neighbourhood',
      'suburb',
      'village',
      'town',
      'city',
      'county',
      'state',
    ];

    for (const key of keys) {
      const val = address[key];
      if (val && val.trim()) {
        allValues.push(val.trim());
      }
    }

    if (allValues.length === 0) {
      return '';
    }

    // ── Phase 1: locale-aware filtering ───────────────────────────
    const localeFiltered: string[] = [];

    // Group by normalized value to find duplicates in different scripts
    const byNormalized = new Map<string, string[]>();
    for (const val of allValues) {
      const norm = val.toLowerCase().replace(/[\s\u0600-\u06FF]+/g, '');
      if (!byNormalized.has(norm)) {
        byNormalized.set(norm, []);
      }
      byNormalized.get(norm)!.push(val);
    }

    for (const group of byNormalized.values()) {
      if (locale) {
        const matching = group.filter((v) => this.matchesLocale(v, locale));
        if (matching.length > 0) {
          localeFiltered.push(matching[0]);
          continue;
        }
      }
      localeFiltered.push(group[0]);
    }

    const cleanedLocale = this._cleanAndDeduplicate(localeFiltered);
    if (cleanedLocale.length > 0) {
      return cleanedLocale.slice(0, 3).join(', ');
    }

    // ── Phase 2: degradation fallback ─────────────────────────────
    // OSM has no Arabic name for this place; use whatever we have
    const cleanedFallback = this._cleanAndDeduplicate(allValues);
    if (cleanedFallback.length > 0) {
      return cleanedFallback.slice(0, 3).join(', ');
    }

    return '';
  }

  /**
   * Clean admin labels and deduplicate a list of address segments.
   */
  private _cleanAndDeduplicate(values: string[]): string[] {
    const cleaned: string[] = [];
    for (const val of values) {
      const cleanedVal = this.cleanAdminLabel(val);
      if (!cleanedVal || cleanedVal.length === 0) continue;
      if (!cleaned.some((c) => c.toLowerCase() === cleanedVal.toLowerCase())) {
        cleaned.push(cleanedVal);
      }
    }
    return cleaned;
  }

  /**
   * Nominatim reverse geocoding (coordinates → address)
   * Uses extratags=1 to get POI category data (tourism=hotel, aeroway=airport, etc.)
   */
  async reverse(lat: number, lon: number, options?: { lang?: string }): Promise<GeocodingResult | null> {
    try {
      const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&addressdetails=1&extratags=1`;

      const headers: Record<string, string> = {
        'User-Agent': 'Moviroo-Backend/1.0',
      };
      if (options?.lang) {
        headers['Accept-Language'] = options.lang;
      }

      const res = await withRetry(
        () => fetch(url, { headers }),
        `Nominatim reverse (${lat}, ${lon})`,
        { maxRetries: 2, initialDelayMs: 500 },
        this.logger,
      );

      const data = (await res.json()) as any;

      if (!data || data.error) {
        return null;
      }

      const address = data.address || {};
      const localizedName = this.buildLocalizedDisplayName(address, options?.lang);
      const rawDisplayName = data.display_name || data.name || '';

      // Build rich category from class + type + extratags
      const category = this._buildCategory(data.class, data.type, data.extratags);

      return {
        lat: parseFloat(data.lat),
        lon: parseFloat(data.lon),
        display_name: localizedName || rawDisplayName,
        address: localizedName || rawDisplayName,
        city: address.city || address.town || address.village || '',
        country: address.country || 'Tunisia',
        place_type: data.type || data.class || '',
        category,
        source: 'nominatim',
      };
    } catch (err) {
      this.logger.warn(`Nominatim reverse failed for (${lat}, ${lon}): ${err}`);
      return null;
    }
  }

  /**
   * Internal helper: searches Nominatim /search for a specific POI keyword
   * (e.g. "hotel", "airport") within a viewbox around the given coordinates.
   *
   * Uses extratags=1 so _buildCategory() receives full POI metadata
   * (tourism=hotel, aeroway=airport, amenity=*, etc.) needed for icon matching.
   *
   * The viewbox is sized generously for airports (~50 km radius) but we search
   * with bounded=0 so Nominatim can still return results slightly outside it
   * when the POI name contains the keyword. For hotels a tighter box (~5 km)
   * is sufficient and reduces noise.
   */
  private async _searchPois(
    lat: number,
    lon: number,
    keyword: 'hotel' | 'airport',
    options?: { lang?: string },
  ): Promise<GeocodingResult[]> {
    try {
      // Airports can be far from the user's pin; use a wider box.
      const delta = keyword === 'airport' ? 0.45 : 0.05; // ~50 km vs ~5.5 km

      const minLon = (lon - delta).toFixed(4);
      const maxLon = (lon + delta).toFixed(4);
      const minLat = (lat - delta).toFixed(4);
      const maxLat = (lat + delta).toFixed(4);

      // bounded=0 lets Nominatim return the best match even if slightly outside
      // the viewbox, which matters for large airport footprints.
      const url =
        `https://nominatim.openstreetmap.org/search` +
        `?format=json` +
        `&q=${encodeURIComponent(keyword)}` +
        `&limit=5` +
        `&addressdetails=1` +
        `&extratags=1` +
        `&countrycodes=tn` +
        `&viewbox=${minLon},${maxLat},${maxLon},${minLat}` +
        `&bounded=0`;

      const headers: Record<string, string> = {
        'User-Agent': 'Moviroo-Backend/1.0',
      };
      if (options?.lang) {
        headers['Accept-Language'] = options.lang;
      }

      const res = await withRetry(
        () => fetch(url, { headers }),
        `Nominatim POI search "${keyword}" near (${lat}, ${lon})`,
        { maxRetries: 2, initialDelayMs: 500 },
        this.logger,
      );

      const data = (await res.json()) as any;

      if (!Array.isArray(data) || data.length === 0) {
        return [];
      }

      return data
        .map((item: any): GeocodingResult | null => {
          const itemLat = parseFloat(item.lat);
          const itemLon = parseFloat(item.lon);

          if (!this.isValidCoordinate(itemLat, itemLon)) {
            return null;
          }

          const address = item.address || {};
          const localizedName = this.buildLocalizedDisplayName(address, options?.lang);
          // For POIs the OSM name itself is the most useful display label;
          // fall back to the structured address only when no name is present.
          const poiName = item.name || item.display_name || localizedName || '';
          const category = this._buildCategory(item.class, item.type, item.extratags);

          return {
            lat: itemLat,
            lon: itemLon,
            display_name: poiName,
            address: localizedName || poiName,
            city: address.city || address.town || address.village || '',
            country: address.country || 'Tunisia',
            place_type: item.type || item.class || '',
            category,
            source: 'nominatim',
          };
        })
        .filter((r): r is GeocodingResult => r !== null);
    } catch (err) {
      this.logger.warn(`Nominatim POI search "${keyword}" failed near (${lat}, ${lon}): ${err}`);
      return [];
    }
  }

  /**
   * Nominatim nearby: searches for hotels and airports near the given
   * coordinates using real Nominatim /search POI queries instead of
   * reverse geocoding.
   *
   * Both searches run in parallel. Results are merged and deduplicated by
   * rounded coordinate key. Falls back to reverse() if both POI searches
   * return nothing (e.g. truly remote location with no named POIs).
   */
  async nearby(lat: number, lon: number, options?: { lang?: string }): Promise<GeocodingResult[]> {
    try {
      const [hotelResults, airportResults] = await Promise.all([
        this._searchPois(lat, lon, 'hotel', options),
        this._searchPois(lat, lon, 'airport', options),
      ]);

      const merged = [...hotelResults, ...airportResults];

      // Deduplicate: round to 4 decimal places (~11 m precision) as a proxy
      // for OSM place_id, which Nominatim /search does not expose directly.
      const seen = new Set<string>();
      const deduped = merged.filter((r) => {
        const key = `${r.lat.toFixed(4)},${r.lon.toFixed(4)}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

      if (deduped.length > 0) {
        return deduped;
      }

      // Fallback: no hotels or airports found; return nearest geographic feature
      // so the caller always has something to work with.
      this.logger.debug(
        `Nominatim POI search returned nothing near (${lat}, ${lon}); falling back to reverse()`,
      );
      const fallback = await this.reverse(lat, lon, options);
      return fallback ? [fallback] : [];
    } catch (err) {
      this.logger.warn(`Nominatim nearby failed for (${lat}, ${lon}): ${err}`);
      return [];
    }
  }

  /**
   * Build a rich category string from Nominatim class/type/extratags.
   * Extratags contain POI metadata like tourism=hotel, aeroway=airport, amenity=restaurant.
   */
  private _buildCategory(
    className: string | undefined,
    typeName: string | undefined,
    extratags: Record<string, string> | undefined,
  ): string {
    const parts: string[] = [];

    if (className) parts.push(className);
    if (typeName) parts.push(typeName);

    if (extratags) {
      // POI-type extratags that improve icon matching
      const poiKeys = [
        'tourism',    // hotel, attraction, museum
        'aeroway',    // airport, aerodrome
        'amenity',    // restaurant, cafe, pharmacy, hospital
        'leisure',    // park, sports_centre, swimming_pool
        'shop',       // supermarket, mall, bakery
        'historic',   // monument, ruins
        'man_made',   // lighthouse, tower
        'natural',    // beach, peak, wood
        'railway',    // station, tram_stop
        'highway',    // bus_stop
        'building',   // commercial, residential
      ];

      for (const key of poiKeys) {
        const val = extratags[key];
        if (val && val.trim()) {
          parts.push(val.trim());
        }
      }

      // Also include 'name' from extratags if it helps icon matching
      const nameTag =
        extratags['name'] ||
        extratags['name:en'] ||
        extratags['name:fr'] ||
        extratags['name:ar'];
      if (nameTag) {
        parts.push(nameTag.toLowerCase());
      }
    }

    return parts.join(',');
  }

  /**
   * Nominatim autocomplete
   */
  async autocomplete(
    query: string,
    options?: { lang?: string; proximity?: { lat: number; lon: number } },
  ): Promise<GeocodingResult[]> {
    try {
      let url =
        `https://nominatim.openstreetmap.org/search` +
        `?format=json` +
        `&q=${encodeURIComponent(query)}` +
        `&limit=10` +
        `&addressdetails=1` +
        `&countrycodes=tn`;

      // Add viewbox for proximity bias when coordinates are available
      if (options?.proximity) {
        const { lat, lon } = options.proximity;
        const delta = 0.05; // ~5.5 km box
        const minLat = (lat - delta).toFixed(4);
        const maxLat = (lat + delta).toFixed(4);
        const minLon = (lon - delta).toFixed(4);
        const maxLon = (lon + delta).toFixed(4);
        url += `&viewbox=${minLon},${maxLat},${maxLon},${minLat}&bounded=1`;
      }

      const headers: Record<string, string> = {
        'User-Agent': 'Moviroo-Backend/1.0',
      };
      if (options?.lang) {
        headers['Accept-Language'] = options.lang;
      }

      const res = await withRetry(
        () => fetch(url, { headers }),
        `Nominatim autocomplete "${query}"`,
        { maxRetries: 2, initialDelayMs: 500 },
        this.logger,
      );

      const data = (await res.json()) as any;

      if (!data || data.length === 0) {
        return [];
      }

      return data
        .map((item: any) => {
          const lat = parseFloat(item.lat);
          const lon = parseFloat(item.lon);
          // Reject invalid coordinates from Nominatim
          if (!this.isValidCoordinate(lat, lon)) {
            return null;
          }
          const address = item.address || {};
          const localizedName = this.buildLocalizedDisplayName(address, options?.lang);
          const rawDisplayName = item.display_name || item.name || '';
          const category = this._buildCategory(item.class, item.type, item.extratags);
          return {
            lat,
            lon,
            display_name: localizedName || rawDisplayName,
            address: localizedName || rawDisplayName,
            city: address.city || address.town || address.village || '',
            country: address.country || 'Tunisia',
            place_type: item.type || item.class || '',
            category,
            source: 'nominatim',
          };
        })
        .filter(
          (r: GeocodingResult | null): r is GeocodingResult => r !== null,
        );
    } catch (err) {
      this.logger.warn(`Nominatim autocomplete failed for "${query}": ${err}`);
      return [];
    }
  }

  /**
   * Validate coordinates: not (0,0), not NaN, in valid range
   */
  private isValidCoordinate(lat: number, lon: number): boolean {
    if (lat === null || lat === undefined || lon === null || lon === undefined)
      return false;
    if (isNaN(lat) || isNaN(lon)) return false;
    if (lat === 0 && lon === 0) return false; // Reject (0,0) - usually a fallback
    if (lat < -90 || lat > 90) return false;
    if (lon < -180 || lon > 180) return false;
    return true;
  }
}