import { existsSync, readdirSync } from 'node:fs';
import { defineConfig } from 'vitest/config';

/**
 * The candidate evals compare candidates with the booklet questions they are modelled on, and the booklet
 * files are private (content/booklets is gitignored). Without them nothing here means anything, so stop
 * at once, with one message, rather than fail obscurely file by file.
 */
const booklets = new URL('./content/booklets/', import.meta.url);
if (!existsSync(booklets) || !readdirSync(booklets).some((f) => f.endsWith('.json'))) {
  throw new Error('The candidate evals need the private booklet source set in content/booklets (and its redrawn exhibits in content/exhibits).');
}

/** The candidate evals: `npm run eval:candidates`. They score questions waiting in `content/candidates`; they are not part of `npm test`. */
export default defineConfig({
  test: {
    include: ['evals/**/*.eval.ts'],
    environment: 'node',
  },
});
