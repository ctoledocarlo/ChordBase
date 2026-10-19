import type { ChordQuality } from "@/lib/theory/chords";
import type { ScaleType } from "@/lib/theory/scales";

/**
 * The Practice curriculum for the keys. Plain data: the text of each lesson, in order, with the interactive
 * keyboards placed where they help. Text uses **double stars** for bold.
 */

export type WidgetBlock =
  | { id: "note-names" }
  | { id: "step-explorer" }
  | { id: "hand-position" }
  | { id: "note-quiz" }
  | { id: "chord-quiz" }
  | { id: "scale-explorer"; types?: ScaleType[]; root?: string; type?: ScaleType }
  | { id: "circle" }
  | { id: "intervals" }
  | { id: "chord-builder"; kinds?: ChordQuality[]; root?: string; quality?: ChordQuality }
  | { id: "inversions"; root?: string }
  | { id: "key-chords"; root?: string; mode?: "major" | "minor" }
  | { id: "checklist" };

export type Block =
  | { t: "p"; text: string }
  | { t: "h"; text: string }
  | { t: "list"; items: string[]; ordered?: boolean }
  | { t: "tip"; text: string; title?: string }
  | { t: "try"; text: string }
  | { t: "widget"; widget: WidgetBlock }
  | { t: "terms"; items: { term: string; text: string }[] };

export type Lesson = {
  slug: string;
  title: string;
  summary: string;
  minutes: number;
  group: "Foundations" | "Keys and chords" | "Playing" | "Tools";
  kind: "lesson" | "tool";
  blocks: Block[];
};

export const LESSONS: Lesson[] = [
  {
    slug: "start-here",
    title: "Start here",
    summary: "How this section works, how to sit, and how to practise well",
    minutes: 5,
    group: "Foundations",
    kind: "lesson",
    blocks: [
      {
        t: "p",
        text: "This section teaches you the piano keys from the very beginning. You don't need to read music, and you don't need to know anything yet. Every lesson has a keyboard you can press, so you can **hear and see** each idea as you read about it.",
      },
      { t: "h", text: "How to use it" },
      {
        t: "list",
        items: [
          "Go in order the first time. Each lesson builds on the one before it.",
          "Press the keys on the screen to hear them. There is a **Sound** switch on every keyboard if you want quiet.",
          "At the end of a lesson, tick **Mark as done**. The ticks stay on this device so you can see how far you have come.",
          "The **Tools** at the bottom of the list (scale finder, chord finder, quizzes) are always there for when you need to look something up.",
        ],
      },
      { t: "h", text: "Sit so playing is easy" },
      {
        t: "list",
        items: [
          "Sit toward the front of the seat, tall but relaxed, with your feet flat on the floor.",
          "Your forearms should be about level with the keys, elbows a little out from your sides.",
          "Keep your wrists level (not drooping, not lifted) and your shoulders loose.",
          "Curve your fingers as if you were holding a small ball, and play with the tips.",
        ],
      },
      { t: "tip", title: "If it hurts, stop", text: "Playing should feel relaxed. Tension in your shoulders, wrists or hands is a sign to slow down, shake your hands out, and start again." },
      { t: "h", text: "Practise a little, often" },
      {
        t: "p",
        text: "Ten minutes every day beats an hour once a week. Your hands learn by repeating small things slowly, and they remember best when you sleep in between. When something feels hard, play it **slower**, not harder.",
      },
      { t: "h", text: "A real keyboard or the one on the screen?" },
      {
        t: "p",
        text: "The on-screen keys are great for seeing and hearing how things work. A real piano or keyboard is where your fingers actually learn, so if you have one, follow along on it. If you don't hear anything on a phone, check that it isn't on silent and the volume is up.",
      },
      {
        t: "p",
        text: "**Ready?** The next lesson shows you the keyboard itself.",
      },
    ],
  },

  {
    slug: "the-keyboard",
    title: "Meet the keyboard",
    summary: "White and black keys, the note names, and how to find C",
    minutes: 10,
    group: "Foundations",
    kind: "lesson",
    blocks: [
      {
        t: "p",
        text: "A piano has white keys and black keys. Together they make a pattern that repeats along the whole keyboard, and that pattern is your map.",
      },
      { t: "h", text: "Black keys come in twos and threes" },
      {
        t: "p",
        text: "Look at the black keys below. They sit in groups: **two**, then **three**, then two, then three. You never have to count keys to find your place. You only have to spot those groups.",
      },
      { t: "widget", widget: { id: "note-names" } },
      { t: "h", text: "Find C" },
      {
        t: "p",
        text: "The white key just to the **left of every group of two black keys** is **C**. Press the C keys above and hear how they all sound like the same note, only higher or lower.",
      },
      { t: "h", text: "Seven letters, over and over" },
      {
        t: "p",
        text: "White keys are named with the first seven letters of the alphabet: **A B C D E F G**. After G the names start again at A. From one C to the next C is one **octave**.",
      },
      {
        t: "list",
        items: [
          "Going to the **right** the notes sound higher. Going to the **left** they sound lower.",
          "The little dot on a white key marks **middle C**, the C nearest the middle of the keyboard. It's your home base.",
        ],
      },
      {
        t: "tip",
        title: "A trick for the other white keys",
        text: "Around the group of two black keys: **C** is on the left of it, **D** sits between the two, **E** is on the right. Around the group of three: **F** is on the left, **G** and **A** sit between the black keys, and **B** is on the right.",
      },
      { t: "try", text: "Turn on “All keys” in Show names, press every key from C to the next C, and say each name out loud." },
      { t: "h", text: "Quick quiz" },
      { t: "p", text: "A name appears. Press that key anywhere on the keyboard. Start with white keys." },
      { t: "widget", widget: { id: "note-quiz" } },
    ],
  },

  {
    slug: "steps",
    title: "Half steps, whole steps, sharps and flats",
    summary: "The two sizes of step, and why black keys have two names",
    minutes: 10,
    group: "Foundations",
    kind: "lesson",
    blocks: [
      {
        t: "p",
        text: "Music moves in small steps. There are only two sizes you need to know, and everything else in this section is built from them.",
      },
      {
        t: "list",
        items: [
          "A **half step** is the distance from one key to the very next key, black or white. It is the smallest step on the piano.",
          "A **whole step** is two half steps: you skip over one key.",
        ],
      },
      { t: "widget", widget: { id: "step-explorer" } },
      { t: "tip", title: "Two places with no black key", text: "There is no black key between **E and F**, or between **B and C**. Those pairs are already a half step apart. Everywhere else, two neighbouring white keys are a whole step apart, with a black key in between." },
      { t: "h", text: "Why does a black key have two names?" },
      {
        t: "p",
        text: "A black key sits between two white keys. It is a half step **above** the white key on its left, and a half step **below** the white key on its right.",
      },
      {
        t: "list",
        items: [
          "A **sharp** (♯) means “up a half step”. The black key above C is **C♯**.",
          "A **flat** (♭) means “down a half step”. The same black key is also **D♭**, because it is a half step below D.",
          "A **natural** (♮) means a plain white-key note, with no sharp or flat.",
        ],
      },
      {
        t: "p",
        text: "C♯ and D♭ are one key with two names. Which name a song uses depends on its key. You will see why in the scales lesson, and the Practice tools always spell the notes the way a musician would.",
      },
      {
        t: "try",
        text: "Start on E. Press a half step up. What do you land on? (F, a white key.) Now start on F♯ and go up a whole step. (G♯.)",
      },
    ],
  },

  {
    slug: "fingers",
    title: "Your hands and finger numbers",
    summary: "Number your fingers and put both hands on the keys",
    minutes: 10,
    group: "Foundations",
    kind: "lesson",
    blocks: [
      {
        t: "p",
        text: "Piano music numbers the fingers the same way for both hands, starting from the thumb. Learning these five numbers lets any fingering chart, here or in a book, make sense.",
      },
      {
        t: "list",
        items: ["**1** = thumb", "**2** = index finger", "**3** = middle finger", "**4** = ring finger", "**5** = little finger"],
      },
      { t: "h", text: "Five-finger position" },
      {
        t: "p",
        text: "The simplest hand position puts one finger on each of five neighbouring white keys. Your right thumb goes on the lowest key and your little finger on the highest. Your left hand is the mirror: little finger on the lowest key, thumb on the highest.",
      },
      { t: "widget", widget: { id: "hand-position" } },
      {
        t: "list",
        items: [
          "Choose **Right** or **Left** and press Play to hear and watch the five fingers go up and back.",
          "Change where your thumb (or little finger) starts to move the whole hand along the keyboard.",
        ],
      },
      {
        t: "tip",
        title: "How a good hand looks",
        text: "Fingers curved, tips on the keys. Thumb resting on its side edge, not flat. Wrist level with your hand, arm relaxed. Let the weight of your arm do the pressing, rather than squeezing with your fingers.",
      },
      {
        t: "try",
        text: "Right hand first: play 1 2 3 4 5 4 3 2 1 slowly and evenly, every note the same loudness. Then the left hand. Then try it soft, then louder.",
      },
    ],
  },

  {
    slug: "major-scales",
    title: "Major scales",
    summary: "The pattern behind every major key, with fingering",
    minutes: 20,
    group: "Foundations",
    kind: "lesson",
    blocks: [
      {
        t: "p",
        text: "A **scale** is a set of notes in order, going up one after another. The **major scale** is the one you know as “do, re, mi, fa, sol, la, ti, do”. It sounds bright and settled, and most songs you sing in church are built from one.",
      },
      { t: "h", text: "The recipe" },
      {
        t: "p",
        text: "Every major scale follows the same pattern of steps: **whole, whole, half, whole, whole, whole, half** (W W H W W W H). Start on any key, follow that pattern, and you get a major scale. The note you start on names the scale: start on G and it is the G major scale.",
      },
      { t: "widget", widget: { id: "scale-explorer", types: ["major"], root: "C" } },
      {
        t: "list",
        items: [
          "Try **C** first: all white keys.",
          "Switch to **G**. The recipe forces a black key (F♯), because the last step up to the top G has to be a half step.",
          "Press **Play the scale** to hear that every key sounds like the same “do re mi” tune, just higher or lower.",
        ],
      },
      { t: "h", text: "Why some keys need black keys" },
      {
        t: "p",
        text: "The white keys by themselves only give the right pattern when you start on C. Start anywhere else and the whole and half steps land in the wrong places, so the scale borrows a black key to fix them. That is where sharps and flats come from.",
      },
      { t: "h", text: "Fingering: moving smoothly" },
      {
        t: "p",
        text: "You have five fingers but eight notes, so your hand has to travel. The classic way is to play three notes, tuck your **thumb under** your hand to start the next group, and carry on. Going down, you cross your fingers over the thumb instead. The finger numbers on the keyboard above show the standard fingering for every major key.",
      },
      {
        t: "list",
        items: [
          "In the right hand, going up: after finger 3 (or 4), tuck the thumb under.",
          "The thumb avoids black keys, which are harder to reach and make the hand twist.",
          "In the left hand, the numbers run the other way: start with the little finger.",
          "Switch the hand to **Left** to see the left-hand fingering.",
        ],
      },
      { t: "tip", title: "Slow beats fast", text: "Play each hand on its own, very slowly, until the fingering is automatic. Only then join the hands. A metronome helps: the one in a setlist's side panel works for this." },
      { t: "try", text: "Learn C, G, D and F first. They are the keys used in most worship songs, and they cover the main finger patterns." },
    ],
  },

  {
    slug: "key-signatures",
    title: "Keys and the circle of fifths",
    summary: "What a key is, its sharps and flats, and a map of all twelve",
    minutes: 15,
    group: "Keys and chords",
    kind: "lesson",
    blocks: [
      {
        t: "p",
        text: "The **key** of a song is the scale it is built on, its “home”. A song in G uses the notes of the G major scale, and it feels finished when it comes back to the note G. The sharps or flats a key needs, written at the start of the music, are its **key signature**.",
      },
      { t: "widget", widget: { id: "circle" } },
      { t: "h", text: "How to read the circle" },
      {
        t: "list",
        items: [
          "The big outer ring has the **major keys**. The inner ring has their **relative minors** (the minor key that shares the same notes).",
          "Going **clockwise** moves up a fifth and adds **one more sharp**: C has none, G has one, D has two, A has three, and so on.",
          "Going **counter-clockwise** moves down a fifth and adds **one more flat**: F has one, B♭ has two, E♭ has three.",
          "The keys **next door** share all but one note with yours. Songs often visit them, which is why the chords I, IV and V of a key are the key itself and its two neighbours.",
          "At the bottom, F♯ and G♭ are the same key written two ways.",
        ],
      },
      {
        t: "tip",
        title: "Remembering the order of the sharps",
        text: "Sharps are added in this order: **F C G D A E B** (“Father Charles Goes Down And Ends Battle”). Flats are the same list backwards: **B E A D G C F**. So a key with three sharps has F♯, C♯ and G♯.",
      },
      { t: "try", text: "Pick a key on the circle and play its scale from the keyboard under it. Then pick its neighbour and notice how few notes change." },
    ],
  },

  {
    slug: "intervals",
    title: "Intervals: the distance between notes",
    summary: "Name and hear every distance from a half step to an octave",
    minutes: 15,
    group: "Keys and chords",
    kind: "lesson",
    blocks: [
      {
        t: "p",
        text: "An **interval** is the distance between two notes. Chords, melodies and scales are all made of intervals, so knowing them is like knowing the alphabet.",
      },
      { t: "h", text: "Counting an interval" },
      {
        t: "p",
        text: "To name an interval, count the **letters**, including the first and the last. C up to E is C-D-E: three letters, so it is a **3rd**. C up to G is C-D-E-F-G: a **5th**.",
      },
      {
        t: "p",
        text: "Then the number of **half steps** tells you the flavour. A 3rd that is 4 half steps wide is a **major 3rd**, bright and happy. A 3rd that is 3 half steps wide is a **minor 3rd**, softer and sadder. The same goes for 2nds, 6ths and 7ths. 4ths, 5ths and octaves are called **perfect**.",
      },
      { t: "widget", widget: { id: "intervals" } },
      {
        t: "list",
        items: [
          "Turn on **Count the half steps** to see the number on every key between the two notes.",
          "Press **Together** and **One, then the other** to hear each interval both ways.",
          "Each one has a few words on how it feels, and a tune that starts with it.",
        ],
      },
      { t: "h", text: "Why this matters" },
      {
        t: "p",
        text: "The two intervals that matter most are the **major 3rd** and the **minor 3rd**. Whether a chord is major or minor depends on which of them sits at the bottom. You will build chords from them next.",
      },
      { t: "try", text: "Pick C as the bottom note and play a major 3rd, then a minor 3rd. Hear how the first is brighter and the second a little darker." },
    ],
  },

  {
    slug: "triads",
    title: "Chords: building triads",
    summary: "Major, minor and the other three-note chords, with fingering",
    minutes: 20,
    group: "Keys and chords",
    kind: "lesson",
    blocks: [
      {
        t: "p",
        text: "A **chord** is three or more notes played together. The simplest and most common kind is a **triad**: three notes stacked like steps on a ladder, each one a third above the last. The bottom note is the **root**, and it gives the chord its name.",
      },
      {
        t: "p",
        text: "A **major** chord is the root, the note a **major 3rd** above it, and the note a **5th** above it. We write that as **1 3 5**. Try it: pick a root, and watch the three keys light up.",
      },
      { t: "widget", widget: { id: "chord-builder", kinds: ["major", "minor", "dim", "aug", "sus2", "sus4"], root: "C", quality: "major" } },
      { t: "h", text: "Major and minor: one note of difference" },
      {
        t: "p",
        text: "To make a major chord **minor**, lower the middle note by one half step. C major is C–E–G. C minor is C–E♭–G. That single change turns bright into dark. Switch between Major and Minor above and listen.",
      },
      { t: "h", text: "The six triads" },
      {
        t: "list",
        items: [
          "**Major** (1 3 5): bright and happy.",
          "**Minor** (1 ♭3 5): soft and thoughtful.",
          "**Diminished** (1 ♭3 ♭5): tense, wants to move on.",
          "**Augmented** (1 3 ♯5): dreamy and stretched.",
          "**Sus2** (1 2 5) and **sus4** (1 4 5): open, neither happy nor sad. Very popular in worship.",
        ],
      },
      { t: "h", text: "Fingering" },
      {
        t: "p",
        text: "In the **right hand** a triad is fingered **1 – 3 – 5**: thumb on the root, middle finger on the middle note, little finger on the top. In the **left hand** it is the mirror, **5 – 3 – 1**. Switch the hand above to see the left-hand version, lower on the keyboard.",
      },
      { t: "try", text: "Play C, F and G major chords with your right hand, then lower the middle note of each to make them minor." },
      { t: "h", text: "Build it yourself" },
      { t: "p", text: "A chord name appears. Press the keys that make it, then check. Any octave counts." },
      { t: "widget", widget: { id: "chord-quiz" } },
    ],
  },

  {
    slug: "chords-in-key",
    title: "Chords in a key, and progressions",
    summary: "The seven chords of every key, Roman numerals, and the patterns songs use",
    minutes: 20,
    group: "Keys and chords",
    kind: "lesson",
    blocks: [
      {
        t: "p",
        text: "Build a triad on each of the seven notes of a major scale, using only notes from that scale, and you get the **seven chords of the key**. Some come out major, some minor, and one diminished, in the same pattern for every key.",
      },
      { t: "widget", widget: { id: "key-chords", root: "C", mode: "major" } },
      { t: "h", text: "Roman numerals" },
      {
        t: "p",
        text: "Musicians name those chords by number, with Roman numerals: **I ii iii IV V vi vii°**. A capital letter means major, a small one means minor, and ° means diminished. The big advantage is that the numbers work in **every key**.",
      },
      {
        t: "p",
        text: "A chart that says **I – V – vi – IV** means C, G, Am, F in the key of C. In the key of G it means G, D, Em, C. The pattern is the same; only the starting note moves. This is exactly what happens when you change a song's key in ChordBase.",
      },
      { t: "h", text: "The three families" },
      {
        t: "list",
        items: [
          "**I** is **home**. It is where a song starts and wants to end.",
          "**IV** and **ii** lift away from home. **IV** is the “amen” chord.",
          "**V** (and **vii°**) build tension that wants to resolve back to **I**.",
          "**vi** is the **relative minor**: the sad cousin of I, and a favourite for adding emotion.",
        ],
      },
      { t: "h", text: "Try the progressions" },
      {
        t: "p",
        text: "Pick a progression below the keyboard, and press **Play it**. The chords light up in order. Leave **Keep my hand still** ticked and notice that your hand barely moves: the next lesson explains how.",
      },
      { t: "try", text: "Play I – V – vi – IV in C, then in G, then in D. Say the numbers out loud as you go." },
    ],
  },

  {
    slug: "inversions",
    title: "Inversions and smooth chord changes",
    summary: "The same chord in a different order, so your hand stays still",
    minutes: 15,
    group: "Keys and chords",
    kind: "lesson",
    blocks: [
      {
        t: "p",
        text: "Chords don't have to start on the root. An **inversion** plays the same three notes in a different order, with another note on the bottom. It sounds like the same chord, but a little different.",
      },
      { t: "widget", widget: { id: "inversions", root: "C" } },
      {
        t: "list",
        items: [
          "**Root position:** the root is the lowest note (C–E–G).",
          "**1st inversion:** the root moves up an octave, so the 3rd is lowest (E–G–C).",
          "**2nd inversion:** the 3rd moves up as well, so the 5th is lowest (G–C–E).",
        ],
      },
      { t: "h", text: "Why play inversions?" },
      {
        t: "p",
        text: "So your hand doesn't jump all over the keyboard. Look at C, then F, then G, all in root position: your hand leaps up and down. Now play C (C–E–G), then **F with C on the bottom** (C–F–A), then **G with D on the bottom** (D–G–B). Each finger moves only a step or two, and the chords flow.",
      },
      {
        t: "tip",
        title: "Slash chords",
        text: "A chart may say **F/C** or **G/B**. That means “play the F chord, with C (or B) as the lowest note”. It is simply an inversion, or a different note in the bass.",
      },
      { t: "try", text: "Play C – F/C – G/D – C in the right hand. Count how many fingers stay on the same key between chords." },
    ],
  },

  {
    slug: "sevenths-and-colours",
    title: "Seventh chords and colours",
    summary: "7ths, sus and add9: adding shimmer and mood to a chord",
    minutes: 15,
    group: "Keys and chords",
    kind: "lesson",
    blocks: [
      {
        t: "p",
        text: "Triads are plain and strong. Adding one more note, or swapping one, gives a chord a **colour**. A little colour goes a long way: one coloured chord in a slow song can change the whole feeling.",
      },
      {
        t: "widget",
        widget: {
          id: "chord-builder",
          kinds: ["major", "minor", "sus2", "sus4", "add9", "dom7", "maj7", "min7", "m7b5"],
          root: "C",
          quality: "maj7",
        },
      },
      { t: "h", text: "The colours worth knowing" },
      {
        t: "list",
        items: [
          "**sus2 and sus4:** the 3rd is swapped for the 2nd or the 4th. Open and airy, with the question left hanging. A staple of worship pads.",
          "**add9:** a major chord with a sparkling extra note on top. Same mood as the plain chord, with a little shimmer.",
          "**Major 7th (maj7):** smooth, warm, a little dreamy.",
          "**Minor 7th (m7):** mellow and soulful. Common in gospel.",
          "**Dominant 7th (7):** a major chord with a restless, bluesy note that leans toward the next chord.",
        ],
      },
      {
        t: "p",
        text: "ChordBase has these in mind: the **Chord style** setting (Jazzy and Gospel) swaps plain chords for coloured ones using simple rules. Now you can hear and see what it is doing.",
      },
      { t: "tip", title: "Don't add everything", text: "Pick one colour at a time. Try an add9 or a sus in place of the plain chord in a slow song, and see whether it helps." },
      { t: "try", text: "Play C, then Csus4, then C again. Hear the “hanging then settling” feeling. Do the same with Csus2." },
    ],
  },

  {
    slug: "minor-keys",
    title: "Minor keys and minor scales",
    summary: "Relative minors, and the three kinds of minor scale",
    minutes: 15,
    group: "Keys and chords",
    kind: "lesson",
    blocks: [
      {
        t: "p",
        text: "Every major key has a **relative minor**: a minor key that uses the very same notes but sounds darker, because its “home” is a different note. To find it, go to the **6th note** of the major scale. In C major, the 6th note is A, so A minor is C major's relative.",
      },
      {
        t: "p",
        text: "The **natural minor scale** follows this pattern: **W H W W H W W**. Compare it to the major pattern (W W H W W W H) and you will see it is the same pattern, starting from a different place.",
      },
      {
        t: "widget",
        widget: {
          id: "scale-explorer",
          types: ["natural-minor", "harmonic-minor", "melodic-minor", "minor-pentatonic", "blues"],
          type: "natural-minor",
          root: "A",
        },
      },
      { t: "h", text: "Three kinds of minor scale" },
      {
        t: "list",
        items: [
          "**Natural minor:** the plain version, straight from the major scale's pattern.",
          "**Harmonic minor:** raises the 7th note by a half step, so the scale leans strongly into the top note. It has a distinctive, slightly exotic sound.",
          "**Melodic minor (going up):** raises the 6th and 7th, to smooth the climb.",
        ],
      },
      {
        t: "p",
        text: "The **pentatonic** and **blues** scales above are five- and six-note shortcuts. They leave out the notes most likely to clash, which is why they are the first scales many people improvise with.",
      },
      { t: "tip", title: "Finding the relative minor on the keyboard", text: "Go **down three half steps** from the major key's note. From C that lands on A. From G it lands on E." },
      { t: "try", text: "Play the C major scale, then the A natural minor scale. Same white keys, different home. Hear how the mood changes." },
    ],
  },

  {
    slug: "worship-playing",
    title: "Playing in church",
    summary: "Putting it together: find the key, the chords, and a simple pattern",
    minutes: 20,
    group: "Playing",
    kind: "lesson",
    blocks: [
      {
        t: "p",
        text: "You now have everything you need to play most worship songs. Here is how it fits together, one step at a time. Start slowly and simply: a good sustained chord under a congregation does more than a busy part.",
      },
      {
        t: "list",
        ordered: true,
        items: [
          "**Find the key.** Look at the song in ChordBase. The first chord is usually the key (a song starting on G is usually in G).",
          "**Find the chords.** Use the chords of the key below. Most songs use only I, IV, V and vi.",
          "**Left hand: the root.** Play just the root of each chord, low on the keyboard. Notes an octave apart (the root twice) sound fuller.",
          "**Right hand: the triad.** Use inversions so your hand stays still, as in the last lessons.",
          "**Add rhythm gradually.** Hold each chord for a full bar, then try playing it on every beat, then spread the notes out as a gentle pattern.",
        ],
      },
      { t: "widget", widget: { id: "key-chords", root: "G", mode: "major" } },
      { t: "h", text: "Common patterns" },
      {
        t: "list",
        items: [
          "**Pad:** hold one chord for the whole bar with the sustain pedal. It fills the room without taking over.",
          "**Root and fifth:** play the root and the 5th above it together in the left hand. Strong and open.",
          "**Spread chord:** play the three notes of the chord one at a time, from the bottom, and repeat.",
        ],
      },
      {
        t: "tip",
        title: "The sustain pedal",
        text: "The right-hand pedal makes notes keep ringing. Press it down as you play a chord, and lift it **just as you change** to the next chord, then press again. If you don't, chords blur into each other.",
      },
      { t: "h", text: "Thinking in numbers" },
      {
        t: "p",
        text: "If the leader says “let's go up a step”, you don't need to relearn the song: it is the same **numbers** in a new key. That's what Roman numerals are for. Practise your three most-used keys (C, G and D) first, then F and A.",
      },
      { t: "try", text: "Play a favourite song's chords in the key of G, left hand root, right hand triad. Then change the key in ChordBase, and play the same song in D." },
    ],
  },

  {
    slug: "practice-plan",
    title: "A 10-minute daily plan",
    summary: "What to practise, in what order, and how to track it",
    minutes: 10,
    group: "Playing",
    kind: "lesson",
    blocks: [
      {
        t: "p",
        text: "Short, regular practice works best. Here is a plan that fits in ten minutes. It warms up your hands, builds your skills, and ends with real playing.",
      },
      {
        t: "list",
        ordered: true,
        items: [
          "**Warm up (2 minutes).** Five-finger position in each hand, slowly. Up and back, even and quiet.",
          "**A scale (3 minutes).** One scale, hands separately and then together. Use a different key each day.",
          "**Chords (3 minutes).** Pick three chords you need this week, and move between them with smooth inversions.",
          "**A song (2 minutes).** Play a song's chords slowly, start to finish, without stopping for mistakes.",
        ],
      },
      { t: "h", text: "Today's checklist" },
      { t: "widget", widget: { id: "checklist" } },
      { t: "h", text: "How to improve faster" },
      {
        t: "list",
        items: [
          "**Slow down.** Play at the speed you can play perfectly, then speed up a little at a time.",
          "**Fix the small spot.** If one change is hard, practise just those two chords over and over, not the whole song.",
          "**Look at the music, not your hands,** as soon as you can. Your fingers know where the keys are.",
          "**Listen.** Does each note sound even? Is the chord change clean?",
          "**Rest.** A short break, or a night's sleep, helps what you practised to stick.",
        ],
      },
      { t: "h", text: "Goals to aim for" },
      {
        t: "list",
        items: [
          "**Week 1–2:** find any key by name, and play the five-finger position in both hands.",
          "**Week 3–4:** play C, G, D and F major scales with the right fingering, hands separately.",
          "**Month 2:** play the I, IV, V and vi chords in C, G and D with inversions.",
          "**Month 3:** play a whole song with a pad or a simple pattern in the left hand.",
        ],
      },
    ],
  },

  // --------------------------------------------------------------------------------------------- tools

  {
    slug: "scale-finder",
    title: "Scale finder",
    summary: "Any scale in any key, with notes and fingering",
    minutes: 0,
    group: "Tools",
    kind: "tool",
    blocks: [
      { t: "p", text: "Pick a kind of scale and a starting note. You get the notes, the pattern of steps, the key signature and the fingering for the right or left hand." },
      { t: "widget", widget: { id: "scale-explorer" } },
    ],
  },
  {
    slug: "chord-finder",
    title: "Chord finder",
    summary: "Any chord: its keys, fingers and inversions",
    minutes: 0,
    group: "Tools",
    kind: "tool",
    blocks: [
      { t: "p", text: "Pick a root and a kind of chord to see which keys to press and which fingers to use. Try the other orders of the notes (inversions) too." },
      {
        t: "widget",
        widget: { id: "chord-builder", kinds: ["major", "minor", "dim", "aug", "sus2", "sus4", "add9", "dom7", "maj7", "min7", "m7b5"], root: "C", quality: "major" },
      },
    ],
  },
  {
    slug: "key-lab",
    title: "Key and chord lab",
    summary: "The chords of any key, and progressions to play along with",
    minutes: 0,
    group: "Tools",
    kind: "tool",
    blocks: [
      { t: "p", text: "Pick a key to see its seven chords. Press one to hear it, or play a whole progression with your hand kept still." },
      { t: "widget", widget: { id: "key-chords", root: "C", mode: "major" } },
    ],
  },
  {
    slug: "circle-of-fifths",
    title: "Circle of fifths",
    summary: "All twelve keys on one map",
    minutes: 0,
    group: "Tools",
    kind: "tool",
    blocks: [
      { t: "p", text: "Choose a key to see its sharps or flats, its notes, its main chords and its neighbours." },
      { t: "widget", widget: { id: "circle" } },
    ],
  },
  {
    slug: "quizzes",
    title: "Quizzes",
    summary: "Find the note and build the chord",
    minutes: 0,
    group: "Tools",
    kind: "tool",
    blocks: [
      { t: "h", text: "Find the note" },
      { t: "widget", widget: { id: "note-quiz" } },
      { t: "h", text: "Build the chord" },
      { t: "widget", widget: { id: "chord-quiz" } },
    ],
  },
  {
    slug: "glossary",
    title: "Glossary",
    summary: "Every word used here, in plain language",
    minutes: 0,
    group: "Tools",
    kind: "tool",
    blocks: [
      {
        t: "terms",
        items: [
          { term: "Accidental", text: "A sharp, flat or natural sign that changes a note from its plain white-key version." },
          { term: "Arpeggio", text: "The notes of a chord played one at a time instead of together." },
          { term: "Augmented chord", text: "A major chord with the top note raised a half step. Dreamy and stretched." },
          { term: "Chord", text: "Three or more notes played together." },
          { term: "Chord progression", text: "A series of chords, like I – V – vi – IV." },
          { term: "Circle of fifths", text: "A map of the twelve keys, where each step clockwise goes up a fifth and adds a sharp (or removes a flat)." },
          { term: "Diminished chord", text: "A minor chord with the top note lowered a half step. Tense and unsettled." },
          { term: "Flat (♭)", text: "Lowers a note by a half step." },
          { term: "Half step", text: "The distance from one key to the very next, black or white. The smallest step on the piano." },
          { term: "Interval", text: "The distance between two notes, like a 3rd or a 5th." },
          { term: "Inversion", text: "The same chord with a different note on the bottom." },
          { term: "Key", text: "The scale a song is built on, and the note it feels at home on." },
          { term: "Key signature", text: "The sharps or flats a key needs, written at the start of the music." },
          { term: "Major", text: "The bright, settled sound. Used for scales, keys and chords." },
          { term: "Middle C", text: "The C closest to the middle of the keyboard." },
          { term: "Minor", text: "The darker, softer sound. Used for scales, keys and chords." },
          { term: "Natural (♮)", text: "A plain white-key note, with no sharp or flat." },
          { term: "Octave", text: "The distance from one note to the next note with the same name: 12 half steps." },
          { term: "Pitch", text: "How high or low a note sounds." },
          { term: "Relative minor", text: "The minor key that shares a major key's notes. It starts on the major scale's 6th note." },
          { term: "Root", text: "The note a chord is built on and named after." },
          { term: "Roman numerals", text: "A way to name chords by their place in a key (I, ii, iii, IV, V, vi, vii°), which works in any key." },
          { term: "Scale", text: "A set of notes in order, going up or down." },
          { term: "Seventh chord", text: "A triad with a fourth note added, a 7th above the root." },
          { term: "Sharp (♯)", text: "Raises a note by a half step." },
          { term: "Slash chord", text: "A chord with a particular note in the bass, written like G/B." },
          { term: "Sus chord", text: "A chord where the 3rd is replaced by the 2nd (sus2) or the 4th (sus4), leaving it open and hanging." },
          { term: "Sustain pedal", text: "The right-hand pedal that keeps notes ringing after you let go of the keys." },
          { term: "Tonic", text: "The home note and chord of a key: the I chord." },
          { term: "Triad", text: "A three-note chord: root, 3rd and 5th." },
          { term: "Voicing", text: "The particular way a chord's notes are spread across the keys." },
          { term: "Whole step", text: "Two half steps: skip one key." },
        ],
      },
    ],
  },
];

export const lessonBySlug = (slug: string): Lesson | undefined => LESSONS.find((l) => l.slug === slug);

/** The lessons only, in order (the tools are separate). */
export const COURSE = LESSONS.filter((l) => l.kind === "lesson");
export const TOOLS = LESSONS.filter((l) => l.kind === "tool");

export const GROUPS: Lesson["group"][] = ["Foundations", "Keys and chords", "Playing"];

/** The lesson after (or before) this one in the course, or null at the ends. */
export function neighbour(slug: string, delta: 1 | -1): Lesson | null {
  const at = COURSE.findIndex((l) => l.slug === slug);
  return at < 0 ? null : (COURSE[at + delta] ?? null);
}
