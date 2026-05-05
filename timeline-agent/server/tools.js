/**
 * Agent 工具定义与执行器
 * 定义所有可供 LLM 调用的工具（OpenAI Function Calling 格式）
 * 以及每个工具的实际执行逻辑
 */

import { v4 as uuidv4 } from 'uuid';
import { saveStory, saveCharacters } from './dataStore.js';
import { buildNovelContext } from './contextBuilder.js';
import { buildConsistencyCheckPrompt } from './promptTemplates.js';

// ============ 工具 Schema 定义（OpenAI Function Calling 格式） ============

export const toolDefinitions = [
  {
    type: 'function',
    function: {
      name: 'get_characters',
      description: '获取所有角色列表，返回角色的基本信息（名称、性别、年龄、性格特点等）',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: '可选：按名字或特征搜索角色',
          },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_character',
      description: '获取某个角色的详细信息，包括背景故事、性格特点、人物关系等',
      parameters: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            description: '角色名称',
          },
        },
        required: ['name'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_events',
      description: '获取故事线事件列表，返回事件的时间、标题、描述和层级关系',
      parameters: {
        type: 'object',
        properties: {},
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'add_character',
      description: '创建一个新角色并添加到角色列表中。描述请保持简短（一两句话概括核心特征），不要写人物小传。',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: '角色名称' },
          gender: { type: 'string', description: '性别：男/女/其他', enum: ['男', '女', '其他'] },
          age: { type: 'string', description: '年龄' },
          description: { type: 'string', description: '简短角色概括（1-2句话，如"冷静果断的侦探"），不要写长段背景' },
          traits: { type: 'array', items: { type: 'string' }, description: '性格特点列表（2-5个关键词）' },
          color: { type: 'string', description: '角色颜色标识，如 #3b82f6' },
        },
        required: ['name'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_character',
      description: '修改已有角色的设定。描述保持简短概括风格。',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: '要修改的角色名称（用于查找）' },
          updates: {
            type: 'object',
            description: '要修改的字段，未列出的字段保持不变',
            properties: {
              name: { type: 'string', description: '新名称' },
              gender: { type: 'string', description: '性别' },
              age: { type: 'string', description: '年龄' },
              description: { type: 'string', description: '简短角色概括（1-2句话）' },
              traits: { type: 'array', items: { type: 'string' }, description: '性格特点' },
            },
          },
        },
        required: ['name', 'updates'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'add_event',
      description: '在故事线中添加一个新事件。描述请保持简短大纲式（如"主角发现密室中的线索"），不要写成长段落。',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: '事件标题' },
          description: { type: 'string', description: '简短事件概括（1-2句话大纲），不要写详细场景描写' },
          datetime: { type: 'string', description: '事件发生时间，如 "2024-03-15" 或 "第三章"' },
          parentTitle: { type: 'string', description: '可选：父事件标题，不填则为顶级事件' },
          color: { type: 'string', description: '事件颜色，如 #3b82f6' },
        },
        required: ['title'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_event',
      description: '修改故事线中已有事件。描述保持简短大纲风格。',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: '要修改的事件标题（用于查找）' },
          updates: {
            type: 'object',
            description: '要修改的字段',
            properties: {
              title: { type: 'string', description: '新标题' },
              description: { type: 'string', description: '简短事件概括（1-2句话）' },
              datetime: { type: 'string', description: '新时间' },
            },
          },
        },
        required: ['title', 'updates'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'generate_chapter',
      description: '⚠️ 仅在用户明确要求细写某个事件/章节的详细内容时才使用此工具。根据故事线和角色设定生成详细的小说章节内容。如果用户只是要求提供大纲或规划剧情，不要使用此工具。',
      parameters: {
        type: 'object',
        properties: {
          userRequest: { type: 'string', description: '用户的细写要求' },
          chapterTitle: { type: 'string', description: '可选：章节标题' },
          chapterOutline: { type: 'string', description: '可选：章节大纲' },
        },
        required: ['userRequest'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'check_consistency',
      description: '检查给定内容是否与角色设定和故事线一致，返回检查结果',
      parameters: {
        type: 'object',
        properties: {
          content: { type: 'string', description: '要检查的内容文本' },
        },
        required: ['content'],
      },
    },
  },
];

// ============ 工具执行器 ============

/**
 * 执行工具调用
 * @param {string} toolName - 工具名称
 * @param {object} args - 工具参数
 * @param {object} context - 运行时上下文 { openai, currentModel, currentStoryData, currentCharacterData }
 * @returns {Promise<string>} 工具执行结果（JSON 字符串）
 */
export async function executeTool(toolName, args, context) {
  const { openai, currentModel, currentStoryData, currentCharacterData } = context;

  switch (toolName) {
    case 'get_characters':
      return handleGetCharacters(args, currentCharacterData);
    case 'get_character':
      return handleGetCharacter(args, currentCharacterData);
    case 'get_events':
      return handleGetEvents(currentStoryData);
    case 'add_character':
      return handleAddCharacter(args, currentCharacterData);
    case 'update_character':
      return handleUpdateCharacter(args, currentCharacterData);
    case 'add_event':
      return handleAddEvent(args, currentStoryData);
    case 'update_event':
      return handleUpdateEvent(args, currentStoryData);
    case 'generate_chapter':
      return await handleGenerateChapter(args, context);
    case 'check_consistency':
      return await handleCheckConsistency(args, context);
    default:
      return JSON.stringify({ error: `未知工具: ${toolName}` });
  }
}

// ============ 各工具处理函数 ============

function handleGetCharacters(args, characterData) {
  if (!characterData || !characterData.characters || characterData.characters.length === 0) {
    return JSON.stringify({ result: '暂无角色数据', characters: [] });
  }

  const charactersMap = new Map(characterData.characters);
  let characters = Array.from(charactersMap.values());

  // 搜索过滤
  if (args.query) {
    const q = args.query.toLowerCase();
    characters = characters.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.description && c.description.toLowerCase().includes(q)) ||
        (c.traits && c.traits.some((t) => t.toLowerCase().includes(q)))
    );
  }

  const result = characters.map((c) => ({
    name: c.name,
    gender: c.gender,
    age: c.age || '未设定',
    traits: c.traits || [],
    description: c.description ? c.description.substring(0, 100) : '',
  }));

  return JSON.stringify({ count: result.length, characters: result });
}

function handleGetCharacter(args, characterData) {
  if (!characterData || !characterData.characters) {
    return JSON.stringify({ error: '暂无角色数据' });
  }

  const charactersMap = new Map(characterData.characters);
  const name = args.name.toLowerCase();

  for (const [id, char] of charactersMap) {
    if (char.name.toLowerCase() === name) {
      return JSON.stringify({
        id,
        name: char.name,
        gender: char.gender,
        age: char.age,
        height: char.height,
        weight: char.weight,
        description: char.description,
        traits: char.traits,
        relatedEventIds: char.relatedEventIds,
        color: char.color,
      });
    }
  }

  return JSON.stringify({ error: `未找到角色「${args.name}」` });
}

function handleGetEvents(storyData) {
  if (!storyData || !storyData.events || storyData.events.length === 0) {
    return JSON.stringify({ result: '暂无故事线数据', events: [] });
  }

  const eventsMap = new Map(storyData.events);
  const rootIds = storyData.rootEventIds || [];

  function formatEvent(eventId, depth) {
    const event = eventsMap.get(eventId);
    if (!event) return null;
    return {
      title: event.title,
      description: event.description || '',
      datetime: event.datetime,
      children: (event.children || []).map((cid) => formatEvent(cid, depth + 1)).filter(Boolean),
    };
  }

  const events = rootIds.map((id) => formatEvent(id, 0)).filter(Boolean);
  return JSON.stringify({ count: events.length, events });
}

function handleAddCharacter(args, characterData) {
  if (!characterData) {
    characterData = { characters: [] };
  }

  const charactersMap = new Map(characterData.characters || []);
  const id = uuidv4();

  const DEFAULT_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#f97316'];
  const colorIndex = charactersMap.size % DEFAULT_COLORS.length;

  const newChar = {
    id,
    name: args.name,
    gender: args.gender || '男',
    age: args.age || '',
    height: '',
    weight: '',
    description: args.description || '',
    traits: args.traits || [],
    relationships: [],
    relatedEventIds: [],
    color: args.color || DEFAULT_COLORS[colorIndex],
  };

  charactersMap.set(id, newChar);
  characterData.characters = Array.from(charactersMap.entries());
  saveCharacters(characterData);

  return JSON.stringify({ success: true, message: `角色「${args.name}」已创建`, character: { id, name: args.name } });
}

function handleUpdateCharacter(args, characterData) {
  if (!characterData || !characterData.characters) {
    return JSON.stringify({ error: '暂无角色数据' });
  }

  const charactersMap = new Map(characterData.characters);
  const name = args.name.toLowerCase();

  for (const [id, char] of charactersMap) {
    if (char.name.toLowerCase() === name) {
      const updated = { ...char, ...args.updates };
      charactersMap.set(id, updated);
      characterData.characters = Array.from(charactersMap.entries());
      saveCharacters(characterData);
      return JSON.stringify({ success: true, message: `角色「${char.name}」已更新` });
    }
  }

  return JSON.stringify({ error: `未找到角色「${args.name}」` });
}

function handleAddEvent(args, storyData) {
  if (!storyData) {
    storyData = { events: [], rootEventIds: [] };
  }

  const eventsMap = new Map(storyData.events || []);
  const id = uuidv4();

  const DEFAULT_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#f97316'];
  const colorIndex = eventsMap.size % DEFAULT_COLORS.length;

  let parentId = null;
  // 如果指定了父事件标题，查找父事件
  if (args.parentTitle) {
    const parentName = args.parentTitle.toLowerCase();
    for (const [eid, event] of eventsMap) {
      if (event.title.toLowerCase() === parentName) {
        parentId = eid;
        break;
      }
    }
    if (!parentId) {
      return JSON.stringify({ error: `未找到父事件「${args.parentTitle}」` });
    }
  }

  const newEvent = {
    id,
    title: args.title,
    description: args.description || '',
    datetime: args.datetime || new Date().toISOString(),
    parentId,
    children: [],
    symbol: '→',
    color: args.color || DEFAULT_COLORS[colorIndex],
    isCollapsed: false,
  };

  eventsMap.set(id, newEvent);

  // 更新父事件的 children
  if (parentId) {
    const parent = eventsMap.get(parentId);
    if (parent) {
      eventsMap.set(parentId, { ...parent, children: [...parent.children, id] });
    }
  }

  storyData.events = Array.from(eventsMap.entries());
  if (!parentId) {
    storyData.rootEventIds = [...(storyData.rootEventIds || []), id];
  }

  saveStory(storyData);

  return JSON.stringify({
    success: true,
    message: `事件「${args.title}」已添加${parentId ? '（子事件）' : '（顶级事件）'}`,
    event: { id, title: args.title },
  });
}

function handleUpdateEvent(args, storyData) {
  if (!storyData || !storyData.events) {
    return JSON.stringify({ error: '暂无故事线数据' });
  }

  const eventsMap = new Map(storyData.events);
  const title = args.title.toLowerCase();

  for (const [id, event] of eventsMap) {
    if (event.title.toLowerCase() === title) {
      const updated = { ...event, ...args.updates };
      eventsMap.set(id, updated);
      storyData.events = Array.from(eventsMap.entries());
      saveStory(storyData);
      return JSON.stringify({ success: true, message: `事件「${event.title}」已更新` });
    }
  }

  return JSON.stringify({ error: `未找到事件「${args.title}」` });
}

async function handleGenerateChapter(args, context) {
  const { openai, currentModel, currentStoryData, currentCharacterData } = context;

  const novelContext = buildNovelContext(currentStoryData, currentCharacterData);

  let userPrompt = `${novelContext}\n\n`;
  if (args.chapterTitle) userPrompt += `## 章节标题：${args.chapterTitle}\n`;
  if (args.chapterOutline) userPrompt += `## 章节大纲：${args.chapterOutline}\n`;
  userPrompt += `## 创作要求\n${args.userRequest}\n\n请创作章节内容。`;

  try {
    const completion = await openai.chat.completions.create({
      model: currentModel,
      messages: [
        { role: 'system', content: '你是一位专业的小说创作助手。请使用 Markdown 格式输出，包含场景描写、人物对话和心理活动。' },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.8,
      max_tokens: 4000,
    });

    const content = completion.choices[0]?.message?.content || '';
    return JSON.stringify({
      success: true,
      content,
      length: content.length,
      message: `章节内容已生成，共 ${content.length} 字`,
    });
  } catch (error) {
    return JSON.stringify({
      error: `章节生成失败: ${error.message}`,
    });
  }
}

async function handleCheckConsistency(args, context) {
  const { openai, currentModel, currentStoryData, currentCharacterData } = context;

  const novelContext = buildNovelContext(currentStoryData, currentCharacterData);
  const prompt = buildConsistencyCheckPrompt(novelContext, args.content);

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
      checkResult = jsonMatch ? JSON.parse(jsonMatch[1]) : JSON.parse(result);
    } catch {
      checkResult = { consistent: true, issues: [], raw: result };
    }

    return JSON.stringify(checkResult);
  } catch (error) {
    return JSON.stringify({ error: `一致性检查失败: ${error.message}` });
  }
}
