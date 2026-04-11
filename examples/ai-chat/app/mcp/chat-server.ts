import { McpServer, McpResource, McpPrompt, McpResponse } from '@roost/mcp';
import type { McpRequest } from '@roost/mcp';

class ConversationListResource extends McpResource {
  description() { return 'Lists all conversations for the authenticated user.'; }
  uri() { return 'chat://conversations'; }

  handle() {
    return McpResponse.text(JSON.stringify([
      { id: '1', title: 'First conversation', createdAt: '2026-04-10' },
    ]));
  }
}

class SummarizeChatPrompt extends McpPrompt {
  description() { return 'Summarize a conversation.'; }

  arguments() {
    return [
      { name: 'conversationId', description: 'The conversation to summarize', required: true },
    ];
  }

  handle(request: McpRequest) {
    const id = request.get<string>('conversationId');
    return McpResponse.text(`Please summarize conversation ${id} in 2-3 sentences.`);
  }
}

export class ChatHistoryServer extends McpServer {
  tools = [];
  resources = [ConversationListResource];
  prompts = [SummarizeChatPrompt];
}
