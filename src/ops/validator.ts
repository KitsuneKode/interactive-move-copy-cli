import { access, constants, lstat, stat } from "node:fs/promises";
import { basename, dirname, join, resolve, sep } from "node:path";
import type { OperationMode, RemovalMode } from "../core/types.ts";

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  conflicts: string[];
}

function isNestedPath(parent: string, child: string): boolean {
  return child.startsWith(parent + sep);
}

export async function validateOperation(
  sources: string[],
  destination: string,
  mode: OperationMode,
): Promise<ValidationResult> {
  const errors: string[] = [];
  const conflicts: string[] = [];
  const destResolved = resolve(destination);

  // Destination must exist, be a directory, and be writable.
  let destinationValid = true;
  try {
    const destStat = await stat(destination);
    if (!destStat.isDirectory()) {
      errors.push(`Destination "${destination}" is not a directory`);
      destinationValid = false;
    }
  } catch {
    errors.push(`Destination "${destination}" does not exist`);
    destinationValid = false;
  }

  if (destinationValid) {
    try {
      await access(destination, constants.W_OK);
    } catch {
      errors.push(`No write permission on "${destination}"`);
      destinationValid = false;
    }
  }

  const resolvedSources = new Map<string, string>();
  const destinationNames = new Map<string, string>();

  for (const source of sources) {
    const sourceResolved = resolve(source);
    resolvedSources.set(source, sourceResolved);

    try {
      await lstat(sourceResolved);
    } catch {
      errors.push(`Source "${source}" no longer exists`);
      continue;
    }

    if (mode === "copy") {
      try {
        await access(sourceResolved, constants.R_OK);
      } catch {
        errors.push(`No read permission on "${source}"`);
      }
    }

    const sourceDir = dirname(sourceResolved);
    if (sourceDir === destResolved) {
      errors.push(`"${basename(source)}" is already in the destination directory`);
      continue;
    }

    if (isNestedPath(sourceResolved, destResolved)) {
      errors.push(`Cannot ${mode} "${basename(source)}" into itself`);
      continue;
    }

    const name = basename(sourceResolved);
    const existingSource = destinationNames.get(name);
    if (existingSource && existingSource !== sourceResolved) {
      errors.push(
        `Selected sources "${basename(existingSource)}" and "${basename(sourceResolved)}" would both write to "${name}"`,
      );
    } else {
      destinationNames.set(name, sourceResolved);
    }

    if (!destinationValid) {
      continue;
    }

    const destPath = join(destination, name);
    try {
      await lstat(destPath);
      conflicts.push(name);
    } catch {
      // No conflict.
    }
  }

  const uniqueSources = [...resolvedSources.values()].sort((a, b) => a.localeCompare(b));
  for (let i = 0; i < uniqueSources.length; i++) {
    const current = uniqueSources[i];
    if (current === undefined) {
      continue;
    }

    for (let j = i + 1; j < uniqueSources.length; j++) {
      const other = uniqueSources[j];
      if (other === undefined) {
        continue;
      }

      if (current === other) continue;

      if (isNestedPath(current, other) || isNestedPath(other, current)) {
        errors.push(
          `Cannot operate on both "${basename(current)}" and its nested path "${basename(other)}" in the same run`,
        );
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors: [...new Set(errors)],
    conflicts: [...new Set(conflicts)].sort((a, b) => a.localeCompare(b)),
  };
}

export async function validateRemovalOperation(
  sources: string[],
  removalMode: RemovalMode,
): Promise<ValidationResult> {
  const errors: string[] = [];
  const resolvedSources = new Map<string, string>();

  for (const source of sources) {
    const sourceResolved = resolve(source);
    resolvedSources.set(source, sourceResolved);

    try {
      await lstat(sourceResolved);
    } catch {
      errors.push(`Source "${source}" no longer exists`);
      continue;
    }

    if (removalMode === "trash") {
      try {
        await access(dirname(sourceResolved), constants.W_OK);
      } catch {
        errors.push(`Cannot move "${source}" to trash from its current directory`);
      }
    }
  }

  const uniqueSources = [...resolvedSources.values()].sort((a, b) => a.localeCompare(b));
  for (let i = 0; i < uniqueSources.length; i++) {
    const current = uniqueSources[i];
    if (current === undefined) continue;

    for (let j = i + 1; j < uniqueSources.length; j++) {
      const other = uniqueSources[j];
      if (other === undefined || current === other) continue;

      if (isNestedPath(current, other) || isNestedPath(other, current)) {
        errors.push(
          `Cannot remove both "${basename(current)}" and its nested path "${basename(other)}" in the same run`,
        );
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors: [...new Set(errors)],
    conflicts: [],
  };
}
