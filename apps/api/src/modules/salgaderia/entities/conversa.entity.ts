import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';

export type EtapaConversa =
  | 'inicio'
  | 'boas_vindas'
  | 'entender_pedido'
  | 'coletar_nome'
  | 'coletar_data'
  | 'coletar_horario'
  | 'coletar_tipo_entrega'
  | 'coletar_endereco'
  | 'coletar_pagamento'
  | 'confirmacao'
  | 'finalizado';

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

  @Column({ default: 'inicio' })
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
