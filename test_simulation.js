import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createSim,command,step} from './web/simulation.js';
function advance(s,seconds,keys=[]){for(let t=0;t<seconds;t+=.02)step(s,.02,new Set(keys));}
test('ground ignores movement; takeoff reaches hover',()=>{const s=createSim();advance(s,1,['w']);assert.equal(s.north,-22);command(s,'takeoff');advance(s,3);assert.equal(s.up,5);assert.equal(s.flight,'hover');});
test('manual moves, turns, and stops without held keys',()=>{const s=createSim();command(s,'takeoff');advance(s,3);advance(s,1,['w']);assert(s.north>-19);const n=s.north;advance(s,1);assert.equal(s.north,n);advance(s,1,['e']);assert(s.yaw>1);});
test('pause freezes position and battery',()=>{const s=createSim();command(s,'takeoff');advance(s,3);command(s,'pause');const before={...s};advance(s,2,['w','r']);assert.equal(s.north,before.north);assert.equal(s.up,before.up);assert.equal(s.battery,before.battery);});
test('complete presentation circuit and landing',()=>{const s=createSim();command(s,'mission');advance(s,100);assert.equal(s.completed,true);assert.equal(s.up,0);assert.equal(s.east,0);assert.equal(s.north,-22);});
test('manual input cancels automatic mission',()=>{const s=createSim();command(s,'mission');advance(s,2);advance(s,.1,['w']);assert.equal(s.mission,false);});
test('bounds and ground clamp',()=>{const s=createSim();command(s,'takeoff');advance(s,3);advance(s,40,['r']);assert.equal(s.up,25);advance(s,40,['s']);assert.equal(s.north,-29);advance(s,20,['f']);assert.equal(s.up,0);assert.equal(s.flight,'ground');});
test('obstacle rejects movement through geometry',()=>{const s=createSim();Object.assign(s,{east:-11,north:-6,up:3,flight:'hover'});advance(s,3,['w']);assert(s.north<=-4.5);assert(s.warning.includes('obstacle'));});
test('hold cancels mission without moving',()=>{const s=createSim();command(s,'mission');advance(s,3);command(s,'hold');const before={...s};advance(s,1);assert.equal(s.east,before.east);assert.equal(s.north,before.north);assert.equal(s.up,before.up);});
