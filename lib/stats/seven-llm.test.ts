import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { BestSevenSlot } from "./best-seven";
import {
  SEVEN_ATTEMPT_TIMEOUT_MS,
  SEVEN_MODEL,
  SEVEN_TOTAL_TIMEOUT_MS,
  solveSevenWithModel,
  validateSevenAnswer,
  type SevenAnswer,
} from "./seven-llm";
import type { SevenCandidate } from "./sevens";

/* The fixture style of `sevens.test.ts`. */

function slot(id: string, positionCode: string): BestSevenSlot {
  return { id, positionCode, isGoalkeeper: positionCode === "GB" };
}

function player(overrides: Partial<SevenCandidate> & { displayName: string; jerseyNumber: number }): SevenCandidate {
  const base: SevenCandidate = {
    id: `id-${overrides.displayName}`,
    displayName: overrides.displayName,
    jerseyNumber: overrides.jerseyNumber,
    minutes: 0,
    goals: 0,
    assists: 0,
    cleanMinutes: 0,
    gkMinutes: 0,
    gkCleanMinutes: 0,
    ratingAverage: null,
    ratingCount: 0,
    ratingVariance: null,
    declarations: {},
    outfieldMinutes: 0,
    concededOutfield: 0,
    concededWhileGk: 0,
    positions: [],
  };
  const merged = { ...base, ...overrides };
  if (overrides.outfieldMinutes === undefined) merged.outfieldMinutes = merged.minutes - merged.gkMinutes;
  return merged;
}

const SLOTS = [
  slot("gb", "GB"),
  slot("dc1", "DC"),
  slot("dc2", "DC"),
  slot("ail1", "AIL"),
  slot("ail2", "AIL"),
  slot("mc", "MC"),
  slot("at", "AT"),
];

/**
 * Eight men, shirts 1–8. Minutes descend with the shirt, so `candidateOrder`'s sort is shirt order and
 * the candidate indices in the assertions are shirt − 1.
 */
function squad(): SevenCandidate[] {
  return [
    player({ displayName: "Gardien", jerseyNumber: 1, minutes: 800, gkMinutes: 800, concededWhileGk: 9, declarations: { GB: "primary" } }),
    player({ displayName: "DC a", jerseyNumber: 2, minutes: 700, declarations: { DC: "primary" } }),
    player({ displayName: "DC b", jerseyNumber: 3, minutes: 600, declarations: { DC: "primary" } }),
    player({ displayName: "AIL a", jerseyNumber: 4, minutes: 500, goals: 4, declarations: { AIL: "primary" } }),
    player({ displayName: "AIL b", jerseyNumber: 5, minutes: 400, goals: 2, declarations: { AIL: "primary" } }),
    player({ displayName: "MC", jerseyNumber: 6, minutes: 300, declarations: { MC: "primary" } }),
    player({ displayName: "AT", jerseyNumber: 7, minutes: 200, goals: 6, declarations: { AT: "primary" } }),
    player({ displayName: "Remplaçant", jerseyNumber: 8, minutes: 100, declarations: { AT: "secondary" } }),
  ];
}

const goodAnswer: SevenAnswer = {
  slots: { GB: [1], DC: [3, 2], AIL: [5, 4], MC: [6], AT: [7] },
  reasons: [{ shirt: 7, why: "Il marque le plus souvent." }],
  summary: "Un sept qui attaque.",
};

describe("validateSevenAnswer", () => {
  it("accepts a well-formed answer and maps it onto the slots", () => {
    const result = validateSevenAnswer(goodAnswer, squad(), SLOTS);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // Candidate indices, in slot order: shirts 1, 2, 3, 4, 5, 6, 7.
    expect(result.slotToCandidate).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(result.answer.summary).toBe("Un sept qui attaque.");
  });

  it("breaks the tie between two interchangeable slots deterministically, whatever the order written", () => {
    const first = validateSevenAnswer(goodAnswer, squad(), SLOTS);
    const reordered = validateSevenAnswer(
      { ...goodAnswer, slots: { ...goodAnswer.slots, DC: [2, 3], AIL: [4, 5] } },
      squad(),
      SLOTS,
    );
    const again = validateSevenAnswer(goodAnswer, squad(), SLOTS);
    expect(first.ok && reordered.ok && again.ok).toBe(true);
    if (!first.ok || !reordered.ok || !again.ok) return;
    expect(reordered.slotToCandidate).toEqual(first.slotToCandidate);
    expect(again.slotToCandidate).toEqual(first.slotToCandidate);
  });

  it("refuses six picks", () => {
    const result = validateSevenAnswer(
      { ...goodAnswer, slots: { ...goodAnswer.slots, AIL: [5] } },
      squad(),
      SLOTS,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toContain("AIL");
  });

  it("refuses eight picks", () => {
    const result = validateSevenAnswer(
      { ...goodAnswer, slots: { ...goodAnswer.slots, AT: [7, 8] } },
      squad(),
      SLOTS,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toContain("AT");
  });

  it("refuses a DC list with one entry", () => {
    const result = validateSevenAnswer(
      { ...goodAnswer, slots: { ...goodAnswer.slots, DC: [2], MC: [6], AT: [7] } },
      squad(),
      SLOTS,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toContain("DC demande 2");
  });

  it("refuses a duplicated shirt", () => {
    const result = validateSevenAnswer(
      { ...goodAnswer, slots: { ...goodAnswer.slots, DC: [2, 2] } },
      squad(),
      SLOTS,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toContain("deux fois");
  });

  it("refuses a shirt nobody wears", () => {
    const result = validateSevenAnswer(
      { ...goodAnswer, slots: { ...goodAnswer.slots, AT: [99] } },
      squad(),
      SLOTS,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toContain("99");
  });

  it("refuses a shirt that exists but is not an eligible candidate", () => {
    // Shirt 8 is a real player, left out of the candidates offered for this seven.
    const eligible = squad().filter((candidate) => candidate.jerseyNumber !== 8);
    const result = validateSevenAnswer(
      { ...goodAnswer, slots: { ...goodAnswer.slots, AT: [8] } },
      eligible,
      SLOTS,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toContain("proposés");
  });

  it("refuses a goalkeeper who has never kept goal", () => {
    const result = validateSevenAnswer(
      { ...goodAnswer, slots: { GB: [8], DC: [3, 2], AIL: [5, 4], MC: [6], AT: [7] } },
      squad(),
      SLOTS,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toContain("jamais gardé");
  });

  it("refuses something that is not the answer at all", () => {
    for (const bad of [null, "nope", 7, [], { reasons: [], summary: "" }]) {
      const result = validateSevenAnswer(bad, squad(), SLOTS);
      expect(result.ok, JSON.stringify(bad)).toBe(false);
    }
  });

  it("tolerates missing reasons and summary rather than losing the seven over them", () => {
    const result = validateSevenAnswer({ slots: goodAnswer.slots }, squad(), SLOTS);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.answer.reasons).toEqual([]);
    expect(result.answer.summary).toBe("");
  });
});

/* -------------------------------------------------------------------------- */
/* The call                                                                   */
/* -------------------------------------------------------------------------- */

function reply(content: unknown, model = SEVEN_MODEL) {
  return {
    ok: true,
    status: 200,
    json: async () => ({ model, choices: [{ message: { content: typeof content === "string" ? content : JSON.stringify(content) } }] }),
    text: async () => "",
  } as unknown as Response;
}

function errorReply(status: number, body = "slow down") {
  return {
    ok: false,
    status,
    json: async () => ({}),
    text: async () => body,
  } as unknown as Response;
}

const input = { candidates: squad(), slots: SLOTS };

describe("solveSevenWithModel", () => {
  it("never touches the network, and returns a SevenResult whose picks are the model's", async () => {
    const network = vi.spyOn(globalThis, "fetch");
    const fetcher = vi.fn(async () => reply(goodAnswer));
    const outcome = await solveSevenWithModel("offensive", input, "", {
      fetch: fetcher as unknown as typeof fetch,
      apiKey: "test-key",
    });
    expect(network).not.toHaveBeenCalled();
    network.mockRestore();

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.result.picks.map((pick) => pick.player?.jerseyNumber)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(outcome.result.picks[0].cell?.figure).toBe("keeperConceded");
    expect(outcome.summary).toBe("Un sept qui attaque.");
    expect(outcome.model).toBe(SEVEN_MODEL);
    expect(outcome.attempts).toBe(1);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("reads back the model that actually answered", async () => {
    const fetcher = vi.fn(async () => reply(goodAnswer, "some/other-model:free"));
    const outcome = await solveSevenWithModel("notes", input, "", {
      fetch: fetcher as unknown as typeof fetch,
      apiKey: "k",
    });
    expect(outcome.ok && outcome.model).toBe("some/other-model:free");
  });

  it("retries once on an invalid answer, and the retry carries the reason", async () => {
    const fetcher = vi
      .fn<(url: string, init: RequestInit) => Promise<Response>>()
      .mockResolvedValueOnce(reply({ ...goodAnswer, slots: { ...goodAnswer.slots, DC: [2] } }))
      .mockResolvedValueOnce(reply(goodAnswer));
    const outcome = await solveSevenWithModel("defensive", input, "", {
      fetch: fetcher as unknown as typeof fetch,
      apiKey: "k",
    });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.attempts).toBe(2);
    expect(fetcher).toHaveBeenCalledTimes(2);
    const body = JSON.parse(String(fetcher.mock.calls[1][1].body)) as { messages: { content: string }[] };
    expect(body.messages).toHaveLength(4);
    expect(body.messages[3].content).toContain("DC demande 2");
  });

  it("gives up after the one retry, as a typed invalid answer", async () => {
    const fetcher = vi.fn(async () => reply("pas du json {"));
    const outcome = await solveSevenWithModel("offensive", input, "", {
      fetch: fetcher as unknown as typeof fetch,
      apiKey: "k",
    });
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.failure).toBe("invalidAnswer");
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("reports a 429 as a rate limit, not as a bad answer, and does not retry it", async () => {
    const fetcher = vi.fn(async () => errorReply(429));
    const outcome = await solveSevenWithModel("offensive", input, "", {
      fetch: fetcher as unknown as typeof fetch,
      apiKey: "k",
    });
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.failure).toBe("rateLimited");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("reports any other non-2xx distinctly", async () => {
    const fetcher = vi.fn(async () => errorReply(502, "bad gateway"));
    const outcome = await solveSevenWithModel("offensive", input, "", {
      fetch: fetcher as unknown as typeof fetch,
      apiKey: "k",
    });
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.failure).toBe("httpError");
    if (outcome.failure !== "httpError") return;
    expect(outcome.status).toBe(502);
    expect(outcome.message).toContain("bad gateway");
  });

  it("says so rather than calling anything when there is no key", async () => {
    const fetcher = vi.fn(async () => reply(goodAnswer));
    const outcome = await solveSevenWithModel("offensive", input, "", {
      fetch: fetcher as unknown as typeof fetch,
      apiKey: "",
    });
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.failure).toBe("noKey");
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("sends the pinned model, temperature 0, the strict schema and the OpenRouter headers", async () => {
    const fetcher = vi.fn<(url: string, init: RequestInit) => Promise<Response>>(async () => reply(goodAnswer));
    await solveSevenWithModel("legende", input, "Coupe, on joue serré.", {
      fetch: fetcher as unknown as typeof fetch,
      apiKey: "k",
    });
    const [url, init] = fetcher.mock.calls[0];
    expect(url).toBe("https://openrouter.ai/api/v1/chat/completions");
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer k");
    expect(headers["HTTP-Referer"]).toBe("https://7orteils.bgonzva.fr");
    expect(headers["X-Title"]).toBe("Les 7 orteils de la main");
    const body = JSON.parse(String(init.body)) as {
      model: string;
      temperature: number;
      max_tokens: number;
      response_format: { json_schema: { strict: boolean; schema: { properties: { slots: { properties: Record<string, { minItems: number }> } } } } };
      messages: { role: string; content: string }[];
    };
    // Written out rather than compared to the constant: the point of this line is to notice the pin
    // moving. No `:free` suffix — see the comment on `SEVEN_MODEL`.
    expect(body.model).toBe("google/gemini-2.5-flash-lite");
    expect(body.temperature).toBe(0);
    expect(body.max_tokens).toBeGreaterThan(0);
    expect(body.response_format.json_schema.strict).toBe(true);
    const slotsSchema = body.response_format.json_schema.schema.properties.slots.properties;
    expect([slotsSchema.GB.minItems, slotsSchema.DC.minItems, slotsSchema.AIL.minItems, slotsSchema.MC.minItems, slotsSchema.AT.minItems]).toEqual([1, 2, 2, 1, 1]);
    expect(body.messages.map((message) => message.role)).toEqual(["system", "user"]);
    expect(body.messages[1].content).toContain("Coupe, on joue serré.");
  });
});

/* -------------------------------------------------------------------------- */
/* The timeout                                                                */
/* -------------------------------------------------------------------------- */

/**
 * A fetch that never answers, and rejects the way a real one does once the signal is aborted. Nothing
 * here waits: the clock is Vitest's and it is advanced by hand.
 */
function hangingFetch() {
  return vi.fn(
    (_url: string, init: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init.signal?.addEventListener("abort", () => {
          reject(new DOMException("The operation was aborted.", "AbortError"));
        });
      }),
  );
}

describe("solveSevenWithModel, when the model hangs", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("aborts the attempt on the timeout and reports it as its own failure", async () => {
    const fetcher = hangingFetch();
    const pending = solveSevenWithModel("offensive", input, "", {
      fetch: fetcher as unknown as typeof fetch,
      apiKey: "k",
    });
    const init = fetcher.mock.calls[0][1];
    expect(init.signal?.aborted).toBe(false);

    await vi.advanceTimersByTimeAsync(SEVEN_ATTEMPT_TIMEOUT_MS);
    const outcome = await pending;

    expect(init.signal?.aborted).toBe(true);
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    // The distinction the screen depends on: « trop de temps » is not « n'a pas répondu ».
    expect(outcome.failure).toBe("timedOut");
    expect(outcome.failure).not.toBe("httpError");
    expect("status" in outcome).toBe(false);
    // A hang is not retried: there is nothing to tell the model it got wrong.
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("holds on until the timeout rather than giving up early", async () => {
    const fetcher = hangingFetch();
    const pending = solveSevenWithModel("notes", input, "", {
      fetch: fetcher as unknown as typeof fetch,
      apiKey: "k",
    });
    let settled = false;
    void pending.then(() => {
      settled = true;
    });

    await vi.advanceTimersByTimeAsync(SEVEN_ATTEMPT_TIMEOUT_MS - 1);
    expect(settled).toBe(false);

    await vi.advanceTimersByTimeAsync(1);
    await pending;
    expect(settled).toBe(true);
  });

  it("spends one budget across the retry, so two attempts cannot outlast the ceiling", async () => {
    // The first attempt answers badly after 11 s, which earns the retry; the second never answers.
    let clock = 0;
    const fetcher = vi
      .fn<(url: string, init: RequestInit) => Promise<Response>>()
      .mockImplementationOnce(async () => {
        clock = 11_000;
        return reply("pas du json {");
      })
      .mockImplementationOnce((_url, init) => {
        return new Promise<Response>((_resolve, reject) => {
          init.signal?.addEventListener("abort", () => {
            reject(new DOMException("The operation was aborted.", "AbortError"));
          });
        });
      });

    const pending = solveSevenWithModel("defensive", input, "", {
      fetch: fetcher as unknown as typeof fetch,
      apiKey: "k",
      now: () => clock,
    });

    // Whatever the second attempt is allowed, it is over by the time the budget is: advancing only
    // what is left of `SEVEN_TOTAL_TIMEOUT_MS` is enough to settle it.
    await vi.advanceTimersByTimeAsync(SEVEN_TOTAL_TIMEOUT_MS - 11_000);
    const outcome = await pending;
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.failure).toBe("timedOut");
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("gives the second attempt only what is left of the budget", async () => {
    let clock = 0;
    const fetcher = vi
      .fn<(url: string, init: RequestInit) => Promise<Response>>()
      .mockImplementationOnce(async () => {
        // A first attempt that very nearly ate the lot: 1 s remains, not another full 12.
        clock = SEVEN_TOTAL_TIMEOUT_MS - 1_000;
        return reply("pas du json {");
      })
      .mockImplementationOnce((_url, init) => {
        return new Promise<Response>((_resolve, reject) => {
          init.signal?.addEventListener("abort", () => {
            reject(new DOMException("The operation was aborted.", "AbortError"));
          });
        });
      });

    const pending = solveSevenWithModel("legende", input, "", {
      fetch: fetcher as unknown as typeof fetch,
      apiKey: "k",
      now: () => clock,
    });

    await vi.advanceTimersByTimeAsync(1_000);
    const outcome = await pending;
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.failure).toBe("timedOut");
  });
});
