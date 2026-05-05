export interface Character {
  id: string;
  name: string;
  gender: '男' | '女' | '其他';
  age: string;
  height: string;
  weight: string;
  traits: string[];
  description: string;
  relationships: CharacterRelationship[];
  relatedEventIds: string[];
  color: string;
}

export interface CharacterRelationship {
  targetId: string;
  type: string;
  description: string;
}

export interface CharacterState {
  characters: Map<string, Character>;
  selectedCharacterId: string | null;
  editingCharacterId: string | null;
}
