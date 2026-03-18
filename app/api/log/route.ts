import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { event, severity, type, candidate } = body;

    const incident = await prisma.incident.create({
      data: {
        event,
        severity,
        type,
        candidateName: candidate?.candidateName || "Unknown",
        targetRole: candidate?.targetRole || "Unknown",
        experience: candidate?.experience || "Unknown",
      },
    });

    return NextResponse.json({ status: "success", id: incident.id });
  } catch (error) {
    console.error("Failed to log incident:", error);
    return NextResponse.json({ status: "error", message: "Failed to log incident" }, { status: 500 });
  }
}

export async function GET() {
  try {
    const logs = await prisma.incident.findMany({
      orderBy: { timestamp: "desc" },
      take: 100,
    });
    return NextResponse.json(logs);
  } catch (error) {
    console.error("Failed to fetch logs:", error);
    return NextResponse.json({ status: "error" }, { status: 500 });
  }
}
