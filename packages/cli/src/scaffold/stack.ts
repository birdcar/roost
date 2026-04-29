export const scaffoldStack = {
  node: '>=20.19.0',
  dependencies: {
    '@tanstack/react-router': '1.168.23',
    '@tanstack/react-start': '1.167.42',
    'drizzle-orm': '^0.44.0',
    react: '^19.0.0',
    'react-dom': '^19.0.0',
  },
  devDependencies: {
    '@types/react': '^19.0.0',
    '@types/react-dom': '^19.0.0',
    '@vitejs/plugin-react': '5.1.4',
    typescript: '^5.8.0',
    vite: '7.3.2',
    'vite-tsconfig-paths': '5.1.4',
    wrangler: '4.84.1',
    '@cloudflare/vite-plugin': '1.33.1',
  },
} as const;
