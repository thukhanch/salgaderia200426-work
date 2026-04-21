import { Prisma } from '@prisma/client';
import { prisma } from '../db/client';
import { sendMessage } from '../whatsapp/client';
import {
  DELIVERY_CONSTANTS,
  LOG_MESSAGES,
  MOTOBOY_CONSTANTS,
  REGEX_CONSTANTS,
  TIME_CONSTANTS,
  formatCurrency,
  formatOrderShortId,
  getPerBusinessExpiry,
  joinBulletItems,
  joinOrderItems,
  matchesOrderShortId,
  renderTemplate,
} from '../config/app.constants';

function isDatabaseUnavailableError(error: unknown) {
  return error instanceof Prisma.PrismaClientInitializationError;
}

function getMotoboyUserErrorMessage(error: unknown) {
  if (isDatabaseUnavailableError(error)) {
    return 'Banco de dados indisponível no momento. Tente novamente em instantes.';
  }

  return null;
}

async function sendSafeMotoboyError(phone: string, error: unknown) {
  const message = getMotoboyUserErrorMessage(error);
  if (!message) return;
  await sendMessage(phone, message);
}

function logMotoboyError(error: unknown) {
  console.error(LOG_MESSAGES.motoboyFlowError, error);
}

// Cache em memória dos telefones de motoboys (evita query no banco a cada mensagem)
const motoboyPhoneCache = new Map<string, Set<string>>();
const motoboyCacheExpiry = new Map<string, number>();
const CACHE_TTL = MOTOBOY_CONSTANTS.cacheTtlMs;

async function getMotoboyPhones(businessId: string): Promise<Set<string>> {
  const now = Date.now();
  const businessExpiry = motoboyCacheExpiry.get(businessId) ?? 0;
  if (now < businessExpiry && motoboyPhoneCache.has(businessId)) {
    return motoboyPhoneCache.get(businessId)!;
  }

  const motoboys = await prisma.motoboy.findMany({
    where: { businessId, active: true },
    select: { phone: true },
  });

  const phones = new Set(motoboys.map(m => m.phone));
  motoboyPhoneCache.set(businessId, phones);
  motoboyCacheExpiry.set(businessId, getPerBusinessExpiry(now, CACHE_TTL));
  return phones;
}

function formatDeliveryAlert(order: any, index?: number, total?: number): string {
  const items = joinBulletItems(order.items as Array<{ quantity: number; name: string }>);
  const shortOrderId = formatOrderShortId(order.id);
  const scheduledAt = order.scheduledAt
    ? new Date(order.scheduledAt).toLocaleString('pt-BR', { timeZone: TIME_CONSTANTS.saoPaulo })
    : DELIVERY_CONSTANTS.unavailableSchedule;
  const counter = total && total > 1 ? ` (${index}/${total})` : '';

  return (
    `🛵 *NOVA ENTREGA DISPONÍVEL${counter}!*\n\n` +
    `Pedido: #${shortOrderId}\n` +
    `📦 Itens:\n${items}\n\n` +
    `📍 ${order.address}\n` +
    `📅 ${scheduledAt}\n` +
    `💰 ${formatCurrency(Number(order.total))}\n\n` +
    `Responda *OK ${shortOrderId}* para aceitar.\n` +
    `⚡ Primeiro a responder confirma a corrida!`
  );
}

async function doNotifyMotoboys(order: any): Promise<void> {
  const motoboys = await prisma.motoboy.findMany({
    where: { businessId: order.businessId, active: true },
  });

  if (motoboys.length === 0) {
    console.warn(`⚠️  Nenhum motoboy cadastrado para o negócio ${order.businessId}`);

    const business = await prisma.business.findUnique({ where: { id: order.businessId } });
    if (business?.ownerPhone) {
      await sendMessage(
        business.ownerPhone,
        renderTemplate(MOTOBOY_CONSTANTS.noRegisteredMotoboys, {
          orderId: formatOrderShortId(order.id),
        }),
      );
    }
    return;
  }

  const msg = formatDeliveryAlert(order);

  for (const motoboy of motoboys) {
    try {
      await sendMessage(motoboy.phone, msg);
      console.log(`📨 Motoboy ${motoboy.name} notificado`);
    } catch {
      console.error(`❌ Falha ao notificar motoboy ${motoboy.name}`);
    }
  }

  await prisma.order.update({
    where: { id: order.id },
    data: { motoboyStatus: 'notified' },
  });

  scheduleEscalation(order.id, order.businessId);
}

function scheduleEscalation(orderId: string, businessId: string) {
  setTimeout(async () => {
    try {
      const order = await prisma.order.findUnique({ where: { id: orderId } });
      if (!order || order.motoboyStatus !== 'notified') return;

      console.warn(`⏰ Pedido #${formatOrderShortId(orderId)} sem motoboy após 5 min — escalando`);

      const business = await prisma.business.findUnique({ where: { id: businessId } });
      if (business?.ownerPhone) {
        const items = joinOrderItems(order.items as Array<{ quantity: number; name: string }>);
        await sendMessage(
          business.ownerPhone,
          renderTemplate(MOTOBOY_CONSTANTS.escalationOwner, {
            orderId: formatOrderShortId(orderId),
            items,
            address: order.address ?? '',
          }),
        );
      }
    } catch (error) {
      logMotoboyError(error);
    }
  }, MOTOBOY_CONSTANTS.escalationTimeoutMs);
}

async function processPendingMessage(phone: string, businessId: string) {
  const hasPending = await prisma.order.count({
    where: { businessId, motoboyStatus: 'notified', deliveryType: 'delivery' },
  });

  if (hasPending > 0) {
    await sendMessage(phone, renderTemplate(MOTOBOY_CONSTANTS.pendingDeliveries, { count: hasPending }));
  }
}

async function processAcceptance(phone: string, businessId: string, orderId?: string) {
  let order: any = null;

  if (orderId) {
    const orders = await prisma.order.findMany({
      where: {
        businessId,
        motoboyStatus: 'notified',
        deliveryType: 'delivery',
      },
      orderBy: { createdAt: 'desc' },
    });
    order = orders.find(item => matchesOrderShortId(item.id, orderId));
  } else {
    order = await prisma.order.findFirst({
      where: { businessId, motoboyStatus: 'notified', deliveryType: 'delivery' },
      orderBy: { createdAt: 'desc' },
    });
  }

  if (!order) {
    await sendMessage(phone, MOTOBOY_CONSTANTS.noPendingDelivery);
    return;
  }

  const motoboy = await prisma.motoboy.findUnique({
    where: { businessId_phone: { businessId, phone } },
  });
  const motoboyName = motoboy?.name ?? phone;

  const updated = await prisma.order.updateMany({
    where: { id: order.id, motoboyStatus: 'notified' },
    data: {
      motoboyPhone: phone,
      motoboyName,
      motoboyStatus: 'accepted',
    },
  });

  if (updated.count === 0) {
    await sendMessage(phone, MOTOBOY_CONSTANTS.alreadyAccepted);
    return;
  }

  const items = joinOrderItems(order.items as Array<{ quantity: number; name: string }>);
  const ordShort = formatOrderShortId(order.id);

  await sendMessage(
    phone,
    renderTemplate(MOTOBOY_CONSTANTS.deliveryConfirmed, {
      orderId: ordShort,
      motoboyName,
      items,
      address: order.address ?? '',
    }),
  );

  const others = await prisma.motoboy.findMany({
    where: { businessId, active: true, NOT: { phone } },
  });
  for (const other of others) {
    try {
      await sendMessage(other.phone, renderTemplate(MOTOBOY_CONSTANTS.otherMotoboyAccepted, { orderId: ordShort }));
    } catch (error) {
      logMotoboyError(error);
    }
  }

  try {
    await sendMessage(order.phone, renderTemplate(MOTOBOY_CONSTANTS.customerOutForDelivery, { motoboyName }));
  } catch (error) {
    logMotoboyError(error);
  }

  try {
    const business = await prisma.business.findUnique({ where: { id: businessId } });
    if (business?.ownerPhone) {
      await sendMessage(
        business.ownerPhone,
        renderTemplate(MOTOBOY_CONSTANTS.ownerAccepted, { motoboyName, orderId: ordShort }),
      );
    }
  } catch (error) {
    logMotoboyError(error);
  }

  console.log(`✅ Entrega #${ordShort} aceita por ${motoboyName}`);
}

async function handleDeliveryComplete(phone: string, orderId: string | undefined, businessId: string) {
  const order = orderId
    ? (
        await prisma.order.findMany({
          where: {
            businessId,
            motoboyPhone: phone,
            motoboyStatus: 'accepted',
          },
          orderBy: { updatedAt: 'desc' },
        })
      ).find(item => matchesOrderShortId(item.id, orderId)) ?? null
    : await prisma.order.findFirst({
        where: { businessId, motoboyPhone: phone, motoboyStatus: 'accepted' },
        orderBy: { updatedAt: 'desc' },
      });

  if (!order) {
    await sendMessage(
      phone,
      orderId
        ? renderTemplate(MOTOBOY_CONSTANTS.completeNotFoundWithId, { orderId })
        : MOTOBOY_CONSTANTS.completeNotFound,
    );
    return;
  }

  await prisma.order.update({
    where: { id: order.id },
    data: { motoboyStatus: 'delivered', status: 'delivered' },
  });

  const ordShort = formatOrderShortId(order.id);
  await sendMessage(phone, renderTemplate(MOTOBOY_CONSTANTS.completeSuccess, { orderId: ordShort }));

  try {
    await sendMessage(order.phone, MOTOBOY_CONSTANTS.customerDelivered);
  } catch {}
}

export function invalidateMotoboyCache() {
  motoboyPhoneCache.clear();
  motoboyCacheExpiry.clear();
}

export async function isMotoboy(phone: string, businessId: string): Promise<boolean> {
  try {
    const phones = await getMotoboyPhones(businessId);
    return phones.has(phone);
  } catch (error) {
    logMotoboyError(error);
    return false;
  }
}

export async function notifyMotoboys(order: any): Promise<void> {
  try {
    await doNotifyMotoboys(order);
  } catch (error) {
    logMotoboyError(error);
    const business = await prisma.business.findUnique({ where: { id: order.businessId } }).catch(() => null);
    if (business?.ownerPhone) {
      await sendSafeMotoboyError(business.ownerPhone, error);
    }
  }
}

export function parseAcceptance(text: string): { accepted: boolean; orderId?: string } {
  const normalized = text.trim().toLowerCase().replace(/[^\w\s]/g, '');
  const words = normalized.split(/\s+/);
  const firstWord = words[0] ?? '';

  if (!MOTOBOY_CONSTANTS.acceptWords.includes(firstWord as (typeof MOTOBOY_CONSTANTS.acceptWords)[number])) {
    return { accepted: false };
  }

  const rawCandidate = text.trim().split(/\s+/)[1];
  const orderId = REGEX_CONSTANTS.shortOrderId.test(rawCandidate ?? '') ? rawCandidate!.toUpperCase() : undefined;

  return { accepted: true, orderId };
}

export function parseDeliveryCompletion(text: string): { delivered: boolean; orderId?: string } {
  const normalized = text.trim();
  if (!REGEX_CONSTANTS.deliveredCommand.test(normalized)) {
    return { delivered: false };
  }

  const idMatch = normalized.match(REGEX_CONSTANTS.deliveredWithId);
  return {
    delivered: true,
    orderId: idMatch ? idMatch[1].toUpperCase() : undefined,
  };
}

export async function processMotoboyMessage(
  phone: string,
  text: string,
  businessId: string,
): Promise<void> {
  try {
    const completion = parseDeliveryCompletion(text);
    if (completion.delivered) {
      await handleDeliveryComplete(phone, completion.orderId, businessId);
      return;
    }

    const { accepted, orderId } = parseAcceptance(text);

    if (!accepted) {
      await processPendingMessage(phone, businessId);
      return;
    }

    await processAcceptance(phone, businessId, orderId);
  } catch (error) {
    logMotoboyError(error);
    await sendSafeMotoboyError(phone, error);
  }
}
