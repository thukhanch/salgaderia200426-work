import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import {
  buildConfirmationReply,
  buildOrderSummaryParts,
  buildPromptSections,
  buildReprocessSystemPrompt,
  buildRuntimePrompt,
  isBadReplyPayload,
  isGreetingReply,
  normalizeEtapa,
  normalizeNeedsHuman,
  normalizeNome,
  normalizePendencias,
  normalizeResumoInterno,
  normalizeShouldCreateOrder,
  normalizeToolArguments,
  SALGADERIA_CONFIRMATION_STYLE,
  SALGADERIA_MODEL_PREFERENCES,
  SALGADERIA_OPERATIONAL_TEXT,
  SALGADERIA_PRIMARY_BEHAVIOR,
  SALGADERIA_REGEX,
  SALGADERIA_REPROCESS_BEHAVIOR,
  SALGADERIA_REPLY_STYLE_BLOCKLIST,
  SALGADERIA_SYSTEM_REMINDERS,
  SALGADERIA_TOOL_NAMES,
  sanitizeAgentReplyText,
  SalgaderiaToolCall,
  SalgaderiaToolName,
  shouldDropForbiddenOrderFields,
  shouldAllowNeedsHuman,
} from './salgaderia-agent.config';

type AtendimentoState = {
  etapaAtual: string;
  dados: Record<string, any>;
  historico: Array<{ role: 'user' | 'assistant'; content: string; timestamp?: string }>;
  config: Record<string, string>;
  clientePhone: string;
  memoriaOperacional?: {
    retomandoContato: boolean;
    novoPedidoProvavel: boolean;
    horasSemInteracao: number;
    pedidoEmAberto: boolean;
    nomeCliente?: string | null;
    resumoDadosConfirmados: string[];
    pendencias: string[];
    ultimoResumoPedido?: string | null;
  };
};

export type AtendimentoAiResult = {
  replyToCustomer: string;
  toolCalls: SalgaderiaToolCall[];
  memoryUpdates: {
    etapaAtual?: string | null;
    dados?: Record<string, any>;
    pendencias?: string[];
    resumoInterno?: string | null;
  };
  needsHuman?: boolean;
  shouldCreateOrder?: boolean;
};

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private readonly apiKey = process.env.AI_API_KEY || process.env.OPENROUTER_API_KEY;
  private readonly model = process.env.AI_MODEL || process.env.OPENROUTER_MODEL || SALGADERIA_MODEL_PREFERENCES.fallbackModel;
  private readonly baseUrl = (process.env.AI_BASE_URL || 'https://openrouter.ai/api/v1').replace(/\/$/, '') + '/chat/completions';
  private readonly providerLabel = process.env.AI_BASE_URL ? 'AI backend' : 'OpenRouter';
  private readonly shouldSendOpenRouterHeaders = !process.env.AI_BASE_URL;

  private buildRequestHeaders() {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json',
    };

    if (this.shouldSendOpenRouterHeaders) {
      headers['HTTP-Referer'] = 'http://localhost:3000';
      headers['X-Title'] = 'Whatsapp Flow Salgaderia';
    }

    return headers;
  }

  private buildReprocessHeaders() {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json',
    };

    if (this.shouldSendOpenRouterHeaders) {
      headers['HTTP-Referer'] = 'http://localhost:3000';
      headers['X-Title'] = 'Duzzi Salgados';
    }

    return headers;
  }

  private logProviderConfiguration() {
    this.logger.log(`${this.providerLabel} endpoint: ${this.baseUrl}`);
    this.logger.log(`${this.providerLabel} model: ${this.model}`);
  }

  private logPromptAudit(systemContent: string, userContent: string) {
    this.logger.log(`PROMPT SYSTEM >>> ${systemContent}`);
    this.logger.log(`PROMPT USER >>> ${userContent}`);
  }

  private logOutputAudit(content: string, parsed: unknown) {
    this.logger.log(`PROMPT RAW OUTPUT >>> ${content}`);
    this.logger.log(`PROMPT PARSED OUTPUT >>> ${JSON.stringify(parsed)}`);
  }

  private logFinalAudit(result: AtendimentoAiResult) {
    this.logger.log(`PROMPT FINAL OUTPUT >>> ${JSON.stringify(result)}`);
  }

  private logPromptWarnings() {
    if (this.model === SALGADERIA_MODEL_PREFERENCES.discouragedAutoModel) {
      this.logger.warn(SALGADERIA_OPERATIONAL_TEXT.modelAutoWarning);
    }
  }

  private trimPayloadForLog(text: string) {
    return text.length > 12000 ? `${text.slice(0, 12000)}...[truncated]` : text;
  }

  private logAuditSnapshot(systemContent: string, userContent: string) {
    this.logProviderConfiguration();
    this.logPromptWarnings();
    this.logPromptAudit(this.trimPayloadForLog(systemContent), this.trimPayloadForLog(userContent));
  }

  private logModelSelection() {
    this.logProviderConfiguration();
    this.logPromptWarnings();
  }

  private ensureApiConfiguration() {
    if (!this.apiKey) {
      throw new Error('AI_API_KEY/OPENROUTER_API_KEY nao configurada');
    }
  }

  private getUserPrompt(userMessage: string) {
    return [
      'Mensagem real do cliente:',
      userMessage || '(vazia)',
      'Responda com naturalidade e devolva somente o JSON do schema.',
    ].join('\n');
  }

  private buildChatMessages(systemContent: string, userPrompt: string) {
    return [
      { role: 'system' as const, content: systemContent },
      { role: 'user' as const, content: userPrompt },
    ];
  }

  private buildMainRequestBody(chatMessages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>) {
    return {
      model: this.model,
      temperature: SALGADERIA_PRIMARY_BEHAVIOR.temperature,
      messages: chatMessages,
    };
  }

  private buildReprocessRequestBody(content: string, hojeIso: string) {
    return {
      model: this.model,
      temperature: SALGADERIA_REPROCESS_BEHAVIOR.lowTemperature,
      messages: [
        {
          role: 'system' as const,
          content: buildReprocessSystemPrompt(hojeIso),
        },
        {
          role: 'user' as const,
          content: `Converta para JSON: "${content}"`,
        },
      ],
    };
  }

  private buildAxiosConfig(headers: Record<string, string>, timeout: number) {
    return { headers, timeout };
  }

  private buildFallbackParsed(replyToCustomer: string) {
    return {
      replyToCustomer,
      toolCalls: [],
      memoryUpdates: {},
      needsHuman: false,
      shouldCreateOrder: false,
    };
  }

  private defaultParsedFallback() {
    return {
      replyToCustomer: SALGADERIA_OPERATIONAL_TEXT.fallbackReply,
      toolCalls: [],
      memoryUpdates: {},
      needsHuman: false,
      shouldCreateOrder: false,
    };
  }

  private coerceNonJsonToSchema(rawRecoveredReply: string) {
    return JSON.stringify(this.buildFallbackParsed(rawRecoveredReply));
  }

  private parseContent(content: string) {
    const repairJson = (raw: string): string => {
      let out = '';
      let inString = false;
      for (let i = 0; i < raw.length; i++) {
        const ch = raw[i];
        const prev = i > 0 ? raw[i - 1] : '';
        if (ch === '"' && prev !== '\\') inString = !inString;
        else if (inString && (ch === '\n' || ch === '\r')) {
          out += '\\n';
          continue;
        }
        out += ch;
      }
      return out;
    };

    const extractJsonCandidate = (raw: string) => {
      const trimmed = raw.trim();
      const firstBrace = trimmed.indexOf('{');
      const lastBrace = trimmed.lastIndexOf('}');
      if (firstBrace >= 0 && lastBrace > firstBrace) {
        return trimmed.slice(firstBrace, lastBrace + 1);
      }
      return trimmed;
    };

    return JSON.parse(repairJson(extractJsonCandidate(content)));
  }

  private applyParsedNormalization(parsed: any, state: AtendimentoState, userMessage: string) {
    parsed.replyToCustomer = this.normalizeReplyToCustomer(parsed.replyToCustomer);
    parsed.memoryUpdates = this.normalizeMemoryUpdates(parsed.memoryUpdates, state);
    parsed.toolCalls = this.sanitizeToolCalls(parsed.toolCalls || []);
    parsed.needsHuman = this.resolveNeedsHuman(parsed.needsHuman, userMessage);
    parsed.shouldCreateOrder = normalizeShouldCreateOrder(parsed.shouldCreateOrder);

    if (!parsed.memoryUpdates) parsed.memoryUpdates = {};
    if (!parsed.toolCalls) parsed.toolCalls = [];
    if (parsed.dados) {
      parsed.memoryUpdates.dados = parsed.dados;
      delete parsed.dados;
    }

    return parsed;
  }

  private normalizeResponseContent(content: string) {
    return content.replace(/^```\w*\s*/i, '').replace(/```\s*$/i, '').trim().replace(/\\_/g, '_');
  }

  private sanitizeParsedResult(parsed: AtendimentoAiResult, state: AtendimentoState) {
    const result = this.sanitizeAiResult(parsed, state);
    this.logFinalAudit(result);
    return result;
  }

  private fetchContent = async (body: any, headers: Record<string, string>, timeout: number) => {
    const response = await axios.post(this.baseUrl, body, this.buildAxiosConfig(headers, timeout));
    this.logger.log(`${this.providerLabel} full response: ${JSON.stringify(response.data)}`);
    return response.data?.choices?.[0]?.message?.content;
  };

  private normalizePromptBlocks(systemContent: string, userPrompt: string) {
    return {
      systemContent: this.trimPayloadForLog(systemContent),
      userPrompt: this.trimPayloadForLog(userPrompt),
    };
  }

  private getSystemContent(state: AtendimentoState, systemPrompt: string, hojeIso: string, userMessage: string, historicoRecente: string) {
    const contextMsg = [
      `Data atual: ${hojeIso}`,
      `Cliente: ${state.clientePhone}`,
      `Etapa: ${state.etapaAtual || 'sem marcador'}`,
      `Dados persistidos: ${JSON.stringify(state.dados || {})}`,
      `Memoria operacional: ${JSON.stringify(state.memoriaOperacional || {})}`,
      'Use esse contexto apenas para decidir. Nunca repita esse bloco ao cliente.',
    ].join('\n');

    return [
      ...buildPromptSections(systemPrompt, state.config),
      contextMsg,
      SALGADERIA_SYSTEM_REMINDERS.recentHistory,
      historicoRecente || 'primeira mensagem',
      `${SALGADERIA_SYSTEM_REMINDERS.latestMessagePriority} ${userMessage || '(vazia)'}`,
    ].join('\n\n');
  }

  private getRecentHistory(state: AtendimentoState) {
    return state.historico.slice(-6)
      .map(m => `${m.role === 'user' ? 'Cliente' : 'Atendente'}: ${m.content}`)
      .join('\n');
  }

  private parseOrFallback(content: string, rawRecoveredReply: string) {
    try {
      return this.parseContent(content);
    } catch {
      return this.defaultParsedFallback();
    }
  }

  private ensureJsonEnvelope(content: string, rawRecoveredReply: string) {
    if (!content.trim().startsWith('{')) {
      return this.coerceNonJsonToSchema(rawRecoveredReply);
    }
    return content;
  }

  private shouldReprocessContent(content: string, rawRecoveredReply: string) {
    return !content.trim().startsWith('{') || this.isInvalidRecoveredReply(rawRecoveredReply);
  }

  private async maybeReprocessContent(content: string, hojeIso: string) {
    const reprocessed = await this.fetchContent(
      this.buildReprocessRequestBody(content, hojeIso),
      this.buildReprocessHeaders(),
      30000,
    );
    return this.normalizeResponseContent(reprocessed || content);
  }

  private logContentStages(content: string, parsed: unknown) {
    this.logOutputAudit(this.trimPayloadForLog(content), parsed);
  }

  private normalizeIncomingContent(content: string | undefined) {
    if (!content) {
      throw new Error(`${this.providerLabel} retornou resposta vazia`);
    }
    return this.normalizeResponseContent(content);
  }

  private getSystemPrompt(config: Record<string, string>) {
    return this.buildSystemPrompt(config);
  }

  private getCurrentDateIso() {
    return new Date().toISOString().slice(0, 10);
  }

  private getTrimmedUserMessage(message: string) {
    return typeof message === 'string' ? message.trim() : '';
  }

  private buildAuditReadyPrompts(state: AtendimentoState, message: string) {
    const systemPrompt = this.getSystemPrompt(state.config);
    const hojeIso = this.getCurrentDateIso();
    const historicoRecente = this.getRecentHistory(state);
    const userMessage = this.getTrimmedUserMessage(message);
    const systemContent = this.getSystemContent(state, systemPrompt, hojeIso, userMessage, historicoRecente);
    const userPrompt = this.getUserPrompt(userMessage);
    return { systemPrompt, hojeIso, historicoRecente, userMessage, systemContent, userPrompt };
  }

  private getPromptDiagnostics(state: AtendimentoState, message: string) {
    const { systemContent, userPrompt } = this.buildAuditReadyPrompts(state, message);
    return this.normalizePromptBlocks(systemContent, userPrompt);
  }

  private buildMainChatPayload(state: AtendimentoState, message: string) {
    const { hojeIso, userMessage, systemContent, userPrompt } = this.buildAuditReadyPrompts(state, message);
    this.logAuditSnapshot(systemContent, userPrompt);
    return {
      hojeIso,
      userMessage,
      systemContent,
      userPrompt,
      chatMessages: this.buildChatMessages(systemContent, userPrompt),
    };
  }

  private buildPromptAuditResult(state: AtendimentoState, message: string) {
    return this.getPromptDiagnostics(state, message);
  }

  private logPromptAuditFromState(state: AtendimentoState, message: string) {
    const audit = this.buildPromptAuditResult(state, message);
    this.logPromptAudit(audit.systemContent, audit.userPrompt);
  }

  private getProviderLabel() {
    return this.providerLabel;
  }

  private getBaseUrl() {
    return this.baseUrl;
  }

  private getModel() {
    return this.model;
  }

  private getHeaders() {
    return this.buildRequestHeaders();
  }

  private getReprocessHeaders() {
    return this.buildReprocessHeaders();
  }

  private getApiKey() {
    return this.apiKey;
  }

  private getShouldSendOpenRouterHeaders() {
    return this.shouldSendOpenRouterHeaders;
  }

  private getMainTemperature() {
    return SALGADERIA_PRIMARY_BEHAVIOR.temperature;
  }

  private getReprocessTemperature() {
    return SALGADERIA_REPROCESS_BEHAVIOR.lowTemperature;
  }

  private getModelPreferenceWarning() {
    return SALGADERIA_OPERATIONAL_TEXT.modelAutoWarning;
  }

  private getModelPreference() {
    return SALGADERIA_MODEL_PREFERENCES;
  }

  private getReplyStyleBlocklist() {
    return SALGADERIA_REPLY_STYLE_BLOCKLIST;
  }

  private getSystemReminders() {
    return SALGADERIA_SYSTEM_REMINDERS;
  }

  private getRegex() {
    return SALGADERIA_REGEX;
  }

  private getOperationalText() {
    return SALGADERIA_OPERATIONAL_TEXT;
  }

  private getPromptSections(systemPrompt: string, config: Record<string, string>) {
    return buildPromptSections(systemPrompt, config);
  }

  private getRuntimePrompt(baseScript: string, config: Record<string, string>) {
    return buildRuntimePrompt(baseScript, config);
  }

  private getReprocessPrompt(hojeIso: string) {
    return buildReprocessSystemPrompt(hojeIso);
  }

  private getOrderSummaryParts(dados: Record<string, any>) {
    return buildOrderSummaryParts(dados);
  }

  private getConfirmationReply(dados: Record<string, any>) {
    return buildConfirmationReply(dados);
  }

  private getToolNames() {
    return SALGADERIA_TOOL_NAMES;
  }

  private getPromptAuditSnapshot(state: AtendimentoState, message: string) {
    return this.buildPromptAuditResult(state, message);
  }

  private getPromptAuditLog(state: AtendimentoState, message: string) {
    return this.getPromptAuditSnapshot(state, message);
  }

  private getPromptAuditSystem(state: AtendimentoState, message: string) {
    return this.getPromptAuditSnapshot(state, message).systemContent;
  }

  private getPromptAuditUser(state: AtendimentoState, message: string) {
    return this.getPromptAuditSnapshot(state, message).userPrompt;
  }

  private getPromptAuditProvider() {
    return {
      providerLabel: this.getProviderLabel(),
      baseUrl: this.getBaseUrl(),
      model: this.getModel(),
      sendsOpenRouterHeaders: this.getShouldSendOpenRouterHeaders(),
    };
  }

  private getPromptAuditComposite(state: AtendimentoState, message: string) {
    return {
      ...this.getPromptAuditProvider(),
      ...this.getPromptAuditSnapshot(state, message),
    };
  }

  private validateProvider() {
    this.ensureApiConfiguration();
  }

  async responderMensagem(message: string, state: AtendimentoState): Promise<AtendimentoAiResult> {
    this.validateProvider();

    const { hojeIso, userMessage, chatMessages } = this.buildMainChatPayload(state, message);

    try {
      let content = await this.fetchContent(
        this.buildMainRequestBody(chatMessages),
        this.buildRequestHeaders(),
        45000,
      );

      content = this.normalizeIncomingContent(content);
      const rawRecoveredReply = this.normalizeReplyToCustomer(content);

      if (this.shouldReprocessContent(content, rawRecoveredReply)) {
        this.logger.log('Resposta invalida para consumo direto, reprocessando...');
        content = await this.maybeReprocessContent(content, hojeIso);
      }

      content = this.ensureJsonEnvelope(content, rawRecoveredReply);
      let parsed = this.parseOrFallback(content, rawRecoveredReply);
      parsed = this.applyParsedNormalization(parsed, state, userMessage);
      this.logContentStages(content, parsed);

      return this.sanitizeParsedResult(parsed as AtendimentoAiResult, state);
    } catch (error: any) {
      this.logger.error(`Falha ao executar motor de IA: ${error?.message ?? error}`);
      throw error;
    }
  }

  private normalizeReplyToCustomer(rawReply: unknown) {
    const reply = typeof rawReply === 'string' ? rawReply : SALGADERIA_OPERATIONAL_TEXT.fallbackReply;
    const normalized = sanitizeAgentReplyText(reply);

    if (isBadReplyPayload(normalized)) {
      return SALGADERIA_OPERATIONAL_TEXT.fallbackReply;
    }

    return normalized;
  }

  private isInvalidRecoveredReply(reply: string) {
    return isBadReplyPayload(reply) || !reply.trim();
  }

  private normalizeMemoryUpdates(memoryUpdates: AtendimentoAiResult['memoryUpdates'] | undefined, state: AtendimentoState) {
    const current = memoryUpdates || {};
    const dadosAtuais = state.dados || {};
    const dadosBrutos = current.dados && typeof current.dados === 'object' ? current.dados : {};

    return {
      ...current,
      etapaAtual: normalizeEtapa(typeof current.etapaAtual === 'string' ? current.etapaAtual : null, normalizeEtapa(state.etapaAtual || 'inicio')),
      dados: {
        ...dadosBrutos,
        nome: normalizeNome(dadosBrutos.nome, dadosAtuais.nome || null),
      },
      pendencias: normalizePendencias(current.pendencias),
      resumoInterno: normalizeResumoInterno(current.resumoInterno),
    };
  }

  private sanitizeAiResult(parsed: AtendimentoAiResult, state: AtendimentoState): AtendimentoAiResult {
    const rawReply = typeof parsed.replyToCustomer === 'string' ? parsed.replyToCustomer.trim() : '';
    if (!rawReply) {
      throw new Error('Motor de IA retornou replyToCustomer vazio');
    }

    const sanitizedDados = this.sanitizeDados(parsed.memoryUpdates?.dados || {}, state.dados || {});
    const replyToCustomer = this.sanitizeReply(rawReply, sanitizedDados);
    const isGreetingOnly = this.isGreetingOnly(state, sanitizedDados, replyToCustomer);

    return {
      replyToCustomer,
      toolCalls: isGreetingOnly ? [] : this.sanitizeToolCalls(parsed.toolCalls || []),
      memoryUpdates: {
        etapaAtual: isGreetingOnly
          ? normalizeEtapa(state.etapaAtual || 'inicio')
          : normalizeEtapa(parsed.memoryUpdates?.etapaAtual, normalizeEtapa(state.etapaAtual || 'inicio')),
        dados: isGreetingOnly ? (state.dados || {}) : sanitizedDados,
        pendencias: isGreetingOnly ? [] : normalizePendencias(parsed.memoryUpdates?.pendencias),
        resumoInterno: isGreetingOnly ? null : normalizeResumoInterno(parsed.memoryUpdates?.resumoInterno),
      },
      needsHuman: Boolean(parsed.needsHuman) && !isGreetingOnly,
      shouldCreateOrder: Boolean(parsed.shouldCreateOrder) && !isGreetingOnly,
    };
  }

  private sanitizeReply(reply: string, dados: Record<string, any>): string {
    const normalized = this.normalizeReplyStyle(sanitizeAgentReplyText(reply), dados);
    const lower = normalized.toLowerCase();

    if (this.isInvalidRecoveredReply(normalized)) {
      const partes = buildOrderSummaryParts(dados);
      if (partes.length > 0) {
        return buildConfirmationReply(dados);
      }
      return SALGADERIA_OPERATIONAL_TEXT.fallbackReply;
    }

    if (SALGADERIA_REGEX.invalidExtrasLeak.test(lower)) {
      return SALGADERIA_OPERATIONAL_TEXT.invalidQuantityReply;
    }

    if (SALGADERIA_REGEX.readyOrderLeak.test(lower)) {
      const partes = buildOrderSummaryParts(dados);
      if (partes.length > 0) {
        return buildConfirmationReply(dados);
      }
      return normalized.replace(SALGADERIA_REGEX.readyOrderLeak, SALGADERIA_CONFIRMATION_STYLE.repairFallbackSuffix);
    }

    if (SALGADERIA_REGEX.pix.test(lower) && !/nao trabalhamos com pix|pagamento antecipado|balcao/.test(lower)) {
      return SALGADERIA_OPERATIONAL_TEXT.pixReply;
    }

    if (SALGADERIA_REGEX.invalidQuantityMention30.test(lower) && !SALGADERIA_REGEX.validQuantityExplanation.test(lower)) {
      return SALGADERIA_OPERATIONAL_TEXT.invalidQuantityReply;
    }

    if (SALGADERIA_REGEX.badInstructionLeak.test(lower)) {
      return SALGADERIA_OPERATIONAL_TEXT.invalidQuantityReply;
    }

    return normalized;
  }

  private sanitizeToolCalls(toolCalls: SalgaderiaToolCall[]): SalgaderiaToolCall[] {
    if (!Array.isArray(toolCalls)) return [];

    const validNames = new Set<SalgaderiaToolName>(SALGADERIA_TOOL_NAMES);

    return toolCalls
      .filter((tool) => tool && typeof tool === 'object' && typeof tool.name === 'string' && validNames.has(tool.name as SalgaderiaToolName))
      .map((tool) => ({
        name: tool.name as SalgaderiaToolName,
        arguments: normalizeToolArguments(tool.arguments),
      }));
  }

  private isGreetingOnly(state: AtendimentoState, dados: Record<string, any>, replyToCustomer: string) {
    const historico = state.historico || [];
    const hasAnyData = Boolean(
      dados.nome
      || dados.quantidade
      || dados.data_agendamento
      || dados.horario_agendamento,
    );
    if (historico.length > 0 || hasAnyData) return false;
    return isGreetingReply(replyToCustomer);
  }

  private sanitizeDados(novos: Record<string, any>, atuais: Record<string, any>): Record<string, any> {
    const dados: Record<string, any> = { ...novos };

    dados.nome = normalizeNome(dados.nome, atuais.nome || null);

    if (shouldDropForbiddenOrderFields(dados)) {
      delete dados.endereco;
      delete dados.tipo_entrega;
    }

    const quantidade = Number(dados.quantidade);
    if (quantidade > 0 && quantidade % 25 === 0) {
      dados.quantidade = quantidade;
    } else {
      dados.quantidade = atuais.quantidade || null;
    }

    dados.data_agendamento = typeof dados.data_agendamento === 'string' && dados.data_agendamento.trim()
      ? dados.data_agendamento.trim()
      : atuais.data_agendamento || null;

    const normalizeDateDisplay = (isoDate: string | null) => {
      if (!isoDate || !/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return atuais.data_exibicao || null;
      const [year, month, day] = isoDate.split('-');
      return `${day}/${month}/${year}`;
    };

    dados.data_exibicao = typeof dados.data_exibicao === 'string' && dados.data_exibicao.trim()
      ? dados.data_exibicao.trim()
      : normalizeDateDisplay(dados.data_agendamento || atuais.data_agendamento || null);

    dados.horario_agendamento = typeof dados.horario_agendamento === 'string' && dados.horario_agendamento.trim()
      ? dados.horario_agendamento.trim()
      : atuais.horario_agendamento || null;

    return dados;
  }

  private normalizeReplyStyle(reply: string, dados: Record<string, any>) {
    const normalized = reply.trim();

    for (const blocked of SALGADERIA_REPLY_STYLE_BLOCKLIST) {
      if (normalized.toLowerCase().includes(blocked)) {
        const partes = buildOrderSummaryParts(dados);
        if (partes.length > 0) {
          return `${partes.join(' ')}?`.replace(/\s+/g, ' ').trim();
        }
        return SALGADERIA_OPERATIONAL_TEXT.fallbackReply;
      }
    }

    return normalized;
  }

  private resolveNeedsHuman(value: unknown, originalMessage: string) {
    if (!normalizeNeedsHuman(value)) return false;
    return shouldAllowNeedsHuman(originalMessage);
  }

  private buildSystemPrompt(config: Record<string, string>) {
    const candidatePaths = [
      path.join(__dirname, 'script-atendimento.md'),
      path.resolve(__dirname, '../../../src/modules/salgaderia/script-atendimento.md'),
      path.join(process.cwd(), 'src', 'modules', 'salgaderia', 'script-atendimento.md'),
    ];
    const scriptPath = candidatePaths.find((candidate) => fs.existsSync(candidate));
    if (!scriptPath) {
      throw new Error('script-atendimento.md nao encontrado');
    }

    return fs.readFileSync(scriptPath, 'utf-8');
  }
}
