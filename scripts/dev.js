// "npm run dev" at the project root: starts the API (port 5000) and the React app (port 5173) together.
// Stopping one (or pressing Ctrl+C) stops both.
import { spawn } from 'node:child_process';

const children = [];

function run(name, folder) {
  const child = spawn('npm', ['run', 'dev'], { cwd: folder, stdio: 'inherit', shell: true });
  child.on('exit', (code) => {
    console.log(`[${name}] stopped (exit code ${code})`);
    children.forEach((c) => c.kill());
    process.exit(code ?? 0);
  });
  children.push(child);
}

run('api', 'server');
run('web', 'client');
