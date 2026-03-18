"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import * as blazeface from "@tensorflow-models/blazeface";
import type { BlazeFaceModel, NormalizedFace } from "@tensorflow-models/blazeface";
import * as cocoSsd from "@tensorflow-models/coco-ssd";
import type { ObjectDetection } from "@tensorflow-models/coco-ssd";
import * as tf from "@tensorflow/tfjs";
import clsx from "clsx";
import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  Clock3,
  Download,
  Eye,
  LayoutDashboard,
  LoaderCircle,
  MonitorSmartphone,
  Radar,
  ShieldAlert,
  Sparkles,
  UserRound,
  Users,
} from "lucide-react";

import { AudioMonitor } from "./audio-monitor";

type Severity = "low" | "medium" | "high";
type IncidentType = "system" | "device" | "object" | "focus" | "presence" | "network" | "audio";
type SessionStatus = "idle" | "starting" | "live" | "stopped";

type Incident = {
  id: string;
  type: IncidentType;
  severity: Severity;
  title: string;
  detail: string;
  createdAt: string;
};

type Metrics = {
  framesProcessed: number;
  focusScore: number;
  integrityScore: number;
  suspiciousObjects: number;
  lookAwayEvents: number;
  noFaceEvents: number;
  multipleFaceEvents: number;
};

type ReadinessItem = {
  label: string;
  ready: boolean;
  helper: string;
};

type DetectionBox = {
  x: number;
  y: number;
  width: number;
  height: number;
  label: string;
  color: string;
};

type FaceSnapshot = {
  centerX: number;
  centerY: number;
  width: number;
  height: number;
};

type ExportState = {
  kind: "idle" | "loading" | "success" | "error";
  message: string;
};

type CandidateProfile = {
  candidateName: string;
  targetRole: string;
  experience: string;
};

const DETECTION_RULES = {
  suspiciousObjects: new Set(["cell phone", "laptop", "book", "tv", "remote", "tablet", "monitor"]),
  objectCooldownMs: 6000,
  multipleFaceCooldownMs: 8000,
  lookAwayCooldownMs: 8000,
  noFaceCooldownMs: 12000,
  audioCooldownMs: 5000,
};

const severityClasses: Record<Severity, string> = {
  low: "border-white/15 bg-white/10 text-slate-100",
  medium: "border-amber-300/30 bg-amber-300/15 text-amber-100",
  high: "border-rose-400/35 bg-rose-400/15 text-rose-100",
};

const severityWeight: Record<Severity, number> = {
  low: 5,
  medium: 12,
  high: 22,
};

const initialMetrics: Metrics = {
  framesProcessed: 0,
  focusScore: 100,
  integrityScore: 100,
  suspiciousObjects: 0,
  lookAwayEvents: 0,
  noFaceEvents: 0,
  multipleFaceEvents: 0,
};

const defaultProfile: CandidateProfile = {
  candidateName: "Alex Candidate",
  targetRole: "Frontend Developer",
  experience: "0.7 years",
};

function formatClock(seconds: number) {
  const mins = Math.floor(seconds / 60)
    .toString()
    .padStart(2, "0");
  const secs = Math.floor(seconds % 60)
    .toString()
    .padStart(2, "0");

  return `${mins}:${secs}`;
}

function isoNow() {
  return new Date().toISOString();
}

function downloadBlob(filename: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function ProctoringStudio() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const objectModelRef = useRef<ObjectDetection | null>(null);
  const faceModelRef = useRef<BlazeFaceModel | null>(null);
  const modelInitPromiseRef = useRef<Promise<void> | null>(null);
  const overlayRef = useRef<DetectionBox[]>([]);
  const lastFaceSnapshotRef = useRef<FaceSnapshot | null>(null);
  const lastObjectAtRef = useRef(0);
  const lastNoFaceAtRef = useRef(0);
  const lastLookAwayAtRef = useRef(0);
  const lastMultiFaceAtRef = useRef(0);
  const sessionStartedAtRef = useRef<number | null>(null);
  const objectPollRef = useRef(0);
  const facePollRef = useRef(0);

  const [status, setStatus] = useState<SessionStatus>("idle");
  const [candidate, setCandidate] = useState<CandidateProfile>(defaultProfile);
  const [metrics, setMetrics] = useState<Metrics>(initialMetrics);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [systemState, setSystemState] = useState({
    cameraReady: false,
    objectModelReady: false,
    faceModelReady: false,
    backendConnected: false,
    permissionError: "",
  });
  const [sessionSeconds, setSessionSeconds] = useState(0);
  const [exportState, setExportState] = useState<ExportState>({
    kind: "idle",
    message: "",
  });

  const ensureModelsReady = async () => {
    if (!modelInitPromiseRef.current) {
      modelInitPromiseRef.current = (async () => {
        await tf.ready();

        try {
          await tf.setBackend("webgl");
        } catch {
          await tf.setBackend("cpu");
        }

        await tf.ready();

        const objectModel = await cocoSsd.load();
        const faceModel = await blazeface.load();

        objectModelRef.current = objectModel;
        faceModelRef.current = faceModel;
      })();
    }

    await modelInitPromiseRef.current;
  };

  const logIncident = async (
    incident: Omit<Incident, "id" | "createdAt">,
    options?: { scorePenalty?: number },
  ) => {
    const entry: Incident = {
      ...incident,
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      createdAt: isoNow(),
    };

    setIncidents((current) => [entry, ...current].slice(0, 24));
    setMetrics((current) => {
      const penalty = options?.scorePenalty ?? severityWeight[entry.severity];
      const focusPenalty = entry.type === "focus" || entry.type === "presence" ? penalty : 0;

      return {
        ...current,
        integrityScore: Math.max(0, current.integrityScore - penalty),
        focusScore: Math.max(0, current.focusScore - focusPenalty),
        suspiciousObjects:
          entry.type === "object" ? current.suspiciousObjects + 1 : current.suspiciousObjects,
        lookAwayEvents:
          entry.title === "Candidate looking away" ? current.lookAwayEvents + 1 : current.lookAwayEvents,
        noFaceEvents:
          entry.title === "Candidate left frame" ? current.noFaceEvents + 1 : current.noFaceEvents,
        multipleFaceEvents:
          entry.title === "Multiple faces detected"
            ? current.multipleFaceEvents + 1
            : current.multipleFaceEvents,
      };
    });

    const backendUrl = "/api";

    try {
      await fetch(`${backendUrl}/log`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          event: `${entry.title}: ${entry.detail}`,
          severity: entry.severity,
          type: entry.type,
          candidate,
        }),
      });
      setSystemState((current) => ({ ...current, backendConnected: true }));
    } catch {
      setSystemState((current) => ({ ...current, backendConnected: false }));
    }
  };

  useEffect(() => {
    if (status !== "live") {
      return;
    }

    const timer = window.setInterval(() => {
      if (sessionStartedAtRef.current) {
        setSessionSeconds((Date.now() - sessionStartedAtRef.current) / 1000);
      }
    }, 1000);

    return () => window.clearInterval(timer);
  }, [status]);

  useEffect(() => {
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }

      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  const readinessItems: ReadinessItem[] = [
    {
      label: "Camera stream",
      ready: systemState.cameraReady,
      helper: systemState.permissionError || "Webcam access is active and rendering.",
    },
    {
      label: "Object intelligence",
      ready: systemState.objectModelReady,
      helper: "COCO-SSD loaded for prohibited object detection.",
    },
    {
      label: "Face landmarks",
      ready: systemState.faceModelReady,
      helper: "Face presence model is available for candidate tracking.",
    },
    {
      label: "Backend logging",
      ready: systemState.backendConnected,
      helper: "Flask logger reachable for audit trail storage.",
    },
  ];

  const liveInsights = useMemo(() => {
    const topIncident = incidents[0];
    const recommendations = [
      metrics.multipleFaceEvents > 0
        ? "Escalate to a review state if more than one face appears in consecutive checks."
        : "Multiple-face monitoring is active and helping verify candidate isolation.",
      metrics.suspiciousObjects > 0
        ? "Capture evidence snapshots with object detections for stronger audit reviews."
        : "Object screening is active; you can extend it later with microphone anomaly checks.",
      metrics.focusScore < 70
        ? "Show a candidate warning before moving to a recruiter or admin escalation."
        : "Focus monitoring is stable; storing minute-wise trends would strengthen analytics.",
    ];

    return {
      headline: topIncident
        ? `${topIncident.title} just updated the risk model`
        : "Session has not started yet",
      detail: topIncident
        ? topIncident.detail
        : "Start the monitoring flow to see live integrity signals, timeline events, and score changes.",
      recommendations,
    };
  }, [incidents, metrics.focusScore, metrics.multipleFaceEvents, metrics.suspiciousObjects]);

  const startSession = async () => {
    setStatus("starting");
    setMetrics(initialMetrics);
    setIncidents([
      {
        id: `${Date.now()}-boot`,
        title: "Session initialized",
        detail: "Readiness checks and webcam analysis started.",
        severity: "low",
        type: "system",
        createdAt: isoNow(),
      },
    ]);
    setSessionSeconds(0);
    overlayRef.current = [];
    lastFaceSnapshotRef.current = null;
    lastObjectAtRef.current = 0;
    lastNoFaceAtRef.current = 0;
    lastLookAwayAtRef.current = 0;
    lastMultiFaceAtRef.current = 0;
    objectPollRef.current = 0;
    facePollRef.current = 0;

    try {
      await ensureModelsReady();

      setSystemState((current) => ({
        ...current,
        objectModelReady: true,
        faceModelReady: true,
        permissionError: "",
      }));

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          facingMode: "user",
        },
        audio: false,
      });

      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      setSystemState((current) => ({ ...current, cameraReady: true }));
      sessionStartedAtRef.current = Date.now();
      setStatus("live");
      await logIncident(
        {
          title: "Monitoring live",
          detail: "Candidate stream, integrity engine, and backend audit trail are active.",
          severity: "low",
          type: "system",
        },
        { scorePenalty: 0 },
      );
    } catch (error) {
      setSystemState((current) => ({
        ...current,
        cameraReady: false,
        permissionError:
          error instanceof Error ? error.message : "Unable to start webcam session.",
      }));
      setStatus("idle");
      await logIncident({
        title: "Session start failed",
        detail: error instanceof Error ? error.message : "Unknown startup issue.",
        severity: "high",
        type: "device",
      });
      return;
    }

    const renderLoop = async (timestamp: number) => {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const faceModel = faceModelRef.current;
      const objectModel = objectModelRef.current;

      if (!video || !canvas || !faceModel || !objectModel || video.readyState < 2) {
        animationFrameRef.current = requestAnimationFrame(renderLoop);
        return;
      }

      const width = video.videoWidth || 1280;
      const height = video.videoHeight || 720;

      if (canvas.width !== width) {
        canvas.width = width;
        canvas.height = height;
      }

      const ctx = canvas.getContext("2d");
      if (!ctx) {
        animationFrameRef.current = requestAnimationFrame(renderLoop);
        return;
      }

      ctx.clearRect(0, 0, width, height);
 
      if (timestamp - objectPollRef.current > 1200) {
        objectPollRef.current = timestamp;
        const predictions = await objectModel.detect(video);
        overlayRef.current = predictions.map((prediction) => ({
          x: prediction.bbox[0],
          y: prediction.bbox[1],
          width: prediction.bbox[2],
          height: prediction.bbox[3],
          label: prediction.class,
          color: DETECTION_RULES.suspiciousObjects.has(prediction.class) ? "#ff7a90" : "#69f0d0",
        }));

        const flagged = predictions.find((prediction) =>
          DETECTION_RULES.suspiciousObjects.has(prediction.class),
        );

        if (flagged && timestamp - lastObjectAtRef.current > DETECTION_RULES.objectCooldownMs) {
          lastObjectAtRef.current = timestamp;
          await logIncident({
            title: "Prohibited object detected",
            detail: `${flagged.class} entered the candidate zone.`,
            severity: "high",
            type: "object",
          });
        }
      }

      if (timestamp - facePollRef.current > 900) {
        facePollRef.current = timestamp;
        const detections = await faceModel.estimateFaces(video, false);
        const faces = detections.filter((face: NormalizedFace) => {
          return Array.isArray(face.topLeft) && Array.isArray(face.bottomRight);
        });

        if (faces.length === 0) {
          lastFaceSnapshotRef.current = null;
          if (timestamp - lastNoFaceAtRef.current > DETECTION_RULES.noFaceCooldownMs) {
            lastNoFaceAtRef.current = timestamp;
            await logIncident({
              title: "Candidate left frame",
              detail: "No face was detected in the active interview viewport.",
              severity: "high",
              type: "presence",
            });
          }
        } else {
          const primary = faces[0];
          const [x1, y1] = primary.topLeft;
          const [x2, y2] = primary.bottomRight;
          const width = Math.max(1, x2 - x1);
          const height = Math.max(1, y2 - y1);
          const centerX = x1 + width / 2;
          const centerY = y1 + height / 2;
          const offsetX = Math.abs(centerX - width / 2 - (video.videoWidth - width) / 2);
          const offsetY = Math.abs(centerY - height / 2 - (video.videoHeight - height) / 2);
          const normalizedOffsetX = offsetX / video.videoWidth;
          const normalizedOffsetY = offsetY / video.videoHeight;

          overlayRef.current = [
            ...overlayRef.current.filter((box) => box.color !== "#ffae70"),
            {
              x: x1,
              y: y1,
              width,
              height,
              label: "candidate",
              color: "#ffae70",
            },
          ];

          const previousFace = lastFaceSnapshotRef.current;
          const faceShrank =
            previousFace !== null && width * height < previousFace.width * previousFace.height * 0.65;
          
          let headTurned = false;
          if (primary.landmarks) {
            const [reX] = primary.landmarks[0] as [number, number];
            const [leX] = primary.landmarks[1] as [number, number];
            const [nX] = primary.landmarks[2] as [number, number];
            const eyeDist = Math.abs(reX - leX);
            const noseCenterDist = Math.abs(nX - (reX + leX) / 2);
            headTurned = noseCenterDist > eyeDist * 0.35;
          }

          const lookingAway =
            normalizedOffsetX > 0.18 || normalizedOffsetY > 0.18 || faceShrank || headTurned;

          if (lookingAway && timestamp - lastLookAwayAtRef.current > DETECTION_RULES.lookAwayCooldownMs) {
            lastLookAwayAtRef.current = timestamp;
            await logIncident({
              title: "Candidate looking away",
              detail: headTurned 
                ? "Significant head rotation detected." 
                : "Face position drift suggests lack of screen focus.",
              severity: "medium",
              type: "focus",
            });
          }

          lastFaceSnapshotRef.current = {
            centerX,
            centerY,
            width,
            height,
          };
        }

        if (faces.length > 1 && timestamp - lastMultiFaceAtRef.current > DETECTION_RULES.multipleFaceCooldownMs) {
          lastMultiFaceAtRef.current = timestamp;
          await logIncident({
            title: "Multiple faces detected",
            detail: "Another person may be present inside the interview frame.",
            severity: "high",
            type: "presence",
          });
        }
      }

      overlayRef.current.forEach((box) => {
        ctx.strokeStyle = box.color;
        ctx.lineWidth = 3;
        ctx.strokeRect(box.x, box.y, box.width, box.height);
        ctx.fillStyle = box.color;
        ctx.font = '600 15px "Arial"';
        ctx.fillText(box.label, box.x, Math.max(18, box.y - 10));
      });

      setMetrics((current) => ({
        ...current,
        framesProcessed: current.framesProcessed + 1,
      }));

      animationFrameRef.current = requestAnimationFrame(renderLoop);
    };

    animationFrameRef.current = requestAnimationFrame(renderLoop);
  };

  const stopSession = async () => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }

    setStatus("stopped");
    setSystemState((current) => ({ ...current, cameraReady: false }));
    await logIncident(
      {
        title: "Session stopped",
        detail: "Live monitoring ended and the summary is ready for export.",
        severity: "low",
        type: "system",
      },
      { scorePenalty: 0 },
    );
  };

  const exportJson = () => {
    downloadBlob(
      `interview-session-${Date.now()}.json`,
      JSON.stringify(
        {
          candidate,
          metrics,
          incidents,
          readinessItems,
          exportedAt: isoNow(),
        },
        null,
        2,
      ),
      "application/json",
    );
  };

  const exportBackendCsv = async () => {
    const backendUrl = "/api";
    setExportState({
      kind: "loading",
      message: "Creating backend report...",
    });

    try {
      const response = await fetch(`${backendUrl}/report`);
      
      if (!response.ok) {
        throw new Error("Failed to generate report on the server.");
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `interview-report-${Date.now()}.csv`;
      anchor.click();
      window.URL.revokeObjectURL(url);

      setExportState({
        kind: "success",
        message: "CSV report downloaded successfully.",
      });

      await logIncident(
        {
          title: "Backend report requested",
          detail: "Report generated and downloaded from Next.js server.",
          severity: "low",
          type: "system",
        },
        { scorePenalty: 0 },
      );
    } catch (error) {
      setExportState({
        kind: "error",
        message:
          error instanceof Error
            ? error.message
            : "Could not create the backend CSV report.",
      });
    }
  };

  const scoreCards = [
    {
      label: "Integrity score",
      value: `${metrics.integrityScore}%`,
      helper: "Drops when suspicious events fire.",
      icon: ShieldAlert,
    },
    {
      label: "Focus score",
      value: `${metrics.focusScore}%`,
      helper: "Tracks gaze and presence consistency.",
      icon: Eye,
    },
    {
      label: "Session time",
      value: formatClock(sessionSeconds),
      helper: "Useful for audit timeline correlation.",
      icon: Clock3,
    },
    {
      label: "Frames processed",
      value: metrics.framesProcessed.toString(),
      helper: "Signals real-time inference activity.",
      icon: Radar,
    },
  ];

  const [pastSessions, setPastSessions] = useState<any[]>([]);

  useEffect(() => {
    const fetchSessions = async () => {
      try {
        const backendUrl = "/api" ;
        const res = await fetch(`${backendUrl}/sessions`);
        const data = await res.json();
        setPastSessions(data);
      } catch (err) {
        console.error("Failed to fetch sessions", err);
      }
    };
    fetchSessions();
  }, [status]);

  return (
    <main className="relative overflow-hidden selection:bg-mint/30 selection:text-white" suppressHydrationWarning>
      <style jsx global>{`
        @keyframes scan {
          0% { top: 0%; opacity: 0; }
          5% { opacity: 0.5; }
          50% { opacity: 0.8; }
          95% { opacity: 0.5; }
          100% { top: 100%; opacity: 0; }
        }
        .scan-line {
          position: absolute;
          left: 0;
          width: 100%;
          height: 2px;
          background: linear-gradient(90deg, transparent, #69f0d0, transparent);
          box-shadow: 0 0 15px #69f0d0;
          animation: scan 3s linear infinite;
          z-index: 10;
          pointer-events: none;
        }
      `}</style>
      <div className="absolute inset-0 bg-grid bg-[size:42px_42px] opacity-[0.08]" />
      <div className="absolute -left-24 top-10 h-72 w-72 rounded-full bg-mint/20 blur-3xl" />
      <div className="absolute right-0 top-28 h-80 w-80 animate-float rounded-full bg-sunrise/15 blur-3xl" />

      <div className="relative mx-auto flex min-h-screen max-w-7xl flex-col gap-8 px-4 py-8 sm:px-6 lg:px-8">
        <section className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
          <div className="rounded-[28px] border border-white/10 bg-white/6 p-6 shadow-glow backdrop-blur-xl">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="max-w-2xl">
                <p className="mb-3 inline-flex items-center gap-2 rounded-full border border-mint/30 bg-mint/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.25em] text-mint">
                  <Sparkles className="h-3.5 w-3.5" />
                  Interview Integrity Studio
                </p>
                <h1 className="font-display text-4xl font-bold tracking-tight text-white sm:text-5xl">
                  Real-time interview monitoring with stronger integrity signals and reporting.
                </h1>
                <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-200/80 sm:text-base">
                  A modern proctoring dashboard for live interview sessions, with typed state, browser-based
                  detection, and recruiter-friendly reporting.
                </p>
              </div>

              <div className="rounded-3xl border border-white/10 bg-black/20 p-4 text-sm text-slate-200/80">
                <p className="font-semibold text-white">System Overview</p>
                <p className="mt-2 max-w-xs">
                  Live camera monitoring, suspicious-object alerts, focus tracking, timeline events, and exportable
                  audit logs in one interface.
                </p>
              </div>
            </div>
 
            <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {scoreCards.map((card) => {
                const Icon = card.icon;
                return (
                  <div
                    key={card.label}
                    className="rounded-3xl border border-white/10 bg-slate-950/40 p-4 transition hover:border-mint/30"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-slate-300">{card.label}</span>
                      <Icon className="h-4 w-4 text-mint" />
                    </div>
                    <p className="mt-3 font-display text-3xl font-semibold text-white">{card.value}</p>
                    <p className="mt-2 text-xs leading-6 text-slate-400">{card.helper}</p>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="rounded-[28px] border border-white/10 bg-slate-950/55 p-6 shadow-glow">
            <div className="flex items-center gap-3">
              <LayoutDashboard className="h-5 w-5 text-sunrise" />
              <div>
                <h2 className="font-display text-2xl font-semibold text-white">Candidate Session Setup</h2>
                <div className="flex items-center gap-4">
                  <p className="text-sm text-slate-400">Small product touches like this make it feel complete.</p>
                  {status === "live" && (
                    <AudioMonitor 
                      isLive={status === "live"} 
                      onIncident={async (detail) => {
                        await logIncident({
                          title: "Audio anomaly detected",
                          detail,
                          severity: "medium",
                          type: "audio"
                        });
                      }} 
                    />
                  )}
                </div>
              </div>
            </div>

            <div className="mt-6 grid gap-4">
              <label className="grid gap-2 text-sm text-slate-300">
                Candidate name
                <input
                  suppressHydrationWarning
                  value={candidate.candidateName}
                  onChange={(event) =>
                    setCandidate((current) => ({ ...current, candidateName: event.target.value }))
                  }
                  className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white outline-none transition focus:border-mint/40"
                />
              </label>
              <label className="grid gap-2 text-sm text-slate-300">
                Target role
                <input
                  suppressHydrationWarning
                  value={candidate.targetRole}
                  onChange={(event) =>
                    setCandidate((current) => ({ ...current, targetRole: event.target.value }))
                  }
                  className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white outline-none transition focus:border-mint/40"
                />
              </label>
              <label className="grid gap-2 text-sm text-slate-300">
                Experience summary
                <input
                  suppressHydrationWarning
                  value={candidate.experience}
                  onChange={(event) =>
                    setCandidate((current) => ({ ...current, experience: event.target.value }))
                  }
                  className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white outline-none transition focus:border-mint/40"
                />
              </label>
            </div>

            <div className="mt-6 flex flex-wrap gap-3">
              <button
                suppressHydrationWarning
                type="button"
                onClick={() => {
                  void startSession();
                }}
                disabled={status === "starting" || status === "live"}
                className="inline-flex items-center gap-2 rounded-full bg-mint px-5 py-3 text-sm font-semibold text-slateblue transition hover:bg-mint/90 disabled:cursor-not-allowed disabled:bg-mint/40"
              >
                {status === "starting" ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
                {status === "live" ? "Session Live" : status === "starting" ? "Starting..." : "Start Monitoring"}
              </button>
              <button
                suppressHydrationWarning
                type="button"
                onClick={() => {
                  void stopSession();
                }}
                disabled={status !== "live"}
                className="rounded-full border border-white/15 px-5 py-3 text-sm font-semibold text-white transition hover:border-rose-400/40 hover:bg-rose-400/10 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Stop Session
              </button>
              <button
                suppressHydrationWarning
                type="button"
                onClick={exportJson}
                className="inline-flex items-center gap-2 rounded-full border border-white/15 px-5 py-3 text-sm font-semibold text-white transition hover:border-mint/40 hover:bg-white/5"
              >
                <Download className="h-4 w-4" />
                Export JSON
              </button>
              <button
                suppressHydrationWarning
                type="button"
                onClick={() => {
                  void exportBackendCsv();
                }}
                className="rounded-full border border-white/15 px-5 py-3 text-sm font-semibold text-white transition hover:border-sunrise/40 hover:bg-white/5"
              >
                Ask Backend for CSV
              </button>
            </div>

            {exportState.kind !== "idle" ? (
              <p
                className={clsx(
                  "mt-4 rounded-2xl border px-4 py-3 text-sm",
                  exportState.kind === "success" && "border-mint/30 bg-mint/10 text-mint",
                  exportState.kind === "error" && "border-rose-400/30 bg-rose-400/10 text-rose-100",
                  exportState.kind === "loading" && "border-sunrise/30 bg-sunrise/10 text-sunrise",
                )}
              >
                {exportState.message}
              </p>
            ) : null}
          </div>
        </section>

        <section className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
          <div className="rounded-[30px] border border-white/10 bg-slate-950/55 p-5 shadow-glow">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-display text-2xl font-semibold text-white">Live Interview Canvas</h2>
                <p className="text-sm text-slate-400">
                  Browser vision runs client-side while the Flask backend keeps the audit log simple.
                </p>
              </div>
              <div
                className={clsx(
                  "rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em]",
                  status === "live"
                    ? "border-mint/35 bg-mint/10 text-mint"
                    : status === "starting"
                      ? "border-sunrise/35 bg-sunrise/10 text-sunrise"
                      : "border-white/10 bg-white/5 text-slate-300",
                )}
              >
                {status}
              </div>
            </div>

            <div className="mt-5 overflow-hidden rounded-[28px] border border-white/10 bg-black/40 shadow-2xl relative group">
              {status === "live" && <div className="scan-line" />}
              <div className="relative aspect-video">
                <video 
                  ref={videoRef} 
                  autoPlay 
                  muted 
                  playsInline 
                  className={clsx(
                    "h-full w-full object-cover transition-all duration-700",
                    status === "live" ? "grayscale-0 contrast-[1.05]" : "grayscale opacity-40"
                  )} 
                />
                <canvas ref={canvasRef} className="absolute inset-0 h-full w-full pointer-events-none" />
                {status !== "live" && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-slate-950/20 backdrop-blur-[2px]">
                    <div className="rounded-full bg-slate-900/50 p-6 border border-white/5 shadow-inner">
                      <Camera className="h-12 w-12 text-slate-600 animate-pulseSoft" />
                    </div>
                    <p className="text-slate-500 font-medium tracking-wide uppercase text-xs">Feed Standby</p>
                  </div>
                )}
              </div>
            </div>

            <div className="mt-5 grid gap-4 sm:grid-cols-3">
              <div className="rounded-3xl border border-white/10 bg-white/5 p-4">
                <div className="flex items-center gap-2 text-sm text-slate-300">
                  <AlertTriangle className="h-4 w-4 text-rose" />
                  Suspicious objects
                </div>
                <p className="mt-3 font-display text-3xl text-white">{metrics.suspiciousObjects}</p>
              </div>
              <div className="rounded-3xl border border-white/10 bg-white/5 p-4">
                <div className="flex items-center gap-2 text-sm text-slate-300">
                  <UserRound className="h-4 w-4 text-sunrise" />
                  Look-away events
                </div>
                <p className="mt-3 font-display text-3xl text-white">{metrics.lookAwayEvents}</p>
              </div>
              <div className="rounded-3xl border border-white/10 bg-white/5 p-4">
                <div className="flex items-center gap-2 text-sm text-slate-300">
                  <Users className="h-4 w-4 text-mint" />
                  Multiple faces
                </div>
                <p className="mt-3 font-display text-3xl text-white">{metrics.multipleFaceEvents}</p>
              </div>
            </div>
          </div>

          <div className="grid gap-6">
            <div className="rounded-[28px] border border-white/10 bg-white/6 p-5 shadow-glow">
              <div className="flex items-center gap-3">
                <MonitorSmartphone className="h-5 w-5 text-mint" />
                <div>
                  <h2 className="font-display text-2xl font-semibold text-white">Readiness Layer</h2>
                  <p className="text-sm text-slate-400">This makes the system feel productized instead of hacked together.</p>
                </div>
              </div>

              <div className="mt-5 grid gap-3">
                {readinessItems.map((item) => (
                  <div
                    key={item.label}
                    className="flex items-start gap-3 rounded-3xl border border-white/10 bg-slate-950/50 p-4"
                  >
                    {item.ready ? (
                      <CheckCircle2 className="mt-0.5 h-5 w-5 text-mint" />
                    ) : (
                      <LoaderCircle className="mt-0.5 h-5 w-5 animate-pulseSoft text-sunrise" />
                    )}
                    <div>
                      <p className="font-semibold text-white">{item.label}</p>
                      <p className="mt-1 text-sm leading-6 text-slate-400">{item.helper}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-[28px] border border-white/10 bg-slate-950/55 p-5 shadow-glow">
              <div className="flex items-center gap-3">
                <Sparkles className="h-5 w-5 text-sunrise" />
                <div>
                  <h2 className="font-display text-2xl font-semibold text-white">Monitoring Recommendations</h2>
                  <p className="text-sm text-slate-400">Suggested next actions based on the current session state.</p>
                </div>
              </div>

              <div className="mt-5 space-y-3">
                {liveInsights.recommendations.map((recommendation) => (
                  <div
                    key={recommendation}
                    className="rounded-3xl border border-white/10 bg-white/5 p-4 text-sm leading-7 text-slate-200/85"
                  >
                    {recommendation}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
          <div className="rounded-[28px] border border-white/10 bg-white/6 p-5 shadow-glow">
            <h2 className="font-display text-2xl font-semibold text-white">Risk Narrative</h2>
            <p className="mt-2 text-sm text-slate-400">{liveInsights.headline}</p>
            <p className="mt-5 rounded-3xl border border-white/10 bg-slate-950/50 p-4 text-sm leading-7 text-slate-200/85">
              {liveInsights.detail}
            </p>

            <div className="mt-5 grid gap-3">
              <div className="rounded-3xl border border-white/10 bg-black/20 p-4">
                <p className="text-sm text-slate-400">Candidate</p>
                <p className="mt-1 text-lg font-semibold text-white">{candidate.candidateName}</p>
              </div>
              <div className="rounded-3xl border border-white/10 bg-black/20 p-4">
                <p className="text-sm text-slate-400">Role</p>
                <p className="mt-1 text-lg font-semibold text-white">{candidate.targetRole}</p>
              </div>
              <div className="rounded-3xl border border-white/10 bg-black/20 p-4">
                <p className="text-sm text-slate-400">Experience</p>
                <p className="mt-1 text-lg font-semibold text-white">{candidate.experience}</p>
              </div>
            </div>
          </div>

          <div className="rounded-[28px] border border-white/10 bg-slate-950/55 p-5 shadow-glow">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="font-display text-2xl font-semibold text-white">Incident Timeline</h2>
                <p className="text-sm text-slate-400">Severity-aware timeline for audit review and session analysis.</p>
              </div>
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-slate-300">
                {incidents.length} events
              </span>
            </div>

            <div className="mt-5 max-h-[420px] space-y-3 overflow-y-auto pr-1">
              {incidents.map((incident) => (
                <article
                  key={incident.id}
                  className="rounded-3xl border border-white/10 bg-white/5 p-4 transition hover:border-white/20"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <span
                        className={clsx(
                          "rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em]",
                          severityClasses[incident.severity],
                        )}
                      >
                        {incident.severity}
                      </span>
                      <span className="text-xs uppercase tracking-[0.2em] text-slate-500">{incident.type}</span>
                    </div>
                    <time className="text-xs text-slate-500">
                      {new Date(incident.createdAt).toLocaleTimeString()}
                    </time>
                  </div>
                  <h3 className="mt-3 text-lg font-semibold text-white">{incident.title}</h3>
                  <p className="mt-2 text-sm leading-7 text-slate-300/85">{incident.detail}</p>
                </article>
              ))}
            </div>
          </div>
        </section>
        <section className="mt-8 rounded-[32px] border border-white/10 bg-slateblue/15 p-6 backdrop-blur-xl">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-display text-2xl font-semibold text-white">Historical Audit Trail</h2>
              <p className="mt-1 text-sm text-slate-400">Past sessions and aggregate incident counts from the persistent SQLite database.</p>
            </div>
            <Users className="h-6 w-6 text-mint/40" />
          </div>

          <div className="mt-6 overflow-hidden rounded-2xl border border-white/5 bg-black/20">
            <table className="w-full text-left text-sm text-slate-300">
              <thead className="bg-white/5 text-xs font-semibold uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-6 py-4">Candidate</th>
                  <th className="px-6 py-4">Role</th>
                  <th className="px-6 py-4">Incidents</th>
                  <th className="px-6 py-4">Last Sync</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {pastSessions.length > 0 ? (
                  pastSessions.map((s, i) => (
                    <tr key={i} className="transition hover:bg-white/5">
                      <td className="px-6 py-4 font-medium text-white">{s.candidate_name}</td>
                      <td className="px-6 py-4 text-slate-400">{s.target_role}</td>
                      <td className="px-6 py-4">
                        <span className={clsx(
                          "rounded-full px-2 py-0.5 text-[11px] font-bold",
                          s.incident_count > 10 ? "bg-rose/20 text-rose" : "bg-mint/20 text-mint"
                        )}>
                          {s.incident_count}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-xs text-slate-500">
                        {new Date(s.last_seen).toLocaleString()}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={4} className="px-6 py-12 text-center text-slate-500 italic">
                      No past session data discovered in the audit trail.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}
