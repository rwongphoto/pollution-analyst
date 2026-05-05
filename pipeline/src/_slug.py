"""Slugify utility shared across publish modules."""

import re

_SLUG_RE = re.compile(r"[^a-z0-9]+")


def slugify(s: str) -> str:
    s = s.lower().strip()
    s = _SLUG_RE.sub("-", s)
    return s.strip("-")
