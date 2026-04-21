import 'dotenv/config';
import Fastify from 'fastify';
import type { Prisma } from '@prisma/client';
import { connect, setMessageHandler, setMotoboyHandler, setOwnerHandler } from './whatsapp/client';
import { processMessage } from './agent/agent';
import { prisma } from './db/client';
import { isMotoboy, processMoboyMessage, invalidateMotoboyCache } from './motoboy/motoboy.service';
import { isOwner, processOwnerCommand } from './admin/admin.service';
import { getPaymentStatus } from './payment/mercadopago';

type BusinessPayload = {
  name: string;
  ownerPhone: string;
  description?: string;
  hours?: Record<string, unknown>;
  menu?: unknown[];
  config?: Record<string, unknown>;
};

type MotoboyPayload = {
  name: string;
  phone: string;
};

type SendPayload = {
  phone: string;
  message: string;
};

type PaymentWebhookPayload = {
  type?: string;
  data?: {
    id?: string | number;
  };
};

const PHONE_REGEX = /^\d{10,15}$/;

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isPhone(value: unknown): value is string {
  return isNonEmptyString(value) && PHONE_REGEX.test(value.trim());
}

function toJsonObject(value: Record<string, unknown> | undefined): Prisma.InputJsonObject {
  return (value ?? {}) as Prisma.InputJsonObject;
}

function toJsonArray(value: unknown[] | undefined): Prisma.InputJsonArray {
  return (value ?? []) as Prisma.InputJsonArray;
}

const app = Fastify({
  logger: { level: 'info' },
});

let businessId = process.env.BUSINESS_ID ?? '';

async function resolveBusinessId(): Promise<string> {
  if (businessId) return businessId;
  const business = await prisma.business.findFirst({ where: { active: true } });
  if (business) {
    businessId = business.id;
    console.log(`✅ Negócio detectado automaticamente: "${business.name}" (${business.id})`);
  }
  return businessId;
}

// Silencia requisições socket.io do frontend antigo
app.addHook('onRequest', async (req, reply) => {
  if (req.url.startsWith('/socket.io')) {
    reply.status(200).send('');
  }
});

// ── Health ────────────────────────────────────────────────────────────────────
app.get('/health', async () => ({ status: 'ok', timestamp: new Date().toISOString() }));

// ── Negócio ───────────────────────────────────────────────────────────────────
app.post<{ Body: BusinessPayload }>('/business', async (req, reply) => {
  const { name, ownerPhone, description, hours, menu, config } = req.body;
  if (!isNonEmptyString(name) || !isPhone(ownerPhone)) {
    return reply.status(400).send({ error: 'name e ownerPhone válidos são obrigatórios' });
  }
  if (description !== undefined && typeof description !== 'string') {
    return reply.status(400).send({ error: 'description deve ser texto' });
  }
  if (hours !== undefined && (typeof hours !== 'object' || hours === null || Array.isArray(hours))) {
    return reply.status(400).send({ error: 'hours deve ser um objeto' });
  }
  if (menu !== undefined && !Array.isArray(menu)) {
    return reply.status(400).send({ error: 'menu deve ser uma lista' });
  }
  if (config !== undefined && (typeof config !== 'object' || config === null || Array.isArray(config))) {
    return reply.status(400).send({ error: 'config deve ser um objeto' });
  }

  const id = await resolveBusinessId();
  const business = await prisma.business.upsert({
    where: { id: id || 'placeholder' },
    create: {
      name: name.trim(),
      ownerPhone: ownerPhone.trim(),
      description: description?.trim() || undefined,
      hours: toJsonObject(hours),
      menu: toJsonArray(menu),
      config: toJsonObject(config),
    },
    update: {
      name: name.trim(),
      ownerPhone: ownerPhone.trim(),
      description: description?.trim() || undefined,
      hours: toJsonObject(hours),
      menu: toJsonArray(menu),
      config: toJsonObject(config),
    },
  });

  businessId = business.id;
  console.log(`✅ Negócio configurado: "${business.name}" (${business.id})`);
  return business;
});

app.get('/business', async () => {
  const id = await resolveBusinessId();
  return prisma.business.findUnique({ where: { id } });
});

// ── Motoboys ──────────────────────────────────────────────────────────────────
app.get('/motoboys', async () => {
  const id = await resolveBusinessId();
  return prisma.motoboy.findMany({ where: { businessId: id } });
});

app.post<{ Body: MotoboyPayload }>('/motoboys', async (req, reply) => {
  const { name, phone } = req.body;
  if (!isNonEmptyString(name) || !isPhone(phone)) {
    return reply.status(400).send({ error: 'name e phone válidos são obrigatórios' });
  }
  const id = await resolveBusinessId();
  if (!id) return reply.status(400).send({ error: 'Negócio não configurado' });

  const normalizedPhone = phone.trim();
  const motoboy = await prisma.motoboy.upsert({
    where: { businessId_phone: { businessId: id, phone: normalizedPhone } },
    create: { businessId: id, name: name.trim(), phone: normalizedPhone },
    update: { name: name.trim(), active: true },
  });
  invalidateMotoboyCache();
  return motoboy;
});

app.delete<{ Params: { phone: string } }>('/motoboys/:phone', async (req, reply) => {
  const id = await resolveBusinessId();
  await prisma.motoboy.updateMany({
    where: { businessId: id, phone: req.params.phone },
    data: { active: false },
  });
  invalidateMotoboyCache();
  return { removed: true };
});

// ── Pedidos ───────────────────────────────────────────────────────────────────
app.get<{ Querystring: { phone?: string; status?: string } }>('/orders', async (req) => {
  const id = await resolveBusinessId();
  const { phone, status } = req.query;
  return prisma.order.findMany({
    where: { businessId: id, ...(phone ? { phone } : {}), ...(status ? { status } : {}) },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });
});

// ── Conversas ─────────────────────────────────────────────────────────────────
app.get('/conversations', async () => {
  const id = await resolveBusinessId();
  return prisma.conversation.findMany({
    where: { businessId: id },
    include: { messages: { orderBy: { createdAt: 'desc' }, take: 1 } },
    orderBy: { updatedAt: 'desc' },
  });
});

// ── Reiniciar conversa (handoff encerrado) ────────────────────────────────────
app.post<{ Params: { phone: string } }>('/conversations/:phone/reopen', async (req, reply) => {
  if (!isPhone(req.params.phone)) {
    return reply.status(400).send({ error: 'phone inválido' });
  }

  const id = await resolveBusinessId();
  await prisma.conversation.updateMany({
    where: { businessId: id, phone: req.params.phone.trim() },
    data: { status: 'active' },
  });
  return { reopened: true };
});

// ── MercadoPago Webhook ───────────────────────────────────────────────────────
app.post<{ Body: PaymentWebhookPayload }>('/payment/webhook', async (req, reply) => {
  const { type, data } = req.body;
  if (type !== 'payment' || data?.id === undefined || data?.id === null) {
    return reply.status(200).send('ok');
  }

  const paymentId = String(data.id);
  const status = await getPaymentStatus(paymentId);
  if (!status) return reply.status(200).send('ok');

  const order = await prisma.order.findFirst({ where: { paymentId } });
  if (!order) {
    // Tenta pelo externalRef
    const orderByRef = await prisma.order.findFirst({ where: { id: { contains: paymentId.slice(-6) } } });
    if (orderByRef) {
      await prisma.order.update({
        where: { id: orderByRef.id },
        data: { paymentStatus: status, paymentId },
      });
    }
    return reply.status(200).send('ok');
  }

  await prisma.order.update({ where: { id: order.id }, data: { paymentStatus: status } });
  console.log(`💳 Pagamento ${paymentId} → ${status} (pedido #${order.id.slice(-6).toUpperCase()})`);
  return reply.status(200).send('ok');
});

app.get('/payment/success', async () => ({ message: 'Pagamento realizado! Obrigado.' }));
app.get('/payment/failure', async () => ({ message: 'Pagamento não aprovado. Tente novamente.' }));

// ── Envio manual (testes) ─────────────────────────────────────────────────────
app.post<{ Body: SendPayload }>('/send', async (req, reply) => {
  const { phone, message } = req.body;
  if (!isPhone(phone) || !isNonEmptyString(message)) {
    return reply.status(400).send({ error: 'phone válido e message obrigatórios' });
  }
  const { sendMessage } = await import('./whatsapp/client');
  await sendMessage(phone.trim(), message.trim());
  return { sent: true };
});

// ── Bootstrap ─────────────────────────────────────────────────────────────────
async function main() {
  await app.listen({ port: Number(process.env.PORT ?? 3000), host: '0.0.0.0' });
  console.log(`🚀 Servidor rodando na porta ${process.env.PORT ?? 3000}`);

  const id = await resolveBusinessId();
  if (!id) {
    console.warn('⚠️  Nenhum negócio cadastrado. Faça POST /business para configurar.');
  }

  setMessageHandler(async (phone, text) => {
    const bid = await resolveBusinessId();
    if (!bid) return 'Sistema em configuração. Tente novamente em breve.';
    return processMessage(phone, text, bid);
  });

  // Handler do dono — prioridade máxima
  setOwnerHandler(
    async (phone, text, _bid) => {
      const bid = await resolveBusinessId();
      if (bid) await processOwnerCommand(phone, text, bid);
    },
    async (phone, _bid) => {
      const bid = await resolveBusinessId();
      if (!bid) return false;
      return isOwner(phone, bid);
    },
  );
  console.log('👑 Painel do dono ativo');

  // Handler de motoboy
  setMotoboyHandler(
    async (phone, text, _bid) => {
      const bid = await resolveBusinessId();
      if (bid) await processMoboyMessage(phone, text, bid);
    },
    async (phone, _bid) => {
      const bid = await resolveBusinessId();
      if (!bid) return false;
      return isMotoboy(phone, bid);
    },
    id || '__dynamic__',
  );
  console.log('🛵 Sistema de motoboys ativo');

  console.log('📲 Iniciando WhatsApp...');
  await connect();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
