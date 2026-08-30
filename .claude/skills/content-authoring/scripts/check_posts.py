#!/usr/bin/env python3
"""Validate Lesener post files against the rules Reader.jsx and clean() impose.

Usage:  python3 check_posts.py <posts-dir> [min-words] [max-words]

Checks every *.md in the directory: frontmatter parses, paragraph structure is
exactly what posts.body needs, and no token would break in the reader.
Exits non-zero if anything fails, so it can gate a seeding step.
"""
import io, os, re, sys, glob

CLEAN = re.compile(r"[^A-Za-zÄÖÜäöüß-]")          # mirrors src/utils.js
REQUIRED = ("slug", "title", "blurb", "topic", "level", "position")

# Genuine one- and two-letter German words. Anything else that short is almost
# always the wreckage of an abbreviation: "z. B." tokenises to "z" and "B",
# which would need dictionary rows named z and b.
SHORT_OK = {"ab", "am", "an", "da", "du", "er", "es", "im", "in", "ja", "je",
            "ob", "so", "um", "wo", "zu", "ic", "wg", "öl"}


def split_file(path):
    s = io.open(path, encoding="utf-8").read()
    if not s.startswith("---\n"):
        raise ValueError("no frontmatter")
    end = s.index("\n---\n", 4) + len("\n---\n")
    fm = {}
    for line in s[4:end - 5].splitlines():
        if ":" in line:
            k, v = line.split(":", 1)
            fm[k.strip()] = v.strip()
    return fm, s[end:]


def main(d, lo, hi):
    fails = []
    print(f"{'file':<36} {'words':>5} {'paras':>5} {'terms':>6}")
    for path in sorted(glob.glob(os.path.join(d, "*.md"))):
        name = os.path.basename(path)
        try:
            fm, raw = split_file(path)
        except ValueError as e:
            fails.append(f"{name}: {e}")
            continue

        for key in REQUIRED:
            if not fm.get(key):
                fails.append(f"{name}: frontmatter missing '{key}'")
        if fm.get("slug") and not name.endswith(fm["slug"] + ".md"):
            fails.append(f"{name}: filename does not end with slug '{fm['slug']}'")

        if raw != "\n" + raw.strip("\n") + "\n":
            fails.append(f"{name}: body must be one blank line after '---' "
                         f"and end with a single newline")
        body = raw.strip("\n")

        paras = body.split("\n\n")
        for i, p in enumerate(paras, 1):
            if not p.strip():
                fails.append(f"{name}: paragraph {i} is empty (double blank line?)")
            elif p != p.strip():
                fails.append(f"{name}: paragraph {i} has leading/trailing whitespace")
            elif "\n" in p:
                fails.append(f"{name}: paragraph {i} is hard-wrapped; use one line")

        words = len(body.split())
        if not lo <= words <= hi:
            fails.append(f"{name}: {words} words, outside {lo}-{hi}")

        terms = set()
        for tok in body.split():
            c = CLEAN.sub("", tok)
            if not c:
                continue                      # numerals: inert, untappable, fine
            terms.add(c.lower())
            stripped = set(tok) - set(c) - set(".,:;!?()„“\"'–—…")
            if stripped:
                fails.append(f"{name}: {tok!r} loses {sorted(stripped)} to clean()")
            if len(c) <= 2 and c.lower() not in SHORT_OK:
                fails.append(f"{name}: {tok!r} yields the term {c.lower()!r} — "
                             f"spell abbreviations out, or add it to SHORT_OK")
        print(f"{name:<36} {words:>5} {len(paras):>5} {len(terms):>6}")

    print()
    if fails:
        print(f"FAIL ({len(fails)})")
        for f in fails:
            print("  -", f)
        return 1
    print("OK - every post satisfies the reader's constraints")
    return 0


if __name__ == "__main__":
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    sys.exit(main(sys.argv[1],
                  int(sys.argv[2]) if len(sys.argv) > 2 else 450,
                  int(sys.argv[3]) if len(sys.argv) > 3 else 500))
