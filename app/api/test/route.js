import { NextResponse } from "next/server";

export async function GET() {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json(null, { status: 404 });
  }
  return NextResponse.json({ test: true });
}
