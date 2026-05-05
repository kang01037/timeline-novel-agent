/**
 * 统一数据持久化工具
 * 双写策略：localStorage（快速本地缓存）+ 服务端 JSON 文件（持久化）
 * 启动时从服务端加载，变更时双写
 */

export interface StoryData {
  events: [string, any][];
  rootEventIds: string[];
}

export interface CharactersData {
  characters: [string, any][];
}

export interface VersionData {
  id: string;
  content: string;
  timestamp: number;
  userRequest: string;
  adopted: boolean;
}

export interface AppData {
  events: [string, any][];
  rootEventIds: string[];
  characters: [string, any][];
}

const STORY_STORAGE_KEY = 'timeline-agent-story';
const CHARACTERS_STORAGE_KEY = 'timeline-agent-characters';
const VERSION_STORAGE_KEY = 'timeline-agent-versions';

// ============ 服务端同步标记 ============

let serverAvailable = true;

async function syncToServer(endpoint: string, data: any): Promise<void> {
  if (!serverAvailable) return;
  try {
    const res = await fetch(`/api/${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      console.warn(`[Persistence] 同步到服务端 ${endpoint} 失败: ${res.status}`);
    }
  } catch (error) {
    console.warn('[Persistence] 服务端不可用，降级为 localStorage 模式');
    serverAvailable = false;
  }
}

// ============ Story 数据 ============

export function saveStoryToStorage(data: StoryData): void {
  // 1. 先写 localStorage（同步，快速）
  try {
    localStorage.setItem(STORY_STORAGE_KEY, JSON.stringify(data));
  } catch (error) {
    console.error('保存故事数据到 localStorage 失败:', error);
  }
  // 2. 异步写服务端
  syncToServer('story', data);
}

export function loadStoryFromStorage(): StoryData | null {
  try {
    const saved = localStorage.getItem(STORY_STORAGE_KEY);
    if (saved) {
      return JSON.parse(saved);
    }
  } catch (error) {
    console.error('加载故事数据失败:', error);
  }
  return null;
}

// ============ Characters 数据 ============

export function saveCharactersToStorage(data: CharactersData): void {
  try {
    localStorage.setItem(CHARACTERS_STORAGE_KEY, JSON.stringify(data));
  } catch (error) {
    console.error('保存角色数据到 localStorage 失败:', error);
  }
  syncToServer('characters', data);
}

export function loadCharactersFromStorage(): CharactersData | null {
  try {
    const saved = localStorage.getItem(CHARACTERS_STORAGE_KEY);
    if (saved) {
      return JSON.parse(saved);
    }
  } catch (error) {
    console.error('加载角色数据失败:', error);
  }
  return null;
}

// ============ Versions 数据 ============

export function saveVersionsToStorage(data: VersionData[]): void {
  try {
    localStorage.setItem(VERSION_STORAGE_KEY, JSON.stringify(data));
  } catch (error) {
    console.error('保存版本记录到 localStorage 失败:', error);
  }
  syncToServer('versions', data);
}

export function loadVersionsFromStorage(): VersionData[] | null {
  try {
    const saved = localStorage.getItem(VERSION_STORAGE_KEY);
    if (saved) {
      return JSON.parse(saved);
    }
  } catch (error) {
    console.error('加载版本记录失败:', error);
  }
  return null;
}

// ============ 从服务端加载全量数据（启动时调用） ============

export async function loadAllFromServer(): Promise<{
  story: StoryData | null;
  characters: CharactersData | null;
  versions: VersionData[] | null;
} | null> {
  try {
    const res = await fetch('/api/data');
    if (!res.ok) return null;
    const data = await res.json();
    serverAvailable = true;
    return {
      story: data.story || null,
      characters: data.characters || null,
      versions: data.versions || null,
    };
  } catch (error) {
    console.warn('[Persistence] 从服务端加载数据失败，使用 localStorage:', error);
    serverAvailable = false;
    return null;
  }
}

// ============ 全量导入到服务端 ============

export async function importAllToServer(data: {
  story?: any;
  characters?: any;
  versions?: any;
  aiConfig?: any;
}): Promise<boolean> {
  try {
    const res = await fetch('/api/data/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return res.ok;
  } catch (error) {
    console.warn('[Persistence] 导入数据到服务端失败:', error);
    return false;
  }
}

// ============ 统一导出 ============

export function exportAllData(events: Map<any, any>, rootEventIds: string[], characters: Map<any, any>): AppData {
  return {
    events: Array.from(events.entries()),
    rootEventIds,
    characters: Array.from(characters.entries()),
  };
}

export function downloadJsonFile(data: object, filename: string = 'timeline-data.json'): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function readJsonFile(): Promise<any> {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) {
        reject(new Error('未选择文件'));
        return;
      }
      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const data = JSON.parse(event.target?.result as string);
          resolve(data);
        } catch (error) {
          reject(new Error('文件解析失败'));
        }
      };
      reader.onerror = () => reject(new Error('文件读取失败'));
      reader.readAsText(file);
    };
    input.click();
  });
}
