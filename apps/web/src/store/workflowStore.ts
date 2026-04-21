import { create } from 'zustand';
import { applyNodeChanges, applyEdgeChanges } from '@xyflow/react';
import type { Node, Edge, NodeChange, EdgeChange } from '@xyflow/react';
import axios from 'axios';

const API = 'http://localhost:3000/api';

interface WorkflowStore {
  workflows: any[];
  currentWorkflow: any | null;
  nodes: Node[];
  edges: Edge[];
  isDirty: boolean;

  fetchWorkflows: () => Promise<void>;
  fetchWorkflow: (id: string) => Promise<void>;
  createWorkflow: (name: string) => Promise<any>;
  saveWorkflow: () => Promise<void>;
  deleteWorkflow: (id: string) => Promise<void>;
  toggleActive: (id: string, active: boolean) => Promise<void>;

  setNodes: (nodes: Node[]) => void;
  setEdges: (edges: Edge[]) => void;
  onNodesChange: (changes: NodeChange[]) => void;
  onEdgesChange: (changes: EdgeChange[]) => void;
  updateNodeData: (nodeId: string, data: any) => void;
}

export const useWorkflowStore = create<WorkflowStore>((set, get) => ({
  workflows: [],
  currentWorkflow: null,
  nodes: [],
  edges: [],
  isDirty: false,

  fetchWorkflows: async () => {
    const { data } = await axios.get(`${API}/workflows`);
    set({ workflows: data });
  },

  fetchWorkflow: async (id) => {
    const { data } = await axios.get(`${API}/workflows/${id}`);
    set({
      currentWorkflow: data,
      nodes: data.nodes || [],
      edges: data.edges || [],
      isDirty: false,
    });
  },

  createWorkflow: async (name) => {
    const { data } = await axios.post(`${API}/workflows`, { name });
    set((s) => ({ workflows: [...s.workflows, data] }));
    return data;
  },

  saveWorkflow: async () => {
    const { currentWorkflow, nodes, edges } = get();
    if (!currentWorkflow) return;
    await axios.put(`${API}/workflows/${currentWorkflow.id}`, { nodes, edges });
    set({ isDirty: false });
  },

  deleteWorkflow: async (id) => {
    await axios.delete(`${API}/workflows/${id}`);
    set((s) => ({ workflows: s.workflows.filter((w) => w.id !== id) }));
  },

  toggleActive: async (id, active) => {
    await axios.post(`${API}/workflows/${id}/${active ? 'activate' : 'deactivate'}`);
    set((s) => ({
      workflows: s.workflows.map((w) => (w.id === id ? { ...w, active } : w)),
    }));
  },

  setNodes: (nodes) => set({ nodes, isDirty: true }),
  setEdges: (edges) => set({ edges, isDirty: true }),

  onNodesChange: (changes) =>
    set((s) => ({ nodes: applyNodeChanges(changes, s.nodes), isDirty: true })),

  onEdgesChange: (changes) =>
    set((s) => ({ edges: applyEdgeChanges(changes, s.edges), isDirty: true })),

  updateNodeData: (nodeId, data) =>
    set((s) => ({
      nodes: s.nodes.map((n) => (n.id === nodeId ? { ...n, data: { ...n.data, ...data } } : n)),
      isDirty: true,
    })),
}));
