"use client";

import { Button } from "@/components/ui/button";
import { Database } from "@/types/supabase";
import { createClient } from "@supabase/supabase-js";
import { ExternalLink, Share2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

// Initialize Supabase client (will be configured with environment variables)
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey);

export default function AudiencePoll({ debateId = "current" }) {
  const router = useRouter();
  const [votes, setVotes] = useState({ human: 0, ai: 0 });
  const [isLoading, setIsLoading] = useState(true);
  const [shareUrl, setShareUrl] = useState("");
  const [copied, setCopied] = useState(false);
  const [lastVote, setLastVote] = useState<"human" | "ai" | null>(null);
  const [showVoteFeedback, setShowVoteFeedback] = useState(false);
  const [currentDebateId, setCurrentDebateId] = useState<string>(
    typeof debateId === "string" ? debateId : ""
  );

  const totalVotes = votes.human + votes.ai;

  const getPercentage = (value: number) =>
    totalVotes === 0 ? 0 : (value / totalVotes) * 100;

  const humanVotes = getPercentage(votes.human);
  const aiVotes = getPercentage(votes.ai);

  // Function to fetch vote counts
  const fetchVoteCounts = async (debateIdToUse: string) => {
    if (!debateIdToUse) {
      console.error("No debate ID provided for fetching votes");
      return;
    }

    try {
      // Get vote counts - use count aggregation correctly
      const { count: humanCount, error: humanError } = await supabase
        .from("rt_votes")
        .select("*", { count: "exact", head: true })
        .eq("debate_id", debateIdToUse)
        .eq("vote_for", "human");

      const { count: aiCount, error: aiError } = await supabase
        .from("rt_votes")
        .select("*", { count: "exact", head: true })
        .eq("debate_id", debateIdToUse)
        .eq("vote_for", "ai");

      if (humanError) throw humanError;
      if (aiError) throw aiError;

      setVotes({
        human: humanCount || 0,
        ai: aiCount || 0,
      });
    } catch (error) {
      console.error("Error fetching votes:", error);
    }
  };

  // Load votes from Supabase
  useEffect(() => {
    const fetchVotes = async () => {
      try {
        // First get the current debate ID if not already provided
        let debateIdToUse = currentDebateId;

        if (!debateIdToUse || debateIdToUse === "current") {
          const { data, error } = await supabase
            .from("rt_debates")
            .select("id")
            .eq("is_active", true)
            .order("created_at", { ascending: false })
            .limit(1)
            .single();

          if (error) throw error;
          debateIdToUse = data?.id || "";
          setCurrentDebateId(debateIdToUse);
        }

        if (!debateIdToUse) {
          console.error("No debate ID found");
          setIsLoading(false);
          return;
        }

        // Set the share URL
        setShareUrl(`${window.location.origin}/vote/${debateIdToUse}`);

        // Fetch initial vote counts
        await fetchVoteCounts(debateIdToUse);
      } catch (error) {
        console.error("Error fetching initial data:", error);
        setVotes({ human: 0, ai: 0 });
      } finally {
        setIsLoading(false);
      }
    };

    fetchVotes();

    // Set up real-time subscription for votes
    const setupRealtime = async () => {
      let debateIdToUse = currentDebateId;

      if (!debateIdToUse || debateIdToUse === "current") {
        try {
          const { data, error } = await supabase
            .from("rt_debates")
            .select("id")
            .eq("is_active", true)
            .order("created_at", { ascending: false })
            .limit(1)
            .single();

          if (!error && data) {
            debateIdToUse = data.id;
            setCurrentDebateId(debateIdToUse);
          }
        } catch (error) {
          console.error("Error getting debate ID for realtime:", error);
          return;
        }
      }

      if (!debateIdToUse) return;

      // Set up interval to refetch votes every 10 seconds to ensure data is synchronized
      const intervalId = setInterval(() => {
        fetchVoteCounts(debateIdToUse);
      }, 10000);

      // Subscribe to real-time updates on the votes table
      const votesSubscription = supabase
        .channel(`votes-channel-${debateIdToUse}`)
        .on(
          "postgres_changes",
          {
            event: "*", // Listen for all events (INSERT, UPDATE, DELETE)
            schema: "public",
            table: "rt_votes",
            filter: `debate_id=eq.${debateIdToUse}`,
          },
          (payload) => {
            // Refetch all votes to ensure counts are accurate
            fetchVoteCounts(debateIdToUse);
          }
        )
        .subscribe((status) => {
          if (status !== "SUBSCRIBED") {
          }
        });

      return { votesSubscription, intervalId };
    };

    const subscription = setupRealtime();

    // Cleanup function
    return () => {
      if (subscription) {
        subscription
          .then((result) => {
            if (result) {
              const { votesSubscription, intervalId } = result;
              if (votesSubscription) supabase.removeChannel(votesSubscription);
              if (intervalId) clearInterval(intervalId);
            }
          })
          .catch((err) => console.error("Error cleaning up:", err));
      }
    };
  }, [debateId]);

  const handleShareLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  const handleVoteClick = async (voteFor: "human" | "ai") => {
    if (!currentDebateId) return;

    try {
      // Submit vote directly to Supabase
      const { error } = await supabase.from("rt_votes").insert({
        debate_id: currentDebateId,
        vote_for: voteFor,
        created_at: new Date().toISOString(),
      });

      if (error) throw error;

      // Optimistically update the UI
      setVotes((prev) => ({
        ...prev,
        [voteFor]: prev[voteFor] + 1,
      }));

      // Show vote feedback
      setLastVote(voteFor);
      setShowVoteFeedback(true);
      setTimeout(() => setShowVoteFeedback(false), 3000);

      console.log(`Vote submitted for ${voteFor}`);
    } catch (err) {
      console.error("Error submitting vote:", err);
    }
  };

  const openVotingDashboard = () => {
    if (currentDebateId) {
      router.push(`/dashboard/${currentDebateId}`);
    }
  };

  return (
    <div className="border border-emerald-500/30 rounded-2xl bg-black/40 backdrop-blur-sm p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Share2 className="w-5 h-5 text-emerald-400" />
          <h2 className="text-lg font-medium text-emerald-100">
            Interview Feedback
          </h2>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="text-emerald-400 h-8 w-8"
          onClick={handleShareLink}
        >
          {copied ? (
            <span className="text-xs text-emerald-500">Copied!</span>
          ) : (
            <Share2 className="h-4 w-4" />
          )}
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-4 animate-pulse">
          <div className="h-6 bg-emerald-950/50 rounded-lg" />
          <div className="h-3 bg-emerald-950/50 rounded-full" />
          <div className="h-6 bg-emerald-950/50 rounded-lg mt-4" />
          <div className="h-3 bg-emerald-950/50 rounded-full" />
          <div className="grid grid-cols-2 gap-3 mt-4">
            <div className="h-10 bg-emerald-950/50 rounded-lg" />
            <div className="h-10 bg-emerald-950/50 rounded-lg" />
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Human votes */}
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-emerald-100/80">Candidate Performance</span>
              <span className="text-emerald-400">{humanVotes.toFixed(1)}%</span>
            </div>
            <div className="relative h-3 w-full overflow-hidden rounded-full bg-emerald-950/50">
              <div
                className="h-full bg-gradient-to-r from-blue-500 to-blue-400 transition-all duration-500"
                style={{ width: `${humanVotes}%` }}
              />
            </div>
          </div>

          {/* AI votes */}
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-emerald-100/80">Interview Quality</span>
              <span className="text-emerald-400">{aiVotes.toFixed(1)}%</span>
            </div>
            <div className="relative h-3 w-full overflow-hidden rounded-full bg-emerald-950/50">
              <div
                className="h-full bg-gradient-to-r from-emerald-500 to-emerald-400 transition-all duration-500"
                style={{ width: `${aiVotes}%` }}
              />
            </div>
          </div>

          {showVoteFeedback && (
            <div className="text-center text-sm mt-2 text-emerald-500">
              Thanks! Your rating for{" "}
              {lastVote === "human" ? "Candidate" : "Interview"} was recorded.
            </div>
          )}

          {/* Vote buttons */}
          <div className="grid grid-cols-2 gap-3 pt-2">
            <Button
              onClick={() => handleVoteClick("human")}
              className="bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 text-white border-none"
            >
              Rate Candidate
            </Button>
            <Button
              onClick={() => handleVoteClick("ai")}
              className="bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 text-white border-none"
            >
              Rate Interview
            </Button>
          </div>

          <div className="text-center text-xs text-emerald-400/60">
            Total votes: {totalVotes}
          </div>

          <Button
            variant="ghost"
            className="w-full text-xs text-emerald-400 gap-1 mt-2"
            onClick={handleShareLink}
          >
            <ExternalLink className="h-3 w-3" />
            Open Feedback Dashboard
          </Button>
        </div>
      )}
    </div>
  );
}
