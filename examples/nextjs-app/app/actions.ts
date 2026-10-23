"use server";
import { redirect } from "next/navigation";
import { classify } from "../server/jev";

export async function classifyAction() {
  await classify("Server Action");
  redirect("/?completed=action");
}
