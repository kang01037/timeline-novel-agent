import type { TimelineEvent } from '../types/timeline';
import { getState, subscribe } from '../stores/timelineStore';
import { getCharacterState } from '../stores/characterStore';
import { EventForm } from './EventForm';
import { SymbolPicker } from './SymbolPicker';
import { escapeHtml } from '../utils';
import { importAllToServer } from '../utils/persistence';
import dayjs from 'dayjs';

export class TimelineView {
  private element: HTMLElement;
  private unsubscribe: (() => void) | null = null;
  private addChildHandler: EventListener;
  private showSymbolPickerHandler: EventListener;
  private cardOffset: number; // 卡片与轴线的间距

  constructor(container: HTMLElement) {
    this.element = container;

    // 从 localStorage 恢复卡片偏移量
    const savedOffset = localStorage.getItem('timeline-card-offset');
    this.cardOffset = savedOffset ? parseInt(savedOffset, 10) : 100;

    this.addChildHandler = ((e: CustomEvent) => {
      EventForm.show(e.detail, () => this.render());
    }) as EventListener;

    this.showSymbolPickerHandler = ((e: CustomEvent) => {
      new SymbolPicker(e.detail.eventId, e.detail.rect);
    }) as EventListener;

    this.setupGlobalEvents();
    this.render();
    this.subscribe();
  }

  private setupGlobalEvents(): void {
    document.addEventListener('add-child-event', this.addChildHandler);
    document.addEventListener('show-symbol-picker', this.showSymbolPickerHandler);
  }

  private subscribe(): void {
    let prevSelectedId: string | null = getState().selectedEventId;
    let prevEventsSize: number = getState().events.size;
    let prevRootIdsLen: number = getState().rootEventIds.length;

    this.unsubscribe = subscribe(() => {
      const state = getState();
      const selectedChanged = state.selectedEventId !== prevSelectedId;
      const dataChanged = state.events.size !== prevEventsSize || state.rootEventIds.length !== prevRootIdsLen;

      prevSelectedId = state.selectedEventId;
      prevEventsSize = state.events.size;
      prevRootIdsLen = state.rootEventIds.length;

      // 如果只是选中状态变化，做轻量更新而非全量重渲染
      if (selectedChanged && !dataChanged) {
        this.updateSelection(state.selectedEventId);
        return;
      }
      this.render();
    });
  }

  /**
   * 轻量选择更新：只切换 CSS 类名，不重建 DOM
   */
  private updateSelection(newId: string | null): void {
    // 移除旧选中
    this.element.querySelectorAll('.timeline-event-card.selected').forEach(el => {
      el.classList.remove('selected');
    });
    // 添加新选中
    if (newId) {
      const newCard = this.element.querySelector(`.timeline-event-wrapper[data-event-id="${newId}"] .timeline-event-card`);
      if (newCard) newCard.classList.add('selected');
    }
  }

  private render(): void {
    const store = getState();

    // 保存滚动位置，防止 render 后滚动重置
    const scrollContainer = this.element.querySelector('.timeline-container') as HTMLElement;
    const savedScrollTop = scrollContainer?.scrollTop ?? 0;

    this.element.innerHTML = `
      <div class="timeline-header">
        <h2>故事时间线</h2>
        <div class="header-actions">
          <span class="event-count">${store.events.size} 个事件</span>
          <button class="btn btn-primary btn-small" id="import-data" title="从文件导入数据">
            导入
          </button>
          <button class="btn btn-primary btn-small" id="export-data" title="保存数据到本地">
            保存
          </button>
          <button class="btn btn-primary btn-small" id="add-root-event">
            <span>+</span> 添加事件
          </button>
        </div>
      </div>
      <div class="timeline-container">
        <div class="timeline-tree" id="timeline-tree"></div>
      </div>
    `;

    const treeContainer = this.element.querySelector('#timeline-tree') as HTMLElement;

    // 应用卡片偏移量 CSS 变量
    treeContainer.style.setProperty('--card-offset', this.cardOffset + 'px');

    if (store.rootEventIds.length === 0) {
      treeContainer.innerHTML = `
        <div class="empty-state">
          <h3>还没有事件</h3>
          <p>点击上方"添加事件"按钮开始创建你的时间线</p>
        </div>
      `;
    } else {
      const sortedRootIds = this.sortEventIds(store.rootEventIds, store.events);
      let globalIndex = 0;
      
      sortedRootIds.forEach((eventId) => {
        const event = store.events.get(eventId);
        if (event) {
          this.renderEventSubtree(event, globalIndex, 0, treeContainer);
          globalIndex++;
        }
      });
    }

    this.element.querySelector('#add-root-event')?.addEventListener('click', () => {
      EventForm.show(null, () => this.render());
    });

    this.element.querySelector('#import-data')?.addEventListener('click', () => {
      this.importData();
    });

    this.element.querySelector('#export-data')?.addEventListener('click', () => {
      this.exportData();
    });

    this.bindCardEvents();
    this.initCardDrag();

    // 恢复滚动位置
    const newScrollContainer = this.element.querySelector('.timeline-container') as HTMLElement;
    if (newScrollContainer) {
      newScrollContainer.scrollTop = savedScrollTop;
    }
  }

  private renderEventSubtree(event: TimelineEvent, index: number, level: number, container: HTMLElement): void {
    const wrapper = this.renderEventCard(event, index, level);
    container.appendChild(wrapper);

    if (event.children.length > 0 && !event.isCollapsed) {
      const store = getState();
      const childrenContainer = document.createElement('div');
      childrenContainer.className = 'timeline-event-children';

      const sortedChildren = this.sortEventIds(event.children, store.events);
      sortedChildren.forEach((childId, childIndex) => {
        const child = store.events.get(childId);
        if (child) {
          this.renderEventSubtree(child, childIndex, level + 1, childrenContainer);
        }
      });

      wrapper.appendChild(childrenContainer);
    }
  }

  private sortEventIds(eventIds: string[], events: Map<string, TimelineEvent>): string[] {
    return [...eventIds].sort((a, b) => {
      const eventA = events.get(a);
      const eventB = events.get(b);
      if (!eventA || !eventB) return 0;
      return dayjs(eventA.datetime).valueOf() - dayjs(eventB.datetime).valueOf();
    });
  }

  private formatDate(isoString: string): string {
    return dayjs(isoString).format('YYYY-MM-DD');
  }

  private renderEventCard(event: TimelineEvent, index: number, level: number = 0): HTMLElement {
    const store = getState();
    const isSelected = store.selectedEventId === event.id;

    const wrapper = document.createElement('div');
    wrapper.className = `timeline-event-wrapper`;
    wrapper.dataset.eventId = event.id;
    wrapper.dataset.level = String(level);

    const hasChildren = event.children.length > 0;
    const collapseArrow = hasChildren
      ? `<button class="collapse-arrow" data-action="collapse">${event.isCollapsed ? '▶' : '▼'}</button>`
      : '';

    if (level === 0) {
      const dateLabel = document.createElement('div');
      dateLabel.className = 'timeline-event-date';
      dateLabel.textContent = this.formatDate(event.datetime);

      const dot = document.createElement('div');
      dot.className = 'timeline-event-dot';
      dot.addEventListener('click', (e) => {
        e.stopPropagation();
        document.dispatchEvent(new CustomEvent('show-symbol-picker', {
          detail: { eventId: event.id, rect: (e.target as HTMLElement).getBoundingClientRect() }
        }));
      });

      const cardContainer = document.createElement('div');
      cardContainer.className = 'timeline-event-card-container';

      const card = document.createElement('div');
      card.className = `timeline-event-card ${isSelected ? 'selected' : ''}`;
      card.style.backgroundColor = event.color;
      card.innerHTML = `
        <div class="timeline-event-card-header">
          ${collapseArrow}
          <span class="timeline-event-card-symbol">${event.symbol}</span>
          <span class="timeline-event-card-title">${escapeHtml(event.title)}</span>
          <button class="add-child-btn" data-action="add-child" title="添加子事件">+</button>
          <button class="delete-event-btn" data-action="delete-event" title="删除事件">×</button>
        </div>
        ${event.description ? `<div class="timeline-event-card-desc">${escapeHtml(event.description)}</div>` : ''}
      `;

      cardContainer.appendChild(card);
      wrapper.appendChild(dateLabel);
      wrapper.appendChild(dot);
      wrapper.appendChild(cardContainer);
    } else {
      const cardContainer = document.createElement('div');
      cardContainer.className = 'timeline-event-card-container-child';

      const card = document.createElement('div');
      card.className = `timeline-event-card timeline-event-card-child ${isSelected ? 'selected' : ''}`;
      card.style.backgroundColor = event.color;
      card.innerHTML = `
        <div class="timeline-event-card-header">
          ${collapseArrow}
          <span class="timeline-event-card-symbol">${event.symbol}</span>
          <span class="timeline-event-card-title">${escapeHtml(event.title)}</span>
          <span class="timeline-event-child-date">${this.formatDate(event.datetime)}</span>
          <button class="add-child-btn" data-action="add-child" title="添加子事件">+</button>
          <button class="delete-event-btn" data-action="delete-event" title="删除事件">×</button>
        </div>
        ${event.description ? `<div class="timeline-event-card-desc">${escapeHtml(event.description)}</div>` : ''}
      `;

      cardContainer.appendChild(card);
      wrapper.appendChild(cardContainer);
    }

    return wrapper;
  }

  private bindCardEvents(): void {
    this.element.querySelectorAll('.add-child-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const eventId = (e.currentTarget as HTMLElement).closest('.timeline-event-wrapper')?.getAttribute('data-event-id');
        if (eventId) {
          getState().selectEvent(eventId);
          EventForm.show(eventId, () => this.render());
        }
      });
    });

    this.element.querySelectorAll('.delete-event-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const eventId = (e.currentTarget as HTMLElement).closest('.timeline-event-wrapper')?.getAttribute('data-event-id');
        if (eventId && confirm('确定要删除这个事件吗？')) {
          getState().deleteEvent(eventId);
        }
      });
    });

    this.element.querySelectorAll('.collapse-arrow').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const eventId = (e.currentTarget as HTMLElement).closest('.timeline-event-wrapper')?.getAttribute('data-event-id');
        if (eventId) {
          getState().toggleCollapse(eventId);
        }
      });
    });

    this.element.querySelectorAll('.timeline-event-card').forEach(card => {
      card.addEventListener('click', (e) => {
        const target = e.target as HTMLElement;
        if (target.closest('[data-action]')) return;
        const eventId = (e.currentTarget as HTMLElement).closest('.timeline-event-wrapper')?.getAttribute('data-event-id');
        if (eventId) {
          getState().selectEvent(eventId);
        }
      });

      card.addEventListener('dblclick', (e) => {
        e.stopPropagation();
        const eventId = (e.currentTarget as HTMLElement).closest('.timeline-event-wrapper')?.getAttribute('data-event-id');
        if (eventId) {
          EventForm.edit(eventId, () => this.render());
        }
      });
    });

    this.element.querySelectorAll('.timeline-event-card').forEach(card => {
      card.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        const eventId = (e.currentTarget as HTMLElement).closest('.timeline-event-wrapper')?.getAttribute('data-event-id');
        if (eventId) {
          const rect = (e.target as HTMLElement).getBoundingClientRect();
          document.dispatchEvent(new CustomEvent('show-symbol-picker', {
            detail: { eventId, rect }
          }));
        }
      });
    });
  }

  /**
   * 初始化事件卡片左右拖拽
   * 在轴线与卡片之间拖拽调整间距
   */
  private initCardDrag(): void {
    const treeEl = this.element.querySelector('#timeline-tree') as HTMLElement;
    if (!treeEl) return;

    // 给所有根级事件卡片添加拖拽手柄
    treeEl.querySelectorAll('.timeline-event-wrapper[data-level="0"]').forEach((wrapper) => {
      const cardContainer = wrapper.querySelector('.timeline-event-card-container') as HTMLElement;
      if (!cardContainer || cardContainer.querySelector('.card-drag-handle')) return;

      const handle = document.createElement('div');
      handle.className = 'card-drag-handle';
      handle.innerHTML = '<div class="card-drag-handle-bar"></div>';
      cardContainer.insertBefore(handle, cardContainer.firstChild);
    });

    // 给所有子事件卡片添加拖拽手柄
    treeEl.querySelectorAll('.timeline-event-card-container-child').forEach((container) => {
      if (container.querySelector('.card-drag-handle-child')) return;

      const handle = document.createElement('div');
      handle.className = 'card-drag-handle card-drag-handle-child';
      handle.innerHTML = '<div class="card-drag-handle-bar"></div>';
      container.insertBefore(handle, container.firstChild);
    });

    // 事件委托处理拖拽
    treeEl.addEventListener('mousedown', (e) => {
      const target = (e.target as HTMLElement).closest('.card-drag-handle');
      if (!target) return;

      e.preventDefault();
      const isChild = target.classList.contains('card-drag-handle-child');
      const startX = e.clientX;
      const startOffset = isChild ? this.getChildOffset(target as HTMLElement) : this.cardOffset;

      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';

      const onMouseMove = (e: MouseEvent) => {
        const dx = e.clientX - startX;
        if (isChild) {
          const newOffset = Math.max(0, Math.min(200, startOffset + dx));
          const parent = (target as HTMLElement).closest('.timeline-event-card-container-child') as HTMLElement;
          if (parent) parent.style.setProperty('--child-offset', newOffset + 'px');
        } else {
          this.cardOffset = Math.max(20, Math.min(400, startOffset + dx));
          treeEl.style.setProperty('--card-offset', this.cardOffset + 'px');
        }
      };

      const onMouseUp = () => {
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        localStorage.setItem('timeline-card-offset', this.cardOffset.toString());
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
      };

      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    });
  }

  private getChildOffset(handle: HTMLElement): number {
    const container = handle.closest('.timeline-event-card-container-child') as HTMLElement;
    if (!container) return 0;
    const val = container.style.getPropertyValue('--child-offset');
    return val ? parseInt(val, 10) : 0;
  }

  destroy(): void {
    this.unsubscribe?.();
    document.removeEventListener('add-child-event', this.addChildHandler);
    document.removeEventListener('show-symbol-picker', this.showSymbolPickerHandler);
  }

  private importData(): void {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = async (event) => {
        try {
          const data = JSON.parse(event.target?.result as string);
          if (data.events && data.rootEventIds !== undefined) {
            const store = getState();
            const eventsMap = new Map(data.events.map((e: any) => [e.id, e]));
            
            store.setState({
              events: eventsMap,
              rootEventIds: data.rootEventIds,
            });

            // 更新角色数据（如果有）
            if (data.characters) {
              const charStore = getCharacterState();
              const charMap = new Map(data.characters.map((c: any) => [c.id, c]));
              charStore.setState({ characters: charMap });
            }

            // 持久化到 localStorage + 服务端
            store.persistData();
            getCharacterState().persistData();
            await importAllToServer({
              story: { events: data.events, rootEventIds: data.rootEventIds },
              characters: data.characters ? { characters: data.characters } : undefined,
            });

            this.render();
            alert('数据导入成功！');
          } else {
            alert('文件格式不正确！');
          }
        } catch (error) {
          alert('文件解析失败！');
        }
      };
      reader.readAsText(file);
    };
    input.click();
  }

  private exportData(): void {
    const store = getState();
    const charStore = getCharacterState();
    store.persistData();
    charStore.persistData();

    const btn = this.element.querySelector('#export-data') as HTMLElement;
    const originalText = btn.textContent;
    btn.textContent = '✓ 已保存';
    btn.style.background = '#10b981';
    setTimeout(() => {
      btn.textContent = originalText;
      btn.style.background = '';
    }, 1500);
  }
}
