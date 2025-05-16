"use client";
import { RefObject } from "react";

export async function createRealtimeConnection(
  ephemeralToken: string,
  audioElement: RefObject<HTMLAudioElement | null>,
  onTranscriptReceived: (text: string, speaker: "AI" | "Human") => void
) {
  const pc = new RTCPeerConnection();

  // Set up audio stream for playback
  pc.ontrack = (e) => {
    if (audioElement.current) {
      audioElement.current.srcObject = e.streams[0];
    }
  };

  // Get user's microphone stream
  const ms = await navigator.mediaDevices.getUserMedia({ audio: true });
  pc.addTrack(ms.getTracks()[0]);

  // Create data channel for events
  const dc = pc.createDataChannel("response");

  // Handle incoming messages from the data channel
  dc.onmessage = (e) => {
    try {
      const msg = JSON.parse(e.data);
      console.log("Data channel message:", msg);

      // Handle different types of messages based on their type
      switch (msg.type) {
        case "response.audio_transcript.delta":
          // Assistant partial transcript
          if (msg.delta) {
            onTranscriptReceived(msg.delta, "AI");
          }
          break;

        case "conversation.item.input_audio_transcription":
        case "conversation.item.input_audio_transcription.completed":
          // User transcript (partial or final)
          if (msg.transcript) {
            onTranscriptReceived(msg.transcript, "Human");
          }
          break;
      }
    } catch (error) {
      console.error("Error processing message:", error);
    }
  };

  // Configure the data channel when open
  dc.onopen = () => {
    // Send session update
    const sessionUpdate = {
      type: "session.update",
      session: {
        modalities: ["text", "audio"],
      },
    };
    dc.send(JSON.stringify(sessionUpdate));
  };

  // Create and set local description (offer)
  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);

  // Connect to OpenAI's Realtime API with the current endpoint
  const baseUrl = "https://api.openai.com/v1/realtime";
  const model = "gpt-4o-realtime-preview-2024-12-17";
  const voice = "alloy"; // Default voice

  console.log("Connecting to OpenAI realtime API...");
  const sdpResponse = await fetch(`${baseUrl}?model=${model}&voice=${voice}`, {
    method: "POST",
    body: offer.sdp,
    headers: {
      Authorization: `Bearer ${ephemeralToken}`,
      "Content-Type": "application/sdp",
    },
  });

  if (!sdpResponse.ok) {
    const errorText = await sdpResponse.text();
    throw new Error(
      `OpenAI Realtime API error: ${sdpResponse.status} - ${errorText}`
    );
  }

  const answerSdp = await sdpResponse.text();
  console.log("Connected to OpenAI realtime API");

  await pc.setRemoteDescription({ type: "answer", sdp: answerSdp });

  return { pc, dc, stream: ms };
}

// System prompt that defines the AI interviewer's personality and behavior
const SYSTEM_PROMPT = `
You are AI Interviewer, a professional and insightful artificial intelligence designed to conduct job interviews. You assess candidates through thoughtful questioning and provide constructive feedback. Your approach is balanced between being professionally rigorous and supportively encouraging.

Personality:
You introduce yourself clearly: "I'm your AI Interviewer today. I'll be asking you some questions to understand your qualifications and fit for this position." You maintain a professional demeanor while being approachable.

Interview Style:
- Ask focused questions relevant to the candidate's experience and skills
- Probe deeper with follow-up questions when answers need clarification
- Acknowledge strong responses with positive feedback
- Challenge vague or generic answers politely
- Guide candidates who seem nervous with encouraging prompts

Speaking Style:
- Use clear, concise, and professional language
- Balance technical terminology with accessible explanations
- Maintain a conversational yet structured flow
- Provide thoughtful transitions between different question areas
- Use a mix of behavioral, situational, and technical questions

Guidelines:
- Keep responses concise and to the point - aim for 40 words or less
- Avoid overly formal or robotic phrasing
- Be patient and allow candidates time to elaborate
- Provide context for your questions when needed
- Remain neutral but engaged throughout the interview

Remember: Your goal is to create a fair and effective interview experience that allows candidates to showcase their abilities while maintaining professional assessment standards.
`;
