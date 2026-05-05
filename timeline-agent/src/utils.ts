/**
 * 共享工具函数
 */

// ==================== HTML 转义 ====================

const ESCAPE_MAP: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => ESCAPE_MAP[c]);
}

/** 转义 HTML 属性值中的双引号，用于 value="${attr}" 场景 */
export function escapeAttr(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ==================== ID 生成 ====================

let idCounter = 0;

/** 生成唯一 ID，避免 Date.now() 碰撞 */
export function generateId(prefix: string = 'id'): string {
  idCounter++;
  return `${prefix}-${Date.now()}-${idCounter}`;
}

// ==================== 常量 ====================

export const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#f97316'];

export const TRAIT_SUGGESTIONS = [
  '勇敢', '聪明', '善良', '狡猾', '冷酷', '温柔', '冲动', '冷静',
  '忠诚', '背叛', '乐观', '悲观', '幽默', '严肃', '热情', '冷漠',
  '正义', '邪恶', '智慧', '愚笨', '坚强', '脆弱', '独立', '依赖',
];

export const GENDER_OPTIONS = [
  { value: '男', label: '男' },
  { value: '女', label: '女' },
  { value: '其他', label: '其他' },
] as const;

// ==================== 颜色选择器 HTML ====================

export function renderColorSelector(selectedColor: string = '#3b82f6'): string {
  return `<div class="color-selector" id="color-selector">
    ${COLORS.map(color => `
      <button class="color-option ${color === selectedColor ? 'active' : ''}"
              data-color="${color}" style="background-color: ${color}">
      </button>
    `).join('')}
  </div>`;
}

// ==================== 剪贴板 ====================

/** 安全复制到剪贴板，带降级方案 */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
    // 降级方案
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    const success = document.execCommand('copy');
    document.body.removeChild(textarea);
    return success;
  } catch {
    return false;
  }
}

// ==================== 节流 ====================

/** requestAnimationFrame 节流 */
export function createRAFThrottle<T extends (...args: any[]) => void>(fn: T): T {
  let rafId: number | null = null;
  let lastArgs: any[] | null = null;

  const throttled = (...args: any[]) => {
    lastArgs = args;
    if (rafId === null) {
      rafId = requestAnimationFrame(() => {
        rafId = null;
        if (lastArgs) {
          fn(...lastArgs);
          lastArgs = null;
        }
      });
    }
  };

  return throttled as T;
}
