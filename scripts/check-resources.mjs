import fs from 'node:fs';
import assert from 'node:assert/strict';
const manifest=JSON.parse(fs.readFileSync('module.json','utf8')).scenario_tests;
for(const [id,entries]of Object.entries(manifest)){assert(entries.length,id);for(const ref of entries){const [file,name]=ref.split('#');assert(fs.readFileSync(file,'utf8').includes(name),ref)}}
console.log(`PASS: ${Object.keys(manifest).length} resource client scenarios`);
