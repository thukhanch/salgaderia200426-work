import { BrowserRouter, Routes, Route, NavLink } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { WorkflowsPage } from './pages/WorkflowsPage';
import { EditorPage } from './pages/EditorPage';
import { SessionsPage } from './pages/SessionsPage';
import { SalgaderiaPage } from './pages/SalgaderiaPage';
import './App.css';

export default function App() {
  return (
    <BrowserRouter>
      <Toaster position="top-right" />
      <div className="app">
        <aside className="sidebar">
          <div className="logo">
            <span className="logo-icon">⚡</span>
            <span>WhatsApp Flow</span>
          </div>
          <nav>
            <NavLink to="/" end className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
              Workflows
            </NavLink>
            <NavLink to="/salgaderia" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
              🥟 Salgaderia Bot
            </NavLink>
            <NavLink to="/sessions" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
              Sessões WhatsApp
            </NavLink>
          </nav>

          <div style={{ marginTop: 'auto', padding: '16px 20px', borderTop: '1px solid #2a2a2a' }}>
            <p style={{ fontSize: 10, color: '#333', lineHeight: 1.5 }}>
              Para conectar o WhatsApp:<br />
              1. Vá em "Sessões WhatsApp"<br />
              2. Crie uma sessão<br />
              3. Escaneie o QR Code<br />
              4. Defina a sessão ativa na tela da salgaderia
            </p>
          </div>
        </aside>
        <main className="main">
          <Routes>
            <Route path="/" element={<WorkflowsPage />} />
            <Route path="/workflows/:id" element={<EditorPage />} />
            <Route path="/salgaderia" element={<SalgaderiaPage />} />
            <Route path="/sessions" element={<SessionsPage />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}
