## Plus-one ticks jumped to other guests

**What you saw.** With `Plus one for Grace` ticked, clicking `Remove Ada` left `Grace` unticked and ticked `Linus` instead. With `Plus one for Ada` ticked, adding `Alan` at the top ticked `Alan` and unticked `Ada`.

**Why.** Each row is a `GuestRow` component with its own `useState` for the checkbox, and the list gave each row `key={index}`. React uses the key to decide which component from the last render a new element belongs to. After `Ada` was removed, `Grace` moved to index 0 and `Linus` to index 1, so React kept the components that used to sit at those positions, with their state, and only changed the name they show. The tick that belonged to the row at index 1, `Grace`'s, now showed up on `Linus`. Adding at the top shifts every index down by one and does the same thing in the other direction.

**The fix.** Key each row by something that belongs to the guest and never changes, its id:

```tsx
{guests.map((guest) => (
  <GuestRow key={guest.id} guest={guest} onRemove={removeGuest} />
))}
```

**Rule to remember.** A key says which item a component is for. Use a stable id from the data, never the array index, whenever the list can be reordered, filtered or added to anywhere but the end.

## Removing the new guest removed someone else too

**What you saw.** After removing `Ada` and adding `Alan`, clicking `Remove Alan` removed `Alan` and `Linus`, leaving only `Grace`.

**Why.** A new guest got `id: guests.length + 1`. After `Ada` (id 1) was removed, the list held `Grace` (id 2) and `Linus` (id 3), so its length was 2 and `Alan` got id 3, the same id as `Linus`. Removal keeps every guest whose id isn't the clicked one, so removing id 3 dropped both guests that had it. The length of a list goes down when items are removed, so it can hand out an id that is still in use.

**The fix.** Keep a counter that only ever goes up, and take the next id from it:

```tsx
const nextId = useRef(INITIAL_GUESTS.length + 1);

function addGuest() {
  const name = newName.trim();
  if (name === "") return;
  const id = nextId.current;
  nextId.current += 1;
  setGuests([{ id, name }, ...guests]);
  setNewName("");
}
```

`crypto.randomUUID()` works too. The point is that an id, once handed out, is never handed out again.

**Rule to remember.** An id must be unique for the life of the list, not just at the moment it is made. Never build ids from the list's length or an item's position.
