import './style.css';
import { TimelineView } from './components/TimelineView';
import { CharacterPanel } from './components/CharacterPanel';
import { ChatPanel } from './components/ChatPanel';
import { loadAllFromServer } from './utils/persistence';
import { timelineStore } from './stores/timelineStore';
import { characterStore } from './stores/characterStore';

const app = document.querySelector<HTMLDivElement>('#app');

if (!app) {
  throw new Error('找不到 #app 元素，请检查 index.html');
}

app.innerHTML = `
  <div class="app-header">
    <div class="app-title-row">
      <h1>小说时间线助手</h1>
      <span class="subtitle">帮助你理清故事脉络与角色关系</span>
    </div>
  </div>
  <div class="main-layout">
    <div class="timeline-panel" id="timeline-panel"></div>
    <div class="resize-handle resize-handle-h" id="resize-char-timeline" title="拖拽调整宽度"></div>
    <div class="character-panel" id="character-panel"></div>
    <div class="resize-handle resize-handle-h" id="resize-char-agent" title="拖拽调整宽度"></div>
    <div class="agent-panel" id="agent-panel"></div>
  </div>
`;

const timelinePanel = app.querySelector('#timeline-panel') as HTMLElement;
const characterPanel = app.querySelector('#character-panel') as HTMLElement;
const agentPanel = app.querySelector('#agent-panel') as HTMLElement;

/**
 * 启动时从服务端加载数据，如果服务端有数据则覆盖 localStorage
 * 如果服务端不可用则回退到 localStorage
 */
async function initializeData(): Promise<void> {
  const serverData = await loadAllFromServer();

  if (serverData) {
    // 服务端有数据，用服务端数据初始化 Store
    if (serverData.story) {
      timelineStore.setState({
        events: new Map(serverData.story.events || []),
        rootEventIds: serverData.story.rootEventIds || [],
      });
      // 同步写回 localStorage 作为缓存
      try {
        localStorage.setItem('timeline-agent-story', JSON.stringify(serverData.story));
      } catch { /* ignore */ }
    }

    if (serverData.characters) {
      characterStore.setState({
        characters: new Map(serverData.characters.characters || []),
      });
      try {
        localStorage.setItem('timeline-agent-characters', JSON.stringify(serverData.characters));
      } catch { /* ignore */ }
    }

    if (serverData.versions) {
      try {
        localStorage.setItem('timeline-agent-versions', JSON.stringify(serverData.versions));
      } catch { /* ignore */ }
    }
  }
  // 如果服务端没有数据，Store 已经从 localStorage 初始化了，无需额外操作
}

// 先初始化数据，再创建 UI 组件
initializeData().then(() => {
  const timelineView = new TimelineView(timelinePanel);
  const charPanel = new CharacterPanel(characterPanel);
  const chatPanel = new ChatPanel(agentPanel);

  // 初始化面板拖拽调整大小
  initPanelResize(timelinePanel, characterPanel, agentPanel);

  // 页面卸载时清理
  window.addEventListener('beforeunload', () => {
    timelineView.destroy();
    charPanel.destroy();
    chatPanel.destroy();
  });
});

/**
 * 面板拖拽调整宽度
 */
function initPanelResize(
  timelineEl: HTMLElement,
  charEl: HTMLElement,
  agentEl: HTMLElement
): void {
  // 从 localStorage 恢复面板宽度
  const savedCharWidth = localStorage.getItem('panel-char-width');
  const savedAgentWidth = localStorage.getItem('panel-agent-width');
  if (savedCharWidth) {
    charEl.style.width = savedCharWidth;
    charEl.style.minWidth = '200px';
  }
  if (savedAgentWidth) {
    agentEl.style.width = savedAgentWidth;
    agentEl.style.minWidth = '280px';
  }

  const handle1 = document.getElementById('resize-char-timeline');
  const handle2 = document.getElementById('resize-char-agent');

  if (handle1) {
    makeDraggable(handle1, (dx) => {
      // 向右拖(dx>0)→角色面板变窄，向左拖(dx<0)→角色面板变宽
      const currentWidth = charEl.offsetWidth;
      const newWidth = Math.max(200, currentWidth - dx);
      charEl.style.width = newWidth + 'px';
      charEl.style.minWidth = '200px';
      localStorage.setItem('panel-char-width', newWidth + 'px');
    });
  }

  if (handle2) {
    makeDraggable(handle2, (dx) => {
      const currentWidth = agentEl.offsetWidth;
      const newWidth = Math.max(280, currentWidth - dx);
      agentEl.style.width = newWidth + 'px';
      agentEl.style.minWidth = '280px';
      localStorage.setItem('panel-agent-width', newWidth + 'px');
    });
  }
}

function makeDraggable(handle: HTMLElement, onMove: (dx: number) => void): void {
  let startX = 0;

  handle.addEventListener('mousedown', (e) => {
    e.preventDefault();
    startX = e.clientX;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    const onMouseMove = (e: MouseEvent) => {
      const dx = e.clientX - startX;
      startX = e.clientX;
      onMove(dx);
    };

    const onMouseUp = () => {
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  });
}
