import {
  Controller, Post, Get, Put, Body, Param, Headers, HttpCode, Logger,
} from '@nestjs/common';
import { SalgaderiaService } from './salgaderia.service';
import { EvolutionApiService } from './evolution-api.service';
import { WhatsappService } from '../whatsapp/whatsapp.service';
import { buildReminderMessage } from './salgaderia-agent.config';

@Controller('salgaderia')
export class SalgaderiaController {
  private readonly logger = new Logger(SalgaderiaController.name);

  constructor(
    private readonly salgaderiaService: SalgaderiaService,
    private readonly evolutionApi: EvolutionApiService,
    private readonly whatsappService: WhatsappService,
  ) {}

  @Post('webhook')
  @HttpCode(200)
  async receberMensagem(@Body() payload: any, @Headers() headers: any) {
    try {
      const extracted = this.evolutionApi.extractMessage(payload);

      if (!extracted) {
        this.logger.debug('Mensagem ignorada (não é texto ou payload inválido)');
        return { ok: true };
      }

      const sessionId = await this.salgaderiaService.getConfig('whatsapp_session_id');
      await this.salgaderiaService.processarMensagemRecebida(sessionId, extracted.phone, extracted.text);

      return { ok: true };
    } catch (error: any) {
      this.logger.error(`Erro no webhook: ${error.message}`, error.stack);
      return { ok: false, error: error.message };
    }
  }

  @Get('pedidos')
  listarPedidos() {
    return this.salgaderiaService.listarPedidos();
  }

  @Get('pedidos/:status')
  listarPedidosPorStatus(@Param('status') status: string) {
    return this.salgaderiaService.listarPedidos(status);
  }

  @Get('clientes')
  listarClientes() {
    return this.salgaderiaService.listarClientes();
  }

  @Get('configuracoes')
  getConfigs() {
    return this.salgaderiaService.getConfigs();
  }

  @Put('configuracoes/:chave')
  updateConfig(@Param('chave') chave: string, @Body() body: { valor: string }) {
    return this.salgaderiaService.updateConfig(chave, body.valor);
  }

  @Get('sessoes')
  async listarSessoes() {
    const ativa = await this.salgaderiaService.getConfig('whatsapp_session_id');
    const sessoes = await this.whatsappService.getSessions();
    return { ativa, sessoes };
  }

  @Put('sessao-ativa')
  definirSessaoAtiva(@Body() body: { sessionId: string }) {
    return this.salgaderiaService.updateConfig('whatsapp_session_id', body.sessionId);
  }

  @Post('lembretes/executar')
  async executarLembretes() {
    const pedidos = await this.salgaderiaService.buscarPedidosParaLembrete();
    const resultados = [];

    for (const pedido of pedidos) {
      try {
        const msg = buildReminderMessage({
          item_escolhido: pedido.item_escolhido,
          quantidade: pedido.quantidade,
          horario_agendamento: pedido.horario_agendamento,
        });

        await this.salgaderiaService.enviarMensagemPelaSessaoAtiva(pedido.phone, msg);
        await this.salgaderiaService.marcarLembreteClienteEnviado(pedido.id);
        resultados.push({ pedidoId: pedido.id, ok: true });
      } catch (e: any) {
        resultados.push({ pedidoId: pedido.id, ok: false, erro: e.message });
      }
    }

    return { enviados: resultados.length, resultados };
  }

  @Post('simular')
  async simularMensagem(@Body() body: { phone?: string; text?: string; message?: string }) {
    const texto = typeof body.text === 'string' ? body.text : body.message;
    const phone = typeof body.phone === 'string' && body.phone.trim()
      ? body.phone
      : '+5511999999999';
    const { resposta, handoff, pedidoConfirmado } = await this.salgaderiaService.processarMensagem(
      phone,
      texto || '',
    );
    return { resposta, handoff, pedidoConfirmado: pedidoConfirmado?.id };
  }

  @Get('diagnostico-prompt')
  async diagnosticoPrompt() {
    return this.salgaderiaService.gerarDiagnosticoPrompt();
  }
}
