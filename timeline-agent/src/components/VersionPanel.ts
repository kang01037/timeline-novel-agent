/**
 * 版本历史面板
 * 管理生成内容的版本记录，支持对比和恢复
 */

import { escapeHtml, generateId, copyToClipboard } from '../utils';
import { getState } from '../stores/timelineStore';
import { saveVersionsToStorage, loadVersionsFromStorage, type VersionData } from '../utils/persistence';

type VersionRecord = VersionData;

export class VersionPanel {
  private element: HTMLElement;
  private versions: VersionRecord[] = [];
  private selectedVersionId: string | null = null;
  private compareVersionId: string | null = null;

  constructor(container: HTMLElement) {
    this.element = container;
    this.loadVersions();
    this.render();
  }

  private loadVersions(): void {
    const saved = loadVersionsFromStorage();
    if (saved) {
      this.versions = saved;
    }
  }

  private saveVersions(): void {
    saveVersionsToStorage(this.versions);
  }

  addVersion(content: string, userRequest: string): string {
    const id = generateId('v');
    this.versions.unshift({
      id,
      content,
      timestamp: Date.now(),
      userRequest,
      adopted: false,
    });
    // 最多保留 50 条
    if (this.versions.length > 50) {
      this.versions = this.versions.slice(0, 50);
    }
    this.saveVersions();
    return id;
  }

  getVersions(): VersionRecord[] {
    return this.versions;
  }

  private render(): void {
    this.element.innerHTML = `
      <div class="panel-header">
        <h2>版本历史</h2>
        <div class="panel-actions">
          <span class="character-count">${this.versions.length} 条记录</span>
          <button class="btn btn-small btn-cancel" id="clear-versions" title="清空历史">清空</button>
        </div>
      </div>
      <div class="version-list" id="version-list"></div>
    `;

    this.renderList();
    this.bindEvents();
  }

  private renderList(): void {
    const listEl = this.element.querySelector('#version-list') as HTMLElement;
    if (!listEl) return;

    if (this.versions.length === 0) {
      listEl.innerHTML = `
        <div class="empty-state-small">
          <p>还没有生成记录</p>
        </div>
      `;
      return;
    }

    listEl.innerHTML = this.versions.map((v) => {
      const time = new Date(v.timestamp).toLocaleString('zh-CN', {
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      });
      const preview = v.content.substring(0, 60).replace(/\n/g, ' ');

      return `
        <div class="version-item ${this.selectedVersionId === v.id ? 'selected' : ''}" data-version-id="${v.id}">
          <div class="version-item-header">
            <span class="version-time">${time}</span>
            ${v.adopted ? '<span class="version-adopted">已采纳</span>' : ''}
          </div>
          <div class="version-preview">${escapeHtml(preview)}${v.content.length > 60 ? '...' : ''}</div>
          <div class="version-request">要求：${escapeHtml(v.userRequest.substring(0, 40))}</div>
          <div class="version-item-actions">
            <button class="msg-action-btn" data-action="view" data-vid="${v.id}">查看</button>
            <button class="msg-action-btn" data-action="adopt" data-vid="${v.id}">采纳</button>
            <button class="msg-action-btn" data-action="compare" data-vid="${v.id}">对比</button>
            <button class="msg-action-btn" data-action="delete" data-vid="${v.id}" style="color: var(--accent-red);">删除</button>
          </div>
        </div>
      `;
    }).join('');
  }

  private bindEvents(): void {
    // 清空历史
    this.element.querySelector('#clear-versions')?.addEventListener('click', () => {
      if (confirm('确定清空所有版本记录？')) {
        this.versions = [];
        this.saveVersions();
        this.renderList();
      }
    });

    // 版本操作
    this.element.querySelector('#version-list')?.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      const action = target.dataset.action;
      const vid = target.dataset.vid;
      if (!action || !vid) return;

      const version = this.versions.find((v) => v.id === vid);
      if (!version) return;

      switch (action) {
        case 'view':
          this.showVersionDetail(version);
          break;
        case 'adopt':
          this.adoptVersion(version);
          break;
        case 'compare':
          this.startCompare(vid);
          break;
        case 'delete':
          this.versions = this.versions.filter((v) => v.id !== vid);
          this.saveVersions();
          this.renderList();
          break;
      }
    });
  }

  private showVersionDetail(version: VersionRecord): void {
    const overlay = document.createElement('div');
    overlay.className = 'form-overlay';

    overlay.innerHTML = `
      <div class="event-form-modal" style="width: 600px;">
        <h3>版本详情</h3>
        <div style="margin-bottom: 12px;">
          <span style="color: var(--text-secondary); font-size: 13px;">
            ${new Date(version.timestamp).toLocaleString('zh-CN')} | 要求：${escapeHtml(version.userRequest)}
          </span>
        </div>
        <div style="background: var(--bg-tertiary); padding: 16px; border-radius: 8px; max-height: 400px; overflow-y: auto; white-space: pre-wrap; font-size: 14px; line-height: 1.6;">
          ${escapeHtml(version.content)}
        </div>
        <div class="form-actions">
          <button class="btn btn-cancel" id="detail-close">关闭</button>
          <button class="btn btn-submit" id="detail-adopt">采纳</button>
          <button class="btn btn-primary btn-small" id="detail-copy">复制</button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    overlay.querySelector('#detail-close')?.addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });

    overlay.querySelector('#detail-adopt')?.addEventListener('click', () => {
      this.adoptVersion(version);
      overlay.remove();
    });

    overlay.querySelector('#detail-copy')?.addEventListener('click', async () => {
      const ok = await copyToClipboard(version.content);
      const btn = overlay.querySelector('#detail-copy') as HTMLElement;
      btn.textContent = ok ? '已复制' : '复制失败';
    });
  }

  private adoptVersion(version: VersionRecord): void {
    const store = getState();
    if (!store) {
      alert('无法采纳：时间线存储未就绪');
      return;
    }

    const title = version.content.match(/^#{1,3}\s+(.+)$/m)?.[1] || 'AI 生成的章节';

    store.addEvent(null, {
      title,
      description: version.content.substring(0, 200),
      datetime: new Date().toISOString(),
      color: '#8b5cf6',
    });

    version.adopted = true;
    this.saveVersions();
    this.renderList();
  }

  private startCompare(vid: string): void {
    if (!this.compareVersionId) {
      this.compareVersionId = vid;
      this.addSystemMessage('请选择第二个版本进行对比');
      this.renderList();
    } else {
      const v1 = this.versions.find((v) => v.id === this.compareVersionId);
      const v2 = this.versions.find((v) => v.id === vid);
      this.compareVersionId = null;

      if (v1 && v2) {
        this.showCompare(v1, v2);
      }
    }
  }

  private addSystemMessage(msg: string): void {
    console.log('[VersionPanel]', msg);
  }

  private showCompare(v1: VersionRecord, v2: VersionRecord): void {
    const overlay = document.createElement('div');
    overlay.className = 'form-overlay';

    overlay.innerHTML = `
      <div class="event-form-modal" style="width: 90vw; max-width: 900px;">
        <h3>版本对比</h3>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px;">
          <div>
            <div style="color: var(--text-secondary); font-size: 12px; margin-bottom: 8px;">
              版本 A — ${new Date(v1.timestamp).toLocaleString('zh-CN')}
            </div>
            <div style="background: var(--bg-tertiary); padding: 12px; border-radius: 8px; max-height: 400px; overflow-y: auto; white-space: pre-wrap; font-size: 13px; line-height: 1.6;">
              ${escapeHtml(v1.content)}
            </div>
          </div>
          <div>
            <div style="color: var(--text-secondary); font-size: 12px; margin-bottom: 8px;">
              版本 B — ${new Date(v2.timestamp).toLocaleString('zh-CN')}
            </div>
            <div style="background: var(--bg-tertiary); padding: 12px; border-radius: 8px; max-height: 400px; overflow-y: auto; white-space: pre-wrap; font-size: 13px; line-height: 1.6;">
              ${escapeHtml(v2.content)}
            </div>
          </div>
        </div>
        <div class="form-actions">
          <button class="btn btn-cancel" id="compare-close">关闭</button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);
    overlay.querySelector('#compare-close')?.addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
  }

  refresh(): void {
    this.render();
  }
}
