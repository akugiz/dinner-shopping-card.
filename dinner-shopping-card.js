/* Dinner Shopping Card v2.0.0 — saved groups and a grouped shopping list. */
(() => {
  const PREFIX = 'dinner-shopping-card:v2:';
  const OLD = 'dinner-shopping-card:v1:';
  const norm = s => String(s || '').trim().toLocaleLowerCase();
  const id = () => globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  class DinnerShoppingCard extends HTMLElement {
    constructor() {
      super(); this.attachShadow({mode:'open'});
      this.records = []; this.tab = 'shopping'; this.busy = false; this.loaded = false;
      this.drafts = new Map(); this.error = ''; this.notice = '';
    }
    setConfig(config) {
      if (!config.entity?.startsWith('todo.')) throw new Error('Choose a dedicated Local to-do entity, e.g. todo.dinner_shopping.');
      if (this.busy && this.config?.entity !== config.entity) throw new Error('Wait for the current save before changing the entity.');
      if (this.config?.entity !== config.entity) { this.records = []; this.loaded = false; this.drafts.clear(); }
      this.config = {...config}; this.render(); this.refresh();
    }
    set hass(hass) { this._hass = hass; if (!this.loaded) this.refresh(); }
    connectedCallback() { clearInterval(this.timer); this.timer = setInterval(() => this.refresh(), 5000); this.refresh(); }
    disconnectedCallback() { clearInterval(this.timer); }
    getCardSize() { return 6; }
    meta(record) {
      try {
        const d = record.description || '';
        if (d.startsWith(PREFIX)) {
          const m = JSON.parse(d.slice(PREFIX.length));
          if (!m || !['product','group','ingredient','shop'].includes(m.kind) || typeof m.id !== 'string') return null;
          if (['ingredient','shop'].includes(m.kind) && (typeof m.group !== 'string' || typeof m.qty !== 'string')) return null;
          return m;
        }
        if (d.startsWith(OLD)) {
          const m = JSON.parse(d.slice(OLD.length));
          if (m && typeof m.dinner === 'string' && ['dinner','item'].includes(m.kind)) return {kind:m.kind === 'dinner' ? 'old-group' : 'old-shop', group:`old:${m.dinner}`, groupName:m.dinner, qty:''};
        }
      } catch { /* Leave unrelated or malformed records untouched. */ }
      return null;
    }
    ofKind(kind) { return this.records.filter(r => this.meta(r)?.kind === kind); }
    ingredients(group) { return this.ofKind('ingredient').filter(r => this.meta(r).group === group); }
    shopping() { return this.records.filter(r => ['shop','old-shop'].includes(this.meta(r)?.kind)); }
    async read() {
      const entity = this.config.entity;
      const response = await this._hass.callWS({type:'call_service', domain:'todo', service:'get_items', target:{entity_id:entity}, service_data:{}, return_response:true});
      if (entity !== this.config.entity) return;
      const records = response.response?.[entity]?.items;
      if (!Array.isArray(records)) throw new Error('Could not read this Local to-do list. Check the entity ID.');
      this.records = records; this.loaded = true;
    }
    async refresh() {
      if (!this._hass || !this.config || this.busy || this.loading) return;
      this.loading = true;
      try {
        const before = JSON.stringify(this.records); const loaded = this.loaded;
        this.pendingRead = this.read();
        await this.pendingRead;
        if (!loaded || before !== JSON.stringify(this.records) || this.connectionError) {
          this.connectionError = ''; this.render();
        }
      } catch (e) { this.connectionError = e.message || String(e); this.render(); }
      finally { this.loading = false; }
    }
    async service(action, data) { await this._hass.callService('todo', action, {...data, entity_id:this.config.entity}); }
    async create(name, metadata) {
      const m = {id:id(), ...metadata};
      await this.service('add_item',{item:name.trim(), description:PREFIX + JSON.stringify(m)});
      await this.read();
      const saved = this.records.find(r => this.meta(r)?.id === m.id);
      if (!saved) throw new Error('The item was sent but could not be read back. Refresh before retrying.');
      return saved;
    }
    async remove(record) { await this.service('remove_item',{item:record.uid}); await this.read(); }
    async run(fn) {
      if (this.busy || !this.loaded) return;
      this.busy = true; this.error = ''; this.notice = ''; this.disable(true);
      try { if(this.loading) await this.pendingRead; await this.read(); await fn(); await this.read(); this.connectionError = ''; }
      catch (e) {
        this.error = e.message || String(e);
        try { await this.read(); } catch { /* Keep the original save error visible. */ }
      } finally { this.busy = false; this.render(); }
    }
    async ensureProduct(name) {
      name = name.trim(); if (!name) throw new Error('Enter an item name.');
      return this.ofKind('product').find(r => norm(r.summary) === norm(name)) || this.create(name,{kind:'product'});
    }
    async addGeneral(name, qty = '') {
      const product = await this.ensureProduct(name); const productId = this.meta(product).id;
      if (this.ofKind('shop').some(r => this.meta(r).group === '' && this.meta(r).product === productId && r.status !== 'completed')) {
        this.notice = `${product.summary} is already in General items.`; return;
      }
      await this.create(product.summary,{kind:'shop', group:'', groupName:'General items', product:productId, qty:qty.trim()});
    }
    async addGroup(name, origin) {
      name = name.trim(); if (!name) throw new Error('Enter a group name.');
      const existing = this.ofKind('group').find(r => norm(r.summary) === norm(name));
      if (existing) { if(origin && this.meta(existing).origin === origin) return existing; throw new Error('A saved group with that name already exists.'); }
      return this.create(name,{kind:'group', ...(origin ? {origin} : {})});
    }
    async addIngredient(group, productId, qty) {
      if (!this.ofKind('group').some(r => this.meta(r).id === group)) throw new Error('This saved group was removed.');
      const product = this.ofKind('product').find(r => this.meta(r).id === productId);
      if (!product) throw new Error('Choose an item from Items first.');
      if (this.ingredients(group).some(r => this.meta(r).product === productId)) throw new Error('This ingredient is already in the group. Use Quantity to edit it.');
      await this.create(product.summary,{kind:'ingredient',group,product:productId,qty:qty.trim()});
    }
    async addGroupToShop(groupId) {
      const group = this.ofKind('group').find(r => this.meta(r).id === groupId);
      if (!group) throw new Error('This saved group was removed.');
      const ingredients = this.ingredients(groupId);
      if (!ingredients.length) throw new Error('Add ingredients to this group first.');
      let added = 0;
      for (const ingredient of ingredients) {
        const m = this.meta(ingredient);
        // Keep checked items checked. Repeated clicks and partial retries add only missing ingredients.
        if (this.ofKind('shop').some(r => this.meta(r).group === groupId && this.meta(r).source === m.id)) continue;
        await this.create(ingredient.summary,{kind:'shop',group:groupId,groupName:group.summary,product:m.product,source:m.id,qty:m.qty}); added++;
      }
      this.tab = 'shopping';
      this.notice = added ? `${group.summary} added to your shopping list.` : 'This group is already on your list. Clear it before adding it for a new trip.';
    }
    async clearShopping(groupId) {
      for (const item of this.shopping().filter(r => this.meta(r).group === groupId)) await this.remove(item);
    }
    async deleteGroup(groupId) {
      for (const item of this.ingredients(groupId)) await this.remove(item);
      const group = this.ofKind('group').find(r => this.meta(r).id === groupId);
      if (group) await this.remove(group);
    }
    async saveOldGroup(groupName, oldId) {
      const group = await this.addGroup(groupName, oldId); const groupId = this.meta(group).id;
      for (const item of this.ofKind('old-shop').filter(r => this.meta(r).group === oldId)) {
        const product = await this.ensureProduct(item.summary); const productId = this.meta(product).id;
        if (!this.ingredients(groupId).some(r => this.meta(r).product === productId)) await this.addIngredient(groupId,productId,'');
      }
      this.notice = 'Saved. Your original shopping items and checkmarks are unchanged.';
    }
    node(tag, text, parent, className) {
      const el = document.createElement(tag); if(text != null) el.textContent = text;
      if(className) el.className = className; if(parent) parent.append(el); return el;
    }
    button(text, parent, callback, secondary = false) {
      const b = this.node('button',text,parent,secondary ? 'secondary' : ''); b.type = 'button'; b.onclick = callback; return b;
    }
    field(parent, placeholder, key, required = false) {
      const input = this.node('input',null,parent); input.type = 'text'; input.placeholder = placeholder;
      input.setAttribute('aria-label',placeholder); input.required = required; input.maxLength = 160; input.dataset.key = key;
      input.value = this.drafts.get(key) || ''; input.oninput = () => this.drafts.set(key,input.value); return input;
    }
    form(parent, key, fields, submit, callback) {
      const form = this.node('form',null,parent);
      const inputs = fields.map(([label,required],i) => this.field(form,label,`${key}:${i}`,required));
      const button = this.node('button',submit,form); button.type = 'submit';
      form.onsubmit = e => { e.preventDefault(); const values = inputs.map(i=>i.value.trim());
        this.run(async()=>{await callback(...values); inputs.forEach(i=>{this.drafts.delete(i.dataset.key);i.value='';});}); };
      return form;
    }
    disable(disabled) { this.shadowRoot.querySelectorAll('button,input,select').forEach(el => el.disabled = disabled); }
    section(parent, title) { const section=this.node('section',null,parent); this.node('h3',title,section); return section; }
    shoppingView(card) {
      this.node('p','Add everyday items or choose a saved group. Tick things off as you pick them up.',card);
      const form=this.form(card,'general',[['Item, e.g. Milk',true],['Quantity (optional)',false]],'Add item',(name,qty)=>this.addGeneral(name,qty));
      form.querySelector('input').setAttribute('list','shopping-items');
      const list=this.node('datalist',null,form);list.id='shopping-items';
      for(const p of this.ofKind('product')) {const option=this.node('option',null,list);option.value=p.summary;}
      const groups=this.ofKind('group');
      if(groups.length) {
        const chooser=this.node('div',null,card,'picker');
        const select=this.node('select',null,chooser);select.setAttribute('aria-label','Saved group to shop');
        for(const group of groups) {const opt=this.node('option',group.summary,select);opt.value=this.meta(group).id;}
        this.button('Add group',chooser,()=>{const value=select.value;this.run(()=>this.addGroupToShop(value));});
      }
      const buckets=new Map();
      for(const r of this.shopping()) {const m=this.meta(r);if(!buckets.has(m.group))buckets.set(m.group,{name:m.groupName,records:[]});buckets.get(m.group).records.push(r);}
      // Also keep empty v1 dinner headings visible until the user explicitly clears them.
      for(const r of this.ofKind('old-group')) {const m=this.meta(r);if(!buckets.has(m.group))buckets.set(m.group,{name:m.groupName,records:[]});}
      if(!buckets.size) this.node('p','Your shopping list is empty. Add an item above to get started.',card,'empty');
      const ordered=[...buckets].sort(([a],[b])=>a===''?-1:b===''?1:0);
      for(const [key,bucket] of ordered) {
        const section=this.section(card,bucket.name || 'General items'); section.dataset.group=key;
        this.node('small',`${bucket.records.filter(r=>r.status==='completed').length} of ${bucket.records.length} picked up`,section);
        for(const r of bucket.records) {
          const row=this.node('div',null,section,'row');const label=this.node('label',null,row,r.status==='completed'?'done':'');
          const box=this.node('input',null,label);box.type='checkbox';box.checked=r.status==='completed';
          box.onchange=()=>{const status=box.checked?'completed':'needs_action';this.run(()=>this.service('update_item',{item:r.uid,status}));};
          const m=this.meta(r);this.node('span',`${r.summary}${m.qty ? ' — '+m.qty : ''}`,label);
          const remove=this.button('×',row,()=>{if(confirm(`Remove ${r.summary} from shopping?`))this.run(()=>this.remove(r));},true);remove.setAttribute('aria-label',`Remove ${r.summary}`);
        }
        const actions=this.node('div',null,section,'actions');
        if(key.startsWith('old:')) this.button('Save as group',actions,()=>this.run(()=>this.saveOldGroup(bucket.name,key)),true);
        this.button('Clear from shopping',actions,()=>{
          if(confirm(`Clear ${bucket.name} from shopping? Saved groups and items are kept.`))this.run(async()=>{
            await this.clearShopping(key);
            for(const header of this.ofKind('old-group').filter(r=>this.meta(r).group===key))await this.remove(header);
          });
        },true);
      }
    }
    groupsView(card) {
      this.node('p','Save groups such as Banana bread, then choose ingredients from your items. Shopping items are saved in Items automatically.',card);
      this.form(card,'group',[['Group name, e.g. Banana bread',true]],'Create group',name=>this.addGroup(name));
      for(const group of this.ofKind('group')) {
        const groupId=this.meta(group).id;
        const section=this.section(card,group.summary);section.dataset.savedGroup=groupId;
        const ingredients=this.ingredients(groupId);
        for(const ingredient of ingredients) {
          const m=this.meta(ingredient);const row=this.node('div',null,section,'row');
          this.node('span',`${ingredient.summary}${m.qty?' — '+m.qty:''}`,row,'grow');
          this.button('Quantity',row,()=>{
            const qty=prompt(`Quantity for ${ingredient.summary}`,m.qty);
            if(qty!==null)this.run(()=>this.service('update_item',{item:ingredient.uid,description:PREFIX+JSON.stringify({...m,qty:qty.trim().slice(0,160)})}));
          },true);
          const b=this.button('×',row,()=>{if(confirm(`Remove ${ingredient.summary} from this saved group?`))this.run(()=>this.remove(ingredient));},true);b.setAttribute('aria-label',`Remove ingredient ${ingredient.summary}`);
        }
        const products=this.ofKind('product').filter(p=>!ingredients.some(r=>this.meta(r).product===this.meta(p).id));
        if(products.length) {
          const form=this.node('form',null,section);const select=this.node('select',null,form);select.setAttribute('aria-label',`Ingredient for ${group.summary}`);
          select.dataset.key=`select:${groupId}`;
          for(const p of products){const o=this.node('option',p.summary,select);o.value=this.meta(p).id;}
          if(products.some(p=>this.meta(p).id===this.drafts.get(select.dataset.key)))select.value=this.drafts.get(select.dataset.key);
          select.onchange=()=>this.drafts.set(select.dataset.key,select.value);
          const quantity=this.field(form,'Quantity (optional)',`quantity:${groupId}`);
          const button=this.node('button','Add ingredient',form);button.type='submit';
          form.onsubmit=e=>{e.preventDefault();const product=select.value,qty=quantity.value;this.run(async()=>{
            await this.addIngredient(groupId,product,qty);this.drafts.delete(quantity.dataset.key);this.drafts.delete(select.dataset.key);
          });};
        } else this.node('p',ingredients.length?'All available items are in this group. Add more in Items.':'Add some items in Shopping or Items, then choose them here.',section,'hint');
        const actions=this.node('div',null,section,'actions');
        this.button('Add to shopping',actions,()=>this.run(()=>this.addGroupToShop(groupId)));
        this.button('Rename',actions,()=>{
          const name=prompt('Group name',group.summary);
          if(name?.trim())this.run(async()=>{
            if(this.ofKind('group').some(r=>r.uid!==group.uid && norm(r.summary)===norm(name)))throw new Error('A group with that name already exists.');
            await this.service('update_item',{item:group.uid,rename:name.trim().slice(0,160)});
          });
        },true);
        this.button('Delete group',actions,()=>{if(confirm(`Delete saved group ${group.summary}? Current shopping items are kept.`))this.run(()=>this.deleteGroup(groupId));},true);
      }
    }
    itemsView(card) {
      this.node('p','Your reusable items. Add them to shopping, or choose them when building a saved group.',card);
      this.form(card,'product',[['New item, e.g. Bananas',true]],'Save item',name=>this.ensureProduct(name));
      for(const product of this.ofKind('product')) {
        const row=this.node('div',null,card,'row catalog');this.node('span',product.summary,row,'grow');
        this.button('Add to shopping',row,()=>this.run(()=>this.addGeneral(product.summary)),true);
        const b=this.button('×',row,()=>{if(confirm(`Remove ${product.summary} from Items? Saved groups and shopping copies are kept.`))this.run(()=>this.remove(product));},true);b.setAttribute('aria-label',`Delete saved item ${product.summary}`);
      }
    }
    render() {
      if(!this.config)return;
      const active=this.shadowRoot.activeElement;const focusKey=active?.dataset.key;
      const selection=active?.type==='text'?active.selectionStart:null;
      this.shadowRoot.replaceChildren();
      this.node('style',`
        :host{display:block;color:var(--primary-text-color,#222)}*{box-sizing:border-box}
        ha-card{display:block;padding:20px;border-radius:var(--ha-card-border-radius,16px);background:var(--ha-card-background,var(--card-background-color,#fff))}
        h2{font-size:22px;margin:0}h3{font-size:18px;margin:0 0 6px;overflow-wrap:anywhere}p{font-size:14px;line-height:1.5;color:var(--secondary-text-color,#666)}
        .version,small{font-size:12px;color:var(--secondary-text-color,#666)}nav{display:flex;gap:6px;margin:18px 0}nav button{flex:1;padding:10px 5px}nav .active{background:var(--primary-color,#008c80);color:var(--text-primary-color,#fff)}
        button{font:inherit;min-height:44px;border:0;border-radius:9px;padding:10px 13px;background:var(--primary-color,#008c80);color:var(--text-primary-color,#fff);cursor:pointer}
        .secondary{background:var(--secondary-background-color,#f0f3f3);color:var(--primary-text-color,#222)}
        form,.picker{display:flex;gap:8px;flex-wrap:wrap;margin:14px 0}input[type=text],select{font:inherit;color:inherit;background:var(--secondary-background-color,#f7f8f8);border:1px solid var(--divider-color,#ddd);padding:10px;border-radius:9px;min-width:0;flex:1 1 130px;min-height:44px}input[placeholder^=Quantity]{flex-basis:90px}
        section{margin-top:16px;padding:15px;border:1px solid var(--divider-color,#ddd);border-radius:12px}
        .row{display:flex;gap:8px;align-items:center;min-height:48px}.row label{display:flex;align-items:center;gap:12px;flex:1;min-width:0;cursor:pointer}.grow{flex:1;min-width:0}.row span{overflow-wrap:anywhere}.row button{font-size:12px;padding:8px}.catalog{border-bottom:1px solid var(--divider-color,#eee);padding:8px 0}
        input[type=checkbox]{width:22px;height:22px;flex-shrink:0;accent-color:var(--primary-color,#008c80)}.done span{text-decoration:line-through;color:var(--secondary-text-color,#777)}
        .actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}.hint,.empty{padding:8px 0}.error{color:var(--error-color,#b3261e);padding:10px 0;white-space:pre-wrap}.notice{color:var(--primary-text-color,#222);border-left:3px solid var(--primary-color,#008c80);padding:8px 12px;margin:10px 0;font-size:14px}
        button:disabled,input:disabled,select:disabled{opacity:.5;cursor:wait}button:focus-visible,input:focus-visible,select:focus-visible{outline:2px solid var(--primary-color,#008c80);outline-offset:2px}
        @media(max-width:380px){ha-card{padding:12px}section{padding:12px}.row{gap:5px}}
      `,this.shadowRoot);
      const card=this.node('ha-card',null,this.shadowRoot);this.node('h2',this.config.title||'Dinner shopping',card);
      this.node('span','Saved groups & shopping · v2.0.0',card,'version');
      const nav=this.node('nav',null,card);nav.setAttribute('aria-label','Shopping sections');
      for(const [tab,label] of [['shopping','Shopping'],['groups','Saved groups'],['items','Items']]) {
        const b=this.button(label,nav,()=>{this.tab=tab;this.render();},true);b.classList.toggle('active',tab===this.tab);b.setAttribute('aria-pressed',String(tab===this.tab));
      }
      if(this.error||this.connectionError) {
        const error=this.node('div',this.error||this.connectionError,card,'error');error.setAttribute('role','alert');
        this.button('Retry refresh',card,()=>{this.error='';this.render();this.refresh();},true);
      }
      if(this.notice){const status=this.node('div',this.notice,card,'notice');status.setAttribute('role','status');}
      if(!this.loaded)this.node('p','Loading your list…',card);
      else if(this.tab==='shopping')this.shoppingView(card);else if(this.tab==='groups')this.groupsView(card);else this.itemsView(card);
      if(this.busy)this.disable(true);
      if(focusKey)for(const field of this.shadowRoot.querySelectorAll('[data-key]'))if(field.dataset.key===focusKey){field.focus();if(selection!==null && field.type==='text')field.setSelectionRange(selection,selection);}
    }
  }
  if(!customElements.get('dinner-shopping-card'))customElements.define('dinner-shopping-card',DinnerShoppingCard);
  window.customCards=window.customCards||[];
  if(!window.customCards.some(c=>c.type==='dinner-shopping-card'))window.customCards.push({type:'dinner-shopping-card',name:'Dinner Shopping',description:'Reusable items, saved ingredient groups, and grouped shopping checklists.'});
})();
