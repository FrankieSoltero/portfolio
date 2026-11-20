import { useEffect, useState } from "react";
import { fetchUser, type User } from "./api";

const CHOICES = [
  { id: 1, name: "Ada" },
  { id: 2, name: "Grace" },
  { id: 3, name: "Linus" },
];

export default function App() {
  const [userId, setUserId] = useState(1);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let ignore = false;
    setLoading(true);
    setFailed(false);
    fetchUser(userId).then(
      (data) => {
        if (ignore) return;
        setUser(data);
        setLoading(false);
      },
      () => {
        if (ignore) return;
        setFailed(true);
        setLoading(false);
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
      ) : failed ? (
        <p role="alert">Could not load profile</p>
      ) : user ? (
        <section>
          <h2>{user.name}</h2>
          <p>{`Role: ${user.role}`}</p>
        </section>
      ) : null}
    </main>
  );
}
