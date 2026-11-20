import { useState } from "react";

interface Line {
  id: number;
  name: string;
  priceCents: number;
  quantity: number;
}

const INITIAL_LINES: Line[] = [
  { id: 1, name: "Notebook", priceCents: 450, quantity: 1 },
  { id: 2, name: "Pen", priceCents: 125, quantity: 1 },
  { id: 3, name: "Bag", priceCents: 2999, quantity: 1 },
];

function formatMoney(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export default function App() {
  const [lines, setLines] = useState<Line[]>(INITIAL_LINES);
  const [discountOn, setDiscountOn] = useState(false);
  const [itemCount, setItemCount] = useState(() => INITIAL_LINES.reduce((sum, line) => sum + line.quantity, 0));
  const [totalCents, setTotalCents] = useState(() =>
    INITIAL_LINES.reduce((sum, line) => sum + line.priceCents * line.quantity, 0),
  );

  function increase(id: number) {
    const line = lines.find((candidate) => candidate.id === id);
    if (line === undefined) return;
    setLines(lines.map((candidate) => (candidate.id === id ? { ...candidate, quantity: candidate.quantity + 1 } : candidate)));
    setItemCount(itemCount + 1);
    setTotalCents(totalCents + line.priceCents);
  }

  function decrease(id: number) {
    setLines(lines.map((line) => (line.id === id ? { ...line, quantity: line.quantity - 1 } : line)));
  }

  function removeLine(id: number) {
    setLines(lines.filter((line) => line.id !== id));
  }

  function toggleDiscount(on: boolean) {
    setDiscountOn(on);
    setTotalCents(on ? Math.round(totalCents * 0.9) : Math.round(totalCents / 0.9));
  }

  return (
    <main>
      <ul>
        {lines.map((line) => (
          <li key={line.id}>
            {`${line.name} × ${line.quantity}`}{" "}
            <button type="button" onClick={() => increase(line.id)}>
              {`Increase ${line.name}`}
            </button>{" "}
            <button type="button" disabled={line.quantity === 1} onClick={() => decrease(line.id)}>
              {`Decrease ${line.name}`}
            </button>{" "}
            <button type="button" onClick={() => removeLine(line.id)}>
              {`Remove ${line.name}`}
            </button>
          </li>
        ))}
      </ul>
      <label>
        <input type="checkbox" checked={discountOn} onChange={(event) => toggleDiscount(event.target.checked)} />
        {" 10% off"}
      </label>
      <p>{`Items: ${itemCount}`}</p>
      <p>{`Total: ${formatMoney(totalCents)}`}</p>
    </main>
  );
}
