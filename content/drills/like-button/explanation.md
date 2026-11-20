## Liking a post changed nothing on screen

**What you saw.** Clicking `Like First post` did nothing: the button kept its name and the line stayed at `Liked: 0`.

**Why.** The like branch called `likedIds.push(postId)` and then `setLikedIds(likedIds)`. `push` changes the array React is already holding, and the setter receives that very same array. React compares the new value with the old one using `Object.is`; it is the same object, so React skips the re-render and the screen never catches up.

**The fix.** Build a new array with the post added and pass that to the setter:

```tsx
setLikedIds([...likedIds, postId]);
```

**Rule to remember.** Never change state in place. Arrays and objects in state are read-only: make a new one and hand it to the setter.

## Un-liking a post removed the wrong ones

**What you saw.** With `First post` and `Second post` liked, clicking `Unlike First post` left `First post` liked and un-liked `Second post` instead.

**Why.** The un-like branch filtered with `id === postId`. `filter` keeps the items its test returns true for, so this kept only the clicked post and dropped every other like.

**The fix.** Keep every id except the clicked one:

```tsx
setLikedIds(likedIds.filter((id) => id !== postId));
```

**Rule to remember.** `filter` keeps what matches. To remove one item, keep everything that isn't it.
