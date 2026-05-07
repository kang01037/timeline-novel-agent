/**
 * AI Agent 服务层
 * 封装与后端 API 的通信
 */

const API_BASE = '/api';

export interface ChapterInfo {
  title?: string;
  outline?: string;
}

export interface ConsistencyResult {
  consistent: boolean;
  issues: Array<{
    type: string;
    description: string;
    suggestion: string;
  }>;
  raw?: string;
}

// ============ Agent SSE 事件类型 ============

export interface AgentStepEvent {
  type: 'thinking' | 'tool_call' | 'tool_result';
  step: number;
  message?: string;
  tool?: string;
  args?: any;
  result?: any;
  duration?: number;
}

export interface AgentToolConfirmEvent {
  type: 'tool_confirm';
  confirmId: string;
  tool: string;
  args?: any;
  step: number;
}

export interface AgentContentEvent {
  type: 'content';
  content: string;
}

export interface AgentChapterContentEvent {
  type: 'chapter_content';
  content: string;
  chapterTitle: string;
  length: number;
}

export interface AgentDoneEvent {
  type: 'agent_done';
  iterations: number;
}

export interface AgentErrorEvent {
  type: 'error';
  error: string;
}

export type AgentSSEEvent = AgentStepEvent | AgentToolConfirmEvent | AgentContentEvent | AgentChapterContentEvent | AgentDoneEvent | AgentErrorEvent;

export interface AgentCallbacks {
  onStep?: (event: AgentStepEvent) => void;
  onToolConfirm?: (event: AgentToolConfirmEvent) => void;
  onContent?: (content: string) => void;
  onChapterContent?: (event: AgentChapterContentEvent) => void;
  onDone?: (iterations: number) => void;
  onError?: (error: string) => void;
}

/**
 * 发送工具确认结果到后端
 */
export async function sendToolConfirm(confirmId: string, approved: boolean): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/agent/confirm`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ confirmId, approved }),
    });
    const data = await res.json();
    return data.success;
  } catch {
    return false;
  }
}

/**
 * 同步故事和角色数据到后端
 */
export async function syncData(story: any, characters: any): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ story, characters }),
    });
    return res.ok;
  } catch (error) {
    console.error('同步数据失败:', error);
    return false;
  }
}

/**
 * 流式生成章节内容（SSE）— 旧接口，保留兼容
 */
export function generateChapterStream(
  userRequest: string,
  chapterInfo: ChapterInfo | null,
  story: any,
  characters: any,
  onContent: (content: string) => void,
  onDone: (fullContent: string) => void,
  onError: (error: string) => void
): AbortController {
  const controller = new AbortController();

  (async () => {
    try {
      const res = await fetch(`${API_BASE}/generate/chapter`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userRequest, chapterInfo, story, characters }),
        signal: controller.signal,
      });

      if (!res.ok) {
        let errorMsg = '请求失败';
        try {
          const errData = await res.json();
          errorMsg = errData.error || `请求失败 (${res.status})`;
        } catch {
          errorMsg = `请求失败 (${res.status})`;
        }
        onError(errorMsg);
        return;
      }

      const reader = res.body?.getReader();
      if (!reader) {
        onError('无法读取响应流');
        return;
      }

      const decoder = new TextDecoder();
      let buffer = '';
      let fullContent = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              if (data.type === 'content') {
                fullContent += data.content;
                onContent(data.content);
              } else if (data.type === 'done') {
                onDone(data.fullContent || fullContent);
              } else if (data.type === 'error') {
                onError(data.error);
              }
            } catch {
              // 忽略解析错误
            }
          }
        }
      }
    } catch (error: any) {
      if (error.name !== 'AbortError') {
        onError(error.message || '网络错误');
      }
    }
  })();

  return controller;
}

/**
 * Agent 对话（SSE 流式，支持 Function Calling + ReAct）
 * 返回 AbortController 用于取消
 */
export function agentChatStream(
  message: string,
  story: any,
  characters: any,
  callbacks: AgentCallbacks
): AbortController {
  const controller = new AbortController();

  (async () => {
    try {
      const res = await fetch(`${API_BASE}/agent/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, story, characters }),
        signal: controller.signal,
      });

      if (!res.ok) {
        let errorMsg = '请求失败';
        try {
          const errData = await res.json();
          errorMsg = errData.error || `请求失败 (${res.status})`;
        } catch {
          errorMsg = `请求失败 (${res.status})`;
        }
        callbacks.onError?.(errorMsg);
        return;
      }

      const reader = res.body?.getReader();
      if (!reader) {
        callbacks.onError?.('无法读取响应流');
        return;
      }

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const event: AgentSSEEvent = JSON.parse(line.slice(6));

              switch (event.type) {
                case 'thinking':
                case 'tool_call':
                case 'tool_result':
                  callbacks.onStep?.(event);
                  break;
                case 'tool_confirm':
                  callbacks.onToolConfirm?.(event as AgentToolConfirmEvent);
                  break;
                case 'content':
                  callbacks.onContent?.(event.content);
                  break;
                case 'chapter_content':
                  callbacks.onChapterContent?.(event as AgentChapterContentEvent);
                  break;
                case 'agent_done':
                  callbacks.onDone?.(event.iterations);
                  break;
                case 'error':
                  callbacks.onError?.(event.error);
                  break;
              }
            } catch {
              // 忽略解析错误
            }
          }
        }
      }
    } catch (error: any) {
      if (error.name !== 'AbortError') {
        callbacks.onError?.(error.message || '网络错误');
      }
    }
  })();

  return controller;
}

/**
 * 同步生成章节内容（降级方案）
 */
export async function generateChapterSync(
  userRequest: string,
  chapterInfo: ChapterInfo | null,
  story: any,
  characters: any
): Promise<string> {
  const res = await fetch(`${API_BASE}/generate/chapter-sync`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userRequest, chapterInfo, story, characters }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: '请求失败' }));
    throw new Error(err.error || '请求失败');
  }

  const data = await res.json();
  return data.content;
}

/**
 * 人设一致性检查
 */
export async function checkConsistency(
  content: string,
  story: any,
  characters: any
): Promise<ConsistencyResult> {
  const res = await fetch(`${API_BASE}/check-consistency`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content, story, characters }),
  });

  if (!res.ok) {
    let errorMsg = '检查失败';
    try {
      const errData = await res.json();
      errorMsg = errData.error || `检查失败 (${res.status})`;
    } catch {
      errorMsg = `检查失败 (${res.status})`;
    }
    throw new Error(errorMsg);
  }

  const data = await res.json();
  return data.result;
}

/**
 * 健康检查
 */
export async function healthCheck(): Promise<{ ok: boolean; model?: string }> {
  try {
    const res = await fetch(`${API_BASE}/health`);
    if (res.ok) {
      const data = await res.json();
      return { ok: true, model: data.model };
    }
    return { ok: false };
  } catch {
    return { ok: false };
  }
}
