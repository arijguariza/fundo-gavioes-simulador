/* ============================================================
   FUNDO GAVIÕES — SIMULADOR MOBILE
   Motor de cálculo + estado + renderização. Sem backend, sem banco.
   Tudo em memória / localStorage.
   ============================================================ */

const STORAGE_KEY = 'gavioes_fundo_sim_v10';
const HORIZON_MESES = 480; // 40 anos de estados pré-computados

const DEFAULT_CONFIG = {
  lucroMensal: 100000,
  multiplo: 10,
  custoAbertura: 5000000,
  crescimento: 10,       // % a.a. de valorização da academia
  participacaoPct: 2.5,  // % do fundo na academia
  totalCotas: 5000,
  taxaAdmPct: 1.5,        // % a.a. sobre patrimônio
  auditoriaAnual: 6000,   // R$/ano fixo
  cotasLiderMes: 20,
  limiteCompraMes: 100,
  irrfPct: 15
};

const UNIDADES = ['Marketing', 'Operação', 'Implantação', 'Administrativo', 'Comercial', 'Financeiro'];

const PERIODOS = [
  { key: '3', label: '3 meses', n: 3 },
  { key: '6', label: '6 meses', n: 6 },
  { key: '12', label: '12 meses', n: 12 },
  { key: 'tudo', label: 'Tudo', n: Infinity }
];
function dentroDoPeriodo(mes, mesAtual, periodoKey) {
  const p = PERIODOS.find(p => p.key === periodoKey) || PERIODOS[PERIODOS.length - 1];
  return (mesAtual - mes) < p.n;
}
function periodoChipsHtml(groupName, currentKey) {
  return `<div class="unit-filter" data-period-group="${groupName}" style="margin:12px 0 14px;">${PERIODOS.map(p =>
    `<button data-period="${p.key}" class="${p.key === currentKey ? 'active' : ''}">${p.label}</button>`).join('')}</div>`;
}
function wirePeriodoChips(groupName, onChange) {
  document.querySelectorAll(`[data-period-group="${groupName}"] button`).forEach(b => {
    b.addEventListener('click', () => onChange(b.dataset.period));
  });
}

/* ---------------- helpers de formatação ---------------- */
const fmtBRL = (n) => (isFinite(n) ? n : 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 2 });
const fmtBRL0 = (n) => (isFinite(n) ? n : 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
const fmtNum = (n) => Math.round(n).toLocaleString('pt-BR');
const fmtPct = (n, d = 1) => `${n.toFixed(d)}%`;
const fmtMes = (m) => `Mês ${m}`;
const initials = (nome) => nome.split(' ').filter(Boolean).slice(0, 2).map(p => p[0]).join('').toUpperCase();
function fmtShort(n) {
  if (!isFinite(n)) return 'R$0';
  const abs = Math.abs(n);
  if (abs >= 1000000) return `R$${(n / 1000000).toFixed(2).replace('.', ',')}M`;
  if (abs >= 1000) return `R$${(n / 1000).toFixed(1).replace('.', ',')}k`;
  return fmtBRL0(n);
}

/* ============================================================
   ESTADO GLOBAL
   ============================================================ */
let state = null;

const NOMES_BASE = ['Ana', 'Bruno', 'Camila', 'Diego', 'Elaine', 'Fábio', 'Gabriela', 'Hugo', 'Isabela', 'João',
  'Karina', 'Leandro', 'Mariana', 'Nicolas', 'Olívia', 'Paulo', 'Queila', 'Rafael', 'Sabrina', 'Thiago',
  'Úrsula', 'Victor', 'Wesley', 'Yasmin', 'Zélia', 'André', 'Beatriz', 'Caio', 'Daniela', 'Eduardo',
  'Fernanda', 'Gustavo', 'Helena', 'Igor', 'Júlia', 'Kevin', 'Larissa', 'Marcelo', 'Natália', 'Otávio',
  'Renata', 'Renato', 'Sofia', 'Tatiane', 'Vinícius', 'Wagner', 'Ximena', 'Yago', 'Zeca', 'Aline'];
const SOBRENOMES_BASE = ['Almeida', 'Barros', 'Costa', 'Duarte', 'Esteves', 'Ferreira', 'Gonçalves', 'Henriques',
  'Inácio', 'Junqueira', 'Karam', 'Lacerda', 'Martins', 'Nogueira', 'Oliveira', 'Pereira', 'Queiroz', 'Ramos',
  'Souza', 'Teixeira', 'Uchoa', 'Vieira', 'Werneck', 'Ximenes', 'Zanetti', 'Andrade', 'Bezerra', 'Cardoso',
  'Dantas', 'Espíndola', 'Falcão', 'Guimarães', 'Holanda', 'Ibiapina', 'Jardim', 'Lopes', 'Moreira', 'Neves',
  'Osório', 'Pinheiro', 'Rezende', 'Salgado', 'Tavares', 'Uribe', 'Valente', 'Wermelinger', 'Xavier', 'Yoshida',
  'Brandão', 'Lima'];

/* distribui `totalCotas` entre `qtdPessoas` de forma aleatória (pesos), somando exatamente o total */
function distribuirAleatorio(qtdPessoas, totalCotas) {
  const pesos = Array.from({ length: qtdPessoas }, () => Math.random() + 0.15);
  const somaPesos = pesos.reduce((s, p) => s + p, 0);
  const brutos = pesos.map(p => (p / somaPesos) * totalCotas);
  const arred = brutos.map(v => Math.floor(v));
  let restante = totalCotas - arred.reduce((s, v) => s + v, 0);
  const fracoes = brutos.map((v, i) => ({ i, frac: v - Math.floor(v) })).sort((a, b) => b.frac - a.frac);
  for (let k = 0; k < restante; k++) arred[fracoes[k % qtdPessoas].i] += 1;
  return arred;
}

function nomeColaborador(i) {
  const baseIdx = i % 50;
  const primeiro = NOMES_BASE[baseIdx];
  const sobrenome1 = SOBRENOMES_BASE[(baseIdx + 17) % 50];
  if (i < 50) return `${primeiro} ${sobrenome1}`;
  const sobrenome2 = SOBRENOMES_BASE[(baseIdx + 33) % 50];
  return `${primeiro} ${sobrenome1} ${sobrenome2}`;
}

function seedCotistas() {
  const estadosSeed = buildEstados(DEFAULT_CONFIG, 30);
  const mk = (id, nome, unidade, papel, liderId, mesEntrada, cotas) => {
    const bonRatio = 0.5 + Math.random() * 0.3;
    const bon = Math.round(cotas * bonRatio);
    const comp = cotas - bon;
    const valorCotaNaEpoca = estadosSeed[Math.min(mesEntrada, estadosSeed.length - 1)].valorCota;
    const precoMedio = valorCotaNaEpoca * (0.94 + Math.random() * 0.12);
    const valorPago = Math.round(comp * precoMedio);
    return {
      id, nome, unidade, papel, liderId,
      vinculo: 'CLT',
      mesEntrada,
      cotas, cotasBonificadas: bon, cotasCompradas: comp, valorPagoCompras: valorPago,
      compradoNoMes: {},
      historico: [
        { mes: mesEntrada, tipo: 'bonificacao', qtd: bon, valor: 0, desc: 'Bonificação inicial por performance' },
        ...(comp > 0 ? [{ mes: mesEntrada, tipo: 'compra', qtd: comp, valor: valorPago, desc: 'Compra de cotas' }] : [])
      ]
    };
  };

  const lideresDef = [
    { id: 1, nome: 'Marcos Tavares', unidade: 'Marketing', mesEntrada: 0, cotas: 90 },
    { id: 2, nome: 'Rodrigo Lemos', unidade: 'Operação', mesEntrada: 4, cotas: 80 },
    { id: 3, nome: 'Patrícia Reis', unidade: 'Implantação', mesEntrada: 8, cotas: 70 },
    { id: 4, nome: 'Camila Duarte', unidade: 'Administrativo', mesEntrada: 12, cotas: 60 },
    { id: 5, nome: 'Bruno Ferreira', unidade: 'Comercial', mesEntrada: 16, cotas: 55 },
    { id: 6, nome: 'Fernanda Costa', unidade: 'Financeiro', mesEntrada: 20, cotas: 50 }
  ];
  const lideres = lideresDef.map(l => mk(l.id, l.nome, l.unidade, 'lider', null, l.mesEntrada, l.cotas));

  const QTD_COLABORADORES = 100;
  const TOTAL_COTAS_DESEJADO = 1000;
  const cotasLideresSoma = lideresDef.reduce((s, l) => s + l.cotas, 0);
  const cotasColaboradores = Math.max(0, TOTAL_COTAS_DESEJADO - cotasLideresSoma);
  const distribuicao = distribuirAleatorio(QTD_COLABORADORES, cotasColaboradores);

  const colaboradores = [];
  for (let i = 0; i < QTD_COLABORADORES; i++) {
    const nome = nomeColaborador(i);
    const lider = lideresDef[i % lideresDef.length];
    const mesEntrada = Math.floor(Math.random() * 30);
    colaboradores.push(mk(7 + i, nome, lider.unidade, 'colaborador', lider.id, mesEntrada, distribuicao[i]));
  }

  return [...lideres, ...colaboradores];
}

function freshState() {
  return {
    config: { ...DEFAULT_CONFIG },
    cotistas: seedCotistas(),
    mesAtual: 30,
    nextId: 107,
    activeView: 'portal',
    ciclo: { step: 1, alocacoes: {}, lucroMes: DEFAULT_CONFIG.lucroMensal, aprovado: false },
    portalSelId: 7,
    saidaSelId: 20,
    portalPeriodo: 'tudo',
    overviewPeriodo: 'tudo',
    simDiv: { lucro: DEFAULT_CONFIG.lucroMensal, meses: 12 }
  };
}

function persist() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) { /* ignora */ }
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && parsed.config && Array.isArray(parsed.cotistas)) {
        if (!parsed.portalPeriodo) parsed.portalPeriodo = 'tudo';
        if (!parsed.overviewPeriodo) parsed.overviewPeriodo = 'tudo';
        if (!parsed.simDiv) parsed.simDiv = { lucro: parsed.config.lucroMensal, meses: 12 };
        return parsed;
      }
    }
  } catch (e) { /* ignora e recria */ }
  return freshState();
}

function resetSim() {
  if (!confirm('Reiniciar a simulação? Todos os dados voltam ao ponto de partida.')) return;
  state = freshState();
  persist();
  rebuildEstados();
  renderAll();
  toast('Simulação reiniciada.');
}

/* ============================================================
   MOTOR DE CÁLCULO
   ============================================================ */
let estados = [];

function buildEstados(config, horizonte = HORIZON_MESES) {
  const monthlyGrowth = Math.pow(1 + config.crescimento / 100, 1 / 12) - 1;
  const valuationBase = config.lucroMensal * 12 * config.multiplo;
  let custoAcumulado = 0;
  let patrimonioAnterior = null;
  const arr = [];
  for (let m = 0; m <= horizonte; m++) {
    const valuation = valuationBase * Math.pow(1 + monthlyGrowth, m);
    const participacaoFundo = valuation * (config.participacaoPct / 100);
    let custoMensal = 0;
    if (m > 0) {
      custoMensal = patrimonioAnterior * (config.taxaAdmPct / 100 / 12) + config.auditoriaAnual / 12;
      custoAcumulado += custoMensal;
    }
    const patrimonioFundo = participacaoFundo - custoAcumulado;
    const valorCota = patrimonioFundo / config.totalCotas;
    arr.push({ mes: m, valuation, participacaoFundo, custoMensal, custoAcumulado, patrimonioFundo, valorCota });
    patrimonioAnterior = patrimonioFundo;
  }
  return arr;
}

function rebuildEstados() { estados = buildEstados(state.config); }
function estadoNoMes(mes) { const m = Math.max(0, Math.min(mes, estados.length - 1)); return estados[m]; }

function getCotista(id) { return state.cotistas.find(c => c.id === Number(id)); }
function colaboradoresDe(liderId) { return state.cotistas.filter(c => c.liderId === liderId); }
function totalDistribuido() { return state.cotistas.reduce((s, c) => s + c.cotas, 0); }

/* Sem vesting: o fundo recompra as cotas pelo valor de mercado no momento da saída,
   independente do tempo de casa. Ganho de capital sofre IRRF normalmente. */
function calcSaidaScenario(cotista) {
  const valorCotaAtual = estadoNoMes(state.mesAtual).valorCota;
  const custoBaseTotal = cotista.valorPagoCompras || 0;
  const totalCotasC = cotista.cotas;
  const valorVenda = totalCotasC * valorCotaAtual;
  const ganho = Math.max(0, valorVenda - custoBaseTotal);
  const imposto = ganho * (state.config.irrfPct / 100);
  const valorLiquido = valorVenda - imposto;
  return { totalCotas: totalCotasC, valorCotaAtual, valorVenda, ganho, imposto, valorLiquido };
}

/* Simula dividendos futuros para um cotista, assumindo cotas constantes
   (sem novas compras/bonificações) e um lucro mensal projetado fixo. */
function calcSimulacaoDividendos(cotista, lucroProjetado, meses) {
  const linhas = [];
  let acumulado = 0;
  for (let i = 1; i <= meses; i++) {
    const m = state.mesAtual + i;
    const e = estadoNoMes(m);
    const fundoRecebe = lucroProjetado * (state.config.participacaoPct / 100);
    const custoMensal = e.patrimonioFundo * (state.config.taxaAdmPct / 100 / 12) + state.config.auditoriaAnual / 12;
    const liquido = fundoRecebe - custoMensal;
    const dividendoPorCota = liquido / state.config.totalCotas;
    const dividendoCotista = cotista.cotas * dividendoPorCota;
    acumulado += dividendoCotista;
    linhas.push({ mes: m, dividendoCotista, acumulado });
  }
  return linhas;
}

function registrarCompra(cotistaId, valorReais) {
  const cotista = getCotista(cotistaId);
  if (!cotista || !valorReais || valorReais <= 0) return;
  const valorCotaAtual = estadoNoMes(state.mesAtual).valorCota;
  let qtd = Math.floor(valorReais / valorCotaAtual);
  const jaComprado = cotista.compradoNoMes[state.mesAtual] || 0;
  const restante = state.config.limiteCompraMes - jaComprado;
  if (restante <= 0) { toast('Limite mensal de compra já atingido para este cotista.'); return; }
  qtd = Math.min(qtd, restante);
  if (qtd <= 0) { toast('Valor insuficiente para comprar ao menos 1 cota.'); return; }
  const custo = qtd * valorCotaAtual;
  cotista.cotas += qtd;
  cotista.cotasCompradas += qtd;
  cotista.valorPagoCompras += custo;
  cotista.compradoNoMes[state.mesAtual] = jaComprado + qtd;
  cotista.historico.push({ mes: state.mesAtual, tipo: 'compra', qtd, valor: custo, desc: 'Compra de cotas' });
  persist();
  toast(`${cotista.nome} comprou ${qtd} cotas por ${fmtBRL(custo)}.`);
  renderAll();
}

/* ============================================================
   UI UTIL — toast, modal, sheet, picker, gráficos
   ============================================================ */
function toast(msg) {
  const root = document.getElementById('toast-root');
  const el = document.createElement('div');
  el.className = 'toast';
  el.innerHTML = `<span class="dot"></span>${msg}`;
  root.appendChild(el);
  setTimeout(() => { el.style.transition = 'opacity .3s'; el.style.opacity = '0'; setTimeout(() => el.remove(), 300); }, 2600);
}

function openModal(innerHtml, onMount) {
  const root = document.getElementById('modal-root');
  root.innerHTML = `<div class="modal-overlay" id="modal-overlay"><div class="modal">${innerHtml}</div></div>`;
  const overlay = document.getElementById('modal-overlay');
  overlay.addEventListener('click', (e) => { if (e.target === overlay) closeModal(); });
  if (onMount) onMount(root);
}
function closeModal() { document.getElementById('modal-root').innerHTML = ''; }

function openSheet(titleHtml, itemsHtml, onMount) {
  const root = document.getElementById('sheet-root');
  root.innerHTML = `
    <div class="sheet-overlay" id="sheet-overlay">
      <div class="sheet">
        <div class="sheet-handle"></div>
        ${titleHtml}
        <div class="sheet-scroll">${itemsHtml}</div>
        <button class="sheet-close" id="sheet-close-btn">Fechar</button>
      </div>
    </div>`;
  const overlay = document.getElementById('sheet-overlay');
  overlay.addEventListener('click', (e) => { if (e.target === overlay) closeSheet(); });
  document.getElementById('sheet-close-btn').addEventListener('click', closeSheet);
  if (onMount) onMount(root);
}
function closeSheet() { document.getElementById('sheet-root').innerHTML = ''; }

function openCotistaPicker(currentId, onPick) {
  const lideres = state.cotistas.filter(c => c.papel === 'lider');
  const colaboradores = state.cotistas.filter(c => c.papel === 'colaborador');
  const itemHtml = (c) => `
    <button class="sheet-item" data-pick="${c.id}">
      <span class="ic">${c.id === currentId ? '●' : '○'}</span>
      <span>${c.papel === 'lider' ? '<span class="pick-tag">LÍDER</span> ' : ''}${c.nome} <span style="color:var(--ink-faint); font-size:11.5px;">— ${c.unidade}</span></span>
    </button>`;
  const itemsHtml = `<div>
    ${lideres.length ? `<div class="sheet-subhead">Líderes de Área</div>${lideres.map(itemHtml).join('')}` : ''}
    ${colaboradores.length ? `<div class="sheet-subhead">Colaboradores</div>${colaboradores.map(itemHtml).join('')}` : ''}
  </div>`;
  openSheet(`<h3>Selecionar Cotista</h3>`, itemsHtml, (root) => {
    root.querySelectorAll('[data-pick]').forEach(b => {
      b.addEventListener('click', () => { onPick(Number(b.dataset.pick)); closeSheet(); });
    });
  });
}

function svgLineChart(points, opts = {}) {
  const width = opts.width || 540, height = opts.height || 190, pad = opts.pad || 30;
  const ys = points.map(p => p.y);
  const minY = Math.min(...ys) * 0.96, maxY = Math.max(...ys) * 1.04;
  const xToPx = (i) => pad + (i / (points.length - 1)) * (width - pad * 2);
  const yToPx = (y) => height - pad - ((y - minY) / (maxY - minY || 1)) * (height - pad * 1.4);
  const linePts = points.map((p, i) => `${xToPx(i)},${yToPx(p.y)}`).join(' ');
  const areaPts = `${pad},${height - pad} ${linePts} ${width - pad},${height - pad}`;
  const gridLines = [0.25, 0.5, 0.75, 1].map(f => {
    const yy = height - pad - f * (height - pad * 1.4);
    return `<line class="grid-line" x1="${pad}" y1="${yy}" x2="${width - pad}" y2="${yy}" />`;
  }).join('');
  const labelEvery = Math.max(1, Math.ceil(points.length / 6));
  const xLabels = points.map((p, i) => {
    if (i % labelEvery !== 0 && i !== points.length - 1) return '';
    return `<text x="${xToPx(i)}" y="${height - 8}" text-anchor="middle">${p.label}</text>`;
  }).join('');
  const lastPt = points[points.length - 1];
  return `
  <svg class="chart-svg-line" viewBox="0 0 ${width} ${height}" preserveAspectRatio="xMidYMid meet">
    <defs><linearGradient id="goldFade" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#d9a440" stop-opacity="0.35"/><stop offset="100%" stop-color="#d9a440" stop-opacity="0"/>
    </linearGradient></defs>
    ${gridLines}
    <polygon class="area" points="${areaPts}"></polygon>
    <polyline class="line" points="${linePts}"></polyline>
    <circle class="pt" cx="${xToPx(points.length - 1)}" cy="${yToPx(lastPt.y)}" r="4.5"></circle>
    ${xLabels}
  </svg>`;
}

function svgDonut(pctA, pctB, colorA, colorB, labelA, labelB, totalLabel) {
  const size = 160, r = 58, c = 2 * Math.PI * r, cx = size / 2, cy = size / 2;
  const aLen = (pctA / 100) * c;
  return `
  <div style="display:flex; align-items:center; gap:18px; flex-wrap:wrap;">
    <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
      <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${colorB}" stroke-opacity="0.25" stroke-width="17"/>
      <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${colorA}" stroke-width="17"
        stroke-dasharray="${aLen} ${c - aLen}" stroke-dashoffset="${c * 0.25}" stroke-linecap="round"/>
      <text x="${cx}" y="${cy - 3}" text-anchor="middle" class="donut-label" font-size="19" fill="#f1ead8" font-weight="700">${pctA.toFixed(0)}%</text>
      <text x="${cx}" y="${cy + 14}" text-anchor="middle" class="donut-label" font-size="8.5" fill="#a39c89">FUNCIONÁRIOS</text>
    </svg>
    <div style="display:flex; flex-direction:column; gap:8px; font-size:12px; flex:1; min-width:140px;">
      <div style="display:flex; align-items:center; gap:7px;"><span style="width:9px;height:9px;border-radius:3px;background:${colorA};display:inline-block;"></span>${labelA}</div>
      <div style="display:flex; align-items:center; gap:7px;"><span style="width:9px;height:9px;border-radius:3px;background:${colorB};display:inline-block; opacity:.5;"></span>${labelB}</div>
      <div style="font-family:var(--mono); font-size:10px; color:var(--ink-faint); margin-top:2px;">${totalLabel}</div>
    </div>
  </div>`;
}

function badgeTipo(tipo) {
  if (tipo === 'bonificacao') return `<span class="badge gold">BÔNUS</span>`;
  if (tipo === 'compra') return `<span class="badge neutral">COMPRA</span>`;
  if (tipo === 'dividendo') return `<span class="badge olive">DIVIDENDO</span>`;
  return tipo;
}

/* ============================================================
   RENDER — DISPATCH + TICKER + NAV
   ============================================================ */
function renderAll() {
  renderTicker();
  renderNav();
  const v = state.activeView;
  if (v === 'overview') renderOverview();
  else if (v === 'config') renderConfig();
  else if (v === 'cotistas') renderCotistas();
  else if (v === 'ciclo') renderCiclo();
  else if (v === 'evolucao') renderEvolucao();
  else if (v === 'portal') renderPortal();
  else if (v === 'saida') renderSaida();
}

function renderNav() {
  document.querySelectorAll('#bottom-nav button[data-view]').forEach(b => {
    b.classList.toggle('active', b.dataset.view === state.activeView);
  });
  document.querySelectorAll('.view').forEach(s => {
    s.classList.toggle('hidden', s.dataset.view !== state.activeView);
  });
  document.getElementById('m-content').scrollTop = 0;
}

function renderTicker() {
  const e = estadoNoMes(state.mesAtual);
  const distrib = totalDistribuido();
  document.getElementById('m-ticker').innerHTML = `
    <div class="chip"><span class="l">Mês</span><span class="v">${state.mesAtual}</span></div>
    <div class="chip gold"><span class="l">Cota</span><span class="v">${fmtBRL(e.valorCota)}</span></div>
    <div class="chip"><span class="l">Patrimônio</span><span class="v">${fmtShort(e.patrimonioFundo)}</span></div>
    <div class="chip"><span class="l">Cotas</span><span class="v">${fmtNum(distrib)}/${fmtNum(state.config.totalCotas)}</span></div>
  `;
}

/* ============================================================
   PORTAL DO FUNCIONÁRIO (HOME)
   ============================================================ */
function renderPortal() {
  const c = getCotista(state.portalSelId) || state.cotistas[0];
  document.getElementById('portal-switch-label').textContent = `${c.nome} — ${c.unidade}`;

  const valorCotaAtual = estadoNoMes(state.mesAtual).valorCota;
  const tempoCasa = state.mesAtual - c.mesEntrada;
  const totalDividendos = c.historico.filter(h => h.tipo === 'dividendo').reduce((s, h) => s + h.valor, 0);
  const totalInvestido = c.valorPagoCompras || 0;
  const valorAtual = c.cotas * valorCotaAtual;
  const historicoOrdenado = [...c.historico].sort((a, b) => b.mes - a.mes)
    .filter(h => dentroDoPeriodo(h.mes, state.mesAtual, state.portalPeriodo));

  document.getElementById('portal-body').innerHTML = `
    <div class="hero-card">
      <div class="avatar ${c.papel === 'lider' ? 'lider' : ''}">${initials(c.nome)}${c.papel === 'lider' ? '<span class="crown">★</span>' : ''}</div>
      <div class="name">${c.nome}</div>
      <div class="role">${c.papel === 'lider' ? '<span class="badge gold" style="margin-right:6px;">LÍDER DE ÁREA</span>' : '<span class="badge neutral" style="margin-right:6px;">COLABORADOR(A)</span>'}${c.unidade}</div>
      <div class="lbl">Suas cotas valem hoje</div>
      <div class="big">${fmtBRL0(valorAtual)}</div>
      <div class="sub">${fmtNum(c.cotas)} cotas × ${fmtBRL(valorCotaAtual)}</div>
    </div>

    <div class="stat-grid">
      <div class="kpi-card"><span class="lbl">Total Investido</span><span class="val">${fmtBRL0(totalInvestido)}</span><span class="sub">${fmtNum(c.cotasCompradas)} cotas compradas</span></div>
      <div class="kpi-card">
        <span class="lbl">Dividendos</span><span class="val">${fmtBRL0(totalDividendos)}</span><span class="sub">recebido até hoje</span>
        <button class="kpi-mini-btn" id="btn-quick-sim">Simular ›</button>
      </div>
    </div>

    <div class="m-card">
      <div class="panel-title"><h2>Propriedade das Cotas</h2><span class="meta">100% sua</span></div>
      <p class="hint">Suas cotas são 100% suas desde o dia em que você as recebeu ou comprou — não existe carência. Na entrada da empresa (${fmtMes(c.mesEntrada)}, há ${tempoCasa} ${tempoCasa === 1 ? 'mês' : 'meses'}), você já é proprietário pleno. Se sair da empresa, o fundo recompra suas cotas pelo valor de mercado do momento — simule na aba Saída &amp; Recompra.</p>
    </div>

    <div class="m-card">
      <div class="panel-title"><h2>Simular Dividendos Futuros</h2><span class="meta">projeção</span></div>
      <div class="field"><label>Lucro mensal projetado da academia (R$)</label><input type="number" id="sim-div-lucro" step="2000" value="${state.simDiv.lucro}"></div>
      <div class="field"><label>Horizonte (meses)</label><input type="number" id="sim-div-meses" min="1" max="60" step="1" value="${state.simDiv.meses}"></div>
      <div class="stat-grid">
        <div class="kpi-card"><span class="lbl">Próximo mês</span><span class="val" id="sim-div-proximo">—</span><span class="sub">com ${fmtNum(c.cotas)} cotas</span></div>
        <div class="kpi-card"><span class="lbl">Acumulado</span><span class="val" id="sim-div-total">—</span><span class="sub" id="sim-div-meses-label"></span></div>
      </div>
      <div id="sim-div-chart"></div>
      <p class="hint" style="margin-top:10px;">Assume ${fmtNum(c.cotas)} cotas constantes, sem novas compras ou bonificações no período simulado.</p>
    </div>

    <div class="m-card" style="padding-bottom:8px;">
      <div class="panel-title"><h2>Extrato</h2><span class="meta">${historicoOrdenado.length} lançamentos</span></div>
      ${periodoChipsHtml('portal', state.portalPeriodo)}
      ${historicoOrdenado.length ? `
        <div class="clist">
          ${historicoOrdenado.map(h => `
            <div class="citem">
              <div class="citem-top">
                <div><span class="citem-name">${h.desc}</span><div class="citem-meta">${fmtMes(h.mes)}</div></div>
                <div class="citem-val">${badgeTipo(h.tipo)}<span class="big" style="margin-top:4px;">${h.qtd != null ? '+' + fmtNum(h.qtd) + ' cotas' : fmtBRL(h.valor)}</span></div>
              </div>
            </div>`).join('')}
        </div>` : `<div class="empty">Nenhum lançamento neste período.</div>`}
    </div>
  `;

  wirePeriodoChips('portal', (key) => { state.portalPeriodo = key; persist(); renderPortal(); });

  const atualizaSimDiv = () => {
    const lucro = Number(document.getElementById('sim-div-lucro').value) || 0;
    const mesesIn = Math.max(1, Math.min(60, Number(document.getElementById('sim-div-meses').value) || 1));
    state.simDiv = { lucro, meses: mesesIn };
    const linhas = calcSimulacaoDividendos(c, lucro, mesesIn);
    document.getElementById('sim-div-proximo').textContent = fmtBRL(linhas[0].dividendoCotista);
    document.getElementById('sim-div-total').textContent = fmtBRL0(linhas[linhas.length - 1].acumulado);
    document.getElementById('sim-div-meses-label').textContent = `em ${mesesIn} ${mesesIn === 1 ? 'mês' : 'meses'}`;
    document.getElementById('sim-div-chart').innerHTML = svgLineChart(
      linhas.map(l => ({ y: l.acumulado, label: `M${l.mes}` })), { height: 160 }
    );
    persist();
  };
  document.getElementById('sim-div-lucro').addEventListener('input', atualizaSimDiv);
  document.getElementById('sim-div-meses').addEventListener('input', atualizaSimDiv);
  atualizaSimDiv();

  document.getElementById('btn-quick-sim').addEventListener('click', () => abrirModalSimDividendo(c));
}

function abrirModalSimDividendo(cotista) {
  openModal(`
    <h3>Simular Dividendos — ${cotista.nome}</h3>
    <p class="hint">Com ${fmtNum(cotista.cotas)} cotas, mantidas constantes ao longo do período.</p>
    <div class="field" style="margin-top:12px;"><label>Lucro mensal projetado (R$)</label><input type="number" id="modal-sim-lucro" step="2000" value="${state.simDiv.lucro}"></div>
    <div class="field"><label>Horizonte (meses)</label><input type="number" id="modal-sim-meses" min="1" max="60" step="1" value="${state.simDiv.meses}"></div>
    <div class="stat-grid">
      <div class="kpi-card"><span class="lbl">Próximo mês</span><span class="val" id="modal-sim-proximo" style="font-size:16px;">—</span></div>
      <div class="kpi-card"><span class="lbl">Acumulado</span><span class="val" id="modal-sim-total" style="font-size:16px;">—</span></div>
    </div>
    <div id="modal-sim-chart"></div>
    <div class="modal-actions">
      <button class="btn ghost" id="modal-sim-fechar">Fechar</button>
    </div>
  `, (root) => {
    const atualiza = () => {
      const lucro = Number(root.querySelector('#modal-sim-lucro').value) || 0;
      const meses = Math.max(1, Math.min(60, Number(root.querySelector('#modal-sim-meses').value) || 1));
      state.simDiv = { lucro, meses };
      const linhas = calcSimulacaoDividendos(cotista, lucro, meses);
      root.querySelector('#modal-sim-proximo').textContent = fmtBRL(linhas[0].dividendoCotista);
      root.querySelector('#modal-sim-total').textContent = fmtBRL0(linhas[linhas.length - 1].acumulado);
      root.querySelector('#modal-sim-chart').innerHTML = svgLineChart(
        linhas.map(l => ({ y: l.acumulado, label: `M${l.mes}` })), { width: 300, height: 130, pad: 24 }
      );
      persist();
    };
    root.querySelector('#modal-sim-lucro').addEventListener('input', atualiza);
    root.querySelector('#modal-sim-meses').addEventListener('input', atualiza);
    atualiza();
    root.querySelector('#modal-sim-fechar').addEventListener('click', () => { closeModal(); renderPortal(); });
  });
}

/* ============================================================
   VISÃO GERAL
   ============================================================ */
function renderOverview() {
  const e = estadoNoMes(state.mesAtual);
  const e0 = estadoNoMes(0);
  const variacaoCota = ((e.valorCota - e0.valorCota) / e0.valorCota) * 100;

  document.getElementById('overview-kpis').innerHTML = `
    <div class="kpi-card"><span class="lbl">Valuation Academia</span><span class="val">${fmtShort(e.valuation)}</span><span class="sub">múltiplo ${state.config.multiplo}x</span></div>
    <div class="kpi-card"><span class="lbl">Valor da Cota</span><span class="val">${fmtBRL(e.valorCota)}</span><span class="sub ${variacaoCota >= 0 ? 'pos' : 'neg'}">${variacaoCota >= 0 ? '+' : ''}${fmtPct(variacaoCota)}</span></div>
    <div class="kpi-card"><span class="lbl">Patrimônio do Fundo</span><span class="val">${fmtShort(e.patrimonioFundo)}</span><span class="sub">${fmtPct(state.config.participacaoPct, 0)} da academia</span></div>
    <div class="kpi-card"><span class="lbl">Cotistas Ativos</span><span class="val">${state.cotistas.length}</span><span class="sub">${state.cotistas.filter(c => c.papel === 'lider').length} líderes</span></div>
  `;

  const pontos = [];
  const passo = Math.max(1, Math.floor(state.mesAtual / 10)) || 1;
  for (let m = 0; m <= state.mesAtual; m += passo) pontos.push({ y: estadoNoMes(m).valorCota, label: `M${m}` });
  if (pontos[pontos.length - 1].label !== `M${state.mesAtual}`) pontos.push({ y: e.valorCota, label: `M${state.mesAtual}` });
  document.getElementById('overview-chart').innerHTML = svgLineChart(pontos);
  document.getElementById('overview-chart-meta').textContent = `mês 0 → ${state.mesAtual}`;

  const distrib = totalDistribuido();
  const pctFunc = (distrib / state.config.totalCotas) * 100;
  document.getElementById('overview-donut').innerHTML = svgDonut(
    pctFunc, 100 - pctFunc, '#d9a440', '#605c4c',
    `${fmtNum(distrib)} cotas com funcionários`, `${fmtNum(state.config.totalCotas - distrib)} ainda com a rede`,
    `${fmtNum(state.config.totalCotas)} cotas totais`
  );

  renderOverviewAreas(e.valorCota, distrib);

  const atividades = [];
  state.cotistas.forEach(c => c.historico.forEach(h => atividades.push({ ...h, nome: c.nome })));
  atividades.sort((a, b) => b.mes - a.mes);
  const filtradas = atividades.filter(a => dentroDoPeriodo(a.mes, state.mesAtual, state.overviewPeriodo));
  const top = filtradas.slice(0, 12);
  document.getElementById('overview-activity').innerHTML = `
    ${periodoChipsHtml('overview', state.overviewPeriodo)}
    ${top.length ? `
      <div class="clist">
        ${top.map(a => `
          <div class="citem">
            <div class="citem-top">
              <div><span class="citem-name">${a.nome}</span><div class="citem-meta">${fmtMes(a.mes)}</div></div>
              <div class="citem-val">${badgeTipo(a.tipo)}<span class="big" style="margin-top:4px;">${a.qtd != null ? '+' + fmtNum(a.qtd) : fmtBRL(a.valor)}</span></div>
            </div>
          </div>`).join('')}
      </div>` : `<div class="empty">Sem atividade neste período.</div>`}
  `;
  wirePeriodoChips('overview', (key) => { state.overviewPeriodo = key; persist(); renderOverview(); });
}

const AREA_COLOR = {
  'Marketing': '#d9a440',
  'Operação': '#8aab5e',
  'Implantação': '#c1502c',
  'Administrativo': '#6f9bb0',
  'Comercial': '#a877a8',
  'Financeiro': '#c98a3e'
};

function computeAreaStats(valorCotaAtual) {
  return UNIDADES.map(u => {
    const membros = state.cotistas.filter(c => c.unidade === u);
    const lider = membros.find(c => c.papel === 'lider');
    const totalCotas = membros.reduce((s, c) => s + c.cotas, 0);
    const totalDividendos = membros.reduce((s, c) => s + c.historico.filter(h => h.tipo === 'dividendo').reduce((ss, h) => ss + h.valor, 0), 0);
    const tenureMedio = membros.length ? membros.reduce((s, c) => s + (state.mesAtual - c.mesEntrada), 0) / membros.length : 0;
    return {
      unidade: u,
      lider: lider ? lider.nome : '—',
      nCotistas: membros.length,
      totalCotas,
      totalValor: totalCotas * valorCotaAtual,
      totalDividendos,
      tenureMedio
    };
  });
}

function renderOverviewAreas(valorCotaAtual, distribTotal) {
  const areas = computeAreaStats(valorCotaAtual);
  document.getElementById('overview-areas').innerHTML = areas.map(a => {
    const pct = distribTotal > 0 ? (a.totalCotas / distribTotal) * 100 : 0;
    const cor = AREA_COLOR[a.unidade];
    return `
      <button class="area-row" data-area="${a.unidade}">
        <div class="area-row-head">
          <span class="area-name"><span class="area-dot" style="background:${cor};"></span>${a.unidade}</span>
          <span class="area-pct" style="color:${cor};">${pct.toFixed(1)}%</span>
        </div>
        <div class="area-bar-track"><i style="width:${pct}%; background:${cor};"></i></div>
        <div class="area-row-foot">
          <span>líder ${a.lider} · ${a.nCotistas} cotistas · ${fmtNum(a.totalCotas)} cotas</span>
          <span class="v">${fmtBRL0(a.totalValor)}</span>
        </div>
        <div class="area-row-foot">
          <span>tempo médio de casa: ${a.tenureMedio.toFixed(0)} meses</span>
          <span class="v">dividendos: ${fmtBRL0(a.totalDividendos)}</span>
        </div>
      </button>`;
  }).join('');

  document.querySelectorAll('#overview-areas [data-area]').forEach(b => {
    b.addEventListener('click', () => {
      cotistasFiltro = b.dataset.area;
      state.activeView = 'cotistas';
      persist();
      renderAll();
      toast(`Filtrando Cotistas por ${b.dataset.area}.`);
    });
  });
}

/* ============================================================
   CONFIGURAÇÃO
   ============================================================ */
function renderConfig() {
  const c = state.config;
  document.getElementById('cfg-lucroMensal').value = c.lucroMensal;
  document.getElementById('cfg-multiplo').value = c.multiplo;
  document.getElementById('cfg-custoAbertura').value = c.custoAbertura;
  document.getElementById('cfg-crescimento').value = c.crescimento;
  document.getElementById('cfg-participacao').value = c.participacaoPct;
  document.getElementById('cfg-totalCotas').value = c.totalCotas;
  document.getElementById('cfg-taxaAdm').value = c.taxaAdmPct;
  document.getElementById('cfg-auditoria').value = c.auditoriaAnual;
  document.getElementById('cfg-cotasLider').value = c.cotasLiderMes;
  document.getElementById('cfg-limiteCompra').value = c.limiteCompraMes;
  document.getElementById('cfg-irrf').value = c.irrfPct;

  const valuationBase = c.lucroMensal * 12 * c.multiplo;
  const participacaoBase = valuationBase * (c.participacaoPct / 100);
  document.getElementById('cfg-valuation-out').textContent =
    `Valuation = ${fmtBRL0(c.lucroMensal)}/mês × 12 × ${c.multiplo} = ${fmtBRL0(valuationBase)}.`;
  document.getElementById('cfg-cota-out').textContent =
    `Participação do fundo = ${fmtBRL0(participacaoBase)}. Cota inicial = ${fmtBRL(participacaoBase / c.totalCotas)}.`;
  const custoAnualBase = (participacaoBase * (c.taxaAdmPct / 100)) + c.auditoriaAnual;
  document.getElementById('cfg-custo-out').textContent =
    `Custo anual no mês 0 ≈ ${fmtBRL0(custoAnualBase)} (${fmtPct((custoAnualBase / participacaoBase) * 100, 2)} do patrimônio).`;
}

function lerConfigDosInputs() {
  return {
    lucroMensal: Number(document.getElementById('cfg-lucroMensal').value) || 0,
    multiplo: Number(document.getElementById('cfg-multiplo').value) || 0,
    custoAbertura: Number(document.getElementById('cfg-custoAbertura').value) || 0,
    crescimento: Number(document.getElementById('cfg-crescimento').value) || 0,
    participacaoPct: Number(document.getElementById('cfg-participacao').value) || 0,
    totalCotas: Number(document.getElementById('cfg-totalCotas').value) || 1,
    taxaAdmPct: Number(document.getElementById('cfg-taxaAdm').value) || 0,
    auditoriaAnual: Number(document.getElementById('cfg-auditoria').value) || 0,
    cotasLiderMes: Number(document.getElementById('cfg-cotasLider').value) || 0,
    limiteCompraMes: Number(document.getElementById('cfg-limiteCompra').value) || 0,
    irrfPct: Number(document.getElementById('cfg-irrf').value) || 0
  };
}

/* ============================================================
   COTISTAS (card-list)
   ============================================================ */
let cotistasFiltro = 'todos';

function cotistaCardHtml(c, valorCotaAtual) {
  const liderNome = c.liderId ? (getCotista(c.liderId)?.nome || '—') : null;
  const isLider = c.papel === 'lider';
  return `
    <div class="citem ${isLider ? 'lider' : ''}">
      <div class="citem-top">
        <div>
          <span class="citem-name">${isLider ? '★ ' : ''}${c.nome}</span>
          <div class="citem-meta">${c.unidade}${liderNome ? ' · sob ' + liderNome : ''}</div>
        </div>
        <div class="citem-val">
          ${isLider ? '<span class="badge gold">LÍDER</span>' : '<span class="badge neutral">COLABORADOR(A)</span>'}
          <span class="big" style="margin-top:5px;">${fmtBRL0(c.cotas * valorCotaAtual)}</span>
          <span class="small">${fmtNum(c.cotas)} cotas</span>
        </div>
      </div>
      <div class="citem-row"><span>Entrou em</span><span class="v">${fmtMes(c.mesEntrada)} · ${state.mesAtual - c.mesEntrada} meses de casa</span></div>
      <div class="citem-actions">
        <button class="btn sm ghost full" data-comprar="${c.id}">Comprar</button>
        <button class="btn sm ghost full" data-extrato="${c.id}">Ver Extrato</button>
      </div>
    </div>`;
}

function renderCotistas() {
  const filterRoot = document.getElementById('cotistas-filter');
  const opcoes = ['todos', ...UNIDADES, 'lideres'];
  const labelFor = (o) => o === 'todos' ? 'Todos' : o === 'lideres' ? 'Líderes' : o;
  filterRoot.innerHTML = opcoes.map(o => `<button data-filtro="${o}" class="${cotistasFiltro === o ? 'active' : ''}">${labelFor(o)}</button>`).join('');
  filterRoot.querySelectorAll('button').forEach(b => b.addEventListener('click', () => { cotistasFiltro = b.dataset.filtro; renderCotistas(); }));

  let lista = state.cotistas;
  if (cotistasFiltro === 'lideres') lista = lista.filter(c => c.papel === 'lider');
  else if (cotistasFiltro !== 'todos') lista = lista.filter(c => c.unidade === cotistasFiltro);

  const valorCotaAtual = estadoNoMes(state.mesAtual).valorCota;
  const lideres = lista.filter(c => c.papel === 'lider').sort((a, b) => b.cotas - a.cotas);
  const colaboradores = lista.filter(c => c.papel === 'colaborador').sort((a, b) => b.cotas - a.cotas);

  document.getElementById('cotistas-list').innerHTML = `
    ${lideres.length ? `
      <div class="group-label"><span>Líderes de Área</span><span class="count">${lideres.length}</span></div>
      <div class="clist" style="margin-bottom:20px;">${lideres.map(c => cotistaCardHtml(c, valorCotaAtual)).join('')}</div>
    ` : ''}
    ${colaboradores.length ? `
      <div class="group-label"><span>Colaboradores</span><span class="count">${colaboradores.length}</span></div>
      <div class="clist">${colaboradores.map(c => cotistaCardHtml(c, valorCotaAtual)).join('')}</div>
    ` : ''}
    ${!lideres.length && !colaboradores.length ? `<div class="empty">Nenhum cotista neste filtro.</div>` : ''}
  `;

  document.querySelectorAll('[data-comprar]').forEach(b => b.addEventListener('click', () => abrirModalCompra(Number(b.dataset.comprar))));
  document.querySelectorAll('[data-extrato]').forEach(b => b.addEventListener('click', () => {
    state.portalSelId = Number(b.dataset.extrato);
    state.activeView = 'portal';
    persist();
    renderAll();
  }));
}

function abrirModalCompra(cotistaId) {
  const c = getCotista(cotistaId);
  const valorCotaAtual = estadoNoMes(state.mesAtual).valorCota;
  const jaComprado = c.compradoNoMes[state.mesAtual] || 0;
  const restante = state.config.limiteCompraMes - jaComprado;
  openModal(`
    <h3>Comprar cotas — ${c.nome}</h3>
    <p class="hint">Cota atual: ${fmtBRL(valorCotaAtual)} · Limite restante: ${restante} cotas.</p>
    <div class="field" style="margin-top:14px;"><label>Valor a investir (R$)</label><input type="number" id="modal-valor-compra" step="50" value="500"></div>
    <p class="hint" id="modal-compra-preview"></p>
    <div class="modal-actions">
      <button class="btn ghost" id="modal-cancelar">Cancelar</button>
      <button class="btn primary" id="modal-confirmar">Confirmar</button>
    </div>
  `, (root) => {
    const input = root.querySelector('#modal-valor-compra');
    const preview = root.querySelector('#modal-compra-preview');
    const atualiza = () => {
      const v = Number(input.value) || 0;
      const qtd = Math.min(Math.floor(v / valorCotaAtual), restante);
      preview.textContent = `≈ ${qtd} cotas (${fmtBRL(qtd * valorCotaAtual)})`;
    };
    input.addEventListener('input', atualiza);
    atualiza();
    root.querySelector('#modal-cancelar').addEventListener('click', closeModal);
    root.querySelector('#modal-confirmar').addEventListener('click', () => { registrarCompra(cotistaId, Number(input.value) || 0); closeModal(); });
  });
}

function abrirModalNovoCotista() {
  const lideres = state.cotistas.filter(c => c.papel === 'lider');
  openModal(`
    <h3>Novo Cotista</h3>
    <div class="field"><label>Nome</label><input type="text" id="modal-nome" placeholder="Nome completo"></div>
    <div class="field"><label>Unidade</label><select id="modal-unidade">${UNIDADES.map(u => `<option value="${u}">${u}</option>`).join('')}</select></div>
    <div class="field"><label>Papel</label>
      <select id="modal-papel"><option value="colaborador">Colaborador</option><option value="lider">Líder</option></select>
    </div>
    <div class="field" id="modal-lider-wrap"><label>Líder responsável</label><select id="modal-lider">${lideres.map(l => `<option value="${l.id}">${l.nome}</option>`).join('')}</select></div>
    <div class="modal-actions">
      <button class="btn ghost" id="modal-cancelar">Cancelar</button>
      <button class="btn primary" id="modal-confirmar">Adicionar</button>
    </div>
  `, (root) => {
    const papelSel = root.querySelector('#modal-papel');
    const liderWrap = root.querySelector('#modal-lider-wrap');
    papelSel.addEventListener('change', () => { liderWrap.style.display = papelSel.value === 'lider' ? 'none' : 'block'; });
    root.querySelector('#modal-cancelar').addEventListener('click', closeModal);
    root.querySelector('#modal-confirmar').addEventListener('click', () => {
      const nome = root.querySelector('#modal-nome').value.trim();
      if (!nome) { toast('Informe um nome.'); return; }
      const papel = papelSel.value;
      const unidade = root.querySelector('#modal-unidade').value;
      const liderId = papel === 'colaborador' ? Number(root.querySelector('#modal-lider').value) : null;
      state.cotistas.push({
        id: state.nextId++, nome, unidade, papel, liderId,
        vinculo: 'CLT',
        mesEntrada: state.mesAtual, cotas: 0, cotasBonificadas: 0, cotasCompradas: 0,
        valorPagoCompras: 0, compradoNoMes: {}, historico: []
      });
      persist();
      closeModal();
      toast(`${nome} adicionado(a) com sucesso.`);
      renderAll();
    });
  });
}

/* ============================================================
   CICLO MENSAL
   ============================================================ */
function renderCiclo() {
  const labels = ['Avaliar & Distribuir', 'Comitê Aprova', 'Comunicado', 'Dividendos & Fechamento'];
  document.getElementById('ciclo-stepper').innerHTML = `
    <div class="dots">${[1, 2, 3, 4].map(n => `<span class="${n < state.ciclo.step ? 'done' : n === state.ciclo.step ? 'now' : ''}"></span>`).join('')}</div>
    <div class="txt">Passo ${state.ciclo.step}/4 — <b>${labels[state.ciclo.step - 1]}</b> · ${fmtMes(state.mesAtual)}</div>
  `;
  const body = document.getElementById('ciclo-body');
  if (state.ciclo.step === 1) renderCicloStep1(body);
  else if (state.ciclo.step === 2) renderCicloStep2(body);
  else if (state.ciclo.step === 3) renderCicloStep3(body);
  else renderCicloStep4(body);
}

function getAlocLider(liderId) {
  if (!state.ciclo.alocacoes[liderId]) state.ciclo.alocacoes[liderId] = {};
  return state.ciclo.alocacoes[liderId];
}
function totalAlocLider(liderId) {
  const aloc = getAlocLider(liderId);
  return Object.values(aloc).reduce((s, v) => s + (v || 0), 0);
}

function totalMoneyAlocLider(liderId, valorCota) {
  return totalAlocLider(liderId) * valorCota;
}

function renderCicloStep1(body) {
  const lideres = state.cotistas.filter(c => c.papel === 'lider');
  const valorCotaAtual = estadoNoMes(state.mesAtual).valorCota;
  body.innerHTML = `
    <p class="hint" style="margin-bottom:16px;">Cada líder recebe ${state.config.cotasLiderMes} cotas/mês para distribuir conforme performance — o valor em reais aparece conforme você seleciona.</p>
    ${lideres.map(lider => {
      const colabs = colaboradoresDe(lider.id);
      const aloc = getAlocLider(lider.id);
      return `
      <div class="lider-block" data-lider="${lider.id}">
        <div class="head">
          <div><div class="name">${lider.nome}</div><span class="unidade">${lider.unidade}</span></div>
          <span class="badge gold">${state.config.cotasLiderMes}/MÊS</span>
        </div>
        ${colabs.map(co => {
          const qtd = aloc[co.id] || 0;
          return `
          <div class="qty-row">
            <div class="qty-row-main">
              <span class="who">${co.nome}</span>
              <div class="qty-stepper">
                <button data-step="-1" data-lider="${lider.id}" data-colab="${co.id}">−</button>
                <span class="qv" data-qty="${lider.id}-${co.id}">${qtd}</span>
                <button data-step="1" data-lider="${lider.id}" data-colab="${co.id}">+</button>
              </div>
            </div>
            <div class="qty-money-line ${qtd > 0 ? 'has-value' : ''}" data-money="${lider.id}-${co.id}">${qtd > 0 ? '≈ ' + fmtBRL(qtd * valorCotaAtual) : 'sem cotas selecionadas'}</div>
          </div>`;
        }).join('')}
        <div class="alloc-total">
          <span>Distribuídas</span>
          <span data-total-lider="${lider.id}" class="${totalAlocLider(lider.id) > state.config.cotasLiderMes ? 'bad' : 'ok'}">${totalAlocLider(lider.id)} / ${state.config.cotasLiderMes}</span>
        </div>
        <div class="alloc-total money">
          <span>Equivalente em R$</span>
          <span data-total-money-lider="${lider.id}" class="ok">${fmtBRL(totalMoneyAlocLider(lider.id, valorCotaAtual))}</span>
        </div>
      </div>`;
    }).join('')}
    <button class="btn primary full" id="btn-step1-next">Avançar para Aprovação →</button>
  `;

  body.querySelectorAll('[data-step]').forEach(btn => {
    btn.addEventListener('click', () => {
      const liderId = Number(btn.dataset.lider), colabId = Number(btn.dataset.colab), delta = Number(btn.dataset.step);
      const aloc = getAlocLider(liderId);
      const atual = aloc[colabId] || 0;
      const totalAtual = totalAlocLider(liderId);
      let novo = atual + delta;
      if (novo < 0) novo = 0;
      if (delta > 0 && totalAtual >= state.config.cotasLiderMes) return;
      aloc[colabId] = novo;
      body.querySelector(`[data-qty="${liderId}-${colabId}"]`).textContent = novo;

      const moneyEl = body.querySelector(`[data-money="${liderId}-${colabId}"]`);
      moneyEl.textContent = novo > 0 ? `≈ ${fmtBRL(novo * valorCotaAtual)}` : 'sem cotas selecionadas';
      moneyEl.classList.toggle('has-value', novo > 0);

      const totalEl = body.querySelector(`[data-total-lider="${liderId}"]`);
      const total = totalAlocLider(liderId);
      totalEl.textContent = `${total} / ${state.config.cotasLiderMes}`;
      totalEl.className = total > state.config.cotasLiderMes ? 'bad' : 'ok';

      const totalMoneyEl = body.querySelector(`[data-total-money-lider="${liderId}"]`);
      totalMoneyEl.textContent = fmtBRL(totalMoneyAlocLider(liderId, valorCotaAtual));

      persist();
    });
  });

  document.getElementById('btn-step1-next').addEventListener('click', () => {
    const algumExcedeu = lideres.some(l => totalAlocLider(l.id) > state.config.cotasLiderMes);
    if (algumExcedeu) { toast('Algum líder excedeu o limite de cotas do mês.'); return; }
    state.ciclo.step = 2;
    persist();
    renderCiclo();
  });
}

function renderCicloStep2(body) {
  const lideres = state.cotistas.filter(c => c.papel === 'lider');
  body.innerHTML = `
    <div class="m-card">
      <h3 style="margin-bottom:12px;">Resumo para o Comitê</h3>
      <div class="clist">
        ${lideres.map(l => `
          <div class="citem"><div class="citem-top">
            <div><span class="citem-name">${l.nome}</span><div class="citem-meta">${l.unidade}</div></div>
            <div class="citem-val"><span class="big">${totalAlocLider(l.id)} cotas</span></div>
          </div></div>`).join('')}
      </div>
      <div class="scenario-row total"><span class="k">Total geral</span><span class="v">${lideres.reduce((s, l) => s + totalAlocLider(l.id), 0)} cotas</span></div>
    </div>
    <button class="btn ghost full" id="btn-step2-back" style="margin-bottom:10px;">← Voltar e Ajustar</button>
    <button class="btn primary full" id="btn-step2-next">Comitê Aprova ✓</button>
  `;
  document.getElementById('btn-step2-back').addEventListener('click', () => { state.ciclo.step = 1; persist(); renderCiclo(); });
  document.getElementById('btn-step2-next').addEventListener('click', () => {
    state.ciclo.aprovado = true;
    state.ciclo.step = 3;
    persist();
    renderCiclo();
    toast('Distribuição aprovada pelo Comitê.');
  });
}

function gerarTextoComunicado() {
  const lideres = state.cotistas.filter(c => c.papel === 'lider');
  let linhas = [];
  lideres.forEach(l => colaboradoresDe(l.id).forEach(co => {
    const qtd = (getAlocLider(l.id)[co.id]) || 0;
    if (qtd > 0) linhas.push(`- ${co.nome}: ${qtd} cotas (${fmtBRL0(qtd * estadoNoMes(state.mesAtual).valorCota)})`);
  }));
  return `COMUNICADO — FUNDO DE INVESTIMENTO — ${fmtMes(state.mesAtual).toUpperCase()}

Prezados Colaboradores,

Segue distribuição de cotas deste mês:

Bonificação por Performance:
${linhas.length ? linhas.join('\n') : '- Nenhuma cota distribuída neste mês'}

Próximas Etapas:
- ${fmtMes(state.mesAtual + 1)}: próxima distribuição
- Relatório trimestral de performance do fundo

Dúvidas? Contate o RH.`;
}

function renderCicloStep3(body) {
  const texto = gerarTextoComunicado();
  body.innerHTML = `
    <div class="comunicado">${texto.replace('COMUNICADO', '<span class="h">COMUNICADO</span>')}</div>
    <button class="btn ghost full" id="btn-copiar" style="margin-bottom:10px;">Copiar Texto</button>
    <button class="btn ghost full" id="btn-step3-back" style="margin-bottom:10px;">← Voltar</button>
    <button class="btn primary full" id="btn-step3-next">Avançar para Dividendos →</button>
  `;
  document.getElementById('btn-step3-back').addEventListener('click', () => { state.ciclo.step = 2; persist(); renderCiclo(); });
  document.getElementById('btn-step3-next').addEventListener('click', () => { state.ciclo.step = 4; persist(); renderCiclo(); });
  document.getElementById('btn-copiar').addEventListener('click', () => {
    navigator.clipboard?.writeText(texto).then(() => toast('Comunicado copiado.'), () => toast('Selecione o texto manualmente para copiar.'));
  });
}

function renderCicloStep4(body) {
  const e = estadoNoMes(state.mesAtual);
  const lucroMes = state.ciclo.lucroMes;
  body.innerHTML = `
    <div class="m-card">
      <h3>Lucro da Academia neste Mês</h3>
      <div class="field" style="margin-top:12px;"><label>Lucro (R$)</label><input type="number" id="input-lucro-mes" step="2000" value="${lucroMes}"></div>
      <p class="hint" id="dividendo-formula"></p>
    </div>
    <div class="m-card">
      <h3 style="margin-bottom:10px;">Resultado do Mês</h3>
      <div class="scenario-row"><span class="k">Fundo recebe (${state.config.participacaoPct}%)</span><span class="v" id="out-fundoRecebe"></span></div>
      <div class="scenario-row"><span class="k">Custos do mês</span><span class="v" id="out-custo"></span></div>
      <div class="scenario-row"><span class="k">Lucro líquido</span><span class="v" id="out-liquido"></span></div>
      <div class="scenario-row total"><span class="k">Dividendo por cota</span><span class="v" id="out-divCota"></span></div>
    </div>
    <div id="tabela-dividendos"></div>
    <button class="btn ghost full" id="btn-step4-back" style="margin:14px 0 10px;">← Voltar ao Comunicado</button>
    <button class="btn primary full" id="btn-fechar-mes">Fechar ${fmtMes(state.mesAtual)} ✓</button>
  `;

  const atualiza = () => {
    const lucro = Number(document.getElementById('input-lucro-mes').value) || 0;
    state.ciclo.lucroMes = lucro;
    const fr = lucro * (state.config.participacaoPct / 100);
    const cm = e.patrimonioFundo * (state.config.taxaAdmPct / 100 / 12) + state.config.auditoriaAnual / 12;
    const lq = fr - cm;
    const dpc = lq / state.config.totalCotas;
    document.getElementById('out-fundoRecebe').textContent = fmtBRL(fr);
    document.getElementById('out-custo').textContent = fmtBRL(cm);
    document.getElementById('out-liquido').textContent = fmtBRL(lq);
    document.getElementById('out-divCota').textContent = fmtBRL(dpc);
    document.getElementById('dividendo-formula').textContent =
      `${fmtBRL0(lucro)} × ${state.config.participacaoPct}% − ${fmtBRL0(cm)} custos = ${fmtBRL0(lq)} ÷ ${fmtNum(state.config.totalCotas)} cotas`;

    const linhas = state.cotistas.map(c => {
      const bonus = (c.papel === 'colaborador' && c.liderId) ? (getAlocLider(c.liderId)[c.id] || 0) : 0;
      const saldoFinal = c.cotas + bonus;
      return { c, bonus, saldoFinal, dividendo: saldoFinal * dpc };
    }).sort((a, b) => b.saldoFinal - a.saldoFinal);

    document.getElementById('tabela-dividendos').innerHTML = `
      <div class="m-card" style="padding-bottom:6px;">
        <h3 style="margin-bottom:10px;">Por Cotista</h3>
        <div class="clist">
          ${linhas.map(l => `
            <div class="citem"><div class="citem-top">
              <div><span class="citem-name">${l.c.nome}</span><div class="citem-meta">${l.bonus > 0 ? '+' + l.bonus + ' cotas de bônus' : 'sem bônus este mês'}</div></div>
              <div class="citem-val"><span class="big">${fmtBRL(l.dividendo)}</span><span class="small">${fmtNum(l.saldoFinal)} cotas</span></div>
            </div></div>`).join('')}
        </div>
      </div>`;
    persist();
  };
  document.getElementById('input-lucro-mes').addEventListener('input', atualiza);
  atualiza();

  document.getElementById('btn-step4-back').addEventListener('click', () => { state.ciclo.step = 3; persist(); renderCiclo(); });
  document.getElementById('btn-fechar-mes').addEventListener('click', fecharMes);
}

function fecharMes() {
  const lucro = state.ciclo.lucroMes;
  const eAntes = estadoNoMes(state.mesAtual);
  const fr = lucro * (state.config.participacaoPct / 100);
  const cm = eAntes.patrimonioFundo * (state.config.taxaAdmPct / 100 / 12) + state.config.auditoriaAnual / 12;
  const dpc = (fr - cm) / state.config.totalCotas;

  state.cotistas.forEach(c => {
    const bonus = (c.papel === 'colaborador' && c.liderId) ? (getAlocLider(c.liderId)[c.id] || 0) : 0;
    if (bonus > 0) {
      c.cotas += bonus;
      c.cotasBonificadas += bonus;
      c.historico.push({ mes: state.mesAtual, tipo: 'bonificacao', qtd: bonus, valor: 0, desc: 'Bonificação por performance' });
    }
    if (c.cotas > 0) {
      c.historico.push({ mes: state.mesAtual, tipo: 'dividendo', qtd: null, valor: c.cotas * dpc, desc: 'Dividendo mensal' });
    }
  });

  state.mesAtual += 1;
  state.ciclo = { step: 1, alocacoes: {}, lucroMes: state.config.lucroMensal, aprovado: false };
  persist();
  toast(`${fmtMes(state.mesAtual - 1)} fechado. Dividendo de ${fmtBRL(dpc)}/cota distribuído.`);
  renderAll();
}

/* ============================================================
   EVOLUÇÃO (card-list)
   ============================================================ */
function renderEvolucao() {
  const linhas = [];
  for (let ano = 0; ano <= 10; ano++) linhas.push(estadoNoMes(ano * 12));
  const pontos = linhas.map(l => ({ y: l.valorCota, label: `${l.mes / 12}a` }));
  document.getElementById('evolucao-chart').innerHTML = svgLineChart(pontos, { height: 200 });

  document.getElementById('evolucao-list').innerHTML = `
    <div class="clist">
      ${linhas.map(l => `
        <div class="citem">
          <div class="citem-top">
            <div><span class="citem-name">Ano ${l.mes / 12}</span><div class="citem-meta">valuation ${fmtShort(l.valuation)}</div></div>
            <div class="citem-val"><span class="big">${fmtBRL(l.valorCota)}</span><span class="small">por cota</span></div>
          </div>
          <div class="citem-row"><span>Patrimônio do fundo</span><span class="v">${fmtBRL0(l.patrimonioFundo)}</span></div>
        </div>`).join('')}
    </div>
  `;
}

/* ============================================================
   SAÍDA & RECOMPRA
   ============================================================ */
function renderSaida() {
  const c = getCotista(state.saidaSelId) || state.cotistas[0];
  document.getElementById('saida-switch-label').textContent = `${c.nome} — ${c.unidade}`;

  const r = calcSaidaScenario(c);

  document.getElementById('saida-body').innerHTML = `
    <div class="identity-card">
      <div class="avatar">${initials(c.nome)}</div>
      <div class="info"><h2>${c.nome}</h2><div class="role">${c.unidade} · entrou no mês ${c.mesEntrada} · ${fmtNum(c.cotas)} cotas</div></div>
    </div>
    <div class="scenario">
      <span class="tier badge gold">RECOMPRA PELO FUNDO — SEM CARÊNCIA</span>
      <div class="scenario-row"><span class="k">Valor da cota na saída</span><span class="v">${fmtBRL(r.valorCotaAtual)}</span></div>
      <div class="scenario-row"><span class="k">Cotas recompradas (100%)</span><span class="v">${fmtNum(r.totalCotas)}</span></div>
      <div class="scenario-row"><span class="k">Valor de venda ao preço de mercado</span><span class="v">${fmtBRL(r.valorVenda)}</span></div>
      <div class="scenario-row"><span class="k">Ganho de capital</span><span class="v">${fmtBRL(r.ganho)}</span></div>
      <div class="scenario-row"><span class="k">IRRF (${state.config.irrfPct}% sobre o ganho)</span><span class="v">− ${fmtBRL(r.imposto)}</span></div>
      <div class="scenario-row total"><span class="k">Valor líquido recebido</span><span class="v">${fmtBRL(r.valorLiquido)}</span></div>
    </div>
    <p class="hint" style="margin-top:14px;">Sem regra de vesting: independente do tempo de casa, ao sair o fundo recompra 100% das cotas do cotista pelo valor de mercado do momento, com IRRF de ${state.config.irrfPct}% sobre o ganho de capital (se houver).</p>
  `;
}

/* ============================================================
   FIP — ACCORDION
   ============================================================ */
function wireAccordion() {
  document.querySelectorAll('#fip-accordion .acc-head').forEach(btn => {
    btn.addEventListener('click', () => {
      const item = btn.closest('.acc-item');
      const isOpen = item.classList.contains('open');
      item.classList.toggle('open', !isOpen);
      btn.querySelector('.acc-ico').textContent = !isOpen ? '−' : '+';
    });
  });
}

/* ============================================================
   EVENTOS GLOBAIS + INIT
   ============================================================ */
function openMaisSheet() {
  const itemsHtml = `<div>
    <button class="sheet-item" data-go="evolucao"><span class="ic">05</span>Evolução &amp; Projeção</button>
    <button class="sheet-item" data-go="saida"><span class="ic">06</span>Saída &amp; Recompra</button>
    <button class="sheet-item" data-go="config"><span class="ic">07</span>Configuração do Fundo</button>
    <button class="sheet-item" data-go="fip"><span class="ic">★</span>O Que É um FIP?</button>
  </div>`;
  openSheet(`<h3>Mais Opções</h3>`, itemsHtml, (root) => {
    root.querySelectorAll('[data-go]').forEach(b => {
      b.addEventListener('click', () => {
        state.activeView = b.dataset.go;
        persist();
        renderAll();
        closeSheet();
      });
    });
  });
}

function wireGlobalEvents() {
  document.getElementById('bottom-nav').addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    if (btn.dataset.sheet) { openMaisSheet(); return; }
    if (btn.dataset.view) {
      state.activeView = btn.dataset.view;
      persist();
      renderAll();
    }
  });

  document.getElementById('btn-reset-sim').addEventListener('click', resetSim);

  document.getElementById('portal-switch').addEventListener('click', () => {
    openCotistaPicker(state.portalSelId, (id) => { state.portalSelId = id; persist(); renderPortal(); });
  });
  document.getElementById('saida-switch').addEventListener('click', () => {
    openCotistaPicker(state.saidaSelId, (id) => { state.saidaSelId = id; persist(); renderSaida(); });
  });

  document.getElementById('cfg-aplicar').addEventListener('click', () => {
    state.config = lerConfigDosInputs();
    persist();
    rebuildEstados();
    renderAll();
    toast('Configuração aplicada e recalculada.');
  });
  document.getElementById('cfg-padrao').addEventListener('click', () => {
    state.config = { ...DEFAULT_CONFIG };
    persist();
    rebuildEstados();
    renderAll();
    toast('Parâmetros padrão restaurados.');
  });

  document.getElementById('btn-novo-cotista').addEventListener('click', abrirModalNovoCotista);

  wireAccordion();
}

function init() {
  state = loadState();
  rebuildEstados();
  wireGlobalEvents();
  renderAll();
}

document.addEventListener('DOMContentLoaded', init);
