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

  useEffect(() => {
    fetchUser(userId).then((data) => {
      setUser(data);
      setLoading(false);
    });
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
      ) : user ? (
        <section>
          <h2>{user.name}</h2>
          <p>{`Role: ${user.role}`}</p>
        </section>
      ) : null}
    </main>
  );
}
