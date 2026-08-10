-- Seed: the content currently hardcoded in src/data.js.
--
-- Generated from that file rather than retyped. src/data.js stays in place --
-- the React app still imports it; retiring it belongs to the wiring branch.

-- Levels ---------------------------------------------------------------------

insert into public.levels (slug, name, cefr, position) values
  ('b1-foundation', 'B1 Foundation', 'B1', 1),
  ('b1-momentum',   'B1 Momentum',   'B1', 2);

-- Posts ----------------------------------------------------------------------
-- level_id is resolved by slug so no generated id is ever hardcoded.
--
-- CONTENT WARNING: data.js only ever held two bodies and alternated them across
-- all ten posts via its `t` field. That alternation is reproduced faithfully
-- below, so posts 3-10 carry placeholder prose that does not match its title.
-- Real bodies are needed before launch.

with bodies as (
  select
    $txt$Jeden Morgen fahre ich mit der U-Bahn zur Arbeit. Die Herausforderung beginnt schon am Bahnsteig, wenn alle Fahrgäste gleichzeitig einsteigen wollen.

Nach der Arbeit treffe ich oft Freunde in einem kleinen Café in Kreuzberg. Wir sprechen über den Alltag, über die Mieten und über die Pläne für das Wochenende. Berlin ist laut, aber die Stadt hat eine besondere Energie.

Am Abend lese ich noch eine halbe Stunde auf Deutsch. Das hilft mir, neue Wörter zu behalten. Manchmal verstehe ich nicht jedes Wort, doch der Zusammenhang erklärt fast alles.$txt$::text as t0,
    $txt$Eine Wohnung in München zu finden ist eine echte Herausforderung. Viele Bewerber kommen zur Besichtigung, und der Vermieter möchte oft mehrere Unterlagen sehen.

Man braucht Geduld, ein wenig Glück und einen guten Eindruck. Ich habe zwölf Termine besucht, bevor ich endlich eine Zusage bekommen habe.

Jetzt wohne ich in einem ruhigen Viertel. Der Weg zur Arbeit dauert zwanzig Minuten, und vor dem Haus steht ein alter Baum.$txt$::text as t1
),
incoming (position, slug, title, blurb, t) as (
  values
    (1, 'der-alltag-in-berlin', $txt$Der Alltag in Berlin$txt$, $txt$Commuting, coffee and the rhythm of a loud city.$txt$, 0),
    (2, 'einkaufen-am-samstag', $txt$Einkaufen am Samstag$txt$, $txt$A crowded market, a long list and one forgotten item.$txt$, 1),
    (3, 'beim-arzt', $txt$Beim Arzt$txt$, $txt$Describing symptoms and understanding the reply.$txt$, 0),
    (4, 'die-reise-nach-hamburg', $txt$Die Reise nach Hamburg$txt$, $txt$Train delays, harbour wind and a stranger's advice.$txt$, 1),
    (5, 'ein-brief-an-die-vermieterin', $txt$Ein Brief an die Vermieterin$txt$, $txt$Formal register without sounding stiff.$txt$, 0),
    (6, 'arbeiten-im-homeoffice', $txt$Arbeiten im Homeoffice$txt$, $txt$What changed, and what stubbornly did not.$txt$, 1),
    (7, 'das-fahrrad-ist-weg', $txt$Das Fahrrad ist weg$txt$, $txt$Reporting a theft and the paperwork after.$txt$, 0),
    (8, 'die-wohnungssuche', $txt$Die Wohnungssuche$txt$, $txt$Twelve viewings before one yes.$txt$, 1),
    (9, 'im-restaurant', $txt$Im Restaurant$txt$, $txt$Ordering, complaining politely, splitting the bill.$txt$, 0),
    (10, 'ein-tag-am-see', $txt$Ein Tag am See$txt$, $txt$Weather, plans and the German love of Ruhe.$txt$, 1)
)
insert into public.posts (level_id, position, slug, title, blurb, topic, body, published_at)
select
  (select id from public.levels where slug = 'b1-foundation'),
  i.position,
  i.slug,
  i.title,
  i.blurb,
  'Alltag',
  case i.t when 0 then b.t0 else b.t1 end,
  now()
from incoming i cross join bodies b;

-- Dictionary -----------------------------------------------------------------
-- Keys are normalised surface forms, matching clean(raw).toLowerCase() on the
-- client (src/utils.js).

insert into public.dictionary_entries (term, translation) values
  ($txt$jeden$txt$, $txt$every$txt$),
  ($txt$morgen$txt$, $txt$morning$txt$),
  ($txt$fahre$txt$, $txt$travel, ride$txt$),
  ($txt$ich$txt$, $txt$I$txt$),
  ($txt$mit$txt$, $txt$with$txt$),
  ($txt$der$txt$, $txt$the$txt$),
  ($txt$u-bahn$txt$, $txt$subway$txt$),
  ($txt$zur$txt$, $txt$to the$txt$),
  ($txt$arbeit$txt$, $txt$work$txt$),
  ($txt$die$txt$, $txt$the$txt$),
  ($txt$herausforderung$txt$, $txt$challenge$txt$),
  ($txt$beginnt$txt$, $txt$begins$txt$),
  ($txt$schon$txt$, $txt$already$txt$),
  ($txt$am$txt$, $txt$at the$txt$),
  ($txt$bahnsteig$txt$, $txt$platform$txt$),
  ($txt$wenn$txt$, $txt$when$txt$),
  ($txt$alle$txt$, $txt$all$txt$),
  ($txt$fahrgäste$txt$, $txt$passengers$txt$),
  ($txt$gleichzeitig$txt$, $txt$simultaneously$txt$),
  ($txt$einsteigen$txt$, $txt$to board$txt$),
  ($txt$wollen$txt$, $txt$want$txt$),
  ($txt$nach$txt$, $txt$after$txt$),
  ($txt$treffe$txt$, $txt$meet$txt$),
  ($txt$oft$txt$, $txt$often$txt$),
  ($txt$freunde$txt$, $txt$friends$txt$),
  ($txt$in$txt$, $txt$in$txt$),
  ($txt$einem$txt$, $txt$a$txt$),
  ($txt$kleinen$txt$, $txt$small$txt$),
  ($txt$café$txt$, $txt$café$txt$),
  ($txt$kreuzberg$txt$, $txt$Kreuzberg (district)$txt$),
  ($txt$wir$txt$, $txt$we$txt$),
  ($txt$sprechen$txt$, $txt$talk$txt$),
  ($txt$über$txt$, $txt$about$txt$),
  ($txt$den$txt$, $txt$the$txt$),
  ($txt$alltag$txt$, $txt$everyday life$txt$),
  ($txt$mieten$txt$, $txt$rents$txt$),
  ($txt$und$txt$, $txt$and$txt$),
  ($txt$pläne$txt$, $txt$plans$txt$),
  ($txt$für$txt$, $txt$for$txt$),
  ($txt$das$txt$, $txt$the$txt$),
  ($txt$wochenende$txt$, $txt$weekend$txt$),
  ($txt$berlin$txt$, $txt$Berlin$txt$),
  ($txt$ist$txt$, $txt$is$txt$),
  ($txt$laut$txt$, $txt$loud$txt$),
  ($txt$aber$txt$, $txt$but$txt$),
  ($txt$stadt$txt$, $txt$city$txt$),
  ($txt$hat$txt$, $txt$has$txt$),
  ($txt$eine$txt$, $txt$a$txt$),
  ($txt$besondere$txt$, $txt$special$txt$),
  ($txt$energie$txt$, $txt$energy$txt$),
  ($txt$abend$txt$, $txt$evening$txt$),
  ($txt$lese$txt$, $txt$read$txt$),
  ($txt$noch$txt$, $txt$still$txt$),
  ($txt$halbe$txt$, $txt$half$txt$),
  ($txt$stunde$txt$, $txt$hour$txt$),
  ($txt$auf$txt$, $txt$in, on$txt$),
  ($txt$deutsch$txt$, $txt$German$txt$),
  ($txt$hilft$txt$, $txt$helps$txt$),
  ($txt$mir$txt$, $txt$me$txt$),
  ($txt$neue$txt$, $txt$new$txt$),
  ($txt$wörter$txt$, $txt$words$txt$),
  ($txt$zu$txt$, $txt$to$txt$),
  ($txt$behalten$txt$, $txt$to retain$txt$),
  ($txt$manchmal$txt$, $txt$sometimes$txt$),
  ($txt$verstehe$txt$, $txt$understand$txt$),
  ($txt$nicht$txt$, $txt$not$txt$),
  ($txt$jedes$txt$, $txt$every$txt$),
  ($txt$wort$txt$, $txt$word$txt$),
  ($txt$doch$txt$, $txt$yet$txt$),
  ($txt$zusammenhang$txt$, $txt$context$txt$),
  ($txt$erklärt$txt$, $txt$explains$txt$),
  ($txt$fast$txt$, $txt$almost$txt$),
  ($txt$alles$txt$, $txt$everything$txt$),
  ($txt$wohnung$txt$, $txt$apartment$txt$),
  ($txt$münchen$txt$, $txt$Munich$txt$),
  ($txt$finden$txt$, $txt$to find$txt$),
  ($txt$echte$txt$, $txt$real$txt$),
  ($txt$viele$txt$, $txt$many$txt$),
  ($txt$bewerber$txt$, $txt$applicants$txt$),
  ($txt$kommen$txt$, $txt$come$txt$),
  ($txt$besichtigung$txt$, $txt$viewing$txt$),
  ($txt$vermieter$txt$, $txt$landlord$txt$),
  ($txt$möchte$txt$, $txt$would like$txt$),
  ($txt$mehrere$txt$, $txt$several$txt$),
  ($txt$unterlagen$txt$, $txt$documents$txt$),
  ($txt$sehen$txt$, $txt$to see$txt$),
  ($txt$man$txt$, $txt$one$txt$),
  ($txt$braucht$txt$, $txt$needs$txt$),
  ($txt$geduld$txt$, $txt$patience$txt$),
  ($txt$ein$txt$, $txt$a$txt$),
  ($txt$wenig$txt$, $txt$little$txt$),
  ($txt$glück$txt$, $txt$luck$txt$),
  ($txt$einen$txt$, $txt$a$txt$),
  ($txt$guten$txt$, $txt$good$txt$),
  ($txt$eindruck$txt$, $txt$impression$txt$),
  ($txt$habe$txt$, $txt$have$txt$),
  ($txt$zwölf$txt$, $txt$twelve$txt$),
  ($txt$termine$txt$, $txt$appointments$txt$),
  ($txt$besucht$txt$, $txt$visited$txt$),
  ($txt$bevor$txt$, $txt$before$txt$),
  ($txt$endlich$txt$, $txt$finally$txt$),
  ($txt$zusage$txt$, $txt$acceptance$txt$),
  ($txt$bekommen$txt$, $txt$received$txt$),
  ($txt$jetzt$txt$, $txt$now$txt$),
  ($txt$wohne$txt$, $txt$live$txt$),
  ($txt$ruhigen$txt$, $txt$quiet$txt$),
  ($txt$viertel$txt$, $txt$neighbourhood$txt$),
  ($txt$weg$txt$, $txt$way$txt$),
  ($txt$dauert$txt$, $txt$takes$txt$),
  ($txt$zwanzig$txt$, $txt$twenty$txt$),
  ($txt$minuten$txt$, $txt$minutes$txt$),
  ($txt$vor$txt$, $txt$in front of$txt$),
  ($txt$dem$txt$, $txt$the$txt$),
  ($txt$haus$txt$, $txt$house$txt$),
  ($txt$steht$txt$, $txt$stands$txt$),
  ($txt$alter$txt$, $txt$old$txt$),
  ($txt$baum$txt$, $txt$tree$txt$);
