/**
 * AI 配置面板
 * 让用户在前端配置 API Key、模型等
 */

import { escapeAttr } from '../utils';

const CONFIG_STORAGE_KEY = 'timeline-agent-ai-config';

export interface AIConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
}

const DEFAULT_CONFIG: AIConfig = {
  apiKey: '',
  baseUrl: 'https://api.openai.com/v1',
  model: 'gpt-3.5-turbo',
};

const PRESET_MODELS = [
  { label: '通义千问-Plus', model: 'qwen-plus', baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1' },
  { label: '通义千问-Turbo', model: 'qwen-turbo', baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1' },
  { label: '通义千问-Max', model: 'qwen-max', baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1' },
  { label: '通义千问-Long', model: 'qwen-long', baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1' },
  { label: 'DeepSeek', model: 'deepseek-chat', baseUrl: 'https://api.deepseek.com/v1' },
  { label: 'Ollama 本地', model: 'qwen2', baseUrl: 'http://localhost:11434/v1' },
];

/**
 * 从 localStorage 加载 AI 配置
 */
export function loadAIConfig(): AIConfig {
  try {
    const saved = localStorage.getItem(CONFIG_STORAGE_KEY);
    if (saved) {
      return { ...DEFAULT_CONFIG, ...JSON.parse(saved) };
    }
  } catch (e) {
    console.warn('加载 AI 配置失败:', e);
  }
  return { ...DEFAULT_CONFIG };
}

/**
 * 保存 AI 配置到 localStorage + 服务端
 */
export function saveAIConfig(config: AIConfig): void {
  // 1. 保存到 localStorage
  try {
    localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(config));
  } catch (e) {
    console.warn('保存 AI 配置到 localStorage 失败:', e);
  }
  // 2. 异步同步到服务端（POST /api/config 会触发 dataStore.saveAIConfig）
  fetch('/api/config', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config),
  }).catch((e) => {
    console.warn('同步 AI 配置到服务端失败:', e);
  });
}

export function showAIConfigPanel(onSave?: () => void): void {
  const config = loadAIConfig();

  const overlay = document.createElement('div');
  overlay.className = 'form-overlay';

  overlay.innerHTML = `
    <div class="event-form-modal" style="width: 500px;">
      <h3>AI 配置</h3>

      <div class="form-group">
        <label>API Key</label>
        <input type="password" id="ai-api-key" value="${escapeAttr(config.apiKey)}" placeholder="输入你的 API Key" />
      </div>

      <div class="form-group">
        <label>API 地址</label>
        <input type="text" id="ai-base-url" value="${escapeAttr(config.baseUrl)}" placeholder="https://api.openai.com/v1" />
      </div>

      <div class="form-group">
        <label>快速选择模型</label>
        <div class="preset-models" style="display: flex; gap: 6px; flex-wrap: wrap;">
          ${PRESET_MODELS.map((p) => `
            <button class="quick-action-btn" data-model="${escapeAttr(p.model)}" data-url="${escapeAttr(p.baseUrl)}"
                    style="${p.model === config.model ? 'background-color: rgba(59,130,246,0.15); border-color: var(--accent-blue); color: var(--accent-blue);' : ''}">
              ${escapeAttr(p.label)}
            </button>
          `).join('')}
        </div>
      </div>

      <div class="form-group">
        <label>模型名称</label>
        <input type="text" id="ai-model" value="${escapeAttr(config.model)}" placeholder="gpt-3.5-turbo" />
      </div>

      <div class="form-group" style="margin-top: 4px;">
        <p style="font-size: 12px; color: var(--text-secondary); line-height: 1.5;">
          提示：配置会保存在浏览器本地。你也可以通过后端环境变量设置（优先级更高）。
        </p>
      </div>

      <div class="form-actions">
        <button class="btn btn-cancel" id="config-cancel">取消</button>
        <button class="btn btn-submit" id="config-save">保存配置</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  // 预设模型点击
  overlay.querySelectorAll('.preset-models .quick-action-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const model = (btn as HTMLElement).dataset.model!;
      const url = (btn as HTMLElement).dataset.url!;
      (overlay.querySelector('#ai-model') as HTMLInputElement).value = model;
      (overlay.querySelector('#ai-base-url') as HTMLInputElement).value = url;
    });
  });

  overlay.querySelector('#config-cancel')?.addEventListener('click', () => overlay.remove());
  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });

  overlay.querySelector('#config-save')?.addEventListener('click', async () => {
    const saveBtn = overlay.querySelector('#config-save') as HTMLElement;
    saveBtn.textContent = '保存中...';
    saveBtn.setAttribute('disabled', 'true');

    const newConfig: AIConfig = {
      apiKey: (overlay.querySelector('#ai-api-key') as HTMLInputElement).value.trim(),
      baseUrl: (overlay.querySelector('#ai-base-url') as HTMLInputElement).value.trim() || DEFAULT_CONFIG.baseUrl,
      model: (overlay.querySelector('#ai-model') as HTMLInputElement).value.trim() || DEFAULT_CONFIG.model,
    };

    saveAIConfig(newConfig);

    overlay.remove();
    onSave?.();
  });
}
