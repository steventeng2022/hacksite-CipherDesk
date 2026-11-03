import {mkdir,cp,readFile} from 'node:fs/promises';
for(const file of ['index.html','app.mjs','engine.mjs','fixtures.mjs','catalog.mjs','styles.css','icons.mjs','favicon.svg','runtime.json'])await readFile(new URL('../public/'+file,import.meta.url));
await mkdir(new URL('../dist/',import.meta.url),{recursive:true});
await cp(new URL('../public/',import.meta.url),new URL('../dist/',import.meta.url),{recursive:true});
console.log('Built CipherDesk static browser lab in dist/.');
