-- Optional: adds the full "Amazing Grace" (public domain, John Newton, 1779)
-- to the first church so you have something to look at. Run in the Supabase
-- SQL Editor after the songs migration and the church seed. Running it again
-- replaces the lyrics of an existing "Amazing Grace" with this version.

do $do$
declare
  song_body text := $body${start_of_verse: Verse 1}
[G]Amazing [G7]grace, how [C]sweet the [G]sound
That [G]saved a [Em]wretch like [D]me
I [G]once was [G7]lost, but [C]now am [G]found
Was [Em]blind, but [D]now I [G]see
{end_of_verse}

{start_of_verse: Verse 2}
'Twas [G]grace that [G7]taught my [C]heart to [G]fear
And [G]grace my [Em]fears re[D]lieved
How [G]precious [G7]did that [C]grace ap[G]pear
The [Em]hour I [D]first be[G]lieved
{end_of_verse}

{start_of_verse: Verse 3}
Through [G]many [G7]dangers, [C]toils and [G]snares
I [G]have al[Em]ready [D]come
'Tis [G]grace hath [G7]brought me [C]safe thus [G]far
And [Em]grace will [D]lead me [G]home
{end_of_verse}

{start_of_verse: Verse 4}
The [G]Lord has [G7]promised [C]good to [G]me
His [G]word my [Em]hope se[D]cures
He [G]will my [G7]shield and [C]portion [G]be
As [Em]long as [D]life en[G]dures
{end_of_verse}

{start_of_verse: Verse 5}
Yea, [G]when this [G7]flesh and [C]heart shall [G]fail
And [G]mortal [Em]life shall [D]cease
I [G]shall pos[G7]sess, with[C]in the [G]veil
A [Em]life of [D]joy and [G]peace
{end_of_verse}

{start_of_verse: Verse 6}
The [G]earth shall [G7]soon dis[C]solve like [G]snow
The [G]sun for[Em]bear to [D]shine
But [G]God, who [G7]called me [C]here be[G]low
Will [Em]be for[D]ever [G]mine
{end_of_verse}

{start_of_verse: Verse 7}
When [G]we've been [G7]there ten [C]thousand [G]years
Bright [G]shining [Em]as the [D]sun
We've [G]no less [G7]days to [C]sing God's [G]praise
Than [Em]when we'd [D]first be[G]gun
{end_of_verse}
$body$;
begin
  update public.songs s
     set body = song_body
    from public.churches c
   where c.id = s.church_id
     and c.slug = 'friends-of-jesus-christ-canada'
     and s.title = 'Amazing Grace';

  insert into public.songs (church_id, title, artist, original_key, tempo, time_signature, body)
  select c.id, 'Amazing Grace', 'John Newton', 'G', 72, '3/4', song_body
    from public.churches c
   where c.slug = 'friends-of-jesus-christ-canada'
     and not exists (
       select 1 from public.songs s where s.church_id = c.id and s.title = 'Amazing Grace'
     );
end
$do$;
