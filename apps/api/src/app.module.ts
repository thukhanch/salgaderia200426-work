import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WhatsappModule } from './modules/whatsapp/whatsapp.module';
import { WorkflowsModule } from './modules/workflows/workflows.module';
import { WebhooksModule } from './modules/webhooks/webhooks.module';
import { SalgaderiaModule } from './modules/salgaderia/salgaderia.module';

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'postgres',
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT) || 5432,
      username: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASS || 'postgres',
      database: process.env.DB_NAME || 'whatsapp_flow',
      autoLoadEntities: true,
      synchronize: false,
    }),
    WhatsappModule,
    WorkflowsModule,
    WebhooksModule,
    SalgaderiaModule,
  ],
})
export class AppModule {}
