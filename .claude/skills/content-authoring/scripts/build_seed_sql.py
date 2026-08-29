#!/usr/bin/env python3
"""Generate idempotent seed SQL from authored Lesener content files.

Usage:  python3 build_seed_sql.py <posts-dir> <dictionary.tsv> <out-dir> [batch]

Writes numbered .sql files to <out-dir>, meant to be applied in filename order
through the Supabase MCP server's execute_sql. Every statement is idempotent:
re-running any file is a no-op, so a batch that fails is fixed by running it
again rather than by unwinding.

Posts are upserted on (level_id, position), never by id and never by slug:
  - keying on id would rely on posts.id happening to equal posts.position,
    which is true today by accident of the original seed
  - keying on slug breaks the moment a post is retitled
  - deleting and reinserting would cascade through reading_sessions and
    reading_progress and destroy every reader's history

An upsert rather than an UPDATE, because a level being written for the first
time holds no rows: an UPDATE against it matches nothing and reports success,
which is the one failure mode a seed must not have. ON CONFLICT DO UPDATE keeps
posts.id on every subsequent run, so a correction is still an update in place.

A directory may carry a `_level.tsv` sidecar naming the level it belongs to
(slug, name, cefr, position). If it does, the level row is created too, so a
level that does not exist yet needs no hand-written SQL either.

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


def read_level_meta(posts_dir):
    """Read the optional `_level.tsv` sidecar: slug, name, cefr, position.

    A level directory that names its own level lets a level nobody has created
    yet be seeded by the same route as its posts. Absent -- as it is for a level
    already in the database -- no level statement is generated at all.

    Deliberately not frontmatter. Repeating the level's name and CEFR band in
    all ten post files would invite exactly one of them to drift, and the post
    files already carry the only thing they need: the level's slug.
    """
    path = os.path.join(posts_dir, "_level.tsv")
    if not os.path.exists(path):
        return None
    for line in io.open(path, encoding="utf-8"):
        line = line.rstrip("\n")
        if not line or line.startswith("#") or line.startswith("slug\t"):
            continue
        parts = line.split("\t")
        if len(parts) < 4:
            raise ValueError(f"{path}: expected 4 columns: slug, name, cefr, position")
        slug, name, cefr, position = parts[0], parts[1], parts[2], parts[3]
        # The same list as the levels.cefr check constraint. Caught here rather
        # than by Postgres, so the failure names the file instead of the row.
        if cefr not in ("A1", "A2", "B1", "B2", "C1", "C2"):
            raise ValueError(f"{path}: cefr {cefr!r} is not a CEFR band")
        return slug, name, cefr, int(position)
    return None


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

    # 0 - the level row itself, if the directory declares one -----------------
    # Only needed for a level that does not exist yet. `do nothing` rather than
    # `do update`: name, cefr and position are curated in the database once and
    # a re-run must not quietly revert an edit made there.
    meta = read_level_meta(posts_dir)
    if meta:
        slug, name, cefr, position = meta
        sql = ("-- The level row. Idempotent: a level that already exists is left\n"
               "-- exactly as it is, so re-running this can never renumber or\n"
               "-- relabel a level that readers are already working through.\n\n"
               "insert into public.levels (slug, name, cefr, position) values\n"
               f"  ({q(slug)}, {q(name)}, {q(cefr)}, {int(position)})\n"
               "on conflict (slug) do nothing;\n")
        f = os.path.join(out_dir, "00-level.sql")
        io.open(f, "w", encoding="utf-8").write(sql)
        written.append(f)

    # 1 - posts, upserted in place -------------------------------------------
    # One file per post, so a post that fails can be re-run on its own and so no
    # single payload is too large to hand to execute_sql.
    #
    # An upsert, not a bare UPDATE. A level being written for the first time has
    # no rows at all, and an UPDATE against it matches nothing while reporting
    # success -- a seed that silently writes nothing is worse than one that
    # fails. Conflicts resolve on `unique (level_id, position)`, which is the
    # level's own structure:
    #   - `id` would rely on posts.id happening to equal posts.position, true
    #     today only by accident of the original seed
    #   - `slug` breaks the moment a post is retitled
    # ON CONFLICT DO UPDATE keeps posts.id, so reading_sessions and
    # reading_progress do not cascade away. Nothing is ever deleted.
    #
    # published_at is set on insert and deliberately absent from the update
    # list: a post retired with `published_at = null` must stay retired across a
    # re-run, or unpublishing would be undone by the next seed.
    for path in sorted(glob.glob(os.path.join(posts_dir, "*.md"))):
        fm, body = read_post(path)
        sql = (
            "-- Upserted on (level_id, position): inserts a post the level does not\n"
            "-- have yet, and otherwise updates in place. posts.id must not change,\n"
            "-- or reading_progress and reading_sessions cascade away with it.\n\n"
            "insert into public.posts\n"
            "  (level_id, position, slug, title, blurb, topic, body, published_at)\n"
            "values (\n"
            f"  (select id from public.levels where slug = {q(fm['level'])}),\n"
            f"  {int(fm['position'])},\n"
            f"  {q(fm['slug'])},\n"
            f"  {q(fm['title'])},\n"
            f"  {q(fm['blurb'])},\n"
            f"  {q(fm['topic'])},\n"
            f"  {q(body)},\n"
            "  now()\n"
            ")\n"
            "on conflict (level_id, position) do update set\n"
            "  slug  = excluded.slug,\n"
            "  title = excluded.title,\n"
            "  blurb = excluded.blurb,\n"
            "  topic = excluded.topic,\n"
            "  body  = excluded.body;\n")
        f = os.path.join(out_dir, f"01-post-{int(fm['position']):02d}.sql")
        io.open(f, "w", encoding="utf-8").write(sql)
        written.append(f)

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
