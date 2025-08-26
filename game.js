import{GRID_W,GRID_H,VIEW_W,PASSIVE_MANA,START_MANA,START_HP,CHEST_MANA,COSTS,TRAP_RANGE,TRAP_DMG,RUNE_RADIUS,FIRE_DMG,FIRE_RADIUS,SAB_EXP_DMG,SAB_EXP_RADIUS,SPIKE_DMG,PLACE_RADIUS,PLACE_ZOOM,ARROW_AMMO,BURN_TURNS,BURN_DMG,RUNE_SLOW_TURNS,DASH_CD,DASH_COST,DENSITY_TILE_WEIGHT,DENSITY_NEIGHBOR_WEIGHT,PATIENCE_PROB,PATROL_RADIUS,ENEMY,baseSpawnCooldown,baseSpawnCount,ENEMY_CAP,CHESTS_PER_RUN,SPAWN_MIN_RADIUS,COLORS}from './constants.js';
import './ui.js';
import './map.js';
import './enemies.js';

(() => {

let tileSize=0,tilePad=1,animT=0;let terrainCanvas=null,terrainCtx=null,terrainValid=false;let state;

const canvas=document.getElementById('game');const ctx=canvas.getContext('2d',{alpha:false})||canvas.getContext('2d');const raf=window.requestAnimationFrame||(cb=>setTimeout(()=>cb(Date.now()),16));
const hud={hp:document.getElementById('hud-hp'),mana:document.getElementById('hud-mana'),turn:document.getElementById('hud-turn'),enemy:document.getElementById('hud-enemies'),spawn:document.getElementById('hud-spawn'),dash:document.getElementById('hud-dash'),log:document.getElementById('log'),hpCard:document.getElementById('hud-hp').parentElement};
const btnNew=document.getElementById('btn-new'),btnHelp=document.getElementById('btn-help'),btnPlace=document.getElementById('btn-place'),btnDash=document.getElementById('btn-dash');
const trapbar=document.getElementById('trapbar');let trapEls={};const placementPreview=document.getElementById('placementPreview');const mapWrap=document.querySelector('.map-wrap');

const TRAP_DEFS=[{id:'arrow',name:'Arrow Trap',cost:COSTS.arrow,hotkey:'1'},{id:'rune',name:'Magic Rune',cost:COSTS.rune,hotkey:'2'},{id:'fire',name:'Fire Totem',cost:COSTS.fire,hotkey:'3'},{id:'spike',name:'Spike Floor',cost:COSTS.spike,hotkey:'4'}];
function renderTrapbar(defs,st){trapbar.innerHTML='';trapEls={};defs.forEach(d=>{const btn=document.createElement('button');btn.className='trap';btn.dataset.id=d.id;btn.innerHTML=`<div class="name">${d.name}<span class="hk">[${d.hotkey}]</span></div><div class="meta"><span class="cost">${d.cost} mana</span><span class="stock"></span></div><div class="cool"></div>`;trapbar.appendChild(btn);trapEls[d.id]={btn,costEl:btn.querySelector('.cost'),stockEl:btn.querySelector('.stock'),coolEl:btn.querySelector('.cool')};btn.addEventListener('click',()=>setActiveTrap(d.id));});updateMana(st.mana);}
function setActiveTrap(id){state.selectedTool=id;for(const k in trapEls)trapEls[k].btn.classList.toggle('active',k===id);updateMana(state.mana);drawPlacementPreview();}
function updateMana(mana){hud.mana.textContent=mana;for(const k in trapEls){const def=TRAP_DEFS.find(t=>t.id===k);const ammo=state.ammo[k];const el=trapEls[k];el.stockEl.textContent=ammo===Infinity?'∞':`x${ammo}`;const affordable=mana>=def.cost&&ammo!==0;el.btn.disabled=!affordable;el.btn.classList.toggle('insuf',!affordable);}const sel=state.selectedTool;const def=TRAP_DEFS.find(t=>t.id===sel);const can=def&&mana>=def.cost&&state.ammo[sel]!==0;btnPlace.disabled=!can;}
function setCooldown(id,current,total){const el=trapEls[id]?.coolEl;if(!el)return;const ratio=total>0?current/total:0;el.style.width=Math.min(1,ratio)*100+'%';if(current>0)el.setAttribute('aria-label',total-current+' turns');else el.removeAttribute('aria-label');}
function drawPlacementPreview(tileX,tileY,shape='square',radius=1){if(!state.placeMode||tileX==null||tileY==null){placementPreview.style.display='none';return;}const pad=parseFloat(getComputedStyle(mapWrap).paddingLeft)||0;const {sx,sy}=tileToScreen(tileX,tileY);const size=tileSize*radius;placementPreview.style.display='block';placementPreview.style.left=pad+sx+'px';placementPreview.style.top=pad+sy+'px';placementPreview.style.width=size+'px';placementPreview.style.height=size+'px';placementPreview.className=shape==='circle'?'circle':'';}
function renderLegend(pairs){const cont=document.getElementById('legend-items');if(!cont)return;cont.innerHTML='';pairs.forEach(([label,color])=>{const div=document.createElement('div');div.className='legend-item';div.innerHTML=`<span class="swatch" style="background:${color}"></span><span>${label}</span>`;cont.appendChild(div)});}
function setDashArmed(armed,cd){btnDash.disabled=cd>0;btnDash.textContent=armed?(cd>0?`Dash (cd: ${cd})`:'Dash (ready)'):'Arm Dash';}
function updateHUD(st=state){hud.hp.textContent=st.hp|0;hud.turn.textContent=st.turn|0;hud.enemy.textContent=st.enemies.length|0;hud.spawn.textContent=st.nextSpawn|0;hud.dash.textContent=st.dashCD>0?st.dashCD:'Ready';setDashArmed(st.dashArmed,st.dashCD);setActiveTrap(st.selectedTool);updateMana(st.mana);}

function updateCamera(){state.cameraX=Math.max(0,Math.min(state.player.x-Math.floor(VIEW_W/2),GRID_W-VIEW_W));state.cameraY=0;}

const LEGEND_DATA=[['Wall',COLORS.wall],['Floor',COLORS.floor],['Entrance',COLORS.start],['Exit',COLORS.exit],['Spawner',COLORS.spawner],['Chest',COLORS.chest],['Goblin',COLORS.enemyGoblin],['Archer',COLORS.enemyArcher],['Wraith',COLORS.enemyWraith],['Brute',COLORS.enemyBrute],['Saboteur',COLORS.enemySaboteur],['Hunter',COLORS.enemyHunter]];

function generateMaze(width,height){const w=(width%2===0)?width-1:width,h=(height%2===0)?height-1:height;const grid=Array.from({length:height},()=>Array(width).fill(1));function inBoundsCarve(x,y){return x>0&&x<w-1&&y>0&&y<h-1}const stack=[];let cx=1,cy=1;grid[cy][cx]=0;stack.push([cx,cy]);function neighbors(x,y){return[[x+2,y],[x-2,y],[x,y+2],[x,y-2]].filter(([nx,ny])=>inBoundsCarve(nx,ny)&&grid[ny][nx]===1)}while(stack.length){const [x,y]=stack[stack.length-1];const nbs=neighbors(x,y);if(!nbs.length){stack.pop();continue}const [nx,ny]=nbs[(Math.random()*nbs.length)|0];grid[ny][nx]=0;grid[y+(ny-y)/2][x+(nx-x)/2]=0;stack.push([nx,ny])}for(let y=1;y<height-1;y++){for(let x=1;x<width-1;x++){if(grid[y][x]===0&&Math.random()<.22){if(grid[y][x+1]===1)grid[y][x+1]=0;if(grid[y+1][x]===1)grid[y+1][x]=0}}}return grid}
function carveRect(grid,x,y,w,h){for(let j=0;j<h;j++)for(let i=0;i<w;i++){const gx=x+i,gy=y+j;if(gx>0&&gy>0&&gx<GRID_W-1&&gy<GRID_H-1)grid[gy][gx]=0}}
function carveGuidedPath(grid,start,exit){let x=start.x,y=start.y;grid[y][x]=0;if(y+1<GRID_H)grid[y+1][x]=0;const steps=GRID_W*2;let dirY=0;for(let s=0;s<steps&&x<exit.x-1;s++){const r=Math.random();if(r<.70){x=Math.min(GRID_W-2,x+1)}else{if(dirY===0)dirY=Math.random()<.5?-1:1;else if(Math.random()<.4)dirY=0;y=Math.max(1,Math.min(GRID_H-3,y+dirY))}grid[y][x]=0;grid[y+1][x]=0;if(Math.random()<.30&&x<exit.x-2){grid[y][x+1]=1;grid[y+1][x+1]=1;const off=(Math.random()<.5?-1:1);const yy=Math.max(1,Math.min(GRID_H-3,y+off));grid[yy][x]=0;grid[yy+1][x]=0;grid[yy][x+2]=0;grid[yy+1][x+2]=0;x=x+2;y=yy}}grid[exit.y][exit.x]=0;if(exit.x-1>=0)grid[exit.y][exit.x-1]=0}
function addRoomsAndConnectors(grid){const roomCount=3+((Math.random()*2)|0);for(let r=0;r<roomCount;r++){const rw=3+((Math.random()*3)|0),rh=3+((Math.random()*2)|0),rx=2+((Math.random()*(GRID_W-rw-4))|0),ry=2+((Math.random()*(GRID_H-rh-4))|0);carveRect(grid,rx,ry,rw,rh)}for(let y=2;y<GRID_H-2;y++){for(let x=2;x<GRID_W-2;x++){if(grid[y][x]!==1)continue;const horiz=(grid[y][x-1]===0&&grid[y][x+1]===0&&grid[y-1][x]===1&&grid[y+1][x]===1);const vert=(grid[y-1][x]===0&&grid[y+1][x]===0&&grid[y][x-1]===1&&grid[y][x+1]===1);if((horiz||vert)&&Math.random()<.08)grid[y][x]=0}}}
function randomFloor(grid){for(let tries=0;tries<6000;tries++){const x=(Math.random()*GRID_W)|0,y=(Math.random()*GRID_H)|0;if(grid[y][x]===0)return{x,y}}return{x:1,y:1}}
function dist1(a,b){return Math.abs(a.x-b.x)+Math.abs(a.y-b.y)}
function pathExists(grid,start,goal){const q=[start];const seen=new Set([start.x+','+start.y]);const dirs=[[1,0],[-1,0],[0,1],[0,-1]];while(q.length){const cur=q.shift();if(cur.x===goal.x&&cur.y===goal.y)return true;for(let i=0;i<4;i++){const nx=cur.x+dirs[i][0],ny=cur.y+dirs[i][1];if(nx<0||ny<0||nx>=GRID_W||ny>=GRID_H)continue;if(grid[ny][nx]===1)continue;const key=nx+','+ny;if(!seen.has(key)){seen.add(key);q.push({x:nx,y:ny})}}}return false}
function buildMap(){let grid,start,exit,attempts=0;do{grid=generateMaze(GRID_W,GRID_H);start={x:0,y:(GRID_H/2)|0};exit={x:GRID_W-1,y:(GRID_H/2)|0};grid[start.y][start.x]=0;if(start.x+1<GRID_W)grid[start.y][start.x+1]=0;carveGuidedPath(grid,start,exit);addRoomsAndConnectors(grid);attempts++;if(attempts>50)break}while(!pathExists(grid,start,exit));const spawners=[];const edgeOptions=[];for(let y=0;y<GRID_H;y++){if(grid[y][0]===0)edgeOptions.push({x:0,y});if(grid[y][GRID_W-1]===0)edgeOptions.push({x:GRID_W-1,y})}for(let x=0;x<GRID_W;x++){if(grid[0][x]===0)edgeOptions.push({x,y:0});if(grid[GRID_H-1][x]===0)edgeOptions.push({x,y:GRID_H-1})}edgeOptions.sort(()=>Math.random()-.5);for(const p of edgeOptions){if(dist1(p,start)<SPAWN_MIN_RADIUS)continue;if(!((p.x===start.x&&p.y===start.y)||(p.x===exit.x&&p.y===exit.y)))spawners.push(p);if(spawners.length>=3)break}while(spawners.length<3){const p=randomFloor(grid);if(dist1(p,start)<SPAWN_MIN_RADIUS)continue;if((p.x===start.x&&p.y===start.y)||(p.x===exit.x&&p.y===exit.y))continue;spawners.push(p)}if(!spawners.some(s=>s.x>=Math.floor(GRID_W*.6))){for(let tries=0;tries<200;tries++){const x=Math.floor(GRID_W*.7)+((Math.random()*Math.floor(GRID_W*.3))|0);const y=(Math.random()*GRID_H)|0;const p={x,y};if(x>=0&&x<GRID_W&&y>=0&&y<GRID_H&&grid[y][x]===0&&dist1(p,start)>=SPAWN_MIN_RADIUS){spawners[0]=p;break}}}const chests=[];for(let i=0;i<CHESTS_PER_RUN;i++){const p=randomFloor(grid);if((p.x===start.x&&p.y===start.y)||(p.x===exit.x&&p.y===exit.y)){i--;continue}if(spawners.some(s=>s.x===p.x&&s.y===p.y)){i--;continue}chests.push({x:p.x,y:p.y,opened:false})}return{grid,start,exit,spawners,chests}}

function inBounds(x,y){return x>=0&&x<GRID_W&&y>=0&&y<GRID_H}function samePos(a,b){return a.x===b.x&&a.y===b.y}
function tileToScreen(x,y,useCam=true){const cx=useCam?state.cameraX:0,cy=useCam?state.cameraY:0;return{sx:(x-cx)*tileSize,sy:(y-cy)*tileSize}}function isWall(x,y){return state.map.grid[y][x]===1}
function isSpawner(x,y){return state.map.spawners.some(s=>s.x===x&&s.y===y)}function isChest(x,y){return state.map.chests.some(c=>!c.opened&&c.x===x&&c.y===y)}
function isStart(x,y){return state.map.start.x===x&&state.map.start.y===y}function isExit(x,y){return state.map.exit.x===x&&state.map.exit.y===y}
function logMsg(m){const p=document.createElement('p');p.textContent=m;hud.log.appendChild(p);hud.log.scrollTop=hud.log.scrollHeight}
function clearLog(){hud.log.innerHTML=""}function rndShuffle(a){for(let i=a.length-1;i>0;i--){const j=(Math.random()*(i+1))|0;[a[i],a[j]]=[a[j],a[i]]}return a}

function lineOfSightRowCol(a,b){if(a.x===b.x){const x=a.x;const y1=Math.min(a.y,b.y)+1,y2=Math.max(a.y,b.y);for(let y=y1;y<y2;y++)if(isWall(x,y))return false;return true}else if(a.y===b.y){const y=a.y;const x1=Math.min(a.x,b.x)+1,x2=Math.max(a.x,b.x);for(let x=x1;x<x2;x++)if(isWall(x,y))return false;return true}return false}
function clearShotToPlayer(from,ignore=null){if(!lineOfSightRowCol(from,state.player))return false;if(from.x===state.player.x){const x=from.x,y1=Math.min(from.y,state.player.y)+1,y2=Math.max(from.y,state.player.y);for(let y=y1;y<y2;y++)if(state.enemies.some(e=>e!==ignore&&e.x===x&&e.y===y))return false}else if(from.y===state.player.y){const y=from.y,x1=Math.min(from.x,state.player.x)+1,x2=Math.max(from.x,state.player.x);for(let x=x1;x<x2;x++)if(state.enemies.some(e=>e!==ignore&&e.x===x&&e.y===y))return false}return true}
function ensureOffscreen(){if(!terrainCanvas){terrainCanvas=document.createElement('canvas');terrainCtx=terrainCanvas.getContext('2d',{alpha:false})||terrainCanvas.getContext('2d')}const w=Math.floor(tileSize*GRID_W),h=Math.floor(tileSize*GRID_H);if(terrainCanvas.width!==w||terrainCanvas.height!==h){terrainCanvas.width=w;terrainCanvas.height=h;terrainCtx.setTransform(1,0,0,1,0,0);terrainValid=false}}
function drawWallTileTo(tctx,x,y){const {sx,sy}=tileToScreen(x,y,false);tctx.fillStyle=COLORS.wall;tctx.fillRect(sx,sy,tileSize,tileSize);tctx.strokeStyle=COLORS.wallEdge;tctx.lineWidth=Math.max(1,tileSize*.06);tctx.strokeRect(sx+.5,sy+.5,tileSize-1,tileSize-1);tctx.save();tctx.beginPath();tctx.rect(sx+1,sy+1,tileSize-2,tileSize-2);tctx.clip();tctx.strokeStyle='rgba(255,255,255,.06)';tctx.lineWidth=Math.max(1,tileSize*.05);const step=Math.max(4,tileSize/4);for(let k=-tileSize;k<tileSize*2;k+=step){tctx.beginPath();tctx.moveTo(sx+k,sy);tctx.lineTo(sx,sy+k);tctx.stroke()}tctx.restore()}
function drawTerrainAll(){terrainCtx.clearRect(0,0,terrainCanvas.width,terrainCanvas.height);for(let y=0;y<GRID_H;y++)for(let x=0;x<GRID_W;x++){if(isWall(x,y))drawWallTileTo(terrainCtx,x,y);else{const {sx,sy}=tileToScreen(x,y,false);terrainCtx.fillStyle=COLORS.floor;terrainCtx.fillRect(sx+tilePad,sy+tilePad,tileSize-tilePad*2,tileSize-tilePad*2)}}drawOutlineRectTo(terrainCtx,state.map.start.x,state.map.start.y,COLORS.start,.35,false);drawOutlineRectTo(terrainCtx,state.map.exit.x,state.map.exit.y,COLORS.exit,.35,false);for(const s of state.map.spawners)drawOutlineRectTo(terrainCtx,s.x,s.y,COLORS.spawner,.35,false);for(const c of state.map.chests)if(!c.opened){drawOutlineRectTo(terrainCtx,c.x,c.y,COLORS.chest,.45,false);const {sx,sy}=tileToScreen(c.x,c.y,false);const s2=Math.max(4,tileSize*.35);terrainCtx.fillStyle=COLORS.chest;terrainCtx.fillRect(sx+(tileSize-s2)/2,sy+(tileSize-s2)/2,s2,s2)}terrainValid=true}
function drawOutlineRectTo(tctx,x,y,color,alpha=.28,useCam=true){const {sx,sy}=tileToScreen(x,y,useCam);tctx.save();tctx.globalAlpha=alpha;tctx.strokeStyle=color;tctx.setLineDash([4,3]);tctx.lineWidth=Math.max(1,tileSize*.06);tctx.strokeRect(sx+tilePad,sy+tilePad,tileSize-tilePad*2,tileSize-tilePad*2);tctx.restore()}
function drawOutlineRect(x,y,c,a){drawOutlineRectTo(ctx,x,y,c,a)}
function drawHPBar(x,y,ratio){const {sx,sy}=tileToScreen(x,y);const w=tileSize-tilePad*2,h=Math.max(3,tileSize*.09);const bx=sx+tilePad,by=sy+tilePad*.7;ctx.fillStyle='rgba(0,0,0,.5)';ctx.fillRect(bx,by,w,h);ctx.fillStyle=ratio>.5?'#22c55e':(ratio>.25?'#f59e0b':'#ef4444');ctx.fillRect(bx,by,w*ratio,h)}
function drawTrapMeter(t){const {sx,sy}=tileToScreen(t.x,t.y);const ratio=(t.ammo===undefined?1:t.ammo/ARROW_AMMO);const w=tileSize-tilePad*2,h=Math.max(3,tileSize*.1);const bx=sx+tilePad,by=sy+tileSize-h-tilePad;ctx.fillStyle='rgba(0,0,0,.5)';ctx.fillRect(bx,by,w,h);ctx.fillStyle=ratio>.5?'#22c55e':(ratio>.25?'#f59e0b':'#ef4444');ctx.fillRect(bx,by,w*ratio,h)}
function drawTrapIcon(t){const {sx,sy}=tileToScreen(t.x,t.y);const cx=sx+tileSize/2,cy=sy+tileSize/2;const size=tileSize-tilePad*2;ctx.save();if(t.type==='arrow'){ctx.fillStyle=COLORS.arrow;ctx.beginPath();ctx.moveTo(cx-size*.35,cy-size*.2);ctx.lineTo(cx+size*.35,cy);ctx.lineTo(cx-size*.35,cy+size*.2);ctx.closePath();ctx.fill()}else if(t.type==='rune'){ctx.strokeStyle=COLORS.rune;ctx.lineWidth=Math.max(2,tileSize*.1);ctx.beginPath();ctx.moveTo(cx,cy-size*.3);ctx.lineTo(cx+size*.3,cy);ctx.lineTo(cx,cy+size*.3);ctx.lineTo(cx-size*.3,cy);ctx.closePath();ctx.stroke()}else if(t.type==='fire'){ctx.fillStyle=COLORS.fire;ctx.beginPath();ctx.arc(cx,cy,size*.3,0,Math.PI*2);ctx.fill();ctx.fillStyle='#fff';ctx.beginPath();ctx.moveTo(cx,cy-size*.2);ctx.lineTo(cx+size*.1,cy);ctx.lineTo(cx-size*.1,cy);ctx.closePath();ctx.fill()}else if(t.type==='spike'){ctx.fillStyle=COLORS.spike;ctx.beginPath();ctx.moveTo(cx,cy-size*.35);ctx.lineTo(cx+size*.35,cy+size*.35);ctx.lineTo(cx-size*.35,cy+size*.35);ctx.closePath();ctx.fill()}ctx.restore()}
function outlineRangeTiles(cx,cy,r,color){for(let y=cy-r;y<=cy+r;y++){for(let x=cx-r;x<=cx+r;x++){if(!inBounds(x,y))continue;if(Math.abs(cx-x)+Math.abs(cy-y)<=r)drawOutlineRect(x,y,color,.18)}}}
function highlightPlacementArea(){for(let y=state.player.y-PLACE_RADIUS;y<=state.player.y+PLACE_RADIUS;y++){for(let x=state.player.x-PLACE_RADIUS;x<=state.player.x+PLACE_RADIUS;x++){if(!inBounds(x,y))continue;const check=isValidPlacement(x,y);if(check.ok)drawOutlineRect(x,y,COLORS.player,.25)}}}
function addFX(kind,x,y,life=18){state.fx.push({kind,x,y,life,max:life})}
function addProjectileFX(kind,sx,sy,tx,ty,color,life=12){state.fx.push({kind,sx,sy,tx,ty,color,life,max:life})}
function drawEffects(){
    const next=[];
    for(let i=0;i<state.fx.length;i++){
        const fx=state.fx[i];
        fx.life--;
        if(fx.life<=0)continue;
        const {sx,sy}=tileToScreen(fx.x,fx.y);
        ctx.save();
        if(fx.kind==='hit'){
            ctx.globalAlpha=fx.life/fx.max;
            ctx.strokeStyle='#e8ecff';
            ctx.lineWidth=Math.max(1,tileSize*.06);
            ctx.beginPath();
            ctx.arc(sx+tileSize/2,sy+tileSize/2,tileSize*.3*(1+(fx.max-fx.life)/fx.max),0,Math.PI*2);
            ctx.stroke();
        }else if(fx.kind==='slow'){
            ctx.globalAlpha=.5*(fx.life/fx.max);
            ctx.strokeStyle='#06b6d4';
            ctx.lineWidth=2;
            ctx.strokeRect(sx+tilePad,sy+tilePad,tileSize-tilePad*2,tileSize-tilePad*2);
        }else if(fx.kind==='fire'){
            ctx.globalAlpha=.5*(fx.life/fx.max);
            ctx.fillStyle='rgba(239,68,68,.25)';
            ctx.beginPath();
            ctx.arc(sx+tileSize/2,sy+tileSize/2,tileSize*.45,0,Math.PI*2);
            ctx.fill();
        }else if(fx.kind==='fireRange'){
            const a=.3*(fx.life/fx.max);
            for(let y=fx.y-fx.r;y<=fx.y+fx.r;y++){
                for(let x=fx.x-fx.r;x<=fx.x+fx.r;x++){
                    if(!inBounds(x,y))continue;
                    if(Math.abs(fx.x-x)+Math.abs(fx.y-y)<=fx.r)drawOutlineRect(x,y,COLORS.fire,a);
                }
            }
        }else if(fx.kind==='saboteurExplosion'){
            ctx.globalAlpha=.5*(fx.life/fx.max);
            ctx.fillStyle='rgba(168,85,247,.25)';
            ctx.beginPath();
            ctx.arc(sx+tileSize/2,sy+tileSize/2,tileSize*.45,0,Math.PI*2);
            ctx.fill();
        }else if(fx.kind==='saboteurRange'){
            const a=.3*(fx.life/fx.max);
            for(let y=fx.y-fx.r;y<=fx.y+fx.r;y++){
                for(let x=fx.x-fx.r;x<=fx.x+fx.r;x++){
                    if(!inBounds(x,y))continue;
                    if(Math.abs(fx.x-x)+Math.abs(fx.y-y)<=fx.r)drawOutlineRect(x,y,COLORS.saboteurExplosion,a);
                }
            }
        }else if(fx.kind==='projectile'){
            const p=1-fx.life/fx.max;
            const {sx:asx,sy:asy}=tileToScreen(fx.sx,fx.sy);
            const {sx:bsx,sy:bsy}=tileToScreen(fx.tx,fx.ty);
            const x=asx+(bsx-asx)*p;
            const y=asy+(bsy-asy)*p;
            ctx.globalAlpha=1;
            ctx.strokeStyle=fx.color||'#fff';
            ctx.lineWidth=Math.max(2,tileSize*.15);
            ctx.beginPath();
            ctx.moveTo(x+tileSize/2,y+tileSize/2);
            ctx.lineTo(x+tileSize/2-(bsx-asx)*.2,y+tileSize/2-(bsy-asy)*.2);
            ctx.stroke();
        }else if(fx.kind==='slash'){
            ctx.globalAlpha=fx.life/fx.max;
            ctx.strokeStyle='#e8ecff';
            ctx.lineWidth=Math.max(2,tileSize*.1);
            ctx.beginPath();
            ctx.moveTo(sx+tilePad,sy+tilePad);
            ctx.lineTo(sx+tileSize-tilePad,sy+tileSize-tilePad);
            ctx.moveTo(sx+tilePad,sy+tileSize-tilePad);
            ctx.lineTo(sx+tileSize-tilePad,sy+tilePad);
            ctx.stroke();
        }
        ctx.restore();
        next.push(fx);
    }
    state.fx=next
}

function drawPlayer(){const {sx,sy}=tileToScreen(state.player.x,state.player.y);const bob=Math.sin(animT/200)*tileSize*.1;ctx.save();ctx.translate(sx+tileSize/2,sy+tileSize/2+bob);const r=tileSize/2-tilePad;ctx.fillStyle=COLORS.player;ctx.beginPath();ctx.arc(0,0,r,0,Math.PI*2);ctx.fill();ctx.fillStyle='#000';const eyeOffset=tileSize*.15,eyeR=tileSize*.07;ctx.beginPath();ctx.arc(-eyeOffset,-eyeOffset,eyeR,0,Math.PI*2);ctx.arc(eyeOffset,-eyeOffset,eyeR,0,Math.PI*2);ctx.fill();ctx.restore()}
function drawEnemy(e){const {sx,sy}=tileToScreen(e.x,e.y);const bob=Math.sin(animT/200+(e.x+e.y))*tileSize*.1;ctx.save();ctx.translate(sx+tileSize/2,sy+tileSize/2+bob);const r=tileSize/2-tilePad;let col;switch(e.kind){case'goblin':col=COLORS.enemyGoblin;break;case'archer':col=COLORS.enemyArcher;break;case'wraith':col=COLORS.enemyWraith;break;case'brute':col=COLORS.enemyBrute;break;case'saboteur':col=COLORS.enemySaboteur;break;case'hunter':col=COLORS.enemyHunter;break;default:col=COLORS.enemyWraith;}ctx.fillStyle=col;ctx.beginPath();ctx.arc(0,0,r,0,Math.PI*2);ctx.fill();ctx.fillStyle='#000';const eyeR=tileSize*.07;ctx.beginPath();ctx.arc(-r*.3,-r*.2,eyeR,0,Math.PI*2);ctx.arc(r*.3,-r*.2,eyeR,0,Math.PI*2);ctx.fill();if(e.kind==='archer'){ctx.strokeStyle='#000';ctx.lineWidth=Math.max(2,tileSize*.07);ctx.beginPath();ctx.moveTo(-r*.6,0);ctx.lineTo(r*.6,0);ctx.stroke()}if(e.kind==='wraith'){ctx.fillStyle='rgba(0,0,0,.3)';ctx.beginPath();ctx.moveTo(-r,r*.2);ctx.lineTo(0,r);ctx.lineTo(r,r*.2);ctx.closePath();ctx.fill()}ctx.restore();const maxhp=e.maxhp||(ENEMY[e.kind]?ENEMY[e.kind].hp:ENEMY.wraith.hp);drawHPBar(e.x,e.y,Math.max(0,e.hp)/maxhp)}
function draw(){const rect=canvas.getBoundingClientRect();const dpr=window.devicePixelRatio||1;canvas.width=Math.floor(rect.width*dpr);canvas.height=Math.floor(rect.height*dpr);ctx.setTransform(dpr,0,0,dpr,0,0);tileSize=rect.width/VIEW_W;tilePad=Math.max(1,Math.floor(tileSize*.03));updateCamera();ensureOffscreen();if(!terrainValid)drawTerrainAll();ctx.save();if(state.placeMode){const {sx:psx,sy:psy}=tileToScreen(state.player.x,state.player.y);ctx.translate(rect.width/2,rect.height/2);ctx.scale(PLACE_ZOOM,PLACE_ZOOM);ctx.translate(-psx-tileSize/2,-psy-tileSize/2);}ctx.drawImage(terrainCanvas,-state.cameraX*tileSize,-state.cameraY*tileSize);if(state.placeMode)highlightPlacementArea();const pulse=(Math.sin(animT/600)+1)/2;for(const s of state.map.spawners){const {sx,sy}=tileToScreen(s.x,s.y);ctx.save();ctx.globalAlpha=.35+.35*pulse;ctx.strokeStyle=COLORS.spawner;ctx.lineWidth=Math.max(2,tileSize*.1);ctx.beginPath();ctx.arc(sx+tileSize/2,sy+tileSize/2,tileSize*.42+tileSize*.08*pulse,0,Math.PI*2);ctx.stroke();ctx.restore()}if(state.placeMode){for(const t of state.towers){if(t.type==='arrow')outlineRangeTiles(t.x,t.y,TRAP_RANGE,COLORS.arrow);if(t.type==='rune')outlineRangeTiles(t.x,t.y,RUNE_RADIUS,COLORS.rune);if(t.type==='fire')outlineRangeTiles(t.x,t.y,FIRE_RADIUS,COLORS.fire);if(t.type==='spike')drawOutlineRect(t.x,t.y,COLORS.spike,.25)}}for(const t of state.towers){drawTrapIcon(t);if(t.ammo!==undefined)drawTrapMeter(t)}for(const e of state.enemies)drawEnemy(e);drawPlayer();drawEffects();ctx.restore();if(state.won||state.lost){ctx.save();ctx.fillStyle='rgba(0,0,0,.55)';ctx.fillRect(0,0,rect.width,rect.height);ctx.fillStyle=state.won?'#7dff9d':'#ff6b6b';ctx.font='bold 26px system-ui';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(state.won?'YOU ESCAPED!':'DEFEATED',rect.width/2,rect.height/2-10);ctx.fillStyle='#e8ecff';ctx.font='16px system-ui';ctx.fillText('Tap "New Game" to try again',rect.width/2,rect.height/2+18);ctx.restore()}}window.addEventListener('resize',()=>{ensureOffscreen();terrainValid=false});
document.addEventListener('keydown',(e)=>{if(state.won||state.lost||state.placeMode)return;const key=e.key.toLowerCase();if(['arrowup','w'].includes(key))playerMove(0,-1,e.shiftKey);else if(['arrowdown','s'].includes(key))playerMove(0,1,e.shiftKey);else if(['arrowleft','a'].includes(key))playerMove(-1,0,e.shiftKey);else if(['arrowright','d'].includes(key))playerMove(1,0,e.shiftKey);else if(key==='q')toggleDashArm();else if(['1','2','3','4'].includes(e.key))setActiveTrap(TRAP_DEFS[Number(e.key)-1].id);});
btnDash.addEventListener('click',()=>{if(!btnDash.disabled)toggleDashArm()});
function toggleDashArm(){if(state.dashCD>0||state.mana<DASH_COST){logMsg(state.dashCD>0?`Dash on cooldown (${state.dashCD}).`:`Need ${DASH_COST} mana to dash.`);return}state.dashArmed=!state.dashArmed;setDashArmed(state.dashArmed,state.dashCD)}
function canvasPosToTile(clientX,clientY){const rect=canvas.getBoundingClientRect();let x=clientX-rect.left,y=clientY-rect.top;if(state.placeMode){const {sx:psx,sy:psy}=tileToScreen(state.player.x,state.player.y);x=(x-rect.width/2)/PLACE_ZOOM+psx+tileSize/2;y=(y-rect.height/2)/PLACE_ZOOM+psy+tileSize/2}x=Math.floor(Math.max(0,Math.min(rect.width-1,x))/tileSize)+state.cameraX;y=Math.floor(Math.max(0,Math.min(rect.height-1,y))/tileSize)+state.cameraY;return{x,y}}
btnPlace.addEventListener('click',()=>{if(btnPlace.disabled)return;state.placeMode=!state.placeMode;if(!state.placeMode)state.hover=null;drawPlacementPreview();});
canvas.addEventListener('click',(e)=>{if(!state.placeMode||state.won||state.lost)return;const {x,y}=canvasPosToTile(e.clientX,e.clientY);const check=isValidPlacement(x,y);if(!check.ok){logMsg(`Can't place: ${check.reason}`);return}tryPlace(x,y)},{passive:true});
canvas.addEventListener('mousemove',(e)=>{if(!state.placeMode){drawPlacementPreview();return;}const {x,y}=canvasPosToTile(e.clientX,e.clientY);drawPlacementPreview(x,y);},{passive:true});
canvas.addEventListener('mouseleave',()=>{drawPlacementPreview();});
document.querySelectorAll('#dpad button').forEach(btn=>btn.addEventListener('click',()=>window.onMove(btn.dataset.dir)));
let swipeStart=null;
canvas.addEventListener('touchstart',e=>{const t=e.changedTouches[0];swipeStart={x:t.clientX,y:t.clientY};},{passive:true});
canvas.addEventListener('touchend',e=>{if(!swipeStart)return;const t=e.changedTouches[0];const dx=t.clientX-swipeStart.x,dy=t.clientY-swipeStart.y;if(Math.abs(dx)>Math.abs(dy)&&Math.abs(dx)>24)window.onMove(dx>0?'right':'left');else if(Math.abs(dy)>24)window.onMove(dy>0?'down':'up');swipeStart=null;},{passive:true});
function rebuildFlow(){const INF=1e9;const dist=Array.from({length:GRID_H},()=>Array(GRID_W).fill(INF));const q=[];const start={x:state.player.x,y:state.player.y};dist[start.y][start.x]=0;q.push(start);const dirs=[[1,0],[-1,0],[0,1],[0,-1]];while(q.length){const cur=q.shift();const d=dist[cur.y][cur.x]+1;for(let i=0;i<4;i++){const nx=cur.x+dirs[i][0],ny=cur.y+dirs[i][1];if(!inBounds(nx,ny))continue;if(isWall(nx,ny))continue;if(d<dist[ny][nx]){dist[ny][nx]=d;q.push({x:nx,y:ny})}}}state.flowDist=dist;state.flowDirty=false}

function playerMove(dx,dy,useDashKey=false){if(state.won||state.lost)return;const px=state.player.x,py=state.player.y;let didDash=false;if((state.dashArmed||useDashKey)&&state.dashCD===0&&state.mana>=DASH_COST){let nx=state.player.x,ny=state.player.y;for(let step=0;step<2;step++){const tx=nx+dx,ty=ny+dy;if(!inBounds(tx,ty)||isWall(tx,ty))break;nx=tx;ny=ty}if(nx!==state.player.x||ny!==state.player.y){state.player.x=nx;state.player.y=ny;state.mana-=DASH_COST;state.dashCD=DASH_CD;state.dashArmed=false;didDash=true;logMsg('Dashed!')}}if(!didDash){const nx=state.player.x+dx,ny=state.player.y+dy;if(!inBounds(nx,ny)||isWall(nx,ny))return;state.player.x=nx;state.player.y=ny}const mdx=state.player.x-px,mdy=state.player.y-py;if(mdx||mdy)state.lastMove={dx:mdx,dy:mdy};for(const c of state.map.chests){if(!c.opened&&samePos(c,state.player)){c.opened=true;state.mana+=CHEST_MANA;terrainValid=false;logMsg(`Opened chest: +${CHEST_MANA} mana.`)}}updateCamera();if(state.player.x===state.map.exit.x&&state.player.y===state.map.exit.y){state.won=true;updateHUD();return}state.flowDirty=true;advanceTurn()}
window.onMove=(dir)=>{if(dir==='up')playerMove(0,-1);else if(dir==='down')playerMove(0,1);else if(dir==='left')playerMove(-1,0);else if(dir==='right')playerMove(1,0);};
function tryPlace(x,y){const t=state.selectedTool,cost=COSTS[t];state.mana-=cost;if(state.ammo[t]!==Infinity)state.ammo[t]--;if(t==='arrow')state.towers.push({x,y,type:t,ammo:ARROW_AMMO});else state.towers.push({x,y,type:t});state.placeMode=false;state.hover=null;logMsg(`Placed ${t} at (${x},${y}).`);updateMana(state.mana);advanceTurn()}
function isValidPlacement(x,y){if(!inBounds(x,y))return{ok:false,reason:'out of bounds'};if(isWall(x,y))return{ok:false,reason:'wall tile'};if(isStart(x,y)||isExit(x,y))return{ok:false,reason:'reserved tile'};if(isSpawner(x,y))return{ok:false,reason:'spawner tile'};if(isChest(x,y))return{ok:false,reason:'chest tile'};if(state.player.x===x&&state.player.y===y)return{ok:false,reason:'on player'};const dist=Math.abs(state.player.x-x)+Math.abs(state.player.y-y);if(dist>PLACE_RADIUS)return{ok:false,reason:`must place within ${PLACE_RADIUS} tiles of player`};if(state.towers.some(t=>t.x===x&&t.y===y))return{ok:false,reason:'occupied by a trap'};const cost=COSTS[state.selectedTool];if(state.mana<cost)return{ok:false,reason:`need ${cost} mana`};return{ok:true}}
function flashHP(){hud.hpCard.classList.add('flash');setTimeout(()=>hud.hpCard.classList.remove('flash'),250)}
function advanceTurn(){if(state.won||state.lost)return;state.turn+=1;state.mana+=PASSIVE_MANA;if(state.dashCD>0)state.dashCD-=1;towersAct();enemiesPreEffects();try{enemiesAct()}catch(err){logMsg(`AI error: ${err.message}`)}handleSpawns();checkWinLose();updateHUD()}
function rewardFor(k){return ENEMY[k]?.reward||0}
function towersAct(){
    if(!state.towers.length)return;
    const survivors=[];
    for(const t of state.towers){
        if(t.type==='arrow'){
            let best=null,bestD=1e9;
            for(const e of state.enemies){
                if(e.kind==='saboteur')continue;
                const d=Math.abs(t.x-e.x)+Math.abs(t.y-e.y);
                if(d<=TRAP_RANGE&&(t.x===e.x||t.y===e.y)&&lineOfSightRowCol(t,e)){
                    if(d<bestD){best=e;bestD=d}
                }
            }
            let ammo=(t.ammo===undefined?ARROW_AMMO:t.ammo);
            if(best&&ammo>0){
                best.hp-=TRAP_DMG;
                addProjectileFX('projectile',t.x,t.y,best.x,best.y,COLORS.arrow,10);
                addFX('hit',best.x,best.y);
                ammo-=1;
            }
            if(ammo>0){t.ammo=ammo;survivors.push(t)}else terrainValid=false;
        }else if(t.type==='rune'){
            const targets=state.enemies.filter(e=>Math.abs(t.x-e.x)+Math.abs(t.y-e.y)<=RUNE_RADIUS);
            if(targets.some(e=>e.kind!=='saboteur')){
                for(const e of targets){e.slowTurns=Math.max(e.slowTurns||0,RUNE_SLOW_TURNS);}
                addFX('slow',t.x,t.y,14);
            }
            survivors.push(t);
        }else if(t.type==='fire'){
            const targets=state.enemies.filter(e=>Math.abs(t.x-e.x)+Math.abs(t.y-e.y)<=FIRE_RADIUS);
            if(targets.some(e=>e.kind!=='saboteur')){
                for(const e of targets){
                    e.hp-=FIRE_DMG;
                    e.burn=Math.max(e.burn||0,BURN_TURNS);
                    addFX('fire',e.x,e.y,12);
                }
                state.fx.push({kind:'fireRange',x:t.x,y:t.y,r:FIRE_RADIUS,life:12,max:12});
            }
            survivors.push(t);
        }else if(t.type==='spike'){
            survivors.push(t);
        }
    }
    let add=0;const alive=[];
    for(const e of state.enemies){
        if(e.hp<=0)add+=rewardFor(e.kind);
        else alive.push(e);
    }
    if(add>0)logMsg(`Enemies defeated (+${add} mana).`);
    state.mana+=add;state.enemies=alive;state.towers=survivors;
}
function enemiesPreEffects(){let add=0;const alive=[];for(const e of state.enemies){if(e.burn&&e.burn>0){e.hp-=BURN_DMG;e.burn--;addFX('fire',e.x,e.y,10)}if(e.hp<=0)add+=rewardFor(e.kind);else alive.push(e)}if(add>0){state.mana+=add;logMsg(`Burned enemies defeated (+${add} mana).`)}state.enemies=alive}
function bfsPath(start,goal,allowPhase,occupied,traps,avoidTraps=true){const dirs=[[1,0],[-1,0],[0,1],[0,-1]];const q=[start];const prev={};const seen=new Set([start.x+','+start.y]);const goalKey=goal.x+','+goal.y;while(q.length){const cur=q.shift();const key=cur.x+','+cur.y;if(key===goalKey)break;for(const d of dirs){const nx=cur.x+d[0],ny=cur.y+d[1];if(!inBounds(nx,ny))continue;if(!allowPhase&&isWall(nx,ny))continue;const nk=nx+','+ny;if(seen.has(nk))continue;if(occupied.has(nk)&&nk!==goalKey)continue;if(avoidTraps&&traps.has(nk))continue;seen.add(nk);prev[nk]=cur;q.push({x:nx,y:ny})}}if(!seen.has(goalKey))return null;const path=[];let cur=goal;while(cur){path.unshift(cur);const k=cur.x+','+cur.y;cur=prev[k]}return path}
function adjacentTargets(base,occupied){const dirs=[[1,0],[-1,0],[0,1],[0,-1]];const goals=[];for(const d of dirs){const tx=base.x+d[0],ty=base.y+d[1];if(!inBounds(tx,ty)||isWall(tx,ty))continue;const key=tx+','+ty;if(!occupied.has(key))goals.push({x:tx,y:ty})}if(!goals.length)goals.push({x:base.x,y:base.y});return goals}
function enemyAttack(e){
    if(e.kind==='archer'){
        if(e.cooldown>0){e.cooldown--;return false}
        const d=Math.abs(e.x-state.player.x)+Math.abs(e.y-state.player.y);
        if(d<=ENEMY.archer.range&&clearShotToPlayer(e,e)){
            addProjectileFX('projectile',e.x,e.y,state.player.x,state.player.y,COLORS.enemyArcher,12);
            state.hp-=ENEMY.archer.dmg;
            flashHP();
            logMsg(`Skeleton archer hits you for ${ENEMY.archer.dmg}.`);
            e.cooldown=ENEMY.archer.cd;
            return true;
        }
        return false;
    }else{
        const d=Math.abs(e.x-state.player.x)+Math.abs(e.y-state.player.y);
        const dmg=ENEMY[e.kind]?.touch||0;
        if(d===1&&dmg>0){
            state.hp-=dmg;
            flashHP();
            addFX('slash',state.player.x,state.player.y,12);
            logMsg(`Enemy hit you for ${dmg} damage.`);
            return true;
        }
        return false;
    }
}
function moveArcher(e,occupied){const key=e.x+','+e.y;occupied.delete(key);const dirs=[[1,0],[-1,0],[0,1],[0,-1]];let best=null;for(const d of dirs){const nx=e.x+d[0],ny=e.y+d[1];if(!inBounds(nx,ny)||isWall(nx,ny))continue;const nk=nx+','+ny;if(occupied.has(nk))continue;if(state.towers.some(t=>t.x===nx&&t.y===ny))continue;const dist=Math.abs(nx-state.player.x)+Math.abs(ny-state.player.y);const shot=dist<=ENEMY.archer.range&&clearShotToPlayer({x:nx,y:ny},e);const score=Math.abs(dist-ENEMY.archer.range)+(shot?0:1);if(!best||score<best.score)best={nx,ny,score}}if(best){e.x=best.nx;e.y=best.ny;occupied.add(best.nx+','+best.ny)}else occupied.add(key)}
function moveEnemy(e,occupied){const key=e.x+','+e.y;occupied.delete(key);const traps=new Set(state.towers.map(t=>t.x+','+t.y));let base={x:state.player.x,y:state.player.y};if(state.lastMove&&(Math.abs(e.x-state.player.x)+Math.abs(e.y-state.player.y)>4)){const px=state.player.x+state.lastMove.dx,py=state.player.y+state.lastMove.dy;if(inBounds(px,py)&&!isWall(px,py))base={x:px,y:py}}const goals=adjacentTargets(base,occupied);let best=null,bestLen=1e9;for(const g of goals){let p=bfsPath({x:e.x,y:e.y},g,e.kind==='wraith',occupied,traps,true);if(!p)p=bfsPath({x:e.x,y:e.y},g,e.kind==='wraith',occupied,traps,false);if(p&&p.length<bestLen){best=p;bestLen=p.length}}if(best&&best.length>1){const step=best[1];const nk=step.x+','+step.y;if(!occupied.has(nk)){e.x=step.x;e.y=step.y;occupied.add(nk)}else occupied.add(key)}else occupied.add(key)}
function moveSaboteur(e,occupied){
    const key=e.x+','+e.y;
    const traps=state.towers;
    if(!traps.length){moveEnemy(e,occupied);return;}
    occupied.delete(key);
    let best=null,bestLen=1e9;
    for(const t of traps){
        const p=bfsPath({x:e.x,y:e.y},{x:t.x,y:t.y},false,occupied,new Set(),false);
        if(p&&p.length<bestLen){best=p;bestLen=p.length;}
    }
    if(best&&best.length>1){
        const step=best[1];
        const nk=step.x+','+step.y;
        e.x=step.x;e.y=step.y;occupied.add(nk);
    }else{
        occupied.add(key);
    }
}
function saboteurExplode(s){
    for(const other of state.enemies){
        if(other===s)continue;
        const d=Math.abs(other.x-s.x)+Math.abs(other.y-s.y);
        if(d<=SAB_EXP_RADIUS){
            other.hp-=SAB_EXP_DMG;
            addFX('hit',other.x,other.y);
        }
    }
    if(Math.abs(state.player.x-s.x)+Math.abs(state.player.y-s.y)<=SAB_EXP_RADIUS){
        state.hp-=SAB_EXP_DMG;
        flashHP();
        addFX('hit',state.player.x,state.player.y);
        logMsg(`Saboteur explosion hits you for ${SAB_EXP_DMG}.`);
    }
    addFX('saboteurExplosion',s.x,s.y,12);
    state.fx.push({kind:'saboteurRange',x:s.x,y:s.y,r:SAB_EXP_RADIUS,life:12,max:12});
}
function enemiesAct(){
    const occupied=new Set([state.player.x+','+state.player.y]);
    for(const en of state.enemies)occupied.add(en.x+','+en.y);
    const survivors=[];let add=0;
    for(const e of state.enemies){
        if(e.hp<=0){add+=rewardFor(e.kind);continue}
        if(e.slowTurns&&e.slowTurns>0&&state.turn%2===1){e.slowTurns--;survivors.push(e);continue}
        let acted=false;
        if(e.kind==='archer'){
            acted=enemyAttack(e);
            if(!acted){moveArcher(e,occupied);acted=enemyAttack(e)}
        }else if(e.kind==='brute'){
            if(e.bruteRest){acted=enemyAttack(e);e.bruteRest=false;occupied.add(e.x+','+e.y);}
            else{moveEnemy(e,occupied);acted=enemyAttack(e);e.bruteRest=true;}
        }else if(e.kind==='saboteur'){
            moveSaboteur(e,occupied);
            const tidx=state.towers.findIndex(t=>t.x===e.x&&t.y===e.y);
            if(tidx!==-1){
                state.towers.splice(tidx,1);
                terrainValid=false;
                logMsg('Saboteur detonated after destroying a trap!');
                saboteurExplode(e);
                occupied.delete(e.x+','+e.y);
                add+=rewardFor(e.kind);
                continue;
            }
            acted=enemyAttack(e);
        }else if(e.kind==='hunter'){
            for(let s=0;s<2;s++){moveEnemy(e,occupied);if(enemyAttack(e)){acted=true;break;}}
            if(!acted)acted=enemyAttack(e);
        }else{
            moveEnemy(e,occupied);acted=enemyAttack(e);
        }
        const idx=state.towers.findIndex(t=>t.type==='spike'&&t.x===e.x&&t.y===e.y);
        if(idx!==-1){e.hp-=SPIKE_DMG;state.towers.splice(idx,1);logMsg(`Spike hits for ${SPIKE_DMG}.`);addFX('hit',e.x,e.y)}
        if(e.hp>0){survivors.push(e);if(e.slowTurns&&e.slowTurns>0&&state.turn%2===0)e.slowTurns--}else add+=rewardFor(e.kind);
        if(state.hp<=0)break
    }
    if(add>0){state.mana+=add;logMsg(`Enemies defeated (+${add} mana).`)}
    state.enemies=survivors
}
function spawnCooldown(t){return baseSpawnCooldown(t)}function spawnCount(t,progress){return (1+Math.floor(t/15))+(progress>.5?1:0)}
function pickSpawnPos(){const minR=SPAWN_MIN_RADIUS;const ring=state.map.spawners.filter(s=>{const d=Math.abs(s.x-state.player.x)+Math.abs(s.y-state.player.y);return d>=Math.max(8,minR)&&d<=18});const behindRing=ring.filter(s=>s.x<=state.player.x-2);const pool1=behindRing.length?behindRing:(ring.length?ring:state.map.spawners);const candidates=pool1.filter(p=>{const d=Math.abs(p.x-state.player.x)+Math.abs(p.y-state.player.y);return d>=minR&&!(p.x===state.player.x&&p.y===state.player.y)&&!state.enemies.some(e=>e.x===p.x&&e.y===p.y)});if(candidates.length)return candidates[(Math.random()*candidates.length)|0];let best=null,bestD=-1;for(const p of state.map.spawners){const d=Math.abs(p.x-state.player.x)+Math.abs(p.y-state.player.y);if(d>=minR&&d>bestD){best=p;bestD=d}}return best}
function spawnBoss(){
    const pos=pickSpawnPos();
    if(!pos)return;
    const roll=Math.random();
    let kind='brute';
    if(roll<1/3)kind='brute';
    else if(roll<2/3)kind='saboteur';
    else kind='hunter';
    const base=ENEMY[kind];
    state.enemies.push({x:pos.x,y:pos.y,hp:base.hp,maxhp:base.hp,kind,bruteRest:false});
    logMsg(`A ${kind} boss has appeared!`);
}
function handleSpawns(){
    const nearCount=state.enemies.reduce((n,e)=>n+(Math.abs(e.x-state.player.x)+Math.abs(e.y-state.player.y)<=4?1:0),0);
    if(nearCount>=5){state.nextSpawn=Math.max(state.nextSpawn,2);return}
    state.nextSpawn-=1;
    if(state.nextSpawn<=0){
        const free=ENEMY_CAP-state.enemies.length;
        if(free>0){
            const progress=state.player.x/(GRID_W-1);
            const desired=Math.min(spawnCount(state.turn,progress),free);
            let count=0;
            for(let i=0;i<desired;i++){
                const pos=pickSpawnPos();
                if(!pos)break;
                const roll=Math.random();
                let kind='goblin';
                if(roll>.8)kind='wraith';
                else if(roll>.55)kind='archer';
                const base=ENEMY[kind];
                state.enemies.push({x:pos.x,y:pos.y,hp:base.hp,maxhp:base.hp,kind,cooldown:ENEMY.archer.cd,idle:(nearCount>=5?1:0)});
                count++;
            }
            if(count>0)logMsg(count===1?'An enemy emerged from a portal!':`${count} enemies emerged from portals!`);
        }
        state.nextSpawn=spawnCooldown(state.turn);
    }
    if(state.turn>0&&state.turn%20===0)spawnBoss();
}
function checkWinLose(){if(state.player.x===state.map.exit.x&&state.player.y===state.map.exit.y){state.won=true;logMsg('You reached the exit. Victory!')}if(state.hp<=0){state.lost=true;logMsg('You have fallen...')}}
function resetState(){const map=buildMap();state={map,turn:0,hp:START_HP,mana:START_MANA,nextSpawn:1,player:{x:map.start.x,y:map.start.y},enemies:[],towers:[],visited:Array.from({length:GRID_H},()=>Array(GRID_W).fill(false)),placeMode:false,selectedTool:'arrow',won:false,lost:false,fx:[],hover:null,flowDist:null,flowDirty:true,dashCD:0,dashArmed:false,lastMove:{dx:0,dy:0},ammo:{arrow:Infinity,rune:Infinity,fire:Infinity,spike:Infinity},cameraX:0,cameraY:0};state.visited[state.player.y][state.player.x]=true;clearLog();logMsg('v2.9.7: trap icons, ammo meters, and fire totem AoE indicator.');const rect=canvas.getBoundingClientRect();const dpr=window.devicePixelRatio||1;canvas.width=Math.floor(rect.width*dpr);canvas.height=Math.floor(rect.height*dpr);ctx.setTransform(dpr,0,0,dpr,0,0);tileSize=rect.width/VIEW_W;tilePad=Math.max(1,Math.floor(tileSize*.03));ensureOffscreen();terrainValid=false;updateCamera();renderTrapbar(TRAP_DEFS,state);TRAP_DEFS.forEach(t=>setCooldown(t.id,0,1));updateHUD();}



btnNew.addEventListener('click',resetState);

btnHelp.addEventListener('click',()=>{

    alert('2.9.3 hotfix:\n• Fixed AI (removed stray rebuildFlow override).\n• Early win check after movement.\n• Chests are brighter and filled.\n• Archer cooldown clamped.\n• Prevented enemy swap moves.\n• Enemy phase wrapped in try/catch.')

});

function loop(ts){animT=ts;draw();requestAnimationFrame(loop)}
renderLegend(LEGEND_DATA);
resetState();
requestAnimationFrame(loop);

})();
