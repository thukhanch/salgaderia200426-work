import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import * as fs from 'fs';
import * as path from 'path';
import { WhatsappService } from './whatsapp.service';

@WebSocketGateway({
  cors: { origin: 'http://localhost:5173', credentials: true },
  namespace: '/ws',
})
export class WhatsappGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(WhatsappGateway.name);

  constructor(
    private whatsappService: WhatsappService,
  ) {}

  afterInit() {
    void this.autoReconectarSessoes();
  }

  private async autoReconectarSessoes() {
    const sessions = await this.whatsappService.getSessions();
    for (const session of sessions) {
      const credsFile = path.join(process.cwd(), '.sessions', session.id, 'creds.json');
      if (fs.existsSync(credsFile)) {
        this.logger.log(`Auto-reconectando sessao ${session.name} (${session.id})`);
        try {
          await this.whatsappService.connectSession(session.id, (event, payload) => {
            this.server.emit(`session:${event}`, payload);
          });
        } catch (error: any) {
          this.logger.error(`Falha ao auto-reconectar sessao ${session.id}: ${error?.message}`);
        }
      }
    }
  }

  handleConnection(client: Socket) {
    console.log(`Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    console.log(`Client disconnected: ${client.id}`);
  }

  @SubscribeMessage('session:connect')
  async handleConnect(
    @MessageBody() data: { sessionId: string },
    @ConnectedSocket() client: Socket,
  ) {
    await this.whatsappService.connectSession(data.sessionId, (event, payload) => {
      this.server.emit(`session:${event}`, payload);
    });
    return { status: 'connecting' };
  }

  @SubscribeMessage('session:disconnect')
  async handleDisconnect2(@MessageBody() data: { sessionId: string }) {
    await this.whatsappService.disconnectSession(data.sessionId);
    return { status: 'disconnected' };
  }

  @SubscribeMessage('message:send')
  async handleSendMessage(
    @MessageBody() data: { sessionId: string; to: string; text: string },
  ) {
    return this.whatsappService.sendMessage(data.sessionId, data.to, data.text);
  }
}
