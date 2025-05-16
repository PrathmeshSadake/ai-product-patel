"use client";

import Link from "next/link";
import { Rocket } from "@phosphor-icons/react";
import { Space_Grotesk } from "next/font/google";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  weight: ["400", "700", "500"],
});

export default function Header() {
  return (
    <motion.header
      className="relative z-10 pt-6 pb-4 text-center items-center"
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
    >
      <div className="flex flex-col items-center justify-center gap-2">
        <div className="flex items-center gap-3 mb-1">
          <Rocket size={28} weight="fill" className="text-indigo-400" />
          <h1
            className={cn(
              "text-4xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-indigo-400 via-purple-400 to-blue-400",
              spaceGrotesk.className
            )}
          >
            AI INTERVIEWER
          </h1>
          <Rocket
            size={28}
            weight="fill"
            className="text-indigo-400 -scale-x-100"
          />
        </div>
        <p
          className={cn(
            "text-indigo-300/90 text-sm tracking-widest font-medium uppercase max-w-md",
            spaceGrotesk.className
          )}
        >
          Your personal AI assistant for interview preparation
        </p>
      </div>
    </motion.header>
  );
}
