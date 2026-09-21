export const obstacles = [
  {east:-11,north:2,w:9,d:11,h:8}, {east:9,north:5,w:8,d:9,h:11},
  {east:-11,north:17,w:7,d:6,h:5}, {east:12,north:-11,w:8,d:6,h:4},
];
export const markers = [
  {east:-5,north:10,label:'Practice rescue point',kind:'person'},
  {east:11,north:10,label:'Hazard exercise',kind:'hazard'},
  {east:-16,north:-13,label:'Assembly point',kind:'assembly'},
];
export const route = [[0,-22,14],[-21,-17,14],[-21,21,14],[22,21,14],[22,-20,14],[0,-22,14],[0,-22,0]];
export function createSim(){return {east:0,north:-22,up:0,yaw:0,roll:0,pitch:0,speed:0,battery:100,elapsed:0,paused:false,flight:'ground',mission:false,waypoint:0,completed:false,warning:''};}
export function command(s,action){
  if(action==='pause'){s.paused=!s.paused;return;}
  if(action==='hold'){s.mission=false;s.flight=s.up>0.05?'hover':'ground';s.speed=0;return;}
  if(s.paused)return;
  if(action==='takeoff'&&s.up<0.1){s.flight='takeoff';s.completed=false;}
  if(action==='land'&&s.up>0.05){s.mission=false;s.flight='landing';}
  if(action==='mission'){s.mission=true;s.waypoint=0;s.completed=false;s.flight='mission';}
}
export function step(s,dt,keys=new Set()){
  dt=Math.max(0,Math.min(dt,0.05));s.warning='';
  if(s.paused){s.speed=0;return;}
  const old={east:s.east,north:s.north,up:s.up};
  if(s.flight!=='ground')s.elapsed+=dt;
  const manual=['w','a','s','d','r','f','q','e'].some(k=>keys.has(k));
  if(manual&&s.flight!=='ground'){s.mission=false;s.flight='hover';}
  if(s.mission){
    const [e,n,u]=route[s.waypoint]; const dx=e-s.east,dy=n-s.north,dz=u-s.up;
    const distance=Math.hypot(dx,dy,dz), travel=5*dt;
    if(distance<=travel){s.east=e;s.north=n;s.up=u;s.waypoint++;if(s.waypoint===route.length){s.mission=false;s.completed=true;s.flight='ground';}}
    else {s.east+=dx/distance*travel;s.north+=dy/distance*travel;s.up+=dz/distance*travel;if(Math.hypot(dx,dy)>.1)s.yaw=Math.atan2(dx,dy);}
  }else if(s.flight==='takeoff'){
    s.up=Math.min(5,s.up+2.5*dt);if(s.up===5)s.flight='hover';
  }else if(s.flight==='landing'){
    s.up=Math.max(0,s.up-2.5*dt);if(s.up===0)s.flight='ground';
  }else if(s.flight!=='ground'){
    s.yaw+=((keys.has('e')?1:0)-(keys.has('q')?1:0))*dt*1.2;
    const forward=(keys.has('w')?1:0)-(keys.has('s')?1:0);
    const right=(keys.has('d')?1:0)-(keys.has('a')?1:0);
    const norm=Math.max(1,Math.hypot(forward,right)), speed=keys.has('shift')?7:4;
    s.east+=(Math.sin(s.yaw)*forward+Math.cos(s.yaw)*right)/norm*speed*dt;
    s.north+=(Math.cos(s.yaw)*forward-Math.sin(s.yaw)*right)/norm*speed*dt;
    s.up+=((keys.has('r')?1:0)-(keys.has('f')?1:0))*3*dt;
  }
  s.east=Math.max(-29,Math.min(29,s.east));s.north=Math.max(-29,Math.min(29,s.north));s.up=Math.max(0,Math.min(25,s.up));
  for(const o of obstacles){
    if(Math.abs(s.east-o.east)<o.w/2+1&&Math.abs(s.north-o.north)<o.d/2+1&&s.up<o.h+1){
      Object.assign(s,old);s.warning='Virtual obstacle boundary — movement held';s.mission=false;s.flight='hover';break;
    }
  }
  s.speed=dt?Math.hypot(s.east-old.east,s.north-old.north)/dt:0;
  s.yaw=((s.yaw%(2*Math.PI))+2*Math.PI)%(2*Math.PI);
  s.battery=Math.max(0,s.battery-(s.up>0?.035:0)*dt);
  if(s.up===0&&!s.mission&&s.flight!=='takeoff')s.flight='ground';
  s.pitch+=(Math.min(.15,s.speed*.02)-s.pitch)*Math.min(1,dt*5);
}
