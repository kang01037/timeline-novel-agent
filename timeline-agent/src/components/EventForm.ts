import type { TimelineEvent, GuideSymbolType } from '../types/timeline';
import { GuideSymbol } from '../types/timeline';
import { getState } from '../stores/timelineStore';
import dayjs from 'dayjs';
import { escapeAttr, escapeHtml, renderColorSelector } from '../utils';

export class EventForm {
  private element: HTMLElement;
  private eventId: string | null;
  private parentId: string | null;
  private onSubmit: () => void;

  constructor(eventId: string | null, parentId: string | null, onSubmit: () => void) {
    this.eventId = eventId;
    this.parentId = parentId;
    this.onSubmit = onSubmit;
    this.element = this.render();
    this.bindEvents();
  }

  private render(): HTMLElement {
    const store = getState();
    const event = this.eventId ? store.events.get(this.eventId) ?? null : null;

    const form = document.createElement('div');
    form.className = 'form-overlay';

    form.innerHTML = `
      <div class="event-form-modal">
        <h3>${event ? '编辑事件' : '添加事件'}</h3>
        <div class="form-group">
          <label>事件标题</label>
          <input type="text" id="event-title" value="${escapeAttr(event?.title || '')}" placeholder="输入事件标题" />
        </div>
        <div class="form-group">
          <label>事件描述</label>
          <textarea id="event-desc" placeholder="输入事件描述（可选）">${escapeHtml(event?.description || '')}</textarea>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>发生时间</label>
            <input type="datetime-local" id="event-time" value="${this.getDefaultTime(event)}" />
          </div>
          <div class="form-group">
            <label>引导符号</label>
            <div class="symbol-selector" id="symbol-selector">
              ${Object.values(GuideSymbol).map(symbol => `
                <button class="symbol-option ${symbol === (event?.symbol || GuideSymbol.Arrow) ? 'active' : ''}"
                        data-symbol="${symbol}">
                  ${symbol}
                </button>
              `).join('')}
            </div>
          </div>
        </div>
        <div class="form-group">
          <label>节点颜色</label>
          ${renderColorSelector(event?.color || '#3b82f6')}
        </div>
        <div class="form-actions">
          <button class="btn btn-cancel" id="form-cancel">取消</button>
          <button class="btn btn-submit" id="form-submit">${event ? '保存' : '添加'}</button>
        </div>
      </div>
    `;

    return form;
  }

  private getDefaultTime(event: TimelineEvent | null): string {
    if (event) {
      return dayjs(event.datetime).format('YYYY-MM-DDTHH:mm');
    }
    return dayjs().format('YYYY-MM-DDTHH:mm');
  }

  private bindEvents(): void {
    let selectedSymbol: GuideSymbolType = GuideSymbol.Arrow;
    let selectedColor = '#3b82f6';

    const store = getState();
    const event = this.eventId ? store.events.get(this.eventId) : null;
    if (event) {
      selectedSymbol = event.symbol;
      selectedColor = event.color;
    }

    this.element.querySelectorAll('.symbol-option').forEach(btn => {
      btn.addEventListener('click', (e) => {
        this.element.querySelectorAll('.symbol-option').forEach(b => b.classList.remove('active'));
        (e.target as HTMLElement).classList.add('active');
        selectedSymbol = (e.target as HTMLElement).dataset.symbol as GuideSymbolType;
      });
    });

    this.element.querySelectorAll('.color-option').forEach(btn => {
      btn.addEventListener('click', (e) => {
        this.element.querySelectorAll('.color-option').forEach(b => b.classList.remove('active'));
        (e.target as HTMLElement).classList.add('active');
        selectedColor = (e.target as HTMLElement).dataset.color!;
      });
    });

    this.element.querySelector('#form-cancel')?.addEventListener('click', () => {
      this.close();
    });

    this.element.querySelector('#form-submit')?.addEventListener('click', () => {
      const title = (this.element.querySelector('#event-title') as HTMLInputElement).value;
      const description = (this.element.querySelector('#event-desc') as HTMLTextAreaElement).value;
      const datetime = (this.element.querySelector('#event-time') as HTMLInputElement).value;

      if (!title.trim()) {
        alert('请输入事件标题');
        return;
      }

      if (!datetime) {
        alert('请选择事件时间');
        return;
      }

      const eventData = {
        title: title.trim(),
        description: description.trim(),
        datetime: new Date(datetime).toISOString(),
        symbol: selectedSymbol,
        color: selectedColor,
      };

      if (this.eventId) {
        getState().updateEvent(this.eventId, eventData);
      } else {
        getState().addEvent(this.parentId, eventData);
      }

      this.close();
      this.onSubmit();
    });

    this.element.addEventListener('click', (e) => {
      if (e.target === this.element) {
        this.close();
      }
    });
  }

  private close(): void {
    this.element.remove();
  }

  getElement(): HTMLElement {
    return this.element;
  }

  static show(parentId: string | null, onSubmit: () => void): void {
    const form = new EventForm(null, parentId, onSubmit);
    document.body.appendChild(form.getElement());
    (form.getElement().querySelector('#event-title') as HTMLInputElement)?.focus();
  }

  static edit(eventId: string, onSubmit: () => void): void {
    const form = new EventForm(eventId, null, onSubmit);
    document.body.appendChild(form.getElement());
    (form.getElement().querySelector('#event-title') as HTMLInputElement)?.focus();
  }
}
