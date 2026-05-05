/**
 * Prompt 模板
 * 根据不同场景生成 AI 请求的 system prompt 和 user prompt
 */

/**
 * 生成章节创作的 system prompt
 */
export function getSystemPrompt() {
  return `你是一位专业的小说创作助手。你的任务是根据用户提供的故事线和角色设定，创作高质量的章节内容。

## 创作原则

1. **忠于设定**：严格按照角色设定（性格、背景）进行描写，不得随意改变角色性格
2. **遵循时间线**：按照故事线的时间顺序推进情节
3. **细节丰富**：注重场景描写、心理活动、对话设计
4. **情节连贯**：确保与前后章节自然衔接
5. **风格一致**：保持全文的叙事风格统一

## 输出格式

- 使用 Markdown 格式输出
- 包含场景描写、人物对话、心理活动
- 适当使用分段和小标题组织内容

## 人设一致性检查

在创作过程中，你需要自我检查：
- 角色的言行是否符合其性格设定？
- 角色之间的关系是否与设定一致？
- 情节发展是否与时间线吻合？
- 是否有逻辑矛盾？

如果发现不一致，请在内容末尾用「⚠️ 人设提醒」标注。`;
}

/**
 * 生成章节创作的 user prompt
 */
export function buildChapterPrompt(context, userRequest, chapterInfo) {
  let prompt = `${context}\n\n`;

  if (chapterInfo) {
    prompt += `## 当前章节信息\n`;
    if (chapterInfo.title) prompt += `章节标题：${chapterInfo.title}\n`;
    if (chapterInfo.outline) prompt += `章节大纲：${chapterInfo.outline}\n`;
    prompt += '\n';
  }

  prompt += `## 创作要求\n${userRequest}\n\n`;
  prompt += `请根据以上故事线、角色设定和创作要求，创作章节内容。如果发现创作内容与角色设定存在冲突，请在末尾用「⚠️ 人设提醒」说明。`;

  return prompt;
}

/**
 * 生成人设一致性检查的 prompt
 */
export function buildConsistencyCheckPrompt(context, content) {
  return `${context}

## 待检查的内容

${content}

## 检查要求

请检查以上内容是否与角色设定和故事线存在冲突，从以下维度检查：
1. 角色性格是否一致
2. 角色关系是否正确
3. 时间线是否吻合
4. 是否有逻辑矛盾

请以 JSON 格式返回检查结果：
\`\`\`json
{
  "consistent": true/false,
  "issues": [
    {
      "type": "character_trait/relationship/timeline/logic",
      "description": "问题描述",
      "suggestion": "修改建议"
    }
  ]
}
\`\`\``;
}
