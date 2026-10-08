import { homedir } from 'node:os';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
export const dataRoot =
  process.env.LOCAL_LENS_DATA_DIR || join(homedir(), 'Library/Application Support/Local Lens');
export const managedModelRoot = join(dataRoot, 'models');
export const sourceTranslationRoot = fileURLToPath(
  new URL('./translation-models/', import.meta.url),
);
export function translationRoot(direction) {
  const stored = join(dataRoot, 'translation-models');
  return existsSync(join(stored, 'opus-mt-' + direction, 'config.json'))
    ? stored
    : sourceTranslationRoot;
}
