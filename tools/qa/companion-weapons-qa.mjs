// Run against an isolated browser context; never touches the user's browser save.
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {chromium} from 'playwright-core';
const OUT=process.env.WEAPON_QA_OUT??'D:/Modly/CodexModly/Starwish_Adventure/weapon-expansion-20261126-v001/review/';mkdirSync(OUT,{recursive:true});
const report={status:'RUNNING',scope:'Actual React game, three tiers per companion, local isolated save',results:[],errors:[],requests:[]};
const browser=await chromium.launch({channel:'msedge',headless:true,args:['--enable-unsafe-swiftshader']});
try{
 const context=await browser.newContext({viewport:{width:1440,height:1000}});const page=await context.newPage();
 page.on('pageerror',e=>report.errors.push(e.message));page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text())});page.on('response',r=>{if(/starwish-weapon-expansion.*\.glb/.test(r.url()))report.requests.push({url:r.url(),status:r.status()})});
 await page.goto(process.env.QA_URL??'http://127.0.0.1:5189/',{waitUntil:'load'});await page.waitForFunction(()=>window.__sw?.useGame,null,{timeout:60000});
 await page.evaluate(()=>{const s=window.__sw;s.useGame.getState().setProfile({classId:'knight',name:'武器驗證'});s.useGame.getState().startGame();for(const c of ['assassin','apothecary','cleric'])s.cstate.recruitAlly(c);s.progress.story.step='c2_hunt';s.combat.inCombat=false;s.cstate.setActiveCompanions(['assassin','apothecary','cleric']);for(const u of s.combat.units)if(u.team==='enemy'){u.alive=false;u.deadTime=-1e6}s.useGame.setState({dialog:null});s.useGame.getState().setQuality('high');s.runtime.player.x=0;s.runtime.player.z=8;});
 await page.waitForFunction(()=>!window.__sw.mapState.loading&&!window.__sw.stream.isPriming(),null,{timeout:60000});
 await page.waitForFunction(()=>window.__sw?.scene&&window.__sw?.cam,null,{timeout:60000}); await page.evaluate(()=>{const c=window.__sw.cam;c.yaw=c.yawT=0;c.dist=c.distT=5.2;c.tilt=c.tiltT=-.18});
 async function equip(tier){await page.evaluate(tier=>{const s=window.__sw;for(const c of ['assassin','apothecary']){const uid='weapon-module-qa-'+c;let w=s.progress.inventory.find(i=>i.uid===uid);if(!w){w={uid,slot:'weapon',classId:c,name:'換裝驗證',quality:2,level:1,stats:{atk:12},model:c+'-'+tier};s.progress.inventory.push(w)}w.model=c+'-'+tier;w.level=[1,12,24][tier-1];s.progress.members[c].equip.weapon=uid}s.cstate.refreshParty();s.useGame.getState().bumpGear();},tier);
  await page.waitForFunction(t=>{const seen=[];window.__sw.scene.traverse(o=>{if(o.userData.weaponModuleId)seen.push(o.userData.weaponModuleId)});return ['assassin','apothecary'].every(c=>seen.filter(x=>x===c+'-'+t).length===2)&&seen.every(x=>x.endsWith('-'+t))},tier,{timeout:60000});
 }
 const data=()=>page.evaluate(()=>{const s=window.__sw,out=[];s.scene.updateMatrixWorld(true);s.scene.traverse(o=>{if(!o.userData.weaponModuleId)return;const p=o.getWorldPosition(o.position.clone()),scale=o.getWorldScale(o.scale.clone());const socket=o.parent;out.push({id:o.userData.weaponModuleId,socket:socket.name,url:o.userData.equipmentUrl,position:p.toArray(),scale:scale.toArray(),meshCount:(()=>{let n=0;o.traverse(x=>{if(x.isMesh)n++});return n})()})});return out});
 for(const tier of [1,2,3]){
  await equip(tier);await page.waitForTimeout(350);const rows=await data();assert.equal(rows.length,4);assert.ok(rows.every(o=>o.meshCount>0&&o.position.every(Number.isFinite)&&o.scale.every(v=>Number.isFinite(v)&&v>.3&&v<2)));assert.ok(rows.every(o=>o.url.endsWith('.web.glb')));report.results.push({name:'equip-tier-'+tier,status:'PASS',equipment:rows});await page.screenshot({path:OUT+'game-equipment-tier-'+tier+'.png'});console.log('GAME_EQUIP_PASS',tier);
 }
 // Cache all tiers first. Repeated swaps must not accumulate holders or GPU resources.
 const before=await page.evaluate(()=>({...window.__sw.gl.info.memory}));for(const t of [1,2,3,1,2,3])await equip(t);const after=await page.evaluate(()=>({...window.__sw.gl.info.memory}));assert.equal((await data()).length,4);assert.ok(after.geometries<=before.geometries+3&&after.textures<=before.textures+3);report.results.push({name:'repeat-swap',status:'PASS',before,after});
 await page.evaluate(()=>{const s=window.__sw;for(const c of ['assassin','apothecary']){const u=s.combat.units.find(u=>u.id==='ally-'+c);u.attackAnim=1}});await page.waitForTimeout(320);await page.screenshot({path:OUT+'game-attack.png'});await page.waitForTimeout(1000);assert.equal((await data()).length,4);
 await page.evaluate(()=>{const u=window.__sw.combat.units.find(u=>u.id==='ally-apothecary');u.actionClip='Heal';u.actionSeq++});await page.waitForTimeout(450);await page.screenshot({path:OUT+'game-heal.png'});
 const save=await page.evaluate(()=>{const s=window.__sw;s.useGame.getState().saveGame();const data=JSON.parse(localStorage.getItem('starwish.save.v1'));return {rawContainsModels:JSON.stringify(data).includes('assassin-3')&&JSON.stringify(data).includes('apothecary-3')}});assert.ok(save.rawContainsModels);report.results.push({name:'existing-save-retains-model-ids',status:'PASS'});
 await page.setViewportSize({width:844,height:390});await page.waitForTimeout(250);await page.screenshot({path:OUT+'game-mobile.png'});assert.ok(report.requests.length>=9&&report.requests.every(r=>r.status===200&&r.url.endsWith('.web.glb')));assert.deepEqual(report.errors,[]);report.status='PASS';
}catch(e){report.failure=e.stack;throw e}finally{writeFileSync(OUT+'game-weapons-audit.json',JSON.stringify(report,null,2));await browser.close()}
console.log('COMPANION_WEAPONS_GAME_QA',report.status);
