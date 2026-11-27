import { useState } from "react";

const PRODUCTS = ["Lamp", "Desk", "Chair"];

export default function App() {
  const [selected, setSelected] = useState<string | null>(null);
  const [cartCount, setCartCount] = useState(0);

  function addToCart() {
    setCartCount((count) => count + 1);
  }

  return (
    <main>
      <ul>
        {PRODUCTS.map((product) => (
          <li key={product}>
            <div onClick={() => setSelected(product)}>
              <span>{`Select ${product}`}</span>{" "}
              <button type="button" onClick={addToCart}>
                {`Add ${product} to cart`}
              </button>
            </div>
          </li>
        ))}
      </ul>
      <p>{`Selected: ${selected ?? "none"}`}</p>
      <p>{`Cart: ${cartCount}`}</p>
    </main>
  );
}
