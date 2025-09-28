'use client';

import Image from 'next/image';
import type { ChangeEvent } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

type ConversationMessage = {
  id: string;
  role: string;
  text: string;
  images: string[];
  createdAt: number;
  updatedAt: number;
  local?: boolean;
};

type EventLogEntry = {
  id: string;
  type: string;
  title: string;
  description?: string;
  severity: 'info' | 'warn' | 'error';
  ts: number;
};

const DEFAULT_WS_BASE = process.env.NEXT_PUBLIC_REALTIME_WS_URL ?? 'ws://localhost:8000';
const CHUNK_SIZE = 60_000;
const MAX_EVENTS = 150;
const MAX_MESSAGES = 200;
type PersonaKey = 'joi' | 'officer_k' | 'officer_j';
const PERSONA_DEFAULT_THINKING_VIDEO: Record<PersonaKey, string> = {
  joi: '/joi-thinking.mp4',
  officer_k: '/officer_k-thinking.mp4',
  officer_j: '/officer_j-thinking.mp4',
};

const randomId = (prefix: string) => `${prefix}_${Math.random().toString(36).slice(2, 10)}`;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object';

const formatTimestamp = (ts: number) => new Date(ts).toLocaleTimeString();

async function fileToDataUrl(file: File): Promise<string> {
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new Error('Unsupported file reader result.'));
      }
    };
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read file.'));
    reader.readAsDataURL(file);
  });
}

async function prepareImageDataUrl(file: File): Promise<string> {
  const original = await fileToDataUrl(file);
  if (typeof window === 'undefined') {
    return original;
  }
  try {
    return await new Promise<string>((resolve) => {
      const image = new Image();
      image.decoding = 'async';
      image.onload = () => {
        try {
          const maxDim = 1024;
          const maxSide = Math.max(image.width, image.height);
          const scale = maxSide > maxDim ? maxDim / maxSide : 1;
          const width = Math.max(1, Math.round(image.width * scale));
          const height = Math.max(1, Math.round(image.height * scale));
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            resolve(original);
            return;
          }
          ctx.drawImage(image, 0, 0, width, height);
          resolve(canvas.toDataURL('image/jpeg', 0.85));
        } catch (error) {
          console.warn('Image resize failed; sending original.', error);
          resolve(original);
        }
      };
      image.onerror = () => resolve(original);
      image.src = original;
    });
  } catch (error) {
    console.warn('Image processing failed; sending original.', error);
    return original;
  }
}

function parseHistoryMessageItem(item: unknown): ConversationMessage | null {
  if (!isRecord(item)) {
    return null;
  }
  const type = typeof item.type === 'string' ? item.type : null;
  if (type !== 'message') {
    return null;
  }
  const id = typeof item.item_id === 'string' && item.item_id.length > 0 ? item.item_id : randomId('msg');
  const role = typeof item.role === 'string' && item.role.length > 0 ? item.role : 'assistant';
  const textParts: string[] = [];
  const images: string[] = [];
  if (Array.isArray(item.content)) {
    for (const part of item.content) {
      if (!isRecord(part)) {
        continue;
      }
      const partType = typeof part.type === 'string' ? part.type : null;
      if ((partType === 'text' || partType === 'input_text') && typeof part.text === 'string') {
        textParts.push(part.text);
      } else if ((partType === 'input_audio' || partType === 'audio') && typeof part.transcript === 'string') {
        textParts.push(part.transcript);
      } else if (partType === 'input_image') {
        const url = typeof part.image_url === 'string' ? part.image_url : typeof part.url === 'string' ? part.url : null;
        if (url) {
          images.push(url);
        }
      }
    }
  }
  const createdAt = typeof item.created_at === 'string' ? Date.parse(item.created_at) : Date.now();
  const text = textParts.join('').trim();
  return {
    id,
    role,
    text,
    images,
    createdAt: Number.isFinite(createdAt) ? createdAt : Date.now(),
    updatedAt: Date.now(),
  };
}

export default function Home() {
  const [sessionId, setSessionId] = useState<string>('');
  const [persona, setPersona] = useState<PersonaKey>('joi');
  const [thinkingVideo, setThinkingVideo] = useState<string>(PERSONA_DEFAULT_THINKING_VIDEO['joi']);
  const [videoUrl, setVideoUrl] = useState<string>('');
  useEffect(() => {
    // Generate a stable client-only session id to avoid SSR/client mismatch
    setSessionId(randomId('session'));
  }, []);
  const wsBase = useMemo(() => {
    const value = DEFAULT_WS_BASE.trim();
    return value.endsWith('/') ? value.slice(0, -1) : value;
  }, []);

  const buildWsUrl = useCallback((base: string, id: string) => {
    let b = base.trim();
    if (b.endsWith('/')) b = b.slice(0, -1);
    return b.endsWith('/ws') ? `${b}/${id}` : `${b}/ws/${id}`;
  }, []);

  const wsRef = useRef<WebSocket | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const isCapturingRef = useRef(false);
  const isMutedRef = useRef(false);

  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);
  const [statusText, setStatusText] = useState('Disconnected');
  const [lastError, setLastError] = useState<string | null>(null);
  const [isThinking, setIsThinking] = useState(false);
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const messagesMapRef = useRef<Record<string, ConversationMessage>>({});
  const [events, setEvents] = useState<EventLogEntry[]>([]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [promptText, setPromptText] = useState('Please describe this image.');
  const [userInteracted, setUserInteracted] = useState(false);
  const [leftPanelOpen, setLeftPanelOpen] = useState(false);
  const [rightPanelOpen, setRightPanelOpen] = useState(false);

  useEffect(() => {
    isMutedRef.current = isMuted;
  }, [isMuted]);

  useEffect(() => {
    setThinkingVideo((previous) => {
      if (typeof previous === 'string' && previous.startsWith(`/${persona}`)) {
        return previous;
      }
      return PERSONA_DEFAULT_THINKING_VIDEO[persona];
    });
  }, [persona]);

  const logEvent = useCallback(
    (type: string, title: string, description?: string, severity: 'info' | 'warn' | 'error' = 'info') => {
      const entry: EventLogEntry = {
        id: randomId('evt'),
        type,
        title,
        description,
        severity,
        ts: Date.now(),
      };
      setEvents((prev) => {
        const next = [entry, ...prev];
        return next.length > MAX_EVENTS ? next.slice(0, MAX_EVENTS) : next;
      });
      if (severity === 'error') {
        setLastError(description ?? title);
      }
    },
    []
  );

  const upsertMessage = useCallback((incoming: ConversationMessage) => {
    const existing = messagesMapRef.current[incoming.id];
    const createdAt = existing?.createdAt ?? incoming.createdAt;
    const text = incoming.text && incoming.text.trim().length > 0 ? incoming.text : existing?.text ?? '';
    const images = incoming.images.length > 0 ? incoming.images : existing?.images ?? [];
    const role = incoming.role || existing?.role || 'assistant';
    const next: ConversationMessage = {
      id: incoming.id,
      role,
      text,
      images,
      createdAt,
      updatedAt: Date.now(),
      local: incoming.local ?? existing?.local,
    };
    messagesMapRef.current[incoming.id] = next;
    const all = Object.values(messagesMapRef.current).sort((a, b) => a.createdAt - b.createdAt);
    const trimmed = all.length > MAX_MESSAGES ? all.slice(all.length - MAX_MESSAGES) : all;
    if (trimmed.length !== all.length) {
      const map: Record<string, ConversationMessage> = {};
      for (const msg of trimmed) {
        map[msg.id] = msg;
      }
      messagesMapRef.current = map;
    }
    setMessages(trimmed);
  }, []);

  const ingestHistory = useCallback(
    (history: unknown[]) => {
      if (!Array.isArray(history)) {
        return;
      }
      for (const item of history) {
        const parsed = parseHistoryMessageItem(item);
        if (!parsed) {
          continue;
        }
        parsed.local = false;
        upsertMessage(parsed);
      }
    },
    [upsertMessage]
  );

  const ingestItem = useCallback(
    (item: unknown) => {
      const parsed = parseHistoryMessageItem(item);
      if (!parsed) {
        return;
      }
      parsed.local = false;
      upsertMessage(parsed);
    },
    [upsertMessage]
  );

  const appendLocalMessage = useCallback(
    (message: { role: string; text: string; images?: string[] }) => {
      const now = Date.now();
      upsertMessage({
        id: randomId('local'),
        role: message.role,
        text: message.text,
        images: message.images ?? [],
        createdAt: now,
        updatedAt: now,
        local: true,
      });
    },
    [upsertMessage]
  );

  const sendPayload = useCallback((payload: Record<string, unknown>) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      return false;
    }
    ws.send(JSON.stringify(payload));
    return true;
  }, []);




  const startCapture = useCallback(async () => {
    if (typeof window === 'undefined') {
      throw new Error('Window unavailable.');
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error('Microphone access requires HTTPS or a supported browser.');
    }
    if (isCapturingRef.current) {
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: 24_000,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
        },
      });
      const audioContext = new AudioContext({ sampleRate: 24_000, latencyHint: 'interactive' });
      const source = audioContext.createMediaStreamSource(stream);
      const processor = audioContext.createScriptProcessor(4096, 1, 1);
      source.connect(processor);
      processor.connect(audioContext.destination);
      processor.onaudioprocess = (event) => {
        if (isMutedRef.current) {
          return;
        }
        const ws = wsRef.current;
        if (!ws || ws.readyState !== WebSocket.OPEN) {
          return;
        }
        const inputBuffer = event.inputBuffer.getChannelData(0);
        const int16Buffer = new Int16Array(inputBuffer.length);
        for (let i = 0; i < inputBuffer.length; i += 1) {
          int16Buffer[i] = Math.max(-32768, Math.min(32767, inputBuffer[i] * 32768));
        }
        ws.send(
          JSON.stringify({
            type: 'audio',
            data: Array.from(int16Buffer),
          })
        );
      };
      audioContextRef.current = audioContext;
      processorRef.current = processor;
      streamRef.current = stream;
      isCapturingRef.current = true;
      setIsCapturing(true);
      logEvent('media', 'Microphone streaming', 'Audio capture is live.');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown microphone error';
      logEvent('media', 'Unable to start capture', message, 'error');
      throw error;
    }
  }, [logEvent]);

  const stopCapture = useCallback(() => {
    isCapturingRef.current = false;
    setIsCapturing(false);
    const processor = processorRef.current;
    if (processor) {
      try {
        processor.disconnect();
      } catch (error) {
        console.warn('Failed to disconnect processor.', error);
      }
      processor.onaudioprocess = null;
      processorRef.current = null;
    }
    const audioContext = audioContextRef.current;
    if (audioContext) {
      audioContextRef.current = null;
      audioContext.close().catch(() => undefined);
    }
    const stream = streamRef.current;
    if (stream) {
      for (const track of stream.getTracks()) {
        track.stop();
      }
      streamRef.current = null;
    }
  }, []);

  const handleRealtimeEvent = useCallback(
    (event: unknown) => {
      if (!isRecord(event)) {
        return;
      }
      const type = typeof event.type === 'string' ? event.type : null;
      switch (type) {
        case 'talk_video': {
          const url = typeof event.url === 'string' ? event.url : '';
          const coordinated = typeof event.coordinated === 'boolean' ? event.coordinated : false;

          if (url) {
            setVideoUrl(url);
            setIsThinking(false);
            if (coordinated) {
              logEvent('video', 'Coordinated video ready', `Video synchronized: ${url}`);
            } else {
              logEvent('video', 'D-ID talk ready', url);
            }
          } else {
            logEvent('video', 'D-ID talk status', String(event.status ?? 'unknown'));
          }
          break;
        }
        case 'talk_error': {
          const error = typeof event.error === 'string' ? event.error : 'Unknown D-ID error';
          logEvent('error', 'D-ID talk failed', error, 'error');
          break;
        }
        case 'history_updated': {
          if (Array.isArray(event.history)) {
            ingestHistory(event.history);
          }
          break;
        }
        case 'history_added': {
          ingestItem(event.item);
          break;
        }
        case 'tool_start': {
          const tool = typeof event.tool === 'string' ? event.tool : 'tool';
          logEvent('tool', `Tool running`, `Started ${tool}`);
          break;
        }
        case 'tool_end': {
          const tool = typeof event.tool === 'string' ? event.tool : 'tool';
          const output = typeof event.output === 'string' ? event.output : 'no output';
          logEvent('tool', `Tool completed`, `${tool}: ${output}`);
          break;
        }
        case 'handoff': {
          const fromAgent = isRecord(event.from_agent) && typeof event.from_agent.name === 'string' ? event.from_agent.name : null;
          const toAgent = isRecord(event.to_agent) && typeof event.to_agent.name === 'string' ? event.to_agent.name : null;
          const from = typeof event.from === 'string' ? event.from : fromAgent ?? 'agent';
          const to = typeof event.to === 'string' ? event.to : toAgent ?? 'agent';
          logEvent('handoff', 'Agent handoff', `${from} → ${to}`);
          break;
        }
        case 'client_info': {
          const info = typeof event.info === 'string' ? event.info : 'client info';

          // Handle special response processing notifications
          if (info === 'response_processing') {
            const message = typeof event.message === 'string' ? event.message : 'Generating response...';
            const video = typeof event.video === 'string' ? event.video : null;
            if (video) {
              setThinkingVideo(video);
            }
            setIsThinking(true);
            logEvent('response', 'Processing Response', message);
          } else if (info === 'persona_mood_update') {
            const personaRaw = typeof event.persona === 'string' ? event.persona : null;
            const video = typeof event.video === 'string' ? event.video : null;
            const sentiment = typeof event.sentiment === 'string' ? event.sentiment : undefined;

            if (personaRaw === 'joi' || personaRaw === 'officer_k' || personaRaw === 'officer_j') {
              const personaFromEvent: PersonaKey = personaRaw;
              setPersona(personaFromEvent);
              setThinkingVideo(video ?? PERSONA_DEFAULT_THINKING_VIDEO[personaFromEvent]);
              logEvent('persona', 'Persona mood updated', `${personaFromEvent} · ${sentiment ?? 'unknown'}`);
            } else if (video) {
              setThinkingVideo(video);
            }
          } else if (info === 'persona_set') {
            const personaRaw = typeof event.persona === 'string' ? event.persona : null;
            if (personaRaw === 'joi' || personaRaw === 'officer_k' || personaRaw === 'officer_j') {
              const personaFromEvent: PersonaKey = personaRaw;
              setPersona(personaFromEvent);
              setThinkingVideo(PERSONA_DEFAULT_THINKING_VIDEO[personaFromEvent]);
            }
          } else if (info === 'did_talk_start') {
            setIsThinking(true);
            logEvent('video', 'Video generation started');
          } else {
            logEvent('client', `Client info`, info);
          }
          break;
        }
        case 'guardrail_tripped': {
          const names = Array.isArray(event.guardrail_results)
            ? event.guardrail_results
                .map((result) => (isRecord(result) && typeof result.name === 'string' ? result.name : null))
                .filter((value): value is string => Boolean(value))
                .join(', ')
            : null;
          logEvent('guardrail', 'Guardrail triggered', names || 'Guardrail threshold met', 'warn');
          break;
        }
        case 'input_audio_timeout_triggered': {
          if (sendPayload({ type: 'commit_audio' })) {
            logEvent('session', 'Committed audio buffer');
          }
          break;
        }
        case 'raw_model_event': {
          const rawType = isRecord(event.raw_model_event) && typeof event.raw_model_event.type === 'string' ? event.raw_model_event.type : 'raw';
          logEvent('model', `Model event`, rawType);
          break;
        }
        case 'error': {
          const message = event.error ? String(event.error) : 'Unknown realtime error';
          logEvent('error', 'Realtime error', message, 'error');
          break;
        }
        default: {
          const label = type ?? 'event';
          logEvent('event', `Event: ${label}`);
        }
      }
    },
    [ingestHistory, ingestItem, logEvent, sendPayload]
  );

  const openConnection = useCallback(() => {
    if (isConnecting || isConnected) {
      return;
    }
    setStatusText('Connecting…');
    setIsConnecting(true);
    setLastError(null);
    const effectiveId = sessionId || randomId('session');
    if (!sessionId) setSessionId(effectiveId);
    const url = buildWsUrl(wsBase, effectiveId);
    const socket = new WebSocket(url);
    wsRef.current = socket;
    logEvent('session', 'Connecting', `Dialing ${url}`);

    socket.onopen = async () => {
      setIsConnecting(false);
      setIsConnected(true);
      setStatusText('Connected');
      logEvent('session', 'Connected', `Session ${sessionId}`);
      try {
        await startCapture();
      } catch (error) {
        console.warn('Microphone capture failed after connection.', error);
      }
      // Send initial persona selection to backend
      try {
        sendPayload({ type: 'set_persona', persona });
      } catch {}
    };

    socket.onmessage = (event) => {
      try {
        const payload: unknown = JSON.parse(event.data);
        handleRealtimeEvent(payload);
      } catch (error) {
        logEvent('error', 'Malformed realtime payload', error instanceof Error ? error.message : 'Unknown parse error', 'error');
      }
    };

    socket.onerror = (event) => {
      console.error('WebSocket error', event);
      logEvent('error', 'WebSocket error', 'Check backend logs for details.', 'error');
    };

    socket.onclose = (event) => {
      const reason = event.reason || `Socket closed (${event.code})`;
      logEvent('session', 'Disconnected', reason, event.wasClean ? 'info' : 'warn');
      setIsConnected(false);
      setIsConnecting(false);
      setStatusText('Disconnected');
      stopCapture();
      wsRef.current = null;
    };
  }, [buildWsUrl, handleRealtimeEvent, isConnected, isConnecting, logEvent, persona, sendPayload, sessionId, startCapture, stopCapture, wsBase]);

  const closeConnection = useCallback(() => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.close();
    } else {
      wsRef.current = null;
      setIsConnected(false);
      setIsConnecting(false);
      setStatusText('Disconnected');
      stopCapture();
    }
  }, [stopCapture]);

  const toggleMute = useCallback(() => {
    setIsMuted((prev) => {
      const next = !prev;
      logEvent('media', next ? 'Microphone muted' : 'Microphone live');
      return next;
    });
  }, [logEvent]);

  const interrupt = useCallback(() => {
    if (sendPayload({ type: 'interrupt' })) {
      setIsThinking(false);
      logEvent('session', 'Interrupt sent', 'Requested model to stop playback');
    }
  }, [logEvent, sendPayload]);

  const handleFileSelected = useCallback(
    async (file: File | null) => {
      if (!file) {
        return;
      }
      try {
        const dataUrl = await prepareImageDataUrl(file);
        const prompt = promptText.trim();
        appendLocalMessage({
          role: 'user',
          text: prompt || 'Please describe this image.',
          images: [dataUrl],
        });
        const ws = wsRef.current;
        if (!ws || ws.readyState !== WebSocket.OPEN) {
          logEvent('image', 'Image not sent', 'Connect before uploading an image.', 'warn');
          return;
        }
        sendPayload({ type: 'interrupt' });
        const imageId = randomId('img');
        const promptPayload = prompt || 'Please describe this image.';
        sendPayload({ type: 'image_start', id: imageId, text: promptPayload });
        for (let index = 0; index < dataUrl.length; index += CHUNK_SIZE) {
          sendPayload({ type: 'image_chunk', id: imageId, chunk: dataUrl.slice(index, index + CHUNK_SIZE) });
        }
        sendPayload({ type: 'image_end', id: imageId });
        logEvent('image', 'Image enqueued', `Sent ${(dataUrl.length / 1_024).toFixed(1)} KB payload`);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown image processing error';
        logEvent('error', 'Image processing failed', message, 'error');
      } finally {
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
      }
    },
    [appendLocalMessage, logEvent, promptText, sendPayload]
  );

  const handleFileInputChange = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const files = event.target.files;
      await handleFileSelected(files && files.length > 0 ? files[0] : null);
    },
    [handleFileSelected]
  );

  const personaImage = useMemo(() => {
    switch (persona) {
      case 'officer_k':
        return '/officer_k.png';
      case 'officer_j':
        return '/officer_j.png';
      case 'joi':
      default:
        return '/joi.png';
    }
  }, [persona]);

  const personaThinkingVideo = useMemo(
    () => thinkingVideo || PERSONA_DEFAULT_THINKING_VIDEO[persona],
    [persona, thinkingVideo]
  );

  useEffect(() => {
    return () => {
      const ws = wsRef.current;
      if (ws) {
        ws.close();
      }
      stopCapture();
    };
  }, [stopCapture]);

  const isMicLive = isCapturing && !isMuted;

  return (
    <div className="relative min-h-screen overflow-hidden text-stone-100">
      <div className="pointer-events-none absolute inset-0 -z-20">
        <Image
          src="/website background.png"
          alt="Deckard ambient backdrop"
          fill
          priority
          className="object-cover"
        />
      </div>
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute inset-0 bg-gradient-to-br from-stone-950/92 via-stone-900/78 to-stone-950/94" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(214,211,209,0.24),_transparent_58%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_bottom,_rgba(120,113,108,0.2),_transparent_60%)]" />
        <div className="absolute inset-0 bg-[linear-gradient(120deg,_rgba(250,250,249,0.08)_0%,_rgba(41,37,36,0.65)_55%,_rgba(12,10,9,0.78)_100%)]" />
      </div>

      {/* Left Panel - Conversation */}
      <div
        className={`fixed left-0 top-0 z-20 h-full w-80 transform bg-stone-950/85 backdrop-blur-2xl transition-transform duration-300 ease-in-out ${
        leftPanelOpen ? 'translate-x-0' : '-translate-x-full'
      }`}
      >
        <div className="h-full border-r border-stone-500/30 p-6">
          <div className="flex items-center justify-between text-[0.65rem] font-semibold uppercase tracking-[0.35em] text-stone-400">
            <div className="flex items-center gap-2">
              <span>Conversation</span>
              <span>·</span>
              <span>{messages.length} messages</span>
            </div>
            <button
              onClick={() => setLeftPanelOpen(false)}
              className="group flex h-8 w-8 items-center justify-center rounded-full border border-stone-500/30 transition-all hover:border-stone-400/50 hover:bg-stone-900/40"
            >
              <svg className="h-4 w-4 text-stone-400 transition-colors group-hover:text-stone-100" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <div className="mt-4 flex max-h-[calc(100vh-8rem)] flex-col gap-4 overflow-y-auto pr-2 text-sm [scrollbar-color:rgba(168,162,158,0.35)_transparent]">
            {messages.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-stone-500/30 bg-stone-950/40 px-4 py-6 text-center text-stone-500">
                Initiate a connection to populate the conversational thread.
              </p>
            ) : (
              messages.map((message) => (
                <div key={message.id} className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div
                    className={`max-w-[85%] rounded-3xl border px-4 py-3 text-sm shadow-[0_25px_80px_rgba(15,23,42,0.45)] ${
                      message.role === 'user'
                        ? 'border-emerald-400/50 bg-emerald-400/10 text-emerald-100'
                        : 'border-stone-500/30 bg-stone-900/40 text-stone-100'
                    }`}
                  >
                    <div className="flex flex-col gap-2">
                      {message.images.length > 0 ? (
                        <div className="grid gap-2">
                          {message.images.map((image, index) => (
                            <Image
                              key={index}
                              src={image}
                              alt={`Uploaded ${index + 1}`}
                              width={200}
                              height={200}
                              className="h-auto w-full rounded-2xl border border-stone-400/30 object-cover"
                            />
                          ))}
                        </div>
                      ) : null}
                      {message.text ? <p className="leading-relaxed text-stone-100/90">{message.text}</p> : null}
                      <span className="text-[0.5rem] uppercase tracking-[0.35em] text-stone-400">{message.role}</span>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Right Panel - Realtime Feed */}
      <div
        className={`fixed right-0 top-0 z-20 h-full w-80 transform bg-stone-950/85 backdrop-blur-2xl transition-transform duration-300 ease-in-out ${
          rightPanelOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div className="h-full border-l border-stone-500/30 p-6">
          <div className="flex items-center justify-between text-[0.65rem] font-semibold uppercase tracking-[0.35em] text-stone-400">
            <div className="flex items-center gap-2">
              <span>Realtime Feed</span>
              <button
                className="rounded-full border border-stone-500/30 px-2 py-1 text-[0.5rem] uppercase tracking-[0.35em] text-stone-400 transition hover:border-stone-400/60 hover:text-stone-100"
                onClick={() => setEvents([])}
              >
                Clear
              </button>
            </div>
            <button
              onClick={() => setRightPanelOpen(false)}
              className="group flex h-8 w-8 items-center justify-center rounded-full border border-stone-500/30 transition-all hover:border-stone-400/50 hover:bg-stone-900/40"
            >
              <svg className="h-4 w-4 text-stone-400 transition-colors group-hover:text-stone-100" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <div className="mt-4 flex max-h-[calc(100vh-8rem)] flex-col gap-3 overflow-y-auto pr-2 text-sm [scrollbar-color:rgba(168,162,158,0.35)_transparent]">
            {events.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-stone-500/30 bg-stone-950/40 px-4 py-6 text-center text-stone-500">
                Streamed tool events and guardrail updates will appear here.
              </p>
            ) : (
              events.map((event) => (
                <div
                  key={event.id}
                  className={`rounded-2xl border px-4 py-3 text-sm shadow-[0_20px_70px_rgba(15,23,42,0.45)] ${
                    event.severity === 'error'
                      ? 'border-rose-500/60 bg-rose-500/10 text-rose-100'
                      : event.severity === 'warn'
                      ? 'border-amber-400/60 bg-amber-400/10 text-amber-100'
                      : 'border-stone-500/30 bg-stone-900/40 text-stone-100'
                  }`}
                >
                  <div className="flex items-center justify-between text-[0.5rem] uppercase tracking-[0.35em] text-stone-400">
                    <span>{event.type}</span>
                    <span>{formatTimestamp(event.ts)}</span>
                  </div>
                  <div className="mt-1 font-semibold text-stone-100">{event.title}</div>
                  {event.description ? <div className="mt-1 text-xs text-stone-200/80">{event.description}</div> : null}
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <main className="relative z-10 mx-auto flex min-h-screen w-full flex-col items-center px-6 py-8">
        {/* AI DECKARD Title */}
        <div className="mb-12 text-center">
          <h1 className="mt-4 flex items-center justify-center gap-4 text-6xl font-bold tracking-tight text-white sm:text-7xl">
            <Image
              src="/c281291e-d2ca-4240-97bb-93a2526aa38d.png"
              alt="Deckard company logo"
              width={160}
              height={160}
              priority
              className="h-12 w-auto sm:h-16"
            />
            <span className="bg-gradient-to-r from-stone-200 via-stone-300 to-stone-400 bg-clip-text text-transparent drop-shadow-[0_10px_36px_rgba(120,113,108,0.45)]">
              Deckard
            </span>
          </h1>
          <p className="mt-4 mx-auto max-w-2xl text-base text-stone-300 sm:text-lg">
            Create and interact with personalized AI clones
          </p>
        </div>

        {/* Main Content Area with Avatar */}
        <section className="relative w-full max-w-5xl">
          <div className="flex items-start justify-center gap-8 sm:gap-12">
            {/* Left Toggle Button - Conversation */}
            <button
              onClick={() => setLeftPanelOpen(!leftPanelOpen)}
              className="group flex h-20 w-24 flex-col items-center justify-center self-start rounded-2xl border border-stone-500/30 bg-stone-900/40 backdrop-blur-2xl transition-all hover:border-stone-400/60 hover:bg-stone-900/55 sm:-translate-y-2"
            >
              <div className="mb-2 flex flex-col items-center gap-1">
                <svg className="h-4 w-4 text-stone-300 transition-colors group-hover:text-stone-100" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
                <svg className={`h-3 w-3 text-stone-400 transition-all group-hover:text-stone-100 ${leftPanelOpen ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </div>
              <span className="text-[0.6rem] font-semibold uppercase tracking-[0.3em] text-stone-300 transition-colors group-hover:text-stone-100">
                Chat
              </span>
            </button>

            {/* Central Avatar Area */}
            <div className="relative overflow-hidden rounded-[32px] border border-stone-500/35 bg-stone-900/45 p-8 shadow-[0_35px_140px_rgba(2,6,23,0.65)] backdrop-blur-2xl">
              <div className="flex flex-col gap-4">
                <div className="flex flex-wrap items-center justify-between gap-4 text-[0.65rem] uppercase tracking-[0.35em] text-stone-400">
                  <div className="flex items-center gap-3">
                    <span
                      className={`inline-flex h-3 w-3 rounded-full shadow-[0_0_24px_rgba(34,197,94,0.65)] ${
                        isConnected ? 'bg-emerald-400' : isConnecting ? 'bg-amber-400' : 'bg-stone-600'
                      }`}
                    />
                    <span className="font-semibold text-stone-200">{statusText}</span>
                  </div>
                  <span className={`font-semibold ${isMicLive ? 'text-emerald-200' : isMuted ? 'text-stone-500' : 'text-stone-300'}`}>
                    {isConnected ? (isMicLive ? 'Microphone live' : isMuted ? 'Microphone muted' : 'Microphone idle') : 'Awaiting connection'}
                  </span>
                </div>
                {lastError ? (
                  <div className="rounded-2xl border border-rose-500/50 bg-rose-500/10 px-4 py-3 text-xs text-rose-200">
                    {lastError}
                  </div>
                ) : null}
              </div>

              <div className="relative mx-auto mt-8 w-full max-w-sm overflow-hidden rounded-[28px] border border-stone-500/35 bg-gradient-to-b from-stone-950/85 via-stone-900/35 to-stone-950/95" data-testid="talking-video-box" style={{ aspectRatio: '9 / 16' }}>
                {videoUrl ? (
                  <video
                    src={videoUrl}
                    autoPlay
                    muted={!userInteracted}
                    playsInline
                    className="h-full w-full object-cover"
                    poster={personaImage}
                  />
                ) : (
                  <Image src={personaImage} alt="Persona" fill className="object-cover" unoptimized />
                )}
                {isThinking && (
                  <div className="absolute inset-0 z-10 overflow-hidden">
                    <video
                      key={personaThinkingVideo}
                      src={personaThinkingVideo}
                      autoPlay
                      loop
                      muted
                      playsInline
                      className="h-full w-full object-cover"
                    />
                  </div>
                )}
              </div>

              <div className="mt-6 flex flex-wrap justify-center gap-2">
                {(['joi', 'officer_k', 'officer_j'] as const).map((key) => (
                  <button
                    key={key}
                    onClick={() => {
                      setPersona(key);
                      sendPayload({ type: 'set_persona', persona: key });
                      logEvent('client', 'Persona selected', key);
                    }}
                    className={`rounded-full border px-4 py-2 text-[0.65rem] font-semibold uppercase tracking-[0.35em] transition ${
                      persona === key
                        ? 'border-emerald-400/70 bg-emerald-400/10 text-emerald-100 shadow-[0_0_24px_rgba(16,185,129,0.35)]'
                        : 'border-stone-500/30 bg-stone-900/40 text-stone-300 hover:text-stone-100'
                    }`}
                  >
                    {key.replace('_', ' ').toUpperCase()}
                  </button>
                ))}
              </div>

              <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <button
                  className={`rounded-full px-5 py-3 text-sm font-semibold uppercase tracking-[0.35em] transition ${
                    isConnected
                      ? 'bg-rose-500/15 text-rose-100 hover:bg-rose-500/25'
                      : 'bg-emerald-400 text-stone-950 hover:bg-emerald-300'
                  } ${isConnecting ? 'opacity-70' : ''}`}
                  onClick={() => {
                    setUserInteracted(true);
                    if (isConnected) {
                      closeConnection();
                    } else {
                      openConnection();
                    }
                  }}
                  disabled={isConnecting}
                >
                  {isConnected ? 'Disconnect' : isConnecting ? 'Connecting…' : 'Connect'}
                </button>
                <button
                  className={`rounded-full border border-stone-500/30 px-5 py-3 text-sm font-semibold uppercase tracking-[0.35em] transition ${
                    isMicLive ? 'bg-emerald-500/10 text-emerald-200' : isMuted ? 'bg-stone-950 text-stone-500' : 'bg-stone-950 text-stone-200'
                  } ${!isConnected ? 'opacity-50' : ''}`}
                  onClick={toggleMute}
                  disabled={!isConnected}
                >
                  {isMicLive ? 'Mic Live' : isMuted ? 'Mic Muted' : 'Enable Mic'}
                </button>
                <button
                  className="rounded-full border border-stone-500/30 px-5 py-3 text-sm font-semibold uppercase tracking-[0.35em] text-stone-200 transition hover:border-emerald-300/40 hover:text-stone-100"
                  onClick={interrupt}
                  disabled={!isConnected}
                >
                  Interrupt
                </button>
                <button
                  className="rounded-full border border-stone-500/30 px-5 py-3 text-sm font-semibold uppercase tracking-[0.35em] text-stone-200 transition hover:border-emerald-300/40 hover:text-stone-100"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={!isConnected}
                >
                  Send Image
                </button>
                <input
                  ref={fileInputRef}
                  className="hidden"
                  type="file"
                  accept="image/*"
                  onChange={handleFileInputChange}
                />
              </div>

              <div className="mt-6 grid gap-4 sm:grid-cols-5">
                <div className="sm:col-span-3">
                  <label className="text-[0.6rem] font-semibold uppercase tracking-[0.35em] text-stone-500">Image Prompt</label>
                  <input
                    className="mt-2 w-full rounded-2xl border border-stone-500/30 bg-stone-950/45 px-4 py-3 text-sm text-stone-100 shadow-[0_12px_60px_rgba(15,23,42,0.4)] focus:border-emerald-300/60 focus:outline-none focus:ring-0"
                    value={promptText}
                    onChange={(event) => setPromptText(event.target.value)}
                    placeholder="Describe how the assistant should interpret the uploaded image"
                  />
                </div>
                <div className="flex flex-col justify-end gap-3 sm:col-span-2">
                  <div className="rounded-2xl border border-stone-500/30 bg-stone-950/45 px-4 py-3 text-[0.65rem] uppercase tracking-[0.35em] text-stone-400">
                    <span className="flex items-center justify-between text-stone-300">
                      <span>Capture</span>
                      <span className={`font-semibold ${isMicLive ? 'text-emerald-200' : isMuted ? 'text-stone-500' : 'text-stone-300'}`}>
                        {isConnected ? (isMicLive ? 'Streaming' : isMuted ? 'Muted' : 'Idle') : 'Offline'}
                      </span>
                    </span>
                  </div>
                </div>
              </div>

              <div className="mt-6 grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl border border-stone-500/30 bg-stone-950/45 px-4 py-3">
                  <span className="text-[0.55rem] font-semibold uppercase tracking-[0.4em] text-stone-500">Session</span>
                  <span className="mt-2 block truncate text-sm text-stone-200" suppressHydrationWarning>
                    {sessionId || '—'}
                  </span>
                </div>
                <div className="rounded-2xl border border-stone-500/30 bg-stone-950/45 px-4 py-3">
                  <span className="text-[0.55rem] font-semibold uppercase tracking-[0.4em] text-stone-500">Realtime Endpoint</span>
                  <span className="mt-2 block truncate text-sm text-stone-200" suppressHydrationWarning>
                    {sessionId ? buildWsUrl(wsBase, sessionId) : `${wsBase}/ws/{pending}`}
                  </span>
                </div>
              </div>
            </div>

            {/* Right Toggle Button - Feed */}
            <button
              onClick={() => setRightPanelOpen(!rightPanelOpen)}
              className="group flex h-20 w-24 flex-col items-center justify-center self-start rounded-2xl border border-stone-500/30 bg-stone-900/40 backdrop-blur-2xl transition-all hover:border-stone-400/60 hover:bg-stone-900/55 sm:-translate-y-2"
            >
              <div className="mb-2 flex flex-col items-center gap-1">
                <svg className={`h-3 w-3 text-stone-400 transition-all group-hover:text-stone-100 ${rightPanelOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
                <svg className="h-4 w-4 text-stone-300 transition-colors group-hover:text-stone-100" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 4V2a1 1 0 011-1h8a1 1 0 011 1v2m0 0V3a1 1 0 011 1v11a1 1 0 01-1 1H8a1 1 0 01-1-1V4m0 0H5a1 1 0 00-1 1v11a1 1 0 001 1h1m4-10h2m0 0V4m0 2v2m0-2h2" />
                </svg>
              </div>
              <span className="text-[0.6rem] font-semibold uppercase tracking-[0.3em] text-stone-300 transition-colors group-hover:text-stone-100">
                Feed
              </span>
            </button>
          </div>
        </section>

      </main>
    </div>
  );
}
