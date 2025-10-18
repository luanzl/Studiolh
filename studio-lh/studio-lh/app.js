/* ======= UTIL ======= */
const $ = (sel, ctx=document)=>ctx.querySelector(sel);
const $$ = (sel, ctx=document)=>Array.from(ctx.querySelectorAll(sel));
const money = (n, cur='BRL') => new Intl.NumberFormat('pt-BR',{style:'currency',currency:cur}).format(n||0);
const parseMoney = (s) => Number(String(s).replace(/\./g,'').replace(',','.').replace(/[^\d.-]/g,''))||0;
const uid = () => Math.random().toString(36).slice(2)+Date.now().toString(36);
const todayISO = () => new Date().toISOString().slice(0,10);

/* ======= ESTADO ======= */
let state = {
  perfilId: null,
  perfis: [],
  cfg: {estudio:'Studio LH', moeda:'BRL', tema:'dark',
        wpp24:true, wpp2:true, autoBackup:false,
        msgWpp:'Olá! Lembrando do seu horário {{DATA}} às {{HORA}}.' ,
        cores:{ag:'#3b82f6', co:'#22c55e', ca:'#ef4444'},
        senhaHash:'' },
  data: {clientes:[], agenda:[], tx:[], an:[], usuarios:[], backups:[], lastLogin:''}
};

const LS_KEY = 'studioLH__perfis';             // índice de perfis
const NS = (pid) => `studioLH__${pid}__data`;  // namespace por perfil
const CFG = (pid) => `studioLH__${pid}__cfg`;

/* ======= STORAGE ======= */
function loadPerfis(){
  state.perfis = JSON.parse(localStorage.getItem(LS_KEY)||'[]');
  renderPerfis();
}
function savePerfis(){ localStorage.setItem(LS_KEY, JSON.stringify(state.perfis)); }
function ensurePerfilData(pid){
  if(!localStorage.getItem(NS(pid))){
    localStorage.setItem(NS(pid), JSON.stringify({clientes:[],agenda:[],tx:[],an:[],usuarios:[],backups:[], lastLogin:''}));
    localStorage.setItem(CFG(pid), JSON.stringify(state.cfg));
  }
}
function loadPerfil(pid){
  state.perfilId = pid; ensurePerfilData(pid);
  state.data = JSON.parse(localStorage.getItem(NS(pid)));
  state.cfg  = Object.assign({}, state.cfg, JSON.parse(localStorage.getItem(CFG(pid))));
  applyTheme(state.cfg.tema);
  // aplicar UI config
  $('#cfgEstudio').value = state.cfg.estudio||'';
  $('#cfgMoeda').value   = state.cfg.moeda||'BRL';
  $('#cfgTema').value    = state.cfg.tema||'dark';
  $('#cfgWpp24').checked = !!state.cfg.wpp24;
  $('#cfgWpp2').checked  = !!state.cfg.wpp2;
  $('#cfgAutoBackup').checked = !!state.cfg.autoBackup;
  $('#cfgMsgWpp').value = state.cfg.msgWpp||'';
  $('#corAg').value = state.cfg.cores.ag; $('#corCo').value = state.cfg.cores.co; $('#corCa').value = state.cfg.cores.ca;
  document.documentElement.style.setProperty('--cor-ag', state.cfg.cores.ag);
  document.documentElement.style.setProperty('--cor-co', state.cfg.cores.co);
  document.documentElement.style.setProperty('--cor-ca', state.cfg.cores.ca);

  $('#userBox').classList.remove('hidden');
  $('#userRole').textContent = 'Administrador';
  $('#loginCard').classList.add('hidden');
  $('#nav').classList.remove('hidden');

  state.data.lastLogin = new Date().toISOString();
  savePerfil();

  refreshAll();
  refreshSystemStats();
  refreshDbStatus();
  autoBackupIfNeeded();
}
function savePerfil(){
  localStorage.setItem(NS(state.perfilId), JSON.stringify(state.data));
  localStorage.setItem(CFG(state.perfilId), JSON.stringify(state.cfg));
  refreshKpis();
  refreshSystemStats();
  refreshDbStatus();
}

/* ======= HASH (simples) ======= */
const simpleHash = (s)=> btoa(unescape(encodeURIComponent(s))).split('').reverse().join('');

/* ======= INICIAL ======= */
document.addEventListener('DOMContentLoaded', init);
function init(){
  loadPerfis();
  if(state.perfis.length===0){
    const id = uid();
    state.perfis.push({id, nome:'👑 Administrador (Proprietário)', senhaHash:''});
    savePerfis();
  }
  renderPerfis();

  $('#agData').valueAsDate = new Date();
  $('#txData').valueAsDate = new Date();

  // eventos principais
  $('#btnEntrar').onclick = entrarSistema;
  $('#btnSair').onclick = ()=>location.reload();

  $('#btnAddFuncionario').onclick = addFuncionario; // tela de login
  $('#usAdd').onclick = addFuncionarioUsuarios;     // aba Usuários

  $('#btnAgendar').onclick = salvarAgendamento;
  $('#agImagem').addEventListener('change', previewImagem);

  $('#openReceita').onclick = ()=>openFormTx('receita');
  $('#openDespesa').onclick = ()=>openFormTx('despesa');
  $('#btnCloseTx').onclick = ()=>$('#formTransacao').classList.add('hidden');
  $('#btnAddTx').onclick = addTransacao;

  $('#btnAddCliente').onclick = addCliente;

  $('#btnSalvarAn').onclick = salvarAnamnese;
  $$('#tab-anamnese .btn.model').forEach(b=>b.onclick = ()=>gerarModelo(b.dataset.modelo));

  $('#btnExportar').onclick = exportarDados;
  $('#fileImport').addEventListener('change', importarDados);
  $('#btnBackup').onclick = backupManual;
  $('#btnRecuperar').onclick = recuperarUltimo;
  $('#btnRelatorio').onclick = exportarRelatorio;

  $('#btnSalvarCfg').onclick = salvarCfg;
  $('#btnSalvarCores').onclick = salvarCores;
  $('#btnLimparCache').onclick = limparCache;
  $('#btnResetApp').onclick = resetApp;
  $('#btnTestar').onclick = testarConexao;
  $('#btnTrocarSenha').onclick = trocarSenha;

  // buscas
  $('#buscaAgenda').oninput = renderAgenda;
  $('#buscaTx').oninput = renderTx;
  $('#buscaCliente').oninput = renderClientes;
  $('#buscaAn').oninput = renderAn;

  // navegação
  $$('#nav .tab').forEach(btn=>{
    btn.onclick = ()=>{
      $$('#nav .tab').forEach(b=>b.classList.remove('active'));
      btn.classList.add('active');
      const id = btn.dataset.tab;
      $$('.tabpane').forEach(p=>p.classList.remove('show'));
      $(`#tab-${id}`).classList.add('show');
    };
  });
}

/* ======= LOGIN & USUÁRIOS ======= */
function renderPerfis(){
  const sel = $('#selPerfil');
  sel.innerHTML = '<option value="">Escolha seu perfil</option>';
  state.perfis.forEach(p=>{
    const opt = document.createElement('option');
    opt.value = p.id; opt.textContent = p.nome;
    sel.appendChild(opt);
  });
}
function entrarSistema(){
  const pid = $('#selPerfil').value;
  if(!pid) return alert('Selecione um perfil.');
  const perfil = state.perfis.find(p=>p.id===pid);
  const senha = $('#senhaLogin').value;
  if(perfil?.senhaHash){
    if(simpleHash(senha)!==perfil.senhaHash){ alert('Senha incorreta.'); return; }
  }
  loadPerfil(pid);
}
function addFuncionario(){
  const nome = $('#novoFuncionarioNome').value.trim();
  const senha = $('#novoFuncionarioSenha').value.trim();
  if(!nome) return alert('Informe o nome.');
  const id = uid();
  state.perfis.push({id, nome, senhaHash: senha ? simpleHash(senha) : ''});
  savePerfis(); renderPerfis();
  ensurePerfilData(id);
  const now = new Date(); const dbr = now.toLocaleDateString('pt-BR');
  const data = JSON.parse(localStorage.getItem(NS(id)));
  data.usuarios.push({id:uid(), nome, criadoEm: now.toISOString(), dataBr:dbr});
  localStorage.setItem(NS(id), JSON.stringify(data));
  alert('Funcionário adicionado! Selecione o perfil na lista para entrar.');
}
function addFuncionarioUsuarios(){
  $('#novoFuncionarioNome').value = $('#usNome').value.trim();
  $('#novoFuncionarioSenha').value = $('#usSenha').value.trim();
  addFuncionario();
  $('#usNome').value=''; $('#usSenha').value='';
}
function renderUsuarios(){
  const box = $('#listaUsuarios'); box.innerHTML='';
  (state.data.usuarios||[]).forEach(u=>{
    const div = document.createElement('div');
    div.className='item';
    div.innerHTML = `<strong>${u.nome}</strong><div class="muted">Criado em: ${u.dataBr||'-'}</div>`;
    box.appendChild(div);
  });
  $('#usrAtual').textContent = 'Administrador';
  $('#usrTot').textContent = (state.data.usuarios||[]).length;
  $('#usrAtivos').textContent = (state.data.usuarios||[]).length; // simplificado
  $('#usrLogin').textContent = state.data.lastLogin ? new Date(state.data.lastLogin).toLocaleString('pt-BR') : '—';
}

/* ======= AGENDA ======= */
function previewImagem(evt){
  const file = evt.target.files[0];
  if(!file) return $('#agPreview').classList.add('hidden');
  const reader = new FileReader();
  reader.onload = e=>{
    $('#agPreview').innerHTML = `<img src="${e.target.result}" alt="preview">`;
    $('#agPreview').classList.remove('hidden');
  };
  reader.readAsDataURL(file);
}
function salvarAgendamento(){
  const idc = $('#agCliente').value;
  const cliente = state.data.clientes.find(c=>c.id===idc);
  if(!cliente) return alert('Selecione um cliente.');
  const obj = {
    id: uid(),
    clienteId: idc, clienteNome: cliente.nome,
    servico: $('#agServico').value.trim(),
    data: $('#agData').value || todayISO(),
    dataBr: new Date($('#agData').value || Date.now()).toLocaleDateString('pt-BR'),
    hora: $('#agHora').value,
    valor: parseMoney($('#agValor').value),
    status: $('#agStatus').value,
    obs: $('#agObs').value.trim(),
    img: $('#agPreview img') ? $('#agPreview img')?.src : ''
  };
  state.data.agenda.push(obj); savePerfil();
  $('#agServico').value=''; $('#agObs').value=''; $('#agImagem').value=''; $('#agPreview').classList.add('hidden');
  renderAgenda();
}
function delAgendamento(id){
  state.data.agenda = state.data.agenda.filter(a=>a.id!==id);
  savePerfil(); renderAgenda();
}
function txFromAgendamento(id){
  const a = state.data.agenda.find(x=>x.id===id);
  if(!a) return;
  $$('#nav .tab').forEach(b=>b.classList.remove('active')); $$('#nav .tab')[1].classList.add('active');
  $$('.tabpane').forEach(p=>p.classList.remove('show')); $('#tab-financeiro').classList.add('show');
  openFormTx('receita');
  $('#txDesc').value = `Serviço: ${a.servico} • Cliente: ${a.clienteNome}`;
  $('#txValor').value = (a.valor||0).toFixed(2).replace('.',',');
  $('#txData').value = a.data;
  $('#txCat').value = 'Serviços';
}
function renderAgenda(){
  const q = ($('#buscaAgenda').value||'').toLowerCase();
  const box = $('#listaAgenda'); box.innerHTML='';
  state.data.agenda
    .slice().sort((a,b)=>a.data.localeCompare(b.data)||a.hora.localeCompare(b.hora))
    .filter(a=>!q || (a.servico+a.obs+a.clienteNome).toLowerCase().includes(q))
    .forEach(a=>{
      const div = document.createElement('div');
      div.className='item'; div.dataset.status=a.status||'agendado';
      div.innerHTML = `
        <strong>${a.dataBr} • ${a.hora} — ${a.clienteNome}</strong>
        <div class="muted">${a.servico} — ${money(a.valor, state.cfg.moeda)} — <b>${(a.status||'agendado').toUpperCase()}</b></div>
        ${a.img ? `<img class="image" src="${a.img}"/>` : ''}
        <div class="row" style="margin-top:6px;gap:8px">
          <button class="btn ghost sm" data-id="${a.id}" data-act="tx">Lançar no Financeiro</button>
          <button class="btn danger sm" data-id="${a.id}" data-act="del">Excluir</button>
        </div>`;
      box.appendChild(div);
    });
  $$('#listaAgenda [data-act="del"]').forEach(b=>b.onclick=()=>delAgendamento(b.dataset.id));
  $$('#listaAgenda [data-act="tx"]').forEach(b=>b.onclick=()=>txFromAgendamento(b.dataset.id));
}

/* ======= FINANCEIRO ======= */
function openFormTx(tipo){
  $('#formTransacao').classList.remove('hidden');
  $('#txTipo').value = tipo||'receita';
  $('#txData').valueAsDate = new Date();
}
function addTransacao(){
  const obj = {
    id: uid(), tipo: $('#txTipo').value, desc: $('#txDesc').value.trim(),
    valor: parseMoney($('#txValor').value),
    data: $('#txData').value || todayISO(),
    dataBr: new Date($('#txData').value || Date.now()).toLocaleDateString('pt-BR'),
    cat: $('#txCat').value
  };
  if(!obj.data) return alert('Informe a data.');
  state.data.tx.push(obj);
  savePerfil();
  $('#formTransacao').classList.add('hidden');
  $('#txDesc').value=''; $('#txValor').value='0,00';
  renderTx();
}
function delTx(id){ state.data.tx = state.data.tx.filter(t=>t.id!==id); savePerfil(); renderTx(); }
function editTx(id){
  const t = state.data.tx.find(x=>x.id===id); if(!t) return;
  openFormTx(t.tipo);
  $('#txDesc').value=t.desc; $('#txValor').value=t.valor.toFixed(2).replace('.',',');
  $('#txData').value=t.data; $('#txCat').value=t.cat;
  $('#btnAddTx').onclick = ()=>{
    t.tipo=$('#txTipo').value; t.desc=$('#txDesc').value.trim();
    t.valor=parseMoney($('#txValor').value); t.data=$('#txData').value; t.dataBr=new Date(t.data).toLocaleDateString('pt-BR');
    t.cat=$('#txCat').value; savePerfil(); $('#formTransacao').classList.add('hidden'); renderTx();
    $('#btnAddTx').onclick = addTransacao;
  };
}
function renderTx(){
  const q = ($('#buscaTx').value||'').toLowerCase();
  const box = $('#listaTx'); box.innerHTML='';
  state.data.tx
    .slice().sort((a,b)=>b.data.localeCompare(a.data))
    .filter(t=>!q || (t.tipo+t.desc+t.cat).toLowerCase().includes(q))
    .forEach(t=>{
      const div = document.createElement('div');
      div.className='item';
      div.innerHTML = `
        <strong>${t.tipo.toUpperCase()} • ${t.dataBr} — ${money(t.valor, state.cfg.moeda)}</strong>
        <div class="muted">${t.cat} — ${t.desc||''}</div>
        <div class="row" style="margin-top:6px;gap:8px">
          <button class="btn ghost sm" data-id="${t.id}" data-act="edit">Editar</button>
          <button class="btn danger sm" data-id="${t.id}" data-act="del">Excluir</button>
        </div>`;
      box.appendChild(div);
    });
  $$('#listaTx [data-act="del"]').forEach(b=>b.onclick=()=>delTx(b.dataset.id));
  $$('#listaTx [data-act="edit"]').forEach(b=>b.onclick=()=>editTx(b.dataset.id));
}
function refreshKpis(){
  const totalR = state.data.tx.filter(t=>t.tipo==='receita').reduce((s,t)=>s+t.valor,0);
  const totalD = state.data.tx.filter(t=>t.tipo==='despesa').reduce((s,t)=>s+t.valor,0);
  const saldo = totalR-totalD;
  $('#kpiReceitas').textContent = money(totalR, state.cfg.moeda);
  $('#kpiDespesas').textContent = money(totalD, state.cfg.moeda);
  $('#kpiSaldo').textContent = money(saldo, state.cfg.moeda);
  $('#saldoTopo').textContent = money(saldo, state.cfg.moeda);
}

/* ======= CLIENTES ======= */
function addCliente(){
  const nome = $('#clNome').value.trim();
  if(!nome) return alert('Informe o nome.');
  const obj = { id: uid(), nome, email: $('#clEmail').value.trim(), zap: $('#clZap').value.trim(), end: $('#clEnd').value.trim() };
  state.data.clientes.push(obj);
  savePerfil();
  $('#clNome').value=''; $('#clEmail').value=''; $('#clZap').value=''; $('#clEnd').value='';
  renderClientes();
}
function delCliente(id){
  if(!confirm('Excluir cliente?')) return;
  state.data.clientes = state.data.clientes.filter(c=>c.id!==id);
  state.data.agenda = state.data.agenda.filter(a=>a.clienteId!==id);
  state.data.an = state.data.an.filter(a=>a.clienteId!==id);
  savePerfil(); refreshAll();
}
function editCliente(id){
  const c = state.data.clientes.find(x=>x.id===id); if(!c) return;
  $('#clNome').value=c.nome; $('#clEmail').value=c.email; $('#clZap').value=c.zap; $('#clEnd').value=c.end;
  $('#btnAddCliente').textContent='Salvar Alterações';
  $('#btnAddCliente').onclick = ()=>{
    c.nome=$('#clNome').value.trim(); c.email=$('#clEmail').value.trim();
    c.zap=$('#clZap').value.trim(); c.end=$('#clEnd').value.trim();
    savePerfil(); renderClientes(); $('#btnAddCliente').textContent='Cadastrar Cliente';
    $('#btnAddCliente').onclick = addCliente;
    $('#clNome').value=''; $('#clEmail').value=''; $('#clZap').value=''; $('#clEnd').value='';
  };
}
function renderClientes(){
  const q = ($('#buscaCliente').value||'').toLowerCase();
  const box = $('#listaClientes'); box.innerHTML='';
  state.data.clientes
    .filter(c=>!q || c.nome.toLowerCase().includes(q))
    .forEach(c=>{
      const div = document.createElement('div');
      div.className='item';
      div.innerHTML = `
        <strong>${c.nome}</strong>
        <div class="muted">${c.email||'—'} • ${c.zap||'—'}</div>
        <div class="muted sm">${c.end||' '}</div>
        <div class="row" style="gap:8px;margin-top:6px">
          <button class="btn ghost sm" data-id="${c.id}" data-act="edit">Editar</button>
          <button class="btn danger sm" data-id="${c.id}" data-act="del">Excluir</button>
        </div>`;
      box.appendChild(div);
    });
  $$('#listaClientes [data-act="del"]').forEach(b=>b.onclick=()=>delCliente(b.dataset.id));
  $$('#listaClientes [data-act="edit"]').forEach(b=>b.onclick=()=>editCliente(b.dataset.id));
  renderSelClientes('#agCliente'); renderSelClientes('#anCliente');
}
function renderSelClientes(selector){
  const sel = $(selector); sel.innerHTML = '<option value="">Selecione um cliente</option>';
  state.data.clientes.forEach(c=>{ const o=document.createElement('option'); o.value=c.id; o.textContent=c.nome; sel.appendChild(o); });
}

/* ======= ANAMNESE ======= */
const MODELOS = {
  basico: ['Alergia a medicamentos?','Doenças pré-existentes?','Uso de anticoagulantes?','Cicatrização lenta?','Já fez tatuagem antes?'],
  completo: ['Idade','Medicamentos em uso','Alergias','Diabetes/Hipertensão','Gestante/Lactante','Problemas dermatológicos','Queloide','Fuma/Álcool','Assina termo?'],
  detalhado:['Altura','Peso','IMC (aprox.)','Pressão recente','Cirurgias','Cicatriz/Queloide','Tendência a sangramento','Avaliação da pele','Consentimento informado']
};
function gerarModelo(key){
  const campos = MODELOS[key]||MODELOS.basico;
  $('#anCampos').innerHTML = '';
  campos.forEach(p=>{
    const div = document.createElement('div');
    div.innerHTML = `<label class="label">${p}</label><input class="input" data-pergunta="${p}" />`;
    $('#anCampos').appendChild(div);
  });
  $('#anCampos').dataset.modelo = key;
}
function salvarAnamnese(){
  const idc = $('#anCliente').value;
  const cliente = state.data.clientes.find(c=>c.id===idc);
  if(!cliente) return alert('Selecione um cliente.');
  const modelo = $('#anCampos').dataset.modelo || 'basico';
  const respostas = $$('input[data-pergunta]', $('#anCampos')).map(i=>({p:i.dataset.pergunta,v:i.value.trim()}));
  const obj = { id:uid(), clienteId:idc, clienteNome:cliente.nome, modelo,
                respostas, data: new Date().toISOString(),
                dataBr: new Date().toLocaleDateString('pt-BR') };
  state.data.an.push(obj); savePerfil();
  $('#anCampos').innerHTML=''; renderAn();
}
function renderAn(){
  const q = ($('#buscaAn').value||'').toLowerCase();
  const box = $('#listaAn'); box.innerHTML='';
  state.data.an
    .slice().sort((a,b)=>b.data.localeCompare(a.data))
    .filter(a=>!q || (a.clienteNome||'').toLowerCase().includes(q))
    .forEach(a=>{
      const div = document.createElement('div');
      div.className='item';
      div.innerHTML = `
        <strong>${a.dataBr} • ${a.clienteNome} — ${a.modelo.toUpperCase()}</strong>
        <pre class="muted" style="white-space:pre-wrap">${a.respostas.map(r=>`• ${r.p}: ${r.v}`).join('\n')}</pre>
        <div class="row" style="gap:8px">
          <button class="btn ghost sm" data-id="${a.id}" data-act="export">Exportar</button>
          <button class="btn danger sm" data-id="${a.id}" data-act="del">Excluir</button>
        </div>`;
      box.appendChild(div);
    });
  $$('#listaAn [data-act="del"]').forEach(b=>b.onclick=()=>{state.data.an=state.data.an.filter(x=>x.id!==b.dataset.id); savePerfil(); renderAn();});
  $$('#listaAn [data-act="export"]').forEach(b=>b.onclick=()=>exportSingle('anamnese', state.data.an.find(x=>x.id===b.dataset.id)));
}

/* ======= ADMIN / BACKUP / RELATÓRIO ======= */
function exportarDados(){
  const blob = new Blob([JSON.stringify({perfilId:state.perfilId, cfg:state.cfg, data:state.data},null,2)], {type:'application/json'});
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `studioLH_${state.perfilId}.json`; a.click();
}
function exportSingle(nome,obj){
  const blob = new Blob([JSON.stringify(obj,null,2)], {type:'application/json'});
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `${nome}_${obj.id}.json`; a.click();
}
function importarDados(evt){
  const file = evt.target.files[0]; if(!file) return;
  const reader = new FileReader();
  reader.onload = e=>{
    try{
      const pack = JSON.parse(e.target.result);
      if(!confirm('Isto substituirá os dados deste perfil. Continuar?')) return;
      state.data = pack.data||state.data; state.cfg = pack.cfg||state.cfg; savePerfil(); refreshAll(); alert('Importado com sucesso.');
    }catch(err){ alert('Arquivo inválido.'); }
  };
  reader.readAsText(file);
}
function backupManual(){
  const payload = {date:new Date().toISOString(), data:structuredClone(state.data), cfg:structuredClone(state.cfg)};
  state.data.backups.unshift(payload);
  // manter últimos 10
  state.data.backups = state.data.backups.slice(0,10);
  savePerfil(); alert('Backup criado.');
}
function recuperarUltimo(){
  const b = state.data.backups?.[0];
  if(!b) return alert('Sem backups disponíveis.');
  if(!confirm('Restaurar o último backup? Isto substituirá os dados atuais.')) return;
  state.data = b.data; state.cfg = b.cfg; savePerfil(); refreshAll(); alert('Restaurado com sucesso!');
}
function refreshDbStatus(){
  $('#dbUltima').textContent = new Date().toLocaleString('pt-BR');
  const bytes = new Blob([JSON.stringify(state.data)]).size;
  $('#stTam').textContent = (bytes/1024).toFixed(2)+' KB';
  const regs = state.data.clientes.length + state.data.agenda.length + state.data.tx.length + state.data.an.length;
  $('#stRegs').textContent = regs;
  $('#stBkp').textContent = (state.data.backups||[]).length;
  $('#stSeg').textContent = (state.perfis?.find?.(p=>p.id===state.perfilId)?.senhaHash || state.cfg.senhaHash) ? '🔒 Protegido' : 'Desprotegido';
  // lista backups
  const list = $('#listaBackups'); list.innerHTML='';
  (state.data.backups||[]).forEach((b,idx)=>{
    const d = document.createElement('div'); d.className='item';
    d.innerHTML = `<strong>📅 ${new Date(b.date).toLocaleString('pt-BR')}</strong>
      <div class="row"><button class="btn ghost sm" data-i="${idx}" data-act="rest">Restaurar</button></div>`;
    list.appendChild(d);
  });
  $$('#listaBackups [data-act="rest"]').forEach(b=>b.onclick=()=>{
    const i=+b.dataset.i; if(!confirm('Restaurar este backup?')) return;
    state.data = state.data.backups[i].data; state.cfg = state.data.backups[i].cfg; savePerfil(); refreshAll(); alert('Backup restaurado.');
  });
}
function exportarRelatorio(){
  const totalR = state.data.tx.filter(t=>t.tipo==='receita').reduce((s,t)=>s+t.valor,0);
  const totalD = state.data.tx.filter(t=>t.tipo==='despesa').reduce((s,t)=>s+t.valor,0);
  const linhas = [
    `Estúdio: ${state.cfg.estudio}`,
    `Saldo Atual: ${money(totalR-totalD, state.cfg.moeda)}`,
    `Clientes: ${state.data.clientes.length}`,
    `Agendamentos: ${state.data.agenda.length}`,
    `Transações: ${state.data.tx.length}`
  ].join('\n');
  const blob = new Blob([linhas], {type:'text/plain;charset=utf-8'});
  const a = document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='relatorio_studioLH.txt'; a.click();
}
function refreshSystemStats(){
  $('#stClientes').textContent = state.data.clientes.length;
  const hoje = todayISO();
  $('#stHoje').textContent = state.data.agenda.filter(a=>a.data===hoje).length;
  const ym = new Date().toISOString().slice(0,7);
  const recMes = state.data.tx.filter(t=>t.tipo==='receita' && t.data.startsWith(ym)).reduce((s,t)=>s+t.valor,0);
  $('#stMes').textContent = money(recMes, state.cfg.moeda);
  $('#stTx').textContent = state.data.tx.length;
}

/* ======= CONFIG / AÇÕES ======= */
function salvarCfg(){
  state.cfg.estudio = $('#cfgEstudio').value.trim()||'Studio LH';
  state.cfg.moeda   = $('#cfgMoeda').value||'BRL';
  state.cfg.tema    = $('#cfgTema').value||'dark';
  state.cfg.wpp24   = $('#cfgWpp24').checked;
  state.cfg.wpp2    = $('#cfgWpp2').checked;
  state.cfg.autoBackup = $('#cfgAutoBackup').checked;
  state.cfg.msgWpp  = $('#cfgMsgWpp').value.trim()||state.cfg.msgWpp;
  savePerfil(); alert('Configurações salvas.');
}
function salvarCores(){
  state.cfg.cores = {ag:$('#corAg').value, co:$('#corCo').value, ca:$('#corCa').value};
  document.documentElement.style.setProperty('--cor-ag', state.cfg.cores.ag);
  document.documentElement.style.setProperty('--cor-co', state.cfg.cores.co);
  document.documentElement.style.setProperty('--cor-ca', state.cfg.cores.ca);
  savePerfil(); alert('Cores atualizadas.');
}
function limparCache(){
  if(!('caches' in window)) return alert('Cache não disponível neste navegador.');
  caches.keys().then(keys=>Promise.all(keys.map(k=>caches.delete(k)))).then(()=>alert('Cache limpo.'));
}
function resetApp(){
  if(!confirm('Resetar aplicativo (mantém perfis, zera dados deste perfil)?')) return;
  state.data = {clientes:[], agenda:[], tx:[], an:[], usuarios:[], backups:[], lastLogin:state.data.lastLogin};
  savePerfil(); refreshAll(); alert('Aplicativo resetado para este perfil.');
}
function testarConexao(){
  alert(navigator.onLine ? 'Conectado à internet.' : 'Sem conexão (offline).');
}
function trocarSenha(){
  const atual = $('#segAtual').value, nova = $('#segNova').value, conf = $('#segConf').value;
  const perfil = state.perfis.find(p=>p.id===state.perfilId);
  if(perfil.senhaHash && simpleHash(atual)!==perfil.senhaHash) return alert('Senha atual incorreta.');
  if(!nova || nova!==conf) return alert('Confirme a nova senha corretamente.');
  perfil.senhaHash = simpleHash(nova);
  savePerfis(); $('#warnSenha').classList.add('hidden'); alert('Senha atualizada!');
}

/* ======= AUTO BACKUP ======= */
function autoBackupIfNeeded(){
  if(!state.cfg.autoBackup) return;
  const last = state.data.backups?.[0]?.date;
  const d = new Date();
  const isNewDay = !last || (new Date(last)).toDateString() !== d.toDateString();
  if(isNewDay) backupManual();
}

/* ======= RENDER ALL ======= */
function refreshAll(){
  renderClientes();
  renderSelClientes('#agCliente');
  renderSelClientes('#anCliente');
  renderAgenda();
  renderTx();
  renderUsuarios();
  refreshKpis();
  // segurança aviso
  const perfil = state.perfis.find(p=>p.id===state.perfilId);
  if(perfil?.senhaHash){ $('#warnSenha').classList.add('hidden'); } else { $('#warnSenha').classList.remove('hidden'); }
}
function applyTheme(t){ document.documentElement.style.setProperty('color-scheme', t==='light'?'light dark':'dark'); }

/* ======= LOGIN AUTOFILL ======= */
window.addEventListener('load', ()=>{
  const perfis = JSON.parse(localStorage.getItem(LS_KEY)||'[]');
  if(perfis.length===1){ $('#selPerfil').value=perfis[0].id; }
});
