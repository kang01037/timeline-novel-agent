import { createStore } from 'zustand/vanilla';
import { v4 as uuidv4 } from 'uuid';
import type { Character, CharacterState } from '../types/character';
import { saveCharactersToStorage, loadCharactersFromStorage } from '../utils/persistence';

interface CharacterStore extends CharacterState {
  addCharacter: (data: Partial<Character>) => string;
  updateCharacter: (id: string, data: Partial<Character>) => void;
  deleteCharacter: (id: string) => void;
  selectCharacter: (id: string | null) => void;
  setEditingCharacter: (id: string | null) => void;
  addTrait: (characterId: string, trait: string) => void;
  removeTrait: (characterId: string, trait: string) => void;
  linkEvent: (characterId: string, eventId: string) => void;
  unlinkEvent: (characterId: string, eventId: string) => void;
  persistData: () => void;
  loadData: () => void;
}

const DEFAULT_COLORS = [
  '#3b82f6', '#10b981', '#f59e0b', '#ef4444',
  '#8b5cf6', '#ec4899', '#06b6d4', '#f97316',
];

// 从 localStorage 加载初始数据
const savedCharacters = loadCharactersFromStorage();
const initialCharacters = savedCharacters
  ? new Map(savedCharacters.characters)
  : new Map<string, Character>();

export const characterStore = createStore<CharacterStore>((set, get) => ({
  characters: initialCharacters,
  selectedCharacterId: null,
  editingCharacterId: null,

  addCharacter: (data) => {
    const id = uuidv4();
    const colorIndex = get().characters.size % DEFAULT_COLORS.length;

    const newCharacter: Character = {
      id,
      name: data.name || '新角色',
      gender: data.gender || '男',
      age: data.age || '',
      height: data.height || '',
      weight: data.weight || '',
      traits: data.traits || [],
      description: data.description || '',
      relationships: data.relationships || [],
      relatedEventIds: data.relatedEventIds || [],
      color: data.color || DEFAULT_COLORS[colorIndex],
    };

    set((state) => {
      const characters = new Map(state.characters);
      characters.set(id, newCharacter);
      return { characters };
    });

    get().persistData();
    return id;
  },

  updateCharacter: (id, data) => {
    set((state) => {
      const characters = new Map(state.characters);
      const character = characters.get(id);
      if (character) {
        characters.set(id, { ...character, ...data });
      }
      return { characters };
    });
    get().persistData();
  },

  deleteCharacter: (id) => {
    set((state) => {
      const characters = new Map(state.characters);
      characters.delete(id);
      return {
        characters,
        selectedCharacterId: state.selectedCharacterId === id ? null : state.selectedCharacterId,
      };
    });
    get().persistData();
  },

  selectCharacter: (id) => {
    set({ selectedCharacterId: id });
  },

  setEditingCharacter: (id) => {
    set({ editingCharacterId: id });
  },

  addTrait: (characterId, trait) => {
    set((state) => {
      const characters = new Map(state.characters);
      const character = characters.get(characterId);
      if (character && !character.traits.includes(trait)) {
        characters.set(characterId, {
          ...character,
          traits: [...character.traits, trait],
        });
      }
      return { characters };
    });
    get().persistData();
  },

  removeTrait: (characterId, trait) => {
    set((state) => {
      const characters = new Map(state.characters);
      const character = characters.get(characterId);
      if (character) {
        characters.set(characterId, {
          ...character,
          traits: character.traits.filter((t) => t !== trait),
        });
      }
      return { characters };
    });
    get().persistData();
  },

  linkEvent: (characterId, eventId) => {
    set((state) => {
      const characters = new Map(state.characters);
      const character = characters.get(characterId);
      if (character && !character.relatedEventIds.includes(eventId)) {
        characters.set(characterId, {
          ...character,
          relatedEventIds: [...character.relatedEventIds, eventId],
        });
      }
      return { characters };
    });
    get().persistData();
  },

  unlinkEvent: (characterId, eventId) => {
    set((state) => {
      const characters = new Map(state.characters);
      const character = characters.get(characterId);
      if (character) {
        characters.set(characterId, {
          ...character,
          relatedEventIds: character.relatedEventIds.filter((eid) => eid !== eventId),
        });
      }
      return { characters };
    });
    get().persistData();
  },

  persistData: () => {
    const state = get();
    saveCharactersToStorage({
      characters: Array.from(state.characters.entries()),
    });
  },

  loadData: () => {
    const saved = loadCharactersFromStorage();
    if (saved) {
      set({
        characters: new Map(saved.characters),
      });
    }
  },
}));

export const getCharacterState = characterStore.getState;
export const setCharacterState = characterStore.setState;
export const subscribeCharacter = characterStore.subscribe;
