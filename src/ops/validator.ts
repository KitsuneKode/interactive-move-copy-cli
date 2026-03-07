import { access, constants } from "node:fs/promises";
import { dirname, basename, join, resolve } from "node:path";
import { stat } from "node:fs/promises";

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  conflicts: string[];
}

export async function validateOperation(
  sources: string[],
  destination: string,
): Promise<ValidationResult> {
  const errors: string[] = [];
  const conflicts: string[] = [];

  // Check destination exists and is a directory
  try {
    const destStat = await stat(destination);
    if (!destStat.isDirectory()) {
      errors.push(`Destination "${destination}" is not a directory`);
    }
  } catch {
    errors.push(`Destination "${destination}" does not exist`);
  }

  // Check write permission on destination
  try {
    await access(destination, constants.W_OK);
  } catch {
    errors.push(`No write permission on "${destination}"`);
  }

  const destResolved = resolve(destination);

  for (const source of sources) {
    const sourceResolved = resolve(source);
    const sourceDir = dirname(sourceResolved);

    // Source same as dest
    if (sourceDir === destResolved) {
      errors.push(`"${basename(source)}" is already in the destination directory`);
      continue;
    }

    // Moving parent into child (circular)
    if (destResolved.startsWith(sourceResolved + "/")) {
      errors.push(`Cannot move "${basename(source)}" into itself`);
      continue;
    }

    // Check for name conflicts
    const destPath = join(destination, basename(source));
    try {
      await stat(destPath);
      conflicts.push(basename(source));
    } catch {
      // No conflict
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    conflicts,
  };
}
