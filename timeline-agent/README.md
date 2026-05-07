# Time Line Agent

小说时间线助手 — 一款 AI 辅助小说创作工具，提供可视化故事时间线管理、角色管理和 AI 智能写作（支持 Agent 自主操作）。

## 技术栈

| 层次 | 技术 |
|------|------|
| 前端 | TypeScript + Vite 8 + Zustand（状态管理） |
| 后端 | Node.js + Express |
| AI SDK | OpenAI SDK（兼容 OpenAI / 通义千问 / DeepSeek / Ollama） |
| 流式传输 | Server-Sent Events (SSE) |
| 日期处理 | dayjs |
| Markdown | marked |
| 样式 | 纯 CSS（暗色主题 + CSS 自定义属性） |

## 项目结构

```
timeline-agent/
├── index.html                     # SPA 入口
├── vite.config.ts                 # Vite 配置（/api → localhost:3001）
├── tsconfig.json                  # TypeScript 配置
├── package.json                   # 依赖与脚本
├── 启动.bat                       # Windows 一键启动脚本
├── 流程.md                        # 开发路线图
├── server/                        # 后端服务
│   ├── index.js                   # Express 入口 + 全部 API 路由
│   ├── dataStore.js               # JSON 文件持久化层
│   ├── contextBuilder.js          # 上下文构建器（故事+角色→Prompt）
│   ├── promptTemplates.js         # Prompt 模板（章节生成、一致性检查）
│   ├── tools.js                   # Function Calling 工具定义（8 个工具）
│   ├── agentLoop.js               # ReAct 推理循环
│   ├── .env.example               # 环境变量模板
│   └── data/                      # 持久化数据目录
│       ├── story.json             # 故事时间线
│       ├── characters.json        # 角色数据
│       └── memory.json            # 长期记忆
└── src/                           # 前端源码
    ├── main.ts                    # 入口：渲染三栏布局
    ├── style.css                  # 全局样式（暗色主题）
    ├── types/
    │   ├── timeline.ts            # 时间线类型定义
    │   └── character.ts           # 角色类型定义
    ├── stores/
    │   ├── timelineStore.ts       # 时间线状态管理（Zustand）
    │   └── characterStore.ts      # 角色状态管理（Zustand）
    ├── services/
    │   └── agentService.ts        # API 客户端（SSE 流、章节生成、一致性检查）
    ├── components/
    │   ├── TimelineView.ts        # 时间线主面板（树形卡片、拖拽调整）
    │   ├── EventForm.ts           # 事件编辑表单
    │   ├── SymbolPicker.ts        # 事件图标选择器
    │   ├── CharacterPanel.ts      # 角色列表面板（搜索筛选）
    │   ├── CharacterCard.ts       # 角色卡片
    │   ├── CharacterForm.ts       # 角色编辑表单
    │   ├── ChatPanel.ts           # AI 对话面板（Agent 模式 + 普通模式）
    │   ├── AIConfigPanel.ts       # AI 配置面板
    │   └── VersionPanel.ts        # 版本历史面板
    └── utils/
        └── persistence.ts         # 双写持久化（localStorage + 服务端）
```

## 快速开始

### 环境要求

- **Node.js** 18+
- **API Key**（任选其一）：
  - [阿里云 DashScope](https://dashscope.console.aliyun.com/)（默认，通义千问）
  - OpenAI API
  - DeepSeek API
  - Ollama（本地模型）

### 安装与运行

```bash
# 进入项目目录
cd timeline-agent

# 安装依赖
npm install

# 配置 API Key
cp server/.env.example server/.env
# 编辑 server/.env，填入你的 API Key
```

**Windows 一键启动：**

双击 `启动.bat`

**手动启动：**

```bash
# 同时启动前端（5173）和后端（3001）
npm run dev:all

# 或分别启动
npm run dev          # 前端 → http://localhost:5173
npm run dev:server   # 后端 → http://localhost:3001
```

### 环境变量

编辑 `server/.env`：

```env
OPENAI_API_KEY=你的API密钥
OPENAI_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
AI_MODEL=qwen-plus
PORT=3001
```

支持的模型：
| 模型 | 特点 |
|------|------|
| `qwen-turbo` | 速度快，适合简单创作 |
| `qwen-plus` | 均衡，推荐日常使用 |
| `qwen-max` | 质量最高，适合重要章节 |
| `qwen-long` | 超长上下文，适合长篇续写 |
| `gpt-4o` / `gpt-4.1` | OpenAI 模型（需配置对应 Base URL） |
| `deepseek-chat` | DeepSeek 模型（需配置对应 Base URL） |

## 核心功能

### 1. 可视化时间线管理
- 树形事件结构，支持父子事件嵌套
- 拖拽调整事件大小，按类别着色
- 事件属性：标题、描述、时间、图标、颜色、折叠/展开
- 支持 CRUD 操作和拖拽移动

### 2. 角色管理
- 完整角色档案：姓名、性别、年龄、身高、体重、性格标签、描述
- 角色关系网络
- 按名称、描述、性格标签搜索筛选
- 每个角色分配独特色彩标识

### 3. AI 智能写作（普通模式）
- **生成章节**：根据当前故事上下文自动生成新章节
- **续写故事**：基于已有剧情智能续写
- **生成对话**：为指定角色生成对话
- **一致性检查**：检查新章节与已有人设、剧情的冲突
- 实时 SSE 流式输出，Markdown 渲染

### 4. Agent 自主模式（高级）
- 实现 **ReAct**（推理+行动）循环：思考 → 调用工具 → 观察结果 → 迭代
- **8 个 Function Calling 工具**：
  - 读取：查询角色列表/详情、查询事件列表
  - 写入：添加角色、更新角色、添加事件、更新事件
  - 生成：生成章节、一致性检查
- Agent 自主规划、查询数据、创建/修改角色和事件
- 写入操作需要前端用户确认（30 秒超时）
- 推理步骤实时可视化：思考过程、工具调用、工具结果、耗时统计

### 5. 数据持久化
- 双写策略：localStorage（快速缓存）+ 服务端 JSON 文件
- 启动时优先从服务端加载，fallback 到本地缓存
- 支持 JSON 文件导入/导出全量数据备份
- 对话摘要自动保存至长期记忆（`memory.json`）

## 界面布局

三栏可调节布局：

```
+------------------+------------+----------------+
|                  |            |                |
|   时间线面板      |  角色面板   |   AI 对话面板   |
|   (可调节宽度)    | (默认320px) |  (默认400px)   |
|                  |            |                |
+------------------+------------+----------------+
```

- 暗色主题，蓝紫渐变点缀
- 面板宽度调整自动持久化
- 章节内容以特殊样式标识（紫色边框/背景）

## 示例数据

项目内置了一部都市异能小说的示例数据：

- **主角**：林北，18 岁高中生，拥有 F 级瞬移能力
- **女主**：李默默，18 岁，触碰他人可感知其尴尬回忆
- **配角**：陈博士、王队长
- **故事线**：林北因能力失控被退学，加入异能局，调查神秘失踪事件

## 构建部署

```bash
# 生产构建
npm run build

# 预览构建结果
npm run preview
```

构建产物输出至 `dist/` 目录。

## 开发路线图

详见 [流程.md](./流程.md)。

## 敏感信息提醒

- `server/.env` 包含 API 密钥，已通过 `.gitignore` 排除，请勿提交至版本控制
- 配置模板参见 `server/.env.example`
