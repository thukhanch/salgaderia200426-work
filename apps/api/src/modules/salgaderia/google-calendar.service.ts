import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { buildCalendarEventDescription, buildCalendarEventSummary } from './salgaderia-agent.config';

@Injectable()
export class GoogleCalendarService {
  private readonly logger = new Logger(GoogleCalendarService.name);

  private get calendarId() { return process.env.GOOGLE_CALENDAR_ID || ''; }
  private get serviceAccountJson() {
    return process.env.GOOGLE_SERVICE_ACCOUNT_JSON || '';
  }

  async criarEvento(pedido: {
    id: number;
    item_escolhido: string;
    quantidade: number;
    phone: string;
    data_agendamento: string;
    horario_agendamento: string;
    valor_final: number;
  }): Promise<string | null> {
    if (!this.calendarId || !this.serviceAccountJson) {
      this.logger.warn('[GCAL] Não configurado. Pulando criação de evento.');
      return null;
    }

    try {
      // Monta datetime de início e fim (1h de duração padrão)
      const startDateTime = `${pedido.data_agendamento}T${pedido.horario_agendamento}:00`;
      const [h, m] = pedido.horario_agendamento.split(':').map(Number);
      const endH = String(h + 1).padStart(2, '0');
      const endDateTime = `${pedido.data_agendamento}T${endH}:${String(m).padStart(2, '0')}:00`;

      // Obtém token de acesso via service account
      const token = await this.getAccessToken();
      if (!token) return null;

      const response = await axios.post(
        `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(this.calendarId)}/events`,
        {
          summary: buildCalendarEventSummary({
            id: pedido.id,
            item_escolhido: pedido.item_escolhido,
            quantidade: pedido.quantidade,
          }),
          description: buildCalendarEventDescription({
            id: pedido.id,
            phone: pedido.phone,
            item_escolhido: pedido.item_escolhido,
            quantidade: pedido.quantidade,
            valor_final: pedido.valor_final,
          }),
          start: { dateTime: startDateTime, timeZone: 'America/Sao_Paulo' },
          end: { dateTime: endDateTime, timeZone: 'America/Sao_Paulo' },
          colorId: '11', // vermelho tomate = pedido urgente
        },
        {
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        },
      );

      this.logger.log(`[GCAL] Evento criado: ${response.data.id}`);
      return response.data.id;
    } catch (error) {
      this.logger.error(`[GCAL] Erro ao criar evento: ${error.message}`);
      return null;
    }
  }

  private async getAccessToken(): Promise<string | null> {
    try {
      const serviceAccount = JSON.parse(this.serviceAccountJson);
      const now = Math.floor(Date.now() / 1000);

      // JWT header
      const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');

      // JWT payload
      const payload = Buffer.from(JSON.stringify({
        iss: serviceAccount.client_email,
        scope: 'https://www.googleapis.com/auth/calendar',
        aud: 'https://oauth2.googleapis.com/token',
        exp: now + 3600,
        iat: now,
      })).toString('base64url');

      // Assinar com crypto (nativo do Node.js)
      const crypto = require('crypto');
      const privateKey = serviceAccount.private_key;
      const sign = crypto.createSign('RSA-SHA256');
      sign.update(`${header}.${payload}`);
      const signature = sign.sign(privateKey, 'base64url');

      const jwt = `${header}.${payload}.${signature}`;

      const tokenResponse = await axios.post('https://oauth2.googleapis.com/token', {
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion: jwt,
      });

      return tokenResponse.data.access_token;
    } catch (e) {
      this.logger.error(`[GCAL] Erro ao obter token: ${e.message}`);
      return null;
    }
  }
}
