# Video quotes and reactions

Use the reusable video-frame component in `tools/seele-video-studio/src/VideoQuoteFrame.tsx` for quoted clips and reactions.

## Intake

- Record the canonical video URL, channel/creator, title, publication date, retrieval date, quoted time range, and reason the excerpt is necessary.
- Keep the source clip and any transcoded proxy outside Git. Preserve SHA-256 and exact in/out times.
- Use clips only when the user supplied or authorized the source and the intended quotation/reaction is lawful. Do not bypass access controls or download restrictions.

## Visual behavior

- Present the excerpt as an integrated Seele editorial object rather than an unstyled browser rectangle.
- Animate the play/pause control as a physical press. On pause, use a restrained VHS frame-hold treatment: short horizontal scan noise, tiny chromatic separation, and minimal jitter.
- Keep the effect subordinate to legibility. Disable moving pause noise while important subtitles or citations are being read if contrast suffers.
- Fit the frame into the same depth system as other assets; it may pass behind a heading and in front of supporting copy when the composition remains readable.
- Keep source identification available in the frame caption or project citation treatment as required for editorial clarity and the specific source.

## Audio and timing

- Keep quoted audio on its own stem. Duck it below narration unless the quoted voice is the current focus.
- Derive play, pause, and resume states from the final cue map. Verify every button state and audio boundary at normal speed.
- Do not use a generic VHS loop that ignores the actual pause state; the hold begins only when the clip pauses and clears on resume.
