import { useEffect, useState } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';

const API = 'http://localhost:3000/api/salgaderia';

type Session = {
  id: string;
  name: string;
  status: string;
};

export function SalgaderiaPage() {
  const [pedidos, setPedidos] = useState<any[]>([]);
  const [clientes, setClientes] = useState<any[]>([]);
  const [configs, setConfigs] = useState<any[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [activeSessionId, setActiveSessionId] = useState('');
  const [tab, setTab] = useState<'pedidos' | 'clientes' | 'config' | 'testar'>('pedidos');
  const [testPhone, setTestPhone] = useState('5519999999999');
  const [testMsg, setTestMsg] = useState('');
  const [testResposta, setTestResposta] = useState('');
  const [editingConfig, setEditingConfig] = useState<Record<string, string>>({});

  useEffect(() => {
    fetchAll();
  }, []);

  const fetchAll = async () => {
    try {
      const [p, c, cfg, sess] = await Promise.all([
        axios.get(`${API}/pedidos`),
        axios.get(`${API}/clientes`),
        axios.get(`${API}/configuracoes`),
        axios.get(`${API}/sessoes`),
      ]);
      setPedidos(p.data);
      setClientes(c.data);
      setConfigs(cfg.data);
      setSessions(sess.data.sessoes || []);
      setActiveSessionId(sess.data.ativa || '');
      const cfgMap: Record<string, string> = {};
      cfg.data.forEach((c: any) => { cfgMap[c.chave] = c.valor; });
      setEditingConfig(cfgMap);
    } catch {
      // se API não está rodando ainda, silencia
    }
  };

  const handleTest = async () => {
    if (!testMsg.trim()) return;
    try {
      const { data } = await axios.post(`${API}/simular`, { phone: testPhone, text: testMsg });
      setTestResposta(data.resposta);
      setTestMsg('');
      if (data.pedidoConfirmado) {
        toast.success(`🎉 Pedido #${data.pedidoConfirmado} confirmado!`);
        fetchAll();
      }
    } catch (e: any) {
      toast.error('Erro: ' + e.message);
    }
  };

  const handleSaveConfig = async (chave: string) => {
    await axios.put(`${API}/configuracoes/${chave}`, { valor: editingConfig[chave] });
    toast.success('Configuração salva!');
  };

  const handleSaveActiveSession = async () => {
    await axios.put(`${API}/sessao-ativa`, { sessionId: activeSessionId });
    toast.success('Sessão ativa salva!');
    fetchAll();
  };

  const statusColor: Record<string, string> = {
    confirmado: '#25d366',
    em_producao: '#f59e0b',
    pronto: '#3b82f6',
    entregue: '#8b5cf6',
    cancelado: '#ef4444',
  };

  const sessionStatusLabel: Record<string, string> = {
    connected: 'Conectada',
    qr_waiting: 'Aguardando QR',
    connecting: 'Conectando',
    disconnected: 'Desconectada',
  };

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">🥟 Salgaderia Bot</h1>
        <button className="btn btn-secondary" onClick={fetchAll}>↻ Atualizar</button>
      </div>

      <div className="card" style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <div>
            <p style={{ fontSize: 13, color: '#888', marginBottom: 6 }}>Sessão WhatsApp ativa</p>
            <p style={{ fontSize: 16, fontWeight: 600 }}>
              {sessions.find((session) => session.id === activeSessionId)?.name || 'Nenhuma sessão selecionada'}
            </p>
            <p style={{ fontSize: 12, color: '#555', marginTop: 6 }}>
              {activeSessionId
                ? `Status: ${sessionStatusLabel[sessions.find((session) => session.id === activeSessionId)?.status || 'disconnected'] || 'Desconhecido'}`
                : 'Selecione uma sessão conectada para o bot responder no WhatsApp real.'}
            </p>
          </div>

          <div style={{ minWidth: 280, flex: 1, maxWidth: 420 }}>
            <label>Sessão usada pela salgaderia</label>
            <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
              <select
                value={activeSessionId}
                onChange={(e) => setActiveSessionId(e.target.value)}
                style={{ flex: 1 }}
              >
                <option value="">Selecione uma sessão</option>
                {sessions.map((session) => (
                  <option key={session.id} value={session.id}>
                    {session.name} — {sessionStatusLabel[session.status] || session.status}
                  </option>
                ))}
              </select>
              <button className="btn btn-primary" onClick={handleSaveActiveSession} disabled={!activeSessionId}>
                Salvar
              </button>
            </div>
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 24, borderBottom: '1px solid #2a2a2a', paddingBottom: 0 }}>
        {(['pedidos', 'clientes', 'config', 'testar'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            background: 'none', border: 'none', color: tab === t ? '#25d366' : '#555',
            fontWeight: tab === t ? 700 : 400, fontSize: 14, cursor: 'pointer',
            paddingBottom: 12, borderBottom: tab === t ? '2px solid #25d366' : '2px solid transparent',
            textTransform: 'capitalize',
          }}>{t === 'testar' ? '🧪 Testar' : t.charAt(0).toUpperCase() + t.slice(1)}</button>
        ))}
      </div>

      {tab === 'pedidos' && (
        <div>
          <p style={{ color: '#555', marginBottom: 16, fontSize: 13 }}>{pedidos.length} pedido(s) registrado(s)</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {pedidos.map(p => (
              <div key={p.id} className="card" style={{ display: 'flex', alignItems: 'flex-start', gap: 16 }}>
                <div style={{
                  background: statusColor[p.status] || '#333',
                  color: '#000', fontWeight: 700, fontSize: 12,
                  padding: '4px 10px', borderRadius: 20, flexShrink: 0, marginTop: 2,
                }}>#{p.id}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, marginBottom: 4 }}>
                    {p.item_escolhido} — {p.quantidade} un
                  </div>
                  <div style={{ fontSize: 12, color: '#888' }}>
                    📅 {p.data_agendamento} às {p.horario_agendamento} &nbsp;|&nbsp;
                    {p.tipo_entrega === 'entrega' ? `🚗 ${p.endereco}` : '🏪 Retirada'}
                  </div>
                  <div style={{ fontSize: 12, color: '#555', marginTop: 4 }}>
                    📱 {p.phone} &nbsp;|&nbsp; 💰 R$ {Number(p.valor_final).toFixed(2)}
                  </div>
                </div>
                <span style={{
                  background: (statusColor[p.status] || '#333') + '22',
                  color: statusColor[p.status] || '#888',
                  padding: '3px 10px', borderRadius: 20, fontSize: 12, fontWeight: 600,
                }}>{p.status}</span>
              </div>
            ))}
            {pedidos.length === 0 && (
              <div style={{ textAlign: 'center', color: '#444', padding: 60 }}>
                <p style={{ fontSize: 36 }}>📋</p>
                <p>Nenhum pedido ainda</p>
                <p style={{ fontSize: 12, marginTop: 8 }}>Use a aba "Testar" para simular uma conversa</p>
              </div>
            )}
          </div>
        </div>
      )}

      {tab === 'clientes' && (
        <div className="grid">
          {clientes.map(c => (
            <div key={c.phone} className="card">
              <p style={{ fontWeight: 600 }}>{c.name || 'Sem nome'}</p>
              <p style={{ fontSize: 12, color: '#555', marginTop: 4 }}>📱 {c.phone}</p>
              <p style={{ fontSize: 11, color: '#444', marginTop: 4 }}>
                Desde {new Date(c.created_at).toLocaleDateString('pt-BR')}
              </p>
            </div>
          ))}
          {clientes.length === 0 && (
            <p style={{ color: '#444' }}>Nenhum cliente ainda</p>
          )}
        </div>
      )}

      {tab === 'config' && (
        <div style={{ maxWidth: 560 }}>
          <p style={{ color: '#555', marginBottom: 20, fontSize: 13 }}>
            Edite os preços e regras do negócio aqui. Não precisa reiniciar o sistema.
          </p>
          {configs.map(cfg => (
            <div key={cfg.chave} className="form-group" style={{ display: 'flex', alignItems: 'flex-end', gap: 10 }}>
              <div style={{ flex: 1 }}>
                <label>{cfg.descricao || cfg.chave}</label>
                <input
                  value={editingConfig[cfg.chave] || ''}
                  onChange={e => setEditingConfig(prev => ({ ...prev, [cfg.chave]: e.target.value }))}
                />
              </div>
              <button className="btn btn-primary" style={{ flexShrink: 0 }}
                onClick={() => handleSaveConfig(cfg.chave)}>
                Salvar
              </button>
            </div>
          ))}
        </div>
      )}

      {tab === 'testar' && (
        <div style={{ maxWidth: 560 }}>
          <p style={{ color: '#555', marginBottom: 20, fontSize: 13 }}>
            Simule uma conversa completa sem precisar do WhatsApp conectado.
            Cada mensagem avança a máquina de estados.
          </p>
          <div className="form-group">
            <label>Número do cliente (simulado)</label>
            <input value={testPhone} onChange={e => setTestPhone(e.target.value)} />
          </div>

          {testResposta && (
            <div style={{
              background: '#0d2a1a', border: '1px solid #25d366', borderRadius: 12,
              padding: 16, marginBottom: 20,
            }}>
              <p style={{ fontSize: 11, color: '#25d366', marginBottom: 8, fontWeight: 600 }}>
                🤖 RESPOSTA DO BOT:
              </p>
              <p style={{ whiteSpace: 'pre-wrap', fontSize: 14, lineHeight: 1.6 }}>{testResposta}</p>
            </div>
          )}

          <div style={{ display: 'flex', gap: 10 }}>
            <input
              value={testMsg}
              onChange={e => setTestMsg(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleTest()}
              placeholder="Digite como se fosse o cliente (ex: oi, 1, 25, 25/04...)"
              style={{ flex: 1 }}
            />
            <button className="btn btn-primary" onClick={handleTest} disabled={!testMsg.trim()}>
              Enviar
            </button>
          </div>

          <div style={{ marginTop: 16, padding: 12, background: '#1a1a1a', borderRadius: 8, fontSize: 12, color: '#555' }}>
            <p style={{ marginBottom: 6, fontWeight: 600, color: '#888' }}>Sequência de teste:</p>
            <p>1. "oi" → recebe menu</p>
            <p>2. "1" → escolhe Coxinha</p>
            <p>3. "50" → 50 unidades</p>
            <p>4. "25/04" → data</p>
            <p>5. "14:00" → horário</p>
            <p>6. "1" → retirada</p>
            <p>7. "sim" → confirma pedido ✅</p>
          </div>
        </div>
      )}
    </div>
  );
}
