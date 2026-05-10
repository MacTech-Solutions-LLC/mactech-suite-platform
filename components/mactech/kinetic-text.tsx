"use client";

import { motion, useReducedMotion } from "motion/react";
import type { CSSProperties } from "react";

export interface KineticTextProps {
  text: string;
  emphasis?: string;
  /** Where to splice `emphasis` inside `text`. Defaults to end. */
  emphasisAfter?: string;
  className?: string;
  style?: CSSProperties;
  /** Stagger between each character, in seconds. */
  stagger?: number;
}

const containerVariants = {
  hidden: {},
  visible: (stagger: number) => ({
    transition: { staggerChildren: stagger },
  }),
};

const charVariants = {
  hidden: { opacity: 0, y: 18, filter: "blur(8px)" },
  visible: {
    opacity: 1,
    y: 0,
    filter: "blur(0px)",
    transition: { duration: 0.55, ease: [0.22, 1, 0.36, 1] },
  },
};

function splitChars(text: string) {
  return Array.from(text);
}

export function KineticText({
  text,
  emphasis,
  emphasisAfter,
  className,
  style,
  stagger = 0.018,
}: KineticTextProps) {
  const reduced = useReducedMotion();

  let prefix = text;
  let suffix = "";
  if (emphasis && emphasisAfter && text.includes(emphasisAfter)) {
    const idx = text.indexOf(emphasisAfter) + emphasisAfter.length;
    prefix = text.slice(0, idx);
    suffix = text.slice(idx);
  }

  const renderChars = (slice: string, baseIndex: number) =>
    splitChars(slice).map((ch, i) => (
      <motion.span
        key={`${baseIndex}-${i}-${ch}`}
        variants={charVariants}
        className="inline-block"
        style={{ whiteSpace: ch === " " ? "pre" : undefined }}
      >
        {ch}
      </motion.span>
    ));

  if (reduced) {
    return (
      <h1
        className={className}
        style={style}
      >
        {prefix}
        {emphasis ? (
          <em
            className="font-mt-serif italic not-italic-reset"
            style={{
              fontStyle: "italic",
              backgroundImage:
                "linear-gradient(135deg, var(--mt-accent), var(--mt-accent-2))",
              WebkitBackgroundClip: "text",
              backgroundClip: "text",
              color: "transparent",
            }}
          >
            {" "}
            {emphasis}
          </em>
        ) : null}
        {suffix}
      </h1>
    );
  }

  return (
    <motion.h1
      className={className}
      style={style}
      initial="hidden"
      animate="visible"
      variants={containerVariants}
      custom={stagger}
    >
      {renderChars(prefix, 0)}
      {emphasis ? (
        <motion.em
          className="font-mt-serif"
          style={{
            fontStyle: "italic",
            backgroundImage:
              "linear-gradient(135deg, var(--mt-accent), var(--mt-accent-2))",
            WebkitBackgroundClip: "text",
            backgroundClip: "text",
            color: "transparent",
          }}
          variants={charVariants}
        >
          {" "}
          {emphasis}
        </motion.em>
      ) : null}
      {renderChars(suffix, 1)}
    </motion.h1>
  );
}
