import { Handle, Position } from '@xyflow/react';
import type { ReactNode } from 'react';

interface Props {
  icon: string;
  title: string;
  color: string;
  children?: ReactNode;
  hasInput?: boolean;
  hasOutput?: boolean;
  outputTrue?: boolean;
  outputFalse?: boolean;
}

export function BaseNode({ icon, title, color, children, hasInput = true, hasOutput = true, outputTrue, outputFalse }: Props) {
  return (
    <div style={{
      background: '#1e1e1e',
      border: `2px solid ${color}`,
      borderRadius: 12,
      minWidth: 180,
      fontFamily: 'inherit',
      overflow: 'hidden',
    }}>
      <div style={{ background: color, padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 16 }}>{icon}</span>
        <span style={{ fontWeight: 700, fontSize: 13, color: '#000' }}>{title}</span>
      </div>
      <div style={{ padding: '10px 12px', fontSize: 12, color: '#ccc' }}>{children}</div>

      {hasInput && <Handle type="target" position={Position.Left} style={{ background: color, border: 'none', width: 10, height: 10 }} />}

      {hasOutput && !outputTrue && !outputFalse && (
        <Handle type="source" position={Position.Right} style={{ background: color, border: 'none', width: 10, height: 10 }} />
      )}

      {outputTrue && (
        <Handle
          type="source" id="true" position={Position.Right}
          style={{ background: '#25d366', border: 'none', width: 10, height: 10, top: '35%' }}
        />
      )}

      {outputFalse && (
        <Handle
          type="source" id="false" position={Position.Right}
          style={{ background: '#ff4444', border: 'none', width: 10, height: 10, top: '65%' }}
        />
      )}
    </div>
  );
}
