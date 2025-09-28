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
  const [persona, setPersona] = useState<'joi' | 'officer_k' | 'officer_j'>('joi');
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
  const playbackContextRef = useRef<AudioContext | null>(null);
  const audioQueueRef = useRef<string[]>([]);
  const isPlayingRef = useRef(false);
  const currentSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const currentGainRef = useRef<GainNode | null>(null);
  const isCapturingRef = useRef(false);
  const isMutedRef = useRef(false);

  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);
  const [statusText, setStatusText] = useState('Disconnected');
  const [lastError, setLastError] = useState<string | null>(null);
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const messagesMapRef = useRef<Record<string, ConversationMessage>>({});
  const [events, setEvents] = useState<EventLogEntry[]>([]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [promptText, setPromptText] = useState('Please describe this image.');
  const [userInteracted, setUserInteracted] = useState(false);

  useEffect(() => {
    isMutedRef.current = isMuted;
  }, [isMuted]);

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

  const stopAudioPlayback = useCallback(() => {
    audioQueueRef.current = [];
    const source = currentSourceRef.current;
    if (source) {
      try {
        source.stop();
      } catch (error) {
        console.warn('Failed to stop audio source cleanly.', error);
      }
      source.disconnect();
    }
    currentSourceRef.current = null;
    const gain = currentGainRef.current;
    if (gain) {
      gain.disconnect();
    }
    currentGainRef.current = null;
    isPlayingRef.current = false;
  }, []);

  const playAudioChunk = useCallback((audioContext: AudioContext, audioBase64: string) => {
    return new Promise<void>((resolve, reject) => {
      try {
        if (!audioBase64) {
          resolve();
          return;
        }
        const binary = atob(audioBase64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i += 1) {
          bytes[i] = binary.charCodeAt(i);
        }
        const int16 = new Int16Array(bytes.buffer);
        if (int16.length === 0) {
          resolve();
          return;
        }
        const float32 = new Float32Array(int16.length);
        for (let i = 0; i < int16.length; i += 1) {
          float32[i] = int16[i] / 32768;
        }
        const buffer = audioContext.createBuffer(1, float32.length, 24_000);
        buffer.getChannelData(0).set(float32);
        const source = audioContext.createBufferSource();
        source.buffer = buffer;
        const gain = audioContext.createGain();
        const now = audioContext.currentTime;
        const fade = Math.min(0.02, Math.max(0.005, buffer.duration / 8));
        gain.gain.cancelScheduledValues(now);
        gain.gain.setValueAtTime(0.0001, now);
        gain.gain.linearRampToValueAtTime(1, now + fade);
        const end = now + buffer.duration;
        gain.gain.setValueAtTime(1, Math.max(now + fade, end - fade));
        gain.gain.linearRampToValueAtTime(0.0001, end);
        source.connect(gain);
        gain.connect(audioContext.destination);
        currentSourceRef.current = source;
        currentGainRef.current = gain;
        source.onended = () => {
          if (currentSourceRef.current === source) {
            currentSourceRef.current = null;
          }
          if (currentGainRef.current === gain) {
            currentGainRef.current = null;
          }
          resolve();
        };
        source.start();
      } catch (error) {
        reject(error);
      }
    });
  }, []);

  const processAudioQueue = useCallback(async () => {
    if (isPlayingRef.current || audioQueueRef.current.length === 0) {
      return;
    }
    let audioContext = playbackContextRef.current;
    if (!audioContext) {
      audioContext = new AudioContext({ sampleRate: 24_000, latencyHint: 'interactive' });
      playbackContextRef.current = audioContext;
    }
    if (audioContext.state === 'suspended') {
      try {
        await audioContext.resume();
      } catch (error) {
        logEvent('audio', 'Unable to resume audio context', String(error), 'warn');
      }
    }
    isPlayingRef.current = true;
    while (audioQueueRef.current.length > 0) {
      const chunk = audioQueueRef.current.shift();
      if (!chunk) {
        continue;
      }
      try {
        await playAudioChunk(audioContext, chunk);
      } catch (error) {
        logEvent('audio', 'Audio playback failed', error instanceof Error ? error.message : 'Unknown decode error', 'warn');
      }
      if (!isPlayingRef.current) {
        break;
      }
    }
    isPlayingRef.current = false;
  }, [logEvent, playAudioChunk]);

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
            if (coordinated) {
              logEvent('video', 'Coordinated video ready', `Audio and video synchronized: ${url}`);
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
        case 'audio': {
          if (typeof event.audio === 'string') {
            audioQueueRef.current.push(event.audio);
            void processAudioQueue();
          }
          break;
        }
        case 'audio_interrupted': {
          stopAudioPlayback();
          logEvent('audio', 'Playback interrupted');
          break;
        }
        case 'audio_end': {
          logEvent('audio', 'Playback finished');
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
            logEvent('response', 'Processing Response', message);
            // Could add UI indication here that response is being generated
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
    [ingestHistory, ingestItem, logEvent, processAudioQueue, sendPayload, stopAudioPlayback]
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
      stopAudioPlayback();
      wsRef.current = null;
    };
  }, [buildWsUrl, handleRealtimeEvent, isConnected, isConnecting, logEvent, persona, sendPayload, sessionId, startCapture, stopAudioPlayback, stopCapture, wsBase]);

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
      stopAudioPlayback();
    }
  }, [stopAudioPlayback, stopCapture]);

  const toggleMute = useCallback(() => {
    setIsMuted((prev) => {
      const next = !prev;
      logEvent('media', next ? 'Microphone muted' : 'Microphone live');
      return next;
    });
  }, [logEvent]);

  const interrupt = useCallback(() => {
    if (sendPayload({ type: 'interrupt' })) {
      stopAudioPlayback();
      logEvent('session', 'Interrupt sent', 'Requested model to stop playback');
    }
  }, [logEvent, sendPayload, stopAudioPlayback]);

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
        stopAudioPlayback();
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
    [appendLocalMessage, logEvent, promptText, sendPayload, stopAudioPlayback]
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

  useEffect(() => {
    return () => {
      const ws = wsRef.current;
      if (ws) {
        ws.close();
      }
      stopCapture();
      stopAudioPlayback();
    };
  }, [stopAudioPlayback, stopCapture]);

  const isMicLive = isCapturing && !isMuted;

  return (
    <div className="min-h-screen bg-stone-950 text-stone-100">
      <main className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-10 px-6 pb-16 pt-16 sm:px-10">
        <header className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex flex-col gap-3">
            <span className="inline-flex w-fit items-center gap-3 rounded-full border border-stone-700/80 bg-stone-900/80 px-4 py-2 text-[0.65rem] font-semibold uppercase tracking-[0.6em] text-stone-400">
              Deckard // Realtime Studio
            </span>
            <h1 className="text-4xl font-semibold leading-tight text-stone-50 sm:text-5xl">
              Operate the realtime orchestrator from the web client.
            </h1>
            <p className="max-w-2xl text-base leading-relaxed text-stone-400">
              Connect this Next.js front-end to the FastAPI orchestrator, capture microphone audio, upload images, and watch
              the agent graph stream events back through the WebSocket bridge.
            </p>
          </div>
          <div className="flex flex-col gap-3 rounded-3xl border border-stone-800/80 bg-stone-950/70 p-5 text-sm text-stone-400">
            <div className="flex items-center gap-2">
              <span className={`inline-flex h-2 w-2 rounded-full ${isConnected ? 'bg-emerald-400' : isConnecting ? 'bg-amber-400' : 'bg-stone-600'}`} />
              <span className="font-semibold uppercase tracking-[0.35em] text-stone-300">{statusText}</span>
            </div>
            <div className="flex flex-col gap-1 text-xs text-stone-500">
              <span className="font-semibold uppercase tracking-[0.4em] text-stone-400">Session</span>
              <span className="truncate text-stone-300" suppressHydrationWarning>
                {sessionId || '—'}
              </span>
            </div>
            <div className="flex flex-col gap-1 text-xs text-stone-500">
              <span className="font-semibold uppercase tracking-[0.4em] text-stone-400">Realtime Endpoint</span>
              <span className="truncate text-stone-300" suppressHydrationWarning>
                {sessionId ? buildWsUrl(wsBase, sessionId) : `${wsBase}/ws/{pending}`}
              </span>
            </div>
            {lastError ? (
              <div className="rounded-xl border border-rose-600/40 bg-rose-500/5 px-3 py-2 text-[0.75rem] text-rose-200">
                {lastError}
              </div>
            ) : null}
          </div>
        </header>

        <section className="grid gap-8 lg:grid-cols-[1.15fr_0.85fr]">
          <div className="flex flex-col gap-6 rounded-3xl border border-stone-800/80 bg-stone-950/80 p-6 shadow-[0_18px_60px_rgba(8,8,8,0.45)]">
            <div className="flex flex-wrap items-center gap-3">
              <button
                className={`inline-flex items-center justify-center rounded-full px-5 py-2 text-sm font-semibold uppercase tracking-[0.35em] transition ${
                  isConnected
                    ? 'bg-rose-500/20 text-rose-200 hover:bg-rose-500/30'
                    : 'bg-emerald-400 text-stone-950 hover:bg-emerald-300'
                }`}
                onClick={() => { setUserInteracted(true); (isConnected ? closeConnection() : openConnection()); }}
                disabled={isConnecting}
              >
                {isConnected ? 'Disconnect' : isConnecting ? 'Connecting…' : 'Connect'}
              </button>
              <button
                className={`inline-flex items-center justify-center rounded-full border border-stone-700/80 px-5 py-2 text-sm font-semibold uppercase tracking-[0.35em] transition ${
                  isMicLive ? 'bg-emerald-500/10 text-emerald-300' : isMuted ? 'bg-stone-900 text-stone-400' : 'bg-stone-900 text-stone-300'
                } ${!isConnected ? 'opacity-50' : ''}`}
                onClick={toggleMute}
                disabled={!isConnected}
              >
                {isMicLive ? 'Mic Live' : isMuted ? 'Mic Muted' : 'Enable Mic'}
              </button>
              <button
                className="inline-flex items-center justify-center rounded-full border border-stone-700/80 px-5 py-2 text-sm font-semibold uppercase tracking-[0.35em] text-stone-300 transition hover:border-stone-500"
                onClick={interrupt}
                disabled={!isConnected}
              >
                Interrupt
              </button>
              <button
                className="inline-flex items-center justify-center rounded-full border border-stone-700/80 px-5 py-2 text-sm font-semibold uppercase tracking-[0.35em] text-stone-300 transition hover:border-stone-500"
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
            <div className="grid gap-3 sm:grid-cols-[auto_1fr]">
              <label className="text-xs font-semibold uppercase tracking-[0.35em] text-stone-500">Image Prompt</label>
              <input
                className="rounded-2xl border border-stone-800 bg-stone-950 px-4 py-3 text-sm text-stone-200 focus:border-stone-600 focus:outline-none"
                value={promptText}
                onChange={(event) => setPromptText(event.target.value)}
                placeholder="Describe how the assistant should interpret the uploaded image"
              />
            </div>
            <div className="flex items-center justify-between rounded-2xl border border-stone-800 bg-stone-950 px-4 py-3 text-xs text-stone-400">
              <span className="uppercase tracking-[0.4em]">Capture</span>
              <span className={`font-semibold ${isMicLive ? 'text-emerald-300' : 'text-stone-500'}`}>
                {isConnected ? (isMicLive ? 'Streaming' : isMuted ? 'Muted' : 'Idle') : 'Disconnected'}
              </span>
            </div>
            <div className="flex-1 overflow-hidden rounded-3xl border border-stone-800 bg-stone-950">
              <div className="flex items-center justify-between border-b border-stone-800 px-5 py-3">
                <span className="text-xs font-semibold uppercase tracking-[0.35em] text-stone-500">Conversation</span>
                <span className="text-[0.65rem] text-stone-500">{messages.length} messages</span>
              </div>
              <div className="flex max-h-[520px] flex-col gap-4 overflow-y-auto px-5 py-4">
                {messages.length === 0 ? (
                  <p className="text-sm text-stone-500">Begin a session to populate the thread.</p>
                ) : (
                  messages.map((message) => (
                    <div
                      key={message.id}
                      className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                    >
                      <div
                        className={`max-w-[75%] rounded-3xl border px-5 py-4 text-sm shadow-sm ${
                          message.role === 'user'
                            ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-100'
                            : 'border-stone-800 bg-stone-900 text-stone-200'
                        }`}
                      >
                        {message.images.length > 0 ? (
                          <div className="mb-3 grid gap-2">
                            {message.images.map((image) => (
                              <div
                                key={image}
                                className="relative w-64 md:w-80 overflow-hidden rounded-2xl border border-stone-800/70 bg-stone-900"
                                style={{ aspectRatio: '3 / 4' }}
                              >
                                <Image src={image} alt="Uploaded" fill className="object-cover" unoptimized />
                              </div>
                            ))}
                          </div>
                        ) : null}
                        {message.text ? (
                          <p className="whitespace-pre-wrap text-sm leading-relaxed text-inherit">{message.text}</p>
                        ) : null}
                        <div className="mt-3 text-[0.6rem] uppercase tracking-[0.35em] text-stone-400">
                          {message.role}
                          {message.local ? ' • local' : ''}
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-6">
            <div className="flex flex-col gap-4 rounded-3xl border border-stone-800/80 bg-stone-950/80 p-6 shadow-[0_18px_60px_rgba(8,8,8,0.45)]">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-[0.35em] text-stone-500">Talking Video</span>
                <div className="flex items-center gap-2">
                  {(['joi','officer_k','officer_j'] as const).map((key) => (
                    <button
                      key={key}
                      onClick={() => {
                        setPersona(key);
                        sendPayload({ type: 'set_persona', persona: key });
                        logEvent('client', 'Persona selected', key);
                      }}
                      className={`rounded-full border px-3 py-1 text-[0.65rem] uppercase tracking-[0.35em] transition ${
                        persona === key ? 'border-emerald-500/60 bg-emerald-500/10 text-emerald-200' : 'border-stone-700 bg-stone-900 text-stone-300 hover:text-stone-100'
                      }`}
                    >
                      {key.toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>
              <div
                className="relative mx-auto w-72 md:w-96 overflow-hidden rounded-2xl border border-stone-800 bg-stone-900"
                style={{ aspectRatio: '9 / 16' }}
                data-testid="talking-video-box"
              >
                {videoUrl ? (
                  // eslint-disable-next-line jsx-a11y/media-has-caption
                  <video
                    src={videoUrl}
                    controls
                    autoPlay
                    loop
                    muted={!userInteracted}
                    playsInline
                    className="h-full w-full object-cover"
                    poster={personaImage}
                  />
                ) : (
                  <Image src={personaImage} alt="Persona" fill className="object-cover" unoptimized />
                )}
              </div>
              <div className="text-[0.7rem] text-stone-400">
                {videoUrl
                  ? 'Video ready from D-ID. You can switch persona anytime.'
                  : 'Awaiting assistant response to generate a talk. Persona can be changed.'}
              </div>
            </div>
            <div className="flex flex-col gap-4 rounded-3xl border border-stone-800/80 bg-stone-950/80 p-6 shadow-[0_18px_60px_rgba(8,8,8,0.45)]">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-[0.35em] text-stone-500">Realtime Feed</span>
                <button
                  className="text-[0.65rem] uppercase tracking-[0.35em] text-stone-500 transition hover:text-stone-300"
                  onClick={() => setEvents([])}
                >
                  Clear
                </button>
              </div>
              <div className="flex max-h-[320px] flex-col gap-3 overflow-y-auto">
                {events.length === 0 ? (
                  <p className="text-sm text-stone-500">Events will appear as the session streams updates.</p>
                ) : (
                  events.map((event) => (
                    <div
                      key={event.id}
                      className={`rounded-2xl border px-4 py-3 text-sm ${
                        event.severity === 'error'
                          ? 'border-rose-600/60 bg-rose-500/10 text-rose-200'
                          : event.severity === 'warn'
                          ? 'border-amber-500/60 bg-amber-500/10 text-amber-200'
                          : 'border-stone-800 bg-stone-900 text-stone-200'
                      }`}
                    >
                      <div className="flex items-center justify-between text-[0.65rem] uppercase tracking-[0.35em] text-stone-500">
                        <span>{event.type}</span>
                        <span>{formatTimestamp(event.ts)}</span>
                      </div>
                      <div className="mt-1 font-semibold text-stone-100">{event.title}</div>
                      {event.description ? (
                        <div className="mt-1 text-xs text-stone-400">{event.description}</div>
                      ) : null}
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="rounded-3xl border border-stone-800/80 bg-stone-950/80 p-6 shadow-[0_18px_60px_rgba(8,8,8,0.45)]">
              <span className="text-xs font-semibold uppercase tracking-[0.35em] text-stone-500">Session Tips</span>
              <ul className="mt-3 space-y-2 text-sm text-stone-400">
                <li>Connect from HTTPS or localhost to unlock microphone capture.</li>
                <li>Uploaded images are resized client-side before streaming to the backend.</li>
                <li>Interrupt playback to prioritize a new utterance or image prompt.</li>
                <li>Use the realtime feed to trace tool handoffs and guardrail hits.</li>
              </ul>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
