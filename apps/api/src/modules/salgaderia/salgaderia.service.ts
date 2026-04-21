import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { proto } from '@whiskeysockets/baileys';
import { WhatsappService } from '../whatsapp/whatsapp.service';
import { GoogleCalendarService } from './google-calendar.service';
import { AiService } from './ai.service';
import { Cliente } from './entities/cliente.entity';
import { Conversa } from './entities/conversa.entity';
import { Pedido } from './entities/pedido.entity';
import { Configuracao } from './entities/configuracao.entity';
import {
  buildConfirmationReply,
  buildOwnerHandoffMessage,
  buildOwnerNewOrderMessage,
  buildPromptSections,
  hasCompleteOrderData,
  normalizeEtapa,
  SALGADERIA_CONFIG_DEFAULTS,
  SALGADERIA_FIXED_CONFIG_DESCRIPTIONS,
  SALGADERIA_OPERATIONAL_TEXT,
  SALGADERIA_REGEX,
  SalgaderiaToolCall,
  shouldForceConfirmationReply,
  shouldForceInvalidQuantityReply,
  shouldForcePixReply,
  shouldSuppressHandoff,
} from './salgaderia-agent.config';

@Injectable()
export class SalgaderiaService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SalgaderiaService.name);
  private config: Record<string, string> = {};
  private unsubscribeWhatsappListener?: () => void;
  private subscribedSessionId?: string;
  private processedMessageIds = new Set<string>();

  constructor(
    @InjectRepository(Cliente)
    private clienteRepo: Repository<Cliente>,
    @InjectRepository(Conversa)
    private conversaRepo: Repository<Conversa>,
    @InjectRepository(Pedido)
    private pedidoRepo: Repository<Pedido>,
    @InjectRepository(Configuracao)
    private configRepo: Repository<Configuracao>,
    private whatsappService: WhatsappService,
    private googleCalendar: GoogleCalendarService,
    private aiService: AiService,
  ) {}

  async onModuleInit() {
    this.config = {};
    await this.loadConfig();
    await this.sincronizarListenerWhatsapp();
  }

  onModuleDestroy() {
    this.unsubscribeWhatsappListener?.();
  }

  private async sincronizarListenerWhatsapp() {
    const sessionId = await this.getConfig('whatsapp_session_id');

    if (!sessionId) {
      this.unsubscribeWhatsappListener?.();
      this.unsubscribeWhatsappListener = undefined;
      this.subscribedSessionId = undefined;
      return;
    }

    if (this.subscribedSessionId === sessionId && this.unsubscribeWhatsappListener) {
      return;
    }

    this.unsubscribeWhatsappListener?.();
    this.unsubscribeWhatsappListener = this.whatsappService.onMessage(sessionId, (message) => {
      void this.processarMensagemWhatsapp(sessionId, message);
    });
    this.subscribedSessionId = sessionId;
  }

  private extrairTextoMensagem(message: proto.IWebMessageInfo): string {
    return message.message?.conversation
      || message.message?.extendedTextMessage?.text
      || message.message?.imageMessage?.caption
      || message.message?.videoMessage?.caption
      || '';
  }

  private extrairTelefoneMensagem(message: proto.IWebMessageInfo): string {
    return message.key.remoteJid || '';
  }

  private async processarMensagemWhatsapp(sessionId: string, message: proto.IWebMessageInfo) {
    const texto = this.extrairTextoMensagem(message).trim();
    const phone = this.extrairTelefoneMensagem(message);

    if (!texto || !phone) return;

    const msgId = message.key?.id;
    if (msgId) {
      if (this.processedMessageIds.has(msgId)) {
        this.logger.warn(`Mensagem duplicada ignorada: ${msgId}`);
        return;
      }
      this.processedMessageIds.add(msgId);
      if (this.processedMessageIds.size > 500) {
        const oldest = this.processedMessageIds.values().next().value;
        if (oldest) this.processedMessageIds.delete(oldest);
      }
    }

    try {
      await this.processarMensagemRecebida(sessionId, phone, texto, message);
    } catch (error: any) {
      this.logger.error(`Erro ao processar mensagem do WhatsApp: ${error.message}`, error.stack);
    }
  }

  async getConfig(chave: string, fallback = '') {
    if (!this.config[chave]) await this.loadConfig();
    return this.config[chave] || fallback;
  }

  async findOrCreateCliente(phone: string): Promise<Cliente> {
    let cliente = await this.clienteRepo.findOneBy({ phone });
    if (!cliente) {
      cliente = this.clienteRepo.create({ phone });
      await this.clienteRepo.save(cliente);
    }
    return cliente;
  }

  async findOrCreateConversa(phone: string): Promise<Conversa> {
    let conversa = await this.conversaRepo.findOne({
      where: { phone, pedido_em_aberto: true },
      order: { created_at: 'DESC' },
    });

    if (!conversa) {
      conversa = this.conversaRepo.create({
        phone,
        etapa_atual: 'inicio',
        dados_parciais: {},
        pedido_em_aberto: true,
        historico_mensagens: [],
        ultima_interacao: new Date(),
      });
      await this.conversaRepo.save(conversa);
    }

    return conversa;
  }

  async updateConversa(id: number, updates: Partial<Conversa>) {
    await this.conversaRepo.update(id, updates);
  }

  private calcularValorTotal(dados: Record<string, any>): number {
    const quantidade = Number(dados.quantidade || 0);
    return parseFloat(quantidade.toFixed(2));
  }

  private mergeDados(dadosAtuais: Record<string, any>, dadosNovos: Record<string, any>): Record<string, any> {
    const quantidade = dadosNovos.quantidade ?? dadosAtuais.quantidade ?? null;
    const dataAgendamento = dadosNovos.data_agendamento ?? dadosAtuais.data_agendamento ?? null;
    const dataExibicao = dadosNovos.data_exibicao ?? dadosAtuais.data_exibicao ?? null;
    const horarioAgendamento = dadosNovos.horario_agendamento ?? dadosAtuais.horario_agendamento ?? null;

    return {
      ...dadosAtuais,
      ...dadosNovos,
      nome: dadosNovos.nome ?? dadosAtuais.nome ?? null,
      quantidade,
      data_agendamento: dataAgendamento,
      data_exibicao: dataExibicao,
      horario_agendamento: horarioAgendamento,
    };
  }

  private construirPendencias(dados: Record<string, any>) {
    const pendencias: string[] = [];
    if (!dados.quantidade) pendencias.push("quantidade de coxinhas");
    if (!dados.nome) pendencias.push("nome do cliente");
    if (!dados.data_agendamento) pendencias.push("data do pedido");
    if (!dados.horario_agendamento) pendencias.push("horario do pedido");
    return pendencias;
  }

  private construirResumoDadosConfirmados(dados: Record<string, any>) {
    const resumo: string[] = [];

    if (dados.nome) resumo.push(`nome=${dados.nome}`);
    if (dados.quantidade) resumo.push(`quantidade=${dados.quantidade}`);
    if (dados.data_agendamento) resumo.push(`data=${dados.data_agendamento}`);
    if (dados.data_exibicao) resumo.push(`data_exibicao=${dados.data_exibicao}`);
    if (dados.horario_agendamento) resumo.push(`horario=${dados.horario_agendamento}`);

    return resumo;
  }

  private construirMemoriaOperacional(params: {
    texto: string;
    horasSemInteracao: number;
    conversa: Conversa;
    dados: Record<string, any>;
    cliente: Cliente;
  }) {
    const { horasSemInteracao, conversa, dados, cliente } = params;
    const pedidoEmAberto = conversa.pedido_em_aberto;

    return {
      retomandoContato: horasSemInteracao < 12 && (conversa.historico_mensagens || []).length > 0,
      novoPedidoProvavel: horasSemInteracao >= 12 || !pedidoEmAberto,
      horasSemInteracao: Number(horasSemInteracao.toFixed(2)),
      pedidoEmAberto,
      nomeCliente: dados.nome || cliente.name || null,
      resumoDadosConfirmados: this.construirResumoDadosConfirmados(dados),
      pendencias: this.construirPendencias(dados),
      ultimoResumoPedido: dados.quantidade && dados.data_exibicao && dados.horario_agendamento
        ? `${dados.quantidade} coxinhas para ${dados.data_exibicao} as ${dados.horario_agendamento}`
        : null,
    };
  }

  private deveReiniciarContexto(horasSemInteracao: number, conversa: Conversa) {
    return horasSemInteracao >= 12 || !conversa.pedido_em_aberto;
  }

  gerarResumoProd(pedido: Pedido): string {
    return `PEDIDO #${pedido.id}\n`
      + `Tel: ${pedido.phone}\n`
      + `Produto: ${pedido.item_escolhido}\n`
      + `Quantidade: ${pedido.quantidade} un.\n`
      + `Retirada: ${pedido.data_agendamento} as ${pedido.horario_agendamento}\n`
      + `Valor: R$ ${Number(pedido.valor_final).toFixed(2)}\n`
      + `Status: ${pedido.status}`;
  }

  async enviarMensagemPelaSessaoAtiva(to: string, text: string) {
    const sessionId = await this.getConfig('whatsapp_session_id');
    if (!sessionId) {
      throw new Error('Nenhuma sessao WhatsApp ativa configurada na salgaderia');
    }

    return this.whatsappService.sendMessage(sessionId, to, text);
  }

  async salvarGoogleEventId(pedidoId: number, eventId: string) {
    await this.pedidoRepo.update(pedidoId, { google_event_id: eventId });
  }

  async processarMensagemRecebida(
    sessionId: string,
    phone: string,
    text: string,
    originalMessage?: proto.IWebMessageInfo,
  ) {
    const sessionIdConfigurada = await this.getConfig('whatsapp_session_id');
    if (!sessionIdConfigurada || sessionIdConfigurada !== sessionId) {
      return { ignorada: true };
    }

    this.logger.log(`Mensagem de ${phone}: "${text}"`);

    const { resposta, handoff, pedidoConfirmado } = await this.processarMensagem(phone, text);

    this.logger.log(`Enviando resposta para ${phone} via sessao ${sessionId}`);
    try {
      if (originalMessage) {
        await this.whatsappService.sendReplyWithPresence(sessionId, originalMessage, resposta);
      } else {
        await this.whatsappService.sendMessage(sessionId, phone, resposta);
      }
      this.logger.log(`Resposta enviada com sucesso para ${phone}`);
    } catch (sendError: any) {
      this.logger.error(`Falha ao enviar resposta para ${phone}: ${sendError?.message ?? sendError}`, sendError?.stack);
      throw sendError;
    }

    if (pedidoConfirmado) {
      const eventId = await this.googleCalendar.criarEvento(pedidoConfirmado);
      if (eventId) {
        await this.salvarGoogleEventId(pedidoConfirmado.id, eventId);
      }

      const donoWhatsapp = await this.getConfig('dono_whatsapp');
      if (donoWhatsapp) {
        const resumo = this.gerarResumoProd(pedidoConfirmado);
        await this.whatsappService.sendMessage(sessionId, '+' + donoWhatsapp, buildOwnerNewOrderMessage(resumo));
      }
    }

    if (handoff) {
      const donoWhatsapp = await this.getConfig('dono_whatsapp');
      if (donoWhatsapp) {
        await this.whatsappService.sendMessage(
          sessionId,
          '+' + donoWhatsapp,
          buildOwnerHandoffMessage(phone, text),
        );
      }
    }

    return { resposta, handoff, pedidoConfirmado };
  }

  private async executarToolCalls(params: {
    toolCalls: SalgaderiaToolCall[];
    dadosAtuais: Record<string, any>;
    dadosDaIa: Record<string, any>;
  }) {
    const { toolCalls, dadosAtuais, dadosDaIa } = params;
    let handoff = false;
    let shouldCreateOrder = false;
    let observacoes: string[] = [];

    for (const tool of toolCalls) {
      if (tool.name === 'solicitar_handoff') {
        handoff = true;
      }

      if (tool.name === 'confirmar_pedido') {
        shouldCreateOrder = true;
      }

      if (tool.name === 'registrar_observacao') {
        const nota = typeof tool.arguments?.nota === 'string' ? tool.arguments.nota.trim() : '';
        if (nota) observacoes.push(nota);
      }
    }

    return {
      dadosAtualizados: this.mergeDados(dadosAtuais, dadosDaIa),
      handoff,
      shouldCreateOrder,
      observacoes,
    };
  }

  private async criarPedidoSePossivel(conversa: Conversa, dados: Record<string, any>) {
    const quantidade = Number(dados.quantidade || 0);
    if (
      !dados.nome
      || !quantidade
      || quantidade % 25 !== 0
      || !dados.data_agendamento
      || !dados.horario_agendamento
    ) {
      return undefined;
    }

    const valorTotal = this.calcularValorTotal(dados);

    const pedido = this.pedidoRepo.create({
      phone: conversa.phone,
      conversa_id: conversa.id,
      item_escolhido: 'Coxinha',
      quantidade,
      data_agendamento: dados.data_agendamento,
      horario_agendamento: dados.horario_agendamento,
      tipo_entrega: SALGADERIA_OPERATIONAL_TEXT.tipoEntrega,
      endereco: null,
      valor_final: valorTotal,
      status: 'confirmado',
    });

    const pedidoSalvo = await this.pedidoRepo.save(pedido);
    const resumoProd = this.gerarResumoProd(pedidoSalvo);
    await this.pedidoRepo.update(pedidoSalvo.id, { resumo_producao: resumoProd });
    return { ...pedidoSalvo, resumo_producao: resumoProd };
  }

  async processarMensagem(phone: string, texto: string): Promise<{
    resposta: string;
    handoff?: boolean;
    pedidoConfirmado?: Pedido;
  }> {
    await this.loadConfig();

    const phoneNorm = phone.includes('@') ? phone : '+' + phone.replace(/\D/g, '');
    const cliente = await this.findOrCreateCliente(phoneNorm);
    const conversa = await this.findOrCreateConversa(phoneNorm);

    const agora = new Date();
    const ultimaInteracao = conversa.ultima_interacao ? new Date(conversa.ultima_interacao) : null;
    const horasSemInteracao = ultimaInteracao ? (agora.getTime() - ultimaInteracao.getTime()) / 3600000 : 999;

    let etapaAtual = conversa.etapa_atual;
    let dados = conversa.dados_parciais || {};
    let historico = conversa.historico_mensagens || [];

    if (this.deveReiniciarContexto(horasSemInteracao, conversa)) {
      etapaAtual = 'inicio';
      dados = {};
      historico = [];
    }

    const memoriaOperacional = this.construirMemoriaOperacional({
      texto,
      horasSemInteracao,
      conversa,
      dados,
      cliente,
    });

    this.logger.log(`[${phoneNorm}] etapa=${etapaAtual} pendencias=${memoriaOperacional.pendencias.join(', ') || 'nenhuma'} msg="${texto}"`);

    let aiResult;
    try {
      aiResult = await this.aiService.responderMensagem(texto, {
        etapaAtual,
        dados,
        historico,
        config: this.config,
        clientePhone: phoneNorm,
        memoriaOperacional,
      });
    } catch (error: any) {
      this.logger.error(`Motor de IA indisponivel para ${phoneNorm}: ${error?.message ?? error}`);
      throw new Error('Falha ao obter decisao da IA para esta mensagem');
    }

    const toolRuntime = await this.executarToolCalls({
      toolCalls: aiResult.toolCalls || [],
      dadosAtuais: dados,
      dadosDaIa: aiResult.memoryUpdates?.dados || {},
    });

    const novosDados = toolRuntime.dadosAtualizados;
    const novaEtapa = normalizeEtapa(aiResult.memoryUpdates?.etapaAtual, normalizeEtapa(etapaAtual || 'inicio'));

    if (novosDados.nome && novosDados.nome !== cliente.name) {
      await this.clienteRepo.update(phoneNorm, { name: novosDados.nome });
    }

    const confirmouExplicito = SALGADERIA_REGEX.explicitConfirmation.test(texto);
    const dadosCompletos = hasCompleteOrderData(novosDados);
    const confirmarPedido = Boolean(aiResult.shouldCreateOrder || toolRuntime.shouldCreateOrder || (confirmouExplicito && dadosCompletos));
    const handoff = shouldSuppressHandoff(texto) ? false : Boolean(aiResult.needsHuman || toolRuntime.handoff);

    let respostaFinal = aiResult.replyToCustomer;
    if (shouldForcePixReply(texto, respostaFinal)) {
      respostaFinal = SALGADERIA_OPERATIONAL_TEXT.pixReply;
    } else if (shouldForceConfirmationReply(texto, novosDados, confirmarPedido)) {
      respostaFinal = buildConfirmationReply(novosDados);
    } else if (shouldForceInvalidQuantityReply(texto, respostaFinal)) {
      respostaFinal = SALGADERIA_OPERATIONAL_TEXT.invalidQuantityReply;
    }

    let pedidoConfirmado: Pedido | undefined;

    if (confirmarPedido) {
      pedidoConfirmado = await this.criarPedidoSePossivel(conversa, novosDados);
      if (pedidoConfirmado) {
        respostaFinal = `${buildConfirmationReply(novosDados).replace(/\s*-\s*confirma\?$/i, '')}. ${SALGADERIA_OPERATIONAL_TEXT.confirmedOrderReplySuffix}`;
      }
    }

    const historicoFinal = [
      ...historico,
      { role: 'user' as const, content: texto, timestamp: agora.toISOString() },
      { role: 'assistant' as const, content: respostaFinal, timestamp: agora.toISOString() },
    ].slice(-40);

    await this.updateConversa(conversa.id, {
      etapa_atual: confirmarPedido ? 'finalizado' : novaEtapa,
      dados_parciais: novosDados,
      pedido_em_aberto: !confirmarPedido,
      historico_mensagens: historicoFinal,
      ultima_interacao: agora,
    });

    return {
      resposta: respostaFinal,
      handoff,
      pedidoConfirmado,
    };
  }

  private async garantirConfiguracoesAtendimento() {
    for (const [chave, valor, descricao] of SALGADERIA_CONFIG_DEFAULTS) {
      await this.configRepo
        .createQueryBuilder()
        .insert()
        .into(Configuracao)
        .values({ chave, valor, descricao })
        .orIgnore()
        .execute();
    }
  }

  async gerarDiagnosticoPrompt() {
    await this.loadConfig();
    const aiRuntime = this.aiService as any;
    const systemPrompt = aiRuntime.buildSystemPrompt(this.config);
    return {
      provider: process.env.AI_BASE_URL ? '9router' : 'openrouter',
      baseUrl: (process.env.AI_BASE_URL || 'https://openrouter.ai/api/v1').replace(/\/$/, ''),
      modelConfigurado: process.env.AI_MODEL || process.env.OPENROUTER_MODEL || 'openrouter/auto',
      promptSections: buildPromptSections(systemPrompt, this.config),
    };
  }

  async loadConfig() {
    await this.garantirConfiguracoesAtendimento();
    const rows = await this.configRepo.find();
    for (const row of rows) {
      this.config[row.chave] = row.valor;
    }
    return this.config;
  }

  async updateConfig(chave: string, valor: string) {
    await this.configRepo
      .createQueryBuilder()
      .insert()
      .into(Configuracao)
      .values({ chave, valor, descricao: SALGADERIA_FIXED_CONFIG_DESCRIPTIONS[chave] ?? null })
      .orUpdate(['valor'], ['chave'])
      .execute();

    this.config[chave] = valor;
    if (chave === 'whatsapp_session_id') {
      await this.sincronizarListenerWhatsapp();
    }
    return { chave, valor };
  }

  async buscarPedidosParaLembrete(): Promise<Pedido[]> {
    const amanha = new Date();
    amanha.setDate(amanha.getDate() + 1);
    const dataAmanha = amanha.toISOString().split('T')[0];

    return this.pedidoRepo.find({
      where: {
        data_agendamento: dataAmanha,
        lembrete_cliente_enviado: false,
        status: 'confirmado',
      },
    });
  }

  async marcarLembreteClienteEnviado(pedidoId: number) {
    await this.pedidoRepo.update(pedidoId, { lembrete_cliente_enviado: true });
  }

  async marcarLembreteInternoEnviado(pedidoId: number) {
    await this.pedidoRepo.update(pedidoId, { lembrete_interno_enviado: true });
  }

  async listarPedidos(status?: string) {
    const where = status ? { status } : {};
    return this.pedidoRepo.find({ where, order: { created_at: 'DESC' } });
  }

  async listarClientes() {
    return this.clienteRepo.find({ order: { created_at: 'DESC' } });
  }

  async getConfigs() {
    return this.configRepo.find();
  }
}
