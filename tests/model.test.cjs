const assert=require('node:assert/strict');
const path=require('node:path');
const {webcrypto}=require('node:crypto');
global.crypto=webcrypto;
let Card;
global.HTMLElement=class{attachShadow(){this.shadowRoot={querySelectorAll:()=>[]};}};
global.customElements={get:()=>false,define:(_,klass)=>{Card=klass;}};
global.window={};
require(path.join(__dirname,'..','dinner-shopping-card.js'));
function setup(){
 let rows=[],seq=0,fail=-1;
 const hass={
  callWS:async()=>({response:{'todo.test':{items:structuredClone(rows)}}}),
  callService:async(domain,action,data)=>{
   assert.equal(domain,'todo');assert.equal(data.entity_id,'todo.test');
   if(fail===0){fail=-1;throw new Error('Network failure');}if(fail>0)fail--;
   if(action==='add_item')rows.push({uid:`uid-${++seq}`,summary:data.item,status:'needs_action',description:data.description});
   else {const item=rows.find(r=>r.uid===data.item);assert.ok(item,'operations must use UID');
    if(action==='remove_item')rows=rows.filter(r=>r!==item);
    else if(action==='update_item'){if(data.status)item.status=data.status;if(data.rename)item.summary=data.rename;if(data.description)item.description=data.description;}
    else throw new Error('Unknown service');
   }
  }
 };
 const mount=()=>{const card=new Card();card.render=()=>{};card.config={entity:'todo.test'};card._hass=hass;return card;};
 return {mount,rows:()=>rows,append:r=>rows.push(r),failAfter:n=>{fail=n;}};
}
(async()=>{
 const db=setup();const card=db.mount();await card.read();
 for(const name of ['Butter','Bread','Bananas','Milk','Flour'])await card.addGeneral(name);
 assert.equal(card.ofKind('product').length,5);assert.equal(card.shopping().length,5);
 await card.addGeneral(' bananas ');assert.equal(card.ofKind('product').length,5);assert.equal(card.shopping().length,5);
 const group=await card.addGroup('Banana bread');const groupId=card.meta(group).id;
 await assert.rejects(card.addGroup(' banana BREAD '),/already exists/);
 for(const [name,qty] of [['Bananas','3'],['Butter','100 g'],['Flour','200 g']]){
  const product=card.ofKind('product').find(r=>r.summary===name);
  await card.addIngredient(groupId,card.meta(product).id,qty);
 }
 assert.equal(card.ingredients(groupId).length,3);
 await card.addGroupToShop(groupId);
 const groupShop=()=>card.shopping().filter(r=>card.meta(r).group===groupId);
 assert.equal(groupShop().length,3);assert.equal(card.shopping().length,8);
 const bananas=groupShop().find(r=>r.summary==='Bananas');
 await card.service('update_item',{item:bananas.uid,status:'completed'});await card.read();
 await card.addGroupToShop(groupId);
 assert.equal(groupShop().length,3);assert.equal(groupShop().find(r=>r.summary==='Bananas').status,'completed');
 assert.equal(card.shopping().find(r=>r.summary==='Bananas'&&card.meta(r).group==='').status,'needs_action');
 assert.equal(card.meta(groupShop().find(r=>r.summary==='Butter')).qty,'100 g');
 const second=db.mount();await second.read();assert.deepEqual(second.records,card.records);
 const milk=second.shopping().find(r=>r.summary==='Milk');await second.run(()=>second.service('update_item',{item:milk.uid,status:'completed'}));
 await card.refresh();assert.equal(card.shopping().find(r=>r.uid===milk.uid).status,'completed');
 await card.clearShopping(groupId);assert.equal(groupShop().length,0);assert.equal(card.ingredients(groupId).length,3);
 await card.addGroupToShop(groupId);assert.ok(groupShop().every(r=>r.status==='needs_action'));
 // A failure halfway through an Add group batch can be retried safely.
 await card.clearShopping(groupId);db.failAfter(1);await card.run(()=>card.addGroupToShop(groupId));
 assert.match(card.error,/Network failure/);assert.equal(groupShop().length,1);assert.equal(card.busy,false);
 await card.run(()=>card.addGroupToShop(groupId));assert.equal(groupShop().length,3);assert.equal(card.error,'');
 // Clearing a group does not remove unrelated records or saved templates.
 db.append({uid:'unrelated',summary:'Other',description:'not our data',status:'needs_action'});
 db.append({uid:'invalid',summary:'Invalid',description:'dinner-shopping-card:v2:bad-json',status:'needs_action'});
 db.append({uid:'old-header',summary:'Steak dinner',status:'needs_action',description:'dinner-shopping-card:v1:{"kind":"dinner","dinner":"Steak dinner"}'});
 db.append({uid:'old-item',summary:'Steak',status:'completed',description:'dinner-shopping-card:v1:{"kind":"item","dinner":"Steak dinner"}'});
 await card.read();assert.equal(card.ofKind('old-shop').length,1);
 await card.saveOldGroup('Steak dinner','old:Steak dinner');await card.saveOldGroup('Steak dinner','old:Steak dinner');
 assert.equal(card.ofKind('group').filter(r=>r.summary==='Steak dinner').length,1);
 assert.equal(card.ofKind('old-shop')[0].status,'completed');
 const steak=card.ofKind('group').find(r=>r.summary==='Steak dinner');assert.equal(card.ingredients(card.meta(steak).id).length,1);
 await card.deleteGroup(groupId);assert.equal(card.ingredients(groupId).length,0);assert.equal(groupShop().length,3);
 assert.equal(db.rows().find(r=>r.uid==='unrelated').description,'not our data');assert.ok(db.rows().some(r=>r.uid==='invalid'));
 // Failed checkbox saves leave server status unchanged and show the error.
 const toCheck=groupShop()[0];db.failAfter(0);await card.run(()=>card.service('update_item',{item:toCheck.uid,status:'completed'}));
 assert.match(card.error,/Network failure/);assert.equal(card.shopping().find(r=>r.uid===toCheck.uid).status,'needs_action');
 const blank=await card.addGroup('Empty');await assert.rejects(card.addGroupToShop(card.meta(blank).id),/Add ingredients/);
 await card.remove(card.ofKind('product').find(r=>r.summary==='Steak'));
 await card.addGroupToShop(card.meta(steak).id);assert.ok(card.shopping().some(r=>r.summary==='Steak'&&card.meta(r).kind==='shop'));
 console.log('PASS: catalogue, groups, quantities, independent ticks, repeat-add protection, reload/shared state, clear/reuse, partial-failure retry, legacy copy, safe deletion, failed writes.');
})().catch(e=>{console.error(e);process.exitCode=1;});
