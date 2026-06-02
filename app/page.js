'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

// ============== UTILITY FUNCTIONS ==============
function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

function formatTime(date) {
  return new Date(date).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function getStoredConversations() {
  if (typeof window === 'undefined') return [];
  try {
    return JSON.parse(localStorage.getItem('agentaz_conversations') || '[]');
  } catch { return []; }
}

function saveConversations(conversations) {
  if (typeof window === 'undefined') return;
  localStorage.setItem('agentaz_conversations', JSON.stringify(conversations));
}

function getStoredSettings() {
  if (typeof window === 'undefined') return {};
  try {
    return JSON.parse(localStorage.getItem('agentaz_settings') || '{}');
  } catch { return {}; }
}

function saveSettings(settings) {
  if (typeof window === 'undefined') return;
  localStorage.setItem('agentaz_settings', JSON.stringify(settings));
}

// ============== SUGGESTIONS ==============
const SUGGESTIONS = [
  { icon: '💡', text: 'Me explique como funciona inteligência artificial' },
  { icon: '📝', text: 'Me ajude a escrever um e-mail profissional' },
  { icon: '🔍', text: 'Quais são as melhores práticas de programação?' },
  { icon: '🚀', text: 'Crie um plano de estudos para aprender Python' },
];

// ============== MAIN PAGE COMPONENT ==============
export default function Home() {
  const [conversations, setConversations] = useState([]);
  const [activeConvId, setActiveConvId] = useState(null);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settings, setSettings] = useState({
    endpoint: '',
    apiKey: '',
    agentId: 'agt',
    deploymentName: '',
    apiVersion: '2024-08-01-preview',
  });

  const chatEndRef = useRef(null);
  const textareaRef = useRef(null);

  // Load from localStorage
  useEffect(() => {
    const stored = getStoredConversations();
    const storedSettings = getStoredSettings();
    setConversations(stored);
    if (storedSettings.endpoint) {
      setSettings({
        agentId: 'agt',
        apiVersion: '2024-08-01-preview',
        ...storedSettings
      });
    }
    if (stored.length > 0) setActiveConvId(stored[0].id);
  }, []);

  // Save conversations to localStorage
  useEffect(() => {
    if (conversations.length > 0) saveConversations(conversations);
  }, [conversations]);

  // Auto-scroll
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [conversations, isLoading]);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 150) + 'px';
    }
  }, [input]);

  // Desktop sidebar default open
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 769px)');
    setSidebarOpen(mq.matches);
    const handler = (e) => setSidebarOpen(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  const activeConv = conversations.find(c => c.id === activeConvId);
  const messages = activeConv?.messages || [];

  const createNewConversation = useCallback(() => {
    const newConv = {
      id: generateId(),
      title: 'Nova Conversa',
      messages: [],
      createdAt: new Date().toISOString(),
    };
    setConversations(prev => [newConv, ...prev]);
    setActiveConvId(newConv.id);
    setInput('');
    if (window.innerWidth < 769) setSidebarOpen(false);
  }, []);

  const deleteConversation = useCallback((id) => {
    setConversations(prev => {
      const updated = prev.filter(c => c.id !== id);
      if (id === activeConvId) {
        setActiveConvId(updated.length > 0 ? updated[0].id : null);
      }
      if (updated.length === 0) {
        localStorage.removeItem('agentaz_conversations');
      }
      return updated;
    });
  }, [activeConvId]);

  const switchConversation = useCallback((id) => {
    setActiveConvId(id);
    if (window.innerWidth < 769) setSidebarOpen(false);
  }, []);

  const handleSend = useCallback(async (text) => {
    const messageText = text || input.trim();
    if (!messageText || isLoading) return;

    let currentConvId = activeConvId;

    // Create conversation if none exists
    if (!currentConvId) {
      const newConv = {
        id: generateId(),
        title: messageText.substring(0, 40) + (messageText.length > 40 ? '...' : ''),
        messages: [],
        createdAt: new Date().toISOString(),
      };
      currentConvId = newConv.id;
      setConversations(prev => [newConv, ...prev]);
      setActiveConvId(currentConvId);
    }

    const userMessage = {
      id: generateId(),
      role: 'user',
      content: messageText,
      timestamp: new Date().toISOString(),
    };

    // Update title if it's the first message
    setConversations(prev => prev.map(c => {
      if (c.id === currentConvId) {
        const isFirst = c.messages.length === 0;
        return {
          ...c,
          title: isFirst ? messageText.substring(0, 40) + (messageText.length > 40 ? '...' : '') : c.title,
          messages: [...c.messages, userMessage],
        };
      }
      return c;
    }));

    setInput('');
    setIsLoading(true);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [...(conversations.find(c => c.id === currentConvId)?.messages || []), userMessage]
            .map(m => ({ role: m.role, content: m.content })),
          settings: settings.endpoint ? {
            endpoint: settings.endpoint,
            apiKey: settings.apiKey,
            agentId: settings.agentId,
            deploymentName: settings.deploymentName,
            apiVersion: settings.apiVersion,
          } : undefined,
        }),
      });

      const data = await response.json();

      const assistantMessage = {
        id: generateId(),
        role: 'assistant',
        content: data.message || data.error || 'Desculpe, não consegui processar sua mensagem.',
        timestamp: new Date().toISOString(),
        isError: !!data.error,
      };

      setConversations(prev => prev.map(c => {
        if (c.id === currentConvId) {
          return { ...c, messages: [...c.messages, assistantMessage] };
        }
        return c;
      }));
    } catch (error) {
      const errorMessage = {
        id: generateId(),
        role: 'assistant',
        content: 'Erro de conexão. Verifique sua internet e tente novamente.',
        timestamp: new Date().toISOString(),
        isError: true,
      };

      setConversations(prev => prev.map(c => {
        if (c.id === currentConvId) {
          return { ...c, messages: [...c.messages, errorMessage] };
        }
        return c;
      }));
    } finally {
      setIsLoading(false);
    }
  }, [input, isLoading, activeConvId, conversations, settings]);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleSaveSettings = () => {
    saveSettings(settings);
    setSettingsOpen(false);
  };

  const isConfigured = !!settings.endpoint && !!settings.apiKey;

  return (
    <div className="app-container">
      {/* Sidebar Overlay (mobile) */}
      <div
        className={`sidebar-overlay ${sidebarOpen ? 'visible' : ''}`}
        onClick={() => setSidebarOpen(false)}
      />

      {/* Sidebar */}
      <aside className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
        <div className="sidebar-header">
          <button className="new-chat-btn" onClick={createNewConversation} id="new-chat-btn">
            <span className="icon">✦</span>
            Nova Conversa
          </button>
        </div>

        <div className="sidebar-conversations">
          {conversations.length === 0 && (
            <p style={{ padding: '16px 12px', fontSize: '13px', color: 'var(--text-tertiary)', textAlign: 'center' }}>
              Nenhuma conversa ainda
            </p>
          )}
          {conversations.length > 0 && (
            <div className="sidebar-section-title">Conversas</div>
          )}
          {conversations.map(conv => (
            <div
              key={conv.id}
              className={`conversation-item ${conv.id === activeConvId ? 'active' : ''}`}
              onClick={() => switchConversation(conv.id)}
            >
              <span className="conv-icon">💬</span>
              <span className="conv-title">{conv.title}</span>
              <button
                className="conv-delete"
                onClick={(e) => { e.stopPropagation(); deleteConversation(conv.id); }}
                title="Excluir conversa"
              >
                ✕
              </button>
            </div>
          ))}
        </div>

        <div className="sidebar-footer">
          <button className="settings-btn" onClick={() => setSettingsOpen(true)} id="settings-btn">
            ⚙️ Configurações
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="main-content">
        {/* Header */}
        <header className="header">
          <div className="header-left">
            <button className="sidebar-toggle" onClick={() => setSidebarOpen(!sidebarOpen)} id="sidebar-toggle">
              ☰
            </button>
            <div className="header-title">
              <h1>AgentAZ</h1>
              <span className="model-badge">
                {isConfigured ? '🟢 Conectado' : '🟡 Não configurado'}
              </span>
            </div>
          </div>
          <div className="header-right">
            <button className="header-btn" onClick={() => setSettingsOpen(true)} title="Configurações" id="header-settings-btn">
              ⚙️
            </button>
          </div>
        </header>

        {/* Chat Window */}
        <div className="chat-window" id="chat-window">
          {messages.length === 0 && !isLoading ? (
            <div className="chat-empty">
              <div className="chat-empty-logo">✦</div>
              <h2>Olá! Sou o AgentAZ</h2>
              <p>Seu assistente de inteligência artificial. Como posso te ajudar hoje?</p>
              <div className="suggestions-grid">
                {SUGGESTIONS.map((s, i) => (
                  <div
                    key={i}
                    className="suggestion-card"
                    onClick={() => handleSend(s.text)}
                  >
                    <div className="suggestion-icon">{s.icon}</div>
                    <div className="suggestion-text">{s.text}</div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <>
              {messages.map((msg) => (
                <div key={msg.id} className={`message-row ${msg.role}`}>
                  <div className="message-avatar">
                    {msg.role === 'assistant' ? '✦' : '👤'}
                  </div>
                  <div className="message-content">
                    <div className={`message-bubble ${msg.isError ? 'error' : ''}`}>
                      {msg.content.split('\n').map((line, i) => (
                        <p key={i}>{line || '\u00A0'}</p>
                      ))}
                    </div>
                    <div className="message-time">{formatTime(msg.timestamp)}</div>
                  </div>
                </div>
              ))}
              {isLoading && (
                <div className="message-row assistant">
                  <div className="message-avatar">✦</div>
                  <div className="message-content">
                    <div className="message-bubble">
                      <div className="typing-indicator">
                        <div className="typing-dot" />
                        <div className="typing-dot" />
                        <div className="typing-dot" />
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
          <div ref={chatEndRef} />
        </div>

        {/* Chat Input */}
        <div className="chat-input-container">
          <div className="chat-input-wrapper">
            <div className="chat-input-box">
              <textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Digite sua mensagem..."
                rows={1}
                id="chat-input"
              />
              <button
                className="send-btn"
                onClick={() => handleSend()}
                disabled={!input.trim() || isLoading}
                id="send-btn"
              >
                ➤
              </button>
            </div>
            <div className="chat-input-hint">
              AgentAZ pode cometer erros. Verifique informações importantes.
            </div>
          </div>
        </div>
      </main>

      {/* Settings Modal */}
      {settingsOpen && (
        <div className="modal-overlay" onClick={() => setSettingsOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>⚙️ Configurações</h2>
              <button className="modal-close" onClick={() => setSettingsOpen(false)}>✕</button>
            </div>
            <div className="modal-body">
              <div className="status-indicator">
                <div className={`status-dot ${isConfigured ? 'connected' : 'disconnected'}`} />
                <span className="status-text">
                  {isConfigured ? 'Azure AI configurado' : 'Azure AI não configurado'}
                </span>
              </div>

              <div className="form-group">
                <label htmlFor="azure-endpoint">Endpoint do Azure AI</label>
                <input
                  id="azure-endpoint"
                  type="text"
                  placeholder="https://seu-recurso.openai.azure.com/"
                  value={settings.endpoint}
                  onChange={(e) => setSettings(s => ({...s, endpoint: e.target.value}))}
                />
                <div className="hint">URL do recurso Azure OpenAI ou Azure AI Foundry</div>
              </div>

              <div className="form-group">
                <label htmlFor="azure-api-key">Chave da API</label>
                <input
                  id="azure-api-key"
                  type="password"
                  placeholder="Sua chave da API do Azure"
                  value={settings.apiKey}
                  onChange={(e) => setSettings(s => ({...s, apiKey: e.target.value}))}
                />
                <div className="hint">Encontre em Azure Portal → Seu recurso → Keys and Endpoint</div>
              </div>

              <div className="form-group">
                <label htmlFor="azure-agent-id">ID do Agente</label>
                <input
                  id="azure-agent-id"
                  type="text"
                  placeholder="agt (padrão)"
                  value={settings.agentId || ''}
                  onChange={(e) => setSettings(s => ({...s, agentId: e.target.value}))}
                />
                <div className="hint">O identificador do Agente no Azure AI Studio (ex: agt)</div>
              </div>

              <div className="form-divider" />

              <div className="form-group">
                <label htmlFor="azure-deployment">Nome do Deployment</label>
                <input
                  id="azure-deployment"
                  type="text"
                  placeholder="gpt-4, gpt-35-turbo, etc."
                  value={settings.deploymentName}
                  onChange={(e) => setSettings(s => ({...s, deploymentName: e.target.value}))}
                />
                <div className="hint">Nome do modelo deployado no Azure AI Studio</div>
              </div>

              <div className="form-group">
                <label htmlFor="azure-api-version">Versão da API</label>
                <input
                  id="azure-api-version"
                  type="text"
                  placeholder="2024-08-01-preview"
                  value={settings.apiVersion}
                  onChange={(e) => setSettings(s => ({...s, apiVersion: e.target.value}))}
                />
                <div className="hint">Versão da API do Azure OpenAI (padrão: 2024-08-01-preview)</div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn-secondary" onClick={() => setSettingsOpen(false)}>Cancelar</button>
              <button className="btn-primary" onClick={handleSaveSettings} id="save-settings-btn">Salvar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
