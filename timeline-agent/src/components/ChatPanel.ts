import { getState, setState as setTimelineState } from '../stores/timelineStore';
import { getCharacterState, setCharacterState } from '../stores/characterStore';
import {
  generateChapterStream,
  agentChatStream,
  checkConsistency,
  healthCheck,
  syncData,
  sendToolConfirm,
  type ConsistencyResult,
  type AgentStepEvent,
  type AgentToolConfirmEvent,
} from '../services/agentService';
import { showAIConfigPanel } from './AIConfigPanel';
import { escapeHtml, generateId, copyToClipboard, createRAFThrottle } from '../utils';
import { marked } from 'marked';

// 配置 marked
marked.setOptions({
  breaks: true,
  gfm: true,
});

// 工具名称中文映射
const TOOL_LABELS: Record<string, string> = {
  get_characters: '📋 查询角色列表',
  get_character: '👤 查询角色详情',
  get_events: '📖 查询故事线',
  add_character: '➕ 创建角色',
  update_character: '✏️ 修改角色',
  add_event: '➕ 添加事件',
  update_event: '✏️ 修改事件',
  generate_chapter: '✍️ 生成章节',
  check_consistency: '🔍 一致性检查',
};

// 需要用户确认的危险操作
const DANGEROUS_TOOLS = new Set(['update_character', 'update_event']);

interface AgentStep {
  type: 'thinking' | 'tool_call' | 'tool_result';
  tool?: string;
  args?: any;
  result?: any;
  duration?: number;
  step: number;
  message?: string;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  isStreaming?: boolean;
  consistencyResult?: ConsistencyResult;
  agentSteps?: AgentStep[];
  useAgent?: boolean; // 是否使用 Agent 模式
}

interface ChapterVersion {
  id: string;
  content: string;
  timestamp: number;
  userRequest: string;
}

export class ChatPanel {
  private element: HTMLElement;
  private messages: ChatMessage[] = [];
  private versions: ChapterVersion[] = [];
  private currentController: AbortController | null = null;
  private serverOnline = false;
  private isGenerating = false;
  private useAgentMode = true; // 默认使用 Agent 模式

  constructor(container: HTMLElement) {
    this.element = container;
    this.checkServer();
    this.render();
  }

  private async checkServer(): Promise<void> {
    const result = await healthCheck();
    this.serverOnline = result.ok;
    this.updateServerStatus();
    if (this.serverOnline) {
      await this.syncCurrentData();
    }
  }

  private updateServerStatus(): void {
    const statusEl = this.element.querySelector('.server-status');
    if (statusEl) {
      statusEl.className = `server-status ${this.serverOnline ? 'online' : 'offline'}`;
      statusEl.textContent = this.serverOnline ? '已连接' : '未连接';
    }
  }

  private async syncCurrentData(): Promise<void> {
    const store = getState();
    const charStore = getCharacterState();
    await syncData(
      {
        events: Array.from(store.events.entries()),
        rootEventIds: store.rootEventIds,
      },
      {
        characters: Array.from(charStore.characters.entries()),
      }
    );
  }

  private getStoryData() {
    const store = getState();
    return {
      events: Array.from(store.events.entries()),
      rootEventIds: store.rootEventIds,
    };
  }

  private getCharacterData() {
    const charStore = getCharacterState();
    return {
      characters: Array.from(charStore.characters.entries()),
    };
  }

  private render(): void {
    this.element.innerHTML = `
      <div class="panel-header">
        <h2>AI 助手</h2>
        <div class="panel-actions">
          <span class="server-status offline">检查中...</span>
          <button class="action-btn" id="toggle-agent-mode" title="${this.useAgentMode ? 'Agent模式：AI可操作数据' : '普通模式：AI只生成文本'}">
            ${this.useAgentMode ? '🤖' : '💬'}
          </button>
          <button class="action-btn" id="ai-config-btn" title="AI 配置">⚙</button>
        </div>
      </div>
      <div class="chat-messages" id="chat-messages"></div>
      <div class="chat-input-area">
        <div class="chat-input-row">
          <textarea id="chat-input" rows="2" placeholder="${this.useAgentMode ? '告诉AI你要做什么，如：帮我写第三章并添加到故事线' : '输入创作要求，如：请为第一章写一段开场白...'}"></textarea>
          <button class="btn btn-primary btn-small" id="chat-send">发送</button>
        </div>
        <div class="chat-quick-actions">
          <button class="quick-action-btn" data-action="generate-chapter">生成章节</button>
          <button class="quick-action-btn" data-action="continue-story">续写情节</button>
          <button class="quick-action-btn" data-action="dialogue">生成对话</button>
          <button class="quick-action-btn" data-action="check">一致性检查</button>
        </div>
      </div>
    `;

    this.renderMessages();
    this.bindEvents();
  }

  private renderMessages(): void {
    const container = this.element.querySelector('#chat-messages') as HTMLElement;
    if (!container) return;

    if (this.messages.length === 0) {
      container.innerHTML = `
        <div class="chat-welcome">
          <div class="chat-welcome-icon">✨</div>
          <h3>小说创作助手</h3>
          <p>我可以帮你创作章节、续写情节、生成对话，还能检查人设一致性。</p>
          <p style="font-size: 12px; color: var(--accent-purple); margin-top: 4px;">🤖 Agent 模式已开启 — 我可以自主操作角色和故事线数据</p>
          <div class="chat-welcome-tips">
            <div class="tip-item" data-tip="帮我创建一个叫林风的剑客角色，性格冷酷">创建角色</div>
            <div class="tip-item" data-tip="查看当前故事线和角色设定">查看数据</div>
            <div class="tip-item" data-tip="帮我写第三章并添加到故事线">生成+操作</div>
          </div>
        </div>
      `;
      this.bindWelcomeEvents();
      return;
    }

    container.innerHTML = this.messages.map((msg) => this.renderMessage(msg)).join('');
    container.scrollTop = container.scrollHeight;
  }

  private renderMessage(msg: ChatMessage): string {
    const time = new Date(msg.timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });

    if (msg.role === 'user') {
      return `
        <div class="chat-message user-message">
          <div class="message-content">${escapeHtml(msg.content)}</div>
          <div class="message-time">${time}</div>
        </div>
      `;
    }

    if (msg.role === 'system') {
      return `
        <div class="chat-message system-message">
          <div class="message-content">${escapeHtml(msg.content)}</div>
        </div>
      `;
    }

    // Assistant message
    const consistencyHtml = msg.consistencyResult
      ? this.renderConsistencyResult(msg.consistencyResult)
      : '';

    // Agent 步骤可视化
    const stepsHtml = (msg.agentSteps && msg.agentSteps.length > 0)
      ? this.renderAgentSteps(msg.agentSteps, !!msg.isStreaming)
      : '';

    const hasContent = msg.content.length > 0;

    return `
      <div class="chat-message assistant-message" data-message-id="${msg.id}">
        <div class="message-avatar">🤖</div>
        <div class="message-body">
          ${stepsHtml}
          <div class="message-content markdown-content">${hasContent ? this.renderMarkdown(msg.content) : (msg.isStreaming && !stepsHtml ? '<span class="typing-indicator">正在思考中...</span>' : '')}</div>
          ${consistencyHtml}
          ${hasContent && !msg.isStreaming ? this.renderMessageActions(msg.id) : ''}
          <div class="message-time">${time}${msg.isStreaming ? ' · 处理中...' : ''}</div>
        </div>
      </div>
    `;
  }

  private renderAgentSteps(steps: AgentStep[], isStreaming: boolean): string {
    if (steps.length === 0) return '';

    const stepsHtml = steps.map((step, index) => {
      const isLast = index === steps.length - 1;

      if (step.type === 'thinking') {
        return `
          <div class="agent-step agent-step-thinking ${isLast && isStreaming ? 'agent-step-active' : ''}">
            <div class="agent-step-icon">🤔</div>
            <div class="agent-step-text">思考中${step.message ? `：${escapeHtml(step.message)}` : ''}...</div>
          </div>
        `;
      }

      if (step.type === 'tool_call') {
        const label = TOOL_LABELS[step.tool || ''] || step.tool || '工具';
        const argsStr = step.args ? this.formatToolArgs(step.tool || '', step.args) : '';
        return `
          <div class="agent-step agent-step-tool-call">
            <div class="agent-step-icon">🔧</div>
            <div class="agent-step-text">
              <span class="agent-tool-name">${escapeHtml(label)}</span>
              ${argsStr ? `<span class="agent-tool-args">${escapeHtml(argsStr)}</span>` : ''}
            </div>
          </div>
        `;
      }

      if (step.type === 'tool_result') {
        const label = TOOL_LABELS[step.tool || ''] || step.tool || '工具';
        const resultStr = this.formatToolResult(step.tool || '', step.result);
        const duration = step.duration ? `${step.duration}ms` : '';
        const isError = step.result?.error;

        return `
          <div class="agent-step agent-step-tool-result ${isError ? 'agent-step-error' : ''}">
            <div class="agent-step-icon">${isError ? '❌' : '✅'}</div>
            <div class="agent-step-text">
              <span class="agent-tool-name">${escapeHtml(label)}</span>
              <span class="agent-tool-result">${escapeHtml(resultStr)}</span>
              ${duration ? `<span class="agent-tool-duration">${duration}</span>` : ''}
            </div>
          </div>
        `;
      }

      return '';
    }).join('');

    return `
      <div class="agent-steps">
        <div class="agent-steps-header">Agent 推理过程</div>
        ${stepsHtml}
      </div>
    `;
  }

  private formatToolArgs(tool: string, args: any): string {
    const parts: string[] = [];
    if (args.name) parts.push(args.name);
    if (args.title) parts.push(args.title);
    if (args.query) parts.push(`搜索"${args.query}"`);
    if (args.userRequest) parts.push(args.userRequest.substring(0, 30) + (args.userRequest.length > 30 ? '...' : ''));
    if (args.content) parts.push(args.content.substring(0, 30) + (args.content.length > 30 ? '...' : ''));
    if (args.gender) parts.push(args.gender);
    if (args.description) parts.push(args.description.substring(0, 20) + '...');
    if (args.parentTitle) parts.push(`父事件: ${args.parentTitle}`);
    if (args.updates) parts.push('修改: ' + Object.keys(args.updates).join(', '));
    return parts.join(' · ');
  }

  private formatToolResult(tool: string, result: any): string {
    if (!result) return '完成';
    if (result.error) return result.error;
    if (result.message) return result.message;
    if (result.count !== undefined) return `${result.count} 条`;
    if (result.success) return result.message || '成功';
    if (result.consistent !== undefined) return result.consistent ? '一致' : `发现 ${result.issues?.length || 0} 个问题`;
    return '完成';
  }

  private renderConsistencyResult(result: ConsistencyResult): string {
    if (result.consistent && (!result.issues || result.issues.length === 0)) {
      return '<div class="consistency-badge consistent">✅ 人设一致性检查通过</div>';
    }

    const issuesHtml = (result.issues || []).map((issue) => `
      <div class="consistency-issue">
        <span class="issue-type">${escapeHtml(this.getIssueTypeLabel(issue.type))}</span>
        <span class="issue-desc">${escapeHtml(issue.description)}</span>
        <span class="issue-suggestion">建议：${escapeHtml(issue.suggestion)}</span>
      </div>
    `).join('');

    return `
      <div class="consistency-badge inconsistent">⚠️ 发现人设不一致</div>
      <div class="consistency-details">${issuesHtml}</div>
    `;
  }

  private getIssueTypeLabel(type: string): string {
    const labels: Record<string, string> = {
      character_trait: '角色性格',
      relationship: '人物关系',
      timeline: '时间线',
      logic: '逻辑矛盾',
    };
    return labels[type] || type;
  }

  private renderMessageActions(messageId: string): string {
    return `
      <div class="message-actions-bar">
        <button class="msg-action-btn" data-action="adopt" data-msg-id="${messageId}" title="采纳为事件描述">采纳</button>
        <button class="msg-action-btn" data-action="retry" data-msg-id="${messageId}" title="重新生成">重试</button>
        <button class="msg-action-btn" data-action="check" data-msg-id="${messageId}" title="人设一致性检查">检查</button>
        <button class="msg-action-btn" data-action="copy" data-msg-id="${messageId}" title="复制内容">复制</button>
      </div>
    `;
  }

  private renderMarkdown(text: string): string {
    try {
      return marked.parse(text) as string;
    } catch {
      return escapeHtml(text).replace(/\n/g, '<br>');
    }
  }

  // RAF 节流的流式更新（含 agent 步骤）
  private throttledUpdateStreaming = createRAFThrottle((msg: ChatMessage) => {
    const msgEl = this.element.querySelector(`[data-message-id="${msg.id}"]`);
    if (!msgEl) return;

    // 更新 agent 步骤
    const stepsContainer = msgEl.querySelector('.agent-steps');
    if (stepsContainer && msg.agentSteps && msg.agentSteps.length > 0) {
      const newStepsHtml = this.renderAgentSteps(msg.agentSteps, !!msg.isStreaming);
      // 替换整个 agent-steps 容器
      const temp = document.createElement('div');
      temp.innerHTML = newStepsHtml;
      const newContainer = temp.firstElementChild;
      if (newContainer) {
        stepsContainer.replaceWith(newContainer);
      }
    } else if (!stepsContainer && msg.agentSteps && msg.agentSteps.length > 0) {
      // 首次出现 steps，插入到 message-body 开头
      const messageBody = msgEl.querySelector('.message-body');
      const contentEl = msgEl.querySelector('.message-content');
      if (messageBody && contentEl) {
        const temp = document.createElement('div');
        temp.innerHTML = this.renderAgentSteps(msg.agentSteps, !!msg.isStreaming);
        const stepsEl = temp.firstElementChild;
        if (stepsEl) {
          messageBody.insertBefore(stepsEl, contentEl);
        }
      }
    }

    // 更新消息内容
    const contentEl = msgEl.querySelector('.message-content');
    if (contentEl) {
      const hasContent = msg.content.length > 0;
      contentEl.innerHTML = hasContent ? this.renderMarkdown(msg.content) : (msg.isStreaming && !(msg.agentSteps && msg.agentSteps.length > 0) ? '<span class="typing-indicator">正在思考中...</span>' : '');
    }

    const container = this.element.querySelector('#chat-messages');
    if (container) {
      container.scrollTop = container.scrollHeight;
    }
  });

  private bindEvents(): void {
    // 发送按钮
    this.element.querySelector('#chat-send')?.addEventListener('click', () => {
      this.handleSend();
    });

    // 输入框回车
    this.element.querySelector('#chat-input')?.addEventListener('keypress', (e) => {
      if ((e as KeyboardEvent).key === 'Enter' && !(e as KeyboardEvent).shiftKey) {
        e.preventDefault();
        this.handleSend();
      }
    });

    // textarea 自动调整高度
    this.element.querySelector('#chat-input')?.addEventListener('input', (e) => {
      const textarea = e.target as HTMLTextAreaElement;
      textarea.style.height = 'auto';
      textarea.style.height = Math.min(textarea.scrollHeight, 160) + 'px';
    });

    // 快捷操作
    this.element.querySelectorAll('.quick-action-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const action = (e.currentTarget as HTMLElement).dataset.action;
        this.handleQuickAction(action!);
      });
    });

    // AI 配置按钮
    this.element.querySelector('#ai-config-btn')?.addEventListener('click', () => {
      showAIConfigPanel(() => {
        this.checkServer();
      });
    });

    // Agent 模式切换
    this.element.querySelector('#toggle-agent-mode')?.addEventListener('click', () => {
      this.useAgentMode = !this.useAgentMode;
      this.render();
      // render() 重建 DOM 后需要恢复服务器状态显示
      this.updateServerStatus();
    });

    // 消息操作按钮（事件委托）
    this.element.querySelector('#chat-messages')?.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      const action = target.dataset.action;
      const msgId = target.dataset.msgId;
      if (action && msgId) {
        this.handleMessageAction(action, msgId);
      }
    });
  }

  private bindWelcomeEvents(): void {
    this.element.querySelectorAll('.tip-item').forEach((item) => {
      item.addEventListener('click', (e) => {
        const tip = (e.currentTarget as HTMLElement).dataset.tip;
        if (tip) {
          const input = this.element.querySelector('#chat-input') as HTMLTextAreaElement;
          if (input) {
            input.value = tip;
            this.handleSend();
          }
        }
      });
    });
  }

  private async handleSend(): Promise<void> {
    if (this.isGenerating) {
      this.addSystemMessage('⚠️ 正在生成中，请等待完成或刷新页面');
      return;
    }

    const input = this.element.querySelector('#chat-input') as HTMLTextAreaElement;
    if (!input) return;

    const text = input.value.trim();
    if (!text) return;

    if (!this.serverOnline) {
      this.addSystemMessage('⚠️ 后端服务未连接，请先启动 AI 服务（npm run dev:server）');
      return;
    }

    input.value = '';
    this.isGenerating = true;

    // 同步最新数据
    await this.syncCurrentData();

    // 添加用户消息
    const userMsg: ChatMessage = {
      id: generateId('user'),
      role: 'user',
      content: text,
      timestamp: Date.now(),
    };
    this.messages.push(userMsg);

    // 添加 AI 消息占位
    const assistantMsg: ChatMessage = {
      id: generateId('ai'),
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
      isStreaming: true,
      agentSteps: [],
      useAgent: this.useAgentMode,
    };
    this.messages.push(assistantMsg);
    this.renderMessages();

    if (this.useAgentMode) {
      this.handleAgentChat(assistantMsg, text);
    } else {
      this.handleLegacyChat(assistantMsg, text);
    }
  }

  /**
   * Agent 模式：Function Calling + ReAct
   */
  private handleAgentChat(assistantMsg: ChatMessage, text: string): void {
    this.currentController = agentChatStream(
      text,
      this.getStoryData(),
      this.getCharacterData(),
      {
        onStep: (event: AgentStepEvent) => {
          assistantMsg.agentSteps!.push(event);

          // 如果是工具结果且包含数据变更，刷新前端 Store
          if (event.type === 'tool_result' && event.result) {
            this.syncAgentChanges(event.tool || '', event.result);
          }

          this.throttledUpdateStreaming(assistantMsg);
        },
        onToolConfirm: (event: AgentToolConfirmEvent) => {
          this.showToolConfirmDialog(event);
        },
        onContent: (content: string) => {
          assistantMsg.content += content;
          this.throttledUpdateStreaming(assistantMsg);
        },
        onDone: (iterations: number) => {
          assistantMsg.isStreaming = false;
          this.currentController = null;
          this.isGenerating = false;
          this.renderMessages();

          this.versions.push({
            id: assistantMsg.id,
            content: assistantMsg.content,
            timestamp: Date.now(),
            userRequest: text,
          });
        },
        onError: (error: string) => {
          assistantMsg.content = `❌ Agent 运行失败：${error}`;
          assistantMsg.isStreaming = false;
          this.currentController = null;
          this.isGenerating = false;
          this.renderMessages();
        },
      }
    );
  }

  /**
   * 旧模式：纯文本生成（保留兼容）
   */
  private handleLegacyChat(assistantMsg: ChatMessage, text: string): void {
    this.currentController = generateChapterStream(
      text,
      null,
      this.getStoryData(),
      this.getCharacterData(),
      (content) => {
        assistantMsg.content += content;
        this.throttledUpdateStreaming(assistantMsg);
      },
      (fullContent) => {
        assistantMsg.content = fullContent;
        assistantMsg.isStreaming = false;
        this.currentController = null;
        this.isGenerating = false;
        this.renderMessages();

        this.versions.push({
          id: assistantMsg.id,
          content: fullContent,
          timestamp: Date.now(),
          userRequest: text,
        });
      },
      (error) => {
        assistantMsg.content = `❌ 生成失败：${error}`;
        assistantMsg.isStreaming = false;
        this.currentController = null;
        this.isGenerating = false;
        this.renderMessages();
      }
    );
  }

  /**
   * 显示工具确认对话框（危险操作需用户确认）
   */
  private showToolConfirmDialog(event: AgentToolConfirmEvent): void {
    const label = TOOL_LABELS[event.tool] || event.tool;
    const argsStr = this.formatToolArgs(event.tool, event.args || {});

    const overlay = document.createElement('div');
    overlay.className = 'form-overlay';
    overlay.innerHTML = `
      <div class="tool-confirm-modal" style="
        background-color: var(--bg-secondary);
        border-radius: 16px;
        padding: 24px;
        width: 400px;
        max-width: 90vw;
        box-shadow: 0 20px 60px rgba(0,0,0,0.3);
        animation: slideUp 0.2s;
      ">
        <h3 style="margin-bottom: 16px; font-size: 16px;">⚠️ Agent 请求执行修改操作</h3>
        <div style="margin-bottom: 16px; font-size: 14px; line-height: 1.6;">
          <div style="margin-bottom: 8px;">
            <strong>操作：</strong><span style="color: var(--accent-purple);">${escapeHtml(label)}</span>
          </div>
          <div style="color: var(--text-secondary); font-size: 13px;">
            ${escapeHtml(argsStr)}
          </div>
        </div>
        <div style="display: flex; gap: 12px; justify-content: flex-end;">
          <button class="btn btn-cancel" id="tool-confirm-reject" style="padding: 8px 20px;">拒绝</button>
          <button class="btn btn-primary" id="tool-confirm-approve" style="padding: 8px 20px;">允许执行</button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    overlay.querySelector('#tool-confirm-approve')?.addEventListener('click', () => {
      sendToolConfirm(event.confirmId, true);
      overlay.remove();
    });

    overlay.querySelector('#tool-confirm-reject')?.addEventListener('click', () => {
      sendToolConfirm(event.confirmId, false);
      overlay.remove();
    });
  }

  /**
   * Agent 工具操作后，同步数据变更到前端 Store
   */
  private syncAgentChanges(tool: string, result: any): void {
    if (!result || !result.success) return;

    switch (tool) {
      case 'add_character':
      case 'update_character': {
        fetch('/api/characters').then(r => r.json()).then(data => {
          if (data && data.characters) {
            setCharacterState({ characters: new Map(data.characters) });
          }
        }).catch(() => {});
        break;
      }
      case 'add_event':
      case 'update_event': {
        fetch('/api/story').then(r => r.json()).then(data => {
          if (data && data.events) {
            setTimelineState({ events: new Map(data.events), rootEventIds: data.rootEventIds || [] });
          }
        }).catch(() => {});
        break;
      }
    }
  }

  private addSystemMessage(content: string): void {
    this.messages.push({
      id: generateId('sys'),
      role: 'system',
      content,
      timestamp: Date.now(),
    });
    this.renderMessages();
  }

  private handleQuickAction(action: string): void {
    const charStore = getCharacterState();
    const characters = Array.from(charStore.characters.values());
    const charNames = characters.map((c) => c.name).join('、');

    if (action === 'check') {
      this.handleQuickConsistencyCheck();
      return;
    }

    const templates: Record<string, string> = {
      'generate-chapter': '请根据时间线中的事件，生成一个完整的章节内容，包含场景描写、人物对话和心理活动。',
      'continue-story': `请继续推进故事情节，围绕${charNames || '主角'}展开新的发展。`,
      'dialogue': `请为${charNames || '角色'}之间写一段精彩的对话，展现各自的性格特点。`,
    };

    const input = this.element.querySelector('#chat-input') as HTMLTextAreaElement;
    if (input && templates[action]) {
      input.value = templates[action];
      this.handleSend();
    }
  }

  private async handleQuickConsistencyCheck(): Promise<void> {
    const lastAssistantMsg = [...this.messages].reverse().find((m) => m.role === 'assistant' && m.content.length > 0);

    if (!lastAssistantMsg) {
      this.addSystemMessage('⚠️ 没有找到可检查的生成内容，请先生成一个章节。');
      return;
    }

    await this.runConsistencyCheck(lastAssistantMsg.id);
  }

  private async handleMessageAction(action: string, messageId: string): Promise<void> {
    const msg = this.messages.find((m) => m.id === messageId);
    if (!msg || msg.role !== 'assistant') return;

    switch (action) {
      case 'adopt':
        this.adoptContent(msg.content);
        break;
      case 'retry':
        this.retryGeneration(messageId);
        break;
      case 'check':
        await this.runConsistencyCheck(messageId);
        break;
      case 'copy': {
        const ok = await copyToClipboard(msg.content);
        this.addSystemMessage(ok ? '内容已复制到剪贴板' : '❌ 复制失败，请手动复制');
        break;
      }
    }
  }

  private adoptContent(content: string): void {
    const store = getState();
    const title = this.extractTitle(content) || 'AI 生成的章节';

    store.addEvent(null, {
      title,
      description: content.substring(0, 200),
      datetime: new Date().toISOString(),
      color: '#8b5cf6',
    });

    this.addSystemMessage('内容已采纳为新的时间线事件');
  }

  private extractTitle(content: string): string {
    const match = content.match(/^#{1,3}\s+(.+)$/m);
    if (match) return match[1];

    const firstLine = content.split('\n').find((l) => l.trim().length > 0);
    if (firstLine) {
      return firstLine.trim().substring(0, 20) + (firstLine.length > 20 ? '...' : '');
    }
    return '';
  }

  private retryGeneration(messageId: string): void {
    if (this.isGenerating) {
      this.addSystemMessage('⚠️ 正在生成中，请等待完成后再重试');
      return;
    }

    const msgIndex = this.messages.findIndex((m) => m.id === messageId);
    if (msgIndex < 0) return;

    let userMsg: ChatMessage | null = null;
    for (let i = msgIndex - 1; i >= 0; i--) {
      if (this.messages[i].role === 'user') {
        userMsg = this.messages[i];
        break;
      }
    }

    if (userMsg) {
      const input = this.element.querySelector('#chat-input') as HTMLTextAreaElement;
      if (input) {
        input.value = userMsg.content;
        this.handleSend();
      }
    }
  }

  private async runConsistencyCheck(messageId: string): Promise<void> {
    const msg = this.messages.find((m) => m.id === messageId);
    if (!msg) return;

    this.addSystemMessage('正在进行人设一致性检查...');

    try {
      await this.syncCurrentData();
      const result = await checkConsistency(
        msg.content,
        this.getStoryData(),
        this.getCharacterData()
      );

      msg.consistencyResult = result;
      this.renderMessages();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.addSystemMessage(`❌ 一致性检查失败：${message}`);
    }
  }

  destroy(): void {
    this.currentController?.abort();
  }
}
