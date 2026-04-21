import { Prisma } from '@prisma/client';
import { prisma } from '../db/client';
import { sendMessage } from '../whatsapp/client';
import { invalidateMotoboyCache } from '../motoboy/motoboy.service';
import {
  ADMIN_MESSAGES,
  LOG_MESSAGES,
  NUMBER_CONSTANTS,
  ORDER_STATUS_EMOJI,
  REGEX_CONSTANTS,
  TIME_CONSTANTS,
  buildInvalidPhoneError,
  formatCurrency,
  formatMotoboyListEntry,
  formatOrderListEntry,
  formatOrderShortId,
  joinPricedItems,
  matchesOrderShortId,
  normalizePhone,
  renderTemplate,
} from '../config/app.constants';

function isDatabaseUnavailableError(error: unknown) {
  return error instanceof Prisma.PrismaClientInitializationError;
}

function getOwnerUserErrorMessage(error: unknown) {
  if (isDatabaseUnavailableError(error)) {
    return 'Banco de dados indisponível no momento. Verifique a configuração e tente novamente.';
  }

  return error instanceof Error ? error.message : 'Erro desconhecido';
}

function formatMenuLine(item: { name: string; price: number; unit?: string; description?: string }) {
  return `• *${item.name}*: R$ ${Number(item.price).toFixed(2)}${item.unit ? `/${item.unit}` : ''}${item.description ? ` — ${item.description}` : ''}`;
}

function buildOrderDetail(order: any) {
  const items = joinPricedItems(order.items as Array<{ quantity: number; name: string; unitPrice: number }>);

  return (
    `📦 *Pedido #${formatOrderShortId(order.id)}*\n\n` +
    `Cliente: ${order.phone}\n` +
    `Status: ${order.status}\n` +
    `Pagamento: ${order.paymentStatus ?? 'N/A'}\n` +
    (order.deliveryType === 'delivery'
      ? `Entrega: ${order.motoboyName ?? 'aguardando motoboy'}\n📍 ${order.address}\n`
      : `Tipo: Retirada\n`) +
    (order.scheduledAt
      ? `📅 ${new Date(order.scheduledAt).toLocaleString('pt-BR', { timeZone: TIME_CONSTANTS.saoPaulo })}\n`
      : '') +
    `\n${items}\n\n` +
    `*Total: ${formatCurrency(Number(order.total))}*`
  );
}

export async function isOwner(phone: string, businessId: string): Promise<boolean> {
  const business = await prisma.business.findUnique({ where: { id: businessId } });
  if (!business) return false;
  return normalizePhone(business.ownerPhone) === normalizePhone(phone);
}

export async function processOwnerCommand(
  phone: string,
  text: string,
  businessId: string,
): Promise<void> {
  const raw = text.trim();
  const lower = raw.toLowerCase();
  const parts = raw.split(/\s+/);
  const cmd = parts[0]?.toLowerCase() ?? '';

  try {
    if (cmd === 'ajuda' || cmd === 'help' || cmd === 'menu') {
      await sendMessage(phone, ADMIN_MESSAGES.helpText);
      return;
    }

    if (lower === 'motoboys' || lower === 'listar motoboys') {
      const list = await prisma.motoboy.findMany({ where: { businessId } });
      if (list.length === 0) {
        await sendMessage(phone, ADMIN_MESSAGES.noMotoboys);
        return;
      }

      const lines = list.map((m, i) => formatMotoboyListEntry(i + 1, m.name, m.phone, m.active));
      await sendMessage(phone, `🛵 *Motoboys cadastrados:*\n\n${lines.join('\n')}`);
      return;
    }

    if (cmd === 'motoboy' && parts[1]?.toLowerCase() === 'add') {
      if (parts.length < 4) {
        await sendMessage(phone, ADMIN_MESSAGES.addUsage);
        return;
      }

      const telefone = parts[parts.length - 1];
      const nome = parts.slice(2, parts.length - 1).join(' ');

      if (!REGEX_CONSTANTS.phone.test(telefone)) {
        await sendMessage(phone, renderTemplate(ADMIN_MESSAGES.invalidPhone, { phone: telefone }));
        return;
      }

      await prisma.motoboy.upsert({
        where: { businessId_phone: { businessId, phone: telefone } },
        create: { businessId, name: nome, phone: telefone },
        update: { name: nome, active: true },
      });
      invalidateMotoboyCache();

      await sendMessage(phone, renderTemplate(ADMIN_MESSAGES.addSuccess, { name: nome, phone: telefone }));
      return;
    }

    if (cmd === 'motoboy' && (parts[1]?.toLowerCase() === 'remover' || parts[1]?.toLowerCase() === 'remove')) {
      if (parts.length < 3) {
        await sendMessage(phone, ADMIN_MESSAGES.removeUsage);
        return;
      }

      const telefone = parts[2];
      const motoboy = await prisma.motoboy.findUnique({
        where: { businessId_phone: { businessId, phone: telefone } },
      });

      if (!motoboy) {
        await sendMessage(phone, renderTemplate(ADMIN_MESSAGES.motoboyNotFound, { phone: telefone }));
        return;
      }

      await prisma.motoboy.update({
        where: { businessId_phone: { businessId, phone: telefone } },
        data: { active: false },
      });
      invalidateMotoboyCache();

      await sendMessage(phone, renderTemplate(ADMIN_MESSAGES.removeSuccess, { name: motoboy.name }));
      return;
    }

    if (cmd === 'pedidos') {
      const orders = await prisma.order.findMany({
        where: { businessId },
        orderBy: { createdAt: 'desc' },
        take: NUMBER_CONSTANTS.maxRecentOrders,
      });

      if (orders.length === 0) {
        await sendMessage(phone, ADMIN_MESSAGES.noOrders);
        return;
      }

      const lines = orders.map(o => {
        const emoji = ORDER_STATUS_EMOJI[o.status] ?? '•';
        const date = o.scheduledAt
          ? new Date(o.scheduledAt).toLocaleDateString('pt-BR', { timeZone: TIME_CONSTANTS.saoPaulo })
          : new Date(o.createdAt).toLocaleDateString('pt-BR', { timeZone: TIME_CONSTANTS.saoPaulo });
        return formatOrderListEntry(o.id, Number(o.total), date, emoji);
      });

      await sendMessage(phone, `📋 *Últimos pedidos:*\n\n${lines.join('\n')}\n\nDigite \`pedido <ID>\` para detalhes.`);
      return;
    }

    if (cmd === 'pedido' && parts[1]) {
      const searchId = parts[1].toUpperCase();
      const orders = await prisma.order.findMany({
        where: { businessId },
        orderBy: { createdAt: 'desc' },
      });
      const order = orders.find(item => matchesOrderShortId(item.id, searchId));

      if (!order) {
        await sendMessage(phone, renderTemplate(ADMIN_MESSAGES.orderNotFound, { id: searchId }));
        return;
      }

      await sendMessage(phone, buildOrderDetail(order));
      return;
    }

    if (cmd === 'reabrir' && parts[1]) {
      const clientPhone = normalizePhone(parts[1]);
      if (!REGEX_CONSTANTS.phone.test(clientPhone)) {
        throw new Error(buildInvalidPhoneError('Telefone'));
      }
      const updated = await prisma.conversation.updateMany({
        where: { businessId, phone: clientPhone },
        data: { status: 'active' },
      });

      if (updated.count === 0) {
        await sendMessage(phone, renderTemplate(ADMIN_MESSAGES.conversationNotFound, { phone: clientPhone }));
        return;
      }

      await sendMessage(phone, renderTemplate(ADMIN_MESSAGES.conversationReopened, { phone: clientPhone }));
      return;
    }

    if (cmd === 'cardapio' || cmd === 'cardápio') {
      const business = await prisma.business.findUnique({ where: { id: businessId } });
      const menu = (business?.menu as Array<{ name: string; price: number; unit?: string; description?: string }>) ?? [];

      if (menu.length === 0) {
        await sendMessage(phone, ADMIN_MESSAGES.emptyMenu);
        return;
      }

      await sendMessage(phone, `🍽️ *Cardápio atual:*\n\n${menu.map(formatMenuLine).join('\n')}`);
      return;
    }

    await sendMessage(phone, renderTemplate(ADMIN_MESSAGES.unknownCommand, { cmd }));
  } catch (error) {
    console.error(LOG_MESSAGES.ownerPanelError, error);
    await sendMessage(phone, renderTemplate(ADMIN_MESSAGES.executionError, { message: getOwnerUserErrorMessage(error) }));
  }
}
