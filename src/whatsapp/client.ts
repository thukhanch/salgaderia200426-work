import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  WASocket,
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import qrcode from 'qrcode-terminal';
import pino from 'pino';
import path from 'path';
import fs from 'fs';
import {
  APP_FLAGS,
  NUMBER_CONSTANTS,
  buildUnsupportedMessageTypeMessage,
  canRetryConnection,
  getReconnectDelay,
  normalizeMessagePreview,
} from '../config/app.constants';

type MessageHandler = (phone: string, text: string) => Promise<string>;
type MotoboyHandler = (phone: string, text: string, businessId: string) => Promise<void>;
type OwnerHandler = (phone: string, text: string, businessId: string) => Promise<void>;
type PhoneChecker = (phone: string, businessId: string) => Promise<boolean>;

type SimulatedMessage = {
  phone: string;
  text: string;
};

const simulatedMessages: SimulatedMessage[] = [];

const AUTH_DIR = path.join(process.cwd(), 'auth_state');
const logger = pino({ level: 'silent' });

let sock: WASocket | null = null;
let messageHandler: MessageHandler | null = null;
let motoboyHandler: MotoboyHandler | null = null;
let ownerHandler: OwnerHandler | null = null;
let motoboyChecker: PhoneChecker | null = null;
let ownerChecker: PhoneChecker | null = null;
let currentBusinessId: string | null = null;
let reconnectAttempts = 0;

function getSimulationBusinessId() {
  return currentBusinessId ?? null;
}

function getOperationalBusinessId() {
  return currentBusinessId;
}

function resetReconnectAttempts() {
  reconnectAttempts = 0;
}

function scheduleReconnect() {
  reconnectAttempts += 1;
  if (!canRetryConnection(reconnectAttempts, NUMBER_CONSTANTS.maxWhatsappReconnectAttempts)) {
    console.error('❌ Limite de reconexões do WhatsApp atingido. Verifique a conexão manualmente.');
    return;
  }
  const delay = getReconnectDelay(reconnectAttempts);
  console.log(`🔄 Reconectando ao WhatsApp em ${delay / 1000}s...`);
  setTimeout(connect, delay);
}

function getIncomingText(msg: { message?: Record<string, any> | null }) {
  return msg.message?.conversation || msg.message?.extendedTextMessage?.text || '';
}

function hasUnsupportedIncomingMessage(msg: { message?: Record<string, any> | null }) {
  if (!msg.message) return false;
  return !msg.message.conversation && !msg.message.extendedTextMessage?.text;
}

async function sendUnsupportedMessageNotice(phone: string) {
  await sendMessage(phone, buildUnsupportedMessageTypeMessage());
}

export function setMessageHandler(handler: MessageHandler) {
  messageHandler = handler;
}

export function setOwnerHandler(handler: OwnerHandler, checker: PhoneChecker) {
  ownerHandler = handler;
  ownerChecker = checker;
}

export function setMotoboyHandler(handler: MotoboyHandler, checker: PhoneChecker, businessId: string) {
  motoboyHandler = handler;
  motoboyChecker = checker;
  currentBusinessId = businessId;
}

function isSimulationEnabled() {
  return process.env[APP_FLAGS.whatsappSimulationEnv] === APP_FLAGS.enabled;
}

function pushSimulatedMessage(phone: string, text: string) {
  simulatedMessages.push({ phone, text });
}

export function clearSimulatedMessages() {
  simulatedMessages.length = 0;
}

export function getSimulatedMessages(): SimulatedMessage[] {
  return [...simulatedMessages];
}

export async function sendMessage(phone: string, text: string) {
  if (isSimulationEnabled()) {
    pushSimulatedMessage(phone, text);
    return;
  }
  if (!sock) throw new Error('WhatsApp não conectado');
  const jid = phone.includes('@') ? phone : `${phone}@s.whatsapp.net`;
  await sock.sendMessage(jid, { text });
}

export async function routeIncomingSimulationMessage(phone: string, text: string) {
  if (!text.trim()) return;

  const businessId = getSimulationBusinessId();

  if (ownerChecker && ownerHandler && businessId) {
    const isOwner = await ownerChecker(phone, businessId);
    if (isOwner) {
      await ownerHandler(phone, text, businessId);
      return;
    }
  }

  if (motoboyChecker && motoboyHandler && businessId) {
    const isMotoboy = await motoboyChecker(phone, businessId);
    if (isMotoboy) {
      await motoboyHandler(phone, text, businessId);
      return;
    }
  }

  if (messageHandler) {
    const response = await messageHandler(phone, text);
    if (response) {
      await sendMessage(phone, response);
    }
  }
}

export function setCurrentBusinessIdForSimulation(businessId: string) {
  currentBusinessId = businessId;
}

export function resetSimulationState() {
  messageHandler = null;
  motoboyHandler = null;
  ownerHandler = null;
  motoboyChecker = null;
  ownerChecker = null;
  currentBusinessId = null;
  clearSimulatedMessages();
}

export async function connect() {
  if (!fs.existsSync(AUTH_DIR)) fs.mkdirSync(AUTH_DIR, { recursive: true });

  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
  const { version } = await fetchLatestBaileysVersion();

  sock = makeWASocket({
    version,
    logger,
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, logger),
    },
    generateHighQualityLinkPreview: false,
    printQRInTerminal: false,
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', ({ connection, lastDisconnect, qr }) => {
    if (qr) {
      console.log('\n📱 Escaneie o QR code abaixo com seu WhatsApp:\n');
      qrcode.generate(qr, { small: true });
    }

    if (connection === 'close') {
      const shouldReconnect =
        (lastDisconnect?.error as Boom)?.output?.statusCode !== DisconnectReason.loggedOut;
      if (shouldReconnect) {
        scheduleReconnect();
      } else {
        console.log('🚪 Desconectado permanentemente. Delete a pasta auth_state e reinicie.');
      }
    }

    if (connection === 'open') {
      resetReconnectAttempts();
      console.log('✅ WhatsApp conectado com sucesso!');
    }
  });

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;

    for (const msg of messages) {
      if (msg.key.fromMe) continue;
      if (!msg.message) continue;

      const rawPhone = msg.key.remoteJid?.replace('@s.whatsapp.net', '').replace('@lid', '') ?? '';
      if (!rawPhone) continue;

      if (hasUnsupportedIncomingMessage(msg)) {
        await sendUnsupportedMessageNotice(rawPhone);
        continue;
      }

      const text = getIncomingText(msg);
      if (!text.trim()) continue;

      // 1. Verifica se é o dono (prioridade máxima)
      if (ownerChecker && ownerHandler) {
        try {
          const ownerBusinessId = getOperationalBusinessId();
          if (ownerBusinessId) {
            const isOwner = await ownerChecker(rawPhone, ownerBusinessId);
            if (isOwner) {
              console.log(`👑 [DONO ${rawPhone}]: ${text}`);
              await ownerHandler(rawPhone, text, ownerBusinessId);
              continue;
            }
          }
        } catch {
          // Se checar falhar, segue o fluxo normal
        }
      }

      // 2. Verifica se é motoboy
      if (motoboyChecker && motoboyHandler) {
        try {
          const motoboyBusinessId = getOperationalBusinessId();
          if (motoboyBusinessId) {
            const isMotoboy = await motoboyChecker(rawPhone, motoboyBusinessId);
            if (isMotoboy) {
              console.log(`🛵 [MOTOBOY ${rawPhone}]: ${text}`);
              await motoboyHandler(rawPhone, text, motoboyBusinessId);
              continue;
            }
          }
        } catch {
          // Se checar falhar, trata como cliente normal
        }
      }

      // 3. Cliente normal
      console.log(`📩 [${rawPhone}]: ${text}`);

      if (messageHandler) {
        try {
          const response = await messageHandler(rawPhone, text);
          if (response) {
            await sendMessage(rawPhone, response);
            console.log(`📤 [${rawPhone}]: ${normalizeMessagePreview(response, NUMBER_CONSTANTS.messagePreviewLength)}`);
          }
        } catch (err) {
          console.error('Erro ao processar mensagem:', err);
          await sendMessage(rawPhone, '⚠️ Ocorreu um erro. Tente novamente em instantes.');
        }
      }
    }
  });
}
