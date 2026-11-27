## Saving one note wiped the others

**What you saw.** After saving `mock the api` for `Write tests` and then `bump node` for `Fix build`, only `Note: bump node` was left on screen. The first note had vanished.

**Why.** The save handler called `setNotes({ [taskId]: text })`. The square brackets make a computed property name, so the object gets the right task id, but it is a brand-new object holding that one entry and nothing else. The setter replaces state with whatever it receives, so every other task's note was thrown away.

**The fix.** Copy the existing notes into the new object, then set the one task's entry:

```tsx
setNotes({ ...notes, [taskId]: text });
```

**Rule to remember.** A state setter replaces the whole value; it doesn't merge. To change one entry of an object in state, copy the rest of the object across yourself.

## Clearing a note did nothing on screen

**What you saw.** Clicking `Clear note for Fix build` left `Note: bump node` and its `Clear` button exactly where they were.

**Why.** The clear handler ran `delete notes[taskId]` and then `setNotes(notes)`. `delete` changes the object React is already holding, and the setter receives that very same object. React compares the new value with the old one using `Object.is`; it is the same object, so React skips the re-render and the screen never catches up.

**The fix.** Copy the notes into a new object, remove the entry from the copy, and pass the copy to the setter:

```tsx
const next = { ...notes };
delete next[taskId];
setNotes(next);
```

**Rule to remember.** Never change state in place. Objects in state are read-only: make a new one, without the entry you want gone, and hand it to the setter.

## The saved count drifted away from the notes

**What you saw.** Saving `tag the release` and then `write the changelog` for `Ship it` showed one note but `Notes saved: 2`. Clearing a note never brought the number down.

**Why.** The count was a second piece of state, `savedCount`, bumped by one on every save. It knew nothing about the notes themselves: saving over an existing note added one even though no new task had a note, and clearing a note never took one away. Two pieces of state that are meant to agree had to be kept in step by hand, and the handlers didn't.

**The fix.** Remove the count state and work the number out from the notes on every render:

```tsx
const savedCount = Object.keys(notes).length;
```

**Rule to remember.** If a value can be computed from state you already have, compute it during render instead of storing it. A stored copy is one more thing that can fall out of step.
