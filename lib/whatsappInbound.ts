// lib/whatsappInbound.ts
// ─────────────────────────────────────────────────────────────────────────────
// Mensagens que o DONO manda de volta pro número da NexusFi (SOMENTE
// server-side), recebidas por app/api/webhooks/whatsapp:
//
//   • "paguei" / "paguei aluguel"  → baixa a conta a pagar ou imposto
//   • botão "Marcar como pago" do aviso de contas (payload PAGO)
//   • botão "Ver detalhes" (payload DETALHES)
//   • foto/PDF de nota ou comprovante → Claude lê, o dono confirma com "sim" e
//     vira lançamento no Fluxo de Caixa
//   • "quanto gastei com combustível este mês?" / "saldo"
//
// Quem pode: o número cadastrado em Configurações > WhatsApp (profile/
// whatsappAlerts.phoneE164) de uma conta Pro. Outros números são ignorados em
// silêncio. A baixa por aqui NÃO pede o PIN do app — a autenticação é o próprio
// número verificado do WhatsApp; fica carimbada como "WhatsApp".
//
// Estado da conversa (escolha pendente, confirmação de lançamento, contas do
// último aviso) fica em users/{uid}/profile/whatsappState. Mensagens já
// processadas, em users/{uid}/waMessages/{id} (a Meta reenvia em caso de lentidão).
// ─────────────────────────────────────────────────────────────────────────────

import crypto from "crypto";
import type { Firestore } from "firebase-admin/firestore";
import { CASHFLOW_CATEGORIES, isInvestmentMovement } from "@/lib/cashflowCategories";
import { billCashflowCategory } from "@/lib/billTaxSync";
import { brl, ownerHasPro } from "@/lib/ownerAlerts";
import { addDays, carregarAbertos, type Item } from "@/lib/ownerDigest";
import { todaySP } from "@/lib/receivableChargeSend";
import { downloadWhatsAppMedia, sendWhatsAppText } from "@/lib/whatsapp";

// ── Assinatura e leitura do payload ──────────────────────────────────────────

export function verifySignature(raw: string, header: string | null): boolean {
  const secret = process.env.WHATSAPP_APP_SECRET;
  if (!secret || !header?.startsWith("sha256=")) return false;
  const expected = crypto.createHmac("sha256", secret).update(raw).digest("hex");
  const got = header.slice(7);
  return got.length === expected.length && crypto.timingSafeEqual(Buffer.from(got), Buffer.from(expected));
}

export interface InboundMsg {
  id: string;
  from: string;
  type: "text" | "payload" | "media";
  text?: string;
  payload?: string;
  mediaId?: string;
  mimeType?: string;
}

export function extractMessages(body: unknown): InboundMsg[] {
  const out: InboundMsg[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const entry of (body as any)?.entry ?? []) {
    for (const change of entry?.changes ?? []) {
      for (const m of change?.value?.messages ?? []) {
        if (!m?.id || !m?.from) continue;
        const base = { id: String(m.id), from: String(m.from) };
        if (m.type === "text") out.push({ ...base, type: "text", text: String(m.text?.body ?? "") });
        else if (m.type === "button") out.push({ ...base, type: "payload", payload: String(m.button?.payload ?? "") });
        else if (m.type === "interactive" && m.interactive?.button_reply?.id)
          out.push({ ...base, type: "payload", payload: String(m.interactive.button_reply.id) });
        else if (m.type === "image") out.push({ ...base, type: "media", mediaId: m.image?.id, mimeType: m.image?.mime_type });
        else if (m.type === "document") out.push({ ...base, type: "media", mediaId: m.document?.id, mimeType: m.document?.mime_type });
      }
    }
  }
  return out;
}

// ── Utilidades ───────────────────────────────────────────────────────────────

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
const round2 = (n: number) => Math.round(n * 100) / 100;
const brDate = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
const PENDING_TTL = 30 * 60 * 1000;
const DAILY_MEDIA_LIMIT = 20;

const AJUDA =
  "Posso te ajudar com:\n" +
  "• *paguei* (ou *paguei aluguel*) — dou baixa na conta\n" +
  "• enviar a *foto de uma nota ou comprovante* — eu lanço no caixa\n" +
  "• *quanto gastei com combustível este mês?*\n" +
  "• *saldo*";

interface PendingEscolha { type: "escolha"; at: number; items: Item[] }
interface PendingLancar {
  type: "lancar";
  at: number;
  draft: { type: "entrada" | "saida"; description: string; amount: number; date: string; category: string };
}
interface WaState {
  pending?: PendingEscolha | PendingLancar | null;
  lastContas?: { at: number; items: Item[] };
  usage?: { date: string; media: number };
}

interface Ctx {
  db: Firestore;
  ownerUid: string;
  say: (t: string) => Promise<unknown>;
  setPending: (p: WaState["pending"]) => Promise<unknown>;
}

// ── Entrada principal ────────────────────────────────────────────────────────

export async function handleInbound(db: Firestore, msg: InboundMsg): Promise<void> {
  const ownerUid = await findOwner(db, msg.from);
  if (!ownerUid) return;

  try {
    await db.doc(`users/${ownerUid}/waMessages/${msg.id}`).create({ at: Date.now() });
  } catch {
    return; // já processada
  }

  const say = (t: string) => sendWhatsAppText(msg.from, t);
  const stateRef = db.doc(`users/${ownerUid}/profile/whatsappState`);
  const state = ((await stateRef.get()).data() ?? {}) as WaState;
  const pending = state.pending && Date.now() - state.pending.at < PENDING_TTL ? state.pending : null;
  const setPending = (p: WaState["pending"]) => stateRef.set({ pending: p }, { merge: true });
  const ctx: Ctx = { db, ownerUid, say, setPending };

  try {
    if (msg.type === "payload") {
      if (msg.payload === "PAGO") return void (await pagar(ctx, await contasDoUltimoAviso(db, ownerUid, state)));
      if (msg.payload === "DETALHES") return void (await detalhes(ctx, await contasDoUltimoAviso(db, ownerUid, state)));
      return void (await say(AJUDA));
    }

    if (msg.type === "media") return void (await lerComprovante(ctx, stateRef, state, msg));

    const text = norm(msg.text ?? "");

    // Respostas a uma pergunta que fizemos antes.
    if (pending?.type === "escolha" && /^\d{1,2}$/.test(text)) {
      const item = pending.items[Number(text) - 1];
      await setPending(null);
      return void (item ? await pagar(ctx, [item]) : await say("Não entendi o número. Mande *paguei* para recomeçar."));
    }
    if (pending?.type === "lancar") {
      if (/^(sim|s|confirmo|confirmar|ok|pode)$/.test(text)) {
        await setPending(null);
        const d = pending.draft;
        await db.collection(`users/${ownerUid}/cashflow`).add({
          type: d.type, description: d.description, category: d.category, amount: d.amount, date: d.date,
          note: "Lançado via WhatsApp", createdAt: Date.now(), createdBy: "whatsapp",
        });
        return void (await say(`Lançado: ${d.type === "saida" ? "saída" : "entrada"} de ${brl(d.amount)} (${d.description}) em ${brDate(d.date)}.`));
      }
      if (/^(nao|n|cancelar|cancela)$/.test(text)) {
        await setPending(null);
        return void (await say("Ok, não lancei nada."));
      }
    }

    const pagou = text.match(/^(?:eu )?(?:ja paguei|paguei|pago|dar baixa|baixa)\b\s*(?:a |o |as |os |da |do |de )?(.*)$/);
    if (pagou) return void (await pagarPorTexto(ctx, pagou[1]));
    if (/^saldo\b/.test(text)) return void (await saldo(ctx));
    if (/^quanto\b/.test(text)) return void (await consultar(ctx, text));
    await say(AJUDA);
  } catch (err) {
    console.error(`[whatsappInbound] erro (${ownerUid}):`, err);
    await say("Tive um problema para processar isso agora. Tente de novo em instantes.");
  }
}

/** Dono (conta Pro) cujo número cadastrado é `from`. */
async function findOwner(db: Firestore, from: string): Promise<string | null> {
  const snap = await db.collectionGroup("profile").where("phoneE164", "==", from).get();
  for (const d of snap.docs) {
    const ownerUid = d.ref.parent.parent?.id;
    if (d.id !== "whatsappAlerts" || !ownerUid) continue;
    if (await ownerHasPro(db, ownerUid)) return ownerUid;
  }
  return null;
}

// ── Baixa de contas ──────────────────────────────────────────────────────────

/** Contas do último aviso que continuam em aberto. */
async function contasDoUltimoAviso(db: Firestore, ownerUid: string, state: WaState): Promise<Item[]> {
  const itens = state.lastContas?.items ?? [];
  if (!itens.length || Date.now() - (state.lastContas?.at ?? 0) > 3 * 24 * 3600 * 1000) return [];
  const hoje = todaySP();
  const abertos = await carregarAbertos(db, ownerUid, addDays(hoje, -400), addDays(hoje, 400));
  const ids = new Set(abertos.pagar.map((i) => `${i.col}/${i.id}`));
  return itens.filter((i) => ids.has(`${i.col}/${i.id}`));
}

const linha = (i: Item) => `${i.nome} — ${brl(i.valor)}, vence ${brDate(i.dueDate)}`;

async function detalhes(ctx: Ctx, itens: Item[]) {
  if (!itens.length) return void (await ctx.say("Não há contas em aberto naquele aviso. Tudo em dia!"));
  await ctx.say("Contas em aberto:\n" + itens.map((i, n) => `${n + 1}) ${linha(i)}`).join("\n") + "\n\nResponda *paguei* para dar baixa.");
}

async function pagarPorTexto(ctx: Ctx, termo: string) {
  const hoje = todaySP();
  const abertos = (await carregarAbertos(ctx.db, ctx.ownerUid, addDays(hoje, -400), addDays(hoje, 30))).pagar;
  const t = norm(termo).replace(/[?!.]+$/, "");
  let achados = t
    ? abertos.filter((i) => norm(i.nome).includes(t) || t.includes(norm(i.nome)))
    : abertos.filter((i) => i.dueDate <= hoje);
  if (!t && !achados.length) achados = abertos.filter((i) => i.dueDate <= addDays(hoje, 3));
  achados.sort((a, b) => (a.dueDate < b.dueDate ? -1 : 1));
  if (!achados.length) {
    return void (await ctx.say(
      t ? `Não achei conta em aberto com "${termo.trim()}". Mande *paguei* sozinho para ver as que vencem.` : "Você não tem conta vencendo nem atrasada."
    ));
  }
  await pagar(ctx, achados);
}

/** 1 conta → baixa; várias → pergunta qual. */
async function pagar(ctx: Ctx, itens: Item[]) {
  if (!itens.length) return void (await ctx.say("Não achei conta em aberto para dar baixa."));
  if (itens.length > 1) {
    const lista = itens.slice(0, 8);
    await ctx.setPending({ type: "escolha", at: Date.now(), items: lista });
    return void (await ctx.say("Qual você pagou? Responda com o número:\n" + lista.map((i, n) => `${n + 1}) ${linha(i)}`).join("\n")));
  }
  await ctx.say(await baixar(ctx, itens[0]));
}

async function baixar({ db, ownerUid }: Ctx, item: Item): Promise<string> {
  if (!item.id || !item.col) return "Não consegui identificar essa conta.";
  const ref = db.doc(`users/${ownerUid}/${item.col}/${item.id}`);
  const snap = await ref.get();
  if (!snap.exists) return "Essa conta não existe mais.";
  const x = snap.data()!;
  if (x.status === "pago") return `${item.nome} já estava paga.`;

  const hoje = todaySP();
  const amount = Number(x.amount) || 0;
  await ref.update({
    status: "pago", paidAt: hoje, settledBy: "whatsapp", settledByName: "WhatsApp", settledAt: Date.now(), updatedAt: Date.now(),
  });

  // Lançamento espelho no caixa (mesma regra de lib/billTaxSync.ts).
  const isBill = item.col === "bills";
  const valor = isBill ? amount : round2(amount - (Number(x.amountPaid) || 0));
  if (valor > 0.005) {
    await db.collection(`users/${ownerUid}/cashflow`).add({
      type: "saida",
      description: isBill ? String(x.title ?? item.nome) : `Imposto: ${String(x.name ?? item.nome)}`,
      category: isBill ? billCashflowCategory(String(x.category ?? "")) : "Impostos",
      amount: valor,
      date: hoje,
      note: `${isBill ? "Conta a pagar" : "Imposto"} · baixa via WhatsApp`,
      [isBill ? "sourceBillId" : "sourceTaxId"]: item.id,
      createdAt: Date.now(),
    });
  }
  return `Pronto! Dei baixa em ${item.nome} (${brl(valor || amount)}) e lancei a saída no Fluxo de Caixa.`;
}

// ── Comprovante / nota → lançamento ──────────────────────────────────────────

async function lerComprovante(ctx: Ctx, stateRef: FirebaseFirestore.DocumentReference, state: WaState, msg: InboundMsg) {
  const hoje = todaySP();
  const usadas = state.usage?.date === hoje ? state.usage.media : 0;
  if (usadas >= DAILY_MEDIA_LIMIT) return void (await ctx.say("Você chegou no limite de leituras de hoje. Tente amanhã ou lance pelo painel."));
  if (!process.env.ANTHROPIC_API_KEY || !msg.mediaId) {
    return void (await ctx.say("A leitura de notas por aqui ainda não está ativada. Lance pelo painel."));
  }
  const mime = msg.mimeType ?? "image/jpeg";
  if (!/^image\/(jpeg|png|webp|gif)$/.test(mime) && mime !== "application/pdf") {
    return void (await ctx.say("Só consigo ler foto (JPG/PNG) ou PDF."));
  }

  await stateRef.set({ usage: { date: hoje, media: usadas + 1 } }, { merge: true });
  const media = await downloadWhatsAppMedia(msg.mediaId);
  if (!media) return void (await ctx.say("Não consegui baixar o arquivo. Pode enviar de novo?"));

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": process.env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 512,
      system:
        `Você lê notas fiscais, recibos e comprovantes brasileiros. Responda SOMENTE com JSON válido, sem markdown.\n` +
        `Formato: {"description":"o que foi (máx 40 chars)","amount":1234.56,"date":"YYYY-MM-DD","type":"saida"|"entrada","category":"uma das categorias"}\n` +
        `type: "saida" se é compra/pagamento, "entrada" se é venda/recebimento. Se não for um documento financeiro, responda {"error":"nao_e_documento"}.\n` +
        `Categorias de saída: ${CASHFLOW_CATEGORIES.saida.join(" | ")}\nCategorias de entrada: ${CASHFLOW_CATEGORIES.entrada.join(" | ")}`,
      messages: [{
        role: "user",
        content: [
          media.mimeType === "application/pdf"
            ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: media.base64 } }
            : { type: "image", source: { type: "base64", media_type: media.mimeType, data: media.base64 } },
          { type: "text", text: "Extraia os dados deste documento." },
        ],
      }],
    }),
  });
  if (!res.ok) return void (await ctx.say("Não consegui ler o documento agora. Tente de novo mais tarde."));

  const data = (await res.json()) as { content?: { text?: string }[] };
  let parsed: Record<string, unknown> | null;
  try {
    parsed = JSON.parse((data.content ?? []).map((c) => c.text ?? "").join("").replace(/```json|```/g, "").trim());
  } catch {
    parsed = null;
  }
  const amount = round2(Number(parsed?.amount));
  if (!parsed || parsed.error || !(amount > 0) || !isFinite(amount)) {
    return void (await ctx.say("Não consegui identificar o valor nesse documento. Envie uma foto mais nítida ou lance pelo painel."));
  }
  const type: "entrada" | "saida" = parsed.type === "entrada" ? "entrada" : "saida";
  const draft = {
    type,
    description: String(parsed.description ?? "").trim().slice(0, 60) || (type === "saida" ? "Despesa" : "Receita"),
    amount,
    date: /^\d{4}-\d{2}-\d{2}$/.test(String(parsed.date)) ? String(parsed.date) : hoje,
    category: CASHFLOW_CATEGORIES[type].includes(String(parsed.category)) ? String(parsed.category) : type === "saida" ? "Outros gastos" : "Outros recebimentos",
  };
  await ctx.setPending({ type: "lancar", at: Date.now(), draft });
  await ctx.say(
    `Entendi: ${type === "saida" ? "saída" : "entrada"} de ${brl(amount)} — ${draft.description} (${draft.category}), em ${brDate(draft.date)}.\n` +
    `Responda *sim* para lançar no Fluxo de Caixa ou *não* para cancelar.`
  );
}

// ── Consultas ────────────────────────────────────────────────────────────────

async function lerCaixa(db: Firestore, ownerUid: string) {
  const snap = await db.collection(`users/${ownerUid}/cashflow`).select("type", "amount", "date", "category", "description").get();
  return snap.docs.map((d) => d.data());
}

async function saldo(ctx: Ctx) {
  const fluxo = await lerCaixa(ctx.db, ctx.ownerUid);
  const total = round2(fluxo.reduce((s, x) => s + (x.type === "entrada" ? 1 : -1) * (Number(x.amount) || 0), 0));
  await ctx.say(`Saldo atual do Fluxo de Caixa: ${brl(total)}.`);
}

async function consultar(ctx: Ctx, text: string) {
  const m = text.match(
    /^quanto (?:eu )?(gastei|paguei|recebi|vendi|ganhei|entrou|saiu)\s*(?:com|em|de|no|na|nos|nas|do|da|a|o)?\s*(.*?)\s*(hoje|(?:nesta|nessa|esta|essa) semana|semana passada|(?:neste|nesse|este|esse) mes|mes passado|no mes|(?:neste|nesse|este|esse) ano)?\s*\??$/
  );
  if (!m) return void (await ctx.say("Não entendi a pergunta. Exemplo: *quanto gastei com combustível este mês?*"));
  const [, verbo, termoRaw, periodo = "este mes"] = m;
  const tipo = /gastei|paguei|saiu/.test(verbo) ? "saida" : "entrada";
  const termo = termoRaw.trim();

  const hoje = todaySP();
  const dow = new Date(`${hoje}T12:00:00Z`).getUTCDay();
  const segundaDe = (iso: string) => addDays(iso, -((new Date(`${iso}T12:00:00Z`).getUTCDay() + 6) % 7));
  let de = `${hoje.slice(0, 7)}-01`; let ate = hoje; let rotulo = "este mês";
  if (periodo === "hoje") { de = hoje; rotulo = "hoje"; }
  else if (/semana passada/.test(periodo)) { de = addDays(segundaDe(hoje), -7); ate = addDays(de, 6); rotulo = "na semana passada"; }
  else if (/semana/.test(periodo)) { de = segundaDe(hoje); rotulo = "esta semana"; }
  else if (/mes passado/.test(periodo)) { ate = addDays(`${hoje.slice(0, 7)}-01`, -1); de = `${ate.slice(0, 7)}-01`; rotulo = "no mês passado"; }
  else if (/ano/.test(periodo)) { de = `${hoje.slice(0, 4)}-01-01`; rotulo = "este ano"; }
  void dow;

  const fluxo = (await lerCaixa(ctx.db, ctx.ownerUid)).filter((x) => {
    const d = String(x.date ?? "").slice(0, 10);
    if (x.type !== tipo || d < de || d > ate) return false;
    const cat = String(x.category ?? ""), desc = String(x.description ?? "");
    if (!termo) return !isInvestmentMovement(cat, desc);
    return norm(`${cat} ${desc}`).includes(norm(termo));
  });
  const total = round2(fluxo.reduce((s, x) => s + (Number(x.amount) || 0), 0));
  const oQue = termo ? ` com ${termo}` : "";
  await ctx.say(
    fluxo.length
      ? `${tipo === "saida" ? "Você gastou" : "Você recebeu"} ${brl(total)}${oQue} ${rotulo} (${fluxo.length} ${fluxo.length === 1 ? "lançamento" : "lançamentos"}).`
      : `Não encontrei lançamentos${oQue} ${rotulo}.`
  );
}
