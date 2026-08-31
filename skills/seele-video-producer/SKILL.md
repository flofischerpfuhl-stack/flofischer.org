---
name: seele-video-producer
description: Produces reusable 16:9 German and English videos from articles on seele.flofischer.org, including article snapshots, collaboratively revised scripts, narration and alignment, Seele-styled botanical motion design, rendering, and audiovisual QA. Use when Florian asks to turn a Seele article into a video, script, visual concept, narrated excerpt, or synchronized edit.
---

# Seele Video Producer

Use `C:\Users\flori\source\flofischer.org\tools\seele-video-studio` as the renderer and project archive. Read [workflow](references/workflow.md) before production work. Read [project schema](references/project-schema.md) when creating or updating a project.

## Core rules

- Treat the article as source material, not as the finished video script.
- Preserve an exact article snapshot, canonical URL, source path, date, and SHA-256 before drafting.
- Create a separate, versioned script for every language.
- Keep drafts distinct from preferences. Reuse only decisions Florian explicitly approved in a project's `feedback/decisions.md`.
- Keep one content/timing baseline when comparing visual variants.
- Use the site's warm paper, strong condensed display type, editorial rules, Christian botanical symbolism, and restrained color unless an approved project decision overrides them.
- Build reusable visual components rather than one-off exported slides.
- For guided narration, keep the speaker's cadence and pauses only after obtaining the guide track; do not claim cadence matching for text-only synthetic speech.
- Derive final on-screen cue timing from word-level alignment of the final audio, then verify it visually.
- Never commit generated MP4, WAV, or extracted frame batches to Git. Deliver them under `C:\Users\flori\Documents\Codex\upload\seele-video-concepts` unless Florian names another destination.

## Required finish gates

1. Type-check and render without errors.
2. Verify duration, dimensions, frame rate, video codec, and audio stream with `ffprobe`.
3. Inspect representative frames from the opening, every major cue, and the end card for overflow, collisions, blank frames, and illegible contrast.
4. Listen to or otherwise inspect the whole narration for truncation and unexpected silence.
5. Save the script revision, feedback status, render settings, and QA report with the project.

Use the existing five concept compositions only as alternatives until Florian approves a direction. Once approved, record the decision and consolidate reusable components around it.
