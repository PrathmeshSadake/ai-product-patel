"use client";

import Link from "next/link";
import { motion } from "framer-motion";

export default function Footer() {
  return (
    <motion.footer 
      className="relative z-10 py-4 text-center"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5, delay: 0.3 }}
    >
      <div className="text-xs text-indigo-400/70 font-medium">
        <span className="bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-transparent">
          AI Interviewer
        </span>{" "}
        • powered by Build Fast with AI • {new Date().getFullYear()}
      </div>
    </motion.footer>
  );
}
