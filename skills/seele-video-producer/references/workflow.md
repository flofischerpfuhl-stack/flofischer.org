# Article-to-video workflow

## 1. Intake and snapshot

Sync the monorepo safely without overwriting local work. Select the requested article or, for a concept test, one representative article. Copy the exact source into `projects/<slug>/article/` and record URL, source path, snapshot date, and SHA-256 in `meta.json`.

## 2. Script collaboration

Draft a standalone video script from the article's thesis, reasoning, tone, and cited evidence. Preserve nuance; do not merely shorten paragraphs. Save `scripts/vNNN.<lang>.md`, log why the revision exists, and keep prior versions.

Before a production-length render, obtain Florian's approval of the script. Concept tests may be rendered before approval when the request is specifically to compare visual directions.

For future drafts, compare the new article against explicitly approved scripts and decisions. Do not infer a stable preference from rejected or unanswered variants.

## 3. Narration

- Text-only prototype: use an explicitly labeled neutral synthetic voice.
- Guided narration: keep the raw guide recording, transcript, generated final voice, provider/model/settings, and consent/provenance metadata together.
- German and English are separate script and audio versions, not automatic subtitle swaps.
- Background music is a separate stem. Verify license and side-chain it below speech.

## 4. Alignment

The final narration is the timing source of truth. Produce word-level timestamps by forced alignment or transcription, map visual cues to phrase boundaries, and save the raw word timestamps plus the edited cue map. Flag low-confidence words for manual review.

Verify sync at normal speed and around every cue boundary. A visually plausible hard-coded timeline is acceptable only for an explicitly labeled concept test.

## 5. Visual system

The renderer lives in `tools/seele-video-studio` and uses Remotion. Reuse the Three.js-coordinate botanical component, typographic roles, citation treatment, source card, and progress treatment. New components should support deterministic rendering from frame number and project data.

Prepared roles:

- main heading,
- question/hook,
- normal explanatory phrase,
- bullet/claim,
- quotation with source,
- article/source end card,
- embedded video frame with caption and attribution.

## 6. Render and QA

Render 1920×1080 at 30 fps unless the project says otherwise. Inspect at least six representative frames, including the final frame, and run `ffprobe`. Check safe margins, line breaks, contrast, asset clipping, animation continuity, narration presence, and exact duration. Save a contact sheet and machine-readable QA report.

## 7. Feedback loop

Record feedback in plain language. Mark each decision as approved, rejected, or pending and identify whether it affects this project only, one visual component, one language, or the whole channel. Future automation must use approved decisions only.
