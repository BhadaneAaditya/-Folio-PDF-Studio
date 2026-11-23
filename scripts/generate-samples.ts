import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createAllSamples } from '../src/core/samples';

const output = resolve(process.cwd(), 'samples');
await mkdir(output, { recursive: true });
for (const sample of await createAllSamples()) {
  await writeFile(resolve(output, sample.name), sample.bytes);
  console.log(`Wrote ${sample.name}`);
}
