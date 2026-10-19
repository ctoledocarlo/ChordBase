/**
 * The tutorials. There are three kinds:
 *  - "site": how the whole site fits together (works from any page).
 *  - "page": what each part of the page you're on does.
 *  - "function": a closer look at one feature that needs more than a line of explanation.
 *
 * A step with a `target` points at the element carrying data-tour="<target>" (the screen darkens around it).
 * A step without one is a card in the middle of the screen. If a target isn't on the page (it's behind a
 * button, or the page has no such thing right now) the step simply shows in the middle instead.
 */

export type PageKey = "songs" | "song" | "setlists" | "setlist" | "editor" | "import";

export type TutorialStep = {
  /** The data-tour value of the element to point at. */
  target?: string;
  title: string;
  body: string;
  /** Open the page-options sidebar for this step (it's a drawer on a phone). */
  sidebar?: boolean;
  /** Pull up the setlist panel for this step (it's a sheet at the bottom on a phone). */
  rail?: boolean;
  /** Offers a "Skip" for steps that are extra detail. */
  optional?: boolean;
};

export type Tutorial = {
  id: string;
  kind: "site" | "page" | "function";
  title: string;
  /** One line shown in the help menu. */
  summary: string;
  /** For page and function tutorials: where it makes sense to run it. */
  pages?: PageKey[];
  steps: TutorialStep[];
};

export const PAGE_NAMES: Record<PageKey, string> = {
  songs: "the Songs page",
  song: "a song",
  setlists: "the Setlists page",
  setlist: "a setlist",
  editor: "the song editor",
  import: "the Import page",
};

/** Which page the address is: used to offer the right tutorials. Null where there are none. */
export function pageKeyFor(pathname: string): PageKey | null {
  if (pathname === "/") return "songs";
  if (pathname === "/songs/import") return "import";
  if (pathname === "/songs/new" || /^\/songs\/[^/]+\/edit$/.test(pathname)) return "editor";
  if (/^\/songs\/[^/]+$/.test(pathname)) return "song";
  if (pathname === "/setlists") return "setlists";
  if (/^\/setlists\/[^/]+$/.test(pathname)) return "setlist";
  return null;
}

const SITE: Tutorial = {
  id: "site",
  kind: "site",
  title: "Tour of ChordBase",
  summary: "How the whole site fits together (about a minute)",
  steps: [
    {
      title: "Welcome to ChordBase",
      body: "A quick tour of how everything fits together. Press Next to move on, Back to go back, or End to leave at any time. You can start it again from the Tutorial button.",
    },
    {
      target: "nav",
      title: "Two places to start",
      body: "Songs is your library: every song with its lyrics and chords. Setlists is where you plan a service by putting songs in order.",
    },
    {
      target: "sidebar",
      sidebar: true,
      title: "Buttons for the page you're on",
      body: "The sidebar on the left holds the options for whatever page is open: filters on the song list, key and capo on a song, and so on. On a phone, open it with the “Page options” button.",
    },
    {
      title: "Songs",
      body: "Search by title, artist or even a line of the lyrics. Change any song to the key your singer needs, and the chords (and capo shapes) follow. Add songs by typing them in or by importing PowerPoint files.",
    },
    {
      title: "Setlists",
      body: "A setlist is a list of songs for a service. Each song in it remembers its own key, capo, text size and chord style, and you can even change its chords for that setlist only. Setlists clear themselves after a month by default (you can keep them up to a year); your songs always stay.",
    },
    {
      title: "Going live",
      body: "Go live fills the screen with the song for the band. Open the same setlist on other screens and mark each one as Stage, Media or Viewer; changes then show on all of them as they happen. Guides in the Tutorial menu explain this step by step.",
    },
    {
      target: "theme",
      title: "Light or dark",
      body: "Switch between light and dark mode here. ChordBase remembers your choice on this device.",
      optional: true,
    },
    {
      target: "account",
      title: "Signing out",
      body: "Log out here when you're done, especially on a shared computer.",
      optional: true,
    },
    {
      target: "help",
      title: "Help is always here",
      body: "This button opens the Tutorial menu. “How this page works” explains the page you're on, and Guides go into detail on the trickier features. That's the tour, you're all set!",
    },
  ],
};

const PAGES: Tutorial[] = [
  {
    id: "page-songs",
    kind: "page",
    title: "How the Songs page works",
    summary: "Search, filter and open songs",
    pages: ["songs"],
    steps: [
      {
        target: "songs-search",
        title: "Search as you type",
        body: "Type a title, an artist or words from the lyrics. The list updates by itself, with the closest matches at the top; a matching lyric line is shown under songs found that way.",
      },
      {
        target: "songs-filters",
        sidebar: true,
        title: "Filters and sorting",
        body: "Narrow the list by key, major or minor, artist, tempo, time signature or capo, and choose how it's sorted. “Clear all” puts everything back.",
      },
      {
        target: "songs-chips",
        title: "What's applied",
        body: "Each filter you choose shows up here as a chip. Click a chip to take just that filter off, or “Clear all”. On a phone, the Filters button next to the search box opens the filters.",
        optional: true,
      },
      {
        target: "songs-list",
        title: "Your songs",
        body: "Each row shows the song's key, title, artist and tempo. Click a song to open it, change its key and play it. Press / to jump to the search box, then ↓ to walk down the results.",
      },
      {
        target: "songs-pages",
        title: "Pages",
        body: "The library is shown 25 songs at a time so it stays quick however big it gets. Use these to move between pages.",
        optional: true,
      },
      {
        target: "songs-banner",
        title: "Your next setlist",
        body: "When a setlist is coming up, it appears here so you can jump straight into it.",
        optional: true,
      },
      {
        target: "songs-buttons",
        title: "Add songs",
        body: "“Add song” opens the editor to type one in. “Import” reads PowerPoint files, hundreds at a time. Both have their own guides in the Tutorial menu.",
      },
    ],
  },
  {
    id: "page-song",
    kind: "page",
    title: "How a song page works",
    summary: "Key, capo, display and adding to a setlist",
    pages: ["song"],
    steps: [
      {
        target: "song-screen",
        title: "The song",
        body: "Lyrics with the chords above the words, sized to fit your screen. Changes you make in the sidebar apply here straight away.",
      },
      {
        target: "song-toolbar",
        title: "Key, capo and size, close at hand",
        body: "The bar above the song changes the key (with half-step buttons), the capo and the text size. The sidebar has the same, plus sharps and flats and chord style. On a phone, Live, the key and “Add to setlist” stay in a bar at the bottom.",
      },
      {
        target: "song-settings",
        sidebar: true,
        title: "Make it fit your band",
        body: "Pick the key, set a capo (the chords shown become the shapes to play), choose sharps or flats, switch chords on or off, change the text size and chord style. These changes are just for viewing; the saved song isn't changed.",
      },
      {
        target: "song-live",
        sidebar: true,
        title: "Live",
        body: "Shows only the song, full screen, with an Exit button in the corner. Handy on a stand or a stage monitor.",
      },
      {
        target: "song-edit",
        sidebar: true,
        title: "Edit song",
        body: "Opens the editor to change the words, chords or details of the song for good.",
      },
      {
        target: "song-add-setlist",
        sidebar: true,
        title: "Add to setlist",
        body: "Puts this song in an existing setlist, or starts a new one for it, in its original key. You can change the key inside the setlist.",
      },
    ],
  },
  {
    id: "page-setlists",
    kind: "page",
    title: "How the Setlists page works",
    summary: "Create, find and open setlists",
    pages: ["setlists"],
    steps: [
      {
        target: "setlists-new",
        title: "New setlist",
        body: "Give it a name and, if you like, a date. Choose how long to keep it: a month by default, up to a year, after which it's deleted. Songs are never deleted.",
      },
      {
        target: "setlists-search",
        title: "Search by name or date",
        body: "Most setlists are called the same thing, so dates matter. Try “Oct 17”, “2026-10-17”, “saturday” or part of the name.",
      },
      {
        target: "setlists-dates",
        title: "Between two dates",
        body: "Pick From and To to see only the setlists in that stretch.",
        optional: true,
      },
      {
        target: "setlists-list",
        title: "Upcoming and past",
        body: "Upcoming setlists come first, soonest at the top. Click one to open it, or use the bin icon to delete it. Each row shows its date, how many songs it has and when it expires.",
      },
    ],
  },
  {
    id: "page-setlist",
    kind: "page",
    title: "How a setlist page works",
    summary: "The song, the list, settings and live controls",
    pages: ["setlist"],
    steps: [
      {
        target: "setlist-song",
        title: "The song on screen",
        body: "The song as it will be played in this setlist: its key, capo, chord style and any chords you changed here.",
      },
      {
        target: "song-toolbar",
        title: "Key, capo and size, close at hand",
        body: "Above the song, change its key (with half-step buttons), the capo and the text size. These are saved to this setlist for this song, and every screen follows.",
        optional: true,
      },
      {
        target: "setlist-stage-strip",
        title: "What's on stage",
        body: "A line above the song says whether what you're looking at is on stage and how many Stage screens are connected. If you're on another song, it offers to put this one on stage or take you to the one that is.",
        optional: true,
      },
      {
        target: "setlist-rail",
        rail: true,
        title: "The setlist",
        body: "Everything about the service lives on the right: what's on stage, what's next, the whole list, and the chat.",
      },
      {
        target: "setlist-list",
        rail: true,
        title: "Order and selection",
        body: "Click a song to look at it. Drag the handle to reorder. The play button puts a song on stage, and the red bin removes it from this setlist (not from your library). For a few seconds after removing one, “Undo” in the corner puts it back.",
      },
      {
        target: "setlist-add",
        rail: true,
        title: "Add a song",
        body: "Search by title, artist or lyrics and add a song to the end, or right after the song on stage. This works during a service too.",
      },
      {
        target: "setlist-golive",
        rail: true,
        title: "Go live",
        body: "Fills the screen with the song for the band. In live mode you can still change the key and move between songs.",
      },
      {
        target: "setlist-info",
        sidebar: true,
        title: "Name, date and expiry",
        body: "Rename the setlist, change its date, or keep it longer. Press the green Save button; you'll be asked if you try to leave without saving.",
      },
      {
        target: "setlist-settings",
        sidebar: true,
        title: "Settings for this song",
        body: "Key, capo, chord style and text size are saved for this song in this setlist only, and every screen showing the setlist follows.",
      },
      {
        target: "setlist-edit-chords",
        sidebar: true,
        title: "Edit chords and transitions",
        body: "“Edit chords” changes the chords for this setlist only. Below the settings, “Transition” sets the bridge into the next song. Both have guides in the Tutorial menu.",
        optional: true,
      },
      {
        target: "metronome",
        rail: true,
        title: "Metronome",
        body: "Starts at the tempo of the song you're looking at. A row of dots lights up on every beat (orange on beat one), so the band can count in without any noise. Press the play button, nudge the tempo with − and +, and open “More” for tap tempo and an optional click sound.",
        optional: true,
      },
      {
        target: "setlist-role",
        sidebar: true,
        title: "What this screen is",
        body: "Choose Media, Stage or Viewer for this screen. The “Stage, Media and Viewer” guide explains the difference.",
        optional: true,
      },
    ],
  },
  {
    id: "page-editor",
    kind: "page",
    title: "How the song editor works",
    summary: "Lyrics, chords and preview",
    pages: ["editor"],
    steps: [
      {
        target: "editor-tabs",
        sidebar: true,
        title: "Three screens",
        body: "Lyrics is for the words and the parts of the song. Chords is for placing chords on the words. Preview shows the song the way the band will see it. Move between them any time.",
      },
      {
        target: "editor-import",
        sidebar: true,
        title: "Fill it in from a file",
        body: "Have the song in PowerPoint? Import reads it and fills in the title, key, sections and chords for you to check.",
        optional: true,
      },
      {
        target: "editor-info",
        sidebar: true,
        title: "Song information",
        body: "Title, artist, key, tempo and so on. This part can be folded away to make room.",
      },
      {
        target: "editor-screen",
        title: "Your song",
        body: "This is where you work. See the “Write a song” guide for a walk through each screen.",
      },
      {
        target: "editor-save",
        sidebar: true,
        title: "Save",
        body: "Nothing is stored until you save. A song with chords that can't be transposed is held back, with the problem chords listed so you can fix them.",
      },
    ],
  },
  {
    id: "page-import",
    kind: "page",
    title: "How the Import page works",
    summary: "Bring in songs from PowerPoint",
    pages: ["import"],
    steps: [
      {
        target: "import-drop",
        title: "Choose your files",
        body: "Drop PowerPoint files here (.ppt or .pptx), choose files, or choose a whole folder. Nothing is saved yet.",
      },
      {
        target: "import-list",
        title: "Check what was found",
        body: "Every song found is listed with its title, artist, key and any warnings. Fix anything that's off, and tick the songs you want.",
      },
      {
        target: "import-toolbar",
        title: "Import the ones you picked",
        body: "Select all or none, clear the list, then press Import. Songs that were already in your library are marked so you don't add them twice.",
      },
    ],
  },
];

const FUNCTIONS: Tutorial[] = [
  {
    id: "fn-edit-chords",
    kind: "function",
    title: "Change chords for one setlist",
    summary: "Fix a chord for Sunday without touching the song",
    pages: ["setlist"],
    steps: [
      {
        title: "Why this exists",
        body: "Sometimes a song needs a different chord just for one service. Instead of changing the song in your library, you can change it inside the setlist. Nothing else is affected.",
      },
      {
        target: "setlist-list",
        rail: true,
        title: "1. Pick the song",
        body: "Click the song you want to change in the list on the right.",
      },
      {
        target: "setlist-edit-chords",
        sidebar: true,
        title: "2. Press “Edit chords”",
        body: "The page switches to the chord editor, showing the song in the key and capo you chose for this setlist.",
      },
      {
        title: "3. Click a word",
        body: "Click the word where a chord should go (or change). A small box opens; type the chord, like Em7, and press Enter. Clear the box to remove a chord. The change shows up straight away and is saved for you.",
      },
      {
        title: "4. Use your own chord buttons",
        body: "The sidebar lists the chords you've saved as shortcuts. Click a word first, then tap a chord to place it.",
        optional: true,
      },
      {
        title: "5. Undo, redo and drag",
        body: "Undo and Redo are in the sidebar (or Ctrl+Z and Ctrl+Y). You can also drag song sections to rearrange them for this setlist.",
        optional: true,
      },
      {
        title: "6. Done, or go back",
        body: "Press Done to leave the editor. A song with your own chords is marked “edited” in the list. To undo it all, open Edit chords again and press “Go back to the song's chords”.",
      },
    ],
  },
  {
    id: "fn-screens",
    kind: "function",
    title: "Stage, Media and Viewer screens",
    summary: "Run a service across several screens",
    pages: ["setlist"],
    steps: [
      {
        title: "One setlist, many screens",
        body: "Open the same setlist on every device you want, signed in to your church. Changes made on one show up on the rest within a moment: songs added or removed, keys, chords, the song on stage, even chat.",
      },
      {
        target: "setlist-role",
        sidebar: true,
        title: "1. Say what each screen is",
        body: "Use this box on each device. It's remembered on that device, so the stage tablet stays a Stage screen.",
      },
      {
        title: "Media: runs the setlist",
        body: "The control screen. It can add, remove and reorder songs, edit chords, change keys, and choose which song is on stage.",
      },
      {
        target: "setlist-list",
        rail: true,
        title: "Putting a song on stage",
        body: "On a Media screen, press the play button beside a song, or use Previous and Next song, and every Stage and Viewer screen switches to it.",
      },
      {
        title: "Stage: the band's screen",
        body: "Always full screen. It starts on the song on stage and can look at other songs on its own (rows, Previous/Next or the arrow keys), with a button to return. It can change key, text size and chord style for the whole setlist. When Media puts a new song on stage, every Stage screen jumps to it.",
      },
      {
        title: "Viewer: just watching",
        body: "A full-screen view that follows the song on stage and has no controls. Good for a lobby or a screen out front.",
      },
      {
        target: "setlist-chat",
        rail: true,
        title: "Chat between screens",
        body: "Send a quick message to every screen, like “capo up one”. Viewers can read but not write. Fold it away with its heading.",
      },
      {
        target: "setlist-rail",
        rail: true,
        title: "Who's connected",
        body: "The line at the top of this panel shows whether you're connected and how many screens of each kind are watching.",
        optional: true,
      },
    ],
  },
  {
    id: "fn-bridge",
    kind: "function",
    title: "Bridges between songs",
    summary: "Chords to move from one song into the next",
    pages: ["setlist"],
    steps: [
      {
        title: "What a bridge is",
        body: "When one song ends and the next begins in a different key, the band needs a few chords to get there. A bridge shows them, from the end of one song to the start of the next.",
      },
      {
        target: "setlist-bridge",
        sidebar: true,
        title: "1. Choose how it's made",
        body: "Auto suggests chords for you from the two keys. Manual lets you type your own. None shows nothing. This sits under the settings of the song that comes first.",
      },
      {
        title: "2. Auto",
        body: "For example, going from G into A suggests G → E7 → A. It follows the key and capo set for each song, and it's written as the first song is played.",
      },
      {
        title: "3. Manual",
        body: "Type chords like “G  C/G  D”. “Change these chords” turns the suggestion into your own text to edit.",
      },
      {
        target: "setlist-onstage",
        rail: true,
        title: "4. Where the band sees it",
        body: "The bridge appears next to the setlist, under “Up next”, on every screen, so the band sees it before the song ends.",
      },
    ],
  },
  {
    id: "fn-import",
    kind: "function",
    title: "Import songs from PowerPoint",
    summary: "Turn slides into songs with chords",
    pages: ["import"],
    steps: [
      {
        title: "Before you start",
        body: "ChordBase reads the text of your slides, finds the chord lines above the lyrics, splits the song into sections and guesses the key. It works best when chords sit above the words in a monospaced font. Nothing is saved until you press Import.",
      },
      {
        target: "import-drop",
        title: "1. Add files",
        body: "Drop files here, or use Choose files or Choose a folder. You can add hundreds at once.",
      },
      {
        target: "import-list",
        title: "2. Check each song",
        body: "Look at the title, artist and key. Where a file held several songs, or one song in several keys, each is listed so you can pick the right one. Open a preview to see how the chords landed on the words.",
      },
      {
        title: "3. Mind the warnings",
        body: "A warning means something looked unusual, such as a slide it couldn't read or a key it had to guess. A song you already have is marked as a possible duplicate.",
      },
      {
        target: "import-toolbar",
        title: "4. Import",
        body: "Untick anything you don't want, then press Import. They're saved in batches; any that fail stay in the list with the reason so you can fix and retry.",
      },
    ],
  },
  {
    id: "fn-write-song",
    kind: "function",
    title: "Write a song",
    summary: "Lyrics, chords and layout, step by step",
    pages: ["editor"],
    steps: [
      {
        target: "editor-tabs",
        sidebar: true,
        title: "1. Start with Lyrics",
        body: "Add the words, a part at a time. Each part (Verse 1, Chorus…) is its own box. “Paste all the lyrics” lets you drop in the whole song and have it split into parts.",
      },
      {
        title: "2. Name the parts",
        body: "Give each part a name; parts without one are called “Unnamed Section”. You can duplicate, delete and drag parts around, and Undo brings anything back.",
      },
      {
        title: "3. Switch to Chords",
        body: "Every part of the song is on one screen. Click a word and type the chord that starts there, like Am or D/F#. Clear the box to remove it.",
      },
      {
        title: "4. Set the key",
        body: "Fill in the song's key in Song information so it can be moved to other keys. The chord buttons in the sidebar can include the chords of that key.",
        optional: true,
      },
      {
        title: "5. Preview",
        body: "Preview shows the song as the band will see it. Drag parts to different columns to arrange the page; the layout is saved.",
      },
      {
        target: "editor-save",
        sidebar: true,
        title: "6. Save",
        body: "Press Save when you're happy. Until then nothing is stored.",
      },
    ],
  },
  {
    id: "fn-live",
    kind: "function",
    title: "Playing a song live",
    summary: "Full screen, key changes and moving between songs",
    pages: ["song", "setlist"],
    steps: [
      {
        title: "What live mode is",
        body: "Live mode hides the menus and shows just the song, as large as will fit, so it's easy to read from a distance.",
      },
      {
        target: "song-live",
        sidebar: true,
        title: "Start it",
        body: "On a song, press Live. On a setlist, press Go live. The browser may ask to go full screen; allow it for the cleanest view.",
      },
      {
        title: "Changing the key",
        body: "In a setlist's live view, the right-hand panel has Key, Capo, Chord style and text size. The arrows nudge the key half a step. Every screen follows.",
      },
      {
        title: "Moving between songs",
        body: "Press Previous and Next song, or use the arrow keys or Page Up and Page Down on a keyboard.",
      },
      {
        title: "Leaving",
        body: "Press Exit in the top-right corner, or Esc.",
      },
    ],
  },
];

export const TUTORIALS: Tutorial[] = [SITE, ...PAGES, ...FUNCTIONS];

export const tutorialById = (id: string) => TUTORIALS.find((t) => t.id === id);

/** The page tutorial for a page, if it has one. */
export const pageTutorialFor = (page: PageKey | null) => (page ? TUTORIALS.find((t) => t.kind === "page" && t.pages?.includes(page)) : undefined);

/** Function tutorials that make sense on a page. */
export const functionTutorialsFor = (page: PageKey | null) => (page ? TUTORIALS.filter((t) => t.kind === "function" && t.pages?.includes(page)) : []);
