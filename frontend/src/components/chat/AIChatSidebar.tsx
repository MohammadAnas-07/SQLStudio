import { useState, useEffect, useRef } from 'react';
import { Send, Trash2, X, Loader2 } from 'lucide-react';
import { ChatMessage } from './ChatMessage';

interface Message {
  id: string;
  role: 'user' | 'model';
  content: string;
}

interface AIChatSidebarProps {
  onClose: () => void;
  onExecuteQuery: (sql: string) => void;
  onInsertIntoEditor: (sql: string) => void;
}

export function AIChatSidebar({ onClose, onExecuteQuery, onInsertIntoEditor }: AIChatSidebarProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchHistory();
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  const fetchHistory = async () => {
    try {
      const res = await fetch('http://localhost:3000/api/ai/history');
      const data = await res.json();
      if (data.success) {
        setMessages(data.history || []);
      }
    } catch (e) {
      console.error('Failed to fetch history', e);
    }
  };

  const handleSend = async () => {
    if (!input.trim()) return;
    
    const userMsg = input.trim();
    setInput('');
    setMessages(prev => [...prev, { id: Date.now().toString(), role: 'user', content: userMsg }]);
    setIsLoading(true);

    try {
      const res = await fetch('http://localhost:3000/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: userMsg })
      });
      const data = await res.json();
      if (data.success) {
        setMessages(prev => [...prev, { id: Date.now().toString() + 'm', role: 'model', content: data.response }]);
      } else {
        setMessages(prev => [...prev, { id: Date.now().toString() + 'e', role: 'model', content: `**Error:** ${data.error}` }]);
      }
    } catch (error: any) {
      setMessages(prev => [...prev, { id: Date.now().toString() + 'e', role: 'model', content: `**Network Error:** Could not reach the server.` }]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleClear = async () => {
    try {
      await fetch('http://localhost:3000/api/ai/history', { method: 'DELETE' });
      setMessages([]);
    } catch (e) {
      console.error('Failed to clear history', e);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="w-full flex flex-col h-full border-l border-border bg-canvas relative z-20 shadow-[-10px_0_30px_-15px_rgba(0,0,0,0.5)]">
      {/* Header */}
      <div className="h-14 border-b border-border flex items-center justify-between px-4 shrink-0 bg-canvas-soft">
        <h3 className="font-medium text-sm text-foreground flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-purple-500 animate-pulse"></span>
          AI Assistant
        </h3>
        <div className="flex items-center gap-1">
          <button onClick={handleClear} className="p-2 text-muted-foreground hover:text-red-400 rounded-md hover:bg-canvas-night-soft transition-colors" title="Clear Chat">
            <Trash2 size={16} />
          </button>
          <button onClick={onClose} className="p-2 text-muted-foreground hover:text-foreground rounded-md hover:bg-canvas-night-soft transition-colors" title="Close AI Panel">
            <X size={16} />
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-2">
        {messages.length === 0 && (
          <div className="h-full flex flex-col items-center justify-center text-center text-muted-foreground opacity-70">
            <div className="w-16 h-16 rounded-full bg-canvas-night flex items-center justify-center mb-4">
              <span className="text-3xl">✨</span>
            </div>
            <p className="text-sm font-medium">How can I help you today?</p>
            <p className="text-xs mt-2 max-w-[200px]">Ask me to generate SQL, explain a query, or optimize your code.</p>
          </div>
        )}
        
        {messages.map((msg, i) => (
          <ChatMessage
            key={msg.id || i}
            role={msg.role}
            content={msg.content}
            onExecute={onExecuteQuery}
            onCopy={onInsertIntoEditor}
          />
        ))}
        
        {isLoading && (
          <div className="flex gap-3 p-4 bg-canvas-soft rounded-md my-2">
            <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 bg-purple-600 text-white animate-pulse">
              <Loader2 size={18} className="animate-spin" />
            </div>
            <div className="flex-1 text-sm text-muted-foreground flex items-center">
              Generating response...
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="p-4 border-t border-border bg-canvas-soft shrink-0">
        <div className="relative flex items-end bg-canvas-night border border-border rounded-lg overflow-hidden focus-within:border-purple-500/50 focus-within:ring-1 focus-within:ring-purple-500/20 transition-all">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask AI (e.g. 'Show top 10 customers')..."
            className="w-full max-h-32 min-h-[44px] bg-transparent text-sm p-3 outline-none resize-none text-foreground"
            rows={1}
            disabled={isLoading}
          />
          <button
            onClick={handleSend}
            disabled={isLoading || !input.trim()}
            className="p-3 text-purple-400 hover:text-purple-300 disabled:opacity-50 disabled:hover:text-purple-400 transition-colors"
          >
            {isLoading ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
          </button>
        </div>
      </div>
    </div>
  );
}
