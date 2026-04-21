export const APP_FLAGS = {
  whatsappSimulationEnv: 'WHATSAPP_SIMULATION',
  enabled: 'true',
} as const;

export const AGENT_CONSTANTS = {
  defaultBusinessName: 'salgaderia' as string,
  maxHistory: 30,
  injectionResponse:
    'Oi! Sou o assistente da {{businessName}} e só consigo ajudar com pedidos de salgados. Posso te ajudar com algo? 😊',
  invalidCreateOrderArgs: 'Argumentos inválidos para create_order',
  unknownTool: 'Ferramenta desconhecida',
  toolExecutionFailure: 'Falha ao executar ferramenta',
  emptyModelResponse: 'Resposta vazia do modelo',
  missingOpenAiBaseUrl: 'OPENAI_BASE_URL não configurada',
  missingOpenAiApiKey: 'OPENAI_API_KEY não configurada',
  missingModelName: 'MODEL_NAME não configurado',
  toolLoopLimitReached: 'Limite de iterações de ferramentas atingido',
  assistantToolCallsRole: 'assistant_tool_calls',
} as const;

export const ADMIN_MESSAGES = {
  invalidPhone:
    '⚠️ Telefone inválido: *{{phone}}*\nUse apenas números com DDD e DDI.\nEx: 5511999999999',
  helpText: `🔧 *Painel do Dono — Comandos disponíveis*

*Motoboys:*
• \`motoboy add <nome> <telefone>\`
  _Adiciona um motoboy_
• \`motoboy remover <telefone>\`
  _Remove um motoboy_
• \`motoboys\`
  _Lista todos os motoboys_

*Pedidos:*
• \`pedidos\`
  _Últimos 10 pedidos_
• \`pedido <ID>\`
  _Detalhes de um pedido_

*Conversas:*
• \`reabrir <telefone>\`
  _Reabre conversa em handoff_

*Cardápio:*
• \`cardapio\`
  _Exibe o cardápio atual_

Digite \`ajuda\` a qualquer momento para ver esta lista.`,
  noMotoboys: '📋 Nenhum motoboy cadastrado.\nUse: `motoboy add <nome> <telefone>`',
  addUsage: '⚠️ Uso correto:\n`motoboy add <nome> <telefone>`\n\nEx: `motoboy add João 5511999999999`',
  addSuccess: '✅ *{{name}}* adicionado como motoboy!\nTelefone: {{phone}}',
  removeUsage: '⚠️ Uso correto:\n`motoboy remover <telefone>`\n\nEx: `motoboy remover 5511999999999`',
  motoboyNotFound: '⚠️ Motoboy com telefone *{{phone}}* não encontrado.\nUse `motoboys` para ver a lista.',
  removeSuccess: '🗑️ *{{name}}* removido com sucesso.',
  noOrders: '📋 Nenhum pedido encontrado.',
  orderNotFound: '⚠️ Pedido *#{{id}}* não encontrado.',
  conversationNotFound: '⚠️ Nenhuma conversa encontrada para *{{phone}}*.',
  conversationReopened: '✅ Conversa com *{{phone}}* reaberta. O cliente voltará a ser atendido pelo agente.',
  emptyMenu: '📋 Cardápio vazio. Atualize via POST /business.',
  unknownCommand: '❓ Comando não reconhecido: *{{cmd}}*\n\nDigite *ajuda* para ver os comandos disponíveis.',
  executionError: '❌ Erro ao executar comando: {{message}}',
} as const;

export const MOTOBOY_CONSTANTS = {
  cacheTtlMs: 60_000,
  escalationTimeoutMs: 5 * 60 * 1000,
  acceptWords: ['ok', 'sim', 'aceito', 'aceitar', 'pego', 'confirmo', 'quero'] as const,
  pendingDeliveries: 'Há {{count}} entrega(s) aguardando. Responda *OK <ID>* para aceitar.\nEx: OK ABC123',
  noPendingDelivery: 'Nenhuma entrega pendente no momento. Aguarde o próximo aviso! 👍',
  alreadyAccepted: '🏃 Essa entrega já foi aceita por outro motoboy. Aguarde o próximo!',
  deliveryConfirmed: '✅ *Entrega #{{orderId}} confirmada para você, {{motoboyName}}!*\n\n📦 {{items}}\n📍 {{address}}\n\nQuando concluir, responda *ENTREGUE {{orderId}}*. Boa corrida! 🛵💨',
  otherMotoboyAccepted: 'ℹ️ Pedido #{{orderId}} foi aceito. Aguarde o próximo!',
  customerOutForDelivery: '🛵 *Seu pedido saiu para entrega!*\nMotoboy: {{motoboyName}}\nChegando em breve! 😊',
  ownerAccepted: '🛵 Motoboy *{{motoboyName}}* aceitou o pedido #{{orderId}}.',
  completeNotFoundWithId: '⚠️ Não encontrei uma entrega aceita com o código #{{orderId}}.',
  completeNotFound: '⚠️ Você não possui nenhuma entrega aceita para concluir agora.',
  completeSuccess: '🎉 Entrega #{{orderId}} marcada como concluída! Obrigado!',
  customerDelivered: '✅ Entrega confirmada! Obrigado pela preferência. 😊',
  noRegisteredMotoboys: '⚠️ Pedido #{{orderId}} é uma entrega mas *não há motoboys cadastrados*!\nCadastre motoboys via /motoboys ou atribua manualmente.',
  escalationOwner: '⚠️ *Atenção! Nenhum motoboy aceitou a entrega em 5 minutos.*\n\nPedido: #{{orderId}}\n📦 {{items}}\n📍 {{address}}\n\nPor favor, atribua um motoboy manualmente.',
} as const;

export const REGEX_CONSTANTS = {
  phone: /^\d{10,15}$/,
  shortOrderId: /^[a-z0-9]{6}$/i,
  deliveredCommand: /^entregue\b/i,
  deliveredWithId: /ENTREGUE\s+([A-Z0-9]{6})/i,
} as const;

export function maskPhone(value: string) {
  const normalized = normalizePhone(value);
  if (normalized.length <= 4) return normalized;
  return `${'*'.repeat(Math.max(0, normalized.length - 4))}${normalized.slice(-4)}`;
}

export function getRequiredEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} não configurado`);
  }
  return value;
}

export function isAssistantToolCallsRole(role: string) {
  return role === AGENT_CONSTANTS.assistantToolCallsRole;
}

export function matchesOrderShortId(orderId: string, searchId: string) {
  return formatOrderShortId(orderId).toLowerCase() === searchId.trim().toLowerCase();
}

export function isMessageTooLong(value: string, maxLength: number) {
  return value.trim().length > maxLength;
}

export function isScheduledDateTooFar(scheduledAt: Date, maxDaysAhead: number) {
  return scheduledAt.getTime() > Date.now() + maxDaysAhead * 24 * 60 * 60 * 1000;
}

export function getPerBusinessExpiry(now: number, ttlMs: number) {
  return now + ttlMs;
}

export function getReconnectDelay(attempt: number) {
  return Math.min(30_000, 3_000 * 2 ** Math.max(0, attempt - 1));
}

export function canRetryConnection(attempt: number, maxAttempts: number) {
  return attempt < maxAttempts;
}

export function normalizeMessagePreview(response: string, maxLength: number) {
  return response.length > maxLength ? `${response.slice(0, maxLength)}...` : response;
}

export function buildCalendarConfigError() {
  return 'GOOGLE_SERVICE_ACCOUNT_JSON inválido';
}

export function buildOrderCancellationMessage(orderId: string) {
  return `Pedido #${orderId} cancelado`;
}

export function buildShortOrderLookupError() {
  return 'Pedido não encontrado';
}

export function buildInvalidPhoneError(fieldName: string) {
  return `${fieldName} inválido`;
}

export function buildMessageTooLongError(maxLength: number) {
  return `message deve ter no máximo ${maxLength} caracteres`;
}

export function buildConfigurationInProgressMessage() {
  return 'Sistema em configuração. Tente novamente em breve.';
}

export function buildNoBusinessConfiguredError() {
  return 'Negócio não configurado';
}

export function buildUnsupportedMessageTypeMessage() {
  return 'Por favor, envie mensagens de texto.';
}

export function renderTemplate(template: string, values: Record<string, string | number>) {
  return Object.entries(values).reduce(
    (result, [key, value]) => result.split(`{{${key}}}`).join(String(value)),
    template,
  );
}

export function formatCurrency(value: number) {
  return `R$ ${Number(value).toFixed(2)}`;
}

export function formatOrderShortId(orderId: string) {
  return orderId.slice(-6).toUpperCase();
}

export function isValidPhone(value: string) {
  return REGEX_CONSTANTS.phone.test(value);
}

export function isShortOrderId(value: string) {
  return REGEX_CONSTANTS.shortOrderId.test(value);
}

export function joinOrderItems(items: Array<{ quantity: number; name: string }>, separator = ', ') {
  return items.map(item => `${item.quantity}x ${item.name}`).join(separator);
}

export function joinBulletItems(items: Array<{ quantity: number; name: string }>) {
  return items.map(item => `• ${item.quantity}x ${item.name}`).join('\n');
}

export function joinPricedItems(items: Array<{ quantity: number; name: string; unitPrice: number }>) {
  return items.map(item => `• ${item.quantity}x ${item.name} = R$ ${(item.quantity * item.unitPrice).toFixed(2)}`).join('\n');
}

export function formatMotoboyListEntry(index: number, name: string, phone: string, active: boolean) {
  return `${index}. *${name}* — ${phone} ${active ? '✅' : '❌ inativo'}`;
}

export function formatOrderListEntry(orderId: string, total: number, date: string, emoji: string) {
  return `${emoji} #${formatOrderShortId(orderId)} — R$${Number(total).toFixed(2)} — ${date}`;
}

export function normalizePhone(value: string) {
  return value.replace(/[\s+\-()]/g, '');
}

export const ORDER_STATUS_EMOJI: Record<string, string> = {
  confirmed: '✅',
  pending: '⏳',
  cancelled: '❌',
  delivered: '🏁',
};

export const TIME_CONSTANTS = {
  saoPaulo: 'America/Sao_Paulo',
} as const;

export const SIMULATION_CONSTANTS = {
  businessId: 'business-test',
  ownerPhone: '5511999999999',
  sampleBusinessName: 'Salgaderia Teste',
} as const;

export const ERROR_MESSAGES = {
  missingDatabaseUrl: 'Environment variable not found: DATABASE_URL.',
} as const;

export const HTTP_CONSTANTS = {
  paymentApiBase: '/v1',
} as const;

export const LOG_MESSAGES = {
  ownerPanelError: 'Erro no painel do dono:',
  ownerPanelDatabaseUnavailable: 'Banco de dados indisponível no painel do dono.',
  motoboyFlowError: 'Erro no fluxo do motoboy:',
  motoboyDatabaseUnavailable: 'Banco de dados indisponível no fluxo do motoboy.',
} as const;

export const DELIVERY_CONSTANTS = {
  unavailableSchedule: 'A combinar',
} as const;

export const TRANSPORT_MESSAGES = {
  whatsappDisconnected: 'WhatsApp não conectado',
} as const;

export const GENERAL_CONSTANTS = {
  dynamicBusinessId: '__dynamic__',
} as const;

export const OWNER_COMMANDS = {
  help: ['ajuda', 'help', 'menu'],
  listMotoboys: ['motoboys', 'listar motoboys'],
  add: 'add',
  remove: ['remover', 'remove'],
  orders: 'pedidos',
  order: 'pedido',
  reopen: 'reabrir',
  menu: ['cardapio', 'cardápio'],
} as const;

export const MOTOBOY_MESSAGES = MOTOBOY_CONSTANTS;
export const APP_MESSAGES = {
  admin: ADMIN_MESSAGES,
  agent: AGENT_CONSTANTS,
  motoboy: MOTOBOY_CONSTANTS,
} as const;

export const PRISMA_DEPENDENT_COMMANDS = {
  owner: ['motoboy add', 'motoboys', 'pedido'],
} as const;

export const PATTERN_CONSTANTS = {
  ownerCommandSplit: /\s+/,
  stripPunctuationToWords: /[^\w\s]/g,
} as const;

export const NUMBER_CONSTANTS = {
  maxRecentOrders: 10,
  maxRecentCustomerOrders: 5,
  maxMessageLength: 1000,
  maxScheduledDaysAhead: 30,
  maxWhatsappReconnectAttempts: 5,
  messagePreviewLength: 80,
} as const;

export const ROUTING_CONSTANTS = {
  ownerPriority: 1,
  motoboyPriority: 2,
  customerPriority: 3,
} as const;

export const TEST_CONSTANTS = {
  validDeliveryPayload: '{"items":[{"name":"Coxinha","quantity":100,"unitPrice":1.5}],"deliveryType":"delivery","address":"Rua A, 123"}',
} as const;

export const COMMAND_EXAMPLES = {
  addMotoboy: 'motoboy add João 5511999999999',
  removeMotoboy: 'motoboy remover 5511999999999',
  acceptDelivery: 'OK ABC123',
  finishDelivery: 'ENTREGUE ABC123',
} as const;

export const OWNER_SUCCESS_MESSAGES = {
  addMotoboy: ADMIN_MESSAGES.addSuccess,
  removeMotoboy: ADMIN_MESSAGES.removeSuccess,
} as const;

export const OWNER_ERROR_MESSAGES = {
  invalidPhone: ADMIN_MESSAGES.invalidPhone,
  notFound: ADMIN_MESSAGES.motoboyNotFound,
} as const;

export const SHARED_FORMATS = {
  dateLocale: 'pt-BR',
} as const;

export const MENU_MESSAGES = {
  empty: ADMIN_MESSAGES.emptyMenu,
} as const;

export const HELP_MESSAGES = {
  owner: ADMIN_MESSAGES.helpText,
} as const;

export const SIMULATION_FLAGS = APP_FLAGS;

export const CONSTANTS_VERSION = 1;

export const APP_CONSTANTS = {
  flags: APP_FLAGS,
  agent: AGENT_CONSTANTS,
  admin: ADMIN_MESSAGES,
  motoboy: MOTOBOY_CONSTANTS,
  regex: REGEX_CONSTANTS,
} as const;

export const stringTemplates = {
  render: renderTemplate,
};

export const validators = {
  isValidPhone,
  isShortOrderId,
};

export const formatters = {
  currency: formatCurrency,
  orderShortId: formatOrderShortId,
};

export const normalizers = {
  phone: normalizePhone,
};

export const joiners = {
  orderItems: joinOrderItems,
  bulletItems: joinBulletItems,
  pricedItems: joinPricedItems,
};

export const builders = {
  motoboyListEntry: formatMotoboyListEntry,
  orderListEntry: formatOrderListEntry,
};

export const timezones = TIME_CONSTANTS;

export const simulation = SIMULATION_CONSTANTS;

export const logs = LOG_MESSAGES;

export const transport = TRANSPORT_MESSAGES;

export const general = GENERAL_CONSTANTS;

export const commands = OWNER_COMMANDS;

export const patterns = PATTERN_CONSTANTS;

export const numbers = NUMBER_CONSTANTS;

export const routing = ROUTING_CONSTANTS;

export const tests = TEST_CONSTANTS;

export const examples = COMMAND_EXAMPLES;

export const statuses = ORDER_STATUS_EMOJI;

export const errors = ERROR_MESSAGES;

export const http = HTTP_CONSTANTS;

export const delivery = DELIVERY_CONSTANTS;

export const prismaDependentCommands = PRISMA_DEPENDENT_COMMANDS;

export const sharedFormats = SHARED_FORMATS;

export const help = HELP_MESSAGES;

export const menu = MENU_MESSAGES;

export const ownerSuccess = OWNER_SUCCESS_MESSAGES;

export const ownerErrors = OWNER_ERROR_MESSAGES;

export const simulationFlags = SIMULATION_FLAGS;

export const version = CONSTANTS_VERSION;

export const app = APP_CONSTANTS;

export const messages = APP_MESSAGES;

export const motoboy = MOTOBOY_MESSAGES;

export const admin = ADMIN_MESSAGES;

export const agent = AGENT_CONSTANTS;

export const regex = REGEX_CONSTANTS;

export const renderers = stringTemplates;

export const utils = {
  renderTemplate,
  formatCurrency,
  formatOrderShortId,
  isValidPhone,
  isShortOrderId,
  joinOrderItems,
  joinBulletItems,
  joinPricedItems,
  formatMotoboyListEntry,
  formatOrderListEntry,
  normalizePhone,
  maskPhone,
  getRequiredEnv,
  isAssistantToolCallsRole,
  matchesOrderShortId,
  isMessageTooLong,
  isScheduledDateTooFar,
  getPerBusinessExpiry,
  getReconnectDelay,
  canRetryConnection,
  normalizeMessagePreview,
  buildCalendarConfigError,
  buildOrderCancellationMessage,
  buildShortOrderLookupError,
  buildInvalidPhoneError,
  buildMessageTooLongError,
  buildConfigurationInProgressMessage,
  buildNoBusinessConfiguredError,
  buildUnsupportedMessageTypeMessage,
};

export default APP_CONSTANTS;

export type OrderListItemInput = { quantity: number; name: string; unitPrice: number };
export type SimpleOrderItemInput = { quantity: number; name: string };
