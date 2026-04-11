import { readdir, readFile, mkdir, writeFile, exists } from 'node:fs/promises';
import { join, dirname } from 'node:path';

export function renderTemplate(templateStr: string, vars: Record<string, unknown>): string {
  return templateStr.replace(/<%=\s*(\w+)\s*%>/g, (_, key) => {
    return String(vars[key] ?? '');
  });
}

export async function generateFile(
  templatePath: string,
  outputPath: string,
  vars: Record<string, unknown>
): Promise<void> {
  if (await exists(outputPath)) {
    throw new Error(`File already exists: ${outputPath}`);
  }

  const template = await readFile(templatePath, 'utf-8');
  const content = await renderTemplate(template, vars);

  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, content, 'utf-8');
}

export async function copyDir(
  srcDir: string,
  destDir: string,
  vars: Record<string, unknown>
): Promise<void> {
  await mkdir(destDir, { recursive: true });

  const entries = await readdir(srcDir, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = join(srcDir, entry.name);
    const destName = entry.name.replace(/\.ejs$/, '');
    const destPath = join(destDir, destName);

    if (entry.isDirectory()) {
      await copyDir(srcPath, destPath, vars);
    } else if (entry.name.endsWith('.ejs')) {
      const template = await readFile(srcPath, 'utf-8');
      const content = await renderTemplate(template, vars);
      await writeFile(destPath, content, 'utf-8');
    } else {
      const content = await readFile(srcPath);
      await writeFile(destPath, content);
    }
  }
}
