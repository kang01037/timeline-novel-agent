export const GuideSymbol = {
  Arrow: '→',
  Branch: '┬',
  Continue: '│',
  Merge: '╳',
  Diamond: '◆',
  Circle: '●',
} as const;

export type GuideSymbolType = typeof GuideSymbol[keyof typeof GuideSymbol];

export interface TimelineEvent {
  id: string;
  title: string;
  description: string;
  datetime: string;
  parentId: string | null;
  children: string[];
  symbol: GuideSymbolType;
  color: string;
  isCollapsed: boolean;
}

export interface TimelineState {
  events: Map<string, TimelineEvent>;
  rootEventIds: string[];
  selectedEventId: string | null;
  editingEventId: string | null;
}
