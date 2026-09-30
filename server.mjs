import http from 'node:http';
import {readFile} from 'node:fs/promises';
const files = new Map([['/','index.html'],['/index.html','index.html'],['/app.js','app.js'],['/core.js','core.js'],['/styles.css','styles.css'],['/coordinates.json','coordinates.json']]);
const types = {html:'text/html; charset=utf-8', js:'text/javascript; charset=utf-8', css:'text/css; charset=utf-8', json:'application/json; charset=utf-8'};
const server=http.createServer(async(req,res)=>{
  const name=files.get(new URL(req.url,'http://localhost').pathname);
  if(!name){res.writeHead(404);res.end('Not found');return;}
  try{const content=await readFile(new URL(`./dist/${name}`,import.meta.url));res.writeHead(200,{'Content-Type':types[name.split('.').pop()]});res.end(content);}
  catch{res.writeHead(500);res.end('Unable to read asset');}
});
server.listen(4173,'127.0.0.1',()=>console.log('A* 경로 탐색 실습: http://127.0.0.1:4173 (종료: Ctrl+C)'));
