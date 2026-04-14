import { describe, test, expect } from 'bun:test';
import { HtmlTransformer } from '../src/html/transformer';

function htmlResponse(html: string): Response {
  return new Response(html, { headers: { 'Content-Type': 'text/html' } });
}

describe('HtmlTransformer — injectScript', () => {
  test('injectScript("head") appends <script> tag before </head>', async () => {
    const html = '<html><head><title>Test</title></head><body></body></html>';
    const result = await new HtmlTransformer()
      .injectScript('/analytics.js', 'head')
      .transform(htmlResponse(html))
      .text();

    expect(result).toContain('<script src="/analytics.js"></script>');
    expect(result.indexOf('<script src="/analytics.js"></script>')).toBeLessThan(
      result.indexOf('</head>')
    );
  });

  test('injectScript("body") appends <script> tag before </body>', async () => {
    const html = '<html><head></head><body><p>Content</p></body></html>';
    const result = await new HtmlTransformer()
      .injectScript('/app.js', 'body')
      .transform(htmlResponse(html))
      .text();

    expect(result).toContain('<script src="/app.js"></script>');
    expect(result.indexOf('<script src="/app.js"></script>')).toBeLessThan(
      result.indexOf('</body>')
    );
  });

  test('injectScript defaults to "head" when position is omitted', async () => {
    const html = '<html><head></head><body></body></html>';
    const result = await new HtmlTransformer()
      .injectScript('/default.js')
      .transform(htmlResponse(html))
      .text();

    expect(result).toContain('<script src="/default.js"></script>');
    expect(result.indexOf('<script src="/default.js"></script>')).toBeLessThan(
      result.indexOf('</head>')
    );
  });
});

describe('HtmlTransformer — setMetaTag', () => {
  test('updates content on an existing <meta name="..."> element', async () => {
    const html =
      '<html><head><meta name="description" content="Old"></head><body></body></html>';
    const result = await new HtmlTransformer()
      .setMetaTag('description', 'New description')
      .transform(htmlResponse(html))
      .text();

    expect(result).toContain('content="New description"');
    expect(result).not.toContain('content="Old"');
  });

  test('injects a new <meta> tag when the element does not exist', async () => {
    const html = '<html><head><title>Test</title></head><body></body></html>';
    const result = await new HtmlTransformer()
      .setMetaTag('og:title', 'My Title')
      .transform(htmlResponse(html))
      .text();

    expect(result).toContain('<meta name="og:title" content="My Title">');
  });
});

describe('HtmlTransformer — replaceElement', () => {
  test('replaces inner HTML of matching elements', async () => {
    const html = '<html><body><div id="hero"><h1>Old</h1></div></body></html>';
    const result = await new HtmlTransformer()
      .replaceElement('#hero', '<h1>New</h1>')
      .transform(htmlResponse(html))
      .text();

    expect(result).toContain('<h1>New</h1>');
    expect(result).not.toContain('<h1>Old</h1>');
  });

  test('replaces multiple matching elements when selector matches more than one', async () => {
    const html =
      '<html><body><p class="item">A</p><p class="item">B</p></body></html>';
    const result = await new HtmlTransformer()
      .replaceElement('p.item', 'Replaced')
      .transform(htmlResponse(html))
      .text();

    const matches = [...result.matchAll(/Replaced/g)];
    expect(matches.length).toBe(2);
    expect(result).not.toContain('>A<');
    expect(result).not.toContain('>B<');
  });
});

describe('HtmlTransformer — removeElement', () => {
  test('removes matching elements from the document', async () => {
    const html = '<html><body><div class="ads">Ad content</div><p>Keep</p></body></html>';
    const result = await new HtmlTransformer()
      .removeElement('.ads')
      .transform(htmlResponse(html))
      .text();

    expect(result).not.toContain('Ad content');
    expect(result).toContain('Keep');
  });

  test('is a no-op when selector matches nothing', async () => {
    const html = '<html><body><p>Content</p></body></html>';
    const result = await new HtmlTransformer()
      .removeElement('.nonexistent')
      .transform(htmlResponse(html))
      .text();

    expect(result).toContain('<p>Content</p>');
  });
});

describe('HtmlTransformer — abTest', () => {
  test('applies the correct variant content based on the assignment function', async () => {
    const html = '<html><body><div id="hero"><h1>Default</h1></div></body></html>';
    const request = new Request('https://example.com/', {
      headers: { 'cf-ipcountry': 'US' },
    });

    const result = await new HtmlTransformer()
      .abTest(
        '#hero',
        { control: '<h1>Control</h1>', variant: '<h1>Variant</h1>' },
        (req) => (req.headers.get('cf-ipcountry') === 'US' ? 'variant' : 'control')
      )
      .transform(htmlResponse(html), request)
      .text();

    expect(result).toContain('<h1>Variant</h1>');
    expect(result).not.toContain('<h1>Control</h1>');
  });

  test('throws when transform is called without a request argument when abTest is registered', () => {
    const transformer = new HtmlTransformer().abTest(
      '#hero',
      { control: '<h1>Control</h1>' },
      () => 'control'
    );

    expect(() => transformer.transform(htmlResponse('<html><body></body></html>'))).toThrow(
      'request is required when using abTest'
    );
  });
});

describe('HtmlTransformer — transform', () => {
  test('returns a streaming Response (not buffered)', async () => {
    const html = '<html><body></body></html>';
    const response = new HtmlTransformer().transform(htmlResponse(html));

    expect(response).toBeInstanceOf(Response);
    expect(response.body).not.toBeNull();
  });
});

describe('HtmlTransformer — chaining', () => {
  test('chaining multiple methods applies all transforms', async () => {
    const html =
      '<html><head><meta name="description" content="Old"></head><body><div id="cta">Buy</div></body></html>';
    const request = new Request('https://example.com/');

    const result = await new HtmlTransformer()
      .injectScript('/analytics.js', 'head')
      .setMetaTag('description', 'Updated')
      .replaceElement('#cta', '<a href="/signup">Sign up</a>')
      .transform(htmlResponse(html), request)
      .text();

    expect(result).toContain('<script src="/analytics.js"></script>');
    expect(result).toContain('content="Updated"');
    expect(result).toContain('<a href="/signup">Sign up</a>');
    expect(result).not.toContain('>Buy<');
  });
});
