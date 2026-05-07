/**
 * Agent ReAct 推理循环
 * 实现 思考 → 工具调用 → 观察结果 → 再思考 的循环
 * 通过 SSE 实时推送每一步的进度到前端
 * 支持危险操作确认：修改类工具需要前端用户确认后才执行
 */

import { toolDefinitions, executeTool } from './tools.js';
import { getSystemPrompt } from './promptTemplates.js';
import { buildNovelContext } from './contextBuilder.js';
import { loadMemory, saveMemory } from './dataStore.js';

const MAX_ITERATIONS = 15; // 最大推理轮数

// 需要前端确认的危险操作
const DANGEROUS_TOOLS = new Set(['update_character', 'update_event']);

// 待确认的工具调用映射：confirmId -> { resolve, reject }
const pendingConfirms = new Map();

/**
 * 解析待确认的工具调用（供 /api/agent/confirm 端点调用）
 */
export function resolveToolConfirm(confirmId, approved) {
  const pending = pendingConfirms.get(confirmId);
  if (pending) {
    pendingConfirms.delete(confirmId);
    pending.resolve(approved);
    return true;
  }
  return false;
}

/**
 * Agent 系统提示词
 */
function getAgentSystemPrompt(context, memory = { preferences: [], summaries: [] }) {
  return `你是一位专业的小说剧情大纲 Agent 助手。你的核心职责是：**提供剧情大纲，分析剧情后自主添加故事时间线事件和角色**。

## 你的定位

你是一个**剧情大纲架构师**，不是长文写手：
- ✅ 提供**简短的剧情大纲**（几十到一两百字的要点概括）
- ✅ 分析用户提出的剧情方向，**自主**将关键情节添加到故事时间线
- ✅ 分析剧情中涉及的角色，**自主**将新角色添加到角色列表
- ✅ 为用户提供剧情建议、冲突设计、结构优化
- ❌ **绝对不要**主动生成几千字的长文段落、章节内容、详细场景描写
- ❌ **绝对不要**主动调用 generate_chapter 工具

只有当用户**明确要求**细写某个事件或章节的详细内容时，你才可以使用 generate_chapter 工具。

## 你的能力

你可以使用以下工具来完成任务：
- **get_characters** / **get_character**: 查询角色信息
- **get_events**: 查询故事线事件
- **add_character** / **update_character**: 创建或修改角色（描述保持简短）
- **add_event** / **update_event**: 添加或修改故事事件（描述保持简短大纲式）
- **generate_chapter**: ⚠️ 仅在用户明确要求细写时才使用。调用后内容会自动展示给用户，你只需简要说明即可
- **check_consistency**: 检查内容与设定的一致性

## 工作方式（自动规划）

收到用户任务后，你必须**先规划后执行**：

### 第一步：生成执行计划
先查询当前数据（get_characters、get_events），然后给出执行计划，格式如下：

📋 **执行计划：**
1. [操作类型] 具体内容
2. [操作类型] 具体内容
...

示例：
📋 **执行计划：**
1. [添加角色] 林风 — 冷酷剑客，24岁
2. [添加事件] 林风发现密室线索 — 第三章
3. [添加事件] 林风与暗卫对峙 — 第三章子事件

**注意**：给出计划后立即开始执行，不需要等待用户确认（用户随时可以通过拒绝修改操作来干预）。

### 第二步：逐步执行
按照计划依次调用工具，每个工具调用间等待结果。

### 第三步：汇报结果
完成后给出简洁的总结。

## 重要原则

- 每次只调用一个工具，等结果出来再决定下一步
- 添加事件时，描述用**简短大纲式**（如"主角发现密室中的线索"），不要写成长段落
- 添加角色时，描述保持**简洁**（如"冷静果断的侦探"），不要写人物小传
- 如果发现设定冲突，主动提出修改建议
- 不要编造不存在的角色或事件
- 除非用户明确要求，否则**不要调用 generate_chapter**
- 调用 generate_chapter 后，章节内容会自动展示给用户，你不需要重复输出内容，只需简要总结即可
- 回复使用中文

## 当前故事概况

${context || '暂无故事数据'}

## 长期记忆

### 用户偏好
${memory.preferences.length > 0 ? memory.preferences.map((p, i) => `${i + 1}. ${p}`).join('\n') : '暂无记录'}

### 对话摘要（最近5条）
${memory.summaries.slice(-5).map((s, i) => `${i + 1}. [${s.time}] ${s.summary}`).join('\n') || '暂无记录'}

**请参考用户偏好来调整你的回答风格和内容方向。**`;
}

/**
 * 运行 Agent ReAct 循环
 * @param {object} openai - OpenAI 客户端
 * @param {string} model - 模型名称
 * @param {string} userMessage - 用户消息
 * @param {object} storyData - 故事数据
 * @param {object} characterData - 角色数据
 * @param {function} sendSSE - SSE 发送函数: (event) => void
 */
/**
 * 运行 Agent ReAct 循环
 * @param {object} openai - OpenAI 客户端
 * @param {string} model - 模型名称
 * @param {string} userMessage - 用户消息
 * @param {object} storyData - 故事数据
 * @param {object} characterData - 角色数据
 * @param {function} sendSSE - SSE 发送函数: (event) => void
 * @param {function} onDataUpdate - 数据更新回调: (type, data) => void
 */
export async function runAgentLoop(openai, model, userMessage, storyData, characterData, sendSSE, onDataUpdate) {
  const novelContext = buildNovelContext(storyData, characterData);
  const memory = loadMemory();
  const systemPrompt = getAgentSystemPrompt(novelContext, memory);

  const context = {
    openai,
    currentModel: model,
    currentStoryData: storyData,
    currentCharacterData: characterData,
  };

  // 初始化消息
  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userMessage },
  ];

  // 推送开始信号
  sendSSE({ type: 'agent_start', message: userMessage });

  for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
    sendSSE({ type: 'thinking', step: iteration + 1, message: '正在思考...' });

    try {
      // 使用流式调用，让思考过程和内容可以逐步推送
      const stream = await openai.chat.completions.create({
        model,
        messages,
        tools: toolDefinitions,
        tool_choice: 'auto',
        temperature: 0.7,
        max_tokens: 4000,
        stream: true,
        stream_options: { include_usage: true },
      });

      // 逐步收集流式响应
      let assistantContent = '';
      let toolCalls = []; // { id, name, arguments }
      let currentToolCallIndex = -1;

      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta;
        if (!delta) continue;

        // 流式推送文本内容
        if (delta.content) {
          assistantContent += delta.content;
          sendSSE({ type: 'content', content: delta.content });
        }

        // 收集工具调用
        if (delta.tool_calls) {
          for (const tc of delta.tool_calls) {
            const idx = tc.index;
            if (idx === undefined) continue;

            if (!toolCalls[idx]) {
              toolCalls[idx] = { id: tc.id || '', name: '', arguments: '' };
            }
            if (tc.id) toolCalls[idx].id = tc.id;
            if (tc.function?.name) toolCalls[idx].name = tc.function.name;
            if (tc.function?.arguments) toolCalls[idx].arguments += tc.function.arguments;
          }
        }
      }

      // 构建完整的 assistant message 用于消息历史
      const assistantMessage = {
        role: 'assistant',
        content: assistantContent || null,
        tool_calls: toolCalls.length > 0
          ? toolCalls.map(tc => ({
              id: tc.id,
              type: 'function',
              function: { name: tc.name, arguments: tc.arguments },
            }))
          : undefined,
      };

      // 将助手回复加入消息历史
      messages.push(assistantMessage);

      // 如果没有工具调用，说明 Agent 给出了最终回答
      if (toolCalls.length === 0) {
        // 保存对话摘要到长期记忆
        saveConversationMemory(memory, userMessage, assistantContent);
        sendSSE({ type: 'agent_done', iterations: iteration + 1 });
        return;
      }

      // 处理工具调用
      for (const toolCall of toolCalls) {
        const toolName = toolCall.name;
        let toolArgs;

        try {
          toolArgs = JSON.parse(toolCall.arguments);
        } catch (e) {
          toolArgs = {};
        }

        // 推送工具调用步骤
        sendSSE({
          type: 'tool_call',
          tool: toolName,
          args: toolArgs,
          step: iteration + 1,
        });

        // 危险操作需要前端确认
        if (DANGEROUS_TOOLS.has(toolName)) {
          const confirmId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
          sendSSE({
            type: 'tool_confirm',
            confirmId,
            tool: toolName,
            args: toolArgs,
            step: iteration + 1,
          });

          // 等待前端确认（30秒超时自动通过）
          const approved = await new Promise((resolve) => {
            pendingConfirms.set(confirmId, { resolve });
            setTimeout(() => {
              if (pendingConfirms.has(confirmId)) {
                pendingConfirms.delete(confirmId);
                resolve(true); // 超时默认通过
              }
            }, 30000);
          });

          if (!approved) {
            const skipMsg = `用户拒绝了「${toolName}」操作`;
            sendSSE({
              type: 'tool_result',
              tool: toolName,
              result: { skipped: true, message: skipMsg },
              duration: 0,
              step: iteration + 1,
            });
            messages.push({
              role: 'tool',
              tool_call_id: toolCall.id,
              content: JSON.stringify({ skipped: true, message: skipMsg }),
            });
            continue;
          }
        }

        // 执行工具
        const startTime = Date.now();
        let result;
        try {
          result = await executeTool(toolName, toolArgs, context);

          // 如果工具修改了数据，更新 context 中的内存缓存并通知全局
          if (['add_character', 'update_character'].includes(toolName)) {
            // 重新从工具已修改的 characterData 构建最新数据
            const freshCharData = { characters: context.currentCharacterData?.characters || [] };
            context.currentCharacterData = freshCharData;
            if (onDataUpdate) onDataUpdate('characters', freshCharData);
          }
          if (['add_event', 'update_event'].includes(toolName)) {
            const freshStoryData = { events: context.currentStoryData?.events || [], rootEventIds: context.currentStoryData?.rootEventIds || [] };
            context.currentStoryData = freshStoryData;
            if (onDataUpdate) onDataUpdate('story', freshStoryData);
          }
        } catch (error) {
          result = JSON.stringify({ error: `工具执行失败: ${error.message}` });
        }

        const duration = Date.now() - startTime;

        // 推送工具结果
        let parsedResult;
        try {
          parsedResult = JSON.parse(result);
        } catch {
          parsedResult = { raw: result };
        }

        // generate_chapter 特殊处理：内容直接推送给用户，不经过 LLM
        if (toolName === 'generate_chapter' && parsedResult.success && parsedResult.content) {
          const chapterContent = parsedResult.content;
          // 直接将章节内容通过 SSE 推送给前端展示
          sendSSE({
            type: 'chapter_content',
            content: chapterContent,
            chapterTitle: toolArgs.chapterTitle || '',
            length: chapterContent.length,
          });
          // 工具结果只保留摘要，避免大量内容回传 LLM
          parsedResult = {
            success: true,
            message: `章节内容已直接展示给用户，共 ${chapterContent.length} 字`,
            length: chapterContent.length,
          };
        }

        sendSSE({
          type: 'tool_result',
          tool: toolName,
          result: parsedResult,
          duration,
          step: iteration + 1,
        });

        // 将工具结果加入消息历史
        messages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: JSON.stringify(parsedResult),
        });
      }
    } catch (error) {
      console.error('[Agent] 推理循环错误:', error);
      const errMsg = error.status ? `API 错误 (${error.status}): ${error.message}` : error.message;
      sendSSE({ type: 'error', error: errMsg });
      return;
    }
  }

  // 达到最大轮数
  sendSSE({ type: 'content', content: '⚠️ 已达到最大推理轮数，任务可能未完全完成。' });
  sendSSE({ type: 'agent_done', iterations: MAX_ITERATIONS });
}

/**
 * 保存对话摘要到长期记忆
 */
function saveConversationMemory(memory, userMessage, assistantContent) {
  try {
    // 生成摘要（截取前100字）
    const summary = assistantContent
      ? assistantContent.substring(0, 100).replace(/\n/g, ' ')
      : '(无回复内容)';

    memory.summaries.push({
      time: new Date().toLocaleString('zh-CN'),
      userMessage: userMessage.substring(0, 80),
      summary,
    });

    // 只保留最近20条摘要
    if (memory.summaries.length > 20) {
      memory.summaries = memory.summaries.slice(-20);
    }

    saveMemory(memory);
  } catch (e) {
    console.error('[Agent] 保存记忆失败:', e.message);
  }
}
