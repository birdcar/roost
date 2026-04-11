import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { exists } from 'node:fs/promises';
import { toKebabCase } from '../utils.js';
import { run } from '../process.js';

export async function newProject(name: string, flags: Record<string, boolean> = {}): Promise<void> {
  const dir = join(process.cwd(), name);
  const kebab = toKebabCase(name);

  if (await exists(dir)) {
    if (!flags['force']) {
      console.error(`Directory "${name}" already exists. Use --force to overwrite.`);
      process.exit(1);
    }
  }

  console.log(`\n  Creating Roost project: ${name}\n`);

  await mkdir(join(dir, 'app', 'routes'), { recursive: true });
  await mkdir(join(dir, 'app', 'models'), { recursive: true });
  await mkdir(join(dir, 'app', 'agents'), { recursive: true });
  await mkdir(join(dir, 'config'), { recursive: true });
  await mkdir(join(dir, 'database', 'migrations'), { recursive: true });
  await mkdir(join(dir, 'database', 'seeders'), { recursive: true });
  await mkdir(join(dir, 'tests'), { recursive: true });

  const deps: Record<string, string> = {
    '@roost/core': 'latest',
    '@roost/cloudflare': 'latest',
    '@roost/start': 'latest',
    '@roost/auth': 'latest',
    '@roost/orm': 'latest',
    '@tanstack/react-router': 'latest',
    '@tanstack/react-start': 'latest',
    'react': '^19.0.0',
    'react-dom': '^19.0.0',
  };

  if (flags['with-ai']) {
    deps['@roost/ai'] = 'latest';
    deps['@roost/mcp'] = 'latest';
    deps['@roost/schema'] = 'latest';
  }
  if (flags['with-billing']) {
    deps['@roost/billing'] = 'latest';
  }
  if (flags['with-queue']) {
    deps['@roost/queue'] = 'latest';
  }

  const pkg = {
    name: kebab,
    private: true,
    type: 'module',
    scripts: {
      dev: 'vite dev',
      build: 'vite build',
      preview: 'vite preview',
      typecheck: 'tsc --noEmit',
    },
    dependencies: deps,
    devDependencies: {
      '@types/react': '^19.0.0',
      '@types/react-dom': '^19.0.0',
      '@vitejs/plugin-react': '^4.5.0',
      typescript: '^5.8.0',
      vite: '^6.3.0',
      'vite-tsconfig-paths': '^5.1.0',
      wrangler: '^4.0.0',
      '@cloudflare/vite-plugin': '^1.31.0',
    },
  };

  await writeFile(join(dir, 'package.json'), JSON.stringify(pkg, null, 2) + '\n');

  await writeFile(join(dir, 'tsconfig.json'), JSON.stringify({
    compilerOptions: {
      strict: true,
      target: 'ES2022',
      module: 'ESNext',
      moduleResolution: 'bundler',
      jsx: 'react-jsx',
      skipLibCheck: true,
      esModuleInterop: true,
      forceConsistentCasingInFileNames: true,
      isolatedModules: true,
      verbatimModuleSyntax: true,
      lib: ['ES2022', 'DOM', 'DOM.Iterable'],
      types: ['vite/client'],
    },
    include: ['app/**/*.ts', 'app/**/*.tsx', 'vite.config.ts'],
  }, null, 2) + '\n');

  await writeFile(join(dir, 'vite.config.ts'), `import { defineConfig } from 'vite';
import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import viteTsConfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  server: { port: 3000 },
  plugins: [tanstackStart(), viteTsConfigPaths()],
});
`);

  await writeFile(join(dir, 'wrangler.jsonc'), JSON.stringify({
    $schema: 'node_modules/wrangler/config-schema.json',
    name: kebab,
    compatibility_date: new Date().toISOString().split('T')[0],
    compatibility_flags: ['nodejs_compat'],
    main: '@tanstack/react-start/server-entry',
    observability: { enabled: true },
  }, null, 2) + '\n');

  await writeFile(join(dir, '.gitignore'), `node_modules/
dist/
.wrangler/
.dev.vars
*.tsbuildinfo
`);

  await writeFile(join(dir, '.dev.vars'), `WORKOS_API_KEY=
WORKOS_CLIENT_ID=
`);

  await writeFile(join(dir, 'app', 'routes', 'index.tsx'), `import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/')({
  component: HomePage,
});

function HomePage() {
  return (
    <div style={{ fontFamily: 'system-ui', padding: '2rem', maxWidth: '600px', margin: '0 auto' }}>
      <h1>${name}</h1>
      <p>Built with Roost — the Laravel of Cloudflare Workers.</p>
    </div>
  );
}
`);

  await writeFile(join(dir, 'config', 'app.ts'), `export default {
  name: '${name}',
  env: process.env.NODE_ENV ?? 'development',
};
`);

  await writeFile(join(dir, 'config', 'database.ts'), `export default {
  default: 'd1',
  d1Binding: 'DB',
};
`);

  await writeFile(join(dir, 'config', 'auth.ts'), `export default {
  workos: {
    clientId: process.env.WORKOS_CLIENT_ID ?? '',
    callbackUrl: '/auth/callback',
  },
  session: {
    kvBinding: 'SESSION_KV',
  },
};
`);

  console.log('  Project created successfully!\n');
  console.log(`  cd ${name}`);
  console.log('  bun install');
  console.log('  bun run dev\n');
}
