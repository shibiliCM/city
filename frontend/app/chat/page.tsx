"use client";

import { useState, useRef, useEffect } from "react";
import { MessageSquare, Send, User, Bot, Sparkles, Clock } from "lucide-react";
import { streamChat } from "@/lib/api";
import { cityId } from "@/lib/utils";

const EXAMPLE_PROMPTS = [
  "What are the top 3 traffic congestion hotspots in the city?",
  "Which zones have the worst air quality and why?",
  "What is the current city health score and what's driving it?",
  "Which areas are most at risk of flooding?",
  "Where should the next hospital be built based on data?",
  "What does the traffic forecast show for the next 30 days?",
  "Which zones need immediate pollution mitigation?",
  "What are the accident-prone areas and contributing factors?",
];

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  streaming?: boolean;
}

function MessageBubble({ msg }: { msg: Message }) {
  const isUser = msg.role === "user";
  return (
    <div style={{
      display: "flex",
      gap: 12,
      alignItems: "flex-start",
      flexDirection: isUser ? "row-reverse" : "row",
      animation: "fade-in 0.3s ease both",
    }}>
      {/* Avatar */}
      <div style={{
        width: 32, height: 32, borderRadius: "50%", flexShrink: 0,
        background: isUser
          ? "var(--city-surface-3)"
          : "linear-gradient(135deg, #7C5CFC, #5C3CFC)",
        display: "flex", alignItems: "center", justifyContent: "center",
        boxShadow: isUser ? "none" : "0 0 12px rgba(124, 92, 252, 0.35)",
        marginTop: 2,
        border: isUser ? "1px solid var(--city-border)" : "none",
      }}>
        {isUser ? <User size={14} color="var(--city-text-muted)" /> : <Bot size={14} color="white" />}
      </div>

      {/* Bubble */}
      <div style={{ maxWidth: "72%", display: "flex", flexDirection: "column", gap: 4, alignItems: isUser ? "flex-end" : "flex-start" }}>
        <div style={{
          padding: "12px 16px",
          borderRadius: isUser ? "16px 16px 4px 16px" : "16px 16px 16px 4px",
          background: isUser ? "linear-gradient(135deg, #7C5CFC, #5C3CFC)" : "var(--city-surface-2)",
          border: isUser ? "none" : "1px solid var(--city-border)",
          fontSize: 13,
          lineHeight: 1.7,
          color: isUser ? "white" : "var(--city-text)",
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
        }}>
          {msg.content}
          {msg.streaming && <span className="stream-cursor" />}
        </div>
        <div style={{ fontSize: 10, color: "var(--city-text-muted)", display: "flex", alignItems: "center", gap: 3 }}>
          <Clock size={9} />
          {msg.timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        </div>
      </div>
    </div>
  );
}

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "welcome",
      role: "assistant",
      content: "Hello! I'm CityTwin AI, your smart city analyst. Ask me about traffic patterns, pollution levels, risk assessments, forecasts, or planning recommendations. I have access to real-time city data.",
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView?.({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = async (text: string) => {
    if (!text.trim() || streaming) return;
    const userMsg: Message = { id: Date.now().toString(), role: "user", content: text.trim(), timestamp: new Date() };
    setMessages(prev => [...prev, userMsg]);
    setInput("");
    setStreaming(true);

    const assistantId = (Date.now() + 1).toString();
    setMessages(prev => [...prev, { id: assistantId, role: "assistant", content: "", timestamp: new Date(), streaming: true }]);

    try {
      await streamChat("/chat/message", { city_id: cityId, message: text.trim() }, (token) => {
        setMessages(prev => prev.map(m =>
          m.id === assistantId ? { ...m, content: m.content + token } : m
        ));
      });
    } catch (e) {
      setMessages(prev => prev.map(m =>
        m.id === assistantId
          ? { ...m, content: "Sorry, I encountered an error connecting to the backend. Please ensure the API server is running.", streaming: false }
          : m
      ));
    } finally {
      setMessages(prev => prev.map(m => m.id === assistantId ? { ...m, streaming: false } : m));
      setStreaming(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 0, height: "calc(100vh - 112px)" }}>
      {/* Header */}
      <div style={{ marginBottom: 16 }}>
        <h1 className="section-title">
          <MessageSquare size={18} color="var(--city-violet)" style={{ display: "inline-block", marginRight: 8, verticalAlign: "middle" }} />
          <span style={{ verticalAlign: "middle" }}>AI Chat Analyst</span>
        </h1>
        <p className="section-sub">Streaming city intelligence — backed by live data</p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 280px", gap: 16, flex: 1, minHeight: 0 }}>
        {/* Chat panel */}
        <div className="card" style={{ display: "flex", flexDirection: "column", padding: 0, overflow: "hidden" }}>
          {/* Messages */}
          <div style={{ flex: 1, overflowY: "auto", padding: "20px", display: "flex", flexDirection: "column", gap: 18 }}>
            {messages.map(msg => <MessageBubble key={msg.id} msg={msg} />)}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div style={{ borderTop: "1px solid var(--city-border)", padding: "14px 16px", background: "var(--city-surface)" }}>
            <div style={{ display: "flex", gap: 10, alignItems: "flex-end" }}>
              <textarea
                ref={inputRef}
                className="input"
                style={{ flex: 1, resize: "none", height: 44, maxHeight: 120, overflowY: "auto", borderRadius: 10, padding: "11px 14px", lineHeight: 1.5 }}
                placeholder="Ask about traffic, AQI, risks, forecasts… (Enter to send)"
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={streaming}
              />
              <button
                className="btn btn-primary"
                style={{ height: 44, padding: "0 16px", flexShrink: 0 }}
                onClick={() => sendMessage(input)}
                disabled={!input.trim() || streaming}
                aria-label="Send message"
              >
                {streaming
                  ? <span className="animate-spin" style={{ display: "inline-block", width: 14, height: 14, border: "2px solid rgba(255,255,255,0.3)", borderTopColor: "white", borderRadius: "50%" }} />
                  : <Send size={14} />
                }
              </button>
            </div>
            <div style={{ fontSize: 10, color: "var(--city-text-muted)", marginTop: 6, paddingLeft: 2 }}>
              Shift+Enter for newline · Messages are session-scoped
            </div>
          </div>
        </div>

        {/* Prompts sidebar */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div className="card-sm">
            <div style={{ display: "flex", alignItems: "center", gap: 6, fontWeight: 700, fontSize: 13, marginBottom: 14, fontFamily: "var(--font-display)" }}>
              <Sparkles size={13} color="var(--city-violet)" /> Example Prompts
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {EXAMPLE_PROMPTS.map(prompt => (
                <button key={prompt} onClick={() => { setInput(prompt); inputRef.current?.focus(); }}
                  style={{
                    textAlign: "left", padding: "9px 12px", borderRadius: 8,
                    background: "var(--city-surface-2)", border: "1px solid var(--city-border-light)",
                    color: "var(--city-text-dim)", fontSize: 12, cursor: "pointer",
                    transition: "all 0.15s", lineHeight: 1.5,
                  }}
                  onMouseEnter={e => { (e.target as HTMLElement).style.borderColor = "rgba(124, 92, 252, 0.35)"; (e.target as HTMLElement).style.color = "var(--city-text)"; }}
                  onMouseLeave={e => { (e.target as HTMLElement).style.borderColor = "var(--city-border-light)"; (e.target as HTMLElement).style.color = "var(--city-text-dim)"; }}
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>

          <div className="card-sm">
            <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 10, color: "var(--city-text-dim)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Session Info</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {[
                ["City", "Metro City"],
                ["Session", "web"],
                ["Messages", messages.length],
                ["Mode", "Streaming SSE"],
              ].map(([k, v]) => (
                <div key={k as string} style={{ display: "flex", justifyContent: "space-between", fontSize: 11 }}>
                  <span style={{ color: "var(--city-text-muted)" }}>{k}</span>
                  <span style={{ color: "var(--city-text)", fontWeight: 600 }}>{v}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
