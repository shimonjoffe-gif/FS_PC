import { getFsClientJs } from './briefingHtmlFsClient';

/** Browser-side script embedded in exported briefing HTML (plain JS string). */
export const BRIEFING_HTML_EXPORT_CLIENT_JS = `
(function(){
  var dataEl = document.getElementById('briefing-export-data');
  var data = JSON.parse(dataEl.textContent);
  var blocks = data.blocks || {};

  function esc(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
  function yesNoBtn(val, unmatched){ var c='yesno '+(val?'yes':'no')+(unmatched&&!val?' unmatched':''); return '<button type="button" class="'+c+'" data-val="'+(val?1:0)+'">'+(val?'Да':'Нет')+'</button>'; }
  function yesNoBadge(val){ return '<span class="yesno yesno-readonly '+(val?'yes':'no')+'">'+(val?'Да':'Нет')+'</span>'; }
  function computeAdvanceDeferralOk(p){ return p.advance_pct>=0.3&&p.payment_deferral_days<=10; }
  function updateAdvanceDeferralFormulaCell(){
    if(!data.assessment_contract) return;
    var p=data.assessment_contract.contract_params;
    var pa=document.querySelector('[data-contract-param=advance_pct]');
    var pd=document.querySelector('[data-contract-param=payment_deferral_days]');
    if(pa) p.advance_pct=Number(pa.value)/100;
    if(pd) p.payment_deferral_days=Number(pd.value);
    var ok=computeAdvanceDeferralOk(p);
    data.assessment_contract.advance_deferral_ok=ok;
    var cell=document.querySelector('[data-contract-formula]');
    if(cell) cell.innerHTML=yesNoBadge(ok);
  }

  function secOpen(key){
    if(data.ui_state && data.ui_state.sections && Object.prototype.hasOwnProperty.call(data.ui_state.sections, key))
      return !!data.ui_state.sections[key];
    return key === 'customer';
  }

  function sectionWrap(key, title, body){
    var open=secOpen(key);
    return '<div class="sec'+(open?' open':'')+'" data-sec="'+key+'"><div class="sec-h"><span class="arrow">'+(open?'▼':'▶')+'</span><strong>'+title+'</strong></div><div class="sec-b">'+body+'</div></div>';
  }

  var FS_NMD_VALUES=['Не требуется','Предоставляется Заказчиком','Используется типовая','Требуется разработать'];

  function syncUiState(){
    data.ui_state = data.ui_state || {};
    data.ui_state.sections = {};
    document.querySelectorAll('.sec[data-sec]').forEach(function(sec){
      data.ui_state.sections[sec.getAttribute('data-sec')] = sec.classList.contains('open');
    });
    data.ui_state.fs_groups = {};
    document.querySelectorAll('.fs-grp[data-fs-grp]').forEach(function(row){
      var key=decodeURIComponent(row.getAttribute('data-fs-grp')||'');
      data.ui_state.fs_groups[key] = row.classList.contains('open');
    });
    data.ui_state.widget_groups = {};
    document.querySelectorAll('[data-widget-group]').forEach(function(row){
      var key=row.getAttribute('data-widget-group')||'';
      data.ui_state.widget_groups[key] = row.classList.contains('open');
    });
    data.ui_state.org_queues = {};
    document.querySelectorAll('[data-org-queue-open]').forEach(function(el){
      var q=el.getAttribute('data-org-queue-open');
      if(q) data.ui_state.org_queues[q] = el.classList.contains('open');
    });
  }

  function newId(){ return 'id_'+Math.random().toString(36).slice(2,11); }
  function uiOpen(bucket,key,def){
    var st=data.ui_state;
    if(!st||!st[bucket]||!Object.prototype.hasOwnProperty.call(st[bucket],key)) return def;
    return !!st[bucket][key];
  }
  function rerender(){ syncFromDom(); syncUiState(); render(); }

  var FS_QUEUE_KEYS=['1','2','3','4'];

  function orgEmpty(v){ return v==null||v===''; }
  function orgClamp(n){ return Math.max(0, Math.round(Number(n)||0)); }
  function orgNullable(raw){
    var s=String(raw).trim();
    if(s==='') return null;
    return orgClamp(s);
  }

  function getOrgVolume(){
    if(data.assessment_org_volume&&data.assessment_org_volume.org_volume) return data.assessment_org_volume.org_volume;
    if(data.customer&&data.customer.org_volume) return data.customer.org_volume;
    return null;
  }

  function orgVolumeContext(){
    var ov=getOrgVolume();
    if(!ov) return null;
    var block=data.assessment_org_volume||{};
    return {
      org_volume: ov,
      queue_keys: block.queue_keys||data.customer&&data.customer.queue_keys||FS_QUEUE_KEYS,
      queue_labels: block.queue_labels||data.customer&&data.customer.queue_labels||{}
    };
  }

  function catalogCodeParts(code){
    if(!code) return [Number.MAX_SAFE_INTEGER];
    return String(code).replace(/\.$/,'').split('.').map(function(n){ return parseInt(n,10)||0; });
  }

  function compareCatalogCode(a,b){
    var pa=catalogCodeParts(a.catalog_code);
    var pb=catalogCodeParts(b.catalog_code);
    var len=Math.max(pa.length,pb.length);
    for(var i=0;i<len;i++){
      var diff=(pa[i]??Number.MAX_SAFE_INTEGER)-(pb[i]??Number.MAX_SAFE_INTEGER);
      if(diff) return diff;
    }
    return (a.sort_order||0)-(b.sort_order||0)||a.id-b.id;
  }

  function availableSegments(c){
    var all=c.segments||[];
    var ids=c.activity_type_ids||[];
    if(!ids.length) return all;
    var industryIds=new Set();
    (c.activity_types||[]).forEach(function(at){
      if(ids.indexOf(at.id)<0) return;
      (c.industries||[]).forEach(function(ind){
        if(ind.name===at.name) industryIds.add(ind.id);
      });
    });
    if(!industryIds.size) return all;
    return all.filter(function(s){ return s.industry_id==null||industryIds.has(s.industry_id); });
  }

  function ensureValidCustomerSegment(){
    if(!data.customer) return;
    var segs=availableSegments(data.customer);
    if(data.customer.segment_id!=null&&!segs.some(function(s){ return s.id===data.customer.segment_id; })){
      data.customer.segment_id=null;
    }
  }

  function ensureOrgQueue(ov,q){
    var key=String(q);
    ov.queues=ov.queues||{};
    if(!ov.queues[key]){
      ov.queues[key]={users:0,rp_rpo:null,executors:null,rg:0,rg_regions:0,active:false,breakdown:[]};
    }
    var row=ov.queues[key];
    if(!row.breakdown) row.breakdown=[];
    return row;
  }

  function defaultBreakdownRow(label){
    return {id:newId(),label:label||'',users:null,rp_rpo:null,executors:null,rg:null,branches:[]};
  }

  function effectiveBreakdownField(row,field){
    if(row.branches&&row.branches.length){
      var vals=row.branches.map(function(b){return effectiveBreakdownField(b,field);});
      if(vals.every(function(v){return v==null;})) return null;
      return vals.reduce(function(s,v){return s+(v||0);},0);
    }
    return row[field]!=null?row[field]:null;
  }

  function isBreakdownFilled(row){
    return !orgEmpty(row.rp_rpo)&&!orgEmpty(row.executors);
  }

  function rebalancePartners(users,rp,exec){
    var u=users||0;
    if(!orgEmpty(rp)) return {rp_rpo:rp,executors:orgClamp(u-rp)};
    if(!orgEmpty(exec)) return {rp_rpo:orgClamp(u-exec),executors:exec};
    return {rp_rpo:rp,executors:exec};
  }

  function applyBreakdownPatch(row,field,raw){
    if(field==='label'){ row.label=String(raw); return; }
    if(field==='users'){
      var u=orgNullable(raw); row.users=u;
      if(u!=null){ var p=rebalancePartners(u,row.rp_rpo,row.executors); row.rp_rpo=p.rp_rpo; row.executors=p.executors; }
      return;
    }
    if(field==='rp_rpo'){
      var rp=orgNullable(raw); row.rp_rpo=rp;
      if(rp!=null&&!orgEmpty(row.users)) row.executors=orgClamp(row.users-rp);
      return;
    }
    if(field==='executors'){
      var ex=orgNullable(raw); row.executors=ex;
      if(ex!=null&&!orgEmpty(row.users)) row.rp_rpo=orgClamp(row.users-ex);
      return;
    }
    row[field]=orgNullable(raw);
  }

  function parseOrgInt(raw){
    var s=String(raw).trim();
    if(s==='') return 0;
    return orgClamp(s);
  }

  function isQueueOrgFilled(row){
    if(!row.active) return false;
    return !orgEmpty(row.rp_rpo)&&!orgEmpty(row.executors);
  }

  function applyOrgQueueFieldPatch(row,field,raw){
    if(field==='users'){
      row.users=parseOrgInt(raw);
      var p=rebalancePartners(row.users,row.rp_rpo,row.executors);
      row.rp_rpo=p.rp_rpo; row.executors=p.executors;
      return;
    }
    if(field==='rp_rpo'){
      var rp=orgNullable(raw);
      if(rp==null){ row.rp_rpo=null; return; }
      row.rp_rpo=rp;
      row.executors=orgClamp(row.users-rp);
      return;
    }
    if(field==='executors'){
      var ex=orgNullable(raw);
      if(ex==null){ row.executors=null; return; }
      row.executors=ex;
      row.rp_rpo=orgClamp(row.users-ex);
      return;
    }
    if(field==='rg'){
      row.rg=parseOrgInt(raw);
    }
  }

  function getSubsequentCascadeTargets(queues,sourceKey,trigger){
    var si=FS_QUEUE_KEYS.indexOf(String(sourceKey));
    if(si<0) return [];
    var subsequent=FS_QUEUE_KEYS.slice(si+1);
    if(trigger==='users'||trigger==='rg') return subsequent;
    return subsequent.filter(function(q){
      var row=queues[q];
      return row&&row.active;
    });
  }

  function applyCascadeToTarget(source,target,trigger){
    if(trigger==='rg'){
      target.rg=source.rg;
      return target;
    }
    var preserveUsers=trigger!=='users'&&target.users!==source.users;
    var users=preserveUsers?target.users:source.users;
    var p=rebalancePartners(users,source.rp_rpo,source.executors);
    target.users=users;
    target.rp_rpo=p.rp_rpo;
    target.executors=p.executors;
    target.rg=source.rg;
    return target;
  }

  function applyOrgQueueCascade(ov,sourceKey,overwriteFilled,trigger){
    var source=ensureOrgQueue(ov,String(sourceKey));
    getSubsequentCascadeTargets(ov.queues,String(sourceKey),trigger).forEach(function(q){
      var row=ensureOrgQueue(ov,q);
      if(isQueueOrgFilled(row)&&!overwriteFilled) return;
      applyCascadeToTarget(source,row,trigger);
    });
  }

  function commitOrgQueueField(q,field){
    var ov=getOrgVolume();
    if(!ov) return;
    var row=ensureOrgQueue(ov,String(q));
    var inp=document.querySelector('[data-org-q="'+q+'"][data-org-field="'+field+'"]:not([data-org-region])');
    if(!inp) return;
    applyOrgQueueFieldPatch(row,field,inp.value);
    applyOrgQueueCascade(ov,q,true,field);
  }

  function copyBreakdownStructure(src){
    return {
      id:src.id, label:src.label, users:null, rp_rpo:null, executors:null, rg:null,
      branches:(src.branches||[]).map(copyBreakdownStructure)
    };
  }

  function findRegionByMatch(bd,source,queueRegion){
    var byId=bd.find(function(r){return r.id===source.id;});
    if(byId) return byId;
    return bd.find(function(r){
      return r.label&&r.label===source.label&&r.label!==(queueRegion||'');
    });
  }

  function cascadeRegionAdded(ov,sourceKey,regionId){
    var srcRow=ensureOrgQueue(ov,String(sourceKey));
    var srcRegion=(srcRow.breakdown||[]).find(function(r){return r.id===regionId;});
    if(!srcRegion) return;
    var si=FS_QUEUE_KEYS.indexOf(String(sourceKey));
    for(var i=si+1;i<FS_QUEUE_KEYS.length;i++){
      var q=FS_QUEUE_KEYS[i];
      var tgt=ensureOrgQueue(ov,q);
      var bd=tgt.breakdown||[];
      if(findRegionByMatch(bd,srcRegion,tgt.region||'')) continue;
      tgt.breakdown=bd.concat([copyBreakdownStructure(srcRegion)]);
    }
  }

  function cascadeBranchAdded(ov,sourceKey,regionId,branchId){
    var srcRow=ensureOrgQueue(ov,String(sourceKey));
    var srcRegion=(srcRow.breakdown||[]).find(function(r){return r.id===regionId;});
    var srcBranch=srcRegion&&(srcRegion.branches||[]).find(function(b){return b.id===branchId;});
    if(!srcRegion||!srcBranch) return;
    var si=FS_QUEUE_KEYS.indexOf(String(sourceKey));
    for(var i=si+1;i<FS_QUEUE_KEYS.length;i++){
      var q=FS_QUEUE_KEYS[i];
      var tgt=ensureOrgQueue(ov,q);
      var bd=tgt.breakdown||[];
      var tgtRegion=findRegionByMatch(bd,srcRegion,tgt.region||'');
      if(!tgtRegion){
        tgtRegion=copyBreakdownStructure(srcRegion);
        bd=bd.concat([tgtRegion]);
      }
      var branches=tgtRegion.branches||[];
      if(!branches.find(function(b){return b.id===branchId;})){
        branches=branches.concat([copyBreakdownStructure(srcBranch)]);
        tgtRegion.branches=branches;
        bd=bd.map(function(r){return r.id===tgtRegion.id?tgtRegion:r;});
      }
      tgt.breakdown=bd;
    }
  }

  function cascadeBreakdownValues(ov,sourceKey,regionId,branchId,field){
    var srcRow=ensureOrgQueue(ov,String(sourceKey));
    var srcRegion=(srcRow.breakdown||[]).find(function(r){return r.id===regionId;});
    if(!srcRegion) return;
    var srcNode=branchId?(srcRegion.branches||[]).find(function(b){return b.id===branchId;}):srcRegion;
    if(!srcNode) return;
    var si=FS_QUEUE_KEYS.indexOf(String(sourceKey));
    for(var i=si+1;i<FS_QUEUE_KEYS.length;i++){
      var q=FS_QUEUE_KEYS[i];
      var tgt=ensureOrgQueue(ov,q);
      var bd=tgt.breakdown||[];
      var tgtRegion=findRegionByMatch(bd,srcRegion,tgt.region||'');
      if(!tgtRegion){
        tgtRegion=copyBreakdownStructure(srcRegion);
        bd=bd.concat([tgtRegion]);
      }
      var tgtNode=branchId?((function(){
        var br=(tgtRegion.branches||[]).find(function(b){return b.id===branchId;});
        if(!br){
          br=copyBreakdownStructure(srcNode);
          tgtRegion.branches=(tgtRegion.branches||[]).concat([br]);
        }
        return br;
      })()):tgtRegion;
      if(field==='label'){
        tgtNode.label=srcNode.label;
      } else if(!isBreakdownFilled(tgtNode)||field==='users'||field==='rp_rpo'||field==='executors'||field==='rg'){
        applyBreakdownPatch(tgtNode,field,srcNode[field]!=null?srcNode[field]:'');
      }
      tgt.breakdown=bd.map(function(r){return r.id===tgtRegion.id?tgtRegion:r;});
    }
  }

  function qLabel(q){ var lb=data.fs&&data.fs.queue_labels; return (lb&&lb[q])||((data.fs&&data.fs.queue_defaults)||{})[q]||q; }

  function orgNumVal(v){ return v==null||v===''?'':String(v); }
  function orgNumInput(q, field, val, opts){
    if(opts&&opts.readOnly){
      return '<span class="org-readonly">'+orgNumVal(val)+'</span>';
    }
    return '<input type="number" min="0" step="1" style="width:100%;max-width:6rem" data-org-q="'+q+'" data-org-field="'+field+'" value="'+orgNumVal(val)+'">';
  }
  function orgBreakdownInput(q, regionId, branchId, field, val, readOnly){
    if(readOnly){
      return '<span class="org-readonly">'+orgNumVal(val)+'</span>';
    }
    var attrs='data-org-q="'+q+'" data-org-region="'+regionId+'" data-org-field="'+field+'"';
    if(branchId) attrs+=' data-org-branch="'+branchId+'"';
    return '<input type="number" min="0" step="1" style="width:100%;max-width:5rem" '+attrs+' value="'+orgNumVal(val)+'">';
  }

  function renderOrgBreakdownRow(q, region, branch, isBranch){
    var r=isBranch?branch:region;
    var regionId=region.id;
    var branchId=isBranch?branch.id:null;
    var cls=isBranch?'org-branch':'org-region';
    var pad=isBranch?24:12;
    var hasBranches=!isBranch&&(region.branches||[]).length>0;
    var labelAttrs='data-org-q="'+q+'" data-org-region="'+regionId+'" data-org-field="label"';
    if(branchId) labelAttrs+=' data-org-branch="'+branchId+'"';
    var addBranchBtn=!isBranch?(' <button type="button" class="btn-link" data-org-add-branch="'+q+':'+regionId+'">++</button>'):'';
    return '<tr class="'+cls+'"><td style="padding-left:'+pad+'px"><input type="text" '+labelAttrs+' value="'+esc(r.label||'')+'" style="width:100%">'+addBranchBtn+'</td>'+
      '<td></td>'+
      '<td>'+orgBreakdownInput(q,regionId,branchId,'users',hasBranches?effectiveBreakdownField(region,'users'):r.users,hasBranches)+'</td>'+
      '<td>'+orgBreakdownInput(q,regionId,branchId,'rp_rpo',hasBranches?effectiveBreakdownField(region,'rp_rpo'):r.rp_rpo,hasBranches)+'</td>'+
      '<td>'+orgBreakdownInput(q,regionId,branchId,'executors',hasBranches?effectiveBreakdownField(region,'executors'):r.executors,hasBranches)+'</td>'+
      '<td>'+orgBreakdownInput(q,regionId,branchId,'rg',hasBranches?effectiveBreakdownField(region,'rg'):r.rg,hasBranches)+'</td></tr>';
  }

  function renderOrgBreakdownRows(q, row){
    var breakdown=row.breakdown||[];
    var html='';
    breakdown.forEach(function(region){
      html+=renderOrgBreakdownRow(q,region,null,false);
      (region.branches||[]).forEach(function(branch){
        html+=renderOrgBreakdownRow(q,region,branch,true);
      });
    });
    html+='<tr class="org-region"><td colspan="6" style="padding-left:12px"><button type="button" class="btn-link" data-org-add-region="'+q+'">+ Добавить регион</button></td></tr>';
    return html;
  }

  function renderOrgVolumeBlock(c){
    if(!c.org_volume) return '';
    var ov=c.org_volume;
    var keys=c.queue_keys||FS_QUEUE_KEYS;
    var rows='';
    keys.forEach(function(q){
      var row=ensureOrgQueue(ov,String(q));
      var lbl=(c.queue_labels&&c.queue_labels[q])||q;
      var breakdown=row.breakdown||[];
      var hasBd=breakdown.length>0;
      var queueOpen=hasBd?uiOpen('org_queues',String(q),true):uiOpen('org_queues',String(q),false);
      rows+='<tr data-org-queue-open="'+q+'" data-org-q="'+q+'" class="'+(queueOpen?'open':'')+'"><td>'+
        '<button type="button" class="btn-link" data-org-queue-toggle="'+q+'">'+(queueOpen?'▼':'▶')+'</button> '+esc(lbl)+
        ' <button type="button" class="btn-link" data-org-add-region="'+q+'">+</button></td>'+
        '<td style="text-align:center"><input type="checkbox" disabled'+(row.active?' checked':'')+' title="Задаётся в разделе ФС"></td>'+
        '<td>'+orgNumInput(q,'users',row.users)+'</td>'+
        '<td>'+orgNumInput(q,'rp_rpo',row.rp_rpo)+'</td>'+
        '<td>'+orgNumInput(q,'executors',row.executors)+'</td>'+
        '<td>'+orgNumInput(q,'rg',row.rg)+'</td></tr>';
      if(queueOpen) rows+=renderOrgBreakdownRows(q,row);
    });
    return '<table class="tbl"><thead><tr><th>Очередь</th><th style="width:4rem">Активна</th><th>Польз.</th><th>РП/РПО</th><th>Исполн.</th><th>РГ</th></tr></thead><tbody>'+rows+'</tbody></table>'+
      '<p style="font-size:10px;color:#64748b;margin-top:6px">Польз. очереди — итого; регионы — для удалёнки и командировок (сумма регионов ≠ очередь). РП/РПО + Исполн. = Польз. Изменение польз. в очереди каскадируется на последующие очереди.</p>';
  }

  function customerHeadcountCategory(c){
    if(c.headcount_category) return c.headcount_category;
    var map={200:'до 200',350:'201-500',750:'501-1000',1500:'1001+'};
    return c.headcount!=null?map[c.headcount]||'до 200':'до 200';
  }

  function renderCustomer(){
    var c=data.customer; if(!c) return '';
    var scenOpts='<option value="">— выберите —</option>'+c.scenarios.map(function(s){ return '<option'+(c.scenario===s?' selected':'')+'>'+esc(s)+'</option>'; }).join('');
    var selectedHc=customerHeadcountCategory(c);
    var hcOpts=(c.headcount_categories||[]).map(function(cat){
      return '<option'+(selectedHc===cat?' selected':'')+'>'+esc(cat)+'</option>';
    }).join('');
    return sectionWrap('customer', 'Заказчик',
      '<div class="customer-header-row">'+
      '<label class="field-hdr"><span>Название оценки</span><input type="text" data-c="name" value="'+esc(c.name)+'"></label>'+
      '<label class="field-hdr shrink"><span>Сценарий</span><select data-c="scenario">'+scenOpts+'</select></label>'+
      '<label class="field-hdr hc"><span>Численность (C62)</span><select data-c="headcount_category">'+hcOpts+'</select></label>'+
      '</div>'+
      renderCustomerFilterRows()+
      renderProblemsTable()
    );
  }

  function renderCustomerFilterRows(){
    var pr=data.problems;
    if(!pr||!pr.catalog||!data.customer) return '';
    var c=data.customer;
    var st=problemFilterState(pr);
    var filterActive=problemCustomerFilterActive(st);
    var anyFilter=filterActive||st.hypothesisFilterIds.length>0;
    var selAct=new Set(st.activityTypeIds);
    var chips=(c.activity_types||[]).map(function(at){
      return '<button type="button" class="problem-chip'+(selAct.has(at.id)?' selected':'')+'" data-activity-type="'+at.id+'">'+esc(at.name)+'</button>';
    }).join('');
    var segs=availableSegments(c);
    var segOpts='<option value="">Сегм.</option>'+segs.map(function(s){
      return '<option value="'+s.id+'"'+(c.segment_id===s.id?' selected':'')+'>'+esc(s.name)+'</option>';
    }).join('');
    var showAllBtn=filterActive?('<button type="button" class="problem-filter-btn" data-problem-show-all>'+(st.showAllProblems?'Только по фильтру':'Показать все')+'</button>'):'';
    var row1='<div class="customer-filter-grid'+(filterActive?'':' no-showall')+'">'+
      '<div class="customer-filter-chips"><span class="filter-label">Виды деятельности</span>'+chips+'</div>'+
      '<select class="customer-segment-select" data-c="segment_id" title="Сегмент">'+segOpts+'</select>'+
      showAllBtn+
      '</div>';
    var row2='';
    if(filterActive){
      var avail=availableHypothesesForFilter(st,pr);
      var hypSel=new Set(st.hypothesisFilterIds);
      var hypChips=avail.length?avail.map(function(h){
        return '<button type="button" class="problem-chip'+(hypSel.has(h.id)?' selected':'')+'" data-problem-hypothesis="'+h.id+'">'+esc(h.name)+'</button>';
      }).join(''):'<span style="font-size:11px;color:#94a3b8">нет по текущему фильтру</span>';
      row2='<div class="customer-hypothesis-row"><span class="filter-label">Гипотезы</span><div class="customer-filter-chips">'+hypChips+'</div></div>';
    }
    return row1+row2;
  }

  function groupItems(items){
    var groups=[];
    var keyToIdx={};
    (items||[]).forEach(function(it){
      var g=it.group_name||'Прочее';
      if(keyToIdx[g]==null){
        keyToIdx[g]=groups.length;
        groups.push({group:g,groupPrefix:it.group_prefix||null,items:[]});
      }
      groups[keyToIdx[g]].items.push(it);
      if(!groups[keyToIdx[g]].groupPrefix && it.group_prefix)
        groups[keyToIdx[g]].groupPrefix=it.group_prefix;
    });
    return groups;
  }

${getFsClientJs()}

  function renderCriteria(){
    var ac=data.assessment_criteria; if(!ac) return '';
    var rows='';
    (ac.criteria_defs||[]).forEach(function(def){
      var g=ac.groups[def.key]||{children:{},custom_rows:[]};
      var rp=typeof g.group_rp_override==='boolean'?g.group_rp_override:Object.values(g.children||{}).some(function(c){return c.rp_value;});
      rows+='<tr><td>'+esc(def.label)+'</td><td style="text-align:center" data-crit-group="'+def.key+'">'+yesNoBtn(rp,false)+'</td></tr>';
      (def.childFields||[]).forEach(function(ch){
        var cv=(g.children&&g.children[ch.key])||{};
        rows+='<tr class="child-row"><td>'+esc(ch.label)+'</td><td style="text-align:center" data-crit-child="'+def.key+'.'+ch.key+'">'+yesNoBtn(!!cv.rp_value,false)+'</td></tr>';
      });
      (g.custom_rows||[]).forEach(function(r){
        rows+='<tr class="child-row"><td><input type="text" data-crit-custom="'+def.key+'.'+r.id+'" value="'+esc(r.label)+'" style="width:100%"></td>'+
          '<td style="text-align:center" data-crit-custom-val="'+def.key+'.'+r.id+'">'+yesNoBtn(!!r.rp_value,false)+'</td></tr>';
      });
    });
    return sectionWrap('assessment_criteria', 'Параметры оценки',
      '<table class="tbl"><thead><tr><th>Критерий</th><th>Заказчик</th></tr></thead><tbody>'+rows+'</tbody></table>'
    );
  }

  function renderContract(){
    var ac=data.assessment_contract; if(!ac) return '';
    var p=ac.contract_params;
  var rows=(ac.contract_defs||[]).map(function(d){
      return '<tr><td>'+esc(d.label)+'</td><td style="text-align:center" data-contract="'+d.key+'">'+yesNoBtn(!!ac.criteria[d.key],false)+'</td></tr>';
    }).join('');
    var advanceDeferralOk=computeAdvanceDeferralOk(p);
    ac.advance_deferral_ok=advanceDeferralOk;
    rows+='<tr class="formula-row"><td>'+esc(ac.formula_row.label)+' <span style="color:#94a3b8;font-size:11px">(формула)</span></td><td style="text-align:center" data-contract-formula>'+yesNoBadge(advanceDeferralOk)+'</td></tr>';
    return sectionWrap('assessment_contract', 'Параметры договора',
      '<label class="field"><span>Версия PM</span><input type="text" data-contract-param="pm_version" value="'+esc(p.pm_version)+'"></label>'+
      '<label class="field"><span>Аванс (%)</span><input type="number" data-contract-param="advance_pct" value="'+Math.round(p.advance_pct*100)+'" min="0" max="100" step="1"></label>'+
      '<label class="field"><span>Отсрочка платежа (дней)</span><input type="number" data-contract-param="payment_deferral_days" value="'+p.payment_deferral_days+'" min="0"></label>'+
      '<label class="field"><span>Макс. длительность этапа (дней)</span><input type="number" data-contract-param="max_stage_duration_days" value="'+(p.max_stage_duration_days!=null?p.max_stage_duration_days:'')+'"></label>'+
      '<table class="tbl" style="margin-top:12px"><thead><tr><th>Условие</th><th>Да/Нет</th></tr></thead><tbody>'+rows+'</tbody></table>'
    );
  }

  function problemFilterState(pr){
    var segmentId=pr.segment_id;
    if(data.customer&&data.customer.segment_id!=null) segmentId=data.customer.segment_id;
    var activityIds=(data.customer&&data.customer.activity_type_ids)||pr.activity_type_ids||[];
    return {
      activityTypeIds: activityIds.slice(),
      segmentId: segmentId,
      hypothesisFilterIds: pr.hypothesis_filter_ids||[],
      showAllProblems: !!pr.show_all_problems
    };
  }

  function problemCustomerFilterActive(st){
    return st.activityTypeIds.length>0||st.segmentId!=null;
  }

  function matchesProblemActivity(problemId, st, pr){
    if(!st.activityTypeIds.length&&st.segmentId==null) return true;
    var problem=(pr.catalog||[]).find(function(p){return p.id===problemId;});
    if(!problem) return false;
    if(st.segmentId!=null&&problem.segment_id!=null&&problem.segment_id!==st.segmentId) return false;
    if(!st.activityTypeIds.length) return true;
    var hypIds=(pr.problem_hypothesis_ids||{})[String(problemId)]||[];
    return hypIds.some(function(hid){
      var hyp=(pr.hypotheses||[]).find(function(h){return h.id===hid;});
      if(!hyp) return false;
      return (hyp.activity_type_ids||[]).some(function(aid){return st.activityTypeIds.indexOf(aid)>=0;});
    });
  }

  function matchesProblemHypothesis(problem, st){
    if(!st.hypothesisFilterIds.length) return true;
    var sel=new Set(st.hypothesisFilterIds);
    var hypByName={};
    (data.problems&&data.problems.hypotheses||[]).forEach(function(h){ hypByName[h.name]=h.id; });
    return (problem.used_in_hypotheses||[]).some(function(name){
      var hid=hypByName[name];
      return hid!=null&&sel.has(hid);
    });
  }

  function collectProblemWithAncestors(catalog, matchIds){
    var byId={};
    catalog.forEach(function(p){ byId[p.id]=p; });
    var result=new Set();
    matchIds.forEach(function(id){
      var cursor=id;
      while(cursor){
        if(result.has(cursor)) break;
        result.add(cursor);
        var row=byId[cursor];
        cursor=row&&row.parent_id?row.parent_id:null;
      }
    });
    return result;
  }

  function buildProblemDisplayUnits(items){
    var units=[];
    var consumed=new Set();
    var byId={};
    items.forEach(function(p){ byId[p.id]=p; });
    var roots=items.filter(function(p){ return !p.parent_id||!byId[p.parent_id]; })
      .sort(compareCatalogCode);
    roots.forEach(function(root){
      var children=items.filter(function(c){ return c.parent_id===root.id; })
        .sort(compareCatalogCode);
      if(children.length>0){
        units.push({kind:'group',parent:root,children:children});
        consumed.add(root.id);
        children.forEach(function(c){ consumed.add(c.id); });
      }
    });
    items.forEach(function(item){
      if(!consumed.has(item.id)) units.push({kind:'standalone',item:item});
    });
    units.sort(function(a,b){
      var itemA=a.kind==='group'?a.parent:a.item;
      var itemB=b.kind==='group'?b.parent:b.item;
      return compareCatalogCode(itemA,itemB);
    });
    return units;
  }

  function aggregateProblemGroupSelected(members, selectedIds){
    return members.some(function(m){ return selectedIds.has(m.id); });
  }

  function getProblemFilterMismatchHint(problemId, st, pr){
    if(!problemCustomerFilterActive(st)&&!st.hypothesisFilterIds.length) return null;
    var problem=(pr.catalog||[]).find(function(p){return p.id===problemId;});
    if(!problem) return null;
    var activityFail=problemCustomerFilterActive(st)&&!matchesProblemActivity(problemId,st,pr);
    var hypothesisFail=st.hypothesisFilterIds.length>0&&!matchesProblemHypothesis(problem,st);
    if(!activityFail&&!hypothesisFail) return null;
    if(activityFail&&hypothesisFail) return 'не подходит под виды деятельности/сегмент и гипотезы';
    if(activityFail) return 'не подходит под виды деятельности/сегмент';
    return 'не подходит под выбранные гипотезы';
  }

  function availableHypothesesForFilter(st, pr){
    if(!problemCustomerFilterActive(st)) return [];
    var namesInPool=new Set();
    (pr.catalog||[]).forEach(function(p){
      if(!matchesProblemActivity(p.id,st,pr)) return;
      (p.used_in_hypotheses||[]).forEach(function(n){ namesInPool.add(n); });
    });
    return (pr.hypotheses||[]).filter(function(h){ return namesInPool.has(h.name); });
  }

  function selectedProblemIds(pr){
    var ids=new Set();
    (pr.selections||[]).forEach(function(s){ if(s.problem_id) ids.add(s.problem_id); });
    return ids;
  }

  function renderProblemRow(problem, opts, st, pr, selectedIds){
    var indent=opts.indent||0;
    var isGroupParent=opts.variant==='parent'&&(opts.groupChildren||[]).length>0;
    var groupMembers=isGroupParent?[problem].concat(opts.groupChildren||[]):[problem];
    var isYes=isGroupParent?aggregateProblemGroupSelected(groupMembers,selectedIds):selectedIds.has(problem.id);
    var mismatchHint=getProblemFilterMismatchHint(problem.id,st,pr);
    var unmatched=mismatchHint!=null;
    var titleClass=opts.variant==='parent'?'font-weight:600':'font-weight:500';
    var meta=[problem.segment_name,problem.maturity_name].filter(Boolean).join(' · ');
    var code=problem.catalog_code?'<span style="color:#94a3b8;font-family:monospace;font-size:10px;margin-right:4px">'+esc(problem.catalog_code)+'</span>':'';
    return '<tr class="'+(opts.variant==='parent'?'problem-group':'')+'">'+
      '<td style="padding-left:'+(8+indent)+'px">'+
      (opts.variant==='parent'&&opts.groupParentId!=null?
        '<button type="button" class="fs-grp-toggle" data-problem-grp-toggle="'+opts.groupParentId+'">'+(opts.groupOpen?'▼':'▶')+'</button> ':'')+
      '<div style="'+titleClass+(unmatched?';font-style:italic;color:#64748b':'')+'">'+code+esc(problem.name)+'</div>'+
      (unmatched?'<div class="problem-hint">'+esc(mismatchHint)+'</div>':'')+
      (meta?'<div class="problem-meta">'+esc(meta)+'</div>':'')+
      '</td>'+
      '<td style="text-align:center;width:4rem">'+
      (isGroupParent?
        '<button type="button" class="yesno '+(isYes?'yes':'no')+(unmatched&&!isYes?' unmatched':'')+'" data-problem-group="'+groupMembers.map(function(m){return m.id;}).join(',')+'" data-val="'+(isYes?1:0)+'">'+(isYes?'Да':'Нет')+'</button>':
        yesNoBtn(isYes,unmatched&&!isYes).replace('<button','<button data-problem-id="'+problem.id+'"'))+
      '</td></tr>';
  }

  function renderProblemsTable(){
    var pr=data.problems; if(!pr||!pr.catalog||!data.customer) return '';
    var st=problemFilterState(pr);
    var selectedIds=selectedProblemIds(pr);
    var filterActive=problemCustomerFilterActive(st);
    var anyFilter=filterActive||st.hypothesisFilterIds.length>0;
    var matchingIds=new Set();
    (pr.catalog||[]).forEach(function(p){
      if(matchesProblemActivity(p.id,st,pr)&&matchesProblemHypothesis(p,st)) matchingIds.add(p.id);
    });
    var visibleIds;
    if(!anyFilter||st.showAllProblems){
      visibleIds=new Set((pr.catalog||[]).map(function(p){return p.id;}));
    } else {
      visibleIds=collectProblemWithAncestors(pr.catalog,matchingIds);
      selectedIds.forEach(function(id){ visibleIds.add(id); });
      visibleIds=collectProblemWithAncestors(pr.catalog,visibleIds);
    }
    var visible=(pr.catalog||[]).filter(function(p){ return visibleIds.has(p.id); });
    var units=buildProblemDisplayUnits(visible);
    var collapsedGroups=new Set((data.ui_state&&data.ui_state.problem_groups)||[]);
    var rows='';
    units.forEach(function(unit){
      if(unit.kind==='group'){
        var parent=unit.parent;
        var children=unit.children;
        var groupOpen=!collapsedGroups.has(parent.id);
        rows+=renderProblemRow(parent,{variant:'parent',groupParentId:parent.id,groupChildren:children,groupOpen:groupOpen,indent:0},st,pr,selectedIds);
        if(groupOpen){
          children.forEach(function(child){
            rows+=renderProblemRow(child,{variant:'child',indent:20},st,pr,selectedIds);
          });
        }
      } else {
        rows+=renderProblemRow(unit.item,{variant:'standalone',indent:0},st,pr,selectedIds);
      }
    });
    if(!rows) return '';
    return '<table class="tbl problem-tbl"><thead><tr><th>Проблематика</th><th style="width:4rem;text-align:center">Да/Нет</th></tr></thead><tbody>'+rows+'</tbody></table>';
  }

  function renderProblemsLegacy(){
    var pr=data.problems; if(!pr||!pr.catalog||data.customer) return '';
    var st=problemFilterState(pr);
    var selectedIds=selectedProblemIds(pr);
    var filterActive=problemCustomerFilterActive(st);
    var anyFilter=filterActive||st.hypothesisFilterIds.length>0;
    var matchingIds=new Set();
    (pr.catalog||[]).forEach(function(p){
      if(matchesProblemActivity(p.id,st,pr)&&matchesProblemHypothesis(p,st)) matchingIds.add(p.id);
    });
    var visibleIds;
    if(!anyFilter||st.showAllProblems){
      visibleIds=new Set((pr.catalog||[]).map(function(p){return p.id;}));
    } else {
      visibleIds=collectProblemWithAncestors(pr.catalog,matchingIds);
      selectedIds.forEach(function(id){ visibleIds.add(id); });
      visibleIds=collectProblemWithAncestors(pr.catalog,visibleIds);
    }
    var visible=(pr.catalog||[]).filter(function(p){ return visibleIds.has(p.id); });
    var units=buildProblemDisplayUnits(visible);
    var collapsedGroups=new Set((data.ui_state&&data.ui_state.problem_groups)||[]);
    var filterBar='';
    if(!data.customer||!data.customer.activity_types){
      var actTypes=pr.activity_types||[];
      if(actTypes.length){
        var selAct=new Set(st.activityTypeIds);
        var chips=actTypes.map(function(at){
          return '<button type="button" class="problem-chip'+(selAct.has(at.id)?' selected':'')+'" data-problem-activity-type="'+at.id+'">'+esc(at.name)+'</button>';
        }).join('');
        filterBar+='<div class="problem-filter-bar"><span class="filter-label">Виды деятельности</span><div class="problem-filter-chips">'+chips+'</div></div>';
      }
    }
    if(filterActive){
      var avail=availableHypothesesForFilter(st,pr);
      var hypSel=new Set(st.hypothesisFilterIds);
      var hypChips=avail.length?avail.map(function(h){
        return '<button type="button" class="problem-chip'+(hypSel.has(h.id)?' selected':'')+'" data-problem-hypothesis="'+h.id+'">'+esc(h.name)+'</button>';
      }).join(''):'<span style="font-size:11px;color:#94a3b8">нет по текущему фильтру</span>';
      filterBar+='<div class="problem-filter-bar"><span class="filter-label">Гипотезы</span><div class="problem-filter-chips">'+hypChips+'</div>'+
        (anyFilter?'<button type="button" class="problem-filter-btn" data-problem-show-all>'+(st.showAllProblems?'Только по фильтру':'Показать все')+'</button>':'')+
        '</div>';
    }
    var rows='';
    units.forEach(function(unit){
      if(unit.kind==='group'){
        var parent=unit.parent;
        var children=unit.children;
        var groupOpen=!collapsedGroups.has(parent.id);
        rows+=renderProblemRow(parent,{variant:'parent',groupParentId:parent.id,groupChildren:children,groupOpen:groupOpen,indent:0},st,pr,selectedIds);
        if(groupOpen){
          children.forEach(function(child){
            rows+=renderProblemRow(child,{variant:'child',indent:20},st,pr,selectedIds);
          });
        }
      } else {
        rows+=renderProblemRow(unit.item,{variant:'standalone',indent:0},st,pr,selectedIds);
      }
    });
    return sectionWrap('problems', 'Проблематики',
      filterBar+
      '<table class="tbl problem-tbl"><thead><tr><th>Проблематика</th><th style="width:4rem;text-align:center">Да/Нет</th></tr></thead><tbody>'+rows+'</tbody></table>'
    );
  }

  function renderSolutions(){
    var sol=data.solutions; if(!sol) return '';
    var sel=new Set(sol.selected_ids||[]);
    var items=(sol.catalog||[]).map(function(s){
      return '<label><input type="checkbox" data-solution="'+s.id+'"'+(sel.has(s.id)?' checked':'')+'> '+esc(s.name)+'</label>';
    }).join('');
    return sectionWrap('solutions', 'Решения', '<div class="chk-list">'+items+'</div>');
  }

  function buildWidgetDisplayGroups(catalog){
    var groups=[];
    var map={};
    (catalog||[]).forEach(function(wd){
      var key=wd.data_slice_id!=null?String(wd.data_slice_id):'none';
      var label=(wd.data_slice_name&&String(wd.data_slice_name).trim())||'Без разреза';
      if(!map[key]){ map[key]={key:key,label:label,items:[]}; groups.push(map[key]); }
      map[key].items.push(wd);
    });
    groups.sort(function(a,b){
      if(a.key==='none') return 1;
      if(b.key==='none') return -1;
      return a.label.localeCompare(b.label,'ru');
    });
    groups.forEach(function(g){
      g.items.sort(function(a,b){ return a.name.localeCompare(b.name,'ru'); });
    });
    return groups;
  }

  function renderWidgets(){
    var w=data.widgets; if(!w) return '';
    var sel=new Set((w.selections||[]).map(function(s){return s.widget_id+':'+s.solution_id;}));
    var groups=buildWidgetDisplayGroups(w.catalog||[]);
    var groupKeys=groups.map(function(g){return g.key;});
    var allCollapsed=groupKeys.length>1&&groupKeys.every(function(key){return !uiOpen('widget_groups',key,true);});
    var toolbar=groupKeys.length>1?'<div class="widget-toolbar"><button type="button" data-widget-collapse-all>'+(allCollapsed?'Развернуть все группы':'Свернуть все группы')+'</button></div>':'';
    var body='';
    groups.forEach(function(group){
      var open=uiOpen('widget_groups',group.key,true);
      body+='<div class="widget-group'+(open?' open':'')+'" data-widget-group="'+esc(group.key)+'">'+
        '<div class="widget-group-hd" data-widget-group-toggle="'+esc(group.key)+'">'+
        '<span class="arrow">'+(open?'▼':'▶')+'</span><span>'+esc(group.label)+' <span style="font-weight:400;color:#94a3b8">('+group.items.length+')</span></span></div>';
      if(open){
        body+='<div class="widget-grid">';
        group.items.forEach(function(wd){
          var k=wd.id+':'+wd.solution_id;
          var img=wd.image_base64?'<img src="'+wd.image_base64+'" alt="">':'';
          body+='<label class="widget-card"><input type="checkbox" data-widget="'+k+'"'+(sel.has(k)?' checked':'')+'>'+img+
            '<div style="font-size:11px;margin-top:4px">'+esc(wd.solution_name)+'</div><div>'+esc(wd.name)+'</div></label>';
        });
        body+='</div>';
      }
      body+='</div>';
    });
    return sectionWrap('widgets', 'Виджеты', toolbar+body);
  }

  function renderOrgVolumeSection(){
    var ctx=orgVolumeContext();
    if(!ctx) return '';
    return sectionWrap('assessment_org_volume','Орг. объём',renderOrgVolumeBlock(ctx));
  }

  function renderOrgVolumeLegacy(){
    if(data.assessment_org_volume&&data.assessment_org_volume.org_volume) return '';
    if(data.customer && data.customer.org_volume) return '';
    var ov=data.assessment_org_volume;
    if(!ov||!ov.org_volume||!ov.org_volume.queues) return '';
    var fakeCustomer={org_volume:ov.org_volume,queue_keys:['1','2','3','4'],queue_labels:{}};
    return sectionWrap('assessment_org_volume','Орг. объём',renderOrgVolumeBlock(fakeCustomer));
  }

  function renderHeadcountLegacy(){
    var h=data.assessment_headcount;
    if(!h) return '';
    if(data.customer && data.customer.headcount_category) return '';
    var opts=h.headcount_categories.map(function(cat){
      return '<option'+(h.headcount_category===cat?' selected':'')+'>'+esc(cat)+'</option>';
    }).join('');
    return sectionWrap('assessment_headcount', 'Численность',
      '<label class="field"><span>Категория численности</span><select data-headcount>'+opts+'</select></label>'
    );
  }

  function saveSectionsFromDom(){
    data.ui_state=data.ui_state||{};
    data.ui_state.sections={};
    document.querySelectorAll('.sec[data-sec]').forEach(function(sec){
      var key=sec.getAttribute('data-sec');
      if(key) data.ui_state.sections[key]=sec.classList.contains('open');
    });
  }

  function render(){
    saveSectionsFromDom();
    var app=document.getElementById('app');
    var exported=new Date(data.exported_at).toLocaleString('ru-RU');
    app.innerHTML='<div class="hdr"><h1>'+esc(data.briefing_name)+'</h1>'+
      '<div class="meta">Предоценка для заполнения · экспорт '+exported+'</div>'+
      '<div class="instr">Заполните разделы по порядку: заказчик, решения, виджеты, ФС, орг. объём, параметры оценки. Нажмите «Скачать заполненный файл» внизу и передайте исполнителю.</div></div>'+
      renderCustomer()+renderSolutions()+renderWidgets()+renderFs()+renderOrgVolumeSection()+renderCriteria()+renderContract()+renderHeadcountLegacy()+renderOrgVolumeLegacy()+renderProblemsLegacy();
    bindEvents();
  }

  function syncOrgActiveFromFs(){
    var ov=getOrgVolume();
    if(!ov||!data.fs) return;
    var keys=data.customer&&data.customer.queue_keys||data.fs.queue_keys||['1','2','3','4'];
    keys.forEach(function(q){
      var row=ov.queues[q];
      if(!row) return;
      row.active=data.fs.items.some(function(it){ return it.queues_json&&it.queues_json[q]===1; });
    });
  }

  function syncOrgVolumeFromDom(orgVolume, queueKeys){
    if(!orgVolume) return;
    (queueKeys||FS_QUEUE_KEYS).forEach(function(q){
      var row=ensureOrgQueue(orgVolume,String(q));
      ['users','rp_rpo','executors','rg'].forEach(function(field){
        var inp=document.querySelector('[data-org-q="'+q+'"][data-org-field="'+field+'"]:not([data-org-region])');
        if(!inp) return;
        applyOrgQueueFieldPatch(row,field,inp.value);
      });
      (row.breakdown||[]).forEach(function(region){
        syncOrgBreakdownNode(q, region, null);
        (region.branches||[]).forEach(function(branch){
          syncOrgBreakdownNode(q, region, branch);
        });
      });
    });
  }

  function syncOrgBreakdownNode(q, region, branch){
    var r=branch||region;
    var regionId=region.id;
    var branchId=branch?branch.id:null;
    var fields=['label','users','rp_rpo','executors','rg'];
    fields.forEach(function(field){
      var sel='[data-org-q="'+q+'"][data-org-region="'+regionId+'"][data-org-field="'+field+'"]';
      if(branchId) sel+='[data-org-branch="'+branchId+'"]';
      else sel+=':not([data-org-branch])';
      var inp=document.querySelector(sel);
      if(!inp) return;
      applyBreakdownPatch(r, field, field==='label'?inp.value:inp.value);
    });
  }

  function commitBreakdownField(q, regionId, branchId, field){
    var ov=getOrgVolume();
    if(!ov) return;
    var row=ensureOrgQueue(ov,String(q));
    var region=(row.breakdown||[]).find(function(r){return r.id===regionId;});
    if(!region) return;
    var node=branchId?(region.branches||[]).find(function(b){return b.id===branchId;}):region;
    if(!node) return;
    var sel='[data-org-q="'+q+'"][data-org-region="'+regionId+'"][data-org-field="'+field+'"]';
    if(branchId) sel+='[data-org-branch="'+branchId+'"]';
    else sel+=':not([data-org-branch])';
    var inp=document.querySelector(sel);
    if(!inp) return;
    applyBreakdownPatch(node, field, inp.value);
    cascadeBreakdownValues(ov, q, regionId, branchId||null, field);
  }

  function syncAssessmentCriteriaFromDom(){
    if(!data.assessment_criteria) return;
    if(!data.assessment_criteria.groups) data.assessment_criteria.groups={};
    document.querySelectorAll('[data-crit-group]').forEach(function(cell){
      var key=cell.getAttribute('data-crit-group');
      var btn=cell.querySelector('button');
      if(!key||!btn) return;
      if(!data.assessment_criteria.groups[key]) data.assessment_criteria.groups[key]={children:{},custom_rows:[]};
      data.assessment_criteria.groups[key].group_rp_override=btn.getAttribute('data-val')==='1';
    });
    document.querySelectorAll('[data-crit-child]').forEach(function(cell){
      var parts=(cell.getAttribute('data-crit-child')||'').split('.');
      var btn=cell.querySelector('button');
      if(parts.length<2||!btn) return;
      var g=data.assessment_criteria.groups[parts[0]];
      if(!g) return;
      if(!g.children) g.children={};
      if(!g.children[parts[1]]) g.children[parts[1]]={rp_value:false,op_value:false};
      g.children[parts[1]].rp_value=btn.getAttribute('data-val')==='1';
    });
    document.querySelectorAll('[data-crit-custom-val]').forEach(function(cell){
      var parts=(cell.getAttribute('data-crit-custom-val')||'').split('.');
      var btn=cell.querySelector('button');
      if(parts.length<2||!btn) return;
      var g=data.assessment_criteria.groups[parts[0]];
      if(!g||!g.custom_rows) return;
      var row=g.custom_rows.find(function(r){return r.id===parts[1];});
      if(row) row.rp_value=btn.getAttribute('data-val')==='1';
    });
    document.querySelectorAll('[data-crit-custom]').forEach(function(inp){
      var parts=(inp.getAttribute('data-crit-custom')||'').split('.');
      if(parts.length<2) return;
      var g=data.assessment_criteria.groups[parts[0]];
      if(!g||!g.custom_rows) return;
      var row=g.custom_rows.find(function(r){return r.id===parts[1];});
      if(row) row.label=inp.value;
    });
  }

  function syncAssessmentContractFromDom(){
    if(!data.assessment_contract) return;
    var p=data.assessment_contract.contract_params;
    var pv=document.querySelector('[data-contract-param=pm_version]'); if(pv) p.pm_version=pv.value;
    var pa=document.querySelector('[data-contract-param=advance_pct]'); if(pa) p.advance_pct=Number(pa.value)/100;
    var pd=document.querySelector('[data-contract-param=payment_deferral_days]'); if(pd) p.payment_deferral_days=Number(pd.value);
    var pm=document.querySelector('[data-contract-param=max_stage_duration_days]');
    if(pm) p.max_stage_duration_days=pm.value===''?null:Number(pm.value);
    document.querySelectorAll('[data-contract]').forEach(function(cell){
      var key=cell.getAttribute('data-contract');
      var btn=cell.querySelector('button');
      if(key&&btn) data.assessment_contract.criteria[key]=btn.getAttribute('data-val')==='1';
    });
    data.assessment_contract.advance_deferral_ok=computeAdvanceDeferralOk(p);
  }

  function syncFromDom(){
    if(data.customer){
      var c=data.customer;
      var n=document.querySelector('[data-c=name]'); if(n) c.name=n.value;
      var seg=document.querySelector('[data-c=segment_id]'); if(seg) c.segment_id=seg.value?Number(seg.value):null;
      var sc=document.querySelector('[data-c=scenario]'); if(sc) c.scenario=sc.value||null;
      var hc=document.querySelector('[data-c=headcount_category]'); if(hc) c.headcount_category=hc.value;
    }
    var orgCtx=orgVolumeContext();
    if(orgCtx){
      if(!data.assessment_org_volume) data.assessment_org_volume={};
      data.assessment_org_volume.org_volume=orgCtx.org_volume;
      syncOrgVolumeFromDom(orgCtx.org_volume, orgCtx.queue_keys);
    }
    syncFsFromDom();
    if(data.fs) syncOrgActiveFromFs();
    syncAssessmentCriteriaFromDom();
    syncAssessmentContractFromDom();
    if(data.problems){
      var pr=data.problems;
      if(data.customer&&data.customer.activity_type_ids) pr.activity_type_ids=data.customer.activity_type_ids.slice();
      if(data.customer) pr.segment_id=data.customer.segment_id;
      var customSelections=(pr.selections||[]).filter(function(s){return s.custom_text;});
      var selections=customSelections.slice();
      document.querySelectorAll('[data-problem-id]').forEach(function(btn){
        if(btn.getAttribute('data-val')==='1'){
          selections.push({problem_id:Number(btn.getAttribute('data-problem-id')),custom_text:null});
        }
      });
      document.querySelectorAll('[data-problem-group]').forEach(function(btn){
        if(btn.getAttribute('data-val')!=='1') return;
        String(btn.getAttribute('data-problem-group')||'').split(',').forEach(function(id){
          if(!id) return;
          selections.push({problem_id:Number(id),custom_text:null});
        });
      });
      var seen=new Set();
      pr.selections=selections.filter(function(s){
        var key=s.problem_id||s.custom_text;
        if(seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    }
    if(data.solutions){
      data.solutions.selected_ids=[];
      document.querySelectorAll('[data-solution]:checked').forEach(function(el){
        data.solutions.selected_ids.push(Number(el.getAttribute('data-solution')));
      });
    }
    if(data.widgets){
      data.widgets.selections=[];
      document.querySelectorAll('[data-widget]:checked').forEach(function(el){
        var parts=el.getAttribute('data-widget').split(':');
        data.widgets.selections.push({widget_id:Number(parts[0]),solution_id:Number(parts[1])});
      });
    }
    if(data.assessment_headcount){
      var hs=document.querySelector('[data-headcount]');
      if(hs) data.assessment_headcount.headcount_category=hs.value;
    }
  }

  function bindEvents(){
    document.querySelectorAll('.sec-h').forEach(function(h){
      h.addEventListener('click',function(){
        var sec=h.parentElement;
        sec.classList.toggle('open');
        h.querySelector('.arrow').textContent=sec.classList.contains('open')?'▼':'▶';
      });
    });
    bindFsEvents();
    document.querySelectorAll('[data-org-queue-toggle]').forEach(function(btn){
      btn.addEventListener('click',function(){
        syncFromDom();
        var q=btn.getAttribute('data-org-queue-toggle');
        data.ui_state=data.ui_state||{};
        data.ui_state.org_queues=data.ui_state.org_queues||{};
        var ov=getOrgVolume();
        var row=ov&&ensureOrgQueue(ov,String(q));
        var def=row&&(row.breakdown||[]).length>0;
        data.ui_state.org_queues[String(q)]=!uiOpen('org_queues',String(q),!!def);
        render();
      });
    });
    document.querySelectorAll('[data-org-add-region]').forEach(function(btn){
      btn.addEventListener('click',function(e){
        e.preventDefault(); e.stopPropagation();
        var q=btn.getAttribute('data-org-add-region');
        var ov=getOrgVolume();
        if(!ov) return;
        syncFromDom();
        var row=ensureOrgQueue(ov,String(q));
        var newRegion=defaultBreakdownRow('Регион');
        row.breakdown.push(newRegion);
        cascadeRegionAdded(ov,q,newRegion.id);
        data.ui_state=data.ui_state||{};
        data.ui_state.org_queues=data.ui_state.org_queues||{};
        data.ui_state.org_queues[String(q)]=true;
        render();
      });
    });
    document.querySelectorAll('[data-org-add-branch]').forEach(function(btn){
      btn.addEventListener('click',function(e){
        e.preventDefault(); e.stopPropagation();
        var parts=(btn.getAttribute('data-org-add-branch')||'').split(':');
        var q=parts[0], regionId=parts[1];
        var ov=getOrgVolume();
        if(!ov) return;
        syncFromDom();
        var row=ensureOrgQueue(ov,String(q));
        var region=(row.breakdown||[]).find(function(r){return r.id===regionId;});
        if(!region) return;
        if(!region.branches) region.branches=[];
        var branch=defaultBreakdownRow('Филиал');
        region.branches.push(branch);
        cascadeBranchAdded(ov,q,regionId,branch.id);
        data.ui_state=data.ui_state||{};
        data.ui_state.org_queues=data.ui_state.org_queues||{};
        data.ui_state.org_queues[String(q)]=true;
        render();
      });
    });
    document.querySelectorAll('[data-org-region][data-org-field]').forEach(function(inp){
      inp.addEventListener('blur',function(){
        var q=inp.getAttribute('data-org-q');
        var regionId=inp.getAttribute('data-org-region');
        var branchId=inp.getAttribute('data-org-branch');
        var field=inp.getAttribute('data-org-field');
        if(!q||!regionId||!field) return;
        syncFromDom();
        commitBreakdownField(q, regionId, branchId||null, field);
        render();
      });
    });
    document.querySelectorAll('[data-org-q][data-org-field]:not([data-org-region])').forEach(function(inp){
      inp.addEventListener('blur',function(){
        var q=inp.getAttribute('data-org-q');
        var field=inp.getAttribute('data-org-field');
        if(!q||!field) return;
        if(field!=='users'&&field!=='rp_rpo'&&field!=='executors'&&field!=='rg') return;
        syncFromDom();
        commitOrgQueueField(q,field);
        render();
      });
    });
    function toggleYesNo(btn, setter){
      btn.addEventListener('click',function(){
        var on=btn.getAttribute('data-val')!=='1';
        setter(on);
        btn.className='yesno '+(on?'yes':'no');
        btn.textContent=on?'Да':'Нет';
        btn.setAttribute('data-val',on?1:0);
      });
    }
    document.querySelectorAll('[data-crit-child]').forEach(function(cell){
      var parts=cell.getAttribute('data-crit-child').split('.');
      toggleYesNo(cell.querySelector('button'),function(on){
        var g=data.assessment_criteria.groups[parts[0]];
        if(!g.children[parts[1]]) g.children[parts[1]]={rp_value:false,op_value:false};
        g.children[parts[1]].rp_value=on;
        g.group_rp_override=null;
      });
    });
    document.querySelectorAll('[data-crit-group]').forEach(function(cell){
      var key=cell.getAttribute('data-crit-group');
      toggleYesNo(cell.querySelector('button'),function(on){
        data.assessment_criteria.groups[key].group_rp_override=on;
      });
    });
    document.querySelectorAll('[data-crit-custom-val]').forEach(function(cell){
      var parts=cell.getAttribute('data-crit-custom-val').split('.');
      toggleYesNo(cell.querySelector('button'),function(on){
        var g=data.assessment_criteria.groups[parts[0]];
        var row=g.custom_rows.find(function(r){return r.id===parts[1];});
        if(row) row.rp_value=on;
      });
    });
    document.querySelectorAll('[data-contract]').forEach(function(cell){
      var key=cell.getAttribute('data-contract');
      toggleYesNo(cell.querySelector('button'),function(on){
        data.assessment_contract.criteria[key]=on;
      });
    });
    document.querySelectorAll('[data-contract-param=advance_pct],[data-contract-param=payment_deferral_days]').forEach(function(inp){
      inp.addEventListener('input', updateAdvanceDeferralFormulaCell);
    });
    document.querySelectorAll('[data-crit-custom]').forEach(function(inp){
      inp.addEventListener('input',function(){
        var parts=inp.getAttribute('data-crit-custom').split('.');
        var g=data.assessment_criteria.groups[parts[0]];
        var row=g.custom_rows.find(function(r){return r.id===parts[1];});
        if(row) row.label=inp.value;
      });
    });
    var segSel=document.querySelector('[data-c=segment_id]');
    if(segSel) segSel.addEventListener('change',function(){
      if(!data.customer) return;
      data.customer.segment_id=segSel.value?Number(segSel.value):null;
      if(data.problems) data.problems.segment_id=data.customer.segment_id;
      if(data.problems) data.problems.hypothesis_filter_ids=[];
      syncUiState();
      render();
    });
    document.querySelectorAll('[data-activity-type]').forEach(function(btn){
      btn.addEventListener('click',function(){
        if(!data.customer) return;
        var id=Number(btn.getAttribute('data-activity-type'));
        var ids=new Set(data.customer.activity_type_ids||[]);
        if(ids.has(id)) ids.delete(id); else ids.add(id);
        data.customer.activity_type_ids=[...ids];
        ensureValidCustomerSegment();
        if(data.problems){
          data.problems.activity_type_ids=data.customer.activity_type_ids.slice();
          data.problems.segment_id=data.customer.segment_id;
          data.problems.hypothesis_filter_ids=[];
        }
        syncUiState();
        render();
      });
    });
    document.querySelectorAll('[data-problem-activity-type]').forEach(function(btn){
      btn.addEventListener('click',function(){
        if(!data.problems) return;
        var id=Number(btn.getAttribute('data-problem-activity-type'));
        var ids=new Set(data.problems.activity_type_ids||[]);
        if(ids.has(id)) ids.delete(id); else ids.add(id);
        data.problems.activity_type_ids=[...ids];
        syncUiState();
        render();
      });
    });
    document.querySelectorAll('[data-problem-hypothesis]').forEach(function(btn){
      btn.addEventListener('click',function(){
        if(!data.problems) return;
        var id=Number(btn.getAttribute('data-problem-hypothesis'));
        var ids=new Set(data.problems.hypothesis_filter_ids||[]);
        if(ids.has(id)) ids.delete(id); else ids.add(id);
        data.problems.hypothesis_filter_ids=[...ids];
        syncUiState();
        render();
      });
    });
    var showAllBtn=document.querySelector('[data-problem-show-all]');
    if(showAllBtn) showAllBtn.addEventListener('click',function(){
      if(!data.problems) return;
      data.problems.show_all_problems=!data.problems.show_all_problems;
      syncUiState();
      render();
    });
    document.querySelectorAll('[data-problem-grp-toggle]').forEach(function(btn){
      btn.addEventListener('click',function(e){
        e.stopPropagation();
        var id=Number(btn.getAttribute('data-problem-grp-toggle'));
        data.ui_state=data.ui_state||{};
        data.ui_state.problem_groups=data.ui_state.problem_groups||[];
        var set=new Set(data.ui_state.problem_groups);
        if(set.has(id)) set.delete(id); else set.add(id);
        data.ui_state.problem_groups=[...set];
        syncUiState();
        render();
      });
    });
    function toggleProblemSelection(problemIds, turnOn){
      if(!data.problems) return;
      var ids=new Set(problemIds);
      var kept=(data.problems.selections||[]).filter(function(s){
        if(s.custom_text) return true;
        return !ids.has(s.problem_id);
      });
      if(turnOn){
        ids.forEach(function(id){ kept.push({problem_id:id,custom_text:null}); });
      }
      data.problems.selections=kept;
    }
    document.querySelectorAll('[data-problem-id]').forEach(function(btn){
      btn.addEventListener('click',function(){
        var id=Number(btn.getAttribute('data-problem-id'));
        var turnOn=btn.getAttribute('data-val')!=='1';
        toggleProblemSelection([id], turnOn);
        syncUiState();
        render();
      });
    });
    document.querySelectorAll('[data-problem-group]').forEach(function(btn){
      btn.addEventListener('click',function(){
        var ids=String(btn.getAttribute('data-problem-group')||'').split(',').map(Number).filter(Boolean);
        var turnOn=btn.getAttribute('data-val')!=='1';
        toggleProblemSelection(ids, turnOn);
        syncUiState();
        render();
      });
    });
    document.querySelectorAll('[data-widget-group-toggle]').forEach(function(btn){
      btn.addEventListener('click',function(){
        var key=btn.getAttribute('data-widget-group-toggle');
        if(!key) return;
        data.ui_state=data.ui_state||{};
        data.ui_state.widget_groups=data.ui_state.widget_groups||{};
        data.ui_state.widget_groups[key]=!uiOpen('widget_groups',key,true);
        syncUiState();
        render();
      });
    });
    var widgetCollapseBtn=document.querySelector('[data-widget-collapse-all]');
    if(widgetCollapseBtn) widgetCollapseBtn.addEventListener('click',function(){
      if(!data.widgets) return;
      var groups=buildWidgetDisplayGroups(data.widgets.catalog||[]);
      var keys=groups.map(function(g){return g.key;});
      var allCollapsed=keys.length>1&&keys.every(function(key){return !uiOpen('widget_groups',key,true);});
      data.ui_state=data.ui_state||{};
      data.ui_state.widget_groups={};
      if(allCollapsed){
        keys.forEach(function(key){ data.ui_state.widget_groups[key]=true; });
      }
      syncUiState();
      render();
    });
  }

  document.getElementById('download-btn').addEventListener('click',function(){
    syncFromDom();
    syncUiState();
    data.customer_saved_at = new Date().toISOString();
    dataEl.textContent=JSON.stringify(data);
    var html='<!DOCTYPE html>\\n'+document.documentElement.outerHTML;
    var blob=new Blob([html],{type:'text/html;charset=utf-8'});
    var a=document.createElement('a');
    a.href=URL.createObjectURL(blob);
    a.download=(data.briefing_name||'briefing').replace(/[\\\\/:*?"<>|]/g,'_')+'-customer.html';
    a.click();
    URL.revokeObjectURL(a.href);
  });

  render();
})();
`;
