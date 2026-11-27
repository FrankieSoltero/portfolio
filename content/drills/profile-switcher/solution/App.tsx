import { useEffect, useState } from "react";
import { fetchUser, type User } from "./api";

const CHOICES = [
  { id: 1, name: "Ada" },
  { id: 2, name: "Grace" },
  { id: 3, name: "Linus" },
];

/** How the latest request ended, and which user it was for. */
type Outcome = { forId: number; user: User } | { forId: number; failed: true };

export default function App() {
  const [userId, setUserId] = useState(1);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const loading = outcome === null || outcome.forId !== userId;

  useEffect(() => {
    let ignore = false;
    fetchUser(userId).then(
      (user) => {
        if (ignore) return;
        setOutcome({ forId: userId, user });
      },
      () => {
        if (ignore) return;
        setOutcome({ forId: userId, failed: true });
      }
    );
    return () => {
      ignore = true;
    };
  }, [userId]);

  return (
    <main>
      {CHOICES.map((choice) => (
        <button key={choice.id} type="button" onClick={() => setUserId(choice.id)}>
          {`Show ${choice.name}`}
        </button>
      ))}
      {loading ? (
        <p>Loading…</p>
      ) : "failed" in outcome ? (
        <p role="alert">Could not load profile</p>
      ) : (
        <section>
          <h2>{outcome.user.name}</h2>
          <p>{`Role: ${outcome.user.role}`}</p>
        </section>
      )}
    </main>
  );
}
