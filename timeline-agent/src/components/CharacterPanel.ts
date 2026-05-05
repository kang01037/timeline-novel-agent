import { getCharacterState, subscribeCharacter } from '../stores/characterStore';
import { CharacterCard } from './CharacterCard';
import { CharacterForm } from './CharacterForm';

export class CharacterPanel {
  private element: HTMLElement;
  private cardMap: Map<string, CharacterCard> = new Map();
  private unsubscribe: (() => void) | null = null;
  private editCharacterHandler: EventListener;
  private searchQuery = '';

  constructor(container: HTMLElement) {
    this.element = container;

    this.editCharacterHandler = ((e: CustomEvent) => {
      CharacterForm.edit(e.detail, () => this.render());
    }) as EventListener;

    this.setupGlobalEvents();
    this.render();
    this.subscribe();
  }

  private setupGlobalEvents(): void {
    document.addEventListener('edit-character', this.editCharacterHandler);
  }

  private subscribe(): void {
    this.unsubscribe = subscribeCharacter(() => {
      this.render();
    });
  }

  private render(): void {
    const store = getCharacterState();

    // 清理旧卡片
    this.cardMap.forEach(card => card.destroy());
    this.cardMap.clear();

    const allCharacters = Array.from(store.characters.values());
    const characters = this.searchQuery
      ? allCharacters.filter(c =>
          c.name.includes(this.searchQuery) ||
          c.description?.includes(this.searchQuery) ||
          c.traits.some(t => t.includes(this.searchQuery))
        )
      : allCharacters;

    this.element.innerHTML = `
      <div class="panel-header">
        <h2>角色列表</h2>
        <div class="panel-actions">
          <span class="character-count">${characters.length} 个角色</span>
          <button class="btn btn-primary btn-small" id="add-character">
            <span>+</span> 添加角色
          </button>
        </div>
      </div>
      <div class="character-search" id="character-search-area">
        <input type="text" id="character-search" placeholder="搜索角色..." value="${this.searchQuery}" />
      </div>
      <div class="character-list" id="character-list"></div>
    `;

    const listContainer = this.element.querySelector('#character-list') as HTMLElement;

    if (characters.length === 0) {
      listContainer.innerHTML = `
        <div class="empty-state-small">
          <p>${this.searchQuery ? '没有找到匹配的角色' : '还没有角色，点击上方按钮添加'}</p>
        </div>
      `;
    } else {
      characters.forEach((character) => {
        const card = new CharacterCard(character);
        this.cardMap.set(character.id, card);
        listContainer.appendChild(card.getElement());
      });
    }

    this.element.querySelector('#add-character')?.addEventListener('click', () => {
      CharacterForm.show(() => this.render());
    });

    // 搜索框事件
    this.element.querySelector('#character-search')?.addEventListener('input', (e) => {
      this.searchQuery = (e.target as HTMLInputElement).value.trim();
      this.render();
    });
  }

  destroy(): void {
    this.unsubscribe?.();
    document.removeEventListener('edit-character', this.editCharacterHandler);
    this.cardMap.forEach(card => card.destroy());
    this.cardMap.clear();
  }
}
