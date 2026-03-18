import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function GET() {
  try {
    const logs = await prisma.incident.findMany({
      orderBy: { timestamp: "desc" },
    });

    if (logs.length === 0) {
      return NextResponse.json({ status: "error", message: "No logs found to export." }, { status: 404 });
    }

    const header = ["id", "timestamp", "event", "severity", "type", "candidateName", "targetRole", "experience"];
    const rows = logs.map((log) => [
      log.id,
      log.timestamp.toISOString(),
      log.event,
      log.severity,
      log.type,
      log.candidateName,
      log.targetRole,
      log.experience,
    ]);

    const csvContent = [header, ...rows].map((row) => row.map((cell) => `"${cell}"`).join(",")).join("\n");

    return new NextResponse(csvContent, {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename=interview-report-${Date.now()}.csv`,
      },
    });
  } catch (error) {
    console.error("Failed to generate report:", error);
    return NextResponse.json({ status: "error" }, { status: 500 });
  }
}
