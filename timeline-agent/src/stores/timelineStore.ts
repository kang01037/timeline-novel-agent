import { createStore } from 'zustand/vanilla';
import { v4 as uuidv4 } from 'uuid';
import type { TimelineEvent, TimelineState } from '../types/timeline';
import { GuideSymbol } from '../types/timeline';
import { saveStoryToStorage, loadStoryFromStorage } from '../utils/persistence';

interface TimelineStore extends TimelineState {
  addEvent: (parentId: string | null, eventData: Partial<TimelineEvent>) => string;
  updateEvent: (id: string, data: Partial<TimelineEvent>) => void;
  deleteEvent: (id: string) => void;
  selectEvent: (id: string | null) => void;
  setEditingEvent: (id: string | null) => void;
  toggleCollapse: (id: string) => void;
  moveEvent: (eventId: string, newParentId: string | null) => void;
  persistData: () => void;
  loadData: () => void;
}

const DEFAULT_COLORS = [
  '#3b82f6', '#10b981', '#f59e0b', '#ef4444',
  '#8b5cf6', '#ec4899', '#06b6d4', '#f97316',
];

function saveToLocalStorage(state: Partial<TimelineState>) {
  saveStoryToStorage({
    events: Array.from(state.events?.entries() || []),
    rootEventIds: state.rootEventIds || [],
  });
}

function loadFromLocalStorage(): Partial<TimelineState> | null {
  const saved = loadStoryFromStorage();
  if (saved) {
    return {
      events: new Map(saved.events || []),
      rootEventIds: saved.rootEventIds || [],
    };
  }
  return null;
}

const initialState = loadFromLocalStorage() || {
  events: new Map(),
  rootEventIds: [],
};

export const timelineStore = createStore<TimelineStore>((set, get) => ({
  events: initialState.events as Map<string, TimelineEvent>,
  rootEventIds: initialState.rootEventIds as string[],
  selectedEventId: null,
  editingEventId: null,

  addEvent: (parentId, eventData) => {
    const id = uuidv4();
    const colorIndex = get().events.size % DEFAULT_COLORS.length;

    const newEvent: TimelineEvent = {
      id,
      title: eventData.title || '新事件',
      description: eventData.description || '',
      datetime: eventData.datetime || new Date().toISOString(),
      parentId,
      children: [],
      symbol: eventData.symbol || GuideSymbol.Arrow,
      color: eventData.color || DEFAULT_COLORS[colorIndex],
      isCollapsed: false,
    };

    set((state) => {
      const events = new Map(state.events);
      events.set(id, newEvent);

      if (parentId) {
        const parent = events.get(parentId);
        if (parent) {
          events.set(parentId, {
            ...parent,
            children: [...parent.children, id],
          });
        }
      }

      return {
        events,
        rootEventIds: parentId
          ? state.rootEventIds
          : [...state.rootEventIds, id],
      };
    });

    get().persistData();
    return id;
  },

  updateEvent: (id, data) => {
    set((state) => {
      const events = new Map(state.events);
      const event = events.get(id);
      if (event) {
        events.set(id, { ...event, ...data });
      }
      return { events };
    });
    get().persistData();
  },

  deleteEvent: (id) => {
    set((state) => {
      const events = new Map(state.events);
      const event = events.get(id);
      if (!event) return state;

      const deleteRecursive = (eventId: string) => {
        const evt = events.get(eventId);
        if (evt) {
          evt.children.forEach(deleteRecursive);
          events.delete(eventId);
        }
      };

      deleteRecursive(id);

      if (event.parentId) {
        const parent = events.get(event.parentId);
        if (parent) {
          events.set(event.parentId, {
            ...parent,
            children: parent.children.filter((cid) => cid !== id),
          });
        }
      }

      return {
        events,
        rootEventIds: state.rootEventIds.filter((rid) => rid !== id),
        selectedEventId: state.selectedEventId === id ? null : state.selectedEventId,
      };
    });
    get().persistData();
  },

  selectEvent: (id) => {
    set({ selectedEventId: id });
  },

  setEditingEvent: (id) => {
    set({ editingEventId: id });
  },

  toggleCollapse: (id) => {
    set((state) => {
      const events = new Map(state.events);
      const event = events.get(id);
      if (event) {
        events.set(id, { ...event, isCollapsed: !event.isCollapsed });
      }
      return { events };
    });
    get().persistData();
  },

  moveEvent: (eventId, newParentId) => {
    set((state) => {
      const events = new Map(state.events);
      const event = events.get(eventId);
      if (!event) return state;

      if (event.parentId) {
        const oldParent = events.get(event.parentId);
        if (oldParent) {
          events.set(event.parentId, {
            ...oldParent,
            children: oldParent.children.filter((cid) => cid !== eventId),
          });
        }
      }

      if (newParentId) {
        const newParent = events.get(newParentId);
        if (newParent) {
          events.set(newParentId, {
            ...newParent,
            children: [...newParent.children, eventId],
          });
        }
      }

      events.set(eventId, { ...event, parentId: newParentId });

      return {
        events,
        rootEventIds: newParentId
          ? state.rootEventIds.filter((rid) => rid !== eventId)
          : [...state.rootEventIds.filter((rid) => rid !== eventId), eventId],
      };
    });
    get().persistData();
  },

  persistData: () => {
    const state = get();
    saveToLocalStorage({
      events: state.events,
      rootEventIds: state.rootEventIds,
    });
  },

  loadData: () => {
    const saved = loadFromLocalStorage();
    if (saved) {
      set({
        events: saved.events as Map<string, TimelineEvent>,
        rootEventIds: saved.rootEventIds as string[],
      });
    }
  },
}));

export const getState = timelineStore.getState;
export const setState = timelineStore.setState;
export const subscribe = timelineStore.subscribe;
