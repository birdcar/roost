export type ScriptPosition = 'head' | 'body';

export interface AbVariant {
  content: string;
  weight: number;
}

export class HtmlTransformer {
  private rewriter: HTMLRewriter;
  private hasAbTest = false;

  constructor() {
    this.rewriter = new HTMLRewriter();
  }

  injectScript(src: string, position: ScriptPosition = 'head'): this {
    const tag = `<script src="${src}"></script>`;
    this.rewriter.on(position, {
      element(el) {
        // append places the tag at the end of the element's content,
        // immediately before the closing tag — the conventional injection point.
        el.append(tag, { html: true });
      },
    });
    return this;
  }

  setMetaTag(name: string, content: string): this {
    let found = false;
    this.rewriter.on(`meta[name="${name}"]`, {
      element(el) {
        found = true;
        el.setAttribute('content', content);
      },
    });
    this.rewriter.on('head', {
      element(el) {
        // append runs after the meta selector handler, so `found` is accurate.
        el.append('', { html: true }); // no-op placeholder to keep handler registered
        el.onEndTag((end) => {
          if (!found) {
            end.before(`<meta name="${name}" content="${content}">`, { html: true });
          }
        });
      },
    });
    return this;
  }

  replaceElement(selector: string, html: string): this {
    this.rewriter.on(selector, {
      element(el) {
        el.setInnerContent(html, { html: true });
      },
    });
    return this;
  }

  removeElement(selector: string): this {
    this.rewriter.on(selector, {
      element(el) {
        el.remove();
      },
    });
    return this;
  }

  abTest(
    selector: string,
    variants: Record<string, string>,
    assignmentFn: (request: Request) => string
  ): this {
    this.hasAbTest = true;
    // Store a reference we'll fill in at transform time
    const state = { request: null as Request | null };
    this.rewriter.on(selector, {
      element(el) {
        if (!state.request) return;
        const variantKey = assignmentFn(state.request);
        const html = variants[variantKey];
        if (html) {
          el.setInnerContent(html, { html: true });
        }
      },
    });
    // Expose the state object so transform() can fill it in
    (this as any).__abTestStates = [...((this as any).__abTestStates ?? []), state];
    return this;
  }

  transform(response: Response, request?: Request): Response {
    if (this.hasAbTest && !request) {
      throw new Error(
        'request is required when using abTest — pass the request to transform(response, request)'
      );
    }
    if (request) {
      for (const state of (this as any).__abTestStates ?? []) {
        state.request = request;
      }
    }
    return this.rewriter.transform(response);
  }
}
