/*
 * root config avoids discovery issues.
 * resolves plugins by running in workspace.
 */
import path from 'node:path';

const WORKSPACES = ['backend', 'frontend', 'mobile'];
const isCode = (file) => /\.(ts|tsx|js|jsx|cjs|mjs)$/.test(file);

export default (files) => {
  const root = process.cwd();
  return WORKSPACES.flatMap((workspace) => {
    const dir = path.join(root, workspace);
    const picked = files
      .map((file) => path.resolve(root, file))
      .filter((file) => isCode(file) && file.startsWith(dir + path.sep));
    if (!picked.length) return [];
    const rel = picked.map((file) => path.relative(dir, file)).join(' ');
    return `bash -c 'cd ${workspace} && npx --no-install eslint --no-warn-ignored ${rel}'`;
  });
};
