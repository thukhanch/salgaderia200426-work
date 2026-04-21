import { BaseNode } from './BaseNode';

export function EvolutionWebhookNode({ data }: any) {
  return (
    <BaseNode icon="📡" title={String(data.label || 'Evolution Webhook')} color="#25d366" hasInput={false}>
      <div style={{ fontSize: 11, color: '#aaa' }}>Recebe mensagens do WhatsApp</div>
      <div style={{ fontSize: 11, color: '#555', marginTop: 4 }}>
        POST /api/salgaderia/webhook
      </div>
    </BaseNode>
  );
}
