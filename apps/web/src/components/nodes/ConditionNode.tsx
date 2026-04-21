import type { NodeProps } from '@xyflow/react';
import { BaseNode } from './BaseNode';

export function ConditionNode({ data }: NodeProps) {
  return (
    <BaseNode icon="uD83DuDD00" title={String(data.label || 'Condiu00e7u00e3o')} color="#f0c040" outputTrue outputFalse>
      <div>{String(data.field || '?')} {String(data.operator || '?')} {String(data.value || '?')}</div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', flexDirection: 'column', gap: 12, marginTop: 8 }}>
        <span style={{ color: '#25d366', fontSize: 11 }}>u2714 Verdadeiro</span>
        <span style={{ color: '#ff4444', fontSize: 11 }}>u2718 Falso</span>
      </div>
    </BaseNode>
  );
}
