import { useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  addEdge,
  BackgroundVariant,
} from '@xyflow/react';
import type { Connection } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useWorkflowStore } from '../store/workflowStore';
import { NodeSidebar } from '../components/NodeSidebar';
import { NodeConfigPanel } from '../components/NodeConfigPanel';
import { WhatsappTriggerNode } from '../components/nodes/WhatsappTriggerNode';
import { WhatsappSendNode } from '../components/nodes/WhatsappSendNode';
import { ConditionNode } from '../components/nodes/ConditionNode';
import { DelayNode } from '../components/nodes/DelayNode';
import { HttpRequestNode } from '../components/nodes/HttpRequestNode';
import toast from 'react-hot-toast';
import { useState } from 'react';

const nodeTypes = {
  'whatsapp-trigger': WhatsappTriggerNode,
  'whatsapp-send': WhatsappSendNode,
  'condition': ConditionNode,
  'delay': DelayNode,
  'http-request': HttpRequestNode,
};

export function EditorPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { currentWorkflow, nodes, edges, fetchWorkflow, saveWorkflow, setEdges, onNodesChange, onEdgesChange, isDirty } = useWorkflowStore();
  const [selectedNode, setSelectedNode] = useState<any>(null);

  useEffect(() => { if (id) fetchWorkflow(id); }, [id]);

  const onConnect = useCallback(
    (connection: Connection) => setEdges(addEdge(connection, edges) as any),
    [edges],
  );

  const handleSave = async () => {
    await saveWorkflow();
    toast.success('Workflow salvo!');
  };

  const onDrop = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    const type = event.dataTransfer.getData('nodeType');
    if (!type) return;

    const bounds = (event.target as HTMLElement).closest('.react-flow')?.getBoundingClientRect();
    if (!bounds) return;

    const position = {
      x: event.clientX - bounds.left - 80,
      y: event.clientY - bounds.top - 20,
    };

    const newNode = {
      id: `${type}-${Date.now()}`,
      type,
      position,
      data: getDefaultData(type),
    };

    useWorkflowStore.getState().setNodes([...nodes, newNode as any]);
  }, [nodes]);

  return (
    <div style={{ display: 'flex', height: '100vh', flexDirection: 'column' }}>
      {/* Toolbar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12, padding: '0 20px',
        height: 52, background: '#1a1a1a', borderBottom: '1px solid #2a2a2a', flexShrink: 0,
      }}>
        <button className="btn btn-secondary" onClick={() => navigate('/')}>u2190 Voltar</button>
        <span style={{ fontWeight: 600, fontSize: 15 }}>{currentWorkflow?.name}</span>
        <span style={{ flex: 1 }} />
        {isDirty && <span style={{ fontSize: 12, color: '#888' }}>Alterau00e7u00f5es nu00e3o salvas</span>}
        <button className="btn btn-primary" onClick={handleSave}>Salvar</button>
      </div>

      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        <NodeSidebar />
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onNodeClick={(_, node) => setSelectedNode(node)}
          onPaneClick={() => setSelectedNode(null)}
          nodeTypes={nodeTypes}
          onDrop={onDrop}
          onDragOver={(e) => e.preventDefault()}
          fitView
          style={{ background: '#0f0f0f' }}
        >
          <Background variant={BackgroundVariant.Dots} color="#2a2a2a" />
          <Controls style={{ background: '#1a1a1a', border: '1px solid #2a2a2a' }} />
          <MiniMap style={{ background: '#1a1a1a' }} nodeColor="#25d366" />
        </ReactFlow>
        {selectedNode && (
          <NodeConfigPanel node={selectedNode} onClose={() => setSelectedNode(null)} />
        )}
      </div>
    </div>
  );
}

function getDefaultData(type: string) {
  const defaults: Record<string, any> = {
    'whatsapp-trigger': { label: 'WhatsApp Trigger', sessionId: '', filter: '' },
    'whatsapp-send': { label: 'Enviar Mensagem', sessionId: '', to: '{{trigger.from}}', text: '' },
    'condition': { label: 'Condiçu00e3o', field: 'text', operator: 'contains', value: '' },
    'delay': { label: 'Aguardar', seconds: 5 },
    'http-request': { label: 'HTTP Request', url: '', method: 'GET', body: '' },
  };
  return defaults[type] || { label: type };
}
