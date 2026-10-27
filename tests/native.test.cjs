/* Exercise the JS card against its real Python storage engine, without a to-do list. */
const assert=require('node:assert/strict');
const path=require('node:path');
const {spawn}=require('node:child_process');
const {createInterface}=require('node:readline');
let Card;
global.HTMLElement=class{attachShadow(){this.shadowRoot={querySelectorAll:()=>[]};}};
global.customElements={get:()=>false,define:(_,klass)=>{Card=klass;}};
global.window={};
require(path.join(__dirname,'..','dinner-shopping-card.js'));
const backend=spawn('python3',[path.join(__dirname,'backend_bridge.py')],{stdio:['pipe','pipe','inherit']});
const pending=new Map();let counter=0;
createInterface({input:backend.stdout}).on('line',line=>{
 const reply=JSON.parse(line);const request=pending.get(reply.id);pending.delete(reply.id);
 if(reply.error){const e=new Error(reply.error.message);e.code=reply.error.code;request.reject(e);}else request.resolve(reply.result);
});
backend.on('exit',code=>{for(const p of pending.values())p.reject(new Error(`Backend exited (${code})`));pending.clear();});
function request(msg){return new Promise((resolve,reject)=>{const request_id=++counter;pending.set(request_id,{resolve,reject});backend.stdin.write(JSON.stringify({...msg,request_id})+'\n');});}
let oldRows=[];let todoReads=0;
const hass={
 callService:()=>{throw new Error('Native mode must not use a Home Assistant service');},
 callWS:async msg=>{
  if(msg.type==='call_service'){
   assert.equal(msg.domain,'todo');assert.equal(msg.service,'get_items');todoReads++;
   return {response:{'todo.previous':{items:structuredClone(oldRows)}}};
  }
  assert.ok(msg.type.startsWith('dinner_shopping/'));
  return request(msg);
 }
};
const mount=()=>{const c=new Card();c.render=()=>{};c.setConfig({type:'custom:dinner-shopping-card'});c._hass=hass;return c;};
(async()=>{
 try{
  const card=mount();await card.read();assert.equal(card.config.entity,undefined);
  for(const name of ['Butter','Bread','Bananas','Milk','Flour'])await card.addGeneral(name);
  const group=await card.addGroup('Banana bread');const gid=card.meta(group).id;
  for(const [name,qty] of [['Bananas','3'],['Butter','100 g'],['Flour','200 g']]){
   const product=card.ofKind('product').find(r=>r.summary===name);
   await card.addIngredient(gid,card.meta(product).id,qty);
  }
  await card.addGroupToShop(gid);assert.equal(card.shopping().length,8);
  const grouped=()=>card.shopping().filter(r=>card.meta(r).group===gid);
  const banana=grouped().find(r=>r.summary==='Bananas');
  await card.service('update_item',{item:banana.uid,status:'completed'});
  await card.addGroupToShop(gid);assert.equal(grouped().length,3);assert.equal(grouped().find(r=>r.uid===banana.uid).status,'completed');
  assert.equal(card.shopping().find(r=>r.summary==='Bananas'&&card.meta(r).group==='').status,'needs_action');
  const snapshot=structuredClone(card.records);
  await request({type:'restart'});const second=mount();await second.read();assert.deepEqual(second.records,snapshot);
  const milk=second.shopping().find(r=>r.summary==='Milk');await second.service('update_item',{item:milk.uid,status:'completed'});
  await assert.rejects(()=>card.service('update_item',{item:banana.uid,status:'needs_action'}),/changed on another device/);
  await card.read();assert.equal(card.shopping().find(r=>r.uid===milk.uid).status,'completed');
  await card.clearShopping(gid);assert.equal(card.ingredients(gid).length,3);await card.addGroupToShop(gid);
  assert.ok(grouped().every(r=>r.status==='needs_action'));
  assert.equal(todoReads,0,'No to-do calls during the complete native workflow');
  // Optional explicit one-time import is read-only against the old list.
  oldRows=[{uid:'old-steak',summary:'Steak',status:'completed',description:'dinner-shopping-card:v1:{"kind":"item","dinner":"Steak dinner"}'}];
  const original=structuredClone(oldRows);card.config.import_from='todo.previous';
  await card.importPreviousList();await card.importPreviousList();
  assert.equal(card.ofKind('old-shop').length,1);assert.equal(card.ofKind('old-shop')[0].status,'completed');assert.deepEqual(oldRows,original);
  delete card.config.import_from;
  await card.saveOldGroup('Steak dinner','old:Steak dinner');
  await card.deleteGroup(gid);assert.equal(grouped().length,3);assert.equal(card.ingredients(gid).length,0);
  const missing=mount();missing._hass={callWS:async()=>{throw {code:'unknown_command',message:'Unknown command'};}};
  await assert.rejects(()=>missing.read(),/Install and add the Dinner Shopping integration/);
  console.log('PASS: native card/Python storage contract, no to-do calls, saved groups, quantities, checkmarks, restart persistence, device conflict protection, clear/reuse, safe optional import, missing-integration message.');
 }finally{backend.stdin.end();}
})().catch(e=>{console.error(e);process.exitCode=1;backend.kill();});
