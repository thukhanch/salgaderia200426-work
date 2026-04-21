import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';

import { SalgaderiaEtapa, SALGADERIA_LEGACY_ETAPAS } from '../salgaderia-agent.config';

export type EtapaConversa =
  | SalgaderiaEtapa
  | typeof SALGADERIA_LEGACY_ETAPAS[number];

export type MensagemHistorico = {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
};

@Entity('conversas')
export class Conversa {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  phone: string;

  @Column({ type: 'varchar', default: 'inicio' })
  etapa_atual: EtapaConversa;

  @Column({ type: 'jsonb', default: '{}' })
  dados_parciais: Record<string, any>;

  @Column({ default: false })
  pedido_em_aberto: boolean;

  // Histórico completo de mensagens trocadas
  @Column({ type: 'jsonb', default: '[]' })
  historico_mensagens: MensagemHistorico[];

  @Column({ type: 'timestamp', nullable: true })
  ultima_interacao: Date;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
