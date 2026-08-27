#!/usr/bin/env python3
"""Generate idempotent seed SQL from authored Lesener content files.

Usage:  python3 build_seed_sql.py <posts-dir> <dictionary.tsv> <out-dir> [batch]

Writes numbered .sql files to <out-dir>, meant to be applied in filename order
through the Supabase MCP server's execute_sql. Every statement is idempotent:
re-running any file is a no-op, so a batch that fails is fixed by running it
again rather than by unwinding.

Posts are updated by (level_id, position), never by id and never by slug:
  - keying on id would rely on posts.id happening to equal posts.position,
    which is true today by accident of the original seed
  - keying on slug breaks the moment a post is retitled
  - deleting and reinserting would cascade through reading_sessions and
    reading_progress and destroy every reader's history

level_id is resolved by slug so no generated id is ever written into SQL.
"""
import io, os, re, sys, glob

REQUIRED = ("slug", "title", "blurb", "topic", "level", "position")


def q(s):
    """Dollar-quote a string for Postgres."""
    if "$txt$" in s:
        raise ValueError(f"content contains the quote delimiter: {s[:60]!r}")
    return f"$txt${s}$txt$"


def read_post(path):
    s = io.open(path, encoding="utf-8").read()
    if not s.startswith("---\n"):
        raise ValueError(f"{path}: no frontmatter")
    end = s.index("\n---\n", 4) + len("\n---\n")
    fm = {}
    for line in s[4:end - 5].splitlines():
        if ":" in line:
            k, v = line.split(":", 1)
            fm[k.strip()] = v.strip()
    for key in REQUIRED:
        if not fm.get(key):
            raise ValueError(f"{path}: frontmatter missing '{key}'")
    return fm, s[end:].strip("\n")


def read_dictionary(path):
    rows = []
    for n, line in enumerate(io.open(path, encoding="utf-8")):
        line = line.rstrip("\n")
        if not line or (n == 0 and line.startswith("term\t")):
            continue
        parts = line.split("\t")
        if len(parts) < 3:
            raise ValueError(f"{path}:{n+1}: expected 3 columns")
        term, _display, translation = parts[0], parts[1], parts[2]
        if term != term.lower():
            raise ValueError(f"{path}:{n+1}: term {term!r} is not lowercase")
        rows.append((term, translation))
    return rows


def main(posts_dir, dict_path, out_dir, batch=400):
    os.makedirs(out_dir, exist_ok=True)
    for stale in glob.glob(os.path.join(out_dir, "*.sql")):
        os.remove(stale)
    written = []

    # 1 - posts, updated in place -------------------------------------------
    # One file per post, so a post that fails can be re-run on its own and so no
    # single payload is too large to hand to execute_sql.
    for path in sorted(glob.glob(os.path.join(posts_dir, "*.md"))):
        fm, body = read_post(path)
        sql = (
            "-- Updated in place: posts.id must not change, or reading_progress\n"
            "-- and reading_sessions cascade away with it.\n\n"
            "update public.posts set\n"
            f"  slug  = {q(fm['slug'])},\n"
            f"  title = {q(fm['title'])},\n"
            f"  blurb = {q(fm['blurb'])},\n"
            f"  topic = {q(fm['topic'])},\n"
            f"  body  = {q(body)}\n"
            f"where level_id = (select id from public.levels where slug = {q(fm['level'])})\n"
            f"  and position = {int(fm['position'])};\n")
        p = os.path.join(out_dir, f"01-post-{int(fm['position']):02d}.sql")
        io.open(p, "w", encoding="utf-8").write(sql)
        written.append(p)

    # 2 - dictionary, upserted by term ---------------------------------------
    rows = read_dictionary(dict_path)
    for i in range(0, len(rows), batch):
        chunk = rows[i:i + batch]
        values = ",\n  ".join(f"({q(t)}, {q(v)})" for t, v in chunk)
        sql = ("-- Dictionary rows. On conflict the translation is refreshed, so a\n"
               "-- corrected wording reaches the database on the next run.\n\n"
               "insert into public.dictionary_entries (term, translation) values\n"
               f"  {values}\n"
               "on conflict (term) do update set translation = excluded.translation;\n")
        p = os.path.join(out_dir, f"02-dictionary-{i // batch + 1:02d}.sql")
        io.open(p, "w", encoding="utf-8").write(sql)
        written.append(p)

    # 3 - cleanup, after the content is in place ------------------------------
    terms = {t for t, _ in rows}
    unreachable = sorted(t for t in terms if re.sub(r"[^A-Za-zÄÖÜäöüß-]", "", t) != t)
    sql = ["-- Entries carrying a character the reader strips before looking a word",
           "-- up. They can never match a tap, so they are removed rather than left",
           "-- as permanent dead rows.", ""]
    if unreachable:
        joined = ", ".join(q(t) for t in unreachable)
        sql.append(f"delete from public.dictionary_entries where term in ({joined});")
    else:
        sql.append("-- (none in the authored file)")
    sql += ["",
            "-- A saved word whose heading no longer reads as it did when it was saved",
            "-- keeps the memory instead of the link: post_id goes null and the bank",
            "-- falls back to the stored label. Words on posts that kept their title",
            "-- are left alone.", "",
            "update public.saved_words sw",
            "   set post_id = null",
            "  from public.posts p",
            " where p.id = sw.post_id",
            "   and sw.post_label is distinct from"
            " ('Post ' || p.position || ': ' || p.title);"]
    p = os.path.join(out_dir, "03-cleanup.sql")
    io.open(p, "w", encoding="utf-8").write("\n".join(sql) + "\n")
    written.append(p)

    for f in written:
        print(f"{os.path.getsize(f):>8}  {f}")


if __name__ == "__main__":
    if len(sys.argv) < 4:
        sys.exit(__doc__)
    main(sys.argv[1], sys.argv[2], sys.argv[3],
         int(sys.argv[4]) if len(sys.argv) > 4 else 400)
