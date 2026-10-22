import {
  AccountConnectionDto,
  ApprovalDto,
  ChatEvent,
  LoginChallengeDto,
  LoginPollDto,
  type SendMessageRequest,
  SessionDto,
  TranscriptEntry,
} from "@shop-agent/contract";
import { z } from "zod";
import { takeFrames } from "./sse";

async function request<T>(path: string, schema: z.ZodType<T>, init?: RequestInit): Promise<T> {
  const res = await fetch(path, init);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
  return schema.parse(body);
}

const post = (body?: unknown): RequestInit => ({
  method: "POST",
  headers: { "content-type": "application/json" },
  body: body === undefined ? undefined : JSON.stringify(body),
});

export const api = {
  createSession: () => request("/api/sessions", SessionDto, post()),
  getSession: (id: string) => request(`/api/sessions/${id}`, SessionDto),
  getTranscript: (id: string) => request(`/api/sessions/${id}/transcript`, z.array(TranscriptEntry)),
  startLogin: (id: string) => request(`/api/sessions/${id}/login`, LoginChallengeDto, post()),
  pollLogin: (id: string) => request(`/api/sessions/${id}/login`, LoginPollDto),
  getAccount: (id: string) => request(`/api/sessions/${id}/account`, AccountConnectionDto),
  logout: (id: string) => request(`/api/sessions/${id}/logout`, SessionDto, post()),
  approve: (id: string, approvalId: string, instrumentId: string) =>
    request(`/api/sessions/${id}/purchases/${approvalId}/approve`, ApprovalDto, post({ instrumentId })),
  reject: (id: string, approvalId: string) => request(`/api/sessions/${id}/purchases/${approvalId}/reject`, ApprovalDto, post()),
};

/** Sends a message and calls onEvent for each server-sent event until the stream ends. */
export async function sendMessage(id: string, message: SendMessageRequest, onEvent: (e: ChatEvent) => void): Promise<void> {
  const res = await fetch(`/api/sessions/${id}/messages`, post(message));
  if (!res.ok || !res.body) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
  }
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    const { frames, rest } = takeFrames(buffer + value);
    buffer = rest;
    for (const data of frames) onEvent(ChatEvent.parse(JSON.parse(data)));
  }
}
