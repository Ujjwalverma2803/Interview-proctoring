import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function GET() {
  try {
    // Group by candidateName and targetRole to get session summaries
    const sessions = await prisma.incident.groupBy({
      by: ["candidateName", "targetRole"],
      _count: {
        id: true,
      },
      _max: {
        timestamp: true,
      },
      orderBy: {
        _max: {
          timestamp: "desc",
        },
      },
    });

    return NextResponse.json(
      sessions.map((s) => ({
        candidate_name: s.candidateName,
        target_role: s.targetRole,
        incident_count: s._count.id,
        last_seen: s._max.timestamp,
      })),
    );
  } catch (error) {
    console.error("Failed to fetch sessions:", error);
    return NextResponse.json({ status: "error" }, { status: 500 });
  }
}
