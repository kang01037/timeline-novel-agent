/**
 * JSON 文件数据存储模块
 * 将故事、角色、版本、AI配置等数据持久化到 server/data/ 目录下的 JSON 文件
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.join(__dirname, 'data');

// 确保数据目录存在
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// ============ 通用读写 ============

function readJsonFile(filename) {
  const filePath = path.join(DATA_DIR, filename);
  try {
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf-8');
      return JSON.parse(content);
    }
  } catch (error) {
    console.error(`[DataStore] 读取 ${filename} 失败:`, error.message);
  }
  return null;
}

function writeJsonFile(filename, data) {
  const filePath = path.join(DATA_DIR, filename);
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
    return true;
  } catch (error) {
    console.error(`[DataStore] 写入 ${filename} 失败:`, error.message);
    return false;
  }
}

// ============ Story 数据 ============

export function loadStory() {
  return readJsonFile('story.json');
}

export function saveStory(data) {
  return writeJsonFile('story.json', data);
}

// ============ Characters 数据 ============

export function loadCharacters() {
  return readJsonFile('characters.json');
}

export function saveCharacters(data) {
  return writeJsonFile('characters.json', data);
}

// ============ Versions 数据 ============

export function loadVersions() {
  return readJsonFile('versions.json') || [];
}

export function saveVersions(data) {
  return writeJsonFile('versions.json', data);
}

// ============ AI Config 数据 ============

export function loadAIConfig() {
  return readJsonFile('ai-config.json');
}

export function saveAIConfig(data) {
  return writeJsonFile('ai-config.json', data);
}

// ============ 记忆数据（长期记忆：用户偏好 + 对话摘要） ============

export function loadMemory() {
  return readJsonFile('memory.json') || { preferences: [], summaries: [] };
}

export function saveMemory(data) {
  return writeJsonFile('memory.json', data);
}

// ============ 全量数据（导入/导出） ============

export function loadAllData() {
  return {
    story: loadStory(),
    characters: loadCharacters(),
    versions: loadVersions(),
    aiConfig: loadAIConfig(),
  };
}

export function saveAllData({ story, characters, versions, aiConfig }) {
  let ok = true;
  if (story !== undefined) ok = saveStory(story) && ok;
  if (characters !== undefined) ok = saveCharacters(characters) && ok;
  if (versions !== undefined) ok = saveVersions(versions) && ok;
  if (aiConfig !== undefined) ok = saveAIConfig(aiConfig) && ok;
  return ok;
}
