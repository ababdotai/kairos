import { mkdir, cp, rm } from 'node:fs/promises';
const root = new URL('../', import.meta.url);
await rm(new URL('dist', root), { recursive: true, force: true });
await mkdir(new URL('dist/kairos', root), { recursive: true });
await cp(new URL('public', root), new URL('dist/kairos', root), { recursive: true });
console.log('Built website/dist/kairos');
