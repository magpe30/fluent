export type Mode = "free" | "read" | "chat";
export type Focus = "both" | "language" | "delivery";
export type Screen = "home" | "about" | "setup" | "practice" | "feedback" | "compare" | "done";

export const modes = [
  { id: "free" as const, title: "Speak freely", description: "A story, a joke, a thought. Your words.", detail: "See where your voice takes you.", label: "Make it your own" },
  { id: "read" as const, title: "Read something", description: "Bring words to life. Find your rhythm.", detail: "Give a few words your own voice.", label: "Find your rhythm" },
  { id: "chat" as const, title: "Have a conversation", description: "Everyday moments. A little more ease.", detail: "Get comfortable thinking out loud.", label: "Think out loud" },
];

export const prompts: Record<Mode, string[]> = {
  free: ["Tell a story about a small moment that surprised you.", "Tell your favorite joke. Take your time with the ending.", "Describe a place you wish everyone could visit.", "Explain something you love to someone new to it."],
  read: ["I nearly walked past it. A tiny bookshop, tucked between two buildings I had seen a hundred times. But that afternoon, the door was open. So, for once, I went inside.", "The room fell quiet. She looked at the letter, then at me. ‘Well,’ she said, folding it carefully, ‘that changes everything.’", "Some days, progress is a leap. Other days, it is simply showing up, taking a breath, and trying one more time."],
  chat: ["What’s something you’ve changed your mind about recently?", "If I had one afternoon in your favorite city, what should I do?", "Tell me about something you’re looking forward to."],
};

export const focuses: { id: Focus; title: string; description: string }[] = [
  { id: "both", title: "A bit of both", description: "Words and voice" },
  { id: "language", title: "My language", description: "Clarity and wording" },
  { id: "delivery", title: "My delivery", description: "Pace and expression" },
];

// Illustrative content only. Replace this boundary with validated coaching results later.
export const sampleFeedback: Record<Focus, { strength: string; title: string; description: string; exercise: string }> = {
  both: { strength: "A small detail can make a story feel personal.", title: "Give the moment a little space.", description: "A short pause before the important part can help your listener follow the story.", exercise: "Try that part again. Pause just before the moment you want us to remember." },
  language: { strength: "Simple, specific words help your listener picture the moment.", title: "Make one idea the main idea.", description: "Try splitting a long thought into two shorter sentences. Keep the words that sound like you.", exercise: "Try your answer in two short sentences, with one idea in each." },
  delivery: { strength: "A change in emphasis can bring a sentence to life.", title: "Let one word stand out.", description: "Choose the word that matters most. Slow down slightly and give it a little more emphasis.", exercise: "Try that part again. Choose one important word and give it more emphasis." },
};

export function formatTime(seconds: number) {
  return `${Math.floor(seconds / 60).toString().padStart(2, "0")}:${(seconds % 60).toString().padStart(2, "0")}`;
}
