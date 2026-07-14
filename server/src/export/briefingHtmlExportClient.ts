import { getFsClientJs } from './briefingHtmlFsClient';

/** Browser-side script embedded in exported briefing HTML (plain JS string). */
export const BRIEFING_HTML_EXPORT_CLIENT_JS = `
(function(){
  var dataEl = document.getElementById('briefing-export-data');
  var data = JSON.parse(dataEl.textContent);
  var blocks = data.blocks || {};

  (function migrateLegacyPayload(){
    if(data.solutions){
      if(!data.solutions.selections && data.solutions.selected_ids){
        data.solutions.selections=data.solutions.selected_ids.map(function(id){
          return {solution_id:id,queue:'1',queue_comment_json:null};
        });
      }
      if(!data.solutions.selections) data.solutions.selections=[];
    }
  })();

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

  function typeImpactBadge(impact){
    if(impact==='PROF') return '<span class="type-impact prof">ПРОФ</span>';
    if(impact==='KORP') return '<span class="type-impact korp">КОРП</span>';
    return '—';
  }
  function techLabelHtml(tech){
    if(tech==='CASE') return 'Кейс';
    if(tech==='BZ') return 'БЗ';
    if(tech==='PROF_MINI') return 'Проф-мини';
    if(tech==='PROF') return 'ПРОФ';
    if(tech==='KORP') return 'КОРП';
    return '—';
  }
  function stdMatrixDefault(doc,typeCode){
    if(!typeCode) return false;
    if(typeCode==='CASE') return !!doc.std_case;
    if(typeCode==='BZ') return !!doc.std_bz;
    if(typeCode==='PROF_MINI') return !!doc.std_prof_mini;
    if(typeCode==='PROF') return !!doc.std_prof;
    if(typeCode==='KORP') return !!doc.std_korp;
    return false;
  }
  function hasStdMatrix(doc){
    return doc.std_case||doc.std_bz||doc.std_prof_mini||doc.std_prof||doc.std_korp;
  }
  function critYesNoCell(val, dataAttr, opts){
    opts=opts||{};
    var cls=opts.discrepancy?' crit-discrepancy':'';
    if(opts.overridden) cls+=' crit-overridden';
    return '<td style="text-align:center" class="'+cls.trim()+'" '+dataAttr+'>'+yesNoBtn(!!val,false)+'</td>';
  }
  function renderDocRowHtml(doc, row, typeCode, isExtra){
    var rpDef=isExtra?false:stdMatrixDefault(doc,typeCode);
    var rpOver=row.rp_manual&&row.rp_value!==rpDef;
    var opOver=row.op_manual&&row.op_value!==rpDef;
    var disc=row.rp_value!==row.op_value;
    var extraAttr=isExtra?' data-std-extra="1"':'';
    return '<tr><td class="child-row">'+esc(doc.label)+(doc.excel_ref?' <span style="color:#94a3b8;font-size:10px">('+esc(doc.excel_ref)+')</span>':'')+'</td>'+
      critYesNoCell(row.rp_value,'data-std-doc-rp="'+doc.id+'"'+extraAttr,{overridden:rpOver,discrepancy:disc})+
      critYesNoCell(row.op_value,'data-std-doc-op="'+doc.id+'"'+extraAttr,{overridden:opOver,discrepancy:disc})+
      '<td style="text-align:center;text-xs">'+techLabelHtml(doc.tech)+'</td></tr>';
  }

  function renderCustomExtraRowHtml(row){
    return '<tr class="child-row extra-custom-row"><td><input type="text" data-extra-custom-label="'+esc(row.id)+'" value="'+esc(row.label)+'" style="width:100%" placeholder="Название документа"></td>'+
      '<td style="text-align:center;color:#94a3b8">—</td>'+
      critYesNoCell(row.op_value,'data-extra-custom-op="'+row.id+'"',{discrepancy:false})+
      '<td></td></tr>';
  }

  function renderCriteria(){
    var ac=data.assessment_criteria; if(!ac) return '';
    if(!ac.standard_document_state) ac.standard_document_state={};
    if(!ac.extra_custom_documents) ac.extra_custom_documents=[];
    var typeCode=ac.project_type_code||null;
    var rows='';
    var allDocs=(ac.standard_documents||[]).filter(function(d){return d.is_active!==0;});
    var stdDocs=allDocs.filter(hasStdMatrix);
    var extraDocs=allDocs.filter(function(d){return d.can_extra;});
    var customExtra=ac.extra_custom_documents||[];
    if(stdDocs.length){
      rows+='<tr class="crit-section-hdr"><td colspan="4">Стандартный набор документов</td></tr>';
      stdDocs.forEach(function(doc){
        var key=String(doc.id);
        var row=ac.standard_document_state[key]||{rp_value:stdMatrixDefault(doc,typeCode),op_value:stdMatrixDefault(doc,typeCode)};
        rows+=renderDocRowHtml(doc,row,typeCode,false);
      });
    }
    if(extraDocs.length||customExtra.length){
      rows+='<tr class="crit-section-hdr"><td colspan="4">Дополнительные документы (запрос заказчика)</td></tr>';
      extraDocs.forEach(function(doc){
        var key=String(doc.id);
        var row=ac.standard_document_state[key]||{rp_value:false,op_value:false};
        rows+=renderDocRowHtml(doc,row,typeCode,true);
      });
      customExtra.forEach(function(row){ rows+=renderCustomExtraRowHtml(row); });
      rows+='<tr><td colspan="4" class="child-row"><button type="button" data-extra-custom-add class="link-btn">+ Добавить свой документ</button></td></tr>';
    }
    return sectionWrap('assessment_criteria', 'Требования к работам и результатам',
      '<table class="tbl criteria-tbl"><thead><tr><th>Критерий</th><th style="text-align:center;width:96px">РП</th><th style="text-align:center;width:96px">ОП</th><th style="text-align:center;width:112px">Технология</th></tr></thead><tbody>'+rows+'</tbody></table>'
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
    var toggle=opts.variant==='parent'&&opts.groupParentId!=null
      ?'<button type="button" class="fs-grp-toggle" title="'+(opts.groupOpen?'Свернуть группу':'Развернуть группу')+'" data-problem-grp-toggle="'+opts.groupParentId+'">'+(opts.groupOpen?'▼':'▶')+'</button>'
      :'<span class="problem-toggle-spacer" aria-hidden="true"></span>';
    return '<tr class="'+(opts.variant==='parent'?'problem-group':'')+'">'+
      '<td style="padding-left:'+(8+indent)+'px">'+
      '<div class="problem-row-inner">'+toggle+
      '<div class="problem-row-body">'+
      '<div style="'+titleClass+(unmatched?';font-style:italic;color:#64748b':'')+'">'+code+esc(problem.name)+'</div>'+
      (unmatched?'<div class="problem-hint">'+esc(mismatchHint)+'</div>':'')+
      (meta?'<div class="problem-meta">'+esc(meta)+'</div>':'')+
      '</div></div></td>'+
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
            rows+=renderProblemRow(child,{variant:'child',indent:12},st,pr,selectedIds);
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
            rows+=renderProblemRow(child,{variant:'child',indent:12},st,pr,selectedIds);
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

  function widgetCatalogByKey(){
    var map={};
    if(!data.widgets||!data.widgets.catalog) return map;
    data.widgets.catalog.forEach(function(wd){
      map[wd.id+':'+wd.solution_id]=wd;
    });
    return map;
  }

  function selectedProblemIdSet(){
    if(data.solutions && data.solutions.selected_problem_ids){
      return new Set(data.solutions.selected_problem_ids);
    }
    var ids=(data.problems&&data.problems.selections||[])
      .map(function(p){ return p.problem_id; })
      .filter(function(id){ return id!=null; });
    return new Set(ids);
  }

  function widgetCardContext(widgetId){
    var ctx=(data.widget_context_by_id&&data.widget_context_by_id[String(widgetId)])||null;
    if(!ctx) return null;
    var selected=selectedProblemIdSet();
    var hypothesis=(ctx.hypothesis_usages||[]).map(function(usage){
      return {
        hypothesis_id:usage.hypothesis_id,
        hypothesis_name:usage.hypothesis_name,
        problems:(usage.problems||[]).filter(function(p){ return selected.has(p.id); }).map(function(p){
          return {
            id:p.id,
            name:p.name,
            catalog_code:p.catalog_code,
            lcm_code:p.lcm_code,
            sort_order:p.sort_order,
            solutions:p.solutions||[]
          };
        })
      };
    }).filter(function(usage){ return usage.problems.length>0; });
    return {
      widget:ctx,
      hypothesis:hypothesis,
      orphan_solutions:ctx.orphan_solutions||[],
      fs:ctx.fs_items||[]
    };
  }

  function renderWidgetCardHypothesis(hypothesis, orphanSolutions){
    if(!hypothesis.length && !orphanSolutions.length){
      return '<p class="solution-card-empty">Нет выбранных заказчиком проблематик, связанных с этим виджетом</p>';
    }
    var html=hypothesis.map(function(usage){
      var blocks=usage.problems.map(function(problem){
        var problemCode=problem.catalog_code||problem.lcm_code||'';
        var problemHead=problemCode
          ? '<div class="widget-card-hyp-problem"><span class="solution-card-code">'+esc(problemCode)+'</span><span>'+esc(problem.name)+'</span></div>'
          : '<div class="widget-card-hyp-problem"><span>'+esc(problem.name)+'</span></div>';
        var rows=(problem.solutions||[]).map(function(solution){
          return '<tr><td class="solution-card-code">'+
            esc(solution.catalog_code||solution.lcm_code||'—')+'</td><td>'+esc(solution.name)+'</td></tr>';
        }).join('');
        var table=rows
          ? '<table class="widget-card-hyp-solutions"><thead><tr><th>Код</th><th>Решение</th></tr></thead><tbody>'+rows+'</tbody></table>'
          : '';
        return problemHead+table;
      }).join('');
      return '<section class="solution-card-hyp"><div class="solution-card-hyp-hd">'+esc(usage.hypothesis_name)+'</div>'+blocks+'</section>';
    }).join('');
    if(orphanSolutions.length){
      var orphanRows=orphanSolutions.map(function(solution){
        return '<tr><td class="solution-card-code">'+
          esc(solution.catalog_code||solution.lcm_code||'—')+'</td><td>'+esc(solution.name)+'</td></tr>';
      }).join('');
      html+='<section class="solution-card-hyp"><div class="solution-card-hyp-hd">Решения без контекста гипотез</div>'+
        '<table class="widget-card-hyp-solutions"><thead><tr><th>Код</th><th>Решение</th></tr></thead><tbody>'+
        orphanRows+'</tbody></table></section>';
    }
    return html;
  }

  function renderWidgetCardFs(items){
    if(!items.length) return '<p class="solution-card-empty">Нет сопоставленных пунктов ФС</p>';
    var byGroup={};
    items.forEach(function(it){
      var g=it.group_name||'Прочее';
      if(!byGroup[g]) byGroup[g]=[];
      byGroup[g].push(it);
    });
    return Object.keys(byGroup).sort(function(a,b){ return a.localeCompare(b,'ru'); }).map(function(group){
      var rows=byGroup[group].map(function(it){
        return '<div class="solution-card-fs-row"><span class="solution-card-fs-badge yes">Да</span>'+
          '<span class="solution-card-fs-name">'+(it.prefix?'<span class="solution-card-code">'+esc(it.prefix)+'</span> ':'')+
          esc(it.name)+'</span></div>';
      }).join('');
      return '<div class="solution-card-fs-group"><div class="solution-card-fs-grp">'+esc(group)+'</div>'+rows+'</div>';
    }).join('');
  }

  function ensureWidgetModal(){
    var modal=document.getElementById('widget-modal');
    if(modal) return modal;
    modal=document.createElement('div');
    modal.id='widget-modal';
    modal.className='fs-modal-overlay';
    modal.style.display='none';
    modal.innerHTML='<div class="fs-modal widget-card-modal"><div class="fs-modal-hd"><div id="widget-card-title"></div>'+
      '<button type="button" class="widget-modal-close" data-widget-modal-close aria-label="Закрыть">✕</button></div>'+
      '<div class="fs-modal-bd solution-card-bd" id="widget-card-body"></div>'+
      '<div class="fs-modal-ft"><button type="button" data-widget-modal-close>Закрыть</button></div></div>';
    document.body.appendChild(modal);
    modal.querySelectorAll('[data-widget-modal-close]').forEach(function(btn){
      btn.addEventListener('click',closeWidgetModal);
    });
    modal.addEventListener('click',function(e){ if(e.target===modal) closeWidgetModal(); });
    return modal;
  }

  function openWidgetModal(widgetIdOrKey){
    var widgetId=String(widgetIdOrKey);
    if(widgetId.indexOf(':')>=0) widgetId=widgetId.split(':')[0];
    widgetId=Number(widgetId);
    if(!widgetId) return;
    var ctx=widgetCardContext(widgetId);
    if(!ctx) return;
    ensureWidgetModal();
    var wd=ctx.widget;
    var meta=[wd.type||'', wd.data_slice_name||''].filter(Boolean).join(' · ');
    document.getElementById('widget-card-title').innerHTML=
      '<strong>'+esc(wd.name)+'</strong>'+
      (meta?'<div class="widget-card-meta">'+esc(meta)+'</div>':'');
    document.getElementById('widget-card-body').innerHTML=
      '<div class="widget-card-grid">'+
      '<div class="widget-card-cell widget-card-img">'+(wd.image_base64?'<img src="'+wd.image_base64+'" alt="'+esc(wd.name)+'">':'<span class="solution-card-empty">Нет изображения</span>')+'</div>'+
      '<div class="widget-card-cell"><div class="solution-card-section-title">Описание</div>'+
      (wd.description?'<div class="widget-card-desc">'+esc(wd.description)+'</div>':'<p class="solution-card-empty">Описание не указано</p>')+
      '</div>'+
      '<div class="widget-card-cell"><div class="solution-card-section-title">Гипотезы, проблематики и решения</div>'+
      renderWidgetCardHypothesis(ctx.hypothesis, ctx.orphan_solutions)+
      '</div>'+
      '<div class="widget-card-cell"><div class="solution-card-section-title">Пункты ФС ('+ctx.fs.length+')</div>'+
      renderWidgetCardFs(ctx.fs)+'</div></div>';
    document.getElementById('widget-modal').style.display='flex';
  }

  function closeWidgetModal(){
    var modal=document.getElementById('widget-modal');
    if(modal) modal.style.display='none';
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
        '<span class="arrow">'+(open?'▼':'▶')+'</span><span>'+esc(group.label)+' <span style="font-weight:400;color:#94a3b8">('+group.items.length+')</span></span></div>'+
        '<div class="widget-grid">';
        group.items.forEach(function(wd){
          var k=wd.id+':'+wd.solution_id;
          var img=wd.image_base64?'<img src="'+wd.image_base64+'" alt="">':'<div style="height:80px;background:#f8fafc;border-radius:4px"></div>';
          body+='<div class="widget-card">'+
            '<label class="widget-card-check"><input type="checkbox" data-widget="'+k+'"'+(sel.has(k)?' checked':'')+'> Нужен</label>'+
            '<button type="button" class="widget-card-preview" data-widget-view="'+k+'">'+img+
            '<div class="widget-card-name">'+esc(wd.name)+'</div></button></div>';
        });
        body+='</div></div>';
    });
    return sectionWrap('widgets', 'Виджеты', toolbar+body);
  }

  function solutionQueueLabel(q){
    var sol=data.solutions;
    var labels=(sol&&sol.queue_labels)||(data.fs&&data.fs.queue_labels)||{};
    var defs=(data.fs&&data.fs.queue_defaults)||{};
    return labels[q]||defs[q]||q;
  }

  function parseSolutionComments(raw){
    if(!raw) return {};
    if(typeof raw==='object') return raw;
    try{ return JSON.parse(String(raw)); }catch(e){ return {}; }
  }

  function collectSolutionWithAncestors(catalog, matchIds){
    var byId={};
    (catalog||[]).forEach(function(s){ byId[s.id]=s; });
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

  function buildSolutionDisplayUnits(items){
    var units=[];
    var consumed=new Set();
    var byId={};
    (items||[]).forEach(function(s){ byId[s.id]=s; });
    var roots=(items||[]).filter(function(s){ return !s.parent_id||!byId[s.parent_id]; })
      .sort(compareCatalogCode);
    roots.forEach(function(root){
      var children=(items||[]).filter(function(c){ return c.parent_id===root.id; })
        .sort(compareCatalogCode);
      if(children.length>0){
        units.push({kind:'group',parent:root,children:children});
        consumed.add(root.id);
        children.forEach(function(c){ consumed.add(c.id); });
      }
    });
    (items||[]).forEach(function(item){
      if(!consumed.has(item.id)) units.push({kind:'standalone',item:item});
    });
    units.sort(function(a,b){
      var itemA=a.kind==='group'?a.parent:a.item;
      var itemB=b.kind==='group'?b.parent:b.item;
      return compareCatalogCode(itemA,itemB);
    });
    return units;
  }

  function findSolutionSelection(solutionId){
    return (data.solutions&&data.solutions.selections||[]).find(function(s){ return s.solution_id===solutionId; });
  }

  function solutionSelectionQueue(sel){
    var q=String(sel.queue||'1');
    return FS_QUEUE_KEYS.indexOf(q)>=0?q:'1';
  }

  function aggregateSolutionGroupQueues(members){
    var byQueue={};
    FS_QUEUE_KEYS.forEach(function(q){ byQueue[q]=false; });
    var allOn=false;
    members.forEach(function(member){
      var sel=findSolutionSelection(member.id);
      if(!sel) return;
      allOn=true;
      byQueue[solutionSelectionQueue(sel)]=true;
    });
    return {allOn:allOn,byQueue:byQueue};
  }

  function getMatchedSolutionIds(){
    var sol=data.solutions;
    if(!sol) return new Set();
    if(sol.matched_solution_ids&&sol.matched_solution_ids.length)
      return new Set(sol.matched_solution_ids);
    var selected=new Set(sol.selected_problem_ids||[]);
    var matched=new Set();
    (sol.problem_solution_links||[]).forEach(function(link){
      if(selected.has(link.problem_id)) matched.add(link.solution_id);
    });
    return matched;
  }

  function getVisibleSolutionCatalog(){
    var sol=data.solutions;
    if(!sol||!sol.catalog) return [];
    var matched=getMatchedSolutionIds();
    var visibleIds;
    if(sol.show_all_solutions){
      visibleIds=new Set(sol.catalog.map(function(s){ return s.id; }));
    } else {
      var seed=new Set(matched);
      (sol.selections||[]).forEach(function(s){ seed.add(s.solution_id); });
      // Пункт 2-го уровня (4.1.) всегда тянет верхний (4.).
      visibleIds=collectSolutionWithAncestors(sol.catalog, seed);
    }
    return sol.catalog.filter(function(s){ return visibleIds.has(s.id); });
  }

  function isSolutionUnmatched(solutionId){
    var sol=data.solutions;
    return !!(sol&&sol.show_all_solutions&&!getMatchedSolutionIds().has(solutionId));
  }

  function solutionWidgetsFor(solutionId){
    var sol=data.solutions;
    if(!sol||!sol.widgets_by_solution) return [];
    return sol.widgets_by_solution[String(solutionId)]||[];
  }

  function isSolutionWidgetSelected(solutionId, widgetId){
    return (data.widgets&&data.widgets.selections||[]).some(function(s){
      return s.solution_id===solutionId&&s.widget_id===widgetId;
    });
  }

  function toggleSolutionWidget(solutionId, widgetId, checked){
    if(!data.widgets) data.widgets={catalog:[],selections:[]};
    var sel=(data.widgets.selections||[]).slice();
    if(checked){
      if(!sel.some(function(s){ return s.solution_id===solutionId&&s.widget_id===widgetId; }))
        sel.push({solution_id:solutionId,widget_id:widgetId});
    } else {
      sel=sel.filter(function(s){ return !(s.solution_id===solutionId&&s.widget_id===widgetId); });
    }
    data.widgets.selections=sel;
  }

  function toggleSolutionQueue(sol, q, groupCtx){
    if(!data.solutions) return;
    var selections=(data.solutions.selections||[]).slice();
    function upsert(id, next){
      selections=selections.filter(function(s){ return s.solution_id!==id; });
      if(next) selections.push(next);
    }
    var cur=findSolutionSelection(sol.id);
    if(cur&&solutionSelectionQueue(cur)===String(q)){
      upsert(sol.id,null);
      if(groupCtx){
        var anySibling=groupCtx.siblings.some(function(s){
          return s.id!==sol.id&&!!findSolutionSelection(s.id);
        });
        if(!anySibling) upsert(groupCtx.parentId,null);
      }
    } else {
      upsert(sol.id,{
        solution_id:sol.id,
        queue:String(q),
        queue_comment_json:cur?cur.queue_comment_json:null
      });
      if(groupCtx){
        var parent=(data.solutions.catalog||[]).find(function(s){ return s.id===groupCtx.parentId; });
        if(parent){
          var pcur=findSolutionSelection(parent.id);
          upsert(parent.id,{
            solution_id:parent.id,
            queue:String(q),
            queue_comment_json:pcur?pcur.queue_comment_json:null
          });
        }
      }
    }
    data.solutions.selections=selections;
  }

  function patchSolutionComment(solutionId, q, text){
    if(!data.solutions) return;
    var sel=findSolutionSelection(solutionId);
    if(!sel) return;
    var comments=parseSolutionComments(sel.queue_comment_json);
    var trimmed=String(text||'').trim();
    if(trimmed) comments[String(q)]=trimmed;
    else delete comments[String(q)];
    sel.queue_comment_json=Object.keys(comments).length?comments:null;
  }

  function effectiveSolutionComment(sel, q){
    return String(parseSolutionComments(sel.queue_comment_json)[String(q)]||'').trim();
  }

  function makeSolutionSelectionRow(sol, q, prev){
    return {
      solution_id:sol.id,
      queue:String(q),
      queue_comment_json:prev?prev.queue_comment_json:null
    };
  }

  function withSolutionGroupParent(changes, targetSol, toQ){
    if(!targetSol.parent_id||!data.solutions) return changes;
    if(changes.some(function(c){ return c.solution_id===targetSol.parent_id; })) return changes;
    var parent=(data.solutions.catalog||[]).find(function(s){ return s.id===targetSol.parent_id; });
    if(!parent) return changes;
    var pcur=findSolutionSelection(parent.id);
    return changes.concat([{
      solution_id:parent.id,
      next:makeSolutionSelectionRow(parent,toQ,pcur)
    }]);
  }

  function applySolutionCommentChanges(changes){
    if(!data.solutions||!changes.length) return;
    var selections=(data.solutions.selections||[]).slice();
    changes.forEach(function(change){
      selections=selections.filter(function(s){ return s.solution_id!==change.solution_id; });
      if(change.next) selections.push(change.next);
    });
    data.solutions.selections=selections;
  }

  function moveSolutionCommentBetween(sourceSel, targetSol, fromQ, toQ, mode){
    var movedText=effectiveSolutionComment(sourceSel, fromQ);
    if(!movedText) return [];
    var targetSel=findSolutionSelection(targetSol.id);
    var sameItem=sourceSel.solution_id===targetSol.id;
    var existing=targetSel?effectiveSolutionComment(targetSel, toQ):'';
    var targetText=movedText;
    if(existing) targetText=mode==='merge'?existing+'\\n'+movedText:movedText;
    if(sameItem){
      var comments=parseSolutionComments(sourceSel.queue_comment_json);
      if(targetText) comments[String(toQ)]=targetText;
      else delete comments[String(toQ)];
      delete comments[String(fromQ)];
      return [{
        solution_id:sourceSel.solution_id,
        next:{
          solution_id:sourceSel.solution_id,
          queue:String(toQ),
          queue_comment_json:Object.keys(comments).length?comments:null
        }
      }];
    }
    var sourceComments=parseSolutionComments(sourceSel.queue_comment_json);
    delete sourceComments[String(fromQ)];
    var targetComments=targetSel?parseSolutionComments(targetSel.queue_comment_json):{};
    if(targetText) targetComments[String(toQ)]=targetText;
    else delete targetComments[String(toQ)];
    return [
      {
        solution_id:sourceSel.solution_id,
        next:{
          solution_id:sourceSel.solution_id,
          queue:sourceSel.queue,
          queue_comment_json:Object.keys(sourceComments).length?sourceComments:null
        }
      },
      {
        solution_id:targetSol.id,
        next:{
          solution_id:targetSol.id,
          queue:String(toQ),
          queue_comment_json:Object.keys(targetComments).length?targetComments:null
        }
      }
    ];
  }

  var solutionDragPayload=null;

  function isSolutionCommentDragActive(e){
    if(solutionDragPayload&&solutionDragPayload.kind==='comment') return true;
    if(!e||!e.dataTransfer||!e.dataTransfer.types) return false;
    return Array.prototype.indexOf.call(e.dataTransfer.types,'application/x-solution-comment')>=0;
  }

  function parseSolutionCommentPayload(e){
    var payload=solutionDragPayload;
    if(!payload||payload.kind!=='comment'){
      try{
        payload=JSON.parse(e.dataTransfer.getData('application/x-solution-comment'));
      }catch(err){ return null; }
    }
    if(!payload||payload.kind!=='comment') return null;
    return payload;
  }

  function clearSolutionCommentDropTargets(){
    document.querySelectorAll('[data-solution-comment-cell].fs-drop-target').forEach(function(c){
      c.classList.remove('fs-drop-target');
    });
  }

  function endSolutionDrag(){
    solutionDragPayload=null;
    clearSolutionCommentDropTargets();
  }

  function renderSolutionCommentBtn(solutionId, q){
    return '<button type="button" class="fs-comment-btn has-comment" data-solution-comment-drag="'+solutionId+':'+q+'" draggable="true" data-q="'+q+'" title="Перетащите на комментарий другого решения или клик — открыть" aria-label="Есть комментарий">'+
      '<svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor" aria-hidden="true"><path d="M2 3.5A1.5 1.5 0 0 1 3.5 2h9A1.5 1.5 0 0 1 14 3.5v5A1.5 1.5 0 0 1 12.5 10H9l-2.5 2.5V10H3.5A1.5 1.5 0 0 1 2 8.5v-5Z"/></svg></button>';
  }

  function solutionCommentMerge(){
    data.ui_state=data.ui_state||{};
    return data.ui_state.solution_comment_merge||null;
  }

  function ensureSolutionCommentMergeModal(){
    if(document.getElementById('solution-comment-merge-modal')) return;
    var modal=document.createElement('div');
    modal.id='solution-comment-merge-modal';
    modal.className='fs-modal-overlay';
    modal.style.display='none';
    modal.innerHTML='<div class="fs-modal"><div class="fs-modal-hd"><strong>Комментарий у решения-цели</strong></div>'+
      '<div class="fs-modal-bd" style="font-size:12px;color:#475569">У выбранного решения в этой очереди уже есть комментарий. Как перенести?</div>'+
      '<div class="fs-modal-ft"><button type="button" data-solution-comment-merge="merge">Дописать</button>'+
      '<button type="button" class="fs-modal-save" data-solution-comment-merge="replace">Заменить</button>'+
      '<button type="button" data-solution-comment-merge-cancel>Отмена</button></div></div>';
    document.body.appendChild(modal);
    modal.querySelector('[data-solution-comment-merge-cancel]').addEventListener('click',function(){
      data.ui_state=data.ui_state||{};
      data.ui_state.solution_comment_merge=null;
      modal.style.display='none';
    });
    modal.querySelectorAll('[data-solution-comment-merge]').forEach(function(btn){
      btn.addEventListener('click',function(){
        var merge=solutionCommentMerge();
        if(!merge) return;
        var source=findSolutionSelection(merge.sourceId);
        var targetSol=(data.solutions.catalog||[]).find(function(s){ return s.id===merge.targetId; });
        if(!source||!targetSol) return;
        var mode=btn.getAttribute('data-solution-comment-merge');
        var changes=moveSolutionCommentBetween(source, targetSol, merge.fromQueue, merge.toQueue, mode==='merge'?'merge':'replace');
        changes=withSolutionGroupParent(changes, targetSol, merge.toQueue);
        applySolutionCommentChanges(changes);
        data.ui_state=data.ui_state||{};
        data.ui_state.solution_comment_merge=null;
        modal.style.display='none';
        endSolutionDrag();
        render();
      });
    });
  }

  function applySolutionCommentMove(sourceSel, targetSol, fromQ, toQ, mode){
    var changes=moveSolutionCommentBetween(sourceSel, targetSol, fromQ, toQ, mode);
    changes=withSolutionGroupParent(changes, targetSol, toQ);
    applySolutionCommentChanges(changes);
    endSolutionDrag();
    render();
  }

  function handleSolutionCommentDrop(targetSol, toQ, payload){
    if(!payload||payload.kind!=='comment') return;
    if(payload.solutionId===targetSol.id&&payload.fromQueue===toQ) return;
    var source=findSolutionSelection(payload.solutionId);
    if(!source) return;
    var targetSel=findSolutionSelection(targetSol.id);
    var existing=targetSel?effectiveSolutionComment(targetSel, toQ):'';
    if(existing){
      data.ui_state=data.ui_state||{};
      ensureSolutionCommentMergeModal();
      data.ui_state.solution_comment_merge={
        sourceId:payload.solutionId,
        targetId:targetSol.id,
        fromQueue:payload.fromQueue,
        toQueue:toQ
      };
      document.getElementById('solution-comment-merge-modal').style.display='flex';
      endSolutionDrag();
      return;
    }
    applySolutionCommentMove(source, targetSol, payload.fromQueue, toQ, 'replace');
  }

  function ensureSolutionCommentModal(){
    var modal=document.getElementById('solution-comment-modal');
    if(modal) return modal;
    modal=document.createElement('div');
    modal.id='solution-comment-modal';
    modal.className='fs-modal-overlay';
    modal.style.display='none';
    modal.innerHTML='<div class="fs-modal"><div class="fs-modal-hd"><div><strong id="solution-comment-title"></strong><div id="solution-comment-sub" style="font-size:11px;color:#64748b;margin-top:2px"></div></div>'+
      '<button type="button" class="widget-modal-close" data-solution-comment-close>✕</button></div>'+
      '<div class="fs-modal-bd"><textarea id="solution-comment-text" rows="5" style="width:100%"></textarea></div>'+
      '<div class="fs-modal-ft"><button type="button" data-solution-comment-cancel>Отмена</button>'+
      '<button type="button" class="fs-modal-save" data-solution-comment-save>Сохранить</button></div></div>';
    document.body.appendChild(modal);
    modal.querySelector('[data-solution-comment-close]').addEventListener('click',closeSolutionCommentModal);
    modal.querySelector('[data-solution-comment-cancel]').addEventListener('click',closeSolutionCommentModal);
    modal.querySelector('[data-solution-comment-save]').addEventListener('click',function(){
      if(!solutionCommentCtx) return;
      var text=document.getElementById('solution-comment-text').value;
      patchSolutionComment(solutionCommentCtx.solutionId,solutionCommentCtx.queue,text);
      closeSolutionCommentModal();
      render();
    });
    modal.addEventListener('click',function(e){ if(e.target===modal) closeSolutionCommentModal(); });
    return modal;
  }

  var solutionCommentCtx=null;
  function openSolutionCommentModal(solutionId, q){
    var sel=findSolutionSelection(solutionId);
    if(!sel||solutionSelectionQueue(sel)!==String(q)) return;
    var sol=(data.solutions.catalog||[]).find(function(s){ return s.id===solutionId; });
    ensureSolutionCommentModal();
    solutionCommentCtx={solutionId:solutionId,queue:q};
    document.getElementById('solution-comment-title').textContent='Комментарий — '+solutionQueueLabel(q);
    document.getElementById('solution-comment-sub').textContent=sol?sol.name:'';
    document.getElementById('solution-comment-text').value=parseSolutionComments(sel.queue_comment_json)[String(q)]||'';
    document.getElementById('solution-comment-modal').style.display='flex';
  }

  function closeSolutionCommentModal(){
    var modal=document.getElementById('solution-comment-modal');
    if(modal) modal.style.display='none';
    solutionCommentCtx=null;
  }

  function solutionCardContext(solutionId){
    var sol=data.solutions;
    if(!sol) return {hypothesis:[],fs:[],widgets:[]};
    var selected=new Set(sol.selected_problem_ids||[]);
    var usages=(sol.hypothesis_context_by_solution&&sol.hypothesis_context_by_solution[String(solutionId)])||[];
    var hypothesis=usages.map(function(usage){
      return {
        hypothesis_id:usage.hypothesis_id,
        hypothesis_name:usage.hypothesis_name,
        code:usage.code,
        problems:(usage.problems||[]).filter(function(p){ return selected.has(p.id); })
      };
    }).filter(function(usage){ return usage.problems.length>0; });
    return {
      hypothesis:hypothesis,
      fs:(sol.fs_by_solution&&sol.fs_by_solution[String(solutionId)])||[],
      widgets:(sol.widgets_by_solution&&sol.widgets_by_solution[String(solutionId)])||[]
    };
  }

  function renderSolutionCardHypothesis(usages){
    if(!usages.length){
      return '<p class="solution-card-empty">Нет выбранных заказчиком проблематик, связанных с этим решением</p>';
    }
    return usages.map(function(usage){
      var rows=usage.problems.map(function(p){
        return '<tr><td class="solution-card-code">'+
          esc(p.catalog_code||p.lcm_code||'—')+'</td><td>'+esc(p.name)+'</td></tr>';
      }).join('');
      return '<section class="solution-card-hyp"><div class="solution-card-hyp-hd">'+
        esc(usage.hypothesis_name)+
        (usage.code?'<span class="solution-card-hyp-code">№ '+esc(usage.code)+'</span>':'')+
        '</div><table class="solution-card-hyp-tbl"><thead><tr><th>Код</th><th>Проблематика</th></tr></thead><tbody>'+
        rows+'</tbody></table></section>';
    }).join('');
  }

  function renderSolutionCardWidgets(widgets){
    if(!widgets.length) return '<p class="solution-card-empty">Нет сопоставленных виджетов</p>';
    return widgets.map(function(w){
      var img=w.image_base64
        ? '<img src="'+w.image_base64+'" alt="" data-widget-view="'+w.id+'">'
        : '<button type="button" class="fs-widget-thumb-btn" data-widget-view="'+w.id+'">?</button>';
      return '<div class="solution-card-widget">'+img+'<div><div class="solution-card-widget-name">'+
        esc(w.name)+'</div>'+(w.description?'<div class="solution-card-widget-desc">'+esc(w.description)+'</div>':'')+
        '</div></div>';
    }).join('');
  }

  function fsLinkBadgeLabel(type){
    if(type==='required') return 'Да';
    if(type==='optional') return 'Опц.';
    return 'Нет';
  }

  function renderSolutionCardFs(items){
    if(!items.length) return '<p class="solution-card-empty">Нет сопоставленных пунктов ФС</p>';
    var byGroup={};
    items.forEach(function(it){
      var g=it.group_name||'Прочее';
      if(!byGroup[g]) byGroup[g]=[];
      byGroup[g].push(it);
    });
    return Object.keys(byGroup).sort(function(a,b){ return a.localeCompare(b,'ru'); }).map(function(group){
      var rows=byGroup[group].map(function(it){
        return '<div class="solution-card-fs-row"><span class="solution-card-fs-badge '+
          (it.link_type==='required'?'yes':'opt')+'">'+fsLinkBadgeLabel(it.link_type)+'</span>'+
          '<span class="solution-card-fs-name">'+(it.prefix?'<span class="solution-card-code">'+esc(it.prefix)+'</span> ':'')+
          esc(it.name)+'</span></div>';
      }).join('');
      return '<div class="solution-card-fs-group"><div class="solution-card-fs-grp">'+esc(group)+'</div>'+rows+'</div>';
    }).join('');
  }

  function ensureSolutionCardModal(){
    var modal=document.getElementById('solution-card-modal');
    if(modal) return modal;
    modal=document.createElement('div');
    modal.id='solution-card-modal';
    modal.className='fs-modal-overlay';
    modal.style.display='none';
    modal.innerHTML='<div class="fs-modal solution-card-modal"><div class="fs-modal-hd"><div id="solution-card-title"></div>'+
      '<button type="button" class="widget-modal-close" data-solution-card-close>✕</button></div>'+
      '<div class="fs-modal-bd solution-card-bd" id="solution-card-body"></div>'+
      '<div class="fs-modal-ft"><button type="button" data-solution-card-close>Закрыть</button></div></div>';
    document.body.appendChild(modal);
    modal.querySelectorAll('[data-solution-card-close]').forEach(function(btn){
      btn.addEventListener('click',closeSolutionCardModal);
    });
    modal.addEventListener('click',function(e){ if(e.target===modal) closeSolutionCardModal(); });
    return modal;
  }

  function openSolutionCardModal(solutionId){
    var sol=(data.solutions&&data.solutions.catalog||[]).find(function(s){ return s.id===solutionId; });
    if(!sol) return;
    var ctx=solutionCardContext(solutionId);
    ensureSolutionCardModal();
    document.getElementById('solution-card-title').innerHTML=
      (sol.catalog_code?'<span class="solution-code">'+esc(sol.catalog_code)+'</span> ':'')+
      '<strong>'+esc(sol.name)+'</strong>'+
      (sol.description?'<div class="solution-card-desc">'+esc(sol.description)+'</div>':'');
    document.getElementById('solution-card-body').innerHTML=
      '<div class="solution-card-split"><div class="solution-card-col">'+
      '<div class="solution-card-section-title">Гипотезы и проблематики заказчика</div>'+
      renderSolutionCardHypothesis(ctx.hypothesis)+
      '</div><div class="solution-card-col"><div class="solution-card-section-title">Виджеты ('+ctx.widgets.length+')</div>'+
      renderSolutionCardWidgets(ctx.widgets)+
      '<div class="solution-card-section-title solution-card-section-gap">Пункты ФС ('+ctx.fs.length+')</div>'+
      renderSolutionCardFs(ctx.fs)+'</div></div>';
    document.getElementById('solution-card-modal').style.display='flex';
  }

  function closeSolutionCardModal(){
    var modal=document.getElementById('solution-card-modal');
    if(modal) modal.style.display='none';
  }

  function renderSolutionWidgetsCell(sol, isSelected){
    if(!isSelected) return '<span style="color:#cbd5e1">—</span>';
    var widgets=solutionWidgetsFor(sol.id);
    if(!widgets.length) return '<span class="solution-meta">Нет виджетов</span>';
    return widgets.map(function(w){
      var checked=isSolutionWidgetSelected(sol.id,w.id);
      var img=w.image_base64
        ? '<img src="'+w.image_base64+'" alt="" data-widget-view="'+w.id+'">'
        : '<button type="button" class="fs-widget-thumb-btn" data-widget-view="'+w.id+'">?</button>';
      return '<div class="solution-widget-row"><label><input type="checkbox" data-solution-widget="'+sol.id+':'+w.id+'"'+(checked?' checked':'')+'></label>'+
        img+'<span class="solution-widget-name">'+esc(w.name)+'</span></div>';
    }).join('');
  }

  function renderSolutionCommentCell(sol, q, readOnly){
    if(readOnly) return '<td class="fs-comment-cell"></td>';
    var sel=findSolutionSelection(sol.id);
    var canComment=!!sel&&solutionSelectionQueue(sel)===String(q);
    var hasComment=canComment&&!!effectiveSolutionComment(sel, q);
    var attrs='class="fs-comment-cell" data-solution-comment-cell="'+sol.id+':'+q+'" data-q="'+q+'"';
    if(!hasComment){
      return '<td '+attrs+' title="'+(canComment?'Добавить комментарий':'Перетащите комментарий сюда')+'"></td>';
    }
    return '<td '+attrs+'>'+renderSolutionCommentBtn(sol.id,q)+'</td>';
  }

  function renderSolutionRow(sol, opts, collapsedGroups){
    var indent=opts.indent||0;
    var isGroupParent=opts.variant==='parent'&&(opts.groupChildren||[]).length>0;
    var groupMembers=isGroupParent?[sol].concat(opts.groupChildren||[]):[sol];
    var groupQueues=isGroupParent?aggregateSolutionGroupQueues(groupMembers):null;
    var sel=findSolutionSelection(sol.id);
    var isSelected=isGroupParent?groupQueues.allOn:!!sel;
    var unmatched=isSolutionUnmatched(sol.id);
    var titleClass=opts.variant==='parent'?'font-weight:600':'font-weight:500';
    var groupCtx=opts.variant==='child'&&opts.groupParentId!=null&&opts.groupSiblings
      ?{parentId:opts.groupParentId,siblings:opts.groupSiblings}:null;
    var toggle=opts.variant==='parent'&&opts.groupParentId!=null
      ?'<button type="button" class="fs-grp-toggle" title="'+(collapsedGroups.has(opts.groupParentId)?'Развернуть группу':'Свернуть группу')+'" data-solution-grp-toggle="'+opts.groupParentId+'">'+
        (collapsedGroups.has(opts.groupParentId)?'▶':'▼')+'</button>'
      :'<span class="solution-toggle-spacer" aria-hidden="true"></span>';
    var row='<tr class="'+(opts.variant==='parent'?'solution-group':'')+'">'+
      '<td style="padding-left:'+(8+indent)+'px;min-width:220px">'+
      '<div class="solution-row-inner">'+toggle+
      '<div class="solution-row-body">'+
      '<button type="button" class="solution-name-btn" data-solution-card="'+sol.id+'" style="'+titleClass+(unmatched?';font-style:italic;color:#64748b':'')+'">'+
      (sol.catalog_code?'<span class="solution-code">'+esc(sol.catalog_code)+'</span>':'')+
      esc(sol.name)+'</button>'+
      (unmatched?'<div class="solution-meta">не связано с выбранными проблематиками</div>':'')+
      '</div></div></td><td class="solution-widgets-col">'+renderSolutionWidgetsCell(sol,isSelected)+'</td>';
    FS_QUEUE_KEYS.forEach(function(q){
      var isYes=isGroupParent?groupQueues.byQueue[q]:sel?solutionSelectionQueue(sel)===String(q):false;
      var unmatchedBtn=!isSelected;
      row+='<td style="text-align:center;width:4rem">'+
        (isGroupParent?
          yesNoBadge(isYes):
          yesNoBtn(isYes,unmatchedBtn&&!isYes).replace('<button','<button data-solution-queue="'+sol.id+':'+q+'"'))+
        '</td>'+renderSolutionCommentCell(sol,q,isGroupParent);
    });
    return row+'</tr>';
  }

  function syncSolutionProblemFilterFromCustomer(){
    if(!data.solutions||!data.problems) return;
    var ids=[];
    (data.problems.selections||[]).forEach(function(s){
      if(s.problem_id) ids.push(s.problem_id);
    });
    data.solutions.selected_problem_ids=ids;
    var matched=new Set();
    (data.solutions.problem_solution_links||[]).forEach(function(link){
      if(ids.indexOf(link.problem_id)>=0) matched.add(link.solution_id);
    });
    data.solutions.matched_solution_ids=[...matched];
  }

  function renderSolutions(){
    var sol=data.solutions; if(!sol||!sol.catalog) return '';
    syncSolutionProblemFilterFromCustomer();
    if(!data.widgets) data.widgets={catalog:[],selections:[]};
    var visible=getVisibleSolutionCatalog();
    var units=buildSolutionDisplayUnits(visible);
    var collapsedGroups=new Set((data.ui_state&&data.ui_state.solution_groups)||[]);
    var hint=sol.show_all_solutions
      ?'Все решения справочника. Курсивом — не связаны с выбранными проблематиками.'
      :'Решения, сопоставленные с выбранными проблематиками (и группы из НСИ). Назначьте очередь («Да»), комментарий — в колонке «Коммент.»';
    var toolbar='<div class="solution-toolbar"><div class="solution-hint">'+esc(hint)+'</div>'+
      '<button type="button" class="solution-filter-btn" data-solution-show-all>'+
      (sol.show_all_solutions?'Только по проблематикам':'Показать все решения')+'</button></div>';
    var head1='<tr><th rowspan="2">Решение</th><th rowspan="2">Виджеты</th>';
    var head2='<tr>';
    FS_QUEUE_KEYS.forEach(function(q){
      head1+='<th colspan="2" style="text-align:center">'+esc(solutionQueueLabel(q))+'</th>';
      head2+='<th style="text-align:center;width:4rem">Да/Нет</th><th style="text-align:center;width:2.5rem">Коммент.</th>';
    });
    head1+='</tr>';
    head2+='</tr>';
    var rows='';
    units.forEach(function(unit){
      if(unit.kind==='group'){
        rows+=renderSolutionRow(unit.parent,{
          variant:'parent',groupParentId:unit.parent.id,groupChildren:unit.children,indent:0
        },collapsedGroups);
        if(!collapsedGroups.has(unit.parent.id)){
          unit.children.forEach(function(child){
            rows+=renderSolutionRow(child,{
              variant:'child',indent:12,groupParentId:unit.parent.id,groupSiblings:unit.children
            },collapsedGroups);
          });
        }
      } else {
        rows+=renderSolutionRow(unit.item,{variant:'standalone',indent:0},collapsedGroups);
      }
    });
    if(!rows){
      rows='<tr><td colspan="'+(2+FS_QUEUE_KEYS.length*2)+'" style="text-align:center;color:#94a3b8;padding:16px">'+
        'Нет решений для отображения. Выберите проблематики или нажмите «Показать все решения».</td></tr>';
    }
    return sectionWrap('solutions','Решения',toolbar+
      '<div class="solution-scroll"><table class="solution-tbl"><thead>'+head1+head2+'</thead><tbody>'+rows+'</tbody></table></div>');
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
      '<div class="instr">Заполните разделы по порядку: заказчик, виджеты, решения, ФС, орг. объём, параметры оценки. Нажмите «Скачать заполненный файл» внизу и передайте исполнителю.</div></div>'+
      renderCustomer()+renderWidgets()+renderSolutions()+renderFs()+renderOrgVolumeSection()+renderCriteria()+renderContract()+renderHeadcountLegacy()+renderOrgVolumeLegacy()+renderProblemsLegacy();
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
    if(!data.assessment_criteria.standard_document_state) data.assessment_criteria.standard_document_state={};
    if(!data.assessment_criteria.extra_custom_documents) data.assessment_criteria.extra_custom_documents=[];
    document.querySelectorAll('[data-std-doc-rp]').forEach(function(cell){
      var id=cell.getAttribute('data-std-doc-rp');
      var btn=cell.querySelector('button');
      if(!id||!btn) return;
      if(!data.assessment_criteria.standard_document_state[id]) data.assessment_criteria.standard_document_state[id]={rp_value:false,op_value:false};
      data.assessment_criteria.standard_document_state[id].rp_value=btn.getAttribute('data-val')==='1';
    });
    document.querySelectorAll('[data-std-doc-op]').forEach(function(cell){
      var id=cell.getAttribute('data-std-doc-op');
      var btn=cell.querySelector('button');
      if(!id||!btn) return;
      if(!data.assessment_criteria.standard_document_state[id]) data.assessment_criteria.standard_document_state[id]={rp_value:false,op_value:false};
      data.assessment_criteria.standard_document_state[id].op_value=btn.getAttribute('data-val')==='1';
    });
    document.querySelectorAll('[data-extra-custom-label]').forEach(function(inp){
      var id=inp.getAttribute('data-extra-custom-label');
      if(!id) return;
      var row=data.assessment_criteria.extra_custom_documents.find(function(r){return r.id===id;});
      if(row) row.label=inp.value;
    });
    document.querySelectorAll('[data-extra-custom-op]').forEach(function(cell){
      var id=cell.getAttribute('data-extra-custom-op');
      var btn=cell.querySelector('button');
      if(!id||!btn) return;
      var row=data.assessment_criteria.extra_custom_documents.find(function(r){return r.id===id;});
      if(row) row.op_value=btn.getAttribute('data-val')==='1';
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
      data.solutions.selections=(data.solutions.selections||[]).slice();
    }
    if(data.widgets){
      var widgetSel=[];
      document.querySelectorAll('[data-widget]:checked,[data-solution-widget]:checked').forEach(function(el){
        var raw=el.getAttribute('data-widget')||el.getAttribute('data-solution-widget')||'';
        var parts=raw.split(':');
        if(parts.length<2) return;
        var a=Number(parts[0]), b=Number(parts[1]);
        var widgetId=el.hasAttribute('data-solution-widget')?b:a;
        var solutionId=el.hasAttribute('data-solution-widget')?a:b;
        widgetSel.push({solution_id:solutionId,widget_id:widgetId});
      });
      var seen=new Set();
      data.widgets.selections=widgetSel.filter(function(s){
        var key=s.solution_id+':'+s.widget_id;
        if(seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    }
    if(data.assessment_headcount){
      var hs=document.querySelector('[data-headcount]');
      if(hs) data.assessment_headcount.headcount_category=hs.value;
    }
  }

  function bindSolutionCommentDrag(){
    var tbody=document.querySelector('.solution-tbl tbody');
    if(!tbody) return;

    tbody.addEventListener('dragstart',function(e){
      var btn=e.target.closest('[data-solution-comment-drag]');
      if(!btn) return;
      e.stopPropagation();
      var parts=(btn.getAttribute('data-solution-comment-drag')||'').split(':');
      if(parts.length<2) return;
      solutionDragPayload={kind:'comment',solutionId:Number(parts[0]),fromQueue:parts[1]};
      e.dataTransfer.effectAllowed='move';
      e.dataTransfer.setData('application/x-solution-comment', JSON.stringify(solutionDragPayload));
    });

    tbody.addEventListener('dragover',function(e){
      if(!isSolutionCommentDragActive(e)) return;
      var cell=e.target.closest('[data-solution-comment-cell]');
      if(!cell) return;
      e.preventDefault();
      if(e.dataTransfer) e.dataTransfer.dropEffect='move';
      clearSolutionCommentDropTargets();
      cell.classList.add('fs-drop-target');
    });

    tbody.addEventListener('drop',function(e){
      var cell=e.target.closest('[data-solution-comment-cell]');
      if(!cell) return;
      e.preventDefault();
      e.stopPropagation();
      var payload=parseSolutionCommentPayload(e);
      clearSolutionCommentDropTargets();
      solutionDragPayload=null;
      if(!payload) return;
      var parts=(cell.getAttribute('data-solution-comment-cell')||'').split(':');
      if(parts.length<2) return;
      var targetSol=(data.solutions&&data.solutions.catalog||[]).find(function(s){ return s.id===Number(parts[0]); });
      if(!targetSol||!parts[1]) return;
      handleSolutionCommentDrop(targetSol, parts[1], payload);
    });

    tbody.addEventListener('dragend',function(e){
      if(e.target.closest('[data-solution-comment-drag]')) endSolutionDrag();
    });

    tbody.addEventListener('click',function(e){
      var btn=e.target.closest('[data-solution-comment-drag]');
      if(btn){
        e.stopPropagation();
        var dparts=(btn.getAttribute('data-solution-comment-drag')||'').split(':');
        if(dparts.length<2) return;
        openSolutionCommentModal(Number(dparts[0]),dparts[1]);
        return;
      }
      var cell=e.target.closest('[data-solution-comment-cell]');
      if(!cell||e.target.closest('[data-solution-comment-drag]')) return;
      var cparts=(cell.getAttribute('data-solution-comment-cell')||'').split(':');
      if(cparts.length<2) return;
      openSolutionCommentModal(Number(cparts[0]),cparts[1]);
    });
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
    function applyHtmlDocExclusions(docId, enabled){
      if(!enabled||!data.assessment_criteria.standard_document_exclusions) return;
      (data.assessment_criteria.standard_document_exclusions||[]).forEach(function(pair){
        var other=pair.doc_id_a===docId?pair.doc_id_b:pair.doc_id_b===docId?pair.doc_id_a:null;
        if(other==null) return;
        var k=String(other);
        if(!data.assessment_criteria.standard_document_state[k]) data.assessment_criteria.standard_document_state[k]={rp_value:false,op_value:false};
        data.assessment_criteria.standard_document_state[k].rp_value=false;
        data.assessment_criteria.standard_document_state[k].op_value=false;
        data.assessment_criteria.standard_document_state[k].extra=false;
        data.assessment_criteria.standard_document_state[k].rp_manual=false;
        data.assessment_criteria.standard_document_state[k].op_manual=false;
      });
    }
    document.querySelectorAll('[data-std-doc-rp]').forEach(function(cell){
      var id=Number(cell.getAttribute('data-std-doc-rp'));
      var isExtra=cell.getAttribute('data-std-extra')==='1';
      toggleYesNo(cell.querySelector('button'),function(on){
        if(!data.assessment_criteria.standard_document_state) data.assessment_criteria.standard_document_state={};
        var key=String(id);
        if(!data.assessment_criteria.standard_document_state[key]) data.assessment_criteria.standard_document_state[key]={rp_value:false,op_value:false};
        data.assessment_criteria.standard_document_state[key].rp_value=on;
        data.assessment_criteria.standard_document_state[key].rp_manual=true;
        if(isExtra) data.assessment_criteria.standard_document_state[key].extra=on;
        applyHtmlDocExclusions(id,on);
      });
    });
    document.querySelectorAll('[data-std-doc-op]').forEach(function(cell){
      var id=cell.getAttribute('data-std-doc-op');
      toggleYesNo(cell.querySelector('button'),function(on){
        if(!data.assessment_criteria.standard_document_state) data.assessment_criteria.standard_document_state={};
        if(!data.assessment_criteria.standard_document_state[id]) data.assessment_criteria.standard_document_state[id]={rp_value:false,op_value:false};
        data.assessment_criteria.standard_document_state[id].op_value=on;
        data.assessment_criteria.standard_document_state[id].op_manual=true;
      });
    });
    document.querySelectorAll('[data-extra-custom-op]').forEach(function(cell){
      var id=cell.getAttribute('data-extra-custom-op');
      toggleYesNo(cell.querySelector('button'),function(on){
        if(!data.assessment_criteria.extra_custom_documents) data.assessment_criteria.extra_custom_documents=[];
        var row=data.assessment_criteria.extra_custom_documents.find(function(r){return r.id===id;});
        if(row) row.op_value=on;
      });
    });
    document.querySelectorAll('[data-extra-custom-add]').forEach(function(btn){
      btn.addEventListener('click',function(e){
        e.preventDefault();
        syncFromDom();
        if(!data.assessment_criteria.extra_custom_documents) data.assessment_criteria.extra_custom_documents=[];
        data.assessment_criteria.extra_custom_documents.push({
          id:'ecd_'+Date.now(),
          label:'',
          rp_value:false,
          op_value:false,
          tech:'CASE'
        });
        render();
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
      btn.addEventListener('click',function(e){
        e.stopPropagation();
        var key=btn.getAttribute('data-widget-group-toggle');
        if(!key) return;
        data.ui_state=data.ui_state||{};
        data.ui_state.widget_groups=data.ui_state.widget_groups||{};
        data.ui_state.widget_groups[key]=!uiOpen('widget_groups',key,true);
        render();
      });
    });
    document.querySelectorAll('[data-widget-view]').forEach(function(btn){
      btn.addEventListener('click',function(e){
        e.preventDefault();
        e.stopPropagation();
        var key=btn.getAttribute('data-widget-view');
        if(key) openWidgetModal(key);
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
      keys.forEach(function(key){
        data.ui_state.widget_groups[key]=allCollapsed;
      });
      render();
    });
    document.querySelectorAll('[data-solution-show-all]').forEach(function(btn){
      btn.addEventListener('click',function(){
        if(!data.solutions) return;
        data.solutions.show_all_solutions=!data.solutions.show_all_solutions;
        render();
      });
    });
    document.querySelectorAll('[data-solution-grp-toggle]').forEach(function(btn){
      btn.addEventListener('click',function(e){
        e.stopPropagation();
        var id=Number(btn.getAttribute('data-solution-grp-toggle'));
        data.ui_state=data.ui_state||{};
        data.ui_state.solution_groups=data.ui_state.solution_groups||[];
        var set=new Set(data.ui_state.solution_groups);
        if(set.has(id)) set.delete(id); else set.add(id);
        data.ui_state.solution_groups=[...set];
        render();
      });
    });
    document.querySelectorAll('[data-solution-queue]').forEach(function(btn){
      btn.addEventListener('click',function(){
        var parts=(btn.getAttribute('data-solution-queue')||'').split(':');
        if(parts.length<2) return;
        var solutionId=Number(parts[0]), q=parts[1];
        var sol=(data.solutions&&data.solutions.catalog||[]).find(function(s){return s.id===solutionId;});
        if(!sol) return;
        var groupCtx=null;
        if(sol.parent_id){
          var parent=(data.solutions.catalog||[]).find(function(s){return s.id===sol.parent_id;});
          if(parent){
            var siblings=(data.solutions.catalog||[]).filter(function(s){return s.parent_id===parent.id;});
            groupCtx={parentId:parent.id,siblings:[parent].concat(siblings)};
          }
        }
        toggleSolutionQueue(sol,q,groupCtx);
        render();
      });
    });
    document.querySelectorAll('[data-solution-widget]').forEach(function(inp){
      inp.addEventListener('change',function(){
        var parts=(inp.getAttribute('data-solution-widget')||'').split(':');
        if(parts.length<2) return;
        toggleSolutionWidget(Number(parts[0]),Number(parts[1]),inp.checked);
        render();
      });
    });
    bindSolutionCommentDrag();
    document.querySelectorAll('[data-solution-card]').forEach(function(btn){
      btn.addEventListener('click',function(e){
        e.stopPropagation();
        openSolutionCardModal(Number(btn.getAttribute('data-solution-card')));
      });
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
