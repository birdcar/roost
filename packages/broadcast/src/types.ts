export interface ConnectionMeta {
  userId?: string;
  joinedAt: number;
  channelType: 'public' | 'private' | 'presence';
}

export interface PresenceMember {
  id: string;
  joinedAt: number;
}

export interface BroadcastMessage {
  event: string;
  data: Record<string, unknown>;
}
