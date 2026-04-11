interface RunResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export async function run(command: string, args: string[], options?: { cwd?: string; silent?: boolean }): Promise<RunResult> {
  const proc = Bun.spawn([command, ...args], {
    cwd: options?.cwd,
    stdout: options?.silent ? 'pipe' : 'inherit',
    stderr: options?.silent ? 'pipe' : 'inherit',
  });

  const exitCode = await proc.exited;

  let stdout = '';
  let stderr = '';

  if (options?.silent) {
    stdout = proc.stdout ? await new Response(proc.stdout).text() : '';
    stderr = proc.stderr ? await new Response(proc.stderr).text() : '';
  }

  return { exitCode, stdout, stderr };
}
