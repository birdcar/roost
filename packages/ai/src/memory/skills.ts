import type { Tool } from '../tool.js';

export interface SkillDescriptor {
  name: string;
  description: string;
  load: () => Promise<Tool> | Tool;
}

export class SkillRegistrationCycleError extends Error {
  override readonly name = 'SkillRegistrationCycleError';
  constructor(chain: string[]) {
    super(`Skill registration cycle detected: ${chain.join(' → ')}`);
  }
}

/**
 * On-demand skills tier. Skills are declared as `SkillDescriptor` with a lazy
 * `load()` — calling `tools()` materialises only the skills whose names match
 * the requested filter. Depth-limited to prevent registration cycles.
 */
export class SkillsMemory {
  private readonly descriptors = new Map<string, SkillDescriptor>();
  private readonly loaded = new Map<string, Tool>();
  private resolving: string[] = [];

  register(skill: SkillDescriptor): this {
    this.descriptors.set(skill.name, skill);
    return this;
  }

  list(): SkillDescriptor[] {
    return Array.from(this.descriptors.values());
  }

  async tools(filter?: string[]): Promise<Tool[]> {
    const names = filter ?? Array.from(this.descriptors.keys());
    const out: Tool[] = [];
    for (const name of names) {
      const tool = await this.loadSkill(name);
      if (tool) out.push(tool);
    }
    return out;
  }

  async loadSkill(name: string): Promise<Tool | undefined> {
    if (this.loaded.has(name)) return this.loaded.get(name);
    if (this.resolving.includes(name)) {
      throw new SkillRegistrationCycleError([...this.resolving, name]);
    }
    const descriptor = this.descriptors.get(name);
    if (!descriptor) return undefined;
    if (this.resolving.length >= 8) {
      throw new SkillRegistrationCycleError([...this.resolving, name]);
    }
    this.resolving.push(name);
    try {
      const tool = await descriptor.load();
      this.loaded.set(name, tool);
      return tool;
    } finally {
      this.resolving.pop();
    }
  }

  unload(name: string): void {
    this.loaded.delete(name);
  }
}
