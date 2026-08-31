# Project layout

```text
projects/<slug>/
  project.json
  article/
    source.<lang>.html
    meta.json
  scripts/
    v001.de.md
    v001.en.md
  feedback/
    decisions.md
  revisions.json
  alignment/
    words.<lang>.json
    cues.<lang>.json
  qa/
    report.json
    contact-sheet.jpg
```

`project.json` stores format, language variants, audio provenance, chosen design, and state. `revisions.json` is append-only. Article snapshots and script versions are immutable; create a new version rather than replacing an accepted one.

Generated media is kept outside Git. The project may store lightweight checksums and relative delivery paths to those files.
