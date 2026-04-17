import type { AgentMessage, AgentPromptOptions, ConversationId } from '../types.js';
import type { AgentResponse } from '../responses/agent-response.js';
import type { Conversational } from '../contracts.js';
import { dispatchEvent, ConversationStarted, ConversationContinued } from '../events.js';
import { StatefulAgent } from './agent.js';

// Standard mixin idiom: the constructor signature must be widened via `any[]`
// so subclass mixins compose cleanly.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type StatefulCtor<T extends StatefulAgent = StatefulAgent> = new (...args: any[]) => T;

export interface RemembersConversationsInstance {
  forUser(user: { id: string }): this;
  continue(conversationId: ConversationId, opts?: { as?: { id: string } }): this;
  messages(): Promise<AgentMessage[]>;
  readonly conversationId: ConversationId | undefined;
  readonly userId: string | undefined;
}

/**
 * Mixin that makes a `StatefulAgent` auto-persist prompts and responses to the
 * agent's `Sessions` store. Exposes Laravel-parity `forUser()` and
 * `continue(convId)` builders.
 *
 * ```ts
 * class Support extends RemembersConversations(StatefulAgent) {
 *   instructions() { return 'You are a helpful support agent.'; }
 * }
 *
 * const support = new Support(ctx, env);
 * await support.forUser(user).prompt('hi'); // new conversation
 * ```
 */
export function RemembersConversations<TBase extends StatefulCtor>(
  Base: TBase,
): TBase & StatefulCtor<RememberingAgent> {
  abstract class RemberingBase extends Base implements Conversational, RemembersConversationsInstance {
    private _userId: string | undefined;
    private _conversationId: ConversationId | undefined;

    get userId(): string | undefined {
      return this._userId;
    }

    get conversationId(): ConversationId | undefined {
      return this._conversationId;
    }

    forUser(user: { id: string }): this {
      this._userId = user.id;
      return this;
    }

    continue(conversationId: ConversationId, opts: { as?: { id: string } } = {}): this {
      this._conversationId = conversationId;
      if (opts.as) this._userId = opts.as.id;
      return this;
    }

    async messages(): Promise<AgentMessage[]> {
      if (!this._conversationId) return [];
      const nodes = await this.sessions.history(this._conversationId);
      return nodes.map((n) => ({ role: n.role, content: n.content }));
    }

    override async prompt(input: string, options: AgentPromptOptions = {}): Promise<AgentResponse> {
      const continuing = !!this._conversationId;
      if (!this._conversationId && this._userId) {
        this._conversationId = await this.sessions.create({ userId: this._userId });
      }

      if (this._conversationId) {
        if (continuing) {
          await dispatchEvent(
            ConversationContinued,
            new ConversationContinued(this.constructor.name, this._conversationId, this._userId),
          );
        } else {
          await dispatchEvent(
            ConversationStarted,
            new ConversationStarted(this.constructor.name, this._conversationId, this._userId),
          );
        }
        await this.sessions.append(this._conversationId, {
          parentId: null,
          role: 'user',
          content: input,
        });
      }

      const response = await super.prompt(input, options);

      if (this._conversationId) {
        await this.sessions.append(this._conversationId, {
          parentId: null,
          role: 'assistant',
          content: response.text,
        });
        return { ...response, conversationId: this._conversationId };
      }
      return response;
    }
  }
  return RemberingBase as unknown as TBase & StatefulCtor<RememberingAgent>;
}

/** Public type alias for an agent class produced by `RemembersConversations(...)`. */
export type RememberingAgent = StatefulAgent & RemembersConversationsInstance;