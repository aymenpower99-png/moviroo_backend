import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Server, Socket } from 'socket.io';

import { TripWaypoint } from '../domain/entities/trip-waypoint.entity';
import { DriverLocation } from '../../dispatch/domain/entities/driver-location.entity';
import { Ride } from '../../rides/domain/entities/ride.entity';
import { RoutingService } from '../../rides/infrastructure/services/routing/routing.service';
import { RouteHistoryRepository } from '../../rides/infrastructure/repositories/route-history.repository';
import { RouteSnappingService } from '../../rides/infrastructure/services/route-snapping.service';
import { TripLocationHandler } from './trip-location.handler';
import { TripBufferHandler } from './trip-buffer.handler';
import { TripReroutingHandler } from './trip-rerouting.handler';
import { emitToRide } from './trip-emit.helper';
import type { GpsPayload } from './trip-gateway.types';

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

  /* Handler instances */
  private readonly locationHandler: TripLocationHandler;
  private readonly bufferHandler: TripBufferHandler;
  private readonly reroutingHandler: TripReroutingHandler;

  constructor(
    @InjectRepository(TripWaypoint)
    private readonly waypointRepo: Repository<TripWaypoint>,
    @InjectRepository(DriverLocation)
    private readonly locRepo: Repository<DriverLocation>,
    @InjectRepository(Ride)
    private readonly rideRepo: Repository<Ride>,
    private readonly routingService: RoutingService,
    private readonly routeHistoryRepo: RouteHistoryRepository,
    private readonly routeSnappingService: RouteSnappingService,
  ) {
    // Initialize handlers
    this.reroutingHandler = new TripReroutingHandler(
      routeSnappingService,
      routingService,
      routeHistoryRepo,
      this.progressCache,
      this.server,
    );

    this.bufferHandler = new TripBufferHandler(
      waypointRepo,
      this.gpsBuffer,
      this.sequenceCounters,
      this.progressCache,
    );

    this.locationHandler = new TripLocationHandler(
      rideRepo,
      locRepo,
      routingService,
      routeHistoryRepo,
      this.reroutingHandler,
      this.bufferHandler,
      this.gpsBuffer,
      this.sequenceCounters,
      this.progressCache,
      this.server,
    );
  }

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
    return this.locationHandler.handleGps(client, payload);
  }

  /* ── Broadcast helpers used by controller/use-cases ──── */

  emitToRide(rideId: string, event: string, data: any): void {
    emitToRide(this.server, rideId, event, data);
  }

  /* ── Flush buffer to DB (delegated to buffer handler) ──── */
  async flushBuffer(rideId: string): Promise<void> {
    return this.bufferHandler.flushBuffer(rideId);
  }

  /* ── Flush all remaining buffers (delegated to buffer handler) ──── */
  async flushAll(rideId: string): Promise<void> {
    return this.bufferHandler.flushAll(rideId);
  }
}
