/* ============================================================
   GAVIÕES INVEST — SIMULADOR MOBILE
   Veículo de investimento (S.A. de capital fechado) que detém uma
   participação minoritária em UMA unidade da rede, aberto a pequenos
   investidores externos. Sem backend, sem banco: memória / localStorage.
   ============================================================ */

const STORAGE_KEY = 'gavioes_invest_sim_v18';
const CHAVES_ANTIGAS = ['gavioes_fundo_sim_v17', 'gavioes_fundo_sim_v16', 'gavioes_fundo_sim_v15'];
const HORIZON_MESES = 480; // 40 anos de estados pré-computados

const DEFAULT_CONFIG = {
  nomeUnidade: 'Unidade Tatuapé',
  lucroMensal: 50000,          // lucro mensal da unidade
  multiplo: 8,                 // valuation = lucro × 12 × múltiplo = R$ 4,8M
  crescimento: 10,             // % a.a. de valorização da unidade
  participacaoPct: 15,         // % da unidade detido pela S.A. → veículo ≈ R$ 720k
  totalAcoes: 16000,           // capital autorizado → ação inicial ≈ R$ 45
  contabilidadeMensal: 1200,   // R$/mês
  juridicoAnual: 8000,         // R$/ano
  irGanhoPct: 15,              // IR sobre ganho de capital na venda
  reservaPct: 10,              // % do patrimônio em caixa p/ recompra pela companhia
  limiteConcentracaoPct: 10,   // máximo de % do total de ações por investidor
  tetoAporteAnualCrowd: 20000, // teto anual por investidor de varejo (Res. CVM 88)
  janelaMeses: 3,              // periodicidade da Janela de Liquidez
  prazoLiquidacaoDias: 60      // prazo máximo para pagar quem vendeu na janela
};

const ORIGENS = [
  { key: 'privada', label: 'Oferta Privada', curto: 'Privada' },
  { key: 'crowdfunding', label: 'Crowdfunding', curto: 'Crowd' }
];

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

/* distribui `total` entre `qtdPessoas` de forma aleatória (pesos), somando exatamente o total */
function distribuirAleatorio(qtdPessoas, total) {
  const pesos = Array.from({ length: qtdPessoas }, () => Math.random() + 0.15);
  const somaPesos = pesos.reduce((s, p) => s + p, 0);
  const brutos = pesos.map(p => (p / somaPesos) * total);
  const arred = brutos.map(v => Math.floor(v));
  let restante = total - arred.reduce((s, v) => s + v, 0);
  const fracoes = brutos.map((v, i) => ({ i, frac: v - Math.floor(v) })).sort((a, b) => b.frac - a.frac);
  for (let k = 0; k < restante; k++) arred[fracoes[k % qtdPessoas].i] += 1;
  return arred;
}

function nomeInvestidor(i) {
  const baseIdx = i % 50;
  const primeiro = NOMES_BASE[baseIdx];
  const sobrenome1 = SOBRENOMES_BASE[(baseIdx + 17) % 50];
  if (i < 50) return `${primeiro} ${sobrenome1}`;
  const sobrenome2 = SOBRENOMES_BASE[(baseIdx + 33) % 50];
  return `${primeiro} ${sobrenome1} ${sobrenome2}`;
}

function generoInvestidor(i) {
  return GENEROS_BASE[i % 50];
}

const anoDoMes = (mes) => Math.floor(mes / 12);

/* Custo mensal fixo do veículo (contabilidade + rateio do jurídico anual) */
function custoMensalVeiculo(config) {
  return config.contabilidadeMensal + config.juridicoAnual / 12;
}

/* Dividendo por ação de um mês — fórmula única usada pelo seed, pelo ciclo e pelas projeções */
function dividendoPorAcao(lucroMes, config) {
  return (lucroMes * (config.participacaoPct / 100) - custoMensalVeiculo(config)) / config.totalAcoes;
}

const MES_INICIAL = 30;

/* Investidores em duas ondas de captação:
   - oferta privada (círculo restrito, tickets maiores, meses iniciais)
   - crowdfunding (varejo, teto anual por investidor, meses posteriores) */
function seedInvestidores() {
  const cfg = DEFAULT_CONFIG;
  const estadosSeed = buildEstados(cfg, MES_INICIAL);
  const divPorAcao = dividendoPorAcao(cfg.lucroMensal, cfg);
  const investidores = [];

  const mk = (id, i, origem, mesEntrada, aporte) => {
    const genero = generoInvestidor(i);
    const valorAcaoNaEpoca = estadosSeed[Math.min(mesEntrada, estadosSeed.length - 1)].valorAcao;
    const acoes = Math.max(1, Math.floor(aporte / valorAcaoNaEpoca));
    const valorPago = Math.round(acoes * valorAcaoNaEpoca * 100) / 100;

    const historico = [{
      mes: mesEntrada, tipo: 'aporte', qtd: acoes, valor: valorPago,
      desc: origem === 'privada' ? 'Aporte na oferta privada' : 'Aporte via plataforma de crowdfunding'
    }];
    // Dividendos históricos até o mês anterior ao atual — o mês corrente ainda
    // não foi fechado (fecharMes é quem paga o dividendo de state.mesAtual).
    for (let m = mesEntrada + 1; m < MES_INICIAL; m++) {
      const valor = acoes * divPorAcao;
      if (valor > 0) historico.push({ mes: m, tipo: 'dividendo', qtd: null, valor: Math.round(valor * 100) / 100, desc: 'Dividendo mensal' });
    }

    const planoMensal = (id % 3 === 0) ? 100 + (id % 5) * 100 : 0;
    const reinvestir = id % 4 === 0;
    return {
      id, nome: nomeInvestidor(i), genero, origem, mesEntrada,
      fotoUrl: `https://randomuser.me/api/portraits/${genero === 'F' ? 'women' : 'men'}/${id % 15}.jpg`,
      acoes, valorPago,
      aportadoNoAno: { [anoDoMes(mesEntrada)]: valorPago },
      planoMensal, reinvestir,
      creditoReinvestimento: reinvestir ? Math.round(Math.random() * 2000) / 100 : 0,
      historico
    };
  };

  // Onda 1 — oferta privada: 15 investidores, R$ 3.000 a R$ 18.000, meses 0 a 6
  for (let i = 0; i < 15; i++) {
    const aporte = 3000 + Math.floor(Math.random() * 15000);
    investidores.push(mk(i + 1, i, 'privada', Math.floor(Math.random() * 7), aporte));
  }
  // Onda 2 — crowdfunding: 50 investidores, R$ 500 a R$ 14.000 (teto legal 20k/ano), meses 12 a 30
  for (let i = 0; i < 50; i++) {
    const aporte = 500 + Math.floor(Math.random() * 13500);
    const mesEntrada = 12 + Math.floor(Math.random() * (MES_INICIAL - 12 + 1));
    investidores.push(mk(i + 16, i + 15, 'crowdfunding', mesEntrada, aporte));
  }
  return investidores;
}

/* Janela de Liquidez: histórico de janelas passadas + filas em aberto */
function seedJanela(investidores, estadosSeed) {
  const historico = [21, 24, 27].map((mes, k) => {
    const preco = Math.round(estadosSeed[mes].valorAcao * 100) / 100;
    const negociadas = [64, 108, 85][k];
    const paraTesouraria = [12, 30, 18][k];
    return {
      mes, preco, acoesNegociadas: negociadas,
      paraInvestidores: negociadas - paraTesouraria, paraTesouraria,
      rateioPct: [100, 82, 100][k],
      irRecolhido: Math.round(negociadas * preco * 0.02 * 100) / 100,
      desembolsoTesouraria: Math.round(paraTesouraria * preco * 100) / 100
    };
  });

  // Pedidos em aberto para a próxima janela (usa quem tem mais ações)
  const ordenados = [...investidores].sort((a, b) => b.acoes - a.acoes);
  const vendedores = [ordenados[2], ordenados[6], ordenados[11]].filter(Boolean);
  const compradores = [ordenados[4], ordenados[9]].filter(Boolean);

  return {
    ultimaExecutadaMes: 27,
    filaVenda: vendedores.map((v, i) => ({
      id: 500 + i, investidorId: v.id,
      acoes: Math.max(2, Math.round(v.acoes * [0.4, 0.25, 1][i])),
      mesPedido: MES_INICIAL - [2, 1, 0][i], status: 'na-fila'
    })),
    filaCompra: compradores.map((c, i) => ({
      id: 600 + i, investidorId: c.id,
      acoes: [40, 25][i],
      mesPedido: MES_INICIAL - [1, 0][i], status: 'na-fila'
    })),
    historico
  };
}

function freshState() {
  const investidores = seedInvestidores();
  const estadosRef = buildEstados(DEFAULT_CONFIG, MES_INICIAL);
  const comInvestidores = investidores.reduce((s, inv) => s + inv.acoes, 0);
  const acoesEmTesouraria = 120; // recompradas em janelas anteriores
  return {
    config: { ...DEFAULT_CONFIG },
    investidores,
    janela: seedJanela(investidores, estadosRef),
    acoesEmTesouraria,
    acoesDisponiveisEmissao: DEFAULT_CONFIG.totalAcoes - comInvestidores - acoesEmTesouraria,
    mesAtual: MES_INICIAL,
    nextId: investidores.length + 1,
    nextPedidoId: 700,
    activeView: 'portal',
    ciclo: { step: 1, lucroMes: DEFAULT_CONFIG.lucroMensal },
    portalSelId: investidores[0] ? investidores[0].id : 1,
    portalPeriodo: 'tudo',
    overviewPeriodo: 'tudo',
    simDiv: { lucro: DEFAULT_CONFIG.lucroMensal, meses: 12 }
  };
}

const VIEWS_VALIDAS = ['portal', 'overview', 'ciclo', 'investidores', 'evolucao', 'janela',
  'regras', 'config', 'comofunciona', 'proposta', 'implantacao', 'concorrentes'];

function persist() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) { /* ignora */ }
}

function loadState() {
  // O modelo mudou de programa para funcionários → veículo de investimento.
  // Estados antigos não têm equivalência: descartamos em vez de migrar.
  try { CHAVES_ANTIGAS.forEach(k => localStorage.removeItem(k)); } catch (e) { /* ignora */ }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && parsed.config && Array.isArray(parsed.investidores) && parsed.janela) {
        parsed.config = { ...DEFAULT_CONFIG, ...parsed.config };
        if (!parsed.portalPeriodo) parsed.portalPeriodo = 'tudo';
        if (!parsed.overviewPeriodo) parsed.overviewPeriodo = 'tudo';
        if (!parsed.simDiv) parsed.simDiv = { lucro: parsed.config.lucroMensal, meses: 12 };
        if (!VIEWS_VALIDAS.includes(parsed.activeView)) parsed.activeView = 'portal';
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
  const custoMes = custoMensalVeiculo(config); // custo fixo: contabilidade + jurídico
  let custoAcumulado = 0;
  const arr = [];
  for (let m = 0; m <= horizonte; m++) {
    const valuation = valuationBase * Math.pow(1 + monthlyGrowth, m);
    const participacao = valuation * (config.participacaoPct / 100);
    if (m > 0) custoAcumulado += custoMes;
    const patrimonioVeiculo = participacao - custoAcumulado;
    const valorAcao = patrimonioVeiculo / config.totalAcoes;
    arr.push({
      mes: m, valuation, participacao,
      custoMensal: m > 0 ? custoMes : 0, custoAcumulado,
      patrimonioVeiculo, valorAcao
    });
  }
  return arr;
}

function rebuildEstados() { estados = buildEstados(state.config); }
function estadoNoMes(mes) { const m = Math.max(0, Math.min(mes, estados.length - 1)); return estados[m]; }

function getInvestidor(id) { return state.investidores.find(c => c.id === Number(id)); }
function investidoresAtivos() { return state.investidores.filter(i => i.acoes > 0); }
function acoesComInvestidores() { return state.investidores.reduce((s, i) => s + i.acoes, 0); }

/* Invariante do sistema:
   acoesComInvestidores + acoesEmTesouraria + acoesDisponiveisEmissao === totalAcoes */
function acoesEmitidas() { return acoesComInvestidores() + state.acoesEmTesouraria; }
function acoesDisponiveis() { return state.acoesEmTesouraria + state.acoesDisponiveisEmissao; }
function maxAcoesPorInvestidor() {
  return Math.floor(state.config.totalAcoes * (state.config.limiteConcentracaoPct / 100));
}

/* Quanto ainda cabe no teto anual do investidor de varejo (Res. CVM 88).
   Investidor da oferta privada não tem teto. */
function tetoRestanteAno(inv, mes = state.mesAtual) {
  if (inv.origem !== 'crowdfunding') return Infinity;
  const ja = (inv.aportadoNoAno && inv.aportadoNoAno[anoDoMes(mes)]) || 0;
  return Math.max(0, state.config.tetoAporteAnualCrowd - ja);
}

/* Quantas ações o investidor ainda pode adquirir: concentração × disponibilidade × teto anual */
function margemAporte(inv, precoUnit = estadoNoMes(state.mesAtual).valorAcao) {
  const porConcentracao = maxAcoesPorInvestidor() - inv.acoes;
  const porTeto = tetoRestanteAno(inv) === Infinity ? Infinity : Math.floor(tetoRestanteAno(inv) / precoUnit);
  return Math.max(0, Math.min(porConcentracao, acoesDisponiveis(), porTeto));
}

/* Emite ações para um investidor: tesouraria primeiro, depois capital autorizado. */
function emitirAcoes(qtd) {
  qtd = Math.max(0, Math.min(qtd, acoesDisponiveis()));
  const daTesouraria = Math.min(state.acoesEmTesouraria, qtd);
  state.acoesEmTesouraria -= daTesouraria;
  state.acoesDisponiveisEmissao -= (qtd - daTesouraria);
  return qtd;
}

/* Ações recompradas pela companhia voltam para a tesouraria */
function devolverAcoesTesouraria(qtd) { state.acoesEmTesouraria += qtd; }

/* Caixa reservado para a companhia recomprar na janela */
function caixaReserva() {
  return estadoNoMes(state.mesAtual).patrimonioVeiculo * (state.config.reservaPct / 100);
}
function capacidadeRecompra() {
  const preco = precoJanela();
  return preco > 0 ? Math.floor(caixaReserva() / preco) : 0;
}

/* Venda de ações na Janela: custo médio de aquisição → ganho → IR → líquido */
function calcVendaJanela(inv, qtd, preco = precoJanela()) {
  qtd = Math.max(0, Math.min(qtd, inv.acoes));
  const custoMedio = inv.acoes > 0 ? (inv.valorPago || 0) / inv.acoes : 0;
  const bruto = qtd * preco;
  const custoBaixado = custoMedio * qtd;
  const ganho = Math.max(0, bruto - custoBaixado);
  const imposto = ganho * (state.config.irGanhoPct / 100);
  return { qtd, preco, custoMedio, bruto, custoBaixado, ganho, imposto, liquido: bruto - imposto };
}

/* Projeta dividendos futuros do investidor, assumindo posição constante */
function calcSimulacaoDividendos(inv, lucroProjetado, meses) {
  const linhas = [];
  let acumulado = 0;
  const porAcao = dividendoPorAcao(lucroProjetado, state.config);
  for (let i = 1; i <= meses; i++) {
    const valor = inv.acoes * porAcao;
    acumulado += valor;
    linhas.push({ mes: state.mesAtual + i, dividendo: valor, acumulado });
  }
  return linhas;
}

/* Aporte primário: o investidor põe dinheiro novo e a companhia emite ações
   ao valor patrimonial do mês. É a única porta de entrada de capital novo. */
function registrarAporte(investidorId, valorReais, silencioso = false) {
  const inv = getInvestidor(investidorId);
  if (!inv || !valorReais || valorReais <= 0) return 0;
  const preco = estadoNoMes(state.mesAtual).valorAcao;
  const margem = margemAporte(inv, preco);
  if (margem <= 0) {
    if (!silencioso) {
      const semTeto = tetoRestanteAno(inv) <= 0;
      toast(semTeto
        ? `${inv.nome} atingiu o teto anual de ${fmtBRL0(state.config.tetoAporteAnualCrowd)} (crowdfunding).`
        : `Limite de concentração ou ações disponíveis esgotados.`);
    }
    return 0;
  }
  let qtd = Math.min(Math.floor(valorReais / preco), margem);
  if (qtd <= 0) { if (!silencioso) toast('Valor insuficiente para adquirir ao menos 1 ação.'); return 0; }
  qtd = emitirAcoes(qtd);
  if (qtd <= 0) { if (!silencioso) toast('Não há ações disponíveis para emissão.'); return 0; }

  const custo = qtd * preco;
  const ano = anoDoMes(state.mesAtual);
  inv.acoes += qtd;
  inv.valorPago += custo;
  inv.aportadoNoAno[ano] = (inv.aportadoNoAno[ano] || 0) + custo;
  inv.historico.push({ mes: state.mesAtual, tipo: 'aporte', qtd, valor: custo, desc: 'Aporte — emissão de novas ações' });
  if (!silencioso) {
    persist();
    toast(`${inv.nome} aportou ${fmtBRL(custo)} e recebeu ${fmtNum(qtd)} ações.`);
    renderAll();
  }
  return qtd;
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

function openInvestidorPicker(currentId, onPick, excludeId, titulo) {
  const base = state.investidores.filter(c => c.id !== excludeId);
  const itemHtml = (c) => `
    <button class="sheet-item" data-pick="${c.id}">
      <span class="ic">${c.id === currentId ? '●' : '○'}</span>
      <span>${c.nome} <span style="color:var(--ink-faint); font-size:11.5px;">— ${fmtNum(c.acoes)} ações</span></span>
    </button>`;
  const itemsHtml = `<div>
    ${ORIGENS.map(o => {
      const grupo = base.filter(c => c.origem === o.key).sort((a, b) => b.acoes - a.acoes);
      return grupo.length ? `<div class="sheet-subhead">${o.label}</div>${grupo.map(itemHtml).join('')}` : '';
    }).join('')}
  </div>`;
  openSheet(`<h3>${titulo || 'Selecionar Investidor'}</h3>`, itemsHtml, (root) => {
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
  const denom = Math.max(1, points.length - 1); // evita divisão por zero com série de 1 ponto
  const xToPx = (i) => pad + (i / denom) * (width - pad * 2);
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

/* Donut de composição: fatias = [{label, valor, cor}]; centro mostra valorCentro/labelCentro */
function svgDonut(fatias, valorCentro, labelCentro) {
  const size = 160, r = 58, c = 2 * Math.PI * r, cx = size / 2, cy = size / 2;
  const total = fatias.reduce((s, f) => s + Math.max(0, f.valor), 0) || 1;
  let offset = 0;
  const arcos = fatias.map(f => {
    const len = (Math.max(0, f.valor) / total) * c;
    const arco = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${f.cor}" stroke-width="17"
      stroke-dasharray="${len} ${c - len}" stroke-dashoffset="${c * 0.25 - offset}"/>`;
    offset += len;
    return arco;
  }).join('');
  return `
  <div style="display:flex; align-items:center; gap:18px; flex-wrap:wrap;">
    <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
      ${arcos}
      <text x="${cx}" y="${cy - 3}" text-anchor="middle" class="donut-label" font-size="17" fill="#f1ead8" font-weight="700">${valorCentro}</text>
      <text x="${cx}" y="${cy + 14}" text-anchor="middle" class="donut-label" font-size="7.5" fill="#a39c89">${labelCentro}</text>
    </svg>
    <div style="display:flex; flex-direction:column; gap:8px; font-size:12px; flex:1; min-width:140px;">
      ${fatias.map(f => `<div style="display:flex; align-items:center; justify-content:space-between; gap:7px;">
        <span style="display:flex; align-items:center; gap:7px;"><span style="width:9px;height:9px;border-radius:3px;background:${f.cor};display:inline-block;"></span>${f.label}</span>
        <span style="font-family:var(--mono); color:var(--ink-dim);">${fmtNum(f.valor)} · ${((f.valor / total) * 100).toFixed(1)}%</span>
      </div>`).join('')}
    </div>
  </div>`;
}

function badgeTipo(tipo) {
  if (tipo === 'aporte') return `<span class="badge gold">APORTE</span>`;
  if (tipo === 'dividendo') return `<span class="badge olive">DIVIDENDO</span>`;
  if (tipo === 'reinvestimento') return `<span class="badge olive">REINVESTIDO</span>`;
  if (tipo === 'venda-janela') return `<span class="badge rust">VENDA</span>`;
  if (tipo === 'compra-janela') return `<span class="badge neutral">COMPRA</span>`;
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
  else if (v === 'investidores') renderInvestidores();
  else if (v === 'ciclo') renderCiclo();
  else if (v === 'evolucao') renderEvolucao();
  else if (v === 'portal') renderPortal();
  else if (v === 'janela') renderJanela();
  else if (v === 'regras') renderRegras();
  else if (v === 'proposta') renderProposta();
}

/* Preenche os números fixos da Proposta com o estado atual do motor,
   para não contradizerem o ticker nem o simulador de retorno. */
function renderProposta() {
  const e = estadoNoMes(state.mesAtual);
  const preco = e.valorAcao;
  const divAcao = dividendoPorAcao(state.config.lucroMensal, state.config);
  const yieldAnual = preco > 0 ? (divAcao * 12 / preco) * 100 : 0;
  const acoes5k = preco > 0 ? Math.floor(5000 / preco) : 0;
  const set = (id, txt) => { const el = document.getElementById(id); if (el) el.textContent = txt; };
  set('prop-preco', `≈ ${fmtBRL(preco)}`);
  set('prop-yield', `~${fmtPct(yieldAnual, 0)} a.a. + valorização`);
  set('prop-ex-acoes', `≈ ${fmtNum(acoes5k)} ações`);
  set('prop-ex-mes', `≈ ${fmtBRL0(acoes5k * divAcao)}`);
  set('prop-ex-ano', `≈ ${fmtBRL0(acoes5k * divAcao * 12)}`);
  // O simulador de retorno usa o mesmo motor — recalcula junto para a página
  // inteira refletir a config e o mês atuais, não só os números fixos acima.
  if (typeof wireSimuladorRetorno.atualiza === 'function') wireSimuladorRetorno.atualiza();
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
  document.getElementById('m-ticker').innerHTML = `
    <div class="chip"><span class="l">Mês</span><span class="v">${state.mesAtual}</span></div>
    <div class="chip gold"><span class="l">Ação</span><span class="v">${fmtBRL(e.valorAcao)}</span></div>
    <div class="chip"><span class="l">Patrimônio</span><span class="v">${fmtShort(e.patrimonioVeiculo)}</span></div>
    <div class="chip"><span class="l">Próx. Janela</span><span class="v">${janelaAberta() ? 'aberta' : 'M' + proximaJanelaMes()}</span></div>
  `;
}

function badgeOrigem(origem) {
  const o = ORIGENS.find(x => x.key === origem) || ORIGENS[0];
  return origem === 'privada'
    ? `<span class="badge gold">${o.label.toUpperCase()}</span>`
    : `<span class="badge neutral">${o.label.toUpperCase()}</span>`;
}

/* ============================================================
   MINHA POSIÇÃO (HOME DO INVESTIDOR)
   ============================================================ */
function renderPortal() {
  const inv = getInvestidor(state.portalSelId) || state.investidores[0];
  if (!inv) return;
  const cfg = state.config;
  document.getElementById('portal-switch-label').textContent = `${inv.nome} — ${ORIGENS.find(o => o.key === inv.origem).label}`;

  const valorAcao = estadoNoMes(state.mesAtual).valorAcao;
  const totalDividendos = inv.historico.filter(h => h.tipo === 'dividendo').reduce((s, h) => s + h.valor, 0);
  const valorAtual = inv.acoes * valorAcao;
  const custoMedio = inv.acoes > 0 ? inv.valorPago / inv.acoes : 0;
  const ganhoNaoRealizado = valorAtual - inv.valorPago;
  const naFila = acoesNaFila(inv.id);
  const historicoOrdenado = [...inv.historico].sort((a, b) => b.mes - a.mes)
    .filter(h => dentroDoPeriodo(h.mes, state.mesAtual, state.portalPeriodo));

  document.getElementById('portal-body').innerHTML = `
    <div class="hero-card">
      <div class="avatar" style="background-image:url('${inv.fotoUrl}'); background-size:cover; background-position:center;"></div>
      <div class="name">${inv.nome}</div>
      <div class="role">${badgeOrigem(inv.origem)} desde ${fmtMes(inv.mesEntrada)}</div>
      <div class="lbl">Sua posição vale hoje</div>
      <div class="big">${fmtBRL0(valorAtual)}</div>
      <div class="sub">${fmtNum(inv.acoes)} ações × ${fmtBRL(valorAcao)}</div>
      <div class="rendimento-pill">+ ${fmtBRL0(totalDividendos)} em dividendos recebidos até hoje</div>
    </div>

    <div class="stat-grid">
      <div class="kpi-card"><span class="lbl">Total aportado</span><span class="val">${fmtBRL0(inv.valorPago)}</span><span class="sub">custo médio ${fmtBRL(custoMedio)}/ação</span></div>
      <div class="kpi-card">
        <span class="lbl">Dividendos</span><span class="val">${fmtBRL0(totalDividendos)}</span><span class="sub">recebido até hoje</span>
        <button class="kpi-mini-btn" id="btn-quick-sim">Simular ›</button>
      </div>
      <div class="kpi-card"><span class="lbl">Valorização</span><span class="val ${ganhoNaoRealizado >= 0 ? '' : ''}">${fmtBRL0(ganhoNaoRealizado)}</span><span class="sub ${ganhoNaoRealizado >= 0 ? 'pos' : 'neg'}">${inv.valorPago > 0 ? fmtPct(ganhoNaoRealizado / inv.valorPago * 100) : '—'} sobre o aportado</span></div>
      <div class="kpi-card"><span class="lbl">Retorno total</span><span class="val">${fmtBRL0(ganhoNaoRealizado + totalDividendos)}</span><span class="sub">valorização + dividendos</span></div>
    </div>

    <div class="m-card">
      <div class="panel-title"><h2>Meu Plano de Aportes</h2><span class="meta">automático</span></div>
      <div class="field"><label>Aporte mensal (R$) — 0 desativa</label><input type="number" id="plano-mensal-input" min="0" step="50" value="${inv.planoMensal || 0}"></div>
      <p class="hint" id="plano-mensal-preview" style="margin-bottom:14px;"></p>
      <label class="drip-toggle">
        <input type="checkbox" id="drip-toggle" ${inv.reinvestir ? 'checked' : ''}>
        <span class="box"></span>
        <span class="txt"><strong>Reinvestir dividendos automaticamente</strong><br>Seus dividendos acumulam como crédito e, a cada ação inteira, viram novas ações no fechamento do mês.</span>
      </label>
      ${inv.reinvestir && (inv.creditoReinvestimento || 0) > 0 ? `<p class="hint" style="margin-top:10px; color:var(--olive);">Crédito acumulado: ${fmtBRL(inv.creditoReinvestimento)} — faltam ${fmtBRL(Math.max(0, valorAcao - inv.creditoReinvestimento))} para a próxima ação.</p>` : ''}
      <p class="hint" style="margin-top:10px;">${inv.origem === 'crowdfunding'
        ? `Teto anual de ${fmtBRL0(cfg.tetoAporteAnualCrowd)} por investidor de varejo — resta ${fmtBRL0(tetoRestanteAno(inv))} neste ano.`
        : 'Oferta privada: sem teto anual de aporte.'} Máximo de ${fmtNum(maxAcoesPorInvestidor())} ações por investidor (${cfg.limiteConcentracaoPct}% da companhia).</p>
    </div>

    <div class="m-card">
      <div class="panel-title"><h2>Janela de Liquidez</h2><span class="meta">${janelaAberta() ? 'aberta' : fmtMes(proximaJanelaMes())}</span></div>
      <p class="hint" style="margin-bottom:12px;">Para vender, você entra na fila e é atendido na próxima janela, pelo preço apurado por fórmula (hoje ${fmtBRL(valorAcao)}). ${naFila > 0 ? `<strong style="color:var(--gold-bright);">Você já tem ${fmtNum(naFila)} ações na fila.</strong>` : `Ações livres para vender: <strong style="color:var(--ink);">${fmtNum(acoesLivres(inv))}</strong>.`}</p>
      <button class="btn primary full" id="btn-vender-portal" ${acoesLivres(inv) <= 0 ? 'disabled' : ''}>Entrar na fila de venda</button>
    </div>

    <div class="m-card">
      <div class="panel-title"><h2>Simular Dividendos Futuros</h2><span class="meta">projeção</span></div>
      <div class="field"><label>Lucro mensal projetado da unidade (R$)</label><input type="number" id="sim-div-lucro" step="2000" value="${state.simDiv.lucro}"></div>
      <div class="field"><label>Horizonte (meses)</label><input type="number" id="sim-div-meses" min="1" max="60" step="1" value="${state.simDiv.meses}"></div>
      <div class="stat-grid">
        <div class="kpi-card"><span class="lbl">Próximo mês</span><span class="val" id="sim-div-proximo">—</span><span class="sub">com ${fmtNum(inv.acoes)} ações</span></div>
        <div class="kpi-card"><span class="lbl">Acumulado</span><span class="val" id="sim-div-total">—</span><span class="sub" id="sim-div-meses-label"></span></div>
      </div>
      <div id="sim-div-chart"></div>
      <p class="hint" style="margin-top:10px;">Assume ${fmtNum(inv.acoes)} ações constantes, sem novos aportes no período simulado.</p>
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
                <div class="citem-val">${badgeTipo(h.tipo)}<span class="big" style="margin-top:4px;">${h.qtd != null ? (h.qtd >= 0 ? '+' : '') + fmtNum(h.qtd) + ' ações' : fmtBRL(h.valor)}</span></div>
              </div>
            </div>`).join('')}
        </div>` : `<div class="empty">Nenhum lançamento neste período.</div>`}
    </div>
  `;

  wirePeriodoChips('portal', (key) => { state.portalPeriodo = key; persist(); renderPortal(); });

  const planoInput = document.getElementById('plano-mensal-input');
  const planoPreview = document.getElementById('plano-mensal-preview');
  const atualizaPlano = () => {
    const v = Math.max(0, Number(planoInput.value) || 0);
    inv.planoMensal = v;
    if (v > 0) {
      const qtd = Math.floor(v / valorAcao);
      planoPreview.textContent = `No fechamento do mês: ${fmtBRL0(v)} viram ≈ ${qtd} ${qtd === 1 ? 'ação' : 'ações'} novas (ação a ${fmtBRL(valorAcao)}).`;
    } else {
      planoPreview.textContent = 'Sem aporte recorrente — você ainda pode aportar avulso na aba Investidores.';
    }
    persist();
  };
  planoInput.addEventListener('input', atualizaPlano);
  atualizaPlano();
  document.getElementById('drip-toggle').addEventListener('change', (ev) => {
    inv.reinvestir = ev.target.checked;
    persist();
    toast(ev.target.checked ? 'Reinvestimento automático ativado.' : 'Reinvestimento automático desativado.');
  });

  const atualizaSimDiv = () => {
    const lucro = Number(document.getElementById('sim-div-lucro').value) || 0;
    const mesesIn = Math.max(1, Math.min(60, Number(document.getElementById('sim-div-meses').value) || 1));
    state.simDiv = { lucro, meses: mesesIn };
    const linhas = calcSimulacaoDividendos(inv, lucro, mesesIn);
    document.getElementById('sim-div-proximo').textContent = fmtBRL(linhas[0].dividendo);
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

  document.getElementById('btn-quick-sim').addEventListener('click', () => abrirModalSimDividendo(inv));
  const btnVender = document.getElementById('btn-vender-portal');
  if (btnVender) btnVender.addEventListener('click', () => abrirModalVenda(inv.id));
}

function abrirModalSimDividendo(inv) {
  openModal(`
    <h3>Simular Dividendos — ${inv.nome}</h3>
    <p class="hint">Com ${fmtNum(inv.acoes)} ações, mantidas constantes ao longo do período.</p>
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
      const linhas = calcSimulacaoDividendos(inv, lucro, meses);
      root.querySelector('#modal-sim-proximo').textContent = fmtBRL(linhas[0].dividendo);
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
   A COMPANHIA (VISÃO GERAL)
   ============================================================ */
function renderOverview() {
  const cfg = state.config;
  const e = estadoNoMes(state.mesAtual);
  const anterior = estadoNoMes(Math.max(0, state.mesAtual - 12));
  const variacao = anterior.valorAcao > 0 ? ((e.valorAcao - anterior.valorAcao) / anterior.valorAcao) * 100 : 0;
  const comInv = acoesComInvestidores();
  const ativos = investidoresAtivos();
  const divAcao = dividendoPorAcao(cfg.lucroMensal, cfg);
  const yieldAnual = e.valorAcao > 0 ? (divAcao * 12 / e.valorAcao) * 100 : 0;

  document.getElementById('overview-kpis').innerHTML = `
    <div class="kpi-card"><span class="lbl">Valor da Ação</span><span class="val">${fmtBRL(e.valorAcao)}</span><span class="sub ${variacao >= 0 ? 'pos' : 'neg'}">${variacao >= 0 ? '+' : ''}${fmtPct(variacao)} em 12 meses</span></div>
    <div class="kpi-card"><span class="lbl">Patrimônio da Companhia</span><span class="val">${fmtShort(e.patrimonioVeiculo)}</span><span class="sub">${fmtPct(cfg.participacaoPct, 0)} da ${cfg.nomeUnidade}</span></div>
    <div class="kpi-card"><span class="lbl">Dividendo por Ação</span><span class="val">${fmtBRL(divAcao)}</span><span class="sub pos">${fmtPct(yieldAnual)} ao ano</span></div>
    <div class="kpi-card"><span class="lbl">Investidores</span><span class="val">${ativos.length}</span><span class="sub">${ativos.filter(i => i.origem === 'privada').length} privada · ${ativos.filter(i => i.origem === 'crowdfunding').length} crowdfunding</span></div>
  `;

  document.getElementById('overview-valuation').innerHTML = `
    <div class="scenario-row"><span class="k">Lucro mensal da unidade</span><span class="v">${fmtBRL0(cfg.lucroMensal)}</span></div>
    <div class="scenario-row"><span class="k">Valuation (${cfg.multiplo}× lucro anual)</span><span class="v">${fmtBRL0(e.valuation)}</span></div>
    <div class="scenario-row"><span class="k">Participação da companhia (${cfg.participacaoPct}%)</span><span class="v">${fmtBRL0(e.participacao)}</span></div>
    <div class="scenario-row"><span class="k">Custos acumulados do veículo</span><span class="v">− ${fmtBRL0(e.custoAcumulado)}</span></div>
    <div class="scenario-row total"><span class="k">Patrimônio líquido</span><span class="v">${fmtBRL0(e.patrimonioVeiculo)}</span></div>
  `;

  const pontos = [];
  for (let m = Math.max(0, state.mesAtual - 24); m <= state.mesAtual; m++) pontos.push({ y: estadoNoMes(m).valorAcao, label: `M${m}` });
  document.getElementById('overview-chart').innerHTML = svgLineChart(pontos, { height: 170 });

  document.getElementById('overview-donut').innerHTML = svgDonut([
    { label: 'Investidores', valor: comInv, cor: '#d9a440' },
    { label: 'Tesouraria', valor: state.acoesEmTesouraria, cor: '#8aab5e' },
    { label: 'A emitir', valor: state.acoesDisponiveisEmissao, cor: '#3a3b28' }
  ], fmtNum(comInv), 'COM INVESTIDORES');

  // Captação por onda
  document.getElementById('overview-ondas').innerHTML = ORIGENS.map(o => {
    const grupo = ativos.filter(i => i.origem === o.key);
    const acoes = grupo.reduce((s, i) => s + i.acoes, 0);
    const capitado = grupo.reduce((s, i) => s + i.valorPago, 0);
    const pct = comInv > 0 ? (acoes / comInv) * 100 : 0;
    const cor = o.key === 'privada' ? '#d9a440' : '#6f9bb0';
    return `
      <div class="onda-row">
        <div class="onda-head">
          <span class="onda-name"><span class="onda-dot" style="background:${cor};"></span>${o.label}</span>
          <span class="onda-pct" style="color:${cor};">${pct.toFixed(1)}%</span>
        </div>
        <div class="onda-bar-track"><i style="width:${pct}%; background:${cor};"></i></div>
        <div class="onda-foot">
          <span>${grupo.length} investidores · ${fmtNum(acoes)} ações</span>
          <span class="v">${fmtBRL0(capitado)} captados</span>
        </div>
      </div>`;
  }).join('');

  // Reserva de recompra
  document.getElementById('overview-reserva').innerHTML = `
    <div class="scenario-row"><span class="k">Ações em tesouraria</span><span class="v">${fmtNum(state.acoesEmTesouraria)} · ${fmtBRL0(state.acoesEmTesouraria * e.valorAcao)}</span></div>
    <div class="scenario-row"><span class="k">Ações disponíveis para emissão</span><span class="v">${fmtNum(state.acoesDisponiveisEmissao)}</span></div>
    <div class="scenario-row"><span class="k">Caixa de reserva (${cfg.reservaPct}% do patrimônio)</span><span class="v">${fmtBRL0(caixaReserva())}</span></div>
    <div class="scenario-row total"><span class="k">Capacidade de recompra na janela</span><span class="v">${fmtNum(capacidadeRecompra())} ações</span></div>
    <p class="hint" style="margin-top:10px;">A companhia é o <strong>último degrau</strong> da janela: se sobrar oferta depois dos investidores compradores, ela recompra até o limite do caixa de reserva. As ações recompradas voltam para a tesouraria e financiam novos aportes. Detalhes na aba <strong>Regras do Programa</strong>.</p>
  `;

  const atividades = [];
  state.investidores.forEach(i => i.historico.forEach(h => atividades.push({ ...h, nome: i.nome })));
  atividades.sort((a, b) => b.mes - a.mes);
  const top = atividades.filter(a => dentroDoPeriodo(a.mes, state.mesAtual, state.overviewPeriodo)).slice(0, 12);
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

/* ============================================================
   PARÂMETROS
   ============================================================ */
function renderConfig() {
  const c = state.config;
  const setV = (id, v) => { const el = document.getElementById(id); if (el) el.value = v; };
  setV('cfg-nomeUnidade', c.nomeUnidade);
  setV('cfg-lucroMensal', c.lucroMensal);
  setV('cfg-multiplo', c.multiplo);
  setV('cfg-crescimento', c.crescimento);
  setV('cfg-participacao', c.participacaoPct);
  setV('cfg-totalAcoes', c.totalAcoes);
  setV('cfg-contabilidade', c.contabilidadeMensal);
  setV('cfg-juridico', c.juridicoAnual);
  setV('cfg-irGanho', c.irGanhoPct);
  setV('cfg-reserva', c.reservaPct);
  setV('cfg-concentracao', c.limiteConcentracaoPct);
  setV('cfg-tetoCrowd', c.tetoAporteAnualCrowd);
  setV('cfg-janelaMeses', c.janelaMeses);
  setV('cfg-prazoLiquidacao', c.prazoLiquidacaoDias);

  const valuationBase = c.lucroMensal * 12 * c.multiplo;
  const participacaoBase = valuationBase * (c.participacaoPct / 100);
  document.getElementById('cfg-resumo').innerHTML = `
    <div class="scenario-row"><span class="k">Valuation da unidade</span><span class="v">${fmtBRL0(valuationBase)}</span></div>
    <div class="scenario-row"><span class="k">Participação da companhia</span><span class="v">${fmtBRL0(participacaoBase)}</span></div>
    <div class="scenario-row"><span class="k">Valor inicial da ação</span><span class="v">${fmtBRL(participacaoBase / c.totalAcoes)}</span></div>
    <div class="scenario-row"><span class="k">Custo mensal do veículo</span><span class="v">${fmtBRL0(custoMensalVeiculo(c))}</span></div>
    <div class="scenario-row total"><span class="k">Dividendo por ação</span><span class="v">${fmtBRL(dividendoPorAcao(c.lucroMensal, c))}</span></div>
  `;
}

function lerConfigDosInputs() {
  const num = (id, fallback) => {
    const el = document.getElementById(id);
    if (!el || String(el.value).trim() === '') return fallback; // campo vazio → mantém o valor atual
    const v = Number(el.value);
    return isFinite(v) ? v : fallback;
  };
  const nomeEl = document.getElementById('cfg-nomeUnidade');
  return {
    ...state.config,
    nomeUnidade: (nomeEl && nomeEl.value.trim()) || state.config.nomeUnidade,
    lucroMensal: num('cfg-lucroMensal', state.config.lucroMensal),
    multiplo: num('cfg-multiplo', state.config.multiplo),
    crescimento: num('cfg-crescimento', state.config.crescimento),
    participacaoPct: num('cfg-participacao', state.config.participacaoPct),
    totalAcoes: Math.max(1, num('cfg-totalAcoes', state.config.totalAcoes)),
    contabilidadeMensal: Math.max(0, num('cfg-contabilidade', state.config.contabilidadeMensal)),
    juridicoAnual: Math.max(0, num('cfg-juridico', state.config.juridicoAnual)),
    irGanhoPct: num('cfg-irGanho', state.config.irGanhoPct),
    reservaPct: num('cfg-reserva', state.config.reservaPct),
    limiteConcentracaoPct: num('cfg-concentracao', state.config.limiteConcentracaoPct),
    tetoAporteAnualCrowd: num('cfg-tetoCrowd', state.config.tetoAporteAnualCrowd),
    janelaMeses: Math.max(1, num('cfg-janelaMeses', state.config.janelaMeses)),
    prazoLiquidacaoDias: num('cfg-prazoLiquidacao', state.config.prazoLiquidacaoDias)
  };
}

/* ============================================================
   INVESTIDORES (card-list)
   ============================================================ */
let investidoresFiltro = 'todos';

function renderInvestidores() {
  const e = estadoNoMes(state.mesAtual);
  const lista = state.investidores.filter(i => investidoresFiltro === 'todos' || i.origem === investidoresFiltro);

  document.getElementById('investidores-filter').innerHTML = `
    <div class="unit-filter">
      <button data-filtro="todos" class="${investidoresFiltro === 'todos' ? 'active' : ''}">Todos</button>
      ${ORIGENS.map(o => `<button data-filtro="${o.key}" class="${investidoresFiltro === o.key ? 'active' : ''}">${o.label}</button>`).join('')}
    </div>`;
  document.querySelectorAll('#investidores-filter [data-filtro]').forEach(b =>
    b.addEventListener('click', () => { investidoresFiltro = b.dataset.filtro; renderInvestidores(); }));

  const ordenados = [...lista].sort((a, b) => b.acoes - a.acoes);
  document.getElementById('investidores-list').innerHTML = !ordenados.length
    ? `<div class="empty">Nenhum investidor nesta onda.</div>`
    : `<div class="clist">${ordenados.map(inv => {
        const valor = inv.acoes * e.valorAcao;
        const custoMedio = inv.acoes > 0 ? inv.valorPago / inv.acoes : 0;
        const naFila = acoesNaFila(inv.id);
        return `
        <div class="citem">
          <div class="citem-top">
            <div style="display:flex; align-items:center; gap:10px; min-width:0;">
              <span class="citem-avatar" style="background-image:url('${inv.fotoUrl}');"></span>
              <div style="min-width:0;">
                <span class="citem-name">${inv.nome}</span>
                <div class="citem-meta">${ORIGENS.find(o => o.key === inv.origem).curto} · ${fmtNum(inv.acoes)} ações · custo ${fmtBRL(custoMedio)}${naFila > 0 ? ` · <span style="color:var(--gold-bright);">${fmtNum(naFila)} na fila</span>` : ''}</div>
              </div>
            </div>
            <div class="citem-val"><span class="big">${fmtBRL0(valor)}</span><span class="small">${inv.planoMensal > 0 ? fmtBRL0(inv.planoMensal) + '/mês' : 'sem aporte recorrente'}</span></div>
          </div>
          <div class="citem-actions">
            <button class="btn sm ghost" data-aportar="${inv.id}">Aportar</button>
            <button class="btn sm ghost" data-ver="${inv.id}">Ver posição</button>
          </div>
        </div>`;
      }).join('')}</div>`;

  document.querySelectorAll('[data-aportar]').forEach(b =>
    b.addEventListener('click', () => abrirModalAporte(Number(b.dataset.aportar))));
  document.querySelectorAll('[data-ver]').forEach(b =>
    b.addEventListener('click', () => {
      state.portalSelId = Number(b.dataset.ver);
      state.activeView = 'portal';
      persist();
      renderAll();
    }));
}

function abrirModalAporte(investidorId) {
  const inv = getInvestidor(investidorId);
  if (!inv) return;
  const preco = estadoNoMes(state.mesAtual).valorAcao;
  openModal(`
    <h3>Aporte — ${inv.nome}</h3>
    <p class="hint">O aporte emite novas ações ao valor patrimonial de hoje (${fmtBRL(preco)}).</p>
    <div class="field" style="margin-top:12px;"><label>Valor do aporte (R$)</label><input type="number" id="aporte-valor" min="0" step="100" value="1000"></div>
    <p class="hint" id="aporte-preview"></p>
    <div class="modal-actions">
      <button class="btn ghost" id="aporte-cancelar">Cancelar</button>
      <button class="btn primary" id="aporte-confirmar">Confirmar aporte</button>
    </div>
  `, (root) => {
    const el = root.querySelector('#aporte-valor');
    const prev = root.querySelector('#aporte-preview');
    const atualiza = () => {
      const v = Math.max(0, Number(el.value) || 0);
      const margem = margemAporte(inv, preco);
      const qtd = Math.min(Math.floor(v / preco), margem);
      const teto = tetoRestanteAno(inv);
      prev.textContent = `${fmtBRL0(v)} → ${fmtNum(qtd)} ações. Limite: ${fmtNum(margem)} ações` +
        (teto === Infinity ? ' (oferta privada, sem teto anual).' : ` · resta ${fmtBRL0(teto)} no teto anual do crowdfunding.`);
    };
    el.addEventListener('input', atualiza);
    atualiza();
    root.querySelector('#aporte-cancelar').addEventListener('click', closeModal);
    root.querySelector('#aporte-confirmar').addEventListener('click', () => {
      if (registrarAporte(inv.id, Number(el.value) || 0) > 0) closeModal();
    });
  });
}

function abrirModalNovoInvestidor() {
  const preco = estadoNoMes(state.mesAtual).valorAcao;
  openModal(`
    <h3>Novo investidor</h3>
    <p class="hint">Novos investidores entram por aporte primário — a companhia emite ações ao valor patrimonial.</p>
    <div class="field" style="margin-top:12px;"><label>Nome</label><input type="text" id="novo-nome" placeholder="Nome completo"></div>
    <div class="field"><label>Onda de captação</label>
      <select id="novo-origem">${ORIGENS.map(o => `<option value="${o.key}">${o.label}</option>`).join('')}</select>
    </div>
    <div class="field"><label>Aporte inicial (R$)</label><input type="number" id="novo-valor" min="0" step="500" value="5000"></div>
    <p class="hint" id="novo-preview"></p>
    <div class="modal-actions">
      <button class="btn ghost" id="novo-cancelar">Cancelar</button>
      <button class="btn primary" id="novo-confirmar">Cadastrar e aportar</button>
    </div>
  `, (root) => {
    const origemEl = root.querySelector('#novo-origem');
    const valorEl = root.querySelector('#novo-valor');
    const prev = root.querySelector('#novo-preview');
    const atualiza = () => {
      const v = Math.max(0, Number(valorEl.value) || 0);
      const teto = origemEl.value === 'crowdfunding' ? state.config.tetoAporteAnualCrowd : Infinity;
      const efetivo = Math.min(v, teto);
      prev.textContent = `${fmtBRL0(efetivo)} → ${fmtNum(Math.floor(efetivo / preco))} ações a ${fmtBRL(preco)}` +
        (v > teto ? ` · limitado ao teto anual de ${fmtBRL0(teto)} do crowdfunding.` : '.');
    };
    origemEl.addEventListener('change', atualiza);
    valorEl.addEventListener('input', atualiza);
    atualiza();
    root.querySelector('#novo-cancelar').addEventListener('click', closeModal);
    root.querySelector('#novo-confirmar').addEventListener('click', () => {
      const nome = root.querySelector('#novo-nome').value.trim();
      if (!nome) { toast('Informe o nome do investidor.'); return; }
      const origem = origemEl.value;
      const id = state.nextId++;
      // Gênero a partir do primeiro nome digitado (para a foto casar com o nome);
      // se o nome não estiver na base, cai no padrão determinístico por id.
      const semAcento = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
      const primeiroNome = semAcento(nome.split(' ')[0]);
      const idxNome = NOMES_BASE.findIndex(n => semAcento(n) === primeiroNome);
      const genero = idxNome >= 0 ? GENEROS_BASE[idxNome] : generoInvestidor(id);
      state.investidores.push({
        id, nome, genero, origem, mesEntrada: state.mesAtual,
        fotoUrl: `https://randomuser.me/api/portraits/${genero === 'F' ? 'women' : 'men'}/${id % 15}.jpg`,
        acoes: 0, valorPago: 0, aportadoNoAno: {},
        planoMensal: 0, reinvestir: false, creditoReinvestimento: 0,
        historico: []
      });
      const qtd = registrarAporte(id, Number(valorEl.value) || 0);
      if (qtd <= 0) { toast(`${nome} cadastrado, mas sem ações — revise o valor do aporte.`); persist(); renderAll(); }
      closeModal();
    });
  });
}

/* ============================================================
   CICLO MENSAL
   ============================================================ */
function renderCiclo() {
  const labels = ['Resultado da Unidade', 'Informe aos Acionistas', 'Distribuição & Fechamento'];
  document.getElementById('ciclo-stepper').innerHTML = `
    <div class="dots">${[1, 2, 3].map(n => `<span class="${n < state.ciclo.step ? 'done' : n === state.ciclo.step ? 'now' : ''}"></span>`).join('')}</div>
    <div class="txt">Passo ${state.ciclo.step}/3 — <b>${labels[state.ciclo.step - 1]}</b> · ${fmtMes(state.mesAtual)}</div>
  `;
  const body = document.getElementById('ciclo-body');
  if (state.ciclo.step === 1) renderCicloStep1(body);
  else if (state.ciclo.step === 2) renderCicloStep2(body);
  else renderCicloStep3(body);
}

function renderCicloStep1(body) {
  const cfg = state.config;
  body.innerHTML = `
    <div class="m-card">
      <h3>Resultado da ${cfg.nomeUnidade} neste mês</h3>
      <p class="hint" style="margin-top:6px;">O lucro da unidade é a origem de tudo: a companhia recebe a fatia dela e distribui aos acionistas.</p>
      <div class="field" style="margin-top:12px;"><label>Lucro do mês (R$)</label><input type="number" id="input-lucro-mes" step="2000" value="${state.ciclo.lucroMes}"></div>
    </div>
    <div class="m-card">
      <h3 style="margin-bottom:10px;">Apuração</h3>
      <div class="scenario-row"><span class="k">Companhia recebe (${cfg.participacaoPct}%)</span><span class="v" id="out-recebe"></span></div>
      <div class="scenario-row"><span class="k">Custos do veículo</span><span class="v" id="out-custo"></span></div>
      <div class="scenario-row"><span class="k">Disponível para distribuir</span><span class="v" id="out-liquido"></span></div>
      <div class="scenario-row total"><span class="k">Dividendo por ação</span><span class="v" id="out-divAcao"></span></div>
      <p class="hint" id="dividendo-formula" style="margin-top:10px;"></p>
    </div>
    <button class="btn primary full" id="btn-step1-next">Avançar para o Informe →</button>
  `;
  const atualiza = () => {
    const lucro = Number(document.getElementById('input-lucro-mes').value) || 0;
    state.ciclo.lucroMes = lucro;
    const recebe = lucro * (cfg.participacaoPct / 100);
    const custo = custoMensalVeiculo(cfg);
    const liquido = recebe - custo;
    const porAcao = dividendoPorAcao(lucro, cfg);
    document.getElementById('out-recebe').textContent = fmtBRL(recebe);
    document.getElementById('out-custo').textContent = fmtBRL(custo);
    document.getElementById('out-liquido').textContent = fmtBRL(liquido);
    document.getElementById('out-divAcao').textContent = fmtBRL(porAcao);
    document.getElementById('dividendo-formula').textContent =
      `${fmtBRL0(lucro)} × ${cfg.participacaoPct}% − ${fmtBRL0(custo)} de custos = ${fmtBRL0(liquido)} ÷ ${fmtNum(cfg.totalAcoes)} ações`;
    persist();
  };
  document.getElementById('input-lucro-mes').addEventListener('input', atualiza);
  atualiza();
  document.getElementById('btn-step1-next').addEventListener('click', () => { state.ciclo.step = 2; persist(); renderCiclo(); });
}

function gerarTextoComunicado() {
  const cfg = state.config;
  const lucro = state.ciclo.lucroMes;
  const porAcao = dividendoPorAcao(lucro, cfg);
  const totalAosAcionistas = acoesComInvestidores() * porAcao;
  const proxima = proximaJanelaMes();
  return `INFORME AOS ACIONISTAS — ${fmtMes(state.mesAtual).toUpperCase()}

Prezados acionistas,

Resultado do período:
- Lucro da ${cfg.nomeUnidade}: ${fmtBRL0(lucro)}
- Participação da companhia (${cfg.participacaoPct}%): ${fmtBRL0(lucro * (cfg.participacaoPct / 100))}
- Custos do veículo: ${fmtBRL0(custoMensalVeiculo(cfg))}

Distribuição:
- Dividendo por ação: ${fmtBRL(porAcao)}
- Total distribuído aos acionistas: ${fmtBRL0(totalAosAcionistas)}
- Valor patrimonial da ação: ${fmtBRL(estadoNoMes(state.mesAtual).valorAcao)}

Liquidez:
- Próxima Janela de Liquidez: ${fmtMes(proxima)}
- Pedidos de venda na fila: ${fmtNum(ofertaTotal())} ações

A Diretoria.`;
}

function renderCicloStep2(body) {
  const texto = gerarTextoComunicado();
  body.innerHTML = `
    <div class="comunicado">${texto.replace('INFORME AOS ACIONISTAS', '<span class="h">INFORME AOS ACIONISTAS</span>')}</div>
    <button class="btn ghost full" id="btn-copiar" style="margin-bottom:10px;">Copiar Texto</button>
    <button class="btn ghost full" id="btn-step2-back" style="margin-bottom:10px;">← Voltar</button>
    <button class="btn primary full" id="btn-step2-next">Avançar para Distribuição →</button>
  `;
  document.getElementById('btn-step2-back').addEventListener('click', () => { state.ciclo.step = 1; persist(); renderCiclo(); });
  document.getElementById('btn-step2-next').addEventListener('click', () => { state.ciclo.step = 3; persist(); renderCiclo(); });
  document.getElementById('btn-copiar').addEventListener('click', () => {
    navigator.clipboard?.writeText(texto).then(() => toast('Informe copiado.'), () => toast('Selecione o texto manualmente para copiar.'));
  });
}

function renderCicloStep3(body) {
  const cfg = state.config;
  const lucro = state.ciclo.lucroMes;
  const porAcao = dividendoPorAcao(lucro, cfg);
  const comPlano = state.investidores.filter(i => i.planoMensal > 0);
  const somaPlanos = comPlano.reduce((s, i) => s + i.planoMensal, 0);
  const comDrip = state.investidores.filter(i => i.reinvestir && i.acoes > 0);
  const linhas = investidoresAtivos()
    .map(i => ({ i, dividendo: i.acoes * porAcao }))
    .sort((a, b) => b.dividendo - a.dividendo);

  body.innerHTML = `
    <div class="m-card">
      <h3 style="margin-bottom:10px;">O que acontece ao fechar o mês</h3>
      <div class="scenario-row"><span class="k">Aportes recorrentes ativos</span><span class="v">${comPlano.length} investidores · ${fmtBRL0(somaPlanos)}/mês</span></div>
      <div class="scenario-row"><span class="k">Reinvestimento automático ligado</span><span class="v">${comDrip.length} investidores</span></div>
      <div class="scenario-row total"><span class="k">Total de dividendos do mês</span><span class="v">${fmtBRL(acoesComInvestidores() * porAcao)}</span></div>
      <p class="hint" style="margin-top:10px;">Os aportes recorrentes emitem novas ações ao valor patrimonial, respeitando o teto anual de quem entrou pelo crowdfunding. Quem tem reinvestimento ligado converte o dividendo em ações.</p>
    </div>
    <div class="m-card" style="padding-bottom:6px;">
      <h3 style="margin-bottom:10px;">Dividendo por investidor</h3>
      <div class="clist">
        ${linhas.slice(0, 30).map(l => `
          <div class="citem"><div class="citem-top">
            <div><span class="citem-name">${l.i.nome}</span><div class="citem-meta">${badgeOrigem(l.i.origem)}</div></div>
            <div class="citem-val"><span class="big">${fmtBRL(l.dividendo)}</span><span class="small">${fmtNum(l.i.acoes)} ações</span></div>
          </div></div>`).join('')}
      </div>
      ${linhas.length > 30 ? `<p class="hint" style="margin:8px 0 10px;">Mostrando os 30 maiores de ${linhas.length} investidores.</p>` : ''}
    </div>
    <button class="btn ghost full" id="btn-step3-back" style="margin:14px 0 10px;">← Voltar ao Informe</button>
    <button class="btn primary full" id="btn-fechar-mes">Fechar ${fmtMes(state.mesAtual)} ✓</button>
  `;
  document.getElementById('btn-step3-back').addEventListener('click', () => { state.ciclo.step = 2; persist(); renderCiclo(); });
  document.getElementById('btn-fechar-mes').addEventListener('click', fecharMes);
}

function fecharMes() {
  const cfg = state.config;
  const lucro = state.ciclo.lucroMes;
  const valorAcao = estadoNoMes(state.mesAtual).valorAcao;
  const divAcao = dividendoPorAcao(lucro, cfg);

  let totAportadas = 0, totReinvestidas = 0, totDividendos = 0;

  state.investidores.forEach(inv => {
    // 1. Aporte recorrente do investidor (emissão primária, respeitando teto e concentração)
    if (inv.planoMensal > 0) {
      const qtd = registrarAporte(inv.id, inv.planoMensal, true);
      totAportadas += qtd;
    }

    // 2. Dividendo do mês sobre a posição já atualizada
    if (inv.acoes > 0 && divAcao > 0) {
      const dividendo = inv.acoes * divAcao;
      totDividendos += dividendo;
      inv.historico.push({ mes: state.mesAtual, tipo: 'dividendo', qtd: null, valor: dividendo, desc: 'Dividendo mensal' });

      // 3. Reinvestimento automático: acumula crédito e converte quando dá 1 ação inteira
      if (inv.reinvestir) {
        inv.creditoReinvestimento = (inv.creditoReinvestimento || 0) + dividendo;
        let qtdR = Math.min(Math.floor(inv.creditoReinvestimento / valorAcao), margemAporte(inv, valorAcao));
        qtdR = emitirAcoes(Math.max(0, qtdR));
        if (qtdR > 0) {
          const custoR = qtdR * valorAcao;
          const ano = anoDoMes(state.mesAtual);
          inv.acoes += qtdR;
          inv.valorPago += custoR;
          inv.aportadoNoAno[ano] = (inv.aportadoNoAno[ano] || 0) + custoR;
          inv.creditoReinvestimento -= custoR;
          inv.historico.push({ mes: state.mesAtual, tipo: 'reinvestimento', qtd: qtdR, valor: custoR, desc: 'Reinvestimento automático de dividendos' });
          totReinvestidas += qtdR;
        }
      }
    }
  });

  state.mesAtual += 1;
  state.ciclo = { step: 1, lucroMes: cfg.lucroMensal };
  persist();

  const extras = [];
  if (totAportadas > 0) extras.push(`${totAportadas} ações por aporte recorrente`);
  if (totReinvestidas > 0) extras.push(`${totReinvestidas} reinvestidas`);
  const abriu = janelaAberta() ? ' · Janela de Liquidez aberta' : '';
  toast(`${fmtMes(state.mesAtual - 1)} fechado. ${fmtBRL(totDividendos)} distribuídos${extras.length ? ' · ' + extras.join(' · ') : ''}${abriu}.`);
  renderAll();
}

/* ============================================================
   JANELA DE LIQUIDEZ
   Evento periódico (trimestral) com PREÇO ÚNICO apurado por fórmula:
   não há livro de ofertas, negociação contínua nem formação de preço.
   Quem quer vender entra numa fila; quem quer comprar registra interesse.
   Na apuração: investidores compradores primeiro, companhia (tesouraria)
   como último degrau, limitada ao caixa de reserva. Se a oferta superar a
   demanda, os vendedores são atendidos por rateio proporcional.
   ============================================================ */
function proximaJanelaMes() { return state.janela.ultimaExecutadaMes + state.config.janelaMeses; }
function janelaAberta() { return state.mesAtual >= proximaJanelaMes(); }
function mesesAteJanela() { return Math.max(0, proximaJanelaMes() - state.mesAtual); }

/* Preço único da janela = valor patrimonial da ação apurado pela fórmula */
function precoJanela() { return estadoNoMes(state.mesAtual).valorAcao; }

function pedidosVendaAtivos() { return state.janela.filaVenda.filter(p => p.status === 'na-fila' || p.status === 'parcial'); }
function pedidosCompraAtivos() { return state.janela.filaCompra.filter(p => p.status === 'na-fila' || p.status === 'parcial'); }
function ofertaTotal() { return pedidosVendaAtivos().reduce((s, p) => s + p.acoes, 0); }
function interesseTotal() { return pedidosCompraAtivos().reduce((s, p) => s + p.acoes, 0); }

function acoesNaFila(investidorId) {
  return pedidosVendaAtivos().filter(p => p.investidorId === investidorId).reduce((s, p) => s + p.acoes, 0);
}
/* Ações que o investidor ainda pode colocar à venda (não pode ofertar o que já está na fila) */
function acoesLivres(inv) { return Math.max(0, inv.acoes - acoesNaFila(inv.id)); }

function entrarFilaVenda(investidorId, acoes) {
  const inv = getInvestidor(investidorId);
  if (!inv) return false;
  acoes = Math.floor(acoes);
  if (acoes <= 0) { toast('Informe uma quantidade válida.'); return false; }
  if (acoes > acoesLivres(inv)) {
    toast(`${inv.nome} tem ${fmtNum(acoesLivres(inv))} ações livres para vender.`);
    return false;
  }
  state.janela.filaVenda.push({
    id: state.nextPedidoId++, investidorId, acoes,
    mesPedido: state.mesAtual, status: 'na-fila'
  });
  persist();
  toast(`${inv.nome} entrou na fila com ${fmtNum(acoes)} ações para a próxima janela.`);
  renderAll();
  return true;
}

function registrarInteresseCompra(investidorId, acoes) {
  const inv = getInvestidor(investidorId);
  if (!inv) return false;
  acoes = Math.floor(acoes);
  if (acoes <= 0) { toast('Informe uma quantidade válida.'); return false; }
  // Desconta interesses de compra já registrados do mesmo investidor nesta janela,
  // para o teto de concentração/anual valer sobre o total pedido, não por pedido.
  const jaPedido = pedidosCompraAtivos().filter(p => p.investidorId === inv.id).reduce((s, p) => s + p.acoes, 0);
  const limite = Math.min(
    maxAcoesPorInvestidor() - inv.acoes - jaPedido,
    tetoRestanteAno(inv) === Infinity ? Infinity : Math.floor(tetoRestanteAno(inv) / precoJanela()) - jaPedido
  );
  if (limite <= 0) {
    const porConcentracao = maxAcoesPorInvestidor() - inv.acoes - jaPedido;
    toast(porConcentracao > 0
      ? `${inv.nome} atingiu o teto anual de ${fmtBRL0(state.config.tetoAporteAnualCrowd)} (contando pedidos já na fila).`
      : `${inv.nome} atingiu o teto de concentração (máx. ${fmtNum(maxAcoesPorInvestidor())} ações, contando pedidos já na fila).`);
    return false;
  }
  if (acoes > limite) {
    toast(`Interesse ajustado para ${fmtNum(limite)} ações — limite do investidor.`);
    acoes = limite;
  }
  state.janela.filaCompra.push({
    id: state.nextPedidoId++, investidorId, acoes,
    mesPedido: state.mesAtual, status: 'na-fila'
  });
  persist();
  toast(`${inv.nome} registrou interesse em ${fmtNum(acoes)} ações.`);
  renderAll();
  return true;
}

function cancelarPedido(pedidoId, tipo) {
  const fila = tipo === 'venda' ? state.janela.filaVenda : state.janela.filaCompra;
  const p = fila.find(x => x.id === pedidoId);
  if (!p) return;
  p.status = 'cancelado';
  persist();
  toast('Pedido cancelado.');
  renderAll();
}

/* Apuração da janela — função pura, não altera o estado.
   Devolve o que aconteceria se a janela fosse executada agora. */
function simularJanela() {
  const preco = precoJanela();
  const vendas = pedidosVendaAtivos();
  const compras = pedidosCompraAtivos();
  const oferta = vendas.reduce((s, p) => s + p.acoes, 0);

  // Demanda dos investidores, por ordem de chegada, limitada por concentração e teto anual
  const alocCompra = [];
  let demanda = 0;
  const posicaoProjetada = {};
  compras.forEach(p => {
    const inv = getInvestidor(p.investidorId);
    if (!inv) return;
    const jaProjetado = posicaoProjetada[inv.id] || 0;
    const porConcentracao = maxAcoesPorInvestidor() - inv.acoes - jaProjetado;
    const tetoRest = tetoRestanteAno(inv);
    const porTeto = tetoRest === Infinity ? Infinity : Math.floor((tetoRest - jaProjetado * preco) / preco);
    const cabe = Math.max(0, Math.min(p.acoes, porConcentracao, porTeto, oferta - demanda));
    if (cabe > 0) {
      alocCompra.push({ pedidoId: p.id, investidorId: inv.id, acoes: cabe });
      posicaoProjetada[inv.id] = jaProjetado + cabe;
      demanda += cabe;
    }
  });

  // Último degrau: companhia recompra o que sobrar, limitada ao caixa de reserva
  const capacidade = capacidadeRecompra();
  const paraTesouraria = Math.max(0, Math.min(capacidade, oferta - demanda));
  const executado = Math.min(oferta, demanda + paraTesouraria);

  // Rateio proporcional entre vendedores (maior resto), quando a demanda não cobre a oferta
  const alocVenda = [];
  if (executado > 0 && vendas.length) {
    const brutos = vendas.map(p => (p.acoes / oferta) * executado);
    const arred = brutos.map(v => Math.floor(v));
    let sobra = executado - arred.reduce((s, v) => s + v, 0);
    const ordem = brutos.map((v, i) => ({ i, frac: v - Math.floor(v) })).sort((a, b) => b.frac - a.frac);
    for (let k = 0; k < sobra; k++) arred[ordem[k % ordem.length].i] += 1;
    vendas.forEach((p, i) => { if (arred[i] > 0) alocVenda.push({ pedidoId: p.id, investidorId: p.investidorId, acoes: arred[i] }); });
  }

  const irTotal = alocVenda.reduce((s, a) => {
    const inv = getInvestidor(a.investidorId);
    return inv ? s + calcVendaJanela(inv, a.acoes, preco).imposto : s;
  }, 0);

  return {
    preco, oferta, demanda, paraTesouraria, executado, capacidade,
    naoAtendido: oferta - executado,
    rateioPct: oferta > 0 ? (executado / oferta) * 100 : 100,
    alocVenda, alocCompra, irTotal,
    desembolsoTesouraria: paraTesouraria * preco
  };
}

/* Executa a janela: liquida as transferências e lavra o resultado.
   Chamado só após a aprovação formal da diretoria (passo do wizard). */
function executarJanela() {
  const r = simularJanela();
  const preco = r.preco;

  // Vendedores: baixa ações e custo de aquisição proporcional; IR sobre o ganho
  r.alocVenda.forEach(a => {
    const inv = getInvestidor(a.investidorId);
    if (!inv) return;
    const v = calcVendaJanela(inv, a.acoes, preco);
    inv.acoes -= a.acoes;
    inv.valorPago = Math.max(0, inv.valorPago - v.custoBaixado);
    inv.historico.push({
      mes: state.mesAtual, tipo: 'venda-janela', qtd: -a.acoes, valor: v.liquido,
      desc: `Venda na janela · IR ${fmtBRL(v.imposto)} · liquidação em até ${state.config.prazoLiquidacaoDias} dias`
    });
    const pedido = state.janela.filaVenda.find(p => p.id === a.pedidoId);
    if (pedido) {
      pedido.acoes -= a.acoes;
      pedido.status = pedido.acoes > 0 ? 'parcial' : 'executado';
    }
  });

  // Compradores: recebem ações dos vendedores (transferência, não emissão)
  r.alocCompra.forEach(a => {
    const inv = getInvestidor(a.investidorId);
    if (!inv) return;
    const custo = a.acoes * preco;
    const ano = anoDoMes(state.mesAtual);
    inv.acoes += a.acoes;
    inv.valorPago += custo;
    inv.aportadoNoAno[ano] = (inv.aportadoNoAno[ano] || 0) + custo;
    inv.historico.push({ mes: state.mesAtual, tipo: 'compra-janela', qtd: a.acoes, valor: custo, desc: 'Compra na Janela de Liquidez' });
    const pedido = state.janela.filaCompra.find(p => p.id === a.pedidoId);
    if (pedido) {
      pedido.acoes -= a.acoes;
      pedido.status = pedido.acoes > 0 ? 'parcial' : 'executado';
    }
  });

  // Companhia recompra o resíduo — ações vão para a tesouraria
  if (r.paraTesouraria > 0) devolverAcoesTesouraria(r.paraTesouraria);

  state.janela.historico.push({
    mes: state.mesAtual, preco,
    acoesNegociadas: r.executado,
    paraInvestidores: r.demanda, paraTesouraria: r.paraTesouraria,
    rateioPct: Math.round(r.rateioPct),
    irRecolhido: Math.round(r.irTotal * 100) / 100,
    desembolsoTesouraria: Math.round(r.desembolsoTesouraria * 100) / 100
  });
  state.janela.ultimaExecutadaMes = state.mesAtual;

  persist();
  toast(r.executado > 0
    ? `Janela liquidada: ${fmtNum(r.executado)} ações a ${fmtBRL(preco)}${r.naoAtendido > 0 ? ` · rateio de ${Math.round(r.rateioPct)}%` : ''}.`
    : (r.oferta > 0
        ? 'Janela apurada, mas nenhum negócio fechou: sem compradores nem caixa de recompra. Os pedidos seguem na fila.'
        : 'Janela apurada sem negócios — nenhum pedido na fila.'));
  renderAll();
  return r;
}

/* ============================================================
   EVOLUÇÃO (card-list)
   ============================================================ */
function renderEvolucao() {
  const linhas = [];
  for (let ano = 0; ano <= 10; ano++) linhas.push(estadoNoMes(ano * 12));
  const pontos = linhas.map(l => ({ y: l.valorAcao, label: `${l.mes / 12}a` }));
  document.getElementById('evolucao-chart').innerHTML = svgLineChart(pontos, { height: 200 });

  document.getElementById('evolucao-list').innerHTML = `
    <div class="clist">
      ${linhas.map(l => `
        <div class="citem">
          <div class="citem-top">
            <div><span class="citem-name">Ano ${l.mes / 12}</span><div class="citem-meta">valuation da unidade ${fmtShort(l.valuation)}</div></div>
            <div class="citem-val"><span class="big">${fmtBRL(l.valorAcao)}</span><span class="small">por ação</span></div>
          </div>
          <div class="citem-row"><span>Patrimônio da companhia</span><span class="v">${fmtBRL0(l.patrimonioVeiculo)}</span></div>
        </div>`).join('')}
    </div>
  `;
}

/* ============================================================
   REGRAS DO PROGRAMA
   ============================================================ */
function renderRegras() {
  const c = state.config;
  const e = estadoNoMes(state.mesAtual);
  const comInv = acoesComInvestidores();

  document.getElementById('regras-body').innerHTML = `
    <div class="m-card">
      <h3 style="margin-bottom:4px;">Onde estão as ações hoje</h3>
      <p class="hint" style="margin-bottom:12px;">O capital autorizado da companhia é de ${fmtNum(c.totalAcoes)} ações, divididas em três lugares. A soma é sempre igual ao total — nada some, nada aparece do nada.</p>
      <div class="rule-pools">
        <div class="rp"><span class="rp-dot" style="background:var(--gold);"></span><div><strong>Com investidores</strong><span>${fmtNum(comInv)} ações · ${fmtBRL0(comInv * e.valorAcao)}</span></div></div>
        <div class="rp"><span class="rp-dot" style="background:var(--olive);"></span><div><strong>Em tesouraria</strong><span>${fmtNum(state.acoesEmTesouraria)} ações — recompradas pela companhia, prontas para novos aportes</span></div></div>
        <div class="rp"><span class="rp-dot" style="background:var(--ink-faint);"></span><div><strong>A emitir</strong><span>${fmtNum(state.acoesDisponiveisEmissao)} ações — capital autorizado ainda não emitido</span></div></div>
      </div>
    </div>

    <div class="m-card">
      <h3 style="margin-bottom:4px;">Um preço só, apurado por fórmula</h3>
      <p class="hint" style="margin-bottom:10px;">Não há formação de preço, livro de ofertas nem negociação contínua neste programa. Todo mundo entra e sai pelo mesmo valor: o <strong>valor patrimonial da ação</strong>.</p>
      <div class="scenario-row"><span class="k">Patrimônio da companhia</span><span class="v">${fmtBRL0(e.patrimonioVeiculo)}</span></div>
      <div class="scenario-row"><span class="k">÷ capital autorizado</span><span class="v">${fmtNum(c.totalAcoes)} ações</span></div>
      <div class="scenario-row total"><span class="k">= valor da ação hoje</span><span class="v">${fmtBRL(e.valorAcao)}</span></div>
      <p class="hint" style="margin-top:10px;">O valor sobe quando a ${c.nomeUnidade} vale mais (lucro × múltiplo) e cai com os custos do veículo. Comprar ou vender <strong>não muda</strong> esse valor: entra dinheiro e entra ação na mesma proporção.</p>
    </div>

    <div class="m-card">
      <h3 style="margin-bottom:14px;">Como se entra</h3>
      <div class="flow">
        <div class="flow-step"><span class="flow-n">1</span><div><strong>Oferta privada</strong><p>Círculo restrito de investidores, por convite. Sem teto de aporte e sem divulgação pública.</p></div></div>
        <div class="flow-step"><span class="flow-n">2</span><div><strong>Crowdfunding</strong><p>Captação pública via plataforma autorizada. Cada investidor de varejo pode aportar até <strong>${fmtBRL0(c.tetoAporteAnualCrowd)} por ano</strong>.</p></div></div>
        <div class="flow-step last"><span class="flow-n">3</span><div><strong>Sempre por emissão</strong><p>Todo aporte emite ações novas ao valor patrimonial — primeiro da tesouraria, depois do capital autorizado. Investidor novo só entra por aqui, nunca pela janela.</p></div></div>
      </div>
    </div>

    <div class="m-card">
      <h3 style="margin-bottom:14px;">Como se sai — a Janela de Liquidez</h3>
      <div class="waterfall">
        <div class="wf-step"><span class="wf-n">1</span><div><strong>Entrar na fila</strong><p>A qualquer momento o investidor pede para vender, no todo ou em parte. O pedido fica na fila até a próxima janela.</p></div></div>
        <div class="wf-step"><span class="wf-n">2</span><div><strong>Janela a cada ${c.janelaMeses} meses</strong><p>Na data, apura-se o preço único e cruzam-se os pedidos. Próxima: ${janelaAberta() ? 'aberta agora' : fmtMes(proximaJanelaMes())}.</p></div></div>
        <div class="wf-step"><span class="wf-n">3</span><div><strong>Investidores compram primeiro</strong><p>Quem registrou interesse é atendido por ordem de chegada, respeitando o teto de concentração e o teto anual do crowdfunding.</p></div></div>
        <div class="wf-step"><span class="wf-n">4</span><div><strong>A companhia é o último degrau</strong><p>O que sobrar é recomprado pela companhia, limitado ao caixa de reserva (${c.reservaPct}% do patrimônio = ${fmtNum(capacidadeRecompra())} ações hoje). As ações vão para a tesouraria.</p></div></div>
        <div class="wf-step"><span class="wf-n">5</span><div><strong>Rateio se faltar demanda</strong><p>Se a oferta superar a demanda, todos os vendedores são atendidos proporcionalmente e o saldo continua na fila para a janela seguinte. Ninguém fura fila.</p></div></div>
        <div class="wf-step last"><span class="wf-n">6</span><div><strong>Aprovação e livro</strong><p>A Diretoria aprova a operação e lavra as transferências no Livro de Registro de Ações Nominativas. O pagamento sai em até <strong>${c.prazoLiquidacaoDias} dias</strong>.</p></div></div>
      </div>
    </div>

    <div class="m-card">
      <h3 style="margin-bottom:10px;">Limites e impostos</h3>
      <div class="scenario-row"><span class="k">Máximo por investidor</span><span class="v">${fmtNum(maxAcoesPorInvestidor())} ações (${c.limiteConcentracaoPct}%)</span></div>
      <div class="scenario-row"><span class="k">Teto anual — crowdfunding</span><span class="v">${fmtBRL0(c.tetoAporteAnualCrowd)}</span></div>
      <div class="scenario-row"><span class="k">Teto anual — oferta privada</span><span class="v">sem teto</span></div>
      <div class="scenario-row"><span class="k">IR sobre o ganho na venda</span><span class="v">${c.irGanhoPct}%</span></div>
      <div class="scenario-row total"><span class="k">Prazo de liquidação</span><span class="v">até ${c.prazoLiquidacaoDias} dias</span></div>
      <p class="hint" style="margin-top:10px;">O IR incide só sobre o <strong>ganho</strong>: a diferença entre o preço da janela e o custo médio de aquisição, que o sistema registra desde o primeiro aporte. Dividendo de ação, hoje, chega isento para quem recebe valores dessa ordem.</p>
    </div>

    <div class="m-card">
      <h3 style="margin-bottom:10px;">Por que a companhia retém dividendos</h3>
      <p class="hint">O dividendo é calculado sobre o capital autorizado inteiro, mas só quem tem ação recebe. A parcela correspondente às ações em tesouraria e às ainda não emitidas fica na companhia e alimenta justamente o <strong>caixa de reserva</strong> que garante a recompra na janela. É o que faz a promessa de liquidez ter lastro.</p>
    </div>
  `;
}

/* ============================================================
   JANELA DE LIQUIDEZ — VIEW
   ============================================================ */
function renderJanela() {
  const cfg = state.config;
  const preco = precoJanela();
  const aberta = janelaAberta();
  const oferta = ofertaTotal();
  const interesse = interesseTotal();
  const capacidade = capacidadeRecompra();

  document.getElementById('janela-resumo').innerHTML = `
    <div class="stat-grid">
      <div class="kpi-card"><span class="lbl">${aberta ? 'Janela' : 'Próxima janela'}</span><span class="val">${aberta ? 'Aberta' : fmtMes(proximaJanelaMes())}</span><span class="sub ${aberta ? 'pos' : ''}">${aberta ? 'pronta para apurar' : `em ${mesesAteJanela()} ${mesesAteJanela() === 1 ? 'mês' : 'meses'}`}</span></div>
      <div class="kpi-card"><span class="lbl">Preço da janela</span><span class="val">${fmtBRL(preco)}</span><span class="sub">valor patrimonial apurado</span></div>
      <div class="kpi-card"><span class="lbl">Na fila de venda</span><span class="val">${fmtNum(oferta)}</span><span class="sub">${pedidosVendaAtivos().length} pedidos</span></div>
      <div class="kpi-card"><span class="lbl">Demanda</span><span class="val">${fmtNum(interesse + capacidade)}</span><span class="sub">${fmtNum(interesse)} de investidores + ${fmtNum(capacidade)} da companhia</span></div>
    </div>
    <div class="m-card" style="margin:12px 0 4px;">
      <h3 style="margin-bottom:6px;">Preço único, apurado por fórmula</h3>
      <p class="hint">Não há formação de preço nem negociação contínua aqui. Todos negociam pelo <strong>mesmo preço</strong> — o valor patrimonial da ação no dia da apuração. Se houver mais gente vendendo do que comprando, o atendimento é por <strong>rateio proporcional</strong>, e o saldo continua na fila para a próxima janela.</p>
    </div>
    <div style="display:flex; gap:8px; margin-top:10px;">
      <button class="btn ghost full" id="btn-nova-venda">Entrar na fila de venda</button>
      <button class="btn ghost full" id="btn-novo-interesse">Registrar interesse</button>
    </div>
    ${aberta ? `<button class="btn primary full" id="btn-apurar" style="margin-top:8px;">Apurar e executar a janela →</button>`
             : `<p class="hint" style="text-align:center; margin-top:10px;">A janela abre em ${fmtMes(proximaJanelaMes())}. Até lá, os pedidos ficam acumulando na fila.</p>`}
  `;
  document.getElementById('btn-nova-venda').addEventListener('click', () => abrirModalVenda());
  document.getElementById('btn-novo-interesse').addEventListener('click', () => abrirModalInteresse());
  const btnApurar = document.getElementById('btn-apurar');
  if (btnApurar) btnApurar.addEventListener('click', abrirWizardJanela);

  // Fila de venda
  const vendas = pedidosVendaAtivos();
  document.getElementById('janela-fila-venda').innerHTML = !vendas.length
    ? `<div class="empty">Ninguém na fila de venda no momento.</div>`
    : vendas.map(p => {
        const inv = getInvestidor(p.investidorId);
        if (!inv) return '';
        const v = calcVendaJanela(inv, p.acoes, preco);
        return `
        <div class="janela-card">
          <div class="janela-top">
            <div class="janela-quem">
              <span class="avatar" style="background-image:url('${inv.fotoUrl}');"></span>
              <div>
                <div class="jnome">${inv.nome}</div>
                <div class="jmeta">${ORIGENS.find(o => o.key === inv.origem).curto} · pedido em ${fmtMes(p.mesPedido)}</div>
              </div>
            </div>
            ${p.status === 'parcial' ? `<span class="badge gold">PARCIAL</span>` : ''}
          </div>
          <div class="janela-body">
            <div class="janela-fig"><span class="k">Ações</span><span class="v">${fmtNum(p.acoes)}</span></div>
            <div class="janela-fig"><span class="k">Bruto</span><span class="v">${fmtBRL0(v.bruto)}</span></div>
            <div class="janela-fig"><span class="k">Líquido de IR</span><span class="v gold">${fmtBRL0(v.liquido)}</span></div>
          </div>
          <button class="btn sm ghost full" data-cancelar-venda="${p.id}">Cancelar pedido</button>
        </div>`;
      }).join('');
  document.querySelectorAll('[data-cancelar-venda]').forEach(b =>
    b.addEventListener('click', () => cancelarPedido(Number(b.dataset.cancelarVenda), 'venda')));

  // Fila de compra
  const compras = pedidosCompraAtivos();
  document.getElementById('janela-fila-compra').innerHTML = !compras.length
    ? `<div class="empty">Nenhum interesse de compra registrado.</div>`
    : compras.map(p => {
        const inv = getInvestidor(p.investidorId);
        if (!inv) return '';
        return `
        <div class="janela-card">
          <div class="janela-top">
            <div class="janela-quem">
              <span class="avatar" style="background-image:url('${inv.fotoUrl}');"></span>
              <div>
                <div class="jnome">${inv.nome}</div>
                <div class="jmeta">${ORIGENS.find(o => o.key === inv.origem).curto} · desde ${fmtMes(p.mesPedido)}</div>
              </div>
            </div>
          </div>
          <div class="janela-body">
            <div class="janela-fig"><span class="k">Quer comprar</span><span class="v">${fmtNum(p.acoes)}</span></div>
            <div class="janela-fig"><span class="k">Valor</span><span class="v gold">${fmtBRL0(p.acoes * preco)}</span></div>
          </div>
          <button class="btn sm ghost full" data-cancelar-compra="${p.id}">Cancelar interesse</button>
        </div>`;
      }).join('');
  document.querySelectorAll('[data-cancelar-compra]').forEach(b =>
    b.addEventListener('click', () => cancelarPedido(Number(b.dataset.cancelarCompra), 'compra')));

  // Histórico de janelas
  const hist = [...state.janela.historico].reverse();
  document.getElementById('janela-historico').innerHTML = !hist.length
    ? `<div class="empty">Nenhuma janela executada ainda.</div>`
    : `<div class="m-card">${hist.map(h => `
        <div class="scenario-row"><span class="k">${fmtMes(h.mes)} · ${fmtBRL(h.preco)}/ação</span><span class="v">${fmtNum(h.acoesNegociadas)} ações</span></div>
        <p class="hint" style="margin:-4px 0 10px;">${fmtNum(h.paraInvestidores)} entre investidores · ${fmtNum(h.paraTesouraria)} recompradas pela companhia${h.rateioPct < 100 ? ` · rateio de ${h.rateioPct}%` : ''} · IR ${fmtBRL(h.irRecolhido)}</p>
      `).join('')}</div>`;
}

function abrirModalVenda(preSelId) {
  const elegiveis = investidoresAtivos().filter(i => acoesLivres(i) > 0);
  if (!elegiveis.length) { toast('Nenhum investidor com ações livres para vender.'); return; }
  const sel = getInvestidor(preSelId) && acoesLivres(getInvestidor(preSelId)) > 0 ? getInvestidor(preSelId) : elegiveis[0];
  openModal(`
    <h3>Entrar na fila de venda</h3>
    <p class="hint">O pedido é atendido na próxima janela, ao preço apurado por fórmula. Se houver mais oferta que demanda, o atendimento é rateado.</p>
    <div class="field" style="margin-top:12px;"><label>Investidor</label>
      <select id="venda-inv">${elegiveis.map(i => `<option value="${i.id}" ${i.id === sel.id ? 'selected' : ''}>${i.nome} — ${fmtNum(acoesLivres(i))} ações livres</option>`).join('')}</select>
    </div>
    <div class="field"><label>Quantidade de ações</label><input type="number" id="venda-qtd" min="1" step="1" value="1"></div>
    <button class="btn ghost sm" id="venda-tudo" style="margin-bottom:12px;">Vender toda a posição</button>
    <div class="calc-output" id="venda-preview"></div>
    <div class="modal-actions">
      <button class="btn ghost" id="venda-cancelar">Cancelar</button>
      <button class="btn primary" id="venda-confirmar">Entrar na fila</button>
    </div>
  `, (root) => {
    const selEl = root.querySelector('#venda-inv');
    const qtdEl = root.querySelector('#venda-qtd');
    const prev = root.querySelector('#venda-preview');
    const atualiza = () => {
      const inv = getInvestidor(Number(selEl.value));
      const livres = acoesLivres(inv);
      qtdEl.max = livres;
      const qtd = Math.min(Math.max(1, Number(qtdEl.value) || 0), livres);
      const v = calcVendaJanela(inv, qtd);
      prev.innerHTML = `
        <div class="calc-output-row"><span class="k">Preço da janela</span><span class="v">${fmtBRL(v.preco)}</span></div>
        <div class="calc-output-row"><span class="k">Valor bruto</span><span class="v">${fmtBRL(v.bruto)}</span></div>
        <div class="calc-output-row"><span class="k">Custo médio de aquisição</span><span class="v">${fmtBRL(v.custoMedio)}/ação</span></div>
        <div class="calc-output-row"><span class="k">Ganho tributável</span><span class="v">${fmtBRL(v.ganho)}</span></div>
        <div class="calc-output-row"><span class="k">IR (${state.config.irGanhoPct}%)</span><span class="v">− ${fmtBRL(v.imposto)}</span></div>
        <div class="calc-output-row hl"><span class="k">Líquido a receber</span><span class="v">${fmtBRL(v.liquido)}</span></div>`;
    };
    selEl.addEventListener('change', atualiza);
    qtdEl.addEventListener('input', atualiza);
    root.querySelector('#venda-tudo').addEventListener('click', () => {
      qtdEl.value = acoesLivres(getInvestidor(Number(selEl.value)));
      atualiza();
    });
    atualiza();
    root.querySelector('#venda-cancelar').addEventListener('click', closeModal);
    root.querySelector('#venda-confirmar').addEventListener('click', () => {
      if (entrarFilaVenda(Number(selEl.value), Number(qtdEl.value) || 0)) closeModal();
    });
  });
}

function abrirModalInteresse(preSelId) {
  const preco = precoJanela();
  const elegiveis = state.investidores.filter(i => maxAcoesPorInvestidor() - i.acoes > 0 && tetoRestanteAno(i) > preco);
  if (!elegiveis.length) { toast('Nenhum investidor com espaço para comprar mais ações.'); return; }
  const sel = getInvestidor(preSelId) || elegiveis[0];
  openModal(`
    <h3>Registrar interesse de compra</h3>
    <p class="hint">Na janela, os investidores interessados são atendidos por ordem de chegada, ao preço apurado.</p>
    <div class="field" style="margin-top:12px;"><label>Investidor</label>
      <select id="int-inv">${elegiveis.map(i => `<option value="${i.id}" ${i.id === sel.id ? 'selected' : ''}>${i.nome} — ${fmtNum(i.acoes)} ações hoje</option>`).join('')}</select>
    </div>
    <div class="field"><label>Quantidade de ações</label><input type="number" id="int-qtd" min="1" step="1" value="10"></div>
    <p class="hint" id="int-preview"></p>
    <div class="modal-actions">
      <button class="btn ghost" id="int-cancelar">Cancelar</button>
      <button class="btn primary" id="int-confirmar">Registrar</button>
    </div>
  `, (root) => {
    const selEl = root.querySelector('#int-inv');
    const qtdEl = root.querySelector('#int-qtd');
    const prev = root.querySelector('#int-preview');
    const atualiza = () => {
      const inv = getInvestidor(Number(selEl.value));
      const qtd = Math.max(0, Number(qtdEl.value) || 0);
      const teto = tetoRestanteAno(inv);
      // Mesmo cálculo do registrarInteresseCompra: pedidos já na fila contam
      // contra os tetos, senão o preview promete um limite que o registro nega.
      const jaPedido = pedidosCompraAtivos().filter(p => p.investidorId === inv.id).reduce((s, p) => s + p.acoes, 0);
      const limite = Math.max(0, Math.min(maxAcoesPorInvestidor() - inv.acoes - jaPedido, teto === Infinity ? Infinity : Math.floor(teto / preco) - jaPedido));
      prev.textContent = `${fmtNum(qtd)} ações × ${fmtBRL(preco)} = ${fmtBRL0(qtd * preco)}. Limite deste investidor: ${fmtNum(limite)} ações` +
        (jaPedido > 0 ? ` (já há ${fmtNum(jaPedido)} na fila)` : '') +
        (teto === Infinity ? ' (oferta privada, sem teto anual).' : ` (resta ${fmtBRL0(teto)} no teto anual).`);
    };
    selEl.addEventListener('change', atualiza);
    qtdEl.addEventListener('input', atualiza);
    atualiza();
    root.querySelector('#int-cancelar').addEventListener('click', closeModal);
    root.querySelector('#int-confirmar').addEventListener('click', () => {
      if (registrarInteresseCompra(Number(selEl.value), Number(qtdEl.value) || 0)) closeModal();
    });
  });
}

/* Wizard: apuração → aprovação formal e lavratura no livro → liquidação */
function abrirWizardJanela() {
  const r = simularJanela();
  openModal(`
    <h3>Apuração da janela · ${fmtMes(state.mesAtual)}</h3>
    <p class="hint">Confira o resultado antes de liquidar. Nada é transferido até a aprovação.</p>
    <div class="calc-output" style="margin-top:12px;">
      <div class="calc-output-row"><span class="k">Preço apurado</span><span class="v">${fmtBRL(r.preco)}</span></div>
      <div class="calc-output-row"><span class="k">Oferta (fila de venda)</span><span class="v">${fmtNum(r.oferta)} ações</span></div>
      <div class="calc-output-row"><span class="k">Demanda de investidores</span><span class="v">${fmtNum(r.demanda)} ações</span></div>
      <div class="calc-output-row"><span class="k">Recompra pela companhia</span><span class="v">${fmtNum(r.paraTesouraria)} ações</span></div>
      <div class="calc-output-row"><span class="k">Capacidade do caixa de reserva</span><span class="v">${fmtNum(r.capacidade)} ações</span></div>
      <div class="calc-output-row hl"><span class="k">Total a negociar</span><span class="v">${fmtNum(r.executado)} ações</span></div>
    </div>
    ${r.naoAtendido > 0
      ? `<p class="hint" style="margin-top:10px; color:var(--gold-bright);">Demanda menor que a oferta: rateio de ${Math.round(r.rateioPct)}% — ${fmtNum(r.naoAtendido)} ações continuam na fila para a próxima janela.</p>`
      : (r.executado > 0 ? `<p class="hint" style="margin-top:10px;">Todos os pedidos de venda serão atendidos integralmente.</p>` : `<p class="hint" style="margin-top:10px;">Não há pedidos na fila — a janela será apurada sem negócios.</p>`)}
    <div class="done-when" style="margin-top:12px;"><b>Próximo passo</b>A Diretoria aprova a operação e lavra as transferências no Livro de Registro de Ações Nominativas. O pagamento aos vendedores ocorre em até ${state.config.prazoLiquidacaoDias} dias.</div>
    <div class="modal-actions">
      <button class="btn ghost" id="wiz-cancelar">Cancelar</button>
      <button class="btn primary" id="wiz-aprovar">Aprovar e lavrar ✓</button>
    </div>
  `, (root) => {
    root.querySelector('#wiz-cancelar').addEventListener('click', closeModal);
    root.querySelector('#wiz-aprovar').addEventListener('click', () => { executarJanela(); closeModal(); });
  });
}

/* ============================================================
   ACCORDIONS (páginas educativas)
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
   PROPOSTA — SIMULADOR DE RETORNO
   ============================================================ */
function wireSimuladorRetorno() {
  const inicialEl = document.getElementById('sim-inicial');
  if (!inicialEl) return;
  const mensalEl = document.getElementById('sim-mensal');
  const anosEl = document.getElementById('sim-anos');
  const dripEl = document.getElementById('sim-drip');

  const atualiza = () => {
    const cfg = state.config;
    const inicial = Number(inicialEl.value) || 0;
    const mensal = Number(mensalEl.value) || 0;
    const anos = Number(anosEl.value) || 1;
    const drip = dripEl.checked;
    const meses = anos * 12;

    document.getElementById('sim-inicial-out').textContent = fmtBRL0(inicial);
    document.getElementById('sim-mensal-out').textContent = fmtBRL0(mensal);
    document.getElementById('sim-anos-out').textContent = `${anos} ${anos === 1 ? 'ano' : 'anos'}`;

    const base = estadoNoMes(state.mesAtual);
    let acoes = base.valorAcao > 0 ? inicial / base.valorAcao : 0;
    let aportado = inicial, dividendosRecebidos = 0, credito = 0;
    const pontos = [];

    for (let i = 1; i <= meses; i++) {
      const est = estadoNoMes(state.mesAtual + i);
      const divTotal = acoes * dividendoPorAcao(cfg.lucroMensal, cfg);
      if (drip) {
        credito += divTotal;
        const novas = credito / est.valorAcao;
        acoes += novas;
        credito = 0;
      } else {
        dividendosRecebidos += divTotal;
      }
      if (mensal > 0) { acoes += mensal / est.valorAcao; aportado += mensal; }
      pontos.push({ y: acoes * est.valorAcao + dividendosRecebidos, label: `${Math.round(i / 12)}a` });
    }

    const estFinal = estadoNoMes(state.mesAtual + meses);
    const posicao = acoes * estFinal.valorAcao;
    const total = posicao + dividendosRecebidos;
    const lucro = total - aportado;

    document.getElementById('sim-out-aportado').textContent = fmtBRL0(aportado);
    document.getElementById('sim-out-posicao').textContent = fmtBRL0(posicao);
    document.getElementById('sim-out-dividendos').textContent = drip ? 'reinvestidos' : fmtBRL0(dividendosRecebidos);
    document.getElementById('sim-out-total').textContent = fmtBRL0(total);
    document.getElementById('sim-out-lucro').textContent = `${lucro >= 0 ? '+' : ''}${fmtBRL0(lucro)}`;
    document.getElementById('sim-out-pct').textContent = aportado > 0 ? `${lucro >= 0 ? '+' : ''}${fmtPct(lucro / aportado * 100)} sobre o aportado` : '—';
    document.getElementById('sim-chart').innerHTML = svgLineChart(pontos, { height: 170 });
  };

  [inicialEl, mensalEl, anosEl].forEach(el => el.addEventListener('input', atualiza));
  dripEl.addEventListener('change', atualiza);
  wireSimuladorRetorno.atualiza = atualiza; // renderProposta reusa após mudar config/mês
  atualiza();
}

/* ============================================================
   EVENTOS GLOBAIS + INIT
   ============================================================ */
function openMaisSheet() {
  const itemsHtml = `<div>
    <button class="sheet-item" data-go="ciclo"><span class="ic">05</span>Fechamento Mensal</button>
    <button class="sheet-item" data-go="evolucao"><span class="ic">06</span>Evolução &amp; Projeção</button>
    <button class="sheet-item" data-go="regras"><span class="ic">07</span>Regras do Programa</button>
    <button class="sheet-item" data-go="comofunciona"><span class="ic">08</span>Como Funciona</button>
    <button class="sheet-item" data-go="implantacao"><span class="ic">09</span>Do Zero ao Lançamento</button>
    <button class="sheet-item" data-go="proposta"><span class="ic">10</span>Proposta ao Investidor</button>
    <button class="sheet-item" data-go="concorrentes"><span class="ic">11</span>Estudo de Concorrentes</button>
    <button class="sheet-item" data-go="config"><span class="ic">12</span>Parâmetros</button>
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
  const on = (id, ev, fn) => { const el = document.getElementById(id); if (el) el.addEventListener(ev, fn); };

  on('bottom-nav', 'click', (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    if (btn.dataset.sheet) { openMaisSheet(); return; }
    if (btn.dataset.view) {
      state.activeView = btn.dataset.view;
      persist();
      renderAll();
    }
  });

  on('btn-reset-sim', 'click', resetSim);

  on('portal-switch', 'click', () => {
    openInvestidorPicker(state.portalSelId, (id) => { state.portalSelId = id; persist(); renderPortal(); });
  });

  on('cfg-aplicar', 'click', () => {
    const anterior = state.config.totalAcoes;
    const novaConfig = lerConfigDosInputs();
    // O capital autorizado nunca pode ficar abaixo das ações já emitidas,
    // senão o invariante (emitidas + a emitir === totalAcoes) quebra.
    const minimoAutorizado = acoesEmitidas();
    if (novaConfig.totalAcoes < minimoAutorizado) {
      renderConfig(); // restaura o valor anterior no input
      toast(`Capital autorizado não pode ser menor que as ${fmtNum(minimoAutorizado)} ações já emitidas.`);
      return;
    }
    // Lucro, múltiplo e participação precisam ser positivos, senão o valuation
    // zera e o valor da ação fica negativo, corrompendo todos os cálculos.
    if (novaConfig.lucroMensal <= 0 || novaConfig.multiplo <= 0 || novaConfig.participacaoPct <= 0) {
      renderConfig(); // restaura os valores anteriores nos inputs
      toast('Lucro mensal, múltiplo e participação precisam ser maiores que zero.');
      return;
    }
    state.config = novaConfig;
    const delta = state.config.totalAcoes - anterior;
    state.acoesDisponiveisEmissao = Math.max(0, state.acoesDisponiveisEmissao + delta);
    persist();
    rebuildEstados();
    renderAll();
    toast('Parâmetros aplicados e recalculados.');
  });
  on('cfg-padrao', 'click', () => {
    // Restaura os padrões, mas o capital autorizado não pode cair abaixo do já
    // emitido — e o saldo a emitir é recomposto para manter o invariante.
    const emitidas = acoesEmitidas();
    state.config = { ...DEFAULT_CONFIG, totalAcoes: Math.max(DEFAULT_CONFIG.totalAcoes, emitidas) };
    state.acoesDisponiveisEmissao = state.config.totalAcoes - emitidas;
    persist();
    rebuildEstados();
    renderAll();
    toast('Parâmetros padrão restaurados.');
  });

  on('btn-novo-investidor', 'click', abrirModalNovoInvestidor);

  wireAccordion();
  wireSimuladorRetorno();
}

function init() {
  state = loadState();
  rebuildEstados();
  wireGlobalEvents();
  renderAll();
}

document.addEventListener('DOMContentLoaded', init);
