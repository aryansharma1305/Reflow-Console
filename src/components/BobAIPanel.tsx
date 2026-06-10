"use client";

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Bot, RotateCcw, Send, Sparkles, Copy, Check } from "lucide-react";
import { useProjects } from "@/lib/ProjectsContext";

const API_BASE_URL = (process.env.NEXT_PUBLIC_REFLOW_API_URL || "https://reflow-backend.fly.dev/api/v1").replace(/\/+$/, "");
const DASHBOARD_CHAT_BASE_URL = "https://reflow-backend.fly.dev/api/v1";
const CHAT_REQUEST_TIMEOUT_MS = 30_000; // 30s — backend AI can be slow
const CHAT_BASE_CANDIDATES = Array.from(new Set([API_BASE_URL, DASHBOARD_CHAT_BASE_URL].filter(Boolean)));

interface BobAIPanelProps {
    isOpen: boolean;
    onClose: () => void;
    deviceId?: string;
}

interface ChatMessage {
    id: string;
    role: "user" | "assistant";
    content: string;
    ts: number;
}

interface DeviceOption {
    serial: string;
    name: string;
    projectName?: string;
}

function getStoredDeviceId(): string {
    if (typeof window !== "undefined") {
        const stored = sessionStorage.getItem("chatbot_device_id");
        if (stored) return stored;
    }
    return "";
}

function rememberDeviceId(deviceId: string) {
    if (typeof window === "undefined" || !deviceId) return;
    sessionStorage.setItem("chatbot_device_id", deviceId);
}

function getAuthToken(): string {
    if (typeof window === "undefined") return "";
    return sessionStorage.getItem("auth_token") || localStorage.getItem("auth_token") || "";
}

function getChatSessionId(payload: any): string | null {
    return (
        payload?.data?.session_id ||
        payload?.data?.sessionId ||
        payload?.data?._id ||
        payload?.data?.id ||
        payload?.session_id ||
        payload?.sessionId ||
        payload?._id ||
        payload?.id ||
        null
    );
}

function getChatReply(payload: any): string | null {
    if (payload?.status === "error") return null;
    return (
        payload?.data?.response ||
        payload?.data?.ai_response ||
        payload?.response ||
        payload?.reply ||
        payload?.text ||
        null
    );
}

// ── Fetch with timeout ──────────────────────────────────────────
async function fetchJsonWithTimeout(url: string, init: RequestInit, timeoutMs = CHAT_REQUEST_TIMEOUT_MS) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
        const response = await fetch(url, { ...init, signal: controller.signal });
        const contentType = response.headers.get("content-type") || "";
        if (contentType.includes("application/json")) {
            const data = await response.json();
            return { response, data, text: "" };
        }
        const text = await response.text();
        return { response, data: null, text };
    } finally {
        clearTimeout(timeoutId);
    }
}

function buildAuthHeader(token: string): Record<string, string> {
    return token ? { Authorization: `Bearer ${token}` } : {};
}

async function createSessionForBase(baseUrl: string, targetDeviceId: string, token: string): Promise<{ sessionId: string; error?: string }> {
    const endpoint = `${baseUrl}/create/chat/session`;
    const first = await fetchJsonWithTimeout(endpoint, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            ...buildAuthHeader(token),
        },
        body: JSON.stringify({ device_id: targetDeviceId }),
    });

    if (first.response.ok) {
        const parsedId = getChatSessionId(first.data);
        if (parsedId) return { sessionId: parsedId };
        return { sessionId: "", error: "Session id missing in response." };
    }

    // Match dashboard widget behavior: retry without auth if auth is rejected.
    if (token && first.response.status === 401) {
        const second = await fetchJsonWithTimeout(endpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ device_id: targetDeviceId }),
        });
        if (second.response.ok) {
            const parsedId = getChatSessionId(second.data);
            if (parsedId) return { sessionId: parsedId };
            return { sessionId: "", error: "Session id missing in response." };
        }
        const secondError = second.data?.message || second.data?.error || second.text || `HTTP ${second.response.status}`;
        return { sessionId: "", error: secondError };
    }

    const firstError = first.data?.message || first.data?.error || first.text || `HTTP ${first.response.status}`;
    return { sessionId: "", error: firstError };
}

async function sendChatMessage(baseUrl: string, sessionId: string, userQuery: string, token: string): Promise<string> {
    const endpoint = `${baseUrl}/generate/chat/${sessionId}/response`;
    const first = await fetchJsonWithTimeout(endpoint, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            ...buildAuthHeader(token),
        },
        body: JSON.stringify({ user_query: userQuery }),
    });

    let finalResponse = first.response;
    let finalData = first.data;
    let finalText = first.text;

    if (!first.response.ok && token && first.response.status === 401) {
        const retry = await fetchJsonWithTimeout(endpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ user_query: userQuery }),
        });
        finalResponse = retry.response;
        finalData = retry.data;
        finalText = retry.text;
    }

    if (!finalResponse.ok || finalData?.status === "error") {
        const apiMessage = finalData?.message || finalData?.error || finalText || `HTTP ${finalResponse.status}`;
        throw new Error(`Chat response failed: ${apiMessage}`);
    }

    const botMessage = getChatReply(finalData);
    if (!botMessage) throw new Error("No response content from server.");

    return botMessage;
}

function buildContextualUserQuery(query: string, deviceId: string, device: DeviceOption | null): string {
    const deviceName = device?.name || deviceId;
    const projectName = device?.projectName || "Unknown project";

    return [
        "You are Bob AI inside the ReFlow Console.",
        `Selected device: ${deviceName} (${deviceId}) in project ${projectName}.`,
        "Do not ask which device the user means. Answer for this ReFlow IoT device.",
        `User question: ${query}`,
    ].join("\n");
}

// ── Markdown-like renderer: bold, inline-code, bullet lists, numbered lists ──
function RenderContent({ text }: { text: string }) {
    const lines = text.split("\n");

    return (
        <div className="space-y-1.5">
            {lines.map((line, li) => {
                // Bullet list
                if (/^[-•*]\s/.test(line)) {
                    return (
                        <div key={li} className="flex gap-2 items-start">
                            <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-primary flex-shrink-0" />
                            <span>{renderInline(line.replace(/^[-•*]\s/, ""))}</span>
                        </div>
                    );
                }
                // Numbered list
                if (/^\d+\.\s/.test(line)) {
                    const num = line.match(/^(\d+)\.\s/)?.[1];
                    return (
                        <div key={li} className="flex gap-2 items-start">
                            <span className="flex-shrink-0 text-primary font-mono text-xs mt-0.5">{num}.</span>
                            <span>{renderInline(line.replace(/^\d+\.\s/, ""))}</span>
                        </div>
                    );
                }
                // Heading (##)
                if (line.startsWith("## ")) {
                    return <p key={li} className="font-bold text-text-primary mt-2">{line.slice(3)}</p>;
                }
                if (line.startsWith("# ")) {
                    return <p key={li} className="font-bold text-text-primary text-base mt-2">{line.slice(2)}</p>;
                }
                // Empty line → spacing
                if (!line.trim()) return <div key={li} className="h-1" />;

                return <p key={li}>{renderInline(line)}</p>;
            })}
        </div>
    );
}

function renderInline(text: string): React.ReactNode {
    // Split on **bold** and `code`
    const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
    return parts.map((part, i) => {
        if (part.startsWith("**") && part.endsWith("**")) {
            return <strong key={i} className="font-semibold text-text-primary">{part.slice(2, -2)}</strong>;
        }
        if (part.startsWith("`") && part.endsWith("`")) {
            return (
                <code key={i} className="px-1.5 py-0.5 rounded bg-surface-muted border border-border-subtle font-mono text-[11px] text-primary">
                    {part.slice(1, -1)}
                </code>
            );
        }
        return <span key={i}>{part}</span>;
    });
}

// ── Copy button for assistant messages ───────────────────────────
function CopyButton({ text }: { text: string }) {
    const [copied, setCopied] = useState(false);
    const copy = () => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
    };
    return (
        <button
            onClick={copy}
            className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-white/10 text-white/40 hover:text-white/70"
            title="Copy"
        >
            {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
        </button>
    );
}

// ── Typing cursor animation ───────────────────────────────────────
function TypingDots() {
    return (
        <div className="flex items-center gap-1 py-1">
            {[0, 1, 2].map((i) => (
                <span
                    key={i}
                    className="w-2 h-2 rounded-full bg-primary animate-bounce"
                    style={{ animationDelay: `${i * 0.15}s` }}
                />
            ))}
        </div>
    );
}

// ── Suggestion chips ─────────────────────────────────────────────
const SUGGESTIONS = [
    "What can you help me with?",
    "How do I read channel data?",
    "How do I export a report?",
    "What does MQTT status mean?",
];

export default function BobAIPanel({ isOpen, onClose, deviceId }: BobAIPanelProps) {
    const { devices: cachedDevices, loading: devicesLoading } = useProjects();
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [input, setInput] = useState("");
    const [isThinking, setIsThinking] = useState(false);
    const [sessionId, setSessionId] = useState<string | null>(null);
    const [sessionBaseUrl, setSessionBaseUrl] = useState<string | null>(null);
    const [selectedDeviceId, setSelectedDeviceId] = useState("");
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLTextAreaElement>(null);

    const deviceOptions = useMemo<DeviceOption[]>(() => {
        const seen = new Set<string>();
        return (cachedDevices || [])
            .map((device: any) => {
                const serial = String(
                    device.serialNumber ||
                    device.serial_no ||
                    device.serialNo ||
                    device.serial_number ||
                    device.deviceId ||
                    device.id ||
                    device._id ||
                    ""
                ).trim();
                if (!serial || seen.has(serial)) return null;
                seen.add(serial);
                return {
                    serial,
                    name: String(device.name || serial),
                    projectName: device.projectName ? String(device.projectName) : undefined,
                };
            })
            .filter(Boolean) as DeviceOption[];
    }, [cachedDevices]);

    const activeDeviceId = useMemo(() => {
        const storedDeviceId = getStoredDeviceId();
        const storedDeviceStillExists =
            !storedDeviceId ||
            deviceOptions.length === 0 ||
            deviceOptions.some((device) => device.serial === storedDeviceId);

        return (
            deviceId ||
            selectedDeviceId ||
            (storedDeviceStillExists ? storedDeviceId : "") ||
            deviceOptions[0]?.serial ||
            ""
        );
    }, [deviceId, selectedDeviceId, deviceOptions]);

    const activeDevice = useMemo(() => {
        return deviceOptions.find((device) => device.serial === activeDeviceId) || null;
    }, [activeDeviceId, deviceOptions]);

    // Greet on open
    useEffect(() => {
        if (isOpen && messages.length === 0) {
            setMessages([
                {
                    id: "welcome",
                    role: "assistant",
                    content: activeDeviceId
                        ? `Hi! I'm **Bob**, your Reflow AI assistant.\n\nI'm currently watching over device **${activeDevice?.name || activeDeviceId}** (${activeDeviceId}). I can help you understand sensor readings, configure thresholds, troubleshoot issues, or export data.\n\nWhat would you like to know?`
                        : `Hi! I'm **Bob**, your Reflow AI assistant.\n\nPlease select a device first. Bob needs a device serial number before starting a chat session.`,
                    ts: Date.now(),
                },
            ]);
        }
        if (isOpen) {
            setTimeout(() => inputRef.current?.focus(), 300);
        }
    }, [isOpen, activeDeviceId, activeDevice?.name, messages.length]);

    useEffect(() => {
        if (!activeDeviceId) return;
        rememberDeviceId(activeDeviceId);
    }, [activeDeviceId]);

    useEffect(() => {
        setSessionId(null);
        setSessionBaseUrl(null);
        if (!messages.length) return;
        setMessages((prev) => {
            if (prev.length === 1 && (prev[0].id === "welcome" || prev[0].id === "reset")) {
                return [{
                    id: "device-change",
                    role: "assistant",
                    content: activeDeviceId
                        ? `Device selected: **${activeDevice?.name || activeDeviceId}** (${activeDeviceId}). Ask me anything about this device.`
                        : "Please select a device first. Bob needs a device serial number before starting a chat session.",
                    ts: Date.now(),
                }];
            }
            return [
                ...prev,
                {
                    id: `device-change-${Date.now()}`,
                    role: "assistant",
                    content: activeDeviceId
                        ? `Switched to **${activeDevice?.name || activeDeviceId}** (${activeDeviceId}). I will use this device for the next answers.`
                        : "Device context cleared. Please select a device before asking Bob.",
                    ts: Date.now(),
                },
            ];
        });
    }, [activeDeviceId]); // eslint-disable-line react-hooks/exhaustive-deps

    // Scroll to bottom on new message
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages, isThinking]);

    // Auto-grow textarea
    const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        setInput(e.target.value);
        e.target.style.height = "auto";
        e.target.style.height = Math.min(e.target.scrollHeight, 140) + "px";
    };

    const sendMessage = useCallback(async (text?: string) => {
        const msg = (text ?? input).trim();
        if (!msg || isThinking) return;
        if (!activeDeviceId) {
            setMessages((prev) => [
                ...prev,
                {
                    id: `a-${Date.now()}`,
                    role: "assistant",
                    content: devicesLoading
                        ? "I am still loading your devices. Please try again in a moment."
                        : "Please select a device first. Bob needs a device serial number to create a chat session.",
                    ts: Date.now(),
                },
            ]);
            return;
        }

        const userMsg: ChatMessage = {
            id: `u-${Date.now()}`,
            role: "user",
            content: msg,
            ts: Date.now(),
        };
        setMessages((prev) => [...prev, userMsg]);
        setInput("");
        if (inputRef.current) { inputRef.current.style.height = "auto"; }
        setIsThinking(true);

        try {
            const token = getAuthToken();
            let currentSessionId = sessionId;
            let currentSessionBase = sessionBaseUrl;

            if (!currentSessionId || !currentSessionBase) {
                const errors: string[] = [];

                for (const baseUrl of CHAT_BASE_CANDIDATES) {
                    try {
                        const result = await createSessionForBase(baseUrl, activeDeviceId, token);
                        if (result.sessionId) {
                            currentSessionId = result.sessionId;
                            currentSessionBase = baseUrl;
                            break;
                        }
                        if (result.error) errors.push(`${baseUrl}: ${result.error}`);
                    } catch (err: any) {
                        const reason = typeof err?.message === "string" ? err.message : "unknown error";
                        errors.push(`${baseUrl}: ${reason}`);
                    }
                }

                if (!currentSessionId || !currentSessionBase) {
                    throw new Error(`Session creation failed for ${activeDeviceId}. ${errors.join(" | ")}`);
                }

                setSessionId(currentSessionId);
                setSessionBaseUrl(currentSessionBase);
            }

            const contextualQuery = buildContextualUserQuery(msg, activeDeviceId, activeDevice);
            const reply = await sendChatMessage(currentSessionBase, currentSessionId, contextualQuery, token);

            setMessages((prev) => [
                ...prev,
                {
                    id: `a-${Date.now()}`,
                    role: "assistant",
                    content: reply,
                    ts: Date.now(),
                },
            ]);
        } catch (error: any) {
            console.error("[BobAI] Error:", error);

            const message = error?.name === "AbortError"
                ? "Chat request timed out. The AI service may be slow — please try again."
                : (typeof error?.message === "string" ? error.message : "Unable to connect to chat right now.");

            setMessages((prev) => [
                ...prev,
                {
                    id: `a-${Date.now()}`,
                    role: "assistant",
                    content: `Bob AI is unavailable right now.\n\n${message}`,
                    ts: Date.now(),
                },
            ]);
        } finally {
            setIsThinking(false);
        }
    }, [input, isThinking, activeDeviceId, activeDevice, devicesLoading, sessionId, sessionBaseUrl]);

    const handleReset = () => {
        setMessages([]);
        setInput("");
        setIsThinking(false);
        setSessionId(null);
        setSessionBaseUrl(null);
        setTimeout(() => {
            setMessages([{
                id: "reset",
                role: "assistant",
                content: activeDeviceId
                    ? `Chat cleared. I am watching **${activeDevice?.name || activeDeviceId}** (${activeDeviceId}). How can I help?`
                    : "Chat cleared. Please select a device first.",
                ts: Date.now(),
            }]);
        }, 80);
    };

    return (
        <AnimatePresence>
            {isOpen && (
                <motion.div
                    key="bob-panel"
                    initial={{ x: "100%", opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    exit={{ x: "100%", opacity: 0 }}
                    transition={{ type: "spring", damping: 30, stiffness: 300 }}
                    className="absolute inset-0 z-50 flex flex-col bg-white border-l border-border-subtle shadow-2xl w-full h-full"
                >
                    {/* ── Header ─────────────────────────────────────────── */}
                    <div className="flex items-center justify-between px-5 py-3.5 border-b border-border-subtle flex-shrink-0 bg-surface-muted">
                        <div className="flex items-center gap-3">
                            <div className="relative">
                                <div className="w-8 h-8 rounded-xl bg-primary flex items-center justify-center shadow-lg shadow-primary/40">
                                    <Bot className="w-4 h-4 text-white" />
                                </div>
                                <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-success border-2 border-white" />
                            </div>
                            <div>
                                <p className="text-sm font-bold text-text-primary leading-none">Bob AI</p>
                                <p className="text-[11px] font-medium text-text-muted mt-0.5">
                                    {activeDeviceId ? `Watching ${activeDeviceId}` : "Select a device"}
                                </p>
                            </div>
                        </div>
                        <div className="flex items-center gap-1">
                            <button
                                onClick={handleReset}
                                title="Clear chat"
                                className="p-2 rounded-lg text-text-muted hover:text-primary hover:bg-primary/10 transition-colors"
                            >
                                <RotateCcw className="w-3.5 h-3.5" />
                            </button>
                            <button
                                onClick={onClose}
                                title="Close"
                                className="p-2 rounded-lg text-text-muted hover:text-primary hover:bg-primary/10 transition-colors"
                            >
                                <X className="w-3.5 h-3.5" />
                            </button>
                        </div>
                    </div>

                    {!deviceId && (
                        <div className="px-5 py-3 border-b border-border-subtle bg-white flex-shrink-0">
                            <label className="block text-[10px] font-bold uppercase tracking-wider text-text-muted mb-1.5">
                                Device context
                            </label>
                            <select
                                value={activeDeviceId}
                                onChange={(event) => setSelectedDeviceId(event.target.value)}
                                disabled={devicesLoading || deviceOptions.length === 0 || isThinking}
                                className="w-full rounded-xl border border-border-default bg-white px-3 py-2 text-sm font-semibold text-text-primary outline-none focus:border-primary focus:ring-2 focus:ring-primary/10 disabled:opacity-60 disabled:cursor-not-allowed"
                            >
                                {!activeDeviceId && (
                                    <option value="">
                                        {devicesLoading ? "Loading devices..." : "Select a device"}
                                    </option>
                                )}
                                {activeDeviceId && !deviceOptions.some((device) => device.serial === activeDeviceId) && (
                                    <option value={activeDeviceId}>{activeDeviceId}</option>
                                )}
                                {deviceOptions.map((device) => (
                                    <option key={device.serial} value={device.serial}>
                                        {device.name} ({device.serial}){device.projectName ? ` - ${device.projectName}` : ""}
                                    </option>
                                ))}
                            </select>
                        </div>
                    )}

                    {/* ── Messages ──────────────────────────────────────── */}
                    <div className="flex-1 overflow-y-auto px-5 py-6 space-y-6 scrollbar-thin scrollbar-thumb-border-subtle hover:scrollbar-thumb-border-default">
                        {messages.map((msg, idx) => (
                            <motion.div
                                key={msg.id}
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ duration: 0.2, delay: idx === messages.length - 1 ? 0 : 0 }}
                            >
                                {msg.role === "user" ? (
                                    /* User message — right-aligned pill */
                                    <div className="flex justify-end mb-1">
                                        <div className="max-w-[80%] bg-primary text-white text-sm px-4 py-2.5 rounded-2xl rounded-br-sm leading-relaxed shadow-sm">
                                            {msg.content}
                                        </div>
                                    </div>
                                ) : (
                                    /* Assistant message — full width, no bubble */
                                    <div className="group">
                                        <div className="flex items-center gap-2 mb-2">
                                            <div className="w-5 h-5 rounded-full bg-primary flex items-center justify-center flex-shrink-0 shadow-sm">
                                                <Sparkles className="w-2.5 h-2.5 text-white" />
                                            </div>
                                            <span className="text-[11px] font-bold text-text-muted uppercase tracking-wider">Bob</span>
                                            <CopyButton text={msg.content} />
                                        </div>
                                        <div className="text-sm font-medium text-text-secondary leading-relaxed pl-7">
                                            <RenderContent text={msg.content} />
                                        </div>
                                    </div>
                                )}
                            </motion.div>
                        ))}

                        {/* Thinking indicator */}
                        {isThinking && (
                            <motion.div
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                className="group"
                            >
                                <div className="flex items-center gap-2 mb-2">
                                    <div className="w-5 h-5 rounded-full bg-primary flex items-center justify-center flex-shrink-0 shadow-sm">
                                        <Sparkles className="w-2.5 h-2.5 text-white animate-pulse" />
                                    </div>
                                    <span className="text-[11px] font-bold text-text-muted uppercase tracking-wider">Bob</span>
                                </div>
                                <div className="pl-7">
                                    <TypingDots />
                                </div>
                            </motion.div>
                        )}

                        <div ref={messagesEndRef} />
                    </div>

                    {/* ── Suggestions (only when 1 message = welcome) ── */}
                    {messages.length === 1 && !isThinking && (
                        <div className="px-5 pb-3 flex flex-wrap gap-2">
                            {SUGGESTIONS.map((s) => (
                                <button
                                    key={s}
                                    onClick={() => sendMessage(s)}
                                    className="text-xs font-semibold px-3 py-1.5 rounded-full border border-border-default text-text-secondary hover:border-primary hover:text-primary hover:bg-primary/5 transition-all shadow-sm bg-white"
                                >
                                    {s}
                                </button>
                            ))}
                        </div>
                    )}

                    {/* ── Input ─────────────────────────────────────────── */}
                    <div className="px-4 pb-5 pt-3 border-t border-border-subtle bg-surface flex-shrink-0">
                        <div className="relative bg-white border border-border-default rounded-2xl focus-within:border-primary focus-within:ring-1 focus-within:ring-primary/20 transition-all shadow-sm">
                            <textarea
                                ref={inputRef}
                                rows={1}
                                value={input}
                                onChange={handleInputChange}
                                onKeyDown={(e) => {
                                    if (e.key === "Enter" && !e.shiftKey) {
                                        e.preventDefault();
                                        sendMessage();
                                    }
                                }}
                                placeholder="Ask Bob anything… (Enter to send, Shift+Enter for newline)"
                                className="w-full bg-transparent text-sm font-medium text-text-primary placeholder:text-text-muted py-3.5 pl-4 pr-14 focus:outline-none resize-none max-h-36 scrollbar-thin"
                            />
                            <div className="absolute bottom-2 right-2 flex items-center gap-2">
                                {isThinking && (
                                    <span className="text-[10px] font-bold text-text-muted">
                                        Thinking…
                                    </span>
                                )}
                                <button
                                    onClick={() => sendMessage()}
                                    disabled={!input.trim() || isThinking || !activeDeviceId}
                                    className="w-8 h-8 rounded-xl bg-primary hover:bg-primary-hover flex items-center justify-center transition-colors disabled:opacity-30 disabled:cursor-not-allowed shadow-sm"
                                >
                                    <Send className="w-3.5 h-3.5 text-white" />
                                </button>
                            </div>
                        </div>
                        <p className="text-[10px] font-bold text-text-muted text-center mt-3 uppercase tracking-wider">
                            Bob AI · Powered by Reflow
                        </p>
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
