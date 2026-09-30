import { createGraph, metrics, candidates, treeWindow, aStar, compareSearchNodes } from './core.js';

const $ = selector => document.querySelector(selector);
const data = await fetch('./coordinates.json').then(response => { if (!response.ok) throw new Error('좌표 데이터를 읽지 못했습니다.'); return response.json(); });
const graph = createGraph(data), frames = aStar(graph);
const optimal = frames.at(-1).done ? frames.at(-1).current : null;
const state = { path: ['S'], mode: 'astar', frame: 0, sort: 'f', showEdges: true, showCost: true, showCoordinates: true, hover: null, treeFit: false, zoom: { map: 1, tree: 1 } };
const fmt = n => n.toFixed(2), natural = (a, b) => a.localeCompare(b, undefined, { numeric: true });
const currentPath = () => state.mode === 'astar' ? frames[state.frame].current.path : state.path;
const getCurrent = () => metrics(graph, currentPath());
const getCandidates = () => state.mode === 'manual' ? candidates(graph, currentPath()) : frames[state.frame].updates.slice();
const getSiblings = () => currentPath().length < 2 ? [] : candidates(graph, currentPath().slice(0, -1)).filter(node => node.id !== currentPath().at(-1));
const getMapCandidates = () => state.mode === 'manual' ? getCandidates() : frames[state.frame].done ? [] : frames[state.frame].open;
const nextExpansion = () => state.mode === 'astar' && !frames[state.frame].done ? frames[state.frame].open[0] : null;
const highlightedId = () => state.mode === 'manual' ? getCandidates()[0]?.id : nextExpansion()?.id;
const minimumLabel = () => state.mode === 'manual' ? '이웃 최소 f' : '다음 확장';
const point = id => ({ x: graph.points[id].x + 60, y: 480 - graph.points[id].y });
const escape = value => String(value).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
function announce(message, success = false) { $('#notice').textContent = message; $('#notice').classList.toggle('success', success); }
function goalMessage() {
  const current = getCurrent();
  if (state.mode === 'astar') return `A* 최단경로 확정 · 총 거리 ${fmt(current.g)} · ${state.frame + 1}회 확장`;
  const extra = current.g - optimal.g;
  return `직접 선택 경로 ${fmt(current.g)} · A* 최단거리 ${fmt(optimal.g)} · ${extra > 1e-8 ? `${fmt(extra)}만큼 더 깁니다.` : '최단거리와 같습니다.'}`;
}
function selectNode(id) {
  if (state.mode !== 'manual') return false;
  const choice = getCandidates().find(candidate => candidate.id === id);
  if (!choice) return false;
  state.path.push(id); state.hover = null; render();
  announce(id === 'G' ? goalMessage() : `${id}를 선택했습니다. 이웃 최소 f는 최적 이동을 보장하지 않습니다.`, id === 'G');
  return true;
}
function rewind(index) {
  if (state.mode !== 'manual' || index < 0 || index >= state.path.length) return;
  state.path = state.path.slice(0, index + 1); state.hover = null; render(); announce(`${state.path.at(-1)}까지의 경로로 돌아왔습니다.`);
}
function selectSibling(id) {
  if (state.mode !== 'manual') return false;
  const choice = getSiblings().find(node => node.id === id);
  if (!choice) return false;
  state.path = [...choice.path]; state.hover = null; render();
  announce(id === 'G' ? goalMessage() : `부모 ${choice.path.at(-2)}에서 ${id}로 가지를 바꿨습니다.`, id === 'G');
  return true;
}
function reset() {
  state.path = ['S']; state.frame = 0; state.hover = null; state.zoom = { map: 1, tree: 1 }; render();
  announce(state.mode === 'manual' ? 'S에서 다음 노드를 선택해 탐색을 시작하세요.' : 'S를 확장했습니다. 전체 OPEN 후보에서 최소 f를 선택합니다.');
}
function stepAStar() {
  if (state.mode !== 'astar' || state.frame >= frames.length - 1) return false;
  state.frame++; state.hover = null; render();
  const frame = frames[state.frame];
  announce(frame.done ? `A*가 최단경로를 찾았습니다. 총 거리 ${fmt(frame.current.g)}, ${frames.length}회 확장입니다.` : `${frame.current.id}를 확장했습니다. 다음 확장은 전체 OPEN 후보의 최소 f를 기준으로 합니다.`, frame.done);
  return true;
}
function showOptimalPath() {
  state.mode = 'astar'; state.frame = frames.length - 1; state.hover = null;
  render(); announce(goalMessage(), true);
}
function costText(c, x, y, fontSize = 12) {
  return `<text x="${x}" y="${y}" class="cost-label" font-size="${fontSize}"><tspan font-weight="700" fill="#1b355b">${fmt(c.f)}</tspan><tspan fill="#8090a7"> ≈ </tspan><tspan fill="#245be5">${fmt(c.g)}</tspan><tspan fill="#8090a7"> + </tspan><tspan fill="#078f84">${fmt(c.h)}</tspan></text>`;
}
function renderMap() {
  const svg = $('#map'), path = currentPath(), current = path.at(-1), list = getMapCandidates(), candidateIds = new Set(list.map(c => c.id)), best = highlightedId();
  svg.setAttribute('viewBox', '0 0 1120 550');
  svg.style.width = `${state.zoom.map * 100}%`; svg.style.height = `${state.zoom.map * 100}%`; svg.style.minWidth = '0';
  let html = `<defs><marker id="map-arrow" markerWidth="6" markerHeight="6" refX="4.4" refY="3" orient="auto" markerUnits="strokeWidth"><path d="M0 0 5 3 0 6" fill="#245be5"/></marker></defs><rect x="60" y="70" width="1000" height="410" fill="#fbfdff"/>`;
  for (let x = 0; x <= 1000; x += 20) html += `<line x1="${60+x}" y1="70" x2="${60+x}" y2="480" stroke="${x%100 ? '#eff3f8' : '#dde6f1'}" stroke-width=".7"/>${x%100 ? '' : `<text x="${60+x}" y="501" text-anchor="middle" class="axis-label">${x}</text>`}`;
  for (let y = 0; y <= 410; y += 10) html += `<line x1="60" y1="${480-y}" x2="1060" y2="${480-y}" stroke="${y%50 ? '#eff3f8' : '#dde6f1'}" stroke-width=".7"/>${y%50 ? '' : `<text x="48" y="${484-y}" text-anchor="end" class="axis-label">${y}</text>`}`;
  if (state.showEdges) for (const e of graph.edges) { const a=point(e.a), b=point(e.b); html += `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" class="all-edge"/>`; }
  for (const group of graph.obstacles) html += `<polygon points="${group.map(id => { const p=point(id); return `${p.x},${p.y}`; }).join(' ')}" class="map-obstacle"/>`;
  for (const candidate of list) { const a=point(candidate.path.at(-2)), b=point(candidate.id); html += `<line data-edge-node="${candidate.id}" x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" class="next-edge"/>`; }
  for (let i=1;i<path.length;i++) { const a=point(path[i-1]), b=point(path[i]); const dx=b.x-a.x,dy=b.y-a.y,d=Math.hypot(dx,dy); html += `<line x1="${a.x}" y1="${a.y}" x2="${b.x-dx*10/d}" y2="${b.y-dy*10/d}" class="path-edge" marker-end="url(#map-arrow)"/>`; }
  html += `<path d="M60 62V480H1070" fill="none" stroke="#607087" stroke-width="1.2"/><text x="1077" y="484" class="node-id">x</text><text x="56" y="55" class="node-id">y</text>`;
  const offsets = { O1:[-9,18], O2:[-15,-12], O3:[-19,-11], O4:[6,17], O5:[-24,5], O6:[-27,5], O7:[5,-8], O8:[7,-5], O9:[-29,4], O10:[-22,19], O11:[-10,-12], O12:[3,18], O13:[5,17], O14:[-18,-10], O15:[4,-10], O16:[5,0], O17:[-20,-10], O18:[6,18], O19:[8,3], O20:[8,-8], O21:[6,17], O22:[-31,17], O23:[-31,-10], O24:[5,17], O25:[5,-8], O26:[-17,19], O27:[-31,-8], O28:[-31,18], O29:[5,-10], O30:[8,0], O31:[-33,1], O32:[-17,-10], O33:[7,4], S:[-26,-11], G:[11,-4] };
  for (const id of Object.keys(graph.points)) {
    const p=point(id), isCurrent=id===current, isCandidate=candidateIds.has(id), visited=path.includes(id);
    const fill=isCurrent ? '#245be5' : id==='S' ? '#079568' : visited ? '#245be5' : '#fff';
    const stroke=isCandidate ? '#099f92' : id==='G' ? '#245be5' : visited ? '#245be5' : '#435b7e';
    html += `<g class="svg-node ${isCandidate && state.mode==='manual' ? 'selectable' : ''}" data-node="${id}" ${isCandidate && state.mode==='manual' ? `role="button" tabindex="0" aria-label="${id} 선택"` : ''}>${isCurrent ? `<circle cx="${p.x}" cy="${p.y}" r="14" fill="#245be518"/>` : ''}<circle cx="${p.x}" cy="${p.y}" r="${isCurrent?9:isCandidate?7.5:id==='S'||id==='G'?6:3}" fill="${isCandidate?'white':fill}" stroke="${stroke}" stroke-width="${isCandidate?2.6:1.5}"/><circle cx="${p.x}" cy="${p.y}" r="12" fill="transparent"/>`;
    const [ox,oy]=offsets[id];
    html += `<text x="${p.x+ox}" y="${p.y+oy}" class="node-id" fill="${isCurrent?'#245be5':id==='S'?'#079568':'#223755'}">${id}</text>`;
    if (state.showCoordinates && (isCurrent || id==='S' || id==='G')) html += `<text x="${p.x+ox}" y="${p.y+oy+14}" class="node-coordinate">(${graph.points[id].x}, ${graph.points[id].y})</text>`;
    html += '</g>';
  }
  if (state.showCost) {
    const occupied=[], width=184,height=49;
    for (const candidate of list) {
      const p=point(candidate.id);
      const offsets=[[16,-66],[16,18],[-width-16,-66],[-width-16,18],[20,-132],[-width-20,-132],[20,82],[-width-20,82],[115,-30],[-width-100,-30],[20,138],[-width-20,138]];
      let bestPosition=null;
      for (const [dx,dy] of offsets) {
        const x=Math.max(66,Math.min(1050-width,p.x+dx)),y=Math.max(12,Math.min(518-height,p.y+dy));
        let score=Math.hypot(x+width/2-p.x,y+height/2-p.y)*.5;
        for (const box of occupied) score += Math.max(0,Math.min(x+width,box.x+width)-Math.max(x,box.x))*Math.max(0,Math.min(y+height,box.y+height)-Math.max(y,box.y))*50;
        for (const id of [...candidateIds,current,'G','S']) { const q=point(id); if(q.x>x-8&&q.x<x+width+8&&q.y>y-8&&q.y<y+height+8) score+=18000; }
        if(!bestPosition||score<bestPosition.score) bestPosition={x,y,score};
      }
      occupied.push(bestPosition); const {x,y}=bestPosition;
      html += `<g class="cost-label ${state.mode==='manual'?'selectable':''}" data-node="${candidate.id}"><line x1="${p.x}" y1="${p.y}" x2="${Math.max(x,Math.min(x+width,p.x))}" y2="${Math.max(y,Math.min(y+height,p.y))}" stroke="#afbed2" stroke-width=".8"/><rect x="${x}" y="${y}" width="${width}" height="${height}" rx="6" class="cost-card ${candidate.id===best?'best':''}"/><text x="${x+10}" y="${y+18}" class="node-title" fill="#233e62">${candidate.id}</text>${candidate.id===best?`<text x="${x+width-10}" y="${y+18}" font-size="10" text-anchor="end" fill="#078f84">${minimumLabel()}</text>`:''}${costText(candidate,x+10,y+36)}</g>`;
    }
  }
  svg.innerHTML=html;
  $('#map-status').textContent=current==='G'?'목표 도착 · h(G) = 0':state.mode==='manual'?'청록색 이웃 중 직접 이동 · 최소 f가 최적 이동을 보장하지 않음':'청록: OPEN 노드의 최선 부모 연결 · 파랑: 현재 확장 노드까지의 경로';
}
function renderTree() {
  const path=currentPath(),view=treeWindow(path), list=getCandidates().sort((a,b)=>natural(a.id,b.id)), siblings=getSiblings().sort((a,b)=>natural(a.id,b.id)), best=highlightedId();
  const leftCount=Math.ceil(siblings.length/2), columns=Math.max(list.length,2*leftCount+1), spacing=127;
  const W=Math.max(760,columns*spacing+110), H=520, cx=W/2, top=72, middle=228, bottom=390;
  const siblingX=i=>cx+(i<leftCount?i-leftCount:i-leftCount+1)*spacing;
  const viewport=$('#tree-viewport'), svg=$('#tree');
  svg.setAttribute('viewBox',`0 0 ${W} ${H}`);svg.style.width=`${(state.treeFit ? viewport.clientWidth : Math.max(viewport.clientWidth, columns*125+100))*state.zoom.tree}px`;svg.style.height=`${state.zoom.tree*100}%`;svg.style.minWidth='0';
  svg.dataset.topDepth=view.levels[0]??'none';svg.dataset.currentDepth=view.levels[1];svg.dataset.bottomDepth=view.levels[2];
  let html='';
  for(const y of [top,middle,bottom]) html+=`<line x1="22" y1="${y}" x2="${W-22}" y2="${y}" stroke="#ebf0f6" stroke-width="1"/>`;
  const costCard=(c,x,y,sibling=false)=>state.showCost?`<rect x="${x-58}" y="${y+32}" width="116" height="58" rx="6" class="cost-card ${sibling?'sibling-cost':c.id===best?'best':''}"/><text x="${x}" y="${y+51}" text-anchor="middle" class="cost-label" font-weight="700" fill="${sibling?'#60738d':'#223d64'}">${fmt(c.f)}</text><text x="${x}" y="${y+69}" text-anchor="middle" class="cost-label" fill="#58708f">≈ ${fmt(c.g)} +</text><text x="${x}" y="${y+84}" text-anchor="middle" class="cost-label" fill="${sibling?'#60738d':'#078f84'}">${fmt(c.h)}</text>${!sibling&&c.id===best?`<rect x="${x-27}" y="${y+93}" width="54" height="20" rx="4" fill="#0b9e90"/><text x="${x}" y="${y+107}" text-anchor="middle" font-size="10" fill="white">${minimumLabel()}</text>`:''}`:'';
  const node=(id,x,y,type,extra='')=>{
    const p=graph.points[id], selected=type==='current', candidate=type==='candidate', parent=type==='parent', sibling=type==='sibling', interactive=state.mode==='manual'&&!selected;
    const action=parent?`data-rewind="${path.length-2}"`:sibling?`data-sibling="${id}"`:'';
    const label=parent?`부모 ${id}로 돌아가기`:sibling?`부모 ${view.parent}에서 ${id}로 가지 바꾸기`:`${id} 선택`;
    return `<g data-node="${id}" data-tree-role="${type}" ${action} ${interactive?`role="button" tabindex="0" aria-label="${label}"`:''} class="svg-node ${interactive?'selectable':''}">${selected?`<circle cx="${x}" cy="${y}" r="37" fill="#245be50d"/>`:''}<circle cx="${x}" cy="${y}" r="${selected?31:24}" fill="${selected?'#245be5':parent?'#eef3ff':sibling?'#f4f6fa':'white'}" stroke="${candidate?'#099f92':selected?'#245be5':sibling?'#b6c2d2':'#a4b5cd'}" stroke-width="${candidate?2:1.5}"/><text x="${x}" y="${y+(selected&&state.showCoordinates?-1:5)}" text-anchor="middle" font-size="${selected?18:16}" font-weight="700" fill="${selected?'white':sibling?'#60738d':'#294363'}">${id}</text>${selected&&state.showCoordinates?`<text x="${x}" y="${y+15}" text-anchor="middle" font-size="10" fill="#eef4ff">(${p.x}, ${p.y})</text>`:''}${extra}</g>`;
  };
  for(let i=0;i<siblings.length;i++)html+=`<line data-sibling-edge="${siblings[i].id}" x1="${cx}" y1="${top+24}" x2="${siblingX(i)}" y2="${middle-24}" class="sibling-edge"/>`;
  if(view.parent)html+=`<line x1="${cx}" y1="${top+25}" x2="${cx}" y2="${middle-31}" class="path-edge"/>`;
  const start=(W-(list.length-1)*127)/2;
  for(let i=0;i<list.length;i++){const c=list[i],x=start+i*127;html+=`<line data-edge-node="${c.id}" x1="${cx}" y1="${middle+29}" x2="${x}" y2="${bottom-24}" class="next-edge"/>`;}
  if(view.parent){html+=node(view.parent,cx,top,'parent');html+=`<text x="${cx-42}" y="${top+4}" text-anchor="end" class="tree-label">부모</text>`;}else html+=`<text x="${cx}" y="${top+4}" text-anchor="middle" class="tree-label">이전 노드 없음</text>`;
  for(let i=0;i<siblings.length;i++){const c=siblings[i],x=siblingX(i);html+=node(c.id,x,middle,'sibling',`<text x="${x}" y="${middle-37}" text-anchor="middle" class="tree-label">형제 · 부모 경유</text>`+costCard(c,x,middle,true));}
  html+=node(view.current,cx,middle,'current');
  html+=`<text x="${cx}" y="${middle-45}" text-anchor="middle" font-size="12" fill="#245be5">현재</text>`;
  for(let i=0;i<list.length;i++) {
    const c=list[i],x=start+i*127;html+=node(c.id,x,bottom,'candidate',costCard(c,x,bottom));
  }
  if(!list.length) html+=`<text x="${cx}" y="${bottom}" text-anchor="middle" font-size="17" fill="#078f84">${view.current==='G'?'목표 G 도착 · h(G) = 0':state.mode==='astar'?'이번 확장에서 갱신한 자식이 없습니다.':'새로운 이동 후보가 없습니다.'}</text><text x="${cx}" y="${bottom+28}" text-anchor="middle" class="tree-label">${view.current==='G'?'현재 경로의 총 거리를 확인하세요.':state.mode==='astar'?'다음 확장은 전체 OPEN 후보에서 선택합니다.':'부모 노드나 이동 이력으로 돌아갈 수 있습니다.'}</text>`;
  for(const [i,y] of [top-48,middle-70,bottom-48].entries()) {
    html+=`<rect x="${cx-40}" y="${y-13}" width="80" height="25" rx="6" fill="#f5f8fd"/><text x="${cx}" y="${y+4}" text-anchor="middle" class="tree-label">${view.levels[i]===null?'시작':'Depth '+view.levels[i]}</text>`;
  }
  svg.innerHTML=html;
  viewport.scrollLeft=Math.max(0,(viewport.scrollWidth-viewport.clientWidth)/2);
  $('#tree-range').textContent=(view.parent?`표시 깊이 ${view.levels[0]}–${view.levels[2]}`:'시작 S · 다음 깊이 1')+' · 현재 노드 중앙 배치';
  $('#tree-count').textContent=`형제 ${siblings.length}개 · ${state.mode==='astar'?'갱신':'다음'} ${list.length}개`;
  $('#tree-kind').textContent='부모 · 현재와 형제 · 다음 후보';
  $('#tree-sibling-note').hidden=!siblings.length;
  $('#tree-sibling-note').textContent=state.mode==='astar'?'회색 형제는 같은 부모에서 갈 수 있는 다른 가지입니다. 비용은 표시된 부모 경유 기준이며, 전체 OPEN의 최선 비용과 다를 수 있습니다.':'회색 형제는 같은 부모에서 갈 수 있는 다른 가지입니다. 누르면 부모로 돌아가 해당 가지를 선택합니다. 비용은 부모 경유 기준입니다.';
}
function renderTable() {
  const list=state.mode==='astar'?frames[state.frame].open.slice():getCandidates();
  const best=highlightedId();
  list.sort((a,b)=>state.sort==='id'?natural(a.id,b.id):a[state.sort]-b[state.sort]||(state.mode==='astar'?compareSearchNodes(a,b):natural(a.id,b.id)));
  $('#candidate-count').textContent=`${list.length}개 후보`;
  $('#candidate-title').textContent=state.mode==='astar'?(frames[state.frame].done?'탐색 종료 · 잔여 OPEN':'전체 OPEN 후보'):'다음 노드 비교';
  $('#candidate-body').innerHTML=list.length?list.map(c=>`<tr data-node="${c.id}" class="${c.id===best?'best':''}"><td>${c.id}</td><td>${fmt(c.g)}</td><td>${fmt(c.h)}</td><td>${fmt(c.f)}</td><td class="row-note">${c.id===best?(state.mode==='astar'?'다음 확장 · 최소 f':'이웃 최소 f · 최적 보장 없음'):'—'}</td><td>${state.mode==='manual'?`<button class="select-node" data-select="${c.id}" aria-label="표에서 ${c.id} 선택">선택</button>`:c.id===best&&!frames[state.frame].done?'<button class="select-node" data-astar-step>확장</button>':'—'}</td></tr>`).join(''):`<tr><td colspan="6" class="empty-row">${getCurrent().id==='G'?'목표에 도착했습니다. 경로를 저장하거나 다시 시작해 보세요.':'이동할 새 후보가 없습니다. 이전 단계로 돌아가 보세요.'}</td></tr>`;
  $('#table-note').textContent=state.mode==='astar'?'전체 OPEN에서 f → h → 노드 번호 순으로 확장합니다. 확장 순서는 이동 경로가 아닙니다.':'이웃 최소 f = 이웃 중 추정 총비용이 가장 작음. 실제 최단 이동의 추천은 아닙니다.';
}
function renderGuidance() {
  const current = getCurrent(), isAStar = state.mode === 'astar', next = nextExpansion();
  $('#mode-heading').textContent=isAStar?'A* · 확장된 전체 후보 노드 중 최소 f 경로 선택':'현재 노드 기준 경로 선택';
  $('#mode-guidance').textContent=isAStar
    ? frames[state.frame].done?'목표 G를 OPEN에서 꺼낸 뒤 부모 연결로 복원한 최단경로입니다.'
      : `다음 확장: ${next?.id ?? '없음'}. 이전에 발견한 후보도 계속 비교합니다. 확장 노드를 순서대로 잇지 않습니다.`
    : '현재 노드에서의 최소 f만 계속 선택합니다. h는 직선거리 추정이므로, 실제로는 더 돌아갈 수 있습니다.';
  $('#optimal-path').disabled=isAStar&&frames[state.frame].done;
  $('#restart-astar').hidden=!isAStar;
  $('#expansion-history').hidden=!isAStar;
  $('#expansion-history').textContent=isAStar?`확장 순서 (이동 경로 아님): ${frames.slice(0,state.frame+1).map(frame=>frame.current.id).join(' → ')}`:'';
  const finished=current.id==='G', extra=current.g-optimal.g;
  $('#route-comparison').hidden=!finished;
  $('#route-comparison').textContent=finished?`${isAStar?'A* 경로':'직접 선택 경로'} ${fmt(current.g)} · 최단거리 ${fmt(optimal.g)} · 차이 ${extra>1e-8?`+${fmt(extra)} (${fmt(extra/optimal.g*100)}%)`:'0.00'} | 최적 경로: ${optimal.path.join(' → ')}`:'';
  $('#legend-path').textContent=isAStar?'현재 최선 경로':'지나온 경로';
  $('#legend-next').textContent=isAStar?'확장된 전체 노드의 부모 연결':'다음 이동 후보';
  $('#legend-candidate').textContent=isAStar?'확장가능한 전체 후보':'선택 가능';
}
function render() {
  const path=currentPath(),c=getCurrent(),goal=c.id==='G';
  $('#current-g').textContent=fmt(c.g);$('#current-h').textContent=fmt(c.h);$('#current-f').textContent=fmt(c.f);$('#current-equation').textContent=`≈ ${fmt(c.g)} + ${fmt(c.h)}`;$('#depth').textContent=c.depth;
  $('#breadcrumbs').innerHTML=path.length<4?path.map((id,i)=>`${i?'<span class="crumb-arrow" aria-hidden="true">›</span>':''}<button class="crumb ${i===path.length-1?'current':''}" data-rewind="${i}" ${state.mode==='astar'?'disabled':''}>${id}</button>`).join(''):`<button class="crumb" data-rewind="0" ${state.mode==='astar'?'disabled':''}>S</button><span class="crumb-arrow">…</span><button class="crumb current">${c.id}</button>`;
  $('#history').innerHTML='<span class="history-label">현재 경로</span>'+path.map((id,i)=>`${i?'<span class="crumb-arrow" aria-hidden="true">›</span>':''}<button class="history-item ${i===path.length-1?'current':''}" data-rewind="${i}" ${state.mode==='astar'?'disabled':''} aria-label="${id}, 깊이 ${i}까지 돌아가기">${id}</button>`).join('');
  $('#undo').disabled=state.mode==='astar'?state.frame===0:path.length===1;
  $('#astar-step').hidden=state.mode!=='astar';$('#astar-step').disabled=state.frame===frames.length-1;
  $('#mode-badge').textContent=state.mode==='astar'?`A* · ${state.frame+1}회 확장`:'직접 선택';
  $('#mode-note').textContent=state.mode==='astar'?'더 작은 g로 도달할 때만 비용과 부모를 갱신합니다. 트리 하단은 이번 확장에서 갱신한 자식 노드입니다.':'이웃 최소 f를 따라가도 최단경로가 아닐 수 있습니다. 같은 꼭짓점의 h는 같아도 선택 경로에 따라 g와 f는 달라집니다.';
  $('#visited-count').textContent=state.mode==='astar'?`CLOSED ${frames[state.frame].closed.length}개`:`방문 ${path.length}개`;
  $('#open-count').textContent=state.mode==='astar'?`OPEN ${frames[state.frame].open.length}개`:`다음 후보 ${getCandidates().length}개`;
  document.querySelectorAll('[data-mode]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.mode===state.mode)));
  renderMap();renderTree();renderTable();renderGuidance();
  requestAnimationFrame(()=>{const viewport=$('#tree-viewport');viewport.scrollLeft=Math.max(0,(viewport.scrollWidth-viewport.clientWidth)/2);});
  if(goal)announce(goalMessage(),true);
  $('#node-tooltip').hidden=true;
}
document.addEventListener('click',event=>{
  const target=event.target;
  const back=target.closest('[data-rewind]');if(back){rewind(Number(back.dataset.rewind));return;}
  const select=target.closest('[data-select]');if(select){selectNode(select.dataset.select);return;}
  const sibling=target.closest('[data-sibling]');if(sibling){selectSibling(sibling.dataset.sibling);return;}
  const node=target.closest('.svg-node[data-node]');if(node){selectNode(node.dataset.node);return;}
  if(target.closest('[data-astar-step]'))stepAStar();
});
document.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){const node=event.target.closest('.svg-node[role="button"]');if(node){event.preventDefault();node.dispatchEvent(new MouseEvent('click',{bubbles:true}));}}});
$('#undo').addEventListener('click',()=>{if(state.mode==='astar'){if(state.frame>0){state.frame--;render();announce('이전 A* 확장 상태로 돌아왔습니다.');}}else rewind(state.path.length-2);});
$('#reset').addEventListener('click',reset);
$('#astar-step').addEventListener('click',stepAStar);
$('#optimal-path').addEventListener('click',showOptimalPath);
$('#restart-astar').addEventListener('click',()=>{state.mode='astar';state.frame=0;render();announce('A*를 S부터 다시 시작했습니다. 확장 가능한 전체 노드 후보를 비교하세요.');});
function setMode(mode) { if (!['manual','astar'].includes(mode)) throw new Error('유효하지 않은 모드입니다.'); state.mode=mode;state.hover=null;render();announce(getCurrent().id==='G'?goalMessage():state.mode==='astar'?'A*: 이전에 발견한 전체 후보 노드의 최소 f를 확장합니다. 확장 순서와 실제 경로는 다릅니다.':'직접 선택: 현재 노드 기준에서 선택가능한 노드들의 최소 f는 최적 이동을 보장하지 않습니다.',getCurrent().id==='G'); }
document.querySelectorAll('[data-mode]').forEach(button=>button.addEventListener('click',()=>setMode(button.dataset.mode)));
$('#sort').addEventListener('change',event=>{state.sort=event.target.value;renderTable();});
for(const [selector,property] of [['#show-edges','showEdges'],['#show-cost','showCost'],['#show-coordinates','showCoordinates']]) $(selector).addEventListener('change',event=>{state[property]=event.target.checked;renderMap();renderTree();});
document.querySelectorAll('[data-zoom]').forEach(button=>button.addEventListener('click',()=>{const [view,action]=button.dataset.zoom.split(':');state.zoom[view]=action==='reset'?1:Math.max(.7,Math.min(2.5,state.zoom[view]+(action==='+'?.25:-.25)));if(view==='tree')state.treeFit=action==='reset';view==='map'?renderMap():renderTree();}));
$('#help').addEventListener('click',()=>$('#help-dialog').showModal());
document.querySelectorAll('.dialog-close').forEach(button=>button.addEventListener('click',()=>$('#help-dialog').close()));
$('#help-dialog').addEventListener('click',event=>{if(event.target===$('#help-dialog'))$('#help-dialog').close();});
function setHover(id, event) {
  state.hover=id;
  const sibling=!!event?.target.closest('[data-sibling]');
  document.querySelectorAll('[data-edge-node]').forEach(el=>el.classList.toggle('hover-edge',!sibling&&el.dataset.edgeNode===id));
  document.querySelectorAll('[data-sibling-edge]').forEach(el=>el.classList.toggle('hover-edge',sibling&&el.dataset.siblingEdge===id));
  document.querySelectorAll('#candidate-body tr[data-node]').forEach(el=>el.classList.toggle('hovered',!sibling&&el.dataset.node===id));
  document.querySelectorAll('.svg-node[data-node]').forEach(el=>el.classList.toggle('hovered-node',el.dataset.node===id&&el.hasAttribute('data-sibling')===sibling));
  const tooltip=$('#node-tooltip');
  if(!id){tooltip.hidden=true;return;}
  const item=(sibling?getSiblings():state.mode==='astar'?frames[state.frame].open:getCandidates()).find(c=>c.id===id) ?? (id===getCurrent().id ? getCurrent() : null), p=graph.points[id];
  tooltip.innerHTML=`<strong>${id} · (${p.x}, ${p.y})</strong>${item?`f ≈ ${fmt(item.f)} = g ${fmt(item.g)} + h ${fmt(item.h)}<br>${sibling?`부모 ${currentPath().at(-2)} 경유 기준${state.mode==='manual'?' · 클릭하여 가지 변경':''}`:item.step?`이번 이동 거리 ${fmt(item.step)}`:currentPath().includes(id)?'현재 선택 경로':'전체 OPEN 후보'}`:`목표까지 직선거리 h ≈ ${fmt(Math.hypot(833-p.x,375-p.y))}`} `;
  tooltip.hidden=false;
  const rect=event.target.getBoundingClientRect(),x=event.clientX??rect.left,y=event.clientY??rect.top;
  tooltip.style.left=`${Math.min(innerWidth-290,Math.max(8,x+15))}px`;tooltip.style.top=`${Math.min(innerHeight-110,Math.max(8,y+18))}px`;
}
document.addEventListener('pointerover',event=>{const node=event.target.closest('[data-node]');if(node && !node.contains(event.relatedTarget))setHover(node.dataset.node,event);});
document.addEventListener('pointerout',event=>{const node=event.target.closest('[data-node]');if(node&&!node.contains(event.relatedTarget))setHover(null,event);});
document.addEventListener('focusin',event=>{const node=event.target.closest('[data-node]');if(node)setHover(node.dataset.node,event);});
document.addEventListener('focusout',()=>setHover(null));
function styledSVG(element) {
  const clone=element.cloneNode(true), original=[element,...element.querySelectorAll('*')], copied=[clone,...clone.querySelectorAll('*')];
  const properties=['fill','stroke','stroke-width','stroke-opacity','stroke-dasharray','fill-opacity','font-family','font-size','font-weight','text-anchor','stroke-linecap','stroke-linejoin','opacity'];
  for(let i=0;i<original.length;i++){const style=getComputedStyle(original[i]);for(const property of properties)copied[i].style.setProperty(property,style.getPropertyValue(property));}
  clone.removeAttribute('style');clone.setAttribute('xmlns','http://www.w3.org/2000/svg');clone.setAttribute('width','100%');clone.setAttribute('height','100%');
  return new XMLSerializer().serializeToString(clone);
}
async function exportImage() {
  const button=$('#export');button.disabled=true;
  try {
    const c=getCurrent(),list=(state.mode==='astar'?frames[state.frame].open:getCandidates()), map=styledSVG($('#map')),tree=styledSVG($('#tree'));
    const H=Math.max(1160,880+list.length*31),W=2400;
    let source=`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><rect width="100%" height="100%" fill="#f5f8fc"/><g font-family="Malgun Gothic,Arial,sans-serif" fill="#17243c"><text x="45" y="58" font-size="30" font-weight="700">A* 경로 탐색 실습</text><text x="45" y="105" font-size="23">${escape(currentPath().join(' → '))}   |   g ${fmt(c.g)}   h ${fmt(c.h)}   f ${fmt(c.f)}</text><text x="45" y="146" font-size="17" fill="#687c99">${state.mode==='manual'?'직접 선택 (최단경로 보장 없음)':frames[state.frame].done?'A* 최단경로 확정':'A* 탐색 중 (확장 순서는 이동 경로 아님)'} · 깊이 ${c.depth} · f(n) = g(n) + h(n)</text><text x="45" y="167" font-size="15" fill="#245be5">${c.id==='G'?escape(goalMessage()):state.mode==='manual'?'이웃 최소 f는 이웃 사이의 추정치 비교입니다. 실제 최단경로는 A*로 확인하세요.':`다음 확장: ${nextExpansion()?.id??'없음'} · 전체 OPEN에서 선택 · 부모 연결로 이동 경로 복원`}</text><rect x="30" y="175" width="1260" height="605" rx="14" fill="white"/><rect x="1310" y="175" width="1060" height="605" rx="14" fill="white"/><svg x="40" y="184" width="1240" height="585">${map}</svg><svg x="1320" y="184" width="1040" height="585">${tree}</svg><text x="45" y="828" font-size="21" font-weight="700">${state.mode==='manual'?'다음 이동 후보':'전체 OPEN 후보'} · f ≈ g + h</text>`;
    list.forEach((item,i)=>{source+=`<text x="45" y="${867+i*31}" font-size="20">${item.id}     ${fmt(item.f)} ≈ ${fmt(item.g)} + ${fmt(item.h)}</text>`;});
    source+=`<text x="1325" y="832" font-size="20" fill="#245be5">진한 파랑: ${state.mode==='manual'?'직접 선택 경로':'현재 확장 노드까지의 최선 경로'}</text><text x="1325" y="868" font-size="20" fill="#078f84">청록: ${state.mode==='manual'?'다음 이동 후보':'OPEN의 부모 연결'}</text><text x="1325" y="904" font-size="20" fill="#687c99">회색: 전체 이동 가능 연결</text><text x="1325" y="930" font-size="17" fill="#687c99">트리 회색 점선: 형제 가지 · 비용은 표시된 부모 경유 기준</text><text x="1325" y="957" font-size="17" fill="#687c99">장애물 내부 통과 금지 · 경계 이동 허용</text><text x="1325" y="989" font-size="17" fill="#687c99">Figure 3.31의 비율을 기준으로 재구성한 좌표</text><text x="1325" y="1030" font-size="17" fill="#245be5">${c.id==='G'?`A* 최단거리 ${fmt(optimal.g)} · 선택 경로와 차이 ${fmt(c.g-optimal.g)}`:state.mode==='manual'?'이웃 최소 f는 실제 최단 이동을 보장하지 않습니다.':'확장 순서를 이어붙이지 않고 부모 연결을 복원합니다.'}</text></g></svg>`;
    const url=URL.createObjectURL(new Blob([source],{type:'image/svg+xml;charset=utf-8'}));
    try {
      const image=new Image(); await new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=()=>reject(new Error('이미지 변환 실패'));image.src=url;});
      const canvas=document.createElement('canvas');canvas.width=W;canvas.height=H;canvas.getContext('2d').drawImage(image,0,0);
      const download=canvas.toDataURL('image/png');
      $('#export-preview').src=download;$('#export-download').href=download;$('#export-download').download=`astar-${currentPath().join('-')}.png`;
      $('#export-dialog').showModal();announce('현재 탐색 결과 이미지가 준비되었습니다. PNG 다운로드로 저장하세요.');
    } finally { URL.revokeObjectURL(url); }
  } catch(error) {announce('이미지를 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.');console.error(error);} finally {button.disabled=false;}
}
$('#export').addEventListener('click',exportImage);
document.querySelectorAll('.export-close').forEach(button=>button.addEventListener('click',()=>$('#export-dialog').close()));
$('#export-dialog').addEventListener('click',event=>{if(event.target===$('#export-dialog'))$('#export-dialog').close();});
const resize=new ResizeObserver(()=>renderTree());resize.observe($('#tree-viewport'));

function stateSummary() {
  return { mode:state.mode,path:[...currentPath()],current:getCurrent(),tree:{...treeWindow(currentPath()),siblings:getSiblings()},candidates:getCandidates(),frontier:frames[state.frame].open,nextExpansion:nextExpansion()?.id??null,optimal,astar:{step:state.frame,finished:frames[state.frame].done,expansionOrder:frames.slice(0,state.frame+1).map(frame=>frame.current.id)} };
}
function registerTools() {
  const context=document.modelContext;if(!context?.registerTool)return;
  const lifecycle=new AbortController();
  const tools=[
    { name:'get_search_state',title:'현재 탐색 상태 읽기',description:'현재 경로, g/h/f, 세 수준 트리와 이동 후보를 읽습니다.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true,untrustedContentHint:false},execute:()=>stateSummary() },
    { name:'select_path_node',title:'다음 경로 노드 선택',description:'직접 선택 모드에서 현재 이동 가능한 후보로 한 번 이동합니다. 지도, 트리와 비용표를 갱신합니다.',inputSchema:{type:'object',properties:{nodeId:{type:'string'}},required:['nodeId'],additionalProperties:false},annotations:{readOnlyHint:false,untrustedContentHint:false},execute:input=>{if(typeof input?.nodeId!=='string'||!selectNode(input.nodeId))throw new Error('현재 직접 이동 가능한 후보 노드만 선택할 수 있습니다.');return stateSummary();} },
    { name:'reset_search',title:'탐색 초기화',description:'선택 경로와 A* 확장 단계를 S로 초기화합니다.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:false,untrustedContentHint:false},execute:()=>{reset();return stateSummary();} },
    { name:'set_search_mode',title:'탐색 모드 전환',description:'직접 경로 선택 또는 A* 전체 OPEN 비교 모드로 전환합니다.',inputSchema:{type:'object',properties:{mode:{type:'string',enum:['manual','astar']}},required:['mode'],additionalProperties:false},annotations:{readOnlyHint:false,untrustedContentHint:false},execute:input=>{setMode(input?.mode);return stateSummary();} },
    { name:'expand_astar_node',title:'A* 최소 f 후보 확장',description:'A* 비교 모드에서 전체 OPEN의 최소 f 후보를 한 단계 확장합니다.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:false,untrustedContentHint:false},execute:()=>{if(!stepAStar())throw new Error('A* 비교 모드에서 아직 종료되지 않은 탐색만 확장할 수 있습니다.');return stateSummary();} },
  ];
  for(const tool of tools)try{Promise.resolve(context.registerTool(tool,{signal:lifecycle.signal})).catch(()=>{});}catch{}
  addEventListener('pagehide',()=>lifecycle.abort(),{once:true});
}
$('#edge-count').textContent=graph.edges.length;
render();
registerTools();

export { graph, state, selectNode, reset, stepAStar, render, getCurrent, getCandidates, currentPath };
