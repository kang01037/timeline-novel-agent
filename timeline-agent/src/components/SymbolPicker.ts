import type { GuideSymbolType } from '../types/timeline';
import { GuideSymbol } from '../types/timeline';
import { getState } from '../stores/timelineStore';

export class SymbolPicker {
  private element: HTMLElement;

  constructor(eventId: string, rect: DOMRect) {
    this.element = this.render(eventId, rect);
    this.bindEvents(eventId);
    document.body.appendChild(this.element);
  }

  private render(eventId: string, rect: DOMRect): HTMLElement {
    const store = getState();
    const event = store.events.get(eventId);
    if (!event) return document.createElement('div');

    const picker = document.createElement('div');
    picker.className = 'symbol-picker-popup';
    picker.style.top = `${rect.bottom + 4}px`;
    picker.style.left = `${rect.left}px`;

    picker.innerHTML = `
      <div class="symbol-picker-content">
        ${Object.entries(GuideSymbol).map(([name, symbol]) => `
          <button class="symbol-picker-option ${symbol === event.symbol ? 'active' : ''}"
                  data-symbol="${symbol}" title="${name}">
            ${symbol}
          </button>
        `).join('')}
      </div>
    `;

    return picker;
  }

  private bindEvents(eventId: string): void {
    this.element.querySelectorAll('.symbol-picker-option').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const symbol = (e.target as HTMLElement).dataset.symbol as GuideSymbolType;
        getState().updateEvent(eventId, { symbol });
        this.close();
      });
    });

    setTimeout(() => {
      const closeHandler = (e: MouseEvent) => {
        if (!this.element.contains(e.target as Node)) {
          this.close();
          document.removeEventListener('click', closeHandler);
        }
      };
      document.addEventListener('click', closeHandler);
    }, 10);
  }

  private close(): void {
    this.element.remove();
  }
}
