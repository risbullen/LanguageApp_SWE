// Fails the build if any language pack does not match the schema.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Pack } from '../src/content/schema';

const dir = join(import.meta.dirname, '../src/content/packs');
let failed = false;
for (const file of readdirSync(dir).filter((f) => f.endsWith('.json'))) {
  const res = Pack.safeParse(JSON.parse(readFileSync(join(dir, file), 'utf8')));
  if (res.success) console.log(`✓ ${file}: ${res.data.lexicon.length} words, ${res.data.units.length} units`);
  else {
    failed = true;
    console.error(`✗ ${file}`);
    for (const i of res.error.issues) console.error(`   ${i.path.join('.')}: ${i.message}`);
  }
}
process.exit(failed ? 1 : 0);
