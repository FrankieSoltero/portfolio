This PR runs, but it isn't ready to merge.

It adds comment threads to a list of posts: each post can open its comments, which load from the server with `fetchComments()` from `api.ts`. Review it, find what's wrong, and fix `App.tsx` until every check passes.

## What the feature should do

1. Show three posts, `Alpha`, `Beta` and `Gamma`. Each post is a section labelled with its title and has a button named after it: `Show comments for Alpha`, `Show comments for Beta` and `Show comments for Gamma`.
2. Clicking a post's button opens that post's comments as a list directly below it. One thread is open at a time: opening a thread closes the one that was open before.
3. Each post has two comments: `Alpha comment 1` and `Alpha comment 2`, `Beta comment 1` and `Beta comment 2`, `Gamma comment 1` and `Gamma comment 2`.
4. While the open thread is loading, show `Loading comments…` below its post.
5. A line above the posts counts how many different threads have been loaded. It starts at `Threads loaded: 0` and reads `Threads loaded: 1`, `Threads loaded: 2` and so on.
6. A thread that has already been loaded is not requested from the server again: opening it again shows its comments at once.
