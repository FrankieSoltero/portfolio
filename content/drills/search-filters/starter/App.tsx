import { useEffect, useState } from "react";
import { searchProducts, type Product } from "./api";

export default function App() {
  const [query, setQuery] = useState("");
  const [inStock, setInStock] = useState(false);
  const [results, setResults] = useState<Product[]>([]);
  const [count, setCount] = useState(0);

  const filters = { query, inStock };

  useEffect(() => {
    let ignore = false;
    searchProducts(filters).then((products) => {
      if (ignore) return;
      setResults(products);
    });
    return () => {
      ignore = true;
    };
  }, [filters]);

  useEffect(() => {
    setCount(results.length);
  }, []);

  return (
    <main>
      <label>
        Search products
        <input type="text" value={query} onChange={(event) => setQuery(event.target.value)} />
      </label>
      <label>
        <input type="checkbox" checked={inStock} onChange={(event) => setInStock(event.target.checked)} />
        In stock only
      </label>
      <p>{`Results: ${count}`}</p>
      <ul>
        {results.map((product) => (
          <li key={product.id}>{product.name}</li>
        ))}
      </ul>
    </main>
  );
}
