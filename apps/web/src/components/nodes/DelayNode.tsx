import type { NodeProps } from '@xyflow/react';
import { BaseNode } from './BaseNode';

export function DelayNode({ data }: NodeProps) {
  return (
    <BaseNode icon="u23F1" title={String(data.label || 'Delay')} color="#8b5cf6">
      <div>Aguardar {String(data.seconds || 5)} segundo(s)</div>
    </BaseNode>
  );
}
