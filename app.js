/* ============================================================
   FUNDO GAVIÕES — SIMULADOR MOBILE
   Motor de cálculo + estado + renderização. Sem backend, sem banco.
   Tudo em memória / localStorage.
   ============================================================ */

const STORAGE_KEY = 'gavioes_fundo_sim_v17';
const HORIZON_MESES = 480; // 40 anos de estados pré-computados

const DEFAULT_CONFIG = {
  lucroMensal: 31200,
  multiplo: 10,
  custoAbertura: 5000000,
  crescimento: 10,       // % a.a. de valorização da academia
  participacaoPct: 2.5,  // % do fundo na academia
  totalCotas: 2400,
  taxaAdmPct: 1.5,        // % a.a. sobre patrimônio
  auditoriaAnual: 6000,   // R$/ano fixo
  cotasLiderMes: 20,
  limiteCompraMes: 20,
  irrfPct: 15,
  reservaPct: 10,             // % do patrimônio reservado em caixa p/ recompras de saída
  limiteConcentracaoPct: 10,  // máximo de % do total de cotas por cotista
  prazoPagamentoDias: 60      // prazo máximo para pagar a recompra de quem sai
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
const GENEROS_BASE = ['F', 'M', 'F', 'M', 'F', 'M', 'F', 'M', 'F', 'M',
  'F', 'M', 'F', 'M', 'F', 'M', 'F', 'M', 'F', 'M',
  'F', 'M', 'M', 'F', 'F', 'M', 'F', 'M', 'F', 'M',
  'F', 'M', 'F', 'M', 'F', 'M', 'F', 'M', 'F', 'M',
  'F', 'M', 'F', 'F', 'M', 'M', 'F', 'M', 'M', 'F'];
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

function generoColaborador(i) {
  return GENEROS_BASE[i % 50];
}

function seedCotistas() {
  const estadosSeed = buildEstados(DEFAULT_CONFIG, 30);
  const mk = (id, nome, unidade, papel, liderId, mesEntrada, cotas, genero) => {
    const bonRatio = 0.5 + Math.random() * 0.3;
    const bon = Math.round(cotas * bonRatio);
    const comp = cotas - bon;
    const valorCotaNaEpoca = estadosSeed[Math.min(mesEntrada, estadosSeed.length - 1)].valorCota;
    const precoMedio = valorCotaNaEpoca * (0.94 + Math.random() * 0.12);
    const valorPago = Math.round(comp * precoMedio);

    const dividendoEntries = [];
    for (let m = mesEntrada; m < 30; m++) {
      const e = estadosSeed[m];
      const fundoRecebe = DEFAULT_CONFIG.lucroMensal * (DEFAULT_CONFIG.participacaoPct / 100);
      const custoMensal = e.patrimonioFundo * (DEFAULT_CONFIG.taxaAdmPct / 100 / 12) + DEFAULT_CONFIG.auditoriaAnual / 12;
      const dividendoPorCota = (fundoRecebe - custoMensal) / DEFAULT_CONFIG.totalCotas;
      const dividendoCotista = cotas * dividendoPorCota;
      if (dividendoCotista > 0) {
        dividendoEntries.push({ mes: m, tipo: 'dividendo', qtd: null, valor: Math.round(dividendoCotista * 100) / 100, desc: 'Dividendo mensal' });
      }
    }

    // Perfil de pequeno investidor: parte dos cotistas tem plano mensal via folha
    // e/ou reinvestimento automático de dividendos (padrão estável por id).
    const planoMensal = (id % 3 === 0) ? 50 + (id % 4) * 50 : (papel === 'lider' ? 200 : 0);
    const reinvestirDividendos = id % 4 === 0 || papel === 'lider';
    return {
      id, nome, unidade, papel, liderId,
      vinculo: 'CLT',
      mesEntrada,
      cotas, cotasBonificadas: bon, cotasCompradas: comp, valorPagoCompras: valorPago,
      planoMensal, reinvestirDividendos,
      creditoReinvestimento: reinvestirDividendos ? Math.round(Math.random() * 3000) / 100 : 0,
      fotoUrl: `https://randomuser.me/api/portraits/${genero === 'F' ? 'women' : 'men'}/${id % 15}.jpg`,
      compradoNoMes: {},
      historico: [
        { mes: mesEntrada, tipo: 'bonificacao', qtd: bon, valor: 0, desc: 'Bonificação inicial por performance' },
        ...(comp > 0 ? [{ mes: mesEntrada, tipo: 'compra', qtd: comp, valor: valorPago, desc: 'Compra de cotas' }] : []),
        ...dividendoEntries
      ]
    };
  };

  const lideresDef = [
    { id: 1, nome: 'Marcos Tavares', unidade: 'Marketing', mesEntrada: 0, cotas: 90, genero: 'M' },
    { id: 2, nome: 'Rodrigo Lemos', unidade: 'Operação', mesEntrada: 4, cotas: 80, genero: 'M' },
    { id: 3, nome: 'Patrícia Reis', unidade: 'Implantação', mesEntrada: 8, cotas: 70, genero: 'F' },
    { id: 4, nome: 'Camila Duarte', unidade: 'Administrativo', mesEntrada: 12, cotas: 60, genero: 'F' },
    { id: 5, nome: 'Bruno Ferreira', unidade: 'Comercial', mesEntrada: 16, cotas: 55, genero: 'M' },
    { id: 6, nome: 'Fernanda Costa', unidade: 'Financeiro', mesEntrada: 20, cotas: 50, genero: 'F' }
  ];
  const lideres = lideresDef.map(l => mk(l.id, l.nome, l.unidade, 'lider', null, l.mesEntrada, l.cotas, l.genero));

  const QTD_COLABORADORES = 100;
  const TOTAL_COTAS_DESEJADO = 1279; // líderes (405) + colaboradores (874)
  const cotasLideresSoma = lideresDef.reduce((s, l) => s + l.cotas, 0);
  const cotasColaboradores = Math.max(0, TOTAL_COTAS_DESEJADO - cotasLideresSoma);
  const distribuicao = distribuirAleatorio(QTD_COLABORADORES, cotasColaboradores);

  const colaboradores = [];
  for (let i = 0; i < QTD_COLABORADORES; i++) {
    const nome = nomeColaborador(i);
    const genero = generoColaborador(i);
    const lider = lideresDef[i % lideresDef.length];
    const mesEntrada = Math.floor(Math.random() * 30);
    colaboradores.push(mk(7 + i, nome, lider.unidade, 'colaborador', lider.id, mesEntrada, distribuicao[i], genero));
  }

  return [...lideres, ...colaboradores];
}

function seedMercado(cotistas, valorCotaRef) {
  // Escolhe alguns cotistas com cotas suficientes para anunciar parte à venda,
  // com preços variando em ágio/deságio em torno do valor patrimonial da cota.
  const candidatos = cotistas.filter(c => c.cotas >= 6).sort((a, b) => b.cotas - a.cotas);
  const picks = [candidatos[1], candidatos[4], candidatos[7], candidatos[11], candidatos[2], candidatos[15]].filter(Boolean);
  const fatores = [1.05, 0.97, 1.10, 0.99, 1.03, 0.94]; // ágio (>1) ou deságio (<1)
  const fracoes = [0.35, 0.5, 0.25, 0.6, 0.3, 0.45];
  return picks.map((c, i) => ({
    id: 1000 + i,
    vendedorId: c.id,
    cotas: Math.max(2, Math.round(c.cotas * fracoes[i])),
    precoPorCota: Math.round(valorCotaRef * fatores[i] * 100) / 100,
    mesAnuncio: 30 - (i % 6),
    status: 'ativo'
  }));
}

function seedCotacao(estados, mesAtual) {
  // Histórico de cotação (preço de mercado) oscilando em ágio/deságio em torno do NAV
  const hist = [];
  const start = Math.max(0, mesAtual - 11);
  for (let m = start; m <= mesAtual; m++) {
    const nav = estados[Math.min(m, estados.length - 1)].valorCota;
    const osc = Math.sin(m * 0.9) * 0.045 + Math.cos(m * 1.7) * 0.02; // ±~6%
    hist.push({ mes: m, nav, preco: Math.round(nav * (1 + osc) * 100) / 100 });
  }
  return hist;
}

function freshState() {
  const cotistas = seedCotistas();
  const estadosRef = buildEstados(DEFAULT_CONFIG, 30);
  const valorCotaRef = estadosRef[30].valorCota;
  const distribuido = cotistas.reduce((s, c) => s + c.cotas, 0);
  const naoDistribuido = DEFAULT_CONFIG.totalCotas - distribuido;
  const reservaEmpresa = Math.round(naoDistribuido * 0.62); // empresa detém a maior parte p/ bonificar
  const tesourariaFundo = naoDistribuido - reservaEmpresa;   // fundo guarda o resto p/ recompra
  const cotacaoHist = seedCotacao(estadosRef, 30);
  return {
    config: { ...DEFAULT_CONFIG },
    cotistas,
    mercado: seedMercado(cotistas, valorCotaRef),
    reservaEmpresa,
    tesourariaFundo,
    pagamentosPendentes: [],
    precoMercado: cotacaoHist[cotacaoHist.length - 1].preco,
    cotacaoHist,
    mesAtual: 30,
    nextId: 107,
    nextListingId: 1010,
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
        parsed.config = { ...DEFAULT_CONFIG, ...parsed.config };
        parsed.cotistas.forEach(c => {
          if (c.planoMensal == null) c.planoMensal = 0;
          if (c.reinvestirDividendos == null) c.reinvestirDividendos = false;
          if (c.creditoReinvestimento == null) c.creditoReinvestimento = 0;
        });
        if (!Array.isArray(parsed.mercado)) parsed.mercado = [];
        if (parsed.nextListingId == null) parsed.nextListingId = 1010;
        // Pools de posse das cotas (empresa vs fundo)
        if (parsed.reservaEmpresa == null || parsed.tesourariaFundo == null) {
          const distribuido = parsed.cotistas.reduce((s, c) => s + c.cotas, 0);
          const naoDistribuido = Math.max(0, parsed.config.totalCotas - distribuido);
          parsed.reservaEmpresa = Math.round(naoDistribuido * 0.62);
          parsed.tesourariaFundo = naoDistribuido - parsed.reservaEmpresa;
        }
        if (!Array.isArray(parsed.pagamentosPendentes)) parsed.pagamentosPendentes = [];
        // Cotação de mercado (preço x NAV)
        if (!Array.isArray(parsed.cotacaoHist) || parsed.precoMercado == null) {
          const est = buildEstados(parsed.config, parsed.mesAtual + 1);
          parsed.cotacaoHist = seedCotacao(est, parsed.mesAtual);
          parsed.precoMercado = parsed.cotacaoHist[parsed.cotacaoHist.length - 1].preco;
        }
        return parsed;
      }
    }
  } catch (e) { /* ignora e recria */ }
  return freshState();
}

function resetSim() {
  if (!confirm('Reiniciar a simulação? Todos os dados voltam ao ponto de partida.')) return;
  try { localStorage.removeItem(STORAGE_KEY); } catch (e) { /* ignora */ }
  const cleanUrl = window.location.origin + window.location.pathname;
  if (navigator.onLine && 'caches' in window) {
    // Com internet: limpa o cache do service worker pra garantir página e dados atualizados
    caches.keys()
      .then((keys) => Promise.all(keys.map((k) => caches.delete(k))))
      .catch(() => {})
      .finally(() => { window.location.href = cleanUrl; });
  } else {
    // Sem internet: recarrega a mesma URL (sem query string) pra bater com o cache offline
    window.location.href = cleanUrl;
  }
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

/* Cotas não-distribuídas = as que estão em algum pool (empresa + fundo).
   Invariante do sistema: distribuído + reservaEmpresa + tesourariaFundo === totalCotas. */
function cotasNaoDistribuidas() { return (state.reservaEmpresa || 0) + (state.tesourariaFundo || 0); }
function cotasEmTesouraria() { return cotasNaoDistribuidas(); } // compat: "tesouraria" no sentido amplo
function maxCotasPorCotista() { return Math.floor(state.config.totalCotas * (state.config.limiteConcentracaoPct / 100)); }

/* Quantas cotas um cotista ainda pode adquirir, respeitando concentração e cotas disponíveis nos pools */
function margemCompra(cotista) {
  return Math.max(0, Math.min(maxCotasPorCotista() - cotista.cotas, cotasNaoDistribuidas()));
}

/* Emite cotas dos pools para um cotista (compra primária): tira da Tesouraria do
   Fundo primeiro, depois da Reserva da Empresa. Retorna quantas foram emitidas. */
function emitirCotas(qtd) {
  qtd = Math.max(0, Math.min(qtd, cotasNaoDistribuidas()));
  const daTes = Math.min(state.tesourariaFundo, qtd);
  state.tesourariaFundo -= daTes;
  const daEmp = qtd - daTes;
  state.reservaEmpresa -= daEmp;
  return qtd;
}

/* Concede cotas de bonificação a partir da Reserva da Empresa (depois Tesouraria do Fundo).
   Retorna quantas foram efetivamente concedidas. */
function concederBonificacao(qtd) {
  qtd = Math.max(0, Math.min(qtd, cotasNaoDistribuidas()));
  const daEmp = Math.min(state.reservaEmpresa, qtd);
  state.reservaEmpresa -= daEmp;
  state.tesourariaFundo -= (qtd - daEmp);
  return qtd;
}

/* Devolve cotas recompradas a um pool ('empresa' ou 'fundo') */
function devolverCotas(qtd, destino) {
  if (destino === 'empresa') state.reservaEmpresa += qtd;
  else state.tesourariaFundo += qtd;
}

/* Ágio (>0) ou deságio (<0) da cotação de mercado sobre o valor patrimonial (NAV), em % */
function agioDesagioPct() {
  const nav = estadoNoMes(state.mesAtual).valorCota;
  if (!nav) return 0;
  return ((state.precoMercado - nav) / nav) * 100;
}

/* Cotas atualmente ofertadas à venda no mercado (pressão de oferta) */
function ofertaMercado() {
  return (state.mercado || []).filter(l => l.status === 'ativo').reduce((s, l) => s + l.cotas, 0);
}

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
  const margem = margemCompra(cotista);
  if (margem <= 0) { toast(`Limite de concentração atingido (máx. ${fmtNum(maxCotasPorCotista())} cotas por cotista).`); return; }
  qtd = Math.min(qtd, restante, margem);
  if (qtd <= 0) { toast('Valor insuficiente para comprar ao menos 1 cota.'); return; }
  qtd = emitirCotas(qtd); // primária: sai da Tesouraria do Fundo / Reserva da Empresa
  if (qtd <= 0) { toast('Não há cotas disponíveis nos pools para emissão.'); return; }
  const custo = qtd * valorCotaAtual;
  cotista.cotas += qtd;
  cotista.cotasCompradas += qtd;
  cotista.valorPagoCompras += custo;
  cotista.compradoNoMes[state.mesAtual] = jaComprado + qtd;
  cotista.historico.push({ mes: state.mesAtual, tipo: 'compra', qtd, valor: custo, desc: 'Compra de cotas (emissão primária)' });
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

function openCotistaPicker(currentId, onPick, excludeId, titulo) {
  const base = state.cotistas.filter(c => c.id !== excludeId);
  const lideres = base.filter(c => c.papel === 'lider');
  const colaboradores = base.filter(c => c.papel === 'colaborador');
  const itemHtml = (c) => `
    <button class="sheet-item" data-pick="${c.id}">
      <span class="ic">${c.id === currentId ? '●' : '○'}</span>
      <span>${c.papel === 'lider' ? '<span class="pick-tag">LÍDER</span> ' : ''}${c.nome} <span style="color:var(--ink-faint); font-size:11.5px;">— ${c.unidade}</span></span>
    </button>`;
  const itemsHtml = `<div>
    ${lideres.length ? `<div class="sheet-subhead">Líderes de Área</div>${lideres.map(itemHtml).join('')}` : ''}
    ${colaboradores.length ? `<div class="sheet-subhead">Colaboradores</div>${colaboradores.map(itemHtml).join('')}` : ''}
  </div>`;
  openSheet(`<h3>${titulo || 'Selecionar Cotista'}</h3>`, itemsHtml, (root) => {
    root.querySelectorAll('[data-pick]').forEach(b => {
      b.addEventListener('click', () => { onPick(Number(b.dataset.pick)); closeSheet(); });
    });
  });
}

function svgLineChart(points, opts = {}) {
  const width = opts.width || 540, height = opts.height || 190, pad = opts.pad || 30;
  const refPoints = opts.refPoints || null; // série de referência (linha tracejada)
  const allYs = points.map(p => p.y).concat(refPoints ? refPoints.map(p => p.y) : []);
  const minY = Math.min(...allYs) * 0.96, maxY = Math.max(...allYs) * 1.04;
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
  let refLine = '';
  if (refPoints && refPoints.length === points.length) {
    const rp = refPoints.map((p, i) => `${xToPx(i)},${yToPx(p.y)}`).join(' ');
    refLine = `<polyline points="${rp}" fill="none" stroke="#a39c89" stroke-width="1.6" stroke-dasharray="5 4" opacity="0.75"></polyline>`;
  }
  return `
  <svg class="chart-svg-line" viewBox="0 0 ${width} ${height}" preserveAspectRatio="xMidYMid meet">
    <defs><linearGradient id="goldFade" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#d9a440" stop-opacity="0.35"/><stop offset="100%" stop-color="#d9a440" stop-opacity="0"/>
    </linearGradient></defs>
    ${gridLines}
    <polygon class="area" points="${areaPts}"></polygon>
    ${refLine}
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
  if (tipo === 'reinvestimento') return `<span class="badge olive">REINVESTIDO</span>`;
  if (tipo === 'venda') return `<span class="badge rust">VENDA</span>`;
  if (tipo === 'compra-mercado') return `<span class="badge neutral">COMPRA MERCADO</span>`;
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
  else if (v === 'mercado') renderMercado();
  else if (v === 'regras') renderRegras();
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
  const cotasAnunciadasC = cotasAnunciadas(c.id);
  const cotasLivresVenda = cotasDisponiveisVenda(c);
  const historicoOrdenado = [...c.historico].sort((a, b) => b.mes - a.mes)
    .filter(h => dentroDoPeriodo(h.mes, state.mesAtual, state.portalPeriodo));

  document.getElementById('portal-body').innerHTML = `
    <div class="hero-card">
      <div class="avatar ${c.papel === 'lider' ? 'lider' : ''}" style="background-image:url('${c.fotoUrl}'); background-size:cover; background-position:center;">${c.papel === 'lider' ? '<span class="crown">★</span>' : ''}</div>
      <div class="name">${c.nome}</div>
      <div class="role">${c.papel === 'lider' ? '<span class="badge gold" style="margin-right:6px;">LÍDER DE ÁREA</span>' : '<span class="badge neutral" style="margin-right:6px;">COLABORADOR(A)</span>'}${c.unidade}</div>
      <div class="lbl">Suas cotas valem hoje</div>
      <div class="big">${fmtBRL0(valorAtual)}</div>
      <div class="sub">${fmtNum(c.cotas)} cotas (${fmtNum(c.cotasBonificadas)} bônus + ${fmtNum(c.cotasCompradas)} compradas) × ${fmtBRL(valorCotaAtual)}</div>
      <div class="rendimento-pill">+ ${fmtBRL0(totalDividendos)} em dividendos recebidos até hoje</div>
    </div>

    <div class="stat-grid">
      <div class="kpi-card"><span class="lbl">Pago do Bolso</span><span class="val">${fmtBRL0(totalInvestido)}</span><span class="sub">${fmtNum(c.cotasCompradas)} compradas · +${fmtNum(c.cotasBonificadas)} de bônus grátis</span></div>
      <div class="kpi-card">
        <span class="lbl">Dividendos</span><span class="val">${fmtBRL0(totalDividendos)}</span><span class="sub">recebido até hoje</span>
        <button class="kpi-mini-btn" id="btn-quick-sim">Simular ›</button>
      </div>
    </div>

    <div class="m-card">
      <div class="panel-title"><h2>Meu Plano de Investidor</h2><span class="meta">automático</span></div>
      <div class="field"><label>Investimento mensal via folha (R$) — 0 desativa</label><input type="number" id="plano-mensal-input" min="0" step="25" value="${c.planoMensal || 0}"></div>
      <p class="hint" id="plano-mensal-preview" style="margin-bottom:14px;"></p>
      <label class="drip-toggle">
        <input type="checkbox" id="drip-toggle" ${c.reinvestirDividendos ? 'checked' : ''}>
        <span class="box"></span>
        <span class="txt"><strong>Reinvestir dividendos automaticamente</strong><br>Seus dividendos acumulam como crédito e, a cada cota inteira, viram novas cotas no fechamento do mês.</span>
      </label>
      ${c.reinvestirDividendos && (c.creditoReinvestimento || 0) > 0 ? `<p class="hint" style="margin-top:10px; color:var(--olive);">Crédito acumulado: ${fmtBRL(c.creditoReinvestimento)} — faltam ${fmtBRL(Math.max(0, valorCotaAtual - c.creditoReinvestimento))} para a próxima cota.</p>` : ''}
      <p class="hint" style="margin-top:10px;">Limites: ${state.config.limiteCompraMes} cotas/mês de compra · máx. ${fmtNum(maxCotasPorCotista())} cotas por cotista (${state.config.limiteConcentracaoPct}% do fundo).</p>
    </div>

    <div class="m-card">
      <div class="panel-title"><h2>Propriedade das Cotas</h2><span class="meta">100% sua</span></div>
      <p class="hint">Suas cotas são 100% suas desde o dia em que você as recebeu ou comprou — não existe carência. Na entrada da empresa (${fmtMes(c.mesEntrada)}, há ${tempoCasa} ${tempoCasa === 1 ? 'mês' : 'meses'}), você já é proprietário pleno. Se sair da empresa, o fundo recompra suas cotas pelo valor de mercado do momento — simule na aba Saída &amp; Recompra.</p>
    </div>

    <div class="m-card">
      <div class="panel-title"><h2>Vender no Mercado de Cotas</h2><span class="meta">liquidez</span></div>
      <p class="hint" style="margin-bottom:12px;">Quer realizar parte do ganho sem sair da empresa? Você pode anunciar cotas para outro cotista comprar. Cotas livres para anunciar: <strong style="color:var(--ink);">${fmtNum(cotasLivresVenda)}</strong>${cotasAnunciadasC > 0 ? ` · <span style="color:var(--gold-bright);">${fmtNum(cotasAnunciadasC)} já anunciadas</span>` : ''}.</p>
      <button class="btn primary full" id="btn-anunciar-portal" ${cotasLivresVenda <= 0 ? 'disabled' : ''}>Anunciar cotas à venda</button>
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
                <div class="citem-val">${badgeTipo(h.tipo)}<span class="big" style="margin-top:4px;">${h.qtd != null ? (h.qtd >= 0 ? '+' : '') + fmtNum(h.qtd) + ' cotas' : fmtBRL(h.valor)}</span></div>
              </div>
            </div>`).join('')}
        </div>` : `<div class="empty">Nenhum lançamento neste período.</div>`}
    </div>
  `;

  wirePeriodoChips('portal', (key) => { state.portalPeriodo = key; persist(); renderPortal(); });

  // Plano do investidor: desconto em folha + reinvestimento automático
  const planoInput = document.getElementById('plano-mensal-input');
  const planoPreview = document.getElementById('plano-mensal-preview');
  const atualizaPlano = () => {
    const v = Math.max(0, Number(planoInput.value) || 0);
    c.planoMensal = v;
    if (v > 0) {
      const qtd = Math.floor(v / valorCotaAtual);
      planoPreview.textContent = `No fechamento do mês: ${fmtBRL0(v)} descontados em folha viram ≈ ${qtd} ${qtd === 1 ? 'cota' : 'cotas'} (cota a ${fmtBRL(valorCotaAtual)}).`;
    } else {
      planoPreview.textContent = 'Sem plano ativo — você ainda pode comprar cotas avulsas na aba Cotistas.';
    }
    persist();
  };
  planoInput.addEventListener('input', atualizaPlano);
  atualizaPlano();
  document.getElementById('drip-toggle').addEventListener('change', (ev) => {
    c.reinvestirDividendos = ev.target.checked;
    persist();
    toast(ev.target.checked ? 'Reinvestimento automático ativado.' : 'Reinvestimento automático desativado.');
  });

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
  const btnAnunciar = document.getElementById('btn-anunciar-portal');
  if (btnAnunciar) btnAnunciar.addEventListener('click', () => abrirModalAnuncio(c.id));
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
    <div class="kpi-card"><span class="lbl">Valor Patrimonial (NAV)</span><span class="val">${fmtBRL(e.valorCota)}</span><span class="sub ${variacaoCota >= 0 ? 'pos' : 'neg'}">${variacaoCota >= 0 ? '+' : ''}${fmtPct(variacaoCota)}</span></div>
    <div class="kpi-card"><span class="lbl">Preço de Mercado</span><span class="val">${fmtBRL(state.precoMercado)}</span><span class="sub ${agioDesagioPct() > 0.5 ? 'neg' : agioDesagioPct() < -0.5 ? 'pos' : ''}">${Math.abs(agioDesagioPct()) < 0.5 ? 'no NAV' : (agioDesagioPct() > 0 ? 'ágio ' : 'deságio ') + fmtPct(Math.abs(agioDesagioPct()))}</span></div>
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
    `${fmtNum(distrib)} cotas com funcionários`, `${fmtNum(state.config.totalCotas - distrib)} em tesouraria`,
    `${fmtNum(state.config.totalCotas)} cotas totais`
  );

  // Posse das cotas + liquidez para recompras
  const reservaEmp = state.reservaEmpresa || 0;
  const tesFundo = state.tesourariaFundo || 0;
  const reserva = e.patrimonioFundo * (state.config.reservaPct / 100);
  const capacidadeRecompra = Math.floor(reserva / e.valorCota);
  const pendentes = (state.pagamentosPendentes || []).filter(p => p.status === 'pendente');
  const totalPendente = pendentes.reduce((s, p) => s + p.valorLiquido, 0);
  document.getElementById('overview-tesouraria').innerHTML = `
    <div class="scenario-row"><span class="k">Reserva da Empresa (p/ bonificar)</span><span class="v">${fmtNum(reservaEmp)} cotas · ${fmtBRL0(reservaEmp * e.valorCota)}</span></div>
    <div class="scenario-row"><span class="k">Tesouraria do Fundo (p/ recompra)</span><span class="v">${fmtNum(tesFundo)} cotas · ${fmtBRL0(tesFundo * e.valorCota)}</span></div>
    <div class="scenario-row"><span class="k">Caixa de recompra (${state.config.reservaPct}% do patrimônio)</span><span class="v">${fmtBRL0(reserva)}</span></div>
    <div class="scenario-row"><span class="k">Capacidade de recompra imediata</span><span class="v">${fmtNum(capacidadeRecompra)} cotas</span></div>
    ${pendentes.length ? `<div class="scenario-row total"><span class="k">Pagamentos de saída pendentes</span><span class="v">${pendentes.length} · ${fmtBRL0(totalPendente)}</span></div>` : `<div class="scenario-row total"><span class="k">Pagamentos de saída pendentes</span><span class="v">nenhum</span></div>`}
    <p class="hint" style="margin-top:10px;">A <strong>Empresa</strong> detém cotas para bonificar funcionários; o <strong>Fundo</strong> guarda cotas para recomprar quem sai. O caixa de recompra garante o pagamento (em até ${state.config.prazoPagamentoDias} dias) sem depender do lucro do mês. Detalhes na aba <strong>Regras do Fundo</strong>.</p>
  `;

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
              <div class="citem-val">${badgeTipo(a.tipo)}<span class="big" style="margin-top:4px;">${a.qtd != null ? (a.qtd >= 0 ? '+' : '') + fmtNum(a.qtd) : fmtBRL(a.valor)}</span></div>
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
  document.getElementById('cfg-reserva').value = c.reservaPct;
  document.getElementById('cfg-concentracao').value = c.limiteConcentracaoPct;
  document.getElementById('cfg-prazoPagamento').value = c.prazoPagamentoDias;
  document.getElementById('cfg-reservaEmpresa').value = state.reservaEmpresa || 0;
  const poolInfo = document.getElementById('cfg-pools-out');
  if (poolInfo) poolInfo.textContent = `Distribuídas ${fmtNum(totalDistribuido())} + Reserva Empresa ${fmtNum(state.reservaEmpresa || 0)} + Tesouraria Fundo ${fmtNum(state.tesourariaFundo || 0)} = ${fmtNum(totalDistribuido() + (state.reservaEmpresa||0) + (state.tesourariaFundo||0))} de ${fmtNum(c.totalCotas)} cotas.`;

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
    irrfPct: Number(document.getElementById('cfg-irrf').value) || 0,
    reservaPct: Number(document.getElementById('cfg-reserva').value) || 0,
    limiteConcentracaoPct: Number(document.getElementById('cfg-concentracao').value) || 100,
    prazoPagamentoDias: Number(document.getElementById('cfg-prazoPagamento').value) || 60
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
  const restante = Math.min(state.config.limiteCompraMes - jaComprado, margemCompra(c));
  openModal(`
    <h3>Comprar cotas — ${c.nome}</h3>
    <p class="hint">Cota atual: ${fmtBRL(valorCotaAtual)} · Limite restante: ${restante} cotas (mês + concentração).</p>
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
      const primeiroNome = nome.split(' ')[0];
      const idxConhecido = NOMES_BASE.findIndex(n => n.toLowerCase() === primeiroNome.toLowerCase());
      const genero = idxConhecido >= 0 ? GENEROS_BASE[idxConhecido] : (/a$/i.test(primeiroNome) ? 'F' : 'M');
      const novoId = state.nextId++;
      state.cotistas.push({
        id: novoId, nome, unidade, papel, liderId,
        vinculo: 'CLT',
        mesEntrada: state.mesAtual, cotas: 0, cotasBonificadas: 0, cotasCompradas: 0,
        valorPagoCompras: 0,
        planoMensal: 0, reinvestirDividendos: false, creditoReinvestimento: 0,
        fotoUrl: `https://randomuser.me/api/portraits/${genero === 'F' ? 'women' : 'men'}/${novoId % 15}.jpg`,
        compradoNoMes: {}, historico: []
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
  const comPlano = state.cotistas.filter(c => c.planoMensal > 0);
  const somaPlanos = comPlano.reduce((s, c) => s + c.planoMensal, 0);
  const comDrip = state.cotistas.filter(c => c.reinvestirDividendos && c.cotas > 0);
  body.innerHTML = `
    <div class="m-card">
      <h3>Lucro da Academia neste Mês</h3>
      <div class="field" style="margin-top:12px;"><label>Lucro (R$)</label><input type="number" id="input-lucro-mes" step="2000" value="${lucroMes}"></div>
      <p class="hint" id="dividendo-formula"></p>
    </div>
    <div class="m-card">
      <h3 style="margin-bottom:10px;">Pequenos Investidores no Fechamento</h3>
      <div class="scenario-row"><span class="k">Planos de folha ativos</span><span class="v">${comPlano.length} cotistas · ${fmtBRL0(somaPlanos)}/mês</span></div>
      <div class="scenario-row"><span class="k">Reinvestimento automático ligado</span><span class="v">${comDrip.length} cotistas</span></div>
      <p class="hint" style="margin-top:10px;">Ao fechar o mês, os planos compram cotas via folha e os dividendos de quem tem reinvestimento automático viram novas cotas.</p>
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
  const valorCota = eAntes.valorCota;
  const fr = lucro * (state.config.participacaoPct / 100);
  const cm = eAntes.patrimonioFundo * (state.config.taxaAdmPct / 100 / 12) + state.config.auditoriaAnual / 12;
  const dpc = (fr - cm) / state.config.totalCotas;

  let totCotasFolha = 0, totCotasReinvestidas = 0;

  state.cotistas.forEach(c => {
    // 1. Bonificação aprovada pelos líderes — cotas saem da Reserva da Empresa
    let bonus = (c.papel === 'colaborador' && c.liderId) ? (getAlocLider(c.liderId)[c.id] || 0) : 0;
    if (bonus > 0) {
      bonus = concederBonificacao(bonus);
      if (bonus > 0) {
        c.cotas += bonus;
        c.cotasBonificadas += bonus;
        c.historico.push({ mes: state.mesAtual, tipo: 'bonificacao', qtd: bonus, valor: 0, desc: 'Bonificação por performance (Reserva da Empresa)' });
      }
    }

    // 2. Plano do investidor: compra automática via desconto em folha (emissão dos pools)
    if (c.planoMensal > 0) {
      const jaComprado = c.compradoNoMes[state.mesAtual] || 0;
      let qtd = Math.floor(c.planoMensal / valorCota);
      qtd = Math.min(qtd, state.config.limiteCompraMes - jaComprado, margemCompra(c));
      qtd = emitirCotas(qtd);
      if (qtd > 0) {
        const custo = qtd * valorCota;
        c.cotas += qtd;
        c.cotasCompradas += qtd;
        c.valorPagoCompras += custo;
        c.compradoNoMes[state.mesAtual] = jaComprado + qtd;
        c.historico.push({ mes: state.mesAtual, tipo: 'compra', qtd, valor: custo, desc: 'Investimento via folha de pagamento' });
        totCotasFolha += qtd;
      }
    }

    // 3. Dividendo do mês (sobre o saldo já atualizado)
    if (c.cotas > 0 && dpc > 0) {
      const dividendo = c.cotas * dpc;
      c.historico.push({ mes: state.mesAtual, tipo: 'dividendo', qtd: null, valor: dividendo, desc: 'Dividendo mensal' });

      // 4. Reinvestimento automático: o dividendo acumula como crédito e,
      // quando o crédito compra ao menos 1 cota inteira, converte.
      if (c.reinvestirDividendos) {
        c.creditoReinvestimento = (c.creditoReinvestimento || 0) + dividendo;
        let qtdR = Math.floor(c.creditoReinvestimento / valorCota);
        qtdR = Math.min(qtdR, margemCompra(c));
        qtdR = emitirCotas(qtdR);
        if (qtdR > 0) {
          const custoR = qtdR * valorCota;
          c.cotas += qtdR;
          c.cotasCompradas += qtdR;
          c.valorPagoCompras += custoR;
          c.creditoReinvestimento -= custoR;
          c.historico.push({ mes: state.mesAtual, tipo: 'reinvestimento', qtd: qtdR, valor: custoR, desc: 'Reinvestimento automático de dividendos' });
          totCotasReinvestidas += qtdR;
        }
      }
    }
  });

  state.mesAtual += 1;

  // Dinâmica da cotação de mercado no novo mês:
  // NAV é a gravidade (reversão à média) + pressão de oferta/demanda, dentro de banda ±20%.
  const navNovo = estadoNoMes(state.mesAtual).valorCota;
  const oferta = ofertaMercado();
  const demanda = totCotasFolha + totCotasReinvestidas; // pressão compradora estrutural do mês
  const baseDist = Math.max(1, totalDistribuido());
  const pressao = Math.max(-0.1, Math.min(0.1, (demanda - oferta) / baseDist)); // normalizada e limitada
  let p = state.precoMercado + (navNovo - state.precoMercado) * 0.30; // reversão ao NAV
  p = p * (1 + 0.6 * pressao);                                        // oferta x demanda
  p = Math.max(navNovo * 0.80, Math.min(navNovo * 1.20, p));          // banda ±20%
  state.precoMercado = Math.round(p * 100) / 100;
  state.cotacaoHist.push({ mes: state.mesAtual, nav: navNovo, preco: state.precoMercado });
  if (state.cotacaoHist.length > 24) state.cotacaoHist = state.cotacaoHist.slice(-24);

  state.ciclo = { step: 1, alocacoes: {}, lucroMes: state.config.lucroMensal, aprovado: false };
  persist();
  const extras = [];
  if (totCotasFolha > 0) extras.push(`${totCotasFolha} cotas via folha`);
  if (totCotasReinvestidas > 0) extras.push(`${totCotasReinvestidas} reinvestidas`);
  toast(`${fmtMes(state.mesAtual - 1)} fechado. Dividendo de ${fmtBRL(dpc)}/cota${extras.length ? ' · ' + extras.join(' · ') : ''}.`);
  renderAll();
}

/* Executa o desligamento: recompra as cotas a mercado seguindo a cascata de
   prioridade e devolve ao pool do absorvedor. Pagamento em até prazoPagamentoDias.
   absorvedor: 'empresa' (Reserva da Empresa) ou 'fundo' (Tesouraria do Fundo). */
function processarSaida(cotistaId, absorvedor = 'empresa') {
  const c = getCotista(cotistaId);
  if (!c) return;
  const r = calcSaidaScenario(c);
  const cotasRecompradas = c.cotas;

  // devolve as cotas ao pool de quem recomprou
  devolverCotas(cotasRecompradas, absorvedor);

  // registra a obrigação de pagamento (prazo em meses ≈ dias/30)
  const prazoMeses = Math.max(1, Math.round(state.config.prazoPagamentoDias / 30));
  state.pagamentosPendentes.push({
    id: (state.nextListingId = (state.nextListingId || 1010) + 1),
    cotistaNome: c.nome,
    cotas: cotasRecompradas,
    valorLiquido: Math.round(r.valorLiquido),
    absorvedor,
    mesSaida: state.mesAtual,
    mesLimite: state.mesAtual + prazoMeses,
    status: 'pendente'
  });

  state.cotistas = state.cotistas.filter(x => x.id !== c.id);
  if (state.portalSelId === c.id) state.portalSelId = state.cotistas[0]?.id;
  if (state.saidaSelId === c.id) state.saidaSelId = state.cotistas[0]?.id;
  // remove anúncios do vendedor que saiu
  state.mercado.forEach(l => { if (l.vendedorId === c.id && l.status === 'ativo') l.status = 'cancelado'; });
  persist();
  const quem = absorvedor === 'empresa' ? 'Empresa' : 'Fundo';
  toast(`${c.nome} desligado(a). ${fmtNum(cotasRecompradas)} cotas recompradas pela ${quem} por ${fmtBRL0(r.valorLiquido)} — pagamento em até ${state.config.prazoPagamentoDias} dias.`);
  renderAll();
}

/* ============================================================
   MERCADO SECUNDÁRIO DE COTAS (entre cotistas ativos)
   ============================================================ */
function anunciosDe(cotistaId) {
  return state.mercado.filter(l => l.vendedorId === cotistaId && l.status === 'ativo');
}
function cotasAnunciadas(cotistaId) {
  return anunciosDe(cotistaId).reduce((s, l) => s + l.cotas, 0);
}
/* Cotas que o cotista pode anunciar agora (não pode anunciar mais do que possui livre) */
function cotasDisponiveisVenda(cotista) {
  return Math.max(0, cotista.cotas - cotasAnunciadas(cotista.id));
}

function anunciarCotas(vendedorId, cotas, precoPorCota) {
  const vendedor = getCotista(vendedorId);
  if (!vendedor) return false;
  cotas = Math.floor(cotas);
  if (cotas <= 0 || precoPorCota <= 0) { toast('Informe quantidade e preço válidos.'); return false; }
  if (cotas > cotasDisponiveisVenda(vendedor)) {
    toast(`${vendedor.nome} tem só ${fmtNum(cotasDisponiveisVenda(vendedor))} cotas livres para anunciar.`);
    return false;
  }
  state.mercado.push({
    id: state.nextListingId++,
    vendedorId, cotas,
    precoPorCota: Math.round(precoPorCota * 100) / 100,
    mesAnuncio: state.mesAtual,
    status: 'ativo'
  });
  persist();
  toast(`${vendedor.nome} anunciou ${fmtNum(cotas)} cotas a ${fmtBRL(precoPorCota)} cada.`);
  renderAll();
  return true;
}

function cancelarAnuncio(listingId) {
  const l = state.mercado.find(x => x.id === listingId && x.status === 'ativo');
  if (!l) return;
  l.status = 'cancelado';
  persist();
  toast('Anúncio cancelado.');
  renderAll();
}

function comprarNoMercado(listingId, compradorId) {
  const l = state.mercado.find(x => x.id === listingId && x.status === 'ativo');
  if (!l) return;
  const comprador = getCotista(compradorId);
  const vendedor = getCotista(l.vendedorId);
  if (!comprador || !vendedor) return;
  if (comprador.id === vendedor.id) { toast('O comprador não pode ser o próprio vendedor.'); return; }

  const margem = maxCotasPorCotista() - comprador.cotas; // limite de concentração
  let qtd = Math.min(l.cotas, Math.max(0, margem));
  if (qtd <= 0) {
    toast(`${comprador.nome} atingiu o teto de concentração (máx. ${fmtNum(maxCotasPorCotista())} cotas).`);
    return;
  }
  const custo = qtd * l.precoPorCota;

  // Vendedor: baixa cotas (compradas primeiro, depois bonificadas) e custo-base proporcional
  const deCompradas = Math.min(vendedor.cotasCompradas, qtd);
  const deBonificadas = qtd - deCompradas;
  if (vendedor.cotasCompradas > 0) {
    vendedor.valorPagoCompras = Math.round(vendedor.valorPagoCompras * (1 - deCompradas / vendedor.cotasCompradas));
  }
  vendedor.cotasCompradas -= deCompradas;
  vendedor.cotasBonificadas = Math.max(0, vendedor.cotasBonificadas - deBonificadas);
  vendedor.cotas -= qtd;
  vendedor.historico.push({ mes: state.mesAtual, tipo: 'venda', qtd: -qtd, valor: custo, desc: `Venda de cotas no mercado para ${comprador.nome}` });

  // Comprador: adiciona cotas ao custo pago
  comprador.cotas += qtd;
  comprador.cotasCompradas += qtd;
  comprador.valorPagoCompras += custo;
  comprador.historico.push({ mes: state.mesAtual, tipo: 'compra-mercado', qtd, valor: custo, desc: `Compra de cotas no mercado de ${vendedor.nome}` });

  // Anúncio: reduz ou encerra
  l.cotas -= qtd;
  if (l.cotas <= 0) l.status = 'vendido';

  // Última cotação de mercado = preço do último negócio realizado
  state.precoMercado = l.precoPorCota;

  persist();
  const ad = agioDesagioPct();
  const adTxt = Math.abs(ad) < 0.5 ? 'no valor patrimonial' : ad > 0 ? `ágio de ${fmtPct(ad)}` : `deságio de ${fmtPct(Math.abs(ad))}`;
  toast(`${comprador.nome} comprou ${fmtNum(qtd)} cotas de ${vendedor.nome} por ${fmtBRL0(custo)} — cotação ${adTxt}.`);
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
      <div class="avatar" style="background-image:url('${c.fotoUrl}'); background-size:cover; background-position:center;"></div>
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
    <p class="hint" style="margin-top:14px;">Sem regra de vesting: independente do tempo de casa, ao sair o cotista tem 100% das cotas recompradas pelo valor de mercado do momento, com IRRF de ${state.config.irrfPct}% sobre o ganho de capital (se houver).</p>

    <div class="m-card" style="margin-top:16px;">
      <h3 style="margin-bottom:10px;">Cascata de Recompra</h3>
      <div class="waterfall">
        <div class="wf-step"><span class="wf-n">1</span><div><strong>Funcionários ativos</strong><p>As cotas são ofertadas primeiro aos colegas, pelo Mercado de Cotas. Quem quiser, compra direto.</p></div></div>
        <div class="wf-step"><span class="wf-n">2</span><div><strong>Empresa</strong><p>Se ninguém comprar, a empresa recompra para a Reserva e reusa as cotas em novas bonificações.</p></div></div>
        <div class="wf-step last"><span class="wf-n">3</span><div><strong>Fundo</strong><p>Em último caso, o fundo recompra para a Tesouraria, garantindo a liquidez de quem sai.</p></div></div>
      </div>
      <p class="hint" style="margin-top:6px;">Pagamento em até <strong>${state.config.prazoPagamentoDias} dias</strong> a partir do desligamento.</p>
      <div class="citem-actions" style="margin-top:14px;">
        <button class="btn sm ghost full" id="btn-saida-empresa">Empresa recompra</button>
        <button class="btn sm primary full" id="btn-saida-fundo">Fundo recompra</button>
      </div>
      <button class="btn ghost full" id="btn-saida-mercado" style="margin-top:10px;">Ofertar aos funcionários (Mercado)</button>
    </div>
  `;

  const exec = (absorvedor) => {
    const quem = absorvedor === 'empresa' ? 'a Empresa' : 'o Fundo';
    if (!confirm(`Processar o desligamento de ${c.nome}? ${quem} recompra ${fmtNum(c.cotas)} cotas por ${fmtBRL0(r.valorLiquido)} líquidos, com pagamento em até ${state.config.prazoPagamentoDias} dias.`)) return;
    processarSaida(c.id, absorvedor);
  };
  document.getElementById('btn-saida-empresa').addEventListener('click', () => exec('empresa'));
  document.getElementById('btn-saida-fundo').addEventListener('click', () => exec('fundo'));
  document.getElementById('btn-saida-mercado').addEventListener('click', () => abrirModalAnuncio(c.id));
}

/* ============================================================
   REGRAS DO FUNDO
   ============================================================ */
function renderRegras() {
  const c = state.config;
  const e = estadoNoMes(state.mesAtual);
  const reservaEmp = state.reservaEmpresa || 0;
  const tesFundo = state.tesourariaFundo || 0;
  const maxCota = maxCotasPorCotista();
  const pendentes = (state.pagamentosPendentes || []).filter(p => p.status === 'pendente');

  document.getElementById('regras-body').innerHTML = `
    <div class="m-card">
      <h3 style="margin-bottom:10px;">De quem são as cotas</h3>
      <p style="font-size:13px; line-height:1.65; color:var(--ink-dim);">Toda cota do fundo pertence a um de três lugares. A soma é sempre igual ao total emitido — nada aparece nem some do nada.</p>
      <div class="rule-pools">
        <div class="rp"><span class="rp-dot" style="background:var(--gold);"></span><div><strong>Cotistas</strong><span>${fmtNum(totalDistribuido())} cotas com funcionários</span></div></div>
        <div class="rp"><span class="rp-dot" style="background:var(--olive);"></span><div><strong>Reserva da Empresa</strong><span>${fmtNum(reservaEmp)} cotas — a empresa usa para bonificar quem performa</span></div></div>
        <div class="rp"><span class="rp-dot" style="background:#6f9bb0;"></span><div><strong>Tesouraria do Fundo</strong><span>${fmtNum(tesFundo)} cotas — o fundo usa para recomprar quem sai</span></div></div>
      </div>
      <div class="scenario-row total" style="margin-top:6px;"><span class="k">Total emitido</span><span class="v">${fmtNum(c.totalCotas)} cotas</span></div>
    </div>

    <div class="m-card">
      <h3 style="margin-bottom:4px;">Dinheiro x cotas</h3>
      <p class="hint" style="margin-bottom:8px;">Não confunda as duas coisas:</p>
      <div class="scenario-row"><span class="k">Caixa de recompra (dinheiro)</span><span class="v">${fmtBRL0(e.patrimonioFundo * (c.reservaPct / 100))}</span></div>
      <div class="scenario-row"><span class="k">Cotas em reserva/tesouraria</span><span class="v">${fmtNum(reservaEmp + tesFundo)} cotas</span></div>
      <p class="hint" style="margin-top:8px;">A <strong>Tesouraria/Reserva</strong> guarda <strong>cotas</strong> (para bonificar e recomprar). O <strong>Caixa de recompra</strong> é <strong>dinheiro</strong> (${c.reservaPct}% do patrimônio) separado para pagar quem sai. São coisas diferentes.</p>
    </div>

    <div class="m-card">
      <h3 style="margin-bottom:4px;">Valor patrimonial x Preço de mercado</h3>
      <p class="hint" style="margin-bottom:8px;">Como em qualquer FIP ou FII fechado, a cota tem dois valores:</p>
      <div class="scenario-row"><span class="k">Valor patrimonial (NAV) hoje</span><span class="v">${fmtBRL(e.valorCota)}</span></div>
      <div class="scenario-row"><span class="k">Preço de mercado (última cotação)</span><span class="v">${fmtBRL(state.precoMercado)}</span></div>
      <div class="scenario-row total"><span class="k">Ágio / deságio</span><span class="v">${Math.abs(agioDesagioPct()) < 0.5 ? 'no par' : (agioDesagioPct() > 0 ? '+' : '') + fmtPct(agioDesagioPct())}</span></div>
      <div class="diff-list" style="margin-top:14px;">
        <div class="diff-row"><span class="check">✓</span><div class="txt"><strong>Comprar e vender NÃO muda o valor patrimonial</strong><span>Emissão e recompra acontecem ao NAV: entra/sai dinheiro e cota na mesma proporção. O NAV só muda com o desempenho do ativo (a academia valorizando e distribuindo resultado).</span></div></div>
        <div class="diff-row"><span class="check">✓</span><div class="txt"><strong>Comprar e vender MUDA o preço de mercado</strong><span>No mercado secundário, oferta e demanda empurram a cotação para ágio (mais compradores) ou deságio (mais vendedores). É o preço que um colega paga a outro.</span></div></div>
        <div class="diff-row"><span class="check">✓</span><div class="txt"><strong>O preço gravita de volta ao NAV</strong><span>No longo prazo o preço de mercado tende a acompanhar o valor patrimonial — o ágio/deságio é o "humor" de curto prazo do mercado interno.</span></div></div>
      </div>
      <p class="hint" style="margin-top:10px;">Na prática: a <strong>recompra na saída</strong> é sempre pelo valor patrimonial (justo e previsível). O <strong>ágio/deságio</strong> vive só no Mercado de Cotas, entre colegas.</p>
    </div>

    <div class="m-card">
      <h3 style="margin-bottom:14px;">Como uma cota se move</h3>
      <div class="flow">
        <div class="flow-step"><span class="flow-n">1</span><div><strong>Bonificação</strong><p>A empresa distribui cotas da <strong>Reserva da Empresa</strong> aos funcionários que performam (via líderes, no Ciclo Mensal). Limite de ${c.cotasLiderMes} cotas/líder por mês.</p></div></div>
        <div class="flow-step"><span class="flow-n">2</span><div><strong>Compra</strong><p>O funcionário compra cotas por emissão primária (saem da Tesouraria do Fundo, depois da Reserva). Limite de ${c.limiteCompraMes} cotas/mês por pessoa, via folha ou avulsa.</p></div></div>
        <div class="flow-step"><span class="flow-n">3</span><div><strong>Revenda entre colegas</strong><p>No <strong>Mercado de Cotas</strong>, um cotista anuncia e outro funcionário ativo compra, ao preço negociado. Cota vai de pessoa para pessoa, sem passar pelos pools.</p></div></div>
        <div class="flow-step last"><span class="flow-n">4</span><div><strong>Recompra na saída</strong><p>Quem sai da empresa tem as cotas recompradas e devolvidas ao pool de quem recomprou. Segue a cascata de prioridade abaixo.</p></div></div>
      </div>
    </div>

    <div class="m-card">
      <h3 style="margin-bottom:6px;">Quem recompra: ordem de prioridade</h3>
      <p class="hint" style="margin-bottom:12px;">Quando alguém quer vender ou sai da empresa, as cotas são oferecidas nesta ordem:</p>
      <div class="waterfall">
        <div class="wf-step"><span class="wf-n">1</span><div><strong>Funcionários ativos</strong><p>Direito de preferência. As cotas aparecem no Mercado de Cotas para os colegas comprarem primeiro.</p></div></div>
        <div class="wf-step"><span class="wf-n">2</span><div><strong>Empresa</strong><p>Se ninguém comprar, a empresa recompra para a Reserva e reaproveita em novas bonificações.</p></div></div>
        <div class="wf-step last"><span class="wf-n">3</span><div><strong>Fundo</strong><p>Em último caso, o fundo recompra para a Tesouraria — é a garantia de liquidez de quem sai.</p></div></div>
      </div>
    </div>

    <div class="m-card">
      <h3 style="margin-bottom:10px;">Regras de saída da empresa</h3>
      <div class="diff-list">
        <div class="diff-row"><span class="check">✓</span><div class="txt"><strong>Recompra obrigatória</strong><span>Saiu da empresa, as 100% das cotas são recompradas — o fundo é exclusivo de funcionários ativos.</span></div></div>
        <div class="diff-row"><span class="check">✓</span><div class="txt"><strong>Preço justo (marcação a mercado)</strong><span>Recompra pelo valor patrimonial da cota no dia da saída. O funcionário leva a valorização do período.</span></div></div>
        <div class="diff-row"><span class="check">✓</span><div class="txt"><strong>Pagamento em até ${c.prazoPagamentoDias} dias</strong><span>A empresa/fundo tem até ${c.prazoPagamentoDias} dias para pagar a recompra, sem travar o caixa operacional.</span></div></div>
        <div class="diff-row"><span class="check">✓</span><div class="txt"><strong>IRRF de ${c.irrfPct}% sobre o ganho</strong><span>Incide só sobre o ganho de capital (diferença entre o que pagou e o que recebe).</span></div></div>
      </div>
      ${pendentes.length ? `
        <div class="group-label" style="margin:16px 0 8px;"><span>Pagamentos de saída pendentes</span><span class="count">${pendentes.length}</span></div>
        <div class="clist">
          ${pendentes.map(p => `
            <div class="citem"><div class="citem-top">
              <div><span class="citem-name">${p.cotistaNome}</span><div class="citem-meta">${p.absorvedor === 'empresa' ? 'Empresa' : 'Fundo'} · saiu ${fmtMes(p.mesSaida)} · pagar até ${fmtMes(p.mesLimite)}</div></div>
              <div class="citem-val"><span class="big">${fmtBRL0(p.valorLiquido)}</span><span class="small">${fmtNum(p.cotas)} cotas</span></div>
            </div></div>`).join('')}
        </div>` : ''}
    </div>

    <div class="m-card">
      <h3 style="margin-bottom:10px;">Proteções do fundo</h3>
      <div class="scenario-row"><span class="k">Concentração máxima por cotista</span><span class="v">${c.limiteConcentracaoPct}% · ${fmtNum(maxCota)} cotas</span></div>
      <div class="scenario-row"><span class="k">Caixa de recompra</span><span class="v">${c.reservaPct}% do patrimônio</span></div>
      <div class="scenario-row"><span class="k">Compra por funcionário / mês</span><span class="v">${fmtNum(c.limiteCompraMes)} cotas</span></div>
      <div class="scenario-row"><span class="k">Bonificação por líder / mês</span><span class="v">${fmtNum(c.cotasLiderMes)} cotas</span></div>
      <p class="hint" style="margin-top:10px;">Nenhuma pessoa pode concentrar cotas demais, e o fundo mantém dinheiro em caixa para honrar recompras. Ajuste tudo na aba <strong>Configuração do Fundo</strong>.</p>
    </div>
  `;
}

/* ============================================================
   MERCADO DE COTAS
   ============================================================ */
function renderMercado() {
  const valorCota = estadoNoMes(state.mesAtual).valorCota;
  const ativos = state.mercado.filter(l => l.status === 'ativo');
  const totalCotasVenda = ativos.reduce((s, l) => s + l.cotas, 0);
  const volumeTotal = ativos.reduce((s, l) => s + l.cotas * l.precoPorCota, 0);
  const precos = ativos.map(l => l.precoPorCota);
  const faixa = precos.length ? `${fmtBRL(Math.min(...precos))} – ${fmtBRL(Math.max(...precos))}` : '—';

  const ad = agioDesagioPct();
  const adCls = ad > 0.5 ? 'neg' : ad < -0.5 ? 'pos' : ''; // ágio = preço acima (rust), deságio = abaixo (olive)
  const adTxt = Math.abs(ad) < 0.5 ? 'no valor patrimonial' : ad > 0 ? `ágio ${fmtPct(ad)}` : `deságio ${fmtPct(Math.abs(ad))}`;

  const hist = state.cotacaoHist || [];
  const precoPts = hist.map(h => ({ y: h.preco, label: `M${h.mes}` }));
  const navPts = hist.map(h => ({ y: h.nav, label: `M${h.mes}` }));

  document.getElementById('mercado-resumo').innerHTML = `
    <div class="stat-grid">
      <div class="kpi-card"><span class="lbl">Preço de mercado</span><span class="val">${fmtBRL(state.precoMercado)}</span><span class="sub ${adCls}">${adTxt}</span></div>
      <div class="kpi-card"><span class="lbl">Valor patrimonial (NAV)</span><span class="val">${fmtBRL(valorCota)}</span><span class="sub">definido pelo ativo</span></div>
      <div class="kpi-card"><span class="lbl">Cotas à venda</span><span class="val">${fmtNum(totalCotasVenda)}</span><span class="sub">${ativos.length} anúncios · oferta</span></div>
      <div class="kpi-card"><span class="lbl">Faixa de preço</span><span class="val" style="font-size:13px;">${faixa}</span><span class="sub">min – máx pedido</span></div>
    </div>
    <div class="m-card" style="margin:12px 0 4px;">
      <div class="panel-title"><h2>Cotação de Mercado</h2><span class="meta">preço x NAV</span></div>
      <div id="mercado-cotacao-chart"></div>
      <div class="chart-legend">
        <span class="lg"><i class="ln gold"></i>Preço de mercado</span>
        <span class="lg"><i class="ln dash"></i>Valor patrimonial (NAV)</span>
      </div>
      <p class="hint" style="margin-top:6px;">O preço de mercado flutua com oferta e demanda em <strong>ágio</strong> (acima) ou <strong>deságio</strong> (abaixo) do valor patrimonial — que é definido pelo desempenho do ativo, não pelos negócios. Igual a um fundo fechado (FIP/FII). Entenda em <strong>Regras do Fundo</strong>.</p>
    </div>
    <button class="btn primary full" id="btn-anunciar-mercado" style="margin-top:4px;">+ Anunciar cotas à venda</button>
  `;
  if (precoPts.length > 1) {
    document.getElementById('mercado-cotacao-chart').innerHTML = svgLineChart(precoPts, { height: 170, refPoints: navPts });
  }
  document.getElementById('btn-anunciar-mercado').addEventListener('click', () => abrirModalAnuncio());

  const lista = document.getElementById('mercado-list');
  if (!ativos.length) {
    lista.innerHTML = `<div class="empty">Nenhuma cota anunciada no momento. Toque em “Anunciar cotas à venda”.</div>`;
    return;
  }

  // ordena por deságio (mais barato relativo ao valor patrimonial primeiro)
  ativos.sort((a, b) => (a.precoPorCota - valorCota) / valorCota - (b.precoPorCota - valorCota) / valorCota);

  lista.innerHTML = ativos.map(l => {
    const v = getCotista(l.vendedorId);
    if (!v) return '';
    const total = l.cotas * l.precoPorCota;
    const delta = ((l.precoPorCota - valorCota) / valorCota) * 100;
    const deltaCls = delta > 0.5 ? 'agio' : delta < -0.5 ? 'desagio' : 'par';
    const deltaTxt = delta > 0.5 ? `ágio ${fmtPct(delta)}` : delta < -0.5 ? `deságio ${fmtPct(Math.abs(delta))}` : 'no valor patrimonial';
    return `
      <div class="market-card">
        <div class="market-top">
          <div class="market-seller">
            <span class="avatar" style="background-image:url('${v.fotoUrl}');"></span>
            <div>
              <div class="mname">${v.papel === 'lider' ? '★ ' : ''}${v.nome}</div>
              <div class="mmeta">${v.unidade} · anunciou ${fmtMes(l.mesAnuncio)}</div>
            </div>
          </div>
          <span class="market-delta ${deltaCls}">${deltaTxt}</span>
        </div>
        <div class="market-body">
          <div class="market-fig"><span class="k">Cotas</span><span class="v">${fmtNum(l.cotas)}</span></div>
          <div class="market-fig"><span class="k">Preço/cota</span><span class="v">${fmtBRL(l.precoPorCota)}</span></div>
          <div class="market-fig"><span class="k">Total</span><span class="v gold">${fmtBRL0(total)}</span></div>
        </div>
        <div class="market-actions">
          <button class="btn sm ghost full" data-cancelar="${l.id}">Cancelar</button>
          <button class="btn sm primary full" data-comprar-mercado="${l.id}">Comprar</button>
        </div>
      </div>`;
  }).join('');

  lista.querySelectorAll('[data-comprar-mercado]').forEach(b => b.addEventListener('click', () => {
    const listing = state.mercado.find(x => x.id === Number(b.dataset.comprarMercado));
    openCotistaPicker(null, (compradorId) => comprarNoMercado(listing.id, compradorId), listing.vendedorId, 'Quem está comprando?');
  }));
  lista.querySelectorAll('[data-cancelar]').forEach(b => b.addEventListener('click', () => cancelarAnuncio(Number(b.dataset.cancelar))));
}

function abrirModalAnuncio(preSelId) {
  const valorCota = estadoNoMes(state.mesAtual).valorCota;
  const elegiveis = state.cotistas.filter(c => cotasDisponiveisVenda(c) > 0);
  if (!elegiveis.length) { toast('Nenhum cotista tem cotas livres para anunciar.'); return; }
  let sel = getCotista(preSelId) || elegiveis[0];
  openModal(`
    <h3>Anunciar cotas à venda</h3>
    <p class="hint">O anúncio fica visível no Mercado de Cotas para outros cotistas comprarem.</p>
    <div class="field" style="margin-top:12px;"><label>Vendedor</label>
      <select id="anuncio-vendedor">${elegiveis.map(c => `<option value="${c.id}" ${c.id === sel.id ? 'selected' : ''}>${c.nome} — ${fmtNum(cotasDisponiveisVenda(c))} cotas livres</option>`).join('')}</select>
    </div>
    <div class="field"><label>Quantidade de cotas</label><input type="number" id="anuncio-qtd" min="1" step="1" value="1"></div>
    <div class="field"><label>Preço por cota (R$)</label><input type="number" id="anuncio-preco" min="0.01" step="0.5" value="${valorCota.toFixed(2)}"></div>
    <p class="hint" id="anuncio-preview"></p>
    <div class="modal-actions">
      <button class="btn ghost" id="anuncio-cancelar">Cancelar</button>
      <button class="btn primary" id="anuncio-confirmar">Anunciar</button>
    </div>
  `, (root) => {
    const selEl = root.querySelector('#anuncio-vendedor');
    const qtdEl = root.querySelector('#anuncio-qtd');
    const precoEl = root.querySelector('#anuncio-preco');
    const preview = root.querySelector('#anuncio-preview');
    const atualiza = () => {
      const c = getCotista(Number(selEl.value));
      const livres = cotasDisponiveisVenda(c);
      qtdEl.max = livres;
      const qtd = Math.min(Number(qtdEl.value) || 0, livres);
      const preco = Number(precoEl.value) || 0;
      const delta = valorCota > 0 ? ((preco - valorCota) / valorCota) * 100 : 0;
      const rel = Math.abs(delta) < 0.5 ? 'no valor patrimonial' : delta > 0 ? `ágio de ${fmtPct(delta)}` : `deságio de ${fmtPct(Math.abs(delta))}`;
      preview.textContent = `${c.nome} tem ${fmtNum(livres)} cotas livres · total do anúncio ${fmtBRL0(qtd * preco)} (${rel}).`;
    };
    selEl.addEventListener('change', atualiza);
    qtdEl.addEventListener('input', atualiza);
    precoEl.addEventListener('input', atualiza);
    atualiza();
    root.querySelector('#anuncio-cancelar').addEventListener('click', closeModal);
    root.querySelector('#anuncio-confirmar').addEventListener('click', () => {
      const ok = anunciarCotas(Number(selEl.value), Number(qtdEl.value) || 0, Number(precoEl.value) || 0);
      if (ok) closeModal();
    });
  });
}

/* ============================================================
   FIP — ACCORDION
   ============================================================ */
function wireAccordion() {
  document.querySelectorAll('.accordion .acc-head').forEach(btn => {
    btn.addEventListener('click', () => {
      const item = btn.closest('.acc-item');
      const isOpen = item.classList.contains('open');
      item.classList.toggle('open', !isOpen);
      btn.querySelector('.acc-ico').textContent = !isOpen ? '−' : '+';
    });
  });
}

/* ============================================================
   PROPOSTA COMERCIAL — CALCULADORAS INTERATIVAS
   ============================================================ */
function wirePropostaCalculators() {
  const func = document.getElementById('calc1-func');
  const turnover = document.getElementById('calc1-turnover');
  if (func && turnover) {
    const atualizaCalc1 = () => {
      const nFunc = Number(func.value);
      const turnoverPct = Number(turnover.value);
      const saidasHoje = nFunc * (turnoverPct / 100);
      const saidasEquity = saidasHoje * 0.75; // baseado no case 20% -> 15%
      const reducao = saidasHoje - saidasEquity;
      const economia = reducao * 5000;

      document.getElementById('calc1-func-out').textContent = fmtNum(nFunc);
      document.getElementById('calc1-turnover-out').textContent = `${turnoverPct}%`;
      document.getElementById('calc1-out-saidas-hoje').textContent = `${fmtNum(saidasHoje)}/ano`;
      document.getElementById('calc1-out-saidas-equity').textContent = `${fmtNum(saidasEquity)}/ano`;
      document.getElementById('calc1-out-economia').textContent = `${fmtBRL0(economia)}/ano`;
    };
    func.addEventListener('input', atualizaCalc1);
    turnover.addEventListener('input', atualizaCalc1);
    atualizaCalc1();
  }

  const valorSlider = document.getElementById('calc2-valor');
  if (valorSlider) {
    const atualizaCalc2 = () => {
      const valor = Number(valorSlider.value);
      const pct = Math.min(100, 20 + (valor / 1000) * 80);
      document.getElementById('calc2-valor-out').textContent = fmtBRL0(valor);
      document.getElementById('calc2-bar').style.width = `${pct}%`;
      const tierEl = document.getElementById('calc2-tier');
      if (pct < 25) tierEl.textContent = 'Engajamento Básico';
      else if (pct < 50) tierEl.textContent = 'Engajamento Crescente';
      else if (pct < 75) tierEl.textContent = 'Alto Comprometimento';
      else tierEl.textContent = 'Mentalidade de Dono';
    };
    valorSlider.addEventListener('input', atualizaCalc2);
    atualizaCalc2();
  }
}

/* ============================================================
   EVENTOS GLOBAIS + INIT
   ============================================================ */
function openMaisSheet() {
  const itemsHtml = `<div>
    <button class="sheet-item" data-go="ciclo"><span class="ic">05</span>Ciclo Mensal</button>
    <button class="sheet-item" data-go="evolucao"><span class="ic">06</span>Evolução &amp; Projeção</button>
    <button class="sheet-item" data-go="saida"><span class="ic">07</span>Saída &amp; Recompra</button>
    <button class="sheet-item" data-go="regras"><span class="ic">08</span>Regras do Fundo</button>
    <button class="sheet-item" data-go="implantacao"><span class="ic">09</span>Do Zero ao Lançamento</button>
    <button class="sheet-item" data-go="config"><span class="ic">10</span>Configuração do Fundo</button>
    <button class="sheet-item" data-go="fip"><span class="ic">11</span>O Que É um FIP?</button>
    <button class="sheet-item" data-go="proposta"><span class="ic">12</span>Proposta Comercial</button>
    <button class="sheet-item" data-go="concorrentes"><span class="ic">13</span>Estudo de Concorrentes</button>
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
    // Reserva da Empresa (cotas) — o resto não-distribuído vira Tesouraria do Fundo
    const naoDistribuido = Math.max(0, state.config.totalCotas - totalDistribuido());
    let reservaEmp = Number(document.getElementById('cfg-reservaEmpresa').value) || 0;
    reservaEmp = Math.max(0, Math.min(reservaEmp, naoDistribuido));
    state.reservaEmpresa = reservaEmp;
    state.tesourariaFundo = naoDistribuido - reservaEmp;
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
  wirePropostaCalculators();
}

function init() {
  state = loadState();
  rebuildEstados();
  wireGlobalEvents();
  renderAll();
}

document.addEventListener('DOMContentLoaded', init);
