/**
 * Must be imported first from server/index.ts so process.env is populated
 * before config, routes, or the Gemini SDK read any variables.
 */
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

const envCandidates = [
  path.resolve(__dirname, '../.env'), // server/loadEnv.ts (ts-node) → repo root
  path.resolve(__dirname, '../../.env'), // dist/server/loadEnv.js → repo root
  path.resolve(process.cwd(), '.env'),
];

let loadedFrom: string | undefined;
for (const candidate of envCandidates) {
  if (!fs.existsSync(candidate)) continue;
  dotenv.config({ path: candidate });
  loadedFrom = candidate;
  break;
}

if (!loadedFrom) {
  dotenv.config();
}

if (!process.env.GEMINI_API_KEY) {
  console.error(
    'CRITICAL ERROR: Server failed to locate or read GEMINI_API_KEY from environment variables.'
  );
} else if (loadedFrom) {
  console.log(`[loadEnv] Loaded .env from ${loadedFrom}`);
}
