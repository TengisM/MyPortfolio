import fs from "fs/promises";
import path from "path";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const filePath = path.join(process.cwd(), "src", "_cv", "config.cfg");
    const fileBuffer = await fs.readFile(filePath);

    return new Response(fileBuffer, {
      status: 200,
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Disposition": 'attachment; filename="config.cfg"',
        "Content-Length": fileBuffer.length.toString(),
      },
    });
  } catch (error: any) {
    if (error.code === "ENOENT") {
      return Response.json({ error: "File not found" }, { status: 404 });
    }

    return Response.json({ error: "Server error" }, { status: 500 });
  }
}
