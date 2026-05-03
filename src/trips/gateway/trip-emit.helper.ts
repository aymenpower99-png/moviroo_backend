import { Server } from 'socket.io';

/**
 * Broadcast helper to emit events to a specific ride room
 */
export function emitToRide(
  server: Server,
  rideId: string,
  event: string,
  data: any,
): void {
  server.to(`ride:${rideId}`).emit(event, data);
}
