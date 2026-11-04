import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = fileURLToPath(new URL('../dist', import.meta.url));
const types = { '.html':'text/html; charset=utf-8','.css':'text/css','.js':'text/javascript','.png':'image/png','.gif':'image/gif','.svg':'image/svg+xml','.xml':'application/xml' };
http.createServer(async (req,res) => {
  const url = new URL(req.url,'http://localhost');
  if(url.pathname==='/') {res.writeHead(302,{Location:'/kairos/'});res.end();return;}
  let name=decodeURIComponent(url.pathname);
  if(name==='/kairos'||name.endsWith('/'))name+='/index.html';
  const file=path.resolve(root,'.'+name);
  if(!file.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}
  try{const data=await readFile(file);res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream'});res.end(data);}
  catch{res.writeHead(404);res.end('Not found');}
}).listen(4173,'127.0.0.1',()=>console.log('Kairos preview: http://127.0.0.1:4173/kairos/'));
