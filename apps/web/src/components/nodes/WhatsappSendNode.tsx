import type { NodeProps } from '@xyflow/react';
import { BaseNode } from './BaseNode';

export function WhatsappSendNode({ data }: NodeProps) {
  return (
    <BaseNode icon="uD83DuDCE4" title={String(data.label || 'Enviar Mensagem')} color="#128c7e">
      <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 160 }}>
        {data.text ? String(data.text).slice(0, 40) + (String(data.text).length > 40 ? '...' : '') : 'Sem mensagem configurada'}
      </div>
    </BaseNode>
  );
}
