#!/usr/bin/env python3
"""Generate the bilingual Seele article shells."""

from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
POSTS = ROOT / "sites/seele/posts"

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
        "og_image": "https://seele.flofischer.org/shared/seele/article-images/william-lane-craig.png",
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
        "file": "aliens-katholizismus.html",
        "slug": "aliens",
        "title_en": "Aliens and Catholicism",
        "title_de": "Aliens und Katholizismus",
        "type_en": "Essay",
        "type_de": "Essay",
        "description_en": "What the Fermi paradox, Drake equation, abiogenesis and extraterrestrial intelligence could mean for Catholic theology.",
        "description_de": "Was Fermi-Paradoxon, Drake-Gleichung, Abiogenese und außerirdische Intelligenz für die katholische Theologie bedeuten könnten.",
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

DISCLAIMER_TEMPLATES = {
    "fsspx": """<template data-disclaimer-template>
          <details class="article-disclaimer">
            <summary>
              <span class="disclaimer-icon" aria-hidden="true">!</span>
              <span data-lang-copy="en">Editorial note</span>
              <span data-lang-copy="de">Redaktioneller Hinweis</span>
              <span class="disclaimer-toggle" aria-hidden="true"></span>
            </summary>
            <div class="disclaimer-copy">
              <div data-lang-copy="en"><p>This essay was written before the July 1 consecrations in order to prepare myself intellectually for the consecrations and to be sure they were actually the right thing to do. The text is currently under review by SSPX and non-SSPX priests; however, they have not yet had time to finish their review. I have chosen to publish it anyway because I think it can help further the discussion and help other faithful of the SSPX, like myself, who find themselves in anguish because of the recent excommunications, not only of the bishops but also of the laity who formally adhere to the SSPX.</p>
<p>The text will probably contain some errors. I hope it will be read in charity, and I am open and grateful for any factual corrections. If the text is too harsh at points, I hope the reader can excuse that and focus on the content of the claims I am making. This is not an official SSPX document. The text was formatted and translated from German into English using AI.</p>
<p>I want to mention again that the document will probably contain some errors; it was written to the best of my knowledge. I am an SSPX faithful who “formally adheres” and am certainly not comfortable being excommunicated, even if unjustly. If somebody can show me where my thinking is wrong, I am completely open to changing my position. Currently, I would not even know what to confess in order to have my excommunication lifted.</p></div>
              <div data-lang-copy="de"><p>Dieser Aufsatz wurde vor den Weihen vom 1. Juli verfasst, um mich intellektuell auf die Weihen vorzubereiten und mich zu vergewissern, dass sie tatsächlich das Richtige waren. Der Text wird derzeit von Priestern innerhalb und außerhalb der FSSPX geprüft; sie hatten jedoch noch nicht die Zeit, diese Prüfung abzuschließen. Ich habe mich dennoch zur Veröffentlichung entschlossen, weil der Text meines Erachtens die Diskussion weiterbringen und anderen Gläubigen der FSSPX helfen kann, die sich – wie ich – wegen der jüngsten Exkommunikationen in Gewissensnot befinden. Das betrifft nicht nur die Bischöfe, sondern auch die Laien, die der FSSPX förmlich anhängen.</p>
<p>Der Text wird wahrscheinlich einige Fehler enthalten. Ich hoffe, dass er wohlwollend gelesen wird, und bin für sachliche Korrekturen offen und dankbar. Sollte der Text stellenweise zu scharf formuliert sein, bitte ich darum, dies zu entschuldigen und sich auf den Inhalt meiner Aussagen zu konzentrieren. Dies ist kein offizielles Dokument der FSSPX. Die englische Fassung wurde mithilfe von KI aus dem Deutschen übersetzt und formatiert.</p>
<p>Ich möchte noch einmal darauf hinweisen, dass das Dokument wahrscheinlich einige Fehler enthält; es wurde nach bestem Wissen verfasst. Ich bin ein Gläubiger, der der FSSPX „förmlich anhängt“, und fühle mich keineswegs wohl damit, exkommuniziert zu sein – selbst wenn die Exkommunikation ungerecht ist. Wenn mir jemand zeigen kann, wo mein Denken falsch ist, bin ich uneingeschränkt bereit, meine Position zu ändern. Derzeit wüsste ich nicht einmal, was ich beichten sollte, um die Exkommunikation aufheben zu lassen.</p></div>
            </div>
          </details>
        </template>""",
    "wagner-response": """<template data-disclaimer-template>
          <details class="article-disclaimer">
            <summary>
              <span class="disclaimer-icon" aria-hidden="true">!</span>
              <span data-lang-copy="en">Editorial note</span>
              <span data-lang-copy="de">Redaktioneller Hinweis</span>
              <span class="disclaimer-toggle" aria-hidden="true"></span>
            </summary>
            <div class="disclaimer-copy">
              <div data-lang-copy="en"><p>This essay is a response to Christian B. Wagner’s article <a href="https://thomism.com/p/invalid-sacraments-excommunications">“Invalid Sacraments, Excommunications, and the SSPX”</a> of July 2, 2026.[1] It builds on my <a href="https://substack.com/home/post/p-205027723">“Defense of the FSSPX and Its Episcopal Consecrations”</a>,[2] which I will reference rather than repeat.</p>
<p>I found Wagner’s article genuinely helpful. His distinctions between schism and excommunication, and between the ways an excommunication can be unjust, are clear and, as far as I can tell, correct. My disagreement is localized: his argument passes over the actual canonical defense of the SSPX at its decisive point, and the passage of St. Thomas he relies on contains, within itself, the very exception the SSPX invokes.</p>
<p>As with my defense: this text represents my position to the best of my current knowledge, and I am open, indeed grateful, to be shown where my thinking is wrong. I am an SSPX faithful who “formally adheres,” and I am not comfortable being excommunicated, even unjustly. Where a counter-argument against my position is serious, I have named it as such instead of hiding it. If somebody can close the gaps I point out at the end, I will change my position.</p></div>
              <div data-lang-copy="de"><p>Dieser Aufsatz ist eine Antwort auf Christian B. Wagners Artikel <a href="https://thomism.com/p/invalid-sacraments-excommunications">„Invalid Sacraments, Excommunications, and the SSPX“</a> vom 2. Juli 2026.[1] Er baut auf meiner <a href="https://substack.com/home/post/p-205027723">„Verteidigung der FSSPX und ihrer Bischofsweihen“</a>[2] auf, auf die ich verweisen werde, statt ihre Argumente zu wiederholen.</p>
<p>Ich fand Wagners Artikel wirklich hilfreich. Seine Unterscheidungen zwischen Schisma und Exkommunikation sowie zwischen den verschiedenen Arten, auf die eine Exkommunikation ungerecht sein kann, sind klar und – soweit ich es beurteilen kann – richtig. Meine Meinungsverschiedenheit ist eng begrenzt: Sein Argument übergeht an der entscheidenden Stelle die eigentliche kirchenrechtliche Verteidigung der FSSPX; zugleich enthält die von ihm herangezogene Stelle des heiligen Thomas selbst genau jene Ausnahme, auf die sich die FSSPX beruft.</p>
<p>Wie schon bei meiner Verteidigung gilt: Dieser Text gibt meine Position nach bestem gegenwärtigen Wissen wieder. Ich bin offen und sogar dankbar dafür, wenn mir gezeigt wird, wo mein Denken falsch ist. Ich bin ein Gläubiger der FSSPX, der ihr „förmlich anhängt“, und ich fühle mich nicht wohl damit, exkommuniziert zu sein – auch nicht ungerechterweise. Wo ein Gegenargument ernst zu nehmen ist, benenne ich es, statt es zu verstecken. Wenn jemand die am Ende aufgezeigten Lücken schließen kann, werde ich meine Position ändern.</p></div>
            </div>
          </details>
        </template>""",
}

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
  <script>
    try {{
      var language = localStorage.getItem("ff-language");
      if (language === "de") {{
        document.documentElement.lang = "de";
        document.documentElement.dataset.language = "de";
      }}
    }} catch (e) {{}}
  </script>
  <link rel="stylesheet" href="/shared/designs/base.css" />
  <link rel="stylesheet" href="/shared/seele/seele.css" />
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
{disclaimer_template}
      </article>
    </main>

    <button class="article-toc-backdrop" type="button" data-toc-backdrop data-label-en="Close contents" data-label-de="Inhaltsverzeichnis schließen" aria-label="Close contents" hidden></button>
    <div class="reader-dock" data-reader-dock>
      <button type="button" class="reader-dock-button reader-dock-toc" data-toc-toggle aria-controls="article-contents" aria-expanded="false" data-label-en="Open contents" data-label-de="Inhaltsverzeichnis öffnen" aria-label="Open contents">
        <span aria-hidden="true">≡</span>
      </button>
      <div class="reader-progress" role="progressbar" data-label-en="Reading progress" data-label-de="Lesefortschritt" aria-label="Reading progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0" data-reader-progress>
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
  <script src="/shared/seele/seele.js"></script>
  <script src="/shared/pwa.js" defer></script>
</body>
</html>
"""


for article in ARTICLES:
    article["disclaimer_template"] = DISCLAIMER_TEMPLATES.get(article["slug"], "")
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
