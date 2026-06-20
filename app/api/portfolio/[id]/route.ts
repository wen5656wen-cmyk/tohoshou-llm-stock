import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  await prisma.portfolio.delete({ where: { id: Number(id) } });

  return NextResponse.json({ ok: true });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json();

  const portfolio = await prisma.portfolio.update({
    where: { id: Number(id) },
    data: {
      shares: body.shares !== undefined ? Number(body.shares) : undefined,
      avgPrice: body.avgPrice !== undefined ? Number(body.avgPrice) : undefined,
      note: body.note,
    },
  });

  return NextResponse.json(portfolio);
}
