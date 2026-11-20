## Liking or pinning a post opened its comments

**What you saw.** Clicking `Like Alpha` sent a `comments:1` request and showed `Loading comments…` under Alpha. Ticking `Pin Alpha` did the same.

**Why.** The handler that opens comments sat on the post's wrapping `section`, and the `Show comments for Alpha` button had no handler of its own: it only worked because its click bubbled up to the section. The like button and the pin checkbox are inside the same section, so their clicks bubbled up to it too, and every one of them opened the comments.

**The fix.** Take the handler off the section and put it on the comments button, so each control does only what it says:

```tsx
<section aria-label={post.title}>
  {/* title, author, pin checkbox, like button */}
  <button type="button" onClick={onShowComments}>
    {`Show comments for ${post.title}`}
  </button>
</section>
```

Calling `event.stopPropagation()` in the like and pin handlers would hide the symptom, but every control added to the post later would have to remember to do the same.

**Rule to remember.** Clicks bubble. Don't put a click handler on an element that wraps other interactive controls; give each action its own button.

## Un-liking a post did nothing

**What you saw.** After `Like Alpha`, the button read `Unlike Alpha`, but clicking it left it reading `Unlike Alpha`.

**Why.** `like` pushed the post's id into the array React already held and passed that same array back to `setLikedIds`. React compares the new state with the old one using `Object.is`, and an array is always equal to itself, so React may skip the re-render: the like only showed up because the same click also opened the comments and re-rendered the feed. Fix the first bug and liking stops showing anything at all. And there was no un-like branch: clicking a liked post pushed its id a second time.

**The fix.** Treat the array as read-only and hand React a new one every time, with a branch for each direction:

```tsx
function toggleLike(postId: number) {
  if (likedIds.includes(postId)) {
    setLikedIds(likedIds.filter((id) => id !== postId));
  } else {
    setLikedIds([...likedIds, postId]);
  }
}
```

**Rule to remember.** Never change an array or object that is in state. Build a new one with the change in it, so React can see that something changed.

## Comments showed up under the wrong post

**What you saw.** Opening Alpha and then Beta, with Beta's answer arriving first and Alpha's after it, left `Alpha comment 1` and `Alpha comment 2` under Beta.

**Why.** Every thread shared one `comments` array, and `selectedPostId` only decided which post it was drawn under. Each answer ran `setComments(data)` whichever post it belonged to, so the answer that arrived last won, not the post that was clicked last. The single `loadingComments` flag had the same problem: it belonged to no post, so the first answer to arrive turned it off for everyone. Network answers don't arrive in the order you asked for them.

**The fix.** Keep the comments in an object indexed by post id. Store each answer under the id it was requested for, with an updater function so two answers arriving close together both survive, and treat a missing entry for the open post as still loading:

```tsx
const [commentsByPost, setCommentsByPost] = useState<Record<number, Comment[]>>({});

fetchComments(postId).then((data) => {
  setCommentsByPost((loaded) => ({ ...loaded, [postId]: data }));
});

// For each post: open and no entry → Loading comments…, open with an entry → the list
comments={commentsByPost[post.id]}
```

**Rule to remember.** When several requests for different things can be in flight at once, store each answer under the id it belongs to, not in one shared slot that the last answer overwrites.

## Reopening a thread asked again and counted it again

**What you saw.** After Alpha and Beta had loaded, opening Alpha again sent a second `comments:1` request, and when it came back the line read `Threads loaded: 3`, although only two different threads had ever loaded.

**Why.** The count was a separate piece of state, bumped with `setThreadsLoaded(threadsLoaded + 1)` on every answer, so it counted answers, not threads. That expression also uses `threadsLoaded` as it was when the button was clicked, so two answers that are in flight at the same time both write the same number. And nothing remembered a thread once it had loaded: every click called `fetchComments()` again.

**The fix.** Don't store the count; work it out during render from the comments you already keep. Then, before fetching, check whether that post's thread is already there:

```tsx
const threadsLoaded = Object.keys(commentsByPost).length;

function showComments(postId: number) {
  setOpenPostId(postId);
  if (commentsByPost[postId]) return;
  // …fetch as before
}
```

**Rule to remember.** If a value can be calculated from state you already have, calculate it while rendering. And before fetching, check whether you already hold the answer: data stored by id makes that a single lookup.

## A pin jumped to another post when the order changed

**What you saw.** With `Pin Alpha` ticked, ticking `Newest first` put `Gamma` at the top with `Pin Gamma` ticked, and `Pin Alpha` unticked at the bottom.

**Why.** Each row is a `PostRow` component that keeps `pinned` in its own `useState`, and the list gave each row `key={index}`. React uses the key to decide which component from the last render a new element belongs to. After the order flipped, index 0 held Gamma instead of Alpha, so React kept the component that used to be at index 0, with its ticked pin, and only changed the post it shows.

**The fix.** Key each row by the post's id, so its state follows the post wherever it moves:

```tsx
{shownPosts.map((post) => (
  <PostRow key={post.id} post={post} /* … */ />
))}
```

**Rule to remember.** A key says which item a component is for. Use a stable id from the data, never the array index, whenever the list can be reordered, filtered or added to anywhere but the end.

## A failed request left the post loading forever

**What you saw.** When Alpha's comments failed to load, Alpha kept showing `Loading comments…`, and no `Could not load comments` alert appeared.

**Why.** The request was given a success handler only. When the promise was rejected, nothing ran: no state recorded the failure, the loading flag stayed on, and the rejection went unhandled.

**The fix.** Give the promise a failure handler too. Remember which posts failed, show the alert under the open post when it is one of them, and forget the failure when the button is clicked again so the next try can load:

```tsx
const [failedPostIds, setFailedPostIds] = useState<number[]>([]);

function showComments(postId: number) {
  setOpenPostId(postId);
  if (commentsByPost[postId]) return;
  setFailedPostIds((ids) => ids.filter((id) => id !== postId));
  fetchComments(postId).then(
    (data) => {
      setCommentsByPost((loaded) => ({ ...loaded, [postId]: data }));
    },
    () => {
      setFailedPostIds((ids) => [...ids, postId]);
    }
  );
}

// For the open post: failed → <p role="alert">Could not load comments</p>
```

**Rule to remember.** A request has three outcomes, not two: loading, loaded and failed. Handle the failure, show it where it happened, and let the user try again.
