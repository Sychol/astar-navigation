import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createGraph, crossesInterior, metrics, candidates, treeWindow, aStar} from '../dist/core.js';

const data=JSON.parse(fs.readFileSync(new URL('../dist/coordinates.json',import.meta.url),'utf8'));
const graph=createGraph(data);
assert.equal(graph.edges.length,118,'Independently verified visibility edge count');
assert.deepEqual(graph.adjacency.S,['O1','O2','O5','O6']);
assert.deepEqual(graph.adjacency.O2,['O1','O3','O5','O9','O10','O12','S']);
assert.deepEqual(graph.adjacency.O9,['O2','O3','O5','O8','O10','O11']);
const square=[{x:0,y:0},{x:2,y:0},{x:2,y:2},{x:0,y:2}];
assert.equal(crossesInterior({x:-1,y:1},{x:3,y:1},square),true,'Interior crossing blocked');
assert.equal(crossesInterior({x:0,y:0},{x:2,y:0},square),false,'Boundary travel allowed');
assert.equal(crossesInterior({x:-1,y:1},{x:1,y:3},square),false,'Vertex tangency allowed');
assert.equal(crossesInterior({x:0,y:0},{x:2,y:2},square),true,'Polygon diagonals blocked');
const routeA=metrics(graph,['S','O1','O5']),routeB=metrics(graph,['S','O2','O5']);
assert.equal(routeA.h,routeB.h);assert.ok(routeA.g>routeB.g);
assert.ok(Math.abs(metrics(graph,['S','O2']).g-60.41522986797286)<1e-9);
assert.equal(candidates(graph,['S','O2'])[0].id,'O9');
assert.ok(!candidates(graph,['S','O2']).some(c=>c.id==='S'));
assert.deepEqual(treeWindow(['S']).levels,[null,0,1]);
assert.deepEqual(treeWindow(['S','O2']).levels,[0,1,2]);
assert.deepEqual(treeWindow(['S','O2','O12']),{parent:'O2',current:'O12',levels:[1,2,3]});
const frames=aStar(graph),final=frames.at(-1);
assert.deepEqual(final.current.path,['S','O2','O12','O16','O21','O32','G']);
assert.ok(Math.abs(final.current.g-828.7903424225254)<1e-8,'Independent Dijkstra result');
assert.equal(final.current.h,0);assert.equal(final.done,true);assert.equal(frames.length,18);
assert.deepEqual(candidates(graph,final.current.path),[]);
for(let i=1;i<frames.length;i++)assert.equal(frames[i].current.f,Math.min(...frames[i-1].open.map(c=>c.f)),'Global OPEN minimum');
for(const edge of graph.edges){const ha=metrics(graph,[edge.a]).h,hb=metrics(graph,[edge.b]).h;assert.ok(ha<=edge.cost+hb+1e-9);assert.ok(hb<=edge.cost+ha+1e-9);}

// Independent all-pairs reference: Floyd-Warshall does not use A*, its OPEN
// queue, heuristic, or path reconstruction. Reuse only the visibility graph.
const ids=Object.keys(graph.points),index=new Map(ids.map((id,i)=>[id,i]));
const segmentLength=(a,b)=>Math.hypot(graph.points[a].x-graph.points[b].x,graph.points[a].y-graph.points[b].y);
const shortest=ids.map((a,i)=>ids.map((b,j)=>i===j?0:Infinity));
for(const a of ids)for(const b of graph.adjacency[a])shortest[index.get(a)][index.get(b)]=segmentLength(a,b);
for(let k=0;k<ids.length;k++)for(let i=0;i<ids.length;i++)for(let j=0;j<ids.length;j++){
  shortest[i][j]=Math.min(shortest[i][j],shortest[i][k]+shortest[k][j]);
}
const trueDistance=(a,b)=>shortest[index.get(a)][index.get(b)];
const near=(actual,expected,message)=>assert.ok(Math.abs(actual-expected)<1e-8,`${message}: ${actual} vs ${expected}`);
let pairCount=0;
for(const start of ids)for(const goal of ids){
  if(start===goal){assert.equal(trueDistance(start,goal),0);continue;}
  // The app fixes its endpoint IDs to S/G. Rename this same graph to exercise
  // every endpoint pair through the production aStar function unchanged.
  const renamed=new Map(ids.map(id=>[id,id===start?'S':id===goal?'G':`vertex_${id}`]));
  const original=new Map([...renamed].map(([id,name])=>[name,id]));
  const testGraph={
    points:Object.fromEntries(ids.map(id=>[renamed.get(id),graph.points[id]])),
    adjacency:Object.fromEntries(ids.map(id=>[renamed.get(id),graph.adjacency[id].map(neighbor=>renamed.get(neighbor))]))
  };
  const search=aStar(testGraph),result=search.at(-1),label=`${start} -> ${goal}`;
  assert.equal(result.done,true,`${label} reaches the goal`);
  assert.equal(result.current.id,'G');
  near(result.current.g,trueDistance(start,goal),`${label} matches Floyd-Warshall`);
  const resultPath=result.current.path.map(id=>original.get(id));
  assert.equal(resultPath[0],start);assert.equal(resultPath.at(-1),goal);
  let routeLength=0;
  for(let i=1;i<resultPath.length;i++){
    assert.ok(graph.adjacency[resultPath[i-1]].includes(resultPath[i]),`${label} uses a visible edge`);
    routeLength+=segmentLength(resultPath[i-1],resultPath[i]);
  }
  near(routeLength,result.current.g,`${label} path and stored g agree`);
  for(let i=1;i<search.length;i++){
    near(search[i].current.f,Math.min(...search[i-1].open.map(node=>node.f)),`${label} expands the global OPEN minimum`);
  }
  pairCount++;
}
assert.equal(pairCount,1190);
for(const goal of ids){
  assert.equal(segmentLength(goal,goal),0);
  for(const a of ids){
    assert.ok(segmentLength(a,goal)<=trueDistance(a,goal)+1e-8,`h is admissible from ${a} to ${goal}`);
    for(const b of graph.adjacency[a]){
      assert.ok(segmentLength(a,goal)<=segmentLength(a,b)+segmentLength(b,goal)+1e-8,`h is consistent on ${a} -> ${b} toward ${goal}`);
    }
  }
}

// Regression for the reported route: committing to each local minimum f is
// a manual policy, not A*'s global OPEN search, and need not be optimal.
const manualPath=['S'];
while(manualPath.at(-1)!=='G'&&manualPath.length<ids.length){
  const next=candidates(graph,manualPath)[0];
  assert.ok(next,'The reported local-minimum route has a next candidate');
  manualPath.push(next.id);
}
assert.deepEqual(manualPath,['S','O2','O9','O10','O12','O17','O20','O23','O29','O31','O32','G']);
const manualResult=metrics(graph,manualPath);
near(manualResult.g,933.8630211416822,'Reported manual route length');
assert.ok(manualResult.g>final.current.g,'Local minimum f does not guarantee an optimal final route');
const atO23=manualPath.slice(0,manualPath.indexOf('O23')+1),options=candidates(graph,atO23);
const optionO29=options.find(node=>node.id==='O29'),optionO31=options.find(node=>node.id==='O31');
assert.ok(optionO29&&optionO31,'Both O29 and direct O31 are offered at O23');
assert.ok(graph.adjacency.O23.includes('O31'),'O23 -> O31 is a visible direct connection');
near(optionO29.f,870.6062650886275,'O29 lower estimated total');
near(optionO31.f,901.1384730951979,'O31 higher estimated total');
assert.ok(optionO29.f<optionO31.f);
assert.ok(optionO29.g+trueDistance('O29','G')>optionO31.g+trueDistance('O31','G'),'Lower estimated f may still have a longer actual completion');
const detour=segmentLength('O23','O29')+segmentLength('O29','O31')-segmentLength('O23','O31');
near(detour,26.41420306296709,'O29 detour costs 26.414 more than the direct O23 -> O31 edge');
const shortcutPath=manualPath.filter(id=>id!=='O29');
near(metrics(graph,shortcutPath).g,907.4488180787151,'Removing O29 shortens the reported route');
assert.ok(metrics(graph,shortcutPath).g>final.current.g,'Removing one detour still does not find the global optimum');

// A better route to an existing OPEN node must update its g and its full path.
const o16FrameIndex=frames.findIndex(frame=>frame.current.id==='O16');
assert.ok(o16FrameIndex>0);
const o21Before=frames[o16FrameIndex-1].open.find(node=>node.id==='O21');
const o21After=frames[o16FrameIndex].open.find(node=>node.id==='O21');
assert.ok(o21Before&&o21After);
near(o21Before.g,683.8855429807179,'O21 previous OPEN cost');
near(o21After.g,580.3153343725464,'O21 improved OPEN cost');
assert.deepEqual(o21Before.path,['S','O2','O12','O17','O20','O21']);
assert.deepEqual(o21After.path,['S','O2','O12','O16','O21']);
near(o21After.f,o21After.g+o21After.h,'Improved OPEN candidate has matching f');
assert.equal(o21Before.h,o21After.h,'Heuristic depends on state, not arrival path');

// The visualization must use actual relaxed children and the same OPEN costs.
for(const frame of frames){
  for(const child of frame.updates){
    assert.equal(child.path.at(-2),frame.current.id,'Displayed child belongs to the current expansion');
    assert.deepEqual(child,frame.open.find(node=>node.id===child.id),'Tree child and global OPEN have identical costs and path');
    const recomputed=metrics(graph,child.path);
    near(child.g,recomputed.g,'Displayed child g is path-dependent');
    near(child.f,recomputed.f,'Displayed child f agrees with its path');
  }
}
assert.deepEqual(final.updates,[],'Finished search has no selectable successors');

console.log(`PASS: geometry, costs, three-level tree, ${pairCount} A* endpoint pairs against Floyd-Warshall, heuristic admissibility/consistency, manual-route detour, and OPEN cost/path updates. Optimal S -> G: ${final.current.g.toFixed(10)}.`);
