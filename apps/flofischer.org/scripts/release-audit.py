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
    "root": [SITES / "root/index.html", SITES / "root/diorama/index.html"],
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
