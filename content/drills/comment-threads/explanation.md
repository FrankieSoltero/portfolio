## Comments showed up under the wrong post

**What you saw.** With Alpha's thread loaded, clicking `Show comments for Beta` moved `Alpha comment 1` and `Alpha comment 2` under Beta, with no `Loading comments…`, until Beta's answer arrived. And when you opened Alpha, then Beta, and Beta's answer came back first, Alpha's slower answer then replaced it: `Alpha comment 1` ended up under Beta.

**Why.** Every thread shared one `comments` array, and `selectedPostId` only decided which post it was drawn under. The click changed `selectedPostId` at once, but the array still held the previous thread until the new answer arrived, and nothing recorded that the open thread was still loading. Each answer then ran `setComments(data)` whichever post it belonged to, so the answer that arrived last won, not the post that was clicked last. Network answers don't arrive in the order you asked for them.

**The fix.** Keep the comments in an object indexed by post id. Each answer is stored under the id of the post it was requested for, with an updater function so that two answers arriving close together both survive. Render the open post's entry, and treat a missing entry as still loading:

```tsx
const [openPostId, setOpenPostId] = useState<number | null>(null);
const [commentsByPost, setCommentsByPost] = useState<Record<number, Comment[]>>({});

function showComments(postId: number) {
  setOpenPostId(postId);
  fetchComments(postId).then((data) => {
    setCommentsByPost((loaded) => ({ ...loaded, [postId]: data }));
  });
}

// For each post:
const comments = commentsByPost[post.id];
// open and comments missing → <p>Loading comments…</p>
// open and comments present → the list
```

**Rule to remember.** When several requests for different things can be in flight at once, store each answer under the id it belongs to, not in one shared slot that the last answer overwrites. Then a late answer can only ever land in its own place.

## The count of loaded threads was wrong

**What you saw.** When you opened Alpha and then Beta before either answer came back, both threads loaded, but the line read `Threads loaded: 1`. And after Alpha and Beta had loaded one at a time, the line read `Threads loaded: 2`, but opening Alpha again and letting its answer arrive made it `Threads loaded: 3`, although only two different threads had ever been loaded.

**Why.** The count was a separate piece of state, bumped with `setThreadsLoaded(threadsLoaded + 1)` on every answer. That expression uses `threadsLoaded` as it was when the button was clicked: Alpha and Beta were both clicked while it was still `0`, so each answer set it to `0 + 1` and the second answer overwrote the first with the same `1`. It also counts answers, not threads, so a repeated request for a thread you already had added one more.

**The fix.** Don't store the count at all. Work it out during render from the comments you already keep, so it can never disagree with them:

```tsx
const threadsLoaded = Object.keys(commentsByPost).length;
```

**Rule to remember.** If a value can be calculated from state you already have, calculate it while rendering instead of keeping a second piece of state in step by hand.

## Opening a loaded thread asked the server again

**What you saw.** After Alpha and Beta had loaded, opening Alpha again started a third request, `comments:1`, and Alpha's comments did not appear until it came back; in the meantime Beta's comments showed under Alpha.

**Why.** Nothing remembered a thread once it had loaded. The click handler called `fetchComments()` every time, and the only copy of the comments was the shared array, which by then held Beta's thread.

**The fix.** With the comments stored by post id, the handler can check whether it already has the post's thread and skip the request. The open post's entry is already there, so its comments show at once:

```tsx
function showComments(postId: number) {
  setOpenPostId(postId);
  if (commentsByPost[postId]) return;
  fetchComments(postId).then((data) => {
    setCommentsByPost((loaded) => ({ ...loaded, [postId]: data }));
  });
}
```

**Rule to remember.** Before fetching, check whether you already hold the answer. Data stored by id makes that check a single lookup, and the screen can show it without waiting.
