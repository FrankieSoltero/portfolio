This PR runs, but it isn't ready to merge.

It adds a guest list for a party, where you can mark which guests bring a plus one, remove guests and add new ones. Review it, find what's wrong, and fix `App.tsx` until every check passes.

## What the feature should do

1. Show three guests, `Ada`, `Grace` and `Linus`, in that order, one row each.
2. Each row has a checkbox labelled `Plus one for` plus the guest's name, for example `Plus one for Ada`. It starts unticked, and ticking it marks that guest as bringing a plus one.
3. Each row also has a button named `Remove` plus the guest's name, for example `Remove Grace`. Clicking it removes that guest, and only that guest, from the list.
4. Above the list, a text box labelled `Guest name` and a button `Add guest` add a new guest. Type a name, for example `Alan`, and click `Add guest`: the new guest appears at the top of the list with an unticked checkbox, and the box clears.
5. Every guest keeps their own plus-one choice while guests are added and removed around them.
