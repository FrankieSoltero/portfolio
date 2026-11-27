import { useState } from "react";
import { saveClick } from "./api";

export default function App() {
  const [count, setCount] = useState(0);

  function addOne() {
    setCount(count + 1);
  }

  function addThree() {
    setCount(count + 1);
    setCount(count + 1);
    setCount(count + 1);
  }

  async function addOneAfterSaving() {
    await saveClick();
    setCount(count + 1);
  }

  return (
    <main>
      <p>{`Count: ${count}`}</p>
      <button type="button" onClick={addOne}>
        Add 1
      </button>{" "}
      <button type="button" onClick={addThree}>
        Add 3
      </button>{" "}
      <button type="button" onClick={addOneAfterSaving}>
        Add 1 after saving
      </button>
    </main>
  );
}
