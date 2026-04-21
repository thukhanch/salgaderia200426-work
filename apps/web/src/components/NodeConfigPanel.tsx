import { useWorkflowStore } from '../store/workflowStore';

interface Props {
  node: any;
  onClose: () => void;
}

export function NodeConfigPanel({ node, onClose }: Props) {
  const { updateNodeData } = useWorkflowStore();
  const data = node.data;

  const update = (key: string, value: any) => updateNodeData(node.id, { [key]: value });

  return (
    <div style={{
      width: 280,
      background: '#1a1a1a',
      borderLeft: '1px solid #2a2a2a',
      padding: 20,
      overflowY: 'auto',
      flexShrink: 0,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 20 }}>
        <h3 style={{ fontSize: 15, fontWeight: 700 }}>Configurar Node</h3>
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#888', cursor: 'pointer', fontSize: 18 }}>u00d7</button>
      </div>

      <div className="form-group">
        <label>Label</label>
        <input value={data.label || ''} onChange={(e) => update('label', e.target.value)} />
      </div>

      {node.type === 'whatsapp-trigger' && (
        <>
          <div className="form-group">
            <label>Session ID</label>
            <input value={data.sessionId || ''} onChange={(e) => update('sessionId', e.target.value)} placeholder="ID da sessu00e3o WhatsApp" />
          </div>
          <div className="form-group">
            <label>Filtro de mensagem (opcional)</label>
            <input value={data.filter || ''} onChange={(e) => update('filter', e.target.value)} placeholder="Ex: oi, olu00e1, help" />
          </div>
        </>
      )}

      {node.type === 'whatsapp-send' && (
        <>
          <div className="form-group">
            <label>Session ID</label>
            <input value={data.sessionId || ''} onChange={(e) => update('sessionId', e.target.value)} />
          </div>
          <div className="form-group">
            <label>{'Para (número ou {{trigger.from}})'}</label>
            <input value={data.to || ''} onChange={(e) => update('to', e.target.value)} />
          </div>
          <div className="form-group">
            <label>Mensagem</label>
            <textarea rows={4} value={data.text || ''} onChange={(e) => update('text', e.target.value)} placeholder="Olu00e1 {{trigger.from}}, recebemos sua mensagem!" />
          </div>
        </>
      )}

      {node.type === 'condition' && (
        <>
          <div className="form-group">
            <label>Campo</label>
            <input value={data.field || ''} onChange={(e) => update('field', e.target.value)} placeholder="Ex: text" />
          </div>
          <div className="form-group">
            <label>Operador</label>
            <select
              value={data.operator || 'contains'}
              onChange={(e) => update('operator', e.target.value)}
              style={{ background: '#252525', border: '1px solid #3a3a3a', borderRadius: 8, color: '#f1f1f1', padding: '8px 12px', fontSize: 14, width: '100%' }}
            >
              <option value="equals">u00e9 igual a</option>
              <option value="contains">contu00e9m</option>
              <option value="starts_with">comeu00e7a com</option>
              <option value="not_empty">nu00e3o estu00e1 vazio</option>
            </select>
          </div>
          <div className="form-group">
            <label>Valor</label>
            <input value={data.value || ''} onChange={(e) => update('value', e.target.value)} />
          </div>
        </>
      )}

      {node.type === 'delay' && (
        <div className="form-group">
          <label>Segundos</label>
          <input type="number" value={data.seconds || 5} onChange={(e) => update('seconds', Number(e.target.value))} min={1} />
        </div>
      )}

      {node.type === 'http-request' && (
        <>
          <div className="form-group">
            <label>URL</label>
            <input value={data.url || ''} onChange={(e) => update('url', e.target.value)} placeholder="https://api.exemplo.com/endpoint" />
          </div>
          <div className="form-group">
            <label>Mu00e9todo</label>
            <select
              value={data.method || 'GET'}
              onChange={(e) => update('method', e.target.value)}
              style={{ background: '#252525', border: '1px solid #3a3a3a', borderRadius: 8, color: '#f1f1f1', padding: '8px 12px', fontSize: 14, width: '100%' }}
            >
              <option>GET</option><option>POST</option><option>PUT</option><option>DELETE</option>
            </select>
          </div>
          <div className="form-group">
            <label>Body (JSON)</label>
            <textarea rows={4} value={data.body || ''} onChange={(e) => update('body', e.target.value)} placeholder='{"key": "value"}' />
          </div>
        </>
      )}
    </div>
  );
}
