/** The distance between two notes, from nothing to an octave. */
export type Interval = {
  /** Half steps between the notes. */
  semis: number;
  /** How many letter names up it is: a 3rd is 2 letters up (C to E), a 5th is 4. The tritone is written as a flat 5th. */
  letters: number;
  short: string;
  name: string;
  /** How it sounds, in everyday words. */
  feel: string;
  /** A well-known tune (old enough to be public property) that starts with this jump, or "" if none is safe to name. */
  tune: string;
};

export const INTERVALS: Interval[] = [
  { semis: 0, letters: 0, short: "P1", name: "Unison", feel: "The very same note.", tune: "" },
  { semis: 1, letters: 1, short: "m2", name: "Minor 2nd", feel: "Tight and tense; the smallest step there is.", tune: "The first two notes of “Joy to the World”, going down." },
  { semis: 2, letters: 1, short: "M2", name: "Major 2nd", feel: "A whole step; the stride of a scale.", tune: "The first two notes of “Mary Had a Little Lamb”, going down." },
  { semis: 3, letters: 2, short: "m3", name: "Minor 3rd", feel: "Sad and soft; the sound that makes a chord minor.", tune: "The first jump of “Greensleeves”." },
  { semis: 4, letters: 2, short: "M3", name: "Major 3rd", feel: "Bright and happy; the sound that makes a chord major.", tune: "The first jump of “When the Saints Go Marching In”." },
  { semis: 5, letters: 3, short: "P4", name: "Perfect 4th", feel: "Open and steady, a little like a fanfare.", tune: "The first jump of “Amazing Grace”." },
  { semis: 6, letters: 4, short: "TT", name: "Tritone", feel: "Restless and unstable; it wants to move.", tune: "" },
  { semis: 7, letters: 4, short: "P5", name: "Perfect 5th", feel: "Strong and hollow; very stable.", tune: "The first jump of “Twinkle, Twinkle, Little Star”." },
  { semis: 8, letters: 5, short: "m6", name: "Minor 6th", feel: "Yearning and bittersweet.", tune: "" },
  { semis: 9, letters: 5, short: "M6", name: "Major 6th", feel: "Warm and open, a little wistful.", tune: "The first jump of “My Bonnie Lies over the Ocean”." },
  { semis: 10, letters: 6, short: "m7", name: "Minor 7th", feel: "Bluesy and leaning; wants to go somewhere.", tune: "" },
  { semis: 11, letters: 6, short: "M7", name: "Major 7th", feel: "Dreamy and aching, one half step shy of the octave.", tune: "" },
  { semis: 12, letters: 7, short: "P8", name: "Octave", feel: "The same note, higher. It sounds like the same note because it is.", tune: "" },
];
