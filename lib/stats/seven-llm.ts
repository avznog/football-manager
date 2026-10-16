/**
 * The LLM path of the équipes types (decision 204): OpenRouter, one paid model, and a validator that
 * does not believe a word of what comes back.
 *
 * `strict: true` on the wire is a guardrail, **not** a guarantee. `minItems` is unevenly enforced
 * across the providers behind one OpenRouter model id, `content` arrives as a JSON *string* that can
 * fail to parse, and a shirt number that exists in the team is not the same thing as a candidate who
 * is eligible for *this* seven. So everything the model says goes through `validateSevenAnswer`, which
 * is pure, and a failure is a typed value with a sentence that is safe to hand straight back to the
 * model on the one retry.
 *
 * The algorithmic seven stays where it is: this file never calls `solveSeven`. Choosing between the
 * cache, the model and the algorithm is the caller's job, because only the caller knows what the
 * screen already has on it.
 */

import type { BestSevenSlot } from "./best-seven";
import { candidateOrder } from "./best-seven";
import { buildSevenPrompt, sevenHandles } from "./seven-prompt";
import {
  assignmentToPicks,
  buildCells,
  type SevenCandidate,
  type SevenKind,
  type SevenResult,
} from "./sevens";

/* -------------------------------------------------------------------------- */
/* The wire                                                                   */
/* -------------------------------------------------------------------------- */

const ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";

/**
 * Pinned, and paid: $0.10 in / $0.40 out per million tokens, which is about $0.00042 a call — roughly
 * 24 000 sevens for $10, and the cache means the same squad is never asked twice. One path, no
 * free-tier fallback chain.
 *
 * It replaces `nvidia/nemotron-3-super-120b-a12b:free`, which failed the first live call: two invalid
 * sevens in a row and 53 seconds doing it. The lesson worth keeping is about the *flag*, not that
 * model — OpenRouter's model list advertises `structured_outputs` for it, and **the flag describes the
 * model, not the free endpoint serving it**. A free endpoint can ignore `response_format` entirely.
 * Do not trust that flag again when picking a model here.
 */
export const SEVEN_MODEL = "google/gemini-2.5-flash-lite";

/**
 * How long one attempt may hang before it is aborted, and how long both attempts may take together.
 *
 * This exists because of one incident: the previous model took **53 seconds** against a `maxDuration`
 * of 60, so the route was a few seconds from being killed by the platform — which the reader meets as
 * a crash rather than as the algorithm's seven. A fetch with no timeout has no ceiling of its own.
 *
 * **12 s an attempt.** Flash Lite answers this prompt in a second or two, so 12 s is five to ten times
 * the expected wait — long enough that a slow-but-working call is never cut off, short enough that a
 * hung one is given up on while there is still time to render something true.
 *
 * **24 s for the whole call**, because `solveSevenWithModel` retries once and two 12-second attempts
 * must not add up past the route's ceiling. Each attempt gets whatever is smaller: its own 12 s, or
 * what is left of the budget. With `maxDuration = 30` that leaves the reads, the DP and the render
 * their own margin.
 */
export const SEVEN_ATTEMPT_TIMEOUT_MS = 12_000;
export const SEVEN_TOTAL_TIMEOUT_MS = 24_000;

/** Seven slots, a sentence each and a summary — generous, but nowhere near a runaway. */
const MAX_TOKENS = 1200;

/** The five position codes the answer is keyed on, with how many each takes. */
const ANSWER_CODES = ["GB", "DC", "AIL", "MC", "AT"] as const;
type AnswerCode = (typeof ANSWER_CODES)[number];

const ANSWER_COUNTS: Readonly<Record<AnswerCode, number>> = { GB: 1, DC: 2, AIL: 2, MC: 1, AT: 1 };

export type SevenAnswer = {
  slots: Record<AnswerCode, number[]>;
  reasons: { shirt: number; why: string }[];
  summary: string;
};

/** The JSON schema sent as `response_format`, exactly as OpenRouter wants it. */
export function sevenResponseFormat() {
  const list = (count: number) => ({
    type: "array",
    items: { type: "integer" },
    minItems: count,
    maxItems: count,
  });
  return {
    type: "json_schema" as const,
    json_schema: {
      name: "seven",
      strict: true,
      schema: {
        type: "object",
        additionalProperties: false,
        required: ["slots", "reasons", "summary"],
        properties: {
          slots: {
            type: "object",
            additionalProperties: false,
            required: [...ANSWER_CODES],
            properties: Object.fromEntries(
              ANSWER_CODES.map((code) => [code, list(ANSWER_COUNTS[code])]),
            ),
          },
          reasons: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["shirt", "why"],
              properties: { shirt: { type: "integer" }, why: { type: "string" } },
            },
          },
          summary: { type: "string" },
        },
      },
    },
  };
}

/* -------------------------------------------------------------------------- */
/* The validator — pure                                                       */
/* -------------------------------------------------------------------------- */

export type SevenValidation =
  | { ok: true; answer: SevenAnswer; slotToCandidate: number[] }
  | { ok: false; reason: string };

function isIntegerArray(value: unknown): value is number[] {
  return Array.isArray(value) && value.every((entry) => Number.isInteger(entry));
}

/**
 * The model's answer as `slotToCandidate` (a candidate index per slot, in `slots` order), or a typed
 * failure whose `reason` is a sentence the model can be shown on the retry.
 *
 * `candidates` must be the array `cells` is indexed on — the `candidateOrder` sort, as `solveSeven`
 * does it. **The tie-break between two interchangeable slots is that array's order**: the men a code
 * was given are taken in candidate order (minutes descending, then shirt) and dropped into the slots
 * carrying that code in `slots` order. Deterministic, and it does not depend on the order the model
 * happened to list them in — two identical answers written in a different order give the same seven.
 */
export function validateSevenAnswer(
  answer: unknown,
  candidates: readonly SevenCandidate[],
  slots: readonly BestSevenSlot[],
): SevenValidation {
  if (typeof answer !== "object" || answer === null) {
    return { ok: false, reason: "La réponse n’est pas un objet JSON." };
  }
  const slotsField = (answer as { slots?: unknown }).slots;
  if (typeof slotsField !== "object" || slotsField === null) {
    return { ok: false, reason: "La réponse n’a pas de champ « slots »." };
  }

  const wanted = new Map<string, number>();
  for (const slot of slots) wanted.set(slot.positionCode, (wanted.get(slot.positionCode) ?? 0) + 1);

  const picked = new Map<AnswerCode, number[]>();
  for (const code of ANSWER_CODES) {
    const raw = (slotsField as Record<string, unknown>)[code];
    const expected = wanted.get(code) ?? 0;
    if (raw === undefined || raw === null) {
      if (expected === 0) {
        picked.set(code, []);
        continue;
      }
      return { ok: false, reason: `Le poste ${code} est absent de la réponse.` };
    }
    if (!isIntegerArray(raw)) {
      return { ok: false, reason: `Le poste ${code} doit être une liste de numéros entiers.` };
    }
    if (raw.length !== expected) {
      return {
        ok: false,
        reason: `Le poste ${code} demande ${expected} joueur(s) et la réponse en donne ${raw.length}.`,
      };
    }
    picked.set(code, raw);
  }

  const all = ANSWER_CODES.flatMap((code) => picked.get(code) ?? []);
  if (all.length !== slots.length) {
    return {
      ok: false,
      reason: `Il faut exactement ${slots.length} joueurs et la réponse en donne ${all.length}.`,
    };
  }
  const duplicate = all.find((shirt, index) => all.indexOf(shirt) !== index);
  if (duplicate !== undefined) {
    return { ok: false, reason: `Le numéro ${duplicate} est choisi deux fois : les sept doivent être différents.` };
  }

  const handles = sevenHandles(candidates);
  const indexOfHandle = new Map<number, number>();
  handles.forEach((handle, index) => indexOfHandle.set(handle, index));

  for (const shirt of all) {
    if (!indexOfHandle.has(shirt)) {
      return {
        ok: false,
        reason: `Le numéro ${shirt} n’est pas dans la liste des joueurs proposés : choisis uniquement parmi eux.`,
      };
    }
  }

  const goalkeeper = (picked.get("GB") ?? [])[0];
  if (goalkeeper !== undefined) {
    const candidate = candidates[indexOfHandle.get(goalkeeper) as number];
    if (candidate.gkMinutes <= 0) {
      return {
        ok: false,
        reason: `Le numéro ${goalkeeper} n’a jamais gardé : le gardien doit être quelqu’un qui a des minutes au goal.`,
      };
    }
  }

  // The tie-break: candidate order inside a code, slot order outside it.
  const queues = new Map<string, number[]>();
  for (const code of ANSWER_CODES) {
    queues.set(
      code,
      (picked.get(code) ?? []).map((shirt) => indexOfHandle.get(shirt) as number).sort((a, b) => a - b),
    );
  }
  const slotToCandidate = slots.map((slot) => {
    const queue = queues.get(slot.positionCode);
    const index = queue?.shift();
    return index === undefined ? -1 : index;
  });
  if (slotToCandidate.some((index) => index < 0)) {
    return { ok: false, reason: "La réponse ne couvre pas tous les postes de la formation." };
  }

  const reasons = (answer as { reasons?: unknown }).reasons;
  const summary = (answer as { summary?: unknown }).summary;
  return {
    ok: true,
    slotToCandidate,
    answer: {
      slots: Object.fromEntries(ANSWER_CODES.map((code) => [code, picked.get(code) ?? []])) as Record<
        AnswerCode,
        number[]
      >,
      reasons: Array.isArray(reasons)
        ? reasons
            .filter(
              (entry): entry is { shirt: number; why: string } =>
                typeof entry === "object" &&
                entry !== null &&
                Number.isInteger((entry as { shirt?: unknown }).shirt) &&
                typeof (entry as { why?: unknown }).why === "string",
            )
            .map((entry) => ({ shirt: entry.shirt, why: entry.why }))
        : [],
      summary: typeof summary === "string" ? summary : "",
    },
  };
}

/* -------------------------------------------------------------------------- */
/* The call                                                                   */
/* -------------------------------------------------------------------------- */

export type SevenModelDeps = {
  /** Injected so the tests never touch the network. */
  fetch?: typeof globalThis.fetch;
  apiKey?: string;
  model?: string;
  /** Injected so the timeout budget can be tested without waiting for it. Milliseconds. */
  now?: () => number;
};

export type SevenModelOutcome =
  | {
      ok: true;
      /** The same shape the algorithmic seven returns, so one screen reads either. */
      result: SevenResult;
      /** What the model wrote, for the screen: one sentence per shirt, plus a summary. */
      reasons: { shirt: number; why: string }[];
      summary: string;
      /** `response.model`: which model actually answered, which is not always the one asked for. */
      model: string;
      /** How many calls it took — 1, or 2 when the first answer was refused. */
      attempts: number;
    }
  | { ok: false; failure: "rateLimited"; status: number; message: string }
  | { ok: false; failure: "httpError"; status: number; message: string }
  /** The attempt was aborted on the timeout above. Its own failure: the screen words it differently. */
  | { ok: false; failure: "timedOut"; message: string }
  | { ok: false; failure: "invalidAnswer"; message: string }
  | { ok: false; failure: "noKey"; message: string };

type Message = { role: "system" | "user" | "assistant"; content: string };

type CallOutcome =
  | { ok: true; content: string; model: string }
  | { ok: false; failure: "rateLimited" | "httpError"; status: number; message: string }
  | { ok: false; failure: "timedOut"; message: string };

async function callOpenRouter(
  messages: readonly Message[],
  model: string,
  apiKey: string,
  doFetch: typeof globalThis.fetch,
  timeoutMs: number,
): Promise<CallOutcome> {
  // `AbortSignal.timeout` would read better, but a timer we own is a timer the tests can advance.
  // It is cleared only once the body has been read: a response whose stream never ends is as much a
  // hang as a request that never gets one.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.max(timeoutMs, 0));
  try {
    const response = await doFetch(ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://7orteils.bgonzva.fr",
        "X-Title": "Les 7 orteils de la main",
      },
      body: JSON.stringify({
        model,
        messages,
        // The same squad should give the same seven: nothing here is meant to be creative.
        temperature: 0,
        max_tokens: MAX_TOKENS,
        response_format: sevenResponseFormat(),
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      // A rate limit is not a bad answer, and the caller wants to tell them apart: one is worth
      // saying out loud (« réessaie dans un moment »), the other is worth falling back from.
      const failure = response.status === 429 ? "rateLimited" : "httpError";
      return { ok: false, failure, status: response.status, message: body.slice(0, 500) };
    }

    const payload: unknown = await response.json();
    const content = (payload as { choices?: { message?: { content?: unknown } }[] })?.choices?.[0]
      ?.message?.content;
    const answered = (payload as { model?: unknown })?.model;
    return {
      ok: true,
      content: typeof content === "string" ? content : "",
      model: typeof answered === "string" ? answered : model,
    };
  } catch (error) {
    // Only our own abort becomes `timedOut`. A DNS failure or a dropped socket is not a slow model,
    // and folding the two together would have the screen say something it does not know.
    if (controller.signal.aborted) {
      return { ok: false, failure: "timedOut", message: `No answer within ${timeoutMs} ms.` };
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

/** `content` is a JSON *string*: a parse failure is a bad answer, not a crash. */
function parseContent(content: string): { ok: true; value: unknown } | { ok: false; reason: string } {
  try {
    return { ok: true, value: JSON.parse(content) };
  } catch {
    return { ok: false, reason: "La réponse n’est pas du JSON valide. Renvoie uniquement l’objet demandé." };
  }
}

/**
 * The model's seven, as a `SevenResult`.
 *
 * One retry, and one only: the refused answer and the reason it was refused are appended to the
 * conversation, so the second attempt is told what was wrong rather than asked again blind. After
 * that it gives up and returns a typed failure — the caller chooses between the cache and the
 * algorithmic seven.
 *
 * Both attempts share one time budget (`SEVEN_TOTAL_TIMEOUT_MS`), so a retry cannot push the route
 * past its `maxDuration`. Running out of it is its own failure, `timedOut`, and never an `httpError`.
 */
export async function solveSevenWithModel(
  kind: SevenKind,
  input: { candidates: readonly SevenCandidate[]; slots: readonly BestSevenSlot[] },
  context: string,
  deps: SevenModelDeps = {},
): Promise<SevenModelOutcome> {
  const apiKey = deps.apiKey ?? process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    return { ok: false, failure: "noKey", message: "OPENROUTER_API_KEY is not set." };
  }
  const doFetch = deps.fetch ?? globalThis.fetch;
  const model = deps.model ?? SEVEN_MODEL;

  const candidates = [...input.candidates].sort(candidateOrder);
  const { slots } = input;
  const built = buildCells(kind, candidates, slots);
  const prompt = buildSevenPrompt(kind, candidates, built.cells, slots, context);

  const messages: Message[] = [
    { role: "system", content: prompt.system },
    { role: "user", content: prompt.user },
  ];

  // One budget for the whole call, so the retry cannot double the ceiling. `deps.now` is injected for
  // the tests only; nothing in the result depends on the clock.
  const now = deps.now ?? (() => Date.now());
  const startedAt = now();

  let lastReason = "";
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const left = SEVEN_TOTAL_TIMEOUT_MS - (now() - startedAt);
    const call = await callOpenRouter(
      messages,
      model,
      apiKey,
      doFetch,
      Math.min(SEVEN_ATTEMPT_TIMEOUT_MS, left),
    );
    if (!call.ok) {
      return call.failure === "timedOut"
        ? { ok: false, failure: "timedOut", message: call.message }
        : { ok: false, failure: call.failure, status: call.status, message: call.message };
    }

    const parsed = parseContent(call.content);
    const validation = parsed.ok
      ? validateSevenAnswer(parsed.value, candidates, slots)
      : ({ ok: false, reason: parsed.reason } as const);

    if (validation.ok) {
      const picks = assignmentToPicks(slots, candidates, built.cells, validation.slotToCandidate);
      return {
        ok: true,
        result: {
          kind,
          candidates,
          cells: built.cells,
          picks,
          outOfPositionCount: picks.filter((pick) => pick.player !== null && pick.fit === "none").length,
          keeperModel: built.keeperModel,
          keepersConsidered: built.keepersConsidered,
          keepersRefused: built.keepersRefused,
          ratingsModel: built.ratingsModel,
        },
        reasons: validation.answer.reasons,
        summary: validation.answer.summary,
        model: call.model,
        attempts: attempt,
      };
    }

    lastReason = validation.reason;
    if (attempt === 1) {
      messages.push({ role: "assistant", content: call.content });
      messages.push({
        role: "user",
        content: `Cette réponse est refusée : ${validation.reason} Corrige-la et renvoie uniquement l’objet JSON demandé.`,
      });
    }
  }

  return { ok: false, failure: "invalidAnswer", message: lastReason };
}
