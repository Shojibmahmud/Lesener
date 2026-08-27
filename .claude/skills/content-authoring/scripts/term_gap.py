#!/usr/bin/env python3
"""Work out which dictionary terms a set of posts still needs.

Usage:  python3 term_gap.py <posts-dir> [dictionary.tsv]

Prints, for every term the reader can produce but the dictionary lacks:

    term|display_form[|?]

`display_form` is derived: a word capitalised away from the start of a sentence
is a German noun, so that spelling wins; otherwise the lowercase spelling does.
A trailing `|?` marks a word only ever seen sentence-initially, where the rule
cannot tell a noun from a capitalised adverb - decide those by hand.

Also reports homographs: words that differ only by capitalisation collapse into
one row, because dictionary_entries.term is lowercase and unique. Their single
translation has to carry both senses (essen = to eat; food).
"""
import io, os, re, sys, glob
from collections import defaultdict

CLEAN = re.compile(r"[^A-Za-zÄÖÜäöüß-]")          # mirrors src/utils.js
SENTENCE_END = (".", ":", "?", "!")


def bodies(d):
    for path in sorted(glob.glob(os.path.join(d, "*.md"))):
        s = io.open(path, encoding="utf-8").read()
        yield s[s.index("\n---\n", 4) + 5:].strip("\n")


def main(d, dict_path=None):
    midcap, initcap, lower = defaultdict(set), defaultdict(set), defaultdict(set)
    for body in bodies(d):
        for para in body.split("\n\n"):
            toks = para.split()
            for i, tok in enumerate(toks):
                c = CLEAN.sub("", tok)
                if not c:
                    continue
                starts = i == 0 or toks[i - 1].endswith(SENTENCE_END)
                if c[0].isupper():
                    (initcap if starts else midcap)[c.lower()].add(c)
                else:
                    lower[c.lower()].add(c)

    known = set()
    if dict_path and os.path.exists(dict_path):
        for n, line in enumerate(io.open(dict_path, encoding="utf-8")):
            if n == 0 and line.startswith("term\t"):
                continue
            if line.strip():
                known.add(line.split("\t")[0])

    needed = sorted(set(midcap) | set(initcap) | set(lower))
    missing = [t for t in needed if t not in known]

    homographs = sorted(t for t in midcap if t in lower)
    unreachable = sorted(t for t in known if CLEAN.sub("", t) != t)

    print(f"terms the posts can produce : {len(needed)}")
    print(f"already in the dictionary   : {len(needed) - len(missing)}")
    print(f"still to translate          : {len(missing)}")
    if unreachable:
        print(f"\ndictionary rows no tap can ever match (clean() strips a character):")
        print("  " + ", ".join(unreachable))
    if homographs:
        print(f"\nhomographs - one row must carry both senses ({len(homographs)}):")
        print("  " + ", ".join(homographs))

    print("\n--- worklist ---")
    for t in missing:
        if midcap.get(t):
            print(f"{t}|{sorted(midcap[t])[0]}")
        elif lower.get(t):
            print(f"{t}|{sorted(lower[t])[0]}")
        else:
            print(f"{t}|{sorted(initcap[t])[0]}|?")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    main(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else None)
