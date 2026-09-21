import * as THREE from 'three';
import {OrbitControls} from './vendor/OrbitControls.js';
import {createSim,command,step,obstacles,markers,route} from './simulation.js';

const $=id=>document.getElementById(id);
let mode='demo',sim=createSim(),live=null,serverOnline=false,view='orbit',keys=new Set(),lastTime=performance.now(),lastTrail=0;
const logs=[];
function log(message){
  logs.unshift({time:new Date().toISOString(),mode,message});logs.splice(150);
  const row=document.createElement('li'),time=document.createElement('time'),text=document.createElement('span');
  time.textContent=new Date().toLocaleTimeString([], {hour12:false});text.textContent=message;row.append(time,text);$('log').prepend(row);
  while($('log').children.length>30)$('log').lastChild.remove();
}
const scene=new THREE.Scene();scene.background=new THREE.Color('#12212b');scene.fog=new THREE.Fog('#12212b',75,160);
const camera=new THREE.PerspectiveCamera(48,1,.1,400);camera.position.set(43,39,52);
let renderer,feedRenderer,thermalRenderer;
try{
  renderer=new THREE.WebGLRenderer({antialias:true});renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  $('scene').appendChild(renderer.domElement);
  feedRenderer=new THREE.WebGLRenderer({canvas:$('rgb-canvas'),antialias:true});
  thermalRenderer=new THREE.WebGLRenderer({canvas:$('thermal-canvas'),antialias:true});
}catch(error){$('graphics-error').hidden=false;throw error;}
const controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=true;controls.maxPolarAngle=Math.PI/2-.03;controls.minDistance=5;controls.maxDistance=110;controls.target.set(0,0,0);
controls.addEventListener('start',()=>{if(view!=='orbit')setView('orbit');});
scene.add(new THREE.HemisphereLight(0xb5e4ed,0x17242f,2));
const sun=new THREE.DirectionalLight(0xe9f8ff,2.4);sun.position.set(20,50,30);sun.castShadow=true;sun.shadow.mapSize.set(1024,1024);sun.shadow.camera.left=-40;sun.shadow.camera.right=40;sun.shadow.camera.top=40;sun.shadow.camera.bottom=-40;scene.add(sun);
const terrain=new THREE.Group();scene.add(terrain);
const mat=(color,roughness=.8)=>new THREE.MeshStandardMaterial({color,roughness});
const groundMat=mat('#142936'), concrete=mat('#354b56'), edgeMat=new THREE.LineBasicMaterial({color:'#668591',transparent:true,opacity:.35});
function box(w,h,d,x,y,z,material,parent=terrain){const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),material);m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;parent.add(m);return m;}
box(64,.3,64,0,-.2,0,groundMat);
const grid=new THREE.GridHelper(64,32,0x527b89,0x294451);grid.position.y=.015;scene.add(grid);
const demoWorld=new THREE.Group();scene.add(demoWorld);
box(4,.03,58,0,.025,0,mat('#203844'),demoWorld);
box(58,.03,4,0,.03,0,mat('#203844'),demoWorld);
for(let i=-26;i<=26;i+=4){box(.14,.015,1.4,0,.06,i,mat('#63838b'),demoWorld);}
for(const [index,o] of obstacles.entries()){
  const building=box(o.w,o.h,o.d,o.east,o.h/2,-o.north,concrete,demoWorld);
  const outline=new THREE.LineSegments(new THREE.EdgesGeometry(building.geometry),edgeMat);building.add(outline);
  for(let y=1.7;y<o.h-1;y+=2.5){for(let x=-o.w/2+1;x<o.w/2-.5;x+=2){box(.75,.9,.025,o.east+x,y,-o.north+o.d/2+.03,mat(index%2?'#162a36':'#192d36'),demoWorld);}}
  box(o.w+.25,.25,o.d+.25,o.east,o.h,-o.north,mat('#58717b'),demoWorld);
  if(index!==1){for(let i=0;i<5;i++){const debris=box(1.3,.5,.9,o.east-o.w/2-1.5+(i%2),.25,-o.north+i*1.3,mat('#637078'),demoWorld);debris.rotation.y=i*.7;}}
}
const pad=new THREE.Mesh(new THREE.CylinderGeometry(3,3,.08,48),mat('#203f43'));pad.position.set(0,.08,22);demoWorld.add(pad);
const padRing=new THREE.Mesh(new THREE.TorusGeometry(2.5,.045,8,64),new THREE.MeshBasicMaterial({color:'#65d8c5'}));padRing.rotation.x=Math.PI/2;padRing.position.set(0,.15,22);demoWorld.add(padRing);
box(.16,.02,1.5,-.5,.16,22,mat('#65d8c5'),demoWorld);box(.16,.02,1.5,.5,.16,22,mat('#65d8c5'),demoWorld);box(1,.02,.15,0,.16,22,mat('#65d8c5'),demoWorld);
function label(text,color){
  const canvas=document.createElement('canvas');canvas.width=256;canvas.height=64;const ctx=canvas.getContext('2d');ctx.fillStyle='#0b1820';ctx.fillRect(0,0,256,64);ctx.strokeStyle=color;ctx.strokeRect(1,1,254,62);ctx.font='bold 25px Arial';ctx.fillStyle=color;ctx.textAlign='center';ctx.fillText(text,128,42);
  const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:new THREE.CanvasTexture(canvas),depthTest:false}));sprite.scale.set(5,1.25,1);return sprite;
}
const markerObjects=[];
markers.forEach((m,i)=>{
  const group=new THREE.Group();group.position.set(m.east,0,-m.north);demoWorld.add(group);
  const color=m.kind==='hazard'?'#ffb364':'#69edd2';
  const ring=new THREE.Mesh(new THREE.TorusGeometry(1.3,.07,8,40),new THREE.MeshBasicMaterial({color}));ring.rotation.x=Math.PI/2;ring.position.y=.15;group.add(ring);
  if(m.kind==='person'){
    const body=new THREE.Mesh(new THREE.CapsuleGeometry(.28,.65,4,8),mat('#f1bd7c'));body.position.y=.75;body.userData.hot=true;group.add(body);
    const head=new THREE.Mesh(new THREE.SphereGeometry(.23,10,8),mat('#f1bd7c'));head.position.y=1.5;head.userData.hot=true;group.add(head);
  }else if(m.kind==='hazard'){
    for(let j=0;j<3;j++){const shape=new THREE.Mesh(new THREE.ConeGeometry(.55,1.6+j*.4,5),mat('#ef975a'));shape.position.set(j*.45-.4,.8,0);shape.userData.hot=true;group.add(shape);}
  }else{box(1.8,1.3,1.5,0,.65,0,mat('#406e68'),group);}
  const tag=label('0'+(i+1)+' / FIXTURE',color);tag.position.y=3.4;group.add(tag);markerObjects.push(group);
});
const routePoints=route.map(p=>new THREE.Vector3(p[0],.12,-p[1]));
const routeLine=new THREE.Line(new THREE.BufferGeometry().setFromPoints(routePoints),new THREE.LineDashedMaterial({color:0x579c94,dashSize:.5,gapSize:.4,transparent:true,opacity:.5}));routeLine.computeLineDistances();demoWorld.add(routeLine);
const drone=new THREE.Group();scene.add(drone);
const hull=mat('#dee8e8',.35),dark=mat('#152129',.5),accent=mat('#58e4cd',.3);
box(.9,.35,1.3,0,0,0,hull,drone);box(.65,.13,.7,0,.23,.1,dark,drone);box(.45,.08,.18,0,.23,-.5,accent,drone);
const rotors=[];
for(const x of [-1,1])for(const z of [-1,1]){
  const arm=box(1.55,.13,.18,x*.5,0,z*.5,dark,drone);arm.rotation.y=-Math.atan2(z,x);
  const motor=new THREE.Mesh(new THREE.CylinderGeometry(.17,.18,.24,12),dark);motor.position.set(x,.07,z);drone.add(motor);
  const blade=box(1.2,.035,.12,x,.23,z,mat('#9cadb5'),drone);rotors.push(blade);
  const guard=new THREE.Mesh(new THREE.TorusGeometry(.64,.025,6,32),dark);guard.rotation.x=Math.PI/2;guard.position.set(x,.1,z);drone.add(guard);
  box(.08,.5,.08,x*.5,-.32,z*.6,dark,drone);
}
const cameraPod=new THREE.Mesh(new THREE.SphereGeometry(.18,12,8),dark);cameraPod.position.set(0,-.2,-.66);drone.add(cameraPod);
const positionRing=new THREE.Mesh(new THREE.RingGeometry(1.7,1.8,48),new THREE.MeshBasicMaterial({color:0x5fe0cf,side:THREE.DoubleSide,transparent:true,opacity:.6}));positionRing.rotation.x=-Math.PI/2;scene.add(positionRing);
const trailArray=new Float32Array(600*3);const trailGeometry=new THREE.BufferGeometry();trailGeometry.setAttribute('position',new THREE.BufferAttribute(trailArray,3));trailGeometry.setDrawRange(0,0);let trailPoints=[];
const trail=new THREE.Line(trailGeometry,new THREE.LineBasicMaterial({color:0x7af0d4,transparent:true,opacity:.7}));trail.frustumCulled=false;scene.add(trail);
const onboard=new THREE.PerspectiveCamera(65,1,.15,150);
const heatCold=new THREE.MeshBasicMaterial({color:0x152067}),heatWarm=new THREE.MeshBasicMaterial({color:0xffd344});

function resize(){
  const w=$('scene').clientWidth,h=$('scene').clientHeight;renderer.setSize(w,h);camera.aspect=w/h;camera.updateProjectionMatrix();
  for(const [id,r] of [['rgb-feed',feedRenderer],['thermal-feed',thermalRenderer]]){r.setSize($(id).clientWidth,$(id).clientHeight,false);}
}
new ResizeObserver(resize).observe($('scene'));resize();
function setView(next){view=next;for(const v of ['orbit','follow','top'])$(v).classList.toggle('selected',v===next);controls.enableRotate=next==='orbit';if(next==='orbit'){camera.position.copy(drone.position).add(new THREE.Vector3(30,28,35));controls.target.copy(drone.position);}}
for(const v of ['orbit','follow','top'])$(v).onclick=()=>setView(v);
function clearTrail(){trailPoints=[];trailGeometry.setDrawRange(0,0);}
function switchMode(next){
  if(mode===next)return;mode=next;keys.clear();sim.paused=true;clearTrail();
  document.body.classList.toggle('live',next==='realtime');
  for(const m of ['demo','realtime']){$(m).classList.toggle('selected',m===next);$(m).setAttribute('aria-pressed',String(m===next));}
  const demo=mode==='demo';demoWorld.visible=demo;$('mode-strip').classList.toggle('live',!demo);$('mode-strip').querySelector('strong').textContent=demo?'SIMULATION':'READ-ONLY TELEMETRY';
  $('mode-description').textContent=demo?'Virtual drone, synthetic scene and illustrative sensor views. No hardware commands.':'External telemetry only. No physical flight controls, no synthetic fallback.';
  $('mission-title').textContent=demo?'Training ground / Sector 07':'Realtime / Local coordinate frame';
  $('mission-pill').textContent=demo?'DEMO':'REALTIME';$('scene-label').textContent=demo?'SYNTHETIC TRAINING MAP':'TELEMETRY GRID / NOT A RECONSTRUCTED MAP';
  $('objective-detail').textContent=demo?'Explore a fictional disaster site. Practice flight and inspect pre-placed rescue markers.':'Observe incoming drone position and attitude. Position is relative to the producer’s local origin; no surveyed map is loaded.';
  $('annotations').hidden=!demo;$('annotation-empty').hidden=demo;$('marker-count').textContent=demo?'3 FIXTURES':'NOT CONNECTED';
  $('control-hint').hidden=!demo;
  for(const id of ['takeoff','land','tour','pause','reset'])$(id).disabled=!demo;
  for(const kind of ['rgb','thermal']){$(kind+'-canvas').hidden=!demo;$(kind+'-image').hidden=true;$(kind+'-empty').hidden=demo;}
  $('rgb-label').textContent=demo?'RENDERED / NOT VIDEO':'EXTERNAL CAMERA';$('thermal-label').textContent=demo?'SIMULATED / NOT TEMPERATURE':'EXTERNAL CAMERA';
  $('rgb-caption').textContent=demo?'SIMULATED RGB CAMERA':'INCOMING RGB / WAITING';$('thermal-caption').textContent=demo?'ILLUSTRATIVE PALETTE · NO MEASURED °C':'INCOMING THERMAL / WAITING';
  $('battery-label').textContent=demo?'Simulated capacity':'Reported by producer';
  setView('orbit');log(demo?'Demo opened paused. Resume to continue.':'Realtime selected. Physical control is disabled.');updateUI();
}
$('demo').onclick=()=>switchMode('demo');$('realtime').onclick=()=>switchMode('realtime');
for(const [id,action] of [['takeoff','takeoff'],['land','land'],['tour','mission'],['pause','pause']])$(id).onclick=()=>{
  if(mode!=='demo')return;command(sim,action);keys.clear();log('Virtual command: '+action);updateUI();$('viewport').focus();
};
$('reset').onclick=()=>{if(mode!=='demo')return;sim=createSim();clearTrail();setView('orbit');log('Demo reset. No hardware affected.');updateUI();};
document.querySelectorAll('[data-marker]').forEach(button=>button.onclick=()=>{
  if(mode!=='demo')return;const m=markers[Number(button.dataset.marker)];setView('orbit');controls.target.set(m.east,1,-m.north);camera.position.set(m.east+12,15,-m.north+18);log('Inspecting fixture: '+m.label);
});
const flightKeys=new Set(['w','a','s','d','r','f','q','e','shift',' ']);
window.addEventListener('keydown',event=>{
  const key=event.key.toLowerCase();if(mode!=='demo'||!flightKeys.has(key)||!$('viewport').contains(document.activeElement))return;
  event.preventDefault();if(key===' '){command(sim,'hold');keys.clear();return;}keys.add(key);
});
window.addEventListener('keyup',event=>keys.delete(event.key.toLowerCase()));
window.addEventListener('blur',()=>keys.clear());
$('viewport').addEventListener('focusout',()=>keys.clear());
document.addEventListener('visibilitychange',()=>{keys.clear();if(document.hidden&&mode==='demo'){sim.paused=true;updateUI();}});
$('help').onclick=()=>{keys.clear();if(mode==='demo')sim.paused=true;$('guide-dialog').showModal();};
$('architecture').onclick=()=>{keys.clear();if(mode==='demo')sim.paused=true;$('architecture-dialog').showModal();};
document.querySelectorAll('[data-close]').forEach(button=>button.onclick=()=>button.closest('dialog').close());
$('export').onclick=()=>{
  const blob=new Blob([JSON.stringify({exportedAt:new Date().toISOString(),mode,notice:'Demo events are simulated. No physical flight commands.',events:logs},null,2)],{type:'application/json'});
  const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='rescue-session.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
};
function liveAge(){return live?.age==null?null:live.age+(performance.now()-live.fetchedAt)/1000;}
function fresh(){const age=liveAge();return serverOnline&&age!==null&&age<3;}
function pose(){
  if(mode==='demo')return sim;
  if(!live?.telemetry)return null;
  const t=live.telemetry;return {...t.position,yaw:t.attitude.yaw*Math.PI/180,pitch:t.attitude.pitch*Math.PI/180,roll:t.attitude.roll*Math.PI/180,battery:t.battery,speed:t.speed};
}
const format=(x,d=1)=>x==null?'—':x.toFixed(d);
function metric(id,value,unit){$(id).replaceChildren(document.createTextNode(value+' '));const small=document.createElement('small');small.textContent=unit;$(id).append(small);}
function updateUI(){
  const p=pose(),valid=mode==='demo'||fresh();
  metric('altitude',valid?format(p?.up):'—','m');metric('speed',valid?format(p?.speed):'—','m/s');metric('heading',valid&&p?String((Math.round(p.yaw*180/Math.PI)%360+360)%360).padStart(3,'0'):'—','°');metric('battery',valid?format(p?.battery,0):'—','%');
  $('coordinates').textContent=p?`E ${format(p.east)} / N ${format(p.north)} / U ${format(p.up)} m${valid?'':' · LAST KNOWN'}`:'E — / N — / U — m';
  $('empty-state').hidden=mode==='demo'||fresh();
  if(mode==='realtime'){
    $('empty-state').querySelector('strong').textContent=live?.telemetry?'Telemetry stale — position held':'No telemetry connected';
    $('empty-state').querySelector('span').textContent=live?.telemetry?'Do not use the last-known position for navigation. Waiting for fresh data.':'Waiting for position data from your bridge. No simulated location is shown in Realtime.';
    $('source').textContent=live?.telemetry?.source||'No producer connected';
    $('sample-age').textContent=liveAge()==null?'No samples':format(liveAge())+' s'+(fresh()?'':' / STALE');
    $('flight-status').textContent='Read-only · physical control disabled';$('motion-status').textContent=fresh()?'Receiving telemetry':'Disconnected / stale';$('progress-text').textContent='No live mission integration';$('progress').style.width='0%';$('timer').textContent='—';
  }else{
    $('source').textContent='Browser simulation';$('sample-age').textContent='Synthetic';$('flight-status').textContent=sim.paused?'Paused':sim.warning||(sim.completed?'Demo mission complete':{ground:'Ready on pad',takeoff:'Taking off',hover:'Manual / hover',landing:'Landing',mission:'Demo mission in progress'}[sim.flight]);
    $('motion-status').textContent=sim.paused?'Simulation paused':sim.up>0?'Virtual flight':'On ground';
    $('progress').style.width=(sim.waypoint/route.length*100)+'%';$('progress-text').textContent=sim.completed?'Virtual circuit complete':sim.mission?`Waypoint ${sim.waypoint+1} / ${route.length}`:'Demo mission not active';
    $('timer').textContent=String(Math.floor(sim.elapsed/60)).padStart(2,'0')+':'+String(Math.floor(sim.elapsed%60)).padStart(2,'0');
    $('takeoff').disabled=sim.paused||sim.up>.1;$('land').disabled=sim.paused||sim.up<=.05;$('tour').disabled=sim.paused||sim.mission;
  }
  $('pause').textContent=sim.paused?'Resume':'Pause';
}
let previousConnection=null;
async function poll(){
  try{
    const response=await fetch('/api/state',{signal:AbortSignal.timeout(2000)});if(!response.ok)throw Error('Server error');
    live=await response.json();live.fetchedAt=performance.now();serverOnline=true;$('server-status').textContent='Local server online';
    if(previousConnection!==live.connected){if(live.connected)log('Telemetry producer connected: '+live.telemetry.source);else if(previousConnection===true)log('Telemetry stale. Last-known position retained.');previousConnection=live.connected;}
    if(mode==='realtime')for(const kind of ['rgb','thermal']){
      const available=live.frames[kind]!=null&&live.frames[kind]<3;
      $(kind+'-empty').hidden=available;$(kind+'-image').hidden=!available;
      $(kind+'-caption').textContent=available?'INCOMING '+kind.toUpperCase()+' / EXTERNAL FRAME':'NO FRESH '+kind.toUpperCase()+' FRAME';
      if(available)$(kind+'-image').src='/api/frame/'+kind+'?t='+Date.now();
    }
  }catch{
    serverOnline=false;$('server-status').textContent='Local server disconnected';
    if(mode==='realtime')for(const kind of ['rgb','thermal']){$(kind+'-image').hidden=true;$(kind+'-empty').hidden=false;$(kind+'-caption').textContent='SERVER DISCONNECTED';}
  }
  updateUI();setTimeout(poll,300);
}
for(const kind of ['rgb','thermal'])$(kind+'-image').onerror=()=>{$(kind+'-image').hidden=true;$(kind+'-empty').hidden=false;};
function renderFeeds(p){
  const forward=new THREE.Vector3(Math.sin(p.yaw),0,-Math.cos(p.yaw));
  onboard.position.copy(drone.position).addScaledVector(forward,1.6);onboard.position.y+=.3;
  onboard.lookAt(onboard.position.clone().addScaledVector(forward,15).add(new THREE.Vector3(0,-6,0)));
  onboard.aspect=$('rgb-feed').clientWidth/$('rgb-feed').clientHeight;onboard.updateProjectionMatrix();
  const oldVisible=drone.visible;drone.visible=false;positionRing.visible=false;trail.visible=false;
  feedRenderer.render(scene,onboard);
  const saved=[];scene.traverse(object=>{if(object.isMesh){saved.push([object,object.material]);object.material=object.userData.hot?heatWarm:heatCold;}});
  const bg=scene.background;scene.background=new THREE.Color('#080820');thermalRenderer.render(scene,onboard);scene.background=bg;
  for(const [object,material] of saved)object.material=material;
  drone.visible=oldVisible;positionRing.visible=true;trail.visible=true;
}
let frames=0,lastUI=0,wasCompleted=false;
function animate(now){
  requestAnimationFrame(animate);const dt=Math.min((now-lastTime)/1000,.05);lastTime=now;
  if(mode==='demo')step(sim,dt,keys);
  const p=pose();drone.visible=!!p;positionRing.visible=!!p;
  if(p){
    drone.position.set(p.east,p.up+.6,-p.north);drone.rotation.set(p.pitch,-p.yaw,-p.roll,'YXZ');positionRing.position.set(p.east,.04,-p.north);
    if(mode==='demo'&&!sim.paused&&sim.up>0)rotors.forEach((r,i)=>r.rotation.y+=dt*45*(i%2?1:-1));
    if(now-lastTrail>150&&(mode==='demo'||fresh())){
      lastTrail=now;const point=drone.position.clone();
      if(!trailPoints.length||point.distanceTo(trailPoints.at(-1))>.1){trailPoints.push(point);if(trailPoints.length>600)trailPoints.shift();trailPoints.forEach((v,i)=>v.toArray(trailArray,i*3));trailGeometry.attributes.position.needsUpdate=true;trailGeometry.setDrawRange(0,trailPoints.length);}
    }
    if(view==='follow'){const offset=new THREE.Vector3(-Math.sin(p.yaw)*12,8,Math.cos(p.yaw)*12);camera.position.lerp(drone.position.clone().add(offset),.08);controls.target.lerp(drone.position,.12);}
    if(view==='top'){camera.position.lerp(drone.position.clone().add(new THREE.Vector3(0,45,.01)),.12);controls.target.copy(drone.position);}
  }
  controls.update();renderer.render(scene,camera);
  if(mode==='demo'&&frames++%3===0)renderFeeds(sim);
  if(now-lastUI>120){updateUI();lastUI=now;}
  if(sim.completed&&!wasCompleted)log('Virtual mission completed and landed.');wasCompleted=sim.completed;
}
log('Demo ready. All scenery, markers and camera views are simulated.');poll();requestAnimationFrame(animate);
