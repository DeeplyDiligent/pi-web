import { NextRequest, NextResponse } from "next/server";
import { stat } from "fs/promises";
import {
  createChildDirectory,
  getBrowseStartDirectory,
  getParentDirectory,
  InvalidDirectoryNameError,
  listDirectories,
  listWindowsDrives,
  resolveDirectory,
  shouldShowWindowsDrivePicker,
} from "@/lib/directory-browser";

// GET /api/cwd/browse?path=...：列出文件系统中的可读子目录。
export async function GET(request: NextRequest) {
  try {
    const requested = request.nextUrl.searchParams.get("path")?.trim();

    if (shouldShowWindowsDrivePicker(requested)) {
      return NextResponse.json({
        path: "",
        parentPath: null,
        drives: await listWindowsDrives(),
        directories: [],
      });
    }

    const candidate = getBrowseStartDirectory(requested);

    let resolved: string;
    try {
      resolved = await resolveDirectory(candidate);
    } catch {
      return NextResponse.json({ error: "Directory does not exist" }, { status: 404 });
    }

    const directoryStat = await stat(resolved);
    if (!directoryStat.isDirectory()) {
      return NextResponse.json({ error: "Path is not a directory" }, { status: 400 });
    }

    const directories = await listDirectories(resolved);

    return NextResponse.json({
      path: resolved,
      parentPath: getParentDirectory(resolved),
      directories,
    });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

// POST /api/cwd/browse  body: { parentPath: string, name: string }
// Creates one folder directly inside the currently browsed directory.
export async function POST(request: Request) {
  let body: { parentPath?: unknown; name?: unknown };
  try {
    body = await request.json() as { parentPath?: unknown; name?: unknown };
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const parentPath = typeof body.parentPath === "string" ? body.parentPath.trim() : "";
  const name = typeof body.name === "string" ? body.name : "";
  if (!parentPath) {
    return NextResponse.json({ error: "Parent directory is required" }, { status: 400 });
  }

  try {
    const createdPath = await createChildDirectory(parentPath, name);
    return NextResponse.json({ path: createdPath }, { status: 201 });
  } catch (error) {
    if (error instanceof InvalidDirectoryNameError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    const code = error && typeof error === "object" && "code" in error
      ? String(error.code)
      : "";
    if (code === "EEXIST") {
      return NextResponse.json({ error: "A folder with that name already exists" }, { status: 409 });
    }
    if (code === "EACCES" || code === "EPERM" || code === "EROFS") {
      return NextResponse.json({ error: "You do not have permission to create a folder here" }, { status: 403 });
    }
    if (code === "ENOENT") {
      return NextResponse.json({ error: "Parent directory does not exist" }, { status: 404 });
    }
    if (code === "ENOTDIR" || code === "EINVAL" || code === "ENAMETOOLONG") {
      return NextResponse.json({ error: "Folder name or parent directory is not valid" }, { status: 400 });
    }
    return NextResponse.json({ error: "Unable to create folder" }, { status: 500 });
  }
}
