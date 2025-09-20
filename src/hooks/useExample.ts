import { useState } from "react";

/**
 * Provides a simple example hook that tracks how many times a button was clicked.
 */
export function useExampleCounter(initialValue = 0) {
  const [count, setCount] = useState(initialValue);

  const increment = () => setCount((value) => value + 1);

  return { count, increment };
}
