import type { NodeProps } from '@xyflow/react';
import { BaseNode } from './BaseNode';

export function WhatsappTriggerNode({ data }: NodeProps) {
  const filter = typeof data.filter === 'string' ? data.filter : '';

  return (
    <BaseNode icon="uD83DuDCE8" title={String(data.label || 'WA Trigger')} color="#25d366" hasInput={false}>
      <div>Mensagem recebida</div>
      {filter ? <div style={{ color: '#888', marginTop: 4 }}>Filtro: {filter}</div> : null}
    </BaseNode>
  );
}
