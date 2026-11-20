import { useState } from "react";

interface Task {
  id: string;
  title: string;
}

const TASKS: Task[] = [
  { id: "tests", title: "Write tests" },
  { id: "build", title: "Fix build" },
  { id: "ship", title: "Ship it" },
];

export default function App() {
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});

  const savedCount = Object.keys(notes).length;

  function editDraft(taskId: string, text: string) {
    setDrafts({ ...drafts, [taskId]: text });
  }

  function saveNote(taskId: string) {
    const text = drafts[taskId] ?? "";
    setNotes({ ...notes, [taskId]: text });
  }

  function clearNote(taskId: string) {
    const next = { ...notes };
    delete next[taskId];
    setNotes(next);
  }

  return (
    <main>
      <ul>
        {TASKS.map((task) => {
          const note = notes[task.id];
          return (
            <li key={task.id}>
              <p>{task.title}</p>
              <label>
                {`Note for ${task.title} `}
                <input
                  type="text"
                  value={drafts[task.id] ?? ""}
                  onChange={(event) => editDraft(task.id, event.target.value)}
                />
              </label>{" "}
              <button
                type="button"
                aria-label={`Save note for ${task.title}`}
                onClick={() => saveNote(task.id)}
              >
                Save
              </button>
              {note !== undefined && (
                <p>
                  <span>{`Note: ${note}`}</span>{" "}
                  <button
                    type="button"
                    aria-label={`Clear note for ${task.title}`}
                    onClick={() => clearNote(task.id)}
                  >
                    Clear
                  </button>
                </p>
              )}
            </li>
          );
        })}
      </ul>
      <p>{`Notes saved: ${savedCount}`}</p>
    </main>
  );
}
