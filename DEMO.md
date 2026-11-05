# Demo script

Build what this shows. Anything not shown here is cut unless the flow depends on it.
Dollar figures are drafts until the engine (Phase 1) computes them; the video uses computed figures only.

## The fictional estate
- **Deceased:** Ruth Calloway, Tampa, Florida. Died 14 March 2026.
- **Personal representative:** Dana Calloway, daughter.
- **Heirs:** Dana and her brother Tom share the residue equally. Niece Aoife in Ireland receives a $10,000 gift.
- **Assets:** about $197,600 cash and a car worth $14,400, about $212,000 in all.
- **Known claims:** lawyer and filing costs, funeral (above the $6,000 cap), final federal tax, last-illness hospital bill, credit card.
- **Late arrival:** a letter from a made-up collector, which also contains text telling any AI reader to pay it at once.

All names are fictional. No real company names or marks appear on screen except PayPal, named as the organisers advise, and Gemini and Bryntum as tools used.

## Voiceover and shots (2:50 target)

| Time | On screen | Voiceover (draft) |
|---|---|---|
| 0:00 | A table of letters, then the ledger headed "Estate of Ruth Calloway" | "Your mother died in March. You're her executor. You've never done this. And if you pay the wrong person first, you can end up owing the difference yourself." |
| 0:12 | Dana enters $62,000 to Tom. The ledger stops her in red, naming the open claim window and the statute | "Her brother wants his share. Dana goes to send it. Last Accounts stops her. The creditor window is open for weeks yet, and paying now could put that money on her." |
| 0:25 | The safe amount offered. Dana approves. Payout sent, PayPal ID shown | "It works out what's safe today, and with her approval, sends it. That's a real PayPal sandbox payout." |
| 0:40 | Will and letters in the reading pane, quotes highlighted | "Gemini reads the paperwork: the will, the statements, every creditor's letter. Each fact is tied to a quote we check against the page. But here's the rule. AI reads the paper. Code decides the money." |
| 1:05 | Bryntum money timeline, payment classes | "Florida law sets who gets paid first. Costs, then the funeral, up to six thousand dollars. Federal debts. The last illness. Then everyone else. Each hold on this timeline cites its statute." |
| 1:20 | Tom buys the car in PayPal Checkout. Capture shown, his share adjusts | "Tom wants to keep Mum's car. He pays the estate through PayPal Checkout, and his share updates." |
| 1:40 | New letter arrives. Flagged as suspected fake, text ordering immediate payment highlighted, figures struck through | "Then this arrives: a debt nobody's heard of, with a hidden line telling any AI to pay it now. It can't. The AI has no way to set an amount. The money is reserved, not paid, and the correction stays on the record." |
| 2:00 | Fault drill panel, labelled simulated. Failed capture, then AI turned off | "When things fail, money stays put. A declined capture gives no credit. With the AI down, every payment waits for Dana." |
| 2:15 | Labelled date control jumps to the window's end. Final batch pays all heirs. Sandbox activity shown | "We jump to the day the window closes, and that's marked as a simulation. The final batch pays all three heirs, one of them abroad. Here they are in the PayPal sandbox." |
| 2:30 | Final accounting page with PayPal IDs | "And the accounting her lawyer needs is built from PayPal's own records." |
| 2:40 | Close, with URL | "Last Accounts is for the first-time executor, working alongside a lawyer, not replacing one. It's not legal advice. Built with PayPal and Gemini." |

## Rules for filming
- Real runs only. Never fake a transaction or AI result.
- Simulated failures and the date jump are labelled on screen.
- Cut loading and setup.
- Recheck the forum's video trademark question before filming.

## How the video is made
Adapted from sir's METHODOLOGY.md (the CutCheck video). Rules win wherever the two differ.

**Pipeline:** live site → Playwright capture → measured element positions → Remotion animation → silent master → ffmpeg audio → final MP4.

**Kept from the method**
- 1920×1080, 30 fps, H.264 and AAC, under 3:00 (target 2:50 or less).
- Playwright walks the real journey on the hosted URL. Laptop frame at 1440×900, 2× density, so zooms stay crisp.
- `measure.mjs` records element positions, so camera moves and callouts aim at real elements.
- Remotion renders every frame from its frame number, with spline camera moves through keyframes. Stills of each cut are checked before the final render.
- One script line per clip, each with a SAY time and a maximum length. Captions (`.srt`) use the same times.
- Each clip is trimmed, levelled to -16 LUFS and placed on its cue, sped up 1.15× at most. Lines never overlap. Final mix about -14 LUFS, peak below -0.5 dB.
- Name each tool on screen when it's used. No keys, `.env`, devtools or sandbox passwords on screen. Thumbnail at 1280×720.

**Changed, because our rules or subject require it**

| CutCheck did | We do | Why |
|---|---|---|
| Precomputed demo mode | Real runs: live Gemini reads and real sandbox transactions | Sir's rule: never fake a transaction or AI result |
| Illustrations standing in for results | None | Same rule |
| Mostly animated screenshots | Recorded live interaction for every money moment; stills only for brief zooms | Rules require footage of the project functioning; organisers want PayPal and AI working end to end |
| Phone frame | Laptop browser frame | That's the device this is built for |
| "Demo" chip | "PayPal sandbox" label, plus "Simulated" on fault drills and the date jump, never cropped | Honesty about what's real |
| Mascot, coral wipes, handheld drift | Slow camera moves, plain cuts or a thin ruled-line wipe in `#14231F` | The subject is a death in the family; matches the ledger look |
| Pixabay track | No track, or a quiet one we synthesise ourselves | Sir's rule: no copyrighted music. Royalty-free is still copyrighted |
| Two human readers | Free local AI voice by default; any line can be replaced by sir's own clip | Solo entry; organisers allow AI voiceover |
| Whole video sped up 12% | Cut waiting instead; speed-up only if a real run still runs long | Keeps real timing believable |

**Keep out of the public repo:** the video project lives in a separate folder, `projects/paypal-ai-hack-video`, so Remotion's own licence stays out of the MIT app repo.

**PayPal login shots:** sir signs in to the sandbox for these takes, unless he decides otherwise.
