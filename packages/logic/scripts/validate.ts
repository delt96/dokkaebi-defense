import { loadGameData } from '../src/data';
import { validateData } from '../src/validate';

const { errors, warnings } = validateData(loadGameData());
console.log(`errors: ${errors.length}`);
for (const e of errors) console.log(`  error: ${e}`);
console.log(`warnings: ${warnings.length}`);
for (const w of warnings) console.log(`  warning: ${w}`);
if (errors.length) process.exitCode = 1;
