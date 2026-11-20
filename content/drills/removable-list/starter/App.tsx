import { useState } from "react";

interface Guest {
  id: number;
  name: string;
}

const INITIAL_GUESTS: Guest[] = [
  { id: 1, name: "Ada" },
  { id: 2, name: "Grace" },
  { id: 3, name: "Linus" },
];

function GuestRow({ guest, onRemove }: { guest: Guest; onRemove: (id: number) => void }) {
  const [plusOne, setPlusOne] = useState(false);

  return (
    <li>
      <label>
        <input type="checkbox" checked={plusOne} onChange={(event) => setPlusOne(event.target.checked)} />
        {` Plus one for ${guest.name}`}
      </label>{" "}
      <button type="button" onClick={() => onRemove(guest.id)}>
        {`Remove ${guest.name}`}
      </button>
    </li>
  );
}

export default function App() {
  const [guests, setGuests] = useState<Guest[]>(INITIAL_GUESTS);
  const [newName, setNewName] = useState("");

  function addGuest() {
    const name = newName.trim();
    if (name === "") return;
    setGuests([{ id: guests.length + 1, name }, ...guests]);
    setNewName("");
  }

  function removeGuest(id: number) {
    setGuests(guests.filter((guest) => guest.id !== id));
  }

  return (
    <main>
      <label>
        {"Guest name "}
        <input type="text" value={newName} onChange={(event) => setNewName(event.target.value)} />
      </label>{" "}
      <button type="button" onClick={addGuest}>
        Add guest
      </button>
      <ul>
        {guests.map((guest, index) => (
          <GuestRow key={index} guest={guest} onRemove={removeGuest} />
        ))}
      </ul>
    </main>
  );
}
