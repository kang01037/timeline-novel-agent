/**
 * 上下文构建器
 * 读取故事线和人物数据，拼接为 Agent prompt
 */

/**
 * 构建小说创作上下文
 */
export function buildNovelContext(story, characters) {
  const storySection = buildStorySection(story);
  const characterSection = buildCharacterSection(characters);
  
  return `${storySection}\n\n${characterSection}`;
}

/**
 * 构建故事线部分
 */
function buildStorySection(story) {
  if (!story || (!story.events?.length && !story.rootEventIds?.length)) {
    return '## 故事线\n暂无故事线数据。';
  }

  // 兼容：events 可能是 [[id, event], ...] 数组，也可能是普通对象
  let eventsEntries = story.events || [];
  const eventsMap = new Map(Array.isArray(eventsEntries) ? eventsEntries : Object.entries(eventsEntries));
  const rootIds = story.rootEventIds || [];

  // 按时间排序根事件
  const sortedRoots = [...rootIds].sort((a, b) => {
    const ea = eventsMap.get(a);
    const eb = eventsMap.get(b);
    if (!ea || !eb) return 0;
    return new Date(ea.datetime) - new Date(eb.datetime);
  });

  let result = '## 故事线\n';
  
  for (const rootId of sortedRoots) {
    const event = eventsMap.get(rootId);
    if (event) {
      result += formatEventTree(event, eventsMap, 0);
    }
  }

  return result;
}

/**
 * 递归格式化事件树
 */
function formatEventTree(event, eventsMap, depth) {
  const indent = '  '.repeat(depth);
  const date = new Date(event.datetime).toLocaleDateString('zh-CN');
  const symbol = event.symbol || '→';
  
  let result = `${indent}${symbol} [${date}] ${event.title}`;
  if (event.description) {
    result += `：${event.description}`;
  }
  result += '\n';

  if (event.children && event.children.length > 0) {
    const sortedChildren = [...event.children].sort((a, b) => {
      const ea = eventsMap.get(a);
      const eb = eventsMap.get(b);
      if (!ea || !eb) return 0;
      return new Date(ea.datetime) - new Date(eb.datetime);
    });

    for (const childId of sortedChildren) {
      const child = eventsMap.get(childId);
      if (child) {
        result += formatEventTree(child, eventsMap, depth + 1);
      }
    }
  }

  return result;
}

/**
 * 构建角色部分
 */
function buildCharacterSection(characters) {
  // 兼容两种数据格式：{ characters: [[id, char], ...] } 或 [[id, char], ...]
  let entries = characters;
  if (characters && !Array.isArray(characters) && characters.characters) {
    entries = characters.characters;
  }

  if (!entries || entries.length === 0) {
    return '## 角色设定\n暂无角色数据。';
  }

  const charactersMap = new Map(Array.isArray(entries) ? entries : Object.entries(entries));
  let result = '## 角色设定\n';

  for (const [id, char] of charactersMap) {
    result += `### ${char.name}\n`;
    result += `性别：${char.gender || '未知'}\n`;
    if (char.age) result += `年龄：${char.age}岁\n`;
    if (char.height) result += `身高：${char.height}cm\n`;
    if (char.weight) result += `体重：${char.weight}kg\n`;
    if (char.description) {
      result += `背景：${char.description}\n`;
    }
    if (char.traits && char.traits.length > 0) {
      result += `性格特点：${char.traits.join('、')}\n`;
    }
    if (char.relationships && char.relationships.length > 0) {
      result += '人物关系：\n';
      for (const rel of char.relationships) {
        const target = charactersMap.get(rel.targetId);
        if (target) {
          result += `  - 与${target.name}：${rel.type}（${rel.description}）\n`;
        }
      }
    }
    result += '\n';
  }

  return result;
}
