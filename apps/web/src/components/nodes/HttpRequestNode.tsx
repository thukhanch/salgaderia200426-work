import type { NodeProps } from '@xyflow/react';
import { BaseNode } from './BaseNode';

export function HttpRequestNode({ data }: NodeProps) {
  return (
    <BaseNode icon="uD83CuDF10" title={String(data.label || 'HTTP Request')} color="#3b82f6">
      <div style={{ color: '#3b82f6', fontWeight: 600 }}>{String(data.method || 'GET')}</div>
      <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 160, color: '#888' }}>
        {String(data.url || 'URL nu00e3o configurada')}
      </div>
    </BaseNode>
  );
}
