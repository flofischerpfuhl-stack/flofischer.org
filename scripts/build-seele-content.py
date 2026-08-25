#!/usr/bin/env python3
"""Build static Seele article fragments from the Obsidian originals."""

from pathlib import Path
from html.parser import HTMLParser
import json
import re
import shutil
import subprocess
import tempfile
import unicodedata


ROOT = Path(__file__).resolve().parents[1]
VAULT = Path("/home/oem/Dokumente/091_Software/32_Obsidian")
OUT = ROOT / "sites/shared/seele/content"
ARTICLE_IMAGES = ROOT / "sites/shared/seele/article-images"

CURRENT_VERSIONS = {
    "gottesbeweise": "v0.1",
    "fsspx": "v0.1",
    "aliens": "v0.1",
    "providence": "v0.1",
    "eucharist": "v0.1",
    "wagner-response": "v0.1",
}

SOURCES = {
    ("gottesbeweise", "de"): VAULT / "97_Codex/Gottesbeweise.md",
    ("gottesbeweise", "en"): VAULT / "97_Codex/Proving God.md",
    ("fsspx", "de"): VAULT / "97_Codex/Verteidigung der FSSPX und ihrer Bischofsweihen - Version v0.1.md",
    ("fsspx", "en"): VAULT / "97_Codex/Defense of the FSSPX and Its Episcopal Consecrations - English.md",
    ("aliens", "de"): VAULT / "03_Projekte/Aliens und Katholizismus.md",
    ("aliens", "en"): OUT / "en/aliens-catholicism.md",
    ("providence", "de"): VAULT / "03_Projekte/Vorsehung und freier Wille.md",
    ("providence", "en"): OUT / "en/providence-free-will.md",
    ("eucharist", "de"): OUT / "de/eucharistic-miracles.md",
    ("eucharist", "en"): Path("/home/oem/Dokumente/091_Software/03_Word/Modern day Eucharistic Miracles/Modern Day Eucharistic Miracles.docx"),
    ("wagner-response", "en"): VAULT / "97_Codex/Response to Wagner - Invalid Sacraments, Excommunications, and the SSPX - v0.1.md",
    ("wagner-response", "de"): OUT / "de/wagner-response.md",
}

TITLES = {
    ("gottesbeweise", "de"): "Gottesbeweise",
    ("gottesbeweise", "en"): "Proving God",
    ("fsspx", "de"): "Verteidigung der FSSPX und ihrer Bischofsweihen",
    ("fsspx", "en"): "Defense of the SSPX and Its Episcopal Consecrations",
    ("wagner-response", "en"): "Must One Submit to a Null Sentence? A Response to Christian B. Wagner",
    ("wagner-response", "de"): "Muss man sich einem nichtigen Urteil unterwerfen? Eine Antwort an Christian B. Wagner",
}

PORTRAITS = {
    "William Lane Craig": ("william-lane-craig.png", "William Lane Craig"),
    "Robert C. Koons": ("robert-koons.png", "Robert C. Koons"),
    "Joe Schmid": ("joe-schmid.png", "Joe Schmid"),
    "Aristotle": ("aristotle.png", "Aristotle"),
    "Ed Feser": ("edward-feser.png", "Edward Feser"),
    "Thomas Aquinas": ("thomas-aquinas.png", "St. Thomas Aquinas"),
    "Gottfried Wilhelm Leibniz": ("leibniz.png", "Gottfried Wilhelm Leibniz"),
    "Trent Horn": ("trent-horn.png", "Trent Horn"),
    "Plato": ("plato.png", "Plato"),
    "William Paley": ("william-paley.png", "William Paley"),
    "Richard Dawkins": ("richard-dawkins.png", "Richard Dawkins"),
    "Anselm of Canterbury": ("anselm.png", "St. Anselm of Canterbury"),
    "Alvin Plantinga": ("alvin-plantinga.png", "Alvin Plantinga"),
    "Kurt Gödel with Albert Einstein": ("godel-einstein.png", "Kurt Gödel with Albert Einstein"),
    "Alexander Pruss": ("alexander-pruss.png", "Alexander Pruss"),
    "Stephen C. Meyer": ("stephen-meyer.jpg", "Stephen C. Meyer"),
}

GERMAN_IMAGE_NAMES = {
    "Filosof_og_teolog_William_Lane_Craig,_2014.jpg": PORTRAITS["William Lane Craig"],
    "from-clipboard.jpg": PORTRAITS["Robert C. Koons"],
    "JoeSchmid.webp": PORTRAITS["Joe Schmid"],
    "Aristotle_Altemps_Inv8575.jpg": PORTRAITS["Aristotle"],
    "feser.jpg": PORTRAITS["Ed Feser"],
    "13754.jpg.webp": PORTRAITS["Thomas Aquinas"],
    "MzQwMTgxNw-1140x855.jpeg": PORTRAITS["Gottfried Wilhelm Leibniz"],
    "TrentH_03-copy-1-768x953.jpg": PORTRAITS["Trent Horn"],
    "Platon-1.jpg": PORTRAITS["Plato"],
    "WilliamPaley.jpg": PORTRAITS["William Paley"],
    "Richard_Dawkins_(2009).jpg": PORTRAITS["Richard Dawkins"],
    "Anselm_of_Canterbury.jpg": PORTRAITS["Anselm of Canterbury"],
    "alvin_plantinga.jpg": PORTRAITS["Alvin Plantinga"],
    "goedeleinsteinweb.jpg": PORTRAITS["Kurt Gödel with Albert Einstein"],
    "Dr. Alexander Pruss.jpg": PORTRAITS["Alexander Pruss"],
    "DCOSAF-2023-32-steve-meyer.jpg": PORTRAITS["Stephen C. Meyer"],
}


def figure(filename: str, caption: str) -> str:
    url = f"/shared/seele/article-images/{filename}"
    return (
        f'<figure class="article-figure"><img src="{url}" alt="{caption}" '
        f'loading="lazy"><figcaption>{caption}</figcaption></figure>'
    )


def remove_unfinished_sections(text: str) -> str:
    text = re.sub(
        r"^\s*_folgt in einer (?:s|S)päteren Version des Scripts_\s*$",
        "",
        text,
        flags=re.M,
    )
    lines = text.splitlines()
    changed = True
    while changed:
        changed = False
        headings = []
        for index, line in enumerate(lines):
            match = re.match(r"^(#{1,6})\s+", line)
            if match:
                headings.append((index, len(match.group(1))))
        for heading_index, (start, level) in reversed(list(enumerate(headings))):
            end = len(lines)
            for candidate_start, candidate_level in headings[heading_index + 1:]:
                if candidate_level <= level:
                    end = candidate_start
                    break
            body = "\n".join(lines[start + 1:end])
            body = re.sub(r"^#{1,6}\s+.*$", "", body, flags=re.M)
            body = re.sub(r"!\[[^\]]*\]\([^\)]*\)", "", body)
            body = re.sub(r"<img\b[^>]*>", "", body, flags=re.I)
            body = re.sub(r"<figure\b.*?</figure>", "", body, flags=re.I | re.S)
            body = re.sub(r"^\s*(?:___+|---+|\*\*\*+)\s*$", "", body, flags=re.M)
            if not re.search(r"[\wÀ-ÿ]", body):
                del lines[start:end]
                changed = True
                break
    return "\n".join(lines) + "\n"


def read_source(slug: str, language: str, source: Path) -> str:
    if source.suffix.lower() != ".docx":
        return source.read_text(encoding="utf-8")

    media_root = ARTICLE_IMAGES / "eucharist"
    media_root.mkdir(parents=True, exist_ok=True)
    conversion = subprocess.run(
        [
            "pandoc",
            str(source),
            "-f",
            "docx",
            "-t",
            "markdown+raw_html",
            "--wrap=none",
            f"--extract-media={media_root}",
        ],
        check=True,
        capture_output=True,
        text=True,
    )
    text = conversion.stdout
    text = re.sub(
        r'src="[^"]*/eucharist/media/([^"]+)"',
        r'src="/shared/seele/article-images/eucharist/media/\1"',
        text,
    )
    text = re.sub(
        r'\]\([^\)]*/eucharist/media/([^\)]+)\)',
        r'](/shared/seele/article-images/eucharist/media/\1)',
        text,
    )
    return text


def preprocess(slug: str, language: str, text: str) -> str:
    if slug == "gottesbeweise" and language == "en":
        text = re.sub(r"\n## Contents\n.*?(?=\n# Introduction\n)", "\n", text, flags=re.S)
        for label, (filename, caption) in PORTRAITS.items():
            text = text.replace(f"[[IMAGE PLACEHOLDER: {label}]]", figure(filename, caption))
        text = re.sub(r"\[\[(?:IMAGE|DIAGRAM|JOKE) PLACEHOLDER:[^\]]+\]\]", "", text)

    if slug == "gottesbeweise" and language == "de":
        text = re.sub(r"^# Inhaltsverzeichnis\s*\x60{3}table-of-contents\s*\x60{3}\s*", "", text)
        text = text.replace("Exkurs: Stephen C. Mayer", "Exkurs: Stephen C. Meyer")
        for source_name, (filename, caption) in GERMAN_IMAGE_NAMES.items():
            pattern = rf'<img src="[^"]*{re.escape(source_name)}">'
            text = re.sub(pattern, figure(filename, caption), text)
        text = re.sub(r'<img src="C:[^"]+">', "", text)

    if slug == "gottesbeweise":
        text = remove_unfinished_sections(text)

    if slug == "fsspx":
        heading = "Inhaltsverzeichnis" if language == "de" else "Table of Contents"
        text = re.sub(
            rf"\n## {heading}\n.*?(?=\n## 1\. )",
            "\n",
            text,
            flags=re.S,
        )
        text = text.replace(
            "![Archbishop Flavio Pace crossing himself during Sarah Mullally's blessing](Picture%201.jpg)",
            figure("flavio-pace.jpg", "Archbishop Flavio Pace during Sarah Mullally’s blessing"),
        )
        text = text.replace(
            "![[Picture 1.jpg]]",
            figure("flavio-pace.jpg", "Erzbischof Flavio Pace während des Segens von Sarah Mullally"),
        )

    if slug == "eucharist":
        text = re.sub(
            r'^# An Exploration of recent scientific data and an argument for Catholicism$',
            "# Eucharistic Miracles\n\n## An Exploration of Recent Scientific Data and an Argument for Catholicism",
            text,
            flags=re.M,
        )
        text = re.sub(r'^\*\*([^*]+)\*\*$', r'## \1', text, flags=re.M)
        text = re.sub(r'^(\d+)\\\.\s+', r'\1. ', text, flags=re.M)
        text = re.sub(r'^\\-\s+', r'- ', text, flags=re.M)
        if language == "en":
            image = r'!\[[^\]]*\]\((/shared/seele/article-images/eucharist/media/[^\)]+)\)(?:\{[^}]*\})?'
            text = re.sub(
                rf'({image})\s*({image})',
                lambda match: (
                    '<div class="article-figure-pair">'
                    f'<img src="{match.group(2)}" alt="" loading="lazy">'
                    f'<img src="{match.group(4)}" alt="" loading="lazy">'
                    '</div>'
                ),
                text,
            )
            text = re.sub(
                rf'^({image})$',
                lambda match: (
                    '<figure class="article-figure">'
                    f'<img src="{match.group(2)}" alt="" loading="lazy">'
                    '</figure>'
                ),
                text,
                flags=re.M,
            )

    if slug == "wagner-response":
        text = re.sub(r"\s+- v0\.1\s*$", "", text, count=1, flags=re.M)

    title = TITLES.get((slug, language))
    if title and not text.lstrip().startswith(f"# {title}"):
        text = f"# {title}\n\n{text.lstrip()}"

    text = text.replace(chr(96) * 3 + "table-of-contents\n" + chr(96) * 3, "")
    text = re.sub(r'\n(___+|---+)\n', r'\n\n\1\n\n', text)
    return text


class TextExtractor(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.parts = []
        self.ignored = 0

    def handle_starttag(self, tag, attrs):
        if tag in {"script", "style"}:
            self.ignored += 1

    def handle_endtag(self, tag):
        if tag in {"script", "style"} and self.ignored:
            self.ignored -= 1

    def handle_data(self, data):
        if not self.ignored:
            self.parts.append(data)


def searchable_text(html: str) -> str:
    parser = TextExtractor()
    parser.feed(html)
    value = " ".join(parser.parts)
    value = "".join(
        character for character in unicodedata.normalize("NFKD", value)
        if not unicodedata.combining(character)
    )
    return re.sub(r"\s+", " ", value).strip().casefold()


def build() -> None:
    search_index = {}
    for (slug, language), source in SOURCES.items():
        text = preprocess(slug, language, read_source(slug, language, source))
        destination = OUT / language / f"{slug}.html"
        destination.parent.mkdir(parents=True, exist_ok=True)
        with tempfile.NamedTemporaryFile("w", suffix=".md", encoding="utf-8") as temp:
            temp.write(text)
            temp.flush()
            subprocess.run(
                [
                    "pandoc",
                    temp.name,
                    "-f",
                    "markdown+tex_math_dollars+tex_math_single_backslash+inline_notes+pipe_tables+raw_html",
                    "-t",
                    "html5",
                    "--mathjax",
                    "--section-divs",
                    "--wrap=none",
                    "-o",
                    str(destination),
                ],
                check=True,
            )
        print(destination.relative_to(ROOT))
        version_destination = destination.with_name(
            f"{slug}-{CURRENT_VERSIONS[slug]}.html"
        )
        shutil.copyfile(destination, version_destination)
        print(version_destination.relative_to(ROOT))
        search_index.setdefault(slug, {})[language] = searchable_text(
            destination.read_text(encoding="utf-8")
        )

    search_destination = ROOT / "sites/shared/seele/search-index.json"
    search_destination.write_text(
        json.dumps(search_index, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8",
    )
    print(search_destination.relative_to(ROOT))


if __name__ == "__main__":
    build()
