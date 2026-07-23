import { useEffect, useRef } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';

export function TerminalPanel() {
  const terminalRef = useRef<HTMLDivElement>(null);
  const term = useRef<Terminal | null>(null);
  const fitAddon = useRef<FitAddon | null>(null);
  const ws = useRef<WebSocket | null>(null);
  const resizeObserver = useRef<ResizeObserver | null>(null);

  useEffect(() => {
    if (!terminalRef.current) return;

    term.current = new Terminal({
      theme: {
        background: '#1a1a1a', // matches canvas-night conceptually
        foreground: '#e5e5e5',
        cursor: '#e5e5e5',
        selectionBackground: '#404040',
      },
      fontFamily: 'ui-monospace, Menlo, Monaco, "Cascadia Mono", "Segoe UI Mono", "Roboto Mono", "Oxygen Mono", "Ubuntu Monospace", "Source Code Pro", "Fira Mono", "Droid Sans Mono", "Courier New", monospace',
      fontSize: 13,
      cursorBlink: true,
    });
    
    fitAddon.current = new FitAddon();
    term.current.loadAddon(fitAddon.current);
    
    term.current.open(terminalRef.current);
    
    // Connect to WebSocket
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.hostname;
    // Assume backend is on port 3000 on the same host
    const wsUrl = `${protocol}//${host}:3000/api/terminal`;
    ws.current = new WebSocket(wsUrl);
    
    ws.current.onopen = () => {
      // fit once connected
      fitAddon.current?.fit();
      if (term.current && ws.current && ws.current.readyState === WebSocket.OPEN) {
        ws.current.send(JSON.stringify({
          type: 'resize',
          cols: term.current.cols,
          rows: term.current.rows
        }));
      }
    };
    
    ws.current.onmessage = async (event) => {
      let data = event.data;
      if (data instanceof Blob) {
        data = await data.text();
      }
      term.current?.write(data);
    };
    
    ws.current.onerror = () => {
      term.current?.write('\r\n\x1b[31m[WebSocket Error] Connection failed.\x1b[0m\r\n');
    };
    
    ws.current.onclose = () => {
      term.current?.write('\r\n\x1b[33m[Terminal] Connection closed.\x1b[0m\r\n');
    };
    
    term.current.onData((data) => {
      if (ws.current?.readyState === WebSocket.OPEN) {
        ws.current.send(data);
      }
    });

    // Handle Resize
    resizeObserver.current = new ResizeObserver(() => {
      if (fitAddon.current && term.current && ws.current?.readyState === WebSocket.OPEN) {
        fitAddon.current.fit();
        ws.current.send(JSON.stringify({
          type: 'resize',
          cols: term.current.cols,
          rows: term.current.rows
        }));
      }
    });
    
    resizeObserver.current.observe(terminalRef.current);

    return () => {
      resizeObserver.current?.disconnect();
      ws.current?.close();
      term.current?.dispose();
    };
  }, []);

  return (
    <div className="w-full h-full bg-[#1a1a1a] p-2 overflow-hidden">
      <div ref={terminalRef} className="w-full h-full" />
    </div>
  );
}
