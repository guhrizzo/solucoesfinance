// RH — o PDF do holerite é gerado sem erro e traz o aviso do contador. Dados FICTÍCIOS.
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildHoleritePdf, AVISO_CONTADOR } from "../../lib/rh/holeritePdf.ts";

test("holerite em PDF: gera arquivo válido (com e sem marca de prévia)", async () => {
  const dados = {
    titulo: "Holerite — recibo de pagamento", previa: false, empresa: { nome: "Empresa Teste", cnpj: "00.000.000/0001-00" },
    colaborador: { nome: "Ana Teste", cargo: "Analista", cpfMascarado: "•••.•••.•••-25", admissao: "2025-01-10", dependentes: 1 },
    competencia: "2026-10",
    linhas: [
      { codigo: "0001", descricao: "Salário", provento: 2000 },
      { codigo: "0201", descricao: "INSS", desconto: 300 },
      { codigo: "R08", descricao: "Multa do FGTS", informativo: true, provento: undefined },
    ],
    bases: [{ rotulo: "Base INSS", valor: 2000 }, { rotulo: "FGTS do mês", valor: 160 }],
    totais: { proventos: 2000, descontos: 300, liquido: 1700 },
    notas: ["Nota de teste."],
  };
  const pdf = await buildHoleritePdf(dados);
  assert.ok(Buffer.isBuffer(pdf));
  assert.equal(pdf.subarray(0, 5).toString(), "%PDF-");
  assert.ok(pdf.length > 1500);
  const previa = await buildHoleritePdf({ ...dados, previa: true });
  assert.equal(previa.subarray(0, 5).toString(), "%PDF-");
  assert.match(AVISO_CONTADOR, /contador responsável/);
});
