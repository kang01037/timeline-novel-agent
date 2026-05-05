import type { Character } from '../types/character';
import { characterStore } from '../stores/characterStore';
import { escapeAttr, escapeHtml, TRAIT_SUGGESTIONS, renderColorSelector, GENDER_OPTIONS } from '../utils';

export class CharacterForm {
  private element: HTMLElement;
  private characterId: string | null;
  private onSubmit: () => void;
  private traits: string[] = [];

  constructor(characterId: string | null, onSubmit: () => void) {
    this.characterId = characterId;
    this.onSubmit = onSubmit;
    const store = characterStore.getState();
    const character = characterId ? store.characters.get(characterId) : null;
    this.traits = character ? [...character.traits] : [];
    this.element = this.render();
    this.bindEvents();
  }

  private render(): HTMLElement {
    const store = characterStore.getState();
    const character = this.characterId ? store.characters.get(this.characterId) ?? null : null;

    const form = document.createElement('div');
    form.className = 'form-overlay';

    form.innerHTML = `
      <div class="form-modal character-form-modal">
        <h3>${character ? '编辑角色' : '添加新角色'}</h3>
        
        <div class="form-group">
          <label>角色名称</label>
          <input type="text" id="char-name" value="${escapeAttr(character?.name || '')}" placeholder="输入角色名称" />
        </div>

        <div class="form-row" style="display: flex; gap: 12px;">
          <div class="form-group" style="flex: 0 0 100px;">
            <label>性别</label>
            <select id="char-gender" style="width: 100%; padding: 8px; background: var(--bg-tertiary); border: 1px solid var(--border-color); border-radius: 6px; color: var(--text-primary); font-size: 14px;">
              ${GENDER_OPTIONS.map(opt => `<option value="${opt.value}" ${character?.gender === opt.value ? 'selected' : ''}>${opt.label}</option>`).join('')}
            </select>
          </div>
          <div class="form-group" style="flex: 1;">
            <label>年龄</label>
            <input type="text" id="char-age" value="${escapeAttr(character?.age || '')}" placeholder="如：25" />
          </div>
        </div>

        <div class="form-row" style="display: flex; gap: 12px;">
          <div class="form-group" style="flex: 1;">
            <label>身高 (cm)</label>
            <input type="text" id="char-height" value="${escapeAttr(character?.height || '')}" placeholder="如：175" />
          </div>
          <div class="form-group" style="flex: 1;">
            <label>体重 (kg)</label>
            <input type="text" id="char-weight" value="${escapeAttr(character?.weight || '')}" placeholder="如：65" />
          </div>
        </div>

        <div class="form-group">
          <label>角色描述</label>
          <textarea id="char-desc" placeholder="描述角色的背景故事...">${escapeHtml(character?.description || '')}</textarea>
        </div>

        <div class="form-group">
          <label>性格特点</label>
          <div class="traits-input-row">
            <input type="text" id="trait-input" placeholder="输入性格特点" />
            <button class="btn btn-small" id="add-trait-btn">添加</button>
          </div>
          <div class="traits-suggestions" id="trait-suggestions">
            ${TRAIT_SUGGESTIONS.map(trait => `
              <button class="trait-suggestion ${this.traits.includes(trait) ? 'active' : ''}" 
                      data-trait="${escapeAttr(trait)}">
                ${escapeHtml(trait)}
              </button>
            `).join('')}
          </div>
          <div class="traits-list" id="traits-list">
            ${this.traits.map(trait => `
              <span class="trait-tag">
                ${escapeHtml(trait)}
                <button class="trait-remove" data-trait="${escapeAttr(trait)}">×</button>
              </span>
            `).join('')}
          </div>
        </div>

        <div class="form-group">
          <label>角色颜色</label>
          ${renderColorSelector(character?.color || '#3b82f6')}
        </div>

        <div class="form-actions">
          <button class="btn btn-cancel" id="form-cancel">取消</button>
          <button class="btn btn-submit" id="form-submit">${character ? '保存' : '添加'}</button>
        </div>
      </div>
    `;

    return form;
  }

  private bindEvents(): void {
    let selectedColor = '#3b82f6';

    const store = characterStore.getState();
    const character = this.characterId ? store.characters.get(this.characterId) : null;
    if (character) {
      selectedColor = character.color;
    }

    this.element.querySelectorAll('.color-option').forEach(btn => {
      btn.addEventListener('click', (e) => {
        this.element.querySelectorAll('.color-option').forEach(b => b.classList.remove('active'));
        (e.target as HTMLElement).classList.add('active');
        selectedColor = (e.target as HTMLElement).dataset.color!;
      });
    });

    this.element.querySelectorAll('.trait-suggestion').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const trait = (e.target as HTMLElement).dataset.trait!;
        if (this.traits.includes(trait)) {
          this.traits = this.traits.filter(t => t !== trait);
          (e.target as HTMLElement).classList.remove('active');
        } else {
          this.traits.push(trait);
          (e.target as HTMLElement).classList.add('active');
        }
        this.updateTraitsList();
      });
    });

    this.element.querySelector('#add-trait-btn')?.addEventListener('click', () => {
      const input = this.element.querySelector('#trait-input') as HTMLInputElement;
      const trait = input.value.trim();
      if (trait && !this.traits.includes(trait)) {
        this.traits.push(trait);
        input.value = '';
        this.updateTraitsList();
        this.element.querySelectorAll('.trait-suggestion').forEach(btn => {
          if ((btn as HTMLElement).dataset.trait === trait) {
            btn.classList.add('active');
          }
        });
      }
    });

    this.element.querySelector('#trait-input')?.addEventListener('keypress', (e) => {
      if ((e as KeyboardEvent).key === 'Enter') {
        (this.element.querySelector('#add-trait-btn') as HTMLElement).click();
      }
    });

    this.element.querySelector('#form-cancel')?.addEventListener('click', () => {
      this.close();
    });

    this.element.querySelector('#form-submit')?.addEventListener('click', () => {
      const name = (this.element.querySelector('#char-name') as HTMLInputElement).value;
      const gender = (this.element.querySelector('#char-gender') as HTMLSelectElement).value as '男' | '女' | '其他';
      const age = (this.element.querySelector('#char-age') as HTMLInputElement).value.trim();
      const height = (this.element.querySelector('#char-height') as HTMLInputElement).value.trim();
      const weight = (this.element.querySelector('#char-weight') as HTMLInputElement).value.trim();
      const description = (this.element.querySelector('#char-desc') as HTMLTextAreaElement).value;

      if (!name.trim()) {
        alert('请输入角色名称');
        return;
      }

      const characterData = {
        name: name.trim(),
        gender,
        age,
        height,
        weight,
        description: description.trim(),
        traits: [...this.traits],
        color: selectedColor,
      };

      if (this.characterId) {
        characterStore.getState().updateCharacter(this.characterId, characterData);
      } else {
        characterStore.getState().addCharacter(characterData);
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

  private updateTraitsList(): void {
    const container = this.element.querySelector('#traits-list');
    if (container) {
      container.innerHTML = this.traits.map(trait => `
        <span class="trait-tag">
          ${escapeHtml(trait)}
          <button class="trait-remove" data-trait="${escapeAttr(trait)}">×</button>
        </span>
      `).join('');

      container.querySelectorAll('.trait-remove').forEach(btn => {
        btn.addEventListener('click', (e) => {
          const trait = (e.target as HTMLElement).dataset.trait!;
          this.traits = this.traits.filter(t => t !== trait);
          this.updateTraitsList();
          this.element.querySelectorAll('.trait-suggestion').forEach(sBtn => {
            if ((sBtn as HTMLElement).dataset.trait === trait) {
              sBtn.classList.remove('active');
            }
          });
        });
      });
    }
  }

  private close(): void {
    this.element.remove();
  }

  getElement(): HTMLElement {
    return this.element;
  }

  static show(onSubmit: () => void): void {
    const form = new CharacterForm(null, onSubmit);
    document.body.appendChild(form.getElement());
    (form.getElement().querySelector('#char-name') as HTMLInputElement)?.focus();
  }

  static edit(characterId: string, onSubmit: () => void): void {
    const form = new CharacterForm(characterId, onSubmit);
    document.body.appendChild(form.getElement());
    (form.getElement().querySelector('#char-name') as HTMLInputElement)?.focus();
  }
}
