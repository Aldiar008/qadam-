// Flags <form> elements nested inside another <form>. The HTML parser drops the
// inner tag, so its buttons submit the outer form instead — and React's
// hydration fails because the server string and the parsed DOM differ.
import { globSync, readFileSync } from 'node:fs';

const files = globSync('src/**/*.tsx');
let found = 0;
for (const file of files) {
  // JSX comments are stripped first so a comment that mentions the tag by name
  // cannot masquerade as a real one.
  const src = readFileSync(file, 'utf8').replace(/\{\/\*[\s\S]*?\*\/\}/g, '');
  let depth = 0;
  const lines = src.split('\n');
  for (let i = 0; i < lines.length; i += 1) {
    for (const token of lines[i].match(/<form\b|<\/form>/g) ?? []) {
      if (token === '</form>') depth -= 1;
      else {
        depth += 1;
        if (depth > 1) {
          console.log(`${file}:${i + 1}  <form> nested ${depth} deep`);
          found += 1;
        }
      }
    }
  }
}
console.log(found === 0 ? 'no nested forms' : `${found} nested form(s)`);
process.exit(found === 0 ? 0 : 1);
