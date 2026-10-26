/* Dinner Shopping Card v1.0.0 — uses a dedicated Local to-do entity. */
(() => {
  const PREFIX = 'dinner-shopping-card:v1:';
  class DinnerShoppingCard extends HTMLElement {
    constructor() {
      super();
      this.attachShadow({mode:'open'});
      this.items = []; this.busy = false; this.loaded = false;
    }
    setConfig(config) {
      if (!config.entity?.startsWith('todo.')) throw new Error('Set entity to your dedicated Local to-do entity, e.g. todo.dinner_shopping');
      this.config = {...config}; this.loaded = false; this.signature = null;
      this.render(); this.refresh();
    }
    set hass(hass) { this._hass = hass; if (!this.loaded) this.refresh(); }
    connectedCallback() {
      clearInterval(this.timer);
      this.timer = setInterval(() => this.refresh(), 5000);
      this.refresh();
    }
    disconnectedCallback() { clearInterval(this.timer); }
    getCardSize() { return 5; }
    meta(item) {
      try {
        if (!item.description?.startsWith(PREFIX)) return null;
        const value = JSON.parse(item.description.slice(PREFIX.length));
        return typeof value.dinner === 'string' && ['dinner','item'].includes(value.kind) ? value : null;
      } catch { return null; }
    }
    async refresh() {
      if (!this._hass || !this.config || this.fetching || this.busy) return;
      this.fetching = true;
      const entity = this.config.entity;
      try {
        const result = await this._hass.callWS({type:'call_service', domain:'todo', service:'get_items', target:{entity_id:entity}, service_data:{}, return_response:true});
        if (entity !== this.config.entity) return;
        const items = result.response?.[entity]?.items;
        if (!Array.isArray(items)) throw new Error('Could not read this to-do list. Check the entity and your Home Assistant version.');
        this.items = items; this.loaded = true;
        const signature = JSON.stringify(items);
        if (signature !== this.signature || this.error) {
          this.signature = signature; this.error = ''; this.render();
        }
      } catch (e) { this.error = e.message || String(e); this.render(); }
      finally { this.fetching = false; }
    }
    async service(service, data) {
      await this._hass.callService('todo', service, {...data, entity_id:this.config.entity});
    }
    async action(callback) {
      if (this.busy) return;
      this.busy = true; this.error = '';
      this.shadowRoot.querySelectorAll('button,input').forEach(el => el.disabled = true);
      let succeeded = false;
      try { await callback(); succeeded = true; }
      catch(e) { this.error = e.message || String(e); }
      finally {
        this.busy = false;
        this.render();
        if (succeeded) await this.refresh();
      }
    }
    async addDinner(name) {
      name = name.trim(); if (!name) return;
      if (this.items.some(i => this.meta(i)?.dinner.toLowerCase() === name.toLowerCase())) throw new Error('That dinner already exists. Add items under it.');
      await this.service('add_item', {item:name, description:PREFIX+JSON.stringify({kind:'dinner', dinner:name})});
    }
    async addItem(dinner, name) {
      name = name.trim(); if (!name) return;
      await this.service('add_item', {item:name, description:PREFIX+JSON.stringify({kind:'item', dinner})});
    }
    node(tag, text, parent, className) {
      const el = document.createElement(tag);
      if (text !== undefined) el.textContent = text;
      if (className) el.className = className;
      if (parent) parent.append(el);
      return el;
    }
    button(text, parent, callback, label) {
      const b = this.node('button', text, parent); b.type = 'button';
      if(label) { b.title = label; b.setAttribute('aria-label',label); }
      b.onclick = callback; return b;
    }
    form(parent, placeholder, callback, key) {
      const form = this.node('form', undefined, parent);
      const input = this.node('input', undefined, form);
      input.placeholder = placeholder; input.setAttribute('aria-label',placeholder);
      input.required = true; input.maxLength = 160; input.dataset.key = key;
      const button = this.node('button','Add',form); button.type = 'submit';
      form.onsubmit = e => { e.preventDefault(); if (!input.value.trim()) return;
        this.action(async () => { await callback(input.value); input.value = ''; }); };
    }
    render() {
      if (!this.config) return;
      // Preserve unfinished input during refreshes from other devices.
      const drafts = new Map([...this.shadowRoot.querySelectorAll('input[data-key]')].map(i=>[i.dataset.key,i.value]));
      const active = this.shadowRoot.activeElement;
      const focusKey = active?.dataset.key;
      const selection = active && active.type === 'text' ? active.selectionStart : null;
      this.shadowRoot.replaceChildren();
      this.node('style', `
        :host{display:block;color:var(--primary-text-color)}
        ha-card{padding:20px;background:var(--ha-card-background,var(--card-background-color));border-radius:var(--ha-card-border-radius,16px)}
        h2{font-size:22px;margin:0 0 5px}p{color:var(--secondary-text-color);margin:0 0 18px;font-size:14px}
        section{border:1px solid var(--divider-color,#ddd);border-radius:12px;margin-top:16px;padding:14px}
        header{display:flex;align-items:center;gap:8px;margin-bottom:10px}h3{font-size:18px;margin:0;flex:1;overflow-wrap:anywhere}
        form{display:flex;gap:8px;margin-top:12px}input:not([type=checkbox]){flex:1;min-width:0;border:1px solid var(--divider-color,#aaa);border-radius:8px;padding:11px;background:var(--secondary-background-color);color:inherit;font:inherit}
        button{border:0;border-radius:8px;padding:10px 12px;min-height:44px;background:var(--primary-color,#03a9f4);color:var(--text-primary-color,#fff);font:inherit;cursor:pointer}
        header button,.row button{background:transparent;color:var(--secondary-text-color);font-size:13px;padding:8px}
        .row{display:flex;align-items:center;gap:8px;min-height:44px}.row label{display:flex;align-items:center;gap:12px;flex:1;overflow-wrap:anywhere;min-width:0;cursor:pointer}
        input[type=checkbox]{width:22px;height:22px;flex-shrink:0;accent-color:var(--primary-color)}.done span{text-decoration:line-through;color:var(--secondary-text-color)}
        .error{color:var(--error-color,#db4437);white-space:pre-wrap;margin:12px 0}.empty{margin:12px 0}.count{font-size:12px;color:var(--secondary-text-color)}
        button:disabled,input:disabled{opacity:.5;cursor:wait}button:focus-visible,input:focus-visible{outline:2px solid var(--primary-color);outline-offset:2px}
      `,this.shadowRoot);
      const card = this.node('ha-card',undefined,this.shadowRoot);
      this.node('h2',this.config.title || 'Dinner shopping',card);
      this.node('p','Choose your dinners. Add what you need. Tick it off in the shop.',card);
      if(this.error) { const err=this.node('div',this.error,card,'error'); err.setAttribute('role','alert'); }
      if (!this.loaded) this.node('p','Loading your list…',card);
      this.form(card,'New dinner, e.g. Steak dinner',name=>this.addDinner(name),'new-dinner');
      const groups = new Map();
      for(const item of this.items) {
        const m = this.meta(item); if(!m) continue;
        if(!groups.has(m.dinner)) groups.set(m.dinner,[]);
        groups.get(m.dinner).push(item);
      }
      if(this.loaded && !groups.size) this.node('p','No dinners yet. Add your first dinner above.',card,'empty');
      for(const [dinner, records] of groups) {
        const section = this.node('section',undefined,card);
        const header = this.node('header',undefined,section);
        this.node('h3',dinner,header);
        const items = records.filter(i=>this.meta(i).kind === 'item');
        this.node('span',`${items.filter(i=>i.status==='completed').length}/${items.length}`,header,'count');
        this.button('Delete',header,()=>{
          if(confirm(`Delete "${dinner}" and all its shopping items?`)) this.action(async()=>{
            for(const record of records) await this.service('remove_item',{item:record.uid});
          });
        },`Delete ${dinner}`);
        for(const item of items) {
          const row=this.node('div',undefined,section,'row');
          const label=this.node('label',undefined,row,item.status==='completed'?'done':'');
          const checkbox=this.node('input',undefined,label); checkbox.type='checkbox'; checkbox.checked=item.status==='completed';
          checkbox.onchange=()=>this.action(()=>this.service('update_item',{item:item.uid,status:checkbox.checked?'completed':'needs_action'}));
          this.node('span',item.summary,label);
          this.button('×',row,()=>{if(confirm(`Remove "${item.summary}"?`)) this.action(()=>this.service('remove_item',{item:item.uid}));},`Remove ${item.summary}`);
        }
        if(!items.length) this.node('p','Add what you need to buy below.',section,'empty');
        this.form(section,'Item, e.g. Potatoes — 1 kg',name=>this.addItem(dinner,name),`item:${dinner}`);
      }
      this.shadowRoot.querySelectorAll('input[data-key]').forEach(input=>{
        input.value=drafts.get(input.dataset.key)||'';
        if(input.dataset.key===focusKey) {input.focus();if(selection!==null) input.setSelectionRange(selection,selection);}
      });
      if(this.busy || !this.loaded) this.shadowRoot.querySelectorAll('button,input').forEach(el=>el.disabled=true);
    }
  }
  if(!customElements.get('dinner-shopping-card')) customElements.define('dinner-shopping-card',DinnerShoppingCard);
  window.customCards=window.customCards||[];
  if(!window.customCards.some(c=>c.type==='dinner-shopping-card')) window.customCards.push({type:'dinner-shopping-card',name:'Dinner Shopping',description:'Separate dinners with shopping checklists. Requires a dedicated Local to-do list.'});
})();
