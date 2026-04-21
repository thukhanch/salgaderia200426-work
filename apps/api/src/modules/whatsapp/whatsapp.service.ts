import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import type { proto } from '@whiskeysockets/baileys';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import makeWASocket, {
  Browsers,
  DisconnectReason,
  fetchLatestWaWebVersion,
  useMultiFileAuthState,
  WASocket,
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import * as QRCode from 'qrcode';
import * as path from 'path';
import * as fs from 'fs';
import { WhatsappSession, SessionStatus } from './entities/whatsapp-session.entity';

@Injectable()
export class WhatsappService implements OnModuleDestroy {
  private readonly logger = new Logger(WhatsappService.name);
  private sockets = new Map<string, WASocket>();
  private eventEmitters = new Map<string, ((event: string, data: any) => void)[]>();
  private messageListeners = new Map<string, Set<(message: proto.IWebMessageInfo) => void>>();
  /** Sessions being intentionally disconnected — skip auto-reconnect */
  private disconnectingSessions = new Set<string>();

  constructor(
    @InjectRepository(WhatsappSession)
    private sessionRepo: Repository<WhatsappSession>,
  ) {}

  async getSessions() {
    return this.sessionRepo.find();
  }

  async getSession(id: string) {
    return this.sessionRepo.findOneBy({ id });
  }

  async createSession(name: string) {
    const existing = await this.sessionRepo.findOneBy({ name });
    if (existing) return existing;

    const session = this.sessionRepo.create({ name, status: SessionStatus.DISCONNECTED });
    return this.sessionRepo.save(session);
  }

  async connectSession(sessionId: string, onEvent: (event: string, data: any) => void) {
    const session = await this.sessionRepo.findOneBy({ id: sessionId });
    if (!session) throw new Error('Session not found');

    const existingSock = this.sockets.get(sessionId);
    if (existingSock) {
      existingSock.end(undefined);
      this.sockets.delete(sessionId);
    }

    const authDir = path.join(process.cwd(), '.sessions', sessionId);
    fs.mkdirSync(authDir, { recursive: true });

    const { state, saveCreds } = await useMultiFileAuthState(authDir);

    await this.sessionRepo.update(sessionId, { status: SessionStatus.CONNECTING, qrCode: null });

    const { version, isLatest } = await fetchLatestWaWebVersion({});
    this.logger.log(`Using WA Web version ${version.join('.')} (latest=${isLatest}) for session ${sessionId}`);

    const sock = makeWASocket({
      auth: state,
      version,
      browser: Browsers.ubuntu('Chrome'),
      markOnlineOnConnect: false,
      syncFullHistory: false,
      generateHighQualityLinkPreview: false,
      qrTimeout: 60000,
      // Pula fetchProps/fetchBlocklist/fetchPrivacySettings que causam timeout
      // de ~55s e fazem o WhatsApp segurar mensagens por ~300s antes de entregar.
      fireInitQueries: false,
      // Keepalive mais frequente para manter a conexão responsiva.
      keepAliveIntervalMs: 10_000,
    });

    this.sockets.set(sessionId, sock);

    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;
      const disconnectCode = (lastDisconnect?.error as Boom | undefined)?.output?.statusCode;

      this.logger.log(
        `Session ${sessionId} update: connection=${connection ?? 'unknown'} qr=${qr ? 'yes' : 'no'} code=${disconnectCode ?? 'none'}`,
      );

      if (qr) {
        const qrDataUrl = await QRCode.toDataURL(qr);
        await this.sessionRepo.update(sessionId, {
          status: SessionStatus.QR_WAITING,
          qrCode: qrDataUrl,
        });
        onEvent('qr', { sessionId, qr: qrDataUrl });
        this.logger.log(`Session ${sessionId} QR generated`);
      }

      if (connection === 'open') {
        await this.sessionRepo.update(sessionId, {
          status: SessionStatus.CONNECTED,
          qrCode: null,
        });
        onEvent('connected', { sessionId });
        this.logger.log(`Session ${sessionId} connected`);
      }

      if (connection === 'close') {
        const loggedOut = disconnectCode === DisconnectReason.loggedOut;
        const manualDisconnect = this.disconnectingSessions.has(sessionId);

        await this.sessionRepo.update(sessionId, { status: SessionStatus.DISCONNECTED });
        onEvent('disconnected', { sessionId });
        this.sockets.delete(sessionId);

        if (loggedOut || manualDisconnect) {
          this.logger.warn(
            `Session ${sessionId} disconnected (loggedOut=${loggedOut}, manual=${manualDisconnect}); not reconnecting`,
          );
          return;
        }

        this.logger.warn(`Session ${sessionId} closed (code=${disconnectCode ?? 'none'}); reconnecting in 2s`);
        setTimeout(() => void this.connectSession(sessionId, onEvent), 2000);
      }
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('messages.upsert', async ({ messages, type }) => {
      this.logger.log(`messages.upsert type=${type} count=${messages.length}`);
      for (const msg of messages) {
        this.logger.log(
          `  msg remoteJid=${msg.key.remoteJid} fromMe=${msg.key.fromMe} type=${type}`,
        );
      }
      if (type !== 'notify') return;
      for (const msg of messages) {
        if (!msg.key.fromMe) {
          onEvent('message', { sessionId, message: msg });
          this.notifyMessageListeners(sessionId, msg);
        }
      }
    });

    return session;
  }

  onMessage(sessionId: string, listener: (message: proto.IWebMessageInfo) => void) {
    const listeners = this.messageListeners.get(sessionId) ?? new Set<(message: proto.IWebMessageInfo) => void>();
    listeners.add(listener);
    this.messageListeners.set(sessionId, listeners);

    return () => {
      const current = this.messageListeners.get(sessionId);
      if (!current) return;
      current.delete(listener);
      if (current.size === 0) {
        this.messageListeners.delete(sessionId);
      }
    };
  }

  private notifyMessageListeners(sessionId: string, message: proto.IWebMessageInfo) {
    const listeners = this.messageListeners.get(sessionId);
    if (!listeners) return;

    for (const listener of listeners) {
      listener(message);
    }
  }

  async sendMessage(sessionId: string, to: string, text: string) {
    const sock = this.sockets.get(sessionId);
    if (!sock) throw new Error('Session not connected');

    const jid = to.includes('@') ? to : `${to}@s.whatsapp.net`;
    const result = await sock.sendMessage(jid, { text });
    this.logger.log(`Message sent to ${jid}, id: ${result?.key?.id ?? 'none'}`);
    return { success: true, messageId: result?.key?.id };
  }

  /**
   * Marca a mensagem como lida, exibe indicador de digitação proporcional
   * ao tamanho da resposta e então envia. Simula comportamento humano.
   */
  async sendReplyWithPresence(
    sessionId: string,
    originalMessage: proto.IWebMessageInfo,
    text: string,
  ) {
    const sock = this.sockets.get(sessionId);
    if (!sock) throw new Error('Session not connected');

    const jid = originalMessage.key.remoteJid!;

    // 1. Marca como lida (ticks azuis)
    try {
      await sock.readMessages([originalMessage.key]);
    } catch {
      // não crítico, continua
    }

    // 2. Fica "digitando" por um tempo proporcional ao tamanho da resposta
    try {
      await sock.sendPresenceUpdate('composing', jid);
      const typingMs = Math.min(Math.max(text.length * 30, 1200), 5000);
      await new Promise<void>((r) => setTimeout(r, typingMs));
      await sock.sendPresenceUpdate('paused', jid);
    } catch {
      // não crítico, continua
    }

    // 3. Envia a resposta
    const result = await sock.sendMessage(jid, { text });
    this.logger.log(`Reply sent to ${jid}, id: ${result?.key?.id ?? 'none'}`);
    return { success: true, messageId: result?.key?.id };
  }

  async disconnectSession(sessionId: string) {
    this.disconnectingSessions.add(sessionId);
    try {
      const sock = this.sockets.get(sessionId);
      if (sock) {
        // end() closes the socket without logging out of WhatsApp,
        // preserving credentials for the next connectSession call.
        sock.end(undefined);
        this.sockets.delete(sessionId);
      }
    } finally {
      this.disconnectingSessions.delete(sessionId);
    }
    await this.sessionRepo.update(sessionId, { status: SessionStatus.DISCONNECTED, qrCode: null });
  }

  async deleteSession(sessionId: string) {
    this.disconnectingSessions.add(sessionId);
    try {
      const sock = this.sockets.get(sessionId);
      if (sock) {
        try {
          // logout() removes the device from WhatsApp before deleting credentials.
          await sock.logout();
        } catch {
          sock.end(undefined);
        }
        this.sockets.delete(sessionId);
      }
    } finally {
      this.disconnectingSessions.delete(sessionId);
    }
    this.messageListeners.delete(sessionId);
    const authDir = path.join(process.cwd(), '.sessions', sessionId);
    fs.rmSync(authDir, { recursive: true, force: true });
    await this.sessionRepo.delete(sessionId);
  }

  onModuleDestroy() {
    for (const [, sock] of this.sockets) {
      sock.end(undefined);
    }
  }
}
