/**
 * Timeline Agent 后端服务
 * 提供小说创作 AI Agent 的 REST API 和 SSE 流式输出
 * 支持数据持久化到 JSON 文件
 */

import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';

// 加载 server/.env（无论从哪个目录启动都能正确找到）
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '.env') });

import express from 'express';
import cors from 'cors';
import OpenAI from 'openai';
import { buildNovelContext } from './contextBuilder.js';
import { getSystemPrompt, buildChapterPrompt, buildConsistencyCheckPrompt } from './promptTemplates.js';
import { runAgentLoop, resolveToolConfirm } from './agentLoop.js';
import {
  loadStory, saveStory,
  loadCharacters, saveCharacters,
  loadVersions, saveVersions,
  loadAIConfig, saveAIConfig,
  loadMemory, saveMemory,
  loadAllData, saveAllData,
} from './dataStore.js';

const app = express();
const PORT = process.env.PORT || 3001;

// ============ 中间件 ============
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// ============ AI 客户端（可动态重建） ============
let openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || 'sk-placeholder',
  baseURL: process.env.OPENAI_BASE_URL || 'https://dashscope.aliyuncs.com/compatible-mode/v1',
});

let currentModel = process.env.AI_MODEL || 'qwen-plus';

// 启动时从文件加载 AI 配置（环境变量优先）
const savedAIConfig = loadAIConfig();
if (savedAIConfig) {
  if (!process.env.OPENAI_API_KEY && savedAIConfig.apiKey) {
    openai = new OpenAI({
      apiKey: savedAIConfig.apiKey,
      baseURL: savedAIConfig.baseUrl || process.env.OPENAI_BASE_URL,
    });
  }
  if (!process.env.AI_MODEL && savedAIConfig.model) {
    currentModel = savedAIConfig.model;
  }
}

// ============ 数据存储（内存缓存 + 文件持久化） ============
let currentStoryData = loadStory();
let currentCharacterData = loadCharacters();

// ============ API 路由 ============

/**
 * 健康检查
 */
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', model: currentModel });
});

/**
 * 接收前端 AI 配置（动态更新运行时配置 + 持久化）
 */
app.post('/api/config', (req, res) => {
  const { apiKey, baseUrl, model } = req.body;

  const newApiKey = apiKey || openai.apiKey;
  const newBaseUrl = baseUrl || openai.baseURL;

  if (apiKey || baseUrl) {
    openai = new OpenAI({
      apiKey: newApiKey,
      baseURL: newBaseUrl,
    });
    console.log(`[Agent] API 配置已更新, BaseURL: ${newBaseUrl}`);
  }
  if (model) {
    currentModel = model;
    console.log(`[Agent] 模型已更新: ${model}`);
  }

  // 持久化 AI 配置到文件
  saveAIConfig({ apiKey: newApiKey, baseUrl: newBaseUrl, model: currentModel });

  res.json({ success: true });
});

/**
 * 获取 AI 配置（前端启动时加载）
 */
app.get('/api/config', (req, res) => {
  const config = loadAIConfig();
  // 不返回完整 apiKey，只返回是否已配置
  res.json({
    ...(config || {}),
    apiKeyConfigured: !!(config?.apiKey || process.env.OPENAI_API_KEY),
    apiKey: '', // 安全：不返回 apiKey 到前端
  });
});

/**
 * 更新故事数据（内存 + 文件持久化）
 */
app.post('/api/story', (req, res) => {
  currentStoryData = req.body;
  saveStory(currentStoryData);
  console.log(`[Agent] 故事数据已更新并持久化，事件数: ${req.body?.events?.length || 0}`);
  res.json({ success: true });
});

/**
 * 获取故事数据
 */
app.get('/api/story', (req, res) => {
  res.json(currentStoryData || loadStory());
});

/**
 * 更新角色数据（内存 + 文件持久化）
 */
app.post('/api/characters', (req, res) => {
  currentCharacterData = req.body;
  saveCharacters(currentCharacterData);
  console.log(`[Agent] 角色数据已更新并持久化，角色数: ${req.body?.characters?.length || 0}`);
  res.json({ success: true });
});

/**
 * 获取角色数据
 */
app.get('/api/characters', (req, res) => {
  res.json(currentCharacterData || loadCharacters());
});

/**
 * 批量同步数据（故事 + 角色，内存 + 文件持久化）
 */
app.post('/api/sync', (req, res) => {
  const { story, characters } = req.body;
  currentStoryData = story;
  currentCharacterData = characters;
  saveStory(story);
  saveCharacters(characters);
  console.log(`[Agent] 数据已同步并持久化，事件: ${story?.events?.length || 0}, 角色: ${characters?.characters?.length || 0}`);
  res.json({ success: true });
});

/**
 * 获取全量数据（前端启动时加载）
 */
app.get('/api/data', (req, res) => {
  const story = currentStoryData || loadStory();
  const characters = currentCharacterData || loadCharacters();
  const versions = loadVersions();
  res.json({ story, characters, versions });
});

/**
 * 版本记录 - 获取
 */
app.get('/api/versions', (req, res) => {
  res.json(loadVersions());
});

/**
 * 版本记录 - 保存
 */
app.post('/api/versions', (req, res) => {
  const ok = saveVersions(req.body);
  res.json({ success: ok });
});

/**
 * 全量导入数据
 */
app.post('/api/data/import', (req, res) => {
  const { story, characters, versions, aiConfig } = req.body;
  const ok = saveAllData({ story, characters, versions, aiConfig });

  // 更新内存缓存
  if (story) currentStoryData = story;
  if (characters) currentCharacterData = characters;
  if (aiConfig) {
    saveAIConfig(aiConfig);
    // 更新运行时 AI 配置
    if (aiConfig.apiKey || aiConfig.baseUrl) {
      openai = new OpenAI({
        apiKey: aiConfig.apiKey || openai.apiKey,
        baseURL: aiConfig.baseUrl || openai.baseURL,
      });
    }
    if (aiConfig.model) currentModel = aiConfig.model;
  }

  console.log(`[Agent] 数据已全量导入`);
  res.json({ success: ok });
});

/**
 * 生成章节内容（流式 SSE 输出）
 */
app.post('/api/generate/chapter', async (req, res) => {
  const { userRequest, chapterInfo, story, characters } = req.body;

  const storyData = story || currentStoryData;
  const charData = characters || currentCharacterData;

  if (!storyData && !charData) {
    return res.status(400).json({ error: '缺少故事或角色数据，请先同步数据' });
  }

  if (!userRequest) {
    return res.status(400).json({ error: '缺少创作要求' });
  }

  const context = buildNovelContext(storyData, charData);
  const systemPrompt = getSystemPrompt();
  const userPrompt = buildChapterPrompt(context, userRequest, chapterInfo);

  console.log(`[Agent] 开始生成章节，模型: ${currentModel}`);

  if (!openai.apiKey || openai.apiKey === 'sk-placeholder') {
    res.write(`data: ${JSON.stringify({ type: 'error', error: 'API Key 未配置，请点击 ⚙ 按钮或在 server/.env 中设置 OPENAI_API_KEY' })}\n\n`);
    res.end();
    return;
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');

  try {
    const stream = await openai.chat.completions.create({
      model: currentModel,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      stream: true,
      temperature: 0.8,
      max_tokens: 4000,
    });

    let fullContent = '';

    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content || '';
      if (content) {
        fullContent += content;
        res.write(`data: ${JSON.stringify({ type: 'content', content })}\n\n`);
      }
    }

    res.write(`data: ${JSON.stringify({ type: 'done', fullContent })}\n\n`);
    res.end();
    console.log(`[Agent] 章节生成完成，长度: ${fullContent.length}`);
  } catch (error) {
    console.error('[Agent] 生成失败:', error);
    const errMsg = error.status ? `API 错误 (${error.status}): ${error.message}` : error.message;
    res.write(`data: ${JSON.stringify({ type: 'error', error: errMsg })}\n\n`);
    res.end();
  }
});

/**
 * 生成章节内容（非流式，用于降级）
 */
app.post('/api/generate/chapter-sync', async (req, res) => {
  const { userRequest, chapterInfo, story, characters } = req.body;

  if (!openai.apiKey || openai.apiKey === 'sk-placeholder') {
    return res.status(400).json({ error: 'API Key 未配置，请点击 ⚙ 按钮或在 server/.env 中设置 OPENAI_API_KEY' });
  }

  const storyData = story || currentStoryData;
  const charData = characters || currentCharacterData;

  if (!storyData && !charData) {
    return res.status(400).json({ error: '缺少故事或角色数据' });
  }

  if (!userRequest) {
    return res.status(400).json({ error: '缺少创作要求' });
  }

  const context = buildNovelContext(storyData, charData);
  const systemPrompt = getSystemPrompt();
  const userPrompt = buildChapterPrompt(context, userRequest, chapterInfo);

  try {
    const completion = await openai.chat.completions.create({
      model: currentModel,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.8,
      max_tokens: 4000,
    });

    const content = completion.choices[0]?.message?.content || '';
    res.json({ success: true, content });
  } catch (error) {
    console.error('[Agent] 生成失败:', error);
    const errMsg = error.status ? `API 错误 (${error.status}): ${error.message}` : error.message;
    res.status(500).json({ error: errMsg });
  }
});

/**
 * 人设一致性检查
 */
app.post('/api/check-consistency', async (req, res) => {
  const { content, story, characters } = req.body;

  if (!openai.apiKey || openai.apiKey === 'sk-placeholder') {
    return res.status(400).json({ error: 'API Key 未配置，请点击 ⚙ 按钮或在 server/.env 中设置 OPENAI_API_KEY' });
  }

  const storyData = story || currentStoryData;
  const charData = characters || currentCharacterData;

  if (!content) {
    return res.status(400).json({ error: '缺少待检查的内容' });
  }

  const context = buildNovelContext(storyData, charData);
  const prompt = buildConsistencyCheckPrompt(context, content);

  try {
    const completion = await openai.chat.completions.create({
      model: currentModel,
      messages: [
        { role: 'system', content: '你是一位小说编辑，负责检查创作内容与角色设定的一致性。请严格按照JSON格式返回检查结果。' },
        { role: 'user', content: prompt },
      ],
      temperature: 0.3,
      max_tokens: 2000,
    });

    const result = completion.choices[0]?.message?.content || '';

    let checkResult;
    try {
      const jsonMatch = result.match(/```json\n([\s\S]*?)\n```/);
      if (jsonMatch) {
        checkResult = JSON.parse(jsonMatch[1]);
      } else {
        checkResult = JSON.parse(result);
      }
    } catch {
      checkResult = { consistent: true, issues: [], raw: result };
    }

    res.json({ success: true, result: checkResult });
  } catch (error) {
    console.error('[Agent] 一致性检查失败:', error);
    const errMsg = error.status ? `API 错误 (${error.status}): ${error.message}` : error.message;
    res.status(500).json({ error: errMsg });
  }
});

// ============ 启动服务 ============

/**
 * 获取长期记忆
 */
app.get('/api/memory', (req, res) => {
  res.json(loadMemory());
});

/**
 * 更新长期记忆（添加偏好、清除摘要等）
 */
app.post('/api/memory', (req, res) => {
  const memory = loadMemory();
  const { addPreference, clearSummaries } = req.body;

  if (addPreference) {
    memory.preferences = memory.preferences || [];
    memory.preferences.push(addPreference);
    // 去重
    memory.preferences = [...new Set(memory.preferences)];
    // 最多保留20条
    if (memory.preferences.length > 20) {
      memory.preferences = memory.preferences.slice(-20);
    }
  }

  if (clearSummaries) {
    memory.summaries = [];
  }

  saveMemory(memory);
  res.json({ success: true, memory });
});

/**
 * Agent 工具确认（前端弹窗确认/拒绝后回调）
 */
app.post('/api/agent/confirm', (req, res) => {
  const { confirmId, approved } = req.body;
  const found = resolveToolConfirm(confirmId, approved);
  res.json({ success: found });
});

/**
 * Agent 对话（SSE 流式，支持 Function Calling + ReAct 循环）
 */
app.post('/api/agent/chat', async (req, res) => {
  const { message, story, characters } = req.body;

  if (!message) {
    return res.status(400).json({ error: '缺少消息内容' });
  }

  if (!openai.apiKey || openai.apiKey === 'sk-placeholder') {
    return res.status(400).json({ error: 'API Key 未配置，请点击 ⚙ 按钮或在 server/.env 中设置 OPENAI_API_KEY' });
  }

  const storyData = story || currentStoryData;
  const charData = characters || currentCharacterData;

  // 设置 SSE 响应头
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');

  // SSE 发送函数
  const sendSSE = (event) => {
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  };

  console.log(`[Agent] 开始 Agent 对话，模型: ${currentModel}`);

  // 数据更新回调：同步全局缓存，确保 GET /api/story 等端点能读到最新数据
  const onDataUpdate = (type, data) => {
    if (type === 'story') {
      currentStoryData = data;
    } else if (type === 'characters') {
      currentCharacterData = data;
    }
  };

  try {
    await runAgentLoop(openai, currentModel, message, storyData, charData, sendSSE, onDataUpdate);
  } catch (error) {
    console.error('[Agent] 对话失败:', error);
    sendSSE({ type: 'error', error: error.message || 'Agent 运行失败' });
  }

  res.end();
});

app.listen(PORT, () => {
  console.log(`\n🤖 Timeline Agent Server running at http://localhost:${PORT}`);
  console.log(`   Model: ${currentModel}`);
  console.log(`   API Base: ${process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1'}`);
  console.log(`   Data Dir: ${path.join(__dirname, 'data')}`);
  console.log(`\n   Endpoints:`);
  console.log(`   GET  /api/data                - 获取全量数据`);
  console.log(`   POST /api/sync                - 同步故事和角色数据`);
  console.log(`   POST /api/story               - 更新故事数据`);
  console.log(`   GET  /api/story               - 获取故事数据`);
  console.log(`   POST /api/characters          - 更新角色数据`);
  console.log(`   GET  /api/characters          - 获取角色数据`);
  console.log(`   POST /api/config              - 更新AI配置`);
  console.log(`   GET  /api/config              - 获取AI配置`);
  console.log(`   GET  /api/versions            - 获取版本记录`);
  console.log(`   POST /api/versions            - 保存版本记录`);
  console.log(`   POST /api/data/import         - 全量导入数据`);
  console.log(`   POST /api/generate/chapter    - 生成章节（SSE流式）`);
  console.log(`   POST /api/generate/chapter-sync - 生成章节（同步）`);
  console.log(`   POST /api/check-consistency   - 人设一致性检查`);
  console.log(`   POST /api/agent/chat          - Agent对话（Function Calling）`);
  console.log(`   GET  /api/health              - 健康检查\n`);
});
