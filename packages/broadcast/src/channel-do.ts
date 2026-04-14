import type { ConnectionMeta, PresenceMember, BroadcastMessage } from './types.js';

export class ChannelDO implements DurableObject {
  constructor(
    private state: DurableObjectState,
    private env: Record<string, unknown>
  ) {}

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (request.headers.get('Upgrade') === 'websocket') {
      return this.handleUpgrade(request);
    }

    if (url.pathname === '/broadcast' && request.method === 'POST') {
      return this.handleBroadcast(request);
    }

    if (url.pathname === '/presence' && request.method === 'GET') {
      return this.handlePresenceList();
    }

    return new Response('Not Found', { status: 404 });
  }

  private async handleUpgrade(request: Request): Promise<Response> {
    const channelType = (new URL(request.url).searchParams.get('type') ?? 'public') as ConnectionMeta['channelType'];

    if (channelType === 'private' || channelType === 'presence') {
      const authResult = await this.authorize(request);
      if (!authResult.ok) {
        return new Response('Forbidden', { status: 403 });
      }
    }

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair) as [WebSocket, WebSocket];

    const meta: ConnectionMeta = {
      userId: this.extractUserId(request),
      joinedAt: Date.now(),
      channelType,
    };

    this.state.acceptWebSocket(server, [JSON.stringify(meta)]);

    if (channelType === 'presence' && meta.userId) {
      const member: PresenceMember = {
        id: meta.userId,
        joinedAt: meta.joinedAt,
      };
      this.broadcastToAll(JSON.stringify({
        event: 'presence:join',
        data: { member },
      }), server);
    }

    return new Response(null, { status: 101, webSocket: client });
  }

  private async handleBroadcast(request: Request): Promise<Response> {
    const message = await request.json<BroadcastMessage & { type: string }>();
    const sockets = this.state.getWebSockets();

    for (const ws of sockets) {
      try {
        ws.send(JSON.stringify({ event: message.event, data: message.data }));
      } catch {
        // Socket closed between getWebSockets() and send — ignore
      }
    }

    return new Response(null, { status: 204 });
  }

  private handlePresenceList(): Response {
    const sockets = this.state.getWebSockets();
    const members: PresenceMember[] = sockets
      .map((ws) => {
        const tags = this.state.getTags(ws);
        if (!tags?.[0]) return null;
        try {
          const meta = JSON.parse(tags[0]) as ConnectionMeta;
          if (!meta.userId) return null;
          return { id: meta.userId, joinedAt: meta.joinedAt } satisfies PresenceMember;
        } catch {
          return null;
        }
      })
      .filter((m): m is PresenceMember => m !== null);

    return Response.json({ members });
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    let parsed: { event: string; data?: unknown; channel?: string } | null = null;

    try {
      parsed = JSON.parse(typeof message === 'string' ? message : new TextDecoder().decode(message));
    } catch {
      return;
    }

    if (parsed?.event === 'whisper') {
      this.broadcastToAll(JSON.stringify({
        event: 'whisper',
        data: parsed.data,
      }), ws);
    }
  }

  async webSocketClose(ws: WebSocket, _code: number, _reason: string): Promise<void> {
    const tags = this.state.getTags(ws);
    if (!tags?.[0]) return;

    try {
      const meta = JSON.parse(tags[0]) as ConnectionMeta;
      if (meta.channelType === 'presence' && meta.userId) {
        this.broadcastToAll(JSON.stringify({
          event: 'presence:leave',
          data: { member: { id: meta.userId } },
        }), ws);
      }
    } catch {
      // Corrupt attachment — ignore
    }
  }

  async webSocketError(ws: WebSocket, _error: unknown): Promise<void> {
    ws.close(1011, 'Internal error');
  }

  private broadcastToAll(message: string, exclude?: WebSocket): void {
    for (const ws of this.state.getWebSockets()) {
      if (ws === exclude) continue;
      try {
        ws.send(message);
      } catch {
        // Closed between getWebSockets() and send — ignore
      }
    }
  }

  /**
   * @warning Default implementation accepts any bearer token. Applications
   * must override this method to implement real authorization (e.g., validate a signed JWT).
   */
  protected async authorize(request: Request): Promise<{ ok: boolean }> {
    const auth = request.headers.get('Authorization') ?? '';
    return { ok: auth.startsWith('Bearer ') && auth.length > 7 };
  }

  protected extractUserId(request: Request): string | undefined {
    return new URL(request.url).searchParams.get('userId') ?? undefined;
  }
}
