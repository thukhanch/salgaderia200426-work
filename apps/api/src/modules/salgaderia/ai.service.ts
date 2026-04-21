import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';

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

type ToolCallName =
  | 'registrar_dados'
  | 'confirmar_pedido'
  | 'solicitar_handoff'
  | 'registrar_observacao';

type ToolCall = {
  name: ToolCallName;
  arguments?: Record<string, any>;
};

export type AtendimentoAiResult = {
  replyToCustomer: string;
  toolCalls: ToolCall[];
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
  private readonly apiKey = process.env.OPENROUTER_API_KEY;
  private readonly model = process.env.OPENROUTER_MODEL || 'openrouter/free';
  private readonly baseUrl = 'https://openrouter.ai/api/v1/chat/completions';

  private readonly responseStylePrompt = [
    'VOCE E O ATENDENTE VIRTUAL DA DUZZI SALGADOS.',
    'Voce nao tem nome proprio. Nunca diga seu nome. Nunca confunda o nome do cliente com o seu.',
    'Seu trabalho e interpretar a mensagem, decidir o que fazer e produzir uma resposta natural ao cliente.',
    'Voce NAO e um bot de fluxo fixo, NAO usa respostas prontas e NAO depende de saudacoes programadas.',
    'Voce pode decidir responder, registrar memoria operacional, confirmar pedido ou pedir handoff humano.',
    'O backend executa ferramentas; voce apenas solicita acoes estruturadas quando necessario.',
    'Use historico, dados persistidos e memoria operacional para evitar repeticoes e perguntas desnecessarias.',
    'Nunca invente status internos, disponibilidade fora da base ou dados nao informados.',
    'Se faltar contexto, conduza naturalmente a conversa para obter o minimo necessario.',
    'Se o cliente apenas cumprimentar, responda ao cumprimento e convide a pessoa a dizer o que deseja.',
    'Quando o cliente quiser apenas tirar duvida, responda com base na base de conhecimento e nao force fechamento.',
    'A mensagem ao cliente deve ser uma unica resposta natural, humana e objetiva.',
    'IMPORTANTE: So existe UM produto: Coxinha, R$ 1,00 cada, minimo 25, multiplos de 25.',
    'IMPORTANTE: So existe retirada no balcao. Nao ha entrega, frete ou motoboy.',
    'IMPORTANTE: Pagamento apenas no balcao na retirada. Nao ha PIX nem pagamento antecipado.',
    'IMPORTANTE: Se o cliente pedir quantidade invalida, recuse gentilmente e proponha os multiplos de 25 mais proximos.',
    'IMPORTANTE: Antes de registrar o pedido, faca um resumo completo com quantidade, data e horario, e peca confirmacao explicita. Exemplo: Eduardo, 50 coxinhas para amanha 21/04 as 18h - confirma?',
    'IMPORTANTE: Nunca mencione pagamento na conversa. O cliente ja sabe que paga no balcao na retirada.',
    'IMPORTANTE: Na saudacao inicial, sempre se apresente como atendimento da Duzzi Salgados e pergunte como pode ajudar.',
  ].join(String.fromCharCode(10));

  private readonly outputSchemaPrompt = `Responda EXCLUSIVAMENTE em JSON valido, sem texto adicional, neste formato:
{
  "replyToCustomer": "texto unico para o cliente",
  "toolCalls": [
    {
      "name": "registrar_dados",
      "arguments": {}
    }
  ],
  "availableToolNames": ["registrar_dados", "confirmar_pedido", "solicitar_handoff", "registrar_observacao"],
  "memoryUpdates": {
    "etapaAtual": "texto curto ou null",
    "dados": {
      "nome": "string ou null",
      "quantidade": 0,
      "data_agendamento": "YYYY-MM-DD ou null",
      "data_exibicao": "DD/MM/YYYY ou null",
      "horario_agendamento": "HH:MM ou null"
    },
    "pendencias": ["lista curta do que ainda falta"],
    "resumoInterno": "resumo operacional curto ou null"
  },
  "needsHuman": false,
  "shouldCreateOrder": false
}

REGRAS:
- So existe um produto: Coxinha. Nao registre outros produtos.
- Quantidade deve ser multiplo de 25. Se nao for, recuse gentilmente e proponha o multiplo mais proximo.
- Modalidade e sempre retirada no balcao. Nao registre entrega, endereco ou frete.
- Pagamento e sempre no balcao na retirada. Nao registre forma de pagamento.
- Preencha memoryUpdates.dados APENAS com fatos confirmados pelo cliente.
- Quando o cliente disser hoje, amanha ou depois de amanha, converta para datas absolutas.
- Se a mensagem for apenas saudacao, nao preencha dados de pedido e deixe pendencias vazias.
- Use shouldCreateOrder=true SOMENTE quando o cliente confirmar explicitamente o pedido final.
- Use solicitar_handoff e needsHuman=true SOMENTE quando realmente precisar escalar para humano.
- Nao escreva explicacoes fora do JSON.
- A resposta ao cliente nao pode ser vazia.`;

    async responderMensagem(message: string, state: AtendimentoState): Promise<AtendimentoAiResult> {
    if (!this.apiKey) {
      throw new Error('OPENROUTER_API_KEY nao configurada');
    }

    const systemPrompt = this.buildSystemPrompt(state.config);
    const hoje = new Date();
    const hojeIso = hoje.toISOString().slice(0, 10);

    const contextMsg = [
      `Canal: WhatsApp`,
      `Data atual de referencia: ${hojeIso}`,
      `Telefone do cliente: ${state.clientePhone}`,
      `Marcador operacional atual: ${state.etapaAtual || 'sem marcador'}`,
      `Dados confirmados persistidos: ${JSON.stringify(state.dados || {})}`,
    ].join('\n');

    const memoryMsg = [
      'MEMORIA OPERACIONAL:',
      JSON.stringify(state.memoriaOperacional || {}, null, 2),
    ].join('\n');

    const toolMsg = [
      'FERRAMENTAS DISPONIVEIS:',
      '- registrar_dados: pedir ao backend para persistir dados confirmados',
      '- confirmar_pedido: pedir ao backend para criar o pedido quando o cliente ja confirmou o resumo final',
      '- solicitar_handoff: pedir escalada para humano',
      '- registrar_observacao: guardar uma nota operacional curta sem efeito externo',
    ].join('\n');

    const latestUserTurnMsg = `ULTIMA MENSAGEM DO CLIENTE (prioridade maxima): ${message}`;

    const chatMessages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
      { role: 'system', content: systemPrompt },
      { role: 'system', content: this.responseStylePrompt },
      { role: 'system', content: contextMsg },
      { role: 'system', content: memoryMsg },
      { role: 'system', content: toolMsg },
      ...state.historico.slice(-12).map((msg) => ({
        role: msg.role as 'user' | 'assistant',
        content: msg.content,
      })),
      { role: 'system', content: latestUserTurnMsg },
      { role: 'user', content: message },
      { role: 'system', content: this.outputSchemaPrompt },
    ];

    try {
      const response = await axios.post(
        this.baseUrl,
        {
          model: this.model,
          temperature: 0.6,
          messages: chatMessages,
        },
        {
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': 'http://localhost:3000',
            'X-Title': 'Whatsapp Flow Salgaderia',
          },
          timeout: 45000,
        },
      );

      let content = response.data?.choices?.[0]?.message?.content;
      this.logger.log(`OpenRouter raw response: ${content}`);

      if (!content) {
        throw new Error('OpenRouter retornou resposta vazia');
      }

      content = content.replace(/^```\w*\s*/i, '').replace(/```\s*$/i, '').trim();

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

      const parsed = JSON.parse(repairJson(content)) as AtendimentoAiResult;
      return this.sanitizeAiResult(parsed, state);
    } catch (error: any) {
      this.logger.error(`Falha ao executar motor de IA: ${error?.message ?? error}`);
      throw error;
    }
  }

  private sanitizeAiResult(parsed: AtendimentoAiResult, state: AtendimentoState): AtendimentoAiResult {
    const replyToCustomer = typeof parsed.replyToCustomer === 'string' ? parsed.replyToCustomer.trim() : '';
    if (!replyToCustomer) {
      throw new Error('Motor de IA retornou replyToCustomer vazio');
    }

    const sanitizedDados = this.sanitizeDados(parsed.memoryUpdates?.dados || {}, state.dados || {});
    const isGreetingOnly = this.isGreetingOnly(state, sanitizedDados, replyToCustomer);

    return {
      replyToCustomer,
      toolCalls: isGreetingOnly ? [] : this.sanitizeToolCalls(parsed.toolCalls || []),
      memoryUpdates: {
        etapaAtual: isGreetingOnly
          ? (state.etapaAtual || 'inicio')
          : (typeof parsed.memoryUpdates?.etapaAtual === 'string' && parsed.memoryUpdates.etapaAtual.trim()
            ? parsed.memoryUpdates.etapaAtual.trim()
            : state.etapaAtual || null),
        dados: isGreetingOnly ? (state.dados || {}) : sanitizedDados,
        pendencias: isGreetingOnly
          ? []
          : (Array.isArray(parsed.memoryUpdates?.pendencias)
            ? parsed.memoryUpdates.pendencias.filter((item) => typeof item === 'string' && item.trim())
            : []),
        resumoInterno: isGreetingOnly
          ? null
          : (typeof parsed.memoryUpdates?.resumoInterno === 'string' && parsed.memoryUpdates.resumoInterno.trim()
            ? parsed.memoryUpdates.resumoInterno.trim()
            : null),
      },
      needsHuman: Boolean(parsed.needsHuman) && !isGreetingOnly,
      shouldCreateOrder: Boolean(parsed.shouldCreateOrder) && !isGreetingOnly,
    };
  }

  private sanitizeToolCalls(toolCalls: ToolCall[]): ToolCall[] {
    if (!Array.isArray(toolCalls)) return [];

    const validNames = new Set<ToolCallName>([
      'registrar_dados',
      'confirmar_pedido',
      'solicitar_handoff',
      'registrar_observacao',
    ]);

    return toolCalls
      .filter((tool) => tool && typeof tool === 'object' && typeof tool.name === 'string' && validNames.has(tool.name as ToolCallName))
      .map((tool) => ({
        name: tool.name as ToolCallName,
        arguments: tool.arguments && typeof tool.arguments === 'object' ? tool.arguments : {},
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
    return /olá|ola|oi|bom dia|boa tarde|boa noite|opa/i.test(replyToCustomer)
      && /como posso ajudar|como posso te ajudar|dizer o que deseja|me diga o que deseja|o que deseja/i.test(replyToCustomer);
  }

    private sanitizeDados(novos: Record<string, any>, atuais: Record<string, any>): Record<string, any> {
    const dados: Record<string, any> = { ...novos };

    dados.nome = typeof dados.nome === 'string' && dados.nome.trim()
      ? dados.nome.trim()
      : atuais.nome || null;

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

    private buildSystemPrompt(config: Record<string, string>) {
    const candidatePaths = [
      path.join(__dirname, 'script-atendimento.md'),
      path.join(process.cwd(), 'src', 'modules', 'salgaderia', 'script-atendimento.md'),
    ];
    const scriptPath = candidatePaths.find((candidate) => fs.existsSync(candidate));
    if (!scriptPath) {
      throw new Error('script-atendimento.md nao encontrado');
    }

    const baseScript = fs.readFileSync(scriptPath, 'utf-8');

    return baseScript
      .replace(/\[INSERIR CHAVE PIX\]/g, config.chave_pix || 'nao configurada')
      .replace(/\[INSERIR n[\u00fa]mero do humano de backup\]/g, config.telefone_responsavel || 'nao configurado')
      .replace(/\[INSERIR por bairro\/regi[\u00e3]o\]/g, config.valor_frete_padrao || 'nao configurado')
      .replace(/\[INSERIR\]/g, config.endereco_salgaderia || 'nao configurado');
  }
}
