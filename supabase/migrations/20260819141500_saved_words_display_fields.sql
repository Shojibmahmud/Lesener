-- Two columns the vocabulary bank needs in order to render what it renders.
--
-- Neither is a key. `term` stays the lowercase surface form that
-- unique (user_id, term) and the dictionary lookup depend on; these two exist
-- only so the bank can show a word the way the reader actually met it.

alter table public.saved_words
  -- clean(raw) exactly as it appeared in the prose, so a German noun keeps its
  -- capital and a verb does not gain one. German capitalises every noun in
  -- running text, which makes the surface form correct for free -- except for a
  -- non-noun tapped as the first word of a sentence, which keeps that
  -- sentence's capital. Accepted; correcting it needs the right form authored
  -- once per dictionary entry, which is separate work.
  add column surface_form text not null,

  -- The post heading as it read when the word was saved, e.g.
  -- 'Post 1: Der Alltag in Berlin'. The bank prefers the live title looked up
  -- from the library, so renaming a post reaches the bank on the next load;
  -- this is read only when post_id no longer resolves to anything the reader
  -- can see -- a deleted post (post_id is then null, ON DELETE SET NULL) or an
  -- unpublished one (withheld by posts_select_unlocked, so absent from the
  -- library entirely).
  --
  -- Deliberately unconstrained against post_id. A post may be renamed or
  -- deleted afterwards and the whole point of the column is to go on saying
  -- what it said then. NOT NULL is honest rather than merely convenient: a word
  -- can only be created by tapping it inside a post, so no path produces one
  -- without a heading.
  add column post_label text not null,

  -- Makes the two word columns impossible to disagree. Safe because clean()
  -- emits a closed alphabet (A-Za-zAOUaouss and the hyphen) on which Postgres
  -- lower() and JavaScript toLowerCase() agree character for character.
  add constraint saved_words_surface_form_matches
    check (term = lower(surface_form));
