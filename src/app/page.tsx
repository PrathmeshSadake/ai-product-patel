"use client";

import Debater from "@/components/debater";
import { Message } from "ai";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";

// Import components
import Footer from "@/components/Layout/Footer";
import Header from "@/components/Layout/Header";
import useDebateInitialization from "@/hooks/useDebateInitialization";
import {
  CircleNotch,
  Microphone,
  PauseCircle,
  SpeakerHigh,
  Sparkle,
  LightbulbFilament,
  Brain,
  Lightning,
} from "@phosphor-icons/react";

export default function Home() {
  // State
  const [transcript, setTranscript] = useState<
    Array<{ text: string; speaker: "AI" | "Human"; timestamp?: number }>
  >([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [audioData, setAudioData] = useState<Uint8Array | undefined>();
  const [isProcessing, setIsProcessing] = useState(false);
  const [aiIsTyping, setAiIsTyping] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isAudioPlaying, setIsAudioPlaying] = useState(false);
  const [sessionStatus, setSessionStatus] = useState<string>("");
  const [audioLevel, setAudioLevel] = useState(0);
  const [pendingAIMessage, setPendingAIMessage] = useState<string>("");
  const [recentUserAudio, setRecentUserAudio] = useState<string>("");

  // Sample interview tips to show in the UI
  const interviewTips = [
    "Prepare specific examples from your experience",
    "Research the company culture before the interview",
    "Practice your answers to common questions",
    "Ask thoughtful questions about the role",
    "Focus on showcasing your problem-solving skills",
  ];

  // Custom hooks
  const { currentDebateId, isDebateLoading } = useDebateInitialization();

  // Create a ref for handleTranscriptReceived function
  const handleTranscriptReceivedRef = useRef<
    ((text: string, speaker: "AI" | "Human") => void) | null
  >(null);

  // Audio controller with direct reference to the current handleTranscriptReceived function
  const audioController = useMemo(() => {
    return {
      handleAudioResponse: (audioBlob: Blob) => {
        if (audioBlob.size === 0) {
          // Reset audio data when we get an empty blob
          setAudioData(undefined);
          setAudioLevel(0);
          return;
        }

        // Create a new blob with explicit audio type
        const audioWithType = new Blob([audioBlob], { type: "audio/wav" });

        // Convert to base64 with proper audio format
        const reader = new FileReader();
        reader.onloadend = () => {
          if (reader.result) {
            // For visualization data
            const arrayBuffer = reader.result as ArrayBuffer;
            const uint8Array = new Uint8Array(arrayBuffer);

            // Calculate audio level (average volume)
            let sum = 0;
            for (let i = 0; i < uint8Array.length; i++) {
              sum += uint8Array[i];
            }
            const avgLevel = sum / uint8Array.length / 255; // Normalize to 0-1

            // Update audio level with some smoothing
            setAudioLevel((prev: number) => prev * 0.3 + avgLevel * 0.7);

            // Set the audio data for visualization
            setAudioData(uint8Array);

            // Convert to base64 for transcription
            const base64Reader = new FileReader();
            base64Reader.onloadend = () => {
              const base64Audio = base64Reader.result as string;
              console.log("Audio data converted to base64:", {
                size: base64Audio.length,
                startsWithData: base64Audio.startsWith("data:"),
                type: audioWithType.type,
              });
              setRecentUserAudio(base64Audio);
            };
            base64Reader.readAsDataURL(audioWithType);
          }
        };
        reader.readAsArrayBuffer(audioWithType);
      },

      // Include this to handle references to this method
      handleTranscriptReceived: (text: string, speaker: "AI" | "Human") => {
        if (handleTranscriptReceivedRef.current) {
          handleTranscriptReceivedRef.current(text, speaker);
        }
      },
    };
  }, []);

  // Handle mic button click
  const handleMicButtonClick = useCallback(() => {
    if (isDebateLoading || !currentDebateId) return;

    if (isProcessing) {
      console.log("⏳ Cannot toggle mic while processing...");
      return;
    }

    // Stop all audio animations when toggling off the microphone
    if (isListening) {
      // Define a more thorough reset function
      const resetAnimations = () => {
        console.log("🛑 [Reset] Stopping all animations");
        setIsAudioPlaying(false);
        setAudioData(undefined);
        setAudioLevel(0);
      };

      // Execute reset immediately and with a delay to ensure it completes
      resetAnimations();
      setTimeout(resetAnimations, 50);
      setTimeout(resetAnimations, 200); // One more with longer timeout for safety
    }

    setIsListening(!isListening);
    // This should trigger the debater's handleStartStopClick
    const micButton = document.querySelector(".debater-mic-button");
    if (micButton) {
      (micButton as HTMLButtonElement).click();
    }
  }, [isListening, isDebateLoading, currentDebateId, isProcessing]);

  // Handle when a new transcript is received
  const handleTranscriptReceived = useCallback(
    (text: string, speaker: "AI" | "Human") => {
      if (!text.trim()) return;

      // For human messages, add them immediately
      if (speaker === "Human") {
        setTranscript((prev) => {
          // Check for exact duplicates
          const isDuplicate = prev.some(
            (item) =>
              item.speaker === "Human" &&
              item.text === text &&
              item.timestamp &&
              Date.now() - item.timestamp < 2000
          );

          if (isDuplicate) return prev;
          return [...prev, { text, speaker, timestamp: Date.now() }];
        });
      } else {
        // For AI messages, store them until audio is complete
        setPendingAIMessage(text);
      }

      // Add message to chat history
      const newMessage: Message = {
        id: `${speaker}-${Date.now()}`,
        role: speaker === "AI" ? "assistant" : "user",
        content: text,
      };

      setMessages((prev) => {
        // Check for exact duplicates in messages
        if (
          prev.some(
            (msg) => msg.content === text && msg.role === newMessage.role
          )
        ) {
          return prev;
        }
        return [...prev, newMessage];
      });
    },
    []
  );

  // Function to transcribe user audio
  const transcribeUserAudio = useCallback(
    async (userAudio: string) => {
      if (!userAudio) return;

      try {
        console.log("Sending audio to Groq Whisper for transcription...");

        const response = await fetch("/api/audio-analysis", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            userAudio,
          }),
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(
            errorData.details || "Failed to transcribe audio with Groq Whisper"
          );
        }

        const data = await response.json();
        console.log("Groq Whisper transcription result:", data);

        if (data.transcription && data.speaker) {
          // Add the transcription to the transcript
          handleTranscriptReceived(data.transcription, data.speaker);
          return data.transcription;
        } else {
          throw new Error("No transcription returned from Groq Whisper");
        }
      } catch (error) {
        console.error("Error transcribing audio with Groq Whisper:", error);
        throw error; // Re-throw to allow the calling component to handle it
      }
    },
    [handleTranscriptReceived]
  );

  // Effect to handle AI message after audio completes
  useEffect(() => {
    if (!isAudioPlaying && pendingAIMessage && !aiIsTyping) {
      setTranscript((prev) => [
        ...prev,
        { text: pendingAIMessage, speaker: "AI", timestamp: Date.now() },
      ]);
      setPendingAIMessage("");
    }
  }, [isAudioPlaying, pendingAIMessage, aiIsTyping]);

  // Keep the ref updated with the latest callback
  useEffect(() => {
    handleTranscriptReceivedRef.current = handleTranscriptReceived;
  }, [handleTranscriptReceived]);

  // Handle AI typing state changes
  const handleAiTypingChange = useCallback((isTyping: boolean) => {
    setAiIsTyping(isTyping);
  }, []);

  // Add handler for processing state changes
  const handleProcessingChange = useCallback((processing: boolean) => {
    console.log(
      `🔄 [Page] Processing state changed to: ${processing ? "ON" : "OFF"}`
    );
    setIsProcessing(processing);
  }, []);

  // Add handler for audio playing state changes
  const handleAudioPlayingChange = useCallback(
    (isPlaying: boolean) => {
      console.log(
        `🔊 [Page] Audio playing state changed to: ${
          isPlaying ? "PLAYING" : "STOPPED"
        }`
      );

      // Always update the audio playing state immediately
      setIsAudioPlaying(isPlaying);

      // Update related UI states based on audio playing
      if (isPlaying) {
        // When audio starts playing, make sure we have some data for visualization
        if (!audioData) {
          // Create dummy data for visualization when starting
          const dummyData = new Uint8Array(128);
          for (let i = 0; i < dummyData.length; i++) {
            dummyData[i] = Math.floor(Math.random() * 128);
          }
          setAudioData(dummyData);
        }
      } else if (!isListening) {
        // Only reset audio data when audio stops and we're not listening
        console.log(
          "🔄 [Page] Audio stopped and not listening, resetting audio data"
        );
        setAudioData(undefined);
      }
    },
    [isListening, audioData]
  );

  // New handler for session status changes
  const handleSessionStatusChange = useCallback((status: string) => {
    console.log(`🔄 [Page] Session status changed to: ${status}`);
    setSessionStatus(status);
  }, []);

  // Generate audio visualization wave points
  const generateWavePoints = (total = 48, radius = 120) => {
    return Array.from({ length: total }).map((_, i) => {
      const angle = (i / total) * Math.PI * 2;
      const amplitude = audioLevel ? 0.5 + audioLevel * 1.5 : 0.5;
      const x = Math.cos(angle) * radius;
      const y = Math.sin(angle) * radius;
      return { x, y, amplitude };
    });
  };

  const wavePoints = generateWavePoints();

  return (
    <div className="bg-black text-white flex flex-col h-screen overflow-hidden">
      {/* Animated background */}
      <div className="fixed inset-0 bg-[radial-gradient(ellipse_at_center,#1A1A2E_0%,#121212_70%)] opacity-80 z-0"></div>
      <div className="fixed inset-0 bg-[url('/grid.svg')] bg-repeat opacity-10 z-0"></div>
      <div className="fixed inset-0 overflow-hidden z-0">
        <div className="absolute -inset-[10px] opacity-50">
          <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-purple-600 rounded-full mix-blend-multiply filter blur-[128px] animate-blob"></div>
          <div className="absolute top-1/3 right-1/4 w-96 h-96 bg-blue-600 rounded-full mix-blend-multiply filter blur-[128px] animate-blob animation-delay-2000"></div>
          <div className="absolute bottom-1/4 left-1/3 w-96 h-96 bg-indigo-600 rounded-full mix-blend-multiply filter blur-[128px] animate-blob animation-delay-4000"></div>
        </div>
      </div>

      {/* Floating particles */}
      <div className="fixed inset-0 z-0 overflow-hidden">
        <div className="animate-float-slow absolute top-1/4 left-1/5 text-indigo-500/30">
          <Brain size={24} weight="light" />
        </div>
        <div className="animate-float-medium absolute top-1/3 right-1/4 text-purple-500/30">
          <LightbulbFilament size={28} weight="light" />
        </div>
        <div className="animate-float-fast absolute bottom-1/3 left-1/6 text-blue-500/30">
          <Sparkle size={20} weight="light" />
        </div>
        <div className="animate-float-medium absolute top-1/5 right-1/5 text-indigo-500/30">
          <Lightning size={22} weight="light" />
        </div>
      </div>

      {/* Header */}
      <Header />

      <div className="flex-1 relative z-10 max-w-7xl mx-auto w-full px-4 md:px-6 py-8">
        <div className="flex flex-col lg:flex-row gap-8 h-full">
          {/* Main column - AI interface */}
          <div className="flex-1 flex flex-col">
            {/* AI Visualization area */}
            <div className="relative flex-1 rounded-2xl overflow-hidden backdrop-blur-sm bg-black/20 border border-indigo-500/20 shadow-lg shadow-indigo-500/10">
              {/* Central AI visualization */}
              <div className="absolute inset-0 flex items-center justify-center">
                {/* Outer rings */}
                <motion.div
                  className="absolute w-[280px] h-[280px] rounded-full border border-indigo-500/20"
                  animate={{ rotate: 360 }}
                  transition={{
                    duration: 20,
                    repeat: Infinity,
                    ease: "linear",
                  }}
                />
                <motion.div
                  className="absolute w-[320px] h-[320px] rounded-full border border-indigo-500/10"
                  animate={{ rotate: -360 }}
                  transition={{
                    duration: 25,
                    repeat: Infinity,
                    ease: "linear",
                  }}
                />

                {/* Voice wave visualization */}
                <svg
                  width="300"
                  height="300"
                  viewBox="-150 -150 300 300"
                  className="z-10"
                >
                  {/* Base circle */}
                  <circle cx="0" cy="0" r="80" className="fill-indigo-900/20" />

                  {/* Animated wave */}
                  {isAudioPlaying && (
                    <g>
                      {wavePoints.map((point, i) => (
                        <motion.circle
                          key={i}
                          cx={point.x}
                          cy={point.y}
                          r={3}
                          className="fill-indigo-400"
                          initial={{ scale: 0.5 }}
                          animate={{
                            scale: [0.5, point.amplitude * 2, 0.5],
                            opacity: [0.2, 0.8, 0.2],
                          }}
                          transition={{
                            duration: 1.5,
                            repeat: Infinity,
                            delay: i * 0.04,
                          }}
                        />
                      ))}
                    </g>
                  )}

                  {/* Main circle */}
                  <circle
                    cx="0"
                    cy="0"
                    r="50"
                    className={`
                      ${
                        isAudioPlaying
                          ? "fill-indigo-600"
                          : isListening
                          ? "fill-purple-600"
                          : "fill-slate-700"
                      }
                      transition-colors duration-300
                    `}
                  />

                  {/* Inner rings */}
                  <motion.circle
                    cx="0"
                    cy="0"
                    r="60"
                    className="stroke-indigo-500/30 fill-none"
                    strokeWidth="1"
                    strokeDasharray="5,5"
                    animate={{ rotate: 360 }}
                    transition={{
                      duration: 15,
                      repeat: Infinity,
                      ease: "linear",
                    }}
                  />

                  {/* Inner pulse animation */}
                  <motion.circle
                    cx="0"
                    cy="0"
                    r="50"
                    className={`
                      ${
                        isAudioPlaying
                          ? "stroke-indigo-400"
                          : isListening
                          ? "stroke-purple-400"
                          : "stroke-slate-500"
                      }
                      transition-colors duration-300
                    `}
                    fill="none"
                    strokeWidth="2"
                    initial={{ scale: 0.8, opacity: 0.2 }}
                    animate={{
                      scale:
                        isAudioPlaying || isListening ? [0.8, 1.2, 0.8] : 0.8,
                      opacity:
                        isAudioPlaying || isListening ? [0.2, 0.6, 0.2] : 0.2,
                    }}
                    transition={{
                      duration: 2,
                      repeat: Infinity,
                    }}
                  />
                </svg>

                {/* Central icon */}
                <motion.div
                  className="absolute"
                  animate={{
                    scale: [0.9, 1.1, 0.9],
                    opacity: [0.7, 1, 0.7],
                  }}
                  transition={{ duration: 4, repeat: Infinity }}
                >
                  {isAudioPlaying ? (
                    <SpeakerHigh
                      size={32}
                      weight="bold"
                      className="text-indigo-300"
                    />
                  ) : isListening ? (
                    <Microphone
                      size={32}
                      weight="bold"
                      className="text-purple-300"
                    />
                  ) : (
                    <Brain size={32} weight="bold" className="text-slate-400" />
                  )}
                </motion.div>
              </div>

              {/* Status indicator */}
              <div className="absolute bottom-8 left-0 right-0 flex justify-center">
                <motion.div
                  className="bg-black/30 backdrop-blur-sm px-6 py-2 rounded-full border border-indigo-500/20 text-indigo-300 font-medium text-sm tracking-wider"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3 }}
                >
                  {isDebateLoading ? (
                    <span className="flex items-center gap-2">
                      <CircleNotch
                        size={16}
                        weight="bold"
                        className="animate-spin"
                      />
                      INITIALIZING INTERVIEW
                    </span>
                  ) : isProcessing ? (
                    <span className="flex items-center gap-2">
                      <CircleNotch
                        size={16}
                        weight="bold"
                        className="animate-spin"
                      />
                      {sessionStatus}
                    </span>
                  ) : isAudioPlaying ? (
                    <span className="flex items-center gap-2">
                      <SpeakerHigh
                        size={16}
                        weight="bold"
                        className="animate-pulse"
                      />
                      INTERVIEWER SPEAKING
                    </span>
                  ) : isListening ? (
                    <span className="flex items-center gap-2">
                      <span className="relative flex h-3 w-3">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-purple-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-3 w-3 bg-purple-500"></span>
                      </span>
                      LISTENING TO YOUR ANSWER...
                    </span>
                  ) : (
                    <span className="flex items-center gap-2">
                      <Microphone size={16} weight="bold" />
                      READY FOR YOUR RESPONSE
                    </span>
                  )}
                </motion.div>
              </div>

              {/* Mic button */}
              <motion.button
                onClick={handleMicButtonClick}
                disabled={isDebateLoading || !currentDebateId || isProcessing}
                className={`
                  absolute bottom-24 left-1/2 -translate-x-1/2
                  h-16 w-16 rounded-full flex items-center justify-center
                  disabled:opacity-50 disabled:cursor-not-allowed
                  ${
                    isListening
                      ? "bg-purple-600 hover:bg-purple-700"
                      : "bg-indigo-600 hover:bg-indigo-700"
                  }
                  transition-colors duration-300 shadow-lg
                `}
                whileTap={{ scale: 0.95 }}
                initial={{ y: 10, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.2 }}
              >
                {isDebateLoading || isProcessing ? (
                  <CircleNotch
                    size={24}
                    weight="bold"
                    className="text-white animate-spin"
                  />
                ) : isListening ? (
                  <PauseCircle size={24} weight="fill" className="text-white" />
                ) : (
                  <Microphone size={24} weight="fill" className="text-white" />
                )}
              </motion.button>

              {/* Interview tips */}
              <div className="absolute left-6 top-6 max-w-[240px]">
                <motion.div
                  className="bg-black/30 backdrop-blur-sm p-4 rounded-xl border border-indigo-500/20"
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.4 }}
                >
                  <h3 className="text-xs uppercase tracking-wider text-indigo-400 mb-2 flex items-center gap-1">
                    <LightbulbFilament size={14} weight="fill" />
                    Interview Tips
                  </h3>
                  <ul className="space-y-2 text-xs text-indigo-100/80">
                    {interviewTips.map((tip, i) => (
                      <motion.li
                        key={i}
                        className="flex items-start gap-1.5"
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.5 + i * 0.1 }}
                      >
                        <Sparkle
                          size={12}
                          weight="fill"
                          className="text-indigo-400 mt-0.5"
                        />
                        <span>{tip}</span>
                      </motion.li>
                    ))}
                  </ul>
                </motion.div>
              </div>
            </div>
          </div>

          {/* Right sidebar - Chat history */}
          <div className="w-full lg:w-[400px] flex flex-col h-full">
            <div className="flex-1 rounded-2xl backdrop-blur-sm bg-black/30 border border-indigo-500/20 shadow-lg shadow-indigo-500/10 overflow-hidden flex flex-col">
              {/* Chat header */}
              <div className="p-4 border-b border-indigo-500/20 flex items-center justify-between">
                <h2 className="text-lg font-medium bg-clip-text text-transparent bg-gradient-to-r from-indigo-400 to-purple-400">
                  Interview Transcript
                </h2>
                <span className="text-xs uppercase tracking-widest text-indigo-400 font-medium">
                  {transcript.length} responses
                </span>
              </div>

              {/* Chat messages */}
              <div className="flex-1 p-4 space-y-4 overflow-y-auto scrollbar-thin scrollbar-thumb-indigo-500/20 scrollbar-track-black/10">
                {transcript.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-center text-indigo-300/50 space-y-4 p-6">
                    <div className="w-16 h-16 rounded-full bg-indigo-900/20 flex items-center justify-center">
                      <Microphone
                        size={24}
                        weight="light"
                        className="text-indigo-400/50"
                      />
                    </div>
                    <p className="text-sm">
                      Start speaking to begin the interview
                    </p>
                  </div>
                ) : (
                  transcript.map((message, index) => (
                    <motion.div
                      key={`${message.speaker}-${message.timestamp || index}`}
                      className={`flex ${
                        message.speaker === "Human"
                          ? "justify-end"
                          : "justify-start"
                      }`}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.3 }}
                    >
                      <div
                        className={`max-w-[85%] rounded-2xl p-3 shadow-sm ${
                          message.speaker === "Human"
                            ? "bg-purple-600/30 border border-purple-500/30 text-purple-50"
                            : "bg-indigo-600/30 border border-indigo-500/30 text-indigo-50"
                        }`}
                      >
                        <div className="text-xs uppercase tracking-wider mb-1 opacity-70">
                          {message.speaker === "Human" ? "You" : "Interviewer"}
                        </div>
                        <p className="text-sm leading-relaxed">
                          {message.text}
                        </p>
                        <div className="mt-1 flex justify-end">
                          <span className="text-[10px] opacity-70">
                            {message.timestamp
                              ? new Date(message.timestamp).toLocaleTimeString(
                                  [],
                                  {
                                    hour: "2-digit",
                                    minute: "2-digit",
                                  }
                                )
                              : ""}
                          </span>
                        </div>
                      </div>
                    </motion.div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Hidden Debater Component - renamed to keep functionality while changing UI context */}
      <div className="opacity-0 pointer-events-none absolute">
        <Debater
          onTranscriptReceived={handleTranscriptReceived}
          onAudioResponse={audioController.handleAudioResponse}
          messages={messages}
          onProcessingChange={handleProcessingChange}
          onAiTypingChange={handleAiTypingChange}
          onAudioPlayingChange={handleAudioPlayingChange}
          onSessionStatusChange={handleSessionStatusChange}
        />
      </div>

      {/* Footer */}
      <Footer />
    </div>
  );
}
