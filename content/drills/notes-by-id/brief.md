This PR runs, but it isn't ready to merge.

It adds a short note to each task on a list, plus a line that counts how many tasks have a note. Review it, find what's wrong, and fix `App.tsx` until every check passes.

## What the feature should do

1. Show three tasks, `Write tests`, `Fix build` and `Ship it`.
2. Each task has a text input labelled `Note for` plus the task's name, for example `Note for Write tests`, and a button named `Save note for` plus the task's name, for example `Save note for Write tests`.
3. Clicking a task's save button saves the text in its input as that task's note. The note then shows under the task as `Note:` followed by the text, for example `Note: mock the api`. Saving again replaces that task's note with the new text.
4. A task with a saved note also has a button named `Clear note for` plus the task's name, for example `Clear note for Write tests`. Clicking it removes that task's note and leaves the other tasks' notes as they were.
5. Below the tasks, a line shows how many tasks currently have a note: `Notes saved: 0` at first, then `Notes saved: 1`, `Notes saved: 2` and so on.
