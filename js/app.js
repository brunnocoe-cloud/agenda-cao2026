(() => {
  'use strict';

  /* ================= STATE / STORAGE ================= */
  const STORAGE_KEY = 'agenda-pmmg-cao2226';

  const DEFAULT_COLORS = [
    '#c9a13d','#8fa9c9','#a97fbf','#5a8f6b','#c0503f','#c98c3d','#6fb0a8','#b0779a','#7d8ec9','#a3a3a3',
    '#d98a58','#6f9954','#9e5b8f','#5f7fa6','#c2a878','#4f9a94','#a45c5c','#8a8fbf'
  ];

  // Catálogo oficial — Lista de Telefones, Docentes CAO II 2026 (CPP/APM-PMMG)
  const CATALOGO_DISCIPLINAS = [
    { nome:'Estatística', professor:'Frederico Martins de Paula Neto' },
    { nome:'Comunicação Organizacional', professor:'Raphael Alexandrino Damásio' },
    { nome:'Gerenciamento Integrado de Crises', professor:'Tomás Hilário Cardoso Ferreira' },
    { nome:'Gestão de Operações Policiais', professor:'Filipe Cardoso Borges' },
    { nome:'Gestão de Pessoas', professor:'Marcelo Ribeiro Vilas Boas' },
    { nome:'Gestão de Projetos', professor:'Luiz Eduardo Mateus Machado' },
    { nome:'Gestão do Conhecimento', professor:'Filipe Castro Gaigher' },
    { nome:'Gestão Logística', professor:'Paulo Henrique João Silva' },
    { nome:'Gestão Orçamentária e Financeira', professor:'Thiago Matias Brey Gil' },
    { nome:'Gestão por Processos', professor:'João Paulo Fiúza da Silva' },
    { nome:'Gestão Pública Contemporânea', professor:'Tiago Farias Braga' },
    { nome:'Introdução à Geopolítica aplicada', professor:'Danny Zahreddine' },
    { nome:'Metodologia de Pesquisa I', professor:'Francis Albert Cotta Formiga' },
    { nome:'Metodologia de Pesquisa II', professor:'Silvio José de Sousa Filho' },
    { nome:'Planejamento Estratégico e Trabalho de Comando', professor:'Ricardo Belini Muffato de Souza' },
    { nome:'Políticas Públicas e Segurança Pública', professor:'Adriano Sérgio Lopes da Gama Cerqueira' },
    { nome:'Saúde Integral na gestão de equipes e qualidade de vida na tropa', professor:'Patrícia Calado Pena' },
    { nome:'Tecnologia da Informação', professor:'' },
    { nome:'Seminário de Boas Práticas em Ciências Policiais', professor:'' },
    { nome:'Tópicos Contemporâneos: Inteligência, Segurança e Defesa', professor:'' },
    { nome:'Sociologia do Crime e da Violência', professor:'' }
  ];

  const DEFAULT_STATE = {
    disciplinas: [],
    trabalhos: [],
    horarios: [],
    config: { driveGeral: '' }
  };

  const DEFAULT_DRIVE_GERAL = 'https://drive.google.com/drive/folders/1QyV8h_ewckUJNvNAPOC2uuXc_xJ7lX8w?usp=sharing';

  function buildCatalogDisciplinas(){
    return CATALOGO_DISCIPLINAS.map((d, i) => ({
      id: uid(),
      nome: d.nome,
      professor: d.professor,
      cor: DEFAULT_COLORS[i % DEFAULT_COLORS.length]
    }));
  }

  function loadState(){
    try{
      const raw = localStorage.getItem(STORAGE_KEY);
      if(!raw) return structuredClone(DEFAULT_STATE);
      const parsed = JSON.parse(raw);
      const merged = Object.assign(structuredClone(DEFAULT_STATE), parsed);
      // migração: horários gravados antes do recorte por semana viram parte da semana atual
      const thisWeek = weekKeyOf(todayMidnight());
      merged.horarios.forEach(h => { if(!h.semana) h.semana = thisWeek; });
      return merged;
    }catch(e){
      console.warn('Falha ao ler dados salvos, iniciando vazio.', e);
      return structuredClone(DEFAULT_STATE);
    }
  }

  // Compartilhamento em nuvem (Firebase Firestore) — opcional. Sem config, o site
  // funciona normalmente, mas cada navegador guarda seus próprios dados.
  const TURMA_ID = 'cao2-2026';
  const FS_ENABLED = !!(window.FIREBASE_CONFIG && window.FIREBASE_CONFIG.apiKey && typeof firebase !== 'undefined');
  let turmaRef = null;
  if(FS_ENABLED){
    firebase.initializeApp(window.FIREBASE_CONFIG);
    const db = firebase.firestore();
    try{ db.enablePersistence({ synchronizeTabs:true }).catch(()=>{}); }catch(e){}
    turmaRef = db.collection('turmas').doc(TURMA_ID);
  }

  function saveState(){
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    if(FS_ENABLED){
      turmaRef.set({
        disciplinas: state.disciplinas,
        trabalhos: state.trabalhos,
        horarios: state.horarios,
        config: state.config
      }).catch(err => console.error('Erro ao sincronizar com a nuvem:', err));
    }
  }

  let state = loadState();

  function uid(){
    return Date.now().toString(36) + Math.random().toString(36).slice(2,8);
  }

  if(FS_ENABLED){
    turmaRef.onSnapshot(doc => {
      if(!doc.exists){
        // primeiro acesso desta turma: semeia o catálogo oficial na nuvem
        turmaRef.set({
          disciplinas: buildCatalogDisciplinas(),
          trabalhos: [],
          horarios: [],
          config: { driveGeral: DEFAULT_DRIVE_GERAL }
        }).catch(err => console.error('Erro ao inicializar dados na nuvem:', err));
        return;
      }
      state = Object.assign(structuredClone(DEFAULT_STATE), doc.data());
      if(!state.config) state.config = { driveGeral:'' };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      refreshDisciplinaFilters();
      renderDashboard(); renderTaskTable(); renderCalendar(); renderSchedule(); renderDisciplines(); renderDriveWidget();
    }, err => console.error('Erro ao ouvir atualizações da nuvem:', err));
  } else {
    if(state.disciplinas.length === 0){
      state.disciplinas = buildCatalogDisciplinas();
      saveState();
    }
    if(!state.config) state.config = { driveGeral:'' };
    if(!state.config.driveGeral){
      state.config.driveGeral = DEFAULT_DRIVE_GERAL;
      saveState();
    }
  }

  /* ================= HELPERS ================= */
  const $ = (sel, root=document) => root.querySelector(sel);
  const $$ = (sel, root=document) => Array.from(root.querySelectorAll(sel));

  function parseDate(str){
    // 'YYYY-MM-DD' -> local Date at midnight
    const [y,m,d] = str.split('-').map(Number);
    return new Date(y, m-1, d);
  }

  function todayMidnight(){
    const t = new Date();
    return new Date(t.getFullYear(), t.getMonth(), t.getDate());
  }

  function daysBetween(dateA, dateB){
    return Math.round((dateA - dateB) / 86400000);
  }

  function mondayOf(date){
    const day = date.getDay(); // 0=Dom..6=Sáb
    const diff = day === 0 ? -6 : 1 - day;
    return new Date(date.getFullYear(), date.getMonth(), date.getDate()+diff);
  }

  function weekKeyOf(date){
    return toISO(mondayOf(date));
  }

  function formatDatePt(d){
    return d.toLocaleDateString('pt-BR', { day:'2-digit', month:'2-digit', year:'numeric' });
  }

  const TIPO_LABELS = {
    trabalho:'Trabalho', artigo:'Artigo', seminario:'Seminário',
    prova:'Prova', apresentacao:'Apresentação', leitura:'Leitura'
  };

  const WEEKDAY_LABELS = ['Domingo','Segunda','Terça','Quarta','Quinta','Sexta','Sábado'];
  const WEEKDAY_SHORT = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];

  function getDisciplina(id){
    return state.disciplinas.find(d => d.id === id);
  }

  function disciplinaColor(id){
    const d = getDisciplina(id);
    return d ? d.cor : '#888';
  }

  function disciplinaName(id){
    const d = getDisciplina(id);
    return d ? d.nome : '(sem disciplina)';
  }

  function urgencyClass(days){
    if(days < 0) return 'ok';
    if(days <= 2) return 'urgent';
    if(days <= 6) return 'soon';
    return 'ok';
  }

  /* ================= NAVIGATION ================= */
  const VIEW_TITLES = {
    dashboard:'Painel', agenda:'Agenda', trabalhos:'Trabalhos',
    horarios:'Horários', disciplinas:'Disciplinas'
  };

  function switchView(view){
    $$('.nav-item').forEach(b => b.classList.toggle('active', b.dataset.view === view));
    $$('.view').forEach(v => v.classList.toggle('hidden', v.id !== `view-${view}`));
    $('#view-title').textContent = VIEW_TITLES[view] || '';
    if(view === 'agenda') renderCalendar();
    if(view === 'trabalhos') renderTaskTable();
    if(view === 'horarios') renderSchedule();
    if(view === 'disciplinas'){ renderDisciplines(); renderCargaHoraria(); startChAutoRefresh(); } else { stopChAutoRefresh(); }
    if(view === 'dashboard') renderDashboard();
  }

  $$('.nav-item').forEach(btn => {
    btn.addEventListener('click', () => switchView(btn.dataset.view));
  });

  /* ================= DASHBOARD ================= */
  function renderDashboard(){
    const today = todayMidnight();
    const pendentes = state.trabalhos.filter(t => !t.concluido);
    const urgentes = pendentes.filter(t => daysBetween(parseDate(t.data), today) <= 2 && daysBetween(parseDate(t.data), today) >= 0);
    const atrasados = pendentes.filter(t => daysBetween(parseDate(t.data), today) < 0);
    const concluidos = state.trabalhos.filter(t => t.concluido);

    $('#stats-row').innerHTML = `
      <div class="stat-card"><div class="stat-value">${pendentes.length}</div><div class="stat-label">Pendentes</div></div>
      <div class="stat-card"><div class="stat-value">${urgentes.length}</div><div class="stat-label">Urgentes (≤ 2 dias)</div></div>
      <div class="stat-card"><div class="stat-value">${atrasados.length}</div><div class="stat-label">Atrasados</div></div>
      <div class="stat-card"><div class="stat-value">${concluidos.length}</div><div class="stat-label">Concluídos</div></div>
    `;

    const grid = $('#deadline-grid');
    const upcoming = pendentes
      .slice()
      .sort((a,b) => parseDate(a.data) - parseDate(b.data))
      .slice(0, 9);

    if(upcoming.length === 0){
      grid.innerHTML = `<div class="empty-state">Nenhum trabalho pendente. Clique em "Novo trabalho" para lançar um prazo.</div>`;
    } else {
      grid.innerHTML = upcoming.map(t => {
        const d = parseDate(t.data);
        const days = daysBetween(d, today);
        const cls = urgencyClass(days);
        const daysLabel = days === 0 ? 'HOJE' : days === 1 ? 'AMANHÃ' : days < 0 ? `${Math.abs(days)}d atraso` : `${days}`;
        const sub = days < 0 || days === 0 || days === 1 ? '' : 'dias';
        return `
          <div class="deadline-card ${cls}" data-open-task="${t.id}">
            <div class="deadline-top">
              <div class="deadline-days ${cls}">${daysLabel}${sub ? `<small>${sub}</small>` : ''}</div>
              <span class="deadline-tag" style="background:${disciplinaColor(t.disciplinaId)}">${TIPO_LABELS[t.tipo]||t.tipo}</span>
            </div>
            <div class="deadline-title">${escapeHtml(t.titulo)}</div>
            <div class="deadline-meta">
              <span>${escapeHtml(disciplinaName(t.disciplinaId))}</span>
              <span>${formatDatePt(d)}</span>
            </div>
          </div>
        `;
      }).join('');
    }

    $$('[data-open-task]', grid).forEach(el => {
      el.addEventListener('click', () => openTaskModal(el.dataset.openTask));
    });

    // Today's classes
    const now = new Date();
    const dow = now.getDay();
    const currentWeek = weekKeyOf(now);
    $('#today-label').textContent = now.toLocaleDateString('pt-BR', { weekday:'long', day:'2-digit', month:'long' });
    const todays = state.horarios.filter(h => h.semana === currentWeek && Number(h.dia) === dow).sort((a,b) => Number(a.slot) - Number(b.slot));
    const list = $('#today-list');
    if(todays.length === 0){
      list.innerHTML = `<div class="empty-state">Sem aulas previstas para hoje.</div>`;
    } else {
      list.innerHTML = todays.map(h => {
        const slotInfo = SLOTS.find(s => s.id === Number(h.slot));
        return `
        <div class="today-item">
          <span class="today-dot" style="background:${horarioColor(h)}"></span>
          <span class="today-time">${slotInfo ? slotInfo.inicio+' – '+slotInfo.fim : ''}</span>
          <span class="today-name">${escapeHtml(horarioLabel(h))}</span>
          <span class="today-place">${escapeHtml(h.local||'')}</span>
        </div>
      `;
      }).join('');
    }
  }

  function escapeHtml(str){
    const div = document.createElement('div');
    div.textContent = str ?? '';
    return div.innerHTML;
  }

  function escapeAttr(str){
    return escapeHtml(str).replace(/"/g, '&quot;');
  }

  function isSafeUrl(str){
    return typeof str === 'string' && /^https?:\/\//i.test(str.trim());
  }

  /* ================= CALENDAR (AGENDA) ================= */
  let calCursor = todayMidnight(); // any date within the displayed month

  $('#cal-prev').addEventListener('click', () => {
    calCursor = new Date(calCursor.getFullYear(), calCursor.getMonth()-1, 1);
    renderCalendar();
  });
  $('#cal-next').addEventListener('click', () => {
    calCursor = new Date(calCursor.getFullYear(), calCursor.getMonth()+1, 1);
    renderCalendar();
  });

  function renderCalendar(){
    const year = calCursor.getFullYear();
    const month = calCursor.getMonth();
    $('#cal-month-label').textContent = calCursor.toLocaleDateString('pt-BR',{month:'long',year:'numeric'})
      .replace(/^./, c => c.toUpperCase());

    const firstOfMonth = new Date(year, month, 1);
    const startOffset = firstOfMonth.getDay(); // 0=Sun
    const daysInMonth = new Date(year, month+1, 0).getDate();
    const daysInPrevMonth = new Date(year, month, 0).getDate();
    const today = todayMidnight();

    const tasksByDate = {};
    state.trabalhos.forEach(t => {
      (tasksByDate[t.data] ||= []).push(t);
    });

    const cells = [];
    const totalCells = Math.ceil((startOffset + daysInMonth) / 7) * 7;

    for(let i=0; i<totalCells; i++){
      let dayNum, cellDate, otherMonth = false;
      if(i < startOffset){
        dayNum = daysInPrevMonth - startOffset + i + 1;
        cellDate = new Date(year, month-1, dayNum);
        otherMonth = true;
      } else if(i >= startOffset + daysInMonth){
        dayNum = i - startOffset - daysInMonth + 1;
        cellDate = new Date(year, month+1, dayNum);
        otherMonth = true;
      } else {
        dayNum = i - startOffset + 1;
        cellDate = new Date(year, month, dayNum);
      }
      const iso = toISO(cellDate);
      const dayTasks = (tasksByDate[iso] || []).slice().sort((a,b)=>a.titulo.localeCompare(b.titulo));
      const isToday = daysBetween(cellDate, today) === 0;

      const maxShow = 3;
      const pillsHtml = dayTasks.slice(0, maxShow).map(t => `
        <div class="cal-task-pill" style="background:${disciplinaColor(t.disciplinaId)}" data-open-task="${t.id}" title="${escapeHtml(t.titulo)}">${escapeHtml(t.titulo)}</div>
      `).join('');
      const moreHtml = dayTasks.length > maxShow ? `<div class="cal-more" data-day="${iso}">+${dayTasks.length - maxShow} mais</div>` : '';

      cells.push(`
        <div class="cal-day ${otherMonth?'other-month':''} ${isToday?'today':''}">
          <div class="cal-daynum">${dayNum}</div>
          ${pillsHtml}
          ${moreHtml}
        </div>
      `);
    }

    $('#calendar-grid').innerHTML = cells.join('');

    $$('[data-open-task]', $('#calendar-grid')).forEach(el => {
      el.addEventListener('click', (e) => { e.stopPropagation(); openTaskModal(el.dataset.openTask); });
    });
    $$('[data-day]', $('#calendar-grid')).forEach(el => {
      el.addEventListener('click', (e) => showDayPopover(e, el.dataset.day, tasksByDate[el.dataset.day]||[]));
    });
  }

  function toISO(d){
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  }

  function showDayPopover(evt, iso, tasks){
    const pop = $('#day-popover');
    pop.innerHTML = `<h4>${formatDatePt(parseDate(iso))}</h4>` + tasks.map(t =>
      `<div class="pop-item" data-open-task="${t.id}" style="cursor:pointer;border-left:3px solid ${disciplinaColor(t.disciplinaId)};padding-left:8px;">${escapeHtml(t.titulo)}</div>`
    ).join('');
    const rect = evt.target.getBoundingClientRect();
    pop.style.top = `${rect.bottom + 6}px`;
    pop.style.left = `${Math.min(rect.left, window.innerWidth - 320)}px`;
    pop.classList.remove('hidden');
    $$('[data-open-task]', pop).forEach(el => el.addEventListener('click', () => { pop.classList.add('hidden'); openTaskModal(el.dataset.openTask); }));
  }
  document.addEventListener('click', (e) => {
    const pop = $('#day-popover');
    if(!pop.classList.contains('hidden') && !pop.contains(e.target) && !e.target.closest('[data-day]')){
      pop.classList.add('hidden');
    }
  });

  /* ================= TASK TABLE (TRABALHOS) ================= */
  function refreshDisciplinaFilters(){
    const opts = state.disciplinas.map(d => `<option value="${d.id}">${escapeHtml(d.nome)}</option>`).join('');
    $('#filter-disciplina').innerHTML = `<option value="">Todas as disciplinas</option>${opts}`;
    $('#task-disciplina').innerHTML = opts || '<option value="">Cadastre uma disciplina primeiro</option>';
  }

  function renderHorarioDisciplinePicker(selectedId, filterText){
    const picker = $('#horario-discipline-picker');
    const term = (filterText || '').trim().toLowerCase();
    const list = state.disciplinas
      .slice()
      .sort((a,b) => a.nome.localeCompare(b.nome))
      .filter(d => !term || d.nome.toLowerCase().includes(term) || (d.professor||'').toLowerCase().includes(term));

    if(list.length === 0){
      picker.innerHTML = `<div class="discipline-picker-empty">Nenhuma disciplina encontrada.</div>`;
      return;
    }

    picker.innerHTML = list.map(d => `
      <div class="discipline-picker-item ${d.id===selectedId?'selected':''}" data-pick-disc="${d.id}">
        <span class="discipline-picker-dot" style="background:${d.cor}"></span>
        <span class="discipline-picker-text">
          <span class="discipline-picker-name">${escapeHtml(d.nome)}</span>
          ${d.professor ? `<span class="discipline-picker-prof">${escapeHtml(d.professor)}</span>` : ''}
        </span>
      </div>
    `).join('');

    $$('[data-pick-disc]', picker).forEach(el => {
      el.addEventListener('click', () => {
        $('#horario-disciplina').value = el.dataset.pickDisc;
        $$('.discipline-picker-item', picker).forEach(x => x.classList.remove('selected'));
        el.classList.add('selected');
      });
    });
  }

  $('#horario-disciplina-search').addEventListener('input', (e) => {
    renderHorarioDisciplinePicker($('#horario-disciplina').value, e.target.value);
  });

  function renderTaskTable(){
    const today = todayMidnight();
    const filterDisc = $('#filter-disciplina').value;
    const filterStatus = $('#filter-status').value;

    let list = state.trabalhos.slice();
    if(filterDisc) list = list.filter(t => t.disciplinaId === filterDisc);
    if(filterStatus) list = list.filter(t => (filterStatus === 'concluido') === !!t.concluido);
    list.sort((a,b) => parseDate(a.data) - parseDate(b.data));

    const body = $('#task-table-body');
    if(list.length === 0){
      body.innerHTML = `<tr><td colspan="7"><div class="empty-state">Nenhum trabalho encontrado.</div></td></tr>`;
      return;
    }

    body.innerHTML = list.map(t => {
      const d = parseDate(t.data);
      const days = daysBetween(d, today);
      let remainingHtml;
      if(t.concluido){
        remainingHtml = `<span class="remaining-neg">concluído</span>`;
      } else if(days < 0){
        remainingHtml = `<span class="remaining-urgent">${Math.abs(days)}d em atraso</span>`;
      } else if(days === 0){
        remainingHtml = `<span class="remaining-urgent">hoje</span>`;
      } else if(days <= 2){
        remainingHtml = `<span class="remaining-urgent">${days}d</span>`;
      } else if(days <= 6){
        remainingHtml = `<span class="remaining-soon">${days}d</span>`;
      } else {
        remainingHtml = `${days}d`;
      }

      return `
        <tr>
          <td><span class="status-dot ${t.concluido?'concluido':'pendente'}" title="${t.concluido?'Concluído':'Pendente'}"></span></td>
          <td>${escapeHtml(t.titulo)}</td>
          <td><span class="chip" style="background:${disciplinaColor(t.disciplinaId)}">${escapeHtml(disciplinaName(t.disciplinaId))}</span></td>
          <td>${TIPO_LABELS[t.tipo]||t.tipo}</td>
          <td>${formatDatePt(d)}</td>
          <td>${remainingHtml}</td>
          <td>
            <div class="row-actions">
              <button class="row-btn" data-edit-task="${t.id}" title="Editar">✎</button>
              <button class="row-btn" data-del-task="${t.id}" title="Excluir">🗑</button>
            </div>
          </td>
        </tr>
      `;
    }).join('');

    $$('[data-edit-task]', body).forEach(b => b.addEventListener('click', () => openTaskModal(b.dataset.editTask)));
    $$('[data-del-task]', body).forEach(b => b.addEventListener('click', () => {
      if(confirm('Excluir este trabalho?')){
        state.trabalhos = state.trabalhos.filter(t => t.id !== b.dataset.delTask);
        saveState(); renderTaskTable(); renderDashboard();
      }
    }));
  }

  $('#filter-disciplina').addEventListener('change', renderTaskTable);
  $('#filter-status').addEventListener('change', renderTaskTable);

  /* ================= TASK MODAL ================= */
  const taskModal = $('#task-modal');
  const taskForm = $('#task-form');

  function openTaskModal(id){
    if(state.disciplinas.length === 0){
      alert('Cadastre ao menos uma disciplina antes de lançar um trabalho.');
      switchView('disciplinas');
      return;
    }
    refreshDisciplinaFilters();
    taskForm.reset();
    const isEdit = !!id;
    $('#task-modal-title').textContent = isEdit ? 'Editar trabalho' : 'Novo trabalho';
    $('#task-delete-btn').hidden = !isEdit;

    if(isEdit){
      const t = state.trabalhos.find(x => x.id === id);
      $('#task-id').value = t.id;
      $('#task-titulo').value = t.titulo;
      $('#task-disciplina').value = t.disciplinaId;
      $('#task-tipo').value = t.tipo;
      $('#task-data').value = t.data;
      $('#task-obs').value = t.obs || '';
      $('#task-concluido').checked = !!t.concluido;
    } else {
      $('#task-id').value = '';
      $('#task-data').value = toISO(todayMidnight());
    }
    taskModal.classList.remove('hidden');
  }

  taskForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const id = $('#task-id').value || uid();
    const payload = {
      id,
      titulo: $('#task-titulo').value.trim(),
      disciplinaId: $('#task-disciplina').value,
      tipo: $('#task-tipo').value,
      data: $('#task-data').value,
      obs: $('#task-obs').value.trim(),
      concluido: $('#task-concluido').checked
    };
    const idx = state.trabalhos.findIndex(t => t.id === id);
    if(idx >= 0) state.trabalhos[idx] = payload; else state.trabalhos.push(payload);
    saveState();
    closeModal('task-modal');
    renderDashboard(); renderTaskTable(); renderCalendar();
  });

  $('#task-delete-btn').addEventListener('click', () => {
    const id = $('#task-id').value;
    if(id && confirm('Excluir este trabalho?')){
      state.trabalhos = state.trabalhos.filter(t => t.id !== id);
      saveState();
      closeModal('task-modal');
      renderDashboard(); renderTaskTable(); renderCalendar();
    }
  });

  $('#new-task-btn').addEventListener('click', () => openTaskModal(null));

  /* ================= CARGA HORÁRIA (planilha do Google Sheets) ================= */
  // Planilha oficial de controle de carga horária — lida ao vivo, direto do
  // Google Sheets, então qualquer atualização na planilha reflete aqui sem
  // precisar mexer no site.
  const CH_SHEET_ID = '1VGY3ThyTrL6tPH08adQLLgI7Jd_InXUv';
  const CH_SHEET_GID = '918493808';
  const CH_CSV_URL = `https://docs.google.com/spreadsheets/d/${CH_SHEET_ID}/export?format=csv&gid=${CH_SHEET_GID}`;
  const CH_REFRESH_MS = 5 * 60 * 1000; // 5 minutos
  let chRefreshTimer = null;

  function parseCsv(text){
    const rows = [];
    let row = [], field = '', inQuotes = false;
    for(let i=0; i<text.length; i++){
      const c = text[i];
      if(inQuotes){
        if(c === '"'){
          if(text[i+1] === '"'){ field += '"'; i++; }
          else inQuotes = false;
        } else field += c;
      } else if(c === '"'){
        inQuotes = true;
      } else if(c === ','){
        row.push(field); field = '';
      } else if(c === '\r'){
        // ignora
      } else if(c === '\n'){
        row.push(field); rows.push(row); row = []; field = '';
      } else {
        field += c;
      }
    }
    if(field.length > 0 || row.length > 0){ row.push(field); rows.push(row); }
    return rows;
  }

  function parsePtNumber(str){
    if(!str) return 0;
    const cleaned = String(str).replace(/\./g,'').replace(',', '.').replace('%','').trim();
    const n = parseFloat(cleaned);
    return isNaN(n) ? 0 : n;
  }

  async function fetchCargaHoraria(){
    const res = await fetch(CH_CSV_URL, { cache:'no-store' });
    if(!res.ok) throw new Error('Falha ao buscar planilha de carga horária');
    const text = await res.text();
    const rows = parseCsv(text).filter(r => r.some(f => f.trim() !== ''));
    const dataRows = rows.slice(1);

    let currentArea = '';
    const disciplinas = [];
    const resumoLabels = {};
    let diasDecorridos = null, diasPrevistos = null, evolucao = null;

    dataRows.forEach((r, idx) => {
      const area = (r[0]||'').trim();
      if(area) currentArea = area;
      const nome = (r[1]||'').trim();
      if(nome){
        disciplinas.push({
          area: currentArea,
          nome,
          chPrevista: parsePtNumber(r[2]),
          chExecutada: parsePtNumber(r[3]),
          percentual: parsePtNumber(r[4])
        });
      }
      const label = (r[6]||'').trim();
      if(label) resumoLabels[label] = (r[7]||'').trim();
      if(idx === 0){
        if((r[9]||'').trim()) diasDecorridos = parsePtNumber(r[9]);
        if((r[10]||'').trim()) diasPrevistos = parsePtNumber(r[10]);
        if((r[11]||'').trim()) evolucao = parsePtNumber(r[11]);
      }
    });

    return {
      disciplinas,
      resumo: {
        chTotalPrevista: parsePtNumber(resumoLabels['C.H. Total Prevista:']),
        chTotalExecutada: parsePtNumber(resumoLabels['C.H. Total Executada:']),
        percentualTotal: parsePtNumber(resumoLabels['Porcentagem Total:']),
        diasDecorridos, diasPrevistos, evolucao
      }
    };
  }

  function fmtPct(n){
    return n.toLocaleString('pt-BR', { minimumFractionDigits:2, maximumFractionDigits:2 }) + '%';
  }

  async function renderCargaHoraria(){
    const body = $('#ch-table-body');
    const summary = $('#ch-summary');
    try{
      const { disciplinas, resumo } = await fetchCargaHoraria();

      const statsHtml = [
        `<div class="ch-stat"><div class="ch-stat-value">${resumo.chTotalPrevista}h</div><div class="ch-stat-label">C.H. total prevista</div></div>`,
        `<div class="ch-stat"><div class="ch-stat-value">${resumo.chTotalExecutada}h</div><div class="ch-stat-label">C.H. total executada</div></div>`,
        `<div class="ch-stat"><div class="ch-stat-value">${fmtPct(resumo.percentualTotal)}</div><div class="ch-stat-label">Progresso geral</div></div>`
      ];
      if(resumo.diasDecorridos != null){
        statsHtml.push(`<div class="ch-stat"><div class="ch-stat-value">${resumo.diasDecorridos}/${resumo.diasPrevistos}</div><div class="ch-stat-label">Dias letivos (${fmtPct(resumo.evolucao)})</div></div>`);
      }
      summary.innerHTML = statsHtml.join('');

      let lastArea = null;
      body.innerHTML = disciplinas.map(d => {
        let areaRow = '';
        if(d.area !== lastArea){
          areaRow = `<tr class="ch-area-row"><td colspan="4">${escapeHtml(d.area)}</td></tr>`;
          lastArea = d.area;
        }
        const pct = Math.max(0, Math.min(100, d.percentual));
        return `
          ${areaRow}
          <tr>
            <td>${escapeHtml(d.nome)}</td>
            <td>${d.chPrevista}h</td>
            <td>${d.chExecutada}h</td>
            <td>
              <div class="ch-progress-cell">
                <div class="ch-bar-wrap"><div class="ch-bar-fill" style="width:${pct}%"></div></div>
                <span class="ch-pct-label">${fmtPct(d.percentual)}</span>
              </div>
            </td>
          </tr>
        `;
      }).join('');

      $('#ch-updated-label').textContent = `Atualizado às ${new Date().toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})}`;
    }catch(err){
      console.error('Erro ao carregar planilha de carga horária:', err);
      body.innerHTML = `<tr><td colspan="4"><div class="empty-state">Não foi possível carregar os dados da planilha agora.</div></td></tr>`;
      summary.innerHTML = '';
      $('#ch-updated-label').textContent = '';
    }
  }

  function startChAutoRefresh(){
    stopChAutoRefresh();
    chRefreshTimer = setInterval(renderCargaHoraria, CH_REFRESH_MS);
  }
  function stopChAutoRefresh(){
    if(chRefreshTimer){ clearInterval(chRefreshTimer); chRefreshTimer = null; }
  }

  $('#ch-refresh-btn').addEventListener('click', renderCargaHoraria);

  /* ================= DISCIPLINES ================= */
  function renderDisciplines(){
    const grid = $('#discipline-grid');
    if(state.disciplinas.length === 0){
      grid.innerHTML = `<div class="empty-state">Nenhuma disciplina cadastrada ainda.</div>`;
      return;
    }
    grid.innerHTML = state.disciplinas.map(d => {
      const count = state.trabalhos.filter(t => t.disciplinaId === d.id).length;
      return `
        <div class="discipline-card" style="border-left-color:${d.cor}" data-edit-disc="${d.id}">
          <div class="discipline-name">${escapeHtml(d.nome)}</div>
          <div class="discipline-prof">${escapeHtml(d.professor || 'Instrutor não informado')}</div>
          <div class="discipline-count">${count} trabalho${count!==1?'s':''} lançado${count!==1?'s':''}</div>
          ${isSafeUrl(d.drive) ? `<a class="discipline-drive-link" href="${escapeAttr(d.drive)}" target="_blank" rel="noopener" data-stop>📁 Material didático</a>` : ''}
        </div>
      `;
    }).join('');
    $$('[data-edit-disc]', grid).forEach(el => el.addEventListener('click', () => openDisciplinaModal(el.dataset.editDisc)));
    $$('[data-stop]', grid).forEach(el => el.addEventListener('click', (e) => e.stopPropagation()));
  }

  const disciplinaModal = $('#disciplina-modal');
  const disciplinaForm = $('#disciplina-form');

  function buildSwatches(selected){
    $('#color-swatches').innerHTML = DEFAULT_COLORS.map(c =>
      `<span class="swatch ${c===selected?'selected':''}" style="background:${c}" data-color="${c}"></span>`
    ).join('');
    $('#disciplina-cor').value = selected;
    $$('.swatch', $('#color-swatches')).forEach(sw => {
      sw.addEventListener('click', () => {
        $$('.swatch', $('#color-swatches')).forEach(s => s.classList.remove('selected'));
        sw.classList.add('selected');
        $('#disciplina-cor').value = sw.dataset.color;
      });
    });
  }

  function openDisciplinaModal(id){
    disciplinaForm.reset();
    const isEdit = !!id;
    $('#disciplina-modal-title').textContent = isEdit ? 'Editar disciplina' : 'Nova disciplina';
    $('#disciplina-delete-btn').hidden = !isEdit;

    if(isEdit){
      const d = getDisciplina(id);
      $('#disciplina-id').value = d.id;
      $('#disciplina-nome').value = d.nome;
      $('#disciplina-professor').value = d.professor || '';
      $('#disciplina-drive').value = d.drive || '';
      buildSwatches(d.cor);
    } else {
      $('#disciplina-id').value = '';
      const used = state.disciplinas.map(d => d.cor);
      const next = DEFAULT_COLORS.find(c => !used.includes(c)) || DEFAULT_COLORS[0];
      buildSwatches(next);
    }
    disciplinaModal.classList.remove('hidden');
  }

  disciplinaForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const drive = $('#disciplina-drive').value.trim();
    if(drive && !isSafeUrl(drive)){
      alert('Link do Drive inválido. Use um endereço começando com http:// ou https://');
      return;
    }
    const id = $('#disciplina-id').value || uid();
    const payload = {
      id,
      nome: $('#disciplina-nome').value.trim(),
      professor: $('#disciplina-professor').value.trim(),
      drive,
      cor: $('#disciplina-cor').value
    };
    const idx = state.disciplinas.findIndex(d => d.id === id);
    if(idx >= 0) state.disciplinas[idx] = payload; else state.disciplinas.push(payload);
    saveState();
    closeModal('disciplina-modal');
    refreshDisciplinaFilters();
    renderDisciplines(); renderDashboard(); renderTaskTable(); renderCalendar(); renderSchedule();
  });

  $('#disciplina-delete-btn').addEventListener('click', () => {
    const id = $('#disciplina-id').value;
    if(!id) return;
    const inUse = state.trabalhos.some(t => t.disciplinaId === id) || state.horarios.some(h => h.disciplinaId === id);
    const msg = inUse
      ? 'Esta disciplina possui trabalhos ou horários vinculados que também serão removidos. Deseja continuar?'
      : 'Excluir esta disciplina?';
    if(confirm(msg)){
      state.disciplinas = state.disciplinas.filter(d => d.id !== id);
      state.trabalhos = state.trabalhos.filter(t => t.disciplinaId !== id);
      state.horarios = state.horarios.filter(h => h.disciplinaId !== id);
      saveState();
      closeModal('disciplina-modal');
      refreshDisciplinaFilters();
      renderDisciplines(); renderDashboard(); renderTaskTable(); renderCalendar(); renderSchedule();
    }
  });

  $('#new-disciplina-btn').addEventListener('click', () => openDisciplinaModal(null));

  $('#load-catalog-btn').addEventListener('click', () => {
    const existingNames = state.disciplinas.map(d => d.nome.toLowerCase());
    const faltantes = CATALOGO_DISCIPLINAS.filter(c => !existingNames.includes(c.nome.toLowerCase()));
    if(faltantes.length === 0){
      alert('Todas as disciplinas da lista oficial já estão cadastradas.');
      return;
    }
    const usadas = state.disciplinas.map(d => d.cor);
    let corIdx = 0;
    faltantes.forEach(c => {
      let tentativas = 0;
      while(usadas.includes(DEFAULT_COLORS[corIdx % DEFAULT_COLORS.length]) && tentativas < DEFAULT_COLORS.length){
        corIdx++; tentativas++;
      }
      const cor = DEFAULT_COLORS[corIdx % DEFAULT_COLORS.length];
      corIdx++;
      usadas.push(cor);
      state.disciplinas.push({ id: uid(), nome: c.nome, professor: c.professor, cor });
    });
    saveState();
    refreshDisciplinaFilters();
    renderDisciplines();
    alert(`${faltantes.length} disciplina(s) importada(s) da lista oficial.`);
  });

  /* ================= WEEKLY SCHEDULE (HORARIOS) ================= */
  // Grade fixa: aulas de segunda a sexta, em 4 blocos com intervalo/almoço/encerramento fixos.
  const SCH_DAYS = [1,2,3,4,5]; // Seg..Sex
  const SLOTS = [
    {id:1, inicio:'08h30', fim:'10h10'},
    {id:2, inicio:'10h30', fim:'12h10'},
    {id:3, inicio:'13h20', fim:'15h00'},
    {id:4, inicio:'15h20', fim:'17h00'}
  ];
  const BREAK_AFTER_SLOT = {
    1: 'Intervalo · 10h10 – 10h30',
    2: 'Almoço · 12h10 – 13h20',
    3: 'Intervalo · 15h00 – 15h20'
  };

  const EXTRA_COLOR = '#5f7fa6';

  let schCursor = todayMidnight(); // qualquer data dentro da semana exibida

  function findHorario(semana, dia, slot){
    return state.horarios.find(h => h.semana === semana && Number(h.dia) === Number(dia) && Number(h.slot) === Number(slot));
  }

  function horarioLabel(h){
    return h.tipo === 'extra' ? h.titulo : disciplinaName(h.disciplinaId);
  }
  function horarioColor(h){
    return h.tipo === 'extra' ? EXTRA_COLOR : disciplinaColor(h.disciplinaId);
  }

  function renderSchedule(){
    const monday = mondayOf(schCursor);
    const friday = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate()+4);
    const semana = toISO(monday);
    const fmt = d => d.toLocaleDateString('pt-BR', {day:'2-digit', month:'2-digit'});
    $('#sch-week-label').textContent = `Semana de ${fmt(monday)} a ${fmt(friday)} de ${friday.getFullYear()}`;

    const grid = $('#schedule-grid');
    let html = '';

    html += `<div class="sch-head">Aula</div>`;
    SCH_DAYS.forEach(d => html += `<div class="sch-head">${WEEKDAY_SHORT[d]}</div>`);

    SLOTS.forEach(slot => {
      html += `<div class="sch-slot-label">${slot.id}ª aula<span>${slot.inicio} – ${slot.fim}</span></div>`;
      SCH_DAYS.forEach(d => {
        const h = findHorario(semana, d, slot.id);
        if(h){
          html += `
            <div class="sch-daycell filled" data-edit-horario="${h.id}">
              <div class="sch-event ${h.tipo === 'extra' ? 'extra' : ''}" style="background:${horarioColor(h)}">
                ${escapeHtml(horarioLabel(h))}
                ${h.local ? `<span>${escapeHtml(h.local)}</span>` : ''}
              </div>
            </div>`;
        } else {
          html += `<div class="sch-daycell empty" data-new-horario="${d}:${slot.id}">+</div>`;
        }
      });

      const breakLabel = BREAK_AFTER_SLOT[slot.id];
      if(breakLabel){
        html += `<div class="sch-breakbar">${breakLabel}</div>`;
      }
    });

    html += `<div class="sch-closebar">Encerramento · 17h00</div>`;

    grid.innerHTML = html;

    $$('[data-edit-horario]', grid).forEach(el => {
      el.addEventListener('click', () => openHorarioModal(el.dataset.editHorario));
    });
    $$('[data-new-horario]', grid).forEach(el => {
      el.addEventListener('click', () => {
        const [dia, slot] = el.dataset.newHorario.split(':');
        openHorarioModal(null, dia, slot);
      });
    });
  }

  const horarioModal = $('#horario-modal');
  const horarioForm = $('#horario-form');

  function setHorarioTipo(tipo){
    $('#horario-tipo').value = tipo;
    $$('.type-toggle-btn', $('#horario-tipo-toggle')).forEach(b => b.classList.toggle('active', b.dataset.tipo === tipo));
    $('#horario-disciplina-fields').classList.toggle('hidden', tipo !== 'disciplina');
    $('#horario-extra-fields').classList.toggle('hidden', tipo !== 'extra');
  }

  $$('.type-toggle-btn', $('#horario-tipo-toggle')).forEach(btn => {
    btn.addEventListener('click', () => setHorarioTipo(btn.dataset.tipo));
  });

  function openHorarioModal(id, presetDia, presetSlot){
    refreshDisciplinaFilters();
    horarioForm.reset();
    const isEdit = !!id;
    $('#horario-modal-title').textContent = isEdit ? 'Editar horário' : 'Novo horário';
    $('#horario-delete-btn').hidden = !isEdit;

    if(isEdit){
      const h = state.horarios.find(x => x.id === id);
      $('#horario-id').value = h.id;
      $('#horario-semana').value = h.semana;
      $('#horario-disciplina').value = h.disciplinaId || '';
      $('#horario-extra-titulo').value = h.tipo === 'extra' ? (h.titulo || '') : '';
      $('#horario-dia').value = h.dia;
      $('#horario-slot').value = h.slot;
      $('#horario-local').value = h.local || '';
      setHorarioTipo(h.tipo === 'extra' ? 'extra' : 'disciplina');
    } else {
      $('#horario-id').value = '';
      $('#horario-disciplina').value = '';
      $('#horario-extra-titulo').value = '';
      $('#horario-semana').value = toISO(mondayOf(schCursor));
      if(presetDia) $('#horario-dia').value = presetDia;
      if(presetSlot) $('#horario-slot').value = presetSlot;
      setHorarioTipo('disciplina');
    }
    $('#horario-disciplina-search').value = '';
    renderHorarioDisciplinePicker($('#horario-disciplina').value, '');
    horarioModal.classList.remove('hidden');
  }

  horarioForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const tipo = $('#horario-tipo').value;
    if(tipo === 'disciplina' && !$('#horario-disciplina').value){
      alert('Selecione uma disciplina na lista.');
      return;
    }
    if(tipo === 'extra' && !$('#horario-extra-titulo').value.trim()){
      alert('Escreva o nome da atividade.');
      return;
    }
    const id = $('#horario-id').value || uid();
    const semana = $('#horario-semana').value;
    const dia = $('#horario-dia').value;
    const slot = $('#horario-slot').value;

    const existing = findHorario(semana, dia, slot);
    if(existing && existing.id !== id){
      if(!confirm(`Já existe "${horarioLabel(existing)}" nesse horário. Substituir?`)) return;
      state.horarios = state.horarios.filter(h => h.id !== existing.id);
    }

    const payload = tipo === 'extra'
      ? { id, semana, tipo, titulo: $('#horario-extra-titulo').value.trim(), dia, slot, local: $('#horario-local').value.trim() }
      : { id, semana, tipo, disciplinaId: $('#horario-disciplina').value, dia, slot, local: $('#horario-local').value.trim() };
    const idx = state.horarios.findIndex(h => h.id === id);
    if(idx >= 0) state.horarios[idx] = payload; else state.horarios.push(payload);
    saveState();
    closeModal('horario-modal');
    renderSchedule(); renderDashboard();
  });

  $('#horario-delete-btn').addEventListener('click', () => {
    const id = $('#horario-id').value;
    if(id && confirm('Excluir este horário?')){
      state.horarios = state.horarios.filter(h => h.id !== id);
      saveState();
      closeModal('horario-modal');
      renderSchedule(); renderDashboard();
    }
  });

  $('#new-horario-btn').addEventListener('click', () => openHorarioModal(null));

  $('#sch-prev').addEventListener('click', () => {
    schCursor = new Date(schCursor.getFullYear(), schCursor.getMonth(), schCursor.getDate()-7);
    renderSchedule();
  });
  $('#sch-next').addEventListener('click', () => {
    schCursor = new Date(schCursor.getFullYear(), schCursor.getMonth(), schCursor.getDate()+7);
    renderSchedule();
  });

  /* ================= MODAL GENERIC ================= */
  function closeModal(id){
    $(`#${id}`).classList.add('hidden');
  }
  $$('[data-close]').forEach(btn => {
    btn.addEventListener('click', () => closeModal(btn.dataset.close));
  });
  $$('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', (e) => {
      if(e.target === overlay) overlay.classList.add('hidden');
    });
  });
  document.addEventListener('keydown', (e) => {
    if(e.key === 'Escape') $$('.modal-overlay').forEach(o => o.classList.add('hidden'));
  });

  /* ================= EXPORT / IMPORT ================= */
  $('#export-btn').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(state, null, 2)], {type:'application/json'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `agenda-cao2226-backup-${toISO(new Date())}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  });

  $('#import-input').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if(!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try{
        const data = JSON.parse(reader.result);
        if(!data.disciplinas || !data.trabalhos || !data.horarios) throw new Error('Formato inválido');
        if(confirm('Importar substituirá todos os dados atuais. Continuar?')){
          state = Object.assign(structuredClone(DEFAULT_STATE), data);
          if(!state.config) state.config = { driveGeral:'' };
          saveState();
          refreshDisciplinaFilters();
          renderDashboard(); renderTaskTable(); renderCalendar(); renderSchedule(); renderDisciplines(); renderDriveWidget();
        }
      }catch(err){
        alert('Arquivo inválido. Selecione um backup exportado por este site.');
      }
      e.target.value = '';
    };
    reader.readAsText(file);
  });

  /* ================= DRIVE WIDGET (material didático) ================= */
  function renderDriveWidget(){
    const url = state.config.driveGeral || '';
    const link = $('#drive-link');
    if(isSafeUrl(url)){
      link.href = url;
      link.classList.remove('disabled');
      link.title = 'Abrir a pasta do material didático no Google Drive';
    } else {
      link.href = '#';
      link.classList.add('disabled');
      link.title = 'Nenhum link definido — clique no lápis ao lado para adicionar';
    }
  }

  function editDriveLink(){
    const current = state.config.driveGeral || '';
    const input = prompt('Cole o link da pasta do Google Drive com o material didático:', current);
    if(input === null) return;
    const trimmed = input.trim();
    if(trimmed && !isSafeUrl(trimmed)){
      alert('Link inválido. Use um endereço começando com http:// ou https://');
      return;
    }
    state.config.driveGeral = trimmed;
    saveState();
    renderDriveWidget();
  }

  $('#drive-link').addEventListener('click', (e) => {
    if(!isSafeUrl(state.config.driveGeral)){
      e.preventDefault();
      editDriveLink();
    }
  });
  $('#drive-edit-btn').addEventListener('click', editDriveLink);

  /* ================= INIT ================= */
  refreshDisciplinaFilters();
  renderDashboard();
  renderDriveWidget();
  switchView('dashboard');
})();
