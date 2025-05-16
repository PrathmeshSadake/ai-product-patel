"use client";

import { useState, useEffect } from "react";
import { createClient } from "@supabase/supabase-js";
import { Database } from "@/types/supabase";

// Initialize Supabase client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey);

export default function useDebateInitialization() {
  const [currentDebateId, setCurrentDebateId] = useState<string | null>(null);
  const [isDebateLoading, setIsDebateLoading] = useState(true);

  // Create or get active debate
  useEffect(() => {
    const initializeDebate = async () => {
      try {
        // Check for active debate
        const { data: existingDebate, error } = await supabase
          .from("rt_debates")
          .select("id, title")
          .eq("is_active", true)
          .order("created_at", { ascending: false })
          .limit(1)
          .single();

        if (!error && existingDebate) {
          setCurrentDebateId(existingDebate.id);
          setIsDebateLoading(false);
          return existingDebate.id;
        } else {
          // Create a new debate
          const { data: newDebate, error: createError } = await supabase
            .from("rt_debates")
            .insert({
              title: "AI Interview Session",
              description: "Professional interview session with AI interviewer",
              is_active: true,
            })
            .select()
            .single();

          if (createError) {
            console.error("Error creating debate:", createError);
            throw createError;
          }
          setCurrentDebateId(newDebate.id);
          setIsDebateLoading(false);
          return newDebate.id;
        }
      } catch (error) {
        console.error("Error initializing debate:", error);
        setIsDebateLoading(false);
        return null;
      }
    };

    // Initialize the debate
    initializeDebate();
  }, []);

  return { currentDebateId, isDebateLoading };
}
