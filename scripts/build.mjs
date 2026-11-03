import {mkdir,cp,readFile,rm} from 'node:fs/promises';
const required=['index.html','app.mjs','engine.mjs','fixtures.mjs','catalog.mjs','styles.css','icons.mjs','favicon.svg','runtime.json'];
for(const file of required) await readFile(new URL('../public/'+file,import.meta.url));
await rm(new URL('../dist/',import.meta.url),{recursive:true,force:true});
await mkdir(new URL('../dist/',import.meta.url),{recursive:true});
await cp(new URL('../public/',import.meta.url),new URL('../dist/',import.meta.url),{recursive:true});
console.log('Built CipherDesk static browser lab in dist/.');
