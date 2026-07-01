import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { Bot, User, Copy, Play } from 'lucide-react';

interface ChatMessageProps {
  role: 'user' | 'model';
  content: string;
  onExecute?: (sql: string) => void;
  onCopy?: (sql: string) => void;
}

export function ChatMessage({ role, content, onExecute, onCopy }: ChatMessageProps) {
  const isUser = role === 'user';

  return (
    <div className={`flex gap-3 p-4 ${isUser ? '' : 'bg-canvas-soft'} rounded-md my-2`}>
      <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${isUser ? 'bg-primary text-primary-foreground' : 'bg-purple-600 text-white'}`}>
        {isUser ? <User size={18} /> : <Bot size={18} />}
      </div>
      <div className="flex-1 overflow-x-auto text-sm text-foreground">
        {isUser ? (
          <div className="whitespace-pre-wrap">{content}</div>
        ) : (
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              code({ node, inline, className, children, ...props }: any) {
                const match = /language-(\w+)/.exec(className || '');
                const isSql = match && match[1] === 'sql';
                const codeStr = String(children).replace(/\n$/, '');

                if (!inline && match) {
                  return (
                    <div className="relative group mt-2 mb-4 rounded-md overflow-hidden border border-border">
                      <div className="flex items-center justify-between px-4 py-1 bg-canvas-night text-xs text-muted-foreground border-b border-border">
                        <span>{match[1].toUpperCase()}</span>
                        {isSql && (
                          <div className="flex items-center gap-2">
                            {onCopy && (
                              <button onClick={() => onCopy(codeStr)} className="hover:text-foreground transition-colors flex items-center gap-1" title="Copy SQL">
                                <Copy size={12} /> Copy
                              </button>
                            )}
                            {onExecute && (
                              <button onClick={() => onExecute(codeStr)} className="hover:text-primary transition-colors flex items-center gap-1 text-primary-soft" title="Execute SQL">
                                <Play size={12} /> Execute
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                      <SyntaxHighlighter
                        style={vscDarkPlus as any}
                        language={match[1]}
                        PreTag="div"
                        customStyle={{ margin: 0, borderRadius: 0, background: 'transparent' }}
                        {...props}
                      >
                        {codeStr}
                      </SyntaxHighlighter>
                    </div>
                  );
                }
                return (
                  <code className="bg-canvas-night px-1 py-0.5 rounded text-primary-soft" {...props}>
                    {children}
                  </code>
                );
              }
            }}
          >
            {content}
          </ReactMarkdown>
        )}
      </div>
    </div>
  );
}
