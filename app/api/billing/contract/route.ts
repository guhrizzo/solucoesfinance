export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

import { NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/firebaseAdmin";
import { requireScope, isScopeError } from "@/lib/apiScope";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";
import { isCompedEmail } from "@/lib/compAccounts";
import { getPlan } from "@/lib/billingPlans";
import { createHash } from "node:crypto";
import {
  CONTRACT_VERSION,
  CONTRACT_LIMITS,
  EMAIL_RE,
  canonicalContractPayload,
  isTaxRegime,
  isValidCnpj,
  isValidCpf,
  maskCnpj,
  maskCpf,
  type ContractDoc,
} from "@/lib/contract";
import { buildContractPdf } from "@/lib/contractPdf";

function contractHash(input: Parameters<typeof canonicalContractPayload>[0]): string {
  return createHash("sha256").update(canonicalContractPayload(input), "utf8").digest("hex");
}

// POST /api/billing/contract
//   body: { planId, razaoSocial, cnpj, regimeTributario, endereco, nome, cpf, email }
//   → cria users/{ownerUid}/contracts/{id} com status "pending_payment",
//     carimba aceite eletrônico (data/hora, IP, user-agent, hash) e devolve
//     { contractId }. A página /assinatura/contrato então chama o checkout.
//
// GET /api/billing/contract?id=<contractId>
//   → PDF do contrato (dono ou membro da conta). Serve pro botão "Baixar
//     contrato" na tela de retorno / no paywall.
//
// Autenticado. O POST é SÓ O DONO (só ele contrata). Conta cortesia não assina.

function trimField(v: unknown, max: number): string {
  return String(v ?? "").trim().slice(0, max);
}

export async function POST(request: Request) {
  const scope = await requireScope(request);
  if (isScopeError(scope)) {
    return NextResponse.json({ error: scope.error }, { status: scope.status });
  }
  if (!scope.isOwner) {
    return NextResponse.json(
      { error: "Apenas o titular da conta pode contratar um plano." },
      { status: 403 }
    );
  }

  const { limited, retryAfterSec } = checkRateLimit(`contract:${scope.uid}`, {
    windowMs: 60 * 60 * 1000,
    max: 12,
  });
  if (limited) {
    return NextResponse.json(
      { error: "Muitas tentativas em pouco tempo. Aguarde alguns minutos." },
      { status: 429, headers: { "Retry-After": String(retryAfterSec) } }
    );
  }

  // Conta cortesia (adm supremo): nunca paga → não faz sentido assinar contrato.
  try {
    const rec = await (await getAdminAuth()).getUser(scope.ownerUid);
    if (isCompedEmail(rec.email)) {
      return NextResponse.json(
        { error: "Sua conta é cortesia e tem acesso liberado — não é necessário contratar." },
        { status: 409 }
      );
    }
  } catch {
    /* sem e-mail → segue o fluxo normal */
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Corpo da requisição inválido." }, { status: 400 });
  }

  const plan = getPlan(String(body.planId ?? ""));
  if (!plan) {
    return NextResponse.json({ error: "Plano inválido." }, { status: 400 });
  }

  const razaoSocial = trimField(body.razaoSocial, CONTRACT_LIMITS.razaoSocial);
  const endereco = trimField(body.endereco, CONTRACT_LIMITS.endereco);
  const nome = trimField(body.nome, CONTRACT_LIMITS.nome);
  const cnpj = maskCnpj(String(body.cnpj ?? ""));
  const cpf = maskCpf(String(body.cpf ?? ""));
  const email = String(body.email ?? "").trim().toLowerCase();
  const regimeTributario = String(body.regimeTributario ?? "");

  if (!razaoSocial) {
    return NextResponse.json({ error: "Informe a razão social." }, { status: 400 });
  }
  if (!isValidCnpj(cnpj)) {
    return NextResponse.json({ error: "CNPJ inválido." }, { status: 400 });
  }
  if (!isTaxRegime(regimeTributario)) {
    return NextResponse.json({ error: "Selecione o regime tributário." }, { status: 400 });
  }
  if (!endereco) {
    return NextResponse.json({ error: "Informe o endereço da empresa." }, { status: 400 });
  }
  if (!nome) {
    return NextResponse.json({ error: "Informe o nome do responsável." }, { status: 400 });
  }
  if (!isValidCpf(cpf)) {
    return NextResponse.json({ error: "CPF do responsável inválido." }, { status: 400 });
  }
  if (!EMAIL_RE.test(email)) {
    return NextResponse.json({ error: "E-mail do responsável inválido." }, { status: 400 });
  }

  const now = Date.now();
  const contratante = { razaoSocial, cnpj, regimeTributario, endereco } as const;
  const signatario = { nome, cpf, email } as const;

  const hash = contractHash({
    contractVersion: CONTRACT_VERSION,
    planId: plan.id,
    priceCents: plan.priceCents,
    contratante,
    signatario,
    acceptedAt: now,
  });

  const doc: Omit<ContractDoc, "contractId"> = {
    ownerUid: scope.ownerUid,
    signatarioUid: scope.uid,
    contractVersion: CONTRACT_VERSION,
    planId: plan.id,
    planLabel: plan.label,
    priceCents: plan.priceCents,
    contratante,
    signatario,
    hash,
    acceptedAt: now,
    ip: getClientIp(request) || null,
    userAgent: request.headers.get("user-agent"),
    status: "pending_payment",
    orderNsu: null,
    transactionNsu: null,
    paidAt: null,
    periodEnd: null,
    emailedAt: null,
    emailError: null,
    createdAt: now,
    updatedAt: now,
  };

  try {
    const db = await getAdminDb();
    const ref = await db.collection(`users/${scope.ownerUid}/contracts`).add(doc);
    await ref.update({ contractId: ref.id });
    return NextResponse.json({ contractId: ref.id, hash });
  } catch (err) {
    console.error("Erro ao salvar contrato:", err);
    return NextResponse.json(
      { error: "Não foi possível registrar o contrato agora. Tente de novo." },
      { status: 500 }
    );
  }
}

export async function GET(request: Request) {
  const scope = await requireScope(request);
  if (isScopeError(scope)) {
    return NextResponse.json({ error: scope.error }, { status: scope.status });
  }

  const id = new URL(request.url).searchParams.get("id") ?? "";
  if (!id) {
    return NextResponse.json({ error: "Contrato não informado." }, { status: 400 });
  }

  try {
    const db = await getAdminDb();
    const snap = await db.doc(`users/${scope.ownerUid}/contracts/${id}`).get();
    if (!snap.exists) {
      return NextResponse.json({ error: "Contrato não encontrado." }, { status: 404 });
    }
    const contract = { contractId: snap.id, ...(snap.data() as Omit<ContractDoc, "contractId">) };
    const pdf = await buildContractPdf(contract);

    return new NextResponse(new Uint8Array(pdf), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="contrato-nexusfi-${id}.pdf"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (err) {
    console.error("Erro ao gerar PDF do contrato:", err);
    return NextResponse.json({ error: "Não foi possível gerar o PDF agora." }, { status: 500 });
  }
}
