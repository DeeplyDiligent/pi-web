import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import semver from "semver";

const git = (...args) => execFileSync("git", args, { encoding: "utf8" }).trim();

export function stableVersions(versions) {
  return versions.filter((version) => semver.valid(version) && !semver.prerelease(version));
}

export function planVersion({ current, tags = [], resumable = [] }) {
  if (!semver.valid(current) || semver.prerelease(current)) {
    throw new Error("package.json must contain a stable semantic version");
  }
  const reserved = stableVersions(tags);
  const existing = stableVersions(resumable).sort(semver.rcompare)[0];
  if (existing) {
    if (reserved.some((version) => semver.gt(version, existing))) {
      throw new Error("A newer release tag exists; refusing to move Latest backwards");
    }
    return { version: existing, reuse: true };
  }
  const highest = [current, ...reserved].sort(semver.rcompare)[0];
  return { version: semver.inc(highest, "patch"), reuse: false };
}

export function findResumableTags(tags, source, inspectTag) {
  return tags.filter((tag) => {
    const { message, parents } = inspectTag(tag);
    return message.split("\n").includes(`Pi-Web-Source: ${source}`) && parents === source;
  });
}

function main() {
  if (process.argv[2] !== "plan") {
    throw new Error("Usage: node scripts/automated-release.mjs plan");
  }
  const pkg = JSON.parse(readFileSync("package.json", "utf8"));
  const source = process.env.GITHUB_SHA;
  if (!/^[a-f0-9]{40}$/.test(source ?? "")) throw new Error("GITHUB_SHA is required");
  const tags = git("tag", "--list", "v*").split("\n").filter((tag) => semver.valid(tag.slice(1)));
  const resumable = findResumableTags(tags, source, (tag) => ({
    message: git("log", "-1", "--format=%B", tag),
    parents: git("log", "-1", "--format=%P", tag),
  }));
  const plan = planVersion({
    current: pkg.version,
    tags: tags.map((tag) => tag.slice(1)),
    resumable: resumable.map((tag) => tag.slice(1)),
  });
  console.log(`version=${plan.version}\nreuse=${plan.reuse}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
