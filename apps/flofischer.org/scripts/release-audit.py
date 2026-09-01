#!/usr/bin/env python3
"""Fast, dependency-free release audit for the three public sites."""

from __future__ import annotations

import json
import sys
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import unquote, urlparse
from xml.etree import ElementTree


ROOT = Path(__file__).resolve().parents[1]
SITES = ROOT / "sites"
PUBLIC_PAGES = {
    "root": [SITES / "root/index.html"],
    "seele": [SITES / "seele/index.html", *sorted((SITES / "seele/posts").glob("*.html"))],
    "gehirn": [SITES / "gehirn/index.html"],
}
HOST_TO_SITE = {
    "flofischer.org": "root",
    "www.flofischer.org": "root",
    "seele.flofischer.org": "seele",
    "gehirn.flofischer.org": "gehirn",
}
REQUIRED_META = {
    "description",
    "theme-color",
    "application-name",
    "twitter:card",
    "twitter:title",
    "twitter:description",
    "twitter:image",
    "og:type",
    "og:site_name",
    "og:title",
    "og:description",
    "og:url",
    "og:image",
}


class AuditParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.meta: dict[str, str] = {}
        self.links: list[dict[str, str]] = []
        self.assets: set[str] = set()
        self.title = ""
        self._in_title = False

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        data = {key: value or "" for key, value in attrs}
        if tag == "meta":
            key = data.get("name") or data.get("property")
            if key:
                self.meta[key] = data.get("content", "")
        elif tag == "link":
            self.links.append(data)

        if tag in {"img", "script", "source", "video"} and data.get("src"):
            self.assets.add(data["src"])
        if tag == "link" and data.get("href") and any(
            rel in data.get("rel", "").split() for rel in ("stylesheet", "icon", "manifest", "preload")
        ):
            self.assets.add(data["href"])
        for key in ("data-content-src-en", "data-content-src-de"):
            if data.get(key):
                self.assets.add(data[key])
        if tag == "title":
            self._in_title = True

    def handle_endtag(self, tag: str) -> None:
        if tag == "title":
            self._in_title = False

    def handle_data(self, data: str) -> None:
        if self._in_title:
            self.title += data


def local_file(site: str, value: str) -> Path | None:
    if not value or value.startswith(("data:", "mailto:", "tel:", "#")):
        return None
    parsed = urlparse(value)
    if parsed.scheme in {"http", "https"}:
        target_site = HOST_TO_SITE.get(parsed.hostname or "")
        if not target_site:
            return None
        site = target_site
        path = unquote(parsed.path)
    elif parsed.scheme:
        return None
    else:
        path = unquote(parsed.path)

    if not path or path.endswith("/") or "." not in Path(path).name:
        return None
    if path.startswith("/shared/"):
        return SITES / path.lstrip("/")
    return SITES / site / path.lstrip("/")


def image_size(path: Path) -> str:
    data = path.read_bytes()
    if data.startswith(b"\x89PNG\r\n\x1a\n") and len(data) >= 24:
        width = int.from_bytes(data[16:20], "big")
        height = int.from_bytes(data[20:24], "big")
        return f"{width}x{height}"

    if data.startswith(b"\xff\xd8"):
        offset = 2
        start_of_frame = {
            0xC0, 0xC1, 0xC2, 0xC3, 0xC5, 0xC6, 0xC7,
            0xC9, 0xCA, 0xCB, 0xCD, 0xCE, 0xCF,
        }
        while offset + 8 < len(data):
            if data[offset] != 0xFF:
                offset += 1
                continue
            while offset < len(data) and data[offset] == 0xFF:
                offset += 1
            if offset >= len(data):
                break
            marker = data[offset]
            offset += 1
            if marker in {0x01, *range(0xD0, 0xDA)}:
                continue
            if offset + 2 > len(data):
                break
            segment_length = int.from_bytes(data[offset:offset + 2], "big")
            if marker in start_of_frame and offset + 7 <= len(data):
                height = int.from_bytes(data[offset + 3:offset + 5], "big")
                width = int.from_bytes(data[offset + 5:offset + 7], "big")
                return f"{width}x{height}"
            if segment_length < 2:
                break
            offset += segment_length

    raise ValueError(f"unsupported image format: {path}")


def main() -> int:
    errors: list[str] = []
    canonical_urls: set[str] = set()

    release_contract_path = SITES / "shared/release.json"
    expected_release_contract = {
        "deploymentPipeline": "cloudflare-workers-builds",
        "hub": "floating-island-v17",
        "seeleReader": "floating-reader-with-mobile-toc-and-disclaimers",
    }
    try:
        release_contract = json.loads(release_contract_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        errors.append(f"sites/shared/release.json: invalid release contract ({exc})")
    else:
        if release_contract != expected_release_contract:
            errors.append("sites/shared/release.json: release contract does not match the protected production architecture")

    root_markup = (SITES / "root/index.html").read_text(encoding="utf-8")
    if 'id="diorama-world"' not in root_markup:
        errors.append("root/index.html: floating-island diorama canvas is missing")
    if 'id="hub-world"' in root_markup:
        errors.append("root/index.html: legacy first-person canvas is still present")
    if "/shared/hub/main.js" in root_markup:
        errors.append("root/index.html: legacy dual-scene runtime is still referenced")
    if "/shared/hub/diorama.js" not in root_markup or "data-loader-progress" not in root_markup:
        errors.append("root/index.html: current floating-island runtime or loader is missing")
    for marker in ("loader-layer--back", "loader-layer--island", "loader-layer--front"):
        if marker not in root_markup:
            errors.append(f"root/index.html: layered loading preview is missing {marker}")
    if not (SITES / "shared/hub/art/diorama-preview.webp").is_file():
        errors.append("shared/hub/art/diorama-preview.webp: floating-island loading preview is missing")
    for obsolete_preload in ("seele-jungle-v2.webp", "gehirn-city-v2.webp"):
        if f'rel="preload" href="/shared/hub/art/{obsolete_preload}"' in root_markup:
            errors.append(f"root/index.html: obsolete hidden preload must not return ({obsolete_preload})")
    if 'rel="modulepreload" href="/shared/hub/diorama.js?v=17"' not in root_markup:
        errors.append("root/index.html: floating-island module preload is missing")
    if 'rel="preload" href="/shared/hub/art/diorama-preview.webp?v=17"' not in root_markup:
        errors.append("root/index.html: loading preview preload is missing")

    diorama_script = (SITES / "shared/hub/diorama.js").read_text(encoding="utf-8")
    for marker, label in (
        ("renderer.shadowMap.autoUpdate = false", "single-update static shadows"),
        ("renderer.setAnimationLoop(animate)", "renderer-managed animation loop"),
        ("1000 / 30", "responsive mobile frame cap"),
        ("tropical-leaf.webp", "lossless WebP foliage texture"),
    ):
        if marker not in diorama_script:
            errors.append(f"shared/hub/diorama.js: missing {label}")
    if (SITES / "shared/hub/textures/tropical-leaf.png").exists():
        errors.append("shared/hub/textures/tropical-leaf.png: oversized legacy foliage texture must be removed")

    root_worker = (SITES / "root/sw.js").read_text(encoding="utf-8")
    if "models/polyhaven/pachira_aquatica_01" in root_worker:
        errors.append("root/sw.js: optional detailed plants must not block service-worker installation")
    pwa_worker = (SITES / "shared/pwa-worker.js").read_text(encoding="utf-8")
    if "cacheableModel" not in pwa_worker or "gltf|bin" not in pwa_worker:
        errors.append("shared/pwa-worker.js: runtime model caching is missing")
    for legacy_file in ("main.js", "player.js", "world.js"):
        if (SITES / "shared/hub" / legacy_file).exists():
            errors.append(f"shared/hub/{legacy_file}: legacy first-person runtime must be removed")

    seele_script = (SITES / "shared/seele/seele.js").read_text(encoding="utf-8")
    seele_style = (SITES / "shared/seele/seele.css").read_text(encoding="utf-8")
    if (
        ".math.inline::-webkit-scrollbar" in seele_style
        or "display: inline-flex;\n    overflow-x: auto;" in seele_style
    ):
        errors.append("shared/seele/seele.css: inline mathematics must not create mobile scrollbars")
    for marker, label in (
        ("insertDisclaimer(host)", "article disclaimer enhancement"),
        ("bootReaderDock()", "floating reader dock"),
        ("setTocOpen(open)", "mobile contents drawer"),
        ("lockTocScroll()", "contents scroll-position lock"),
        ("focusWithoutScroll", "scroll-safe contents focus"),
    ):
        if marker not in seele_script:
            errors.append(f"shared/seele/seele.js: missing {label}")

    if "font-size: clamp(2.6rem, 12.5vw, 4.8rem)" not in seele_style:
        errors.append("shared/seele/seele.css: mobile Seele hero overflow protection is missing")

    language_script = SITES / "shared/language.js"
    if not language_script.is_file() or "Domain=flofischer.org" not in language_script.read_text(encoding="utf-8"):
        errors.append("shared/language.js: cross-subdomain language cookie is missing")
    for page in (SITES / "root/index.html", SITES / "seele/index.html", SITES / "gehirn/index.html"):
        if "/shared/language.js" not in page.read_text(encoding="utf-8"):
            errors.append(f"{page.relative_to(ROOT)}: shared language bootstrap is missing")

    content_builder = (ROOT / "scripts/build-seele-content.py").read_text(encoding="utf-8")
    if 'SOURCE = ROOT / "sites/shared/seele/source"' not in content_builder:
        errors.append("scripts/build-seele-content.py: article sources are not repository-owned")
    if "VAULT" in content_builder or "/home/oem/" in content_builder:
        errors.append("scripts/build-seele-content.py: external Obsidian dependency must not return")

    german_proofs = (SITES / "shared/seele/content/de/gottesbeweise.html").read_text(encoding="utf-8")
    english_proofs = (SITES / "shared/seele/content/en/gottesbeweise.html").read_text(encoding="utf-8")
    if 'id="vorstellung"' in german_proofs or "Ich heiße Florian Fischer" in german_proofs:
        errors.append("German Gottesbeweise: obsolete personal introduction is still present")
    if 'id="einleitung"' not in german_proofs:
        errors.append("German Gottesbeweise: synchronized introduction is missing")
    if german_proofs.count("<section ") != english_proofs.count("<section "):
        errors.append("German Gottesbeweise: section structure differs from the English canonical version")

    seele_index = (SITES / "seele/index.html").read_text(encoding="utf-8")
    alien_paths = (
        SITES / "seele/posts/aliens-katholizismus.html",
        SITES / "shared/seele/content/de/aliens.html",
        SITES / "shared/seele/content/en/aliens.html",
    )
    if 'data-slug="aliens"' in seele_index or any(path.exists() for path in alien_paths):
        errors.append("Seele: unfinished Aliens and Catholicism article is still published")

    for page in PUBLIC_PAGES["seele"][1:]:
        markup = page.read_text(encoding="utf-8")
        for marker, label in (
            ('data-reader-dock', "floating reader dock"),
            ('data-toc-toggle', "mobile contents button"),
            ('id="article-contents"', "article contents target"),
        ):
            if marker not in markup:
                errors.append(f"{page.relative_to(ROOT)}: missing {label}")

    for filename in ("fsspx-verteidigung.html", "antwort-christian-wagner.html"):
        markup = (SITES / "seele/posts" / filename).read_text(encoding="utf-8")
        if "data-disclaimer-template" not in markup or "Redaktioneller Hinweis" not in markup:
            errors.append(f"sites/seele/posts/{filename}: bilingual editorial disclaimer is missing")

    for site, pages in PUBLIC_PAGES.items():
        for page in pages:
            parser = AuditParser()
            parser.feed(page.read_text(encoding="utf-8"))
            label = page.relative_to(ROOT)

            if not parser.title.strip():
                errors.append(f"{label}: missing title")
            missing_meta = sorted(key for key in REQUIRED_META if not parser.meta.get(key))
            if missing_meta:
                errors.append(f"{label}: missing metadata: {', '.join(missing_meta)}")

            links_by_rel: dict[str, list[dict[str, str]]] = {}
            for link in parser.links:
                for rel in link.get("rel", "").split():
                    links_by_rel.setdefault(rel, []).append(link)
            for rel in ("canonical", "manifest", "icon", "apple-touch-icon"):
                if rel not in links_by_rel:
                    errors.append(f"{label}: missing rel={rel}")

            canonical = links_by_rel.get("canonical", [{}])[0].get("href", "")
            if canonical in canonical_urls:
                errors.append(f"{label}: duplicate canonical {canonical}")
            canonical_urls.add(canonical)
            if parser.meta.get("og:url") != canonical:
                errors.append(f"{label}: og:url differs from canonical")

            for value in parser.assets | {
                parser.meta.get("og:image", ""),
                parser.meta.get("twitter:image", ""),
            }:
                path = local_file(site, value)
                if path and not path.is_file():
                    errors.append(f"{label}: missing asset {value} -> {path.relative_to(ROOT)}")

    for site in PUBLIC_PAGES:
        base = SITES / site
        manifest_path = base / "manifest.webmanifest"
        try:
            manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        except Exception as error:
            errors.append(f"{manifest_path.relative_to(ROOT)}: invalid JSON ({error})")
            continue
        for key in ("id", "name", "short_name", "start_url", "scope", "display", "background_color", "theme_color", "icons"):
            if not manifest.get(key):
                errors.append(f"{manifest_path.relative_to(ROOT)}: missing {key}")
        purposes: set[str] = set()
        sizes: set[str] = set()
        for icon in manifest.get("icons", []):
            path = local_file(site, icon.get("src", ""))
            if not path or not path.is_file():
                errors.append(f"{manifest_path.relative_to(ROOT)}: missing icon {icon.get('src')}")
                continue
            actual_size = image_size(path)
            expected_size = icon.get("sizes", "")
            if actual_size != expected_size:
                errors.append(f"{path.relative_to(ROOT)}: is {actual_size}, manifest says {expected_size}")
            sizes.add(expected_size)
            purposes.update(icon.get("purpose", "any").split())
        if not {"192x192", "512x512"}.issubset(sizes) or "maskable" not in purposes:
            errors.append(f"{manifest_path.relative_to(ROOT)}: incomplete install icons")
        for required in ("sw.js", "robots.txt", "sitemap.xml", "favicon.ico", "icons/apple-touch-icon.png"):
            if not (base / required).is_file():
                errors.append(f"{base.relative_to(ROOT)}/{required}: missing")
        try:
            ElementTree.parse(base / "sitemap.xml")
        except Exception as error:
            errors.append(f"{base.relative_to(ROOT)}/sitemap.xml: invalid XML ({error})")

        social = base / "social-preview.jpg"
        if not social.is_file() or image_size(social) != "1200x630":
            errors.append(f"{social.relative_to(ROOT)}: must be a 1200x630 JPEG")

    if errors:
        print("RELEASE AUDIT FAILED")
        for error in errors:
            print(f"  - {error}")
        return 1

    page_count = sum(len(pages) for pages in PUBLIC_PAGES.values())
    print(f"RELEASE AUDIT PASSED — {page_count} public pages, 3 manifests, 3 service workers")
    return 0


if __name__ == "__main__":
    sys.exit(main())
