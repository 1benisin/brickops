import { useEffect, useState } from "react";

export default function useMediaQuery(query: string): boolean {
  // Initialize state with current match status
  // Use a function to avoid running matchMedia on every render
  const [matches, setMatches] = useState<boolean>(() => {
    // Handle SSR case where window might not be available
    if (typeof window === "undefined") {
      return false;
    }
    return window.matchMedia(query).matches;
  });

  useEffect(() => {
    // Handle SSR case
    if (typeof window === "undefined") {
      return;
    }

    // Create media query list
    const mediaQueryList = window.matchMedia(query);

    // Handler for when the media query match status changes
    const handleChange = (event: MediaQueryListEvent) => {
      setMatches(event.matches);
    };

    // Subscribe to changes
    mediaQueryList.addEventListener("change", handleChange);

    // Update state in case it changed between render and effect
    setMatches(mediaQueryList.matches);

    // Cleanup: remove listener when component unmounts or query changes
    return () => {
      mediaQueryList.removeEventListener("change", handleChange);
    };
  }, [query]); // Re-run effect if query changes

  return matches;
}
