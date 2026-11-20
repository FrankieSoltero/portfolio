This PR runs, but it isn't ready to merge.

It adds a like button to each post in the feed, plus a line that counts how many posts you've liked. Review it, find what's wrong, and fix `App.tsx` until every check passes.

## What the feature should do

1. Show three posts, `First post`, `Second post` and `Third post`, each with its own button.
2. A post that isn't liked has a button named `Like` plus the post's title, for example `Like First post`. Clicking it likes that post.
3. A liked post's button is named `Unlike` plus the title instead, for example `Unlike First post`. Clicking it un-likes that post and leaves the others as they were.
4. Below the posts, a line shows how many posts are liked: `Liked: 0` at first, then `Liked: 1`, `Liked: 2` and so on.
