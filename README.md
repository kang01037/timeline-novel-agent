# -agent
Timeline Agent 是一个小说创作 AI Agent 助手。用户通过自然语言与 AI 对话，AI 基于 ReAct 模式自主推理、调用工具，直接操作故事线和角色数据，完成从构思到成稿的全流程辅助。  核心功能：树形故事线管理、角色档案维护、AI 多步推理对话（Function Calling）、危险操作确认、长期记忆（跨会话保持偏好）、流式输出、版本管理与一致性检查。  技术栈：前端 Vite + TypeScript + Zustand；后端 Express + Node.js；LLM 调用兼容 OpenAI 格式（默认通义千问），支持 OpenAI/DeepSeek/Ollama。前后端通过 SSE 实时通信，数据持久化为服务端 JSON 文件。
