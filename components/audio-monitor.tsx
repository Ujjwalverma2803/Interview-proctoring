"use client";

import { useEffect, useRef, useState } from "react";
import { Mic, MicOff } from "lucide-react";

type AudioMonitorProps = {
  isLive: boolean;
  onIncident: (detail: string) => void;
};

export function AudioMonitor({ isLive, onIncident }: AudioMonitorProps) {
  const [volume, setVolume] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const lastAlertAtRef = useRef(0);

  const ALERT_THRESHOLD = 0.15; // Adjusted based on testing
  const COOLDOWN_MS = 5000;

  useEffect(() => {
    if (!isLive) {
      stopMonitoring();
      return;
    }

    startMonitoring();

    return () => {
      stopMonitoring();
    };
  }, [isLive]);

  const startMonitoring = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      const audioContext = new AudioContextClass();
      audioContextRef.current = audioContext;

      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      analyserRef.current = analyser;

      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);

      const checkVolume = () => {
        if (!analyserRef.current) return;
        analyserRef.current.getByteFrequencyData(dataArray);

        let sum = 0;
        for (let i = 0; i < bufferLength; i++) {
          sum += dataArray[i];
        }
        const average = sum / bufferLength / 255;
        setVolume(average);

        if (average > ALERT_THRESHOLD && Date.now() - lastAlertAtRef.current > COOLDOWN_MS) {
          lastAlertAtRef.current = Date.now();
          onIncident(`High audio level detected (${(average * 100).toFixed(0)}% volume).`);
        }

        animationFrameRef.current = requestAnimationFrame(checkVolume);
      };

      checkVolume();
    } catch (err) {
      console.error("Error accessing microphone:", err);
      setIsMuted(true);
    }
  };

  const stopMonitoring = () => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }
    streamRef.current?.getTracks().forEach((track) => track.stop());
    audioContextRef.current?.close();
    setVolume(0);
  };

  return (
    <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-black/20 px-4 py-2 text-sm text-slate-300 backdrop-blur-md">
      {isMuted ? (
        <MicOff className="h-4 w-4 text-rose-400" />
      ) : (
        <Mic className={`h-4 w-4 ${volume > 0.05 ? "text-mint animate-pulse" : "text-slate-400"}`} />
      )}
      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between gap-8">
          <span className="text-xs font-medium uppercase tracking-wider text-slate-400">Audio Level</span>
          <span className="text-[10px] text-slate-500">{(volume * 100).toFixed(0)}%</span>
        </div>
        <div className="h-1.5 w-32 overflow-hidden rounded-full bg-slate-800">
          <div
            className={`h-full transition-all duration-150 ${
              volume > ALERT_THRESHOLD ? "bg-rose-400" : "bg-mint"
            }`}
            style={{ width: `${Math.min(100, volume * 300)}%` }}
          />
        </div>
      </div>
    </div>
  );
}
