"use client";
import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";

type Theme = "light" | "dark";
const storageKey = "options-compass-theme";
function savedTheme(): Theme | null {
  try { const value = localStorage.getItem(storageKey); return value === "light" || value === "dark" ? value : null; }
  catch { return null; }
}
export default function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("light");
  useEffect(() => {
    const preference = matchMedia("(prefers-color-scheme: dark)");
    const sync = () => {
      const next = savedTheme() ?? (preference.matches ? "dark" : "light");
      document.documentElement.dataset.theme = next;
      setTheme(next);
    };
    sync();
    preference.addEventListener("change", sync);
    window.addEventListener("storage", sync);
    return () => { preference.removeEventListener("change", sync); window.removeEventListener("storage", sync); };
  }, []);
  const label = theme === "light" ? "어두운 화면으로 전환" : "밝은 화면으로 전환";
  function toggle() {
    const next = theme === "light" ? "dark" : "light";
    document.documentElement.dataset.theme = next;
    setTheme(next);
    try { localStorage.setItem(storageKey, next); } catch { /* Current page still switches when storage is unavailable. */ }
  }
  return <button className="theme-toggle" type="button" aria-label={label} title={label} onClick={toggle}>
    {theme === "light" ? <Moon size={16}/> : <Sun size={16}/>}<span>{theme === "light" ? "다크" : "라이트"}</span>
  </button>;
}
