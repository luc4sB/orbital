"use client";

import { useEffect, useState } from "react";

export default function LogoIntro() {
  const [fadeOut, setFadeOut] = useState(false);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    const duration = 5250;
    const fadeTime = 700;

    const timer1 = setTimeout(() => setFadeOut(true), duration);
    const timer2 = setTimeout(() => {
      setHidden(true);
      window.dispatchEvent(new Event("orbital-logo-intro-finished"));
    }, duration + fadeTime);

    return () => {
      clearTimeout(timer1);
      clearTimeout(timer2);
    };
  }, []);

  if (hidden) return null;

  return (
    <div
      className={`fixed inset-0 z-[9999] flex items-center justify-center transition-opacity duration-700 ${
        fadeOut ? "opacity-0" : "opacity-100"
      }`}
      style={{ background: "black" }}
    >
      <video
        src="/logo-intro2.mp4"
        autoPlay
        muted
        playsInline
        className="w-[300px] md:w-[400px] object-contain"
      />
    </div>
  );
}
