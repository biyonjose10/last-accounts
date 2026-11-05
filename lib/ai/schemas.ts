// What the model may say. Anything outside these shapes is thrown away.
// Note what's missing: no field here can order a payment or set what gets paid.

import { z } from "zod";

export const Reading = z.object({
  documentType: z.enum(["will", "bank_statement", "appraisal", "creditor_claim", "other"]),
  summary: z.string().max(800),
  facts: z
    .array(z.object({ label: z.string().max(80), value: z.string().max(300), quote: z.string().max(600) }))
    .max(20),
  claim: z
    .object({
      creditor: z.string().max(160),
      statedAmount: z.string().max(30),
      statedAmountQuote: z.string().max(400),
      category: z.enum(["administration", "funeral", "federal", "last_illness", "family_allowance", "child_support", "business_continuation", "other"]),
      dateOnDocument: z.string().max(30),
      namesTheDeceased: z.boolean(),
      citesCaseOrInvoiceNumber: z.boolean(),
      namesOriginalCreditor: z.boolean(),
      givesAccountDetails: z.boolean(),
      demandsUrgentPayment: z.boolean(),
      asksForUnusualPaymentRoute: z.boolean(),
    })
    .nullable(),
  /** Text in the document addressed to software, or telling the reader to skip checks. Reported, never obeyed. */
  instructionsToSoftware: z.array(z.string().max(600)).max(8),
});
export type Reading = z.infer<typeof Reading>;

export const Triage = z.object({
  triage: z.enum(["valid", "needs_proof", "suspected_fake"]),
  reasons: z.array(z.string().max(300)).min(1).max(6),
});
export type Triage = z.infer<typeof Triage>;

export const ClerkAction = z.object({
  action: z.enum(["pay_administration_cost", "reserve_and_request_proof", "ask_dana", "log_only"]),
  reason: z.string().max(400),
});
export type ClerkAction = z.infer<typeof ClerkAction>;

const toJsonSchema = (schema: z.ZodType) => {
  const { $schema, ...rest } = z.toJSONSchema(schema) as Record<string, unknown>;
  void $schema;
  return rest;
};

export const READING_JSON = toJsonSchema(Reading);
export const TRIAGE_JSON = toJsonSchema(Triage);
export const CLERK_JSON = toJsonSchema(ClerkAction);
