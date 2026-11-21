import { loadGameData } from '../src/data';
import { validateData } from '../src/validate';

for (const stage of ['stage1', 'stage2', 'stage3'] as const) {
  const { errors, warnings } = validateData(loadGameData(stage));
  console.log(`${stage} errors: ${errors.length}`);
  for (const e of errors) console.log(`  error: ${e}`);
  console.log(`${stage} warnings: ${warnings.length}`);
  for (const w of warnings) console.log(`  warning: ${w}`);
  if (errors.length) process.exitCode = 1;
}
