#!/usr/bin/env python3
"""Generate the bilingual Seele article shells."""

from pathlib import Path
import subprocess


ROOT = Path(__file__).resolve().parents[1]
POSTS = ROOT / "sites/seele/posts"
DISCLAIMERS = ROOT / "sites/shared/seele/disclaimers"


def render_markdown(path: Path) -> str:
    if not path.exists():
        return ""
    return subprocess.run(
        [
            "pandoc",
            str(path),
            "-f",
            "markdown+raw_html",
            "-t",
            "html5",
            "--wrap=none",
        ],
        check=True,
        capture_output=True,
        text=True,
    ).stdout.strip()


def disclaimer_template(slug: str) -> str:
    english = render_markdown(DISCLAIMERS / "en" / f"{slug}.md")
    german = render_markdown(DISCLAIMERS / "de" / f"{slug}.md")
    if not english and not german:
        return ""
    return f"""<template data-disclaimer-template>
          <details class="article-disclaimer">
            <summary>
              <span class="disclaimer-icon" aria-hidden="true">!</span>
              <span data-lang-copy="en">Editorial note</span>
              <span data-lang-copy="de">Redaktioneller Hinweis</span>
              <span class="disclaimer-toggle" aria-hidden="true"></span>
            </summary>
            <div class="disclaimer-copy">
              <div data-lang-copy="en">{english}</div>
              <div data-lang-copy="de">{german}</div>
            </div>
          </details>
        </template>"""

ARTICLES = [
    {
        "file": "gottesbeweise.html",
        "slug": "gottesbeweise",
        "title_en": "Proving God",
        "title_de": "Gottesbeweise",
        "type_en": "Lecture",
        "type_de": "Vortrag",
        "description_en": "A critical survey of the Kalam, moral, teleological, Thomistic, contingency, ontological and Resurrection arguments for God.",
        "description_de": "Eine kritische Untersuchung des Kalam-, Moral-, teleologischen, thomistischen, Kontingenz-, ontologischen und Auferstehungsarguments für Gott.",
        "og_image": "https://seele.flofischer.org/shared/seele/article-images/william-lane-craig.webp",
        "og_image_alt": "William Lane Craig during a debate about the existence of God.",
        "version": "v0.1",
    },
    {
        "file": "fsspx-verteidigung.html",
        "slug": "fsspx",
        "title_en": "Defense of the SSPX and Its Episcopal Consecrations",
        "title_de": "Verteidigung der FSSPX und ihrer Bischofsweihen",
        "type_en": "Ecclesiology",
        "type_de": "Ekklesiologie",
        "description_en": "An extensive defense of the SSPX, its critique of modernism and Vatican II, and the canonical case surrounding the 1988 episcopal consecrations.",
        "description_de": "Eine ausführliche Verteidigung der FSSPX, ihrer Kritik an Modernismus und Zweitem Vatikanum sowie der kirchenrechtlichen Bewertung der Bischofsweihen von 1988.",
        "og_image": "https://seele.flofischer.org/shared/seele/article-images/flavio-pace.jpg",
        "og_image_alt": "Archbishop Flavio Pace in a church interior.",
        "version": "v0.1",
    },
    {
        "file": "eucharistische-wunder.html",
        "slug": "eucharist",
        "title_en": "Eucharistic Miracles",
        "title_de": "Eucharistische Wunder",
        "type_en": "Lecture",
        "type_de": "Vortrag",
        "description_en": "An examination of the historical and scientific evidence surrounding the Eucharistic miracles of Lanciano, Tixtla, Sokółka and Legnica.",
        "description_de": "Eine Untersuchung der historischen und wissenschaftlichen Evidenz zu den eucharistischen Wundern von Lanciano, Tixtla, Sokółka und Legnica.",
        "og_image": "https://seele.flofischer.org/shared/seele/article-images/eucharist/media/image1.jpg",
        "og_image_alt": "Dr Odoardo Linoli, who examined the Eucharistic miracle of Lanciano.",
        "version": "v0.1",
    },
    {
        "file": "vorsehung-freier-wille.html",
        "slug": "providence",
        "title_en": "Providence and Free Will",
        "title_de": "Vorsehung und freier Wille",
        "type_en": "Philosophy",
        "type_de": "Philosophie",
        "description_en": "How divine foreknowledge, providence and human freedom can coexist, from Boethius and Thomism to Molinism and open theism.",
        "description_de": "Wie göttliches Vorherwissen, Vorsehung und menschliche Freiheit zusammenbestehen können — von Boethius und Thomismus bis Molinismus und offenem Theismus.",
        "version": "v0.1",
    },
    {
        "file": "antwort-christian-wagner.html",
        "slug": "wagner-response",
        "title_en": "Must One Submit to a Null Sentence?",
        "title_de": "Muss man sich einem nichtigen Urteil unterwerfen?",
        "type_en": "Response",
        "type_de": "Replik",
        "description_en": "A canonical and theological response to Christian B. Wagner on the SSPX, excommunication, null sentences and obedience.",
        "description_de": "Eine kirchenrechtliche und theologische Antwort an Christian B. Wagner über FSSPX, Exkommunikation, nichtige Urteile und Gehorsam.",
        "version": "v0.1",
    },
]

PAGE = """<!DOCTYPE html>
<html lang="en" data-design="3" data-language="en" data-pwa-site="seele">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
  <meta
    name="description"
    content="{description_en}"
    data-description-en="{description_en}"
    data-description-de="{description_de}"
  />
  <meta name="theme-color" content="#eee8da" />
  <meta name="application-name" content="Seele" />
  <meta name="apple-mobile-web-app-capable" content="yes" />
  <meta name="apple-mobile-web-app-status-bar-style" content="default" />
  <meta name="apple-mobile-web-app-title" content="Seele" />
  <link rel="canonical" href="https://seele.flofischer.org/posts/{file}" />
  <meta property="og:type" content="article" />
  <meta property="og:site_name" content="Seele" />
  <meta property="og:title" content="{title_en}" />
  <meta property="og:description" content="{description_en}" />
  <meta property="og:url" content="https://seele.flofischer.org/posts/{file}" />
  <meta property="article:author" content="Florian Fischer" />
  <meta property="article:section" content="{type_en}" />
{social_image_meta}
  <meta name="twitter:card" content="{twitter_card}" />
  <meta name="twitter:title" content="{title_en}" />
  <meta name="twitter:description" content="{description_en}" />
{twitter_image_meta}
  <title>{title_en} — Seele</title>
  <script src="/shared/language.js"></script>
  <link rel="stylesheet" href="/shared/designs/base.css" />
  <link rel="stylesheet" href="/shared/seele/seele.css?v=8" />
  <link rel="manifest" href="/manifest.webmanifest" />
  <link rel="icon" type="image/png" sizes="32x32" href="/icons/favicon-32.png" />
  <link rel="icon" type="image/png" sizes="16x16" href="/icons/favicon-16.png" />
  <link rel="apple-touch-icon" sizes="180x180" href="/icons/apple-touch-icon.png" />
</head>
<body
  class="realm-seele"
  data-title-en="{title_en} — Seele"
  data-title-de="{title_de} — Seele"
>
  <div class="page shell">
    <header class="site-header">
      <a class="mark" href="../">Seele</a>
      <nav>
        <a class="hub-link" href="https://flofischer.org/" data-local="/__root/">
          <span data-lang-copy="en">← Back to Hub</span>
          <span data-lang-copy="de">← Zurück zum Hub</span>
        </a>
        <div class="language-switch" role="group" aria-label="Language / Sprache">
          <button type="button" data-language-button="en" aria-pressed="true">EN</button>
          <span aria-hidden="true">/</span>
          <button type="button" data-language-button="de" aria-pressed="false">DE</button>
        </div>
      </nav>
    </header>

    <div class="issue-bar">
      <a class="all-articles-link" href="../">
        <span data-lang-copy="en">← All articles</span>
        <span data-lang-copy="de">← Alle Artikel</span>
      </a>
      <label class="version-switcher">
        <span data-lang-copy="en">Version</span>
        <span data-lang-copy="de">Fassung</span>
        <select data-version-select aria-label="Article version / Artikelfassung">
          {version_options}
        </select>
      </label>
    </div>

    <main class="article-page">
      <article class="article article--reader">
        <aside class="article-toc" id="article-contents" aria-label="Article contents / Artikelinhalt">
          <div class="article-toc-heading">
            <p>
            <span data-lang-copy="en">Contents</span>
            <span data-lang-copy="de">Inhalt</span>
            </p>
            <button type="button" class="article-toc-close" data-toc-close data-label-en="Close contents" data-label-de="Inhaltsverzeichnis schließen" aria-label="Close contents">×</button>
          </div>
          <nav data-article-toc aria-label="Article contents"></nav>
        </aside>
        <div
          class="article-content"
          data-content-host
          data-content-src-en="/shared/seele/content/en/{slug}.html"
          data-content-src-de="/shared/seele/content/de/{slug}.html"
          aria-live="polite"
        >
          <p class="article-loading">
            <span data-lang-copy="en">Setting the type…</span>
            <span data-lang-copy="de">Text wird gesetzt…</span>
          </p>
        </div>
{disclaimer_html}
      </article>
    </main>

    <button class="article-toc-backdrop" type="button" data-toc-backdrop aria-label="Close contents" hidden></button>
    <div class="reader-dock" data-reader-dock>
      <button type="button" class="reader-dock-button reader-dock-toc" data-toc-toggle aria-controls="article-contents" aria-expanded="false" data-label-en="Open contents" data-label-de="Inhaltsverzeichnis öffnen" aria-label="Open contents">
        <span aria-hidden="true">≡</span>
      </button>
      <div class="reader-progress" role="progressbar" aria-label="Reading progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0" data-reader-progress>
        <span data-reader-progress-bar></span>
        <output data-reader-progress-label>0%</output>
      </div>
      <button type="button" class="reader-dock-button" data-scroll-top data-label-en="Back to top" data-label-de="Nach oben" aria-label="Back to top">
        <span aria-hidden="true">↑</span>
      </button>
    </div>

    <footer class="site-footer">
      <span>seele.flofischer.org</span>
      <a href="../"><span data-lang-copy="en">All articles</span><span data-lang-copy="de">Alle Artikel</span></a>
    </footer>
  </div>
  <script src="/shared/seele/seele.js?v=4"></script>
  <script src="/shared/pwa.js" defer></script>
</body>
</html>
"""


for article in ARTICLES:
    article["disclaimer_html"] = disclaimer_template(article["slug"])
    social_image = article.get("og_image", "https://seele.flofischer.org/social-preview.jpg")
    social_alt = article.get("og_image_alt", f'{article["title_en"]} — Seele')
    article["social_image_meta"] = (
        f'<meta property="og:image" content="{social_image}" />\n'
        f'  <meta property="og:image:alt" content="{social_alt}" />'
    )
    article["twitter_card"] = "summary_large_image"
    article["twitter_image_meta"] = (
        f'<meta name="twitter:image" content="{social_image}" />\n'
        f'  <meta name="twitter:image:alt" content="{social_alt}" />'
    )

    options = [
        (
            f'<option value="{article["version"]}" data-latest data-label-en="Latest · {article["version"]}" '
            f'data-label-de="Aktuell · {article["version"]}" '
            f'data-src-en="/shared/seele/content/en/{article["slug"]}-{article["version"]}.html" '
            f'data-src-de="/shared/seele/content/de/{article["slug"]}-{article["version"]}.html">'
            f'Latest · {article["version"]}</option>'
        )
    ]
    if article.get("legacy"):
        options.append(
            f'<option value="legacy" data-label-en="Earlier draft" data-label-de="Frühere Fassung" '
            f'data-src-en="/shared/seele/content/en/{article["slug"]}-legacy.html" '
            f'data-src-de="/shared/seele/content/de/{article["slug"]}-legacy.html">Earlier draft</option>'
        )
    article["version_options"] = "\n          ".join(options)
    (POSTS / article["file"]).write_text(PAGE.format(**article), encoding="utf-8")
    print(f"sites/seele/posts/{article['file']}")
