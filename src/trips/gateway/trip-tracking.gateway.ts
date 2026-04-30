import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Logger, Inject } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Server, Socket } from 'socket.io';

import { TripWaypoint } from '../domain/entities/trip-waypoint.entity';
import { DriverLocation } from '../../dispatch/domain/entities/driver-location.entity';
import { Ride } from '../../rides/domain/entities/ride.entity';
import { RoutingService } from '../../rides/infrastructure/services/routing.service';

interface GpsPayload {
  ride_id: string;
  latitude: number;
  longitude: number;
  speed_kmh?: number;
  recorded_at?: string;
}

@WebSocketGateway({
  cors: { origin: '*' },
})
export class TripTrackingGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(TripTrackingGateway.name);

  /* In-memory GPS buffer: rideId → waypoints[] */
  private gpsBuffer = new Map<string, Partial<TripWaypoint>[]>();

  /* Sequence counter per ride */
  private sequenceCounters = new Map<string, number>();

  /* Progress cache: rideId → { data, timestamp } for throttling */
  private progressCache = new Map<string, { data: any; timestamp: number }>();

  private static readonly FLUSH_THRESHOLD = 5;
  private static readonly PROGRESS_CACHE_TTL = 5000; // 5 seconds

  constructor(
    @InjectRepository(TripWaypoint)
    private readonly waypointRepo: Repository<TripWaypoint>,
    @InjectRepository(DriverLocation)
    private readonly locRepo: Repository<DriverLocation>,
    @InjectRepository(Ride)
    private readonly rideRepo: Repository<Ride>,
    private readonly routingService: RoutingService,
  ) {}

  /* ── Connection lifecycle ──── */

  handleConnection(client: Socket) {
    this.logger.log(`Client connected: ${client.id}`);
    this.logger.log(`Client handshake: ${JSON.stringify(client.handshake)}`);
    this.logger.log(`Client rooms on connect: ${Array.from(client.rooms)}`);
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);
    this.logger.log(`Client rooms on disconnect: ${Array.from(client.rooms)}`);
  }

  /* ── Join ride room (both driver & passenger call this) ──── */
  @SubscribeMessage('join')
  handleJoinRoom(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { ride_id: string },
  ) {
    this.logger.log(
      `Join room request from client ${client.id}: ${JSON.stringify(data)}`,
    );
    if (!data?.ride_id) {
      this.logger.warn(`Join room failed: missing ride_id`);
      return;
    }
    client.join(`ride:${data.ride_id}`);
    this.logger.log(`${client.id} joined room ride:${data.ride_id}`);
    this.logger.log(`Client rooms after join: ${Array.from(client.rooms)}`);
    return { event: 'joined', data: { ride_id: data.ride_id } };
  }

  /* ── Leave ride room ──── */
  @SubscribeMessage('leave')
  handleLeaveRoom(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { ride_id: string },
  ) {
    if (!data?.ride_id) return;
    client.leave(`ride:${data.ride_id}`);
    return { event: 'left', data: { ride_id: data.ride_id } };
  }

  /* ── Driver streams GPS every 5s ──── */
  @SubscribeMessage('trip:gps')
  async handleGps(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: GpsPayload,
  ) {
    this.logger.log(
      `GPS received from client ${client.id}: ride_id=${payload.ride_id}, lat=${payload.latitude}, lng=${payload.longitude}`,
    );

    if (
      !payload?.ride_id ||
      payload.latitude == null ||
      payload.longitude == null
    ) {
      this.logger.warn(`Invalid GPS payload: ${JSON.stringify(payload)}`);
      return { event: 'error', data: { message: 'Invalid GPS payload' } };
    }

    const rideId = payload.ride_id;
    const seq = (this.sequenceCounters.get(rideId) ?? 0) + 1;
    this.sequenceCounters.set(rideId, seq);

    /* Buffer the waypoint */
    const buffer = this.gpsBuffer.get(rideId) ?? [];
    buffer.push({
      rideId,
      latitude: payload.latitude,
      longitude: payload.longitude,
      speedKmh: payload.speed_kmh ?? 0,
      recordedAt: payload.recorded_at
        ? new Date(payload.recorded_at)
        : new Date(),
      sequence: seq,
    });
    this.gpsBuffer.set(rideId, buffer);

    /* Bulk INSERT when buffer reaches threshold */
    if (buffer.length >= TripTrackingGateway.FLUSH_THRESHOLD) {
      await this.flushBuffer(rideId);
    }

    /* Calculate progress with throttling */
    const cachedProgress = this.progressCache.get(rideId);
    const now = Date.now();

    let progressData: any = null;

    // Use cached progress if within TTL, otherwise calculate new
    if (
      cachedProgress &&
      now - cachedProgress.timestamp < TripTrackingGateway.PROGRESS_CACHE_TTL
    ) {
      progressData = cachedProgress.data;
      this.logger.log(`[PROGRESS] Using cached progress for ride ${rideId}`);
    } else {
      // Calculate new progress
      try {
        const ride = await this.rideRepo.findOne({ where: { id: rideId } });
        if (ride) {
          const targetLat =
            ride.status === 'IN_TRIP' ? ride.dropoffLat : ride.pickupLat;
          const targetLon =
            ride.status === 'IN_TRIP' ? ride.dropoffLon : ride.pickupLon;
          const totalDistanceMeters = ride.distanceKm
            ? ride.distanceKm * 1000
            : 0;

          if (totalDistanceMeters > 0) {
            progressData = await this.routingService.calculateProgressForRide(
              payload.latitude,
              payload.longitude,
              targetLat,
              targetLon,
              totalDistanceMeters,
              payload.speed_kmh ?? 0,
            );

            // Cache the result
            if (progressData) {
              this.progressCache.set(rideId, {
                data: progressData,
                timestamp: now,
              });
            }
          }
        }
      } catch (err) {
        this.logger.error(`[PROGRESS] Failed to calculate progress: ${err}`);
      }
    }

    /* Update driver_locations in real-time */
    /* We don't know the driver_id from the socket, so update by ride → driver_id relation */
    try {
      await this.locRepo
        .createQueryBuilder()
        .update(DriverLocation)
        .set({
          latitude: payload.latitude,
          longitude: payload.longitude,
          speedKmh: payload.speed_kmh ?? 0,
          lastSeenAt: new Date(),
          progress: progressData?.progress ?? null,
        })
        .where(
          `driver_id IN (SELECT driver_id FROM rides WHERE id = :rideId)`,
          { rideId },
        )
        .execute();
    } catch (err) {
      this.logger.error(`Failed to update driver location: ${err}`);
    }

    /* Broadcast to the ride room */
    const locationData: any = {
      latitude: payload.latitude,
      longitude: payload.longitude,
      speed_kmh: payload.speed_kmh ?? 0,
      sequence: seq,
    };

    // Add progress data to broadcast if available
    if (progressData) {
      locationData.progress = progressData.progress;
      locationData.remainingDistanceMeters =
        progressData.remainingDistanceMeters;
      locationData.remainingDurationSeconds =
        progressData.remainingDurationSeconds;
      locationData.etaMins = progressData.etaMins;
      locationData.totalDistanceMeters = progressData.totalDistanceMeters;
    }

    this.logger.log(
      `Broadcasting trip:location_update to room ride:${rideId}: ${JSON.stringify(locationData)}`,
    );
    this.server.to(`ride:${rideId}`).emit('trip:location_update', locationData);

    return { event: 'ack', data: { sequence: seq } };
  }

  /* ── Flush buffer to DB ──── */
  async flushBuffer(rideId: string): Promise<void> {
    const buffer = this.gpsBuffer.get(rideId);
    if (!buffer || buffer.length === 0) return;

    try {
      await this.waypointRepo
        .createQueryBuilder()
        .insert()
        .into(TripWaypoint)
        .values(buffer as any)
        .execute();

      this.logger.debug(
        `Flushed ${buffer.length} waypoints for ride ${rideId}`,
      );
    } catch (err) {
      this.logger.error(`Failed to flush waypoints: ${err}`);
    }

    this.gpsBuffer.set(rideId, []);
  }

  /* ── Flush all remaining buffers (called by use-cases on trip end) ──── */
  async flushAll(rideId: string): Promise<void> {
    await this.flushBuffer(rideId);
    this.gpsBuffer.delete(rideId);
    this.sequenceCounters.delete(rideId);
    this.progressCache.delete(rideId); // Clear progress cache
  }

  /* ── Broadcast helpers used by controller/use-cases ──── */

  emitToRide(rideId: string, event: string, data: any): void {
    this.server.to(`ride:${rideId}`).emit(event, data);
  }
}
