import { Module } from '@nestjs/common';
import { WhatsappModule } from '../whatsapp/whatsapp.module';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SalgaderiaController } from './salgaderia.controller';
import { SalgaderiaService } from './salgaderia.service';
import { EvolutionApiService } from './evolution-api.service';
import { GoogleCalendarService } from './google-calendar.service';
import { AiService } from './ai.service';
import { Cliente } from './entities/cliente.entity';
import { Conversa } from './entities/conversa.entity';
import { Pedido } from './entities/pedido.entity';
import { Configuracao } from './entities/configuracao.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Cliente, Conversa, Pedido, Configuracao]),
    WhatsappModule,
  ],
  controllers: [SalgaderiaController],
  providers: [SalgaderiaService, EvolutionApiService, GoogleCalendarService, AiService],
  exports: [SalgaderiaService],
})
export class SalgaderiaModule {}
