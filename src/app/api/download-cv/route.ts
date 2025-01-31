import { NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";

export async function GET() {
    try {
        const filePath = path.join(process.cwd(), "src", "_cv", "Tenggis_CV.pdf");
        
        try {
            await fs.access(filePath);
        } catch {
            return NextResponse.json(
                { error: "CV file not found" }, 
                { status: 404 }
            );
        };

        const fileBuffer = await fs.readFile(filePath);
        
        const headers = {
            "Content-Type": "application/pdf",
            "Content-Disposition": "attachment; filename=Tenggis_CV.pdf",
            "Content-Length": fileBuffer.length.toString(),
        };

        return new NextResponse(fileBuffer, { headers });
    } catch (error) {
        console.error("Error serving CV:", error);
        return NextResponse.json(
            { error: "Internal server error" },
            { status: 500 }
        );
    };
};