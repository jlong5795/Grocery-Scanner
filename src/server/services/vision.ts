import "server-only";

import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import * as z from "zod/v4";

import { env } from "~/env";
import type { RawDetection } from "~/server/domain/inventory";

/**
 * Per-photo item detection (spec section 5), the analog of yard-sale's
 * frameAnalysisSchema agent. One Claude call per photo, structured output
 * validated against a Zod schema.
 */

const detectionSchema = z.object({
  items: z.array(
    z.object({
      fingerprint: z
        .string()
        .describe("brand + product name + variant, lowercase, no size/quantity/condition"),
      name: z.string().describe("human-readable product name, e.g. 'Jif Creamy Peanut Butter'"),
      brand: z.string().nullable(),
      category: z
        .string()
        .nullable()
        .describe("e.g. 'canned goods', 'dairy', 'frozen vegetables', 'condiments'"),
      confidence: z.number().describe("0 to 1"),
      boundingBox: z.object({
        xMin: z.number(),
        yMin: z.number(),
        xMax: z.number(),
        yMax: z.number(),
      }),
    }),
  ),
});

const SYSTEM_PROMPT = `You catalog groceries in household storage photos (pantry shelves, cabinets, fridge, freezer) so a family can tell what they've run out of.

For each photo, list the distinct grocery products you can identify.

- Prefer a high-precision shortlist over exhaustive detection. Omit items you are unsure about rather than guessing; a wrong item pollutes an inventory the family relies on for months. Only include items with confidence of at least 0.70.
- fingerprint is a stable identity for the product: brand + product name + distinguishing variant (flavor, style), lowercase, with no package size, quantity, price or condition. Two jars of the same peanut butter share a fingerprint; creamy and crunchy do not.
- When the user message lists fingerprints already in the household catalog and an item is the same product, reuse that exact fingerprint.
- If the brand isn't legible, describe the product generically ("store brand white rice") and lower your confidence accordingly.
- Ignore people, hands, pets, appliances, kitchenware, and anything that isn't a grocery or household consumable. Cleaning supplies and paper goods count when they're stored with food.
- Ignore papers, mail, calendars and artwork visible in the frame.
- boundingBox is normalized to 0-1000 on each axis, with (0,0) at the top-left.`;

let client: Anthropic | undefined;
function getClient() {
  client ??= new Anthropic();
  return client;
}

export interface PhotoInput {
  index: number;
  bytes: Buffer;
  mediaType: "image/jpeg" | "image/png";
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/** Turn API failures into messages the scan screen can show a person. */
function friendlyError(err: unknown): Error {
  if (err instanceof Anthropic.AuthenticationError) {
    return new Error("Item recognition isn't set up: the server's Anthropic API key is invalid.");
  }
  if (err instanceof Anthropic.RateLimitError) {
    return new Error("Item recognition is busy right now. Try again in a minute.");
  }
  if (err instanceof Anthropic.APIConnectionError) {
    return new Error("Couldn't reach the item recognition service. Check the connection and try again.");
  }
  if (err instanceof Anthropic.APIError) {
    return new Error(`Item recognition failed (${err.status ?? "error"}). Try again.`);
  }
  return err instanceof Error ? err : new Error("Item recognition failed.");
}

export async function detectItemsInPhoto(
  photo: PhotoInput,
  knownFingerprints: readonly string[],
): Promise<RawDetection[]> {
  if (!env.ANTHROPIC_API_KEY) {
    throw new Error("Item recognition isn't set up: ANTHROPIC_API_KEY is missing on the server.");
  }
  try {
    return await detect(photo, knownFingerprints);
  } catch (err) {
    throw friendlyError(err);
  }
}

async function detect(
  photo: PhotoInput,
  knownFingerprints: readonly string[],
): Promise<RawDetection[]> {
  const catalogNote =
    knownFingerprints.length > 0
      ? `Fingerprints already in the household catalog:\n${knownFingerprints.map((f) => `- ${f}`).join("\n")}`
      : "The household catalog is empty so far.";

  const response = await getClient().beta.messages.parse({
    model: env.VISION_MODEL,
    max_tokens: 16000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: {
              type: "base64",
              media_type: photo.mediaType,
              data: photo.bytes.toString("base64"),
            },
          },
          { type: "text", text: `${catalogNote}\n\nList the grocery items in this photo.` },
        ],
      },
    ],
    output_config: { format: betaZodOutputFormat(detectionSchema) },
  });

  if (response.stop_reason === "refusal") {
    throw new Error("The vision model declined to analyze this photo.");
  }
  if (!response.parsed_output) {
    throw new Error(`Vision response could not be parsed (stop_reason: ${response.stop_reason}).`);
  }

  return response.parsed_output.items.map((item) => ({
    photoIndex: photo.index,
    fingerprint: item.fingerprint,
    name: item.name,
    brand: item.brand,
    category: item.category,
    confidence: clamp(item.confidence, 0, 1),
    boundingBox: {
      xMin: clamp(Math.round(item.boundingBox.xMin), 0, 1000),
      yMin: clamp(Math.round(item.boundingBox.yMin), 0, 1000),
      xMax: clamp(Math.round(item.boundingBox.xMax), 0, 1000),
      yMax: clamp(Math.round(item.boundingBox.yMax), 0, 1000),
    },
  }));
}
