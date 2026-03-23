import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { ExecutionEvent } from '@agentic/shared';

@WebSocketGateway({
  cors: {
    origin: process.env.WEB_ORIGIN ?? 'http://localhost:3000',
    credentials: true,
  },
  namespace: '/execution',
})
export class ExecutionGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(ExecutionGateway.name);

  @WebSocketServer()
  server!: Server;

  handleConnection(client: Socket) {
    this.logger.debug(`Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    this.logger.debug(`Client disconnected: ${client.id}`);
  }

  /**
   * Clients subscribe to a specific run's updates by joining a room.
   */
  @SubscribeMessage('subscribe:run')
  handleSubscribeRun(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { runId: string },
  ) {
    if (data?.runId) {
      client.join(`run:${data.runId}`);
      this.logger.debug(`Client ${client.id} subscribed to run ${data.runId}`);
      return { status: 'subscribed', runId: data.runId };
    }
    return { status: 'error', message: 'runId required' };
  }

  /**
   * Clients unsubscribe from a run's updates.
   */
  @SubscribeMessage('unsubscribe:run')
  handleUnsubscribeRun(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { runId: string },
  ) {
    if (data?.runId) {
      client.leave(`run:${data.runId}`);
      this.logger.debug(`Client ${client.id} unsubscribed from run ${data.runId}`);
      return { status: 'unsubscribed', runId: data.runId };
    }
    return { status: 'error', message: 'runId required' };
  }

  /**
   * Emit an event to all clients watching a specific run.
   */
  emitToRun(runId: string, event: ExecutionEvent, payload: Record<string, unknown>) {
    this.server.to(`run:${runId}`).emit(event, payload);
  }

  /**
   * Broadcast an event to all connected clients.
   */
  broadcast(event: ExecutionEvent, payload: Record<string, unknown>) {
    this.server.emit(event, payload);
  }
}
