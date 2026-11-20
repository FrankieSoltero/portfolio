This PR runs, but it isn't ready to merge.

It adds a posts feed. The posts and their authors load from the server with `fetchPosts()` and `fetchUsers()` from `api.ts`; each post can be liked and pinned, and its comments load with `fetchComments()`. Review it, find what's wrong, and fix `App.tsx` until every check passes.

## What the feature should do

1. Show three posts, `Alpha`, `Beta` and `Gamma`, in that order. Each post is a section labelled with its title.
2. Under each title, a line names the post's author. `Alpha` and `Gamma` are by `Ada` and `Beta` is by `Grace`, so the line reads `Author: Ada` or `Author: Grace`. Until the authors have loaded, it reads `Author: …`.
3. Each post has a button named `Like` plus its title, for example `Like Alpha`. Clicking it likes the post and the button becomes `Unlike Alpha`; clicking that un-likes the post and the button reads `Like Alpha` again.
4. Each post has a button named `Show comments for` plus its title, for example `Show comments for Alpha`. Clicking it opens that post's comments as a list directly below it. One thread is open at a time: opening a thread closes the one that was open before.
5. Each post has two comments: `Alpha comment 1` and `Alpha comment 2`, `Beta comment 1` and `Beta comment 2`, `Gamma comment 1` and `Gamma comment 2`.
6. While the open thread is loading, show `Loading comments…` below its post. If its comments can't be loaded, show `Could not load comments` as an alert below that post instead. Clicking the post's button again tries again.
7. A line above the posts counts how many different threads have been loaded. It starts at `Threads loaded: 0` and reads `Threads loaded: 1`, `Threads loaded: 2` and so on. A thread that has already loaded is not requested from the server again: opening it again shows its comments at once.
8. Each post has a checkbox labelled `Pin` plus its title, for example `Pin Alpha`. It starts unticked, and ticking it pins that post.
9. A checkbox labelled `Newest first`, above the posts, shows them in reverse order: `Gamma`, `Beta`, `Alpha`. Unticking it puts them back.
