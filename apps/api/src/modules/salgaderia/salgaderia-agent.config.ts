export const SALGADERIA_TOOL_NAMES = [
  'registrar_dados',
  'confirmar_pedido',
  'solicitar_handoff',
  'registrar_observacao',
] as const;

export type SalgaderiaToolName = typeof SALGADERIA_TOOL_NAMES[number];

export type SalgaderiaToolCall = {
  name: SalgaderiaToolName;
  arguments?: Record<string, any>;
};

export const SALGADERIA_AGENT_SCHEMA = {
  replyToCustomer: 'texto unico para o cliente',
  toolCalls: [
    {
      name: 'registrar_dados',
      arguments: {},
    },
  ],
  memoryUpdates: {
    etapaAtual: 'texto curto ou null',
    dados: {
      nome: 'string ou null',
      quantidade: 0,
      data_agendamento: 'YYYY-MM-DD ou null',
      data_exibicao: 'DD/MM/YYYY ou null',
      horario_agendamento: 'HH:MM ou null',
    },
    pendencias: ['lista curta do que ainda falta'],
    resumoInterno: 'resumo operacional curto ou null',
  },
  needsHuman: false,
  shouldCreateOrder: false,
} as const;

export const SALGADERIA_AGENT_FORMAT_RULES = [
  'Sua resposta deve comecar com { e terminar com }.',
  'Nenhum texto fora do JSON.',
  'Responda exclusivamente em JSON valido, sem texto adicional.',
  'A resposta ao cliente nao pode ser vazia.',
  'Nao escreva explicacoes fora do JSON.',
] as const;

export const SALGADERIA_AGENT_DECISION_RULES = [
  'Preencha memoryUpdates.dados apenas com fatos confirmados pelo cliente.',
  'Quando o cliente disser hoje, amanha ou depois de amanha, converta para datas absolutas.',
  'Se a mensagem for apenas saudacao, nao preencha dados de pedido e deixe pendencias vazias.',
  'Antes de fechar pedido, faca um resumo completo com nome, quantidade, data e horario e peca confirmacao explicita.',
  'Use shouldCreateOrder=true somente quando o cliente confirmar explicitamente esse resumo final.',
  'Nunca diga que o pedido esta pronto, saiu, foi produzido ou esta em preparo no momento da conversa.',
  'Nunca invente extras, arredondamentos quebrados ou frases como 25 + 5 extras.',
] as const;

export const SALGADERIA_AGENT_STYLE_RULES = [
  'replyToCustomer deve soar humano, natural e direto, nunca como manual, bot ou script.',
  'Evite agradecimentos, saudacoes longas, linguagem corporativa e frases como "obrigado por entrar em contato".',
  'Nao mencione WhatsApp, backend, ferramentas, memoria, regras internas, etapas ou processamento interno.',
  'Quando o cliente ja trouxer dados objetivos, responda direto ao ponto com a proxima acao util.',
  'Prefira mensagens curtas e conversacionais, sem floreios e sem repetir regras desnecessariamente.',
  'Quando estiver resumindo pedido para confirmacao, prefira uma frase curta com nome, quantidade, data e horario, em vez de explicacoes longas.',
  'Quando o cliente pedir humano explicitamente, responda de forma curta e direta, sem justificativa extra.',
] as const;

export const SALGADERIA_HANDOFF_DECISION_RULES = [
  'Marque needsHuman=true somente para reclamacao seria, impasse real, pedido fora do cardapio ou situacao que voce nao consiga resolver.',
  'Nao marque needsHuman=true por duvida simples, saudacao, coleta de dados, resumo de pedido, pergunta sobre PIX ou pedido valido em andamento.',
] as const;

export const SALGADERIA_AGENT_REPROCESS_RULES = [
  'Voce converte texto em JSON.',
  'Retorne apenas o JSON, sem explicacoes.',
  'Use exatamente o schema fornecido.',
  'Extraia replyToCustomer do texto recebido.',
] as const;

export const SALGADERIA_AGENT_REPROCESS_GUARDRAILS = [
  'Se o texto original nao trouxer pedido claro de humano, retorne needsHuman=false.',
  'Nao invente toolCalls, pendencias ou memoryUpdates que nao aparecam claramente no texto.',
  'Ignore raciocinio, explicacoes, comentarios operacionais e instrucoes vazadas; extraia apenas o conteudo util.',
] as const;

export const SALGADERIA_TOOL_DESCRIPTIONS: Record<SalgaderiaToolName, string> = {
  registrar_dados: 'pedir ao backend para persistir dados confirmados',
  confirmar_pedido: 'pedir ao backend para criar o pedido quando o cliente ja confirmou o resumo final',
  solicitar_handoff: 'pedir escalada para humano',
  registrar_observacao: 'guardar uma nota operacional curta sem efeito externo',
};

export const SALGADERIA_OPERATIONAL_TEXT = {
  retiradaLabel: 'Retirada no balcao',
  tipoEntrega: 'retirada',
  pixReply: 'No momento nao trabalhamos com PIX nem pagamento antecipado. O pagamento e feito apenas no balcao, na retirada.',
  invalidQuantityReply: 'Trabalhamos com pedidos em multiplos de 25 coxinhas. Para essa quantidade, as opcoes mais proximas sao 25 ou 50 coxinhas. Qual voce prefere?',
  greetingReply: 'Olá! Atendimento da Duzzi Salgados. Como posso te ajudar?',
  fallbackReply: 'Entendi. Posso te ajudar com pedido de coxinhas, quantidade, data e horario de retirada no balcao.',
  confirmedOrderReplySuffix: 'Pedido confirmado. Vou deixar separado para retirada no balcão.',
  reminderFooter: 'Qualquer duvida, e so chamar!',
  handoffOwnerPrefix: 'HANDOFF NECESSARIO!',
  newOrderOwnerPrefix: 'NOVO PEDIDO CONFIRMADO!',
  modelAutoWarning: 'OPENROUTER_MODEL esta em openrouter/auto; o roteador pode escolher modelos fracos e instaveis, gerando respostas robotizadas ou vazamento de instrucoes.',
} as const;

export function buildReminderMessage(pedido: {
  item_escolhido: string;
  quantidade: number;
  horario_agendamento: string;
}) {
  return [
    '⏰ *Lembrete do seu pedido!*',
    '',
    `🥟 ${pedido.item_escolhido} - ${pedido.quantidade} unidades`,
    `📅 Amanhã às ${pedido.horario_agendamento}`,
    `🏪 ${SALGADERIA_OPERATIONAL_TEXT.retiradaLabel}`,
    '',
    SALGADERIA_OPERATIONAL_TEXT.reminderFooter,
  ].join('\n');
}

export function buildCalendarEventDescription(pedido: {
  id: number;
  phone: string;
  item_escolhido: string;
  quantidade: number;
  valor_final: number;
}) {
  return [
    `Pedido #${pedido.id}`,
    `Telefone: ${pedido.phone}`,
    `Produto: ${pedido.item_escolhido}`,
    `Quantidade: ${pedido.quantidade} unidades`,
    SALGADERIA_OPERATIONAL_TEXT.retiradaLabel,
    `Valor: R$ ${Number(pedido.valor_final).toFixed(2)}`,
  ].join('\n');
}

export const SALGADERIA_PROMPT_SECTION_TITLES = {
  style: 'REGRAS DE ESTILO:',
  tools: 'FERRAMENTAS DISPONIVEIS:',
  schema: 'Formato obrigatorio:',
  decisions: 'Regras de decisao:',
  handoff: 'REGRAS DE ESCALADA HUMANA:',
} as const;

export const SALGADERIA_SYSTEM_REMINDERS = {
  latestMessagePriority: 'ULTIMA MENSAGEM DO CLIENTE (prioridade maxima):',
  recentHistory: 'HISTORICO RECENTE:',
} as const;

export const SALGADERIA_MODEL_PREFERENCES = {
  fallbackModel: 'openrouter/auto',
  discouragedAutoModel: 'openrouter/auto',
} as const;

export const SALGADERIA_PRIMARY_BEHAVIOR = {
  temperature: 0.2,
} as const;

export const SALGADERIA_REPROCESS_BEHAVIOR = {
  lowTemperature: 0.1,
} as const;

export const SALGADERIA_PARSING_BEHAVIOR = {
  fallbackNeedsHuman: false,
  fallbackShouldCreateOrder: false,
} as const;

export const SALGADERIA_CONFIG_DEFAULTS = [
  ['chave_pix', '', 'Chave PIX do estabelecimento'],
  ['endereco_salgaderia', '', 'Endereco da salgaderia'],
  ['telefone_responsavel', '', 'Telefone do responsavel humano'],
  ['valor_frete_padrao', '0', 'Valor padrao do frete por bairro/regiao'],
] as const;

export const SALGADERIA_FIXED_CONFIG_DESCRIPTIONS: Record<string, string | null> = {
  whatsapp_session_id: 'Sessao WhatsApp ativa da salgaderia',
};

export const SALGADERIA_REPLY_STYLE_BLOCKLIST = [
  'obrigado por entrar em contato',
  'via whatsapp',
  'gostaria de confirmar que você deseja',
  'gostaria de confirmar que voce deseja',
] as const;

export const SALGADERIA_CONFIRMATION_STYLE = {
  shortSummarySuffix: ' - confirma?',
  repairFallbackSuffix: 'confirma?',
} as const;

export function buildCalendarEventSummary(pedido: {
  id: number;
  item_escolhido: string;
  quantidade: number;
}) {
  return `🥟 Pedido #${pedido.id} - ${pedido.item_escolhido} (${pedido.quantidade} un)`;
}

export const SALGADERIA_EXPLICIT_HUMAN_KEYWORDS = [
  'humano',
  'atendente',
  'pessoa',
  'responsavel',
] as const;

export const SALGADERIA_NON_HUMAN_ESCALATION_KEYWORDS = [
  'pix',
  'oi',
  'ola',
  'olá',
  'bom dia',
  'boa tarde',
  'boa noite',
  'opa',
] as const;

export const SALGADERIA_REGEX = {
  pix: /\bpix\b/i,
  explicitConfirmation: /\b(confirmo|confirmado|pode confirmar|pode fechar|fechado|ok pode confirmar|sim confirmo|pode fazer)\b/i,
  introName: /meu nome|sou\s+/i,
  greeting: /^oi\b|^ol[aá]\b|bom dia|boa tarde|boa noite|opa/i,
  greetingResponse: /como posso ajudar|como posso te ajudar|dizer o que deseja|me diga o que deseja|o que deseja/i,
  readyOrderLeak: /est[aá] pronto|em preparo|saiu|pedido pronto/i,
  invalidExtrasLeak: /\b25\s*coxinhas\s*mais\s*5\s*extras\b|\b5\s*extras\b/i,
  invalidQuantityMention30: /\b30\b/i,
  validQuantityExplanation: /25 ou 50|multiplos? de 25/i,
  badInstructionLeak: /valor total será|digite "confirmado"|seguido do número de telefone/i,
  metaTextLeak: /based on the context|based on the given context|this response acknowledges|response:\s*|if the client/i,
  orderJsonLeak: /replyToCustomer|toolCalls|memoryUpdates|shouldCreateOrder|needsHuman/i,
  contactLeak: /n[uú]mero de telefone|n[uú]mero para contato|telefone para contato|seu telefone/i,
  markdownJsonFenceStart: /^```\w*\s*/i,
  markdownJsonFenceEnd: /```\s*$/i,
  assistantPrefix: /^Atendente:\s*/i,
  embeddedReplyJsonPrefix: /^\s*\{[\s\S]*"replyToCustomer"\s*:\s*"/i,
  embeddedReplyJsonSuffix: /"\s*,\s*"toolCalls"[\s\S]*$/i,
  quantityNumber: /\b(\d+)\b/,
  forbiddenDeliveryTerms: /entrega|motoboy|frete|delivery|endere[cç]o/i,
} as const;

export const SALGADERIA_ETAPAS_VALIDAS = [
  'inicio',
  'boas_vindas',
  'entender_pedido',
  'coletar_nome',
  'coletar_data',
  'coletar_horario',
  'aguardando_nome',
  'aguardando_quantidade_valida',
  'aguardando_quantidade_e_nome',
  'aguardando_confirmacao_final',
  'confirmacao',
  'handoff',
  'handoff_humano_com_dados_parciais',
  'pedido_confirmado',
  'finalizado',
] as const;

export type SalgaderiaEtapa = typeof SALGADERIA_ETAPAS_VALIDAS[number];

export const SALGADERIA_LEGACY_ETAPAS = [
  'coletar_tipo_entrega',
  'coletar_endereco',
  'coletar_pagamento',
] as const;

export function sanitizeAgentReplyText(reply: string) {
  return reply
    .replace(SALGADERIA_REGEX.markdownJsonFenceStart, '')
    .replace(SALGADERIA_REGEX.markdownJsonFenceEnd, '')
    .replace(SALGADERIA_REGEX.embeddedReplyJsonPrefix, '')
    .replace(SALGADERIA_REGEX.embeddedReplyJsonSuffix, '')
    .replace(SALGADERIA_REGEX.assistantPrefix, '')
    .replace(/^based on the context[\s\S]*?response:\s*/i, '')
    .replace(/^based on the given context[\s\S]*?response:\s*/i, '')
    .replace(/^response:\s*/i, '')
    .replace(/^if the client[\s\S]*$/i, '')
    .replace(/^this response acknowledges[\s\S]*$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function isBadReplyPayload(reply: string) {
  return Boolean(
    !reply
    || reply.includes('{')
    || reply.includes('"toolCalls"')
    || reply.includes('"memoryUpdates"')
    || SALGADERIA_REGEX.forbiddenDeliveryTerms.test(reply)
    || SALGADERIA_REGEX.orderJsonLeak.test(reply)
    || SALGADERIA_REGEX.contactLeak.test(reply)
    || SALGADERIA_REGEX.metaTextLeak.test(reply),
  );
}

export function normalizeToolArguments(argumentsValue: unknown) {
  return argumentsValue && typeof argumentsValue === 'object' && !Array.isArray(argumentsValue)
    ? argumentsValue as Record<string, any>
    : {};
}

export function normalizePendencias(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item) => typeof item === 'string' && item.trim())
    : [];
}

export function normalizeResumoInterno(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export function normalizeShouldCreateOrder(value: unknown) {
  return Boolean(value);
}

export function normalizeNeedsHuman(value: unknown) {
  return Boolean(value);
}

export function shouldDropForbiddenOrderFields(dados: Record<string, any>) {
  return SALGADERIA_REGEX.forbiddenDeliveryTerms.test(JSON.stringify(dados));
}

export function buildRuntimePrompt(baseScript: string, config: Record<string, string>) {
  return baseScript
    .replace(/\[INSERIR CHAVE PIX\]/g, config.chave_pix || 'nao configurada')
    .replace(/\[INSERIR n[\u00fa]mero do humano de backup\]/g, config.telefone_responsavel || 'nao configurado')
    .replace(/\[INSERIR por bairro\/regi[\u00e3]o\]/g, config.valor_frete_padrao || 'nao configurado')
    .replace(/\[INSERIR\]/g, config.endereco_salgaderia || 'nao configurado');
}

export function buildPromptSections(baseScript: string, config: Record<string, string>) {
  return [
    buildRuntimePrompt(baseScript, config),
    buildStylePrompt(),
    buildOutputSchemaPrompt(),
    buildToolPrompt(),
    buildHandoffPrompt(),
  ];
}

export function extractRequestedQuantity(texto: string) {
  if (typeof texto !== 'string' || !texto.trim()) return null;
  const quantidadeNaMensagem = texto.match(SALGADERIA_REGEX.quantityNumber);
  return quantidadeNaMensagem ? Number(quantidadeNaMensagem[1]) : null;
}

export function isEtapaValida(etapa?: string | null): etapa is SalgaderiaEtapa {
  return Boolean(etapa && SALGADERIA_ETAPAS_VALIDAS.includes(etapa as SalgaderiaEtapa));
}

export function normalizeEtapa(etapa?: string | null, fallback: SalgaderiaEtapa = 'inicio'): SalgaderiaEtapa {
  return isEtapaValida(etapa) ? etapa : fallback;
}

export function normalizeNome(value: unknown, fallback: string | null = null) {
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (Array.isArray(value)) {
    const firstString = value.find((item) => typeof item === 'string' && item.trim());
    if (typeof firstString === 'string') return firstString.trim();
  }
  return fallback;
}

export function hasCompleteOrderData(dados: Record<string, any>) {
  return Boolean(
    dados.nome
    && dados.quantidade
    && dados.data_agendamento
    && dados.horario_agendamento,
  );
}

export function shouldForcePixReply(texto: string, reply: string = '') {
  const lowerTexto = (texto || '').toLowerCase();
  const lowerReply = (reply || '').toLowerCase();
  if (!SALGADERIA_REGEX.pix.test(lowerTexto)) return false;
  const hasOrderContext = Boolean(
    /\b(\d+)\b/.test(lowerTexto)
    || /amanh[aã]|depois de amanh[aã]|hoje|\b\d{1,2}:\d{2}\b/i.test(lowerTexto)
    || SALGADERIA_REGEX.introName.test(lowerTexto)
    || SALGADERIA_REGEX.explicitConfirmation.test(lowerTexto)
  );
  if (hasOrderContext) return false;
  return !/nao trabalhamos com pix|pagamento antecipado|balcao/.test(lowerReply);
}

export function shouldForceConfirmationReply(texto: string, dados: Record<string, any>, shouldCreateOrder: boolean = false) {
  return !shouldCreateOrder && SALGADERIA_REGEX.introName.test(texto) && hasCompleteOrderData(dados);
}

export function shouldForceInvalidQuantityReply(texto: string, reply: string = '') {
  const quantidadeSolicitada = extractRequestedQuantity(texto);
  if (!(quantidadeSolicitada && quantidadeSolicitada % 25 !== 0)) return false;
  const lowerReply = (reply || '').toLowerCase();
  return !SALGADERIA_REGEX.validQuantityExplanation.test(lowerReply);
}

export function shouldSuppressHandoff(texto: string) {
  const lower = (texto || '').toLowerCase();
  if (!lower.trim()) return true;
  if (SALGADERIA_REGEX.pix.test(lower)) return true;
  return SALGADERIA_NON_HUMAN_ESCALATION_KEYWORDS.some((keyword) => lower.includes(keyword));
}

export function shouldAllowNeedsHuman(texto: string) {
  const lower = (texto || '').toLowerCase();
  if (!lower.trim()) return false;
  if (shouldSuppressHandoff(lower)) return false;
  return SALGADERIA_EXPLICIT_HUMAN_KEYWORDS.some((keyword) => lower.includes(keyword));
}

export function isGreetingReply(reply: string) {
  return SALGADERIA_REGEX.greeting.test(reply) && SALGADERIA_REGEX.greetingResponse.test(reply);
}

export function buildOwnerHandoffMessage(phone: string, text: string) {
  return `${SALGADERIA_OPERATIONAL_TEXT.handoffOwnerPrefix}\n\nCliente ${phone} precisa de atendimento humano.\n\nUltima mensagem: "${text}"`;
}

export function buildOwnerNewOrderMessage(resumo: string) {
  return `${SALGADERIA_OPERATIONAL_TEXT.newOrderOwnerPrefix}\n\n${resumo}`;
}

export function buildConfirmationReply(dados: {
  nome?: string | null;
  quantidade?: number | null;
  data_exibicao?: string | null;
  data_agendamento?: string | null;
  horario_agendamento?: string | null;
}) {
  const dataExibicao = dados.data_exibicao || dados.data_agendamento;
  return `${dados.nome}, ${dados.quantidade} coxinhas para ${dataExibicao} as ${dados.horario_agendamento}${SALGADERIA_CONFIRMATION_STYLE.shortSummarySuffix}`;
}

export function buildOrderSummaryParts(dados: {
  nome?: string | null;
  quantidade?: number | null;
  data_exibicao?: string | null;
  data_agendamento?: string | null;
  horario_agendamento?: string | null;
}) {
  return [
    dados.nome,
    dados.quantidade ? `${dados.quantidade} coxinhas` : null,
    dados.data_exibicao || dados.data_agendamento,
    dados.horario_agendamento ? `as ${dados.horario_agendamento}` : null,
  ].filter(Boolean);
}

export function buildStylePrompt() {
  return [
    SALGADERIA_PROMPT_SECTION_TITLES.style,
    ...SALGADERIA_AGENT_STYLE_RULES.map((rule) => `- ${rule}`),
  ].join('\n');
}

export function buildOutputSchemaPrompt() {
  return [
    ...SALGADERIA_AGENT_FORMAT_RULES,
    SALGADERIA_PROMPT_SECTION_TITLES.schema,
    JSON.stringify(SALGADERIA_AGENT_SCHEMA),
    SALGADERIA_PROMPT_SECTION_TITLES.decisions,
    ...SALGADERIA_AGENT_DECISION_RULES.map((rule) => `- ${rule}`),
  ].join('\n');
}

export function buildToolPrompt() {
  return [
    SALGADERIA_PROMPT_SECTION_TITLES.tools,
    ...SALGADERIA_TOOL_NAMES.map((toolName) => `- ${toolName}: ${SALGADERIA_TOOL_DESCRIPTIONS[toolName]}`),
  ].join('\n');
}

export function buildHandoffPrompt() {
  return [
    SALGADERIA_PROMPT_SECTION_TITLES.handoff,
    ...SALGADERIA_HANDOFF_DECISION_RULES.map((rule) => `- ${rule}`),
  ].join('\n');
}

export function buildReprocessSystemPrompt(todayIso: string) {
  return [
    ...SALGADERIA_AGENT_REPROCESS_RULES,
    ...SALGADERIA_AGENT_REPROCESS_GUARDRAILS,
    `Hoje e ${todayIso}.`,
    'Schema obrigatorio:',
    JSON.stringify(SALGADERIA_AGENT_SCHEMA),
  ].join('\n');
}
