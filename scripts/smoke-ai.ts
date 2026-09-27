// Usage: EDU_I18N_AI_SMOKE=1 npm run smoke:ai (with B_API_KEY set; EDU_I18N_AI_BASE_URL and EDU_I18N_AI_MODEL try
// another address or model). The live smoke test of the AI, never in CI: it costs tokens. Exit code 1 when the key is
// unusable or a request fails; the report shows no key and no text.
import { smokeAi } from './lib/smokeAi';

void smokeAi(process.env, globalThis.fetch, (line) => console.log(line)).then((code) => {
  process.exitCode = code;
});
