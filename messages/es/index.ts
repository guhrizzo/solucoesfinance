// GERADO — índice de mensagens do idioma. Importa cada namespace
// estaticamente (evita a corrida de compilação do import() dinâmico no
// Turbopack). Ao adicionar um namespace: crie o .json e a linha aqui.
import common from './common.json';
import nav from './nav.json';
import auth from './auth.json';
import dashboard from './dashboard.json';
import fluxoCaixa from './fluxoCaixa.json';
import contasPagar from './contasPagar.json';
import contasReceber from './contasReceber.json';
import estoque from './estoque.json';
import vendas from './vendas.json';
import impostos from './impostos.json';
import relatorios from './relatorios.json';
import costCenter from './costCenter.json';
import configuracoes from './configuracoes.json';
import landing from './landing.json';
import onboarding from './onboarding.json';
import legal from './legal.json';
import errors from './errors.json';
import plans from './plans.json';

const messages = {
  common,
  nav,
  auth,
  dashboard,
  fluxoCaixa,
  contasPagar,
  contasReceber,
  estoque,
  vendas,
  impostos,
  relatorios,
  costCenter,
  configuracoes,
  landing,
  onboarding,
  legal,
  errors,
  plans,
};

export default messages;
