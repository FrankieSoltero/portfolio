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

  const itemCount = lines.reduce((sum, line) => sum + line.quantity, 0);
  const fullCents = lines.reduce((sum, line) => sum + line.priceCents * line.quantity, 0);
  const totalCents = discountOn ? Math.round(fullCents * 0.9) : fullCents;

  function changeQuantity(id: number, change: number) {
    setLines(lines.map((line) => (line.id === id ? { ...line, quantity: line.quantity + change } : line)));
  }

  function removeLine(id: number) {
    setLines(lines.filter((line) => line.id !== id));
  }

  return (
    <main>
      <ul>
        {lines.map((line) => (
          <li key={line.id}>
            {`${line.name} × ${line.quantity}`}{" "}
            <button type="button" onClick={() => changeQuantity(line.id, 1)}>
              {`Increase ${line.name}`}
            </button>{" "}
            <button type="button" disabled={line.quantity === 1} onClick={() => changeQuantity(line.id, -1)}>
              {`Decrease ${line.name}`}
            </button>{" "}
            <button type="button" onClick={() => removeLine(line.id)}>
              {`Remove ${line.name}`}
            </button>
          </li>
        ))}
      </ul>
      <label>
        <input type="checkbox" checked={discountOn} onChange={(event) => setDiscountOn(event.target.checked)} />
        {" 10% off"}
      </label>
      <p>{`Items: ${itemCount}`}</p>
      <p>{`Total: ${formatMoney(totalCents)}`}</p>
    </main>
  );
}
