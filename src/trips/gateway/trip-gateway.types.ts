export interface GpsPayload {
  ride_id: string;
  latitude: number;
  longitude: number;
  speed_kmh?: number;
  recorded_at?: string;
}
