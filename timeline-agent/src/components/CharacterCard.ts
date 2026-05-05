import type { Character } from '../types/character';
import { characterStore } from '../stores/characterStore';
import { escapeHtml, escapeAttr } from '../utils';

export class CharacterCard {
  private element: HTMLElement;
  private character: Character;
  private boundClickHandler: (e: Event) => void;

  constructor(character: Character) {
    this.character = character;
    this.element = this.render();
    this.boundClickHandler = this.handleClick.bind(this);
    this.bindEvents();
  }

  private render(): HTMLElement {
    const store = characterStore.getState();
    const isSelected = store.selectedCharacterId === this.character.id;

    const card = document.createElement('div');
    card.className = `character-card ${isSelected ? 'selected' : ''}`;
    card.dataset.characterId = this.character.id;

    card.innerHTML = `
      <div class="character-card-header" style="border-left: 3px solid ${this.character.color}">
        <div class="character-info">
          <span class="character-name">${escapeHtml(this.character.name)}</span>
          <span class="character-meta">${escapeHtml(this.character.gender)}${this.character.age ? ' · ' + escapeHtml(this.character.age) + '岁' : ''}${this.character.height ? ' · ' + escapeHtml(this.character.height) + 'cm' : ''}${this.character.weight ? ' · ' + escapeHtml(this.character.weight) + 'kg' : ''}</span>
          ${this.character.description ? `<span class="character-desc">${escapeHtml(this.character.description)}</span>` : ''}
        </div>
        <div class="character-actions">
          <button class="action-btn" data-action="edit" title="编辑">✎</button>
          <button class="action-btn delete" data-action="delete" title="删除">×</button>
        </div>
      </div>
      ${this.character.traits.length > 0 ? `
        <div class="character-traits">
          ${this.character.traits.map(trait => `<span class="trait-badge">${escapeHtml(trait)}</span>`).join('')}
        </div>
      ` : ''}
    `;

    return card;
  }

  private handleClick(e: Event): void {
    const target = e.target as HTMLElement;

    // 优先处理 action 按钮
    const actionEl = target.closest('[data-action]') as HTMLElement | null;
    const action = actionEl?.dataset.action;

    switch (action) {
      case 'edit':
        e.stopPropagation();
        e.preventDefault();
        document.dispatchEvent(new CustomEvent('edit-character', { detail: this.character.id }));
        return;
      case 'delete':
        e.stopPropagation();
        e.preventDefault();
        if (confirm(`确定删除角色「${this.character.name}」？`)) {
          characterStore.getState().deleteCharacter(this.character.id);
        }
        return;
    }

    // 点击 header 区域（非按钮）= 选中/取消选中
    if (target.closest('.character-card-header') && !target.closest('.character-actions')) {
      characterStore.getState().selectCharacter(
        characterStore.getState().selectedCharacterId === this.character.id ? null : this.character.id
      );
    }
  }

  private bindEvents(): void {
    this.element.addEventListener('click', this.boundClickHandler);
  }

  private unbindEvents(): void {
    this.element.removeEventListener('click', this.boundClickHandler);
  }

  getElement(): HTMLElement {
    return this.element;
  }

  update(character: Character): void {
    this.unbindEvents();
    this.character = character;
    const newElement = this.render();
    this.element.replaceWith(newElement);
    this.element = newElement;
    this.bindEvents();
  }

  destroy(): void {
    this.unbindEvents();
    this.element.remove();
  }
}
