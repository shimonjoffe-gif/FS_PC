/** FS + queues UI for exported briefing HTML (plain JS string, no template interpolation). */
export function getFsClientJs(): string {
  return `
  var FS_FUNC_TYPE_VALUES=['Базовый','Проф-мини','ПРОФ','Экспертный'];
  var fsCardDrafts={};
  var fsCommentDraft='';
  var fsDragPayload=null;

  function ensureFsUiState(){
    data.ui_state=data.ui_state||{};
    if(data.ui_state.fs_show_nsi===undefined) data.ui_state.fs_show_nsi=false;
    if(!data.ui_state.fs_groups) data.ui_state.fs_groups={};
    if(!data.ui_state.fs_queue_cols) data.ui_state.fs_queue_cols={};
  }

  function fsQueueExpanded(q){ ensureFsUiState(); return !!data.ui_state.fs_queue_cols[String(q)]; }
  function fsYesFilter(){ ensureFsUiState(); return data.ui_state.fs_yes_filter||null; }
  function fsShowNsi(){ ensureFsUiState(); return !!data.ui_state.fs_show_nsi; }
  function fsCardId(){ ensureFsUiState(); return data.ui_state.fs_card!=null?Number(data.ui_state.fs_card):null; }
  function fsCommentKey(){ ensureFsUiState(); return data.ui_state.fs_comment||null; }
  function fsCommentMerge(){ ensureFsUiState(); return data.ui_state.fs_comment_merge||null; }

  function isCustomerFsItem(it){ return !!it.is_customer_item||it.fs_item_id<0; }

  function isCustomerFsGroupPrefix(p){ return p==='10'||p==='11'; }

  function extractGroupSuffix(groupPrefix, prefix){
    if(!prefix||!String(prefix).trim()) return null;
    var m=String(prefix).trim().match(new RegExp('^'+groupPrefix+'\\.(\\d+)$'));
    return m?parseInt(m[1],10):null;
  }

  function maxSuffixInGroup(groupPrefix, prefixes){
    var max=0;
    (prefixes||[]).forEach(function(p){
      var s=extractGroupSuffix(groupPrefix,p);
      if(s!=null) max=Math.max(max,s);
    });
    return max;
  }

  function nextCustomerDisplayPrefix(groupPrefix, items){
    var prefixes=(items||[]).filter(function(i){
      return (i.group_prefix||String(i.prefix||'').split('.')[0])===groupPrefix;
    }).map(function(i){ return i.prefix; });
    return groupPrefix+'.'+(maxSuffixInGroup(groupPrefix,prefixes)+1);
  }

  function defaultSpForFuncType(funcType){
    switch(String(funcType||'').trim()){
      case 'Экспертный': return 10;
      case 'ПРОФ': return 5;
      case 'Проф-мини': return 3;
      case 'Базовый': return 1;
      default: return 5;
    }
  }

  function createCustomerFsItem(groupPrefix, groupName, items){
    var sp=defaultSpForFuncType('ПРОФ');
    return {
      fs_item_id: -Date.now(),
      is_customer_item: true,
      enabled: 1,
      queue: '1',
      queues_json: {1:1,2:0,3:0,4:0},
      source: 'customer',
      matched: true,
      name: '',
      customer_name: null,
      group_prefix: groupPrefix,
      group_name: groupName,
      prefix: nextCustomerDisplayPrefix(groupPrefix, items),
      func_type: 'ПРОФ',
      story_points: sp,
      catalog_story_points: sp,
      sort_order: 100000,
      matched_widgets: [],
      detail_lines: []
    };
  }

  function itemQueues(it){
    var empty={1:0,2:0,3:0,4:0};
    if(it.queues_json) return Object.assign({},empty,it.queues_json);
    var q=it.queue&&['1','2','3','4'].indexOf(String(it.queue))>=0?String(it.queue):'1';
    if(it.enabled) empty[q]=1;
    return empty;
  }

  function anyQueueEnabled(queues){ return ['1','2','3','4'].some(function(k){return queues[k]===1;}); }

  function normalizeFsNmdValue(raw){
    var text=String(raw||'').trim();
    if(!text) return 'Не требуется';
    var lower=text.toLowerCase();
    if(lower==='не требуется'||lower==='нет') return 'Не требуется';
    if(lower.indexOf('предоставля')>=0&&lower.indexOf('заказчик')>=0) return 'Предоставляется Заказчиком';
    if(FS_NMD_VALUES.indexOf(text)>=0) return text;
    if(lower.indexOf('типовая')>=0) return 'Используется типовая';
    if(lower.indexOf('разработ')>=0||lower.indexOf('необходимо разработать')>=0) return 'Требуется разработать';
    if(lower.indexOf('требуется')>=0&&lower.indexOf('не требуется')<0) return 'Требуется разработать';
    return 'Требуется разработать';
  }

  function isFsItemNmdLegacy(it){
    return (it.name||'').toLowerCase().indexOf('нмд')>=0||((it.func_type||'').indexOf('НМД')>=0);
  }

  function catalogNmdLabel(it){
    var text=String(it.requires_nmd||'').trim();
    if(text) return normalizeFsNmdValue(text);
    if(isFsItemNmdLegacy(it)) return 'Требуется разработать';
    return 'Не требуется';
  }

  function parseQueueNmdJson(raw){
    if(!raw) return {};
    if(typeof raw==='object') return Object.assign({},raw);
    try{ return JSON.parse(String(raw))||{}; }catch(e){ return {}; }
  }

  function resolveQueueNmdOverride(it,q){
    var raw=parseQueueNmdJson(it.queue_nmd_json)[q];
    if(raw===undefined) return undefined;
    if(raw===0||raw==='0') return 'Не требуется';
    if(raw===1||raw==='1') return undefined;
    return normalizeFsNmdValue(String(raw));
  }

  function autoFsItemNmdValueForQueue(it){ return catalogNmdLabel(it); }

  function effectiveNmd(it,q){
    var queues=itemQueues(it);
    if(queues[q]!==1) return 'Не требуется';
    var manual=resolveQueueNmdOverride(it,q);
    if(manual!==undefined) return manual;
    return autoFsItemNmdValueForQueue(it);
  }

  function isNmdManual(it,q){
    var manual=resolveQueueNmdOverride(it,q);
    if(manual===undefined) return false;
    return manual!==autoFsItemNmdValueForQueue(it);
  }

  function patchFsItemQueueNmd(it,q,value){
    var overrides={};
    ['1','2','3','4'].forEach(function(key){
      if(key===q) return;
      var m=resolveQueueNmdOverride(it,key);
      if(m!==undefined&&m!==autoFsItemNmdValueForQueue(it)) overrides[key]=m;
    });
    var auto=autoFsItemNmdValueForQueue(it);
    if(value!==auto) overrides[q]=value;
    return {queue_nmd_json:Object.keys(overrides).length>0?overrides:null};
  }

  function resetNmd(it,q){
    var overrides={};
    ['1','2','3','4'].forEach(function(key){
      if(key===q) return;
      var m=resolveQueueNmdOverride(it,key);
      if(m!==undefined&&m!==autoFsItemNmdValueForQueue(it)) overrides[key]=m;
    });
    return {queue_nmd_json:Object.keys(overrides).length>0?overrides:null};
  }

  function parseQueueCommentJson(raw){
    if(!raw) return {};
    if(typeof raw==='object') return Object.assign({},raw);
    try{ return JSON.parse(String(raw))||{}; }catch(e){ return {}; }
  }

  function effectiveComment(it,q){ return parseQueueCommentJson(it.queue_comment_json)[q]||''; }

  function hasComment(it,q){ return effectiveComment(it,q).trim().length>0; }

  function patchFsItemQueueComment(it,q,value){
    var overrides=parseQueueCommentJson(it.queue_comment_json);
    var trimmed=String(value||'').trim();
    if(!trimmed) delete overrides[q];
    else overrides[q]=trimmed;
    return {queue_comment_json:Object.keys(overrides).length>0?overrides:null};
  }

  function itemMatchesYesFilter(it,filter){
    if(!filter) return true;
    var queues=itemQueues(it);
    if(filter==='all') return anyQueueEnabled(queues);
    return queues[filter]===1;
  }

  function aggregateGroupQueues(groupItems){
    var byQueue={1:false,2:false,3:false,4:false};
    var allOn=false;
    groupItems.forEach(function(it){
      var queues=itemQueues(it);
      if(anyQueueEnabled(queues)) allOn=true;
      ['1','2','3','4'].forEach(function(q){ if(queues[q]===1) byQueue[q]=true; });
    });
    return {allOn:allOn,byQueue:byQueue};
  }

  function isNsiLineModified(line){
    if(line.source!=='nsi') return false;
    return line.name!==(line.nsi_name||'')||(line.description||'')!==(line.nsi_description||'')||!!line.inactive;
  }

  function fsDetailLineFlags(it){
    var lines=detailLinesForItem(it);
    if(isCustomerFsItem(it)){
      return {
        modified:false,
        customerAdded:!!(String(it.description||'').trim()||lines.some(function(l){return (l.name||'').trim()||(l.description||'').trim();}))
      };
    }
    return {
      modified:lines.some(isNsiLineModified),
      customerAdded:lines.some(function(l){return l.source==='customer';})
    };
  }

  function countGroupUserItems(items){
    var n=0;
    (items||[]).forEach(function(it){
      if(isCustomerFsItem(it)) n++;
      else if(fsDetailLineFlags(it).customerAdded) n++;
    });
    return n;
  }

  function displayItemName(it){
    if(isCustomerFsItem(it)){
      var n=it.customer_name||it.name||'';
      return n.trim()||'Новая функция заказчика…';
    }
    return it.customer_name||it.catalog_name||it.name||'';
  }

  function fsQueueSpan(q){ return fsQueueExpanded(q)?2:1; }
  function fsColsPerQueueBlock(q){ return fsQueueSpan(q)+1; }

  function fsFixedColsBeforeQueues(){ return fsShowNsi()?6:4; }

  function fsNsiCells(it, empty){
    if(!fsShowNsi()) return '';
    if(empty) return '<td></td><td></td>';
    if(isCustomerFsItem(it)) return '<td></td><td></td>';
    var sp=it.catalog_story_points;
    return '<td style="text-align:right;font-size:11px;color:#64748b">'+(sp!=null?esc(String(sp)):'—')+'</td>'+
      '<td style="font-size:10px;color:#64748b" title="Требование НМД из НСИ">'+esc(catalogNmdLabel(it))+'</td>';
  }

  function fsTotalQueueCols(){
    return ['1','2','3','4'].reduce(function(sum,q){return sum+fsColsPerQueueBlock(q);},0);
  }

  function fsYesNoSpan(val,unmatched){
    var cls='yesno '+(val?'yes':'no')+(unmatched&&!val?' unmatched':'');
    return '<span class="'+cls+'">'+(val?'Да':'Нет')+'</span>';
  }

  function fsFilterTh(filterKey,label,title){
    var active=fsYesFilter()===filterKey;
    return '<th class="fs-filterable'+(active?' fs-filter-active':'')+'" data-fs-yes-filter="'+filterKey+'" title="'+esc(title)+'">'+esc(label)+
      (active?'<div class="fs-filter-hint">только «Да»</div>':'')+'</th>';
  }

  function renderFsNmdSelect(it,q){
    var on=itemQueues(it)[q]===1;
    var val=effectiveNmd(it,q);
    var manual=isNmdManual(it,q);
    var opts=FS_NMD_VALUES.map(function(v){
      return '<option'+(val===v?' selected':'')+'>'+esc(v)+'</option>';
    }).join('');
    var resetBtn=manual?'<button type="button" class="fs-nmd-reset" data-fs-nmd-reset="'+it.fs_item_id+'" data-q="'+q+'" title="Сбросить НМД к НСИ ('+esc(catalogNmdLabel(it))+')">↺</button>':'';
    return '<select class="fs-nmd-select '+(manual?'manual':'auto')+'" data-fs-nmd="'+it.fs_item_id+'" data-q="'+q+'"'+(on?'':' disabled')+'>'+opts+'</select>'+resetBtn;
  }

  function renderFsCommentBtn(it,q){
    if(!hasComment(it,q)) return '';
    return '<button type="button" class="fs-comment-btn has-comment" data-fs-comment="'+it.fs_item_id+'" data-q="'+q+'" draggable="true" title="Перетащите на комментарий другого пункта или клик — открыть" aria-label="Есть комментарий">'+
      '<svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor" aria-hidden="true"><path d="M2 3.5A1.5 1.5 0 0 1 3.5 2h9A1.5 1.5 0 0 1 14 3.5v5A1.5 1.5 0 0 1 12.5 10H9l-2.5 2.5V10H3.5A1.5 1.5 0 0 1 2 8.5v-5Z"/></svg></button>';
  }

  function renderFsQueueCells(it,unmatched){
    var fid=it.fs_item_id;
    var queues=itemQueues(it);
    var html='';
    ['1','2','3','4'].forEach(function(q){
      var on=queues[q]===1;
      var nmdManual=isNmdManual(it,q);
      var resetInCell=nmdManual&&!fsQueueExpanded(q)?'<button type="button" class="fs-nmd-reset" data-fs-nmd-reset="'+fid+'" data-q="'+q+'" title="Сбросить НМД">↺</button>':'';
      var yesBtnCls='yesno '+(on?'yes':'no')+(unmatched&&!on?' unmatched':'');
      var yesBtn='<button type="button" class="'+yesBtnCls+'" data-val="'+(on?1:0)+'"'+
        (on?' draggable="true" title="Перетащите в другую очередь" style="cursor:grab"':' title="Клик — переключить Да/Нет"')+'>'+(on?'Да':'Нет')+'</button>';
      html+='<td class="qcell" style="text-align:center" data-fs="'+fid+'" data-q="'+q+'">'+
        yesBtn+resetInCell+'</td>';
      if(fsQueueExpanded(q)){
        html+='<td>'+renderFsNmdSelect(it,q)+'</td>';
      }
      html+='<td class="fs-comment-cell" data-fs-comment-cell="'+fid+'" data-q="'+q+'">'+renderFsCommentBtn(it,q)+'</td>';
    });
    return html;
  }

  function renderFsToolbar(){
    var yf=fsYesFilter();
    var showNsi=fsShowNsi();
    var groups=groupItems(data.fs.items);
    var allCollapsed=groups.length>0&&groups.every(function(grp){return !uiOpen('fs_groups',grp.group,false);});
    return '<div class="fs-toolbar">'+
      '<button type="button" data-fs-collapse-sections>'+(allCollapsed?'Развернуть все группы':'Свернуть все группы')+'</button>'+
      (yf?'<button type="button" class="fs-filter-reset" data-fs-reset-yes-filter>Сбросить фильтр «Да»</button>':'')+
      '<button type="button" data-fs-toggle-nsi>'+(showNsi?'Скрыть НСИ':'Показать НСИ')+'</button>'+
      '</div>';
  }

  function renderFsTable(){
    var keys=['1','2','3','4'];
    var fixedCols=fsFixedColsBeforeQueues();
    var totalCols=fixedCols+1+fsTotalQueueCols();
    var qHdr='';
    keys.forEach(function(q){
      qHdr+='<th colspan="'+fsQueueSpan(q)+'" style="text-align:center">'+
        '<button type="button" class="fs-grp-toggle" data-fs-queue-expand="'+q+'" title="'+(fsQueueExpanded(q)?'Свернуть колонки очереди':'Развернуть: Да/Нет, НМД')+'">'+(fsQueueExpanded(q)?'▼':'▶')+'</button> '+
        esc(qLabel(q))+'</th>'+
        '<th rowspan="2" style="text-align:center;width:2.5rem" title="Комментарий — '+esc(qLabel(q))+'">Коммент.</th>';
    });
    var subHdr=fsFilterTh('all','Да/Нет','Показать только пункты с «Да» хотя бы в одной очереди');
    keys.forEach(function(q){
      subHdr+=fsFilterTh(q,'Да/Нет','Показать только пункты с «Да» в '+qLabel(q));
      if(fsQueueExpanded(q)) subHdr+='<th style="text-align:center;font-weight:400">НМД</th>';
    });
    var rows='';
    var yesFilter=fsYesFilter();
    groupItems(data.fs.items).forEach(function(grp){
      var gKey=grp.group;
      var gEnc=encodeURIComponent(gKey);
      var gOpen=uiOpen('fs_groups',gKey,false);
      var groupItemsAll=grp.items;
      var visibleItems=yesFilter?groupItemsAll.filter(function(it){return itemMatchesYesFilter(it,yesFilter);}):groupItemsAll;
      if(yesFilter&&visibleItems.length===0) return;
      var rowItems=yesFilter?visibleItems:groupItemsAll;
      var groupQueues=aggregateGroupQueues(rowItems);
      var userItemsCount=countGroupUserItems(groupItemsAll);
      rows+='<tr class="fs-grp'+(gOpen?' open':'')+'" data-fs-grp="'+gEnc+'">'+
        '<td class="fs-grp-num"><button type="button" class="fs-grp-toggle" data-fs-grp-toggle="'+gEnc+'">'+(gOpen?'▼':'▶')+'</button> '+esc(grp.groupPrefix||'—')+'</td>'+
        '<td>'+esc(gKey)+'<span class="fs-grp-count">('+rowItems.length+(yesFilter&&rowItems.length!==groupItemsAll.length?' / '+groupItemsAll.length:'')+')</span>'+
        (userItemsCount>0?'<span class="fs-grp-user-indicator" title="Добавлены пользовательские пункты ('+userItemsCount+')">+'+userItemsCount+' пользовательских</span>':'')+
        (isCustomerFsGroupPrefix(grp.groupPrefix)?' <button type="button" class="btn-link fs-add-customer" data-fs-add-customer="'+esc(grp.groupPrefix||'')+'" data-fs-group-name="'+gEnc+'">+ Функция заказчика</button>':'')+
        '</td>'+
        '<td></td>'+fsNsiCells(null,true)+'<td></td>'+
        '<td style="text-align:center">'+fsYesNoSpan(groupQueues.allOn,false)+'</td>';
      keys.forEach(function(q){
        if(!fsQueueExpanded(q)){
          rows+='<td style="text-align:center">'+fsYesNoSpan(groupQueues.byQueue[q],false)+'</td>';
        } else {
          rows+='<td style="text-align:center">'+fsYesNoSpan(groupQueues.byQueue[q],false)+'</td><td></td>';
        }
        rows+='<td></td>';
      });
      rows+='</tr>';
      if(!gOpen) return;
      rowItems.forEach(function(it){
        var fid=it.fs_item_id;
        var queues=itemQueues(it);
        var allOn=anyQueueEnabled(queues);
        var customerItem=isCustomerFsItem(it);
        var unmatched=!customerItem&&it.matched===false;
        var flags=fsDetailLineFlags(it);
        var rowCls='fs-row'+(customerItem?' fs-row-customer':'')+(unmatched?' fs-row-unmatched':'');
        var widgets=(it.matched_widgets||[]).length>0?it.matched_widgets.length+' выбрано':'—';
        var funcCell=customerItem?
          '<select class="fs-func-select" data-fs-func-type="'+fid+'">'+
          FS_FUNC_TYPE_VALUES.map(function(v){return '<option'+(it.func_type===v?' selected':'')+'>'+esc(v)+'</option>';}).join('')+'</select>':
          '<span class="fs-func-type">'+esc(it.func_type||'—')+'</span>';
        var badges='';
        if(customerItem||flags.modified||flags.customerAdded){
          badges='<span class="fs-badge-wrap">';
          if(customerItem) badges+='<span class="fs-badge fs-badge-customer" title="Функция заказчика">З</span>';
          if(flags.modified) badges+='<span class="fs-badge fs-badge-modified" title="Расшифровка изменена">✎</span>';
          if(flags.customerAdded) badges+='<span class="fs-badge fs-badge-added" title="Добавлены пользовательские подпункты">+</span>';
          badges+='</span>';
        }
        var displayName=displayItemName(it);
        var nameHtml=displayName
          ? '<span class="fs-name-text">'+esc(displayName)+'</span>'
          : '<span class="fs-name-placeholder">Новая функция заказчика…</span>';
        rows+='<tr class="'+rowCls+'" data-fs-row="'+fid+'">'+
          '<td class="fs-prefix-cell">'+
          (customerItem?
            '<span class="fs-prefix-wrap"><span class="fs-prefix-num">'+esc(it.prefix||'—')+'</span>'+
            '<button type="button" class="fs-del-customer" data-fs-del-customer="'+fid+'" title="Удалить функцию заказчика">×</button></span>':
            esc(it.prefix||'—'))+
          '</td>'+
          '<td><button type="button" class="fs-name-btn'+(customerItem?' fs-name-customer':'')+'" data-fs-card="'+fid+'" title="Открыть карточку">'+
          nameHtml+
          badges+'</button></td>'+
          '<td>'+funcCell+'</td>'+
          fsNsiCells(it,false)+
          '<td class="fs-widgets-cell">'+esc(widgets)+'</td>'+
          '<td style="text-align:center">'+fsYesNoSpan(allOn,unmatched&&!allOn)+'</td>'+
          renderFsQueueCells(it,unmatched)+
          '</tr>';
      });
    });
    var nsiHdr=fsShowNsi()?'<th rowspan="2" style="text-align:right;width:3rem" title="Нормативный SP из НСИ">НСИ</th>'+
      '<th rowspan="2" style="min-width:100px" title="Требование НМД из НСИ">НМД НСИ</th>':'';
    return '<div class="fs-scroll"><table class="fs-tbl'+(fsShowNsi()?' fs-tbl-nsi':'')+'"><thead>'+
      '<tr><th rowspan="2" style="min-width:5rem;white-space:nowrap">№</th><th rowspan="2" style="min-width:200px">Пункт ФС / Расшифровка</th><th rowspan="2">Тип функционала</th>'+nsiHdr+
      '<th rowspan="2" style="min-width:140px">Виджеты</th>'+
      '<th style="text-align:center;width:6rem">Все очереди</th>'+qHdr+'</tr>'+
      '<tr class="fs-subhead">'+subHdr+'</tr></thead><tbody>'+rows+'</tbody></table></div>';
  }

  function getFsItemById(id){
    return data.fs.items.find(function(x){return x.fs_item_id===id;});
  }

  function isGarbledText(s){
    if(!s||!String(s).trim()) return false;
    var t=String(s).trim();
    if(new RegExp('^[?\\\\s]+$').test(t)) return true;
    var q=(t.match(new RegExp('\\\\?','g'))||[]).length;
    return q>0&&q/t.length>0.3;
  }

  function normalizeDetailLine(line){
    var l=Object.assign({},line);
    if(!l.nsi_name&&l.name&&!isGarbledText(l.name)) l.nsi_name=l.name;
    if(!l.nsi_description&&l.description&&!isGarbledText(l.description)) l.nsi_description=l.description;
    if(isGarbledText(l.name)&&l.nsi_name) l.name=l.nsi_name;
    if(isGarbledText(l.description)&&l.nsi_description) l.description=l.nsi_description;
    return l;
  }

  function detailLinesForItem(it){
    var lines=(it.detail_lines||[]).map(normalizeDetailLine);
    if(lines.length||isCustomerFsItem(it)) return lines;
    return (it.catalog_details||[]).map(function(d,i){
      return normalizeDetailLine({
        source:'nsi',
        name:d.name,
        description:d.description,
        nsi_name:d.name,
        nsi_description:d.description,
        inactive:false,
        sort_order:i
      });
    });
  }

  function buildCardDraft(it){
    var customerItem=isCustomerFsItem(it);
    var lines=detailLinesForItem(it);
    var breakdown='';
    if(customerItem){
      if(String(it.description||'').trim()) breakdown=it.description;
      else if(String(it.customer_description||'').trim()) breakdown=it.customer_description;
      else {
        var active=lines.filter(function(l){return !l.inactive;});
        if(active.length===1&&!active[0].name.trim()) breakdown=active[0].description||'';
        else breakdown=active.map(function(l){
          var n=(l.name||'').trim(), d=(l.description||'').trim();
          if(n&&d) return n+' — '+d;
          return n||d||'';
        }).filter(Boolean).join('\\n');
      }
    }
    return {
      name:it.customer_name||it.name||'',
      breakdown:breakdown,
      func_type:it.func_type||'ПРОФ',
      detailLines:lines
    };
  }

  function renderFsCardModal(){
    var cardId=fsCardId();
    if(cardId==null) return '';
    var it=getFsItemById(cardId);
    if(!it) return '';
    var draft=fsCardDrafts[cardId]||buildCardDraft(it);
    var customerItem=isCustomerFsItem(it);
    var title=customerItem?
      '<input type="text" data-fs-card-name value="'+esc(draft.name)+'" placeholder="Формулировка функции для заказчика" style="width:100%;font-size:14px;font-weight:600;border:1px solid #a7f3d0;border-radius:6px;padding:6px 8px">':
      '<div style="font-weight:600">'+esc((it.prefix?it.prefix+' · ':'')+(it.catalog_name||it.name))+'</div>';
    var body='';
    if(customerItem){
      body+='<label style="display:block;margin-bottom:12px"><span style="font-size:11px;color:#64748b">Описание функции</span>'+
        '<textarea data-fs-card-breakdown rows="5" style="width:100%;margin-top:4px;font-size:12px;border:1px solid #cbd5e1;border-radius:6px;padding:8px">'+esc(draft.breakdown)+'</textarea></label>';
    }
    var lines=draft.detailLines||[];
    body+='<div style="margin-bottom:8px;display:flex;justify-content:space-between;align-items:center">'+
      '<span style="font-size:11px;font-weight:600;color:#64748b;text-transform:uppercase">Расшифровка</span>'+
      '<button type="button" class="btn-link" data-fs-card-add-line>+ '+(customerItem?'Подпункт':'Добавить подпункт')+'</button></div>';
    if(lines.length===0&&!customerItem){
      body+='<p style="font-size:11px;color:#94a3b8;background:#f8fafc;border:1px solid #f1f5f9;border-radius:6px;padding:12px">Нет подпунктов расшифровки</p>';
    }
    lines.forEach(function(line,idx){
      body+='<div class="fs-detail-line" data-fs-card-line="'+idx+'">'+
        (line.source==='customer'?'<span style="font-size:10px;color:#b45309;background:#fef3c7;border:1px solid #fde68a;border-radius:4px;padding:1px 6px">Заказчик</span> ':'')+
        '<input type="text" data-fs-card-line-name="'+idx+'" value="'+esc(line.name||'')+'" placeholder="Название подпункта">'+
        '<textarea rows="2" data-fs-card-line-desc="'+idx+'" placeholder="Описание">'+esc(line.description||'')+'</textarea>'+
        '<label style="font-size:10px"><input type="checkbox" data-fs-card-line-inactive="'+idx+'"'+(line.inactive?' checked':'')+'> не актуален</label>'+
        (line.source==='customer'||customerItem?'<button type="button" class="btn-link" data-fs-card-line-remove="'+idx+'" style="color:#ef4444">Удалить</button>':'')+
        (line.source==='nsi'&&isNsiLineModified(line)?'<button type="button" class="btn-link" data-fs-card-line-revert="'+idx+'">Вернуть к НСИ</button>':'')+
        '</div>';
    });
    var widgets=it.matched_widgets||[];
    if(!customerItem&&widgets.length>0){
      body+='<div style="margin-top:12px"><div style="font-size:11px;font-weight:600;color:#64748b;margin-bottom:4px">Виджеты</div><ul class="fs-widget-list">'+
        widgets.map(function(w){return '<li>'+esc(w.name)+'</li>';}).join('')+'</ul></div>';
    }
    return '<div class="fs-modal-overlay" data-fs-modal="card"><div class="fs-modal fs-modal-lg" onclick="event.stopPropagation()">'+
      '<div class="fs-modal-hd"><div style="flex:1;min-width:0">'+title+
      '</div>'+
      '<button type="button" data-fs-modal-close style="background:none;border:none;font-size:18px;color:#94a3b8;cursor:pointer">✕</button></div>'+
      '<div class="fs-modal-bd">'+body+'</div>'+
      '<div class="fs-modal-ft"><button type="button" data-fs-modal-close>Отмена</button><button type="button" class="fs-modal-save" data-fs-card-save>Сохранить</button></div></div></div>';
  }

  function renderFsCommentModal(){
    var key=fsCommentKey();
    if(!key) return '';
    var parts=key.split(':');
    var fid=Number(parts[0]), q=parts[1];
    var it=getFsItemById(fid);
    if(!it) return '';
    var text=fsCommentDraft||effectiveComment(it,q);
    return '<div class="fs-modal-overlay" data-fs-modal="comment"><div class="fs-modal" onclick="event.stopPropagation()">'+
      '<div class="fs-modal-hd"><div><div style="font-weight:600">Комментарий — '+esc(qLabel(q))+'</div>'+
      '<div style="font-size:11px;color:#64748b;margin-top:2px">'+esc((it.prefix?it.prefix+' · ':'')+displayItemName(it))+'</div></div>'+
      '<button type="button" data-fs-modal-close style="background:none;border:none;font-size:18px;color:#94a3b8;cursor:pointer">✕</button></div>'+
      '<div class="fs-modal-bd"><textarea data-fs-comment-text rows="5" style="width:100%;font-size:13px;border:1px solid #cbd5e1;border-radius:8px;padding:8px" placeholder="Комментарий по очереди…">'+esc(text)+'</textarea></div>'+
      '<div class="fs-modal-ft"><button type="button" data-fs-modal-close>Отмена</button><button type="button" class="fs-modal-save" data-fs-comment-save>Сохранить</button></div></div></div>';
  }

  function renderFsCommentMergeModal(){
    var merge=fsCommentMerge();
    if(!merge) return '';
    var source=getFsItemById(merge.sourceId);
    var target=getFsItemById(merge.targetId);
    if(!source||!target) return '';
    return '<div class="fs-modal-overlay" data-fs-modal="comment-merge"><div class="fs-modal" onclick="event.stopPropagation()">'+
      '<div class="fs-modal-hd"><div style="font-weight:600">Комментарий у пункта-цели</div>'+
      '<button type="button" data-fs-modal-close style="background:none;border:none;font-size:18px;color:#94a3b8;cursor:pointer">✕</button></div>'+
      '<div class="fs-modal-bd"><p style="font-size:13px;color:#475569;margin:0">У выбранного пункта в этой очереди уже есть комментарий. Как перенести?</p></div>'+
      '<div class="fs-modal-ft"><button type="button" data-fs-modal-close>Отмена</button>'+
      '<button type="button" data-fs-comment-merge="merge">Дописать</button>'+
      '<button type="button" class="fs-modal-save" data-fs-comment-merge="replace">Заменить</button></div></div></div>';
  }

  function renderFsModals(){ return renderFsCardModal()+renderFsCommentModal()+renderFsCommentMergeModal(); }

  function renderFs(){
    if(!data.fs) return '';
    ensureFsUiState();
    return sectionWrap('fs','ФС + очереди',renderFsToolbar()+renderFsTable()+renderFsModals());
  }

  function readCardDraftFromDom(cardId){
    var draft=fsCardDrafts[cardId]||{};
    var nameEl=document.querySelector('[data-fs-card-name]');
    if(nameEl) draft.name=nameEl.value;
    var brEl=document.querySelector('[data-fs-card-breakdown]');
    if(brEl) draft.breakdown=brEl.value;
    var lines=[];
    document.querySelectorAll('[data-fs-card-line-name]').forEach(function(inp){
      var idx=Number(inp.getAttribute('data-fs-card-line-name'));
      var descEl=document.querySelector('[data-fs-card-line-desc="'+idx+'"]');
      var inactLine=document.querySelector('[data-fs-card-line-inactive="'+idx+'"]');
      var prev=(draft.detailLines||[])[idx]||{};
      lines.push({
        catalog_detail_id:prev.catalog_detail_id||null,
        source:prev.source||'customer',
        name:inp.value,
        description:descEl?descEl.value:null,
        nsi_name:prev.nsi_name||null,
        nsi_description:prev.nsi_description||null,
        inactive:inactLine?inactLine.checked:false,
        sort_order:idx
      });
    });
    if(lines.length) draft.detailLines=lines;
    fsCardDrafts[cardId]=draft;
    return draft;
  }

  function applyCardDraft(it,draft){
    var customerItem=isCustomerFsItem(it);
    if(customerItem){
      it.customer_name=draft.name.trim()||null;
      it.name=draft.name.trim()||it.name;
      it.description=draft.breakdown.trim()||null;
      it.customer_description=draft.breakdown.trim()||null;
      if(draft.func_type) it.func_type=draft.func_type;
    }
    if(draft.detailLines){
      it.detail_lines=draft.detailLines
        .filter(function(l){return (l.name||'').trim();})
        .map(function(l,i){
          return {
            catalog_detail_id:l.catalog_detail_id||null,
            source:customerItem?'customer':l.source,
            name:l.name.trim(),
            description:(l.description||'').trim()||null,
            nsi_name:l.nsi_name||null,
            nsi_description:l.nsi_description||null,
            inactive:!!l.inactive,
            sort_order:i
          };
        });
    }
  }

  function syncFsFromDom(){
    if(!data.fs) return;
    data.fs.items.forEach(function(it){
      var fid=it.fs_item_id;
      var ft=document.querySelector('[data-fs-func-type="'+fid+'"]');
      if(ft) it.func_type=ft.value;
    });
    document.querySelectorAll('[data-fs-nmd]').forEach(function(sel){
      var fid=Number(sel.getAttribute('data-fs-nmd'));
      var q=sel.getAttribute('data-q');
      var it=getFsItemById(fid);
      if(!it||!q||sel.disabled) return;
      var patch=patchFsItemQueueNmd(it,q,sel.value);
      it.queue_nmd_json=patch.queue_nmd_json;
    });
    var cardId=fsCardId();
    if(cardId!=null){
      readCardDraftFromDom(cardId);
    }
    var commentKey=fsCommentKey();
    if(commentKey){
      var ta=document.querySelector('[data-fs-comment-text]');
      if(ta) fsCommentDraft=ta.value;
    }
  }

  function patchQueues(it,queues){
    var primary='1';
    ['1','2','3','4'].forEach(function(k){ if(queues[k]===1) primary=k; });
    it.queues_json=queues;
    it.queue=primary;
    it.enabled=anyQueueEnabled(queues)?1:0;
    if(it.matched===false) it.matched=true;
  }

  function applyFsPatch(it, patch){
    Object.keys(patch).forEach(function(k){ it[k]=patch[k]; });
    return it;
  }

  function relocateFsItemQueueOverrides(it, fromQ, toQ){
    if(fromQ===toQ) return {};
    var working=it;
    var fromNmd=effectiveNmd(working, fromQ);
    var toAutoNmd=autoFsItemNmdValueForQueue(working);
    if(isNmdManual(working, fromQ)||fromNmd!==toAutoNmd){
      working=applyFsPatch(working, patchFsItemQueueNmd(working, toQ, fromNmd));
      working=applyFsPatch(working, resetNmd(working, fromQ));
    }
    var comment=effectiveComment(working, fromQ).trim();
    if(comment){
      working=applyFsPatch(working, patchFsItemQueueComment(working, toQ, comment));
      working=applyFsPatch(working, patchFsItemQueueComment(working, fromQ, ''));
    }
    return {
      queue_nmd_json: working.queue_nmd_json,
      queue_comment_json: working.queue_comment_json,
      source: 'manual'
    };
  }

  function moveToQueue(it, fromQ, toQ){
    applyFsPatch(it, relocateFsItemQueueOverrides(it, fromQ, toQ));
    var queues={1:0,2:0,3:0,4:0};
    queues[toQ]=1;
    patchQueues(it, queues);
  }

  function clearFsDropTargets(){
    document.querySelectorAll('.qcell.fs-drop-target,.fs-comment-cell.fs-drop-target').forEach(function(c){ c.classList.remove('fs-drop-target'); });
  }

  function primaryQueueFrom(queues){
    var primary='1';
    ['1','2','3','4'].forEach(function(k){ if(queues[k]===1) primary=k; });
    return primary;
  }

  function moveCommentBetweenItems(source, target, fromQ, toQ, mode){
    var movedText=effectiveComment(source, fromQ).trim();
    if(!movedText) return false;
    var sameItem=source.fs_item_id===target.fs_item_id;
    var existing=effectiveComment(target, toQ).trim();
    var targetText=movedText;
    if(existing) targetText=mode==='merge'?existing+'\\n'+movedText:movedText;
    if(sameItem){
      var working=Object.assign({}, source);
      working=applyFsPatch(working, patchFsItemQueueComment(working, toQ, targetText));
      working=applyFsPatch(working, patchFsItemQueueComment(working, fromQ, ''));
      var targetQueues=Object.assign({1:0,2:0,3:0,4:0}, itemQueues(working));
      targetQueues[toQ]=1;
      applyFsPatch(source, {
        queue_comment_json: working.queue_comment_json,
        queues_json: targetQueues,
        queue: primaryQueueFrom(targetQueues),
        enabled: anyQueueEnabled(targetQueues)?1:0,
        source: 'manual'
      });
      if(source.matched===false) source.matched=true;
      return true;
    }
    var targetWorking=Object.assign({}, target);
    targetWorking=applyFsPatch(targetWorking, patchFsItemQueueComment(targetWorking, toQ, targetText));
    var targetQueues=Object.assign({1:0,2:0,3:0,4:0}, itemQueues(targetWorking));
    targetQueues[toQ]=1;
    applyFsPatch(target, {
      queue_comment_json: targetWorking.queue_comment_json,
      queues_json: targetQueues,
      queue: primaryQueueFrom(targetQueues),
      enabled: anyQueueEnabled(targetQueues)?1:0,
      source: 'manual'
    });
    if(target.matched===false) target.matched=true;
    applyFsPatch(source, patchFsItemQueueComment(source, fromQ, ''));
    return true;
  }

  function applyCommentMove(source, target, fromQ, toQ, mode){
    if(!moveCommentBetweenItems(source, target, fromQ, toQ, mode)) return;
    updateOrgActiveCheckbox(toQ);
    fsRerenderForItem(target.fs_item_id);
  }

  function handleCommentDrop(targetItem, toQ, payload){
    if(!payload||payload.kind!=='comment') return;
    if(payload.fsItemId===targetItem.fs_item_id&&payload.fromQueue===toQ) return;
    var source=getFsItemById(payload.fsItemId);
    if(!source) return;
    syncFsFromDom();
    var existing=effectiveComment(targetItem, toQ).trim();
    if(existing){
      ensureFsUiState();
      data.ui_state.fs_comment_merge={
        sourceId: source.fs_item_id,
        targetId: targetItem.fs_item_id,
        fromQueue: payload.fromQueue,
        toQueue: toQ
      };
      endFsDrag();
      saveSectionsFromDom();
      fsRerenderForItem(targetItem.fs_item_id);
      return;
    }
    applyCommentMove(source, targetItem, payload.fromQueue, toQ, 'replace');
  }

  function endFsDrag(){
    fsDragPayload=null;
    clearFsDropTargets();
  }

  function updateOrgActiveCheckbox(q){
    syncOrgActiveFromFs();
    var orgRow=document.querySelector('tr[data-org-q="'+q+'"]');
    if(orgRow&&data.customer&&data.customer.org_volume&&data.customer.org_volume.queues[q]){
      var cb=orgRow.querySelector('input[type=checkbox]');
      if(cb) cb.checked=!!data.customer.org_volume.queues[q].active;
    }
  }

  function captureFsScrollState(triggerEl){
    var fsEl=document.querySelector('.fs-scroll');
    if(!fsEl) return { scrollTop: 0, winScroll: window.scrollY };
    var state={ scrollTop: fsEl.scrollTop, winScroll: window.scrollY, offset: null, rowKey: null };
    if(triggerEl){
      var row=triggerEl.closest('tr');
      if(row&&fsEl.contains(row)){
        state.offset=row.getBoundingClientRect().top-fsEl.getBoundingClientRect().top;
        state.rowKey=row.getAttribute('data-fs-grp')||row.getAttribute('data-fs-row');
      }
    }
    return state;
  }

  function restoreFsScrollState(state){
    if(!state) return;
    var fsEl=document.querySelector('.fs-scroll');
    if(!fsEl) return;
    if(state.rowKey!=null&&state.offset!=null){
      var row=fsEl.querySelector('tr[data-fs-grp="'+state.rowKey+'"]')
        ||fsEl.querySelector('tr[data-fs-row="'+state.rowKey+'"]');
      if(row){
        fsEl.scrollTop+=row.getBoundingClientRect().top-fsEl.getBoundingClientRect().top-state.offset;
        window.scrollTo(0,state.winScroll||0);
        return;
      }
    }
    fsEl.scrollTop=state.scrollTop||0;
    window.scrollTo(0,state.winScroll||0);
  }

  function fsRerender(triggerEl){
    syncFsFromDom();
    saveSectionsFromDom();
    var scrollState=captureFsScrollState(triggerEl);
    render();
    restoreFsScrollState(scrollState);
  }

  function fsRerenderForItem(fsItemId){
    var fsEl=document.querySelector('.fs-scroll');
    var triggerEl=fsEl&&fsEl.querySelector('tr[data-fs-row="'+fsItemId+'"]');
    fsRerender(triggerEl||null);
  }

  function bindFsEvents(){
    var collapseBtn=document.querySelector('[data-fs-collapse-sections]');
    if(collapseBtn) collapseBtn.addEventListener('click',function(){
      ensureFsUiState();
      var groups=groupItems(data.fs.items);
      var allCollapsed=groups.length>0&&groups.every(function(grp){return !uiOpen('fs_groups',grp.group,false);});
      if(allCollapsed){
        var toExpand={};
        groups.forEach(function(grp){ toExpand[grp.group]=true; });
        data.ui_state.fs_groups=toExpand;
      } else {
        data.ui_state.fs_groups={};
      }
      fsRerender(collapseBtn);
    });
    var resetFilterBtn=document.querySelector('[data-fs-reset-yes-filter]');
    if(resetFilterBtn) resetFilterBtn.addEventListener('click',function(){
      ensureFsUiState();
      data.ui_state.fs_yes_filter=null;
      fsRerender(resetFilterBtn);
    });
    var toggleNsiBtn=document.querySelector('[data-fs-toggle-nsi]');
    if(toggleNsiBtn) toggleNsiBtn.addEventListener('click',function(){
      ensureFsUiState();
      data.ui_state.fs_show_nsi=!fsShowNsi();
      fsRerender(toggleNsiBtn);
    });
    document.querySelectorAll('[data-fs-queue-expand]').forEach(function(btn){
      btn.addEventListener('click',function(e){
        e.stopPropagation();
        syncFsFromDom();
        saveSectionsFromDom();
        var q=btn.getAttribute('data-fs-queue-expand');
        ensureFsUiState();
        data.ui_state.fs_queue_cols[q]=!fsQueueExpanded(q);
        fsRerender(btn);
      });
    });
    document.querySelectorAll('[data-fs-yes-filter]').forEach(function(th){
      th.addEventListener('click',function(){
        syncFsFromDom();
        saveSectionsFromDom();
        var filter=th.getAttribute('data-fs-yes-filter');
        ensureFsUiState();
        var next=fsYesFilter()===filter?null:filter;
        data.ui_state.fs_yes_filter=next;
        if(next){
          var toExpand={};
          groupItems(data.fs.items).forEach(function(grp){
            if(grp.items.some(function(it){return itemMatchesYesFilter(it,next);}))
              toExpand[grp.group]=true;
          });
          data.ui_state.fs_groups=toExpand;
        }
        fsRerender(th);
      });
    });
    document.querySelectorAll('[data-fs-grp-toggle]').forEach(function(btn){
      btn.addEventListener('click',function(e){
        e.stopPropagation();
        syncFsFromDom();
        saveSectionsFromDom();
        var enc=btn.getAttribute('data-fs-grp-toggle');
        if(!enc) return;
        var key=decodeURIComponent(enc);
        ensureFsUiState();
        data.ui_state.fs_groups[key]=!uiOpen('fs_groups',key,false);
        fsRerender(btn);
      });
    });
    document.querySelectorAll('[data-fs-add-customer]').forEach(function(btn){
      btn.addEventListener('click',function(e){
        e.stopPropagation();
        syncFsFromDom();
        saveSectionsFromDom();
        var gp=btn.getAttribute('data-fs-add-customer');
        var groupEnc=btn.getAttribute('data-fs-group-name')||'';
        var groupName=decodeURIComponent(groupEnc);
        if(!gp||!isCustomerFsGroupPrefix(gp)||!data.fs) return;
        var newItem=createCustomerFsItem(gp, groupName, data.fs.items);
        data.fs.items.push(newItem);
        ensureFsUiState();
        data.ui_state.fs_groups[groupName]=true;
        fsCardDrafts[newItem.fs_item_id]=buildCardDraft(newItem);
        data.ui_state.fs_card=newItem.fs_item_id;
        fsRerender(btn);
      });
    });
    document.querySelectorAll('[data-fs-del-customer]').forEach(function(btn){
      btn.addEventListener('click',function(e){
        e.stopPropagation();
        syncFsFromDom();
        var fid=Number(btn.getAttribute('data-fs-del-customer'));
        if(!data.fs||!fid) return;
        data.fs.items=data.fs.items.filter(function(it){ return it.fs_item_id!==fid; });
        delete fsCardDrafts[fid];
        if(fsCardId()===fid){
          ensureFsUiState();
          data.ui_state.fs_card=null;
        }
        fsRerender(btn);
      });
    });
    document.querySelectorAll('.qcell').forEach(function(cell){
      var btn=cell.querySelector('button.yesno');
      if(!btn) return;
      cell.addEventListener('dragover',function(e){
        if(!fsDragPayload||fsDragPayload.kind!=='queue') return;
        if(Number(cell.getAttribute('data-fs'))!==fsDragPayload.fsItemId) return;
        e.preventDefault();
        clearFsDropTargets();
        cell.classList.add('fs-drop-target');
      });
      cell.addEventListener('dragleave',function(){
        cell.classList.remove('fs-drop-target');
      });
      cell.addEventListener('drop',function(e){
        e.preventDefault();
        e.stopPropagation();
        var payload=fsDragPayload;
        if(!payload||payload.kind!=='queue'){
          try{
            payload=JSON.parse(e.dataTransfer.getData('application/x-fs-queue'));
          }catch(err){ endFsDrag(); return; }
        }
        endFsDrag();
        var fid=Number(cell.getAttribute('data-fs'));
        var toQ=cell.getAttribute('data-q');
        if(!payload||payload.kind!=='queue'||payload.fsItemId!==fid||!toQ||payload.fromQueue===toQ) return;
        var it=getFsItemById(fid);
        if(!it) return;
        syncFsFromDom();
        moveToQueue(it, payload.fromQueue, toQ);
        updateOrgActiveCheckbox(toQ);
        fsRerender(cell);
      });
      if(btn.draggable){
        btn.addEventListener('dragstart',function(e){
          e.stopPropagation();
          var fid=Number(cell.getAttribute('data-fs'));
          var fromQ=cell.getAttribute('data-q');
          fsDragPayload={kind:'queue',fsItemId:fid,fromQueue:fromQ};
          e.dataTransfer.effectAllowed='move';
          e.dataTransfer.setData('application/x-fs-queue', JSON.stringify(fsDragPayload));
        });
        btn.addEventListener('dragend',function(){
          endFsDrag();
        });
      }
      btn.addEventListener('click',function(e){
        e.stopPropagation();
        var fid=Number(cell.getAttribute('data-fs'));
        var q=cell.getAttribute('data-q');
        var it=getFsItemById(fid);
        if(!it||!q) return;
        var queues=Object.assign({1:0,2:0,3:0,4:0},itemQueues(it));
        queues[q]=queues[q]===1?0:1;
        patchQueues(it,queues);
        updateOrgActiveCheckbox(q);
        fsRerender(btn);
      });
    });
    document.querySelectorAll('[data-fs-nmd]').forEach(function(sel){
      sel.addEventListener('change',function(){
        var fid=Number(sel.getAttribute('data-fs-nmd'));
        var q=sel.getAttribute('data-q');
        var it=getFsItemById(fid);
        if(!it||!q) return;
        var patch=patchFsItemQueueNmd(it,q,sel.value);
        it.queue_nmd_json=patch.queue_nmd_json;
        fsRerender(sel);
      });
    });
    document.querySelectorAll('[data-fs-nmd-reset]').forEach(function(btn){
      btn.addEventListener('click',function(e){
        e.stopPropagation();
        var fid=Number(btn.getAttribute('data-fs-nmd-reset'));
        var q=btn.getAttribute('data-q');
        var it=getFsItemById(fid);
        if(!it||!q) return;
        var patch=resetNmd(it,q);
        it.queue_nmd_json=patch.queue_nmd_json;
        fsRerender(btn);
      });
    });
    document.querySelectorAll('[data-fs-comment]').forEach(function(btn){
      if(btn.draggable){
        btn.addEventListener('dragstart',function(e){
          e.stopPropagation();
          var fid=Number(btn.getAttribute('data-fs-comment'));
          var fromQ=btn.getAttribute('data-q');
          fsDragPayload={kind:'comment',fsItemId:fid,fromQueue:fromQ};
          e.dataTransfer.effectAllowed='move';
          e.dataTransfer.setData('application/x-fs-comment', JSON.stringify(fsDragPayload));
        });
        btn.addEventListener('dragend',function(){
          endFsDrag();
        });
      }
      btn.addEventListener('click',function(){
        syncFsFromDom();
        saveSectionsFromDom();
        var fid=btn.getAttribute('data-fs-comment');
        var q=btn.getAttribute('data-q');
        ensureFsUiState();
        fsCommentDraft='';
        data.ui_state.fs_comment=fid+':'+q;
        fsRerender(btn);
      });
    });
    document.querySelectorAll('[data-fs-comment-cell]').forEach(function(cell){
      cell.addEventListener('click',function(e){
        if(e.target.closest('[data-fs-comment]')) return;
        syncFsFromDom();
        saveSectionsFromDom();
        var fid=cell.getAttribute('data-fs-comment-cell');
        var q=cell.getAttribute('data-q');
        if(!fid||!q) return;
        ensureFsUiState();
        fsCommentDraft='';
        data.ui_state.fs_comment=fid+':'+q;
        fsRerender(cell);
      });
      cell.addEventListener('dragover',function(e){
        if(!fsDragPayload||fsDragPayload.kind!=='comment') return;
        e.preventDefault();
        clearFsDropTargets();
        cell.classList.add('fs-drop-target');
      });
      cell.addEventListener('dragleave',function(){
        cell.classList.remove('fs-drop-target');
      });
      cell.addEventListener('drop',function(e){
        e.preventDefault();
        e.stopPropagation();
        var payload=fsDragPayload;
        if(!payload||payload.kind!=='comment'){
          try{
            payload=JSON.parse(e.dataTransfer.getData('application/x-fs-comment'));
          }catch(err){ endFsDrag(); return; }
        }
        endFsDrag();
        var fid=Number(cell.getAttribute('data-fs-comment-cell'));
        var toQ=cell.getAttribute('data-q');
        var target=getFsItemById(fid);
        if(!target||!toQ||!payload||payload.kind!=='comment') return;
        handleCommentDrop(target, toQ, payload);
      });
    });
    document.querySelectorAll('[data-fs-comment-merge]').forEach(function(btn){
      btn.addEventListener('click',function(){
        var merge=fsCommentMerge();
        if(!merge) return;
        var source=getFsItemById(merge.sourceId);
        var target=getFsItemById(merge.targetId);
        if(!source||!target) return;
        var mode=btn.getAttribute('data-fs-comment-merge');
        ensureFsUiState();
        data.ui_state.fs_comment_merge=null;
        applyCommentMove(source, target, merge.fromQueue, merge.toQueue, mode==='merge'?'merge':'replace');
      });
    });
    document.querySelectorAll('[data-fs-card]').forEach(function(btn){
      btn.addEventListener('click',function(){
        syncFsFromDom();
        saveSectionsFromDom();
        var fid=Number(btn.getAttribute('data-fs-card'));
        var it=getFsItemById(fid);
        if(!it) return;
        ensureFsUiState();
        fsCardDrafts[fid]=buildCardDraft(it);
        data.ui_state.fs_card=fid;
        fsRerender(btn);
      });
    });
    document.querySelectorAll('[data-fs-modal-close]').forEach(function(btn){
      btn.addEventListener('click',function(){
        syncFsFromDom();
        saveSectionsFromDom();
        ensureFsUiState();
        data.ui_state.fs_card=null;
        data.ui_state.fs_comment=null;
        data.ui_state.fs_comment_merge=null;
        fsCommentDraft='';
        fsRerender(btn);
      });
    });
    var cardSave=document.querySelector('[data-fs-card-save]');
    if(cardSave) cardSave.addEventListener('click',function(){
      var cardId=fsCardId();
      if(cardId==null) return;
      var it=getFsItemById(cardId);
      if(!it) return;
      var draft=readCardDraftFromDom(cardId);
      if(isCustomerFsItem(it)&&!draft.name.trim()) return;
      applyCardDraft(it,draft);
      ensureFsUiState();
      data.ui_state.fs_card=null;
      delete fsCardDrafts[cardId];
      fsRerenderForItem(cardId);
    });
    var commentSave=document.querySelector('[data-fs-comment-save]');
    if(commentSave) commentSave.addEventListener('click',function(){
      var key=fsCommentKey();
      if(!key) return;
      var parts=key.split(':');
      var fid=Number(parts[0]), q=parts[1];
      var it=getFsItemById(fid);
      if(!it) return;
      var ta=document.querySelector('[data-fs-comment-text]');
      var text=ta?ta.value:'';
      var patch=patchFsItemQueueComment(it,q,text);
      it.queue_comment_json=patch.queue_comment_json;
      ensureFsUiState();
      data.ui_state.fs_comment=null;
      fsCommentDraft='';
      fsRerenderForItem(fid);
    });
    var addLineBtn=document.querySelector('[data-fs-card-add-line]');
    if(addLineBtn) addLineBtn.addEventListener('click',function(){
      var cardId=fsCardId();
      if(cardId==null) return;
      var draft=readCardDraftFromDom(cardId);
      if(!draft.detailLines) draft.detailLines=[];
      draft.detailLines.push({source:'customer',name:'',description:null,inactive:false,sort_order:draft.detailLines.length});
      fsCardDrafts[cardId]=draft;
      saveSectionsFromDom();
      fsRerenderForItem(cardId);
    });
    document.querySelectorAll('[data-fs-card-line-remove]').forEach(function(btn){
      btn.addEventListener('click',function(){
        var cardId=fsCardId();
        if(cardId==null) return;
        var idx=Number(btn.getAttribute('data-fs-card-line-remove'));
        var draft=readCardDraftFromDom(cardId);
        draft.detailLines=(draft.detailLines||[]).filter(function(_,i){return i!==idx;});
        fsCardDrafts[cardId]=draft;
        saveSectionsFromDom();
        fsRerenderForItem(cardId);
      });
    });
    document.querySelectorAll('[data-fs-card-line-revert]').forEach(function(btn){
      btn.addEventListener('click',function(){
        var cardId=fsCardId();
        if(cardId==null) return;
        var idx=Number(btn.getAttribute('data-fs-card-line-revert'));
        var draft=readCardDraftFromDom(cardId);
        var line=(draft.detailLines||[])[idx];
        if(!line||line.source!=='nsi') return;
        line.name=line.nsi_name||line.name;
        line.description=line.nsi_description||null;
        line.inactive=false;
        fsCardDrafts[cardId]=draft;
        saveSectionsFromDom();
        fsRerenderForItem(cardId);
      });
    });
    document.querySelectorAll('.fs-modal-overlay').forEach(function(overlay){
      overlay.addEventListener('click',function(){
        syncFsFromDom();
        saveSectionsFromDom();
        ensureFsUiState();
        data.ui_state.fs_card=null;
        data.ui_state.fs_comment=null;
        data.ui_state.fs_comment_merge=null;
        fsCommentDraft='';
        fsRerender(null);
      });
    });
  }
`;
}
