/* Run: npm install --no-save playwright && npx playwright install chromium && node tests/card.spec.cjs */
const { chromium } = require(require.resolve('playwright', {paths:[process.cwd(),process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES].filter(Boolean)}));
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const source = fs.readFileSync(path.join(__dirname,'..','dinner-shopping-card.js'),'utf8');
(async () => {
  const browser = await chromium.launch({headless:true,args:['--no-sandbox']});
  try {
    const page = await browser.newPage({viewport:{width:390,height:844}});
    const errors=[]; page.on('pageerror',e=>errors.push(e.message));
    page.on('dialog',dialog=>dialog.accept());
    await page.setContent('<style>body{margin:0;background:#f3f5f5;font:16px Arial}dinner-shopping-card{display:block;width:100%;max-width:480px}</style>');
    await page.addScriptTag({content:source});
    await page.evaluate(()=>{
      window.db=[];window.sequence=0;window.failAfter=-1;
      window.mockHass={
        callWS:async()=>({response:{'todo.dinner_shopping':{items:structuredClone(window.db)}}}),
        callService:async(domain,action,data)=>{
          if(data.entity_id!=='todo.dinner_shopping')throw new Error('Unexpected target');
          if(window.failAfter===0){window.failAfter=-1;throw new Error('Simulated save failure');}
          if(window.failAfter>0)window.failAfter--;
          if(action==='add_item')window.db.push({uid:String(++window.sequence),summary:data.item,description:data.description,status:'needs_action'});
          else {
            const r=window.db.find(r=>r.uid===data.item);if(!r)throw new Error('UID not found');
            if(action==='remove_item')window.db=window.db.filter(x=>x!==r);
            if(action==='update_item'){if(data.status)r.status=data.status;if(data.description)r.description=data.description;if(data.rename)r.summary=data.rename;}
          }
        }
      };
      window.mount=()=>{
        const c=document.createElement('dinner-shopping-card');
        c.setConfig({type:'custom:dinner-shopping-card',entity:'todo.dinner_shopping'});
        document.body.append(c);c.hass=window.mockHass;return c;
      };
      window.card=window.mount();
    });
    const card=page.locator('dinner-shopping-card').first();
    const idle=()=>page.waitForFunction(()=>window.card.loaded&&!window.card.busy&&!window.card.loading);
    await idle();
    async function tab(name){await card.getByRole('button',{name,exact:true}).click();}
    async function addShopping(name,qty=''){
      await card.getByRole('textbox',{name:'Item, e.g. Milk',exact:true}).fill(name);
      await card.getByRole('textbox',{name:'Quantity (optional)',exact:true}).fill(qty);
      await card.getByRole('button',{name:'Add item',exact:true}).click();await idle();
    }
    for(const name of ['Butter','Bread','Bananas','Milk','Flour'])await addShopping(name);
    assert.equal(await card.locator('section').count(),1);
    await tab('Saved groups');
    await card.getByRole('textbox',{name:'Group name, e.g. Banana bread'}).fill('Banana bread');
    await card.getByRole('button',{name:'Create group',exact:true}).click();await idle();
    for(const [name,qty] of [['Bananas','3'],['Butter','100 g'],['Flour','200 g']]){
      await card.getByRole('combobox',{name:'Ingredient for Banana bread'}).selectOption({label:name});
      await card.getByRole('textbox',{name:'Quantity (optional)'}).fill(qty);
      await card.getByRole('button',{name:'Add ingredient',exact:true}).click();await idle();
    }
    await card.getByRole('button',{name:'Add to shopping',exact:true}).click();await idle();
    const banana=card.locator('section').filter({has:page.getByRole('heading',{name:'Banana bread',exact:true})});
    const general=card.locator('section').filter({has:page.getByRole('heading',{name:'General items',exact:true})});
    assert.equal(await banana.getByRole('checkbox').count(),3);
    assert.equal(await general.getByRole('checkbox').count(),5);
    await banana.getByRole('checkbox',{name:'Bananas — 3',exact:true}).check();await idle();
    assert.equal(await general.getByRole('checkbox',{name:'Bananas',exact:true}).isChecked(),false);
    // Repeated Add group must not duplicate entries or reset checkmarks.
    await card.getByRole('button',{name:'Add group',exact:true}).click();await idle();
    assert.equal(await banana.getByRole('checkbox').count(),3);
    assert.equal(await banana.getByRole('checkbox',{name:'Bananas — 3',exact:true}).isChecked(),true);
    // Actual browser refresh/re-mount reads persisted records from the server.
    await page.evaluate(()=>{window.card.remove();window.card=window.mount();});await idle();
    assert.equal(await banana.getByRole('checkbox',{name:'Bananas — 3',exact:true}).isChecked(),true);
    // Another card sees the same data and can update it.
    await page.evaluate(async()=>{const second=window.mount();await second.refresh();window.second=second;});
    await page.waitForFunction(()=>window.second.loaded);
    await page.evaluate(async()=>{
      const r=window.second.shopping().find(r=>r.summary==='Milk');
      await window.second.run(()=>window.second.service('update_item',{item:r.uid,status:'completed'}));
      await window.card.refresh();window.second.remove();
    });
    assert.equal(await general.getByRole('checkbox',{name:'Milk',exact:true}).isChecked(),true);
    // Clearing shopping retains all saved ingredients and allows a fresh trip.
    await banana.getByRole('button',{name:'Clear from shopping',exact:true}).click();await idle();
    assert.equal(await banana.count(),0);
    await tab('Saved groups');
    assert.equal(await card.getByRole('button',{name:'Quantity',exact:true}).count(),3);
    await card.getByRole('button',{name:'Add to shopping',exact:true}).click();await idle();
    assert.equal(await banana.getByRole('checkbox',{name:'Bananas — 3',exact:true}).isChecked(),false);
    // Partial batch failure is reported and retry fills only the missing entries.
    await banana.getByRole('button',{name:'Clear from shopping',exact:true}).click();await idle();
    await page.evaluate(()=>window.failAfter=1);
    await card.getByRole('button',{name:'Add group',exact:true}).click();await idle();
    assert.match(await card.getByRole('alert').innerText(),/Simulated save failure/);
    assert.equal(await banana.getByRole('checkbox').count(),1);
    await card.getByRole('button',{name:'Add group',exact:true}).click();await idle();
    assert.equal(await banana.getByRole('checkbox').count(),3);
    // Input drafts survive background updates from another device.
    await card.getByRole('textbox',{name:'Item, e.g. Milk',exact:true}).fill('Not finished');
    await page.evaluate(async()=>{window.db.push({uid:'other',summary:'Remote',status:'needs_action',description:'unrelated'});await window.card.refresh();});
    assert.equal(await card.getByRole('textbox',{name:'Item, e.g. Milk',exact:true}).inputValue(),'Not finished');
    // v1 shopping data and checkmarks survive, and can be copied to a saved group.
    await page.evaluate(async()=>{
      window.db.push({uid:'old1',summary:'Steak dinner',status:'needs_action',description:'dinner-shopping-card:v1:{"kind":"dinner","dinner":"Steak dinner"}'});
      window.db.push({uid:'old2',summary:'Steak',status:'completed',description:'dinner-shopping-card:v1:{"kind":"item","dinner":"Steak dinner"}'});
      await window.card.refresh();
    });
    const steak=card.locator('section').filter({has:page.getByRole('heading',{name:'Steak dinner',exact:true})});
    assert.equal(await steak.getByRole('checkbox',{name:'Steak',exact:true}).isChecked(),true);
    await steak.getByRole('button',{name:'Save as group',exact:true}).click();await idle();
    assert.equal(await steak.getByRole('checkbox',{name:'Steak',exact:true}).isChecked(),true);
    await steak.getByRole('button',{name:'Save as group',exact:true}).click();await idle();
    assert.equal(await page.evaluate(()=>window.card.ofKind('group').filter(r=>r.summary==='Steak dinner').length),1);
    // User input is text, not HTML, and the narrow layout has no overflow.
    await addShopping('<img src=x onerror=alert(1)>');
    assert.equal(await card.locator('img').count(),0);
    await page.setViewportSize({width:320,height:844});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    // Deleting a saved group does not delete its current shopping snapshot.
    await tab('Saved groups');
    const savedBanana=card.locator('section').filter({has:page.getByRole('heading',{name:'Banana bread',exact:true})});
    await savedBanana.getByRole('button',{name:'Delete group',exact:true}).click();await idle();
    await tab('Shopping');assert.equal(await banana.getByRole('checkbox').count(),3);
    assert.equal(await page.evaluate(()=>window.db.some(r=>r.uid==='other'&&r.description==='unrelated')),true);
    assert.deepEqual(errors,[]);
    console.log('PASS: full shopping/group workflow, quantities, independent checkmarks, duplicate protection, reload, shared data, clear/reuse, partial failure retry, drafts, legacy preservation, text escaping, mobile layout, safe deletion.');
  } finally { await browser.close(); }
})().catch(e=>{console.error(e);process.exitCode=1;});
